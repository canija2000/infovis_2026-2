"""Muestra de minería: fenología de las aves de Chile en 2024 (clustering de curvas anuales).

Pregunta: ¿qué formas de ciclo anual hay entre las especies, y coinciden con la
clasificación por reglas que usa la visualización (residente / verano / invierno)?

1. Datos: descarga GBIF 2024 (gbif/downloads/2024.zip), solo registros dentro de
   Chile continental (polígonos regionales).
2. Unidad de esfuerzo: «salida» = (celda de 0,05° ≈ 5 km, fecha) con al menos un
   registro. Tasa de detección p[s, m] = salidas del mes m donde se registró la
   especie s / salidas del mes m. Corrige que en verano sale más gente a observar.
3. Forma del ciclo: x[s, m] = p[s, m] / max_m p[s, m] (1 = su mejor mes).
   Especies con ≥ MIN_VISITS salidas en el año (curvas estables).
4. Clustering: K-means (k = 2…8, silueta) y GMM (BIC) sobre las 12 dimensiones. La
   silueta elige k = 2; las figuras de grupos usan K_SHOW = 5 como exploración.
5. Validación: tabla de contingencia y ARI contra la clase por reglas de
   web/data/species.json; PCA 2D para ver la estructura.

Salida: mineria/figuras/*.png y mineria/resultados_2024.json.
Uso (desde la raíz del repo; requiere numpy, shapely, scikit-learn, matplotlib):
    python3 mineria/fenologia_2024.py
"""

from __future__ import annotations

import csv
import io
import json
import math
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import shapely  # noqa: E402
from sklearn.cluster import KMeans  # noqa: E402
from sklearn.decomposition import PCA  # noqa: E402
from sklearn.metrics import adjusted_rand_score, silhouette_score  # noqa: E402
from sklearn.mixture import GaussianMixture  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python_scripts" / "gbif"))
from grid_aggregate import load_regions  # noqa: E402

YEAR = 2024
RES = 0.05
MIN_VISITS = 30
SEED = 7
# La silueta elige k = 2 (residentes vs verano): las curvas son un gradiente, no grupos separados.
# Para explorar formas más finas se muestra también K_SHOW (interpretable; el BIC del GMM sigue bajando).
K_SHOW = 5
OUT = ROOT / "mineria" / "figuras"
MON = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
AUSTRAL = [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5]  # jul → jun: el verano al centro
CLASS_ES = {"residente": "Residente", "visitante_estival": "Verano", "visitante_invernal": "Invierno", "ocasional": "Ocasional"}
CLASS_COLOR = {"residente": "#288665", "visitante_estival": "#ee9b45", "visitante_invernal": "#2c8fc9", "ocasional": "#9a988f"}
# Paleta categórica de referencia (validada para daltonismo en pares adyacentes).
CLUSTER_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#4a3aa7", "#e34948", "#008300"]
INK, INK2, RULE = "#16161a", "#52514e", "#e4e2dc"

plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 10, "axes.edgecolor": RULE, "axes.labelcolor": INK2,
    "xtick.color": INK2, "ytick.color": INK2, "axes.spines.top": False, "axes.spines.right": False,
    "axes.titlesize": 11, "axes.titleweight": "bold", "axes.titlecolor": INK, "figure.dpi": 130,
    "savefig.bbox": "tight", "axes.grid": False,
})


def load_visits():
    """Cuenta salidas por especie y mes, y salidas totales por mes."""
    tree, _ = load_regions()
    species = json.load(open(ROOT / "web" / "data" / "species.json", encoding="utf-8"))
    known = {s["sciName"] for s in species}
    lons, lats, keys = [], [], []
    with zipfile.ZipFile(ROOT / "gbif" / "downloads" / f"{YEAR}.zip") as z:
        with z.open(z.namelist()[0]) as fh:
            for row in csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8"), delimiter="\t"):
                date = (row.get("eventDate") or "")[:10]
                sci = (row.get("species") or "").strip()
                if not date.startswith(str(YEAR)) or len(date) < 10 or sci not in known:
                    continue
                try:
                    lon, lat = float(row["decimalLongitude"]), float(row["decimalLatitude"])
                except (ValueError, TypeError, KeyError):
                    continue
                lons.append(lon)
                lats.append(lat)
                keys.append((sci, date))
    pidx, _ = tree.query(shapely.points(np.array(lons), np.array(lats)), predicate="within")
    inside = np.zeros(len(lons), bool)
    inside[pidx] = True
    per_species = defaultdict(lambda: defaultdict(set))  # sci -> mes -> {salida}
    visits = defaultdict(set)  # mes -> {salida}
    for i in np.nonzero(inside)[0]:
        sci, date = keys[i]
        visit = (math.floor(lons[i] / RES), math.floor(lats[i] / RES), date)
        m = int(date[5:7]) - 1
        per_species[sci][m].add(visit)
        visits[m].add(visit)
    effort = np.array([len(visits[m]) for m in range(12)], float)
    counts = {sci: np.array([len(ms[m]) for m in range(12)], float) for sci, ms in per_species.items()}
    return species, counts, effort


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    species, counts, effort = load_visits()
    info = {s["sciName"]: s for s in species}
    names = sorted(s for s, c in counts.items() if c.sum() >= MIN_VISITS)
    raw = np.array([counts[s] for s in names])  # salidas con la especie
    rate = raw / effort  # tasa de detección
    shape = rate / rate.max(axis=1, keepdims=True)  # forma del ciclo (0–1)
    rule = np.array([info[s]["class"] for s in names])
    print(f"{YEAR}: {int(effort.sum()):,} salidas; {len(names)} especies con ≥ {MIN_VISITS} salidas")

    # ---------------------------------------------------------------- elegir k
    ks = list(range(2, 9))
    sil, bic = [], []
    for k in ks:
        km = KMeans(k, n_init=20, random_state=SEED).fit(shape)
        sil.append(silhouette_score(shape, km.labels_))
        bic.append(GaussianMixture(k, covariance_type="diag", random_state=SEED, n_init=5).fit(shape).bic(shape))
    k_sil = ks[int(np.argmax(sil))]
    ari_sil = adjusted_rand_score(rule, KMeans(k_sil, n_init=50, random_state=SEED).fit(shape).labels_)
    k_best = K_SHOW
    km = KMeans(k_best, n_init=50, random_state=SEED).fit(shape)
    # Ordena los clústeres por estacionalidad y mes pico del centroide, para que los colores sean estables.
    amp = km.cluster_centers_.max(1) - km.cluster_centers_.min(1)
    peak = np.array([AUSTRAL.index(int(np.argmax(c))) for c in km.cluster_centers_])
    order = np.lexsort((peak, amp))
    relabel = {int(old): new for new, old in enumerate(order)}
    labels = np.array([relabel[int(c)] for c in km.labels_])
    centers = km.cluster_centers_[order]
    ari = adjusted_rand_score(rule, labels)
    nonocc = rule != "ocasional"
    ari_main = adjusted_rand_score(rule[nonocc], labels[nonocc])
    print(f"silueta elige k = {k_sil} ({max(sil):.2f}, ARI {ari_sil:.2f}); exploración k = {k_best}: ARI = {ari:.2f} (sin ocasionales: {ari_main:.2f})")

    xs = np.arange(12)
    month_ticks = [MON[m][0].upper() for m in AUSTRAL]  # J A S O N D E F M A M J

    # ---------------------------------------------------------------- F1: por qué corregir por esfuerzo
    fig, axes = plt.subplots(1, 3, figsize=(13, 3.6), gridspec_kw={"width_ratios": [1, 1, 1.15]})
    ax = axes[0]
    ax.bar(xs, effort[AUSTRAL] / 1000, color="#b9b7b0", width=0.7)
    ax.set_title("1 · Esfuerzo: salidas por mes")
    ax.set_ylabel("miles de salidas")
    ax.set_xticks(xs, month_ticks)
    ax.text(0.02, 0.97, "salida = celda de ~5 km × día\ncon algún registro", transform=ax.transAxes, va="top", fontsize=8.5, color=INK2)
    examples = [("Zonotrichia capensis", "Chincol"), ("Elaenia albiceps", "Fío-fío"), ("Sephanoides sephaniodes", "Picaflor chico")]
    examples = [(s, n) for s, n in examples if s in names]
    for col, (title, data, unit) in enumerate([("2 · Conteo bruto", raw, "salidas con la especie"),
                                               ("3 · Tasa de detección (corregida)", rate * 100, "% de las salidas del mes")]):
        ax = axes[col + 1]
        for (sci, name), color in zip(examples, ["#288665", "#ee9b45", "#2c8fc9"]):
            y = data[names.index(sci)][AUSTRAL]
            ax.plot(xs, y, color=color, lw=2)
            ax.text(11.2, y[-1], name, color=color, va="center", fontsize=9)
        ax.set_title(title)
        ax.set_ylabel(unit)
        ax.set_xticks(xs, month_ticks)
        ax.set_xlim(-0.3, 13.8)
        ax.set_ylim(0, None)
    fig.suptitle(f"El conteo bruto sube en verano porque sale más gente; la tasa corrige eso ({YEAR})", x=0.01, ha="left", fontsize=12, fontweight="bold")
    fig.savefig(OUT / "f1_esfuerzo.png")
    plt.close(fig)

    # ---------------------------------------------------------------- F2: elección de k
    fig, axes = plt.subplots(1, 2, figsize=(9, 3.2))
    axes[0].plot(ks, sil, "o-", color=INK)
    axes[0].axvline(k_sil, color="#eb6834", lw=1, ls="--")
    axes[0].annotate(f"máximo: k = {k_sil}", (k_sil, max(sil)), xytext=(8, -4), textcoords="offset points", fontsize=8.5, color="#eb6834")
    axes[1].axvline(k_best, color="#2a78d6", lw=1, ls="--")
    axes[1].annotate(f"exploración: k = {k_best}", (k_best, bic[ks.index(k_best)]), xytext=(6, 8), textcoords="offset points", fontsize=8.5, color="#2a78d6")
    axes[0].set_title("K-means: silueta (más alto = mejor)")
    axes[0].set_xlabel("k")
    axes[1].plot(ks, bic, "o-", color=INK)
    axes[1].set_title("GMM: BIC (más bajo = mejor)")
    axes[1].set_xlabel("k")
    fig.savefig(OUT / "f2_eleccion_k.png")
    plt.close(fig)

    # ---------------------------------------------------------------- F3: centroides (pequeños múltiplos)
    cols = min(4, k_best)
    rows = math.ceil(k_best / cols)
    fig, axes = plt.subplots(rows, cols, figsize=(3.4 * cols, 2.9 * rows), sharey=True, squeeze=False)
    common = {sci: info[sci]["comName"] for sci in names}
    for c in range(k_best):
        ax = axes[c // cols][c % cols]
        members = np.nonzero(labels == c)[0]
        for i in members:
            ax.plot(xs, shape[i][AUSTRAL], color=CLUSTER_COLORS[c], alpha=0.12, lw=0.8)
        ax.plot(xs, centers[c][AUSTRAL], color=CLUSTER_COLORS[c], lw=2.6)
        top = sorted(members, key=lambda i: -raw[i].sum())[:3]
        ax.set_title(f"Grupo {c + 1} · {len(members)} especies", color=INK)
        ax.text(0.02, 0.04, "\n".join(common[names[i]] for i in top), transform=ax.transAxes, fontsize=8, color=INK2)
        ax.set_xticks(xs[::2], month_ticks[::2])
        ax.set_ylim(0, 1.05)
    for c in range(k_best, rows * cols):
        axes[c // cols][c % cols].axis("off")
    axes[0][0].set_ylabel("forma del ciclo\n(1 = mejor mes)")
    fig.suptitle(f"Las formas de ciclo anual que encuentra K-means con k = {k_best} (línea gruesa = centroide)", x=0.01, ha="left", fontsize=12, fontweight="bold")
    fig.savefig(OUT / "f3_centroides.png")
    plt.close(fig)

    # ---------------------------------------------------------------- F4: mapa de calor especie × mes
    peak_month = np.array([AUSTRAL.index(int(np.argmax(r))) for r in shape])
    idx = np.lexsort((peak_month, labels))
    fig, (ax_band, ax) = plt.subplots(1, 2, figsize=(7.2, 9), gridspec_kw={"width_ratios": [0.25, 12], "wspace": 0.02})
    ax.imshow(shape[idx][:, AUSTRAL], aspect="auto", cmap="Greys", vmin=0, vmax=1, interpolation="nearest")
    ax.set_xticks(xs, month_ticks)
    ax.set_yticks([])
    ax.set_title(f"{len(names)} especies × 12 meses, agrupadas por clúster y ordenadas por mes pico", loc="left")
    band = np.array([[matplotlib.colors.to_rgb(CLUSTER_COLORS[labels[i]])] for i in idx])
    ax_band.imshow(band, aspect="auto", interpolation="nearest")
    ax_band.axis("off")
    for c in range(k_best):
        rows_c = np.nonzero(labels[idx] == c)[0]
        ax_band.text(-0.8, rows_c.mean(), f"G{c + 1}", ha="right", va="center", fontsize=9, color=CLUSTER_COLORS[c], fontweight="bold")
    fig.savefig(OUT / "f4_heatmap.png")
    plt.close(fig)

    # ---------------------------------------------------------------- F5: PCA
    pca = PCA(2, random_state=SEED).fit(shape)
    z = pca.transform(shape)
    fig, axes = plt.subplots(1, 2, figsize=(12, 4.8), sharex=True, sharey=True)
    for c in range(k_best):
        m = labels == c
        axes[0].scatter(z[m, 0], z[m, 1], s=16, color=CLUSTER_COLORS[c], label=f"Grupo {c + 1}", edgecolor="white", lw=0.4)
    axes[0].set_title(f"Coloreado por clúster (K-means, k = {k_best})")
    axes[0].legend(frameon=False, fontsize=8, loc="best")
    for cls in ["ocasional", "residente", "visitante_estival", "visitante_invernal"]:
        m = rule == cls
        axes[1].scatter(z[m, 0], z[m, 1], s=16, color=CLASS_COLOR[cls], label=CLASS_ES[cls], edgecolor="white", lw=0.4)
    axes[1].set_title("Coloreado por la clase por reglas (visualización)")
    axes[1].legend(frameon=False, fontsize=8, loc="best")
    ev = pca.explained_variance_ratio_ * 100
    for ax in axes:
        ax.set_xlabel(f"PC1 ({ev[0]:.0f} % de la varianza)")
    axes[0].set_ylabel(f"PC2 ({ev[1]:.0f} %)")
    fig.suptitle("PCA de las curvas: cada punto es una especie", x=0.01, ha="left", fontsize=12, fontweight="bold")
    fig.savefig(OUT / "f5_pca.png")
    plt.close(fig)
    # Cargas: qué meses pesan en cada componente.
    fig, ax = plt.subplots(figsize=(7, 2.8))
    for j, color in enumerate(["#2a78d6", "#eb6834"]):
        ax.plot(xs, pca.components_[j][AUSTRAL], "o-", color=color, label=f"PC{j + 1}")
    ax.axhline(0, color=RULE, lw=1)
    ax.set_xticks(xs, month_ticks)
    ax.set_title("Cargas de PCA: PC1 ≈ verano vs invierno")
    ax.legend(frameon=False)
    fig.savefig(OUT / "f5b_cargas_pca.png")
    plt.close(fig)

    # ---------------------------------------------------------------- F6: contingencia vs reglas
    classes = ["residente", "visitante_estival", "visitante_invernal", "ocasional"]
    table = np.array([[int(np.sum((labels == c) & (rule == cls))) for cls in classes] for c in range(k_best)])
    fig, ax = plt.subplots(figsize=(6.4, 0.55 * k_best + 1.4))
    ax.imshow(table / table.sum(1, keepdims=True), cmap="Greys", vmin=0, vmax=1.4, aspect="auto")
    for (r, c), v in np.ndenumerate(table):
        ax.text(c, r, str(v), ha="center", va="center", color=INK, fontsize=10)
    ax.set_xticks(range(4), [CLASS_ES[c] for c in classes])
    ax.set_yticks(range(k_best), [f"Grupo {c + 1}" for c in range(k_best)])
    for t, c in zip(ax.get_yticklabels(), CLUSTER_COLORS):
        t.set_color(c)
    ax.set_title(f"Clústeres vs clase por reglas · ARI = {ari:.2f} ({ari_main:.2f} sin ocasionales)", loc="left")
    ax.tick_params(length=0)
    for side in ax.spines.values():
        side.set_visible(False)
    fig.savefig(OUT / "f6_contingencia.png")
    plt.close(fig)

    result = {
        "year": YEAR, "visits": int(effort.sum()), "species": len(names), "k_silueta": k_sil, "ari_k_silueta": round(ari_sil, 3), "k": k_best,
        "silhouette": {k: round(s, 3) for k, s in zip(ks, sil)}, "bic": {k: round(b) for k, b in zip(ks, bic)},
        "ari": round(ari, 3), "ari_sin_ocasionales": round(ari_main, 3),
        "pca_varianza": [round(v, 1) for v in ev],
        "contingencia": {f"G{c + 1}": dict(zip(classes, map(int, table[c]))) for c in range(k_best)},
        "grupos": {f"G{c + 1}": [common[names[i]] for i in sorted(np.nonzero(labels == c)[0], key=lambda i: -raw[i].sum())[:8]]
                   for c in range(k_best)},
    }
    (ROOT / "mineria" / "resultados_2024.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: result[k] for k in ("k_silueta", "ari_k_silueta", "k", "silhouette", "ari", "ari_sin_ocasionales", "pca_varianza", "contingencia")}, ensure_ascii=False))


if __name__ == "__main__":
    main()

"""Paso 3: paleta por zona del cuerpo desde las fotos de referencia (solo MVP).

Uso (requiere el venv de enrich/: numpy + Pillow):
    python_scripts/enrich/.venv/bin/python python_scripts/enrich/extract_palette.py --mvp

Entrada (en refs/, gitignored):
  palette_selection.json   fotos laterales elegidas por especie (2–3)
  zones.json               por foto: recorte del ave ("crop", % de la foto) y un punto por zona
                           ("zones", % del recorte). Se anota a mano mirando las grillas de
                           palette_grid.py.
Método: en cada punto se toma una muestra circular (radio ~2,5 % del recorte), se agrupa con
k-means (k=3) y se usa el grupo más poblado del centro de la muestra. Entre fotos, mediana por
canal. Cuantizado a 5 bits por canal como makeTex del prototipo: round(c/8)*8, tope 248.

Salidas:
  web/data/game/enrich/palette.json   {sciName: {zona: [r,g,b], pattern, accentWhere, reviewed, ...}}
  refs/PALETTES.html                  swatches junto a las fotos con los puntos, para revisión
reviewed se mantiene en false hasta que una persona lo confirme (se preserva entre corridas).
"""

from __future__ import annotations

import argparse
import html
import json

import numpy as np
from PIL import Image, ImageDraw

import common as c
from review_palettes import REVIEW, apply_review

ZONES = ["back", "back_dark", "belly", "flank", "head", "throat", "wing", "tail", "beak", "legs", "eye", "accent"]
# Patrones y dónde va el acento: revisión visual de las fotos (texturas del prototipo: barred/streaked/plain).
PATTERN = {
    "Pteroptochos megapodius": ({"belly": "barred", "flank": "barred"}, "bigote"),
    "Turdus falcklandii": ({"throat": "streaked"}, None),
    "Zonotrichia capensis": ({"back": "streaked", "wing": "streaked", "head": "striped"}, "collar"),
    "Troglodytes musculus": ({"wing": "barred", "tail": "barred"}, None),
    "Zenaida auriculata": ({"wing": "spotted"}, None),
    "Mimus thenca": ({"back": "streaked", "belly": "streaked"}, None),
    "Scelorchilus albicollis": ({"belly": "barred", "flank": "barred"}, "ala y cola"),
    "Diuca diuca": ({}, "subcaudales"),
    "Vanellus chilensis": ({}, "pecho"),
    "Sturnella loyca": ({"back": "streaked", "wing": "streaked"}, "pecho"),
    "Oreotrochilus leucopleurus": ({}, "gorguera"),
    "Muscisaxicola frontalis": ({}, "frente"),
}
# Rasgos finos (patas, pico, ojo) y acentos que la muestra no captura bien: fijados a mano
# mirando las fotos. Quedan listados en "manual" de cada especie.
MANUAL = {
    "Pteroptochos megapodius": {"beak": [56, 48, 40]},
    "Turdus falcklandii": {"legs": [200, 128, 48], "eye": [40, 24, 16]},
    "Zonotrichia capensis": {"beak": [64, 64, 64], "legs": [152, 120, 104]},
    "Troglodytes musculus": {"beak": [72, 64, 56], "legs": [152, 120, 104]},
    "Zenaida auriculata": {"beak": [64, 64, 72], "eye": [24, 24, 24]},
    "Mimus thenca": {"beak": [32, 32, 32], "legs": [56, 48, 48]},
    "Scelorchilus albicollis": {"beak": [48, 44, 40], "legs": [80, 72, 64], "throat": [216, 208, 192], "accent": [184, 96, 48],
                                "flank": [72, 56, 48], "tail": [168, 88, 48], "head": [104, 80, 64]},
    "Diuca diuca": {"beak": [72, 72, 80], "legs": [56, 52, 56], "accent": [144, 64, 40]},
    "Vanellus chilensis": {"eye": [176, 40, 40], "beak": [168, 120, 136], "legs": [176, 112, 120]},
    "Sturnella loyca": {"beak": [168, 160, 160], "legs": [96, 88, 88], "accent": [224, 64, 24]},
    "Oreotrochilus leucopleurus": {"beak": [24, 24, 24], "legs": [40, 36, 36], "eye": [16, 16, 16]},
    "Muscisaxicola frontalis": {"beak": [32, 32, 32], "legs": [40, 40, 40], "accent": [32, 32, 32]},
    # Valparaíso (paletas automáticas de Qwen3-VL; se corrigen rasgos finos y zonas tomadas del cielo)
    "Cathartes aura": {"head": [184, 64, 56], "beak": [224, 216, 200], "legs": [200, 176, 168]},
    "Himantopus mexicanus": {"legs": [232, 120, 140], "beak": [24, 24, 24], "head": [40, 40, 40]},
    "Larus dominicanus": {"belly": [232, 232, 232], "flank": [224, 224, 224], "throat": [240, 240, 240], "beak": [232, 200, 64], "legs": [208, 200, 120]},
    "Sephanoides sephaniodes": {"accent": [208, 48, 40]},
    "Phytotoma rara": {"eye": [200, 40, 32], "accent": [168, 72, 40]},
    "Anairetes parulus": {"belly": [208, 208, 192], "back": [104, 104, 96], "head": [40, 40, 40], "eye": [232, 216, 96]},
    "Callipepla californica": {"throat": [24, 24, 24], "accent": [232, 232, 232]},
    # Magallanes
    "Chloephaga picta": {"head": [216, 212, 200], "throat": [224, 220, 208], "belly": [224, 220, 208], "back": [128, 120, 112]},
    "Vultur gryphus": {"head": [136, 88, 88], "accent": [240, 240, 232], "beak": [216, 208, 192]},
    "Aphrastura spinicauda": {"belly": [232, 228, 216], "throat": [232, 224, 208], "back": [120, 72, 40], "accent": [216, 152, 72]},
    "Enicognathus ferrugineus": {"tail": [120, 40, 40], "accent": [168, 48, 40]},
    "Phrygilus patagonicus": {"back": [96, 104, 56], "flank": [184, 160, 40], "throat": [96, 104, 120]},
    "Spheniscus magellanicus": {"belly": [232, 232, 232], "flank": [232, 232, 232], "accent": [232, 232, 232], "beak": [48, 44, 44], "legs": [80, 64, 64]},
    "Leucocarbo atriceps": {"belly": [232, 232, 224], "throat": [232, 232, 224], "legs": [216, 160, 160], "accent": [232, 168, 48]},
    "Haematopus leucopodus": {"belly": [232, 232, 224], "eye": [232, 200, 64]},
    "Cygnus melancoryphus": {"beak": [96, 104, 128], "accent": [200, 40, 40]},
    "Tachyeres patachonicus": {"beak": [224, 168, 48], "legs": [216, 152, 56]},
    "Coscoroba coscoroba": {"legs": [232, 150, 150]},
}
# Dónde va el acento cuando el modelo no lo detecta (palabras que entiende bird.js).
ACCENT_FIX = {"Sephanoides sephaniodes": "frente", "Phytotoma rara": "pecho", "Callipepla californica": "bigote",
              "Vultur gryphus": "collar", "Aphrastura spinicauda": "bigote", "Enicognathus ferrugineus": "pecho",
              "Spheniscus magellanicus": "collar", "Leucocarbo atriceps": "frente", "Cygnus melancoryphus": "frente"}
DEFAULTS = {"eye": [16, 16, 16], "beak": [40, 32, 28], "legs": [72, 64, 56]}


def quant(c_: np.ndarray) -> list[int]:
    return [int(min(248, round(v / 8) * 8)) for v in c_]


def kmeans_dominant(px: np.ndarray, k: int = 3, iters: int = 12) -> np.ndarray:
    if len(px) <= k:
        return px.mean(axis=0)
    rng = np.random.default_rng(0)
    cent = px[rng.choice(len(px), k, replace=False)].astype(float)
    for _ in range(iters):
        lab = np.argmin(((px[:, None, :] - cent[None]) ** 2).sum(-1), axis=1)
        cent = np.array([px[lab == j].mean(axis=0) if np.any(lab == j) else cent[j] for j in range(k)])
    counts = np.bincount(lab, minlength=k)
    return cent[np.argmax(counts)]


def sample(img: Image.Image, crop: list[float], pt: list[float]) -> tuple[np.ndarray, tuple[float, float, float]]:
    w, h = img.size
    x0, y0, x1, y1 = crop[0] * w / 100, crop[1] * h / 100, crop[2] * w / 100, crop[3] * h / 100
    cx, cy = x0 + pt[0] * (x1 - x0) / 100, y0 + pt[1] * (y1 - y0) / 100
    r = max(3.0, 0.025 * max(x1 - x0, y1 - y0))
    arr = np.asarray(img, dtype=float)
    ys, xs = np.mgrid[int(cy - r):int(cy + r) + 1, int(cx - r):int(cx + r) + 1]
    ok = ((xs - cx) ** 2 + (ys - cy) ** 2 <= r * r) & (xs >= 0) & (ys >= 0) & (xs < w) & (ys < h)
    return kmeans_dominant(arr[ys[ok], xs[ok]]), (cx, cy, r)


AUTO_MIN_AREA = 0.08  # fracción de la foto que debe ocupar el ave (descarta aves lejanas)
AUTO_PHOTOS = 5


def auto_selection(sci: str, auto: dict) -> list[str]:
    """Fotos anotadas por el modelo, usables y laterales, con el ave más grande primero."""
    def area(a):
        cr = a.get("crop")
        return (cr[2] - cr[0]) * (cr[3] - cr[1]) / 1e4 if cr else 0
    ok = [(area(a), pid) for pid, a in auto.items()
          if a.get("sciName") == sci and a.get("view") == "lateral" and not a.get("discard_reason")
          and area(a) >= AUTO_MIN_AREA and a.get("zones")]
    return [pid for _, pid in sorted(ok, reverse=True)[:AUTO_PHOTOS]]


def auto_traits(pids: list[str], auto: dict) -> tuple[dict, str | None]:
    """Patrón por zona y acento por mayoría entre las fotos anotadas."""
    from collections import Counter
    pat = Counter((z, v) for pid in pids for z, v in auto[pid].get("pattern", {}).items())
    pattern = {z: v for (z, v), n in pat.items() if n * 2 > len(pids)}
    acc = Counter((auto[pid].get("accent_where") or "").lower() for pid in pids if auto[pid].get("accent_where"))
    where = acc.most_common(1)[0][0] if acc and acc.most_common(1)[0][1] * 2 > len(pids) else None
    return pattern, accent_keyword(where)


# El juego entiende estos lugares para el acento (ver bird.js); el modelo responde en texto libre.
ACCENT_WORDS = [("subcaudales", ("subcaud", "vent", "undertail", "infracaudal")),
                ("gorguera", ("gorguera", "garganta", "throat", "gorget")),
                ("pecho", ("pecho", "breast", "chest", "vientre", "belly")),
                ("collar", ("collar", "nuca", "nape", "cuello", "neck")),
                ("frente", ("frente", "forehead", "corona", "crown", "capuch", "cap")),
                ("bigote", ("bigote", "mejilla", "cheek", "cara", "face", "ceja", "brow")),
                ("ala y cola", ("ala", "wing", "cola", "tail", "espejo", "speculum"))]


def accent_keyword(text: str | None) -> str | None:
    t = (text or "").lower()
    for key, words in ACCENT_WORDS:
        if any(w in t for w in words):
            return key
    return None


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    c.species_args(ap)
    ap.add_argument("--source", choices=["mixed", "auto"], default="mixed",
                    help="mixed: anotación manual si existe, si no la del modelo; auto: solo la del modelo")
    ap.add_argument("--out", help="JSON de salida (por defecto enrich/palette.json)")
    args = ap.parse_args()
    index = c.load_index()
    names = {s["sciName"]: s["comName"] for s in index["species"]}
    species = c.selected_species(args, index)
    sel = json.loads((c.REFS_DIR / "palette_selection.json").read_text(encoding="utf-8"))
    zones = json.loads((c.REFS_DIR / "zones.json").read_text(encoding="utf-8"))
    auto_path = c.REFS_DIR / "zones_auto.json"
    auto = json.loads(auto_path.read_text(encoding="utf-8")) if auto_path.exists() else {}
    manifest = json.loads((c.REFS_DIR / "manifest.json").read_text(encoding="utf-8"))
    photos = {p["id"]: p for e in manifest.values() for p in e["photos"]}
    out_path = c.ROOT / args.out if args.out else c.ENRICH_DIR / "palette.json"
    # decisiones de la revisión humana (review_palettes.py): se aplican siempre sobre lo extraído
    review = json.loads(REVIEW.read_text(encoding="utf-8")) if REVIEW.exists() and not args.out else {}
    palette = json.loads(out_path.read_text(encoding="utf-8")) if out_path.exists() else {}
    marked_dir = c.REFS_DIR / "palettes"
    marked_dir.mkdir(exist_ok=True)

    sections = []
    for sci in species:
        use_manual = args.source == "mixed" and sci in sel
        pids = sel[sci] if use_manual else auto_selection(sci, auto)
        if not pids:
            continue
        per_zone: dict[str, list[np.ndarray]] = {}
        thumbs = []
        for pid in pids:
            ann = zones[pid] if use_manual else auto[pid]
            img = Image.open(c.REFS_DIR / photos[pid]["file"]).convert("RGB")
            marks = img.copy()
            d = ImageDraw.Draw(marks)
            for zone, pt in ann["zones"].items():
                col, (cx, cy, r) = sample(img, ann["crop"], pt)
                per_zone.setdefault(zone, []).append(col)
                d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 255, 0), width=max(1, int(r / 4)))
                d.text((cx + r + 2, cy - r), zone, fill=(255, 255, 0))
            w, h = img.size
            cr = ann["crop"]
            box = (int(cr[0] * w / 100), int(cr[1] * h / 100), int(cr[2] * w / 100), int(cr[3] * h / 100))
            marks = marks.crop(box)
            marks.thumbnail((420, 420))
            name = f"{pid}.jpg"
            marks.save(marked_dir / name, quality=85)
            clean = img.crop(box)  # versión sin marcas, más grande, para revisar colores a ojo
            clean.thumbnail((900, 900))
            clean.save(marked_dir / f"{pid}_clean.jpg", quality=90)
            thumbs.append((name, photos[pid]))

        entry = {z: quant(np.median(np.array(v), axis=0)) for z, v in per_zone.items()}
        if "back_dark" not in entry and "back" in entry:
            entry["back_dark"] = quant(np.array(entry["back"]) * 0.68)
        manual = MANUAL.get(sci, {})
        entry.update(manual)
        for z, v in DEFAULTS.items():
            entry.setdefault(z, v)
        pattern, accent_where = PATTERN[sci] if use_manual and sci in PATTERN else auto_traits(pids, auto)
        accent_where = ACCENT_FIX.get(sci, accent_where)
        if accent_where is None:
            entry.pop("accent", None)
        prev = palette.get(sci, {})
        palette[sci] = {
            **{z: entry[z] for z in ZONES if z in entry},
            "pattern": pattern,
            "accentWhere": accent_where,
            "manual": sorted(manual),
            "annotation": "manual" if use_manual else f"auto ({auto[pids[0]].get('model')})",
            "photos": [photos[pid]["page"] for pid in pids],
            "reviewed": bool(prev.get("reviewed")) and all(prev.get(z) == entry.get(z) for z in ZONES),
        }
        if sci in review:
            palette[sci] = apply_review(palette[sci], review[sci])

        sw = "".join(
            f'<div class="sw"><span style="background:rgb({",".join(map(str, palette[sci][z]))})"></span>{z}'
            f'<small>{palette[sci][z]}</small></div>' for z in ZONES if z in palette[sci])
        imgs = "".join(f'<a href="{html.escape(p["page"])}" target="_blank"><img src="palettes/{n}"></a>' for n, p in thumbs)
        pat = ", ".join(f"{k}: {v}" for k, v in pattern.items()) or "liso"
        sections.append(
            f'<section><h2>{html.escape(names.get(sci, ""))} <i>{sci}</i>'
            f'{" ✔" if palette[sci]["reviewed"] else ""}</h2>'
            f'<p>patrón: {html.escape(pat)} · acento: {html.escape(accent_where or "—")} · anotación: {palette[sci]["annotation"]}</p>'
            f'<div class="row"><div class="sws">{sw}</div>{imgs}</div></section>')

    c.write_json(out_path, palette)
    page = f"""<!doctype html><html lang="es"><meta charset="utf-8"><title>Paletas</title>
<style>body{{font:14px system-ui;margin:16px;background:#111;color:#ddd}}a{{color:#8cf}}
.row{{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start}}img{{max-height:260px;border:1px solid #333}}
.sws{{display:grid;grid-template-columns:repeat(2,150px);gap:4px}}.sw{{display:flex;align-items:center;gap:6px;font-size:12px}}
.sw span{{width:28px;height:28px;border:1px solid #555;image-rendering:pixelated}}.sw small{{color:#888}}
section{{border-top:1px solid #333;padding-top:8px;margin-top:12px}}</style>
<h1>Paletas por zona (uso interno: las fotos no se publican)</h1>
<p>Colores cuantizados a 5 bits por canal. Los círculos amarillos muestran dónde se tomó cada zona.</p>
{"".join(sections)}</html>"""
    (c.REFS_DIR / "PALETTES.html").write_text(page, encoding="utf-8")
    print(f"{len(sections)} especies → {out_path.relative_to(c.ROOT)} · refs/PALETTES.html")


if __name__ == "__main__":
    main()

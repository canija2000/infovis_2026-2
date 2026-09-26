"""Genera los archivos livianos que consume la web (año típico y clases estacionales).

Uso:
    python3 build_web_data.py            # regenera web/data/*.json derivados
    python3 build_web_data.py --report   # además imprime clases de especies de control

Entrada (no se modifica):
    web/data/metadata.json + web/data/observations-*.json   agregado GBIF
                                                             region × mes × especie
    web/data/regions.geojson                                 polígonos regionales
    gbif/synonyms_xc.json                                    nombres GBIF → Xeno-canto
    sounds/manifest.json (opcional, local)                   grabaciones descargadas

Salida (web/data/):
    meta.json           regiones, parámetros, fuente y DOIs
    species.json        una fila por especie (clase nacional, pico, totales)
    typical_year.json   matriz dispersa especie × región × 12 meses
    region_month.json   riqueza y composición estacional por región-mes
    regions.min.geojson polígonos simplificados (continente) para D3
    sounds.json         sinónimos y grabaciones por especie (carga diferida)

Solo usa la biblioteca estándar. La salida es determinista: mismo input,
mismos bytes (sin marcas de tiempo; orden estable; redondeo fijo).
Metodología: docs/metodologia-datos.md §10.
"""

from __future__ import annotations

import argparse
import calendar
import json
import math
from collections import defaultdict
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent
DATA_DIR = PROJECT_DIR / "web" / "data"
SYNONYMS_PATH = PROJECT_DIR / "gbif" / "synonyms_xc.json"
SOUNDS_MANIFEST = PROJECT_DIR / "sounds" / "manifest.json"

# --- Parámetros revisables (documentados en metodologia-datos.md §10) --------
YEARS = list(range(2017, 2025))  # solo años completos con eBird en GBIF
PRESENCE_MIN_YEARS = 4  # registrada en ≥ 4 de 8 años para contar ese mes
PRESENCE_MIN_PROFILE = 0.2  # y con ≥ 20 % de su mes pico (perfil corregido)
SEASONAL_MIN_AMPLITUDE = 0.6  # amplitud ≥ 0,6 ⇒ visitante; si no, residente
TAXON_GROUP = "Aves"

# Variantes ortográficas dentro de GBIF que corresponden a la misma especie.
GBIF_ALIASES = {"Sylviorthorhynchus desmurii": "Sylviorthorhynchus desmursii"}

CLASSES = ["residente", "visitante_estival", "visitante_invernal", "ocasional"]

# Simplificación de polígonos (grados).
SIMPLIFY_TOLERANCE = 0.012
MIN_RING_AREA = 0.004  # grados², descarta islotes que no se ven a esta escala
MIN_LONGITUDE = -76.0  # excluye Juan Fernández, Desventuradas e Isla de Pascua


# --- Lectura ----------------------------------------------------------------


def load_observations() -> list[dict]:
    metadata = json.loads((DATA_DIR / "metadata.json").read_text(encoding="utf-8"))
    files = metadata.get("observationFiles") or sorted(p.name for p in DATA_DIR.glob("observations-*.json"))
    rows: list[dict] = []
    for name in files:
        rows.extend(json.loads((DATA_DIR / name).read_text(encoding="utf-8")))
    return rows


def load_json(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


# --- Geometría --------------------------------------------------------------


def ring_area(ring: list[list[float]]) -> float:
    """Área con signo (shoelace) en grados²; > 0 = antihorario."""
    total = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        total += x1 * y2 - x2 * y1
    return total / 2


def simplify(points: list[list[float]], tolerance: float) -> list[list[float]]:
    """Douglas-Peucker iterativo (sin recursión, apto para anillos largos)."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        start, end = stack.pop()
        (x1, y1), (x2, y2) = points[start], points[end]
        dx, dy = x2 - x1, y2 - y1
        norm = math.hypot(dx, dy)
        best, index = -1.0, -1
        for i in range(start + 1, end):
            px, py = points[i]
            if norm == 0:
                dist = math.hypot(px - x1, py - y1)
            else:
                dist = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / norm
            if dist > best:
                best, index = dist, i
        if best > tolerance:
            keep[index] = True
            stack.append((start, index))
            stack.append((index, end))
    return [p for p, k in zip(points, keep) if k]


def simplify_ring(ring: list[list[float]], exterior: bool) -> list[list[float]] | None:
    if abs(ring_area(ring)) < MIN_RING_AREA:
        return None
    # Un anillo cerrado tiene inicio = fin; se parte en dos para que DP no lo colapse.
    mid = len(ring) // 2
    out = simplify(ring[: mid + 1], SIMPLIFY_TOLERANCE)[:-1] + simplify(ring[mid:], SIMPLIFY_TOLERANCE)
    out = [[round(x, 3), round(y, 3)] for x, y in out]
    dedup = [out[0]] + [p for prev, p in zip(out, out[1:]) if p != prev]
    if len(dedup) < 4:
        return None
    # D3 (geometría esférica) espera anillo exterior horario y huecos antihorarios.
    area = ring_area(dedup)
    if (exterior and area > 0) or (not exterior and area < 0):
        dedup.reverse()
    return dedup


def polygon_centroid(polygons: list) -> tuple[float, float]:
    ax = ay = at = 0.0
    for poly in polygons:
        ring = poly[0]
        a = ring_area(ring)
        cx = cy = 0.0
        for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
            f = x1 * y2 - x2 * y1
            cx += (x1 + x2) * f
            cy += (y1 + y2) * f
        if a:
            ax += cx / 6
            ay += cy / 6
            at += a
    return ax / at, ay / at


def build_regions() -> tuple[list[dict], dict]:
    source = json.loads((DATA_DIR / "regions.geojson").read_text(encoding="utf-8"))
    regions, features = [], []
    for feature in source["features"]:
        props = feature["properties"]
        code = props.get("region_code")
        if not code:
            continue  # "Zona sin demarcar"
        geom = feature["geometry"]
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        continental = [p for p in polys if max(x for x, _ in p[0]) > MIN_LONGITUDE]
        simplified = []
        for poly in continental:
            outer = simplify_ring(poly[0], exterior=True)
            if outer is None:
                continue
            holes = [h for h in (simplify_ring(r, exterior=False) for r in poly[1:]) if h]
            simplified.append([outer] + holes)
        lon, lat = polygon_centroid(continental)
        name = props["Region"]
        for prefix in ("Región de ", "Región del ", "Región "):
            if name.startswith(prefix):
                name = name[len(prefix):]
                break
        short = {
            "Aysén del Gral.Ibañez del Campo": "Aysén",
            "Libertador Bernardo O'Higgins": "O'Higgins",
            "Magallanes y Antártica Chilena": "Magallanes",
            "Metropolitana de Santiago": "Metropolitana",
            "Bío-Bío": "Biobío",
        }.get(name, name)
        regions.append({"code": code, "name": short, "fullName": props["Region"], "lat": round(lat, 2), "lon": round(lon, 2)})
        features.append({"code": code, "polys": simplified})
    regions.sort(key=lambda r: -r["lat"])  # norte → sur
    for i, region in enumerate(regions, start=1):
        region["id"] = i
    ids = {r["code"]: r["id"] for r in regions}
    geo = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": ids[f["code"]],
                "properties": {"id": ids[f["code"]], "code": f["code"]},
                "geometry": {"type": "MultiPolygon", "coordinates": f["polys"]},
            }
            for f in sorted(features, key=lambda f: ids[f["code"]])
        ],
    }
    return regions, geo


# --- Año típico y clasificación ---------------------------------------------


def amplitude(profile: list[float]) -> float:
    """1 − (media de los 3 meses más bajos / media de los 3 más altos)."""
    s = sorted(profile)
    hi = sum(s[-3:]) / 3
    return 1 - (sum(s[:3]) / 3) / hi if hi > 0 else 0.0


def phase_month(profile: list[float]) -> float:
    """Mes medio circular (0 = enero … 11 = diciembre) ponderado por el perfil."""
    sx = sum(v * math.cos(2 * math.pi * m / 12) for m, v in enumerate(profile))
    sy = sum(v * math.sin(2 * math.pi * m / 12) for m, v in enumerate(profile))
    return (math.atan2(sy, sx) / (2 * math.pi) * 12) % 12


def classify(profile: list[float], years_present: list[int]) -> tuple[str, float, float]:
    amp = amplitude(profile)
    phase = phase_month(profile)
    if max(years_present) < PRESENCE_MIN_YEARS:
        return "ocasional", amp, phase
    if amp < SEASONAL_MIN_AMPLITUDE:
        return "residente", amp, phase
    # Mitad estival: fase a ≤ 3 meses de enero (oct–abr); si no, invernal (abr–oct).
    summer = math.cos(2 * math.pi * (phase - 0) / 12) >= 0
    return ("visitante_estival" if summer else "visitante_invernal"), amp, phase


def build_typical_year(rows: list[dict], regions: list[dict]):
    rid = {r["code"]: r["id"] for r in regions}
    n_regions = len(regions)
    report = defaultdict(float)  # (sci, scope, y, m) → reportDays
    effort = defaultdict(float)  # (scope, y, m) → días-especie totales
    names: dict[str, str] = {}
    totals = defaultdict(float)  # días-especie 2017–2024 por especie
    for row in rows:
        year, month = int(row["year_month"][:4]), int(row["year_month"][5:7])
        if year not in YEARS or row["region_code"] not in rid:
            continue
        sci = GBIF_ALIASES.get(row["sciName"], row["sciName"])
        names.setdefault(sci, row["comName"])
        value = float(row["reportDays"])
        region = rid[row["region_code"]]
        for scope in (region, 0):  # 0 = Chile (suma de regiones)
            report[(sci, scope, year, month - 1)] += value
            effort[(scope, year, month - 1)] += value
        totals[sci] += value

    days = {(y, m): calendar.monthrange(y, m + 1)[1] for y in YEARS for m in range(12)}
    n_years = len(YEARS)
    series = defaultdict(lambda: {"freq": [0.0] * 12, "rel": [0.0] * 12, "years": [0] * 12})
    for (sci, scope, y, m), value in report.items():
        s = series[(sci, scope)]
        # Frecuencia: fracción de días del mes con registro. En Chile (scope 0) se
        # promedia sobre las regiones para que siga en [0, 1].
        denom = days[(y, m)] * (n_regions if scope == 0 else 1)
        s["freq"][m] += value / denom / n_years
        # Perfil corregido por esfuerzo: participación en los días-especie del mes.
        s["rel"][m] += value / effort[(scope, y, m)] / n_years
        s["years"][m] += 1

    species_ids = {sci: i for i, sci in enumerate(sorted(names, key=lambda s: (-totals[s], s)))}
    table = []
    presence = defaultdict(lambda: [[0] * 4 for _ in range(12)])  # (scope) → mes → conteo por clase
    for (sci, scope), s in sorted(series.items(), key=lambda kv: (species_ids[kv[0][0]], kv[0][1])):
        cls, amp, phase = classify(s["rel"], s["years"])
        peak = max(s["rel"])
        prof = [v / peak if peak else 0.0 for v in s["rel"]]
        peak_month = max(range(12), key=lambda m: (s["rel"][m], -m))
        present = [s["years"][m] >= PRESENCE_MIN_YEARS and prof[m] >= PRESENCE_MIN_PROFILE for m in range(12)]
        for m in range(12):
            if present[m]:
                presence[scope][m][CLASSES.index(cls)] += 1
        table.append(
            {
                "sid": species_ids[sci],
                "rid": scope,
                "cls": CLASSES.index(cls),
                "peak": peak_month,
                "phase": round(phase, 2),
                "amp": round(amp, 3),
                "freq": [round(v * 1000) for v in s["freq"]],
                "prof": [round(v * 100) for v in prof],
                "years": s["years"],
                "present": sum(1 << m for m in range(12) if present[m]),
            }
        )
    effort_mean = {
        scope: [round(sum(effort[(scope, y, m)] for y in YEARS) / n_years) for m in range(12)]
        for scope in range(n_regions + 1)
    }
    return names, totals, species_ids, table, presence, effort_mean


# --- Sonidos ----------------------------------------------------------------


def build_sounds(names: dict, species_ids: dict) -> dict:
    synonyms = load_json(SYNONYMS_PATH, {}).get("synonyms", {})
    manifest = load_json(SOUNDS_MANIFEST, {"species": []})
    reverse = {v["xc"]: k for k, v in synonyms.items()}
    recordings = defaultdict(list)
    for item in manifest.get("species", []):
        sci = item.get("scientificName") or item.get("sciName") or ""
        sci = GBIF_ALIASES.get(reverse.get(sci, sci), reverse.get(sci, sci))
        for rec in item.get("recordings", []):
            if not rec.get("id"):
                continue
            recordings[sci].append(
                {
                    "id": str(rec["id"]),
                    # Se reproduce desde Xeno-canto: sounds/ no se publica.
                    "src": f"https://xeno-canto.org/{rec['id']}/download",
                    "url": rec.get("sourceUrl") or f"https://xeno-canto.org/{rec['id']}",
                    "type": rec.get("type"),
                    "quality": rec.get("quality"),
                    "country": rec.get("country"),
                    "recordist": rec.get("recordist"),
                    "license": ("https:" + rec["license"]) if str(rec.get("license", "")).startswith("//") else rec.get("license"),
                }
            )
    out = []
    for sci in sorted(names, key=lambda s: species_ids[s]):
        syn = synonyms.get(sci)
        xc = syn["xc"] if syn else sci
        out.append(
            {
                "sid": species_ids[sci],
                "xcName": xc,
                "synonymStatus": syn["status"] if syn else None,
                "searchUrl": "https://xeno-canto.org/explore?query=" + xc.replace(" ", "+") + "+cnt:chile",
                "recordings": recordings.get(sci, []),
            }
        )
    return {"source": "Xeno-canto (xeno-canto.org), licencias Creative Commons por grabación", "species": out}


# --- Escritura --------------------------------------------------------------


def write_json(name: str, payload, indent=None) -> int:
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":") if indent is None else None, indent=indent)
    path = DATA_DIR / name
    path.write_text(text + "\n", encoding="utf-8")
    return path.stat().st_size


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--report", action="store_true", help="Imprime la clase de especies de control.")
    args = parser.parse_args()

    regions, geo = build_regions()
    rows = load_observations()
    names, totals, species_ids, table, presence, effort_mean = build_typical_year(rows, regions)
    sounds = build_sounds(names, species_ids)
    with_sound = {s["sid"] for s in sounds["species"] if s["recordings"]}

    national = {row["sid"]: row for row in table if row["rid"] == 0}
    regions_per_species = defaultdict(int)
    for row in table:
        if row["rid"] and row["cls"] != CLASSES.index("ocasional"):
            regions_per_species[row["sid"]] += 1
    species = []
    for sci, sid in sorted(species_ids.items(), key=lambda kv: kv[1]):
        n = national[sid]
        species.append(
            {
                "id": sid,
                "sciName": sci,
                "comName": names[sci],
                "taxonGroup": TAXON_GROUP,
                "class": CLASSES[n["cls"]],
                "peak": n["peak"],
                "phase": n["phase"],
                "seasonality": n["amp"],
                "reportDays": round(totals[sci]),
                "meanFreq": round(sum(n["freq"]) / 12),
                "regions": regions_per_species[sid],
                "hasSound": sid in with_sound,
            }
        )

    region_month = {
        "columns": ["riqueza", "residente", "visitante_estival", "visitante_invernal", "visitantes_prop", "esfuerzo"],
        "note": "Especies presentes en el año típico (≥4 de 8 años y ≥20% de su mes pico). Esfuerzo = días-especie medios del mes.",
        "scopes": {},
    }
    for scope in range(len(regions) + 1):
        months = []
        for m in range(12):
            counts = presence[scope][m]
            rich = counts[0] + counts[1] + counts[2]
            visitors = counts[1] + counts[2]
            months.append([rich, counts[0], counts[1], counts[2], round(visitors / rich, 3) if rich else 0, effort_mean[scope][m]])
        region_month["scopes"][str(scope)] = months

    source_meta = json.loads((DATA_DIR / "metadata.json").read_text(encoding="utf-8"))
    meta = {
        "title": "Atlas de aves de Chile — año típico",
        "taxonGroup": TAXON_GROUP,
        "years": [YEARS[0], YEARS[-1]],
        "excludedYears": "2016 (parcial) y 2025–2026 (sin eBird en GBIF aún)",
        "classes": CLASSES,
        "parameters": {
            "presenceMinYears": PRESENCE_MIN_YEARS,
            "presenceMinProfile": PRESENCE_MIN_PROFILE,
            "seasonalMinAmplitude": SEASONAL_MIN_AMPLITUDE,
        },
        "regions": [{"id": 0, "code": "CL", "name": "Chile", "fullName": "Chile (16 regiones)", "lat": None, "lon": None}]
        + [{k: r[k] for k in ("id", "code", "name", "fullName", "lat", "lon")} for r in regions],
        "typicalYearColumns": {
            "sid": "id de especie (species.json)",
            "rid": "id de región (0 = Chile)",
            "cls": "índice en classes",
            "peak": "mes pico del perfil corregido (0 = enero)",
            "phase": "mes medio circular",
            "amp": "amplitud estacional 0–1",
            "freq": "‰ de días del mes con registro, media 2017–2024",
            "prof": "perfil corregido por esfuerzo, 100 = mes pico",
            "years": "años (de 8) con registro en ese mes",
            "present": "bitmask de meses con presencia",
        },
        "metric": source_meta.get("metricDescription"),
        "source": source_meta.get("sourceDetail"),
        "dois": source_meta.get("dois", []),
        "gbifCitation": "GBIF.org (2026) GBIF Occurrence Downloads, Aves, Chile, 2016–2026. Ver DOIs.",
    }

    compact_rows = [
        [r["sid"], r["rid"], r["cls"], r["peak"], r["phase"], r["amp"], r["present"]] + r["freq"] + r["prof"] + r["years"]
        for r in table
    ]
    typical = {
        "layout": "[sid, rid, cls, peak, phase, amp, present, freq×12, prof×12, years×12]",
        "rows": compact_rows,
    }

    sizes = {
        "meta.json": write_json("meta.json", meta, indent=1),
        "species.json": write_json("species.json", species),
        "typical_year.json": write_json("typical_year.json", typical),
        "region_month.json": write_json("region_month.json", region_month),
        "regions.min.geojson": write_json("regions.min.geojson", geo),
        "sounds.json": write_json("sounds.json", sounds),
    }
    for name, size in sizes.items():
        print(f"{name:22s} {size / 1024:8.1f} KB")
    initial = sum(v for k, v in sizes.items() if k != "sounds.json")
    print(f"{'carga inicial':22s} {initial / 1024:8.1f} KB  (sounds.json es diferido)")
    counts = defaultdict(int)
    for s in species:
        counts[s["class"]] += 1
    print("clases nacionales:", dict(sorted(counts.items())))

    if args.report:
        control = [
            "Elaenia albiceps", "Calidris bairdii", "Sephanoides sephaniodes", "Zenaida auriculata",
            "Hirundo rustica", "Charadrius modestus", "Muscisaxicola maclovianus", "Xolmis pyrope",
            "Tachycineta leucopyga", "Turdus falcklandii", "Zonotrichia capensis", "Lessonia rufa",
        ]
        by_name = {s["sciName"]: s for s in species}
        for sci in control:
            s = by_name.get(sci)
            if s:
                print(f"  {s['comName'][:22]:22s} {sci:28s} {s['class']:20s} amp={s['seasonality']:.2f} pico={s['peak'] + 1}")


if __name__ == "__main__":
    main()

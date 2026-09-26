"""Join espacial GBIF -> regiones + agregado region x mes x especie.

Lee los 11 zips anuales en streaming (sin descomprimir a disco ni cargar
filas en memoria), asigna cada registro a una región con STRtree y acumula
conjuntos de fechas por (region_code, year_month, nombre científico).

Métrica: reportDays = nº de días distintos del mes con al menos un registro
de la especie en la región. No es conteo de observaciones ni de individuos.

Salida: gbif/staging/observations-NN.json (partidos < 18 MiB) + summary.json
con estadísticas de cobertura. No toca web/data hasta revisión.
"""
import csv
import io
import json
import os
import zipfile
from collections import defaultdict

from shapely.geometry import Point, shape
from shapely.strtree import STRtree

BASE = os.path.dirname(os.path.abspath(__file__))
DL = os.path.join(BASE, "downloads")
STAGING = os.path.join(BASE, "staging")
GEOJSON = os.path.abspath(os.path.join(BASE, "..", "web", "data", "regions.geojson"))
OLD_DATA = os.path.abspath(os.path.join(BASE, "..", "web", "data"))

# "all" o la datasetKey de eBird para filtrar solo ese dataset
EBIRD_KEY = "4fa7b334-ce0d-4e88-aaae-2e0c138d049e"
DATASET_MODE = "all"  # decisión documentada tras exploración

MAX_PART_BYTES = 18 * 1024 * 1024


def load_regions():
    g = json.load(open(GEOJSON))
    polys, codes = [], []
    for f in g["features"]:
        rc = f["properties"].get("region_code")
        if not rc:
            continue
        polys.append(shape(f["geometry"]))
        codes.append(rc)
    return STRtree(polys), codes


XWALK_JSON = os.path.join(BASE, "sci_to_comname.json")


def load_name_crosswalk():
    """sciName -> comName (español).

    Fuente primaria: gbif/sci_to_comname.json (construido desde los datos
    anteriores del proyecto, vía eBird con locale es; versionado en git).
    Fallback: escanear web/data/observations-*.json si el archivo falta.
    """
    if os.path.exists(XWALK_JSON):
        return json.load(open(XWALK_JSON, encoding="utf-8"))
    xwalk = {}
    for fn in sorted(os.listdir(OLD_DATA)):
        if fn.startswith("observations-") and fn.endswith(".json"):
            for row in json.load(open(os.path.join(OLD_DATA, fn))):
                sci = (row.get("sciName") or "").strip()
                com = (row.get("comName") or "").strip()
                if sci and com and sci not in xwalk:
                    xwalk[sci] = com
    return xwalk


def main():
    os.makedirs(STAGING, exist_ok=True)
    tree, codes = load_regions()
    print(f"regiones cargadas: {len(codes)}", flush=True)
    xwalk = load_name_crosswalk()
    print(f"crosswalk es: {len(xwalk)} especies", flush=True)

    combos = defaultdict(set)  # (region_code, year_month, sci) -> {date}
    stats = {"filas": 0, "fuera_poligonos": 0, "sin_fecha": 0,
             "sin_coords": 0, "sin_taxon": 0, "por_anio": {}}

    for y in range(2016, 2027):
        zpath = os.path.join(DL, f"{y}.zip")
        n = fuera = 0
        with zipfile.ZipFile(zpath) as z:
            with z.open(z.namelist()[0]) as fh:
                reader = csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8"),
                                        delimiter="\t")
                for row in reader:
                    n += 1
                    if DATASET_MODE != "all" and row.get("datasetKey") != DATASET_MODE:
                        continue
                    ed = (row.get("eventDate") or "")[:10]
                    if len(ed) < 10:
                        stats["sin_fecha"] += 1
                        continue
                    try:
                        lon = float(row["decimalLongitude"])
                        lat = float(row["decimalLatitude"])
                    except (ValueError, TypeError, KeyError):
                        stats["sin_coords"] += 1
                        continue
                    # solo rango especie: `species` viene vacío para
                    # identificaciones a género o superior (ej. "Anas Linnaeus, 1758")
                    sci = (row.get("species") or "").strip()
                    if not sci:
                        stats["sin_taxon"] += 1
                        continue
                    hits = tree.query(Point(lon, lat), predicate="within")
                    if len(hits) == 0:
                        fuera += 1
                        continue
                    rc = codes[int(hits[0])]
                    combos[(rc, ed[:7], sci)].add(ed)
        stats["filas"] += n
        stats["fuera_poligonos"] += fuera
        stats["por_anio"][y] = {"filas": n, "fuera": fuera,
                                "pct_fuera": round(100 * fuera / n, 1)}
        print(f"[{y}] filas={n:,} fuera={fuera:,} ({100*fuera/n:.1f}%) "
              f"combos={len(combos):,}", flush=True)

    # materializar registros ordenados
    records = []
    for (rc, ym, sci), dates in combos.items():
        records.append({
            "region_code": rc,
            "year_month": ym,
            "sciName": sci,
            "comName": xwalk.get(sci, ""),
            "reportDays": len(dates),
        })
    records.sort(key=lambda r: (r["region_code"], r["year_month"], r["sciName"]))
    con_nombre = sum(1 for r in records if r["comName"])
    print(f"registros: {len(records):,} | con nombre ES: {con_nombre:,} "
          f"({100*con_nombre/len(records):.1f}%)", flush=True)

    # partir en archivos < MAX_PART_BYTES (corte por registros completos)
    parts, cur, cur_size = [], [], 2  # 2 por los corchetes
    for r in records:
        s = json.dumps(r, ensure_ascii=False)
        if cur and cur_size + len(s) + 1 > MAX_PART_BYTES:
            parts.append(cur)
            cur, cur_size = [], 2
        cur.append(s)
        cur_size += len(s) + 1
    if cur:
        parts.append(cur)

    files = []
    for i, part in enumerate(parts, 1):
        fn = f"observations-{i:02d}.json"
        with open(os.path.join(STAGING, fn), "w", encoding="utf-8") as f:
            f.write("[" + ",".join(part) + "]")
        files.append(fn)
        print(f"  {fn}: {len(part):,} registros "
              f"({os.path.getsize(os.path.join(STAGING, fn))/1e6:.1f} MB)", flush=True)

    stats.update({
        "dataset_mode": DATASET_MODE,
        "registros_agregados": len(records),
        "archivos": files,
        "con_nombre_es_pct": round(100 * con_nombre / len(records), 1),
    })
    json.dump(stats, open(os.path.join(STAGING, "summary.json"), "w"), indent=1)
    print("STAGING OK:", files)


if __name__ == "__main__":
    main()

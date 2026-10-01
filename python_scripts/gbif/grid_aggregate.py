"""Agregado GBIF en grilla: celda × mes × clase (año típico 2017–2024).

Complementa join_aggregate.py (región × mes × especie). Lee los mismos zips
anuales de gbif/downloads/ en streaming y, para cada registro dentro de los
polígonos regionales, cuenta especie-días por celda de grilla regular:

    especie-día = (especie, fecha) distintos dentro de la celda.

Igual que reportDays, no es un conteo de individuos: varios registros de la
misma especie el mismo día en la misma celda cuentan una vez. Cada especie
lleva su clase nacional de web/data/species.json (residente, visitante
estival, visitante invernal, ocasional); las especies fuera de ese archivo
se descartan.

Salida (no versionada): gbif/staging/grid-<res>.json con, por celda,
    [ix, iy, región, [mes][clase] especie-días sumados 2017–2024,
     [mes] nº de años con registros].
Celda = (floor(lon / res), floor(lat / res)).

Uso (desde la raíz del repo; requiere shapely ≥ 2 y las descargas en gbif/downloads/):
    python3 python_scripts/gbif/grid_aggregate.py [--res 0.1 0.2]
"""
import argparse
import csv
import io
import json
import math
import os
import zipfile
from collections import defaultdict

import numpy as np
import shapely
from shapely.geometry import shape

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DL = os.path.join(ROOT, "gbif", "downloads")
STAGING = os.path.join(ROOT, "gbif", "staging")
GEOJSON = os.path.join(ROOT, "web", "data", "regions.geojson")
SPECIES = os.path.join(ROOT, "web", "data", "species.json")
META = os.path.join(ROOT, "web", "data", "meta.json")

YEARS = range(2017, 2025)  # mismo año típico que build_web_data.py
CLASSES = ["residente", "visitante_estival", "visitante_invernal", "ocasional"]


def load_regions():
    g = json.load(open(GEOJSON, encoding="utf-8"))
    meta = json.load(open(META, encoding="utf-8"))
    rid = {r["code"]: r["id"] for r in meta["regions"]}
    polys, ids = [], []
    for f in g["features"]:
        code = f["properties"].get("region_code")
        if code in rid:
            polys.append(shape(f["geometry"]))
            ids.append(rid[code])
    return shapely.STRtree(polys), np.array(ids)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--res", type=float, nargs="+", default=[0.1, 0.2], help="tamaño de celda en grados")
    args = ap.parse_args()
    os.makedirs(STAGING, exist_ok=True)

    tree, region_ids = load_regions()
    cls_of = {s["sciName"]: CLASSES.index(s["class"]) for s in json.load(open(SPECIES, encoding="utf-8"))}
    sid_of = {s["sciName"]: s["id"] for s in json.load(open(SPECIES, encoding="utf-8"))}

    # res -> celda -> conteos
    counts = {r: defaultdict(lambda: [[0] * 4 for _ in range(12)]) for r in args.res}
    years_seen = {r: defaultdict(lambda: [set() for _ in range(12)]) for r in args.res}
    region_votes = {r: defaultdict(lambda: defaultdict(int)) for r in args.res}
    stats = {"filas": 0, "usadas": 0, "fuera_poligonos": 0, "sin_especie": 0}

    for year in YEARS:
        lons, lats, keys = [], [], []
        with zipfile.ZipFile(os.path.join(DL, f"{year}.zip")) as z:
            with z.open(z.namelist()[0]) as fh:
                for row in csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8"), delimiter="\t"):
                    stats["filas"] += 1
                    date = (row.get("eventDate") or "")[:10]
                    sci = (row.get("species") or "").strip()
                    if len(date) < 10 or not date.startswith(str(year)):
                        continue
                    if sci not in cls_of:
                        stats["sin_especie"] += 1
                        continue
                    try:
                        lon = float(row["decimalLongitude"])
                        lat = float(row["decimalLatitude"])
                    except (ValueError, TypeError, KeyError):
                        continue
                    lons.append(lon)
                    lats.append(lat)
                    keys.append((sid_of[sci], cls_of[sci], date))
        # Join espacial vectorizado: índice del polígono que contiene cada punto.
        pts = shapely.points(np.array(lons), np.array(lats))
        pidx, poly = tree.query(pts, predicate="within")
        inside = np.full(len(pts), -1)
        inside[pidx] = poly
        stats["fuera_poligonos"] += int((inside < 0).sum())

        for r in args.res:
            seen = set()
            for i in np.nonzero(inside >= 0)[0]:
                sid, cls, date = keys[i]
                cell = (math.floor(lons[i] / r), math.floor(lats[i] / r))
                k = (cell, sid, date)
                if k in seen:
                    continue
                seen.add(k)
                m = int(date[5:7]) - 1
                counts[r][cell][m][cls] += 1
                years_seen[r][cell][m].add(year)
                region_votes[r][cell][int(region_ids[inside[i]])] += 1
        stats["usadas"] += int((inside >= 0).sum())
        print(f"[{year}] filas acumuladas={stats['filas']:,} dentro={stats['usadas']:,}", flush=True)

    for r in args.res:
        cells = []
        for cell, months in sorted(counts[r].items()):
            votes = region_votes[r][cell]
            region = max(votes, key=votes.get)
            cells.append([cell[0], cell[1], region, months, [len(s) for s in years_seen[r][cell]]])
        out = os.path.join(STAGING, f"grid-{r:g}.json")
        json.dump({"res": r, "years": [YEARS[0], YEARS[-1]], "classes": CLASSES,
                   "layout": "[ix, iy, regionId, [mes][clase] especie-días, [mes] años con registro]",
                   "cells": cells}, open(out, "w"))
        print(f"{out}: {len(cells):,} celdas ({os.path.getsize(out) / 1e6:.1f} MB)")
    json.dump(stats, open(os.path.join(STAGING, "grid-summary.json"), "w"), indent=1)
    print(stats)


if __name__ == "__main__":
    main()

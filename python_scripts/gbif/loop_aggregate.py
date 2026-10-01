"""Lugar-días por especie, región y mes (año típico 2017–2024), para el loop sonoro.

lugar-día = (celda de 0,05° ≈ 5 km, fecha) distintos en que se registró la especie.
Mide qué tan extendida y frecuente es una especie: una especie registrada todos
los días pero en un solo humedal suma menos que una registrada todos los días en
toda la región. A diferencia de la frecuencia de detección (‰ de días con
registro), no se satura en las especies comunes.

Salida (no versionada): gbif/staging/place_days.json
    {región: {sid: [12 meses, suma 2017–2024]}}, región 0 = Chile (suma de regiones).

Uso (desde la raíz del repo; requiere shapely ≥ 2 y las descargas en gbif/downloads/):
    python3 python_scripts/gbif/loop_aggregate.py
"""
import csv
import io
import json
import math
import os
import zipfile
from collections import defaultdict

import numpy as np
import shapely

from grid_aggregate import DL, SPECIES, STAGING, YEARS, load_regions

RES = 0.05


def main():
    tree, region_ids = load_regions()
    sid_of = {s["sciName"]: s["id"] for s in json.load(open(SPECIES, encoding="utf-8"))}
    counts = defaultdict(lambda: defaultdict(lambda: [0] * 12))
    for year in YEARS:
        lons, lats, keys = [], [], []
        with zipfile.ZipFile(os.path.join(DL, f"{year}.zip")) as z:
            with z.open(z.namelist()[0]) as fh:
                for row in csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8"), delimiter="\t"):
                    date = (row.get("eventDate") or "")[:10]
                    sci = (row.get("species") or "").strip()
                    if len(date) < 10 or not date.startswith(str(year)) or sci not in sid_of:
                        continue
                    try:
                        lon = float(row["decimalLongitude"])
                        lat = float(row["decimalLatitude"])
                    except (ValueError, TypeError, KeyError):
                        continue
                    lons.append(lon)
                    lats.append(lat)
                    keys.append((sid_of[sci], date))
        pts = shapely.points(np.array(lons), np.array(lats))
        pidx, poly = tree.query(pts, predicate="within")
        inside = np.full(len(pts), -1)
        inside[pidx] = poly
        seen = set()
        for i in np.nonzero(inside >= 0)[0]:
            sid, date = keys[i]
            k = (math.floor(lons[i] / RES), math.floor(lats[i] / RES), sid, date)
            if k in seen:
                continue
            seen.add(k)
            m = int(date[5:7]) - 1
            rid = int(region_ids[inside[i]])
            counts[rid][sid][m] += 1
            counts[0][sid][m] += 1
        print(f"[{year}] lugar-días acumulados: {sum(sum(v) for v in counts[0].values()):,}", flush=True)
    out = os.path.join(STAGING, "place_days.json")
    json.dump({str(r): {str(s): v for s, v in sp.items()} for r, sp in counts.items()}, open(out, "w"))
    print(out)


if __name__ == "__main__":
    main()

"""Rellena comName faltantes en staging desde gbif/sci_to_comname.json.

Uso puntual: el join que está corriendo construyó su crosswalk desde
web/data ya reemplazado (485 nombres); este parche restaura los 565
originales sin repetir el join de 5 minutos.
"""
import json
import os

BASE = os.path.dirname(os.path.abspath(__file__))
STAGING = os.path.join(BASE, "staging")

xwalk = json.load(open(os.path.join(BASE, "sci_to_comname.json"),
                       encoding="utf-8"))
n_fill = n_tot = 0
for fn in sorted(os.listdir(STAGING)):
    if not (fn.startswith("observations-") and fn.endswith(".json")):
        continue
    p = os.path.join(STAGING, fn)
    recs = json.load(open(p, encoding="utf-8"))
    for r in recs:
        n_tot += 1
        if not r.get("comName") and r["sciName"] in xwalk:
            r["comName"] = xwalk[r["sciName"]]
            n_fill += 1
    json.dump(recs, open(p, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"{fn}: {len(recs):,} registros")
print(f"comName rellenados: {n_fill:,} de {n_tot:,}")

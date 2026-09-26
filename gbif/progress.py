"""Resumen de progreso del pipeline GBIF (sin credenciales).
Uso: progress.py  -> imprime estado de las 11 descargas anuales.
"""
import json
import os

BASE = os.path.dirname(os.path.abspath(__file__))
st = json.load(open(os.path.join(BASE, "state.json")))
dls = st.get("downloads", {})

years = [str(y) for y in range(2016, 2027)]
fetched = sum(1 for y in years if dls.get(y, {}).get("fetched"))
active = [(y, dls[y].get("status")) for y in years
          if dls.get(y, {}).get("status") in ("SUBMITTED", "PREPARING", "RUNNING")]
failed = [(y, dls[y].get("status")) for y in years
          if dls.get(y, {}).get("status") in ("FAILED", "KILLED", "CANCELLED")]
waiting = [y for y in years if y not in dls]
total_records = sum(dls.get(y, {}).get("totalRecords") or 0 for y in years)

print(f"zips listos: {fetched}/11 | activas: {len(active)} | "
      f"en espera: {len(waiting)} | registros: {total_records:,}")
for y, s in active:
    print(f"  {y}: {s} ({(dls[y].get('totalRecords') or 0):,} registros)")
for y, s in failed:
    print(f"  {y}: {s}  <-- ¡FALLÓ!")
if waiting:
    print(f"  pendientes de encolar: {', '.join(waiting)}")

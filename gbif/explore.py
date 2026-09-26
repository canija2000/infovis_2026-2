"""Exploración streaming de los 11 zips GBIF para decidir métrica y limpieza.

Responde:
1. Composición por datasetKey (¿eBird domina todos los años?)
2. Duplicados de occurrenceID por año
3. Distribución de basisOfRecord
4. Tasa de species nulo, columnas taxonómicas disponibles
5. Formato y cobertura de eventDate
No guarda filas: solo agregados. Uso de memoria acotado.
"""
import csv
import json
import os
import zipfile
from collections import Counter

BASE = os.path.dirname(os.path.abspath(__file__))
DL = os.path.join(BASE, "downloads")
EBIRD_KEY = "4fa7b334-ce0d-4e88-aaae-2e0c138d049e"

COLS_WANT = ["datasetKey", "occurrenceID", "basisOfRecord", "species",
             "scientificName", "taxonKey", "eventDate", "year", "month",
             "decimalLatitude", "decimalLongitude", "eventID",
             "samplingProtocol", "individualCount", "occurrenceStatus"]


def main():
    per_year = {}
    ds_global = Counter()
    bor_global = Counter()
    for y in range(2016, 2027):
        zpath = os.path.join(DL, f"{y}.zip")
        with zipfile.ZipFile(zpath) as z:
            name = z.namelist()[0]
            with z.open(name) as fh:
                # leer como texto
                import io
                txt = io.TextIOWrapper(fh, encoding="utf-8")
                reader = csv.DictReader(txt, delimiter="\t")
                cols = {c: (c in reader.fieldnames) for c in COLS_WANT}
                n = 0
                ebird = 0
                sp_null = 0
                sci_null = 0
                bor = Counter()
                ds = Counter()
                seen = set()
                dup = 0
                dates = Counter()
                for row in reader:
                    n += 1
                    dk = row.get("datasetKey", "")
                    ds[dk] += 1
                    if dk == EBIRD_KEY:
                        ebird += 1
                    b = row.get("basisOfRecord", "")
                    bor[b] += 1
                    if not row.get("species"):
                        sp_null += 1
                    if not row.get("scientificName"):
                        sci_null += 1
                    oid = row.get("occurrenceID", "")
                    if oid:
                        if oid in seen:
                            dup += 1
                        else:
                            seen.add(oid)
                    ed = (row.get("eventDate") or "")[:7]
                    dates[ed] += 1
                per_year[y] = {
                    "filas": n, "ebird": ebird, "pct_ebird": round(100 * ebird / n, 1),
                    "species_nulo_pct": round(100 * sp_null / n, 1),
                    "scientificName_nulo": sci_null,
                    "occurrenceID_duplicados": dup,
                    "basisOfRecord": dict(bor),
                    "datasets_distintos": len(ds),
                    "top_datasets": ds.most_common(4),
                    "meses_distintos": len(dates),
                    "columnas_presentes": [c for c, ok in cols.items() if ok],
                }
                ds_global.update(ds)
                bor_global.update(bor)
                print(f"[{y}] filas={n:,} ebird={100*ebird/n:.1f}% dup_oid={dup:,} "
                      f"sp_null={100*sp_null/n:.1f}%", flush=True)

    print("\n=== basisOfRecord global ===")
    for k, v in bor_global.most_common():
        print(f"  {k}: {v:,}")
    print("\n=== top datasets global ===")
    for k, v in ds_global.most_common(8):
        print(f"  {k}: {v:,}")
    print("\n=== JSON ===")
    print(json.dumps(per_year, indent=1))


if __name__ == "__main__":
    main()

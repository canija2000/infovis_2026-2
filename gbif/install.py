"""Instala los agregados GBIF en web/data/:
- reemplaza observations-*.json por los de staging
- actualiza metadata.json (observationFiles, fuente, DOIs, métrica)
- recalcula stats por región en regions.geojson (dias_especie, especies, meses)
"""
import json
import os
import shutil

BASE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(BASE, ".."))
STAGING = os.path.join(BASE, "staging")
DATA = os.path.join(REPO, "web", "data")

DOIS = {
    "2016": "10.15468/dl.kzmxav",
    "2017": "10.15468/dl.q4gkgp",
    "2018": "10.15468/dl.bbzdhf",
    "2019": "10.15468/dl.zd43an",
    "2020": "10.15468/dl.6g73xy",
    "2021": "10.15468/dl.ay45wx",
    "2022": "10.15468/dl.c8636y",
    "2023": "10.15468/dl.ha69dg",
    "2024": "10.15468/dl.mhq47r",
    "2025": "10.15468/dl.zduqq6",
    "2026": "10.15468/dl.ykt9z2",
}


def main():
    # 1. reemplazar observations
    for fn in os.listdir(DATA):
        if fn.startswith("observations-") and fn.endswith(".json"):
            os.remove(os.path.join(DATA, fn))
    files = sorted(f for f in os.listdir(STAGING)
                   if f.startswith("observations-") and f.endswith(".json"))
    for fn in files:
        shutil.copy(os.path.join(STAGING, fn), os.path.join(DATA, fn))
    print("instalados:", files)

    recs = []
    for fn in files:
        recs += json.load(open(os.path.join(DATA, fn), encoding="utf-8"))
    total_days = sum(r["reportDays"] for r in recs)
    yms = sorted({r["year_month"] for r in recs})

    # 2. metadata.json
    meta = {
        "updatedAt": __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc).isoformat(),
        "startDate": "2016-09-17",
        "endDate": "2026-09-25",
        "speciesDayCount": total_days,
        "regionCount": 16,
        "aggregation": "region-month-species",
        "metric": "reportDays",
        "metricDescription": (
            "Días del mes en que la especie se registró en la región "
            "(coordenadas dentro del polígono regional). No es un conteo de "
            "observaciones ni de individuos: múltiples registros de la misma "
            "especie el mismo día cuentan una vez."
        ),
        "source": "gbif-annual-downloads (Aves, Chile, con coordenadas, sin problemas geoespaciales)",
        "sourceDetail": (
            "11 descargas anuales GBIF (2016-2026), filtros: TaxonKey=Aves, "
            "Country=CL, HasCoordinate=true, HasGeospatialIssue=false, "
            "EventDate 2016-09-17 a 2026-09-25. Todos los datasets incluidos "
            "(eBird ~95% en 2016-2024; 2025-2026 sin datos eBird aún, solo "
            "iNaturalist y otros). Join espacial a 16 polígonos regionales."
        ),
        "dois": [f"https://doi.org/{d}" for d in DOIS.values()],
        "observationFiles": files,
    }
    json.dump(meta, open(os.path.join(DATA, "metadata.json"), "w",
                         encoding="utf-8"), indent=1, ensure_ascii=False)
    print("metadata.json OK, speciesDayCount =", f"{total_days:,}")

    # 3. stats por región en regions.geojson
    per_region = {}
    for r in recs:
        d = per_region.setdefault(r["region_code"],
                                  {"dias": 0, "sp": set(), "meses": set()})
        d["dias"] += r["reportDays"]
        d["sp"].add(r["sciName"])
        d["meses"].add(r["year_month"])
    gp = os.path.join(DATA, "regions.geojson")
    g = json.load(open(gp, encoding="utf-8"))
    for f in g["features"]:
        rc = f["properties"].get("region_code")
        if rc and rc in per_region:
            d = per_region[rc]
            f["properties"]["dias_especie"] = d["dias"]
            f["properties"]["especies"] = len(d["sp"])
            f["properties"]["meses"] = len(d["meses"])
    json.dump(g, open(gp, "w", encoding="utf-8"), ensure_ascii=False)
    print("regions.geojson stats OK")
    for rc in sorted(per_region):
        d = per_region[rc]
        print(f"  {rc}: {d['dias']:,} días-especie, {len(d['sp'])} especies, "
              f"{len(d['meses'])} meses")


if __name__ == "__main__":
    main()

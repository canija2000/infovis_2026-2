"""Validación punta a punta de la descarga de prueba GBIF (mayo 2024).

1. Carga el CSV, verifica nº de filas y columnas clave.
2. Join espacial de todos los registros a los polígonos regionales.
3. Compara especies por región el 2024-05-15 contra el caché eBird del Paso 0.
4. Desglose por dataset.
"""
import json
import pandas as pd
import shapely.geometry as geom
from shapely.strtree import STRtree
import numpy as np

BASE = "/home/hatch/workspace/infovis_2026-2"
CSV = f"{BASE}/gbif/downloads/0008171-260921141020460.csv"
CACHE = f"{BASE}/cache_ebird_regional"

print("cargando CSV...")
df = pd.read_csv(CSV, sep="\t", low_memory=False)
print(f"filas: {len(df):,}  columnas: {len(df.columns)}")
for c in ["gbifID", "datasetKey", "species", "scientificName", "eventDate",
          "year", "month", "day", "decimalLatitude", "decimalLongitude",
          "stateProvince", "individualCount", "basisOfRecord"]:
    print(f"  {c}: presente={c in df.columns} nulos={df[c].isna().sum() if c in df.columns else '-'}")

print("\ndatasets:")
print(df["datasetKey"].value_counts().to_string())

# --- join espacial ---
regs = json.load(open(f"{BASE}/web/data/regions.geojson"))
items, codes = [], []
for f in regs["features"]:
    rc = f["properties"].get("region_code")
    if rc:
        g = geom.shape(f["geometry"])
        items.append(g)
        codes.append(rc)
tree = STRtree(items)

lats = df["decimalLatitude"].to_numpy()
lons = df["decimalLongitude"].to_numpy()
pts = shapely_points = [geom.Point(x, y) for x, y in zip(lons, lats)]
idx = tree.query(shapely_points, predicate="within")
# idx[0] = índice del punto, idx[1] = índice del polígono en el árbol
region_of = {}
for pi, gi in zip(idx[0], idx[1]):
    if pi not in region_of:  # primer polígono que contiene
        region_of[pi] = codes[gi]
df["region_join"] = [region_of.get(i) for i in range(len(df))]
inside = df["region_join"].notna().sum()
print(f"\ndentro de polígonos: {inside:,} ({100*inside/len(df):.1f}%)")

# --- comparación 2024-05-15 vs Paso 0 ---
print("\neventDate únicos (muestra):", sorted(df["eventDate"].dropna().astype(str).str[:10].unique())[:5])
day = df[df["eventDate"].astype(str).str[:10] == "2024-05-15"].copy()
print(f"registros GBIF el 2024-05-15: {len(day):,}")

gbif_species = (day.dropna(subset=["region_join", "species"])
                   .groupby("region_join")["species"].apply(lambda s: set(s.unique())))
print(f"\nregiones con datos GBIF ese día: {len(gbif_species)}")

total_inter = total_ebird = total_gbif = 0
per_region = []
for region, gs in sorted(gbif_species.items()):
    p = f"{CACHE}/{region}/2024-05-15.json"
    try:
        eb = json.load(open(p))
    except FileNotFoundError:
        continue
    es = {r.get("sciName") or r.get("scientificName") for r in eb if isinstance(r, dict)}
    es = {s for s in es if s}
    inter = gs & es
    total_inter += len(inter)
    total_ebird += len(es)
    total_gbif += len(gs)
    per_region.append((region, len(es), len(gs), len(inter)))

print(f"{'región':8} {'eBird':>6} {'GBIF':>6} {'común':>6} {'cobertura':>9}")
for region, ne, ng, ni in per_region:
    print(f"{region:8} {ne:6} {ng:6} {ni:6} {100*ni/max(ne,1):8.1f}%")
print(f"\nTOTAL especies eBird: {total_ebird:,} | GBIF: {total_gbif:,} | en común: {total_inter:,}")
print(f"cobertura GBIF de especies eBird: {100*total_inter/max(total_ebird,1):.1f}%")

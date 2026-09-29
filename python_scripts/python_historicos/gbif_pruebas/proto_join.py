"""Prototipo: GBIF search API (Aves/CL, 2024-05) -> join espacial a regiones."""
import json, urllib.request
import shapely.geometry as geom

BASE = "https://api.gbif.org/v1/occurrence/search"

def fetch(limit, offset):
    url = (f"{BASE}?taxon_key=212&country=CL&year=2024&month=5"
           f"&hasCoordinate=true&limit={limit}&offset={offset}")
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.load(r)

# total
d0 = fetch(0, 0)
print("total registros 2024-05:", d0["count"])

# muestra
N = 1500
recs = []
off = 0
while len(recs) < N:
    d = fetch(min(300, N - len(recs)), off)
    if not d["results"]:
        break
    recs.extend(d["results"])
    off += len(d["results"])
print("muestra:", len(recs))

# polígonos
regs = json.load(open("/home/hatch/workspace/infovis_2026-2/web/data/regions.geojson"))
polys = []
for f in regs["features"]:
    rc = f["properties"].get("region_code")
    if rc:
        polys.append((rc, geom.shape(f["geometry"])))

inside = outside = nocoord = 0
fields = {"eventDate": 0, "scientificName": 0, "species": 0, "taxonKey": 0}
per_region = {}
for r in recs:
    lat, lon = r.get("decimalLatitude"), r.get("decimalLongitude")
    if lat is None or lon is None:
        nocoord += 1
        continue
    for k in fields:
        if r.get(k):
            fields[k] += 1
    p = geom.Point(lon, lat)
    hit = next((rc for rc, poly in polys if poly.contains(p)), None)
    if hit:
        inside += 1
        per_region[hit] = per_region.get(hit, 0) + 1
    else:
        outside += 1

print(f"dentro de alguna región: {inside} ({100*inside/len(recs):.1f}%)")
print(f"fuera de polígonos: {outside} ({100*outside/len(recs):.1f}%)")
print("campos presentes:", {k: f"{v/len(recs)*100:.0f}%" for k, v in fields.items()})
print("top regiones:", sorted(per_region.items(), key=lambda x: -x[1])[:5])

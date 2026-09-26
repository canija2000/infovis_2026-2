"""Completa nombres en español para especies GBIF sin cruce eBird.

Para cada nombre científico sin comName: GBIF species/match -> usageKey ->
vernacularNames, filtrando idioma español. Revisión manual posterior.
"""
import json
import os
import time
import urllib.parse
import urllib.request
from collections import Counter

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.abspath(os.path.join(BASE, "..", "web", "data"))


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "infovis-atlas-aves/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def spanish_name(sci):
    try:
        m = get("https://api.gbif.org/v1/species/match?name=" +
                urllib.parse.quote(sci) + "&rank=SPECIES")
    except Exception as e:
        return None, f"match-error: {e}"
    key = m.get("usageKey")
    if not key or m.get("matchType") == "NONE":
        return None, "sin match"
    time.sleep(0.2)
    try:
        vn = get(f"https://api.gbif.org/v1/species/{key}/vernacularNames?limit=100")
    except Exception as e:
        return None, f"vernacular-error: {e}"
    cands = [v for v in vn.get("results", [])
             if v.get("language") in ("spa", "es") and v.get("vernacularName")]
    if not cands:
        return None, "sin nombre es"
    # preferir el marcado como preferido, si no el primero
    pref = [c for c in cands if c.get("preferred")]
    chosen = (pref or cands)[0]
    return chosen["vernacularName"], chosen.get("source", "")


def main():
    recs = []
    for fn in ["observations-01.json", "observations-02.json"]:
        recs += json.load(open(os.path.join(DATA, fn), encoding="utf-8"))
    xwalk = json.load(open(os.path.join(BASE, "sci_to_comname.json"),
                           encoding="utf-8"))
    by_sci = Counter(r["sciName"] for r in recs)
    missing = sorted([s for s in by_sci if s not in xwalk],
                     key=lambda s: -by_sci[s])
    print(f"especies sin nombre ES: {len(missing)}")
    out, review = {}, []
    for i, sci in enumerate(missing, 1):
        name, src = spanish_name(sci)
        status = "OK" if name else f"FALLO ({src})"
        print(f"[{i}/{len(missing)}] {sci} -> {name or '-'} [{status}]", flush=True)
        if name:
            out[sci] = name
        else:
            review.append((sci, src, by_sci[sci]))
        time.sleep(0.3)
    json.dump(out, open(os.path.join(BASE, "vernacular_es_new.json"), "w",
                        encoding="utf-8"), indent=1, ensure_ascii=False)
    print(f"\nresueltos: {len(out)}, pendientes manual: {len(review)}")
    for sci, src, d in sorted(review, key=lambda t: -t[2])[:20]:
        print(f"  PENDIENTE {sci} ({d:,} días) [{src}]")


if __name__ == "__main__":
    main()

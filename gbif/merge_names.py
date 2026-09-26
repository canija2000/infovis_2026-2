"""Fusiona las tres fuentes de nombres ES en sci_to_comname.json:
1. mapa eBird original (565)
2. vernacular_es_new.json (55, vía GBIF, normalizados)
3. mapa manual verificado (24)
Luego parchea web/data rellenando comName vacíos.
"""
import json
import os
import re

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.abspath(os.path.join(BASE, "..", "web", "data"))

MANUAL = {
    "Buteo polyosoma": "Aguilucho",
    "Xolmis pyrope": "Diucón",
    "Sturnella loyca": "Loica",
    "Notiochelidon cyanoleuca": "Golondrina de dorso negro",
    "Phalacrocorax gaimardi": "Lile",
    "Gallinula melanops": "Gallineta pintada",
    "Asthenes humicola": "Canastero chileno",
    "Chilia melanura": "Chilia",
    "Upucerthia ruficaudus": "Bandurrilla de pico recto",
    "Phalacrocorax magellanicus": "Cormorán magallánico",
    "Haplochelidon andecola": "Golondrina andina",
    "Eremobius phoenicurus": "Bandurrita patagona",
    "Porzana spiloptera": "Polluela overa",
    "Agriornis andicola": "Gaucho andino",
    "Aratinga erythrogenys": "Loro máscara roja",
    "Polioxolmis rufipennis": "Birro alirrufo",
    "Leucocarbo albiventer": "Cormorán imperial",
    "Sturnella superciliaris": "Loica cejiblanca",
    "Aratinga acuticaudata": "Calancate común",
    "Aratinga mitrata": "Calancate cara roja",
    "Upucerthia jelskii": "Bandurrilla de Jelski",
    "Xolmis coronatus": "Monjita coronada",
    "Accipiter chilensis": "Peuquito",
    "Buteo poecilochrous": "Aguilucho de la puna",
}


def clean(name):
    name = name.strip().strip('"').strip()
    # quitar paréntesis con nombres alternativos: "X (Y) Z" -> "X Z"
    name = re.sub(r"\s*\([^)]*\)", "", name).strip()
    # si viene "A, B" quedarse con el primero
    name = name.split(",")[0].strip()
    return re.sub(r"\s+", " ", name)


def main():
    xwalk = json.load(open(os.path.join(BASE, "sci_to_comname.json"),
                           encoding="utf-8"))
    print("base eBird:", len(xwalk))
    new = json.load(open(os.path.join(BASE, "vernacular_es_new.json"),
                         encoding="utf-8"))
    for sci, name in new.items():
        if sci not in xwalk:
            xwalk[sci] = clean(name)
    print("+ GBIF vernacular:", len(new))
    for sci, name in MANUAL.items():
        xwalk[sci] = name
    print("+ manual:", len(MANUAL), "-> total:", len(xwalk))
    json.dump(xwalk, open(os.path.join(BASE, "sci_to_comname.json"), "w",
                          encoding="utf-8"), indent=1, ensure_ascii=False)

    # parchear web/data
    n_fill = n_tot = 0
    for fn in ["observations-01.json", "observations-02.json"]:
        p = os.path.join(DATA, fn)
        recs = json.load(open(p, encoding="utf-8"))
        for r in recs:
            n_tot += 1
            if not r.get("comName") and r["sciName"] in xwalk:
                r["comName"] = xwalk[r["sciName"]]
                n_fill += 1
        json.dump(recs, open(p, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"web/data: {n_fill:,} comName rellenados de {n_tot:,}")
    sin = sum(1 for fn in ["observations-01.json", "observations-02.json"]
              for r in json.load(open(os.path.join(DATA, fn), encoding="utf-8"))
              if not r.get("comName"))
    print("registros aún sin nombre ES:", sin)


if __name__ == "__main__":
    main()

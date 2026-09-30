"""Paso 2: morfología y hábitat de las especies (AVONET + EltonTraits).

Uso:
    python3 python_scripts/enrich/join_traits.py            # las 551 de index.json
    python3 python_scripts/enrich/join_traits.py --mvp

Datos (en cache/, gitignored; ver README en CAMBIOS.md):
  - AVONET, Tobias et al. 2022, Ecology Letters, CC BY 4.0, doi 10.6084/m9.figshare.16586228
    cache/avonet/AVONET2_eBird.xlsx (hoja eBird, preferida) y AVONET3_BirdTree.xlsx (respaldo).
  - EltonTraits 1.0, Wilman et al. 2014, CC0, doi 10.6084/m9.figshare.3559887
    cache/elton/BirdFuncDat.txt (taxonomía BirdLife/BirdTree).

Cruce por sciName probando, en orden: el nombre, enrich/synonyms.json (manual), el nombre de
Xeno-canto en gbif/synonyms_xc.json y los sinónimos de GBIF (API species, en caché).

Salidas (web/data/game/enrich/):
  morphology.json   valores crudos (mm, g), proporciones para el mesh, escala, dieta y estratos
  habitat.json      hábitat AVONET + biomas del juego (tabla editable habitat_map.json)
  unmatched.csv     especies sin morfología (resolver agregando a synonyms.json)
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from functools import lru_cache

import common as c

MASS_REF_SPECIES = "Scelorchilus rubecula"  # chucao: el prototipo actual queda en escala 1
MORPH_COLS = {
    "beakCulmen": "Beak.Length_Culmen", "beakNares": "Beak.Length_Nares", "beakWidth": "Beak.Width",
    "beakDepth": "Beak.Depth", "tarsus": "Tarsus.Length", "wing": "Wing.Length", "kipps": "Kipps.Distance",
    "secondary": "Secondary1", "hwi": "Hand-Wing.Index", "tail": "Tail.Length", "mass": "Mass",
}
DIET = {"PlantSeed": "semillas", "FruiNect": "fruta/néctar", "Invertebrate": "invertebrados",
        "VertFishScav": "vertebrados/peces/carroña", "Omnivore": "omnívoro"}
MIGRATION = {"1": "sedentaria", "2": "migrante parcial", "3": "migrante"}

# Mapeo por defecto AVONET Habitat → biomas del juego (el primero es el principal).
# Se escribe a enrich/habitat_map.json solo si no existe, para poder editarlo a mano.
DEFAULT_HABITAT_MAP = {
    "Forest": ["bosque"],
    "Woodland": ["bosque", "matorral", "valle"],
    "Shrubland": ["matorral", "valle"],
    "Savanna": ["valle", "pradera"],
    "Grassland": ["pradera", "estepa", "altiplano"],
    "Desert": ["desierto", "altiplano"],
    "Rock": ["cordillera", "altiplano", "costa"],
    "Wetland": ["humedal", "lago", "rio"],
    "Riverine": ["rio", "humedal", "lago"],
    "Coastal": ["costa", "fiordo", "humedal"],
    "Marine": ["costa", "fiordo"],
    "Human Modified": ["ciudad", "valle", "pradera"],
}
# Bioma de la escena RM para las especies del MVP (revisado a mano, handoff §0).
MVP_RM = {
    "Turdus falcklandii": "ciudad", "Zonotrichia capensis": "ciudad", "Troglodytes musculus": "ciudad",
    "Zenaida auriculata": "ciudad", "Pteroptochos megapodius": "matorral", "Mimus thenca": "matorral",
    "Scelorchilus albicollis": "matorral", "Diuca diuca": "matorral", "Vanellus chilensis": "rio",
    "Sturnella loyca": "rio", "Oreotrochilus leucopleurus": "cordillera", "Muscisaxicola frontalis": "cordillera",
}


def num(v) -> float | None:
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if x == x else None  # NaN → None


def rnd(x: float | None, n: int = 3) -> float | None:
    return None if x is None else round(x, n)


def canonical(name: str) -> str:
    return " ".join(name.split()[:2])


@lru_cache(maxsize=None)
def gbif_names(sci: str) -> tuple[str, ...]:
    """Nombre aceptado y sinónimos según el backbone de GBIF (binomios)."""
    m = c.fetch_json("https://api.gbif.org/v1/species/match", {"name": sci, "class": "Aves", "strict": "true"})
    if m.get("matchType") in (None, "NONE"):
        return ()
    names = {canonical(m.get("species") or m.get("canonicalName", ""))}
    key = m.get("acceptedUsageKey") or m.get("usageKey")
    syn = c.fetch_json(f"https://api.gbif.org/v1/species/{key}/synonyms", {"limit": 100})
    names |= {canonical(s["canonicalName"]) for s in syn.get("results", []) if s.get("canonicalName")}
    names.discard(sci)
    names.discard("")
    return tuple(sorted(n for n in names if len(n.split()) == 2))


def candidates(sci: str, manual: dict, xc: dict) -> list[str]:
    out = [sci]
    if sci in manual:
        out += manual[sci] if isinstance(manual[sci], list) else [manual[sci]]
    if sci in xc:
        out.append(xc[sci]["xc"])
    return list(dict.fromkeys(out))


def lookup(sci: str, table: dict, manual: dict, xc: dict) -> tuple[str | None, dict | None]:
    for name in candidates(sci, manual, xc):
        if name in table:
            return name, table[name]
    for name in gbif_names(sci):
        if name in table:
            return name, table[name]
    return None, None


def load_avonet() -> tuple[dict, dict]:
    ebird = {r["Species2"]: r for r in c.read_xlsx(c.CACHE_DIR / "avonet" / "AVONET2_eBird.xlsx", "AVONET2_eBird")}
    tree = {r["Species3"]: r for r in c.read_xlsx(c.CACHE_DIR / "avonet" / "AVONET3_BirdTree.xlsx", "AVONET3_BirdTree")}
    return ebird, tree


def load_elton() -> dict:
    path = c.CACHE_DIR / "elton" / "BirdFuncDat.txt"
    with path.open(encoding="latin-1") as f:
        return {r["Scientific"]: r for r in csv.DictReader(f, delimiter="\t") if r.get("Scientific")}


def morphology(row: dict, elton: dict | None, mass_ref: float, src: str) -> dict:
    raw = {k: rnd(num(row[col]), 1) for k, col in MORPH_COLS.items()}
    wing, culmen = raw["wing"], raw["beakCulmen"]

    def ratio(a, b):
        return rnd(a / b) if a is not None and b else None

    out = {
        "raw": raw,
        "prop": {
            "beak": ratio(culmen, wing),
            "beakDepth": ratio(raw["beakDepth"], culmen),
            "beakWidth": ratio(raw["beakWidth"], culmen),
            "tarsus": ratio(raw["tarsus"], wing),
            "tail": ratio(raw["tail"], wing),
            "hwi": rnd(raw["hwi"] / 100) if raw["hwi"] is not None else None,
        },
        "scale": rnd((raw["mass"] / mass_ref) ** (1 / 3)) if raw["mass"] else None,
        "lifestyle": row.get("Primary.Lifestyle"),
        "trophicNiche": row.get("Trophic.Niche"),
        "migration": MIGRATION.get((row.get("Migration") or "").split(".")[0]),
        "diet": None,
        "stratum": None,
        "source": src,
    }
    if elton:
        out["diet"] = DIET.get(elton["Diet-5Cat"], elton["Diet-5Cat"])
        g = lambda k: int(num(elton[f"ForStrat-{k}"]) or 0)
        out["stratum"] = {
            "ground": g("ground"), "understory": g("understory"), "midhigh": g("midhigh"),
            "canopy": g("canopy"), "aerial": g("aerial"), "water": g("watbelowsurf") + g("wataroundsurf"),
        }
        out["source"] += " + EltonTraits"
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    c.species_args(ap)
    args = ap.parse_args()
    index = c.load_index()
    species = c.selected_species(args, index)
    names = {s["sciName"]: s["comName"] for s in index["species"]}

    manual_path = c.ENRICH_DIR / "synonyms.json"
    manual = json.loads(manual_path.read_text(encoding="utf-8")) if manual_path.exists() else {}
    lumped = set(manual.get("_lump", []))
    manual = {k: v for k, v in manual.items() if not k.startswith("_")}
    xc = json.loads((c.ROOT / "gbif" / "synonyms_xc.json").read_text(encoding="utf-8"))["synonyms"]
    hmap_path = c.ENRICH_DIR / "habitat_map.json"
    if not hmap_path.exists():
        c.write_json(hmap_path, DEFAULT_HABITAT_MAP)
    hmap = json.loads(hmap_path.read_text(encoding="utf-8"))

    ebird, tree = load_avonet()
    elton = load_elton()
    mass_ref = num(ebird[MASS_REF_SPECIES]["Mass"])

    morph_path, hab_path = c.ENRICH_DIR / "morphology.json", c.ENRICH_DIR / "habitat.json"
    morph = json.loads(morph_path.read_text(encoding="utf-8")) if morph_path.exists() else {}
    hab = json.loads(hab_path.read_text(encoding="utf-8")) if hab_path.exists() else {}
    unmatched = []
    for sci in species:
        name, row = lookup(sci, ebird, manual, xc)
        src = "AVONET eBird"
        if row is None:
            name, row = lookup(sci, tree, manual, xc)
            src = "AVONET BirdTree"
        if row is None:
            unmatched.append((sci, names.get(sci, ""), "avonet"))
            morph.pop(sci, None)
            hab.pop(sci, None)
            continue
        if name != sci:
            src += f" ({name}{', aprox. especie madre' if sci in lumped else ''})"
        # Elton usa taxonomía BirdLife ~2014: probar también el nombre con que calzó AVONET.
        ename, erow = lookup(sci, elton, manual, xc)
        if erow is None and name in elton:
            erow = elton[name]
        if erow is None:
            unmatched.append((sci, names.get(sci, ""), "elton"))
        elif ename and ename != sci and ename != name:
            src += f" / Elton ({ename})"
        morph[sci] = morphology(row, erow, mass_ref, src)
        habitat = row.get("Habitat") if row.get("Habitat") not in (None, "", "NA") else None
        hab[sci] = {
            "avonet": habitat,
            "density": {"1": "denso", "2": "semiabierto", "3": "abierto"}.get((row.get("Habitat.Density") or "")[:1]),
            "biomes": hmap.get(habitat, []),
            "rm": MVP_RM.get(sci),
            "source": "AVONET" + (" + revisión manual (RM)" if sci in MVP_RM else ""),
        }

    c.write_json(morph_path, morph)
    c.write_json(hab_path, hab)
    with (c.ENRICH_DIR / "unmatched.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["sciName", "comName", "falta"])
        w.writerows(sorted(unmatched))
    n_av = sum(1 for u in unmatched if u[2] == "avonet")
    n_el = sum(1 for u in unmatched if u[2] == "elton")
    print(f"especies: {len(species)} · AVONET: {len(species) - n_av} ({(len(species) - n_av) / len(species):.1%})"
          f" · sin Elton: {n_el} · massRef ({MASS_REF_SPECIES}) = {mass_ref} g")


if __name__ == "__main__":
    main()

"""Genera los datos del mundo 3D exploratorio (demo "point & click" por región).

Uso:
    python3 python_scripts/build_game_data.py

Reutiliza la lectura, el año típico y la clasificación de build_web_data.py
(misma metodología, docs/metodologia-datos.md §10) y agrega lo que el juego
necesita: elencos de aves por región × mes (año típico y cada año 2017–2024),
estadísticas por especie corregidas por esfuerzo y resúmenes por región.

Salida (web/data/game/, se publica junto con la web en GitHub Pages):
    index.json              meta, especies (fichas) y resumen de cada región
    region-<CODE>.json      elenco por mes del año típico y de cada año (carga
                            diferida, al entrar al "portal" de la región)

Notas de método:
- Solo años completos con eBird en GBIF (2017–2024), igual que la web.
- "share" = reportDays / días-especie totales de la región-mes-año (‰). Es la
  participación de la especie en lo que se registra ahí: corrige el aumento
  de esfuerzo entre años y las diferencias de esfuerzo entre regiones. Todas
  las comparaciones entre años o regiones ("mi mejor año", "mi región
  preferida") usan share, nunca reportDays crudos.
- "lift" = share regional / share nacional (año típico): > 1 indica que la
  especie es más característica de esa región que del país.

Solo usa la biblioteca estándar. La salida es determinista.
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import build_web_data as web

OUT_DIR = web.DATA_DIR / "game"
ENRICH_DIR = OUT_DIR / "enrich"  # datos laterales de python_scripts/enrich/ (no los sobrescribe este build)
YEARS = web.YEARS
CLASSES = web.CLASSES
OCASIONAL = CLASSES.index("ocasional")

TYPICAL_CAST = 40  # especies regulares por región-mes (año típico), por frecuencia
TYPICAL_RARE = 6  # especies ocasionales por región-mes ("encuentros raros")
YEAR_CAST = 30  # especies por región-mes en cada año, por share

MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
          "septiembre", "octubre", "noviembre", "diciembre"]
# Hemisferio sur: estación de cada mes (0 = enero).
SEASONS = ["verano", "verano", "otoño", "otoño", "otoño", "invierno", "invierno", "invierno",
           "primavera", "primavera", "primavera", "verano"]

# Propuesta de escenarios por región para componer las escenas. NO se deriva
# de los datos: es un punto de partida para el diseño, a revisar.
BIOMES = {
    "CL-AP": ["costa", "desierto", "valle", "altiplano"],
    "CL-TA": ["costa", "desierto", "altiplano"],
    "CL-AN": ["costa", "desierto", "altiplano"],
    "CL-AT": ["costa", "desierto", "valle", "altiplano"],
    "CL-CO": ["costa", "matorral", "valle", "humedal"],
    "CL-VS": ["costa", "matorral", "humedal", "ciudad"],
    "CL-RM": ["ciudad", "matorral", "rio", "cordillera"],
    "CL-LI": ["valle", "matorral", "humedal", "costa"],
    "CL-ML": ["costa", "valle", "bosque", "cordillera"],
    "CL-NB": ["valle", "bosque", "costa"],
    "CL-BI": ["costa", "bosque", "humedal", "ciudad"],
    "CL-AR": ["bosque", "lago", "pradera", "cordillera"],
    "CL-LR": ["bosque", "humedal", "costa"],
    "CL-LL": ["bosque", "lago", "costa"],
    "CL-AI": ["bosque", "fiordo", "estepa", "lago"],
    "CL-MA": ["estepa", "bosque", "costa", "fiordo"],
}


def gbif_images_url(sci: str) -> str:
    """Búsqueda de fotos de ocurrencias en Chile (API GBIF; revisar licencia por imagen)."""
    return ("https://api.gbif.org/v1/occurrence/search?mediaType=StillImage&country=CL&limit=20&scientificName="
            + sci.replace(" ", "%20"))


# Citas de las fuentes de enriquecimiento (se agregan a "dois" si existe enrich/).
ENRICH_DOIS = [
    "https://doi.org/10.1111/ele.13898",  # AVONET, Tobias et al. 2022 (CC BY 4.0)
    "https://doi.org/10.6084/m9.figshare.16586228",
    "https://doi.org/10.1890/13-1917.1",  # EltonTraits 1.0, Wilman et al. 2014 (CC0)
    "https://doi.org/10.5281/zenodo.7254221",  # ESA WorldCover 10 m 2021 v200 (CC BY 4.0)
]


def load_enrich() -> dict[str, dict]:
    """Lee web/data/game/enrich/<campo>.json (indexados por sciName) si existen."""
    out = {}
    for field in ("images", "morphology", "habitat", "palette"):
        path = ENRICH_DIR / f"{field}.json"
        out[field] = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    return out


def compact_morphology(m: dict | None) -> dict | None:
    """Solo lo que usa el juego; medidas crudas en enrich/morphology.json."""
    if not m:
        return None
    p = m["prop"]
    st = m.get("stratum")
    return {
        "family": m.get("family"),
        "prop": [None if p[k] is None else round(p[k], 2) for k in ("beak", "beakDepth", "tarsus", "tail", "hwi")],
        "scale": m["scale"],
        "mass": m["raw"]["mass"],
        "lifestyle": m.get("lifestyle"),
        "diet": m.get("diet"),
        "stratum": [st[k] for k in ("ground", "understory", "midhigh", "canopy", "aerial", "water")] if st else None,
    }


def compact_habitat(h: dict | None) -> dict | None:
    if not h:
        return None
    out = {"avonet": h.get("avonet"), "biomes": h.get("biomes", [])}
    if h.get("rm"):
        out["rm"] = h["rm"]
    return out


def compact_palette(p: dict | None) -> dict | None:
    if not p:
        return None
    return {k: v for k, v in p.items() if k not in ("photos", "manual", "annotation", "edited")}


def per_year(rows: list[dict], regions: list[dict]):
    """reportDays y esfuerzo por (especie, región, año, mes); región 0 = Chile."""
    rid = {r["code"]: r["id"] for r in regions}
    report = defaultdict(float)
    effort = defaultdict(float)
    for row in rows:
        year, month = int(row["year_month"][:4]), int(row["year_month"][5:7]) - 1
        if year not in YEARS or row["region_code"] not in rid:
            continue
        sci = web.GBIF_ALIASES.get(row["sciName"], row["sciName"])
        value = float(row["reportDays"])
        for scope in (rid[row["region_code"]], 0):
            report[(sci, scope, year, month)] += value
            effort[(scope, year, month)] += value
    return report, effort


def main() -> None:
    regions, _ = web.build_regions()
    rows = web.load_observations()
    names, totals, species_ids, table, presence, _, effort_mean = web.build_typical_year(rows, regions)
    sounds = web.build_sounds(names, species_ids)
    report, effort = per_year(rows, regions)
    sci_of = {sid: sci for sci, sid in species_ids.items()}
    enrich = load_enrich()
    featured_path = ENRICH_DIR / "featured.json"
    featured = {k: v for k, v in json.loads(featured_path.read_text(encoding="utf-8")).items() if not k.startswith("_")} \
        if featured_path.exists() else {}
    n_regions = len(regions)
    n_years = len(YEARS)

    # --- share por especie × región × año × mes (‰) --------------------------
    share = {k: v / effort[(k[1], k[2], k[3])] * 1000 for k, v in report.items()}
    # Año típico: media de share sobre los 8 años (un año sin registro cuenta 0).
    typical_share = defaultdict(lambda: [0.0] * 12)  # (sid, scope) → 12 meses
    # Share anual: días-especie del año / esfuerzo del año.
    year_days = defaultdict(float)  # (sid, scope, y)
    year_effort = defaultdict(float)  # (scope, y)
    for (sci, scope, y, m), v in share.items():
        typical_share[(species_ids[sci], scope)][m] += v / n_years
    for (sci, scope, y, m), v in report.items():
        year_days[(species_ids[sci], scope, y)] += v
    for (scope, y, m), v in effort.items():
        year_effort[(scope, y)] += v

    by_scope = {(r["sid"], r["rid"]): r for r in table}
    by_cell = defaultdict(list)  # (región, año, mes) → [(especie, reportDays)]
    for (sci, scope, y, m), v in report.items():
        by_cell[(scope, y, m)].append((sci, v))

    # --- fichas de especie ----------------------------------------------------
    recordings = {s["sid"]: s["recordings"] for s in sounds["species"]}
    species = []
    for sid in sorted(sci_of):
        sci = sci_of[sid]
        nat = by_scope[(sid, 0)]
        yearly = [year_days[(sid, 0, y)] / year_effort[(0, y)] * 1000 if year_effort[(0, y)] else 0.0 for y in YEARS]
        mean_year = sum(yearly) / n_years
        best_year = YEARS[max(range(n_years), key=lambda i: (yearly[i], -i))]
        reg_mean = {
            r: sum(typical_share[(sid, r)]) / 12
            for r in range(1, n_regions + 1)
            if (sid, r) in by_scope
        }
        top_regions = sorted(reg_mean, key=lambda r: (-reg_mean[r], r))[:3]
        regional_class = {
            str(r): CLASSES[by_scope[(sid, r)]["cls"]]
            for r in range(1, n_regions + 1)
            if (sid, r) in by_scope and by_scope[(sid, r)]["cls"] != OCASIONAL
        }
        recs = recordings.get(sid, [])
        clip = None
        if recs:
            c = recs[0]
            clip = {k: c[k] for k in ("src", "grain", "url", "recordist", "license", "type", "country")}
        species.append(
            {
                "id": sid,
                "sciName": sci,
                "comName": names[sci],
                "class": CLASSES[nat["cls"]],
                "regionalClass": regional_class,
                "peakMonth": nat["peak"],
                "phase": nat["phase"],
                "seasonality": nat["amp"],
                "monthsPresent": nat["present"],
                "profile": nat["prof"],
                "yearIndex": [round(v / mean_year * 100) if mean_year else 0 for v in yearly],
                "bestYear": best_year,
                "topRegions": top_regions,
                "regionsPresent": len(regional_class),
                "reportDays": round(totals[sci]),
                "clip": clip,
                "habitat": compact_habitat(enrich["habitat"].get(sci)),
                "morphology": compact_morphology(enrich["morphology"].get(sci)),
                # paleta y fotos de referencia van en region-<CODE>.json → "featured" (solo especies destacadas)
                "palette": None,
                "images": gbif_images_url(sci),
            }
        )

    # --- regiones -------------------------------------------------------------
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    region_index = []
    sizes = {}
    for region in regions:
        r, code = region["id"], region["code"]
        rows_r = [row for row in table if row["rid"] == r]
        nat_typ = {sid: typical_share[(sid, 0)] for sid in sci_of}

        typical_months = []
        for m in range(12):
            regular, rare = [], []
            for row in rows_r:
                if row["years"][m] == 0:
                    continue
                sid = row["sid"]
                s_reg = typical_share[(sid, r)][m]
                s_nat = nat_typ[sid][m]
                entry = [
                    sid,
                    row["cls"],
                    row["freq"][m],
                    round(s_reg, 2),
                    round(s_reg / s_nat, 2) if s_nat else 0,
                    row["prof"][m],
                    row["years"][m],
                ]
                if row["cls"] == OCASIONAL:
                    rare.append(entry)
                elif row["present"] >> m & 1:
                    regular.append(entry)
            regular.sort(key=lambda e: (-e[2], e[0]))
            rare.sort(key=lambda e: (-e[2], e[0]))
            typical_months.append(regular[:TYPICAL_CAST] + rare[:TYPICAL_RARE])

        years = {}
        for y in YEARS:
            months = []
            for m in range(12):
                cast = [
                    [species_ids[sci], round(v), round(share[(sci, r, y, m)], 2)]
                    for sci, v in by_cell.get((r, y, m), [])
                ]
                cast.sort(key=lambda e: (-e[1], e[0]))
                richness = len(cast)
                months.append({"richness": richness, "effort": round(effort[(r, y, m)]), "cast": cast[:YEAR_CAST]})
            years[str(y)] = months

        payload = {
            "region": {k: region[k] for k in ("id", "code", "name", "fullName", "lat", "lon")},
            "castColumns": {
                "typical": ["sid", "cls", "freq‰", "share‰", "lift", "prof", "years"],
                "year": ["sid", "reportDays", "share‰"],
            },
            "typical": typical_months,
            "years": years,
            # Especies destacadas del mundo 3D en esta región: escena, paleta y fotos de referencia
            # (enrich/featured.json + palette.json + images.json). Se cargan solo al entrar a la región.
            "featured": {
                str(species_ids[sci]): {
                    "scene": scene,
                    "palette": compact_palette(enrich["palette"].get(sci)),
                    "images": (enrich["images"].get(sci) or [])[:3],
                }
                for sci, scene in sorted(featured.get(code, {}).items()) if sci in species_ids
            },
        }
        path = OUT_DIR / f"region-{code}.json"
        path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        sizes[path.name] = path.stat().st_size

        # Resumen para el cartel de bienvenida.
        regular_rows = [row for row in rows_r if row["cls"] != OCASIONAL]

        def top(cls_name: str, n: int = 5) -> list[int]:
            ci = CLASSES.index(cls_name)
            sel = [row for row in regular_rows if row["cls"] == ci]
            sel.sort(key=lambda row: (-sum(row["freq"]), row["sid"]))
            return [row["sid"] for row in sel[:n]]

        lifts = []
        for row in regular_rows:
            s_reg = sum(typical_share[(row["sid"], r)]) / 12
            s_nat = sum(nat_typ[row["sid"]]) / 12
            if s_reg >= 1 and s_nat:  # al menos 1‰ de lo registrado en la región
                lifts.append((s_reg / s_nat, row["sid"]))
        lifts.sort(key=lambda t: (-t[0], t[1]))
        months_summary = [
            {
                "richness": presence[r][m][0] + presence[r][m][1] + presence[r][m][2],
                "residente": presence[r][m][0],
                "visitante_estival": presence[r][m][1],
                "visitante_invernal": presence[r][m][2],
                "effort": effort_mean[r][m],
            }
            for m in range(12)
        ]
        region_index.append(
            {
                **{k: region[k] for k in ("id", "code", "name", "fullName", "lat", "lon")},
                "file": f"region-{code}.json",
                "biomes": BIOMES.get(code, []),
                **({"terrainFile": f"terrain-{code}.json"} if (OUT_DIR / f"terrain-{code}.json").exists() else {}),
                "topResidents": top("residente"),
                "topSummer": top("visitante_estival"),
                "topWinter": top("visitante_invernal"),
                "characteristic": [sid for _, sid in lifts[:8]],
                "months": months_summary,
                "yearRichness": {str(y): max(m["richness"] for m in years[str(y)]) for y in YEARS},
            }
        )

    source_meta = json.loads((web.DATA_DIR / "metadata.json").read_text(encoding="utf-8"))
    index = {
        "title": "Aves de Chile — mundo explorable",
        "years": YEARS,
        "defaultYear": "typical",
        "classes": CLASSES,
        "classColors": {"residente": "#288665", "visitante_estival": "#ee9b45", "visitante_invernal": "#4a7fd0", "ocasional": "#9a9aa6"},
        "months": MONTHS,
        "seasons": SEASONS,
        "notes": {
            "share": "‰ de los días-especie registrados en la región-mes-año: corrige esfuerzo. Usar para comparar años y regiones.",
            "freq": "‰ de días del mes con registro, media 2017–2024 (año típico).",
            "lift": "share regional / share nacional (año típico); > 1 = más característica de la región.",
            "prof": "perfil estacional corregido, 100 = mes pico.",
            "yearIndex": "share nacional de cada año / media de los 8 años × 100 (100 = año promedio).",
            "topRegions": "ids de región con mayor share medio en el año típico.",
            "monthsPresent": "bitmask de meses con presencia nacional (bit 0 = enero).",
            "biomes": "propuesta manual de escenarios, no derivada de datos.",
            "habitat": "AVONET Habitat + biomas del juego (enrich/habitat_map.json); rm = bioma de la escena RM, revisado a mano.",
            "morphology": "prop = [pico/ala, alto pico/pico, tarso/ala, cola/ala, HWI/100]; scale = cbrt(masa/masa chucao); "
                          "mass en g; stratum = % forrajeo [suelo, sotobosque, medio, dosel, aire, agua] (EltonTraits). "
                          "Medidas crudas en enrich/morphology.json.",
            "palette": "null aquí: la paleta (RGB 5 bits por zona, pattern por zona) de las especies destacadas va en region-<CODE>.json → featured.",
            "images": "URL de búsqueda GBIF; las fotos de referencia con licencia de las destacadas van en region-<CODE>.json → featured.",
            "featured": "region-<CODE>.json → featured = {sid: {scene, palette, images}}: especies destacadas del mundo 3D en esa región.",
            "terrainFile": "mini-escenas de la región (relieve, cobertura, ríos); ver terrain-<CODE>.json.",
            "audio": "rutas relativas a web/ (p. ej. audio/XC123.mp3); licencias por grabación en clip.license.",
        },
        "regions": region_index,
        "species": species,
        "source": source_meta.get("sourceDetail") + (
            " Enriquecimiento: AVONET (Tobias et al. 2022), EltonTraits 1.0 (Wilman et al. 2014), fotos de referencia de "
            "iNaturalist/Wikimedia Commons (licencia por foto), ESA WorldCover 2021, AWS Terrain Tiles y © OpenStreetMap."
            if ENRICH_DIR.exists() else ""),
        "dois": source_meta.get("dois", []) + (ENRICH_DOIS if ENRICH_DIR.exists() else []),
    }
    path = OUT_DIR / "index.json"
    path.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    sizes[path.name] = path.stat().st_size

    for name, size in sorted(sizes.items()):
        print(f"{name:24s} {size / 1024:8.1f} KB")
    print(f"{'total':24s} {sum(sizes.values()) / 1024:8.1f} KB")


if __name__ == "__main__":
    main()

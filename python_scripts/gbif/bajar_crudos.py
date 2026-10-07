"""Baja los datos crudos de GBIF exactamente como se usaron en el proyecto (sin credenciales).

Las 11 descargas anuales (2016–2026) ya están publicadas en GBIF con DOI
(web/data/metadata.json). Este script resuelve cada DOI a su descarga, baja el
zip a gbif/downloads/<año>.zip, revisa que esté completo y anota tamaño, nº de
registros y SHA-256 en gbif/descargas.json (versionado), para que todo el equipo
trabaje con los mismos bytes.

No confundir con gbif_downloads.py / run_pipeline.py: esos *piden descargas
nuevas* a GBIF (requieren GBIF_USER / GBIF_PWD) y darían datos distintos.

Contenido de cada zip: un CSV separado por tabuladores (formato SIMPLE_CSV de
GBIF, 50 columnas: species, decimalLatitude, decimalLongitude, eventDate,
datasetKey, …). Filtros: Aves, país = Chile, con coordenadas y sin problemas
geoespaciales, eventDate entre 2016-09-17 y 2026-09-25. ~6,6 M registros,
~810 MB comprimidos.

Uso (desde la raíz del repo):
    python3 python_scripts/gbif/bajar_crudos.py            # baja lo que falte y verifica
    python3 python_scripts/gbif/bajar_crudos.py --verify   # solo verifica lo que hay
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DL = ROOT / "gbif" / "downloads"
MANIFEST = ROOT / "gbif" / "descargas.json"
METADATA = ROOT / "web" / "data" / "metadata.json"
API = "https://api.gbif.org/v1/occurrence/download/"


def get_json(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.load(r)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def year_of(info: dict) -> int:
    """Año de la descarga, leído de su filtro (predicado YEAR)."""
    def walk(p):
        if p.get("key") == "YEAR":
            return int(p["value"])
        for q in p.get("predicates", []) or []:
            y = walk(q)
            if y:
                return y
        return None
    return walk(info["request"]["predicate"])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify", action="store_true", help="no bajar; solo verificar contra gbif/descargas.json")
    args = ap.parse_args()

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    if not manifest:
        dois = json.loads(METADATA.read_text(encoding="utf-8"))["dois"]
        for doi in dois:
            info = get_json(API + doi.replace("https://doi.org/", ""))
            year = year_of(info)
            manifest[str(year)] = {
                "doi": doi, "key": info["key"], "records": info["totalRecords"],
                "bytes": info["size"], "url": info["downloadLink"], "sha256": None,
            }
        manifest = dict(sorted(manifest.items()))

    DL.mkdir(parents=True, exist_ok=True)
    ok = True
    for year, entry in manifest.items():
        path = DL / f"{year}.zip"
        if not path.exists() or path.stat().st_size != entry["bytes"]:
            if args.verify:
                print(f"{year}: falta o está incompleto ({path.relative_to(ROOT)})")
                ok = False
                continue
            print(f"{year}: bajando {entry['bytes'] / 1e6:.0f} MB …", flush=True)
            tmp = path.with_suffix(".part")
            urllib.request.urlretrieve(entry["url"], tmp)
            tmp.replace(path)
        if path.stat().st_size != entry["bytes"]:
            print(f"{year}: tamaño distinto al publicado ({path.stat().st_size} ≠ {entry['bytes']})")
            ok = False
            continue
        with zipfile.ZipFile(path) as z:
            bad = z.testzip()
        if bad:
            print(f"{year}: zip dañado ({bad})")
            ok = False
            continue
        digest = sha256(path)
        if entry["sha256"] and entry["sha256"] != digest:
            print(f"{year}: SHA-256 distinto al registrado")
            ok = False
            continue
        entry["sha256"] = digest
        print(f"{year}: ok · {entry['records']:,} registros · {entry['doi']}")

    if not args.verify:
        MANIFEST.write_text(json.dumps(manifest, indent=1) + "\n", encoding="utf-8")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()

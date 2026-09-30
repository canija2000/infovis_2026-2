"""Utilidades compartidas por los scripts de enriquecimiento (python_scripts/enrich/).

- Rutas del repo, lista de especies MVP y argumentos --species / --mvp.
- GET HTTP con caché en disco (idempotente) y límite de peticiones por host.

Solo biblioteca estándar.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GAME_DIR = ROOT / "web" / "data" / "game"
ENRICH_DIR = GAME_DIR / "enrich"  # salidas públicas (se versionan)
CACHE_DIR = Path(__file__).resolve().parent / "cache"  # respuestas crudas (gitignored)
REFS_DIR = ROOT / "refs"  # fotos de referencia (gitignored, no se publican)

USER_AGENT = "aviario3d-enrich/0.1 (proyecto academico; https://github.com/canija2000/infovis_2026-2)"

# Especies del MVP (Región Metropolitana), ver handoff §0.
MVP = [
    "Turdus falcklandii", "Zonotrichia capensis", "Troglodytes musculus", "Zenaida auriculata",
    "Pteroptochos megapodius", "Mimus thenca", "Scelorchilus albicollis", "Diuca diuca",
    "Vanellus chilensis", "Sturnella loyca",
    "Oreotrochilus leucopleurus", "Muscisaxicola frontalis",
]

# Segundos mínimos entre peticiones por host (iNaturalist pide ≤ 1 req/s).
RATE = {"api.inaturalist.org": 1.1, "inaturalist-open-data.s3.amazonaws.com": 0.5,
        "static.inaturalist.org": 0.5}
DEFAULT_RATE = 0.5
_last: dict[str, float] = {}


def load_index() -> dict:
    return json.loads((GAME_DIR / "index.json").read_text(encoding="utf-8"))


def species_args(parser: argparse.ArgumentParser) -> None:
    g = parser.add_mutually_exclusive_group()
    g.add_argument("--species", nargs="+", metavar="SCINAME", help="nombres científicos (entre comillas)")
    g.add_argument("--mvp", action="store_true", help="las 12 especies del MVP de la RM")


def selected_species(args, index: dict) -> list[str]:
    """Nombres pedidos, validados contra index.json. Sin argumentos: todas."""
    known = [s["sciName"] for s in index["species"]]
    if args.mvp:
        wanted = MVP
    elif args.species:
        wanted = args.species
    else:
        return known
    missing = [s for s in wanted if s not in known]
    if missing:
        raise SystemExit(f"No están en index.json: {missing}")
    return wanted


def _throttle(host: str) -> None:
    wait = RATE.get(host, DEFAULT_RATE) - (time.monotonic() - _last.get(host, 0.0))
    if wait > 0:
        time.sleep(wait)
    _last[host] = time.monotonic()


def fetch(url: str, *, binary: bool = False, cache: bool = True, retries: int = 3) -> bytes:
    """GET con caché en CACHE_DIR/http/<sha1>. Reintenta ante 429/5xx."""
    key = hashlib.sha1(url.encode()).hexdigest()
    path = CACHE_DIR / "http" / key
    if cache and path.exists():
        return path.read_bytes()
    host = urllib.parse.urlsplit(url).hostname or ""
    for attempt in range(retries):
        _throttle(host)
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = resp.read()
            break
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
                continue
            raise
    if cache:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    return data


def fetch_json(url: str, params: dict | None = None) -> dict:
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    return json.loads(fetch(url))


def read_xlsx(path: Path, sheet_name: str) -> list[dict]:
    """Lee una hoja de un .xlsx como lista de dicts (solo biblioteca estándar)."""
    import re
    import xml.etree.ElementTree as ET
    import zipfile

    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
          "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
    with zipfile.ZipFile(path) as z:
        strings = ["".join(t.text or "" for t in si.iter(f"{{{ns['m']}}}t"))
                   for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", ns)]
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rid = next(s.get(f"{{{ns['r']}}}id") for s in wb.find("m:sheets", ns) if s.get("name") == sheet_name)
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        target = next(r.get("Target") for r in rels if r.get("Id") == rid)
        root = ET.fromstring(z.read("xl/" + target.lstrip("/").removeprefix("xl/")))
    rows = []
    for row in root.find("m:sheetData", ns):
        cells = {}
        for cell in row:
            col = re.match(r"[A-Z]+", cell.get("r")).group()
            v = cell.find("m:v", ns)
            if v is None:
                continue
            cells[col] = strings[int(v.text)] if cell.get("t") == "s" else v.text
        rows.append(cells)
    header = rows[0]
    return [{header[k]: r.get(k) for k in header} for r in rows[1:]]


def slug(sci: str) -> str:
    return sci.replace(" ", "_")


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")

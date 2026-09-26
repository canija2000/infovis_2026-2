"""Cruza las especies observadas con Xeno-canto y descarga sus grabaciones.

Ejemplos:
    python3 descargar_sonidos.py --dry-run
    python3 descargar_sonidos.py --top 25 --recordings-per-species 3

La API de Xeno-canto se consulta por nombre cientifico. El resultado queda en
``sounds/`` y ``sounds/manifest.json`` para que la web pueda consumirlo sin
volver a consultar la API.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import time
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse

import requests

PROJECT_DIR = Path(__file__).resolve().parent
OBSERVATION_FILES = (
    PROJECT_DIR / "web" / "data" / "observations-01.json",
    PROJECT_DIR / "web" / "data" / "observations-02.json",
)
SOUNDS_DIR = PROJECT_DIR / "sounds"
MANIFEST_PATH = SOUNDS_DIR / "manifest.json"
API_URL = "https://xeno-canto.org/api/3/recordings"
SYNONYMS_PATH = PROJECT_DIR / "gbif" / "synonyms_xc.json"


def load_synonyms() -> dict[str, str]:
    """Nombre GBIF → nombre Xeno-canto (IOC). Ver gbif/synonyms_xc.json."""
    if not SYNONYMS_PATH.exists():
        return {}
    data = json.loads(SYNONYMS_PATH.read_text(encoding="utf-8"))
    return {gbif: item["xc"] for gbif, item in data.get("synonyms", {}).items()}


def read_api_key() -> str:
    """Read the Xeno-canto key without printing it."""
    candidates = {"api_sounds", "API_SOUNDS_KEY", "XENO_CANTO_API_KEY"}
    env_path = PROJECT_DIR / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            key, separator, value = line.partition("=")
            if separator and key.strip() in candidates and value.strip():
                return value.strip().strip('"').strip("'")
    for key in candidates:
        if os.getenv(key):
            return os.environ[key]
    raise RuntimeError("No se encontró la API key de Xeno-canto en .env")


def load_species() -> list[dict]:
    totals = defaultdict(
        lambda: {
            "comName": "",
            "reportDays": 0,
            "regions": set(),
        }
    )
    for path in OBSERVATION_FILES:
        if not path.exists():
            raise FileNotFoundError(f"Falta el archivo de observaciones: {path}")
        for row in json.loads(path.read_text(encoding="utf-8")):
            scientific_name = str(row.get("sciName") or "").strip()
            if not scientific_name:
                continue
            item = totals[scientific_name]
            item["comName"] = str(row.get("comName") or "").strip()
            item["reportDays"] += int(row.get("reportDays") or row.get("obsCount") or 0)
            if row.get("region_code"):
                item["regions"].add(row["region_code"])

    species = []
    for scientific_name, item in totals.items():
        species.append(
            {
                "scientificName": scientific_name,
                "commonName": item["comName"],
                "reportDays": item["reportDays"],
                "regionCount": len(item["regions"]),
            }
        )
    return sorted(species, key=lambda item: (-item["reportDays"], item["scientificName"]))


def safe_filename(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("._")
    return value or "recording"


def extension_from_url(url: str, fallback: str = ".mp3") -> str:
    suffix = Path(urlparse(url).path).suffix.lower()
    return suffix if suffix in {".mp3", ".wav", ".ogg", ".flac", ".m4a"} else fallback


def fetch_recordings(session: requests.Session, scientific_name: str, api_key: str) -> list[dict]:
    response = session.get(
        API_URL,
        params={"query": f'sp:"{scientific_name}"', "key": api_key},
        timeout=60,
    )
    if not response.ok:
        # No usar raise_for_status(): su mensaje incluye la URL con la key.
        raise requests.HTTPError(f"Xeno-canto respondió {response.status_code} para sp:\"{scientific_name}\"")
    payload = response.json()
    return payload.get("recordings", [])


def download_recording(session: requests.Session, recording: dict, destination: Path) -> Path:
    file_url = recording.get("file")
    if not file_url:
        raise ValueError(f"La grabación XC{recording.get('id')} no tiene archivo")
    extension = extension_from_url(file_url)
    filename = f"XC{recording['id']}-{safe_filename(recording.get('en', 'bird'))}{extension}"
    path = destination / filename
    if not path.exists():
        with session.get(file_url, stream=True, timeout=120) as response:
            response.raise_for_status()
            with path.open("wb") as output:
                for chunk in response.iter_content(chunk_size=1024 * 256):
                    if chunk:
                        output.write(chunk)
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--top", type=int, default=25, help="Cantidad de especies prioritarias (por defecto: 25).")
    parser.add_argument(
        "--recordings-per-species",
        type=int,
        default=3,
        help="Grabaciones a descargar por especie (por defecto: 3).",
    )
    parser.add_argument("--pause", type=float, default=1.0, help="Pausa entre especies, en segundos.")
    parser.add_argument("--dry-run", action="store_true", help="Mostrar la selección sin consultar Xeno-canto.")
    args = parser.parse_args()
    if args.top < 1 or args.recordings_per_species < 1:
        raise ValueError("--top y --recordings-per-species deben ser mayores que cero")

    all_species = load_species()
    selected = all_species[: args.top]
    print(f"Especies disponibles: {len(all_species):,}; seleccionadas: {len(selected):,}")
    for index, item in enumerate(selected, start=1):
        print(f"{index:>2}. {item['reportDays']:>6} días | {item['commonName']} | {item['scientificName']}")
    if args.dry_run:
        return

    api_key = read_api_key()
    synonyms = load_synonyms()
    SOUNDS_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {
        "source": "Xeno-canto API v3",
        "observationFiles": [path.name for path in OBSERVATION_FILES],
        "selection": {"top": args.top, "recordingsPerSpecies": args.recordings_per_species},
        "species": [],
    }
    with requests.Session() as session:
        for index, species in enumerate(selected, start=1):
            xc_name = synonyms.get(species["scientificName"], species["scientificName"])
            species["xcName"] = xc_name
            print(f"[{index}/{len(selected)}] Consultando {xc_name}")
            recordings = fetch_recordings(session, xc_name, api_key)
            downloaded = []
            for recording in recordings[: args.recordings_per_species]:
                try:
                    path = download_recording(session, recording, SOUNDS_DIR)
                except (requests.RequestException, ValueError) as error:
                    print(f"  No se pudo descargar XC{recording.get('id')}: {error}")
                    continue
                downloaded.append(
                    {
                        "id": recording.get("id"),
                        "file": path.name,
                        "sourceUrl": recording.get("url"),
                        "license": recording.get("lic"),
                        "recordist": recording.get("rec"),
                        "country": recording.get("cnt"),
                        "type": recording.get("type"),
                        "quality": recording.get("q"),
                    }
                )
            if not downloaded:
                print("  Xeno-canto no devolvió grabaciones descargables para esta especie")
            manifest["species"].append({**species, "recordings": downloaded})
            MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
            if args.pause and index < len(selected):
                time.sleep(args.pause)
    print(f"Descargas completadas. Manifiesto: {MANIFEST_PATH}")


if __name__ == "__main__":
    main()
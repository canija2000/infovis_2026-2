"""Reúne hasta 64 fotos candidatas CC BY por especie desde GBIF.

Las candidatas se guardan en cache_images/candidates.json. Después,
ordenar_imagenes_web.py analiza todas y publica solo las ocho mejores en
web/data/images.json. Se puede reanudar sin repetir especies ya consultadas.
Solo se acepta la licencia explícita del medio, no la de la ocurrencia.
"""

from __future__ import annotations

import argparse
import json
import socket
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

PROJECT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_DIR / "web" / "data"
OUT = DATA_DIR / "images.json"
CANDIDATES = PROJECT_DIR / "cache_images" / "candidates.json"
API = "https://api.gbif.org/v1/occurrence/search"
DEFAULT_CANDIDATES = 64
PAGE_SIZE = 100
MAX_PAGES = 2
MIN_CHILE_POOL = 32


def cc_by(license_url: str) -> bool:
    parsed = urlparse(license_url.strip().lower())
    return (parsed.scheme in ("http", "https") and
            parsed.hostname == "creativecommons.org" and
            parsed.path.startswith("/licenses/by/"))


def https_url(url: str) -> str | None:
    parsed = urlparse(url.strip())
    return url.strip() if parsed.scheme == "https" and parsed.netloc else None


def display_url(url: str) -> str:
    """iNaturalist ofrece la misma foto a tamaño mediano, apto para la ficha."""
    parsed = urlparse(url)
    if parsed.hostname == "inaturalist-open-data.s3.amazonaws.com" and "/original." in parsed.path:
        return url.replace("/original.", "/medium.")
    return url


def record(occurrence: dict, media: dict, sci: str) -> dict | None:
    if occurrence.get("species") != sci or media.get("type") != "StillImage":
        return None
    url = https_url(media.get("identifier") or "")
    license_url = media.get("license") or ""
    author = media.get("creator") or media.get("rightsHolder") or occurrence.get("recordedBy")
    key = occurrence.get("key")
    if not url or not cc_by(license_url) or not author or not key:
        return None
    return {
        "url": display_url(url),
        "author": author.strip(),
        "license": license_url,
        "source": f"https://www.gbif.org/occurrence/{key}",
    }


def fetch_species(sci: str, limit: int, skip_chile: bool = False) -> list[dict]:
    photos, seen = [], set()
    # Primero Chile, como en 2.ipynb. Busca globalmente la misma especie
    # solo si el conjunto chileno tiene menos de 32 candidatas.
    for country in ((None,) if skip_chile else ("CL", None)):
        if country is None and len(photos) >= MIN_CHILE_POOL:
            break
        for page in range(MAX_PAGES):
            params = {"mediaType": "StillImage", "scientificName": sci,
                      "limit": PAGE_SIZE, "offset": page * PAGE_SIZE}
            if country:
                params["country"] = country
            query = urlencode(params)
            request = Request(f"{API}?{query}", headers={"User-Agent": "InfoVis-Birds/1.0 (educational image attribution)", "Accept": "application/json"})
            try:
                for attempt in range(4):
                    try:
                        with urlopen(request, timeout=15) as response:
                            payload = json.load(response)
                        break
                    except HTTPError as exc:
                        if exc.code == 429 and attempt < 3:
                            retry_after = exc.headers.get("Retry-After", "")
                            delay = int(retry_after) if retry_after.isdigit() else 10 * 2 ** attempt
                            time.sleep(min(delay, 60))
                            continue
                        if attempt >= 1:
                            raise
                        time.sleep(1)
                    except (URLError, TimeoutError, socket.timeout):
                        if attempt >= 1:
                            raise
                        time.sleep(1)
            except (HTTPError, URLError, TimeoutError, socket.timeout):
                if photos:
                    return photos
                raise
            for occurrence in payload.get("results", []):
                for media in occurrence.get("media", []):
                    image = record(occurrence, media, sci)
                    if image and image["url"] not in seen:
                        seen.add(image["url"])
                        photos.append(image)
                        if len(photos) == limit:
                            return photos
            if payload.get("endOfRecords"):
                break
    return photos


def write_index(species: list[dict], entries: dict) -> None:
    payload = {
        "source": "GBIF; licencia CC BY verificada por imagen en el momento de la consulta",
        "species": [
            {"sid": s["id"], "sciName": s["sciName"],
             "images": [{**image, "url": display_url(image["url"])} for image in entries[s["sciName"]][:8]]}
            for s in species if s["sciName"] in entries
        ],
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def write_candidates(species: list[dict], entries: dict, limit: int,
                     incomplete: set[str]) -> None:
    CANDIDATES.parent.mkdir(exist_ok=True)
    payload = {
        "source": "GBIF; licencia CC BY verificada por imagen en el momento de la consulta",
        "candidateLimit": limit,
        "incomplete": sorted(incomplete),
        "species": [
            {"sid": s["id"], "sciName": s["sciName"], "images": entries[s["sciName"]]}
            for s in species if s["sciName"] in entries
        ],
    }
    pending = CANDIDATES.with_suffix(".tmp")
    pending.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    pending.replace(CANDIDATES)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="Vuelve a consultar especies ya guardadas")
    parser.add_argument("--retry-empty", action="store_true", help="Vuelve a consultar solo especies sin fotos")
    parser.add_argument("--limit", type=int, default=DEFAULT_CANDIDATES,
                        help="Candidatas por especie antes de seleccionar ocho (por defecto: 64)")
    parser.add_argument("--workers", type=int, default=16, help="Consultas de especies simultáneas")
    args = parser.parse_args()
    if args.limit < 8:
        parser.error("--limit debe ser al menos 8")
    species = json.loads((DATA_DIR / "species.json").read_text(encoding="utf-8"))
    previous = json.loads(CANDIDATES.read_text(encoding="utf-8")) if CANDIDATES.exists() else {"species": []}
    entries = {row["sciName"]: row["images"] for row in previous["species"]}
    published = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {"species": []}
    published_by_name = {row["sciName"]: row["images"] for row in published["species"]}
    increased_limit = args.limit > previous.get("candidateLimit", 0)
    pending = [s["sciName"] for s in species
               if args.force or increased_limit or s["sciName"] not in entries
               or s["sciName"] in previous.get("incomplete", [])
               or (args.retry_empty and not entries[s["sciName"]])]
    incomplete = set(previous.get("incomplete", [])) | set(pending)
    write_candidates(species, entries, args.limit, incomplete)
    failures = []
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        tasks = {pool.submit(fetch_species, sci, args.limit,
                             args.retry_empty and sci in entries and not entries[sci]): sci
                 for sci in pending}
        for i, future in enumerate(as_completed(tasks), 1):
            sci = tasks[future]
            try:
                new_photos = future.result()
                retained = published_by_name.get(sci, []) + new_photos + entries.get(sci, [])
                entries[sci] = list({photo["url"]: photo for photo in retained}.values())[:args.limit]
                incomplete.discard(sci)
            except (HTTPError, URLError, TimeoutError, socket.timeout) as exc:
                failures.append(sci)
                print(f"{i}/{len(pending)} {sci}: {exc}", flush=True)
            if i % 10 == 0:
                write_candidates(species, entries, args.limit, incomplete)
            if i % 25 == 0:
                print(f"{i}/{len(pending)} completadas; {sum(bool(v) for v in entries.values())} con fotos", flush=True)
    write_candidates(species, entries, args.limit, incomplete)
    print(f"{len(entries)} especies consultadas; {sum(bool(v) for v in entries.values())} con fotos; "
          f"{sum(map(len, entries.values()))} candidatas; {len(failures)} errores")


if __name__ == "__main__":
    main()

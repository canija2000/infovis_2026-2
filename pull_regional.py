"""Descarga el histórico diario de eBird por región (ruta A).

Uso:
    python3 pull_regional.py --dry-run
    python3 pull_regional.py --regions CL-RM,CL-VS --start 2024-05-01 --end 2024-05-31
    python3 pull_regional.py --paso0
    python3 pull_regional.py --workers 2

A diferencia de ``10anios.py`` (una consulta diaria a CL y asignación posterior
por coordenada), este script consulta el endpoint histórico para cada región
por separado. Cada fila de la respuesta significa "la especie S fue reportada
en la región R el día D": el endpoint devuelve una fila por especie
(``rank=mrec``, el avistamiento más reciente del día).

La caché vive en ``cache_ebird_regional/{REGION}/{AAAA-MM-DD}.json`` y también
guarda las respuestas vacías (``[]``) para no reconsultarlas. El directorio
está en ``.gitignore``: no se versiona.

Volumen total: 16 regiones x ~3.654 días = ~58.464 solicitudes (~16 h con
``--pause 1``). El script es reanudable: los días ya cacheados se omiten.
"""

from __future__ import annotations

import argparse
import json
import os
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests

PROJECT_DIR = Path(__file__).resolve().parent
CACHE_DIR = PROJECT_DIR / "cache_ebird_regional"
DOCS_DIR = PROJECT_DIR / "docs"
API_URL = "https://api.ebird.org/v2/data/obs/{region}/historic"

# Regiones de norte a sur (códigos eBird).
REGIONS = [
    "CL-AP", "CL-TA", "CL-AN", "CL-AT", "CL-CO", "CL-VS", "CL-RM", "CL-LI",
    "CL-ML", "CL-NB", "CL-BI", "CL-AR", "CL-LR", "CL-LL", "CL-AI", "CL-MA",
]

# Parámetros verificados en el Paso 0 (ver docs/re_pull_regional.md).
# includeProvisional=false iguala a la fuente anterior (10anios.py no lo
# enviaba) para que ambas métricas sean comparables.
API_PARAMS = {
    "sppLocale": "es_CL",
    "rank": "mrec",
    "detail": "simple",
    "includeProvisional": "false",
}

PASO0_DATES = ["2024-05-15", "2021-08-22"]
DEFAULT_START = date(2016, 9, 17)


class RateLimitError(RuntimeError):
    """eBird rechazó la solicitud porque la API key llegó al límite de tasa."""


def read_api_key() -> str:
    """Lee el token desde .env o el entorno, sin exponerlo."""
    candidates = {"API_BIRD_KEY", "EBIRD_API_KEY", "X_EBIRDAPITOKEN"}
    env_path = PROJECT_DIR / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            key, separator, value = line.partition("=")
            if separator and key.strip() in candidates and value.strip():
                return value.strip().strip('"').strip("'")
    for key in candidates:
        if os.getenv(key):
            return os.environ[key]
    raise RuntimeError("No se encontró una API key de eBird en .env ni en el entorno")


def parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def date_range(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def cache_path(region: str, day: date) -> Path:
    return CACHE_DIR / region / f"{day:%Y-%m-%d}.json"


def fetch_region_day(
    session: requests.Session,
    region: str,
    day: date,
    api_key: str,
    pause: float,
    max_retries: int = 6,
) -> list[dict]:
    """Descarga un día/región con caché, reintentos y escritura atómica."""
    path = cache_path(region, day)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))

    url = API_URL.format(region=region) + f"/{day:%Y/%m/%d}"
    for attempt in range(max_retries):
        response = session.get(
            url,
            headers={"X-eBirdApiToken": api_key},
            params=API_PARAMS,
            timeout=90,
        )
        if response.status_code == 429:
            retry_after = response.headers.get("Retry-After", "no indicado")
            raise RateLimitError(
                f"HTTP 429 para {region} {day}. eBird está limitando la API key "
                f"(Retry-After: {retry_after}). La caché se conserva; espera "
                "antes de volver a ejecutar el script."
            )
        if response.status_code >= 500:
            retry_after = response.headers.get("Retry-After")
            try:
                wait_seconds = float(retry_after) if retry_after else 30 * (2**attempt)
            except ValueError:
                wait_seconds = 30 * (2**attempt)
            wait_seconds = min(wait_seconds, 900)
            print(
                f"HTTP {response.status_code} para {region} {day}; "
                f"reintentando en {wait_seconds:.0f}s ({attempt + 1}/{max_retries})"
            )
            time.sleep(wait_seconds)
            continue
        if response.status_code in {401, 403}:
            raise RuntimeError(
                f"HTTP {response.status_code} para {region} {day}: "
                "revisa la API key o si la clave fue suspendida."
            )
        response.raise_for_status()
        rows = response.json()
        path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent, delete=False, suffix=".tmp"
        ) as tmp:
            json.dump(rows, tmp, ensure_ascii=False)
            tmp_path = Path(tmp.name)
        tmp_path.replace(path)
        if pause:
            time.sleep(pause)
        return rows
    raise RuntimeError(
        f"No se pudo descargar {region} {day} después de {max_retries} intentos; "
        "la caché existente se conserva para continuar después."
    )


def pending_days(region: str, days: list[date]) -> list[date]:
    return [day for day in days if not cache_path(region, day).exists()]


def download_all(
    regions: list[str],
    days: list[date],
    api_key: str,
    pause: float,
    workers: int,
) -> str:
    """Descarga todo lo pendiente. Devuelve 'ok', 'rate_limited' o 'auth_error'."""
    stop_event = threading.Event()
    status = {"value": "ok"}
    status_lock = threading.Lock()
    total_done = 0
    total_lock = threading.Lock()

    def note(new_status: str) -> None:
        with status_lock:
            order = {"ok": 0, "rate_limited": 1, "auth_error": 2}
            if order[new_status] > order[status["value"]]:
                status["value"] = new_status

    def region_job(region: str) -> None:
        nonlocal total_done
        pending = pending_days(region, days)
        if not pending:
            print(f"{region}: todo cacheado ({len(days)} días)", flush=True)
            return
        print(f"{region}: {len(pending)} días pendientes", flush=True)
        try:
            with requests.Session() as session:
                for index, day in enumerate(pending, start=1):
                    if stop_event.is_set():
                        return
                    try:
                        fetch_region_day(session, region, day, api_key, pause)
                    except RateLimitError as error:
                        print(error, flush=True)
                        note("rate_limited")
                        stop_event.set()
                        return
                    with total_lock:
                        total_done += 1
                        done = total_done
                    if index % 100 == 0 or index == len(pending):
                        print(f"  {region}: {index}/{len(pending)} (total: {done})", flush=True)
        except RuntimeError as error:
            # 401/403 u otros errores no recuperables: no reintentar a ciegas.
            print(f"{region}: ERROR {error}", flush=True)
            note("auth_error")
            stop_event.set()

    if workers == 1:
        for region in regions:
            region_job(region)
            if status["value"] == "auth_error":
                break
    else:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            list(pool.map(region_job, regions))
    return status["value"]


def run_paso0(api_key: str) -> None:
    """Verificación empírica (<=40 solicitudes) antes de la descarga completa.

    Comprueba para 2 fechas x 16 regiones:
    1. si cada respuesta regional tiene 1 fila por especie;
    2. si las coordenadas caen dentro del polígono de su región (sjoin);
    3. unión de especies regionales vs. lista nacional del mismo día;
    4. si el parámetro ``r`` (varias regiones) devuelve filas por región o fusionadas.
    Escribe el informe en ``docs/re_pull_regional.md``.
    """
    import geopandas as gpd
    import pandas as pd

    days = [parse_date(value) for value in PASO0_DATES]
    t0 = time.time()
    fetched: dict[tuple[str, str], list[dict]] = {}
    national: dict[str, list[dict]] = {}
    n_requests = 0
    with requests.Session() as session:
        for day in days:
            for region in REGIONS:
                rows = fetch_region_day(session, region, day, api_key, pause=1.0)
                fetched[(region, day.isoformat())] = rows
                n_requests += 1
            rows = fetch_region_day(session, "CL", day, api_key, pause=1.0)
            national[day.isoformat()] = rows
            n_requests += 1
        # Prueba del parámetro r: ¿devuelve filas por región o fusionadas?
        try:
            response = session.get(
                "https://api.ebird.org/v2/data/obs/CL/historic/2024/05/15",
                headers={"X-eBirdApiToken": api_key},
                params={**API_PARAMS, "r": ["CL-RM", "CL-VS"]},
                timeout=90,
            )
            r_test = f"HTTP {response.status_code}, {len(response.json())} filas"
            r_rows = response.json()
            r_regions = {row.get("subnational1Code") for row in r_rows}
            r_test += f", subnational1Code distintos: {sorted(r_regions) or 'ninguno'}"
        except Exception as error:  # noqa: BLE001 - prueba exploratoria
            r_test = f"error: {error}"
        n_requests += 1
    elapsed = time.time() - t0

    lines = [
        "# Re-pull regional de eBird — informe del Paso 0",
        "",
        f"Fecha del informe: {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC",
        f"Solicitudes realizadas: {n_requests} (límite: 40)",
        f"Fechas probadas: {', '.join(PASO0_DATES)}; regiones: las 16 + CL nacional",
        f"Parámetros: {json.dumps(API_PARAMS, ensure_ascii=False)}",
        "",
        "## 1. ¿Una fila por especie por región?",
        "",
        "| Fecha | Región | Filas | Especies únicas | 1 fila/especie |",
        "|---|---|---|---|---|",
    ]
    all_ok = True
    for day in days:
        for region in REGIONS:
            rows = fetched[(region, day.isoformat())]
            species = {row["speciesCode"] for row in rows}
            ok = len(rows) == len(species)
            all_ok = all_ok and ok
            lines.append(
                f"| {day} | {region} | {len(rows)} | {len(species)} | {'sí' if ok else 'NO'} |"
            )
    lines += [
        "",
        f"**Resultado:** {'todas las respuestas regionales traen 1 fila por especie.' if all_ok else 'HAY RESPUESTAS CON DUPLICADOS — revisar.'}",
        "",
        "## 2. Unión de especies regionales vs. lista nacional",
        "",
        "| Fecha | Especies nacional (CL) | Unión regional | Cobertura |",
        "|---|---|---|---|",
    ]
    for day in days:
        iso = day.isoformat()
        nat = {row["speciesCode"] for row in national[iso]}
        union = set()
        for region in REGIONS:
            union.update(row["speciesCode"] for row in fetched[(region, iso)])
        coverage = len(union & nat) / len(nat) * 100 if nat else 0
        lines.append(
            f"| {iso} | {len(nat)} | {len(union)} | {coverage:.1f}% de la lista nacional |"
        )
        only_regional = union - nat
        if only_regional:
            lines.append(f"  Especies solo en respuestas regionales: {len(only_regional)}")
    lines += [
        "",
        "## 3. Validación espacial (sjoin contra el shapefile)",
        "",
    ]
    shapefile = PROJECT_DIR / "Regiones" / "Regional.shp"
    regions_gdf = gpd.read_file(shapefile).to_crs(4326)
    regions_gdf["region_code"] = pd.to_numeric(
        regions_gdf["codregion"], errors="coerce"
    ).map(
        {
            15: "CL-AP", 1: "CL-TA", 2: "CL-AN", 3: "CL-AT", 4: "CL-CO",
            5: "CL-VS", 13: "CL-RM", 6: "CL-LI", 7: "CL-ML", 8: "CL-BI",
            9: "CL-AR", 10: "CL-LL", 14: "CL-LR", 11: "CL-AI", 12: "CL-MA",
            16: "CL-NB",
        }
    )
    records = []
    for (region, iso), rows in fetched.items():
        for row in rows:
            records.append(
                {"region_query": region, "lat": row.get("lat"), "lng": row.get("lng")}
            )
    points = pd.DataFrame(records)
    points["lat"] = pd.to_numeric(points["lat"], errors="coerce")
    points["lng"] = pd.to_numeric(points["lng"], errors="coerce")
    points = points.dropna(subset=["lat", "lng"])
    gdf = gpd.GeoDataFrame(
        points,
        geometry=gpd.points_from_xy(points["lng"], points["lat"]),
        crs="EPSG:4326",
    )
    joined = gpd.sjoin(
        gdf, regions_gdf[["region_code", "geometry"]], how="left", predicate="within"
    )
    total = len(joined)
    sin_match = int(joined["region_code"].isna().sum())
    otra_region = int(
        ((~joined["region_code"].isna()) & (joined["region_code"] != joined["region_query"])).sum()
    )
    misma_region = total - sin_match - otra_region
    lines += [
        f"Filas con coordenadas válidas: {total}",
        f"- dentro del polígono de su región consultada: {misma_region} ({misma_region/total*100:.1f}%)",
        f"- dentro de Chile pero en otra región (bordes/costa): {otra_region} ({otra_region/total*100:.1f}%)",
        f"- fuera de todo polígono (p. ej. pelágicos): {sin_match} ({sin_match/total*100:.1f}%)",
        "",
        "**Decisión:** la región se toma de la consulta, no del sjoin. El sjoin se usa",
        "solo como validación y no se descartan filas (a diferencia del pipeline",
        "anterior, que perdía ~10% por puntos fuera de polígono).",
        "",
        "## 4. Parámetro `r` (varias regiones en una llamada)",
        "",
        f"Prueba: {r_test}",
        "",
        "**Decisión:** no se usa `r`; una solicitud por región y día.",
        "",
        "## 5. Parámetros y decisiones",
        "",
        "- `sppLocale=es_CL`, `rank=mrec` (explícito), `detail=simple`.",
        "- `includeProvisional=false`: igual que la fuente anterior (10anios.py no lo",
        "  enviaba), para que la métrica antigua y la nueva sean comparables.",
        "- `detail=simple` incluye `lat/lng`, `exoticCategory`, `howMany`: suficiente",
        "  para validación y para la visualización (nativa/exótica).",
        "- Caché en `cache_ebird_regional/{REGION}/{AAAA-MM-DD}.json`, escritura",
        "  atómica, respuestas vacías (`[]`) también cacheadas.",
        "",
        "## 6. Estimación de la descarga completa",
        "",
        f"- Solicitudes: 16 regiones x N días (Paso 0: {elapsed:.0f}s para {n_requests} solicitudes).",
        "- Ante un 429: el script se detiene y se reanuda desde la caché.",
        "",
    ]
    DOCS_DIR.mkdir(exist_ok=True)
    report_path = DOCS_DIR / "re_pull_regional.md"
    report_path.write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))
    print(f"\nInforme escrito en {report_path}")


def main() -> None:
    today = datetime.now(timezone.utc).date()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--regions",
        default=",".join(REGIONS),
        help="Regiones separadas por coma (por defecto: las 16).",
    )
    parser.add_argument("--start", type=parse_date, default=DEFAULT_START)
    parser.add_argument("--end", type=parse_date, default=today)
    parser.add_argument(
        "--pause", type=float, default=1.0, help="Pausa entre solicitudes, en segundos."
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        choices=(1, 2, 3),
        help="Hilos de descarga en paralelo (máx. 3).",
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Contar solicitudes pendientes sin llamar a la API."
    )
    parser.add_argument(
        "--resume-wait",
        type=float,
        default=20.0,
        help="Minutos de espera antes de reanudar tras un 429 (por defecto: 20).",
    )
    parser.add_argument(
        "--paso0",
        action="store_true",
        help="Verificación empírica (<=40 solicitudes) e informe en docs/re_pull_regional.md.",
    )
    args = parser.parse_args()
    if args.start > args.end:
        raise ValueError("--start debe ser anterior o igual a --end")

    regions = [item.strip().upper() for item in args.regions.split(",") if item.strip()]
    unknown = [item for item in regions if item not in REGIONS]
    if unknown:
        raise ValueError(f"Regiones desconocidas: {unknown}. Opciones: {', '.join(REGIONS)}")

    if args.paso0:
        run_paso0(read_api_key())
        return

    days = list(date_range(args.start, args.end))
    total_pending = sum(len(pending_days(region, days)) for region in regions)
    print(f"Período: {args.start} a {args.end} ({len(days)} días) x {len(regions)} regiones")
    print(f"Solicitudes pendientes: {total_pending:,}")
    if total_pending and args.pause:
        hours = total_pending * args.pause / max(args.workers, 1) / 3600
        print(f"Tiempo estimado: ~{hours:.1f} h (pausa de {args.pause}s, {args.workers} hilo(s))")
    if args.dry_run:
        return

    api_key = read_api_key()
    while True:
        status = download_all(regions, days, api_key, args.pause, args.workers)
        remaining = sum(len(pending_days(region, days)) for region in regions)
        if status == "ok" or remaining == 0:
            break
        if status == "auth_error":
            raise RuntimeError("Descarga detenida por error de autenticación (revisar el log).")
        print(
            f"Límite de tasa (429): esperando {args.resume_wait:.0f} min antes de "
            f"reanudar... ({remaining:,} solicitudes pendientes)",
            flush=True,
        )
        time.sleep(args.resume_wait * 60)
    print("Descarga terminada. Caché en", CACHE_DIR)


if __name__ == "__main__":
    main()

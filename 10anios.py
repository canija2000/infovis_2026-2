"""Descarga y prepara diez años de observaciones de eBird para la web.

Uso:
    python 10anios.py --dry-run
    python 10anios.py
    python 10anios.py --start 2016-09-17 --end 2026-09-17

La API histórica de eBird consulta una fecha por solicitud. El script hace una
solicitud diaria para Chile, cachea cada respuesta y asigna los puntos a las
regiones usando el shapefile local. Así se requieren aproximadamente 3.650
solicitudes, en vez de repetirlas para cada una de las 16 regiones.
"""

from __future__ import annotations

import argparse
import json
import os
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import geopandas as gpd
import pandas as pd
import requests

PROJECT_DIR = Path(__file__).resolve().parent
API_URL = "https://api.ebird.org/v2/data/obs/CL/historic"
SHAPEFILE_PATH = PROJECT_DIR / "Regiones" / "Regional.shp"
CACHE_DIR = PROJECT_DIR / "cache_ebird"
WEB_DATA_DIR = PROJECT_DIR / "web" / "data"

# codregion es el código administrativo usado por el shapefile de BCN.
REGION_CODES = {
    15: "CL-AP", 1: "CL-TA", 2: "CL-AN", 3: "CL-AT", 4: "CL-CO", 5: "CL-VS",
    13: "CL-RM", 6: "CL-LI", 7: "CL-ML", 8: "CL-BI", 9: "CL-AR", 10: "CL-LL",
    14: "CL-LR", 11: "CL-AI", 12: "CL-MA", 16: "CL-NB",
}


class RateLimitError(RuntimeError):
    """eBird rejected the request because the API key hit a rate limit."""


def read_api_key() -> str:
    """Read the token from the project .env without exposing it."""
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
    raise RuntimeError("No se encontró una API key en .env")


def parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def date_range(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def fetch_day(
    session: requests.Session,
    day: date,
    api_key: str,
    pause: float,
    max_retries: int = 6,
) -> list[dict]:
    CACHE_DIR.mkdir(exist_ok=True)
    cache_path = CACHE_DIR / f"{day:%Y-%m-%d}.json"
    if cache_path.exists():
        return json.loads(cache_path.read_text(encoding="utf-8"))

    for attempt in range(max_retries):
        response = session.get(
            f"{API_URL}/{day:%Y/%m/%d}",
            headers={"X-eBirdApiToken": api_key},
            params={"sppLocale": "es_CL"},
            timeout=90,
        )
        if response.status_code == 429:
            retry_after = response.headers.get("Retry-After", "no indicado")
            raise RateLimitError(
                f"HTTP 429 para {day}. eBird está limitando la API key "
                f"(Retry-After: {retry_after}). Se conservará la caché; "
                "espera antes de volver a ejecutar el script."
            )
        if response.status_code >= 500:
            retry_after = response.headers.get("Retry-After")
            try:
                wait_seconds = float(retry_after) if retry_after else 30 * (2**attempt)
            except ValueError:
                wait_seconds = 30 * (2**attempt)
            wait_seconds = min(wait_seconds, 900)
            print(
                f"HTTP {response.status_code} para {day}; "
                f"reintentando en {wait_seconds:.0f}s ({attempt + 1}/{max_retries})"
            )
            time.sleep(wait_seconds)
            continue
        if response.status_code in {401, 403}:
            raise RuntimeError(
                f"HTTP {response.status_code} para {day}: revisa la API key o si la clave fue suspendida."
            )
        response.raise_for_status()
        rows = response.json()
        cache_path.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
        if pause:
            time.sleep(pause)
        return rows
    raise RuntimeError(
        f"No se pudo descargar {day} después de {max_retries} intentos; "
        "la caché existente se conserva para continuar después."
    )


def assign_regions(observations: pd.DataFrame, regions: gpd.GeoDataFrame) -> pd.DataFrame:
    observations = observations.copy()
    observations["lat"] = pd.to_numeric(observations["lat"], errors="coerce")
    observations["lng"] = pd.to_numeric(observations["lng"], errors="coerce")
    observations = observations.dropna(subset=["lat", "lng"])
    points = gpd.GeoDataFrame(
        observations,
        geometry=gpd.points_from_xy(observations["lng"], observations["lat"]),
        crs="EPSG:4326",
    )
    joined = gpd.sjoin(
        points,
        regions[["region_code", "geometry"]],
        how="left",
        predicate="within",
    )
    return pd.DataFrame(joined.drop(columns=["geometry", "index_right"], errors="ignore"))


def build_export(raw_rows: list[dict], regions: gpd.GeoDataFrame) -> tuple[gpd.GeoDataFrame, pd.DataFrame]:
    observations = pd.DataFrame(raw_rows)
    if observations.empty:
        raise RuntimeError("La API no devolvió observaciones para el período indicado.")

    observations["obsDt"] = observations["obsDt"].astype(str)
    observations["date"] = pd.to_datetime(observations["obsDt"].str[:10], errors="coerce")
    observations["year_month"] = observations["date"].dt.to_period("M").astype(str)
    observations["howMany"] = pd.to_numeric(observations.get("howMany", 1), errors="coerce").fillna(1)
    observations = assign_regions(observations, regions).dropna(subset=["region_code"])

    group_columns = ["region_code", "year_month", "speciesCode", "comName", "sciName"]
    compact = (
        observations.groupby(group_columns, dropna=False)
        .agg(obsCount=("speciesCode", "size"), howMany=("howMany", "sum"), places=("locId", "nunique"))
        .reset_index()
    )

    metrics = (
        compact.groupby("region_code")
        .agg(
            observaciones=("obsCount", "sum"),
            individuos_reportados=("howMany", "sum"),
            especies=("speciesCode", "nunique"),
            meses=("year_month", "nunique"),
        )
        .reset_index()
    )
    metrics["participacion"] = metrics["observaciones"] / metrics["observaciones"].sum() * 100
    output_regions = regions.merge(metrics, on="region_code", how="left").fillna(
        {"observaciones": 0, "individuos_reportados": 0, "especies": 0, "meses": 0, "participacion": 0}
    )
    # El mapa web solo necesita los límites regionales; simplificar reduce mucho
    # el peso del GeoJSON sin cambiar las métricas ni la asignación espacial.
    output_regions["geometry"] = output_regions.geometry.simplify(
        tolerance=0.005,
        preserve_topology=True,
    )
    return output_regions, compact


def main() -> None:
    today = datetime.now(timezone.utc).date()
    default_start = today.replace(year=today.year - 10)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", type=parse_date, default=default_start)
    parser.add_argument("--end", type=parse_date, default=today)
    parser.add_argument(
        "--pause",
        type=float,
        default=1.0,
        help="Pausa entre solicitudes nuevas, en segundos (por defecto: 1).",
    )
    parser.add_argument("--dry-run", action="store_true", help="Mostrar cantidad de solicitudes sin llamar a la API.")
    args = parser.parse_args()
    if args.start > args.end:
        raise ValueError("--start debe ser anterior o igual a --end")

    days = list(date_range(args.start, args.end))
    cached = sum((CACHE_DIR / f"{day:%Y-%m-%d}.json").exists() for day in days)
    print(f"Período: {args.start} a {args.end} ({len(days)} días)")
    print(f"Solicitudes nuevas estimadas: {len(days) - cached:,}; cacheadas: {cached:,}")
    if args.dry_run:
        return

    regions = gpd.read_file(SHAPEFILE_PATH).to_crs(4326)
    regions["region_code"] = pd.to_numeric(regions["codregion"], errors="coerce").map(REGION_CODES)
    api_key = read_api_key()
    rows = []
    with requests.Session() as session:
        for index, day in enumerate(days, start=1):
            try:
                rows.extend(fetch_day(session, day, api_key, args.pause))
            except RateLimitError as error:
                print(error)
                print(f"Último día completado/cacheado antes del límite: {days[index - 2] if index > 1 else 'ninguno'}")
                return
            if index % 30 == 0 or index == len(days):
                print(f"Procesado {index:,}/{len(days):,} días; filas acumuladas: {len(rows):,}")

    output_regions, compact = build_export(rows, regions)
    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    output_regions.to_file(WEB_DATA_DIR / "regions.geojson", driver="GeoJSON")
    records = compact.to_dict(orient="records")
    midpoint = (len(records) + 1) // 2
    for suffix, chunk in (("01", records[:midpoint]), ("02", records[midpoint:])):
        (WEB_DATA_DIR / f"observations-{suffix}.json").write_text(
            json.dumps(chunk, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    old_observations = WEB_DATA_DIR / "observations.json"
    if old_observations.exists():
        old_observations.unlink()
    metadata = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "startDate": args.start.isoformat(),
        "endDate": args.end.isoformat(),
        "observationCount": int(compact["obsCount"].sum()),
        "regionCount": int(compact["region_code"].nunique()),
        "aggregation": "region-month-species",
    }
    (WEB_DATA_DIR / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(f"Exportado: {WEB_DATA_DIR}")


if __name__ == "__main__":
    main()

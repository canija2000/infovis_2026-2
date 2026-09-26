"""Prepara los clips de canto que publica la web (web/audio/).

Uso:
    python3 preparar_audio_web.py --dry-run
    python3 preparar_audio_web.py                  # usa sounds/ y descarga visitantes
    python3 preparar_audio_web.py --no-download    # solo grabaciones ya locales

Para cada especie elige una grabación (prioriza Chile, canto/llamado, calidad
A y licencias sin ND) entre las que ya están en ``sounds/manifest.json``. Para
los visitantes más frecuentes, que no están en esa selección, consulta
Xeno-canto con ``cnt:chile`` y descarga una grabación a ``sounds/``.

De cada grabación genera dos archivos:
    web/audio/XC{id}.mp3        clip de ~8 s (la ventana de mayor energía)
    web/audio/XC{id}-g.mp3      grano de ~1,2 s para la sonificación

y los describe en ``web/audio/clips.json``, que lee ``build_web_data.py`` para
armar ``web/data/sounds.json``. La key de Xeno-canto se lee de ``.env``
(``api_sounds``) o del entorno y nunca se escribe ni se imprime.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import time
from pathlib import Path

import numpy as np
import requests

PROJECT_DIR = Path(__file__).resolve().parent
SOUNDS_DIR = PROJECT_DIR / "sounds"
MANIFEST_PATH = SOUNDS_DIR / "manifest.json"
SPECIES_PATH = PROJECT_DIR / "web" / "data" / "species.json"
SYNONYMS_PATH = PROJECT_DIR / "gbif" / "synonyms_xc.json"
AUDIO_DIR = PROJECT_DIR / "web" / "audio"
CLIPS_PATH = AUDIO_DIR / "clips.json"
API_URL = "https://xeno-canto.org/api/3/recordings"

RATE = 44100
CLIP_SECONDS = 8.0
GRAIN_SECONDS = 1.2
TARGET_RMS_DB = -20.0
PEAK_LIMIT = 0.89  # -1 dBFS

# Voces de la sonificación: el canto que representa a cada ola de visitantes.
LAYER_SPECIES = {
    "visitante_estival": "Elaenia albiceps",  # Fío-fío
    "visitante_invernal": "Sephanoides sephaniodes",  # Picaflor chico
}
NON_VOCAL = ("wingbeat", "flight", "mechanical", "drumming", "begging")


def read_api_key() -> str | None:
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
    return None


def load_json(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def score(rec: dict) -> float:
    """Mayor es mejor. Funciona con registros del manifiesto o de la API."""
    kind = str(rec.get("type") or "").lower()
    country = str(rec.get("country") or rec.get("cnt") or "")
    license_url = str(rec.get("license") or rec.get("lic") or "")
    value = 0.0
    value += 4 if country == "Chile" else 1.5 if country == "Argentina" else 0
    value += 2 if "song" in kind else 1 if "call" in kind else 0
    value -= 5 if any(word in kind for word in NON_VOCAL) else 0
    value += {"A": 1.5, "B": 1}.get(str(rec.get("quality") or rec.get("q")), 0)
    value -= 0.5 if "-nd" in license_url else 0
    return value


def length_seconds(text: str | None) -> float:
    parts = [int(p) for p in str(text or "0").split(":") if p.isdigit()]
    return sum(p * 60 ** i for i, p in enumerate(reversed(parts)))


# --- Xeno-canto --------------------------------------------------------------


def search(session: requests.Session, query: str, key: str) -> list[dict]:
    response = session.get(API_URL, params={"query": query, "key": key}, timeout=60)
    if not response.ok:
        # No usar raise_for_status(): su mensaje incluye la URL con la key.
        print(f"  Xeno-canto respondió {response.status_code} para «{query}»")
        return []
    return response.json().get("recordings", [])


def download_best(session: requests.Session, xc_name: str, key: str) -> dict | None:
    for query in (f'sp:"{xc_name}" cnt:chile q:A', f'sp:"{xc_name}" cnt:chile', f'sp:"{xc_name}" cnt:argentina'):
        candidates = [r for r in search(session, query, key) if 4 <= length_seconds(r.get("length")) <= 120]
        if candidates:
            break
        time.sleep(1)
    else:
        return None
    rec = max(candidates, key=lambda r: (score(r), -abs(length_seconds(r.get("length")) - 30)))
    path = SOUNDS_DIR / f"XC{rec['id']}-{xc_name.replace(' ', '_')}.mp3"
    if not path.exists():
        with session.get(rec["file"], stream=True, timeout=120) as response:
            if not response.ok:
                print(f"  No se pudo descargar XC{rec['id']} ({response.status_code})")
                return None
            tmp = path.with_suffix(".part")
            with tmp.open("wb") as output:
                for chunk in response.iter_content(chunk_size=1 << 18):
                    output.write(chunk)
            tmp.replace(path)
    return {
        "id": str(rec["id"]),
        "file": path.name,
        "sourceUrl": rec.get("url"),
        "license": rec.get("lic"),
        "recordist": rec.get("rec"),
        "country": rec.get("cnt"),
        "type": rec.get("type"),
        "quality": rec.get("q"),
    }


# --- Audio -------------------------------------------------------------------


def decode(path: Path) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(RATE), "-f", "f32le", "-"],
        check=True,
        capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def loudest_window(signal: np.ndarray, seconds: float) -> np.ndarray:
    size = int(seconds * RATE)
    if len(signal) <= size:
        return signal
    hop = RATE // 20
    energy = np.convolve(signal[: len(signal) // hop * hop].reshape(-1, hop).__pow__(2).sum(axis=1), np.ones(size // hop), "valid")
    start = int(np.argmax(energy)) * hop
    return signal[start : start + size]


def finish(signal: np.ndarray, fade_in: float, fade_out: float) -> np.ndarray:
    signal = signal - signal.mean()
    rms = np.sqrt(np.mean(signal**2)) or 1.0
    signal = signal * (10 ** (TARGET_RMS_DB / 20) / rms)
    peak = np.abs(signal).max() or 1.0
    if peak > PEAK_LIMIT:
        signal = signal * (PEAK_LIMIT / peak)
    n_in, n_out = int(fade_in * RATE), int(fade_out * RATE)
    signal[:n_in] *= np.linspace(0, 1, n_in)
    signal[len(signal) - n_out :] *= np.linspace(1, 0, n_out)
    return signal.astype(np.float32)


def encode(signal: np.ndarray, path: Path, bitrate: str) -> None:
    tmp = path.with_suffix(".tmp.mp3")
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(RATE), "-ac", "1", "-i", "-",
         "-c:a", "libmp3lame", "-b:a", bitrate, str(tmp)],
        input=signal.tobytes(),
        check=True,
    )
    tmp.replace(path)


def make_clips(source: Path, rec_id: str) -> tuple[str, str, float]:
    signal = decode(source)
    # Pasa-altos suave: quita ruido de viento/manejo bajo 250 Hz.
    signal = np.append(signal[0], signal[1:] - 0.965 * signal[:-1])
    clip = finish(loudest_window(signal, CLIP_SECONDS), 0.25, 0.6)
    grain = finish(loudest_window(clip, GRAIN_SECONDS), 0.02, 0.35)
    clip_name, grain_name = f"XC{rec_id}.mp3", f"XC{rec_id}-g.mp3"
    encode(clip, AUDIO_DIR / clip_name, "80k")
    encode(grain, AUDIO_DIR / grain_name, "64k")
    return clip_name, grain_name, round(len(clip) / RATE, 2)


# --- Principal ---------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--visitors", type=int, default=6, help="Visitantes más frecuentes por ola a descargar (por defecto: 6).")
    parser.add_argument("--no-download", action="store_true", help="No consultar Xeno-canto; usar solo sounds/.")
    parser.add_argument("--dry-run", action="store_true", help="Mostrar la selección sin descargar ni escribir.")
    args = parser.parse_args()

    species = load_json(SPECIES_PATH, [])
    synonyms = load_json(SYNONYMS_PATH, {}).get("synonyms", {})
    manifest = load_json(MANIFEST_PATH, {"species": []})
    to_gbif = {v["xc"]: k for k, v in synonyms.items()}
    by_sci = {s["sciName"]: s for s in species}
    xc_name = lambda sci: synonyms.get(sci, {}).get("xc", sci)  # noqa: E731

    # 1) Grabaciones locales: la mejor de cada especie.
    chosen: dict[str, dict] = {}
    for item in manifest.get("species", []):
        sci = to_gbif.get(item["scientificName"], item["scientificName"])
        local = [r for r in item.get("recordings", []) if (SOUNDS_DIR / r["file"]).exists()]
        if sci in by_sci and local:
            chosen[sci] = max(local, key=score)

    # 2) Visitantes frecuentes (y las dos voces de la sonificación) sin grabación local.
    wanted = set(LAYER_SPECIES.values())
    for cls in ("visitante_estival", "visitante_invernal"):
        pool = sorted((s for s in species if s["class"] == cls), key=lambda s: -s["meanFreq"])
        wanted.update(s["sciName"] for s in pool[: args.visitors])
    # Se reintenta también toda grabación local que no sea de Chile/Argentina o no sea vocal.
    wanted.update(sci for sci, rec in chosen.items() if score(rec) < 5)
    missing = sorted(sci for sci in wanted if sci not in chosen or score(chosen[sci]) < 5)

    print(f"Especies con grabación local: {len(chosen)}")
    for sci, rec in sorted(chosen.items(), key=lambda kv: by_sci[kv[0]]["comName"]):
        print(f"  {by_sci[sci]['comName']:28s} XC{rec['id']:>8}  {rec.get('country') or '':10s} {rec.get('type') or ''}")
    print(f"A descargar desde Xeno-canto (cnt:chile): {len(missing)}")
    for sci in missing:
        print(f"  {by_sci[sci]['comName']:28s} {xc_name(sci)}")
    if args.dry_run:
        return

    if missing and not args.no_download:
        key = read_api_key()
        if not key:
            raise SystemExit("Falta la key de Xeno-canto (api_sounds en .env o en el entorno).")
        SOUNDS_DIR.mkdir(exist_ok=True)
        with requests.Session() as session:
            for sci in missing:
                rec = download_best(session, xc_name(sci), key)
                if rec and (sci not in chosen or score(rec) > score(chosen[sci])):
                    chosen[sci] = rec
                    print(f"  ✓ {by_sci[sci]['comName']}: XC{rec['id']} ({rec['country']}, {rec['type']})")
                else:
                    print(f"  – {by_sci[sci]['comName']}: sin grabación mejor")
                time.sleep(1)

    # 3) Clips y granos.
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    for old in AUDIO_DIR.glob("XC*.mp3"):
        old.unlink()
    clips = []
    for sci, rec in sorted(chosen.items(), key=lambda kv: by_sci[kv[0]]["id"]):
        clip, grain, seconds = make_clips(SOUNDS_DIR / rec["file"], str(rec["id"]))
        license_url = str(rec.get("license") or "")
        clips.append(
            {
                "sciName": sci,
                "id": str(rec["id"]),
                "clip": f"audio/{clip}",
                "grain": f"audio/{grain}",
                "seconds": seconds,
                "url": rec.get("sourceUrl") or f"https://xeno-canto.org/{rec['id']}",
                "type": rec.get("type"),
                "quality": rec.get("quality"),
                "country": rec.get("country"),
                "recordist": rec.get("recordist"),
                "license": "https:" + license_url if license_url.startswith("//") else license_url,
            }
        )
    payload = {
        "description": "Clips recortados (ventana de mayor energía) de grabaciones de Xeno-canto. "
        "Cada entrada conserva autor, licencia y enlace a la grabación original.",
        "layers": LAYER_SPECIES,
        "clips": clips,
    }
    CLIPS_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(p.stat().st_size for p in AUDIO_DIR.glob("*.mp3"))
    print(f"{len(clips)} especies con clip · web/audio/ = {total / 1024 / 1024:.1f} MB")
    print("Siguiente paso: python3 build_web_data.py (enlaza los clips en web/data/sounds.json)")


if __name__ == "__main__":
    main()

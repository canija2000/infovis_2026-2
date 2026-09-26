"""Prepara los clips de canto que publica la web (web/audio/).

Uso:
    python3 preparar_audio_web.py --dry-run        # selección, cobertura y faltantes
    python3 preparar_audio_web.py                  # descarga faltantes y genera web/audio/
    python3 preparar_audio_web.py --no-download    # solo grabaciones ya locales

Cobertura: todas las especies que la web muestra sin expandir (top por clase
en cada región y en Chile, igual que ``TAB_LIMIT`` en web/app.js) más las dos
voces de la sonificación.

Para cada especie junta candidatas locales (``sounds/manifest.json`` y
descargas previas) y de Xeno-canto (Chile primero, calidad A/B), y elige la
mejor (Chile, canto/llamado, calidad, licencia sin ND). De cada grabación
genera:
    web/audio/XC{id}.mp3        clip de ~6 s (el tramo más "de ave")
    web/audio/XC{id}-g.mp3      grano de ~0,9 s para la sonificación

El tramo se elige por energía en la banda de las aves (1,5–9 kHz) ponderada
por tonalidad, para no quedarse con viento o ruido de fondo. Los ajustes a
mano van en ``audio_overrides.json`` (excluir grabaciones, forzar una, fijar
el segundo de inicio). La key de Xeno-canto se lee de ``.env`` (``api_sounds``)
o del entorno y nunca se escribe ni se imprime.
"""

from __future__ import annotations

import argparse
import hashlib
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
CACHE_DIR = PROJECT_DIR / "cache_xenocanto"
DATA_DIR = PROJECT_DIR / "web" / "data"
SYNONYMS_PATH = PROJECT_DIR / "gbif" / "synonyms_xc.json"
OVERRIDES_PATH = PROJECT_DIR / "audio_overrides.json"
AUDIO_DIR = PROJECT_DIR / "web" / "audio"
CLIPS_PATH = AUDIO_DIR / "clips.json"
API_URL = "https://xeno-canto.org/api/3/recordings"

RATE = 44100
CLIP_SECONDS = 6.0
GRAIN_SECONDS = 0.9
TARGET_RMS_DB = -20.0
PEAK_LIMIT = 0.89  # -1 dBFS
BAND = (1500, 9000)

# Filas visibles por pestaña sin "mostrar todas" (igual que TAB_LIMIT en web/app.js).
TAB_LIMIT = {0: 12, 1: 24, 2: 16}
# Voces de la sonificación: el canto que representa a cada ola de visitantes.
LAYER_SPECIES = {
    "visitante_estival": "Elaenia albiceps",  # Fío-fío
    "visitante_invernal": "Sephanoides sephaniodes",  # Picaflor chico
}
NON_VOCAL = ("wingbeat", "flight", "mechanical", "drumming", "begging", "uncertain")


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


def length_seconds(text: str | None) -> float:
    parts = [int(p) for p in str(text or "0").split(":") if p.isdigit()]
    return sum(p * 60**i for i, p in enumerate(reversed(parts)))


def score(rec: dict) -> float:
    """Mayor es mejor. `rec` en formato normalizado (ver normalize)."""
    kind = str(rec.get("type") or "").lower()
    value = 0.0
    value += 4 if rec.get("country") == "Chile" else 1.5 if rec.get("country") == "Argentina" else 0
    value += 2 if "song" in kind else 1 if "call" in kind else 0
    value -= 5 if any(word in kind for word in NON_VOCAL) else 0
    value += {"A": 2, "B": 1.2, "C": 0}.get(str(rec.get("quality")), -3)
    value -= 0.5 if "-nd" in str(rec.get("license") or "") else 0
    seconds = rec.get("seconds") or 0
    value -= 1 if seconds and (seconds < 4 or seconds > 180) else 0
    return value


def normalize(api: dict) -> dict:
    lic = str(api.get("lic") or "")
    return {
        "id": str(api["id"]),
        "fileUrl": api.get("file"),
        "sourceUrl": api.get("url") or f"https://xeno-canto.org/{api['id']}",
        "license": "https:" + lic if lic.startswith("//") else lic,
        "recordist": api.get("rec"),
        "country": api.get("cnt"),
        "type": api.get("type"),
        "quality": api.get("q"),
        "seconds": length_seconds(api.get("length")),
    }


# --- Selección de especies ----------------------------------------------------


def visible_species() -> set[int]:
    """Especies que la web muestra sin expandir, en cualquier región o en Chile."""
    rows = load_json(DATA_DIR / "typical_year.json", {"rows": []})["rows"]
    groups: dict[tuple[int, int], list] = {}
    for r in rows:
        if r[2] in TAB_LIMIT:
            groups.setdefault((r[1], r[2]), []).append(r)
    out = set()
    for (rid, cls), rs in groups.items():
        rs.sort(key=lambda r: (-sum(r[7:19]), r[0]))
        out.update(r[0] for r in rs[: TAB_LIMIT[cls]])
    return out


# --- Xeno-canto --------------------------------------------------------------


def search(session: requests.Session, query: str, key: str | None, offline: bool) -> list[dict]:
    CACHE_DIR.mkdir(exist_ok=True)
    cache = CACHE_DIR / (hashlib.sha1(query.encode()).hexdigest()[:16] + ".json")
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    if offline or not key:
        return []
    response = session.get(API_URL, params={"query": query, "key": key}, timeout=60)
    time.sleep(0.4)
    if not response.ok:
        # No usar raise_for_status(): su mensaje incluye la URL con la key.
        print(f"  Xeno-canto respondió {response.status_code} para «{query}»")
        return []
    recordings = response.json().get("recordings", [])
    cache.write_text(json.dumps(recordings, ensure_ascii=False), encoding="utf-8")
    return recordings


def remote_candidates(session, xc_name: str, key, offline: bool) -> list[dict]:
    found: list[dict] = []
    for query in (
        f'sp:"{xc_name}" cnt:chile q:A',
        f'sp:"{xc_name}" cnt:chile q:B',
        f'sp:"{xc_name}" cnt:chile',
        f'sp:"{xc_name}" cnt:argentina q:A',
        f'sp:"{xc_name}"',
    ):
        found += [normalize(r) for r in search(session, query, key, offline)]
        if any(score(r) >= 6 for r in found):
            break
    return found


def local_path(rec_id: str) -> Path | None:
    hits = sorted(SOUNDS_DIR.glob(f"XC{rec_id}-*"))
    return next((p for p in hits if p.suffix != ".part"), None)


def ensure_file(session, rec: dict) -> Path | None:
    path = local_path(rec["id"])
    if path:
        return path
    if not rec.get("fileUrl"):
        return None
    path = SOUNDS_DIR / f"XC{rec['id']}-audio.mp3"
    tmp = path.with_suffix(".part")
    with session.get(rec["fileUrl"], stream=True, timeout=180) as response:
        if not response.ok:
            print(f"  No se pudo descargar XC{rec['id']} ({response.status_code})")
            return None
        with tmp.open("wb") as output:
            for chunk in response.iter_content(chunk_size=1 << 18):
                output.write(chunk)
    tmp.replace(path)
    return path


# --- Audio -------------------------------------------------------------------


def decode(path: Path) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(RATE), "-f", "f32le", "-"],
        check=True,
        capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def frame_scores(signal: np.ndarray, hop: int = 512, size: int = 1024) -> np.ndarray:
    """Energía en la banda de las aves × tonalidad (1 − planitud espectral), por cuadro."""
    n = 1 + max(0, len(signal) - size) // hop
    idx = np.arange(size)[None, :] + hop * np.arange(n)[:, None]
    frames = signal[np.minimum(idx, len(signal) - 1)] * np.hanning(size)
    mag = np.abs(np.fft.rfft(frames, axis=1))
    freqs = np.fft.rfftfreq(size, 1 / RATE)
    band = mag[:, (freqs >= BAND[0]) & (freqs <= BAND[1])] + 1e-9
    energy = (band**2).sum(axis=1)
    flatness = np.exp(np.log(band).mean(axis=1)) / band.mean(axis=1)
    return energy * (1 - flatness) ** 2


def best_start(signal: np.ndarray, seconds: float) -> int:
    size = int(seconds * RATE)
    if len(signal) <= size:
        return 0
    hop = 512
    scores = frame_scores(signal, hop)
    width = max(1, size // hop)
    sums = np.convolve(scores, np.ones(width), "valid")
    return min(int(np.argmax(sums)) * hop, len(signal) - size)


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


def make_clips(source: Path, rec_id: str, start: float | None = None) -> float:
    signal = decode(source)
    # Pasa-altos suave: quita ruido de viento/manejo.
    signal = np.append(signal[0], signal[1:] - 0.965 * signal[:-1])
    size = int(CLIP_SECONDS * RATE)
    s0 = int(start * RATE) if start is not None else best_start(signal, CLIP_SECONDS)
    clip = finish(signal[s0 : s0 + size], 0.2, 0.5)
    g0 = best_start(clip, GRAIN_SECONDS)
    grain = finish(clip[g0 : g0 + int(GRAIN_SECONDS * RATE)], 0.03, 0.3)
    encode(clip, AUDIO_DIR / f"XC{rec_id}.mp3", "64k")
    encode(grain, AUDIO_DIR / f"XC{rec_id}-g.mp3", "64k")
    return round(len(clip) / RATE, 2)


# --- Principal ---------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--no-download", action="store_true", help="No consultar Xeno-canto; usar solo caché y sounds/.")
    parser.add_argument("--dry-run", action="store_true", help="Mostrar cobertura y faltantes sin descargar ni escribir.")
    args = parser.parse_args()

    species = load_json(DATA_DIR / "species.json", [])
    by_id = {s["id"]: s for s in species}
    by_sci = {s["sciName"]: s for s in species}
    synonyms = load_json(SYNONYMS_PATH, {}).get("synonyms", {})
    overrides = load_json(OVERRIDES_PATH, {})
    to_gbif = {v["xc"]: k for k, v in synonyms.items()}
    xc_name = lambda sci: synonyms.get(sci, {}).get("xc", sci)  # noqa: E731

    targets = {by_id[i]["sciName"] for i in visible_species()} | set(LAYER_SPECIES.values())

    # Candidatas locales del manifiesto original.
    local: dict[str, list[dict]] = {}
    for item in load_json(MANIFEST_PATH, {"species": []}).get("species", []):
        sci = to_gbif.get(item["scientificName"], item["scientificName"])
        for r in item.get("recordings", []):
            rec = {**r, "id": str(r["id"]), "seconds": 0}
            local.setdefault(sci, []).append(rec)

    print(f"Especies objetivo (visibles sin expandir + voces): {len(targets)}")
    if args.dry_run:
        previous = {c["sciName"] for c in load_json(CLIPS_PATH, {"clips": []})["clips"]}
        print(f"Con clip hoy: {len(targets & previous)} · faltan: {len(targets - previous)}")
        for sci in sorted(targets - previous, key=lambda s: by_sci[s]["comName"])[:40]:
            print(f"  {by_sci[sci]['comName']:30s} {xc_name(sci)}")
        return

    key = None if args.no_download else read_api_key()
    if not args.no_download and not key:
        raise SystemExit("Falta la key de Xeno-canto (api_sounds en .env o en el entorno).")
    SOUNDS_DIR.mkdir(exist_ok=True)
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)

    clips, missing = [], []
    with requests.Session() as session:
        for n, sci in enumerate(sorted(targets, key=lambda s: by_sci[s]["id"]), start=1):
            rule = overrides.get(sci, {})
            excluded = {str(x) for x in rule.get("exclude", [])}
            cands = [r for r in local.get(sci, []) if local_path(r["id"])]
            cands += remote_candidates(session, xc_name(sci), key, args.no_download)
            cands = [r for r in {r["id"]: r for r in cands}.values() if r["id"] not in excluded]
            if rule.get("id"):
                cands = [r for r in cands if r["id"] == str(rule["id"])] or cands
            cands.sort(key=lambda r: (-score(r), -(local_path(r["id"]) is not None)))
            chosen = None
            for rec in cands[:3]:
                try:
                    path = ensure_file(session, rec)
                    if path:
                        seconds = make_clips(path, rec["id"], rule.get("start"))
                        chosen = (rec, seconds)
                        break
                except (requests.RequestException, subprocess.CalledProcessError, ValueError) as error:
                    print(f"  XC{rec['id']}: {type(error).__name__}")
            name = by_sci[sci]["comName"]
            if not chosen:
                missing.append(name)
                print(f"[{n}/{len(targets)}] – {name}: sin grabación")
                continue
            rec, seconds = chosen
            print(f"[{n}/{len(targets)}] ✓ {name}: XC{rec['id']} ({rec.get('country')}, {rec.get('type')}, q {rec.get('quality')})")
            clips.append(
                {
                    "sciName": sci,
                    "id": rec["id"],
                    "clip": f"audio/XC{rec['id']}.mp3",
                    "grain": f"audio/XC{rec['id']}-g.mp3",
                    "seconds": seconds,
                    "url": rec.get("sourceUrl") or f"https://xeno-canto.org/{rec['id']}",
                    "type": rec.get("type"),
                    "quality": rec.get("quality"),
                    "country": rec.get("country"),
                    "recordist": rec.get("recordist"),
                    "license": rec.get("license"),
                }
            )
            # Checkpoint: si se corta, lo ya hecho queda enlazable.
            if n % 20 == 0:
                write_clips(clips)
    write_clips(clips)
    # Se borran al final solo los clips que ya no se usan. Borrar todo al inicio y recrearlo hacía que
    # iCloud Drive (Documents sincronizado) generara copias de conflicto "XC… 2.mp3".
    used = {Path(c[k]).name for c in clips for k in ("clip", "grain")}
    for old in AUDIO_DIR.glob("*.mp3"):
        if old.name not in used:
            old.unlink()
    total = sum(p.stat().st_size for p in AUDIO_DIR.glob("*.mp3"))
    print(f"{len(clips)} especies con clip · web/audio/ = {total / 1024 / 1024:.1f} MB · sin grabación: {len(missing)}")
    if missing:
        print("  " + ", ".join(sorted(missing)))
    print("Siguiente paso: python3 build_web_data.py (enlaza los clips en web/data/sounds.json)")


def write_clips(clips: list[dict]) -> None:
    payload = {
        "description": "Clips recortados (tramo con más energía de ave) de grabaciones de Xeno-canto. "
        "Cada entrada conserva autor, licencia y enlace a la grabación original.",
        "layers": LAYER_SPECIES,
        "clips": sorted(clips, key=lambda c: c["sciName"]),
    }
    CLIPS_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()

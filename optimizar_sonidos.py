"""Reduce audios PCM disfrazados de MP3 para uso web.

Uso:
    python3 optimizar_sonidos.py --dry-run
    python3 optimizar_sonidos.py

La conversión mantiene el nombre de cada archivo para no romper
``sounds/manifest.json``. Solo procesa audio PCM o archivos que superen el
límite indicado.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from pathlib import Path

SOUNDS_DIR = Path(__file__).resolve().parent / "sounds"
PCM_CODECS = {"pcm_s16le", "pcm_s24le", "pcm_s32le", "pcm_f32le", "pcm_f64le"}


def probe(path: Path) -> dict:
    command = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_name,sample_rate,channels,bit_rate",
        "-of",
        "json",
        str(path),
    ]
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    payload = json.loads(result.stdout)
    stream = payload.get("streams", [{}])[0]
    return {
        "codec": stream.get("codec_name", ""),
        "sample_rate": stream.get("sample_rate", ""),
        "channels": stream.get("channels", ""),
        "bit_rate": int(stream.get("bit_rate") or 0),
        "duration": float(payload.get("format", {}).get("duration") or 0),
    }


def format_size(size: int) -> str:
    return f"{size / 1024 / 1024:.1f} MB"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--max-mb",
        type=float,
        default=10,
        help="También optimiza archivos que superen este tamaño (por defecto: 10 MB).",
    )
    parser.add_argument(
        "--quality",
        type=int,
        choices=range(0, 10),
        default=3,
        help="Calidad VBR de LAME: 0 es mayor calidad, 9 menor (por defecto: 3).",
    )
    parser.add_argument("--dry-run", action="store_true", help="Mostrar candidatos sin modificar archivos.")
    args = parser.parse_args()

    candidates = []
    for path in sorted(SOUNDS_DIR.glob("*.mp3")):
        info = probe(path)
        should_convert = info["codec"] in PCM_CODECS or path.stat().st_size > args.max_mb * 1024 * 1024
        if should_convert:
            candidates.append((path, info))

    print(f"Archivos revisados: {len(list(SOUNDS_DIR.glob('*.mp3')))}")
    print(f"Candidatos a optimizar: {len(candidates)}")
    for path, info in candidates:
        print(
            f"{format_size(path.stat().st_size):>9} -> {path.name} | "
            f"{info['codec']} {info['sample_rate']} Hz, {info['channels']} canal(es), "
            f"{info['duration']:.1f}s"
        )
    if args.dry_run:
        return

    for index, (path, _) in enumerate(candidates, start=1):
        with tempfile.NamedTemporaryFile(suffix=".mp3", dir=SOUNDS_DIR, delete=False) as temporary:
            temporary_path = Path(temporary.name)
        command = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(path),
            "-ar",
            "44100",
            "-c:a",
            "libmp3lame",
            "-q:a",
            str(args.quality),
            str(temporary_path),
        ]
        try:
            subprocess.run(command, check=True)
            temporary_path.replace(path)
        finally:
            temporary_path.unlink(missing_ok=True)
        print(f"[{index}/{len(candidates)}] {path.name}: {format_size(path.stat().st_size)}")

    print("Optimización completada; el manifiesto conserva los mismos nombres de archivo.")


if __name__ == "__main__":
    main()
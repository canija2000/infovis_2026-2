"""Reduce el ambiente de los clips permitidos y crea pistas para el mezclador.

Uso: python3 python_scripts/preparar_audio_mixer.py

Lee los clips de 6 s ya publicados, estima el fondo espectral por frecuencia y
atenúa lo que permanece entre los cantos. Conserva un piso de señal para evitar
artefactos bruscos. Las grabaciones con licencia ND no se modifican ni se
publican como pistas nuevas; el mezclador usa su clip existente.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
CLIPS = WEB / "audio" / "clips.json"
SOUNDS = WEB / "data" / "sounds.json"
OUT = WEB / "audio" / "mixer"
RATE = 22050
N_FFT = 2048
HOP = 512


def decode(path: Path) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(RATE), "-f", "f32le", "-"],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def encode(signal: np.ndarray, path: Path) -> None:
    temp = path.with_suffix(".tmp.mp3")
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(RATE), "-ac", "1", "-i", "-",
         "-c:a", "libmp3lame", "-b:a", "64k", str(temp)],
        input=signal.astype(np.float32).tobytes(), check=True,
    )
    temp.replace(path)


def smooth_axis(values: np.ndarray, width: int, axis: int) -> np.ndarray:
    """Promedio móvil con bordes replicados, sin depender de scipy."""
    before = width // 2
    after = width - before - 1
    pads = [(0, 0), (0, 0)]
    pads[axis] = (before, after)
    padded = np.pad(values, pads, mode="edge")
    sums = np.cumsum(padded, axis=axis, dtype=np.float64)
    zero_shape = list(sums.shape)
    zero_shape[axis] = 1
    sums = np.concatenate((np.zeros(zero_shape), sums), axis=axis)
    left = [slice(None), slice(None)]
    right = [slice(None), slice(None)]
    left[axis] = slice(0, -width)
    right[axis] = slice(width, None)
    return ((sums[tuple(right)] - sums[tuple(left)]) / width).astype(np.float32)


def clean(signal: np.ndarray) -> np.ndarray:
    length = len(signal)
    pad = N_FFT // 2
    padded = np.pad(signal, (pad, pad + HOP), mode="reflect")
    count = 1 + (len(padded) - N_FFT) // HOP
    frames = np.lib.stride_tricks.sliding_window_view(padded, N_FFT)[::HOP][:count]
    window = np.hanning(N_FFT + 1)[:-1].astype(np.float32)
    spectrum = np.fft.rfft(frames * window, axis=1)
    magnitude = np.abs(spectrum).astype(np.float32)

    # El percentil bajo estima río/viento persistentes. Suavizarlo entre bins
    # evita que una nota sostenida se interprete como fondo en una sola frecuencia.
    noise = np.percentile(magnitude, 25, axis=0).astype(np.float32)[None, :]
    noise = smooth_axis(noise, 9, 1)
    gain = np.clip(1 - 1.6 * noise / np.maximum(magnitude, 1e-7), 0.08, 1)
    gain = smooth_axis(smooth_axis(gain, 5, 0), 3, 1)

    # Atenuación gradual del viento grave, sin cortar por completo voces bajas.
    freqs = np.fft.rfftfreq(N_FFT, 1 / RATE)
    low_cut = np.clip((freqs - 120) / 230, 0.12, 1).astype(np.float32)
    spectrum *= gain * low_cut[None, :]

    rebuilt = np.zeros(len(padded), dtype=np.float64)
    weights = np.zeros(len(padded), dtype=np.float64)
    inverse = np.fft.irfft(spectrum, n=N_FFT, axis=1)
    for i, frame in enumerate(inverse):
        start = i * HOP
        rebuilt[start:start + N_FFT] += frame * window
        weights[start:start + N_FFT] += window**2
    result = (rebuilt[pad:pad + length] / np.maximum(weights[pad:pad + length], 1e-8)).astype(np.float32)
    result -= result.mean()
    rms = np.sqrt(np.mean(result**2))
    if rms > 0:
        result *= 0.1 / rms  # −20 dBFS, como los clips originales
    peak = np.max(np.abs(result))
    if peak > 0.89:
        result *= 0.89 / peak
    return result


def main() -> None:
    catalog = json.loads(CLIPS.read_text(encoding="utf-8"))
    sounds = json.loads(SOUNDS.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    cleaned = {}
    skipped = 0
    for clip in catalog["clips"]:
        if "-nd/" in (clip.get("license") or "").lower():
            clip.pop("mixer", None)
            skipped += 1
            continue
        source = WEB / clip["clip"]
        dest = OUT / f"XC{clip['id']}.mp3"
        encode(clean(decode(source)), dest)
        clip["mixer"] = dest.relative_to(WEB).as_posix()
        cleaned[str(clip["id"])] = clip["mixer"]
    for species in sounds["species"]:
        for recording in species["recordings"]:
            recording.pop("mixer", None)
            if str(recording["id"]) in cleaned:
                recording["mixer"] = cleaned[str(recording["id"])]
    CLIPS.write_text(json.dumps(catalog, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    SOUNDS.write_text(json.dumps(sounds, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(cleaned)} pistas limpiadas en {OUT.relative_to(ROOT)}; {skipped} licencias ND conservan el clip anterior")


if __name__ == "__main__":
    main()

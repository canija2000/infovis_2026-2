"""Análisis de los clips de canto (los usa el loop sonoro de la portada).

Para cada especie con grabación (web/data/sounds.json) mide su clip original (`src`) y su
pista limpiada del mezclador (`mixer`), por cuadros de ~23 ms:

    banda      la de mayor contraste entre grave (250–1000 Hz), media (800–3000),
               aves (1,5–9 kHz) y aguda (3–11 kHz): palomas y tórtolas arrullan grave.
    contraste  dB entre los cuadros más fuertes (p95) y el fondo (p20) en esa banda:
               cuánto sobresale el canto. Bajo (< ~15 dB) = casi solo fondo.
    actividad  % de cuadros que superan el fondo en ≥ 10 dB: cuánto del clip es canto.
    retumbo    dB de la energía bajo 200 Hz respecto de la banda del canto: tráfico,
               viento o río (alto = fondo dominante).
    ventanas   inicio (s) de hasta 3 tramos de 2 s, sin solaparse, con más canto
               (energía × tonalidad, el mismo criterio de preparar_audio_web.py).
               El loop toca desde ahí en vez de desde un punto al azar.

Salida: python_scripts/audio_review/analisis.json (versionado). Lo leen
build_loop_data.py y la página de revisión (python_scripts/revisar_audio.py).

Uso (desde la raíz del repo; requiere ffmpeg y numpy):
    python3 python_scripts/analizar_audio_loop.py
"""

import json
import subprocess
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
OUT = ROOT / "python_scripts" / "audio_review" / "analisis.json"
RATE = 22050
HOP = 512
SIZE = 1024
BAND = (1500, 9000)
WINDOW = 2.0


def decode(path: Path) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(RATE), "-f", "f32le", "-"],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def frames_spectrum(signal: np.ndarray):
    n = 1 + max(0, len(signal) - SIZE) // HOP
    idx = np.arange(SIZE)[None, :] + HOP * np.arange(n)[:, None]
    frames = signal[np.minimum(idx, len(signal) - 1)] * np.hanning(SIZE)
    mag = np.abs(np.fft.rfft(frames, axis=1))
    freqs = np.fft.rfftfreq(SIZE, 1 / RATE)
    return mag, freqs


BANDS = {"grave": (250, 1000), "media": (800, 3000), "aves": (1500, 9000), "aguda": (3000, 11000)}


def band_stats(mag, freqs, band):
    sel = mag[:, (freqs >= band[0]) & (freqs < band[1])] + 1e-9
    energy = (sel**2).sum(axis=1)
    db = 10 * np.log10(energy)
    flatness = np.exp(np.log(sel).mean(axis=1)) / sel.mean(axis=1)
    return energy, db, flatness


def measure(path: Path) -> dict:
    signal = decode(path)
    mag, freqs = frames_spectrum(signal)
    # Banda propia de la especie: la de mayor contraste en este clip (palomas: grave; aves pequeñas: aves/aguda).
    contrasts = {}
    for name, band in BANDS.items():
        _, db, _ = band_stats(mag, freqs, band)
        contrasts[name] = float(np.percentile(db, 95) - np.percentile(db, 20))
    name = max(contrasts, key=contrasts.get)
    energy, db, flatness = band_stats(mag, freqs, BANDS[name])
    floor = np.percentile(db, 20)
    low = mag[:, (freqs >= 40) & (freqs < 200)] + 1e-9
    score = energy * (1 - flatness) ** 2
    width = max(1, int(WINDOW * RATE / HOP))
    sums = np.convolve(score, np.ones(width), "valid") if len(score) > width else np.array([score.sum()])
    windows = []
    for i in np.argsort(sums)[::-1]:
        if all(abs(int(i) - w) >= width for w in windows):
            windows.append(int(i))
        if len(windows) == 3:
            break
    return {
        "seconds": round(len(signal) / RATE, 2),
        "band": name,
        "contrast": round(contrasts[name], 1),
        "activity": round(float(np.mean(db > floor + 10) * 100), 1),
        "rumble": round(float(10 * np.log10((low**2).sum() / energy.sum())), 1),
        "windows": sorted(round(w * HOP / RATE, 2) for w in windows),
    }


def main() -> None:
    loop = json.loads((WEB / "data" / "loop.json").read_text(encoding="utf-8"))
    sounds = json.loads((WEB / "data" / "sounds.json").read_text(encoding="utf-8"))
    species = {s["id"]: s for s in json.loads((WEB / "data" / "species.json").read_text(encoding="utf-8"))}
    classes = ["residente", "visitante_estival", "visitante_invernal", "ocasional"]
    result = {}
    # Todas las especies con grabación: si una se excluye del loop, la que entra en su lugar ya está medida.
    for e in sounds["species"]:
        if not e["recordings"]:
            continue
        sid, rec = str(e["sid"]), e["recordings"][0]
        sp = species[e["sid"]]
        entry = {"name": sp["comName"], "sci": sp["sciName"], "cls": classes.index(sp["class"]), "xc": rec["id"], "url": rec["url"],
                 "recordist": rec.get("recordist"), "license": rec.get("license")}
        for kind in ("src", "mixer"):
            if rec.get(kind):
                entry[kind] = {"path": rec[kind], **measure(WEB / rec[kind])}
        # En qué ámbitos suena en el loop (para priorizar la revisión) y con cuántas copias como máximo.
        entry["scopes"] = sorted({int(s) for s, months in loop["scopes"].items()
                                  for m in months if any(v[0] == int(sid) for v in m)})
        entry["maxCopies"] = max((v[1] for months in loop["scopes"].values() for m in months for v in m
                                  if v[0] == int(sid)), default=0)
        result[sid] = entry
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {len(result)} especies")


if __name__ == "__main__":
    main()

"""Banda sonora de la maqueta animada (misma línea de tiempo que maqueta_blender.py).

    python3 docs/proceso/maqueta/sonido_maqueta.py   ->  render/sonido.wav (48 kHz estéreo)

Mapeo:
  - Coro: voces = 4 + (verano + invierno) / 10, lo mismo que dice la pantalla del celular.
  - Residentes: 4 voces fijas (Chincol, Diuca, Loica, Tórtola) al centro, con ritmo regular
    en cada pulso: lo que no se va suena siempre igual.
  - Visitantes: granos de su propio canto, en semicorcheas al azar; verano a la izquierda
    (donde está su dial) e invierno a la derecha. Entran y salen con fundidos de 0,3 s.
  - Servos: zumbido mientras se mueve cada brazo, más fuerte cuanto mayor es el giro, en el
    lado de su dial. Perilla: un clic al pasar el retén y otro al asentar.
Requiere numpy y ffmpeg.
"""
import json
import math
import os
import subprocess
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.abspath(os.path.join(HERE, "..", "..", "..", "web"))
SR = 48000
FPS, INTRO, STEP, OUTRO = 30, 2.5, 2.2, 3.0
AUSTRAL = [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5]
DUR = round((INTRO + 11 * STEP + OUTRO) * FPS) / FPS
BEAT = STEP / 4  # 4 pulsos por mes

ov = json.load(open(os.path.join(WEB, "data", "overview.json")))
COUNTS, NAMES, SOUND = ov["months"], ov["names"], ov["sound"]


def step_time(k):
    return INTRO + (k - 1) * STEP


def month_span(k):
    """Intervalo en que la pantalla muestra el mes austral k."""
    start = 0.0 if k == 0 else step_time(k) + 0.15
    end = DUR if k == 11 else step_time(k + 1) + 0.15
    return start, end


def clip(name):
    i = NAMES.index(name)
    return SOUND[str(ov["species"][i][0])]


def pool(cls, first):
    rows = [(NAMES[i], SOUND[str(s[0])]) for i, s in enumerate(ov["species"]) if s[1] == cls and str(s[0]) in SOUND]
    rows.sort(key=lambda r: (r[0] not in first, first.index(r[0]) if r[0] in first else 0))
    return [r[1] for r in rows]


def decode(rel):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", os.path.join(WEB, rel), "-ac", "1", "-ar", str(SR),
                          "-f", "f32le", "-"], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).copy()
    rms = np.sqrt(np.mean(x ** 2)) or 1.0
    x *= 0.1 / rms  # todos los granos al mismo nivel RMS
    n = min(len(x), int(0.012 * SR))
    x[:n] *= np.linspace(0, 1, n)
    x[-n:] *= np.linspace(1, 0, n)
    return x


out = np.zeros((int(DUR * SR) + SR, 2), dtype=np.float64)


def add(sig, t, pan, gain):
    i = int(t * SR)
    if i >= len(out):
        return
    sig = sig[: len(out) - i]
    left, right = math.cos((pan + 1) * math.pi / 4), math.sin((pan + 1) * math.pi / 4)
    out[i:i + len(sig), 0] += sig * gain * left
    out[i:i + len(sig), 1] += sig * gain * right


def level(t, start, end, fade=0.3):
    return max(0.0, min(1.0, (t - start) / fade + 1, (end - t) / fade + 1)) if start <= t <= end else 0.0


rng = np.random.default_rng(214)
residents = [decode(clip(n)) for n in ("Chincol", "Diuca común", "Loica", "Tórtola")]
summer = [decode(c) for c in pool(1, ["Run-run"])[:11]]
winter = [decode(c) for c in pool(2, ["Picaflor chico", "Viudita"])[:3]]

# residentes: cada voz en una posición fija del pulso, siempre
n_beats = int(DUR / BEAT) + 1
for b in range(n_beats):
    for v, g in enumerate(residents):
        t = b * BEAT + v * BEAT / 4
        if t < DUR - 0.5:
            add(g, t, (v - 1.5) * 0.12, 0.33)

# visitantes: voz v activa en el mes k si v < verano/10 (o invierno/10), granos en semicorcheas
for k in range(12):
    m = AUSTRAL[k]
    start, end = month_span(k)
    for grains, n, pan in ((summer, COUNTS[m][1] / 10, -0.65), (winter, COUNTS[m][2] / 10, 0.65)):
        for v, g in enumerate(grains):
            frac = min(1.0, n - v)  # la última voz entra a medias
            if frac <= 0:
                continue
            t = start
            while t < end:
                t += BEAT / 4 * rng.integers(2, 6)
                amp = level(t, start, end) * frac * rng.uniform(0.6, 1.0)
                if amp > 0 and t < DUR - 0.5:
                    add(g, t, pan + rng.uniform(-0.15, 0.15), 0.3 * amp)


def servo_buzz(seconds, intensity):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    f = 160 + 60 * intensity * np.sin(np.pi * t / seconds)
    ph = 2 * np.pi * np.cumsum(f) / SR
    sig = sum(np.sin(h * ph) / h for h in range(1, 8)) + 0.15 * rng.standard_normal(n)
    env = np.sin(np.pi * t / seconds) ** 0.6
    return sig * env * 0.05 * (0.3 + intensity)


def click(gain):
    n = int(0.03 * SR)
    sig = rng.standard_normal(n) * np.exp(-np.arange(n) / (0.003 * SR))
    return np.convolve(sig, np.ones(6) / 6, mode="same") * gain


for k in range(1, 12):
    t = step_time(k)
    prev_m, m = AUSTRAL[k - 1], AUSTRAL[k]
    add(click(0.5), t + 0.25, 0.8, 1.0)
    add(click(0.3), t + 0.4, 0.8, 1.0)
    for idx, pan in ((1, -0.7), (2, 0.7)):
        delta = abs(COUNTS[m][idx] - COUNTS[prev_m][idx]) / 106
        if delta > 0:
            add(servo_buzz(1.1, min(1.0, delta * 4)), t + 0.2, pan, 1.0)

mix = out[: int(DUR * SR)]
fade = int(1.5 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
mix *= 10 ** (-1 / 20) / np.max(np.abs(mix))  # pico a −1 dBFS

os.makedirs(os.path.join(HERE, "render"), exist_ok=True)
path = os.path.join(HERE, "render", "sonido.wav")
with wave.open(path, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print(path, f"{DUR:.2f} s")

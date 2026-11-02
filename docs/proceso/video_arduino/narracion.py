"""Narración con la voz de Gemini (TTS) y línea de tiempo del video.

    GEMINI_API_KEY=… python3 docs/proceso/video_arduino/narracion.py

Por cada escena de guion.py genera audio/<id>.wav (se reutiliza si el texto no cambió), mide su
duración y escribe:
  tiempos.json      inicio y duración de cada escena + el segundo de cada marca
  audio/voz.wav     la narración completa, con los silencios entre escenas
  subtitulos.srt    la narración en frases, con sus tiempos
Las marcas se ubican por la posición de su texto dentro de la narración (aprox. ±0,3 s).
"""
import base64
import hashlib
import json
import os
import re
import sys
import time
import urllib.request
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from guion import ESCENAS, ESTILO, VOZ  # noqa: E402

AUDIO = os.path.join(HERE, "audio")
RATE = 24000
ANTES, DESPUES = 0.6, 0.9  # silencio antes y después de cada escena (s)
URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent"


def sintetizar(texto, destino):
    clave = os.environ["GEMINI_API_KEY"]
    cuerpo = json.dumps({
        "contents": [{"parts": [{"text": ESTILO + texto}]}],
        "generationConfig": {"responseModalities": ["AUDIO"],
                             "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": VOZ}}}},
    }).encode()
    for intento in range(4):
        try:
            req = urllib.request.Request(URL, cuerpo, {"x-goog-api-key": clave, "Content-Type": "application/json"})
            datos = json.load(urllib.request.urlopen(req, timeout=120))
            pcm = base64.b64decode(datos["candidates"][0]["content"]["parts"][0]["inlineData"]["data"])
            break
        except Exception as e:  # límites de uso o respuestas sin audio: reintentar con espera
            print(f"  reintento {intento + 1}: {e}")
            time.sleep(5 * (intento + 1))
    else:
        raise SystemExit(f"no se pudo sintetizar: {texto[:40]}…")
    with wave.open(destino, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm)


def leer(ruta):
    with wave.open(ruta) as w:
        return w.readframes(w.getnframes())


def srt_tiempo(s):
    h, m = int(s // 3600), int(s % 3600 // 60)
    return f"{h:02d}:{m:02d}:{s % 60:06.3f}".replace(".", ",")


def main():
    os.makedirs(AUDIO, exist_ok=True)
    cache_ruta = os.path.join(AUDIO, "cache.json")
    cache = json.load(open(cache_ruta)) if os.path.exists(cache_ruta) else {}
    escenas, voz, subs, t = [], b"", [], 0.0
    for esc in ESCENAS:
        ruta = os.path.join(AUDIO, f"{esc['id']}.wav")
        firma = hashlib.sha1((VOZ + ESTILO + esc["texto"]).encode()).hexdigest()
        if cache.get(esc["id"]) != firma or not os.path.exists(ruta):
            print(f"sintetizando {esc['id']}…")
            sintetizar(esc["texto"], ruta)
            cache[esc["id"]] = firma
            json.dump(cache, open(cache_ruta, "w"), indent=1)
        pcm = leer(ruta)
        dur = len(pcm) / 2 / RATE
        habla = t + ANTES
        texto = esc["texto"]
        marcas = {}
        for clave, frase in esc["marcas"].items():
            i = texto.find(frase)
            assert i >= 0, f"marca «{frase}» no está en la escena {esc['id']}"
            marcas[clave] = round(habla + dur * i / len(texto), 2)
        largo = ANTES + dur + DESPUES
        escenas.append({"id": esc["id"], "titulo": esc["titulo"], "inicio": round(t, 2),
                        "habla": round(habla, 2), "duracion": round(largo, 2), "marcas": marcas})
        # subtítulos: una línea por frase, con tiempo proporcional a su largo
        frases = [f.strip() for f in re.split(r"(?<=[.:])\s+", texto) if f.strip()]
        pos = 0
        for f in frases:
            a = habla + dur * pos / len(texto)
            pos += len(f) + 1
            b = habla + dur * min(1.0, pos / len(texto))
            subs.append((a, b, f))
        voz += b"\0\0" * int(ANTES * RATE) + pcm + b"\0\0" * int(DESPUES * RATE)
        t += largo
        print(f"  {esc['id']:<11} {dur:5.1f} s de voz, escena de {largo:5.1f} s")
    with wave.open(os.path.join(AUDIO, "voz.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(voz)
    json.dump({"total": round(t, 2), "escenas": escenas}, open(os.path.join(HERE, "tiempos.json"), "w"),
              indent=1, ensure_ascii=False)
    with open(os.path.join(HERE, "subtitulos.srt"), "w") as f:
        for n, (a, b, txt) in enumerate(subs, 1):
            f.write(f"{n}\n{srt_tiempo(a)} --> {srt_tiempo(b)}\n{txt}\n\n")
    print(f"total: {t:.1f} s")


if __name__ == "__main__":
    main()

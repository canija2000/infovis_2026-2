"""Vuelve a recortar clips cuyo tramo quedó casi sin canto, buscando en la banda de cada especie.

preparar_audio_web.py elige el tramo de 6 s con más energía en 1,5–9 kHz. Eso falla
en especies de voz grave (palomas, tórtolas: arrullos de ~300–900 Hz): el tramo
elegido puede tener solo fondo, y además el pre-énfasis atenuaba el arrullo.

Para cada especie (por defecto, las del loop de la portada):
  1. baja la grabación original de Xeno-canto (caché en cache_xenocanto/, no versionada);
  2. elige la banda donde la grabación completa tiene más contraste (p95 − p20 de la
     energía por cuadro, en dB) entre grave, media, aves y aguda;
  3. calcula el mejor tramo de 6 s en esa banda y lo compara con el clip publicado,
     medido en la misma banda;
  4. si el clip publicado es débil (< MAX_CURRENT dB) y el nuevo tramo mejora el
     contraste en ≥ MIN_GAIN dB, rehace el clip, el grano
     y la pista del mezclador (si la licencia lo permite), y anota en
     audio_overrides.json la banda y el inicio, para que preparar_audio_web.py lo repita.

Uso (desde la raíz del repo; requiere ffmpeg, numpy y requests):
    python3 python_scripts/recortar_audio_banda.py            # especies del loop
    python3 python_scripts/recortar_audio_banda.py --dry-run  # solo informa
    python3 python_scripts/recortar_audio_banda.py --all      # todos los clips publicados
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import preparar_audio_mixer as mixer  # noqa: E402
import preparar_audio_web as pw  # noqa: E402

BANDS = {"grave": (250, 1000), "media": (800, 3000), "aves": pw.BAND, "aguda": (3000, 11000)}
MIN_GAIN = 6.0  # dB de mejora para rehacer un clip
MAX_CURRENT = 20.0  # dB: solo se tocan clips débiles; uno con más contraste ya tiene canto claro


def contrast(signal: np.ndarray, band) -> float:
    mag_scores = pw.frame_scores(signal, band_hz=band)  # energía × tonalidad
    db = 10 * np.log10(mag_scores + 1e-12)
    return float(np.percentile(db, 95) - np.percentile(db, 20))


def original(rec_id: str) -> Path | None:
    path = pw.CACHE_DIR / f"XC{rec_id}.mp3"
    if path.exists() and path.stat().st_size > 0:
        return path
    pw.CACHE_DIR.mkdir(exist_ok=True)
    try:
        r = requests.get(f"https://xeno-canto.org/{rec_id}/download", timeout=60)
        r.raise_for_status()
    except requests.RequestException as err:
        print(f"  XC{rec_id}: no se pudo bajar ({err})")
        return None
    path.write_bytes(r.content)
    return path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--all", action="store_true", help="todos los clips de web/audio/clips.json")
    args = ap.parse_args()

    catalog = json.loads(pw.CLIPS_PATH.read_text(encoding="utf-8"))
    overrides = pw.load_json(pw.OVERRIDES_PATH, {})
    if args.all:
        targets = catalog["clips"]
    else:
        loop = json.loads((pw.DATA_DIR / "loop.json").read_text(encoding="utf-8"))
        sounds = json.loads((pw.DATA_DIR / "sounds.json").read_text(encoding="utf-8"))
        ids = {e["recordings"][0]["id"] for e in sounds["species"] if e["recordings"] and str(e["sid"]) in loop["species"]}
        targets = [c for c in catalog["clips"] if c["id"] in ids]

    changed = []
    for clip in targets:
        rec_id, sci = clip["id"], clip["sciName"]
        if overrides.get(sci, {}).get("start") is not None:
            continue  # ya fijado a mano
        src = original(rec_id)
        if src is None:
            continue
        full = pw.decode(src)
        scores = {name: contrast(full, band) for name, band in BANDS.items()}
        name = max(scores, key=scores.get)
        band = BANDS[name]
        current = contrast(pw.decode(pw.AUDIO_DIR / f"XC{rec_id}.mp3"), band)
        start = pw.best_start(full, pw.CLIP_SECONDS, band) / pw.RATE
        size = int(pw.CLIP_SECONDS * pw.RATE)
        s0 = int(start * pw.RATE)
        new = contrast(full[s0 : s0 + size], band)
        gain = new - current
        redo = current < MAX_CURRENT and gain >= MIN_GAIN
        flag = "→ recortar" if redo else ""
        print(f"{sci:34s} XC{rec_id:>8s} banda {name:6s} actual {current:5.1f} dB · nuevo {new:5.1f} dB (desde {start:5.1f} s) {flag}")
        if not redo or args.dry_run:
            continue
        pw.make_clips(src, rec_id, start, None if name == "aves" else band)
        if clip.get("mixer"):
            mixer.encode(mixer.clean(mixer.decode(pw.AUDIO_DIR / f"XC{rec_id}.mp3")), pw.AUDIO_DIR.parent / clip["mixer"])
        rule = overrides.setdefault(sci, {})
        rule.update({"id": rec_id, "start": round(start, 2)})
        if name != "aves":
            rule["band"] = list(band)
        rule["nota"] = (f"recortar_audio_banda.py: el tramo anterior tenía {current:.0f} dB de contraste en la banda "
                        f"{name}; el nuevo, {new:.0f} dB")
        changed.append(sci)

    if changed and not args.dry_run:
        pw.OVERRIDES_PATH.write_text(json.dumps(overrides, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"\n{len(changed)} clips recortados de nuevo" + (f": {', '.join(changed)}" if changed else ""))


if __name__ == "__main__":
    main()

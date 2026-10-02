"""Loop sonoro de la portada: web/data/loop.json.

Un mes = 4 compases. En cada compás suenan cantos reales (Xeno-canto) de las
especies presentes ese mes en el ámbito elegido (Chile o una región). Cuanto
más frecuente es una especie ese mes, más copias de su canto suenan en cada
compás (1 a MAX_COPIES): si hay muchas diucas, en vez de una diuca suenan cuatro.

Selección por ámbito y mes, entre las especies presentes (bit del mes en
`present`), no ocasionales y con grabación:
    peso = lugar-días del mes (celdas de ~5 km × fechas con registro, suma 2017–2024;
           gbif/staging/place_days.json de python_scripts/gbif/loop_aggregate.py).
           Mide qué tan extendida está la especie. La frecuencia de detección
           (‰ de días con registro) no sirve aquí: se satura en ~1.000 ‰ para
           todas las especies comunes. Sin ese archivo se usa como respaldo.
    - las TOP_ALL de mayor peso, y además
    - las TOP_VISITORS visitantes (de verano o de invierno) de mayor peso que no
      hayan entrado, para que la ola estacional se oiga aunque sean menos comunes.
    copias = ⌈MAX_COPIES × peso / peso máximo del mes⌉, entre 1 y MAX_COPIES
    (la más extendida del mes suena 4 veces por compás; una con un cuarto de su
    extensión, 1).

Revisión de audio (python_scripts/audio_review/):
    analisis.json    mejores tramos de 2 s de cada clip (analizar_audio_loop.py): el
                     loop toca desde ahí y no desde un punto al azar del clip.
    decisiones.json  lo que decidió una persona al escuchar (revisar_audio.py):
                     "excluir" saca la especie del loop (entra la siguiente);
                     "original" usa el clip sin limpiar en vez de la pista del mezclador.

Uso (desde la raíz del repo, después de build_web_data.py):
    python3 python_scripts/build_loop_data.py
"""

import json
import math
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "web" / "data"
PLACE_DAYS = ROOT / "gbif" / "staging" / "place_days.json"
REVIEW = ROOT / "python_scripts" / "audio_review"
TOP_ALL = 6
TOP_VISITORS = 3
MAX_COPIES = 4


def main() -> None:
    species = {s["id"]: s for s in json.loads((DATA / "species.json").read_text(encoding="utf-8"))}
    typical = json.loads((DATA / "typical_year.json").read_text(encoding="utf-8"))
    sounds = json.loads((DATA / "sounds.json").read_text(encoding="utf-8"))

    analysis = json.loads((REVIEW / "analisis.json").read_text(encoding="utf-8")) if (REVIEW / "analisis.json").exists() else {}
    decisions = json.loads((REVIEW / "decisiones.json").read_text(encoding="utf-8")) if (REVIEW / "decisiones.json").exists() else {}
    clip, windows = {}, {}
    for e in sounds["species"]:
        if not e["recordings"]:
            continue
        state = decisions.get(str(e["sid"]), {}).get("estado")
        if state == "excluir":
            continue
        rec = e["recordings"][0]
        # Pista con menos ambiente (mezclador) si existe y nadie pidió el original; si no, el clip original.
        kind = "mixer" if rec.get("mixer") and state != "original" else "src"
        clip[e["sid"]] = rec[kind]
        windows[e["sid"]] = analysis.get(str(e["sid"]), {}).get(kind, {}).get("windows", [])

    rows = defaultdict(list)  # rid -> filas [sid, rid, cls, peak, phase, amp, present, freq×12, prof×12, years×12]
    for r in typical["rows"]:
        if r[2] in (0, 1, 2) and r[0] in clip:
            rows[r[1]].append(r)

    place = json.loads(PLACE_DAYS.read_text()) if PLACE_DAYS.exists() else None
    if place is None:
        print("aviso: sin place_days.json; se usa la frecuencia de detección como peso")

    used = set()
    scopes = {}
    for rid, rs in sorted(rows.items()):
        months = []
        for m in range(12):
            here = []
            for r in rs:
                if not (r[6] >> m) & 1:
                    continue
                if place is not None:
                    weight = place.get(str(rid), {}).get(str(r[0]), [0] * 12)[m] / 8
                else:
                    weight = r[7 + m] * r[31 + m] / 8
                if weight > 0:
                    here.append((weight, r[0], r[2]))
            here.sort(reverse=True)
            chosen = here[:TOP_ALL]
            taken = {sid for _, sid, _ in chosen}
            chosen += [h for h in here if h[2] != 0 and h[1] not in taken][:TOP_VISITORS]
            top = max((w for w, _, _ in chosen), default=1)
            months.append([[sid, max(1, min(MAX_COPIES, math.ceil(MAX_COPIES * w / top)))] for w, sid, _ in chosen])
            used.update(sid for _, sid, _ in chosen)
        scopes[str(rid)] = months

    payload = {
        "note": "Por ámbito (0 = Chile, 1–16 regiones) y mes: [sid, copias por compás]. win = inicios (s) de los "
        "mejores tramos de 2 s del clip. "
        "Generado por python_scripts/build_loop_data.py.",
        "barSeconds": 3,
        "barsPerMonth": 4,
        "maxCopies": MAX_COPIES,
        "species": {
            str(sid): {"name": species[sid]["comName"], "cls": ["residente", "visitante_estival", "visitante_invernal"].index(species[sid]["class"]) if species[sid]["class"] != "ocasional" else 3, "clip": clip[sid], "win": windows[sid]}
            for sid in sorted(used)
        },
        "scopes": scopes,
    }
    out = DATA / "loop.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{out.relative_to(ROOT)}: {out.stat().st_size / 1024:.0f} KB · {len(used)} especies con canto")
    for m in (0, 6):
        print(" Chile", m + 1, [(species[s]["comName"], c) for s, c in scopes["0"][m]])


if __name__ == "__main__":
    main()

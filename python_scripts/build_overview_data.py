"""Datos livianos de la portada (web/index.html): web/data/overview.json.

Se derivan de los archivos que ya genera build_web_data.py, sin volver a leer GBIF:
    months    especies presentes en Chile por mes y clase [residentes, verano, invierno]
              (misma fila nacional de region_month.json)
    species   una fila por especie no ocasional a escala nacional:
              [sid, clase, máscara de presencia (bit m = mes m), fase (mes de llegada, 0–12)]
    names     nombre común por sid (mismo orden que species)
    sound     sid → grano de canto (para la sonificación de la portada)

Uso (desde la raíz del repo, después de build_web_data.py):
    python3 python_scripts/build_overview_data.py
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "web" / "data"


def main() -> None:
    species = json.loads((DATA / "species.json").read_text(encoding="utf-8"))
    typical = json.loads((DATA / "typical_year.json").read_text(encoding="utf-8"))
    region_month = json.loads((DATA / "region_month.json").read_text(encoding="utf-8"))
    sounds = json.loads((DATA / "sounds.json").read_text(encoding="utf-8"))

    # Fila nacional (rid 0) de cada especie: [sid, rid, cls, peak, phase, amp, present, …]
    rows = [r for r in typical["rows"] if r[1] == 0 and r[2] in (0, 1, 2)]
    rows.sort(key=lambda r: (r[2], r[4], r[0]))
    names = {s["id"]: s["comName"] for s in species}
    grains = {
        e["sid"]: e["recordings"][0]["grain"]
        for e in sounds["species"]
        if e["recordings"] and e["recordings"][0].get("grain")
    }

    payload = {
        "note": "Año típico 2017–2024 (GBIF). Presente = registrada en ≥4 de 8 años y ≥20 % de su mes pico. "
        "Sin ocasionales. Generado por python_scripts/build_overview_data.py.",
        "classes": ["residente", "visitante_estival", "visitante_invernal"],
        "months": [m[1:4] for m in region_month["scopes"]["0"]],
        "species": [[r[0], r[2], r[6], r[4]] for r in rows],
        "names": [names[r[0]] for r in rows],
        "sound": {str(r[0]): grains[r[0]] for r in rows if r[0] in grains},
    }
    out = DATA / "overview.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{out.relative_to(ROOT)}: {out.stat().st_size / 1024:.1f} KB, {len(rows)} especies")


if __name__ == "__main__":
    main()

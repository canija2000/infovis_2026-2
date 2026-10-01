"""Mapas por mes de la portada: web/data/grid_month.json.

Entrada: gbif/staging/grid-0.2.json (python_scripts/gbif/grid_aggregate.py),
especie-días por celda de 0,2° (~22 km) × mes × clase, año típico 2017–2024.

Por cada celda y mes con datos suficientes (≥ MIN_DAYS especie-días y
registros en ≥ MIN_YEARS de los 8 años) se calcula el índice de ola:

    ola = (v_m − V_región) − (i_m − I_región)

v_m, i_m: proporción de especie-días de visitantes de verano / de invierno
en la celda ese mes; V_región, I_región: las mismas proporciones en toda la
región a lo largo del año. Positivo = el mes trae más visitantes de verano de
lo habitual en la región; negativo = más de invierno. Comparar con la región
(y no con el país) evita que un desierto o un humedal parezcan «más
visitados» solo por su hábitat. La escala satura en el percentil 95 de |ola|.

Uso (desde la raíz del repo):
    python3 python_scripts/build_grid_data.py
"""

import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "gbif" / "staging" / "grid-0.2.json"
OUT = ROOT / "web" / "data" / "grid_month.json"
MIN_DAYS = 50
MIN_YEARS = 3


def main() -> None:
    g = json.loads(SRC.read_text())
    res = g["res"]
    cells = g["cells"]  # [ix, iy, region, [mes][clase], [mes] años]

    region = defaultdict(lambda: [0, 0, 0])  # total, verano, invierno (todo el año)
    for _, _, rid, months, _ in cells:
        for m in months:
            region[rid][0] += sum(m)
            region[rid][1] += m[1]
            region[rid][2] += m[2]

    kept = {}  # índice de celda original -> índice compacto
    out_cells, by_month, waves = [], [[] for _ in range(12)], []
    for i, (ix, iy, rid, months, years) in enumerate(cells):
        tot_r, sum_r, win_r = region[rid]
        for m in range(12):
            days = months[m]
            total = sum(days)
            if total < MIN_DAYS or years[m] < MIN_YEARS:
                continue
            wave = (days[1] / total - sum_r / tot_r) - (days[2] / total - win_r / tot_r)
            if i not in kept:
                kept[i] = len(out_cells)
                # centro de la celda, con 2 decimales (la celda mide 0,2°)
                out_cells.append([round((ix + 0.5) * res, 2), round((iy + 0.5) * res, 2), rid])
            by_month[m].append([kept[i], total, days[0], days[1], days[2], round(wave * 1000)])
            waves.append(abs(wave))

    waves.sort()
    sat = round(waves[int(0.95 * (len(waves) - 1))], 3)
    payload = {
        "note": "Especie-días por celda de 0,2° y mes (año típico 2017–2024, GBIF); celdas con ≥ "
        f"{MIN_DAYS} especie-días y registros en ≥ {MIN_YEARS} de 8 años. ola = (prop. verano − región) − "
        "(prop. invierno − región), ×1000. Generado por python_scripts/build_grid_data.py.",
        "res": res,
        "years": g["years"],
        "minDays": MIN_DAYS,
        "minYears": MIN_YEARS,
        "saturation": sat,
        "cells": out_cells,
        "layout": "[celda, especie-días, residentes, verano, invierno, ola×1000]",
        "months": by_month,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {OUT.stat().st_size / 1024:.0f} KB · {len(out_cells)} celdas · "
          f"por mes {[len(m) for m in by_month]} · saturación ±{sat}")


if __name__ == "__main__":
    main()

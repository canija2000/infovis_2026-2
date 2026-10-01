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

Además, para «Una región de cerca», web/data/grid_region/<código>.json desde
gbif/staging/grid-0.05.json (celdas de ~5 km): por celda y mes, especie-días de
residentes, visitantes de verano y de invierno. La web dibuja 1 punto cada
`perDot` especie-días (número redondo elegido para que el mes más observado de
la región tenga ~DOTS_TARGET puntos).

Uso (desde la raíz del repo):
    python3 python_scripts/build_grid_data.py
"""

import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "gbif" / "staging" / "grid-0.2.json"
OUT = ROOT / "web" / "data" / "grid_month.json"
SRC_FINE = ROOT / "gbif" / "staging" / "grid-0.05.json"
OUT_REGION = ROOT / "web" / "data" / "grid_region"
META = ROOT / "web" / "data" / "meta.json"
DOTS_TARGET = 1200
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


def nice(x: float) -> int:
    """Redondea hacia arriba a 1, 2 o 5 × 10^n."""
    p = 1
    while True:
        for f in (1, 2, 5):
            if f * p >= x:
                return f * p
        p *= 10


def build_regions() -> None:
    g = json.loads(SRC_FINE.read_text())
    res = g["res"]
    codes = {r["id"]: r["code"] for r in json.loads(META.read_text(encoding="utf-8"))["regions"]}
    OUT_REGION.mkdir(exist_ok=True)
    by_region = defaultdict(list)
    for ix, iy, rid, months, _ in g["cells"]:
        by_region[rid].append((ix, iy, months))
    for rid, cells in sorted(by_region.items()):
        out_cells, by_month = [], [[] for _ in range(12)]
        for ci, (ix, iy, months) in enumerate(sorted(cells)):
            # esquina suroeste de la celda; la web reparte los puntos dentro de ella
            out_cells.append([round(ix * res, 2), round(iy * res, 2)])
            for m in range(12):
                r, e, i = months[m][0], months[m][1], months[m][2]
                if r + e + i:
                    by_month[m].append([ci, r, e, i])
        peak = max(sum(sum(row[1:]) for row in rows) for rows in by_month)
        per_dot = nice(peak / DOTS_TARGET)
        payload = {
            "code": codes[rid], "res": res, "years": g["years"], "perDot": per_dot,
            "layout": "months[m] = [celda, especie-días residentes, verano, invierno]",
            "cells": out_cells, "months": by_month,
        }
        out = OUT_REGION / f"{codes[rid]}.json"
        out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        print(f"{out.relative_to(ROOT)}: {out.stat().st_size / 1024:.0f} KB · {len(out_cells)} celdas · 1 punto = {per_dot}")


if __name__ == "__main__":
    main()
    if SRC_FINE.exists():
        build_regions()

"""Resume el progreso de la descarga regional en una línea.

Uso:
    python3 progress_check.py

Lee cuántos JSON hay en cache_ebird_regional/{REGION}/, compara con el total
esperado y estima ritmo y ETA usando el estado guardado en .progress_state.json.
También detecta si el log no tiene actividad reciente (posible problema).
"""

from __future__ import annotations

import json
import time
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent
CACHE_DIR = PROJECT_DIR / "cache_ebird_regional"
LOG_PATH = PROJECT_DIR / "download.log"
STATE_PATH = PROJECT_DIR / ".progress_state.json"

REGIONS = [
    "CL-AP", "CL-TA", "CL-AN", "CL-AT", "CL-CO", "CL-VS", "CL-RM", "CL-LI",
    "CL-ML", "CL-NB", "CL-BI", "CL-AR", "CL-LR", "CL-LL", "CL-AI", "CL-MA",
]
DAYS = 3661  # 2016-09-17 a 2026-09-25
TOTAL = DAYS * len(REGIONS)


def main() -> None:
    done = 0
    for region in REGIONS:
        region_dir = CACHE_DIR / region
        if region_dir.exists():
            done += sum(1 for _ in region_dir.glob("*.json"))

    now = time.time()
    rate_txt, eta_txt = "s/datos", "s/datos"
    if STATE_PATH.exists():
        try:
            prev = json.loads(STATE_PATH.read_text(encoding="utf-8"))
            delta = done - prev.get("done", 0)
            elapsed = now - prev.get("t", now)
            if elapsed > 60 and delta >= 0:
                rate = delta / elapsed  # solicitudes por segundo
                rate_txt = f"{rate * 60:.0f}/min"
                remaining = TOTAL - done
                if rate > 0:
                    eta_txt = f"~{remaining / rate / 3600:.1f} h"
        except (ValueError, OSError):
            pass
    try:
        STATE_PATH.write_text(json.dumps({"t": now, "done": done}), encoding="utf-8")
    except OSError:
        pass

    pct = done / TOTAL * 100
    log_active = LOG_PATH.exists() and (now - LOG_PATH.stat().st_mtime) < 15 * 60
    if done >= TOTAL:
        status = "COMPLETADO"
    elif not log_active:
        status = "PROBLEMA (log sin actividad >15 min)"
    else:
        status = "EN CURSO"
    print(
        f"[{status}] {done:,}/{TOTAL:,} ({pct:.1f}%) | ritmo {rate_txt} | ETA {eta_txt}"
    )


if __name__ == "__main__":
    main()

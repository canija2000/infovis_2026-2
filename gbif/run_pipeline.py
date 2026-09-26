"""Worker de larga duración: encola las 11 descargas anuales GBIF respetando el
límite de 3 simultáneas, y baja cada zip al completarse.

Auth via env GBIF_USER / GBIF_PWD (transitorias, nunca se escriben a disco).
Estado en gbif/state.json. Log en gbif/worker.log.
"""
import json
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gbif_downloads import submit, status, load_state, save_state, YEARS  # noqa

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DL_DIR = os.path.join(BASE_DIR, "downloads")
LOG = os.path.join(BASE_DIR, "worker.log")
ACTIVE = {"SUBMITTED", "PREPARING", "RUNNING"}
TERMINAL_OK = "SUCCEEDED"
TERMINAL_BAD = {"FAILED", "KILLED", "CANCELLED"}
EMAIL = "jabachler@uc.cl"
MAX_RUNTIME_S = 20 * 3600


def log(msg):
    # stdout ya va a worker.log (el lanzador redirige); no duplicar.
    print(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}", flush=True)


def fetch_zip(year, key):
    """Descarga el zip con resume (curl -C -) y verifica integridad.
    True si quedó listo."""
    dest = os.path.join(DL_DIR, f"{year}.zip")
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return dest
    url = f"https://api.gbif.org/v1/occurrence/download/request/{key}.zip"
    tmp = dest + ".part"
    for attempt in range(6):
        have = os.path.getsize(tmp) if os.path.exists(tmp) else 0
        log(f"[{year}] bajando zip (intento {attempt + 1}, resume desde {have / 1e6:.0f} MB)...")
        r = subprocess.run(
            ["curl", "-sSL", "-C", "-", "--retry", "2", "--max-time", "1800",
             "-o", tmp, url], capture_output=True, text=True)
        if (r.returncode == 0 and os.path.exists(tmp)
                and os.path.getsize(tmp) > 1e6 and zip_ok(tmp)):
            os.replace(tmp, dest)
            log(f"[{year}] zip OK ({os.path.getsize(dest) / 1e6:.1f} MB)")
            return dest
        log(f"[{year}] intento {attempt + 1} falló (curl rc={r.returncode}), reintentando")
        time.sleep(10)
    raise RuntimeError(f"[{year}] no se pudo bajar el zip tras 6 intentos")


def zip_ok(path):
    """Verifica que el zip esté completo: abre bien y trae su CSV."""
    try:
        with zipfile.ZipFile(path) as z:
            names = z.namelist()
        return len(names) == 1 and names[0].endswith(".csv")
    except zipfile.BadZipFile:
        # incompleto o corrupto: empezar de cero en el próximo intento
        try:
            os.remove(path)
        except OSError:
            pass
        return False


def main():
    t0 = time.time()
    pending = list(YEARS)
    while True:
        if time.time() - t0 > MAX_RUNTIME_S:
            log("tiempo máximo alcanzado, saliendo")
            return 2
        st = load_state()
        downloads = st.setdefault("downloads", {})

        # refrescar estados
        for year, info in list(downloads.items()):
            if year == "test-2024-05" or info.get("fetched"):
                continue
            try:
                d = status(info["key"])
            except Exception as e:
                log(f"[{year}] error consultando estado: {e}")
                continue
            info["status"] = d.get("status")
            info["totalRecords"] = d.get("totalRecords")
            info["size"] = d.get("size")
            info["doi"] = d.get("doi")
            s = info["status"]
            if s == TERMINAL_OK and not info.get("fetched"):
                try:
                    fetch_zip(year, info["key"])
                    info["fetched"] = True
                except Exception as e:
                    log(f"[{year}] error bajando zip: {e}")
            elif s in TERMINAL_BAD:
                log(f"[{year}] DESCARGA FALLÓ: {s}")
        save_state(st)

        active = sum(1 for y, i in downloads.items()
                     if y != "test-2024-05" and i.get("status") in ACTIVE)
        # encolar años pendientes
        for year in pending:
            if str(year) in downloads:
                continue
            if active >= 3:
                break
            try:
                submit(year, EMAIL)
                active += 1
                log(f"[{year}] encolada")
            except urllib.error.HTTPError as e:
                body = e.read().decode()[:200]
                log(f"[{year}] no se pudo encolar (HTTP {e.code}): {body}")
                break  # límite u otro problema: reintentar próximo ciclo
            except Exception as e:
                log(f"[{year}] error encolando: {e}")
                break

        done = sum(1 for y in pending
                   if str(y) in downloads and downloads[str(y)].get("fetched"))
        failed = [y for y in pending
                  if str(y) in downloads and downloads[str(y)].get("status") in TERMINAL_BAD]
        log(f"progreso: {done}/{len(pending)} zips listos, {active} activas"
            + (f", fallidas: {failed}" if failed else ""))
        if done + len(failed) >= len(pending):
            log("pipeline completo")
            return 0 if not failed else 1
        time.sleep(300)


if __name__ == "__main__":
    sys.exit(main())

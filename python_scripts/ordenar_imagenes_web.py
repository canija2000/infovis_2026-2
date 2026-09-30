"""Puntúa candidatas GBIF y publica las ocho mejores fotos por especie.

Usa SSD MobileNet v1 del ONNX Model Zoo (clase COCO 16 = bird). La inferencia
ocurre solo al preparar los datos: lee cache_images/candidates.json, y la web
sigue consumiendo images.json sin dependencias de visión. Descarga miniaturas
y guarda resultados reutilizables en cache_images/ (fuera de Git).

Uso:
    python3 python_scripts/ordenar_imagenes_web.py --species "Zonotrichia capensis" --dry-run
    python3 python_scripts/ordenar_imagenes_web.py

Requiere Python 3.11+, pillow, numpy y onnxruntime.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
from concurrent.futures import ThreadPoolExecutor, as_completed
from http.client import IncompleteRead
from pathlib import Path
from urllib.request import Request, urlopen

PROJECT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_DIR / "web" / "data"
IMAGE_INDEX = DATA_DIR / "images.json"
CACHE_DIR = PROJECT_DIR / "cache_images"
CANDIDATE_INDEX = CACHE_DIR / "candidates.json"
PHOTO_DIR = CACHE_DIR / "photos"
SCORES_PATH = CACHE_DIR / "scores.json"
MODEL_PATH = CACHE_DIR / "ssd_mobilenet_v1_12-int8.onnx"
MODEL_URL = "https://huggingface.co/onnxmodelzoo/ssd_mobilenet_v1_12-int8/resolve/main/ssd_mobilenet_v1_12-int8.onnx"
MODEL_SHA256 = "2b79e6a7fb1ec6a33f332b9b10d82d9de4b7b49dcd26b5946921bb356895c954"
BIRD_CLASS = 16  # COCO category ID (no índice contiguo)
MODEL_SIZE = (320, 320)
MAX_PHOTO_BYTES = 8_000_000
MAX_WEB_IMAGES = 8


def libraries():
    try:
        import numpy as np
        import onnxruntime as ort
        from PIL import Image
    except ImportError as exc:
        raise SystemExit("Instala pillow, numpy y onnxruntime para ordenar las fotos.") from exc
    return np, ort, Image


def ensure_model() -> None:
    CACHE_DIR.mkdir(exist_ok=True)
    if MODEL_PATH.exists() and hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest() == MODEL_SHA256:
        return
    print("Descargando detector SSD MobileNet v1 (9 MB)…", flush=True)
    with urlopen(Request(MODEL_URL, headers={"User-Agent": "InfoVis-Birds/1.0"}), timeout=60) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest() != MODEL_SHA256:
        raise ValueError("El detector descargado no coincide con la versión esperada")
    MODEL_PATH.write_bytes(data)


def photo_bytes(url: str) -> bytes:
    PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    path = PHOTO_DIR / (hashlib.sha256(url.encode()).hexdigest() + ".img")
    if path.exists():
        return path.read_bytes()
    with urlopen(Request(url, headers={"User-Agent": "InfoVis-Birds/1.0"}), timeout=25) as response:
        data = response.read(MAX_PHOTO_BYTES + 1)
    if len(data) > MAX_PHOTO_BYTES:
        raise ValueError("Imagen demasiado grande")
    path.write_bytes(data)
    return data


def sharpness(np, crop) -> float:
    """Variación del Laplaciano sobre el ave, acotada para no dominar el score."""
    gray = np.asarray(crop.convert("L").resize((128, 128)), dtype=np.float32)
    lap = (gray[:-2, 1:-1] + gray[2:, 1:-1] + gray[1:-1, :-2] + gray[1:-1, 2:]
           - 4 * gray[1:-1, 1:-1])
    return min(1.0, math.log1p(float(np.var(lap))) / math.log1p(600.0))


def score_photo(url: str, session, np, Image) -> dict:
    with Image.open(io.BytesIO(photo_bytes(url))) as source:
        image = source.convert("RGB")
    array = np.asarray(image.resize(MODEL_SIZE), dtype=np.uint8)[None]
    boxes, classes, confidences, _ = session.run(None, {session.get_inputs()[0].name: array})
    candidates = []
    for box, cls, confidence in zip(boxes[0], classes[0], confidences[0]):
        if int(cls) != BIRD_CLASS or confidence < 0.25:
            continue
        top, left, bottom, right = (max(0.0, min(1.0, float(v))) for v in box)
        area = max(0.0, bottom - top) * max(0.0, right - left)
        if area:
            candidates.append((area, float(confidence), (top, left, bottom, right)))
    if not candidates:
        return {"score": 0.0, "bird": False}

    # La foto de portada debe mostrar bien al ave; se escoge el ave visible
    # más grande, con la confianza del detector como desempate.
    area, confidence, (top, left, bottom, right) = max(candidates, key=lambda d: (d[0], d[1]))
    width, height = image.size
    crop = image.crop((int(left * width), int(top * height),
                       max(1, int(right * width)), max(1, int(bottom * height))))
    focus = sharpness(np, crop)
    brightness = float(np.asarray(crop.convert("L"), dtype=np.float32).mean())
    exposure = max(0.0, min(1.0, brightness / 75.0, (255.0 - brightness) / 50.0))
    center_x, center_y = (left + right) / 2, (top + bottom) / 2
    center = max(0.0, 1.0 - math.hypot(center_x - 0.5, center_y - 0.5) / 0.7)
    proximity = min(1.0, math.sqrt(area) / 0.55)
    score = 100 * (0.58 * proximity + 0.19 * confidence + 0.13 * focus
                   + 0.07 * exposure + 0.03 * center)
    return {"score": round(score, 2), "bird": True, "area": round(area, 4),
            "confidence": round(confidence, 3), "sharpness": round(focus, 3)}


def save_scores(scores: dict) -> None:
    CACHE_DIR.mkdir(exist_ok=True)
    pending = SCORES_PATH.with_suffix(".tmp")
    pending.write_text(json.dumps(scores, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    pending.replace(SCORES_PATH)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--species", help="Procesa una especie por nombre científico")
    parser.add_argument("--dry-run", action="store_true", help="Muestra el orden sin guardar images.json")
    parser.add_argument("--publish-only", action="store_true",
                        help="Publica con las puntuaciones guardadas, sin descargar fotos pendientes")
    parser.add_argument("--workers", type=int, default=8, help="Consultas simultáneas de imágenes")
    args = parser.parse_args()
    if not CANDIDATE_INDEX.exists():
        raise SystemExit("Primero ejecuta preparar_imagenes_web.py para reunir candidatas.")
    candidates = json.loads(CANDIDATE_INDEX.read_text(encoding="utf-8"))
    if candidates.get("candidateLimit", 0) <= MAX_WEB_IMAGES:
        raise SystemExit("El índice de candidatas debe contener más de ocho fotos por especie.")
    rows = [r for r in candidates["species"] if not args.species or r["sciName"] == args.species]
    if not rows:
        raise SystemExit(f"Especie no encontrada: {args.species}")
    scores = json.loads(SCORES_PATH.read_text(encoding="utf-8")) if SCORES_PATH.exists() else {}
    if args.publish_only and not scores:
        raise SystemExit("No hay puntuaciones guardadas para publicar.")
    urls = list(dict.fromkeys(photo["url"] for row in rows for photo in row["images"]))
    pending = [] if args.publish_only else [url for url in urls if url not in scores]
    failures = []
    if pending:
        np, ort, Image = libraries()
        ensure_model()
        session_options = ort.SessionOptions()
        session_options.intra_op_num_threads = 1
        session = ort.InferenceSession(str(MODEL_PATH), sess_options=session_options,
                                       providers=["CPUExecutionProvider"])
        with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
            tasks = {pool.submit(score_photo, url, session, np, Image): url for url in pending}
            for index, future in enumerate(as_completed(tasks), 1):
                url = tasks[future]
                try:
                    scores[url] = future.result()
                except (OSError, ValueError, RuntimeError, IncompleteRead) as exc:
                    failures.append(url)
                    print(f"No se pudo analizar {url}: {exc}", flush=True)
                if index % 50 == 0:
                    save_scores(scores)
                    print(f"{index}/{len(pending)} fotos nuevas analizadas", flush=True)
    save_scores(scores)

    published = json.loads(IMAGE_INDEX.read_text(encoding="utf-8")) if IMAGE_INDEX.exists() else {
        "source": candidates["source"], "species": []}
    by_name = {row["sciName"]: row for row in published["species"]}
    for row in rows:
        ordered = sorted((photo for photo in row["images"] if photo["url"] in scores), key=lambda photo: (
            -int(scores.get(photo["url"], {}).get("bird", False)),
            -scores.get(photo["url"], {}).get("score", 0.0),
        ))
        by_name[row["sciName"]] = {"sid": row["sid"], "sciName": row["sciName"],
                                   "images": ordered[:MAX_WEB_IMAGES]}
        if args.species:
            for photo in ordered[:MAX_WEB_IMAGES]:
                result = scores.get(photo["url"], {})
                print(f"{result.get('score', 0):5.1f}  área {result.get('area', 0):.3f}  {photo['author']}  {photo['url']}")
    if not args.dry_run:
        species = json.loads((DATA_DIR / "species.json").read_text(encoding="utf-8"))
        payload = {"source": candidates["source"], "species": [
            by_name[s["sciName"]] for s in species if s["sciName"] in by_name]}
        pending_file = IMAGE_INDEX.with_suffix(".tmp")
        pending_file.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        pending_file.replace(IMAGE_INDEX)
    print(f"{len(rows)} especies ordenadas entre {len(urls)} candidatas; "
          f"{sum(url not in scores for url in urls)} fotos sin analizar", flush=True)


if __name__ == "__main__":
    main()

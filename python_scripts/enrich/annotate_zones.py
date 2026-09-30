"""Anotación automática de zonas del cuerpo con un modelo de visión (Qwen3-VL, Alibaba Model Studio).

Uso:
    python3 python_scripts/enrich/annotate_zones.py --mvp [--model qwen3-vl-plus] [--max-photos 8]
    python3 python_scripts/enrich/annotate_zones.py --species "Larus dominicanus" "Pelecanus thagus"

Por cada foto de refs/manifest.json (fotos de fetch_references.py) le pide al modelo un JSON con la
vista (lateral/frontal/descartar y por qué), el recuadro del ave, un punto por zona (cabeza, garganta,
dorso, vientre, flanco, ala, cola, pico, patas, ojo), el patrón por zona y el acento de color.
Se envía la URL pública de la foto (iNaturalist/Commons), no el archivo local.

El modelo NO elige colores: solo ubica las partes. Los colores los muestrea extract_palette.py de los
píxeles reales, y la revisión humana se hace en refs/PALETTES.html. Las anotaciones manuales de
refs/zones.json siempre tienen prioridad sobre las automáticas.

Clave: QWEN_KEY (o DASHSCOPE_API_KEY) en el .env de la raíz del repo (gitignored) o en el entorno.
Endpoint internacional compatible con OpenAI. Respuestas en cache/qwen/<modelo>/ (idempotente).

Salida: refs/zones_auto.json {photo_id: {model, view, discard_reason, facing, crop, zones, pattern,
accent_where}} con crop en % de la foto y zones en % del recorte (mismo formato que refs/zones.json).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import urllib.error
import urllib.request

import common as c

ENDPOINT = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions"
ZONES = ["head", "throat", "back", "belly", "flank", "wing", "tail", "beak", "legs", "eye"]
PATTERNS = {"barred", "streaked", "spotted", "striped"}

PROMPT = """Eres un asistente de ornitología. En la foto debería haber un ave: {com} ({sci}).
Responde SOLO un JSON (sin texto extra) con coordenadas normalizadas 0-1000 sobre la imagen completa
(x hacia la derecha, y hacia abajo):
{{"view": "lateral"|"frontal"|"dorsal"|"descartar",
 "discard_reason": null|"muerta"|"juvenil"|"borrosa"|"en_mano"|"muy_pequena"|"parcial"|"otra_especie"|"varias_aves",
 "facing": "izquierda"|"derecha",
 "bbox": [x0,y0,x1,y1],
 "points": {{"head":[x,y], "throat":[x,y], "back":[x,y], "belly":[x,y], "flank":[x,y], "wing":[x,y],
            "tail":[x,y], "beak":[x,y], "legs":[x,y], "eye":[x,y]}},
 "pattern": {{"<zona>": "barred"|"streaked"|"spotted"|"striped"}},
 "accent": null | {{"where": "<parte del cuerpo, 1-3 palabras>", "point": [x,y]}}}}
Reglas:
- Usa "descartar" si el ave está muerta, es un pichón o juvenil muy distinto del adulto, está en la mano,
  es demasiado pequeña o borrosa, se ve solo en parte, hay otra especie, o hay varias aves superpuestas.
- Cada punto debe caer DENTRO del ave, en el centro de una zona bien visible y de color representativo
  (no en bordes, reflejos, sombras fuertes ni el fondo). Omite las zonas que no se ven.
- "pattern" solo para zonas con dibujo claro; omite las lisas.
- "accent" es una mancha de color llamativa y distinta del resto (p. ej. pecho rojo, gorguera, collar)."""


def api_key() -> str:
    env = c.ROOT / ".env"
    vals = {}
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                vals[k.strip()] = v.strip().strip('"').strip("'")
    key = os.environ.get("QWEN_KEY") or vals.get("QWEN_KEY") or os.environ.get("DASHSCOPE_API_KEY") or vals.get("DASHSCOPE_API_KEY")
    if not key:
        raise SystemExit("Falta QWEN_KEY en .env (raíz del repo) o en el entorno.")
    return key


def ask(model: str, key: str, photo: dict, sci: str, com: str) -> dict:
    path = c.CACHE_DIR / "qwen" / model / f"{photo['id']}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    body = {"model": model, "temperature": 0.1, "messages": [{"role": "user", "content": [
        {"type": "image_url", "image_url": {"url": photo["url"]}},
        {"type": "text", "text": PROMPT.format(sci=sci, com=com)}]}]}
    req = urllib.request.Request(ENDPOINT, data=json.dumps(body).encode(),
                                 headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                d = json.load(r)
            break
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < 2:
                import time
                time.sleep(10 * (attempt + 1))
                continue
            raise SystemExit(f"{photo['id']}: HTTP {e.code} {e.read()[:200]!r}")
    txt = re.sub(r"^```(?:json)?|```$", "", d["choices"][0]["message"]["content"].strip(), flags=re.M).strip()
    out = {"model": model, "usage": d.get("usage", {}).get("total_tokens"), "raw": txt}
    try:
        out["answer"] = json.loads(txt)
    except json.JSONDecodeError:
        out["answer"] = None
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    return out


def to_zones(ans: dict) -> dict | None:
    """Pasa de coordenadas 0-1000 de la foto al formato de zones.json (crop % foto, zonas % recorte)."""
    b = ans.get("bbox")
    if not b or len(b) != 4 or not all(isinstance(v, (int, float)) for v in b) or b[2] <= b[0] or b[3] <= b[1]:
        return None
    mx, my = (b[2] - b[0]) * 0.08, (b[3] - b[1]) * 0.08  # margen del recorte
    crop = [max(0, b[0] - mx) / 10, max(0, b[1] - my) / 10, min(1000, b[2] + mx) / 10, min(1000, b[3] + my) / 10]
    zones = {}
    pts = dict(ans.get("points") or {})
    acc = ans.get("accent") or None
    if isinstance(acc, dict) and acc.get("point"):
        pts["accent"] = acc["point"]
    for z, p in pts.items():
        if (z in ZONES or z == "accent") and isinstance(p, list) and len(p) == 2 and all(isinstance(v, (int, float)) for v in p):
            px, py = p[0] / 10, p[1] / 10
            if crop[0] <= px <= crop[2] and crop[1] <= py <= crop[3]:
                zones[z] = [round((px - crop[0]) / (crop[2] - crop[0]) * 100, 1), round((py - crop[1]) / (crop[3] - crop[1]) * 100, 1)]
    return {"crop": [round(v, 1) for v in crop], "zones": zones}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    c.species_args(ap)
    ap.add_argument("--model", default="qwen3-vl-plus")
    ap.add_argument("--max-photos", type=int, default=8, help="fotos por especie a anotar")
    args = ap.parse_args()
    index = c.load_index()
    names = {s["sciName"]: s["comName"] for s in index["species"]}
    species = c.selected_species(args, index)
    manifest = json.loads((c.REFS_DIR / "manifest.json").read_text(encoding="utf-8"))
    out_path = c.REFS_DIR / "zones_auto.json"
    auto = json.loads(out_path.read_text(encoding="utf-8")) if out_path.exists() else {}
    key = api_key()
    tokens = 0
    for sci in species:
        photos = [p for p in manifest.get(sci, {}).get("photos", []) if p.get("file")][: args.max_photos]
        if not photos:
            print(f"{sci}: sin fotos en refs/ (correr fetch_references.py --download)")
            continue
        views = []
        for p in photos:
            r = ask(args.model, key, p, sci, names.get(sci, ""))
            tokens += r.get("usage") or 0
            a = r.get("answer")
            if not a:
                views.append("?")
                continue
            z = to_zones(a) or {"crop": None, "zones": {}}
            pat = {k: v for k, v in (a.get("pattern") or {}).items() if k in ZONES and v in PATTERNS}
            acc = a.get("accent") if isinstance(a.get("accent"), dict) else None
            auto[p["id"]] = {"sciName": sci, "model": args.model, "view": a.get("view"),
                             "discard_reason": a.get("discard_reason"), "facing": a.get("facing"),
                             **z, "pattern": pat, "accent_where": acc.get("where") if acc else None}
            views.append((a.get("view") or "?")[0])
        print(f"{sci:32s} {''.join(views)}")
    c.write_json(out_path, auto)
    print(f"→ refs/zones_auto.json · {tokens} tokens en esta corrida (sin contar caché)")


if __name__ == "__main__":
    main()

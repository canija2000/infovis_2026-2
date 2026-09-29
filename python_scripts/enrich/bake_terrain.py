"""Paso 4: terreno de las 4 mini-escenas de la Región Metropolitana ("cuartos" unidos por senderos).

Uso (requiere el venv de enrich/: numpy, Pillow, rasterio, mercantile):
    python_scripts/enrich/.venv/bin/python python_scripts/enrich/bake_terrain.py [--size 48]

Fuentes (sin clave; respuestas en cache/, gitignored):
  - Relieve: AWS Terrain Tiles (terrarium, z14): elev = R*256 + G + B/256 - 32768.
  - Cobertura: ESA WorldCover 10 m 2021 v200 (COG, se lee solo la ventana de cada escena).
  - Ríos y canales: OpenStreetMap vía Overpass (ODbL).
Cada escena es un cuadrado de SCENES[..]["km"] km centrado en un lugar real. La grilla va de
norte a sur (fila 0 = borde norte) y de oeste a este. Alturas en metros sobre hMin.

Salidas:
  web/data/game/terrain-CL-RM.json   escenas + leyenda de cobertura (< 100 KB)
  refs/terrain_preview.png           relieve sombreado + cobertura + ríos, para revisión
"""

from __future__ import annotations

import argparse
import io
import json
import math
import time
import urllib.parse

import mercantile
import numpy as np
import rasterio
from PIL import Image, ImageDraw
from rasterio.windows import from_bounds

import common as c

Z = 14
WORLDCOVER = ("/vsicurl/https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/"
              "ESA_WorldCover_10m_2021_v200_{tile}_Map.tif")
OVERPASS = "https://overpass-api.de/api/interpreter"

SCENES = {
    "ciudad": {"name": "Cerro Santa Lucía y Parque Forestal", "lon": -70.6430, "lat": -33.4380, "km": 1.4},
    "matorral": {"name": "Parque Natural Aguas de Ramón", "lon": -70.5100, "lat": -33.4380, "km": 1.4},
    "rio": {"name": "Río Maipo en Los Morros", "lon": -70.6750, "lat": -33.6580, "km": 1.4},
    "cordillera": {"name": "La Parva, camino a Valle Nevado", "lon": -70.2900, "lat": -33.3400, "km": 1.4},
}
# WorldCover → código del juego (un dígito).
COVER = {10: 0, 20: 1, 30: 2, 40: 3, 50: 4, 60: 5, 70: 6, 80: 7, 90: 8, 95: 8, 100: 9}
LEGEND = ["arboles", "matorral", "pastizal", "cultivo", "urbano", "suelo desnudo", "nieve", "agua", "humedal", "musgo/liquen"]
LEGEND_RGB = [(40, 96, 40), (120, 128, 56), (168, 168, 88), (200, 176, 96), (168, 72, 64),
              (176, 160, 136), (240, 240, 248), (48, 96, 184), (64, 152, 136), (152, 176, 144)]


def bbox(s: dict) -> tuple[float, float, float, float]:
    half = s["km"] / 2
    dlat = half / 110.574
    dlon = half / (111.320 * math.cos(math.radians(s["lat"])))
    return s["lon"] - dlon, s["lat"] - dlat, s["lon"] + dlon, s["lat"] + dlat


def cell_centers(bb, n: int, sub: int = 1):
    """lon, lat de los centros de celda (con sub×sub submuestras); fila 0 = norte."""
    w, s, e, nn = bb
    k = n * sub
    lons = w + (np.arange(k) + 0.5) * (e - w) / k
    lats = nn - (np.arange(k) + 0.5) * (nn - s) / k
    return np.meshgrid(lons, lats)


def elevation(bb, n: int) -> np.ndarray:
    sub = 3
    lon, lat = cell_centers(bb, n, sub)
    tiles = list(mercantile.tiles(bb[0], bb[1], bb[2], bb[3], zooms=Z))
    x0, y0 = min(t.x for t in tiles), min(t.y for t in tiles)
    nx, ny = max(t.x for t in tiles) - x0 + 1, max(t.y for t in tiles) - y0 + 1
    mosaic = np.zeros((ny * 256, nx * 256))
    for t in tiles:
        raw = c.fetch(f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{t.x}/{t.y}.png")
        a = np.asarray(Image.open(io.BytesIO(raw)).convert("RGB"), dtype=float)
        mosaic[(t.y - y0) * 256:(t.y - y0 + 1) * 256, (t.x - x0) * 256:(t.x - x0 + 1) * 256] = \
            a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
    # lon/lat → píxel global de Web Mercator a z14
    scale = 256 * 2 ** Z
    px = (lon + 180) / 360 * scale - x0 * 256
    s = np.sin(np.radians(lat))
    py = (0.5 - np.log((1 + s) / (1 - s)) / (4 * np.pi)) * scale - y0 * 256
    # bilineal
    ix, iy = np.floor(px).astype(int), np.floor(py).astype(int)
    fx, fy = px - ix, py - iy
    ix1, iy1 = np.minimum(ix + 1, mosaic.shape[1] - 1), np.minimum(iy + 1, mosaic.shape[0] - 1)
    v = (mosaic[iy, ix] * (1 - fx) * (1 - fy) + mosaic[iy, ix1] * fx * (1 - fy)
         + mosaic[iy1, ix] * (1 - fx) * fy + mosaic[iy1, ix1] * fx * fy)
    return v.reshape(n, sub, n, sub).mean(axis=(1, 3))


def worldcover_tile(lon: float, lat: float) -> str:
    la = math.floor(lat / 3) * 3
    lo = math.floor(lon / 3) * 3
    return f"{'S' if la < 0 else 'N'}{abs(la):02d}{'W' if lo < 0 else 'E'}{abs(lo):03d}"


def cover(bb, n: int) -> np.ndarray:
    path = c.CACHE_DIR / "worldcover" / f"{bb[0]:.4f}_{bb[1]:.4f}_{bb[2]:.4f}_{bb[3]:.4f}.npy"
    if path.exists():
        d = np.load(path)
    else:
        with rasterio.open(WORLDCOVER.format(tile=worldcover_tile(bb[0], bb[1]))) as src:
            d = src.read(1, window=from_bounds(*bb, transform=src.transform))
        path.parent.mkdir(parents=True, exist_ok=True)
        np.save(path, d)
    out = np.zeros((n, n), dtype=int)
    h, w = d.shape
    for r in range(n):
        for q in range(n):
            blk = d[r * h // n:(r + 1) * h // n, q * w // n:(q + 1) * w // n].ravel()
            blk = blk[blk > 0]
            if blk.size:
                vals, cnt = np.unique(blk, return_counts=True)
                # el agua es angosta: si ocupa ≥ 30 % de la celda, gana
                water = cnt[vals == 80].sum() if 80 in vals else 0
                out[r, q] = COVER[80] if water >= 0.3 * blk.size else COVER.get(int(vals[np.argmax(cnt)]), 5)
    return out


def rivers(bb, n: int) -> list[dict]:
    q = (f'[out:json][timeout:60];way["waterway"~"^(river|stream|canal)$"]'
         f'({bb[1]},{bb[0]},{bb[3]},{bb[2]});out geom;')
    url = OVERPASS + "?" + urllib.parse.urlencode({"data": q})
    for attempt in range(4):
        try:
            d = json.loads(c.fetch(url))
            break
        except (json.JSONDecodeError, OSError):
            (c.CACHE_DIR / "http").mkdir(parents=True, exist_ok=True)
            time.sleep(10 * (attempt + 1))
    else:
        raise SystemExit("Overpass no respondió")
    w, s, e, nn = bb
    out = []
    for el in d["elements"]:
        raw = [[round((g["lon"] - w) / (e - w) * n, 1), round((nn - g["lat"]) / (nn - s) * n, 1)] for g in el["geometry"]]
        pts = raw[:1]  # simplificar: descartar vértices a menos de media celda del anterior
        for p in raw[1:-1]:
            if math.dist(p, pts[-1]) >= 0.5:
                pts.append(p)
        pts += raw[-1:] if len(raw) > 1 else []
        if len(pts) >= 2:
            out.append({"type": el["tags"]["waterway"], "name": el["tags"].get("name"), "path": pts})
    return out


def preview(scenes: dict, n: int) -> Image.Image:
    k = 6
    tiles = []
    for key, sc in scenes.items():
        h = np.array(sc["height"], dtype=float).reshape(n, n) + sc["hMin"]
        cell = sc["cellM"]
        gy, gx = np.gradient(h, cell)
        shade = np.clip(0.55 + 0.45 * (-gx * 0.7 + gy * 0.7) / np.sqrt(1 + gx ** 2 + gy ** 2), 0.2, 1.2)
        cov = np.array(sc["cover"]).reshape(n, n)
        rgb = np.array(LEGEND_RGB)[cov] * shade[..., None]
        img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).resize((n * k, n * k), Image.NEAREST)
        d = ImageDraw.Draw(img)
        for r in sc["rivers"]:
            d.line([(x * k, y * k) for x, y in r["path"]], fill=(40, 200, 255), width=2 if r["type"] == "river" else 1)
        d.rectangle([0, 0, n * k, 14], fill=(0, 0, 0))
        d.text((3, 2), f"{key}: {sc['hMin']}-{sc['hMax']} m", fill=(255, 255, 0))
        tiles.append(img)
    leg = Image.new("RGB", (n * k * len(tiles), 20), (0, 0, 0))
    d = ImageDraw.Draw(leg)
    for i, (name, col) in enumerate(zip(LEGEND, LEGEND_RGB)):
        d.rectangle([i * 110 + 2, 4, i * 110 + 14, 16], fill=col)
        d.text((i * 110 + 18, 5), name, fill=(220, 220, 220))
    out = Image.new("RGB", (n * k * len(tiles), n * k + 20))
    for i, t in enumerate(tiles):
        out.paste(t, (i * n * k, 0))
    out.paste(leg, (0, n * k))
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--size", type=int, default=48, help="celdas por lado de cada escena")
    args = ap.parse_args()
    n = args.size
    scenes = {}
    for key, s in SCENES.items():
        bb = bbox(s)
        h = elevation(bb, n)
        h_min, h_max = int(math.floor(h.min())), int(math.ceil(h.max()))
        scenes[key] = {
            "name": s["name"],
            "center": [s["lon"], s["lat"]],
            "bbox": [round(v, 5) for v in bb],
            "km": s["km"],
            "cellM": round(s["km"] * 1000 / n, 1),
            "hMin": h_min,
            "hMax": h_max,
            "height": [int(round(v - h_min)) for v in h.ravel()],
            "cover": [int(v) for v in cover(bb, n).ravel()],
            "rivers": rivers(bb, n),
        }
        cov = np.bincount(scenes[key]["cover"], minlength=10)
        mix = ", ".join(f"{LEGEND[i]} {cov[i] * 100 // (n * n)}%" for i in np.argsort(-cov)[:4] if cov[i])
        print(f"{key:10s} {h_min}–{h_max} m · {mix} · {len(scenes[key]['rivers'])} cursos de agua")

    out = {
        "region": "CL-RM",
        "note": "Mini-escenas (cuartos) de la RM. Grilla fila 0 = norte; height en m sobre hMin; cover = índice de legend. "
                "Relieve AWS Terrain Tiles; cobertura ESA WorldCover 10 m 2021 v200 (CC BY 4.0); ríos © OpenStreetMap (ODbL).",
        "size": [n, n],
        "legend": LEGEND,
        "scenes": scenes,
    }
    path = c.GAME_DIR / "terrain-CL-RM.json"
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    preview(scenes, n).save(c.REFS_DIR / "terrain_preview.png")
    print(f"→ {path.relative_to(c.ROOT)} ({path.stat().st_size / 1024:.1f} KB) · refs/terrain_preview.png")


if __name__ == "__main__":
    main()

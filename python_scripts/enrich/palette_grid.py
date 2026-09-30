"""Ayuda para anotar zonas: dibuja las fotos seleccionadas con una grilla 0–100 (x, y).

Uso (con el venv de enrich/):
    .venv/bin/python palette_grid.py OUT_DIR [--crop] [--species "Diuca diuca" ...]

Sin --crop, dibuja la foto completa (para decidir el recorte del ave). Con --crop, dibuja solo
el recorte guardado en refs/zones.json, ampliado, para marcar un punto por zona.
Las coordenadas de la grilla son las que se anotan en refs/zones.json.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw

import common as c


def gridded(img: Image.Image, size: int) -> Image.Image:
    img = img.copy()
    img.thumbnail((size, size))
    d = ImageDraw.Draw(img)
    w, h = img.size
    for k in range(0, 101, 10):
        x, y = k * (w - 1) / 100, k * (h - 1) / 100
        col = (255, 255, 0) if k % 50 == 0 else (255, 0, 255)
        d.line([(x, 0), (x, h)], fill=col, width=1)
        d.line([(0, y), (w, y)], fill=col, width=1)
        d.text((x + 2, 2), str(k), fill=col)
        d.text((2, y + 2), str(k), fill=col)
    return img


def crop_box(img: Image.Image, crop: list[float]) -> tuple[int, int, int, int]:
    w, h = img.size
    return (round(crop[0] * w / 100), round(crop[1] * h / 100), round(crop[2] * w / 100), round(crop[3] * h / 100))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    ap.add_argument("--crop", action="store_true")
    c.species_args(ap)
    args = ap.parse_args()
    sel = json.loads((c.REFS_DIR / "palette_selection.json").read_text(encoding="utf-8"))
    manifest = json.loads((c.REFS_DIR / "manifest.json").read_text(encoding="utf-8"))
    zones_path = c.REFS_DIR / "zones.json"
    zones = json.loads(zones_path.read_text(encoding="utf-8")) if zones_path.exists() else {}
    files = {p["id"]: p["file"] for e in manifest.values() for p in e["photos"] if p.get("file")}
    species = args.species or list(sel)
    args.out.mkdir(parents=True, exist_ok=True)
    for sci in species:
        tiles = []
        for pid in sel[sci]:
            img = Image.open(c.REFS_DIR / files[pid]).convert("RGB")
            if args.crop:
                if pid not in zones:
                    continue
                img = img.crop(crop_box(img, zones[pid]["crop"]))
                img = img.resize((img.width * 3, img.height * 3), Image.NEAREST) if max(img.size) < 200 else img
            tiles.append(gridded(img, 560))
        if not tiles:
            continue
        sheet = Image.new("RGB", (sum(t.width for t in tiles) + 8 * len(tiles), max(t.height for t in tiles)), "black")
        x = 0
        for t in tiles:
            sheet.paste(t, (x, 0))
            x += t.width + 8
        sheet.save(args.out / f"{c.slug(sci)}{'_crop' if args.crop else ''}.jpg", quality=85)
        print(sci, [pid for pid in sel[sci]])


if __name__ == "__main__":
    main()

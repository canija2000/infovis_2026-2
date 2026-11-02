"""Mapa de Chile continental para imprimir en 3D, con las 16 regiones marcadas como surcos.

    python3 docs/proceso/maqueta/chile_stl.py                 # las dos variantes de abajo
    python3 docs/proceso/maqueta/chile_stl.py --largo 300 --piezas 2

Usa la misma proyección que la maqueta (maqueta_blender.py): norte arriba, ancho × 0,82.
Sale de web/data/regions.min.geojson, sin islas oceánicas (Juan Fernández, Rapa Nui...).
Cada pieza es un sólido cerrado (bueno para el laminador): base de GROSOR mm y surcos de
SURCO_ANCHO × SURCO_PROF mm sobre los límites regionales, a 0,8 mm del borde.
Requiere shapely ≥ 2.1.
"""
import argparse
import json
import os
import struct

import shapely
from shapely.geometry import MultiPolygon, Polygon, box, shape
from shapely.geometry.polygon import orient

HERE = os.path.dirname(os.path.abspath(__file__))
GEOJSON = os.path.abspath(os.path.join(HERE, "..", "..", "..", "web", "data", "regions.min.geojson"))
LAT0, LAT1 = -17.5, -56.0
GROSOR, SURCO_PROF = 4.0, 1.2


def project(geom, k):
    return shapely.transform(geom, lambda c: (c + [71.0, -LAT1]) * [k * 0.82, k])


def polygons(geom):
    if geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    return [g for g in getattr(geom, "geoms", []) if isinstance(g, Polygon)]


def triangles(poly, z, up):
    """Triangulación con restricciones (respeta agujeros), en el plano z, normal ±z."""
    out = []
    for t in shapely.constrained_delaunay_triangles(poly).geoms:
        (a, b, c) = orient(t, 1.0).exterior.coords[:3]
        out.append(((a[0], a[1], z), (b[0], b[1], z), (c[0], c[1], z)) if up else
                   ((a[0], a[1], z), (c[0], c[1], z), (b[0], b[1], z)))
    return out


def walls(ring_coords, z0, z1):
    """Paredes de un anillo orientado con el material a la izquierda: normal hacia la derecha."""
    out = []
    pts = list(ring_coords)
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        out.append(((ax, ay, z0), (bx, by, z0), (bx, by, z1)))
        out.append(((ax, ay, z0), (bx, by, z1), (ax, ay, z1)))
    return out


def solid(piece, grooves):
    """Base completa de 0 a GROSOR; arriba, la pieza menos los surcos; el fondo del surco a GROSOR − SURCO_PROF."""
    piece = orient(Polygon(piece.exterior), 1.0)
    grooves = [orient(Polygon(g.exterior), 1.0) for g in polygons(grooves)]
    top = orient(piece.difference(MultiPolygon(grooves)) if grooves else piece, 1.0)
    floor = GROSOR - SURCO_PROF
    tris = triangles(piece, 0.0, up=False) + walls(piece.exterior.coords, 0.0, GROSOR)
    tris += triangles(top, GROSOR, up=True)
    for g in grooves:
        tris += triangles(g, floor, up=True)
        # el surco es un agujero de la cara de arriba: su anillo va en sentido horario (material afuera)
        tris += walls(list(g.exterior.coords)[::-1], floor, GROSOR)
    return tris


def check_closed(tris):
    edges = {}
    for t in tris:
        for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
            edges[(a, b)] = edges.get((a, b), 0) + 1
    bad = sum(1 for (a, b), n in edges.items() if n != 1 or edges.get((b, a), 0) != 1)
    return bad


def write_stl(path, tris):
    with open(path, "wb") as f:
        f.write(b"Chile continental - Los que llegan y los que se quedan".ljust(80, b" "))
        f.write(struct.pack("<I", len(tris)))
        for a, b, c in tris:
            ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
            vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
            n = (uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
            norm = sum(x * x for x in n) ** 0.5 or 1.0
            f.write(struct.pack("<12fH", *(x / norm for x in n), *a, *b, *c, 0))


def build(largo, piezas, surco_ancho, min_isla):
    k = largo / (LAT0 - LAT1)  # mm por grado
    geo = json.load(open(GEOJSON))
    regions = []
    for feat in geo["features"]:
        parts = [shapely.make_valid(p) for p in polygons(shape(feat["geometry"])) if p.centroid.x > -76.5]
        # grilla de 0,3 mm: los límites que comparten dos regiones caen sobre la misma línea
        regions.append(shapely.set_precision(project(shapely.union_all(parts), k).buffer(0), 0.3))
    # cierre morfológico: une fiordos de menos de 1,2 mm y deja un contorno imprimible
    country = shapely.union_all(regions).buffer(0.6, join_style="round").buffer(-0.6).simplify(0.25)
    country = shapely.union_all([p for p in polygons(country) if p.area >= min_isla])
    borders = shapely.union_all([r.boundary for r in regions]).simplify(0.6)
    grooves = (borders.intersection(country.buffer(-0.8 - surco_ancho / 2))
               .buffer(surco_ancho / 2).buffer(0.7).buffer(-0.7).simplify(0.1))

    minx, miny, maxx, maxy = country.bounds
    step = (maxy - miny) / piezas
    pieces = []
    for i in range(piezas):  # pieza 1 = norte
        band = box(minx - 1, maxy - (i + 1) * step - (1 if i == piezas - 1 else 0), maxx + 1, maxy - i * step)
        tris = []
        for part in polygons(country.intersection(band)):
            if part.area < min_isla:
                continue
            g = grooves.intersection(part.buffer(-0.8))
            tris += solid(part, g)
        pieces.append(tris)
    return pieces, (maxx - minx, maxy - miny), step


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--largo", type=float, help="largo norte-sur en mm")
    ap.add_argument("--piezas", type=int, default=1)
    args = ap.parse_args()
    variants = [(args.largo, args.piezas)] if args.largo else [(530, 3), (220, 1)]
    out_dir = os.path.join(HERE, "stl")
    os.makedirs(out_dir, exist_ok=True)
    for largo, piezas in variants:
        surco = 1.0 if largo >= 400 else 0.8
        pieces, (w, h), step = build(largo, piezas, surco, min_isla=12.0 if largo >= 400 else 6.0)
        for i, tris in enumerate(pieces, 1):
            name = f"chile_{int(largo)}mm" + (f"_pieza{i}de{piezas}" if piezas > 1 else "") + ".stl"
            write_stl(os.path.join(out_dir, name), tris)
            print(f"{name}: {len(tris)} triángulos, aristas abiertas: {check_closed(tris)}")
        print(f"  {int(largo)} mm: {w:.0f} × {h:.0f} mm, piezas de {step:.0f} mm de largo, grosor {GROSOR} mm")


if __name__ == "__main__":
    main()

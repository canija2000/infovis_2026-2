"""Maqueta animada de «Los que llegan y los que se quedan» (Entrega 2, V1).

Se ejecuta dentro de Blender (5.x):  exec(open(RUTA).read(), {"__file__": RUTA})
Reconstruye la escena desde cero con los datos de web/data/.

Guion (1 unidad = 1 cm, 30 fps):
  MESA       tablero de cartón 84 × 58. Chile de pie al centro (norte al fondo), entre los
             dos servos, desde web/data/regions.min.geojson, 1,38 cm por grado.
  RESIDENTES 107 aves de cartón verdes (1 ave = 2 especies, 214 residentes) repartidas
             sobre el mapa. No se mueven en todo el video.
  SERVOS     dos brazos sobre diales semicirculares, misma escala 0 → 106 especies = 0 → 180°.
             Verano (pin 5) a la izquierda de Chile, invierno (pin 6) en espejo a la derecha.
             0° = brazo hacia afuera, «fuera»; barre por el frente y a 180° queda sobre Chile.
  ENTRADA    perilla con los 12 meses (jul → jun) sobre un potenciómetro en A0; 30° por mes.
  PANTALLA   celular en una base A1: mes, conteos y voces del coro.
  TIEMPO     0–2,5 s julio · 11 pasos de 2,2 s (ago → jun) · 3 s de cierre = 900 cuadros.
  PASO       perilla: 0,25 s a −3° de pasada y asienta a 0,4 s. Pantalla cambia a 0,15 s.
             Brazos: parten a 0,2 s, llegan con 5 % de sobrepaso a 1,0 s y asientan a 1,3 s;
             la bandeja se inclina hasta 7° y vuelve con retardo (follow-through).
  CÁMARA     40 mm, nunca quieta: plano general → acercamiento al dial de verano en la
             ola (oct–dic) → deriva al de invierno (abr–jun) → se abre al final.
"""
import json
import math
import os
import random

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
DATA = os.path.join(REPO, "web", "data")

FPS = 30
MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
          "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
AUSTRAL = [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5]
MAX_VISITORS = 106
INTRO, STEP, OUTRO = 2.5, 2.2, 3.0

overview = json.load(open(os.path.join(DATA, "overview.json")))
COUNTS = overview["months"]  # [residentes, verano, invierno] de enero a diciembre


def step_time(k):
    """Segundo en que empieza el paso hacia el mes austral k (k = 1..11)."""
    return INTRO + (k - 1) * STEP


TOTAL_FRAMES = round((INTRO + 11 * STEP + OUTRO) * FPS)


def fr(t):
    return round(t * FPS) + 1


# ---------------------------------------------------------------- escena limpia
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras,
             bpy.data.lights, bpy.data.actions):
    for block in list(coll):
        coll.remove(block)

scene = bpy.context.scene
scene.render.fps = FPS
scene.frame_start, scene.frame_end = 1, TOTAL_FRAMES
scene.unit_settings.system = "METRIC"
root = scene.collection


def mat(name, color, rough=0.85, emit=0.0, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    rgba = tuple(int(color[i:i + 2], 16) / 255 for i in (0, 2, 4)) + (1,)
    lin = tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgba[:3]) + (1,)
    p.inputs["Base Color"].default_value = lin
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if emit:
        p.inputs["Emission Color"].default_value = lin
        p.inputs["Emission Strength"].default_value = emit
    return m


M = {
    "table": mat("mesa", "3A3633", 0.6),
    "orange_ink": mat("tinta_verano", "B86A14", 0.6),
    "blue_ink": mat("tinta_invierno", "1D6A99", 0.6),
    "board": mat("carton", "B5895A", 0.92),
    "board_edge": mat("carton_canto", "A9804F", 0.95),
    "chile": mat("chile", "EADBC0", 0.9),
    "paper": mat("papel", "F4F1EA", 0.8),
    "ink": mat("tinta", "2A2724", 0.6),
    "green": mat("residente", "288665", 0.75),
    "orange": mat("verano", "E07F24", 0.75),
    "blue": mat("invierno", "2C8FC9", 0.75),
    "servo": mat("servo", "2F5DA8", 0.45),
    "pcb": mat("pcb", "1F7A9C", 0.5),
    "black": mat("negro", "17171A", 0.4),
    "metal": mat("metal", "C9CCD1", 0.25, metal=1.0),
    "screen": mat("pantalla", "0E0F12", 0.3),
    "wire_o": mat("cable_senal", "E8892B", 0.5),
    "wire_r": mat("cable_5v", "C8312B", 0.5),
    "wire_b": mat("cable_gnd", "4A2E1F", 0.5),
    "wire_y": mat("cable_a0", "E5C62B", 0.5),
    "usb": mat("cable_usb", "3A3B3F", 0.5),
    "txt_w": mat("texto_pantalla", "F4F3EF", 0.5, emit=2.2),
    "txt_o": mat("texto_verano", "EE9B45", 0.5, emit=2.2),
    "txt_b": mat("texto_invierno", "4FB0E8", 0.5, emit=2.2),
    "txt_g": mat("texto_residente", "41B886", 0.5, emit=2.2),
}


def link(ob, parent=None):
    root.objects.link(ob)
    if parent:
        ob.parent = parent
    return ob


def box(name, size, loc, material, parent=None, bevel=0.0):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    ob = link(bpy.data.objects.new(name, me), parent)
    ob.location = loc
    if bevel:
        mod = ob.modifiers.new("bevel", "BEVEL")
        mod.width, mod.segments = bevel, 2
    return ob


def cylinder(name, r, h, loc, material, parent=None, segs=48):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r, depth=h)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = len(p.vertices) == 4
    me.materials.append(material)
    ob = link(bpy.data.objects.new(name, me), parent)
    ob.location = loc
    return ob


def prism(name, outline, depth, material, parent=None, axis="Z"):
    """Extruye un contorno 2D (lista de (u, v)). axis Z: contorno en XY; axis Y: contorno en XZ."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    if axis == "Z":
        vs = [bm.verts.new((u, v, 0)) for u, v in outline]
    else:
        vs = [bm.verts.new((u, 0, v)) for u, v in outline]
    face = bm.faces.new(vs)
    vec = (0, 0, depth) if axis == "Z" else (0, depth, 0)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    bmesh.ops.translate(bm, vec=vec, verts=[g for g in ext["geom"] if isinstance(g, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    return link(bpy.data.objects.new(name, me), parent)


def text(name, body, loc, size, material, parent=None, rot=(0, 0, 0), align="CENTER", extrude=0.0):
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = body
    cu.size = size
    cu.align_x = align
    cu.align_y = "CENTER"
    cu.extrude = extrude
    cu.materials.append(material)
    ob = link(bpy.data.objects.new(name, cu), parent)
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def wire(name, points, material, radius=0.07):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 3
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(points) - 1)
    for bp, p in zip(sp.bezier_points, points):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    cu.materials.append(material)
    return link(bpy.data.objects.new(name, cu))


def empty(name, loc, parent=None):
    ob = link(bpy.data.objects.new(name, None), parent)
    ob.location = loc
    ob.empty_display_size = 1
    return ob


# ---------------------------------------------------------------- mesa y tablero
box("mesa", (260, 180, 4), (0, 10, -2.25), M["table"])
box("tablero", (84, 58, 0.5), (0, 0, -0.25), M["board"], bevel=0.08)

# ---------------------------------------------------------------- Chile de pie, al centro
LAT0, LAT1, Y_TOP, Y_BOTTOM = -17.5, -56.0, 25.5, -27.5
K = (Y_TOP - Y_BOTTOM) / (LAT0 - LAT1)  # cm por grado


def project(lon, lat):
    return ((lon + 71.0) * K * 0.82, Y_TOP - (LAT0 - lat) * K)


def simplify(pts, tol):
    """Douglas–Peucker: el contorno queda como un recorte de cartón, sin dientes de fiordo."""
    if len(pts) < 3:
        return pts
    (x0, y0), (x1, y1) = pts[0], pts[-1]
    dx, dy = x1 - x0, y1 - y0
    norm = math.hypot(dx, dy) or 1e-9
    dists = [abs(dy * (x - x0) - dx * (y - y0)) / norm for x, y in pts[1:-1]]
    i = max(range(len(dists)), key=dists.__getitem__) + 1
    if dists[i - 1] <= tol:
        return [pts[0], pts[-1]]
    return simplify(pts[:i + 1], tol)[:-1] + simplify(pts[i:], tol)


def ring_area(pts):
    return 0.5 * abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1])))


geo = json.load(open(os.path.join(DATA, "regions.min.geojson")))
polys = []  # contornos proyectados, para repartir los residentes
for feat in geo["features"]:
    for poly in feat["geometry"]["coordinates"]:
        outer = [project(lon, lat) for lon, lat in poly[0] if lon > -76.5]
        if len(outer) < 4:
            continue
        if outer[0] == outer[-1]:
            outer = outer[:-1]
        # anillo cerrado: se parte en el punto más lejano al primero y se simplifica cada mitad
        far = max(range(len(outer)), key=lambda i: math.dist(outer[0], outer[i]))
        outer = simplify(outer[:far + 1], 0.12)[:-1] + simplify(outer[far:] + outer[:1], 0.12)[:-1]
        if len(outer) < 4 or ring_area(outer) < 0.4:
            continue
        # encoge cada región 0,6 % hacia su centro: deja ver los límites como rendijas
        cx = sum(p[0] for p in outer) / len(outer)
        cy = sum(p[1] for p in outer) / len(outer)
        shrunk = [(cx + (x - cx) * 0.994, cy + (y - cy) * 0.994) for x, y in outer]
        ob = prism(f"chile_{feat['properties']['code']}_{len(polys)}", shrunk, 0.35, M["chile"])
        ob.location.z = 0.0
        polys.append(outer)


def inside(x, y, pts):
    hit = False
    for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]):
        if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0:
            hit = not hit
    return hit


boxes = [(min(p[0] for p in q), max(p[0] for p in q), min(p[1] for p in q), max(p[1] for p in q)) for q in polys]


def inside_any(x, y):
    return any(b[0] <= x <= b[1] and b[2] <= y <= b[3] and inside(x, y, q) for b, q in zip(boxes, polys))


# ---------------------------------------------------------------- silueta de ave
BIRD = [(-0.62, 0.36), (-0.22, 0.44), (0.12, 0.52), (0.26, 0.72), (0.42, 0.82), (0.56, 0.78),
        (0.78, 0.69), (0.57, 0.63), (0.52, 0.52), (0.46, 0.36), (0.30, 0.20), (0.08, 0.14),
        (0.08, 0.0), (0.0, 0.0), (-0.04, 0.14), (-0.26, 0.20), (-0.66, 0.27)]
bird_meshes = {}


def bird(name, color, loc, rot_z, scale=1.0, parent=None):
    if color not in bird_meshes:
        tmp = prism(f"ave_{color}", BIRD, 0.16, M[color], axis="Y")
        bird_meshes[color] = tmp.data
        bpy.data.objects.remove(tmp, do_unlink=True)
    ob = link(bpy.data.objects.new(name, bird_meshes[color]), parent)
    ob.location = loc
    ob.rotation_euler = (0, 0, rot_z)
    ob.scale = (scale, scale, scale)
    return ob


# 107 residentes (1 ave = 2 especies) sobre el mapa. Grilla de 0,25 cm: una celda sirve si
# ella y sus vecinas a ±0,25 cm caen dentro de Chile (el ave no sobresale del borde).
CELL, BIRD_SCALE, GAP = 0.25, 0.7, 0.66
x_min, x_max = min(b[0] for b in boxes), max(b[1] for b in boxes)
y_min, y_max = min(b[2] for b in boxes), max(b[3] for b in boxes)
nx, ny = int((x_max - x_min) / CELL) + 1, int((y_max - y_min) / CELL) + 1
mask = [[inside_any(x_min + i * CELL, y_min + j * CELL) for j in range(ny)] for i in range(nx)]
cells = [(i, j) for i in range(2, nx - 2) for j in range(1, ny - 1)
         if mask[i][j] and mask[i - 1][j] and mask[i + 1][j] and mask[i][j - 1] and mask[i][j + 1]]
assert len(cells) > 300, "Chile quedó muy chico para repartir los residentes"
rng = random.Random(214)
rng.shuffle(cells)
placed = []
for i, j in cells:
    x, y = x_min + i * CELL, y_min + j * CELL
    if all((x - a) ** 2 + (y - b) ** 2 >= GAP ** 2 for a, b in placed):
        placed.append((x, y))
    if len(placed) == 107:
        break
residents = empty("residentes", (0, 0, 0))
for i, (x, y) in enumerate(placed):
    bird(f"residente_{i:03d}", "green", (x, y, 0.35), rng.uniform(-0.6, 0.6) + math.pi * rng.randint(0, 1),
         BIRD_SCALE, residents)

# ---------------------------------------------------------------- textos impresos del tablero
text("titulo", "LOS QUE LLEGAN Y", (-24, 24.0, 0.02), 1.5, M["ink"])
text("titulo_2", "LOS QUE SE QUEDAN", (-24, 21.8, 0.02), 1.5, M["ink"])
text("norte", "NORTE", (0.5, 27.4, 0.02), 0.8, M["ink"])
text("sur", "SUR", (8.0, -26.5, 0.02), 0.8, M["ink"])
legend = box("leyenda", (11.5, 6.4, 0.06), (-33.0, 11.0, 0.03), M["paper"])
bird("leyenda_ave", "green", (-37.2, 12.5, 0.06), 0, 1.0)
text("leyenda_1", "1 ave = 2 especies", (-35.9, 12.5, 0.07), 0.75, M["ink"], align="LEFT")
text("leyenda_2", "214 residentes:", (-38.1, 10.8, 0.07), 0.7, M["ink"], align="LEFT")
text("leyenda_3", "no se mueven", (-38.1, 9.6, 0.07), 0.7, M["ink"], align="LEFT")

# ---------------------------------------------------------------- diales y brazos (servos)
# Un servo a cada lado de Chile. 0° = brazo apuntando hacia afuera («fuera»); el brazo barre
# por el frente y a 180° apunta a Chile, con la bandeja sobre el mapa («en Chile»).
R_DIAL, ARM_LEN, Z_ARM = 11.5, 13.0, 3.6


def direction(th, side):
    """side = −1: dial a la izquierda de Chile (verano); +1: a la derecha (invierno)."""
    return side * math.cos(th), -math.sin(th)


def dial(name, pivot, side, color, label):
    px, py = pivot
    seg = 48
    outline = [(px, py)] + [(px + R_DIAL * dx, py + R_DIAL * dy)
                            for dx, dy in (direction(math.pi * i / seg, side) for i in range(seg + 1))]
    if side > 0:
        outline = outline[:1] + outline[1:][::-1]
    base = prism(f"{name}_papel", outline, 0.06, M["paper"])
    base.location.z = 0.0
    # banda de color entre radio 9,1 y 9,9
    band = [(px + 9.9 * dx, py + 9.9 * dy) for dx, dy in (direction(math.pi * i / seg, side) for i in range(seg + 1))]
    band += [(px + 9.1 * dx, py + 9.1 * dy) for dx, dy in (direction(math.pi * i / seg, side) for i in range(seg, -1, -1))]
    if side > 0:
        band = band[::-1]
    b = prism(f"{name}_banda", band, 0.03, M[color])
    b.location.z = 0.06
    for v in (0, 25, 50, 75, 100):
        dx, dy = direction(math.pi * v / MAX_VISITORS, side)
        tick = box(f"{name}_marca_{v}", (0.12, 1.1, 0.03), (px + dx * 10.6, py + dy * 10.6, 0.08), M["ink"])
        tick.rotation_euler.z = math.atan2(dy, dx) - math.pi / 2
        text(f"{name}_n_{v}", str(v), (px + dx * 7.8, py + dy * 7.8, 0.08), 0.8, M["ink"])
    text(f"{name}_fuera", "fuera", (px + side * 8.5, py + 1.0, 0.02), 0.75, M["ink"])
    text(f"{name}_dentro", "en Chile", (px - side * 8.0, py + 1.0, 0.02), 0.75, M["ink"])
    text(f"{name}_titulo", label, (px + side * 2.0, py - 15.5, 0.02), 1.0, M[color + "_ink"])


def servo_arm(name, pivot, color, flock_color, side):
    px, py = pivot
    box(f"{name}_caja", (3.6, 4.6, 3.0), (px, py, 1.5), M["board"], bevel=0.05)
    box(f"{name}_servo", (1.2, 2.3, 0.5), (px - side * 0.4, py, 3.2), M["servo"], bevel=0.05)
    cylinder(f"{name}_eje", 0.35, 0.4, (px, py, 3.45), M["paper"])
    pivot_ob = empty(f"{name}_pivote", (px, py, Z_ARM))
    box(f"{name}_brazo", (ARM_LEN, 1.3, 0.25), (side * ARM_LEN / 2, 0, 0), M["board"], pivot_ob, bevel=0.04)
    tray_pivot = empty(f"{name}_bandeja_pivote", (side * ARM_LEN, 0, 0.2), pivot_ob)
    cylinder(f"{name}_bandeja", 2.5, 0.25, (0, 0, 0), M["board"], tray_pivot)
    cylinder(f"{name}_aro", 2.55, 0.12, (0, 0, -0.02), M[color], tray_pivot)
    spots = [(0, 0), (1.15, 0.6), (-1.1, 0.7), (0.6, -1.25), (-0.7, -1.15), (1.35, -0.55), (-1.45, -0.3)]
    for i, (x, y) in enumerate(spots):
        bird(f"{name}_ave_{i}", flock_color, (x, y, 0.13), (i % 3 - 1) * 0.35 + (math.pi if side > 0 else 0),
             1.05, tray_pivot)
    return pivot_ob, tray_pivot


SUMMER_PIVOT, WINTER_PIVOT = (-17.0, -4.0), (17.0, -4.0)
dial("dial_verano", SUMMER_PIVOT, -1, "orange", "VISITANTES DE VERANO · pin 5")
dial("dial_invierno", WINTER_PIVOT, +1, "blue", "VISITANTES DE INVIERNO · pin 6")
summer_arm, summer_tray = servo_arm("verano", SUMMER_PIVOT, "orange", "orange", -1)
winter_arm, winter_tray = servo_arm("invierno", WINTER_PIVOT, "blue", "blue", +1)

# ---------------------------------------------------------------- perilla de meses
KNOB = (33.0, -19.5)
box("perilla_caja", (9.5, 9.5, 2.0), (KNOB[0], KNOB[1], 1.0), M["board"], bevel=0.05)
pointer = prism("perilla_flecha", [(-0.6, 0), (0.6, 0), (0, -0.9)], 0.06, M["ink"])
pointer.location = (KNOB[0], KNOB[1] + 5.35, 2.0)
knob = empty("perilla", (KNOB[0], KNOB[1], 2.0))
cylinder("perilla_disco", 4.3, 0.5, (0, 0, 0.25), M["paper"], knob)
cylinder("perilla_mango", 1.0, 1.6, (0, 0, 1.3), M["board"], knob)
for k, m in enumerate(AUSTRAL):
    phi = math.radians(k * 30)
    text(f"perilla_{MONTHS[m][:3]}", MONTHS[m][:3], (-math.sin(phi) * 3.2, math.cos(phi) * 3.2, 0.51), 0.6,
         M["ink"], knob, rot=(0, 0, phi))

# ---------------------------------------------------------------- Arduino Leonardo y cables
ARD = (33.5, 4.5)
pcb = box("arduino", (6.9, 5.3, 0.16), (ARD[0], ARD[1], 0.6), M["pcb"])
for i, (sx, sy, sz) in enumerate([(0.2, 0.2, 0.5)] * 4):
    cylinder(f"arduino_separador_{i}", 0.2, 0.5, (ARD[0] + (-3.0 if i % 2 else 3.0), ARD[1] + (-2.2 if i < 2 else 2.2), 0.25), M["metal"], segs=12)
box("arduino_header_a", (5.2, 0.25, 0.45), (ARD[0] + 0.2, ARD[1] + 2.35, 0.9), M["black"])
box("arduino_header_b", (4.6, 0.25, 0.45), (ARD[0] + 0.4, ARD[1] - 2.35, 0.9), M["black"])
box("arduino_chip", (1.3, 1.3, 0.12), (ARD[0] + 0.6, ARD[1] - 0.2, 0.74), M["black"])
box("arduino_usb", (0.8, 0.6, 0.3), (ARD[0] - 3.35, ARD[1] + 1.3, 0.83), M["metal"])
text("arduino_rotulo", "LEONARDO", (ARD[0] + 0.5, ARD[1] + 1.0, 0.69), 0.45, M["txt_w"])

# servos: señal, 5V y GND desde el header de atrás; corren sobre la mesa hasta la caja de cada
# servo. Los del verano cruzan Chile por encima (z 0,6) hacia el otro lado.
for pv, z in ((SUMMER_PIVOT, 0), (WINTER_PIVOT, 1)):
    for j, (mname, off) in enumerate((("wire_o", 0.0), ("wire_r", 0.18), ("wire_b", 0.36))):
        pts = [Vector((ARD[0] - 2.0 + j * 0.25 + z * 1.2, ARD[1] + 2.35, 1.1)),
               Vector((ARD[0] - 4.5 - z * 0.6, ARD[1] + 4.0 + off, 0.08))]
        if z == 0:
            pts += [Vector((6.0, 1.5 + off, 0.08)), Vector((0.0, 1.0 + off, 0.6)), Vector((-6.0, 0.6 + off, 0.08))]
        pts += [Vector((pv[0] + 0.5, pv[1] + 5.0 + off, 0.08)), Vector((pv[0] + off - 0.2, pv[1] + 2.35, 1.2))]
        wire(f"cable_{'verano' if z == 0 else 'invierno'}_{j}", pts, M[mname], 0.065)

# perilla = potenciómetro: 5V, GND y la señal a A0, desde el header de adelante
for j, mname in enumerate(("wire_r", "wire_b", "wire_y")):
    wire(f"cable_perilla_{j}", [Vector((KNOB[0] - 0.5 + j * 0.5, KNOB[1] + 4.8, 1.0)),
                                Vector((KNOB[0] - 0.8 + j * 0.5, KNOB[1] + 8.0, 0.08)),
                                Vector((ARD[0] + 0.5 + j * 0.3, ARD[1] - 5.0, 0.08)),
                                Vector((ARD[0] + 1.0 + j * 0.25, ARD[1] - 2.35, 1.1))], M[mname], 0.065)

# ---------------------------------------------------------------- celular en base A1
PHONE = (31.5, 18.5)
stand = prism("base_A1", [(0, 0), (4.2, 0), (0.6, 7.0)], 6.0, M["board"], axis="Y")
stand.location = (PHONE[0] - 3.0, PHONE[1] - 0.6, 0)
stand.rotation_euler = (0, 0, math.radians(90))
phone = empty("celular", (PHONE[0], PHONE[1], 0.2))
phone.rotation_euler = (math.radians(-14), 0, math.radians(-18))
box("celular_cuerpo", (7.4, 0.8, 15.4), (0, 0, 7.7), M["black"], phone, bevel=0.6)
box("celular_pantalla", (6.8, 0.05, 14.6), (0, -0.41, 7.7), M["screen"], phone)
wire("cable_usb", [Vector((ARD[0] - 3.8, ARD[1] + 1.3, 0.83)), Vector((ARD[0] - 5.5, ARD[1] + 4.5, 0.15)),
                   Vector((PHONE[0] - 1.0, PHONE[1] - 4.0, 0.15)), Vector((PHONE[0], PHONE[1] - 0.2, 0.4))],
     M["usb"], 0.12)

SCREEN_Y = -0.45
screens = []  # un grupo de textos por mes austral
for k, m in enumerate(AUSTRAL):
    res, summer, winter = COUNTS[m]
    grp = empty(f"pantalla_{MONTHS[m]}", (0, SCREEN_Y, 0), phone)
    up = (math.pi / 2, 0, 0)
    text(f"p_{m}_mes", MONTHS[m].upper(), (0, 0, 13.0), 1.05, M["txt_w"], grp, up)
    text(f"p_{m}_res", f"{res} residentes", (0, 0, 10.6), 0.72, M["txt_g"], grp, up)
    text(f"p_{m}_ver", f"+{summer} de verano", (0, 0, 9.3), 0.72, M["txt_o"], grp, up)
    text(f"p_{m}_inv", f"+{winter} de invierno", (0, 0, 8.0), 0.72, M["txt_b"], grp, up)
    total = res + summer + winter
    text(f"p_{m}_tot", f"{total} especies", (0, 0, 6.2), 0.9, M["txt_w"], grp, up)
    # ecualizador: barras del coro, más voces cuanto más especies
    voices = round(4 + (summer + winter) / 10)
    for v in range(14):
        h = 0.25 + (1.9 * (0.35 + 0.65 * abs(math.sin(v * 1.7 + m))) if v < voices else 0.0)
        box(f"p_{m}_eq_{v}", (0.3, 0.04, h), (-2.6 + v * 0.4, 0, 2.6 + h / 2),
            M["txt_o"] if v >= 4 else M["txt_g"], grp)
    text(f"p_{m}_coro", f"coro: {voices} voces", (0, 0, 1.4), 0.55, M["txt_w"], grp, up)
    screens.append(grp)

# ---------------------------------------------------------------- animación
prefs = bpy.context.preferences.edit


def set_hidden(ob, hidden, frame):
    for o in [ob] + list(ob.children_recursive):
        o.hide_render = hidden
        o.hide_viewport = hidden
        o.keyframe_insert("hide_render", frame=frame)
        o.keyframe_insert("hide_viewport", frame=frame)


def angle(n):
    return math.pi * n / MAX_VISITORS


prefs.keyframe_new_interpolation_type = "CONSTANT"
for k, grp in enumerate(screens):
    show_at = 1 if k == 0 else fr(step_time(k) + 0.15)
    hide_at = fr(step_time(k + 1) + 0.15) if k < 11 else TOTAL_FRAMES + 1
    if k > 0:
        set_hidden(grp, True, 1)
    set_hidden(grp, False, show_at)
    if k < 11:
        set_hidden(grp, True, hide_at)

prefs.keyframe_new_interpolation_type = "BEZIER"
prefs.keyframe_new_handle_type = "AUTO_CLAMPED"


def key_rot(ob, value, t, axis=2):
    ob.rotation_euler[axis] = value
    ob.keyframe_insert("rotation_euler", index=axis, frame=fr(t))


first = AUSTRAL[0]
key_rot(knob, 0.0, 0)
# verano gira antihorario (+), invierno horario (−): ambos barren por el frente hacia Chile
key_rot(summer_arm, angle(COUNTS[first][1]), 0)
key_rot(winter_arm, -angle(COUNTS[first][2]), 0)
key_rot(summer_tray, 0.0, 0, axis=0)
key_rot(winter_tray, 0.0, 0, axis=0)
for k in range(1, 12):
    t = step_time(k)
    prev_m, m = AUSTRAL[k - 1], AUSTRAL[k]
    # perilla: 30° por mes, pasa 3° y asienta
    key_rot(knob, -math.radians(30 * (k - 1)), t)
    key_rot(knob, -math.radians(30 * k + 3), t + 0.25)
    key_rot(knob, -math.radians(30 * k), t + 0.4)
    for arm, tray, idx, sign in ((summer_arm, summer_tray, 1, 1), (winter_arm, winter_tray, 2, -1)):
        a0, a1 = angle(COUNTS[prev_m][idx]), angle(COUNTS[m][idx])
        d = a1 - a0
        key_rot(arm, sign * a0, t + 0.2)
        key_rot(arm, sign * (a1 + 0.05 * d), t + 1.0)
        key_rot(arm, sign * a1, t + 1.3)
        # la bandeja se inclina contra el giro y vuelve con retardo
        lean = max(-0.12, min(0.12, -sign * d * 0.35))
        key_rot(tray, 0.0, t + 0.2, axis=0)
        key_rot(tray, lean, t + 0.55, axis=0)
        key_rot(tray, -0.4 * lean, t + 1.1, axis=0)
        key_rot(tray, 0.0, t + 1.5, axis=0)

# ---------------------------------------------------------------- cámara y luces
target = empty("camara_objetivo", (0, 2, 2))
cam_data = bpy.data.cameras.new("camara")
cam_data.lens = 40
cam_data.clip_start, cam_data.clip_end = 1, 2000
cam_data.dof.use_dof = True
cam_data.dof.focus_object = target
cam_data.dof.aperture_fstop = 8
cam = link(bpy.data.objects.new("camara", cam_data))
track = cam.constraints.new("TRACK_TO")
track.target = target
track.track_axis, track.up_axis = "TRACK_NEGATIVE_Z", "UP_Y"
scene.camera = cam

CAM_KEYS = [  # (segundo, posición cámara, objetivo)
    (0.0, (-12, -84, 60), (0, -1, 0)),
    (step_time(3), (-6, -76, 54), (-2, -2, 1)),         # octubre: empieza la ola
    (step_time(5) + 1.2, (-36, -46, 36), (-12, -4, 2)),  # diciembre: la bandeja de verano sobre Chile
    (step_time(7), (-10, -62, 46), (-3, -2, 1)),
    (step_time(9) + 1.2, (36, -46, 36), (13, -4, 2)),   # abril–mayo: el dial de invierno
    (step_time(11) + 1.3, (6, -78, 56), (0, -1, 0)),
    (TOTAL_FRAMES / FPS, (0, -62, 92), (0, 1, 0)),      # se abre desde arriba
]
for t, p, tg in CAM_KEYS:
    cam.location = p
    cam.keyframe_insert("location", frame=fr(t))
    target.location = tg
    target.keyframe_insert("location", frame=fr(t))


def area(name, loc, rot, size, energy, color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, "AREA")
    ld.shape, ld.size, ld.energy, ld.color = "DISK", size, energy, color
    ob = link(bpy.data.objects.new(name, ld))
    ob.location = loc
    ob.rotation_euler = [math.radians(a) for a in rot]
    return ob


# 1 unidad = 1 cm, así que las luces están a ~100 unidades: energías altas por la caída 1/d²
area("luz_principal", (-60, -50, 95), (35, 0, -45), 40, 5.0e5, (1.0, 0.95, 0.88))
area("luz_relleno", (75, -45, 35), (65, 0, 55), 60, 0.6e5, (0.88, 0.93, 1.0))
area("luz_contra", (10, 80, 70), (-45, 0, 175), 40, 2.5e5, (1.0, 0.98, 0.95))

world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
scene.world = world
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.02, 0.019, 0.018, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0

# ---------------------------------------------------------------- render
scene.unit_settings.scale_length = 0.01
r = scene.render
r.engine = "BLENDER_EEVEE"
r.resolution_x, r.resolution_y, r.resolution_percentage = 1280, 720, 100
scene.eevee.taa_render_samples = 32
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
if hasattr(r.image_settings, "media_type"):
    r.image_settings.media_type = "VIDEO"
r.image_settings.file_format = "FFMPEG"
r.ffmpeg.format = "MPEG4"
r.ffmpeg.codec = "H264"
r.ffmpeg.constant_rate_factor = "HIGH"
r.filepath = os.path.join(HERE, "render", "maqueta_sin_audio.mp4")
scene.frame_set(1)

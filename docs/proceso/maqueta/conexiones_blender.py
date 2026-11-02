"""Esquema 3D del cableado: Leonardo + mini protoboard + 2 servos + perilla (potenciómetro).

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
        -P docs/proceso/maqueta/conexiones_blender.py

Deja conexiones.blend y dos imágenes en docs/proceso/maqueta/conexiones/. 1 unidad = 1 mm.

Mapa de conexiones (cables dupont). La mini protoboard no tiene rieles: la fila 1 (A–E) es «+»
y la fila 3 (A–E) es «−».
  Leonardo 5V   → fila 1 A                          (macho-macho, rojo)
  Leonardo GND  → fila 3 A                          (macho-macho, negro)
  Servo verano:   café → fila 3 B, rojo → fila 1 B, naranjo → pin 5   (3 × macho-macho)
  Servo invierno: café → fila 3 C, rojo → fila 1 C, naranjo → pin 6   (3 × macho-macho)
  Perilla:        extremo → fila 1 D, extremo → fila 3 D, centro → A0 (3 × macho-hembra)
  Condensador 470 µF (opcional) en la columna E de las filas 1 y 3, franja blanca hacia la 3.
"""
import math
import os

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "conexiones")
os.makedirs(OUT, exist_ok=True)
P = 2.54  # paso entre pines

for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
scene = bpy.context.scene
root = scene.collection


def mat(name, hex_color, rough=0.6, metal=0.0, emit=0.0):
    m = bpy.data.materials.new(name)
    p = m.node_tree.nodes["Principled BSDF"]
    srgb = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb] + [1]
    p.inputs["Base Color"].default_value = lin
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if emit:
        p.inputs["Emission Color"].default_value = lin
        p.inputs["Emission Strength"].default_value = emit
    return m


M = {
    "table": mat("mesa", "D9C7A8", 0.8),
    "bb": mat("protoboard", "F2F0EA", 0.7),
    "hole": mat("agujero", "3A3A3A", 0.9),
    "red": mat("rojo", "D7262B", 0.5),
    "blue": mat("azul", "2357C5", 0.5),
    "pcb": mat("pcb", "1C8A9E", 0.5),
    "black": mat("negro", "1B1B1E", 0.5),
    "metal": mat("metal", "C8CBD0", 0.25, metal=1.0),
    "gold": mat("oro", "D8B24A", 0.3, metal=1.0),
    "servo": mat("servo", "2A2A2E", 0.5),
    "pink": mat("rosado", "E95FB0", 0.6),
    "green": mat("verde", "4CC48A", 0.5),
    "potpcb": mat("pot_pcb", "2B4FB0", 0.5),
    "w_red": mat("cable_rojo", "E0302F", 0.45),
    "w_black": mat("cable_negro", "222226", 0.45),
    "w_brown": mat("cable_cafe", "6B3F22", 0.45),
    "w_orange": mat("cable_naranjo", "F08A24", 0.45),
    "w_yellow": mat("cable_amarillo", "F2CF2A", 0.45),
    "ink": mat("tinta", "1E1E1E", 0.6),
    "white_ink": mat("tinta_blanca", "F5F5F5", 0.6),
    "cap": mat("condensador", "2A3550", 0.4),
}


def link(ob, parent=None):
    root.objects.link(ob)
    if parent:
        ob.parent = parent
    return ob


def box(name, size, loc, material, bevel=0.0):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    ob = link(bpy.data.objects.new(name, me))
    ob.location = loc
    if bevel:
        mod = ob.modifiers.new("bevel", "BEVEL")
        mod.width, mod.segments = bevel, 2
    return ob


def cylinder(name, r, h, loc, material, segs=32):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r, depth=h)
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = len(poly.vertices) == 4
    me.materials.append(material)
    ob = link(bpy.data.objects.new(name, me))
    ob.location = loc
    return ob


def label(body, loc, size, material=None, rot_z=0.0, align="CENTER"):
    cu = bpy.data.curves.new("txt", "FONT")
    cu.body, cu.size, cu.align_x, cu.align_y = body, size, align, "CENTER"
    cu.materials.append(material or M["ink"])
    ob = link(bpy.data.objects.new(f"txt_{body[:12]}", cu))
    ob.location = loc
    ob.rotation_euler.z = rot_z
    return ob


def squares(name, centers, size, z, material):
    """Muchos agujeros/marcas en una sola malla."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    h = size / 2
    for x, y in centers:
        vs = [bm.verts.new((x + dx, y + dy, z)) for dx, dy in ((-h, -h), (h, -h), (h, h), (-h, h))]
        bm.faces.new(vs)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    return link(bpy.data.objects.new(name, me))


def wire(name, points, material, radius=0.65):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth, cu.bevel_resolution = radius, 3
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(points) - 1)
    for bp, p in zip(sp.bezier_points, points):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    cu.materials.append(material)
    return link(bpy.data.objects.new(name, cu))


def jumper(name, a, b, material, lift=18.0, female_a=False):
    """Cable dupont de a a b (puntos de inserción). Cada punta tiene su carcasa negra de 14 mm."""
    a, b = Vector(a), Vector(b)
    for end, female in ((a, female_a), (b, False)):
        box(f"{name}_carcasa", (2.5, 2.5, 14), end + Vector((0, 0, 7)), M["black"])
        if not female:
            cylinder(f"{name}_pin", 0.32, 3, end + Vector((0, 0, -1.2)), M["metal"], 8)
    ta, tb = a + Vector((0, 0, 14)), b + Vector((0, 0, 14))
    mid = (ta + tb) / 2 + Vector((0, 0, lift + (ta - tb).length * 0.12))
    wire(name, [ta, ta + Vector((0, 0, lift * 0.5)), mid, tb + Vector((0, 0, lift * 0.5)), tb], material)


# ---------------------------------------------------------------- mesa
box("mesa", (520, 360, 4), (-20, 10, -2), M["table"])

# ---------------------------------------------------------------- mini protoboard (170 puntos)
# 17 filas numeradas × columnas A–J. En cada fila, A–E están unidas entre sí y F–J entre sí
# (el canal del centro las separa). No tiene rieles: la fila 1 (A–E) hace de «+» y la fila 3
# (A–E) de «−». Cada una tiene 5 agujeros: Leonardo, servo verano, servo invierno, perilla
# y el condensador opcional.
BB_TOP = 8.5
box("protoboard", (47, 35, BB_TOP), (0, 0, BB_TOP / 2), M["bb"], bevel=0.6)
ROW_X = {r: (r - 9) * P for r in range(1, 18)}
COL_Y = {c: -(3.81 + (4 - i) * P) for i, c in enumerate("ABCDE")}
COL_Y.update({c: 3.81 + i * P for i, c in enumerate("FGHIJ")})
squares("agujeros", [(x, y) for x in ROW_X.values() for y in COL_Y.values()], 1.1, BB_TOP + 0.02, M["hole"])
box("canal", (40, 2.4, 0.05), (0, 0, BB_TOP + 0.03), M["hole"])
for r in (1, 5, 10, 15, 17):
    label(str(r), (ROW_X[r], -16.3, BB_TOP + 0.05), 1.4, M["ink"])
for c in "AEFJ":
    label(c, (-22.0, COL_Y[c], BB_TOP + 0.05), 1.4, M["ink"])
PLUS_ROW, MINUS_ROW = 1, 3
for r, m in ((PLUS_ROW, M["red"]), (MINUS_ROW, M["blue"])):
    # marco de cinta de color alrededor de los 5 agujeros A–E de la fila
    x = ROW_X[r]
    for dy, w, h in ((-15.2, 3.2, 0.5), (-2.6, 3.2, 0.5)):
        box("cinta", (w, h, 0.05), (x, dy, BB_TOP + 0.04), m)
    for dx in (-1.6, 1.6):
        box("cinta", (0.5, 12.6, 0.05), (x + dx, -8.9, BB_TOP + 0.04), m)
label("+", (ROW_X[PLUS_ROW], -19.3, BB_TOP + 0.05), 3.4, M["red"])
label("−", (ROW_X[MINUS_ROW], -19.3, BB_TOP + 0.05), 3.4, M["blue"])


def bus(sign, col):
    """Agujero de la fila «+» (sign = +1) o «−» (sign = −1), columna A–E."""
    return (ROW_X[PLUS_ROW if sign > 0 else MINUS_ROW], COL_Y[col], BB_TOP)


# ---------------------------------------------------------------- Arduino Leonardo
LEO = Vector((-130.0, -26.65, 0))  # esquina inferior izquierda de la placa
PCB_TOP = 4.6
HDR_TOP = PCB_TOP + 8.5
box("leonardo", (68.6, 53.3, 1.6), LEO + Vector((34.3, 26.65, 3.8)), M["pcb"], bevel=0.4)
for dx, dy in ((3, 3), (65, 3), (3, 50), (65, 50)):
    cylinder("separador", 1.6, 3, LEO + Vector((dx, dy, 1.5)), M["metal"], 12)
box("usb", (6, 8, 3), LEO + Vector((1.5, 38.0, 6.1)), M["metal"])
box("jack", (13, 9, 11), LEO + Vector((4.5, 8.0, 10.1)), M["black"])
box("chip", (10, 10, 1), LEO + Vector((40, 26, 5.1)), M["black"])
label("LEONARDO", LEO + Vector((40, 36, PCB_TOP + 0.05)), 4.0, M["white_ink"])

PINS = {}


def header(names, x0, y, tag):
    n = len(names)
    box(f"header_{tag}", (n * P, P, 8.5), LEO + Vector((x0 + (n - 1) * P / 2, y, PCB_TOP + 4.25)), M["black"])
    pts = []
    for i, nm in enumerate(names):
        pos = LEO + Vector((x0 + i * P, y, HDR_TOP))
        pts.append((pos.x, pos.y))
        PINS[nm] = pos
    squares(f"huecos_{tag}", pts, 0.9, HDR_TOP + 0.02, M["hole"])


header(["SCL", "SDA", "AREF", "GND_D", "13", "12", "11", "10", "9", "8"], 17.8, 50.8, "digital_a")
header(["7", "6", "5", "4", "3", "2", "1", "0"], 44.45, 50.8, "digital_b")
header(["NC", "IOREF", "RESET", "3V3", "5V", "GND", "GND2", "VIN"], 26.67, 2.54, "power")
header(["A0", "A1", "A2", "A3", "A4", "A5"], 49.53, 2.54, "analog")
for nm in ("13", "12", "11", "10", "9", "8", "7", "6", "5", "4", "3", "2", "1", "0"):
    label(nm, PINS[nm] + Vector((0, -3.6, -8.45)), 1.3, M["white_ink"])
for nm, txt in (("3V3", "3.3V"), ("5V", "5V"), ("GND", "GND"), ("GND2", "GND"), ("VIN", "VIN"),
                ("A0", "A0"), ("A1", "A1"), ("A2", "A2")):
    label(txt, PINS[nm] + Vector((0, 3.6, -8.45)), 1.2, M["white_ink"], rot_z=math.pi / 2)


# ---------------------------------------------------------------- servos (MG90S en marco rosado)
def servo(name, center):
    c = Vector(center)
    frame = box(f"{name}_marco", (40, 32, 4), c + Vector((0, 0, 2)), M["pink"], bevel=0.8)
    box(f"{name}_cuerpo", (22.5, 12.2, 22), c + Vector((0, 0, 13)), M["servo"], bevel=0.6)
    box(f"{name}_aletas", (32.5, 12.2, 2.5), c + Vector((0, 0, 19)), M["servo"])
    cylinder(f"{name}_eje", 2.6, 4, c + Vector((6, 0, 26)), M["metal"], 16)
    cylinder(f"{name}_corona", 3.6, 3, c + Vector((6, 0, 28.5)), M["green"])
    box(f"{name}_brazo", (18, 4.5, 2), c + Vector((6 + 7, 0, 29)), M["green"], bevel=0.6)
    # conector hembra de 3 vías al final del cable del servo
    conn = c + Vector((0, -32, 28))
    box(f"{name}_conector", (3 * P + 0.6, 3.2, 12), conn + Vector((0, 0, 0)), M["black"])
    for i, m in enumerate(("w_brown", "w_red", "w_orange")):
        x = (i - 1) * P
        wire(f"{name}_cable_{i}", [c + Vector((-11.5, x * 0.6 - 2, 6)), c + Vector((-22, -10 + x, 18)),
                                    conn + Vector((x, 0, 10)), conn + Vector((x, 0, 6))], M[m], 0.45)
    # punto donde entra el cable dupont (abajo del conector), en orden café, rojo, naranjo
    return [conn + Vector(((i - 1) * P, 0, -6 - 14)) for i in range(3)]


summer_ends = servo("servo_verano", (-55, 92, 0))
winter_ends = servo("servo_invierno", (5, 92, 0))
label("SERVO VERANO · pin 5", (-55, 118, 0.05), 5.0)
label("SERVO INVIERNO · pin 6", (5, 118, 0.05), 5.0)

# ---------------------------------------------------------------- perilla (potenciómetro suelto)
# Las dos patas de los extremos van a 5V y GND (da igual cuál; si se invierten, la perilla cuenta
# al revés). La pata del CENTRO es la señal y va a A0.
POT = Vector((62, 12, 0))
cylinder("pot_cuerpo", 8.2, 6.5, POT + Vector((0, 0, 3.25)), M["gold"], 40)
cylinder("pot_rosca", 3.6, 7, POT + Vector((0, 0, 10)), M["metal"], 24)
cylinder("pot_eje", 3.0, 10, POT + Vector((0, 0, 18.5)), M["metal"], 20)
box("pot_pestana", (7, 17, 1.2), POT + Vector((-10.5, 0, 3.0)), M["w_brown"])
POT_PINS = {}
for nm, dy in (("EXT1", -5.0), ("CENTRO", 0.0), ("EXT2", 5.0)):
    leg = POT + Vector((-13.5, dy, 3.0))
    box(f"pot_pata_{nm}", (0.8, 0.8, 7), leg + Vector((0, 0, 3.5)), M["metal"])
    POT_PINS[nm] = leg + Vector((0, 0, 7))
label("PERILLA\n(potenciómetro)", POT + Vector((4, 20, 0.05)), 4.2)
# mismo orden que las patas vistas desde arriba: arriba GND, al medio A0, abajo 5V
label("extremo → GND (−)", POT + Vector((-2, -19, 0.05)), 2.8, M["ink"], align="LEFT")
label("centro → A0", POT + Vector((-2, -23.5, 0.05)), 2.8, M["ink"], align="LEFT")
label("extremo → 5V (+)", POT + Vector((-2, -28, 0.05)), 2.8, M["w_red"], align="LEFT")

# ---------------------------------------------------------------- condensador opcional
# patas en la columna E de la fila + y de la fila −; la franja blanca (−) hacia la fila 3
cx = (ROW_X[PLUS_ROW] + ROW_X[MINUS_ROW]) / 2
cylinder("condensador", 4, 11, (cx, COL_Y["E"] + 4.5, BB_TOP + 9), M["cap"], 24)
box("condensador_franja", (0.6, 1.6, 11), (cx + 3.8, COL_Y["E"] + 4.5, BB_TOP + 9), M["white_ink"])
for r in (PLUS_ROW, MINUS_ROW):
    wire("pata", [Vector((ROW_X[r], COL_Y["E"], BB_TOP)), Vector((ROW_X[r], COL_Y["E"], BB_TOP + 2)),
                  Vector((cx + (ROW_X[r] - cx) * 0.4, COL_Y["E"] + 4.5, BB_TOP + 3.5))], M["metal"], 0.3)
label("470 µF\n(opcional)", (-31, 12, 0.05), 2.6)

# ---------------------------------------------------------------- cables dupont
jumper("j_5V", PINS["5V"], bus(+1, "A"), M["w_red"], lift=22)
jumper("j_GND", PINS["GND"], bus(-1, "A"), M["w_black"], lift=18)
for name, ends, pin, col in (("verano", summer_ends, "5", "B"), ("invierno", winter_ends, "6", "C")):
    brown, red, orange = ends
    jumper(f"j_{name}_gnd", brown, bus(-1, col), M["w_brown"], lift=6)
    jumper(f"j_{name}_5v", red, bus(+1, col), M["w_red"], lift=8)
    jumper(f"j_{name}_senal", orange, PINS[pin], M["w_orange"], lift=14)
jumper("j_pot_vcc", POT_PINS["EXT1"], bus(+1, "D"), M["w_red"], lift=10, female_a=True)
jumper("j_pot_gnd", POT_PINS["EXT2"], bus(-1, "D"), M["w_black"], lift=8, female_a=True)
jumper("j_pot_out", POT_PINS["CENTRO"], PINS["A0"], M["w_yellow"], lift=30, female_a=True)

# rótulos de las conexiones (sobre la mesa, legibles desde arriba)
label("MINI PROTOBOARD", (0, -26, 0.05), 4.6)
label("fila 1 (A–E) = +   ·   fila 3 (A–E) = −", (0, -32, 0.05), 3.0)
label("ARDUINO LEONARDO", (-95.7, -36, 0.05), 5.0)
label("5V → fila 1 (+)", (-62, -50, 0.05), 3.4, M["w_red"])
label("GND → fila 3 (−)", (-62, -56, 0.05), 3.4, M["ink"])
label("A0 ← centro de la perilla", (-62, -62, 0.05), 3.4, M["ink"])
label("pin 5 ← señal servo verano (naranjo)", (-95, 40, 0.05), 3.0, M["ink"])
label("pin 6 ← señal servo invierno (naranjo)", (-95, 34.5, 0.05), 3.0, M["ink"])

# ---------------------------------------------------------------- luces, cámaras, render
sun = bpy.data.lights.new("sol", "SUN")
sun.energy, sun.angle = 3.2, math.radians(8)
so = link(bpy.data.objects.new("sol", sun))
so.rotation_euler = (math.radians(38), math.radians(12), math.radians(-25))
world = bpy.data.worlds.new("mundo")
scene.world = world
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.55, 0.58, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9

scene.render.engine = "BLENDER_EEVEE"
scene.eevee.taa_render_samples = 48
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.render.image_settings.file_format = "PNG"

target = link(bpy.data.objects.new("objetivo", None))
target.location = (-20, 35, 8)
cd = bpy.data.cameras.new("camara")
cd.clip_start, cd.clip_end = 1, 5000
cam = link(bpy.data.objects.new("camara", cd))
tr = cam.constraints.new("TRACK_TO")
tr.target = target
scene.camera = cam

# vista desde arriba (esquema)
cd.type, cd.ortho_scale = "ORTHO", 270
cam.location = (-18, 34, 600)
target.location = (-18, 34.01, 0)
scene.render.resolution_x, scene.render.resolution_y = 1800, 1350
scene.render.filepath = os.path.join(OUT, "conexiones_arriba.png")
bpy.ops.render.render(write_still=True)

# vista en perspectiva
cd.type, cd.lens = "PERSP", 35
cam.location = (-10, -190, 210)
target.location = (-22, 28, 4)
scene.render.resolution_x, scene.render.resolution_y = 1800, 1100
scene.render.filepath = os.path.join(OUT, "conexiones_perspectiva.png")
bpy.ops.render.render(write_still=True)

# de cerca: qué agujero de la mini protoboard lleva cada cable. Se ocultan cables, carcasas y
# condensador, y cada agujero usado se marca con el color de su cable y un rótulo.
for ob in scene.objects:
    if ob.type == "CURVE" or "_carcasa" in ob.name or "_pin" in ob.name or ob.name.startswith("condensador"):
        ob.hide_render = True
HOLES = {
    PLUS_ROW: [("A", "w_red", "5V del Leonardo"), ("B", "w_red", "rojo · servo verano"),
               ("C", "w_red", "rojo · servo invierno"), ("D", "w_red", "perilla · un extremo"),
               ("E", "cap", "condensador + (opcional)")],
    MINUS_ROW: [("A", "w_black", "GND del Leonardo"), ("B", "w_brown", "café · servo verano"),
                ("C", "w_brown", "café · servo invierno"), ("D", "w_black", "perilla · otro extremo"),
                ("E", "cap", "condensador − (opcional)")],
}
box("papel_rotulos", (27, 13.5, 0.1), (-1.0, -8.9, BB_TOP + 0.06), M["bb"])
for row, items in HOLES.items():
    for col, m, txt in items:
        box("marca", (1.9, 1.9, 0.12), (ROW_X[row], COL_Y[col], BB_TOP + 0.08), M[m])
        if row == PLUS_ROW:
            label(f"{txt}  {col}", (ROW_X[row] - 3.0, COL_Y[col], BB_TOP + 0.1), 1.25, M["ink"], align="RIGHT")
        else:
            label(f"{col}  {txt}", (ROW_X[row] + 3.0, COL_Y[col], BB_TOP + 0.12), 1.25, M["ink"], align="LEFT")
label("fila 1 = +", (ROW_X[PLUS_ROW] - 3.0, -1.2, BB_TOP + 0.1), 1.5, M["red"], align="RIGHT")
label("fila 3 = −", (ROW_X[MINUS_ROW] + 3.0, -1.2, BB_TOP + 0.12), 1.5, M["blue"], align="LEFT")
label("en cada fila, A–E están unidas por dentro", (-6, -21.5, BB_TOP + 0.05), 1.6, M["ink"])
cd.type, cd.ortho_scale = "ORTHO", 66
cam.location = (-12, -4, 600)
target.location = (-12, -3.99, 0)
scene.render.resolution_x, scene.render.resolution_y = 1600, 1100
scene.render.filepath = os.path.join(OUT, "conexiones_protoboard.png")
bpy.ops.render.render(write_still=True)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "conexiones.blend"))

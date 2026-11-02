"""Animación del video educativo, sincronizada con la narración (tiempos.json).

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
        -P docs/proceso/video_arduino/escena_blender.py -- [--render]

Parte del modelo de docs/proceso/maqueta/conexiones_blender.py (mismo cableado real) y le agrega,
escena por escena, lo que dice la voz: cables que se dibujan, pines que se iluminan, corriente que
viaja, el osciloscopio del pulso y la lectura de A0. 1 unidad = 1 mm, 24 fps.
Deja video.blend; con --render escribe render/animacion.mp4 (sin audio: lo une montaje.py).
"""
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(HERE, "..", "maqueta", "conexiones_blender.py")
FPS = 24

# ---------------------------------------------------------------- modelo base (sin rótulos ni render)
src = open(BASE).read()
src = src[:src.index("# rótulos de las conexiones")]
B = {"__file__": os.path.abspath(BASE), "__name__": "base"}
exec(src, B)
M, box, cylinder, wire, link = B["M"], B["box"], B["cylinder"], B["wire"], B["link"]
PINS, POT, POT_PINS, ROW_X, COL_Y = B["PINS"], B["POT"], B["POT_PINS"], B["ROW_X"], B["COL_Y"]
BB_TOP, HDR_TOP, LEO, P = B["BB_TOP"], B["HDR_TOP"], B["LEO"], B["P"]
scene = bpy.context.scene

# fuera: condensador opcional y rótulos fijos de la imagen estática (el video pone los suyos)
FIJOS = {"SERVO VERANO · pin 5", "SERVO INVIERNO · pin 6", "PERILLA\n(potenciómetro)",
         "extremo → GND (−)", "centro → A0", "extremo → 5V (+)", "470 µF\n(opcional)"}
for ob in list(scene.objects):
    if ob.name.startswith(("condensador", "pata")) or (ob.type == "FONT" and ob.data.body in FIJOS):
        bpy.data.objects.remove(ob, do_unlink=True)

box("mesa_fondo", (4000, 4000, 4), (0, 0, -2.2), M["table"])  # sin horizonte en los planos abiertos

T = json.load(open(os.path.join(HERE, "tiempos.json")))
ESC = {e["id"]: e for e in T["escenas"]}
TOTAL = T["total"]
scene.render.fps = FPS
scene.frame_start, scene.frame_end = 1, round(TOTAL * FPS)


def fr(t):
    return round(t * FPS) + 1


def m(esc, marca):
    return ESC[esc]["marcas"][marca]


def ini(esc):
    return ESC[esc]["inicio"]


def fin(esc):
    return ESC[esc]["inicio"] + ESC[esc]["duracion"]


def key(target, path, value, t, index=-1):
    if index >= 0:
        getattr(target, path)[index] = value
    else:
        setattr(target, path, value)
    target.keyframe_insert(path, index=index, frame=fr(t))


def hexlin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1]


def glow_mat(name, color, strength=3.0):
    mt = bpy.data.materials.new(name)
    p = mt.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = hexlin(color)
    p.inputs["Emission Color"].default_value = hexlin(color)
    p.inputs["Emission Strength"].default_value = strength
    return mt


def glow_key(mt, value, t):
    inp = mt.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"]
    inp.default_value = value
    inp.keyframe_insert("default_value", frame=fr(t))


def empty(name, loc, parent=None):
    ob = link(bpy.data.objects.new(name, None), parent)
    ob.location = loc
    return ob


def pop(ob, t_in, t_out=None, size=1.0):
    """Aparece con rebote (0 → 110 % → 100 %) y se va encogiendo."""
    key(ob, "scale", (0, 0, 0), t_in - 0.01)
    key(ob, "scale", (size * 1.12,) * 3, t_in + 0.18)
    key(ob, "scale", (size,) * 3, t_in + 0.32)
    if t_out is not None:
        key(ob, "scale", (size,) * 3, t_out - 0.25)
        key(ob, "scale", (0, 0, 0), t_out)


def outline(name, center, w, h, color, t_in, t_out, thick=0.7):
    """Marco luminoso alrededor de un grupo de pines."""
    g = empty(name, center)
    mt = glow_mat(f"{name}_luz", color)
    for dx, dy, sx, sy in ((0, h / 2, w + thick, thick), (0, -h / 2, w + thick, thick),
                           (w / 2, 0, thick, h), (-w / 2, 0, thick, h)):
        b = box(f"{name}_borde", (sx, sy, 0.6), (dx, dy, 0), mt)
        b.parent = g
    pop(g, t_in, t_out)
    # late una vez al aparecer
    glow_key(mt, 3.0, t_in)
    glow_key(mt, 8.0, t_in + 0.3)
    glow_key(mt, 3.0, t_in + 0.8)
    return g


def tag(name, text, loc, t_in, t_out, size=3.0, color="1E1E1E", align="CENTER"):
    """Rótulo impreso sobre la mesa: texto sobre un papel blanco, aparece con rebote."""
    g = empty(name, loc)
    cu = bpy.data.curves.new(name, "FONT")
    cu.body, cu.size, cu.align_x, cu.align_y = text, size, align, "CENTER"
    cu.materials.append(glow_mat(f"{name}_tinta", color, 0.0))
    t = link(bpy.data.objects.new(f"{name}_texto", cu), g)
    t.location.z = 0.25
    lines = text.split("\n")
    w = max(len(s) for s in lines) * size * 0.56 + size * 1.4
    h = len(lines) * size * 1.25 + size * 0.7
    off = {"CENTER": 0, "LEFT": w / 2 - size * 0.7, "RIGHT": -(w / 2 - size * 0.7)}[align]
    paper = box(f"{name}_papel", (w, h, 0.2), (off, 0, 0.05), M["bb"])
    paper.parent = g
    pop(g, t_in, t_out)
    return g


# ---------------------------------------------------------------- piezas animables
# brazos de los servos: giran sobre su eje (corona); 90° = brazo hacia +X
ARMS = {}
for nm in ("servo_verano", "servo_invierno"):
    eje = bpy.data.objects[f"{nm}_corona"].location.copy()
    piv = empty(f"{nm}_pivote", (eje.x, eje.y, 0))
    for part in (f"{nm}_brazo", f"{nm}_corona"):
        ob = bpy.data.objects[part]
        ob.location -= piv.location
        ob.parent = piv
    ARMS[nm] = piv

# perilla: tapa negra con una línea blanca que muestra el giro
knob = empty("perilla_pivote", (POT.x, POT.y, 0))
cap = cylinder("perilla_tapa", 6.5, 8, (0, 0, 27), M["black"], 40)
cap.parent = knob
mark = box("perilla_marca", (1.0, 5.5, 0.5), (0, 3.2, 31.1), M["white_ink"])
mark.parent = knob

chip_mat = glow_mat("chip_luz", "F2CF2A", 0.0)  # el chip se ilumina cuando «el programa decide»
chip_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = hexlin("1B1B1E")
bpy.data.objects["chip"].data.materials[0] = chip_mat

JUMPERS = ["j_5V", "j_GND", "j_verano_gnd", "j_verano_5v", "j_verano_senal", "j_invierno_gnd",
           "j_invierno_5v", "j_invierno_senal", "j_pot_vcc", "j_pot_gnd", "j_pot_out"]
PARTS = {j: sorted((o for o in scene.objects if o.name.startswith((f"{j}_carcasa", f"{j}_pin"))),
                   key=lambda o: o.name) for j in JUMPERS}


def wire_state(j, visible, t, dur=0.5):
    """Dibuja (o recoge) el cable j: el tubo crece de una punta a la otra y las carcasas aparecen."""
    cu = bpy.data.objects[j].data
    cu.bevel_factor_mapping_end = "SPLINE"
    key(cu, "bevel_factor_end", 0.0 if visible else 1.0, t)
    key(cu, "bevel_factor_end", 1.0 if visible else 0.0, t + dur)
    for o in PARTS[j]:
        key(o, "scale", (0, 0, 0) if visible else (1, 1, 1), t)
        key(o, "scale", (1, 1, 1) if visible else (0, 0, 0), t + (dur if visible else 0.15))


def spark(name, curve, t0, dur, reverse=False, color="FFF1A8"):
    """Una chispa de luz que recorre el cable: la corriente o la señal viajando."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=1.5)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(glow_mat(f"{name}_luz", color, 12.0))
    ob = link(bpy.data.objects.new(name, me))
    c = ob.constraints.new("FOLLOW_PATH")
    c.target = bpy.data.objects[curve]
    c.use_fixed_location = True
    key(c, "offset_factor", 1.0 if reverse else 0.0, t0)
    key(c, "offset_factor", 0.0 if reverse else 1.0, t0 + dur)
    key(ob, "scale", (0, 0, 0), t0 - 0.01)
    key(ob, "scale", (1, 1, 1), t0 + 0.05)
    key(ob, "scale", (1, 1, 1), t0 + dur - 0.05)
    key(ob, "scale", (0, 0, 0), t0 + dur)


# ---------------------------------------------------------------- perilla y brazos
def arm_rot(angle):
    return math.radians(angle - 90)


def knob_keys(points, follow=True):
    """points: [(t, grados de la perilla 0–300)]. Los brazos la siguen como en el sketch."""
    for t, deg in points:
        key(knob, "rotation_euler", -math.radians(deg), t, 2)
        if follow:
            key(ARMS["servo_verano"], "rotation_euler", arm_rot(20 + deg / 300 * 140), t, 2)
            key(ARMS["servo_invierno"], "rotation_euler", arm_rot(160 - deg / 300 * 140), t, 2)


def arm_keys(nm, points):
    for t, angle in points:
        key(ARMS[nm], "rotation_euler", arm_rot(angle), t, 2)


# ---------------------------------------------------------------- cámara
target = empty("camara_objetivo", (0, 0, 0))
cd = bpy.data.cameras.new("camara")
cd.lens, cd.clip_start, cd.clip_end = 35, 1, 5000
cam = link(bpy.data.objects.new("camara", cd))
tr = cam.constraints.new("TRACK_TO")
tr.target = target
scene.camera = cam


SHOTS = []


def shot(t, pos, look, ease=1.4):
    """Llega a pos/look en t + ease (la cámara viene del plano anterior)."""
    key(cam, "location", pos, t + ease)
    key(target, "location", look, t + ease)
    SHOTS.append((t + ease, pos, look))


def hold_shots():
    """Cada escena mantiene su último encuadre hasta su final: si no, la interpolación hacia el
    plano siguiente empezaría a mitad de escena."""
    for e in T["escenas"]:
        a, b = e["inicio"], e["inicio"] + e["duracion"]
        dentro = [s for s in SHOTS if a <= s[0] < b]
        if dentro and dentro[-1][0] < b - 0.3:
            t, pos, look = dentro[-1]
            key(cam, "location", pos, b - 0.05)
            key(target, "location", look, b - 0.05)


WIDE = ((-25, -235, 225), (-20, 32, 4))
LEO_C = Vector((LEO.x + 34.3, 0, 6))

# ================================================================ 1. intro
shot(0, (-55, -205, 195), (-18, 32, 4), ease=0)
shot(0, (15, -190, 185), (-16, 32, 4), ease=ESC["intro"]["duracion"] - 1.2)
knob_keys([(0, 0), (m("intro", "perilla"), 0), (m("intro", "brazos") + 3.0, 300),
           (m("intro", "pieza") + 1.5, 60), (fin("intro") - 0.4, 150)])

# ================================================================ 2. Leonardo
t0 = ini("leonardo")
for j in JUMPERS:  # se recogen los cables: el video los vuelve a conectar uno por uno
    wire_state(j, False, t0 + 0.1, 0.6)
shot(t0, (-70, -95, 115), tuple(LEO_C))
shot(t0 + 2, (-85, -85, 100), tuple(LEO_C), ease=ESC["leonardo"]["duracion"] - 3)
usb = bpy.data.objects["usb"].location
outline("hl_usb", (usb.x, usb.y, usb.z + 2), 9, 11, "F2CF2A", m("leonardo", "usb"), fin("leonardo"))
tag("tg_usb", "USB: energía\n+ programa", (usb.x - 18, usb.y + 4, 0.1), m("leonardo", "usb"), fin("leonardo"), 3.2)
dig = (-90.0, PINS["5"].y, HDR_TOP + 0.4)
outline("hl_pines_d", dig, 49, 5, "F2CF2A", m("leonardo", "pines"), fin("leonardo"))
outline("hl_pines_a", (-86.0, PINS["A0"].y, HDR_TOP + 0.4), 41, 5, "F2CF2A", m("leonardo", "pines") + 0.2,
        fin("leonardo"))
tag("tg_puerta", "cada pin: una puerta\npara una señal", (-90, 40, 0.1), m("leonardo", "puerta"), fin("leonardo"), 3.2)

# ================================================================ 3. tipos de pines
t0 = ini("tipos")
shot(t0, (-92, -62, 150), (-92, 4, 4))
shot(t0 + 2, (-100, -58, 140), (-92, 4, 4), ease=ESC["tipos"]["duracion"] - 3)
E = fin("tipos")
outline("hl_dig", dig, 49, 5, "4FA3E8", m("tipos", "digitales"), E)
tag("tg_dig", "DIGITALES · encendido / apagado", (-104, 42, 0.1), m("tipos", "digitales"), E, 3.6, "1D5E99")
pwm = ((PINS["5"].x + PINS["6"].x) / 2, PINS["5"].y, HDR_TOP + 0.8)
outline("hl_pwm", pwm, 6.5, 4.2, "F08A24", m("tipos", "pwm"), E)
tag("tg_pwm", "~5  ~6 · pulsos rápidos", (-52, 33, 0.1), m("tipos", "pwm"), E, 3.4, "B86A14")
ana = ((PINS["A0"].x + PINS["A5"].x) / 2, PINS["A0"].y, HDR_TOP + 0.4)
outline("hl_ana", ana, 17.5, 5, "F2CF2A", m("tipos", "analogicos"), E)
tag("tg_ana", "ANALÓGICOS · A0–A5\nvoltajes intermedios", (-66, -38, 0.1), m("tipos", "analogicos"), E, 3.4, "8A6D00")
pw = ((PINS["NC"].x + PINS["VIN"].x) / 2, PINS["5V"].y, HDR_TOP + 0.4)
outline("hl_pow", pw, 22.5, 5, "E0302F", m("tipos", "energia"), E)
tag("tg_pow", "ENERGÍA · 5V y GND (tierra)", (-116, -38, 0.1), m("tipos", "energia"), E, 3.4, "B0201F")

# ================================================================ 4. los cinco pines
t0 = ini("cinco")
shot(t0, (-88, -78, 150), (-88, 0, 4))
E = fin("cinco")
for nm, col, txt, dy, when in (("5V", "E0302F", "5V", -1, "energia"), ("GND", "333336", "GND", -1, "energia"),
                               ("A0", "F2CF2A", "A0", -1, "a0"), ("5", "F08A24", "5", 1, "pines56"),
                               ("6", "F08A24", "6", 1, "pines56")):
    p = PINS[nm]
    t = m("cinco", when) + (0.25 if nm in ("GND", "6") else 0)
    outline(f"hl5_{nm}", (p.x, p.y, HDR_TOP + 0.8), 3.4, 3.4, col, t, E)
    tag(f"tg5_{nm}", txt, (p.x + (3.0 if nm == "GND" else -3.0 if nm == "5V" else -2.0 if nm == "6" else 2.0
                            if nm == "5" else 0), p.y + dy * 8.0, HDR_TOP + 0.3), t, E, 3.2, col)

# ================================================================ 5. ida, vuelta y colores
t0 = ini("circuito")
shot(t0, (-60, -165, 165), (-45, 38, 4))
shot(t0 + 2, (-40, -160, 160), (-45, 38, 4), ease=ESC["circuito"]["duracion"] - 3)
E = fin("circuito")
ti, tv = m("circuito", "ida"), m("circuito", "vuelta")
wire_state("j_5V", True, ti, 0.7)
wire_state("j_verano_5v", True, ti + 0.6, 0.7)
spark("chispa_ida_1", "j_5V", ti + 1.4, 1.1, color="FF6B5E")
spark("chispa_ida_2", "j_verano_5v", ti + 2.5, 1.1, reverse=True, color="FF6B5E")
wire_state("j_verano_gnd", True, tv - 0.6, 0.7)
wire_state("j_GND", True, tv - 0.1, 0.7)
spark("chispa_vuelta_1", "j_verano_gnd", tv + 0.7, 1.1, color="B9B9C4")
spark("chispa_vuelta_2", "j_GND", tv + 1.8, 1.1, reverse=True, color="B9B9C4")
# la leyenda de colores va en el montaje (2D): sobre la mesa quedaba fuera del cuadro
wire_state("j_verano_senal", True, m("circuito", "senal") + 0.4, 0.8)

# ================================================================ 6. protoboard
t0 = ini("protoboard")
shot(t0, (-2, -62, 92), (-2, -4, 6))
shot(t0 + 2, (6, -58, 86), (-2, -4, 6), ease=ESC["protoboard"]["duracion"] - 3)
E = fin("protoboard")
tag("tg_tres", "1 pin de 5V → 3 piezas", (0, -25, 0.1), m("protoboard", "tres"), m("protoboard", "laminas"), 3.0)
metal = glow_mat("lamina", "B9BEC6", 0.6)
red_strip, blue_strip = glow_mat("lamina_mas", "E0302F", 0.0), glow_mat("lamina_menos", "2357C5", 0.0)
tl = m("protoboard", "laminas")
for i, (r, x) in enumerate(sorted(ROW_X.items())):
    for side in (-1, 1):
        mt = red_strip if (r == 1 and side < 0) else blue_strip if (r == 3 and side < 0) else metal
        s = box(f"lamina_{r}_{side}", (1.5, 12.4, 0.35), (x, side * 8.89, BB_TOP + 0.35), mt)
        pop(s, tl + i * 0.04, E)
for mt, color, when in ((red_strip, "E0302F", "fila1"), (blue_strip, "2357C5", "fila3")):
    mt.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = hexlin("B9BEC6")
    glow_key(mt, 0.0, m("protoboard", when) - 0.05)
    glow_key(mt, 6.0, m("protoboard", when) + 0.3)
    glow_key(mt, 3.0, m("protoboard", when) + 0.9)
tag("tg_lamina", "por dentro: una lámina une\nlos 5 agujeros de cada fila", (0, -25, 0.1), tl + 0.6,
    m("protoboard", "fila1"), 2.6)
tag("tg_f1", "fila 1 = + (5V)", (-24, -25, 0.1), m("protoboard", "fila1"), E, 2.8, "B0201F")
tag("tg_f3", "fila 3 = − (tierra)", (14, -25, 0.1), m("protoboard", "fila3"), E, 2.8, "1D4BA0")

# ================================================================ 7. el servo y su pulso
t0 = ini("servo")
shot(t0, (-38, -52, 128), (-44, 88, 34))
shot(t0 + 2, (-54, -48, 122), (-44, 88, 34), ease=ESC["servo"]["duracion"] - 3)
E = fin("servo")
for i, (when, txt, col) in enumerate((("cafe", "café → tierra", "6B3F22"), ("rojo", "rojo → 5V", "C8312B"),
                                     ("naranjo", "naranjo → pin 5 (señal)", "B86A14"))):
    tag(f"tg_sv_{when}", txt, (-80, 100 - i * 7.0, 0.1), m("servo", when), E, 3.4, col, align="RIGHT")
for i, col in enumerate(("6B3F22", "E0302F", "F08A24")):
    cu = bpy.data.objects[f"servo_verano_cable_{i}"]
    gm = glow_mat(f"cable_servo_luz_{i}", col, 0.0)
    cu.data.materials[0] = gm
    when = ("cafe", "rojo", "naranjo")[i]
    glow_key(gm, 0.0, m("servo", when) - 0.05)
    glow_key(gm, 5.0, m("servo", when) + 0.25)
    glow_key(gm, 0.0, m("servo", when) + 1.6)
spark("chispa_pulso", "j_verano_senal", m("servo", "naranjo") + 0.8, 0.9, reverse=True, color="FFB25E")

# osciloscopio flotando detrás del servo: el ancho del pulso decide el ángulo
scope = empty("osciloscopio", (-52, 118, 44))
scope.rotation_euler = (math.radians(78), 0, 0)
panel = box("osc_panel", (46, 30, 0.8), (0, 0, 0), glow_mat("osc_fondo", "15181C", 0.3))
panel.parent = scope
cu = bpy.data.curves.new("osc_titulo", "FONT")
cu.body, cu.size, cu.align_x = "pulso cada 20 ms · el ancho decide el ángulo", 2.1, "CENTER"
cu.materials.append(glow_mat("osc_texto", "DDE3EA", 1.5))
tt = link(bpy.data.objects.new("osc_titulo", cu), scope)
tt.location = (0, 11, 0.6)
grid = box("osc_base", (40, 0.25, 0.3), (0, -6, 0.5), glow_mat("osc_eje", "56606B", 1.0))
grid.parent = scope
pulso_t = m("servo", "pulso")
pop(scope, pulso_t, E)
WAVES = []
for width, angle, when, lbl in ((1.0, 20, "corto", "1 ms → 20°"), (2.0, 160, "largo", "2 ms → 160°"),
                                (1.5, 90, "centro", "1,5 ms → 90°")):
    x0, w = -15.0, width * 10.0
    pts = [(-19, -6), (x0, -6), (x0, 6), (x0 + w, 6), (x0 + w, -6), (19, -6)]
    wave = wire(f"osc_onda_{when}", [Vector((x, y, 0.8)) for x, y in pts], glow_mat(f"osc_onda_{when}", "FFB25E", 6.0),
                0.45)
    for bp in wave.data.splines[0].bezier_points:
        bp.handle_left_type = bp.handle_right_type = "VECTOR"
    wave.parent = scope
    lab = bpy.data.curves.new(f"osc_lbl_{when}", "FONT")
    lab.body, lab.size, lab.align_x = lbl, 2.6, "CENTER"
    lab.materials.append(glow_mat(f"osc_lbl_{when}", "FFB25E", 3.0))
    lo = link(bpy.data.objects.new(f"osc_lbl_{when}", lab), scope)
    lo.location = (0, -11, 0.6)
    WAVES.append((wave, lo, m("servo", when)))
for i, (wave, lo, t) in enumerate(WAVES):
    t_end = WAVES[i + 1][2] if i + 1 < len(WAVES) else E
    for o in (wave, lo):
        key(o, "scale", (0, 0, 0), t - 0.01)
        key(o, "scale", (1, 1, 1), t + 0.15)
        key(o, "scale", (1, 1, 1), t_end - 0.1)
        key(o, "scale", (0, 0, 0), t_end)
arm_keys("servo_verano", [(m("servo", "corto") - 0.05, 90), (m("servo", "corto") + 0.6, 20),
                          (m("servo", "largo") - 0.05, 20), (m("servo", "largo") + 0.8, 160),
                          (m("servo", "centro") - 0.05, 160), (m("servo", "centro") + 0.7, 90)])

# ================================================================ 8. el segundo servo
t0 = ini("servo2")
shot(t0, (-20, -35, 115), (-22, 82, 20))
E = fin("servo2")
wire_state("j_invierno_gnd", True, t0 + 0.3, 0.6)
wire_state("j_invierno_5v", True, t0 + 0.8, 0.6)
wire_state("j_invierno_senal", True, m("servo2", "pin6") - 0.3, 0.8)
tag("tg_pin6", "naranjo → pin 6", (34, 62, 0.1), m("servo2", "pin6"), E, 3.0, "B86A14")
to = m("servo2", "orden")
spark("chispa_p5", "j_verano_senal", to - 0.4, 0.8, reverse=True, color="FFB25E")
spark("chispa_p6", "j_invierno_senal", to - 0.4, 0.8, reverse=True, color="FFB25E")
arm_keys("servo_verano", [(to + 0.3, 90), (to + 1.2, 155), (E - 0.3, 90)])
arm_keys("servo_invierno", [(to + 0.3, 90), (to + 1.2, 25), (E - 0.3, 90)])

# ================================================================ 9. la perilla
t0 = ini("perilla")
shot(t0, (56, -82, 96), (58, 2, 8))
E = fin("perilla")
te, tc = m("perilla", "extremos"), m("perilla", "centro")
wire_state("j_pot_vcc", True, te, 0.7)
wire_state("j_pot_gnd", True, te + 0.5, 0.7)
tag("tg_pot_vcc", "extremo → 5V", (89, 24, 0.1), te, E, 2.4, "C8312B", align="LEFT")
tag("tg_pot_gnd", "extremo → tierra", (89, 18.5, 0.1), te + 0.5, E, 2.4, "3A2A20", align="LEFT")
wire_state("j_pot_out", True, tc, 0.9)
tag("tg_pot_out", "centro → A0", (89, 13, 0.1), tc, E, 2.4, "8A6D00", align="LEFT")
tg = m("perilla", "giremos")
knob_keys([(tg - 0.6, 150), (tg + 0.2, 0), (tg + 3.6, 300), (m("perilla", "numero") + 1.5, 300),
           (E - 0.2, 150)])
spark("chispa_a0", "j_pot_out", m("perilla", "a0"), 1.0, color="F2CF2A")
# medidor: barra que sube con el voltaje del centro, y la lectura de A0
meter = empty("medidor", (82, 14, 0))
box("medidor_marco", (5, 5, 0.4), (0, 0, 0.2), M["black"]).parent = meter
frame = box("medidor_tubo", (4, 4, 30), (0, 0, 15), glow_mat("medidor_vidrio", "2A2E33", 0.2))
frame.parent = meter
fill_piv = empty("medidor_relleno", (0, 0, 0), meter)
fill = box("medidor_barra", (4.4, 4.4, 30), (0, 0, 15), glow_mat("medidor_luz", "F2CF2A", 4.0))
fill.parent = fill_piv
pop(meter, tg - 0.8, E)
for t, frac in ((tg - 0.6, 0.5), (tg + 0.2, 0.0), (tg + 3.6, 1.0), (m("perilla", "numero") + 1.5, 1.0),
                (E - 0.2, 0.5)):
    key(fill_piv, "scale", (1, 1, max(frac, 0.001)), t)
tag("tg_med", "0 V … 5 V", (82, 34, 0.1), tg - 0.8, E, 2.4)
steps = [(0, "A0 = 0   (0 V)"), (0.25, "A0 = 256   (1,25 V)"), (0.5, "A0 = 512   (2,5 V)"),
         (0.75, "A0 = 767   (3,75 V)"), (1.0, "A0 = 1023   (5 V)")]
for i, (frac, txt) in enumerate(steps):
    t_on = tg + 0.2 + frac * 3.4 - (0.2 if frac else 0)
    t_off = tg + 0.2 + steps[i + 1][0] * 3.4 - 0.2 if i + 1 < len(steps) else E
    tag(f"tg_a0_{i}", txt, (89, 4, 0.1), t_on, t_off, 2.6, "8A6D00", align="LEFT")

# ================================================================ 10. el programa (el código va en el montaje)
t0 = ini("programa")
shot(t0, (-35, -180, 175), (-22, 32, 4))
shot(t0 + 2, (-5, -175, 170), (-22, 32, 4), ease=ESC["programa"]["duracion"] - 3)
E = fin("programa")
tl_, tcv, tes = m("programa", "lee"), m("programa", "convierte"), m("programa", "escribe")
spark("chispa_prog_a0", "j_pot_out", tl_, 1.0, color="F2CF2A")
glow_key(chip_mat, 0.0, tcv - 0.1)
glow_key(chip_mat, 6.0, tcv + 0.3)
glow_key(chip_mat, 0.0, tcv + 1.5)
spark("chispa_prog_5", "j_verano_senal", tes, 0.9, reverse=True, color="FFB25E")
spark("chispa_prog_6", "j_invierno_senal", tes, 0.9, reverse=True, color="FFB25E")
tr_ = m("programa", "rango")
knob_keys([(tr_ - 0.3, 150), (tr_ + 1.6, 0), (tr_ + 4.2, 300), (E - 0.3, 150)])

# ================================================================ 11. cierre
t0 = ini("cierre")
shot(t0, (-60, -185, 185), (-18, 30, 4))
shot(t0 + 2, (20, -195, 200), (-18, 30, 4), ease=ESC["cierre"]["duracion"] - 2.5)
tm, tvj, tdc, tp = (m("cierre", k) for k in ("mano", "viaja", "decide", "pulsos"))
knob_keys([(tm, 150), (tm + 2.0, 300)])
spark("chispa_fin_a0", "j_pot_out", tvj, 1.0, color="F2CF2A")
glow_key(chip_mat, 0.0, tdc - 0.1)
glow_key(chip_mat, 6.0, tdc + 0.3)
glow_key(chip_mat, 0.0, tdc + 1.4)
spark("chispa_fin_5", "j_verano_senal", tp, 0.9, reverse=True, color="FFB25E")
spark("chispa_fin_6", "j_invierno_senal", tp, 0.9, reverse=True, color="FFB25E")
knob_keys([(tp + 0.2, 300), (tp + 2.4, 40)])
tc_ = m("cierre", "consejo")
outline("hl_usb_fin", (usb.x, usb.y, usb.z + 2), 9, 11, "E0302F", tc_, TOTAL)
tag("tg_consejo", "conecta con el USB desenchufado\n· revisa dos veces rojo y café", (-30, -55, 0.1), tc_,
    TOTAL, 5.0, "B0201F")

hold_shots()

# ---------------------------------------------------------------- luz y render
sun = bpy.data.lights.new("sol", "SUN")
sun.energy, sun.angle = 3.2, math.radians(8)
so = link(bpy.data.objects.new("sol", sun))
so.rotation_euler = (math.radians(38), math.radians(12), math.radians(-25))
world = bpy.data.worlds.new("mundo")
scene.world = world
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.55, 0.58, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9

r = scene.render
r.engine = "BLENDER_EEVEE"
scene.eevee.taa_render_samples = 16
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
r.resolution_x, r.resolution_y = 1280, 720
r.image_settings.media_type = "VIDEO"
r.image_settings.file_format = "FFMPEG"
r.ffmpeg.format, r.ffmpeg.codec, r.ffmpeg.constant_rate_factor = "MPEG4", "H264", "HIGH"
os.makedirs(os.path.join(HERE, "render"), exist_ok=True)
r.filepath = os.path.join(HERE, "render", "animacion.mp4")
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, "video.blend"))

if "--render" in sys.argv:
    bpy.ops.render.render(animation=True)

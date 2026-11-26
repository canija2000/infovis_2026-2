"""Ensamble construido del visor integrado, contrastado con IMG_6241 y IMG_6246–6255.

Uso (desde esta carpeta, después de python3 generar.py):
    /Applications/Blender.app/Contents/MacOS/Blender --background --python blender_ensamble.py

Lee piezas.json (los contornos, huecos y círculos exactos que van a la cortadora), extruye cada pieza al espesor T
y la ubica en su lugar del ensamble. Agrega como referencia (sin cortar) el teléfono, el Leonardo, la protoboard,
los motores, los tornillos y los cables. La disposición final se documenta en
RECONSTRUCCION_FOTOS.md; los planos de corte se conservan como fueron diseñados. Guarda:
    ensamble.blend          la escena, para abrirla en Blender
    ensamble.glb            el modelo para el visor web (ensamble.html)
    render_*.jpg            vistas armado, despiece, mochila abierta y asa por dentro

Coordenadas en mm: X = ancho (0 a X), Y = largo desde el lado de los ojos (0) hacia el teléfono, Z = alto.
"""
import bpy, json, math, os, shutil
from mathutils import Vector, Matrix, Quaternion

AQUI = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(AQUI, 'piezas.json')))
T, X, Y, Z = D['T'], D['X'], D['Y'], D['Z']
L, AH, AW = D['ASA']; Z0, Y0 = D['ASA_Z0'], D['ASA_Y0']
MW, MH, MD = D['MOCH']
XV, DV, HV = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))

# ------------------------------------------------------------------ escena limpia
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
sc = bpy.context.scene
sc.unit_settings.system = 'NONE'

def material(nombre, rgb, rough=0.8):
    m = bpy.data.materials.new(nombre)
    srgb = lambda v: 12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055
    m.diffuse_color = (*[srgb(v) for v in rgb], 1)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough
    return m
MAT = {
    'visor': material('MDF natural', (0.55, 0.39, 0.20)),
    'canto': material('Canto quemado por corte láser', (0.055, 0.026, 0.012)),
    'leo': material('Leonardo azul', (0.015, 0.10, 0.17)), 'proto': material('Protoboard', (0.87, 0.86, 0.81)),
    'motor': material('PCB negro de los módulos de vibración', (0.018, 0.024, 0.028)), 'fono': material('Teléfono de referencia', (0.018, 0.02, 0.025), 0.4),
    'metal': material('Tornillo', (0.45, 0.45, 0.47), 0.3), 'usb': material('USB', (0.12, 0.12, 0.12)),
    'negro': material('Conectores y chips', (0.012, 0.015, 0.019)),
    'cinta': material('Cinta de papel', (0.80, 0.76, 0.61)),
    'hueco': material('Contactos oscuros', (0.12, 0.13, 0.13)),
    'cable': [material(f'Cable {i}', c) for i, c in enumerate([(0.55, 0.018, 0.025), (0.8, 0.45, 0.015), (0.025, 0.13, 0.55), (0.015, 0.34, 0.12), (0.22, 0.04, 0.42), (0.65, 0.66, 0.62), (0.008, 0.008, 0.009), (0.75, 0.19, 0.025)])],
}
MAT['nuevo'] = MAT['visor']
grupos = {}
def coleccion(nombre):
    if nombre not in grupos:
        c = bpy.data.collections.new(nombre); sc.collection.children.link(c); grupos[nombre] = c
    return grupos[nombre]

# ------------------------------------------------------------------ una pieza del plano → sólido
def poligono_circulo(cx, cy, r, n=28): return [(cx + r * math.cos(2 * math.pi * k / n), cy + r * math.sin(2 * math.pi * k / n)) for k in range(n)]

def solido(p, O, U, V, N, grupo, mat):
    """Extruye la pieza p (contorno con huecos, en su plano u, v) al espesor T a lo largo de N, en world = O + u·U + v·V + t·N."""
    cu = bpy.data.curves.new(p['nombre'], 'CURVE'); cu.dimensions = '2D'; cu.fill_mode = 'BOTH'
    cu.extrude = T / 2; cu.offset = 0
    for poly in [p['contorno']] + p['huecos'] + [poligono_circulo(*c) for c in p['circulos']]:
        sp = cu.splines.new('POLY'); sp.points.add(len(poly) - 1)
        for i, (u, v) in enumerate(poly): sp.points[i].co = (u, v, 0, 1)
        sp.use_cyclic_u = True
    ob = bpy.data.objects.new(p['nombre'], cu)
    coleccion(grupo).objects.link(ob)
    ob.matrix_world = Matrix(((U.x, V.x, N.x, O.x + N.x * T / 2), (U.y, V.y, N.y, O.y + N.y * T / 2),
                              (U.z, V.z, N.z, O.z + N.z * T / 2), (0, 0, 0, 1)))
    ob.data.materials.append(mat)
    # a malla, para que exporte a glTF y se vea con bordes limpios
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True)
    bpy.ops.object.convert(target='MESH')
    result = bpy.context.view_layer.objects.active
    result.data.materials.append(MAT['canto'])
    for face in result.data.polygons:
        # The curve's local Z is the extrusion axis: only cut edges are dark.
        if abs(face.normal.z) < 0.5: face.material_index = 1
    return result

def caja_ref(nombre, x0, y0, z0, x1, y1, z1, mat, grupo='Referencia (no se corta)'):
    bpy.ops.mesh.primitive_cube_add(size=1)
    ob = bpy.context.active_object; ob.name = nombre
    ob.scale = (x1 - x0, y1 - y0, z1 - z0); ob.location = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    bpy.ops.object.transform_apply(scale=True)
    for c in ob.users_collection: c.objects.unlink(ob)
    coleccion(grupo).objects.link(ob); ob.data.materials.append(mat)
    return ob

def tornillo(nombre, a, b, r=1.5, vertices=12):
    va, vb = Vector(a), Vector(b)
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=(vb - va).length, vertices=vertices)
    ob = bpy.context.active_object; ob.name = nombre
    ob.location = (va + vb) / 2; ob.rotation_mode = 'QUATERNION'; ob.rotation_quaternion = (vb - va).to_track_quat('Z', 'Y')
    for c in ob.users_collection: c.objects.unlink(ob)
    coleccion('Tornillería').objects.link(ob); ob.data.materials.append(MAT['metal'])
    return ob

def cable(nombre, pts, mat, r=1.4):
    cu = bpy.data.curves.new(nombre, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = 2
    sp = cu.splines.new('NURBS'); sp.points.add(len(pts) - 1)
    for i, q in enumerate(pts): sp.points[i].co = (*q, 1)
    sp.use_endpoint_u = True; sp.order_u = 3
    ob = bpy.data.objects.new(nombre, cu); coleccion('Cables').objects.link(ob); ob.data.materials.append(mat)
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects: o.select_set(False)
    ob.select_set(True); bpy.ops.object.convert(target='MESH')
    return bpy.context.view_layer.objects.active

# ------------------------------------------------------------------ dónde va cada pieza
zm = D['z_marco']
def lugar(n):
    """(O, U, V, N, grupo, material) de la pieza n, o None si no va en el ensamble (la probeta)."""
    if n == 'VISOR BASE': return Vector((0, 0, 0)), XV, DV, HV, 'Visor', MAT['visor']
    if n == 'VISOR TAPA': return Vector((0, 0, Y - T)), XV, DV, HV, 'Visor · tapa', MAT['visor']
    if n == 'VISOR LADO IZQ': return Vector((0, 0, 0)), DV, HV, XV, 'Visor', MAT['visor']
    if n == 'VISOR LADO DER': return Vector((X - T, 0, 0)), DV, HV, XV, 'Visor', MAT['visor']
    if n == 'VISOR TRASERA': return Vector((0, Z - T, 0)), XV, HV, DV, 'Visor', MAT['visor']
    if n == 'VISOR MARCO': return Vector((T, zm, 0)), XV, HV, DV, 'Visor', MAT['visor']
    for lado, s in (('IZQ', -1), ('DER', 1)):
        palma = -AW if s < 0 else X + AW                   # cara exterior del asa (donde va la palma)
        adentro = XV if s < 0 else -XV                     # de la palma hacia el visor
        g = f'Asa {lado.lower()}'
        x_frente = palma if s < 0 else palma - T
        if n == f'ASA {lado} FRENTE': return Vector((x_frente, Z0, Y0)), DV, HV, XV, g, MAT['nuevo']
        if n == f'ASA {lado} ARRIBA': return Vector((palma, Z0, Y0 + AH - T)), DV, adentro, HV, g, MAT['nuevo']
        if n == f'ASA {lado} ABAJO': return Vector((palma, Z0, Y0)), DV, adentro, HV, g, MAT['nuevo']
        if n == f'ASA {lado} ADELANTE': return Vector((palma, Z0, Y0)), adentro, HV, DV, g, MAT['nuevo']
        if n == f'ASA {lado} ATRAS': return Vector((palma, Z0 + L - T, Y0)), adentro, HV, DV, g, MAT['nuevo']
    if n == 'MOCHILA FRENTE': return Vector((T, Z, 0)), XV, HV, DV, 'Mochila', MAT['nuevo']
    if n == 'MOCHILA ARRIBA': return Vector((T, Z, MH - T)), XV, DV, HV, 'Mochila', MAT['nuevo']
    if n == 'MOCHILA ABAJO': return Vector((T, Z, 0)), XV, DV, HV, 'Mochila', MAT['nuevo']
    if n == 'MOCHILA IZQ': return Vector((T, Z, 0)), DV, HV, XV, 'Mochila', MAT['nuevo']
    if n == 'MOCHILA DER': return Vector((T + MW - T, Z, 0)), DV, HV, XV, 'Mochila', MAT['nuevo']
    if n == 'MOCHILA TAPA': return Vector((T, Z + MD, 0)), XV, HV, DV, 'Mochila · tapa', MAT['nuevo']
    if n.startswith('LISTON TAPA'):                       # listones de encaje, por dentro de la tapa
        k, g0 = int(n.split()[-1]) - 1, D['HOLGURA_TAPA']
        x0, h0 = 2 * T + g0, T + g0
        pos = [(x0, h0), (x0, MH - T - g0 - 8), (x0, h0 + 8), (T + MW - T - g0 - 8, h0 + 8)][k]
        return Vector((pos[0], Z + MD - T, pos[1])), XV, HV, DV, 'Mochila · tapa', MAT['nuevo']
    if n.startswith('ESCUADRA CUNA'):
        k = int(n.split()[-1]) - 1
        x0, x1, y0, y1 = 2 * T + 3, 2 * T + 3 + 71, Z + T + 0.5, Z + T + 0.5 + 56   # hueco de 71 × 56 para el Leonardo
        esq = [(x0, y0, XV, DV), (x1, y0, -XV, DV), (x0, y1, XV, -DV), (x1, y1, -XV, -DV)][k]
        return Vector((esq[0], esq[1], T)), esq[2], esq[3], HV, 'Mochila', MAT['nuevo']
    return None

# In the built unit the side/handle assemblies are inverted. A proper 180°
# rotation about the longitudinal axis also exchanges left/right. This keeps
# normals, cutouts, fingers and motor screw holes aligned, without reflection.
INVERTIR_LATERALES = Matrix.Translation((X / 2, 0, Y / 2)) @ Matrix.Rotation(math.pi, 4, 'Y') @ Matrix.Translation((-X / 2, 0, -Y / 2))
def intercambiar_lado(n):
    if 'IZQ' in n: return n.replace('IZQ', 'DER')
    return n.replace('DER', 'IZQ')

for p in D['piezas']:
    n = p['nombre']
    if n.startswith('ESCUADRA CUNA'): continue  # Leonardo no longer lies on this cradle.
    l = lugar(n)
    if not l: continue
    invertir = n.startswith('ASA ') or n.startswith('VISOR LADO ')
    original = n
    if invertir:
        p = {**p, 'nombre': intercambiar_lado(n)}
        if n.startswith('ASA '):
            # Name ARRIBA/ABAJO by the panel's final position, not the cutting label.
            if n.endswith('ARRIBA'): p['nombre'] = p['nombre'].replace('ARRIBA', 'ABAJO')
            elif n.endswith('ABAJO'): p['nombre'] = p['nombre'].replace('ABAJO', 'ARRIBA')
        l = (*l[:4], l[4].replace('izq', 'TEMP').replace('der', 'izq').replace('TEMP', 'der'), l[5])
    ob = solido(p, *l)
    ob['pieza_plano'] = original
    if invertir: ob.matrix_world = INVERTIR_LATERALES @ ob.matrix_world

# ------------------------------------------------------------------ referencia: teléfono, placas, motores, tornillos, cables
r0 = Z - T - D['GAP']
phone = caja_ref('Teléfono (referencia opcional)', X / 2 - 80, r0 + 1, T, X / 2 + 80, r0 + 10, T + 75, MAT['fono'], 'Teléfono de referencia')
phone['referenceOnly'] = True
phone.hide_render = True  # The supplied photos show the unit without a phone.

# Real boards: Leonardo against the inner front wall, breadboard on the floor
# near the rear opening (IMG_6255), rather than two boards side by side.
lx0, ly0, lz0 = X - 18 - 70, Z + T + 1, 23
arduino_parts = []
def leo_box(suffix, a, b, mat):
    ob = caja_ref('Arduino Leonardo ' + suffix, *a, *b, mat, 'Mochila')
    arduino_parts.append(ob)
    return ob
leo_box('placa vertical', (lx0, ly0, lz0), (lx0 + 70, ly0 + 2, lz0 + 55), MAT['leo'])
for z in (lz0 + 3, lz0 + 48):
    leo_box('cabecera', (lx0 + 9, ly0 + 2, z), (lx0 + 62, ly0 + 9, z + 4), MAT['negro'])
    for x in range(12):
        leo_box(f'contacto {z} {x}', (lx0 + 10 + x * 4, ly0 + 9, z + 1), (lx0 + 11.5 + x * 4, ly0 + 9.3, z + 2.5), MAT['hueco'])
leo_box('chip', (lx0 + 27, ly0 + 2, lz0 + 20), (lx0 + 39, ly0 + 4, lz0 + 32), MAT['negro'])
leo_box('puerto USB', (lx0 - 2, ly0 + 2, lz0 + 23), (lx0 + 11, ly0 + 9, lz0 + 34), MAT['metal'])
pivot = Vector((lx0 + 35, ly0, lz0 + 27.5))
# Straight, with a half-turn in the board's own plane: the USB port faces
# the same side wall as the cable opening. No tape across the board.
arduino_orientation = Matrix.Translation(pivot) @ Matrix.Rotation(math.pi, 4, 'Y') @ Matrix.Translation(-pivot)
for ob in arduino_parts: ob.matrix_world = arduino_orientation @ ob.matrix_world

# The web turns the CAD assembly over. Its physical floor is therefore the
# original high-Z panel: build the breadboard and its headers facing inward
# from that floor, rather than checking the unrotated CAD's lower panel.
def proto_z(z): return Y - z
def proto_box(nombre, x0, y0, z0, x1, y1, z1, mat):
    return caja_ref(nombre, x0, y0, proto_z(z1), x1, y1, proto_z(z0), mat, 'Mochila')
px, py = X / 2 - 47 / 2, Z + MD - 40
proto_box('Protoboard base', px, py, T, px + 47, py + 35, T + 10, MAT['proto'])
contacts = []
for row in range(10):
    for col in range(12):
        x, y = px + 4 + col * 3.5, py + 3 + row * 3
        contacts.append(proto_box(f'Protoboard contacto {row} {col}', x, y, T + 10, x + 1.3, y + 1.3, T + 10.15, MAT['hueco']))
# These contacts are one semantic part; joining avoids 120 web draw calls.
bpy.ops.object.select_all(action='DESELECT')
for ob in contacts: ob.select_set(True)
bpy.context.view_layer.objects.active = contacts[0]
bpy.ops.object.join(); contacts[0].name = 'Protoboard matriz de contactos'
for i in range(8):
    x = px + 7 + i * 4.5
    proto_box(f'Protoboard conector {i + 1}', x, py + 13, T + 10, x + 2.5, py + 16, T + 23, MAT['negro'])
    terminal = arduino_orientation @ Vector((lx0 + 15 + i * 5, ly0 + 10, 70 if i % 2 else 30))
    cable(f'Cable motor interior {i + 1}', [(x + 1, py + 14, proto_z(T + 23)), (x + 1, py + 5, proto_z(50 + (i % 3) * 7)), (terminal.x, Z + 30, terminal.z), terminal], MAT['cable'][i], 0.6)

# Detailed vibration modules, including coin motor, PCB, three-pin header and
# two mounting screws. Their connectors point toward the lower cable exit.
my = Y - D['my']
for lado, s in (('izq', -1), ('der', 1)):
    wall = 0 if s < 0 else X
    for i, c in enumerate(D['MOTOR_C']):
        name = f'Motor {lado} {"adelante" if i == 0 else "atrás"}'
        yc = Z0 + c
        def motor_box(suffix, depth0, depth1, y0, y1, z0, z1, mat):
            a, b = sorted((wall + s * depth0, wall + s * depth1))
            return caja_ref(name + ' ' + suffix, a, y0, z0, b, y1, z1, mat, 'Motores')
        motor_box('PCB', 0.5, 2.1, yc - 11.5, yc + 11.5, my - 10.5, my + 10.5, MAT['motor'])
        tornillo(name + ' motor circular metálico', (wall + s * 2.1, yc + 2, my + 3.8), (wall + s * 5.8, yc + 2, my + 3.8), 6.2, vertices=48)
        bpy.context.active_object.name = name + ' motor circular metálico'
        tornillo(name + ' disco negro', (wall + s * 5.8, yc + 2, my + 3.8), (wall + s * 6, yc + 2, my + 3.8), 5.5, vertices=48)
        bpy.context.active_object.data.materials.clear(); bpy.context.active_object.data.materials.append(MAT['negro'])
        for q in range(3):
            yy = yc - 4 + q * 4
            motor_box(f'conector {q + 1}', 1.5, 5.2, yy - 1.3, yy + 1.3, my - 15, my - 9, MAT['negro'])
        for dx, dy in D['MOTOR_AGUJEROS']:
            zc = Y - (D['my'] + dy)
            tornillo('Tornillo ' + name + ' vástago', (wall - s * (T + 1), yc + dx, zc), (wall + s * 3, yc + dx, zc), 1.4)
            tornillo('Tornillo ' + name + ' cabeza', (wall + s * 2.3, yc + dx, zc), (wall + s * 4.2, yc + dx, zc), 2.6)
            tornillo('Tornillo ' + name + ' tuerca interior', (wall - s * (T + 2), yc + dx, zc), (wall - s * T, yc + dx, zc), 2.8, vertices=6)
        # Three visible conductors per module; the final ends are illustrative,
        # not a replacement for the wiring diagram.
        for wire in range(3):
            hx = -9 if s < 0 else X + 9
            exit_y = Z0 + L - 12
            holex = T + 14 if s < 0 else T + MW - 14
            spread = (i * 3 + wire - 2.5) * 1.1
            pts = [(wall + s * 3, yc - 4 + wire * 4, my - 15),
                   (hx + spread * 0.3, yc, 19), (hx + spread * 0.3, exit_y, 10),
                   (hx + spread * 0.3, exit_y, Y - Y0 - AH + 1),
                   (wall + s * (28 + spread), exit_y + 20, 22),
                   (wall + s * (25 + spread), 110, 38),
                   (wall + s * (8 + spread), 143, 57),
                   (holex + spread * 0.35, Z + 6, Y + 8),
                   (holex + spread * 0.3, Z + 10, Y),
                   (holex + spread * 0.3, Z + 10, Y - 10),
                   (px + 8 + (i * 3 + wire) * 5, py + 14, proto_z(T + 24))]
            cable(f'Cable motor {lado} {i + 1} hilo {wire + 1}', pts, MAT['cable'][(i * 3 + wire + (0 if s < 0 else 3)) % 8], 0.65)
            # Black inline jumper sleeves on the outside of the case.
            a = Vector(pts[5]); b = a + Vector((-s * 4, 11, 7))
            sleeve = tornillo(f'Cable motor {lado} conector {i + 1} {wire + 1}', a, b, 1.45)
            sleeve.data.materials.clear(); sleeve.data.materials.append(MAT['negro'])
            for col in list(sleeve.users_collection): col.objects.unlink(sleeve)
            coleccion('Cables').objects.link(sleeve)

# USB lead is unplugged in the reference photos, hanging out of a side slot.
usb_port = arduino_orientation @ Vector((lx0 - 2, ly0 + 5.5, lz0 + 28.5))
cable('USB cable del Leonardo', [usb_port, (X - 8, Z + 16, 38), (X - 3, Z + 40, 19), (X + 7, Z + 45, 19), (X + 20, Z + 52, 45), (X + 26, Z + 55, 81)], MAT['negro'], 1.8)
caja_ref('USB conector libre', X + 21, Z + 50, 80, X + 29, Z + 60, 90, MAT['negro'])
caja_ref('USB terminal metálico', X + 22, Z + 51, 90, X + 28, Z + 59, 93, MAT['metal'])

# The two paper-tape strips wrap from the rear lid onto the top and bottom.
for i, x in enumerate((T + 12, T + MW - 33)):
    caja_ref(f'MOCHILA TAPA cinta {i + 1}', x, Z + MD + T + 0.1, 0, x + 21, Z + MD + T + 0.3, MH, MAT['cinta'], 'Mochila · tapa')
    for z in (-0.2, MH + 0.1):
        caja_ref(f'MOCHILA TAPA cinta pliegue {i + 1} {z}', x, Z + MD - 13, z, x + 21, Z + MD + T + 0.2, z + 0.15, MAT['cinta'], 'Mochila · tapa')

# ------------------------------------------------------------------ guardar, exportar y renderizar
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(AQUI, 'ensamble.blend'))
for o in bpy.context.scene.objects: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(AQUI, 'ensamble.glb'), export_format='GLB', use_selection=False, export_apply=True, export_yup=True, export_extras=True)
phone.hide_set(True)

sc.render.engine = 'BLENDER_WORKBENCH'
sh = sc.display.shading
sc.view_settings.view_transform = 'Standard'
sh.light = 'STUDIO'; sh.studio_light = 'paint.sl' if 'paint.sl' in [l.name for l in bpy.context.preferences.studio_lights] else sh.studio_light
sh.color_type = 'MATERIAL'; sh.show_object_outline = True; sh.object_outline_color = (0.1, 0.08, 0.06)
sh.show_cavity = True; sh.cavity_type = 'WORLD'; sh.show_shadows = False  # las sombras dejaban rayas en las caras
sc.render.resolution_x, sc.render.resolution_y = 1600, 1100
sc.render.film_transparent = False
sc.world = bpy.data.worlds.new('fondo'); sc.world.color = (0.95, 0.91, 0.81)
sh.background_type = 'VIEWPORT'; sh.background_color = (0.95, 0.91, 0.81)

cam = bpy.data.cameras.new('cam'); cam.lens = 50; cam.clip_end = 5000
camo = bpy.data.objects.new('cam', cam); sc.collection.objects.link(camo); sc.camera = camo
centro = Vector((X / 2, (Z + MD) / 2, Y / 2))
def mirar(pos, objetivo=centro, invertido=False):
    if invertido:
        # Match the web's 180° longitudinal display rotation without changing
        # the source meshes or their fabrication coordinates.
        cambio = Matrix.Translation((X / 2, 0, Y / 2)) @ Matrix.Rotation(math.pi, 4, 'Y') @ Matrix.Translation((-X / 2, 0, -Y / 2))
        pos, objetivo = cambio @ Vector(pos), cambio @ Vector(objetivo)
    camo.location = Vector(pos); camo.rotation_mode = 'QUATERNION'
    camo.rotation_quaternion = (Vector(objetivo) - Vector(pos)).to_track_quat('-Z', 'Y')
    if invertido: camo.rotation_quaternion = camo.rotation_quaternion @ Quaternion((0, 0, 1), math.pi)
def render(nombre):  # JPG para que pesen poco en el repo
    sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 85
    sc.render.filepath = os.path.join(AQUI, f'render_{nombre}.jpg'); bpy.ops.render.render(write_still=True)

# despiece: cada grupo se aleja en su dirección
EXPLO = {'Visor · tapa': (0, 0, 70), 'Asa izq': (-90, 0, 0), 'Asa der': (90, 0, 0), 'Mochila': (0, 110, 0),
         'Mochila · tapa': (0, 190, 0), 'Referencia (no se corta)': (0, 0, 0), 'Cables': (0, 0, 0), 'Tornillería': (0, 0, 0)}
def separar(f):
    for g, c in grupos.items():
        d = Vector(EXPLO.get(g, (0, 0, 0)))
        for o in c.objects:
            if 'b' not in o: o['b'] = list(o.location)
            o.location = Vector(o['b']) + d * f

mirar((-300, -330, 290), invertido=True); render('armado_frente')
mirar((420, 560, 260)); render('armado_atras')
grupos['Cables'].hide_render = True
separar(1); mirar((-480, -420, 420), Vector((X / 2, (Z + MD) / 2 + 40, Y / 2))); render('despiece')
separar(0); grupos['Cables'].hide_render = False
grupos['Mochila · tapa'].hide_render = True; mirar((X / 2, 520, 135), Vector((X / 2, Z + MD / 2, Y / 2)), invertido=True); render('mochila_abierta')
grupos['Mochila · tapa'].hide_render = False
grupos['Asa izq'].hide_render = True; mirar((-260, 20, 120), Vector((0, Z0 + L / 2, Y / 2))); render('asa_por_dentro')
grupos['Asa izq'].hide_render = False
mirar((-300, -330, 290), invertido=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(AQUI, 'ensamble.blend'))
publico = os.path.abspath(os.path.join(AQUI, '../../web/models/visor-bandadas'))
os.makedirs(publico, exist_ok=True)
shutil.copyfile(os.path.join(AQUI, 'ensamble.glb'), os.path.join(publico, 'ensamble.glb'))
shutil.copyfile(os.path.join(AQUI, 'render_armado_frente.jpg'), os.path.join(publico, 'ensamble.jpg'))
print('listo: ensamble.blend, ensamble.glb, render_*.jpg y copias web actualizadas')

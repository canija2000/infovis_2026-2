"""Ensamble 3D real del visor integrado en Blender, con las mismas piezas del plano de corte.

Uso (desde esta carpeta, después de python3 generar.py):
    /Applications/Blender.app/Contents/MacOS/Blender --background --python blender_ensamble.py

Lee piezas.json (los contornos, huecos y círculos exactos que van a la cortadora), extruye cada pieza al espesor T
y la ubica en su lugar del ensamble. Agrega como referencia (sin cortar) el teléfono, el Leonardo, la protoboard,
los motores, los tornillos y los cables. Guarda:
    ensamble.blend          la escena, para abrirla en Blender
    ensamble.glb            el modelo para el visor web (ensamble.html)
    render_*.jpg            vistas armado, despiece, mochila abierta y asa por dentro

Coordenadas en mm: X = ancho (0 a X), Y = largo desde el lado de los ojos (0) hacia el teléfono, Z = alto.
"""
import bpy, bmesh, json, math, os
from mathutils import Vector, Matrix

AQUI = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(AQUI, 'piezas.json')))
T, X, Y, Z = D['T'], D['X'], D['Y'], D['Z']
L, AH, AW = D['ASA']; Z0, Y0 = D['ASA_Z0'], D['ASA_Y0']
MW, MH, MD = D['MOCH']
XV, DV, HV = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))

# ------------------------------------------------------------------ escena limpia
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.unit_settings.system = 'NONE'

def material(nombre, rgb, rough=0.8):
    m = bpy.data.materials.new(nombre); m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF'); b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough
    return m
MAT = {
    'visor': material('MDF visor', (0.80, 0.62, 0.38)),
    'nuevo': material('MDF asas y mochila', (0.55, 0.72, 0.86)),
    'leo': material('Leonardo', (0.10, 0.45, 0.42)), 'proto': material('Protoboard', (0.93, 0.92, 0.88)),
    'motor': material('Motor', (0.85, 0.35, 0.45)), 'fono': material('Teléfono', (0.08, 0.09, 0.11), 0.4),
    'metal': material('Tornillo', (0.45, 0.45, 0.47), 0.3), 'usb': material('USB', (0.12, 0.12, 0.12)),
    'cable': [material(f'Cable {i}', c) for i, c in enumerate([(0.85, 0.25, 0.2), (0.9, 0.6, 0.15), (0.2, 0.45, 0.85), (0.2, 0.6, 0.35)])],
}
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
    return bpy.context.view_layer.objects.active

def caja_ref(nombre, x0, y0, z0, x1, y1, z1, mat, grupo='Referencia (no se corta)'):
    bpy.ops.mesh.primitive_cube_add(size=1)
    ob = bpy.context.active_object; ob.name = nombre
    ob.scale = (x1 - x0, y1 - y0, z1 - z0); ob.location = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    bpy.ops.object.transform_apply(scale=True)
    for c in ob.users_collection: c.objects.unlink(ob)
    coleccion(grupo).objects.link(ob); ob.data.materials.append(mat)
    return ob

def tornillo(nombre, a, b, r=1.5):
    va, vb = Vector(a), Vector(b)
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=(vb - va).length, vertices=12)
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

for p in D['piezas']:
    l = lugar(p['nombre'])
    if l: solido(p, *l)

# ------------------------------------------------------------------ referencia: teléfono, placas, motores, tornillos, cables
r0 = Z - T - D['GAP']
caja_ref('Teléfono (entra por la ranura del costado)', X / 2 - 80, r0 + 1, T, X / 2 + 80, r0 + 10, T + 75, MAT['fono'])
lx0, ly0 = 2 * T + 3.5, Z + T + 1
caja_ref('Arduino Leonardo', lx0, ly0, T, lx0 + 70, ly0 + 55, T + 12, MAT['leo'], 'Mochila')
caja_ref('Protoboard', MW - 47 - 4, Z + T + 10, T, MW - 4, Z + T + 45, T + 10, MAT['proto'], 'Mochila')
my = D['my']
for lado, s in (('izq', -1), ('der', 1)):
    for i, c in enumerate(D['MOTOR_C']):
        x0 = -5 if s < 0 else X
        caja_ref(f'Motor {lado} {"adelante" if i == 0 else "atrás"}', x0, Z0 + c - 11.5, my - 10.5, x0 + 5, Z0 + c + 11.5, my + 10.5, MAT['motor'])
        xin, xout = (T + 1, -7) if s < 0 else (X - T - 1, X + 7)
        for dx, dy in D['MOTOR_AGUJEROS']:              # dos tornillos por motor, por sus dos agujeros
            tornillo(f'Tornillo motor {lado} {i + 1}', (xin, Z0 + c + dx, my + dy), (xout, Z0 + c + dx, my + dy), 1.4)

# cables de los motores: asa → agujero de arriba del asa → sobre la tapa (bridas) → agujeros de arriba de la mochila → protoboard
k = 0
for s in (-1, 1):
    hx = -9 if s < 0 else X + 9                       # agujero de arriba del asa (a 9 mm del lateral)
    hz = Z0 + L - 12
    bx = 12 if s < 0 else X - 12                       # línea de bridas
    holex = T + 14 if s < 0 else T + MW - 14
    for i, c in enumerate(D['MOTOR_C']):
        x0 = -2.5 if s < 0 else X + 2.5
        pts = [(x0 + s * 3, Z0 + c, my + 10), (hx, Z0 + c + 4, Y0 + AH - 10), (hx, hz, Y0 + AH + 2), (hx, hz, Y + 5),
               (bx + s * 3 * i, hz - 6, Y + 3), (bx + s * 3 * i, Z - 25, Y + 3), (holex, Z + 6, Y + 4), (holex, Z + 10, MH - 8),
               (MW - 30 + 6 * i, Z + 30, 30), (MW - 30 + 6 * i, Z + T + 20, T + 11)]
        cable(f'Cable motor {k + 1}', pts, MAT['cable'][k]); k += 1
cable('USB teléfono → Leonardo', [(X + 80, r0 + 5, 40), (X + 70, Z + 2, 30), (X + 4, Z + 22, 16), (X - 2 * T - 6, Z + 22, 16), (lx0 + 66, ly0 + 30, T + 8)], MAT['usb'], 2.2)

# ------------------------------------------------------------------ guardar, exportar y renderizar
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(AQUI, 'ensamble.blend'))
for o in bpy.context.scene.objects: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(AQUI, 'ensamble.glb'), export_format='GLB', use_selection=False, export_apply=True, export_yup=True)

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
def mirar(pos, objetivo=centro):
    camo.location = Vector(pos); camo.rotation_mode = 'QUATERNION'
    camo.rotation_quaternion = (Vector(objetivo) - Vector(pos)).to_track_quat('-Z', 'Y')
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

mirar((-300, -330, 290)); render('armado_frente')
mirar((420, 560, 260)); render('armado_atras')
grupos['Cables'].hide_render = True
separar(1); mirar((-480, -420, 420), Vector((X / 2, (Z + MD) / 2 + 40, Y / 2))); render('despiece')
separar(0); grupos['Cables'].hide_render = False
grupos['Mochila · tapa'].hide_render = True; mirar((260, 520, 300), Vector((X / 2, Z + MD / 2, Y / 3))); render('mochila_abierta')
grupos['Mochila · tapa'].hide_render = False
grupos['Asa izq'].hide_render = True; mirar((-260, 20, 120), Vector((0, Z0 + L / 2, Y / 2))); render('asa_por_dentro')
grupos['Asa izq'].hide_render = False
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(AQUI, 'ensamble.blend'))
print('listo: ensamble.blend, ensamble.glb y render_*.png')

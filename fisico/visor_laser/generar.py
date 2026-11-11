#!/usr/bin/env python3
"""Plano de corte láser del visor del Aviario (caja con uniones de dedos, MDF o terciado).

Uso:  python3 generar.py            → visor_corte.svg, visor_corte.dxf y visor_guia.svg en esta carpeta
Todas las medidas están en milímetros. Cambia los parámetros de abajo y vuelve a correrlo.

El visor es una caja: en un extremo se mira por dos ventanas octogonales y en el otro va el teléfono,
acostado, con la pantalla hacia adentro. El teléfono entra **por el costado**, por una ranura en cada lado,
y queda entre el «marco» (una pared interior con ventana) y la pared trasera. Si es más largo que la caja,
simplemente sobresale por los lados: el largo del teléfono no importa, solo su ancho y su grosor.
"""
import math, os

# ------------------------------------------------------------------ parámetros
T = 3.0          # espesor real del material (mídelo con pie de metro: el MDF «de 3» suele ser 2,8–3,2)
PLANCHA = (335.0, 365.0) # plancha disponible (ancho, alto); el script avisa si las piezas no caben
X = 120.0        # ancho exterior  (interior = 114; el teléfono sobresale por los lados)
Y = 90.0         # alto exterior   (interior = 84)
Z = 122.0        # largo exterior: lo máximo que cabe en la plancha (ojo–pantalla ≈ 12 cm)
GAP = 13.0       # grosor de la ranura: grosor del teléfono con carcasa + 1
RANURA_ALTO = 79.0       # alto de la ranura: ancho del teléfono con carcasa + 1 (máximo Y − 2T − 5)
RANURA_AMBOS = True      # True: ranura en los dos lados (el teléfono se centra y puede sobresalir por ambos)
ALERO = 8.0      # los lados sobresalen esto por detrás, para que la ranura no debilite el borde
VENTANA = (100.0, 64.0)  # ventana del marco (ancho, alto): menor que el teléfono para que no pase
IPD = 62.0       # distancia entre los centros de los ojos
OJO = 36.0       # ventana octogonal de cada ojo, medida entre caras planas
OJO_Y = 58.0     # altura del centro de los ojos desde la base exterior
ARO = 46.0       # aro exterior de las ojeras
N_OJERAS = 2     # aros apilados por ojo
NARIZ = (36.0, 26.0)     # hueco para la nariz en la careta (ancho, alto)
N_X, N_Z, N_Y = 5, 7, 5  # número (impar) de dedos a lo ancho, a lo largo y a lo alto
SEP = 4.0        # separación entre piezas y margen al borde de la plancha

# ------------------------------------------------------------------ geometría
def dedos(lo, hi, n, sobresalen):
    """Intervalos hundidos al dividir [lo, hi] en n dedos; sobresalen los pares (0) o los impares (1)."""
    s = (hi - lo) / n
    return [(lo + i * s, lo + (i + 1) * s, T) for i in range(n) if i % 2 != sobresalen]

def perfil(L, hundidos, especial=None):
    """Puntos (c, d) de un borde de largo L: c a lo largo, d hacia adentro. Devuelve (d_inicio, puntos, d_fin).
    especial = (a, b, [(c, d), ...]) reemplaza el tramo [a, b] por esa silueta, con sus extremos incluidos
    (p. ej. el hueco de la nariz o la ranura del teléfono)."""
    iv = sorted(hundidos)
    if especial:
        a, b, _ = especial
        rec = []
        for (p, q, d) in iv:
            if q <= a or p >= b: rec.append((p, q, d))
            else:
                if p < a: rec.append((p, a, d))
                if q > b: rec.append((b, q, d))
        iv = sorted(rec)
    fus = []                                   # une intervalos contiguos de igual profundidad
    for (p, q, d) in iv:
        if fus and abs(fus[-1][1] - p) < 1e-6 and fus[-1][2] == d: fus[-1] = (fus[-1][0], q, d)
        else: fus.append((p, q, d))
    ev = [(p, q, d, None) for (p, q, d) in fus]
    if especial: ev.append((especial[0], especial[1], 0, especial[2]))
    ev.sort()
    pts, d0, d1 = [], 0.0, 0.0
    for (p, q, d, poly) in ev:
        if poly is not None: pts += list(poly); continue
        pega_a = especial and abs(p - especial[1]) < 1e-6      # empieza donde termina la silueta especial
        pega_b = especial and abs(q - especial[0]) < 1e-6      # termina donde empieza
        if p <= 1e-6: d0 = d
        else: pts += [(p, d)] if pega_a else [(p, 0.0), (p, d)]
        if q >= L - 1e-6: d1 = d
        else: pts += [(q, d)] if pega_b else [(q, d), (q, 0.0)]
    return d0, pts, d1

def panel(W, H, abajo=(), derecha=(), arriba=(), izquierda=(), esp_abajo=None):
    """Polígono de un panel W × H. Cada borde recibe sus intervalos hundidos en coordenadas del panel."""
    b = perfil(W, abajo, esp_abajo); r = perfil(H, derecha); t = perfil(W, arriba); l = perfil(H, izquierda)
    t = (t[2], t[1][::-1], t[0]); l = (l[2], l[1][::-1], l[0])      # arriba e izquierda se recorren al revés
    pts = [(l[2], b[0])]
    pts += [(c, d) for c, d in b[1]];           pts.append((W - r[0], b[2]))
    pts += [(W - d, c) for c, d in r[1]];       pts.append((W - r[2], H - t[0]))
    pts += [(c, H - d) for c, d in t[1]];       pts.append((l[0], H - t[2]))
    pts += [(d, c) for c, d in l[1]]
    out = []
    for p in pts:
        if not out or abs(out[-1][0] - p[0]) > 1e-6 or abs(out[-1][1] - p[1]) > 1e-6: out.append(p)
    if abs(out[0][0] - out[-1][0]) < 1e-6 and abs(out[0][1] - out[-1][1]) < 1e-6: out.pop()
    cambio = True                              # quita las idas y vueltas sobre la misma línea (el láser pasaría dos veces)
    while cambio:
        cambio = False
        for i in range(len(out)):
            (ax, ay), (bx, by), (cx, cy) = out[i - 1], out[i], out[(i + 1) % len(out)]
            cruz = (bx - ax) * (cy - by) - (by - ay) * (cx - bx)
            if abs(cruz) < 1e-9 and (bx - ax) * (cx - bx) + (by - ay) * (cy - by) <= 0:
                out.pop(i); cambio = True; break
    return out

def rect(x0, y0, x1, y1): return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
def octogono(cx, cy, entre_caras):
    r = entre_caras / 2 / math.cos(math.pi / 8)
    return [(cx + r * math.cos(math.pi / 8 + k * math.pi / 4), cy + r * math.sin(math.pi / 8 + k * math.pi / 4)) for k in range(8)]

esq = [(0, T, T), (Y - T, Y, T)]                         # esquinas de los bordes verticales (son de tapa y base)
A_X, B_X = dedos(0, X, N_X, 0), dedos(0, X, N_X, 1)      # A: dueño de las esquinas · B: su complemento
A_Z, B_Z = dedos(0, Z, N_Z, 0), dedos(0, Z, N_Z, 1)
A_Y, B_Y = esq + dedos(T, Y - T, N_Y, 0), esq + dedos(T, Y - T, N_Y, 1)

z_marco = Z - T - GAP - T                                # cara delantera del marco
leng_x = [(X / 4 - 12, X / 4 + 12), (3 * X / 4 - 12, 3 * X / 4 + 12)]   # lengüetas del marco (arriba y abajo)

piezas = []   # (nombre, ancho, alto, contorno, [huecos poligonales], [círculos (cx, cy, r)])

# Tapa y base son iguales: dedos en los cuatro bordes y dos ranuras para las lengüetas del marco.
for nombre in ('TAPA', 'BASE'):
    piezas.append((nombre, X, Z, panel(X, Z, abajo=A_X, derecha=A_Z, arriba=A_X, izquierda=A_Z),
                   [rect(a, z_marco, b, z_marco + T) for a, b in leng_x], []))
# Lados: más largos que la caja (alero), con la ranura del teléfono abierta desde el borde de abajo, a ras
# del piso, para que el teléfono entre deslizando. Agujero para un cordón adelante.
LZ = Z + ALERO
cola = [(Z, LZ, T)]                                      # el alero queda a la altura del interior
r0, r1 = Z - T - GAP, Z - T
ranura = (r0, r1, [(r0, T), (r0, T + RANURA_ALTO), (r1, T + RANURA_ALTO), (r1, T)])
for nombre, con_ranura in (('LADO IZQ', True), ('LADO DER', RANURA_AMBOS)):
    piezas.append((nombre, LZ, Y, panel(LZ, Y, abajo=B_Z + cola, arriba=B_Z + cola, izquierda=A_Y,
                                        esp_abajo=ranura if con_ranura else None), [], [(18, Y - 14, 2.5)]))
# Careta: dos ventanas octogonales y el hueco de la nariz.
nx0, nx1 = X / 2 - NARIZ[0] / 2, X / 2 + NARIZ[0] / 2
nariz = (nx0, nx1, [(nx0, 0), (nx0, NARIZ[1] - 9), (nx0 + 9, NARIZ[1]), (nx1 - 9, NARIZ[1]), (nx1, NARIZ[1] - 9), (nx1, 0)])
piezas.append(('CARETA', X, Y, panel(X, Y, abajo=B_X, derecha=B_Y, arriba=B_X, izquierda=B_Y, esp_abajo=nariz),
               [octogono(X / 2 - IPD / 2, OJO_Y, OJO), octogono(X / 2 + IPD / 2, OJO_Y, OJO)], []))
# Trasera: va entre los dos lados (bordes laterales lisos) y se une con dedos a la tapa y a la base.
piezas.append(('TRASERA', X, Y, panel(X, Y, abajo=B_X, derecha=[(0, Y, T)], arriba=B_X, izquierda=[(0, Y, T)]), [], []))
# Marco: pared interior con ventana; lengüetas arriba y abajo, costados lisos (ahí pasa el teléfono).
MW = X - 2 * T
lm = [(a - T, b - T) for a, b in leng_x]
hund = [(0, lm[0][0], T), (lm[0][1], lm[1][0], T), (lm[1][1], MW, T)]
piezas.append(('MARCO', MW, Y, panel(MW, Y, abajo=hund, arriba=hund),
               [rect((MW - VENTANA[0]) / 2, T + 8, (MW + VENTANA[0]) / 2, T + 8 + VENTANA[1])], []))
# Ojeras: aros octogonales que se apilan alrededor de cada ventana.
for i in range(2 * N_OJERAS):
    piezas.append((f'OJERA {i + 1}', ARO, ARO, octogono(ARO / 2, ARO / 2, ARO), [octogono(ARO / 2, ARO / 2, OJO)], []))

# ------------------------------------------------------------------ distribución en la plancha
def girar(p):
    """La misma pieza girada un cuarto de vuelta, para aprovechar la plancha."""
    nombre, W, H, cont, huecos, circ = p
    g = lambda poly: [(py, W - px) for px, py in poly]
    return (nombre, H, W, g(cont), [g(h) for h in huecos], [(cy, W - cx, r) for cx, cy, r in circ])

por_nombre = {p[0]: p for p in piezas}
for n in ('LADO IZQ', 'LADO DER', 'CARETA', 'MARCO'): por_nombre[n] = girar(por_nombre[n])
piezas = list(por_nombre.values())
filas = [['LADO IZQ', 'LADO DER', 'TAPA'], ['BASE', 'CARETA', 'MARCO'], ['TRASERA'] + [f'OJERA {i + 1}' for i in range(2 * N_OJERAS)]]
puestas, y, ancho_total = [], SEP, 0
for fila in filas:
    x, alto = SEP, 0
    for n in fila:
        p = por_nombre[n]
        puestas.append((p, x, y)); x += p[1] + SEP; alto = max(alto, p[2])
    ancho_total = max(ancho_total, x); y += alto + SEP
ALTO_TOTAL = y

# ------------------------------------------------------------------ comprobaciones
def area(poly): return abs(sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))) / 2
for (nombre, W, H, cont, huecos, circ) in piezas:
    for (px, py) in cont + [q for h in huecos for q in h]:
        assert -1e-6 <= px <= W + 1e-6 and -1e-6 <= py <= H + 1e-6, f'{nombre}: punto fuera del panel'
    for i in range(len(cont)):                      # el contorno solo tiene tramos horizontales, verticales o de 45°
        (ax, ay), (bx, by) = cont[i], cont[(i + 1) % len(cont)]
        assert math.hypot(bx - ax, by - ay) > 1e-3, f'{nombre}: tramo de largo cero'
        recto = abs(bx - ax) < 1e-6 or abs(by - ay) < 1e-6 or abs(abs(bx - ax) - abs(by - ay)) < 1e-6
        assert recto, f'{nombre}: tramo oblicuo inesperado entre {cont[i]} y {cont[(i + 1) % len(cont)]}'
assert (Z / N_Z) > T and (X / N_X) > T and ((Y - 2 * T) / N_Y) > T, 'dedos más angostos que el espesor'
assert RANURA_ALTO <= Y - 2 * T - 5, 'ranura demasiado alta: sube Y'
assert ancho_total <= PLANCHA[0] and ALTO_TOTAL <= PLANCHA[1], f'no cabe en la plancha: ocupa {ancho_total:.0f} × {ALTO_TOTAL:.0f} mm'
assert VENTANA[0] <= X - 2 * T - 10 and T + 8 + VENTANA[1] <= Y - T - 6, 'la ventana no cabe en el marco'

# ------------------------------------------------------------------ salida
aqui = os.path.dirname(os.path.abspath(__file__))
f = lambda v: f'{v:.3f}'.rstrip('0').rstrip('.')
# Las piezas se dibujan con su «arriba» hacia arriba (el eje Y del SVG va hacia abajo, así que se invierte).
def d_path(poly, ox, oy, H): return 'M' + ' L'.join(f'{f(px + ox)},{f(H - py + oy)}' for px, py in poly) + ' Z'

def svg(con_guia):
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{f(ancho_total)}mm" height="{f(ALTO_TOTAL)}mm" viewBox="0 0 {f(ancho_total)} {f(ALTO_TOTAL)}">']
    if con_guia: o.append(f'<rect width="100%" height="100%" fill="#f3ead2"/>')
    estilo = 'fill="#e0b56a" fill-rule="evenodd" stroke="#2a1c08" stroke-width="0.4"' if con_guia else 'fill="none" stroke="#000000" stroke-width="0.1"'
    for (p, ox, oy) in puestas:
        nombre, W, H, cont, huecos, circ = p
        if con_guia:      # una sola figura con sus huecos, para que se vea el material
            d = ' '.join([d_path(cont, ox, oy, H)] + [d_path(h, ox, oy, H) for h in huecos])
            o.append(f'<path d="{d}" {estilo}/>')
            for (cx, cy, r) in circ: o.append(f'<circle cx="{f(cx + ox)}" cy="{f(H - cy + oy)}" r="{f(r)}" fill="#f3ead2" stroke="#2a1c08" stroke-width="0.4"/>')
            if not nombre.startswith('OJERA') or nombre.endswith(' 1'):
                etiqueta = f'OJERAS ×{2 * N_OJERAS}' if nombre.startswith('OJERA') else f'{nombre} · {f(W)} × {f(H)}'
                tx, ty = (ox + 2, oy + H + 4.2) if nombre.startswith('OJERA') else (ox + W / 2, oy + (H * 0.33 if nombre in ('CARETA', 'MARCO') else H / 2))
                if nombre == 'CARETA': ty = oy + 12
                if nombre == 'MARCO': ty = oy + H / 2
                anc = 'start' if nombre.startswith('OJERA') else 'middle'
                o.append(f'<text x="{f(tx)}" y="{f(ty)}" font-family="Courier New, monospace" font-size="5" font-weight="bold" fill="#2a1c08" text-anchor="{anc}">{etiqueta}</text>')
        else:             # cada contorno es un trazo cerrado aparte, sin líneas repetidas
            for poly in [cont] + huecos: o.append(f'<path d="{d_path(poly, ox, oy, H)}" {estilo}/>')
            for (cx, cy, r) in circ: o.append(f'<circle cx="{f(cx + ox)}" cy="{f(H - cy + oy)}" r="{f(r)}" {estilo}/>')
    o.append('</svg>')
    return '\n'.join(o)

def dxf():
    """DXF R12 mínimo: polilíneas cerradas y círculos en la capa CORTE, en mm. El eje Y del DXF va hacia arriba."""
    o = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC',
         '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', '1',
         '0', 'LAYER', '2', 'CORTE', '70', '0', '62', '7', '6', 'CONTINUOUS', '0', 'ENDTAB', '0', 'ENDSEC',
         '0', 'SECTION', '2', 'ENTITIES']
    for (p, ox, oy) in puestas:
        for poly in [p[3]] + p[4]:
            o += ['0', 'POLYLINE', '8', 'CORTE', '66', '1', '70', '1']
            for (px, py) in poly: o += ['0', 'VERTEX', '8', 'CORTE', '10', f(px + ox), '20', f(ALTO_TOTAL - (p[2] - py + oy)), '30', '0']
            o += ['0', 'SEQEND']
        for (cx, cy, r) in p[5]: o += ['0', 'CIRCLE', '8', 'CORTE', '10', f(cx + ox), '20', f(ALTO_TOTAL - (p[2] - cy + oy)), '30', '0', '40', f(r)]
    o += ['0', 'ENDSEC', '0', 'EOF']
    return '\n'.join(o) + '\n'

open(os.path.join(aqui, 'visor_corte.svg'), 'w').write(svg(False))
open(os.path.join(aqui, 'visor_guia.svg'), 'w').write(svg(True))
open(os.path.join(aqui, 'visor_corte.dxf'), 'w').write(dxf())
corte = sum(sum(math.hypot(q[(i + 1) % len(q)][0] - q[i][0], q[(i + 1) % len(q)][1] - q[i][1]) for i in range(len(q))) for p in piezas for q in [p[3]] + p[4]) \
        + sum(2 * math.pi * c[2] for p in piezas for c in p[5])
material = sum(area(p[3]) - sum(area(h) for h in p[4]) for p in piezas)
print(f'Plancha mínima: {ancho_total:.0f} × {ALTO_TOTAL:.0f} mm · {len(piezas)} piezas · {corte / 1000:.1f} m de corte · '
      f'≈ {material * T / 1000 * 0.75:.0f} g en MDF')

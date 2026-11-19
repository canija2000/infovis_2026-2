#!/usr/bin/env python3
"""Plano de corte láser del visor integrado (propuesta B): visor + 2 asas con los motores + mochila de electrónica.

Uso:  python3 generar.py   → plancha_1/2_corte.svg y .dxf, plancha_1/2_guia.svg (y .png si hay rsvg-convert)

Todas las medidas en milímetros, MDF de 3 mm, uniones de dedos pegadas. Se reparte en planchas de 335 × 365.
Cambia los parámetros de abajo y vuelve a correrlo; el script comprueba que todo calce y quepa.

Cambios respecto del visor de fisico/visor_laser:
- Una sola ventana ancha en la careta (el «antifaz»), en vez de dos ojos: los dos ojos miran la misma imagen y
  las ojeras separadas resultaron incómodas.
- 20 mm más ancho (10 por lado), y el marco con una ventana casi del ancho interior: se ve el teléfono entero.
- Los motores de vibración se atornillan a los laterales del visor, bajo las asas.

Piezas nuevas:
- ASAS (2): cajas de agarre abiertas hacia el visor, adelante en cada lateral (lejos de la ranura del teléfono).
  Tapan dos motores cada una y se sujetan con 2 tornillos M3 que entran desde dentro del visor a dos pilares
  laminados con tuerca.
- MOCHILA: caja detrás del teléfono, entre los aleros de los laterales, con el Leonardo y la protoboard en el
  piso. Tapa trasera de 4 tornillos (apoyos laminados con tuerca, como el módulo R1). Se atornilla a la trasera
  del visor con 4 M3. Pasos para el USB del teléfono en los dos costados y para los cables de los motores arriba.
"""
import math, os, shutil, subprocess

# ------------------------------------------------------------------ parámetros
T = 3.0                  # espesor real del MDF (mídelo: el «de 3» varía entre 2,8 y 3,2)
PLANCHA = (335.0, 365.0)
SEP = 4.0                # separación entre piezas y margen al borde

# visor
X, Y, Z = 140.0, 90.0, float(os.environ.get('VISOR_Z', 170))   # ancho (antes 120: +10 por lado), alto, largo ojos–teléfono (antes 122)
GAP = 13.0               # ranura del teléfono: grosor con carcasa + 1
RANURA_ALTO = 79.0       # ancho del teléfono con carcasa + 1
ALERO = 8.0              # los laterales sobresalen por detrás; la mochila entra entre ellos
VENTANA = (124.0, 64.0)  # ventana del marco: casi todo el ancho interior (134) para ver el teléfono entero
ANTIFAZ = (104.0, 40.0, 10.0)   # ventana de la careta (ancho, alto, chaflán de esquinas)
ANTIFAZ_ARO = (124.0, 60.0, 14.0)   # aro exterior acolchable alrededor de la ventana (se apilan N_AROS)
N_AROS = 1              # aros apilados alrededor de la ventana (uno basta; un segundo da más relieve)
OJO_Y = 58.0             # altura del centro de la ventana desde la base
NARIZ = (36.0, 26.0)
N_X, N_Z, N_Y = 7, 7, 5  # dedos (impares) a lo ancho, a lo largo y a lo alto

# asas (caja de agarre en cada lateral, abierta hacia el visor)
ASA = (72.0, 78.0, 30.0) # largo (a lo largo del visor), alto, grosor hacia afuera (27 libres por dentro)
ASA_Z0, ASA_Y0 = 8.0, 6.0  # dónde empieza el asa en el lateral, desde adelante y desde abajo
MOTOR = (23.0, 21.0)     # módulo de vibración (largo, alto); 5 mm de grosor
MOTOR_C = (20.0, 52.0)   # centros de los dos motores a lo largo del asa (adelante, atrás)
PILAR = 12.0             # pilares laminados del asa (cuadrados)
HOLE, NUT_AF = 3.4, 5.6  # paso M3 y tuerca M3 entre caras

# mochila (entre los aleros, detrás de la trasera)
MOCH = (X - 2 * T, Y, 70.0)    # ancho, alto, fondo: el Leonardo (70 × 55) va acostado en el piso, 55 a lo hondo
APOYO = 12.0             # apoyos de la tapa trasera, en las esquinas
N_APOYO = 3              # capas por apoyo (la última, con tuerca)

# ------------------------------------------------------------------ geometría (igual que fisico/visor_laser)
def dedos(lo, hi, n, sobresalen):
    s = (hi - lo) / n
    return [(lo + i * s, lo + (i + 1) * s, T) for i in range(n) if i % 2 != sobresalen]

def perfil(L, hundidos, especial=None):
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
    fus = []
    for (p, q, d) in iv:
        if fus and abs(fus[-1][1] - p) < 1e-6 and fus[-1][2] == d: fus[-1] = (fus[-1][0], q, d)
        else: fus.append((p, q, d))
    ev = [(p, q, d, None) for (p, q, d) in fus]
    if especial: ev.append((especial[0], especial[1], 0, especial[2]))
    ev.sort(key=lambda e: (e[0], e[1]))
    pts, d0, d1 = [], 0.0, 0.0
    for (p, q, d, poly) in ev:
        if poly is not None: pts += list(poly); continue
        pega_a = especial and abs(p - especial[1]) < 1e-6
        pega_b = especial and abs(q - especial[0]) < 1e-6
        if p <= 1e-6: d0 = d
        else: pts += [(p, d)] if pega_a else [(p, 0.0), (p, d)]
        if q >= L - 1e-6: d1 = d
        else: pts += [(q, d)] if pega_b else [(q, d), (q, 0.0)]
    return d0, pts, d1

def panel(W, H, abajo=(), derecha=(), arriba=(), izquierda=(), esp_abajo=None):
    b = perfil(W, abajo, esp_abajo); r = perfil(H, derecha); t = perfil(W, arriba); l = perfil(H, izquierda)
    t = (t[2], t[1][::-1], t[0]); l = (l[2], l[1][::-1], l[0])
    pts = [(l[2], b[0])]
    pts += [(c, d) for c, d in b[1]];           pts.append((W - r[0], b[2]))
    pts += [(W - d, c) for c, d in r[1]];       pts.append((W - r[2], H - t[0]))
    pts += [(c, H - d) for c, d in t[1]];       pts.append((l[0], H - t[2]))
    pts += [(d, c) for c, d in l[1]]
    out = []
    for p in pts:
        if not out or abs(out[-1][0] - p[0]) > 1e-6 or abs(out[-1][1] - p[1]) > 1e-6: out.append(p)
    if abs(out[0][0] - out[-1][0]) < 1e-6 and abs(out[0][1] - out[-1][1]) < 1e-6: out.pop()
    cambio = True
    while cambio:
        cambio = False
        for i in range(len(out)):
            (ax, ay), (bx, by), (cx, cy) = out[i - 1], out[i], out[(i + 1) % len(out)]
            cruz = (bx - ax) * (cy - by) - (by - ay) * (cx - bx)
            if abs(cruz) < 1e-9 and (bx - ax) * (cx - bx) + (by - ay) * (cy - by) <= 0:
                out.pop(i); cambio = True; break
    return out

def rect(x0, y0, x1, y1): return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
def rect_c(cx, cy, w, h): return rect(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)
def chaflan(cx, cy, w, h, c):
    x0, x1, y0, y1 = cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2
    return [(x0 + c, y0), (x1 - c, y0), (x1, y0 + c), (x1, y1 - c), (x1 - c, y1), (x0 + c, y1), (x0, y1 - c), (x0, y0 + c)]
def hexagono(cx, cy, entre_caras):
    r = entre_caras / math.sqrt(3)
    return [(cx + r * math.cos(k * math.pi / 3), cy + r * math.sin(k * math.pi / 3)) for k in range(6)]
def ojal(cx, cy, largo, ancho=HOLE):   # ranura horizontal de extremos rectos (ajuste del motor)
    return rect_c(cx, cy, largo, ancho)

piezas = []   # (nombre, ancho, alto, contorno, [huecos], [círculos (cx, cy, r)])
def pieza(nombre, W, H, cont, huecos=(), circ=()): piezas.append((nombre, W, H, cont, list(huecos), list(circ)))

def juego(n_lado, L, n):          # dedos A (dueño de las esquinas) y B (complemento) sobre un largo L
    return dedos(0, L, n, 0), dedos(0, L, n, 1)

# ------------------------------------------------------------------ visor
esq = [(0, T, T), (Y - T, Y, T)]
A_X, B_X = juego('x', X, N_X)
A_Z, B_Z = juego('z', Z, N_Z)
A_Y, B_Y = esq + dedos(T, Y - T, N_Y, 0), esq + dedos(T, Y - T, N_Y, 1)
z_marco = Z - T - GAP - T
leng_x = [(X / 4 - 12, X / 4 + 12), (3 * X / 4 - 12, 3 * X / 4 + 12)]

# pasos para bridas en la tapa: los cables de los motores van de las asas a la mochila por encima del visor,
# junto a cada borde lateral, sujetos con bridas
def bridas(xc):
    return [r for z in (40, 72, 104) for r in (rect_c(xc - 4, z, 2, 5), rect_c(xc + 4, z, 2, 5))]
pieza('VISOR TAPA', X, Z, panel(X, Z, abajo=[], derecha=A_Z, arriba=A_X, izquierda=A_Z),
      [rect(a, z_marco, b, z_marco + T) for a, b in leng_x] + bridas(12) + bridas(X - 12))
pieza('VISOR BASE', X, Z, panel(X, Z, abajo=[], derecha=A_Z, arriba=A_X, izquierda=A_Z),
      [rect(a, z_marco, b, z_marco + T) for a, b in leng_x])

# laterales: ranura del teléfono abierta desde abajo, atrás; ojales de los motores y pasos de los tornillos del asa
LZ = Z + ALERO
cola = [(Z, LZ, T)]
r0, r1 = Z - T - GAP, Z - T
ranura = (r0, r1, [(r0, T), (r0, T + RANURA_ALTO), (r1, T + RANURA_ALTO), (r1, T)])
my = ASA_Y0 + ASA[1] / 2                             # altura de los motores: el centro del asa
pil_c = ASA_Z0 + ASA[0] / 2                          # los pilares van entre los dos motores
pil_y = (ASA_Y0 + T + PILAR / 2 + 2, ASA_Y0 + ASA[1] - T - PILAR / 2 - 2)
for nombre in ('VISOR LADO IZQ', 'VISOR LADO DER'):
    pieza(nombre, LZ, Y, panel(LZ, Y, abajo=B_Z + cola, arriba=B_Z + cola, izquierda=[], esp_abajo=ranura),
          [ojal(ASA_Z0 + c, my, 12) for c in MOTOR_C],
          [(pil_c, y, HOLE / 2) for y in pil_y])

# sin careta: el lado de los ojos queda abierto (las ojeras y la ventana resultaron incómodas); los bordes
# delanteros de tapa, base y laterales van lisos

# trasera: entre los laterales; 4 pasos M3 para la mochila y un paso de cables arriba al centro
moch_tornillos = [(X / 2 + s * (MOCH[0] / 2 - 18), y) for s in (-1, 1) for y in (22, Y - 22)]
pieza('VISOR TRASERA', X, Y, panel(X, Y, abajo=B_X, derecha=[(0, Y, T)], arriba=B_X, izquierda=[(0, Y, T)]),
      [], [(cx, cy, HOLE / 2) for cx, cy in moch_tornillos])

# marco: ventana casi del ancho interior
MW = X - 2 * T
lm = [(a - T, b - T) for a, b in leng_x]
hund = [(0, lm[0][0], T), (lm[0][1], lm[1][0], T), (lm[1][1], MW, T)]
pieza('VISOR MARCO', MW, Y, panel(MW, Y, abajo=hund, arriba=hund),
      [rect((MW - VENTANA[0]) / 2, T + 8, (MW + VENTANA[0]) / 2, T + 8 + VENTANA[1])])

# ------------------------------------------------------------------ cajas genéricas (asas y mochila)
def caja(pref, W, H, D, n_w, n_h, n_d, abierta_atras=True, extras=None, lados=('IZQ', 'DER')):
    """Caja de W (ancho) × H (alto) × D (fondo) con dedos. Con abierta_atras, la cara de atrás no existe (ahí va
    el visor o la tapa atornillada) y los bordes traseros de las demás caras quedan lisos."""
    extras = extras or {}
    eq = [(0, T, T), (H - T, H, T)]
    aw, bw = dedos(0, W, n_w, 0), dedos(0, W, n_w, 1)
    ad, bd = dedos(0, D, n_d, 0), dedos(0, D, n_d, 1)
    ah, bh = eq + dedos(T, H - T, n_h, 0), eq + dedos(T, H - T, n_h, 1)
    atras = [] if abierta_atras else aw
    for k in ('ARRIBA', 'ABAJO'):
        h, c = extras.get(k, ([], []))
        pieza(f'{pref} {k}', W, D, panel(W, D, abajo=aw, derecha=ad, arriba=atras, izquierda=ad), h, c)
    for k in lados:
        h, c = extras.get(k, ([], []))
        pieza(f'{pref} {k}', D, H, panel(D, H, abajo=bd, arriba=bd, izquierda=ah, derecha=[] if abierta_atras else ah), h, c)
    h, c = extras.get('FRENTE', ([], []))
    pieza(f'{pref} FRENTE', W, H, panel(W, H, abajo=bw, arriba=bw, izquierda=bh, derecha=bh), h, c)
    if not abierta_atras:
        h, c = extras.get('ATRAS', ([], []))
        pieza(f'{pref} ATRAS', W, H, panel(W, H, abajo=bw, arriba=bw, izquierda=bh, derecha=bh), h, c)

# asas: ancho = largo del asa, alto = alto del asa, fondo = grosor; el «frente» es la cara donde va la palma y la
# cara abierta apoya contra el lateral del visor. Paso de cables arriba, atrás.
for lado in ('IZQ', 'DER'):
    caja(f'ASA {lado}', ASA[0], ASA[1], ASA[2], 5, 5, 3, lados=('ADELANTE', 'ATRAS'), extras={
        'ARRIBA': ([], [(ASA[0] - 12, ASA[2] - 9, 4.0)]),
    })
    capas = round((ASA[2] - T) / T)
    for p in range(2):                                  # dos pilares por asa, laminados; la capa junto al visor lleva la tuerca
        for k in range(capas):
            hueco = [hexagono(PILAR / 2, PILAR / 2, NUT_AF)] if k == capas - 1 else []
            circ = [] if k == capas - 1 else [(PILAR / 2, PILAR / 2, HOLE / 2)]
            pieza(f'PILAR ASA {p + 1}·{lado}·{k + 1}', PILAR, PILAR, rect(0, 0, PILAR, PILAR), hueco, circ)

# mochila: frente contra la trasera del visor (4 M3), tapa trasera atornillada, pasos de USB a los dos costados y
# de cables de motores arriba adelante
MWd, MH, MD = MOCH
caja('MOCHILA', MWd, MH, MD, 7, 5, 5, extras={
    'FRENTE': ([], [(cx - T, cy, HOLE / 2) for cx, cy in moch_tornillos]),
    'ARRIBA': ([], [(14, 10, 5.0), (MWd - 14, 10, 5.0)]),
    'IZQ': ([rect(10, 8, 34, 24)], []),
    'DER': ([rect(10, 8, 34, 24)], []),
})
ap = [(T + APOYO / 2, T + APOYO / 2), (MWd - T - APOYO / 2, T + APOYO / 2), (T + APOYO / 2, MH - T - APOYO / 2), (MWd - T - APOYO / 2, MH - T - APOYO / 2)]
pieza('MOCHILA TAPA', MWd, MH, rect(0, 0, MWd, MH), [], [(x, y, HOLE / 2) for x, y in ap])
for a in range(4):
    for k in range(N_APOYO):
        hueco = [hexagono(APOYO / 2, APOYO / 2, NUT_AF)] if k == N_APOYO - 1 else []
        circ = [] if k == N_APOYO - 1 else [(APOYO / 2, APOYO / 2, HOLE / 2)]
        pieza(f'APOYO MOCHILA {a + 1}·{k + 1}', APOYO, APOYO, rect(0, 0, APOYO, APOYO), hueco, circ)
# cuna del Leonardo (4 escuadras bajas, como el módulo R1) y probeta de encaje
for k in range(4):
    pieza(f'ESCUADRA CUNA {k + 1}', 15, 11, [(0, 0), (15, 0), (15, 3), (3, 3), (3, 11), (0, 11)])
pieza('PROBETA', 40, 18, [(0, 0), (40, 0), (40, 18), (34.6, 18), (34.6, 8), (31.4, 8), (31.4, 18), (27.55, 18), (27.55, 8),
                          (24.45, 8), (24.45, 18), (20.5, 18), (20.5, 8), (17.5, 8), (17.5, 18), (13.45, 18), (13.45, 8),
                          (10.55, 8), (10.55, 18), (6.4, 18), (6.4, 8), (3.6, 8), (3.6, 18), (0, 18)],
      [hexagono(9, 4.2, NUT_AF)], [(34, 4.2, HOLE / 2)])   # ranuras de 2,8 a 3,2 mm, tuerca M3 y paso M3

# ------------------------------------------------------------------ comprobaciones de diseño
assert RANURA_ALTO <= Y - 2 * T - 5, 'ranura demasiado alta'
assert VENTANA[0] <= X - 2 * T - 8 and T + 8 + VENTANA[1] <= Y - T - 6, 'la ventana no cabe en el marco'
assert ASA_Z0 + ASA[0] < r0 - 4, 'el asa tapa la ranura del teléfono'
for c in MOTOR_C:                                     # motores dentro del asa y sin tocar los pilares
    assert T + 1 < c - MOTOR[0] / 2 and c + MOTOR[0] / 2 < ASA[0] - T - 1, 'un motor no cabe en el asa'
    for py in pil_y:  # choque solo si se cruzan a lo largo y en altura
        assert abs(c - ASA[0] / 2) > MOTOR[0] / 2 + PILAR / 2 or abs(py - my) > MOTOR[1] / 2 + PILAR / 2, 'un motor choca con un pilar'
assert round((ASA[2] - T) / T) * T == ASA[2] - T, 'el grosor interior del asa debe ser múltiplo de T (pilares)'
assert MD - T >= 55 + 1, 'el Leonardo (55 mm) no cabe a lo hondo de la mochila'
assert MH - 2 * T >= 10 + 40, 'la mochila no deja 40 mm para cables sobre la placa'

def area(poly): return abs(sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))) / 2
for (nombre, W, H, cont, huecos, circ) in piezas:
    for (px, py) in cont + [q for h in huecos for q in h]:
        assert -1e-6 <= px <= W + 1e-6 and -1e-6 <= py <= H + 1e-6, f'{nombre}: punto fuera del panel'
    for (cx, cy, r) in circ:
        assert r < cx < W - r and r < cy < H - r, f'{nombre}: círculo fuera del panel'
    for i in range(len(cont)):
        (ax, ay), (bx, by) = cont[i], cont[(i + 1) % len(cont)]
        assert math.hypot(bx - ax, by - ay) > 1e-3, f'{nombre}: tramo de largo cero'

# ------------------------------------------------------------------ piezas para el modelo 3D (blender_ensamble.py)
import json
json.dump({'T': T, 'X': X, 'Y': Y, 'Z': Z, 'GAP': GAP, 'ALERO': ALERO, 'z_marco': z_marco, 'ASA': ASA, 'ASA_Z0': ASA_Z0, 'ASA_Y0': ASA_Y0,
           'MOTOR': MOTOR, 'MOTOR_C': MOTOR_C, 'my': my, 'pil_c': pil_c, 'pil_y': pil_y, 'PILAR': PILAR, 'MOCH': MOCH, 'APOYO': APOYO,
           'N_APOYO': N_APOYO, 'ap': ap, 'moch_tornillos': moch_tornillos,
           'piezas': [{'nombre': n, 'W': W, 'H': H, 'contorno': c, 'huecos': h, 'circulos': ci} for (n, W, H, c, h, ci) in piezas]},
          open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'piezas.json'), 'w'), ensure_ascii=False)

# ------------------------------------------------------------------ reparto en planchas (estantes)
def girar(p):
    nombre, W, H, cont, huecos, circ = p
    g = lambda poly: [(py, W - px) for px, py in poly]
    return (nombre, H, W, g(cont), [g(h) for h in huecos], [(cy, W - cx, r) for cx, cy, r in circ])

# MaxRects (mejor ajuste por lado corto), con giro: llena cada plancha antes de abrir la siguiente.
def maxrects(items, W, H):
    libres, puestas, sobran = [(SEP, SEP, W - 2 * SEP + SEP, H - 2 * SEP + SEP)], [], []
    for p in items:
        mejor = None
        for cand in (p, girar(p)):
            w, h = cand[1] + SEP, cand[2] + SEP          # cada pieza reserva su separación a la derecha y arriba
            for (fx, fy, fw, fh) in libres:
                if w <= fw + 1e-6 and h <= fh + 1e-6:
                    k = (min(fw - w, fh - h), max(fw - w, fh - h))
                    if mejor is None or k < mejor[0]: mejor = (k, cand, fx, fy, w, h)
        if mejor is None: sobran.append(p); continue
        _, cand, x, y, w, h = mejor
        puestas.append((cand, x, y))
        nuevos = []
        for (fx, fy, fw, fh) in libres:                  # parte los rectángulos libres que toca la pieza
            if x >= fx + fw or x + w <= fx or y >= fy + fh or y + h <= fy: nuevos.append((fx, fy, fw, fh)); continue
            if x > fx: nuevos.append((fx, fy, x - fx, fh))
            if x + w < fx + fw: nuevos.append((x + w, fy, fx + fw - x - w, fh))
            if y > fy: nuevos.append((fx, fy, fw, y - fy))
            if y + h < fy + fh: nuevos.append((fx, y + h, fw, fy + fh - y - h))
        libres = [r for r in nuevos if not any(o != r and o[0] <= r[0] and o[1] <= r[1] and o[0] + o[2] >= r[0] + r[2] and o[1] + o[3] >= r[1] + r[3] for o in nuevos)]
    return puestas, sobran

pendientes = sorted(piezas, key=lambda p: -(p[1] * p[2]))
planchas = []
while pendientes:
    puestas, pendientes = maxrects(pendientes, *PLANCHA)
    assert puestas, 'una pieza no cabe en la plancha'
    planchas.append(puestas)
assert len(planchas) <= 2, f'no cabe en dos planchas: hacen falta {len(planchas)}'

# las piezas de una plancha no se solapan
for pl in planchas:
    for i in range(len(pl)):
        for j in range(i + 1, len(pl)):
            (a, ax, ay), (b, bx, by) = pl[i], pl[j]
            assert ax + a[1] + SEP / 2 <= bx or bx + b[1] + SEP / 2 <= ax or ay + a[2] + SEP / 2 <= by or by + b[2] + SEP / 2 <= ay, \
                f'se solapan {a[0]} y {b[0]}'
        assert all(x + p[1] <= PLANCHA[0] - SEP + 1e-6 and y + p[2] <= PLANCHA[1] - SEP + 1e-6 for p, x, y in pl), 'pieza fuera de la plancha'

# ------------------------------------------------------------------ salida
aqui = os.path.dirname(os.path.abspath(__file__))
f = lambda v: f'{v:.3f}'.rstrip('0').rstrip('.')
def d_path(poly, ox, oy, H): return 'M' + ' L'.join(f'{f(px + ox)},{f(H - py + oy)}' for px, py in poly) + ' Z'
COLOR = lambda n: '#9fc3e0' if n.startswith(('ASA', 'MOCHILA', 'PILAR', 'APOYO', 'ESCUADRA')) else '#e0b56a'

def svg(pl, con_guia, titulo=''):
    W, H = PLANCHA
    HH = H + (10 if con_guia else 0)            # la guía lleva una franja abajo para el título, fuera de la plancha
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{f(W)}mm" height="{f(HH)}mm" viewBox="0 0 {f(W)} {f(HH)}">']
    if con_guia:
        o.append('<rect width="100%" height="100%" fill="#f3ead2"/>')
        o.append(f'<rect x="0.2" y="0.2" width="{f(W - 0.4)}" height="{f(H - 0.4)}" fill="none" stroke="#2a1c08" stroke-width="0.4" stroke-dasharray="3 2"/>')
    vistos = set()
    for (p, ox, oy) in pl:
        nombre, PW, PH, cont, huecos, circ = p
        if con_guia:
            d = ' '.join([d_path(cont, ox, oy, PH)] + [d_path(h, ox, oy, PH) for h in huecos])
            o.append(f'<path d="{d}" fill="{COLOR(nombre)}" fill-rule="evenodd" stroke="#2a1c08" stroke-width="0.35"/>')
            for (cx, cy, r) in circ: o.append(f'<circle cx="{f(cx + ox)}" cy="{f(PH - cy + oy)}" r="{f(r)}" fill="#f3ead2" stroke="#2a1c08" stroke-width="0.35"/>')
            if min(PW, PH) < 20: continue   # pilares, apoyos y escuadras: sin texto (ver README)
            grupo = nombre.split('·')[0].rstrip(' 0123456789') if ('·' in nombre or nombre.startswith(('ESCUADRA', 'ARO'))) else nombre
            if grupo in vistos: continue
            vistos.add(grupo)
            n = sum(1 for q, _, _ in pl if (q[0].split('·')[0].rstrip(' 0123456789') if ('·' in q[0] or q[0].startswith(('ESCUADRA', 'ARO'))) else q[0]) == grupo)
            etiqueta = f'{nombre}'
            fs = 3.2 if min(PW, PH) < 30 else 4.2
            o.append(f'<text x="{f(ox + PW / 2)}" y="{f(oy + PH / 2 + fs / 3)}" font-family="Courier New, monospace" font-size="{fs}" font-weight="bold" fill="#2a1c08" text-anchor="middle">{etiqueta}</text>')
        else:
            for poly in [cont] + huecos: o.append(f'<path d="{d_path(poly, ox, oy, PH)}" fill="none" stroke="#000000" stroke-width="0.1"/>')
            for (cx, cy, r) in circ: o.append(f'<circle cx="{f(cx + ox)}" cy="{f(PH - cy + oy)}" r="{f(r)}" fill="none" stroke="#000000" stroke-width="0.1"/>')
    if con_guia and titulo:
        o.append(f'<text x="{f(W - 4)}" y="{f(H + 7)}" font-family="Courier New, monospace" font-size="5" font-weight="bold" fill="#2a1c08" text-anchor="end">{titulo}</text>')
    o.append('</svg>')
    return '\n'.join(o)

def dxf(pl):
    H = PLANCHA[1]
    o = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC',
         '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', '1',
         '0', 'LAYER', '2', 'CORTE', '70', '0', '62', '7', '6', 'CONTINUOUS', '0', 'ENDTAB', '0', 'ENDSEC',
         '0', 'SECTION', '2', 'ENTITIES']
    for (p, ox, oy) in pl:
        for poly in [p[3]] + p[4]:
            o += ['0', 'POLYLINE', '8', 'CORTE', '66', '1', '70', '1']
            for (px, py) in poly: o += ['0', 'VERTEX', '8', 'CORTE', '10', f(px + ox), '20', f(H - (p[2] - py + oy)), '30', '0']
            o += ['0', 'SEQEND']
        for (cx, cy, r) in p[5]: o += ['0', 'CIRCLE', '8', 'CORTE', '10', f(cx + ox), '20', f(H - (p[2] - cy + oy)), '30', '0', '40', f(r)]
    o += ['0', 'ENDSEC', '0', 'EOF']
    return '\n'.join(o) + '\n'

conv = shutil.which('rsvg-convert')
for i, pl in enumerate(planchas, 1):
    base = os.path.join(aqui, f'plancha_{i}')
    open(base + '_corte.svg', 'w').write(svg(pl, False))
    open(base + '_corte.dxf', 'w').write(dxf(pl))
    open(base + '_guia.svg', 'w').write(svg(pl, True, f'PLANCHA {i} DE {len(planchas)} · {int(PLANCHA[0])} × {int(PLANCHA[1])} mm · MDF {f(T)} mm'))
    if conv: subprocess.run([conv, '-w', '1340', base + '_guia.svg', '-o', base + '_guia.png'], check=True)

corte = sum(sum(math.hypot(q[(i + 1) % len(q)][0] - q[i][0], q[(i + 1) % len(q)][1] - q[i][1]) for i in range(len(q))) for p in piezas for q in [p[3]] + p[4]) \
    + sum(2 * math.pi * c[2] for p in piezas for c in p[5])
material = sum(area(p[3]) - sum(area(h) for h in p[4]) for p in piezas)
print(f'{len(piezas)} piezas en {len(planchas)} planchas de {PLANCHA[0]:.0f} × {PLANCHA[1]:.0f} mm · '
      f'{corte / 1000:.1f} m de corte · ≈ {material * T / 1000 * 0.75:.0f} g de MDF')
for i, pl in enumerate(planchas, 1):
    usado = sum(p[1] * p[2] for p, _, _ in pl) / (PLANCHA[0] * PLANCHA[1]) * 100
    print(f'  plancha {i}: {len(pl)} piezas, {usado:.0f} % ocupado')

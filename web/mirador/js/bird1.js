// Ave de una sola pieza (estilo N64, como Poroto): una malla continua por especie, de la punta de la cola
// al pico (cola → cuerpo → cuello → cabeza → pico), con secciones de 6 lados y UNA textura pintada encima
// (ojo, máscara, garganta, ala plegada, patrones). Ver blender/NOTAS.md, "Aves: de ensamble a una sola pieza".
//
// Mantiene la interfaz de buildBird (js/bird.js) para que aviary.js no cambie: head, tail y torso siguen
// siendo objetos que el comportamiento anima, pero en vez de mover esferas deforman los vértices de su zona
// (con mezcla en el cuello). Las alas de vuelo solo se ven al aletear; quieta, el ala plegada está pintada.
/* global THREE */
import { mat, makeTex, makeVary, mulberry32, texPlain, steady } from './ps1.js';

const TAU = Math.PI * 2;
const SIDES = 6;
const plain = texPlain();

// Perfil del cuerpo a lo largo de su eje (s = −1.25 cola … 0.82 pecho alto): [s, fracción del radio, alza].
// "alza" sube el centro del anillo (popa levantada del pato). Siluetas tomadas de las referencias
// (Half-Life 2, Zoo Tycoon 2, Poly Pizza): ver docs/registro_modelos.md.
const P0 = [[-1.25, 0.24], [-1.0, 0.48], [-0.55, 0.86], [0.0, 1.0], [0.45, 0.95], [0.82, 0.72]];
const PROFILES = {
  paloma: [[-1.25, 0.26], [-1.0, 0.5], [-0.55, 0.88], [0.0, 1.0], [0.45, 1.03], [0.82, 0.8]],     // pecho profundo
  playero: [[-1.25, 0.2], [-1.0, 0.42], [-0.55, 0.82], [0.0, 1.0], [0.45, 0.92], [0.82, 0.66]],  // esbelto
  garza: [[-1.25, 0.2], [-1.0, 0.42], [-0.55, 0.82], [0.0, 1.0], [0.45, 0.9], [0.82, 0.62]],
  picaflor: [[-1.25, 0.2], [-1.0, 0.4], [-0.55, 0.8], [0.0, 1.0], [0.45, 0.9], [0.82, 0.6]],
  gaviota: [[-1.3, 0.22], [-1.0, 0.45], [-0.55, 0.82], [0.0, 1.0], [0.5, 0.95], [0.85, 0.66]],   // torpedo
  pelicano: [[-1.25, 0.3], [-1.0, 0.56], [-0.55, 0.92], [0.0, 1.05], [0.45, 1.0], [0.82, 0.75]], // pesado
  cormoran: [[-1.25, 0.24], [-1.0, 0.48], [-0.55, 0.86], [0.0, 1.0], [0.45, 0.95], [0.82, 0.7]],
  pato: [[-1.25, 0.3, 0.3], [-1.0, 0.55, 0.15], [-0.55, 0.88], [0.0, 1.0], [0.45, 0.98], [0.82, 0.72]], // bote
  cisne: [[-1.25, 0.3, 0.3], [-1.0, 0.55, 0.15], [-0.55, 0.9], [0.0, 1.02], [0.45, 1.0], [0.82, 0.72]],
  rapaz: [[-1.25, 0.24], [-1.0, 0.45], [-0.55, 0.8], [0.0, 1.0], [0.45, 1.04], [0.82, 0.8]],     // hombros anchos
  loro: [[-1.25, 0.22], [-1.0, 0.45], [-0.55, 0.82], [0.0, 1.0], [0.45, 1.0], [0.82, 0.78]],
  carpintero: [[-1.25, 0.22], [-1.0, 0.45], [-0.55, 0.82], [0.0, 1.0], [0.45, 0.98], [0.82, 0.74]],
  codorniz: [[-1.25, 0.3], [-1.0, 0.62], [-0.55, 0.95], [0.0, 1.05], [0.45, 1.0], [0.82, 0.7]],   // redonda
  nandu: [[-1.25, 0.35], [-1.0, 0.7], [-0.55, 1.0], [0.0, 1.05], [0.45, 0.95], [0.82, 0.62]],
  pinguino: [[-1.25, 0.3], [-1.0, 0.75], [-0.55, 1.0], [0.0, 0.95], [0.45, 0.8], [0.82, 0.6]],   // huevo erguido
  flamenco: [[-1.2, 0.3], [-1.0, 0.6], [-0.55, 0.95], [0.0, 1.0], [0.45, 0.9], [0.82, 0.6]],
};
const FLAT_BELLY = { pato: 0.55, cisne: 0.6 };   // vientre plano de las aves que flotan
const S_NECK = new Set(['flamenco', 'cisne', 'garza']);

/** Anillo de SIDES vértices perpendicular a `axis` (en el plano x-y), alto h y ancho w. k=0 = vientre. */
function ring(center, axis, w, h, fb = 1) {
  const z = new THREE.Vector3(0, 0, 1);
  const up = new THREE.Vector3().crossVectors(z, axis).normalize();
  const pts = [];
  for (let k = 0; k <= SIDES; k++) { // el último repite el primero (costura de la textura)
    const a = TAU * k / SIDES, c = -Math.cos(a);
    pts.push(center.clone().addScaledVector(up, c * h * (c < 0 ? fb : 1)).addScaledVector(z, Math.sin(a) * w));
  }
  return pts;
}

/**
 * Esqueleto de anillos de la especie en el espacio de bodyPivot (mismo espacio que el ave por piezas).
 * Devuelve [{c, w, h, zone, wHead, wTail}] + datos de pivotes.
 */
function skeleton(pl, f, hs, headBase, bl, br, plan) {
  const B = pl.body, t = pl.tilt;
  const C = new THREE.Vector3(0.05, 0.72, 0);
  const d = new THREE.Vector3(Math.cos(t), Math.sin(t), 0);
  const R = [];
  // cola (plana, se abre hacia la punta): pivote donde estaba el grupo de la cola
  const tailPivot = new THREE.Vector3(...(pl.tailPos || [-1.0 * B[0] / 1.15, 0.9]), 0);
  const tr = pl.tail, tdir = new THREE.Vector3(-Math.cos(tr), -Math.sin(tr), 0);
  const L = 1.05 * f.tail;
  const tw = plan === 'picaflor' ? 0.6 : plan === 'gaviota' || plan === 'pinguino' ? 0.75 : 1;
  R.push({ c: tailPivot.clone().addScaledVector(tdir, L), w: 0.34 * tw, h: 0.025, zone: 'cola', wTail: 1, end: true });
  R.push({ c: tailPivot.clone().addScaledVector(tdir, L * 0.5), w: 0.27 * tw, h: 0.04, zone: 'cola', wTail: 1 });
  R.push({ c: tailPivot.clone().addScaledVector(tdir, 0.05), w: 0.2, h: 0.08, zone: 'cola', wTail: 0.7 });
  // cuerpo
  const fb = FLAT_BELLY[plan] || 1;
  for (const [s, k, lift = 0] of PROFILES[plan] || P0) {
    R.push({ c: C.clone().addScaledVector(d, s * B[0]).add(new THREE.Vector3(0, lift * B[1], 0)), w: k * B[2], h: k * B[1], fb, zone: 'cuerpo' });
  }
  // cuello (mezcla) y cabeza: la cabeza mira al frente (+x)
  const neckFrom = C.clone().addScaledVector(d, 0.85 * B[0]);
  const nl = pl.neckLen ?? 0;
  const nNeck = nl > 0.3 ? Math.min(6, Math.round(nl * 4)) : 1;
  // cuello en S (flamenco, cisne, garza): los anillos siguen una curva; si no, recto
  const dir = headBase.clone().sub(neckFrom), Ln = dir.length(), nd = dir.clone().normalize(), side = new THREE.Vector3(nd.y, -nd.x, 0);
  const curve = S_NECK.has(plan) ? new THREE.CatmullRomCurve3([neckFrom.clone(), neckFrom.clone().addScaledVector(dir, 0.33).addScaledVector(side, Ln * 0.16),
    neckFrom.clone().addScaledVector(dir, 0.7).addScaledVector(side, -Ln * 0.1), headBase.clone()]) : null;
  for (let i = 1; i <= nNeck; i++) {
    const k = i / (nNeck + 1);
    const c = curve ? curve.getPoint(k) : neckFrom.clone().lerp(headBase, k);
    const thin = nNeck > 1 ? 0.62 : 0.72;
    R.push({ c, w: hs * thin, h: hs * (thin + 0.06), zone: 'cuello', wHead: 0.25 + 0.5 * k });
  }
  const hx = new THREE.Vector3(1, 0, 0);
  R.push({ c: headBase.clone().addScaledVector(hx, -0.6 * hs).add(new THREE.Vector3(0, 0.02, 0)), w: hs * 0.82, h: hs * 0.86, zone: 'cabeza', wHead: 1 });
  R.push({ c: headBase.clone(), w: hs * 0.95, h: hs * 1.0, zone: 'cabeza', wHead: 1, eye: true });
  R.push({ c: headBase.clone().add(new THREE.Vector3(0.52 * hs, -0.03, 0)), w: hs * 0.72, h: hs * 0.74, zone: 'cabeza', wHead: 1 });
  // pico: base y punta (la punta es un vértice)
  const beakBase = headBase.clone().add(new THREE.Vector3(0.88 * hs, -0.06, 0));
  if (pl.bill) { // pico ancho y plano (pato, cisne): se mantiene ancho hasta la punta
    R.push({ c: beakBase, w: br * 1.7, h: br * 0.75, zone: 'pico', wHead: 1 });
    R.push({ c: beakBase.clone().add(new THREE.Vector3(bl * 0.8, -0.03, 0)), w: br * 1.6, h: br * 0.35, zone: 'pico', wHead: 1 });
  } else {
    const hook = pl.hookBill ? 1.6 : 1;
    R.push({ c: beakBase, w: br * 1.05 * hook, h: br * 1.15 * hook, zone: 'pico', wHead: 1 });
  }
  const tip = beakBase.clone().add(new THREE.Vector3(pl.hookBill ? bl * 0.55 : bl, -0.04 - (pl.bentBill ? bl * 0.6 : 0) - (pl.hookBill ? bl * 0.45 : 0), 0));
  return { R, tip, tailPivot, C, beakBase };
}

// ---------- textura de la especie: u = a lo largo del ave (cola → pico), v = alrededor (vientre → lomo → vientre) ----------
function paintSpecies(sp, P, layout) {
  const R = mulberry32(2000 + sp.id);
  const vary = makeVary(R);
  const pat = sp.palette?.pattern || {};
  const aw = sp.palette?.accentWhere, acc = P.accent;
  const W = 64, H = 32;
  const { uTailEnd, uBodyEnd, uNeckEnd, uEye, uBeak, uHeadFront } = layout;
  const patt = (zone, c, x, y) => {
    const p = pat[zone];
    if (p === 'barred') return (x % 3 === 0) ? P.back_dark : vary(c, 9);
    if (p === 'streaked') return (y % 4 === 0 && R() < 0.8) ? P.back_dark : vary(c, 9);
    if (p === 'spotted') return (R() < 0.07) ? [30, 26, 28] : vary(c, 8);
    return vary(c, 7);
  };
  return makeTex(W, H, (x, yy) => {
    const u = (x + 0.5) / W, v = (yy + 0.5) / H;
    const side = Math.abs(v - 0.5) * 2; // 0 = lomo, 1 = vientre
    const up = 1 - side;                 // 1 = lomo
    if (u > uBeak) return P.beak;
    if (u < uTailEnd) { // cola: lomo con color de cola; abajo más oscuro
      if (aw === 'subcaudales' && acc && side > 0.6) return vary(acc, 6);
      const c = patt('tail', aw === 'ala y cola' && acc ? acc : P.tail, x, yy);
      return side > 0.6 ? c.map(k => k * 0.8) : c;
    }
    if (u > uNeckEnd) { // cabeza
      const ex = (u - uEye) * W, ey = (Math.min(Math.abs(v - 0.25), Math.abs(v - 0.75))) * H;
      if (Math.abs(ex) < 1.2 && ey < 1.3) return ex > 0.2 && Math.abs(v - 0.25) < 0.5 / H + 0.02 ? [210, 210, 210] : P.eye;
      if (acc) {
        if (aw === 'bigote' && ey > 1.5 && ey < 3 && side > 0.4 && u > uEye - 0.04) return vary(acc, 5);
        if (aw === 'frente' && up > 0.7 && u > uHeadFront - 0.02) return vary(acc, 4);
        if (aw === 'gorguera' && side > 0.7) return (x + yy) % 3 === 0 ? [220, 230, 255] : vary(acc, 8);
        if (aw === 'collar' && u < uEye - 0.03 && side > 0.3) return vary(acc, 6);
      }
      if (side > 0.72) return vary(P.throat, 5);            // garganta
      if (pat.head === 'striped' && up > 0.6 && x % 3 === 0) return vary(P.back_dark, 5);
      return vary(R() < 0.12 ? P.back_dark : P.head, 6);
    }
    if (u > uBodyEnd) { // cuello: transición de cabeza (arriba) a garganta/pecho (abajo)
      if (aw === 'collar' && acc) return vary(acc, 6);
      if (side > 0.65) return vary(aw === 'pecho' && acc ? acc : P.throat, 6);
      return vary(P.head, 6);
    }
    // cuerpo
    const bu = (u - uTailEnd) / (uBodyEnd - uTailEnd); // 0 = cola … 1 = pecho
    if (acc && aw === 'pecho' && side > 0.45 && bu > 0.45) return vary(acc, 7);
    // ala plegada sobre el costado alto (de la mitad del cuerpo hacia atrás; primarias oscuras atrás)
    const wingBand = side > 0.18 && side < 0.62;
    if (wingBand && bu > 0.08 && bu < 0.72) {
      const wc = aw === 'ala y cola' && acc ? acc : P.wing;
      if (bu < 0.26) return vary(P.back_dark, 5);                         // primarias
      if (Math.abs(side - 0.18) < 0.05 || Math.abs(bu - 0.72) < 0.03) return vary(P.back_dark, 5); // borde
      return patt('wing', wc, x, yy);
    }
    if (side > 0.78) return patt('belly', P.belly, x, yy);
    if (side > 0.55) return patt('flank', P.flank, x, yy);
    return R() < 0.12 ? vary(P.back_dark, 5) : patt('back', P.back, x, yy);
  });
}

// ---------- alas de vuelo: planta del ala según el tipo de vuelo (solo se ven al volar) ----------
// La envergadura sale del largo del modelo (3,6 a escala 1) × razón envergadura/largo del grupo:
// planeadoras anchas con "dedos" (cóndor, jote), largas y en punta (gaviotas, pelícano), en punta
// (patos, palomas, playeros), redondeadas (paseriformes) y en hoz (picaflor). El ala va en el plano x-y:
// x = cuerda (adelante +), y = envergadura (la rotación en x la abre hacia el costado).
const WING_STYLE = {
  rapaz: ['ancha', 2.6], pelicano: ['larga', 2.5], gaviota: ['larga', 2.4], cormoran: ['punta', 1.8], garza: ['ancha', 2.1],
  pato: ['punta', 1.7], cisne: ['punta', 1.8], flamenco: ['punta', 1.9], playero: ['punta', 1.8], paloma: ['punta', 1.7],
  loro: ['punta', 1.6], picaflor: ['hoz', 1.3], pinguino: ['aleta', 0.75], nandu: ['redonda', 0.9],
};
export function flightWing(sp, plan, P, hwi = 20) {
  const [style, ratio] = WING_STYLE[plan] || ['redonda', 1.6];
  const span = Math.max(0.5, 3.6 * ratio / 2 - 0.35) * (style === 'aleta' || style === 'hoz' ? 1 : 0.9 + Math.min(0.25, hwi / 200));
  const cRoot = style === 'ancha' ? 1.05 : style === 'larga' ? 0.75 : style === 'aleta' ? 0.42 : style === 'hoz' ? 0.4 : 0.8;
  const N = 8, le = [], te = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, y = t * span;
    let c, sweep = 0;
    if (style === 'ancha') c = cRoot * (1 - 0.15 * t);
    else if (style === 'redonda') c = cRoot * Math.sqrt(Math.max(0.02, 1 - t ** 3));
    else if (style === 'aleta') c = cRoot * (1 - 0.6 * t);
    else { c = cRoot * (1 - 0.85 * t ** 1.4); sweep = (style === 'hoz' ? 0.5 : 0.28) * span * t ** 2 * (style === 'larga' ? 0.6 : 0.4); }
    le.push([0.25 * cRoot - sweep, y]); te.push([0.25 * cRoot - sweep - c, y]);
  }
  const pts = [...le];
  if (style === 'ancha') { // primarias separadas como dedos en la punta
    const tip = span, x0 = le[N][0], x1 = te[N][0], k = 5;
    for (let j = 0; j < k; j++) {
      const xa = x0 + (x1 - x0) * j / k, xb = x0 + (x1 - x0) * (j + 0.6) / k;
      pts.push([xa, tip + 0.28 * (1 - j * 0.12)], [xb, tip + 0.22 * (1 - j * 0.12)], [x0 + (x1 - x0) * (j + 1) / k, tip]);
    }
  }
  pts.push(...te.reverse());
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ShapeGeometry(shape);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  const xMax = 0.25 * cRoot, xMin = xMax - cRoot - 0.5 * span * 0.3;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, Math.min(1, pos.getY(i) / span), (pos.getX(i) - xMin) / (xMax - xMin));
  // textura: cobertoras (borde de ataque) del color del dorso, ala al medio, primarias oscuras en la mano
  const R = mulberry32(3000 + sp.id), vary = makeVary(R);
  const hand = style === 'aleta' ? 2 : style === 'hoz' ? 0.35 : 0.58;
  const tex = makeTex(32, 16, (x, y) => {
    const u = (x + 0.5) / 32, v = 1 - (y + 0.5) / 16;
    if (u > hand) return vary(P.back_dark, 6);
    if (v > 0.82) return vary(P.back, 6);
    if (v < 0.12) return vary(P.back_dark.map(k => k * 1.1), 6); // borde de fuga
    return vary(P.wing, 7);
  });
  return { geo, tex, span };
}

/**
 * Construye el ave de una pieza. `ctx` trae lo que bird.js ya calculó (plan, factores AVONET, paleta y
 * geometrías de patas/ala) para no duplicar lógica.
 */
export function buildBirdOnePiece(sp, plan, ctx) {
  const { pl, f, hs, headBase, bl, br, legLen, P, footGeo, tarsusGeo } = ctx;
  const { R, tip, tailPivot, C } = skeleton(pl, f, hs, headBase, bl, br, plan);

  // ---- malla: anillos + punta del pico; u por largo acumulado ----
  const rings = R.map((r, i) => {
    const prev = R[Math.max(0, i - 1)].c, next = i < R.length - 1 ? R[i + 1].c : tip;
    const axis = next.clone().sub(prev).normalize();
    return { ...r, pts: ring(r.c, axis, r.w, r.h, r.fb) };
  });
  const lens = [0];
  for (let i = 1; i < rings.length; i++) lens.push(lens[i - 1] + rings[i].c.distanceTo(rings[i - 1].c));
  const total = lens[lens.length - 1] + rings[rings.length - 1].c.distanceTo(tip);
  const uOf = i => lens[i] / total;
  const idx = z => rings.findIndex(r => r.zone === z);
  const lastIdx = z => rings.map(r => r.zone).lastIndexOf(z);
  const layout = {
    uTailEnd: uOf(lastIdx('cola')) + 0.01, uBodyEnd: uOf(lastIdx('cuerpo')), uNeckEnd: uOf(Math.max(lastIdx('cuello'), lastIdx('cuerpo'))) + 0.005,
    uEye: uOf(rings.findIndex(r => r.eye)) + 0.025, uHeadFront: uOf(idx('pico') - 1), uBeak: uOf(idx('pico')) - 0.004,
  };
  const pos = [], uv = [], wH = [], wT = [], index = [];
  rings.forEach((r, i) => r.pts.forEach((p, k) => {
    pos.push(p.x, p.y, p.z); uv.push(uOf(i), k / SIDES); wH.push(r.wHead || 0); wT.push(r.wTail || 0);
  }));
  const N = SIDES + 1;
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < SIDES; k++) {
    const a = i * N + k, b = i * N + k + 1, c = (i + 1) * N + k + 1, d = (i + 1) * N + k;
    index.push(a, d, b, b, d, c);
  }
  // punta del pico
  const tipI = pos.length / 3; pos.push(tip.x, tip.y, tip.z); uv.push(1, 0.5); wH.push(1); wT.push(0);
  const li = (rings.length - 1) * N;
  for (let k = 0; k < SIDES; k++) index.push(li + k, tipI, li + k + 1);
  // tapa de la punta de la cola
  const tc = rings[0].c; const tcI = pos.length / 3; pos.push(tc.x, tc.y, tc.z); uv.push(0, 0.5); wH.push(0); wT.push(1);
  for (let k = 0; k < SIDES; k++) index.push(k + 1, tcI, k);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  // costura de la textura: misma normal a ambos lados (vértice k=0 y k=SIDES de cada anillo)
  const nrm = geo.attributes.normal;
  for (let i = 0; i < rings.length; i++) {
    const a = i * N, b = i * N + SIDES;
    const n = new THREE.Vector3(nrm.getX(a) + nrm.getX(b), nrm.getY(a) + nrm.getY(b), nrm.getZ(a) + nrm.getZ(b)).normalize();
    nrm.setXYZ(a, n.x, n.y, n.z); nrm.setXYZ(b, n.x, n.y, n.z);
  }
  const base = Float32Array.from(pos), baseN = Float32Array.from(nrm.array);

  // ---- jerarquía con la misma interfaz que el ave por piezas ----
  const bird = new THREE.Group();
  const bodyPivot = new THREE.Group(); bodyPivot.position.y = legLen - 0.05; bird.add(bodyPivot);
  const torso = new THREE.Group(); bodyPivot.add(torso);              // su escala = "inflarse"
  const head = new THREE.Group(); head.position.copy(headBase); bodyPivot.add(head);
  const tail = new THREE.Group(); tail.position.copy(tailPivot); tail.rotation.z = pl.tail; bodyPivot.add(tail);
  const tex = paintSpecies(sp, P, layout);
  const body = new THREE.Mesh(geo, mat(tex));
  bodyPivot.add(body);
  const meshes = [body];

  // mandíbula inferior (chica, para cantar), bajo el pico
  const mBeak = mat(plain, { tint: (P.beak[0] << 16) | (P.beak[1] << 8) | P.beak[2] });
  const pouch = pl.pouch ? [2.4, 0.9] : pl.bill ? [1.6, 0.25] : [0.7, 0.4];   // bolsa del pelícano / pico plano
  const lower = new THREE.Mesh(new THREE.ConeGeometry(br * pouch[0], bl * 0.8, 3).rotateZ(-Math.PI / 2).translate(bl * 0.4, 0, 0).scale(1, pouch[1], 1),
    pl.pouch ? mat(plain, { tint: 0xc89868 }) : mBeak);
  lower.position.set(0.88 * hs, -0.1, 0); lower.rotation.z = -0.15; head.add(lower); meshes.push(lower);
  const upper = new THREE.Group(); upper.rotation.z = 0; head.add(upper); // el pico superior es parte de la malla
  // adornos de la cabeza: penacho (codorniz) y cresta (queltehue y otros)
  if (pl.topknot) {
    const k = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.05).translate(0, 0.22, 0), mat(plain, { tint: 0x201a18 }));
    k.position.set(hs * 0.2, hs * 0.8, 0); k.rotation.z = -0.5; head.add(k); meshes.push(k);
  }
  if (pl.crest || sp.sciName === 'Vanellus chilensis') {
    const c = P.back_dark;
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.04).translate(-0.25, 0, 0), mat(plain, { tint: (c[0] << 16) | (c[1] << 8) | c[2] }));
    crest.position.set(-hs * 0.6, hs * 0.5, 0); crest.rotation.z = 0.35; head.add(crest); meshes.push(crest);
  }

  // alas de vuelo: solo visibles al aletear
  const fw = flightWing(sp, plan, P, ctx.hwi);
  const mWing = mat(fw.tex, { twoSided: true });
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.copy(C).add(new THREE.Vector3(0.1, 0.3, s * pl.body[2] * 0.8)); bodyPivot.add(w);
    const m = new THREE.Mesh(s > 0 ? fw.geo : fw.geo.clone().scale(1, 1, -1), mWing); m.visible = false; w.add(m);
    if (pl.flippers) w.rotation.x = s * (Math.PI - 0.3); // aletas del pingüino, colgando a los costados
    w.userData.side = s; w.userData.mesh = m; wings.push(w);
  }
  // patas (como en el ave por piezas)
  const mLeg = mat(plain, { tint: (P.legs[0] << 16) | (P.legs[1] << 8) | P.legs[2], twoSided: true });
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(0.06, legLen, s * 0.27); bird.add(leg);
    leg.add(new THREE.Mesh(tarsusGeo, mLeg));
    const foot = new THREE.Mesh(footGeo, mLeg); foot.position.y = -legLen + 0.02; leg.add(foot);
    legs.push(leg);
  }

  // ---- deformación por cuadro: cabeza, cola e "inflado" mueven solo sus vértices ----
  const p = new THREE.Vector3(), q = new THREE.Vector3(), mH = new THREE.Matrix4(), mT = new THREE.Matrix4(), mTi = new THREE.Matrix4();
  const restTail = new THREE.Matrix4().makeRotationZ(pl.tail);
  const nq = new THREE.Vector3();
  let lastKey = '';
  body.onBeforeRender = () => {
    const key = `${head.rotation.y.toFixed(3)},${head.rotation.z.toFixed(3)},${tail.rotation.z.toFixed(3)},${torso.scale.x.toFixed(3)}`;
    for (const w of wings) w.userData.mesh.visible = pl.flippers || Math.abs(w.rotation.x) > 0.05;
    if (key === lastKey) return;
    lastKey = key;
    head.updateMatrix(); tail.updateMatrix();
    // cabeza: rotación alrededor de headBase; cola: rotación respecto de su ángulo de reposo
    mH.copy(head.matrix).multiply(new THREE.Matrix4().makeTranslation(-headBase.x, -headBase.y, -headBase.z));
    mT.copy(tail.matrix).multiply(mTi.copy(restTail).invert()).multiply(new THREE.Matrix4().makeTranslation(-tailPivot.x, -tailPivot.y, -tailPivot.z));
    const puff = torso.scale.x;
    const arr = geo.attributes.position.array, narr = geo.attributes.normal.array;
    for (let i = 0; i < wH.length; i++) {
      p.set(base[i * 3], base[i * 3 + 1], base[i * 3 + 2]);
      const h = wH[i], t = wT[i], b = Math.max(0, 1 - h - t);
      if (b > 0 && puff !== 1) p.sub(C).multiplyScalar(1 + (puff - 1) * b).add(C);
      if (h > 0) { q.copy(p).applyMatrix4(mH); p.lerp(q, h); }
      if (t > 0) { q.copy(p).applyMatrix4(mT); p.lerp(q, t); }
      arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
      nq.set(baseN[i * 3], baseN[i * 3 + 1], baseN[i * 3 + 2]);
      if (h > 0.5) nq.transformDirection(mH);
      narr[i * 3] = nq.x; narr[i * 3 + 1] = nq.y; narr[i * 3 + 2] = nq.z;
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.normal.needsUpdate = true;
  };

  // contorno de hover: casco invertido alrededor del centro del cuerpo
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide });
  const outline = new THREE.Mesh(geo, outlineMat);
  outline.scale.setScalar(1.12); outline.position.copy(C).multiplyScalar(-0.12); outline.visible = false; bodyPivot.add(outline);

  steady(bird);
  return {
    group: bird, bodyPivot, torso, head, headBase, tail, tailRest: pl.tail, wings, legs, upper, lower, plan,
    beakRest: [0, lower.rotation.z], onePiece: true, tris: index.length / 3,
    setOutline(color) { if (color) outlineMat.color.set(color); outline.visible = !!color; },
    height: legLen + 2.0,
  };
}

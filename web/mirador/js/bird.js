// Ave paramétrica a partir del chucao de ref/chucao.html.
// - Proporciones: species.morphology.prop = [pico/ala, alto/largo pico, tarso/ala, cola/ala, HWI/100],
//   normalizadas contra el chucao (el prototipo queda en escala 1) y species.morphology.scale.
// - Colores: species.palette (RGB 5 bits por zona) + pattern (barred/streaked/spotted/striped).
// - Plan corporal (postura): paseriforme, cola_alta (tapaculos, chercán), paloma, playero, picaflor.
/* global THREE */
import { mat, makeTex, makeVary, mulberry32, sideUV, texPlain, steady } from './ps1.js';
import { KIT } from './kit.js';
import { buildBirdOnePiece } from './bird1.js';

// Planes que ya se construyen como una sola pieza (js/bird1.js). setOnePiece(false) vuelve al ave por piezas
// (lo usa docs/registro/aves.html para comparar).
const ONE_PIECE = new Set(['paseriforme', 'cola_alta', 'paloma', 'playero', 'picaflor', 'gaviota', 'pelicano', 'cormoran', 'garza',
  'pato', 'rapaz', 'codorniz', 'nandu', 'pinguino', 'flamenco', 'cisne', 'loro', 'carpintero']);
let onePieceOn = true;
export function setOnePiece(on) { onePieceOn = on; }

// Piezas N64 modeladas en Blender (blender/aves_build.py → models/kit/ave_partes.glb). Están en el mismo
// espacio que las primitivas de antes; si no cargaron, se usan las primitivas.
// Juego de piezas propio por plan (paloma, gaviota); el resto usa las del ave base.
const PART_SET = { paloma: 'paloma', gaviota: 'gaviota', pinguino: 'pinguino', flamenco: 'flamenco', pato: 'pato', cisne: 'pato',
  pelicano: 'pelicano', cormoran: 'pelicano', rapaz: 'rapaz', picaflor: 'picaflor', playero: 'playero', garza: 'playero' };
const S_NECK = new Set(['flamenco', 'cisne', 'garza']);
function part(name, fallback, plan) {
  const meshes = KIT.ave_partes?.meshes || [];
  const e = meshes.find(m => m.name === `${PART_SET[plan] || 'ave'}_${name}`) || meshes.find(m => m.name === `ave_${name}`);
  if (!e) return fallback();
  const g = e.geometry.clone();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}
// Pie plano de tres dedos adelante y uno atrás (4 triángulos), en vez de cajas.
const footGeo = (() => {
  const t = [[0.4, 0.06], [0.36, 0.2], [0.36, -0.2]].flatMap(([x, z]) => [0, 0, -0.035, x, 0, z, 0, 0, 0.035]);
  t.push(0, 0, 0.035, -0.22, 0, 0, 0, 0, -0.035);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(t, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(t.length / 3 * 2).fill(0.5), 2));
  g.computeVertexNormals();
  return g;
})();

const CHUCAO = { beak: 0.25, beakDepth: 0.29, tarsus: 0.52, tail: 0.94, hwi: 0.05 };
const GRAY = { back: [120, 110, 100], back_dark: [80, 72, 64], belly: [180, 172, 160], flank: [150, 140, 128],
  head: [110, 100, 92], throat: [190, 184, 172], wing: [100, 90, 80], tail: [90, 80, 72],
  beak: [40, 32, 28], legs: [72, 64, 56], eye: [16, 16, 16] };

// Planes corporales: inclinación del cuerpo, ángulo de cola (negativo = alzada), tamaño de cabeza,
// multiplicadores de patas y cuerpo, cuello (neck = desplazamiento, neckLen = cuello visible),
// largo de ala y rasgos (cresta, bolsa del pelícano, pico plano, penacho). swim: nada en el agua;
// soar: planea en círculos.
export const PLANS = {
  paseriforme: { tilt: 0.42, tail: 0.35, head: 0.56, legs: 1.0, body: [1.1, 0.85, 0.8], neck: 0 },
  cola_alta: { tilt: 0.18, tail: -1.1, head: 0.56, legs: 1.0, body: [1.15, 0.85, 0.8], neck: 0 },
  paloma: { tilt: 0.3, tail: 0.2, head: 0.42, legs: 0.7, body: [1.25, 0.9, 0.85], neck: 0.22, neckLen: 0.3, wing: 1.15 }, // pecho erguido y cuello corto
  playero: { tilt: 0.06, tail: 0.25, head: 0.5, legs: 2.1, body: [1.2, 0.8, 0.75], neck: 0.15 },
  picaflor: { tilt: 0.55, tail: 0.5, head: 0.52, legs: 0.35, body: [1.0, 0.62, 0.6], neck: 0 },
  gaviota: { tilt: 0.15, tail: 0.2, head: 0.5, legs: 0.85, body: [1.3, 0.8, 0.75], neck: 0.05, wing: 1.5, swim: true, soar: true },
  pelicano: { tilt: 0.2, tail: 0.2, head: 0.45, legs: 0.6, body: [1.5, 0.95, 0.9], neck: 0.1, neckLen: 0.55, wing: 1.6, pouch: true, swim: true, soar: true },
  cormoran: { tilt: 0.65, tail: 0.3, head: 0.42, legs: 0.55, body: [1.3, 0.72, 0.7], neck: 0.05, neckLen: 0.5, wing: 1.2, swim: true },
  garza: { tilt: 0.5, tail: 0.2, head: 0.38, legs: 2.4, body: [1.1, 0.68, 0.62], neck: 0.1, neckLen: 1.05, wing: 1.3 },
  pato: { tilt: 0.04, tail: 0.15, head: 0.5, legs: 0.45, body: [1.35, 0.78, 0.9], neck: 0.15, neckLen: 0.2, wing: 1.0, bill: true, swim: true },
  rapaz: { tilt: 0.45, tail: 0.25, head: 0.4, legs: 0.9, body: [1.3, 0.9, 0.85], neck: 0.05, neckLen: 0.2, wing: 1.8, soar: true },
  codorniz: { tilt: 0.1, tail: 0.1, head: 0.55, legs: 0.7, body: [1.2, 0.95, 0.9], neck: 0.05, topknot: true },
  // Magallanes
  nandu: { tilt: 0.3, tail: 0.1, head: 0.34, legs: 3.0, legThick: 3.2, body: [1.3, 1.1, 1.0], neck: 0.1, neckLen: 1.45, wing: 0.55, noFly: true, stride: 2.2 },
  pinguino: { tilt: 1.35, tail: 1.0, tailPos: [-0.5, 0.12], head: 0.5, legs: 0.35, legThick: 1.8, body: [1.2, 0.85, 0.8], neck: 0, wing: 0.8, swim: true, noFly: true, waddle: true, stride: 0.6, flippers: true },
  flamenco: { tilt: 0.5, tail: 0.2, head: 0.35, legs: 3.0, body: [1.05, 0.7, 0.62], neck: 0.1, neckLen: 1.3, wing: 1.3, bentBill: true },
  cisne: { tilt: 0.05, tail: 0.15, head: 0.42, legs: 0.45, body: [1.5, 0.85, 1.0], neck: 0.1, neckLen: 1.2, wing: 1.3, bill: true, swim: true },
  loro: { tilt: 0.7, tail: 0.5, head: 0.6, legs: 0.7, body: [1.0, 0.85, 0.8], neck: 0, hookBill: true },
  carpintero: { tilt: 0.95, tail: 0.6, head: 0.55, legs: 0.7, body: [1.05, 0.8, 0.75], neck: 0, crest: true, trunk: true },
};
const FAMILY_PLAN = {
  Rhinocryptidae: 'cola_alta', Troglodytidae: 'cola_alta',
  Columbidae: 'paloma', Trochilidae: 'picaflor',
  Charadriidae: 'playero', Haematopodidae: 'playero', Recurvirostridae: 'playero', Scolopacidae: 'playero', Thinocoridae: 'playero',
  Laridae: 'gaviota', Stercorariidae: 'gaviota', Procellariidae: 'gaviota', Diomedeidae: 'gaviota', Sulidae: 'gaviota',
  Pelecanidae: 'pelicano', Phalacrocoracidae: 'cormoran', Anhingidae: 'cormoran', Podicipedidae: 'pato',
  Ardeidae: 'garza', Threskiornithidae: 'garza', Ciconiidae: 'garza', Phoenicopteridae: 'garza',
  Anatidae: 'pato', Rallidae: 'pato',
  Cathartidae: 'rapaz', Accipitridae: 'rapaz', Falconidae: 'rapaz', Strigidae: 'rapaz', Tytonidae: 'rapaz',
  Odontophoridae: 'codorniz', Phasianidae: 'codorniz', Tinamidae: 'codorniz',
  Rheidae: 'nandu', Spheniscidae: 'pinguino', Phoenicopteridae: 'flamenco', Psittacidae: 'loro', Picidae: 'carpintero',
};
export const PLAN_OVERRIDE = {
  'Vanellus chilensis': 'playero', 'Cygnus melancoryphus': 'cisne', 'Coscoroba coscoroba': 'cisne',
};

export function planFor(sp) {
  if (PLAN_OVERRIDE[sp.sciName]) return PLAN_OVERRIDE[sp.sciName];
  const fam = sp.morphology?.family;
  if (fam && FAMILY_PLAN[fam]) return FAMILY_PLAN[fam];
  const ls = sp.morphology?.lifestyle;
  if (ls === 'Aerial' && (sp.morphology?.mass ?? 99) < 12) return 'picaflor';
  if ((sp.morphology?.prop?.[2] ?? 0) > 0.55) return 'playero';
  return 'paseriforme';
}

const texCache = new Map();

function speciesTextures(sp) {
  if (texCache.has(sp.id)) return texCache.get(sp.id);
  const P = { ...GRAY, ...(sp.palette || {}) };
  const pat = sp.palette?.pattern || {};
  const aw = sp.palette?.accentWhere;
  const acc = P.accent;
  const R = mulberry32(1000 + sp.id);
  const vary = makeVary(R);
  const patt = (zone, c, x, y) => {
    const p = pat[zone];
    if (p === 'barred') return (y % 3 === 0) ? P.back_dark : vary(c, 10);
    if (p === 'streaked') return (x % 5 === 0 && R() < 0.8) ? P.back_dark : vary(c, 10);
    if (p === 'spotted') return (R() < 0.07) ? [30, 26, 28] : vary(c, 8);
    return vary(c, 8);
  };
  // cuerpo: u = cola → pecho, v = vientre → dorso
  const body = makeTex(64, 32, (x, y) => {
    const u = x / 63, v = 1 - y / 31;
    if (aw === 'pecho' && acc && ((u - 0.9) / 0.32) ** 2 + ((v - 0.45) / 0.32) ** 2 < 1) return vary(acc, 8);
    if (aw === 'subcaudales' && acc && u < 0.22 && v < 0.34) return vary(acc, 8);
    if (u > 0.84 && v > 0.44 && v < 0.7) return patt('throat', P.throat, x, y);
    if (v < 0.34) return patt('belly', P.belly, x, y);
    if (v < 0.54) return patt('flank', P.flank, x, y);
    return R() < 0.15 ? vary(P.back_dark, 6) : patt('back', P.back, x, y);
  });
  // cabeza: u = nuca → cara, v = abajo → coronilla; ojo 2×2 en (19,11)
  const head = makeTex(32, 32, (x, y) => {
    const u = x / 31, v = 1 - y / 31;
    const ex = x - 19, ey = y - 11;
    if (ex >= 0 && ex <= 1 && ey >= 0 && ey <= 1) return (ex === 0 && ey === 0) ? [200, 200, 200] : P.eye;
    if (acc) {
      if (aw === 'bigote' && y >= 14 && y <= 16 && x >= 13 && x <= 25) return vary(acc, 6);
      if (aw === 'collar' && u < 0.45 && v < 0.5) return vary(acc, 8);
      if (aw === 'frente' && u > 0.72 && v > 0.55) return vary(acc, 4);
      if (aw === 'gorguera' && u > 0.5 && v < 0.42) return (x + y) % 3 === 0 ? [220, 230, 255] : vary(acc, 10);
      if (aw === 'pecho' && u > 0.6 && v < 0.3) return vary(acc, 8);
    }
    if (u > 0.5 && v < 0.4) return vary(P.throat, 6);
    if (pat.head === 'striped' && v > 0.55 && (y % 4 < 2)) return vary(P.back_dark, 6);
    return vary(R() < 0.15 ? P.back_dark : P.head, 7);
  });
  const wingC = aw === 'ala y cola' && acc ? acc : P.wing;
  const tailC = aw === 'ala y cola' && acc ? acc : P.tail;
  const wing = makeTex(32, 16, (x, y) => {
    if (x < 9) return vary(P.back_dark, 5);
    if (pat.wing === 'barred') return (x % 4 === 0) ? P.back_dark : vary(wingC, 8);
    if (pat.wing === 'streaked') return ((x + y) % 5 === 0) ? P.back_dark : vary(wingC, 8);
    if (pat.wing === 'spotted') return (x % 7 === 3 && y % 5 === 2) ? [28, 24, 26] : vary(wingC, 8);
    return vary((x + y) % 6 === 0 ? P.back_dark : wingC, 7);
  });
  const tail = makeTex(16, 32, (x, y) => {
    if (pat.tail === 'barred') return (y % 4 === 0) ? P.back_dark : vary(tailC, 8);
    return vary(y % 5 === 0 ? P.back_dark : tailC, 6);
  });
  const hex = c => (c[0] << 16) | (c[1] << 8) | c[2];
  const out = { body, head, wing, tail, beak: hex(P.beak), legs: hex(P.legs), crest: P.back_dark };
  texCache.set(sp.id, out);
  return out;
}

const plain = texPlain();

// Devuelve { group, parts, outline(set), radius }
export function buildBird(sp, plan = 'paseriforme') {
  const pl = PLANS[plan] || PLANS.paseriforme;
  const pr = sp.morphology?.prop || [CHUCAO.beak, CHUCAO.beakDepth, CHUCAO.tarsus, CHUCAO.tail, CHUCAO.hwi];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fBeak = clamp((pr[0] ?? CHUCAO.beak) / CHUCAO.beak, 0.5, 2.2);
  const fDepth = clamp((pr[1] ?? CHUCAO.beakDepth) / CHUCAO.beakDepth, 0.3, 1.9);
  const fTarsus = clamp((pr[2] ?? CHUCAO.tarsus) / CHUCAO.tarsus, 0.4, 1.6) * pl.legs;
  const fTail = clamp((pr[3] ?? CHUCAO.tail) / CHUCAO.tail, 0.4, 1.4);
  const hwi = pr[4] ?? CHUCAO.hwi;
  const T = speciesTextures(sp);
  if (onePieceOn && ONE_PIECE.has(plan)) {
    const legLen1 = 0.85 * fTarsus, hs1 = pl.head, nl1 = pl.neckLen ?? 0;
    const headBase1 = new THREE.Vector3(0.98 - pl.tilt * 0.25 + pl.neck + nl1 * 0.35, 1.42 + pl.tilt * 0.45 + pl.neck * 0.5 + nl1 * 0.9, 0);
    const bl1 = 0.4 * fBeak * (plan === 'picaflor' ? 1.6 : 1);
    const br1 = 0.12 * clamp(fDepth * (fBeak > 1.4 ? 0.7 : 1), 0.3, 1.8);
    const wingLen1 = 0.72 * (1 + hwi * 0.9) * (pl.wing ?? 1);
    const wingGeo1 = sideUV(part('ala', () => new THREE.SphereGeometry(1, 5, 3).scale(1, 0.4, 0.1).translate(-0.35, 0, 0), plan).scale(wingLen1, 1, 1));
    return buildBirdOnePiece(sp, plan, {
      pl, f: { tail: fTail }, hs: hs1, headBase: headBase1, bl: bl1, br: br1, legLen: legLen1,
      P: { ...GRAY, ...(sp.palette || {}) }, wingTex: T.wing, wingGeo: wingGeo1, wingLen: wingLen1, footGeo, hwi,
      tarsusGeo: new THREE.CylinderGeometry(0.055 * (pl.legThick ?? 1), 0.045 * (pl.legThick ?? 1), legLen1, pl.legThick > 1.5 ? 5 : 3, 1, true).translate(0, -legLen1 / 2, 0),
    });
  }
  const meshes = [];
  const add = (parent, geo, m) => { const mesh = new THREE.Mesh(geo, m); parent.add(mesh); meshes.push(mesh); return mesh; };

  const bird = new THREE.Group();
  const legLen = 0.85 * fTarsus;
  const bodyPivot = new THREE.Group(); bodyPivot.position.y = legLen - 0.05; bird.add(bodyPivot);
  const torso = new THREE.Group(); torso.position.set(0.05, 0.72, 0); torso.rotation.z = pl.tilt; bodyPivot.add(torso);
  add(torso, sideUV(part('cuerpo', () => new THREE.SphereGeometry(1, 7, 5), plan).scale(...pl.body)), mat(T.body));

  const wingLen = 0.72 * (1 + hwi * 0.9) * (pl.wing ?? 1);
  const wingGeo = sideUV(part('ala', () => new THREE.SphereGeometry(1, 5, 3).scale(1, 0.4, 0.1).translate(-0.35, 0, 0), plan).scale(wingLen, 1, 1));
  const wingGeoR = wingGeo.clone().scale(1, 1, -1); // espejo: las dos alas abrazan el cuerpo
  const mWing = mat(T.wing, { twoSided: true });
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(0.05, 0.18, s * pl.body[2] * 0.9); torso.add(w);
    add(w, s > 0 ? wingGeo : wingGeoR, mWing); w.userData.side = s; wings.push(w);
  }

  const tail = new THREE.Group(); tail.position.set(...(pl.tailPos || [-1.0 * pl.body[0] / 1.15, 0.9]), 0); // tailPos: aves erguidas (pingüino) bodyPivot.add(tail);
  add(tail, sideUV(part('cola', () => new THREE.BoxGeometry(1, 0.07, 0.5).translate(-0.5, 0, 0), plan).scale(1.05 * fTail, 1, plan === 'picaflor' ? 0.6 : 0.84)), mat(T.tail));

  const hs = pl.head;
  const nl = pl.neckLen ?? 0;
  const headBase = new THREE.Vector3(0.98 - pl.tilt * 0.25 + pl.neck + nl * 0.35, 1.42 + pl.tilt * 0.45 + pl.neck * 0.5 + nl * 0.9, 0);
  const head = new THREE.Group(); head.position.copy(headBase); bodyPivot.add(head);
  if (nl > 0) { // cuello visible entre el pecho y la cabeza
    const from = new THREE.Vector3(0.75 - pl.tilt * 0.2, 1.1 + pl.tilt * 0.35, 0), dir = headBase.clone().sub(from);
    if (S_NECK.has(plan)) { // cuello en S (flamenco, cisne, garza): tubo curvo de 5 lados
      const L = dir.length(), n = dir.clone().normalize(), side = new THREE.Vector3(n.y, -n.x, 0);
      const curve = new THREE.CatmullRomCurve3([from.clone(), from.clone().addScaledVector(dir, 0.33).addScaledVector(side, L * 0.16),
        from.clone().addScaledVector(dir, 0.7).addScaledVector(side, -L * 0.1), headBase.clone()]);
      add(bodyPivot, new THREE.TubeGeometry(curve, 8, hs * 0.42, 5), mat(T.head));
    } else {
      const neck = add(bodyPivot, new THREE.CylinderGeometry(hs * 0.45, hs * 0.6, dir.length(), 5), mat(T.head));
      neck.position.copy(from).addScaledVector(dir, 0.5);
      neck.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    }
  }
  add(head, sideUV(part('cabeza', () => new THREE.SphereGeometry(1, 6, 4), plan).scale(hs, hs * 0.93, hs * 0.9)), mat(T.head));
  const mBeak = mat(plain, { tint: T.beak });
  const bl = 0.4 * fBeak * (plan === 'picaflor' ? 1.6 : 1);
  const br = 0.12 * clamp(fDepth * (fBeak > 1.4 ? 0.7 : 1), 0.3, 1.8);
  const flat = pl.bill ? [0.3, 1.9] : [0.6, 1];
  const hook = pl.hookBill ? 1.9 : 1; // pico de loro: corto y alto
  const upper = add(head, new THREE.ConeGeometry(br * hook, bl / hook, 4).rotateZ(-Math.PI / 2).translate(bl / hook / 2, 0, 0).scale(1, flat[0], flat[1]), mBeak);
  upper.position.set(hs * 0.86, 0, 0); upper.rotation.z = pl.bentBill ? -0.75 : pl.hookBill ? -0.45 : -0.12;
  const pouch = pl.pouch ? [2.4, 0.9] : [0.75, 0.4];
  const lower = add(head, new THREE.ConeGeometry(br * pouch[0], bl * 0.82, 4).rotateZ(-Math.PI / 2).translate(bl * 0.41, 0, 0).scale(1, pouch[1], flat[1]), pl.pouch ? mat(plain, { tint: 0xc89868 }) : mBeak);
  lower.position.set(hs * 0.84, -0.05, 0); lower.rotation.z = pl.bentBill ? -0.8 : -0.18;
  if (pl.topknot) { // penacho de la codorniz, curvado hacia adelante
    const k = add(head, new THREE.BoxGeometry(0.08, 0.45, 0.05).translate(0, 0.22, 0), mat(plain, { tint: 0x201a18 }));
    k.position.set(hs * 0.2, hs * 0.8, 0); k.rotation.z = -0.5;
  }
  if (pl.crest || sp.sciName === 'Vanellus chilensis') {
    const c = T.crest;
    const crest = add(head, new THREE.BoxGeometry(0.5, 0.05, 0.04).translate(-0.25, 0, 0), mat(plain, { tint: (c[0] << 16) | (c[1] << 8) | c[2] }));
    crest.position.set(-hs * 0.6, hs * 0.5, 0); crest.rotation.z = 0.35;
  }

  const mLeg = mat(plain, { tint: T.legs, twoSided: true });
  const legs = [];
  const tarsusGeo = new THREE.CylinderGeometry(0.055, 0.045, legLen, 3, 1, true).translate(0, -legLen / 2, 0);
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(0.06, legLen, s * 0.27); bird.add(leg);
    add(leg, tarsusGeo, mLeg);
    const foot = add(leg, footGeo, mLeg); foot.position.y = -legLen + 0.02;
    legs.push(leg);
  }

  // Contorno para el hover: casco invertido de color plano (color de la clase regional).
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide });
  const outlines = meshes.map(m => {
    const o = new THREE.Mesh(m.geometry, outlineMat);
    o.scale.setScalar(1.18); o.visible = false; m.add(o); return o;
  });

  steady(bird);
  return {
    group: bird, bodyPivot, torso, head, headBase, tail, tailRest: pl.tail, wings, legs, upper, lower, plan,
    beakRest: [upper.rotation.z, lower.rotation.z],
    setOutline(color) {
      if (color) outlineMat.color.set(color);
      for (const o of outlines) o.visible = !!color;
    },
    height: legLen + 2.0,
  };
}

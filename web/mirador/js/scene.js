// Mini-escena ("cuarto") de una región: terreno desde terrain-<CODE>.json (relieve real, cobertura
// ESA WorldCover, ríos OSM), vegetación según props-<CODE>.json y senderos hacia los otros cuartos.
/* global THREE */
import { mat, makeTex, makeVary, mulberry32, texPlain } from './ps1.js';
import { propFactor, MAX_RELIEF } from './scale.js';
import { KIT } from './kit.js';

export const WORLD = 64; // metros por lado de cada escena (1 unidad = 1 m, ver js/scale.js)

export const COVER_RGB = [
  [[52, 84, 36], [74, 104, 44]], // árboles
  [[96, 100, 52], [120, 104, 64]], // matorral
  [[132, 136, 64], [150, 146, 80]], // pastizal
  [[150, 140, 72], [128, 120, 60]], // cultivo
  [[112, 108, 104], [92, 88, 86]], // urbano
  [[128, 112, 92], [104, 92, 80]], // suelo desnudo
  [[224, 228, 236], [200, 208, 220]], // nieve
  [[40, 72, 120], [64, 100, 150]], // agua
  [[56, 104, 84], [72, 120, 92]], // humedal
  [[120, 140, 110], [100, 120, 96]], // musgo/líquen
];

const plainTex = texPlain();
// Sombra de contacto suave compartida por todos los props (1 draw call instanciado por zona).
const propShadowTex = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), rg = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  rg.addColorStop(0, 'rgba(24,20,15,0.42)'); rg.addColorStop(0.65, 'rgba(24,20,15,0.2)'); rg.addColorStop(1, 'rgba(24,20,15,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
})();
const propShadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const propShadowMat = new THREE.MeshBasicMaterial({ map: propShadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
const UP_VEC = new THREE.Vector3(0, 1, 0);

// Une varias BufferGeometries en una sola (preservando color por vértice si existe).
function mergeGeos(list) {
  const arr = list.map(g => g.index ? g.toNonIndexed() : g);
  const total = arr.reduce((a, g) => a + g.attributes.position.count, 0);
  const hasCol = arr.some(g => g.attributes.color);
  const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  const col = hasCol ? new Float32Array(total * 3) : null;
  let off = 0;
  for (const g of arr) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv, c = g.attributes.color;
    pos.set(p.array, off * 3);
    if (n) nrm.set(n.array, off * 3);
    if (u) uv.set(u.array, off * 2);
    if (col) {
      if (c) col.set(c.array, off * 3);
      else col.fill(1, off * 3, (off + p.count) * 3);
    }
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}
// Hornea AO + gradiente de luz solar en colores por vértice (base/interior oscuro, cima cálida y luminosa).
function bakeCanopyAO(geo) {
  geo.computeBoundingBox();
  const b = geo.boundingBox, p = geo.attributes.position, n = geo.attributes.normal;
  const cx = (b.min.x + b.max.x) * 0.5, cz = (b.min.z + b.max.z) * 0.5;
  const dy = Math.max(0.1, b.max.y - b.min.y);
  const rMax = Math.max(0.1, Math.hypot(b.max.x - b.min.x, b.max.z - b.min.z) * 0.5);
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const hy = (y - b.min.y) / dy;
    const up = n ? Math.max(0, n.getY(i) * 0.5 + 0.5) : 0.5;
    const rad = Math.min(1, Math.hypot(x - cx, z - cz) / rMax);
    const s = Math.max(0.24, Math.min(1.18, 0.28 + 0.48 * hy + 0.24 * up + 0.14 * rad));
    // sombra ligeramente más fría abajo, toque cálido arriba (en espacio lineal para pow(vCol, 1/2.2))
    const r = Math.min(1.2, s * (0.9 + 0.16 * hy));
    const g = Math.min(1.2, s * (0.94 + 0.08 * hy));
    const bl = Math.min(1.2, s * (1.06 - 0.12 * hy));
    col[i * 3] = r * r; col[i * 3 + 1] = g * g; col[i * 3 + 2] = bl * bl;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
// Masa orgánica de follaje (icosaedro subdividido con leve ondulación) en vez de poliedros de 20 caras.
function lobe(r, x, y, z, sx = 1, sy = 0.75, sz = 1, seed = 1) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
    const k = 1 + 0.12 * Math.sin(vx * 3.4 + seed) * Math.cos(vz * 3.1 - seed) + 0.07 * Math.sin(vy * 4.2 + seed * 2);
    p.setXYZ(i, vx * sx * k + x, vy * sy * k + y, vz * sz * k + z);
  }
  g.computeVertexNormals();
  return g;
}
// Tubo orgánico curvo con radio decreciente y ensanchamiento opcional en la base (root flare).
function curvedTube(pts, r0, r1, segs = 6, radial = 6, flare = 0) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
  const frames = curve.computeFrenetFrames(segs, false);
  const pos = [], uv = [], idx = [], N = radial + 1;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, c = curve.getPoint(t);
    const fl = flare && t < 0.25 ? 1 + flare * ((1 - t / 0.25) ** 2) : 1;
    const rad = (r0 + (r1 - r0) * t) * fl;
    const nrm = frames.normals[i], bin = frames.binormals[i];
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      pos.push(c.x + (nrm.x * ca + bin.x * sa) * rad, c.y + (nrm.y * ca + bin.y * sa) * rad, c.z + (nrm.z * ca + bin.z * sa) * rad);
      uv.push(k / radial, t * 2);
    }
  }
  for (let i = 0; i < segs; i++) for (let k = 0; k < radial; k++) {
    const a = i * N + k, b = a + 1, d = (i + 1) * N + k, e = d + 1;
    idx.push(a, d, b, b, d, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// Esqueleto orgánico de árbol: tronco curvo con raíces acampanadas + ramas primarias y secundarias visibles.
// Devuelve { trunkGeo, tips } donde `tips` son las puntas [x, y, z, radio] para montar los ramilletes de hojas.
function buildTreeSkeleton({ h, rBase, lean = [0.2, 0.1], branches = [], roots = 3, seed = 1 }) {
  const tubes = [];
  const p0 = [0, -0.15, 0], p1 = [lean[0] * 0.45, h * 0.42, lean[1] * 0.45], p2 = [lean[0], h, lean[1]];
  tubes.push(curvedTube([p0, p1, p2], rBase, rBase * 0.42, 6, 7, 0.45));
  // raíces visibles que se agarran al suelo
  for (let i = 0; i < roots; i++) {
    const a = (i / roots) * Math.PI * 2 + seed * 0.7;
    const rl = rBase * 2.5;
    tubes.push(curvedTube([[Math.cos(a) * rBase * 0.45, h * 0.14, Math.sin(a) * rBase * 0.45],
      [Math.cos(a) * rl * 0.7, 0.08, Math.sin(a) * rl * 0.7], [Math.cos(a) * rl, -0.12, Math.sin(a) * rl]], rBase * 0.44, rBase * 0.14, 3, 5));
  }
  const tips = [];
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(...p0), new THREE.Vector3(...p1), new THREE.Vector3(...p2)]);
  for (const [tStart, ang, len, rise, spread] of branches) {
    const s = curve.getPoint(tStart);
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const mid = [s.x + dx * len * 0.52, s.y + rise * 0.62, s.z + dz * len * 0.52];
    const end = [s.x + dx * len, s.y + rise, s.z + dz * len];
    const br0 = rBase * (0.48 - tStart * 0.16);
    tubes.push(curvedTube([[s.x, s.y, s.z], mid, end], br0, br0 * 0.28, 4, 5));
    tips.push([...end, spread]);
    // sub-rama lateral para romper la simetría y llenar la copa con aire entre ramas
    const a2 = ang + (tStart > 0.75 ? -0.65 : 0.65);
    const subEnd = [mid[0] + Math.cos(a2) * len * 0.52, mid[1] + rise * 0.42, mid[2] + Math.sin(a2) * len * 0.52];
    tubes.push(curvedTube([mid, subEnd], br0 * 0.55, br0 * 0.2, 3, 4));
    tips.push([...subEnd, spread * 0.82]);
  }
  return { trunkGeo: mergeGeos(tubes), tips };
}
// Textura 64×64 de ramillete de hojas pintado con silueta recortada en alfa (deja ver aire y ramas).
function makeLeafClusterTex(style = 'broad') {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  const drawLeaf = (cx, cy, rx, ry, rot, shade) => {
    g.save(); g.translate(cx, cy); g.rotate(rot);
    // borde sutil de tinta oscura para integrarse al estilo ilustración sin el casco BackSide
    g.fillStyle = 'rgb(42,46,38)';
    g.beginPath(); g.ellipse(0, 0, rx + 1.4, ry + 1.4, 0, 0, Math.PI * 2); g.fill();
    // cuerpo de la hoja en gris claro (teñido por especie en shader)
    const v = Math.round(shade);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  };
  if (style === 'willow') {
    // ramas colgantes finas en cascada
    const strands = [[18, 12, 5.5, 16, 0.12, 152], [32, 10, 6, 18, -0.05, 165], [46, 14, 5.5, 16, -0.14, 150],
      [14, 34, 5, 19, 0.08, 178], [26, 36, 5.5, 20, -0.04, 194], [38, 35, 5.5, 20, 0.05, 188], [50, 34, 5, 18, -0.1, 172],
      [22, 48, 4.5, 13, 0.04, 210], [34, 50, 4.5, 12, -0.04, 216], [44, 47, 4.2, 13, -0.08, 204]];
    for (const s of strands) drawLeaf(...s);
  } else if (style === 'palm') {
    // fronda plumosa con raquis central y foliolos a ambos lados
    g.fillStyle = 'rgb(148,148,148)'; g.fillRect(30, 4, 4, 56);
    for (let i = 0; i < 11; i++) {
      const y = 7 + i * 5, w = 24 * Math.sin((i + 1.2) / 12.2 * Math.PI);
      if (w < 3) continue;
      drawLeaf(32 - w * 0.55, y, w * 0.58, 2.2, -0.35, 175 + (i % 2) * 18);
      drawLeaf(32 + w * 0.55, y, w * 0.58, 2.2, 0.35, 182 + (i % 2) * 18);
    }
  } else {
    // ramillete abierto de 13 hojas con aire entre ellas (atrás más oscuras, adelante luminosas)
    const leaves = [
      [19, 20, 9, 6.5, -0.6, 138], [45, 21, 9, 6.5, 0.55, 142], [15, 38, 9.5, 6.5, -0.25, 146], [49, 39, 9.5, 6.5, 0.3, 144],
      [32, 14, 9.5, 7, 0.05, 162], [32, 49, 9.5, 7, -0.08, 158], [21, 31, 9.5, 7, -0.4, 174], [43, 32, 9.5, 7, 0.45, 176],
      [25, 44, 8.5, 6.5, -0.2, 184], [39, 43, 8.5, 6.5, 0.25, 186], [27, 22, 8.5, 6.5, -0.2, 198], [38, 23, 8.5, 6.5, 0.3, 202],
      [32, 33, 9.5, 7.5, 0.08, 214],
    ];
    for (const l of leaves) drawLeaf(...l);
  }
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  return t;
}
// Copa abierta de ramilletes de hojas alrededor de cada punta de rama, con normales radiales (estilo BotW/Ghibli).
function buildLeafCanopy(tips, { perTip = 5, card = 1.65, flat = 0.55, droop = false, seed = 1 } = {}) {
  const cards = [], R = mulberry32(seed * 9137 + 19);
  let cx = 0, cy = 0, cz = 0;
  for (const [tx, ty, tz] of tips) { cx += tx; cy += ty; cz += tz; }
  cx /= Math.max(1, tips.length); cy /= Math.max(1, tips.length); cz /= Math.max(1, tips.length);
  for (const [tx, ty, tz, sp = 0.7] of tips) {
    for (let i = 0; i < perTip; i++) {
      const a = (i / perTip) * Math.PI * 2 + R() * 0.9;
      const dist = sp * (0.25 + R() * 0.75);
      const ox = tx + Math.cos(a) * dist, oz = tz + Math.sin(a) * dist;
      const oy = ty + (R() - 0.45) * sp * (droop ? 1.4 : flat);
      const sz = card * (0.78 + R() * 0.44);
      const g = new THREE.PlaneGeometry(sz, droop ? sz * 1.45 : sz);
      // orientaciones variadas: algunas casi horizontales (lucen abiertas desde arriba) y otras diagonales
      const tilt = droop ? (0.15 + R() * 0.3) : (i === 0 ? Math.PI * 0.44 : 0.45 + R() * 0.85);
      g.rotateX(tilt).rotateY(a + R() * 0.7).rotateZ((R() - 0.5) * 0.5).translate(ox, oy, oz);
      cards.push(g);
    }
  }
  const geo = mergeGeos(cards);
  // normales radiales desde el centro de la copa → cel-shading suave y volumétrico en tarjetas planas
  const p = geo.attributes.position, n = geo.attributes.normal, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i) - cx, (p.getY(i) - cy) * 1.15 + 0.6, p.getZ(i) - cz).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return bakeCanopyAO(geo);
}
// Palma chilena (Jubaea chilensis): tronco curvo abombado + 12 frondas plumosas arqueadas con foliolos en alfa.
function buildPalma(m, barkMat, palmTex) {
  const trunk = mergeGeos([
    curvedTube([[0, -0.15, 0], [0.08, 2.2, 0.04], [0.14, 4.8, -0.05], [0.06, 7.6, 0]], 0.42, 0.3, 8, 8, 0.35),
    // abombamiento característico en el tercio medio del tronco
    new THREE.CylinderGeometry(0.45, 0.44, 2.2, 8).translate(0.1, 3.6, 0),
  ]);
  const fronds = [];
  for (const [count, y0, len, arch, aOff] of [[7, 7.5, 3.2, 0.55, 0], [5, 7.9, 2.5, 0.25, 0.45]]) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + aOff;
      const g = new THREE.PlaneGeometry(1.15, len, 2, 5).rotateX(-Math.PI / 2).translate(0, 0, len * 0.5);
      const p = g.attributes.position;
      for (let j = 0; j < p.count; j++) {
        const z = p.getZ(j), t = z / len;
        // arco natural de la fronda: sube cerca del cogollo y cae suavemente en la punta
        const dy = Math.sin(t * Math.PI) * (0.85 - arch * 0.6) - t * t * (1.2 + arch * 0.9);
        const fold = -Math.abs(p.getX(j)) * 0.22; // ligero pliegue en V de los foliolos
        p.setY(j, dy + fold);
      }
      g.computeVertexNormals();
      fronds.push(g.rotateY(a).translate(0.06, y0, 0));
    }
  }
  const crown = bakeCanopyAO(mergeGeos(fronds));
  return [[trunk, barkMat], [crown, m(palmTex, { tint: kitTint([74, 108, 52]), alpha: 1, twoSided: true, snowable: true, vcol: 1 }), 'crown']];
}
// Edificios estilizados con detalle de azotea (sin caras coplanares para evitar z-fighting/titileo).
function buildEdificioVariants(m, wallTex) {
  const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
  const rim = (w, d, y, h = 0.55, t = 0.45, ox = 0, oz = 0) => [
    box(w, h, t, ox, y, oz + d / 2 - t / 2), box(w, h, t, ox, y, oz - d / 2 + t / 2),
    box(t, h, d - 2 * t - 0.04, ox + w / 2 - t / 2, y, oz), box(t, h, d - 2 * t - 0.04, ox - w / 2 + t / 2, y, oz),
  ];
  const shapes = [
    // 1) Torre clásica con pretil elevado, losa de azotea sin solape, caseta de ascensor y equipos
    {
      wall: mergeGeos([box(8.4, 12.0, 8.4)]),
      trim: mergeGeos([...rim(8.56, 8.56, 12.04, 0.58, 0.44), box(2.6, 2.2, 2.4, -1.6, 12.34, -1.4)]),
      roof: mergeGeos([box(7.5, 0.24, 7.5, 0, 12.06, 0), box(1.6, 0.9, 1.3, 1.9, 12.34, 1.5), box(1.2, 0.7, 1.2, 1.8, 12.34, -1.6)]),
    },
    // 2) Edificio escalonado con terraza intermedia (bloques sin caras coplanares)
    {
      wall: mergeGeos([box(9.2, 7.6, 8.2), box(5.4, 5.3, 5.4, -1.3, 7.68, -0.8)]),
      trim: mergeGeos([...rim(9.36, 8.36, 7.64, 0.45, 0.4), ...rim(5.56, 5.56, 13.02, 0.5, 0.36, -1.3, -0.8), box(2.0, 1.7, 2.0, -1.3, 13.3, -0.8)]),
      roof: mergeGeos([box(8.3, 0.22, 7.3, 0, 7.66, 0), box(4.7, 0.22, 4.7, -1.3, 13.04, -0.8)]),
    },
    // 3) Bloque doble en L a dos alturas (alas estrictamente disjuntas en X: sin intersección coplanar)
    {
      wall: mergeGeos([box(4.1, 9.6, 4.8, -2.35, 0, -1.8), box(4.8, 12.6, 8.8, 2.14, 0, 0)]),
      trim: mergeGeos([...rim(4.24, 4.96, 9.64, 0.5, 0.36, -2.35, -1.8),
        ...rim(4.96, 8.96, 12.64, 0.55, 0.38, 2.14, 0), box(2.0, 1.8, 2.2, 2.14, 12.92, 1.4)]),
      roof: mergeGeos([box(3.4, 0.22, 4.1, -2.35, 9.66, -1.8), box(4.1, 0.22, 8.1, 2.14, 12.66, 0)]),
    },
  ];
  const palettes = [
    { wall: 0xe6dfd0, trim: 0xc8c0b2, roof: 0x6c6e72 },
    { wall: 0xd4dade, trim: 0xb2bcc4, roof: 0x5c646c },
    { wall: 0xdfcab4, trim: 0xc4aa92, roof: 0x72645c },
  ];
  const variants = [];
  shapes.forEach((sh, i) => {
    const p = palettes[i % palettes.length];
    variants.push([
      [sh.wall, m(wallTex, { tint: p.wall, rx: 1, ry: 2 })],
      [sh.trim, m(plainTex, { tint: p.trim, snowable: true })],
      [sh.roof, m(plainTex, { tint: p.roof, snowable: true })],
    ]);
  });
  return variants;
}

function rasterRivers(rivers, n, k) {
  const set = new Map();
  for (const r of rivers) {
    const w = r.type === 'river' ? 2 : 1;
    for (let i = 1; i < r.path.length; i++) {
      const [x0, y0] = r.path[i - 1], [x1, y1] = r.path[i];
      const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * k * 2) + 1;
      for (let s = 0; s <= steps; s++) {
        const x = (x0 + (x1 - x0) * s / steps) * k, y = (y0 + (y1 - y0) * s / steps) * k;
        for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < w; dy++) set.set(`${Math.floor(x) + dx},${Math.floor(y) + dy}`, r.type);
      }
    }
  }
  return set;
}

// ---- props: cada tipo es una lista de partes [geometría, material, transformación local] ----
function propKinds(R) {
  const vary = makeVary(R);
  const leaf = (base) => makeTex(16, 16, () => vary(R() < 0.25 ? base.map(v => v * 0.7) : base, 14));
  const bark = makeTex(8, 16, (x, y) => vary(x % 3 === 0 ? [48, 36, 26] : [84, 64, 44], 8));
  const rock = makeTex(16, 16, () => vary(R() < 0.4 ? [110, 108, 100] : [140, 136, 126], 10));
  const flowerTex = makeTex(16, 16, (x, y) => {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d < 2) return [240, 220, 60];
    if (d < 6 && (Math.atan2(y - 7.5, x - 7.5) * 5 / Math.PI | 0) % 2 === 0) return [220, 60, 90];
    return [0, 0, 0, 0];
  });
  const grassTex = makeTex(16, 32, (x, y) => (x % 3 === 0 && y > (x * 7) % 12) ? vary([170, 160, 80], 16) : [0, 0, 0, 0]);
  const reedTex = makeTex(16, 32, (x, y) => (x % 4 === 1 && y > 2) ? vary(y < 6 ? [100, 70, 40] : [80, 120, 50], 10) : [0, 0, 0, 0]);
  const windowTex = makeTex(16, 16, (x, y) => (x % 4 > 0 && y % 4 > 1) ? vary([180, 190, 170], 12) : vary([150, 140, 128], 6));
  const signTex = makeTex(8, 8, () => vary([120, 84, 48], 8));
  const HOUSE = [[196, 72, 60], [232, 184, 64], [72, 132, 176], [120, 172, 96], [216, 132, 160], [236, 228, 208]];
  const houseTex = HOUSE.map(col => makeTex(16, 16, (x, y) => (x % 5 > 1 && y % 6 > 2) ? vary([60, 70, 80], 8) : vary(col, 8)));
  const coastRock = makeTex(16, 16, () => vary(R() < 0.3 ? [52, 50, 54] : [84, 80, 78], 10));
  const docaTex = makeTex(16, 16, (x, y) => R() < 0.08 ? [220, 110, 170] : vary([96, 128, 60], 12));
  const m = (t, o = {}) => mat(t, { ...o, cutaway: true });
  // textura foliar estilizada 64×64 en racimos de hojas (gris claro ≈185 para teñir por especie + AO en vcol)
  const leafClust = makeTex(64, 64, (x, y) => {
    const gx = (x % 8) - 3.5, gy = (y % 8) - 3.5;
    const d = Math.hypot(gx, gy);
    const v = d < 2.9 ? 196 : d < 3.8 ? 168 : 138;
    const n = ((x * 13 + y * 29) % 17) - 8;
    return [v + n, v + n, v + n];
  });
  const crown = (c) => m(leaf(c), { snowable: true });
  const aoCrown = (geo, rgb) => [bakeCanopyAO(geo), m(leafClust, { tint: kitTint(rgb), snowable: true, vcol: 1 }), 'crown'];
  const trunk = (h, r = 0.18) => [new THREE.CylinderGeometry(r * 0.8, r, h, 5).translate(0, h / 2, 0), m(bark)];
  const blob = (r, y, sy, c) => [new THREE.IcosahedronGeometry(r, 0).scale(1, sy, 1).translate(0, y, 0), crown(c), 'crown'];
  const cross = (w, h, t) => {
    const g = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0);
    const g2 = g.clone().rotateY(Math.PI / 2);
    return [[g, m(t, { alpha: 1, twoSided: true })], [g2, m(t, { alpha: 1, twoSided: true })]];
  };
  const kinds = {
    platano_oriental: { parts: [trunk(3.2, 0.22), blob(1.9, 3.8, 0.8, [80, 116, 48])], perch: 4.9, deciduous: true },
    palma_chilena: { parts: [trunk(4.5, 0.3), [new THREE.ConeGeometry(1.6, 0.9, 7, 1, true).translate(0, 4.6, 0), m(leaf([70, 100, 50]), { twoSided: true })]], perch: 4.9 },
    pimiento: { parts: [trunk(2, 0.2), blob(1.5, 2.6, 0.9, [96, 124, 64])], perch: 3.6 },
    quillay: { parts: [trunk(2.2, 0.2), blob(1.5, 2.9, 0.85, [58, 86, 44])], perch: 3.9 },
    litre: { parts: [trunk(1.6, 0.18), blob(1.3, 2.2, 0.8, [72, 92, 40])], perch: 3.0 },
    peumo: { parts: [trunk(2.4, 0.22), blob(1.7, 3.2, 0.9, [44, 76, 40])], perch: 4.4 },
    maiten: { parts: [trunk(2.4, 0.18), blob(1.4, 3.2, 1.1, [84, 112, 56])], perch: 4.2 },
    sauce_chileno: { parts: [trunk(2.6, 0.2), [new THREE.ConeGeometry(1.4, 3.2, 6).translate(0, 3.2, 0), crown([96, 132, 64]), 'crown']], perch: 4.6 },
    espino: { parts: [trunk(0.7, 0.1), blob(1.0, 1.2, 0.7, [104, 108, 52])], perch: 1.8 },
    boldo: { parts: [blob(0.9, 0.7, 0.9, [70, 96, 52])], perch: 1.5 },
    zarzamora: { parts: [blob(0.9, 0.5, 0.6, [64, 88, 44])], perch: 1.0 },
    quisco: { parts: [[new THREE.CylinderGeometry(0.2, 0.22, 1.8, 6).translate(0, 0.9, 0), m(leaf([80, 110, 70]))],
      [new THREE.CylinderGeometry(0.14, 0.14, 0.8, 6).rotateZ(0.5).translate(0.35, 1.1, 0), m(leaf([80, 110, 70]))]], perch: 1.9 },
    roca: { parts: [[new THREE.IcosahedronGeometry(0.7, 0).scale(1, 0.6, 1.1).translate(0, 0.25, 0), m(rock, { snowable: true })]], perch: 0.7 },
    roca_cerro: { parts: [[new THREE.IcosahedronGeometry(0.9, 0).scale(1, 0.8, 1).translate(0, 0.4, 0), m(rock, { snowable: true })]], perch: 1.1 },
    bolones: { parts: [[new THREE.IcosahedronGeometry(0.45, 0).scale(1, 0.6, 1).translate(0, 0.15, 0), m(rock)]], perch: 0.45 },
    roca_andina: { parts: [[new THREE.IcosahedronGeometry(0.9, 0).scale(1.2, 0.7, 1).translate(0, 0.3, 0), m(rock, { snowable: true })]], perch: 0.9 },
    llareta: { parts: [[mergeGeos([lobe(0.65, 0, 0.16, 0, 1.15, 0.48, 1.05, 1), lobe(0.42, 0.42, 0.1, 0.22, 1, 0.45, 0.9, 2),
      lobe(0.38, -0.35, 0.08, -0.25, 0.95, 0.42, 1, 3)]), m(leaf([100, 150, 60]), { snowable: true })]], perch: 0.45 },
    hierba_blanca: { parts: [blob(0.5, 0.35, 0.7, [150, 150, 110])], perch: 0.7 },
    coiron: { parts: cross(0.9, 0.8, grassTex) },
    totora: { parts: cross(0.8, 1.8, reedTex) },
    flores_altura: { parts: [[new THREE.PlaneGeometry(0.6, 0.6).rotateX(-Math.PI / 2).translate(0, 0.25, 0), m(flowerTex, { alpha: 1, twoSided: true })],
      ...cross(0.5, 0.5, flowerTex)], flower: true },
    banca_farol: { parts: [[new THREE.BoxGeometry(1.2, 0.12, 0.4).translate(0, 0.45, 0), m(signTex)],
      [new THREE.CylinderGeometry(0.05, 0.05, 2.4, 4).translate(0.9, 1.2, 0), m(plainTex, { tint: 0x303030 })],
      [new THREE.BoxGeometry(0.25, 0.2, 0.25).translate(0.9, 2.45, 0), m(plainTex, { tint: 0xf0e0a0 })]], perch: 2.5 },
    edificio: { parts: [[new THREE.BoxGeometry(1.8, 1, 1.8).translate(0, 0.5, 0), m(windowTex, { rx: 1, ry: 3 })]], perch: 0, building: true },
    // Valparaíso
    casa_color: { variants: houseTex.map(t => [[new THREE.BoxGeometry(1.6, 1, 1.6).translate(0, 0.5, 0), m(t, { rx: 1, ry: 2 })],
      [new THREE.ConeGeometry(1.25, 0.5, 4).rotateY(Math.PI / 4).translate(0, 1.25, 0), m(plainTex, { tint: 0x8a4a3a })]]), perch: 1.5, building: true },
    roca_costa: { parts: [[new THREE.IcosahedronGeometry(1.0, 0).scale(1.3, 0.8, 1).translate(0, 0.2, 0), m(coastRock)]], perch: 0.9 },
    doca: { parts: [[new THREE.SphereGeometry(0.8, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.2, 0.25, 1), m(docaTex)]] },
    chagual: { parts: [[new THREE.ConeGeometry(0.6, 0.7, 7).translate(0, 0.35, 0), m(leaf([130, 150, 110]))],
      [new THREE.CylinderGeometry(0.05, 0.07, 2.2, 4).translate(0, 1.6, 0), m(plainTex, { tint: 0x6a7a40 })],
      [new THREE.IcosahedronGeometry(0.25, 0).scale(1, 2.2, 1).translate(0, 2.6, 0), m(plainTex, { tint: 0x3a8a8a })]], perch: 2.9, flower: true },
    eucalipto: { parts: [trunk(4.5, 0.2), blob(1.3, 5, 1.5, [96, 128, 104])], perch: 6.2 },
    // Magallanes
    lenga: { parts: [trunk(3.4, 0.24), blob(1.8, 3.9, 0.7, [70, 110, 52]), blob(1.2, 4.9, 0.6, [80, 120, 58])], perch: 5.2, deciduous: true, autumn: [2.3, 0.9, 0.5], trunkH: 3.2 },
    nirre: { parts: [trunk(1.8, 0.14), blob(1.1, 2.1, 0.75, [96, 124, 60])], perch: 2.8, deciduous: true, autumn: [2.1, 1.1, 0.5], trunkH: 1.6 },
    calafate: { parts: [[new THREE.IcosahedronGeometry(0.6, 0).scale(1, 0.75, 1).translate(0, 0.45, 0),
      m(makeTex(16, 16, () => R() < 0.12 ? [72, 40, 110] : vary([72, 100, 52], 10)), { snowable: true })]], perch: 1.0 },
    mata_negra: { parts: [blob(0.55, 0.35, 0.7, [40, 58, 36])], perch: 0.7 },
    tronco_caido: { parts: [[new THREE.CylinderGeometry(0.25, 0.3, 3.2, 5).rotateZ(Math.PI / 2).translate(0, 0.25, 0), m(bark, { snowable: true })]], perch: 0.55 },
    madriguera: { parts: [[new THREE.SphereGeometry(0.55, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1), m(makeTex(8, 8, (x, y) => (x > 2 && x < 6 && y > 3) ? [20, 16, 14] : vary([110, 96, 70], 10)))]], perch: 0.3 },
    muelle: { parts: [[new THREE.BoxGeometry(1.2, 0.12, 4).translate(0, 0.9, 0), m(signTex)],
      ...[-1.6, 0, 1.6].flatMap(z => [-0.5, 0.5].map(x => [new THREE.CylinderGeometry(0.08, 0.08, 1.8, 4).translate(x, 0, z), m(bark)]))], perch: 1.0 },
  };
  const broadTex = makeLeafClusterTex('broad');
  const willowTex = makeLeafClusterTex('willow');
  const palmTex = makeLeafClusterTex('palm');
  const leafCrown = (tips, rgb, opts = {}, tex = broadTex) => [
    buildLeafCanopy(tips, opts),
    m(tex, { tint: kitTint(rgb), alpha: 1, twoSided: true, snowable: true, vcol: 1 }),
    'crown',
  ];
  const makeTree = (skelOpts, rgb, canopyOpts = {}, trunkMat = m(bark), tex = broadTex) => {
    const sk = buildTreeSkeleton(skelOpts);
    return [[sk.trunkGeo, trunkMat], leafCrown(sk.tips, rgb, canopyOpts, tex)];
  };
  const barkRed = m(makeTex(8, 16, () => vary([150, 80, 52], 14)));
  const barkArrayan = m(makeTex(8, 16, () => vary(R() < 0.3 ? [232, 236, 228] : [196, 112, 52], 10)));
  // Arica y Parinacota: valle de Azapa, humedal del Lluta y altiplano
  const olivoParts = makeTree({
    h: 1.85, rBase: 0.28, lean: [0.22, -0.1], seed: 4,
    branches: [[0.55, 0.3, 1.05, 0.65, 0.7], [0.68, 2.4, 1.0, 0.7, 0.65], [0.78, 4.4, 0.95, 0.6, 0.65], [0.95, 1.2, 0.5, 0.5, 0.6]],
  }, [128, 144, 112], { perTip: 5, card: 1.25, seed: 4 });
  const algarroboParts = makeTree({
    h: 2.0, rBase: 0.26, lean: [0.18, 0.12], seed: 7,
    branches: [[0.58, 0.1, 1.55, 0.55, 0.85], [0.64, 1.8, 1.5, 0.5, 0.85], [0.72, 3.3, 1.55, 0.55, 0.85], [0.8, 4.9, 1.4, 0.5, 0.8]],
  }, [132, 152, 74], { perTip: 5, card: 1.35, flat: 0.3, seed: 7 });
  const quenoaParts = makeTree({
    h: 1.5, rBase: 0.2, lean: [0.32, 0.14], seed: 14,
    branches: [[0.45, 0.5, 0.85, 0.5, 0.55], [0.65, 2.6, 0.8, 0.48, 0.5], [0.85, 4.6, 0.75, 0.45, 0.5]],
  }, [60, 92, 54], { perTip: 4, card: 0.95, seed: 14 }, barkRed);
  // Los Ríos: bosque valdiviano (troncos orgánicos con raíces y ramas + copas abiertas de ramilletes)
  const coigueParts = makeTree({
    h: 5.8, rBase: 0.4, lean: [0.22, -0.12], seed: 20,
    branches: [
      [0.52, 0.2, 2.1, 0.55, 0.95], [0.56, 2.3, 2.0, 0.5, 0.95], [0.6, 4.4, 1.95, 0.55, 0.9],
      [0.74, 1.2, 1.85, 0.6, 0.9], [0.78, 3.3, 1.8, 0.55, 0.85], [0.82, 5.4, 1.75, 0.6, 0.85],
      [0.96, 0.7, 1.0, 0.75, 0.8], [0.98, 3.8, 0.95, 0.7, 0.75],
    ],
  }, [48, 86, 46], { perTip: 5, card: 1.55, flat: 0.32, seed: 20 });
  const ulmoSk = buildTreeSkeleton({
    h: 3.9, rBase: 0.34, lean: [-0.15, 0.12], seed: 25,
    branches: [
      [0.58, 0.4, 1.65, 0.95, 0.85], [0.64, 2.1, 1.6, 0.9, 0.85], [0.7, 3.7, 1.65, 0.95, 0.85],
      [0.76, 5.2, 1.55, 0.9, 0.8], [0.95, 1.1, 0.7, 0.95, 0.8],
    ],
  });
  const ulmoParts = [
    [ulmoSk.trunkGeo, m(bark)],
    leafCrown(ulmoSk.tips, [54, 100, 50], { perTip: 5, card: 1.55, seed: 25 }),
    [buildLeafCanopy(ulmoSk.tips, { perTip: 2, card: 1.15, seed: 26 }),
      m(makeTex(32, 32, (x, y) => ((x * 7 + y * 13) % 19 === 0 && Math.hypot(x - 16, y - 16) < 13) ? [246, 244, 232] : [0, 0, 0, 0]), { alpha: 1, twoSided: true }), 'crown'],
  ];
  const arrA = buildTreeSkeleton({ h: 2.35, rBase: 0.17, lean: [0.38, 0.08], roots: 2, seed: 29,
    branches: [[0.58, 0.2, 0.95, 0.65, 0.6], [0.75, 2.2, 0.9, 0.6, 0.6], [0.92, 4.4, 0.75, 0.55, 0.55]] });
  const arrB = buildTreeSkeleton({ h: 2.05, rBase: 0.14, lean: [-0.36, 0.22], roots: 2, seed: 30,
    branches: [[0.55, 3.1, 0.9, 0.6, 0.55], [0.82, 5.1, 0.8, 0.55, 0.55]] });
  const arrayanParts = [
    [mergeGeos([arrA.trunkGeo, arrB.trunkGeo]), barkArrayan],
    leafCrown([...arrA.tips, ...arrB.tips], [58, 96, 48], { perTip: 5, card: 1.15, seed: 29 }),
  ];
  Object.assign(kinds, {
    olivo: { parts: olivoParts, perch: 2.8 },
    algarrobo: { parts: algarroboParts, perch: 2.8 },
    brea: { parts: [leafCrown([[0, 0.45, 0, 0.42], [0.35, 0.35, 0.22, 0.32], [-0.3, 0.38, -0.2, 0.32]], [124, 138, 100], { perTip: 4, card: 0.78, seed: 10 })], perch: 1.1 },
    paja_brava: { parts: cross(0.8, 0.8, makeTex(16, 32, (x, y) => (x % 2 === 0 && y > (x * 5) % 9) ? vary([208, 180, 100], 18) : [0, 0, 0, 0])) },
    tola: { parts: [leafCrown([[0, 0.28, 0, 0.3], [-0.22, 0.22, 0.18, 0.24]], [102, 106, 66], { perTip: 4, card: 0.58, seed: 12 })], perch: 0.6 },
    quenoa: { parts: quenoaParts, perch: 2.2 },
    coigue: { parts: coigueParts, perch: 7.0, trunkH: 4.0 },
    ulmo: { parts: ulmoParts, perch: 5.6, trunkH: 3.0 },
    arrayan: { parts: arrayanParts, perch: 3.3 },
    canelo: { parts: makeTree({
      h: 3.9, rBase: 0.2, lean: [0.08, -0.06], seed: 31,
      branches: [[0.48, 0, 1.15, 0.35, 0.6], [0.52, 2.1, 1.1, 0.35, 0.6], [0.56, 4.2, 1.1, 0.35, 0.6],
        [0.72, 1.0, 0.9, 0.4, 0.55], [0.76, 3.1, 0.85, 0.4, 0.55], [0.8, 5.2, 0.85, 0.4, 0.55], [0.96, 0.4, 0.4, 0.6, 0.45]],
    }, [82, 122, 70], { perTip: 4, card: 1.1, flat: 0.35, seed: 31 }), perch: 4.8 },
    quila: { parts: cross(1.4, 1.6, makeTex(16, 32, (x, y) => (x % 3 === 1 && y > 1) || (y % 6 === 0 && x % 3 === 2) ? vary([120, 140, 64], 14) : [0, 0, 0, 0])) },
    nalca: { parts: [[mergeGeos([0, 1.25, 2.5, 3.75, 5.0].map((a, i) => new THREE.CircleGeometry(0.58 + (i % 2) * 0.1, 8).rotateX(-Math.PI / 2 + 0.42).translate(0, 0.85 + (i % 2) * 0.12, 0.42).rotateY(a))),
      m(leaf([60, 112, 46]), { twoSided: true })],
      [new THREE.CylinderGeometry(0.05, 0.08, 0.85, 5).translate(0, 0.42, 0), m(makeTex(4, 4, () => vary([150, 64, 52], 8)))]], perch: 1.0 },
    helecho: { parts: cross(0.9, 0.7, makeTex(16, 16, (x, y) => (Math.abs(x - 7.5) < (16 - y) * 0.45 && (x + y) % 2 === 0) ? vary([60, 108, 52], 12) : [0, 0, 0, 0])) },
    cojin_bofedal: { parts: [aoCrown(mergeGeos([lobe(0.8, 0, 0.1, 0, 1.2, 0.25, 1.05, 32), lobe(0.55, 0.45, 0.08, 0.25, 1.1, 0.24, 1, 33),
      lobe(0.5, -0.42, 0.07, -0.2, 1.05, 0.22, 0.95, 34)]), [76, 128, 54])] },
  });
  useKit(kinds, m, { bark: m(bark), broadTex, willowTex, palmTex, leafCrown, makeTree });
  return kinds;
}

// Piezas modeladas en Blender (js/kit.js) + árboles botánicos de ramas visibles y ramilletes abiertos de hojas.
// Las texturas del kit son grises (≈170): el tinte de cada especie da su color.
const kitTint = rgb => new THREE.Color(rgb[0] / 170, rgb[1] / 170, rgb[2] / 170);
function useKit(kinds, m, { bark, broadTex, willowTex, palmTex, leafCrown, makeTree }) {
  const parts = (id, rgb, snowable = true, scaleXZ = 1, scaleY = 1) => (KIT[id]?.meshes || []).map(e => {
    const leafy = /copa|borde|pasto/.test(e.material);
    const geo = (scaleXZ !== 1 || scaleY !== 1) ? e.geometry.clone().scale(scaleXZ, scaleY, scaleXZ) : e.geometry;
    return [geo, m(e.map || plainTex, { tint: leafy ? kitTint(rgb) : 0xffffff, alpha: e.alpha ? 1 : 0, twoSided: e.alpha, snowable: leafy && snowable }),
      /copa|borde/.test(e.material) ? 'crown' : undefined];
  });
  const has = id => !!KIT[id];
  // Árboles de copa ancha (quillay, peumo, litre, pimiento, plátano, maitén): 2 variantes de tronco curvo + ramilletes abiertos
  const skBroadA = buildTreeSkeleton({
    h: 4.1, rBase: 0.34, lean: [0.24, 0.1], seed: 51,
    branches: [
      [0.54, 0.2, 1.8, 1.15, 0.9], [0.6, 1.75, 1.75, 1.1, 0.85], [0.66, 3.3, 1.85, 1.05, 0.9],
      [0.72, 4.85, 1.7, 1.15, 0.85], [0.92, 0.9, 0.95, 1.2, 0.85], [0.96, 3.9, 0.85, 1.15, 0.8],
    ],
  });
  const skBroadB = buildTreeSkeleton({
    h: 4.3, rBase: 0.32, lean: [-0.28, 0.14], seed: 56,
    branches: [
      [0.52, 0.7, 1.7, 1.25, 0.85], [0.62, 2.4, 1.8, 1.15, 0.9], [0.7, 4.1, 1.75, 1.2, 0.85],
      [0.78, 5.5, 1.6, 1.1, 0.85], [0.95, 2.0, 0.85, 1.2, 0.8],
    ],
  });
  const broadleaf = (rgb, extra = {}) => ({
    variants: [
      [[skBroadA.trunkGeo, bark], leafCrown(skBroadA.tips, rgb, { perTip: 5, card: 1.65, seed: 51 })],
      [[skBroadB.trunkGeo, bark], leafCrown(skBroadB.tips, rgb, { perTip: 5, card: 1.6, seed: 56 })],
    ],
    perch: 6.2, ...extra,
  });
  Object.assign(kinds, {
    quillay: broadleaf([58, 92, 44]), peumo: broadleaf([44, 80, 40]), litre: broadleaf([76, 98, 42]), pimiento: broadleaf([96, 128, 66]),
    platano_oriental: broadleaf([82, 122, 50], { deciduous: true }), maiten: broadleaf([84, 118, 58]),
  });
  // Espino: tronco retorcido bajo con ramas abiertas + copa aparasolada aireada
  kinds.espino = {
    parts: makeTree({
      h: 1.75, rBase: 0.22, lean: [0.3, -0.14], seed: 60,
      branches: [[0.48, 0.3, 1.45, 0.65, 0.8], [0.56, 1.9, 1.4, 0.6, 0.78], [0.64, 3.5, 1.45, 0.65, 0.8], [0.74, 5.0, 1.35, 0.6, 0.75]],
    }, [106, 114, 54], { perTip: 5, card: 1.25, flat: 0.28, seed: 60 }, bark),
    perch: 3.1,
  };
  // Arbustos: ramilletes abiertos de hojas en 2 variantes (sin pelotas sólidas)
  const bush = rgb => ({
    variants: [
      [leafCrown([[0, 0.45, 0, 0.48], [0.42, 0.38, 0.25, 0.38], [-0.38, 0.4, -0.22, 0.38]], rgb, { perTip: 4, card: 0.88, seed: 64 })],
      [leafCrown([[0, 0.4, 0, 0.44], [-0.36, 0.36, 0.3, 0.36], [0.32, 0.35, -0.28, 0.35]], rgb, { perTip: 4, card: 0.84, seed: 67 })],
    ],
    perch: 1.2,
  });
  Object.assign(kinds, { boldo: bush([70, 102, 52]), zarzamora: bush([64, 92, 44]), mata_negra: bush([44, 64, 40]),
    calafate: bush([72, 104, 52]), hierba_blanca: bush([150, 152, 112]) });
  if (has('pasto')) kinds.coiron = { parts: parts('pasto', [170, 160, 80], false) };
  // Árboles icónicos chilenos con troncos esculpidos y follaje específico por especie
  kinds.palma_chilena = { parts: buildPalma(m, bark, palmTex), perch: 8.5 };
  kinds.sauce_chileno = {
    parts: makeTree({
      h: 4.2, rBase: 0.36, lean: [0.35, 0.12], seed: 70,
      branches: [
        [0.58, 0.2, 1.9, 1.15, 0.95], [0.64, 1.45, 1.85, 1.2, 0.95], [0.7, 2.7, 1.9, 1.1, 0.95],
        [0.76, 3.95, 1.8, 1.15, 0.95], [0.82, 5.2, 1.85, 1.15, 0.95],
      ],
    }, [96, 138, 66], { perTip: 5, card: 1.85, droop: true, seed: 70 }, bark, willowTex),
    perch: 7.4,
  };
  const eucBark = m(plainTex, { tint: 0xc2bcb0 });
  kinds.eucalipto = {
    parts: makeTree({
      h: 10.6, rBase: 0.36, lean: [0.32, -0.18], seed: 78,
      branches: [
        [0.6, 0.5, 1.7, 1.6, 0.95], [0.68, 2.6, 1.65, 1.7, 0.95], [0.76, 4.7, 1.6, 1.6, 0.95],
        [0.86, 1.5, 1.35, 1.7, 0.9], [0.95, 3.8, 1.0, 1.6, 0.85],
      ],
    }, [98, 134, 108], { perTip: 5, card: 2.0, droop: true, seed: 78 }, eucBark, willowTex),
    perch: 14.0, trunkH: 7.0,
  };
  kinds.lenga = {
    ...kinds.lenga, variants: undefined,
    parts: makeTree({
      h: 7.6, rBase: 0.38, lean: [0.45, 0.16], seed: 82,
      branches: [
        [0.54, 0.1, 2.4, 0.85, 1.05], [0.6, 2.2, 2.2, 0.8, 1.0], [0.66, 4.3, 2.15, 0.85, 1.0],
        [0.76, 1.1, 2.0, 0.95, 0.95], [0.82, 3.3, 1.9, 0.9, 0.95], [0.94, 5.4, 1.3, 1.0, 0.9],
      ],
    }, [74, 116, 56], { perTip: 5, card: 1.9, flat: 0.34, seed: 82 }, bark),
    perch: 10.5,
  };
  kinds.nirre = {
    ...kinds.nirre, variants: undefined,
    parts: makeTree({
      h: 2.4, rBase: 0.2, lean: [0.36, 0.14], seed: 86,
      branches: [[0.48, 0.3, 1.1, 0.65, 0.65], [0.62, 2.4, 1.05, 0.6, 0.65], [0.76, 4.5, 1.0, 0.65, 0.6], [0.92, 1.4, 0.6, 0.6, 0.55]],
    }, [98, 128, 62], { perTip: 5, card: 1.15, flat: 0.35, seed: 86 }, bark),
    perch: 3.8,
  };
  // piezas del kit para flora menor y elementos de suelo
  const piece = (id, rgb, extra = {}, sxz = 1) => has(id) && Object.assign(kinds, { [id]: { ...kinds[id], parts: parts(id, rgb, true, sxz), variants: undefined, ...extra } });
  piece('quisco', [80, 110, 70], { perch: 2.1 });
  piece('tronco_caido', [0, 0, 0], { perch: 0.75 });
  piece('flores_altura', [90, 130, 60]);
  piece('chagual', [130, 150, 110], { perch: 2.8 });
  piece('totora', [80, 120, 50]);
  // pueblo (blender/pueblo_build.py), a tamaño real: casas de chapa en 2 formas × colores de los cerros
  const tinted = (e, wall, roof) => [e.geometry, m(e.map || plainTex, {
    tint: e.material === 'kit_casa' ? kitTint(wall) : e.material === 'kit_techo' ? kitTint(roof) : 0xffffff })];
  if (has('casa_color')) {
    const WALLS = [[196, 72, 60], [232, 184, 64], [72, 132, 176], [120, 172, 96], [216, 132, 160], [236, 228, 208]];
    const ROOFS = [[150, 70, 50], [120, 120, 124]];
    const shapes = [...new Set(KIT.casa_color.meshes.map(e => e.name.replace(/_\d+$/, '')))];
    const variants = [];
    WALLS.forEach((w, i) => shapes.forEach(sh => variants.push(KIT.casa_color.meshes.filter(e => e.name.startsWith(sh)).map(e => tinted(e, w, ROOFS[i % 2])))));
    kinds.casa_color = { ...kinds.casa_color, parts: undefined, variants, real: true, radius: 3.6, perch: 6.5, building: true };
  }
  const edTex = KIT.edificio?.meshes?.[0]?.map || plainTex;
  kinds.edificio = { ...kinds.edificio, parts: undefined, variants: buildEdificioVariants(m, edTex),
    real: true, realScale: R => ({ x: 1, y: 0.85 + R() * 0.75, z: 1 }), radius: 6.2, building: true };
  if (has('banca_farol')) kinds.banca_farol = { ...kinds.banca_farol, parts: KIT.banca_farol.meshes.map(e => tinted(e)), real: true, perch: 3.5 };
  if (has('muelle')) kinds.muelle = { ...kinds.muelle, parts: KIT.muelle.meshes.map(e => tinted(e)), real: true, perch: 1.1 };
  if (has('roca')) {
    const rock = (rgb, snowable = false) => ({ perch: 0.9,
      variants: KIT.roca.variants.map(v => v.map(e => [e.geometry, m(e.map || plainTex, { tint: kitTint(rgb), snowable })])) });
    Object.assign(kinds, { roca: rock([150, 146, 136], true), roca_cerro: rock([146, 134, 120], true), bolones: rock([156, 150, 140]),
      roca_andina: rock([132, 128, 122], true), roca_costa: rock([84, 80, 82]) });
  }
}

// Densidad por celda (probabilidad) según el tipo de prop del catálogo.
// (a escala real los árboles y casas ocupan más celdas, por eso son menos densos que antes)
const DENSITY = { arbol: 0.05, arbusto: 0.14, cactus: 0.05, roca: 0.05, junco: 0.3, pasto: 0.25, cojin: 0.08, flor: 0.06, objeto: 0.015, edificio: 0.05 };
// Legibilidad del diorama (aplica a todas las escenas y regiones futuras):
// - SCENE_DENSITY escala la densidad total por escena (1 = lo que dice la cobertura real).
// - Claro central: dentro de CLEAR_R la densidad cae a CLEAR_MIN y sube suave hasta CLEAR_R2.
// - Senderos: franja de PATH_W unidades sin props desde el centro a cada salida.
// - MAX_PER_KIND: tope de instancias por tipo de prop.
export const SCENE_DENSITY = { ciudad: 0.55, matorral: 0.45, rio: 0.5, cordillera: 1, costa: 0.7, humedal: 0.6, estepa: 1, bosque: 0.4, fiordo: 0.8,
  valle: 0.5, bofedal: 0.9, lago: 0.8 }; // bosque (0.4) vale también para el valdiviano
const CLEAR_R = 7, CLEAR_R2 = 18, CLEAR_MIN = 0.1, PATH_W = 2.2, MAX_PER_KIND = 70, BUILDING_CLEAR = 15;

const segDist = (px, pz, ax, az, bx, bz) => {
  const abx = bx - ax, abz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / (abx * abx + abz * abz)));
  return Math.hypot(px - ax - abx * t, pz - az - abz * t);
};

// exitAngles: dirección (rad) de cada sendero desde el centro; exitR: distancia del letrero.
export function buildScene(key, data, props, exitAngles = [], exitR = 20, austral = false, opts = {}) {
  const n = data.height.length ** 0.5 | 0;
  const cell = WORLD / n;
  const unitPerM = cell / data.cellM;
  const range = data.hMax - data.hMin;
  const boost = opts.reliefBoost ?? 1;
  const vex = Math.min(1.3 * boost, (MAX_RELIEF * boost) / Math.max(1, range * unitPerM));
  const hScale = unitPerM * vex;
  const H = opts.heightY ? opts.heightY : data.height.map(h => h * hScale);
  const cover = data.cover;
  const root = new THREE.Group();
  const R = mulberry32(key.length * 7919 + 17);
  const vary = makeVary(R);

  // Letreros sobre tierra firme: si en esa dirección hay agua (p. ej. la bahía), se acercan al centro.
  const coverXZ = (x, z) => cover[Math.max(0, Math.min(n - 1, ((z + WORLD / 2) / (WORLD / n)) | 0)) * n + Math.max(0, Math.min(n - 1, ((x + WORLD / 2) / (WORLD / n)) | 0))];
  const exitPts = exitAngles.map(a => {
    for (let r = exitR; r > 5; r -= 0.5) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (coverXZ(x, z) !== 7 && coverXZ(x * 0.97, z * 0.97) !== 7) return [x, z];
    }
    return [Math.cos(a) * 5, Math.sin(a) * 5];
  });
  const paths = exitPts.map(([x, z]) => [0, 0, x, z]);
  const onPath = (x, z, w = PATH_W) => paths.some(p => segDist(x, z, ...p) < w || Math.hypot(x - p[2], z - p[3]) < w + 3);
  // ---- terreno ----
  const K = 4, S = n * K;
  const riv = rasterRivers(data.rivers, n, K);
  const eb = opts.edgeBlend;
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const tex = makeTex(S, S, (x, y) => {
    const rt = riv.get(`${x},${y}`);
    let col;
    if (rt) col = vary(rt === 'canal' ? [70, 100, 130] : [56, 96, 150], 10);
    else {
      const wx = (x + 0.5) / K * (WORLD / n) - WORLD / 2, wz = (y + 0.5) / K * (WORLD / n) - WORLD / 2;
      if (!eb && (onPath(wx, wz, 0.7) || Math.hypot(wx, wz) < 1.6)) col = vary(R() < 0.2 ? [150, 128, 92] : [172, 148, 108], 8); // sendero
      else {
        const c = cover[(y / K | 0) * n + (x / K | 0)];
        const pal = COVER_RGB[c] || COVER_RGB[5];
        if (c === 4 && (x % 16 === 0 || y % 16 === 0)) col = vary([72, 70, 70], 4); // calles (cada ~5 m)
        else if (c === 3 && x % 3 === 0) col = vary([110, 100, 50], 6); // surcos
        else col = vary(R() < 0.3 ? pal[1] : pal[0], 10);
      }
    }
    if (eb) {
      // transición orgánica amplia en los bordes (hacia el paisaje exterior o hacia la zona vecina)
      const ci = Math.min(n - 1, x / K | 0), ri = Math.min(n - 1, y / K | 0);
      const wX = Math.sin(y * 0.12 + x * 0.03) * 0.045 + Math.cos(y * 0.31) * 0.022;
      const wY = Math.sin(x * 0.12 + y * 0.03) * 0.045 + Math.cos(x * 0.31) * 0.022;
      const bandIn = 0.15, bandOut = 0.24;
      const edges = [
        [x / S + wX, eb.shared.L[ri], eb.nb.L],
        [(S - 1 - x) / S - wX, eb.shared.R[ri], eb.nb.R],
        [y / S + wY, eb.shared.T[ci], eb.nb.T],
        [(S - 1 - y) / S - wY, eb.shared.B[ci], eb.nb.B],
      ];
      for (const [d, isShared, nbRgb] of edges) {
        const band = isShared ? bandIn : bandOut;
        if (d < band) {
          const u = Math.max(0, Math.min(1, 1 - d / band));
          const t = u * u * (3 - 2 * u);
          if (isShared && nbRgb) col = lerp3(col, nbRgb, t * 0.5);
          else if (!isShared) col = lerp3(col, eb.surroundRgb, t);
        }
      }
    }
    return col;
  });
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, n - 1, n - 1).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, H[i]);
  geo.computeVertexNormals();
  // grano del suelo: patrón gris de 32×32 (≈2 m) que se repite sobre el color de la cobertura, como en N64
  const detail = makeTex(32, 32, (x, y) => {
    const blade = (x * 7 + y * 3) % 11 === 0 || (x * 3 + y * 5) % 13 === 0;
    const g = 128 + (R() - 0.5) * 34 + (blade ? -26 : 0) + ((x >> 3) + (y >> 3)) % 2 * 6;
    return [g, g, g];
  });
  const groundMat = mat(tex, { snowable: true, detail, detailRep: WORLD / 2, detailAmt: 0.7 });
  const ground = new THREE.Mesh(geo, groundMat);
  root.add(ground);
  const half = WORLD / 2;
  const step = WORLD / (n - 1);

  function heightAt(x, z) {
    const gx = Math.max(0, Math.min(n - 1.001, (x + half) / step));
    const gz = Math.max(0, Math.min(n - 1.001, (z + half) / step));
    const ix = gx | 0, iz = gz | 0, fx = gx - ix, fz = gz - iz;
    const h = (r, q) => H[r * n + q];
    return h(iz, ix) * (1 - fx) * (1 - fz) + h(iz, ix + 1) * fx * (1 - fz) + h(iz + 1, ix) * (1 - fx) * fz + h(iz + 1, ix + 1) * fx * fz;
  }
  function coverAt(x, z) {
    const q = Math.max(0, Math.min(n - 1, ((x + half) / cell) | 0));
    const r = Math.max(0, Math.min(n - 1, ((z + half) / cell) | 0));
    return cover[r * n + q];
  }
  const cellCenter = i => [(i % n + 0.5) * cell - half, ((i / n | 0) + 0.5) * cell - half];

  // ---- props ----
  const kinds = propKinds(R);
  const perches = [], flowers = [], crowns = [], obstacles = [], trunks = [];
  const EXIT_CLEAR = 3.5;
  const catalog = (props?.[key] || []).filter(p => kinds[p.id]);
  if (key === 'ciudad' && !catalog.some(p => p.tipo === 'edificio')) catalog.push({ id: 'edificio', tipo: 'edificio', cover: [4] });
  const instances = new Map(); // id → [matrix]
  const shadowMtx = []; // sombras de contacto instanciadas bajo árboles, arbustos, rocas y edificios
  const _nrm = new THREE.Vector3(), _sq = new THREE.Quaternion();
  const place = (id, x, z, s0, rot, tipo) => {
    const f = propFactor(id, kinds[id]);
    const s = typeof s0 === 'number' ? s0 * f : { x: s0.x * f, y: s0.y * f, z: s0.z * f };
    const sx = s.x ?? s, sy = s.y ?? s, sz = s.z ?? s;
    const y = heightAt(x, z);
    const mtx = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(UP_VEC, rot), new THREE.Vector3(sx, sy, sz));
    const k = kinds[id];
    const iid = k.variants ? `${id}#${(R() * k.variants.length) | 0}` : id;
    if (!instances.has(iid)) instances.set(iid, []);
    instances.get(iid).push(mtx);
    // sombra de contacto adaptada a la pendiente local y desplazada levemente en dirección opuesta al sol
    let sr = 0, shift = 0;
    if (k.building) { sr = Math.max(4.5, (k.radius ?? 2.5) * sx * 2.3); shift = 0.28; }
    else if (tipo === 'arbol' || (k.perch ?? 0) >= 2.5) { sr = Math.min(7.5, Math.max(2.4, (k.perch ?? 3) * sy * 0.72)); shift = 0.22; }
    else if (tipo === 'arbusto' || tipo === 'roca' || tipo === 'cactus' || tipo === 'cojin' || tipo === 'objeto') {
      sr = Math.min(3.4, Math.max(1.2, (k.perch ?? 1) * sy * 1.25)); shift = 0.1;
    }
    if (sr > 0) {
      const ox = x - sr * shift * 0.78, oz = z - sr * shift * 0.62;
      const oy = heightAt(ox, oz);
      const hx = heightAt(ox + 0.6, oz) - heightAt(ox - 0.6, oz);
      const hz = heightAt(ox, oz + 0.6) - heightAt(ox, oz - 0.6);
      _nrm.set(-hx, 1.2, -hz).normalize();
      _sq.setFromUnitVectors(UP_VEC, _nrm);
      shadowMtx.push(new THREE.Matrix4().compose(new THREE.Vector3(ox, oy + 0.08, oz), _sq, new THREE.Vector3(sr, 1, sr)));
    }
    if (k.perch) perches.push(new THREE.Vector3(x, y + k.perch * sy, z));
    if (k.flower) flowers.push(new THREE.Vector3(x, y + 0.5, z));
    if (k.building) obstacles.push({ x, z, r: (k.radius ?? 1.3) * sx });
    if (k.trunkH || ((k.perch ?? 0) > 2.5 && !k.building)) { // tronco para trepadores (carpintero)
      const a = R() * Math.PI * 2, r = 0.28 * sx;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      trunks.push({ pos: new THREE.Vector3(px, y + (k.trunkH ?? 2) * 0.55 * sy, pz), face: Math.atan2(Math.sin(a), -Math.cos(a)) });
    }
  };
  const exits = [];
  const count = {};
  const dScene = SCENE_DENSITY[key] ?? 1;
  for (let i = 0; i < n * n; i++) {
    const [cx, cz] = cellCenter(i);
    const rc = Math.hypot(cx, cz);
    if (rc > half - 1.5) continue;
    const c = cover[i];
    const clear = rc < CLEAR_R ? CLEAR_MIN : rc < CLEAR_R2 ? CLEAR_MIN + (1 - CLEAR_MIN) * (rc - CLEAR_R) / (CLEAR_R2 - CLEAR_R) : 1;
    for (const p of catalog) {
      if (!p.cover.includes(c)) continue;
      if ((count[p.id] ?? 0) >= MAX_PER_KIND) continue;
      if (p.tipo === 'edificio' && rc < BUILDING_CLEAR) continue;
      const d = (DENSITY[p.tipo] ?? 0.05) * dScene * clear;
      if (R() > d) continue;
      const x = cx + (R() - 0.5) * cell * 0.8, z = cz + (R() - 0.5) * cell * 0.8;
      if (Math.hypot(x, z) < 2.2 || onPath(x, z, p.tipo === 'edificio' ? PATH_W + 1.5 : PATH_W)) continue;
      const k = kinds[p.id];
      // nada encima de un edificio, y los edificios separados entre sí (antes podían quedar superpuestos)
      if (k.building) {
        const rr = (k.radius ?? 1.3) * propFactor(p.id, k) * (k.real ? 1 : 1.2);
        if (obstacles.some(o => Math.hypot(o.x - x, o.z - z) < o.r + rr + 0.8)) continue;
      } else if (obstacles.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 0.3)) continue;
      count[p.id] = (count[p.id] ?? 0) + 1;
      // piezas modeladas a tamaño real: solo una leve variación (y la altura del edificio)
      const s = k.real ? (k.realScale ? k.realScale(R) : 0.9 + R() * 0.2)
        : p.tipo === 'edificio' ? { x: 0.8 + R() * 0.4, y: 1.5 + R() * 2.5, z: 0.8 + R() * 0.4 }
          : p.tipo === 'arbol' ? 0.88 + R() * 0.34 : 0.75 + R() * 0.5;
      place(p.id, x, z, s, R() * Math.PI * 2, p.tipo);
    }
  }
  for (const [iid, list] of instances) {
    const [id, vi] = iid.split('#');
    const parts = vi !== undefined ? kinds[id].variants[+vi] : kinds[id].parts;
    for (const part of parts) {
      const [g, m, tag] = part;
      const im = new THREE.InstancedMesh(g, m, list.length);
      list.forEach((mtx, j) => im.setMatrixAt(j, mtx));
      im.frustumCulled = false; im.userData.propId = iid;
      root.add(im);
      if (tag === 'crown') crowns.push({ im, id, mat: m, base: m.uniforms.uTint.value.clone(), deciduous: !!kinds[id].deciduous, autumn: kinds[id].autumn });
    }
  }
  if (shadowMtx.length) {
    const sm = new THREE.InstancedMesh(propShadowGeo, propShadowMat, shadowMtx.length);
    shadowMtx.forEach((mtx, j) => sm.setMatrixAt(j, mtx));
    sm.frustumCulled = false; sm.renderOrder = 1; sm.userData.noInk = true;
    root.add(sm);
  }

  // ---- temporada: luz, pasto seco en verano, hojas caducas, nieve ----
  const SEASON_NAMES = ['verano', 'otoño', 'invierno', 'primavera'];
  const snowFor = (season, month) => {
    const snowBy = { cordillera: { invierno: 0.85, 'otoño': 0.25, primavera: 0.5, verano: 0.05 },
      matorral: { invierno: month === 6 ? 0.15 : 0 } };
    if (data.hMin > 3000 && key !== 'cordillera') return { verano: month === 1 ? 0.35 : 0.1, invierno: 0.2 }[season] ?? 0;
    if (austral) return { invierno: key === 'costa' || key === 'fiordo' ? 0.45 : 0.8, 'otoño': 0.15, primavera: 0.2, verano: 0 }[season];
    return snowBy[key]?.[season] ?? 0;
  };
  function setSeason(season, month) {
    const dry = { verano: 1, 'otoño': 0.6, invierno: 0, primavera: 0.2 }[season];
    groundMat.uniforms.uTint.value.setRGB(1 + dry * 0.12, 1 + dry * 0.02, 1 - dry * 0.12);
    for (const c of crowns) {
      c.im.visible = true;
      if (!c.deciduous) continue;
      if (season === 'otoño') c.mat.uniforms.uTint.value.setRGB(...(c.autumn || [1.8, 1.2, 0.5])); // la lenga se pone roja
      else if (season === 'invierno') c.im.visible = false;
      else c.mat.uniforms.uTint.value.copy(c.base);
    }
    return snowFor(season, month);
  }
  // Transición continua a lo largo del año (p ∈ [0, 1)): evita saltos abruptos entre estaciones en la vista inmersiva.
  const DRY_BY = [0.9, 0.55, 0.0, 0.22]; // verano, otoño, invierno, primavera
  const _autCol = new THREE.Color();
  function setYearProgress(p) {
    const s = (((p * 12 - 0.5) % 12) + 12) % 12 / 3; // 0 = verano, 1 = otoño, 2 = invierno, 3 = primavera
    const i0 = Math.floor(s) % 4, i1 = (i0 + 1) % 4, f = s - Math.floor(s), t = f * f * (3 - 2 * f);
    const dry = DRY_BY[i0] + (DRY_BY[i1] - DRY_BY[i0]) * t;
    groundMat.uniforms.uTint.value.setRGB(1 + dry * 0.1, 1 + dry * 0.02, 1 - dry * 0.1);
    // peso de otoño (pico en s=1) y de invierno profundo (pico en s=2)
    const dist = (a, b) => Math.min(Math.abs(a - b), 4 - Math.abs(a - b));
    const autW = Math.max(0, 1 - dist(s, 1) / 0.85);
    const winW = Math.max(0, 1 - dist(s, 2) / 0.65);
    for (const c of crowns) {
      if (!c.deciduous) continue;
      c.im.visible = winW < 0.55;
      if (!c.im.visible) continue;
      _autCol.setRGB(...(c.autumn || [1.8, 1.2, 0.5]));
      c.mat.uniforms.uTint.value.copy(c.base).lerp(_autCol, autW * autW * (3 - 2 * autW));
    }
    const m0 = [1, 4, 6, 10][i0], m1 = [1, 4, 6, 10][i1];
    return snowFor(SEASON_NAMES[i0], m0) * (1 - t) + snowFor(SEASON_NAMES[i1], m1) * t;
  }

  // ---- agua: mar o lago con oleaje suave (celdas de agua a nivel del mar) ----
  const seaY = data.hMin <= 0 ? (0 - data.hMin) * hScale + 0.05 : null;
  let water = null, wmat = null;
  if (seaY !== null) {
    const wtex = makeTex(32, 32, (x, y) => ((x + y * 3) % 11 === 0 || (x * 5 + y) % 17 === 0) ? vary([150, 190, 220], 8) : vary([40, 86, 140], 8));
    wmat = mat(wtex, { rx: 10, ry: 10 });
    water = new THREE.Mesh(new THREE.PlaneGeometry(WORLD * 1.6, WORLD * 1.6, 24, 24).rotateX(-Math.PI / 2), wmat);
    water.position.y = seaY;
    root.add(water);
  }
  const waterSpots = [];
  for (let i = 0; i < n * n; i++) if (cover[i] === 7) {
    const [x, z] = cellCenter(i);
    const y = heightAt(x, z);
    if (Math.hypot(x, z) < half * 0.65) waterSpots.push(new THREE.Vector3(x, seaY !== null ? Math.max(seaY, y) : y + 0.05, z));
  }
  // ríos, canales y lagos: superficie de agua propia sobre el cauce (antes solo pintados en el suelo),
  // con una textura de corriente que se desplaza. Se omite donde ya está el mar.
  const flowTex = makeTex(32, 32, (x, y) => ((x * 3 + y) % 13 === 0 || (x + y * 5) % 19 === 0) ? vary([170, 205, 230], 8)
    : (y % 8 === 0 ? vary([70, 118, 168], 6) : vary([50, 92, 146], 6)));
  const flowMat = mat(flowTex, { rx: 1, ry: 1 });
  const fpos = [], fuv = [];
  const sub = cell / K, lift = 0.07;
  const addQuad = (x0, z0, x1, z1) => {
    const ys = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => heightAt(x, z));
    if (seaY !== null && Math.max(...ys) < seaY + 0.05) return; // bajo el mar
    const v = [[x0, ys[0], z0], [x1, ys[1], z0], [x1, ys[2], z1], [x0, ys[3], z1]];
    for (const i of [0, 3, 1, 1, 3, 2]) { fpos.push(v[i][0], v[i][1] + lift, v[i][2]); fuv.push(v[i][0] * 0.3, v[i][2] * 0.3); }
  };
  for (const key of riv.keys()) {
    const [x, y] = key.split(',').map(Number);
    if (x < 0 || y < 0 || x >= n * K || y >= n * K) continue;
    addQuad(x * sub - half, y * sub - half, (x + 1) * sub - half, (y + 1) * sub - half);
  }
  for (let i = 0; i < n * n; i++) if (cover[i] === 7) {
    const q = i % n, r = i / n | 0;
    addQuad(q * cell - half, r * cell - half, (q + 1) * cell - half, (r + 1) * cell - half);
  }
  let flow = null;
  if (fpos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(fuv, 2));
    g.computeVertexNormals();
    flow = new THREE.Mesh(g, flowMat); flow.renderOrder = 1;
    root.add(flow);
  }

  // oleaje: el plano sube y baja, y sus vértices ondulan; la textura del mar y de los ríos corre
  const wpos = water?.geometry.attributes.position;
  function animate(t) {
    if (flow) flowMat.uniforms.uOffset.value.set(t * 0.12, t * 0.05);
    if (!water) return;
    wmat.uniforms.uOffset.value.set(Math.sin(t * 0.25) * 0.15, t * 0.02);
    water.position.y = seaY + Math.sin(t * 0.8) * 0.06;
    for (let i = 0; i < wpos.count; i++) wpos.setY(i, Math.sin(t * 1.3 + wpos.getX(i) * 0.35) * 0.08 + Math.cos(t * 0.9 + wpos.getZ(i) * 0.3) * 0.06);
    wpos.needsUpdate = true;
  }

  return { root, heightAt, coverAt, perches, flowers, obstacles, trunks, exits, exitPts, setSeason, setYearProgress, half, cell, n, groundMat, ground, water, waterSpots, seaY, animate, hMin: data.hMin };
}

// Letrero de sendero con texto pixelado.
export function signpost() {
  // tablero de madera con una flecha; el nombre del destino va como etiqueta HTML (main.js)
  const t = makeTex(32, 8, (x, y) => {
    if (y === 0 || y === 7) return [58, 36, 18];
    if (y >= 3 && y <= 4 && x >= 6 && x <= 22) return [244, 236, 208];
    if (x >= 22 && x <= 26 && Math.abs(y - 3.5) <= 26 - x) return [244, 236, 208];
    return x % 7 === 0 ? [100, 70, 40] : [122, 84, 48];
  });
  const grp = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.8, 0.16).translate(0, 0.9, 0), mat(plainTex, { tint: 0x5a3c22 }));
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 0.08).translate(0, 1.55, 0), mat(t, { twoSided: false }));
  const back = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6).rotateY(Math.PI).translate(0, 1.55, -0.041), mat(t));
  grp.add(post, board, back);
  return grp;
}

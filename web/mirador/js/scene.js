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
  const crown = (c) => m(leaf(c), { snowable: true });
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
    llareta: { parts: [[new THREE.SphereGeometry(0.7, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1), m(leaf([100, 150, 60]), { snowable: true })]], perch: 0.4 },
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
    // Arica y Parinacota: valle de Azapa, humedal del Lluta y altiplano
    olivo: { parts: [[new THREE.CylinderGeometry(0.16, 0.3, 1.4, 5).rotateZ(0.12).translate(0, 0.7, 0), m(bark)],
      blob(1.3, 2.0, 0.7, [120, 136, 104]), blob(0.8, 2.5, 0.6, [136, 148, 116])], perch: 2.6 },
    algarrobo: { parts: [trunk(1.8, 0.2), blob(1.8, 2.4, 0.4, [128, 148, 72])], perch: 2.8 },
    brea: { parts: [blob(0.7, 0.55, 0.8, [124, 136, 100])], perch: 1.1 },
    paja_brava: { parts: cross(0.8, 0.8, makeTex(16, 32, (x, y) => (x % 2 === 0 && y > (x * 5) % 9) ? vary([208, 180, 100], 18) : [0, 0, 0, 0])) },
    tola: { parts: [blob(0.45, 0.32, 0.75, [100, 104, 64])], perch: 0.6 },
    quenoa: { parts: [[new THREE.CylinderGeometry(0.1, 0.2, 1.6, 5).rotateZ(0.3).translate(0.2, 0.8, 0), m(makeTex(8, 16, () => vary([150, 80, 52], 14)))],
      blob(0.7, 1.7, 0.6, [56, 84, 52]), blob(0.5, 1.4, 0.6, [64, 92, 56])], perch: 2.0 },
    // Los Ríos: bosque valdiviano
    coigue: { parts: [trunk(5, 0.32), blob(1.6, 4.6, 0.45, [40, 72, 40]), blob(1.4, 5.6, 0.45, [48, 80, 44]), blob(1.1, 6.5, 0.5, [44, 76, 42])], perch: 6.8 },
    ulmo: { parts: [trunk(3.4, 0.26), blob(1.7, 4.2, 0.9, [52, 96, 48]), [new THREE.IcosahedronGeometry(1.75, 0).scale(1, 0.92, 1).translate(0, 4.25, 0), m(makeTex(16, 16, () => R() < 0.1 ? [236, 236, 228] : [0, 0, 0, 0]), { alpha: 1 }), 'crown']], perch: 5.4 },
    arrayan: { parts: [[new THREE.CylinderGeometry(0.12, 0.18, 2.4, 5).rotateZ(0.15).translate(0, 1.2, 0), m(makeTex(8, 16, () => vary(R() < 0.3 ? [232, 236, 228] : [196, 112, 52], 10)))],
      blob(1.1, 2.7, 0.7, [56, 92, 44])], perch: 3.2 },
    canelo: { parts: [trunk(2.6, 0.18), [new THREE.ConeGeometry(1.0, 3.4, 6).translate(0, 3.6, 0), crown([84, 120, 72]), 'crown']], perch: 4.4 },
    quila: { parts: cross(1.4, 1.6, makeTex(16, 32, (x, y) => (x % 3 === 1 && y > 1) || (y % 6 === 0 && x % 3 === 2) ? vary([120, 140, 64], 14) : [0, 0, 0, 0])) },
    nalca: { parts: [...[0, 2.1, 4.2].map(a => [new THREE.CircleGeometry(0.55, 6).rotateX(-Math.PI / 2 + 0.5).translate(0, 0.9, 0.35).rotateY(a), m(leaf([64, 112, 48]), { twoSided: true })]),
      [new THREE.CylinderGeometry(0.04, 0.06, 0.9, 4).translate(0, 0.45, 0), m(makeTex(4, 4, () => vary([150, 64, 52], 8)))]], perch: 1.0 },
    helecho: { parts: cross(0.9, 0.7, makeTex(16, 16, (x, y) => (Math.abs(x - 7.5) < (16 - y) * 0.45 && (x + y) % 2 === 0) ? vary([60, 108, 52], 12) : [0, 0, 0, 0])) },
    cojin_bofedal: { parts: [[new THREE.SphereGeometry(0.9, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.2, 0.22, 1), m(makeTex(16, 16, () => vary(R() < 0.15 ? [56, 100, 44] : [84, 140, 60], 10)), { snowable: true })]] },
  };
  useKit(kinds, m);
  return kinds;
}

// Piezas modeladas en Blender (js/kit.js): reemplazan a las formas procedurales cuando están cargadas.
// Las texturas del kit son grises (≈170): el tinte de cada especie da su color.
const kitTint = rgb => new THREE.Color(rgb[0] / 170, rgb[1] / 170, rgb[2] / 170);
function useKit(kinds, m) {
  const parts = (id, rgb, snowable = true) => (KIT[id]?.meshes || []).map(e => {
    const leafy = /copa|borde|pasto/.test(e.material);
    return [e.geometry, m(e.map || plainTex, { tint: leafy ? kitTint(rgb) : 0xffffff, alpha: e.alpha ? 1 : 0, twoSided: e.alpha, snowable: leafy && snowable }),
      /copa|borde/.test(e.material) ? 'crown' : undefined];
  });
  const has = id => !!KIT[id];
  if (has('arbol_copa')) {
    const tree = (rgb, extra = {}) => ({ parts: parts('arbol_copa', rgb), perch: 6.3, ...extra });
    Object.assign(kinds, {
      quillay: tree([58, 86, 44]), peumo: tree([44, 76, 40]), litre: tree([72, 92, 40]), pimiento: tree([96, 124, 64]),
      platano_oriental: tree([80, 116, 48], { deciduous: true }), maiten: tree([84, 112, 56]),
    });
  }
  if (has('espino')) kinds.espino = { parts: parts('espino', [104, 108, 52]), perch: 3.2 };
  if (has('arbusto')) {
    const bush = rgb => ({ parts: parts('arbusto', rgb), perch: 1.2 });
    Object.assign(kinds, { boldo: bush([70, 96, 52]), zarzamora: bush([64, 88, 44]), mata_negra: bush([40, 58, 36]),
      calafate: bush([72, 100, 52]), hierba_blanca: bush([150, 150, 110]) });
  }
  if (has('pasto')) kinds.coiron = { parts: parts('pasto', [170, 160, 80], false) };
  // piezas con geometría de Kenney (CC0) re-texturizada: ya vienen a su altura real (perch ≈ altura)
  const piece = (id, rgb, extra = {}) => has(id) && Object.assign(kinds, { [id]: { ...kinds[id], parts: parts(id, rgb), variants: undefined, ...extra } });
  piece('palma_chilena', [70, 100, 50], { perch: 8.5 });
  piece('quisco', [80, 110, 70], { perch: 2.1 });
  piece('eucalipto', [96, 128, 104], { perch: 14.0 });
  piece('sauce_chileno', [96, 132, 64], { perch: 7.6 });
  piece('lenga', [70, 110, 52], { perch: 10.5 });   // conserva deciduous/autumn/trunkH del catálogo
  piece('nirre', [96, 124, 60], { perch: 3.8 });
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
  if (has('edificio')) kinds.edificio = { ...kinds.edificio, parts: KIT.edificio.meshes.map(e => tinted(e, [255, 255, 255], [255, 255, 255])),
    real: true, realScale: R => ({ x: 1, y: 1 + R() * 0.8, z: 1 }), radius: 6.2 };
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
export function buildScene(key, data, props, exitAngles = [], exitR = 20, austral = false) {
  const n = data.height.length ** 0.5 | 0;
  const cell = WORLD / n;
  const unitPerM = cell / data.cellM;
  const range = data.hMax - data.hMin;
  const vex = Math.min(1.3, MAX_RELIEF / Math.max(1, range * unitPerM));
  const hScale = unitPerM * vex;
  const H = data.height.map(h => h * hScale);
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
  const K = 4;
  const riv = rasterRivers(data.rivers, n, K);
  const tex = makeTex(n * K, n * K, (x, y) => {
    const rt = riv.get(`${x},${y}`);
    if (rt) return vary(rt === 'canal' ? [70, 100, 130] : [56, 96, 150], 10);
    const wx = (x + 0.5) / K * (WORLD / n) - WORLD / 2, wz = (y + 0.5) / K * (WORLD / n) - WORLD / 2;
    if (onPath(wx, wz, 0.7) || Math.hypot(wx, wz) < 1.6) return vary(R() < 0.2 ? [150, 128, 92] : [172, 148, 108], 8); // sendero
    const c = cover[(y / K | 0) * n + (x / K | 0)];
    const pal = COVER_RGB[c] || COVER_RGB[5];
    if (c === 4 && (x % 16 === 0 || y % 16 === 0)) return vary([72, 70, 70], 4); // calles (cada ~5 m)
    if (c === 3 && x % 3 === 0) return vary([110, 100, 50], 6); // surcos
    return vary(R() < 0.3 ? pal[1] : pal[0], 10);
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
  const place = (id, x, z, s0, rot) => {
    const f = propFactor(id, kinds[id]);
    const s = typeof s0 === 'number' ? s0 * f : { x: s0.x * f, y: s0.y * f, z: s0.z * f };
    const y = heightAt(x, z);
    const mtx = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(s.x ?? s, s.y ?? s, s.z ?? s));
    const k = kinds[id];
    const iid = k.variants ? `${id}#${(R() * k.variants.length) | 0}` : id;
    if (!instances.has(iid)) instances.set(iid, []);
    instances.get(iid).push(mtx);
    if (k.perch) perches.push(new THREE.Vector3(x, y + k.perch * (s.y ?? s), z));
    if (k.flower) flowers.push(new THREE.Vector3(x, y + 0.5, z));
    if (k.building) obstacles.push({ x, z, r: (k.radius ?? 1.3) * (s.x ?? s) });
    if (k.trunkH || ((k.perch ?? 0) > 2.5 && !k.building)) { // tronco para trepadores (carpintero)
      const a = R() * Math.PI * 2, r = 0.28 * (s.x ?? s);
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      trunks.push({ pos: new THREE.Vector3(px, y + (k.trunkH ?? 2) * 0.55 * (s.y ?? s), pz), face: Math.atan2(Math.sin(a), -Math.cos(a)) });
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
      count[p.id] = (count[p.id] ?? 0) + 1;
      const k = kinds[p.id];
      // piezas modeladas a tamaño real: solo una leve variación (y la altura del edificio)
      const s = k.real ? (k.realScale ? k.realScale(R) : 0.9 + R() * 0.2)
        : p.tipo === 'edificio' ? { x: 0.8 + R() * 0.4, y: 1.5 + R() * 2.5, z: 0.8 + R() * 0.4 } : 0.7 + R() * 0.6;
      place(p.id, x, z, s, R() * Math.PI * 2);
    }
  }
  for (const [iid, list] of instances) {
    const [id, vi] = iid.split('#');
    const parts = vi !== undefined ? kinds[id].variants[+vi] : kinds[id].parts;
    for (const part of parts) {
      const [g, m, tag] = part;
      const im = new THREE.InstancedMesh(g, m, list.length);
      list.forEach((mtx, j) => im.setMatrixAt(j, mtx));
      im.frustumCulled = false;
      root.add(im);
      if (tag === 'crown') crowns.push({ im, id, mat: m, base: m.uniforms.uTint.value.clone(), deciduous: !!kinds[id].deciduous, autumn: kinds[id].autumn });
    }
  }

  // ---- temporada: luz, pasto seco en verano, hojas caducas, nieve ----
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
    const snowBy = { cordillera: { invierno: 0.85, 'otoño': 0.25, primavera: 0.5, verano: 0.05 },
      matorral: { invierno: month === 6 ? 0.15 : 0 } };
    // altiplano (sobre 3.000 m, menos la cordillera central): nevazones del "invierno altiplánico" en
    // verano y heladas secas en invierno
    if (data.hMin > 3000 && key !== 'cordillera') return { verano: month === 1 ? 0.35 : 0.1, invierno: 0.2 }[season] ?? 0;
    // regiones australes: nieve en invierno en todas las escenas (menos en la costa, que es más templada)
    if (austral) return { invierno: key === 'costa' || key === 'fiordo' ? 0.45 : 0.8, 'otoño': 0.15, primavera: 0.2, verano: 0 }[season];
    return snowBy[key]?.[season] ?? 0;
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

  return { root, heightAt, coverAt, perches, flowers, obstacles, trunks, exits, exitPts, setSeason, half, cell, n, groundMat, ground, waterSpots, seaY, animate, hMin: data.hMin };
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

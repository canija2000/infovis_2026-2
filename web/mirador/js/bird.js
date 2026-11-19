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
  g.userData.shared = true;
  return g;
})();

const CHUCAO = { beak: 0.25, beakDepth: 0.29, tarsus: 0.52, tail: 0.94, hwi: 0.05 };
const GRAY = { back: [120, 110, 100], back_dark: [80, 72, 64], belly: [180, 172, 160], flank: [150, 140, 128],
  head: [110, 100, 92], throat: [190, 184, 172], wing: [100, 90, 80], tail: [90, 80, 72],
  beak: [40, 32, 28], legs: [72, 64, 56], eye: [16, 16, 16] };

// Paletas ornitológicas base por familia (para las especies sin paleta fotográfica curada: evita el gris uniforme).
const FAMILY_PALETTE = {
  Furnariidae:      { back: [148, 96, 58], back_dark: [86, 52, 32], belly: [212, 188, 152], flank: [176, 134, 92], head: [132, 82, 48], throat: [232, 218, 192], wing: [126, 76, 44], tail: [138, 66, 36], beak: [52, 42, 36], legs: [84, 68, 56], pattern: { back: 'streaked' } },
  Rhinocryptidae:   { back: [108, 72, 52], back_dark: [56, 38, 30], belly: [176, 132, 92], flank: [142, 94, 64], head: [94, 64, 48], throat: [198, 118, 64], wing: [96, 62, 44], tail: [72, 48, 36], beak: [42, 34, 30], legs: [72, 58, 48], pattern: { belly: 'barred' } },
  Troglodytidae:    { back: [156, 104, 62], back_dark: [92, 56, 32], belly: [218, 194, 156], flank: [182, 138, 96], head: [142, 92, 54], throat: [234, 220, 194], wing: [138, 86, 48], tail: [128, 76, 42], beak: [54, 44, 36], legs: [96, 76, 60], pattern: { wing: 'barred', tail: 'barred' } },
  Tyrannidae:       { back: [102, 112, 82], back_dark: [56, 62, 48], belly: [222, 214, 154], flank: [174, 172, 126], head: [84, 90, 74], throat: [232, 230, 212], wing: [74, 78, 64], tail: [58, 60, 52], beak: [34, 34, 34], legs: [46, 46, 48] },
  Thraupidae:       { back: [126, 138, 64], back_dark: [68, 78, 38], belly: [234, 206, 64], flank: [198, 182, 74], head: [102, 118, 72], throat: [242, 220, 82], wing: [92, 102, 58], tail: [76, 84, 50], beak: [56, 52, 48], legs: [78, 68, 56], accent: [242, 196, 48], accentWhere: 'pecho' },
  Fringillidae:     { back: [116, 134, 52], back_dark: [36, 38, 36], belly: [238, 212, 54], flank: [204, 188, 66], head: [34, 36, 38], throat: [236, 214, 62], wing: [42, 44, 42], tail: [36, 38, 38], beak: [164, 156, 128], legs: [76, 64, 54], accent: [244, 212, 44], accentWhere: 'ala y cola' },
  Hirundinidae:     { back: [38, 74, 132], back_dark: [22, 42, 82], belly: [242, 244, 246], flank: [222, 228, 236], head: [34, 66, 122], throat: [244, 244, 244], wing: [28, 52, 96], tail: [24, 44, 82], beak: [26, 26, 28], legs: [44, 42, 44] },
  Psittacidae:      { back: [64, 142, 58], back_dark: [36, 86, 38], belly: [112, 178, 74], flank: [84, 156, 64], head: [72, 148, 62], throat: [148, 184, 82], wing: [48, 118, 54], tail: [142, 58, 46], beak: [198, 178, 136], legs: [88, 82, 74], accent: [204, 66, 44], accentWhere: 'pecho' },
  Laridae:          { back: [164, 174, 186], back_dark: [36, 40, 46], belly: [246, 246, 244], flank: [236, 238, 240], head: [244, 244, 242], throat: [246, 246, 244], wing: [148, 158, 172], tail: [242, 242, 240], beak: [226, 184, 44], legs: [212, 168, 48] },
  Diomedeidae:      { back: [62, 68, 78], back_dark: [32, 36, 44], belly: [248, 248, 246], flank: [240, 242, 244], head: [246, 246, 244], throat: [248, 248, 246], wing: [52, 58, 68], tail: [48, 52, 60], beak: [226, 176, 74], legs: [162, 158, 166] },
  Procellariidae:   { back: [96, 102, 112], back_dark: [52, 56, 64], belly: [228, 230, 234], flank: [188, 194, 202], head: [108, 114, 124], throat: [224, 228, 232], wing: [74, 80, 90], tail: [64, 68, 76], beak: [182, 168, 128], legs: [112, 114, 122] },
  Sulidae:          { back: [122, 112, 102], back_dark: [68, 62, 56], belly: [244, 244, 240], flank: [228, 224, 216], head: [242, 240, 234], throat: [244, 244, 240], wing: [108, 98, 88], tail: [88, 80, 72], beak: [146, 172, 196], legs: [126, 152, 176] },
  Ardeidae:         { back: [232, 236, 238], back_dark: [162, 174, 186], belly: [246, 248, 246], flank: [236, 240, 242], head: [242, 244, 244], throat: [246, 248, 246], wing: [220, 226, 232], tail: [228, 232, 236], beak: [224, 174, 48], legs: [52, 56, 52] },
  Anatidae:         { back: [116, 88, 62], back_dark: [62, 46, 34], belly: [194, 168, 132], flank: [158, 126, 92], head: [54, 104, 72], throat: [186, 156, 118], wing: [96, 74, 54], tail: [72, 56, 42], beak: [108, 146, 176], legs: [196, 124, 52], pattern: { flank: 'barred' } },
  Scolopacidae:     { back: [144, 122, 94], back_dark: [78, 64, 48], belly: [238, 236, 228], flank: [204, 192, 172], head: [138, 118, 94], throat: [236, 232, 222], wing: [122, 102, 78], tail: [112, 94, 72], beak: [46, 42, 38], legs: [156, 148, 72], pattern: { back: 'spotted' } },
  Charadriidae:     { back: [154, 132, 104], back_dark: [42, 38, 36], belly: [242, 240, 234], flank: [216, 206, 188], head: [146, 124, 98], throat: [244, 242, 236], wing: [132, 112, 86], tail: [96, 82, 66], beak: [40, 36, 34], legs: [176, 118, 74], accent: [36, 34, 34], accentWhere: 'collar' },
  Rallidae:         { back: [56, 62, 68], back_dark: [30, 34, 38], belly: [74, 80, 86], flank: [64, 70, 76], head: [38, 42, 46], throat: [54, 58, 64], wing: [48, 54, 60], tail: [36, 40, 44], beak: [228, 198, 46], legs: [108, 132, 72], accent: [216, 56, 44], accentWhere: 'frente' },
  Phalacrocoracidae:{ back: [34, 38, 44], back_dark: [18, 20, 24], belly: [48, 52, 58], flank: [40, 44, 50], head: [30, 34, 40], throat: [218, 196, 138], wing: [28, 32, 38], tail: [22, 24, 28], beak: [182, 146, 74], legs: [196, 98, 76] },
  Accipitridae:     { back: [96, 74, 56], back_dark: [48, 36, 28], belly: [224, 214, 194], flank: [182, 162, 134], head: [84, 66, 52], throat: [228, 220, 204], wing: [82, 62, 46], tail: [112, 88, 66], beak: [212, 178, 54], legs: [214, 176, 52], pattern: { belly: 'barred', tail: 'barred' } },
  Falconidae:       { back: [118, 92, 76], back_dark: [46, 42, 48], belly: [228, 208, 176], flank: [196, 168, 132], head: [82, 92, 108], throat: [238, 232, 218], wing: [96, 78, 72], tail: [164, 92, 58], beak: [196, 176, 62], legs: [218, 178, 48], accent: [36, 34, 38], accentWhere: 'bigote', pattern: { belly: 'spotted' } },
  Strigidae:        { back: [122, 94, 68], back_dark: [64, 48, 34], belly: [214, 196, 166], flank: [176, 152, 122], head: [116, 90, 66], throat: [232, 224, 206], wing: [108, 82, 58], tail: [104, 78, 56], beak: [196, 172, 78], legs: [168, 152, 126], pattern: { back: 'spotted', belly: 'barred' } },
  Columbidae:       { back: [148, 138, 136], back_dark: [82, 76, 78], belly: [196, 172, 164], flank: [174, 156, 152], head: [138, 134, 146], throat: [204, 182, 176], wing: [132, 124, 126], tail: [96, 92, 96], beak: [56, 50, 52], legs: [178, 84, 86], pattern: { wing: 'spotted' } },
  Tinamidae:        { back: [142, 114, 78], back_dark: [74, 56, 38], belly: [204, 184, 144], flank: [172, 146, 106], head: [128, 102, 72], throat: [224, 212, 182], wing: [128, 100, 68], tail: [116, 90, 62], beak: [86, 74, 58], legs: [142, 128, 88], pattern: { back: 'barred', flank: 'barred' } },
  Thinocoridae:     { back: [158, 132, 96], back_dark: [82, 66, 46], belly: [234, 228, 212], flank: [192, 170, 136], head: [132, 126, 118], throat: [238, 234, 224], wing: [142, 116, 82], tail: [118, 96, 68], beak: [152, 138, 92], legs: [176, 156, 78], accent: [46, 42, 40], accentWhere: 'collar' },
  Icteridae:        { back: [32, 34, 40], back_dark: [16, 18, 22], belly: [38, 40, 48], flank: [34, 36, 44], head: [28, 30, 36], throat: [32, 34, 42], wing: [26, 28, 34], tail: [22, 24, 30], beak: [30, 30, 34], legs: [34, 34, 38] },
  Picidae:          { back: [48, 46, 44], back_dark: [22, 22, 22], belly: [222, 216, 198], flank: [198, 190, 170], head: [44, 42, 42], throat: [232, 228, 214], wing: [38, 36, 36], tail: [30, 30, 30], beak: [42, 42, 44], legs: [68, 68, 66], accent: [208, 48, 44], accentWhere: 'frente', pattern: { back: 'barred', belly: 'barred' } },
  Podicipedidae:    { back: [82, 74, 68], back_dark: [42, 38, 36], belly: [228, 226, 222], flank: [154, 112, 82], head: [66, 60, 56], throat: [218, 214, 206], wing: [74, 66, 62], tail: [62, 56, 52], beak: [64, 62, 58], legs: [72, 78, 68] },
  Spheniscidae:     { back: [36, 42, 50], back_dark: [20, 24, 30], belly: [244, 244, 242], flank: [224, 228, 232], head: [32, 38, 46], throat: [240, 240, 238], wing: [30, 36, 44], tail: [28, 32, 38], beak: [46, 44, 48], legs: [48, 46, 48], accent: [34, 38, 44], accentWhere: 'collar' },
  Trochilidae:      { back: [44, 138, 86], back_dark: [24, 82, 54], belly: [88, 162, 108], flank: [62, 146, 94], head: [40, 132, 84], throat: [204, 46, 108], wing: [46, 52, 62], tail: [34, 72, 88], beak: [26, 26, 28], legs: [36, 34, 34], accent: [224, 52, 118], accentWhere: 'gorguera' },
  Phoenicopteridae: { back: [242, 152, 158], back_dark: [206, 86, 102], belly: [248, 198, 200], flank: [246, 174, 178], head: [246, 178, 182], throat: [248, 192, 196], wing: [226, 102, 116], tail: [236, 134, 142], beak: [38, 36, 38], legs: [214, 114, 128] },
  Mimidae:          { back: [128, 122, 114], back_dark: [68, 64, 60], belly: [218, 212, 198], flank: [182, 174, 158], head: [122, 116, 110], throat: [236, 232, 224], wing: [92, 88, 84], tail: [64, 60, 58], beak: [36, 34, 34], legs: [54, 52, 52], pattern: { flank: 'streaked' } },
};

const clamp8 = v => Math.max(16, Math.min(248, Math.round(v)));
// Realza ligeramente la saturación y contraste para que los plumajes se distingan mejor desde la torre.
function boostRgb(c, sat = 1.22, shift = [0, 0, 0]) {
  const lum = c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
  return [
    clamp8(lum + (c[0] - lum) * sat + shift[0]),
    clamp8(lum + (c[1] - lum) * sat + shift[1]),
    clamp8(lum + (c[2] - lum) * sat + shift[2]),
  ];
}

// Paleta diferenciada por especie: realza las 87 paletas curadas y genera plumajes ornitológicos
// por familia + pistas del nombre común + variación única por `sp.id` para el resto.
function paletteFor(sp, plan) {
  const ZONES = ['back', 'back_dark', 'belly', 'flank', 'head', 'throat', 'wing', 'tail', 'beak', 'legs'];
  if (sp.palette) {
    const out = { ...GRAY, ...sp.palette };
    for (const z of ZONES) if (Array.isArray(out[z])) out[z] = boostRgb(out[z], 1.24);
    if (Array.isArray(out.accent)) out.accent = boostRgb(out.accent, 1.3);
    return out;
  }
  const fam = sp.morphology?.family;
  const base = FAMILY_PALETTE[fam]
    || (plan === 'gaviota' ? FAMILY_PALETTE.Laridae
      : plan === 'pato' || plan === 'cisne' ? FAMILY_PALETTE.Anatidae
      : plan === 'garza' ? FAMILY_PALETTE.Ardeidae
      : plan === 'rapaz' ? FAMILY_PALETTE.Accipitridae
      : plan === 'playero' ? FAMILY_PALETTE.Scolopacidae
      : plan === 'picaflor' ? FAMILY_PALETTE.Trochilidae
      : plan === 'loro' ? FAMILY_PALETTE.Psittacidae
      : plan === 'pinguino' ? FAMILY_PALETTE.Spheniscidae
      : FAMILY_PALETTE.Furnariidae);
  const out = { ...GRAY, ...base, pattern: { ...(base.pattern || {}) } };
  // pistas del nombre común en español para aciertos rápidos (ej. "negro", "blanco", "amarillo", "rojo", "azul", "canela")
  const nm = (sp.comName || '').toLowerCase();
  if (/negro|negra|tordo|mirlo/.test(nm)) {
    Object.assign(out, { back: [36, 38, 44], back_dark: [18, 20, 24], head: [32, 34, 40], wing: [28, 30, 36], tail: [24, 26, 30] });
    if (!/vientre blanco|pecho blanco/.test(nm)) Object.assign(out, { belly: [52, 54, 62], flank: [44, 46, 52] });
  } else if (/blanco|blanca|albo|alba|viudita|garceta/.test(nm)) {
    Object.assign(out, { back: [232, 234, 236], belly: [246, 246, 244], head: [240, 242, 242], throat: [246, 246, 244] });
  } else if (/amarill|dorad|chirihue|jilguero|cometocino/.test(nm)) {
    Object.assign(out, { belly: [240, 206, 48], throat: [244, 218, 64], flank: [212, 186, 64], accent: [244, 202, 40], accentWhere: 'pecho' });
  } else if (/azul|celeste/.test(nm)) {
    Object.assign(out, { back: [56, 94, 152], head: [48, 86, 146], wing: [44, 76, 128] });
  } else if (/rojo|roja|bermej|colorad|loica|flamenco|siete colores/.test(nm)) {
    Object.assign(out, { accent: [214, 58, 48], accentWhere: 'pecho', flank: [186, 114, 88] });
  } else if (/verde|cotorra|choroy|tricahue/.test(nm)) {
    Object.assign(out, { back: [68, 142, 62], head: [76, 150, 68], belly: [122, 178, 82] });
  } else if (/canela|rufo|acanelad|castañ/.test(nm)) {
    Object.assign(out, { back: [168, 96, 52], head: [156, 86, 46], flank: [188, 124, 76] });
  }
  // variación determinista por sp.id para que especies de la misma familia nunca sean clones entre sí
  const R = mulberry32(sp.id * 7919 + 43);
  const dR = (R() - 0.5) * 42, dG = (R() - 0.5) * 34, dB = (R() - 0.5) * 38;
  const dLum = (R() - 0.5) * 28;
  for (const z of ['back', 'flank', 'head', 'wing', 'tail']) {
    out[z] = boostRgb(out[z], 1.16, [dR + dLum, dG + dLum, dB + dLum]);
  }
  out.back_dark = out.back.map(v => clamp8(v * 0.58));
  out.belly = boostRgb(out.belly, 1.1, [dR * 0.35 + dLum * 0.4, dG * 0.35 + dLum * 0.4, dB * 0.35 + dLum * 0.4]);
  out.throat = boostRgb(out.throat, 1.08, [dR * 0.25, dG * 0.25, dB * 0.25]);
  // variedad sutil de marcas (pecho/collar/frente o patrón de plumas) si no tenía acento propio
  if (!out.accent && R() < 0.45) {
    const accents = [[218, 168, 52], [192, 84, 52], [238, 236, 224], [48, 52, 62], [164, 118, 72]];
    const wheres = ['pecho', 'collar', 'frente', 'ala y cola'];
    out.accent = accents[(R() * accents.length) | 0];
    out.accentWhere = wheres[(R() * wheres.length) | 0];
  }
  if (!Object.keys(out.pattern).length && R() < 0.5) {
    const pats = ['barred', 'streaked', 'spotted'];
    out.pattern[R() < 0.5 ? 'back' : 'wing'] = pats[(R() * pats.length) | 0];
  }
  return out;
}

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
  if (onePieceOn && ONE_PIECE.has(plan)) {
    const legLen1 = 0.85 * fTarsus, hs1 = pl.head, nl1 = pl.neckLen ?? 0;
    const headBase1 = new THREE.Vector3(0.98 - pl.tilt * 0.25 + pl.neck + nl1 * 0.35, 1.42 + pl.tilt * 0.45 + pl.neck * 0.5 + nl1 * 0.9, 0);
    const bl1 = 0.4 * fBeak * (plan === 'picaflor' ? 1.6 : 1);
    const br1 = 0.12 * clamp(fDepth * (fBeak > 1.4 ? 0.7 : 1), 0.3, 1.8);
    return buildBirdOnePiece(sp, plan, {
      pl, f: { tail: fTail }, hs: hs1, headBase: headBase1, bl: bl1, br: br1, legLen: legLen1,
      P: paletteFor(sp, plan), footGeo, hwi,
      tarsusGeo: new THREE.CylinderGeometry(0.055 * (pl.legThick ?? 1), 0.045 * (pl.legThick ?? 1), legLen1, 6, 1, true).translate(0, -legLen1 / 2, 0),
    });
  }
  const T = speciesTextures(sp);
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

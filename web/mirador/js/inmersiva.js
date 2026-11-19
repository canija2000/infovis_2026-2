// Vista inmersiva: el año 2024 de una región pasa en 72 s (6 s por mes) sobre una maqueta con todas sus zonas,
// vista desde una torre. Cada especie registrada ese mes en la región es una bandada de su propio modelo (el del
// Aviario): llega volando (las de verano desde el norte, las de invierno desde el sur), se posa en la zona de su
// hábitat y se va cuando deja de registrarse. Datos: data/bandadas-2024.json (scripts/bandadas.mjs), el mismo
// archivo que usa el servo.
//
// Estilo «ilustración» (como el mundo InStep): luz en tres bandas (shared.uToon), contorno de tinta en aves y
// vegetación, cielo en degradé y sombra de contacto bajo cada ave.
/* global THREE */
import { shared, mat, makeTex, texPlain, mulberry32 } from './ps1.js';
import { buildScene, COVER_RGB, SCENE_DENSITY, WORLD } from './scene.js';
import { MAX_RELIEF } from './scale.js';
import { BirdAgent } from './aviary.js';

export const MONTH_SECS = 6;
export const YEAR_SECS = MONTH_SECS * 12;
const GAP = 0; // zonas unidas en un solo terreno continuo (sin parches separados)
const RELIEF_BOOST = 2.6; // más volumen vertical al relieve para que se lea desde la torre
const BOARD_DENSITY = 0.4; // menos vegetación que en Explorar: desde la torre no debe tapar las aves
// Aves exageradas (a su escala no se verían desde la torre), pero sin perder la proporción: el largo final crece
// más lento que el real, así una gaviota sigue siendo más grande que un chincol sin volverse un gigante.
const BIRD_LEN = 2.1, BIRD_LEN_REF = 0.3, BIRD_LEN_POW = 0.35; // m que mide un ave de 0,3 m · cuánto se comprime
const FLYBY_EVERY = [2.5, 5];
// s desde el comienzo del mes en que sale cada oleada migratoria (mes de 6 s)
const WAVE = { llega: { verano: 0.3, residente: 0.9, invierno: 1.5 }, seVa: { verano: 3.2, residente: 3.6, invierno: 4.0 } }; // s entre pasadas de un ave cerca de la torre
const PER_SPECIES = { residente: 1, verano: 2, invierno: 2 }; // aves por especie si se registró todos los días
const MAX_BIRDS = 110; // tope de aves en escena (rendimiento en el teléfono)
const INK = new THREE.Color(0x1b1611);
const MARGIN = 16; // m de tablero alrededor de las zonas: ahí van los nombres pintados
// Qué hay alrededor de la maqueta en cada región (x+ = este, x− = oeste): la cordillera de los Andes y el mar
// donde corresponden. En Magallanes los Andes quedan al oeste y el mar (estrecho) al este.
const SURROUND = {
  'CL-AP': { east: 'andes', west: 'mar', ground: 0xc9a46a, snow: 0.82 },
  'CL-VS': { east: 'andes', west: 'mar', ground: 0xa7a35f, snow: 0.6 },
  'CL-RM': { east: 'andes', west: 'cerros', ground: 0xa7a35f, snow: 0.55 },
  'CL-LR': { east: 'andes', west: 'mar', ground: 0x6f9a4e, snow: 0.5 },
  'CL-MA': { east: 'mar', west: 'andes', ground: 0x9aa36a, snow: 0.35 },
};
const CLASS_INK = { residente: 0x288665, verano: 0xee9b45, invierno: 0x4a7fd0 }; // contorno de cada ave: el color de su clase

// ---------------------------------------------------------------------------- contorno de tinta
// Casco invertido: la misma malla, inflada hacia afuera en espacio de vista y pintada de tinta por detrás.
// El grosor crece con la distancia pero con tope máximo (uMax) para no comerse la silueta de las aves desde lejos.
const outlineMat = ink => new THREE.ShaderMaterial({
  uniforms: {
    uThick: { value: ink === INK ? 0.0012 : 0.0010 },
    uMax: { value: ink === INK ? 0.2 : 0.11 },
    uInk: { value: new THREE.Color(ink) }, uFogColor: shared.uFogColor, uFogNear: shared.uFogNear, uFogFar: shared.uFogFar,
  },
  vertexShader: `
    uniform float uThick; uniform float uMax; uniform float uFogNear; uniform float uFogFar; varying float vFog;
    void main() {
      vec4 local = vec4(position, 1.0); vec3 nrm = normal;
      #ifdef USE_INSTANCING
        local = instanceMatrix * local; nrm = mat3(instanceMatrix) * nrm;
      #endif
      vec4 mv = modelViewMatrix * local;
      vec3 n = normalize(normalMatrix * nrm);
      mv.xyz += n * min(uThick * -mv.z, uMax);
      vFog = clamp((-mv.z - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform vec3 uInk; uniform vec3 uFogColor; varying float vFog;
    void main() { gl_FragColor = vec4(mix(uInk, uFogColor, vFog * 0.85), 1.0); }`,
  side: THREE.BackSide,
});
const INK_MAT = outlineMat(INK), CLASS_MAT = Object.fromEntries(Object.entries(CLASS_INK).map(([k, c]) => [k, outlineMat(c)]));
function inkOutline(obj, mat = INK_MAT) {
  const add = [];
  obj.traverse(o => {
    if (!o.isMesh || o.userData.ink || o.userData.noInk || o.material?.visible === false || !o.geometry?.attributes.normal) return;
    // omitir tarjetas con transparencia/alfa (bordes de hojas, pasto, flores) y cascos ya invertidos:
    // un casco BackSide opaco detrás de un quad con alfa dibuja cuadrados negros sólidos
    if (o.material?.uniforms?.uAlphaMode?.value > 0.5 || o.material?.transparent || o.material?.alphaTest > 0 || o.material?.side === THREE.BackSide) return;
    let ink;
    if (o.isInstancedMesh) { ink = new THREE.InstancedMesh(o.geometry, mat, o.count); ink.instanceMatrix = o.instanceMatrix; }
    else ink = new THREE.Mesh(o.geometry, mat);
    ink.userData.ink = true; ink.frustumCulled = o.frustumCulled; ink.renderOrder = -1;
    add.push([o, ink]);
  });
  for (const [o, ink] of add) o.add(ink);
}

// ---------------------------------------------------------------------------- cielo
function skyDome() {
  const m = new THREE.ShaderMaterial({
    uniforms: { uTop: { value: new THREE.Color(0x8ec5ea) }, uHorizon: shared.uFogColor },
    vertexShader: 'varying float vY; void main() { vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uTop; uniform vec3 uHorizon; varying float vY; void main() { gl_FragColor = vec4(mix(uHorizon, uTop, smoothstep(-0.05, 0.55, vY)), 1.0); }',
    side: THREE.BackSide, depthWrite: false,
  });
  const s = new THREE.Mesh(new THREE.SphereGeometry(2600, 24, 12), m);
  s.renderOrder = -10; s.frustumCulled = false;
  return s;
}

// Sombra de contacto: un disco oscuro y suave bajo cada ave (más barato que sombras reales en el teléfono).
const blobTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  r.addColorStop(0, 'rgba(27,22,17,0.45)'); r.addColorStop(1, 'rgba(27,22,17,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });

// ---------------------------------------------------------------------------- nombres en el suelo
const SCENE_LABEL = { ciudad: 'Ciudad', matorral: 'Matorral', rio: 'Río', cordillera: 'Cordillera', costa: 'Costa',
  humedal: 'Humedal', desierto: 'Desierto', valle: 'Valle', altiplano: 'Altiplano', bosque: 'Bosque', lago: 'Lago',
  pradera: 'Pradera', fiordo: 'Fiordo', estepa: 'Estepa', bofedal: 'Bofedal' };
// Etiqueta discreta estilo mapa topográfico: informa el hábitat sin competir con el paisaje.
function groundLabel(text, x, y, z, north) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.font = '600 54px Kalam, "Baloo 2", cursive'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(243,232,207,0.58)'; g.strokeText(text.toUpperCase(), 256, 48);
  g.fillStyle = 'rgba(27,22,17,0.52)'; g.fillText(text.toUpperCase(), 256, 48);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(WORLD * 0.34, WORLD * 0.064), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; if (!north) m.rotation.z = Math.PI; // se lee derecho mirando desde la torre, al centro
  m.position.set(x, y, z); m.renderOrder = 2;
  return m;
}

// ---------------------------------------------------------------------------- el paisaje alrededor
// Suelo continuo con el mismo grano que las zonas, abrazado de cerca por la cordillera, el mar con costa
// orgánica o los cerros costeros, y estribaciones al norte y al sur para cerrar los 360°.
const toLin = c => new THREE.Color(c.r ** 2.2, c.g ** 2.2, c.b ** 2.2);
function surround(cfg, W, D, y, seed) {
  const g = new THREE.Group(), R = mulberry32([...seed].reduce((a, c) => a * 31 + c.charCodeAt(0), 3) >>> 0);
  const far = 2200;
  // mismo grano de suelo que las zonas para que no haya corte de textura en el perímetro
  const detail = makeTex(32, 32, (x, yy) => {
    const blade = (x * 7 + yy * 3) % 11 === 0 || (x * 3 + yy * 5) % 13 === 0;
    const v = 128 + (R() - 0.5) * 34 + (blade ? -26 : 0) + ((x >> 3) + (yy >> 3)) % 2 * 6;
    return [v, v, v];
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(far * 2, far * 2).rotateX(-Math.PI / 2),
    mat(texPlain(), { tint: cfg.ground, detail, detailRep: far, detailAmt: 0.65 }));
  ground.position.y = y; g.add(ground);
  const gLin = toLin(new THREE.Color(cfg.ground));
  const seaSide = cfg.east === 'mar' ? 1 : cfg.west === 'mar' ? -1 : 0;
  for (const [side, kind] of [[1, cfg.east], [-1, cfg.west]]) {
    if (kind === 'mar') g.add(ocean(side, W, y, R, far));
    else g.add(ridge(side, kind === 'andes' ? cfg.snow : 1.1, kind === 'andes' ? 1.2 : 0.46, W, y, R, far, gLin, kind !== 'andes'));
  }
  for (const zSide of [-1, 1]) g.add(crossRidge(zSide, cfg, W, D, y, R, far, seaSide, gLin));
  return g;
}
// Mar con línea de costa ondulada, franja de arena y oleaje sutil hacia el horizonte.
function ocean(side, W, y, R, far) {
  const g = new THREE.Group(), nz = 120, xBase = W / 2 + 10;
  const ph = [R() * 6.28, R() * 6.28];
  const coastX = z => xBase + Math.sin(z * 0.015 + ph[0]) * 7 + Math.sin(z * 0.037 + ph[1]) * 3.5;
  const waveTex = makeTex(32, 32, (x, yy) => {
    const foam = (x * 3 + yy * 5) % 19 === 0 || (x + yy * 7) % 23 === 0;
    return foam ? [232, 242, 248] : [206, 218, 226];
  });
  const strip = (off0, off1, dy, tint, tex = texPlain(), rx = 1, ry = 1) => {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= nz; i++) {
      const z = -far + (2 * far) * i / nz, cx = coastX(z);
      pos.push(side * (cx + off0), y + dy, z, side * (cx + off1), y + dy, z);
      uv.push(0, z * 0.02, (off1 - off0) * 0.02, z * 0.02);
      if (i < nz) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        if (side > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    return new THREE.Mesh(geo, mat(tex, { tint, rx, ry }));
  };
  g.add(strip(-9, 8, 0.14, 0xe4d2a1));                          // playa arenosa
  const shallow = strip(6, 36, 0.22, 0x62a9c2, waveTex, 0.5, 0.5); // costa somera turquesa con espuma
  const open = strip(32, far, 0.28, 0x3b78ae, waveTex, 0.3, 0.3);  // mar abierto hasta el horizonte
  g.add(shallow, open);
  // oleaje: la textura corre hacia la costa (la somera más rápido) y la orilla sube y baja como una ola
  const beachY = shallow.position.y;
  g.userData.animate = t => {
    shallow.material.uniforms.uOffset.value.set(-side * t * 0.05 + Math.sin(t * 0.7) * 0.04, Math.sin(t * 0.3) * 0.05);
    open.material.uniforms.uOffset.value.set(-side * t * 0.012, t * 0.006);
    shallow.position.y = beachY + Math.sin(t * 1.1) * 0.05;
    shallow.position.x = side * Math.sin(t * 1.1) * 1.6; // la ola avanza y retrocede sobre la arena
  };
  return g;
}
// Una cordillera en franjas: la base nace con el color del suelo y transiciona a roca y nieve.
function ridge(side, snowAt, scale, W, y, R, far, gLin, coastal = false) {
  // baja (42 m por escala, antes 165): desde la torre se ve entera, con cielo detrás, en la primera mirada
  const nz = 150, nx = 14, x0 = W / 2 + (coastal ? 30 : 95), depth = 220 * scale + 110, H = 42 * scale;
  const uv = [];
  const pos = [], col = [], idx = [];
  const ph = [...Array(4)].map(() => R() * 6.28);
  const crest = i => 0.62 + 0.22 * Math.sin(i * 0.14 + ph[0]) + 0.12 * Math.sin(i * 0.41 + ph[1]) + 0.06 * Math.sin(i * 0.95 + ph[2]);
  const rock = new THREE.Color(coastal ? 0x4b5338 : 0x3a3029), rock2 = new THREE.Color(coastal ? 0x3c4248 : 0x2a3140), snow = new THREE.Color(0xf6f3ec), c = new THREE.Color();
  for (let i = 0; i <= nz; i++) for (let j = 0; j <= nx; j++) {
    const u = j / nx, z = -far + (2 * far) * i / nz;
    const prof = u < 0.35 ? Math.sin(Math.PI / 2 * u / 0.35) ** 1.25 : 1 - 0.35 * (u - 0.35) / 0.65;
    const h = H * crest(i) * prof * (0.85 + 0.3 * R()) * (j === 0 ? 0 : 1);
    pos.push(side * (x0 + u * depth), y + h, z);
    uv.push(z / 26, h / 9); // estratos horizontales y grietas de la textura de roca
    c.copy(rock).lerp(rock2, u * 0.8);
    if ((i + j) % 3 === 0) c.multiplyScalar(0.8); // quebradas más oscuras entre caras vecinas
    if (j <= 1) c.lerp(gLin, 1 - j / 1.6); // transición corta desde el suelo exterior hacia la ladera
    if (h / H > snowAt - 0.08 + 0.1 * Math.sin(i * 1.7 + j * 2.3)) c.copy(snow); // línea de nieve irregular
    col.push(c.r, c.g, c.b);
  }
  for (let i = 0; i < nz; i++) for (let j = 0; j < nx; j++) {
    const a = i * (nx + 1) + j, b = a + 1, d = a + nx + 1, e = d + 1;
    if (side > 0) idx.push(a, d, b, b, d, e); else idx.push(a, b, d, b, e, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const flat = geo.toNonIndexed(); flat.computeVertexNormals();
  return new THREE.Mesh(flat, mat(texPlain(), { vcol: 1, twoSided: true, detail: rockTex(R), detailRep: 1, detailAmt: 0.55 }));
}
// Textura de roca para la cordillera: estratos horizontales, grietas en diagonal y granos de piedra.
function rockTex(R) {
  return makeTex(64, 64, (x, yy) => {
    const strata = (yy % 9 < 2) ? -22 : (yy % 9 === 4 ? 10 : 0);
    const crack = ((x + yy * 2) % 23 === 0 || (x * 2 - yy + 64) % 31 === 0) ? -34 : 0;
    const v = 128 + strata + crack + (R() - 0.5) * 26;
    return [v, v, v];
  });
}
// Cordones al norte y al sur: nacen del suelo, suben hacia los Andes y desaparecen al llegar al mar.
function crossRidge(zSide, cfg, W, D, y, R, far, seaSide, gLin) {
  const nx = 90, nz = 10, z0 = D / 2 + 60, depth = 260, H = 38;
  const pos = [], col = [], idx = [];
  const ph = [R() * 6.28, R() * 6.28];
  const andesSide = cfg.east === 'andes' ? 1 : -1;
  const rock = new THREE.Color(0x474238), rock2 = new THREE.Color(0x323a46), snow = new THREE.Color(0xf6f3ec), c = new THREE.Color();
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const x = -far * 0.7 + (1.4 * far) * i / nx, u = j / nz;
    const prof = u < 0.35 ? Math.sin(Math.PI / 2 * u / 0.35) ** 1.3 : 1 - 0.4 * (u - 0.35) / 0.65;
    let seaFade = 1;
    if (seaSide !== 0) {
      const distFromCoast = (seaSide * (W / 2 + 10) - x) * seaSide;
      seaFade = Math.max(0, Math.min(1, (distFromCoast + 12) / 95));
    }
    const andesBoost = 0.55 + 0.55 * Math.max(0, Math.min(1, (x * andesSide + 120) / 360));
    const wave = 0.65 + 0.22 * Math.sin(i * 0.21 + ph[0]) + 0.13 * Math.sin(i * 0.57 + ph[1]);
    const h = H * wave * prof * seaFade * andesBoost * (0.88 + 0.24 * R()) * (j === 0 ? 0 : 1);
    pos.push(x, y + h, zSide * (z0 + u * depth));
    c.copy(rock).lerp(rock2, u * 0.75);
    if (j <= 2 || seaFade < 0.4) c.lerp(gLin, Math.max(j <= 2 ? 1 - j / 2.6 : 0, 1 - seaFade / 0.4));
    if (h / (H * 1.1) > cfg.snow + 0.1) c.copy(snow);
    col.push(c.r, c.g, c.b);
  }
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const a = i * (nz + 1) + j, b = a + 1, d = a + nz + 1, e = d + 1;
    if (zSide > 0) idx.push(a, b, d, b, e, d); else idx.push(a, d, b, b, d, e);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pos.length / 3 * 2).fill(0.5), 2));
  geo.setIndex(idx);
  const flat = geo.toNonIndexed(); flat.computeVertexNormals();
  return new THREE.Mesh(flat, mat(texPlain(), { vcol: 1, twoSided: true }));
}

// ---------------------------------------------------------------------------- aves
class FlockBird extends BirdAgent {
  // llega desde el borde norte (−z) o sur (+z) de su zona, alto, y se posa en un lugar de su hábitat
  arriveFrom(side) {
    const dest = this.choosePlace(), h = this.scene.half;
    this.pos.set((Math.random() - 0.5) * h * 1.6, dest.y + 16 + Math.random() * 8, side * h * 2.2);
    this.leaving = false; this.gone = false; this.migrating = true; // migrando hasta que se posa
    this.fly(dest, 3.6 + Math.random() * 0.8);
  }
  leaveTo(side) {
    if (this.leaving) return;
    this.leaving = true; this.perch = null; this.swimming = false; this.migrating = true;
    const h = this.scene.half;
    this.fly(new THREE.Vector3(this.pos.x + (Math.random() - 0.5) * 20, this.pos.y + 18, side * h * 2.4), 3.8 + Math.random() * 0.6);
  }
  // pasar volando cerca de la torre (p, en coordenadas de su zona) y volver a posarse
  flyby(p) {
    this.perch = null; this.swimming = false; this.onTrunk = null;
    this.afterFly = 'back';
    this.fly(p, 2.4 + Math.random() * 0.8);
  }
  setState(s, dur) {
    if (s !== 'fly' && !this.leaving) this.migrating = false; // ya se posó
    if (s === 'idle' && this.afterFly === 'back' && !this.leaving) { this.afterFly = null; return this.fly(this.choosePlace(), 2.6 + Math.random()); }
    return super.setState(s, dur);
  }
}

// En qué zona vive cada especie: la de su hábitat (biomas de AVONET) que exista en la región; si no hay, la de
// la especie destacada; si tampoco, las acuáticas van a la zona con más agua y el resto se reparte.
function zoneFor(sp, keys, featured, waterOf) {
  const biomes = sp.habitat?.biomes || [];
  const match = keys.filter(k => biomes.includes(k));
  if (match.length) return match[sp.id % match.length];
  if (featured[sp.id]?.scene && keys.includes(featured[sp.id].scene)) return featured[sp.id].scene;
  if (/Marine|Riverine|Wetland/.test(sp.habitat?.avonet || '')) return [...keys].sort((a, b) => waterOf[b] - waterOf[a])[0];
  return keys[sp.id % keys.length];
}

// Color promedio del suelo de una zona (para difuminar suavemente las costuras entre zonas vecinas).
function avgCoverRgb(cover) {
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < cover.length; i++) {
    const p = (COVER_RGB[cover[i]] || COVER_RGB[5])[0];
    r += p[0]; g += p[1]; b += p[2];
  }
  const n = Math.max(1, cover.length);
  return [r / n, g / n, b / n];
}

// Precalcula las alturas de todas las zonas con mayor relieve, empata los bordes donde se tocan
// dos zonas vecinas y baja suavemente el perímetro exterior hacia y = 0 para fundirlo con el paisaje.
function stitchZones(items) {
  const BLEND = 7, OUTER = 6;
  const smooth = (d, lim) => 0.5 * (1 + Math.cos(Math.PI * d / lim));
  for (const it of items) {
    const data = it.data, n = data.height.length ** 0.5 | 0;
    const cell = WORLD / n, unitPerM = cell / data.cellM, range = data.hMax - data.hMin;
    const vex = Math.min(1.3 * RELIEF_BOOST, (MAX_RELIEF * RELIEF_BOOST) / Math.max(1, range * unitPerM));
    it.n = n;
    it.H = data.height.map(h => h * unitPerM * vex);
    it.avgRgb = avgCoverRgb(data.cover);
    it.shared = { L: new Uint8Array(n), R: new Uint8Array(n), T: new Uint8Array(n), B: new Uint8Array(n) };
    it.nb = { L: null, R: null, T: null, B: null };
  }
  // 1) Costuras horizontales (derecha de A ↔ izquierda de B)
  for (const A of items) for (const B of items) {
    if (Math.abs(B.x - A.x - WORLD) > 0.1 || Math.abs(B.z - A.z) > 0.1) continue;
    const n = A.n;
    A.nb.R = B.avgRgb; B.nb.L = A.avgRgb;
    for (let r = 0; r < n; r++) {
      A.shared.R[r] = 1; B.shared.L[r] = 1;
      const mid = 0.5 * (A.H[r * n + n - 1] + B.H[r * n]);
      for (let d = 0; d < BLEND; d++) {
        const w = smooth(d, BLEND);
        A.H[r * n + n - 1 - d] = A.H[r * n + n - 1 - d] * (1 - w) + mid * w;
        B.H[r * n + d] = B.H[r * n + d] * (1 - w) + mid * w;
      }
    }
  }
  // 2) Costuras verticales (abajo de A ↔ arriba de B, incluso cuando la fila inferior está centrada)
  for (const A of items) for (const B of items) {
    if (Math.abs(B.z - A.z - WORLD) > 0.1 || Math.abs(B.x - A.x) >= WORLD - 0.1) continue;
    const n = A.n, dx = WORLD / (n - 1);
    A.nb.B = B.avgRgb; B.nb.T = A.avgRgb;
    for (let cA = 0; cA < n; cA++) {
      const wx = A.x - WORLD / 2 + cA * dx;
      const cB = Math.round((wx - (B.x - WORLD / 2)) / dx);
      if (cB < 0 || cB >= n) continue;
      A.shared.B[cA] = 1; B.shared.T[cB] = 1;
      const mid = 0.5 * (A.H[(n - 1) * n + cA] + B.H[cB]);
      for (let d = 0; d < BLEND; d++) {
        const w = smooth(d, BLEND);
        A.H[(n - 1 - d) * n + cA] = A.H[(n - 1 - d) * n + cA] * (1 - w) + mid * w;
        B.H[d * n + cB] = B.H[d * n + cB] * (1 - w) + mid * w;
      }
    }
  }
  // 3) Perímetro exterior: baja suavemente hasta y = 0 para fundirse con el terreno alrededor
  for (const it of items) {
    const n = it.n, sh = it.shared;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      let k = 1;
      if (!sh.L[r] && c < OUTER) k = Math.min(k, 1 - smooth(c, OUTER));
      if (!sh.R[r] && n - 1 - c < OUTER) k = Math.min(k, 1 - smooth(n - 1 - c, OUTER));
      if (!sh.T[c] && r < OUTER) k = Math.min(k, 1 - smooth(r, OUTER));
      if (!sh.B[c] && n - 1 - r < OUTER) k = Math.min(k, 1 - smooth(n - 1 - r, OUTER));
      if (k < 1) it.H[r * n + c] *= k;
    }
  }
}

// ---------------------------------------------------------------------------- la maqueta de la región
export function buildBoard({ index, reg, props, bandadas }) {
  const region = bandadas.regions.find(r => r.code === reg.meta.code);
  const keys = Object.keys(reg.terrain.scenes);
  const root = new THREE.Group();
  root.add(skyDome());

  // zonas unidas en un solo terreno continuo (2 columnas; si hay 3 zonas, la tercera centrada abajo)
  const step = WORLD + GAP, cols = 2, rows = Math.ceil(keys.length / cols);
  const layout = keys.map((key, i) => {
    const r = Math.floor(i / cols), inRow = Math.min(cols, keys.length - r * cols), c = i % cols;
    return { key, x: (c - (inRow - 1) / 2) * step, z: (r - (rows - 1) / 2) * step, data: reg.terrain.scenes[key] };
  });
  stitchZones(layout);
  const sCfg = SURROUND[reg.meta.code] || SURROUND['CL-RM'];
  const surroundRgb = [(sCfg.ground >> 16) & 255, (sCfg.ground >> 8) & 255, sCfg.ground & 255];
  const saved = { ...SCENE_DENSITY };
  for (const k of keys) SCENE_DENSITY[k] = (SCENE_DENSITY[k] ?? 1) * BOARD_DENSITY;
  const zones = layout.map(it => {
    const sc = buildScene(it.key, it.data, props, [], 20, reg.meta.lat < -44, {
      reliefBoost: RELIEF_BOOST, heightY: it.H, edgeBlend: { surroundRgb, shared: it.shared, nb: it.nb },
    });
    const g = new THREE.Group(); g.position.set(it.x, 0, it.z);
    g.add(sc.root);
    for (const o of sc.root.children) if (o.isInstancedMesh) inkOutline(o); // contorno a la vegetación y casas
    if (sc.water) sc.water.scale.set(1 / 1.6, 1, 1 / 1.6); // el mar de cada zona, solo dentro de su cuadro
    root.add(g);
    return { key: it.key, sc, g, name: it.data.name, water: sc.waterSpots.length };
  });
  Object.assign(SCENE_DENSITY, saved);
  // sin rectángulo de cartón: el terreno unido baja suavemente y se funde con el paisaje alrededor
  const W = cols * step - GAP, D = rows * step - GAP;
  // etiquetas discretas junto al borde exterior de cada zona
  for (const z of zones) {
    const north = z.g.position.z < 0 || (rows === 1);
    root.add(groundLabel(SCENE_LABEL[z.key] || z.key, z.g.position.x, 0.12, z.g.position.z + (north ? -1 : 1) * (WORLD / 2 + 4.5), north));
  }
  const around = surround(sCfg, W, D, -0.06, reg.meta.code);
  root.add(around);
  const anims = []; around.traverse(o => o.userData.animate && anims.push(o.userData.animate)); // el mar

  const center = new THREE.Vector3(0, 2, 0);
  // altura de la torre: TOWER_H m sobre el punto más alto del cruce de las zonas (el centro de la maqueta)
  const TOWER_H = 26;
  const towerY = TOWER_H + Math.max(...zones.map(z => z.sc.heightAt(-Math.sign(z.g.position.x) * 4, -Math.sign(z.g.position.z) * 4) + z.g.position.y));
  const radius = Math.hypot(W + MARGIN, D + MARGIN) / 2;

  // especies: zona, aves por bandada y de qué lado llegan
  const waterOf = Object.fromEntries(zones.map(z => [z.key, z.water]));
  const byKey = Object.fromEntries(zones.map(z => [z.key, z]));
  const info = new Map();
  for (const m of region.months) for (const e of m.especies) {
    const o = info.get(e.id) || { clase: e.clase, peak: 0 };
    o.peak = Math.max(o.peak, e.freq); info.set(e.id, o);
  }
  const flocks = new Map();
  let total = 0;
  // primero las visitantes (son las que cuentan la historia), luego las residentes más frecuentes
  const order = [...info.entries()].sort(([, a], [, b]) => (a.clase === 'residente') - (b.clase === 'residente') || b.peak - a.peak);
  for (const [id, { clase, peak }] of order) {
    const sp = index.byId.get(id);
    if (!sp) continue;
    const n = Math.max(1, Math.round(peak * PER_SPECIES[clase]));
    if (total + n > MAX_BIRDS) continue;
    total += n;
    const zone = byKey[zoneFor(sp, keys, reg.region.featured || {}, waterOf)];
    flocks.set(id, { sp, clase, zone, n, peak, birds: [], side: clase === 'invierno' ? 1 : clase === 'verano' ? -1 : (id % 2 ? 1 : -1) });
  }

  function spawn(f) {
    const b = new FlockBird(f.sp, f.zone.sc, reg.meta.id);
    const len = b.s * 3.6, zoom = BIRD_LEN * (len / BIRD_LEN_REF) ** BIRD_LEN_POW / len; // 3,6 = largo del modelo a escala 1
    b.m.group.scale.multiplyScalar(zoom); b.s *= zoom;
    inkOutline(b.m.group, CLASS_MAT[f.clase]);
    b.blob = new THREE.Mesh(blobGeo, blobMat); b.blob.renderOrder = 1;
    f.zone.g.add(b.m.group, b.blob);
    return b;
  }

  let month = -1, t = 0, acc = 0, nextFly = 3;
  let flybyEvents = [];
  const _c = new THREE.Vector3();
  function setMonth(mi, instant) {
    month = mi;
    const now = new Set(region.months[mi].especies.map(e => e.id));
    const events = [];
    for (const f of flocks.values()) {
      const here = now.has(f.sp.id), active = f.birds.filter(b => !b.leaving);
      if (here && !active.length) {
        // Oleadas: todas las que llegan de la misma clase salen juntas desde su borde (verano desde el norte al
        // comienzo del mes, invierno desde el sur un poco después), así se ve la migración como un movimiento.
        const delay = instant ? 0 : WAVE.llega[f.clase] + Math.random() * 0.35;
        for (let i = 0; i < f.n; i++) {
          const b = spawn(f); f.birds.push(b);
          if (instant) { const p = b.choosePlace(); b.pos.copy(p); b.setState('idle', Math.random() * 2); b.pose(p.y); }
          else { b.pos.set(0, -999, 0); b.setState('wait', 99); b.pose(-999); b.wake = delay + i * 0.12; }
        }
        if (!instant) events.push({ type: 'llega', f, delay });
      } else if (!here && active.length) {
        const delay = WAVE.seVa[f.clase] + Math.random() * 0.35;
        for (const b of active) b.leaveAt = delay + Math.random() * 0.25;
        events.push({ type: 'se va', f, delay });
      }
    }
    return events;
  }

  function update(dt, cam, fwd) {
    t = (t + dt) % YEAR_SECS;
    const mi = Math.floor(t / MONTH_SECS);
    const events = mi !== month ? setMonth(mi, false) : [];
    flybyEvents = [];
    for (const f of flocks.values()) for (const b of f.birds) {
      if (b.wake != null && (b.wake -= dt) <= 0) { b.wake = null; b.arriveFrom(f.side); }
      if (b.leaveAt != null && (b.leaveAt -= dt) <= 0) { b.leaveAt = null; b.leaveTo(f.side); }
    }
    // de vez en cuando un ave posada sale volando, pasa cerca de la torre y vuelve
    if (cam && (nextFly -= dt) <= 0) {
      nextFly = FLYBY_EVERY[0] + Math.random() * (FLYBY_EVERY[1] - FLYBY_EVERY[0]);
      const pool = [...flocks.values()].flatMap(f => f.birds).filter(b => !b.leaving && b.state !== 'wait' && b.state !== 'fly' && !b.traits.noFly);
      const b = pool[(Math.random() * pool.length) | 0];
      if (b) {
        const z = b.scene === undefined ? null : zones.find(z => z.sc === b.scene);
        // delante de la vista, a 12–22 m de la torre y algo corrida a un lado: pasa frente a quien mira
        _c.copy(cam).addScaledVector(fwd || _c.set(0, 0, -1), 12 + Math.random() * 10);
        _c.x += (Math.random() - 0.5) * 10; _c.y -= 2 + Math.random() * 3;
        b.flyby(_c.sub(z.g.position).clone());
        const fl = [...flocks.values()].find(f => f.birds.includes(b));
        if (fl) flybyEvents.push({ type: 'cerca', f: fl, delay: 2 }); // pasa junto a la torre ~2 s después
      }
    }
    acc += dt; // aves a 15 Hz, como en el Aviario
    for (let n = 0; acc >= 1 / 15 && n < 4; n++, acc -= 1 / 15) for (const f of flocks.values()) for (const b of f.birds) if (b.state !== 'wait') b.sim(1 / 15);
    for (const f of flocks.values()) {
      for (const b of f.birds) {
        if (b.gone) { f.zone.g.remove(b.m.group, b.blob); continue; }
        const gy = f.zone.sc.heightAt(b.pos.x, b.pos.z), y = b.m.group.position.y, lift = Math.max(0, y - gy);
        b.blob.position.set(b.pos.x, (b.swimming ? y : gy) + 0.06, b.pos.z);
        b.blob.visible = b.state !== 'wait' && lift < 25;
        b.blob.scale.setScalar(1.6 * b.s * (1 + lift * 0.04));
      }
      f.birds = f.birds.filter(b => !b.gone);
    }
    const shown = region.months[mi].especies.reduce((acc, e) => acc + (flocks.has(e.id) ? 1 : 0), 0);
    return { month: mi, progress: t / YEAR_SECS, events: events.concat(flybyEvents), shown, migrants: migrants() };
  }

  // Cuántas aves migrando (llegando o yéndose) vuelan sobre cada zona ahora: la vibración sigue a la bandada
  // por el tablero, de la zona de entrada a la de destino.
  const _w = new THREE.Vector3();
  function migrants() {
    const n = zones.map(() => 0), h = WORLD / 2;
    for (const f of flocks.values()) for (const b of f.birds) {
      if (!b.migrating || b.state !== 'fly') continue;
      b.m.group.getWorldPosition(_w);
      const i = zones.findIndex(z => Math.abs(_w.x - z.g.position.x) <= h && Math.abs(_w.z - z.g.position.z) <= h);
      if (i >= 0) n[i]++;
    }
    return n;
  }

  function reset() { // el año empieza con las de enero ya posadas
    for (const f of flocks.values()) { for (const b of f.birds) f.zone.g.remove(b.m.group, b.blob); f.birds = []; }
    t = 0; month = -1; setMonth(0, true); month = 0;
  }
  reset();

  const animate = time => { for (const z of zones) z.sc.animate?.(time); for (const f of anims) f(time); };
  const dispose = () => root.traverse(o => { if (!o.userData.ink) o.geometry?.dispose(); });
  const birds = () => [...flocks.values()].reduce((a, f) => a + f.birds.length, 0);
  return { root, zones, months: region.months, center, radius, towerY, update, reset, animate, dispose, birds, flocks };
}

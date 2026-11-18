// Vista inmersiva: el año 2024 de una región pasa en 72 s (6 s por mes) sobre una maqueta con todas sus zonas,
// vista desde una torre. Cada especie registrada ese mes en la región es una bandada de su propio modelo (el del
// Aviario): llega volando (las de verano desde el norte, las de invierno desde el sur), se posa en la zona de su
// hábitat y se va cuando deja de registrarse. Datos: data/bandadas-2024.json (scripts/bandadas.mjs), el mismo
// archivo que usa el servo.
//
// Estilo «ilustración» (como el mundo InStep): luz en tres bandas (shared.uToon), contorno de tinta en aves y
// vegetación, cielo en degradé y sombra de contacto bajo cada ave.
/* global THREE */
import { shared, mat, texPlain, mulberry32 } from './ps1.js';
import { buildScene, SCENE_DENSITY, WORLD } from './scene.js';
import { BirdAgent } from './aviary.js';

export const MONTH_SECS = 6;
export const YEAR_SECS = MONTH_SECS * 12;
const GAP = 10; // m entre zonas de la maqueta
const BOARD_DENSITY = 0.4; // menos vegetación que en Explorar: desde la torre no debe tapar las aves
// Aves exageradas (a su escala no se verían desde la torre), pero sin perder la proporción: el largo final crece
// más lento que el real, así una gaviota sigue siendo más grande que un chincol sin volverse un gigante.
const BIRD_LEN = 2.1, BIRD_LEN_REF = 0.3, BIRD_LEN_POW = 0.35; // m que mide un ave de 0,3 m · cuánto se comprime
const FLYBY_EVERY = [2.5, 5]; // s entre pasadas de un ave cerca de la torre
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
// El grosor es proporcional a la distancia, así se ve igual de ancho en pantalla.
const outlineMat = ink => new THREE.ShaderMaterial({
  uniforms: { uThick: { value: ink === INK ? 0.0014 : 0.0024 }, uInk: { value: new THREE.Color(ink) }, uFogColor: shared.uFogColor, uFogNear: shared.uFogNear, uFogFar: shared.uFogFar },
  vertexShader: `
    uniform float uThick; uniform float uFogNear; uniform float uFogFar; varying float vFog;
    void main() {
      vec4 local = vec4(position, 1.0); vec3 nrm = normal;
      #ifdef USE_INSTANCING
        local = instanceMatrix * local; nrm = mat3(instanceMatrix) * nrm;
      #endif
      vec4 mv = modelViewMatrix * local;
      vec3 n = normalize(normalMatrix * nrm);
      mv.xyz += n * uThick * -mv.z;
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
    if (!o.isMesh || o.userData.ink || o.material?.visible === false || !o.geometry?.attributes.normal) return;
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
// Texto pintado sobre el tablero: se lee derecho desde afuera de la maqueta (north = en el borde norte).
function groundLabel(text, x, y, z, north) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 192;
  const g = c.getContext('2d');
  g.font = '700 132px Kalam, "Baloo 2", cursive'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = '#f3e8cf'; g.strokeText(text.toUpperCase(), 512, 100);
  g.fillStyle = '#1b1611'; g.fillText(text.toUpperCase(), 512, 100);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(WORLD * 0.8, WORLD * 0.15), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; if (north) m.rotation.z = Math.PI; // de cara a quien mira desde ese lado
  m.position.set(x, y, z); m.renderOrder = 2;
  return m;
}

// ---------------------------------------------------------------------------- el paisaje alrededor
// Un suelo que sigue hasta el horizonte, la cordillera al este (o al oeste en Magallanes) y el mar o cerros
// costeros al otro lado. Lejos y con niebla: completa la vista sin competir con la maqueta.
function surround(cfg, W, D, y, seed) {
  const g = new THREE.Group(), R = mulberry32([...seed].reduce((a, c) => a * 31 + c.charCodeAt(0), 3) >>> 0);
  const far = 2200;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(far * 2, far * 2).rotateX(-Math.PI / 2), mat(texPlain(), { tint: cfg.ground }));
  ground.position.y = y; g.add(ground);
  for (const [side, kind] of [[1, cfg.east], [-1, cfg.west]]) {
    if (kind === 'mar') {
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(far, far * 2).rotateX(-Math.PI / 2), mat(texPlain(), { tint: 0x3f7fb5 }));
      sea.position.set(side * (W / 2 + 70 + far / 2), y + 0.3, 0); g.add(sea);
      const beach = new THREE.Mesh(new THREE.PlaneGeometry(26, far * 2).rotateX(-Math.PI / 2), mat(texPlain(), { tint: 0xe6d3a0 }));
      beach.position.set(side * (W / 2 + 57), y + 0.2, 0); g.add(beach);
    } else g.add(ridge(side, kind === 'andes' ? cfg.snow : 1.1, kind === 'andes' ? 1 : 0.28, W, y, R, far));
  }
  return g;
}
// Una cordillera en franjas: picos de altura variable a lo largo de norte–sur, con nieve sobre una altura.
function ridge(side, snowAt, scale, W, y, R, far) {
  const nz = 150, nx = 12, x0 = W / 2 + 420, depth = 700 * scale + 200, H = 300 * scale;
  const pos = [], col = [], idx = [];
  // perfil de cumbres a lo largo de norte–sur: suma de ondas con fases al azar, más un ruido por vértice
  const ph = [...Array(4)].map(() => R() * 6.28);
  const crest = i => 0.62 + 0.22 * Math.sin(i * 0.11 + ph[0]) + 0.12 * Math.sin(i * 0.37 + ph[1]) + 0.06 * Math.sin(i * 0.9 + ph[2]);
  // roca oscura: el shader aclara los colores por vértice (gamma)
  const rock = new THREE.Color(0x3a3029), rock2 = new THREE.Color(0x2a3140), snow = new THREE.Color(0xf6f3ec), c = new THREE.Color();
  for (let i = 0; i <= nz; i++) for (let j = 0; j <= nx; j++) {
    const u = j / nx, z = -far + (2 * far) * i / nz;
    const prof = u < 0.45 ? Math.sin(Math.PI / 2 * u / 0.45) ** 1.6 : 1 - 0.5 * (u - 0.45) / 0.55; // sube a la cumbre y baja un poco
    const h = H * crest(i) * prof * (0.85 + 0.3 * R()) * (j === 0 ? 0 : 1);
    pos.push(side * (x0 + u * depth), y + h, z);
    c.copy(rock).lerp(rock2, u * 0.8); if (h / H > snowAt) c.copy(snow);
    col.push(c.r, c.g, c.b);
  }
  for (let i = 0; i < nz; i++) for (let j = 0; j < nx; j++) {
    const a = i * (nx + 1) + j, b = a + 1, d = a + nx + 1, e = d + 1;
    if (side > 0) idx.push(a, d, b, b, d, e); else idx.push(a, b, d, b, e, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pos.length / 3 * 2).fill(0.5), 2));
  geo.setIndex(idx);
  const flat = geo.toNonIndexed(); flat.computeVertexNormals(); // caras planas: se lee como cordillera low poly
  return new THREE.Mesh(flat, mat(texPlain(), { vcol: 1, twoSided: true }));
}

// ---------------------------------------------------------------------------- aves
class FlockBird extends BirdAgent {
  // llega desde el borde norte (−z) o sur (+z) de su zona, alto, y se posa en un lugar de su hábitat
  arriveFrom(side) {
    const dest = this.choosePlace(), h = this.scene.half;
    this.pos.set((Math.random() - 0.5) * h * 1.6, dest.y + 16 + Math.random() * 8, side * h * 2.2);
    this.leaving = false; this.gone = false;
    this.fly(dest, 3.2 + Math.random() * 1.6);
  }
  leaveTo(side) {
    if (this.leaving) return;
    this.leaving = true; this.perch = null; this.swimming = false;
    const h = this.scene.half;
    this.fly(new THREE.Vector3(this.pos.x + (Math.random() - 0.5) * 20, this.pos.y + 18, side * h * 2.4), 3.5 + Math.random());
  }
  // pasar volando cerca de la torre (p, en coordenadas de su zona) y volver a posarse
  flyby(p) {
    this.perch = null; this.swimming = false; this.onTrunk = null;
    this.afterFly = 'back';
    this.fly(p, 2.4 + Math.random() * 0.8);
  }
  setState(s, dur) {
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

// ---------------------------------------------------------------------------- la maqueta de la región
export function buildBoard({ index, reg, props, bandadas }) {
  const region = bandadas.regions.find(r => r.code === reg.meta.code);
  const keys = Object.keys(reg.terrain.scenes);
  const root = new THREE.Group();
  root.add(skyDome());

  // zonas en una grilla de 2 columnas (3 zonas: dos arriba y una al centro abajo)
  const step = WORLD + GAP, cols = 2, rows = Math.ceil(keys.length / cols);
  const saved = { ...SCENE_DENSITY };
  for (const k of keys) SCENE_DENSITY[k] = (SCENE_DENSITY[k] ?? 1) * BOARD_DENSITY;
  const zones = keys.map((key, i) => {
    const r = Math.floor(i / cols), inRow = Math.min(cols, keys.length - r * cols), c = i % cols;
    const x = (c - (inRow - 1) / 2) * step, z = (r - (rows - 1) / 2) * step;
    const sc = buildScene(key, reg.terrain.scenes[key], props, [], 20, reg.meta.lat < -44);
    const g = new THREE.Group(); g.position.set(x, 0, z);
    g.add(sc.root);
    for (const o of sc.root.children) if (o.isInstancedMesh) inkOutline(o); // contorno a la vegetación y casas
    if (sc.water) sc.water.scale.set(1 / 1.6, 1, 1 / 1.6); // el mar de cada zona, solo dentro de su cuadro (no inunda el tablero)
    root.add(g);
    return { key, sc, g, name: reg.terrain.scenes[key].name, water: sc.waterSpots.length };
  });
  Object.assign(SCENE_DENSITY, saved);
  // base de la maqueta: un tablero de papel bajo todas las zonas, con borde de tinta
  const W = cols * step - GAP + 2 * MARGIN, D = rows * step - GAP + 2 * MARGIN;
  const minY = Math.min(...zones.map(z => z.sc.heightAt(0, 0)));
  const base = new THREE.Mesh(new THREE.BoxGeometry(W, 4, D), new THREE.MeshBasicMaterial({ color: 0xe4d2aa }));
  base.position.y = minY - 3;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(base.geometry), new THREE.LineBasicMaterial({ color: INK }));
  edges.position.copy(base.position);
  root.add(base, edges);
  // nombres de las zonas pintados en el tablero, en el borde de afuera de cada una (como en una cancha)
  for (const z of zones) {
    const north = z.g.position.z < 0 || (rows === 1);
    root.add(groundLabel(SCENE_LABEL[z.key] || z.key, z.g.position.x, minY - 0.95, z.g.position.z + (north ? -1 : 1) * (WORLD / 2 + MARGIN / 2), north));
  }
  root.add(surround(SURROUND[reg.meta.code] || SURROUND['CL-RM'], W, D, minY - 5, reg.meta.code));

  const center = new THREE.Vector3(0, minY, 0);
  const radius = Math.hypot(W, D) / 2;

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
    flocks.set(id, { sp, clase, zone, n, birds: [], side: clase === 'invierno' ? 1 : clase === 'verano' ? -1 : (id % 2 ? 1 : -1) });
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
  const _c = new THREE.Vector3();
  function setMonth(mi, instant) {
    month = mi;
    const now = new Set(region.months[mi].especies.map(e => e.id));
    const events = [];
    for (const f of flocks.values()) {
      const here = now.has(f.sp.id), active = f.birds.filter(b => !b.leaving);
      if (here && !active.length) {
        const delay = instant ? 0 : (f.sp.id % 11) / 11 * MONTH_SECS * 0.5; // no llegan todas juntas
        for (let i = 0; i < f.n; i++) {
          const b = spawn(f); f.birds.push(b);
          if (instant) { const p = b.choosePlace(); b.pos.copy(p); b.setState('idle', Math.random() * 2); b.pose(p.y); }
          else { b.pos.set(0, -999, 0); b.setState('wait', 99); b.pose(-999); b.wake = delay + i * 0.25; }
        }
        if (!instant) events.push({ type: 'llega', f, delay });
      } else if (!here && active.length) {
        const delay = (f.sp.id % 7) / 7 * MONTH_SECS * 0.4;
        for (const b of active) b.leaveAt = delay + Math.random() * 0.6;
        events.push({ type: 'se va', f, delay });
      }
    }
    return events;
  }

  function update(dt, cam) {
    t = (t + dt) % YEAR_SECS;
    const mi = Math.floor(t / MONTH_SECS);
    const events = mi !== month ? setMonth(mi, false) : [];
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
        _c.copy(cam).lerp(center, 0.08 + Math.random() * 0.08); // a unos 15–25 m de la torre, delante de la vista
        _c.x += (Math.random() - 0.5) * radius * 0.25; _c.y -= radius * 0.05;
        b.flyby(_c.sub(z.g.position).clone());
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
    return { month: mi, progress: t / YEAR_SECS, events };
  }

  function reset() { // el año empieza con las de enero ya posadas
    for (const f of flocks.values()) { for (const b of f.birds) f.zone.g.remove(b.m.group, b.blob); f.birds = []; }
    t = 0; month = -1; setMonth(0, true); month = 0;
  }
  reset();

  const animate = time => { for (const z of zones) z.sc.animate?.(time); };
  const dispose = () => root.traverse(o => { if (!o.userData.ink) o.geometry?.dispose(); });
  const birds = () => [...flocks.values()].reduce((a, f) => a + f.birds.length, 0);
  return { root, zones, months: region.months, center, radius, update, reset, animate, dispose, birds, flocks };
}

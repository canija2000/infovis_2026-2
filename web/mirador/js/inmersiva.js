// Vista inmersiva: el año 2024 de una región pasa en ~36 s sobre la zona, vista como maqueta desde una torre.
// Cada especie registrada ese mes es una bandada; cuando su mes empieza llega volando desde el borde (las de
// verano desde el norte, las de invierno desde el sur) y se posa; cuando deja de registrarse, se va por donde
// vino. El tamaño de la bandada sale de cuántos días del mes se registró (data/bandadas-2024.json, que genera
// scripts/bandadas.mjs; el mismo archivo sirve para el servo).
/* global THREE */
import { mat, texPlain, mulberry32 } from './ps1.js';

export const YEAR_SECS = 36; // un año completo
const MONTH = YEAR_SECS / 12;
const FLY = 3.2; // s de vuelo al llegar o irse
const CLASS_COLOR = { residente: 0x288665, verano: 0xee9b45, invierno: 0x4a7fd0 }; // los de la Entrega 1
const PER_SPECIES = { residente: 2, verano: 5, invierno: 5 }; // aves por bandada si se registró todos los días
const MAX_BIRDS = { residente: 220, verano: 260, invierno: 160 };

// Un ave vista de lejos: dos alas en V y un cuerpo. Se dibuja con instancias, una malla por clase.
function birdGeometry() {
  const g = new THREE.BufferGeometry();
  const v = [
    0, 0, -0.35, -0.9, 0.12, 0.05, 0, 0, 0.2, // ala izquierda
    0, 0, -0.35, 0, 0, 0.2, 0.9, 0.12, 0.05, // ala derecha
    0, 0.05, -0.45, -0.12, -0.04, 0.3, 0.12, -0.04, 0.3, // cuerpo
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(18).fill(0.5), 2));
  g.computeVertexNormals();
  return g;
}

const ease = t => t * t * (3 - 2 * t);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();

export function createFlocks(sc, region, { onArrive, onLeave } = {}) {
  const root = new THREE.Group();
  const R = mulberry32(region.code.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0);
  const half = sc.half ?? 32, land = half * 0.72, edge = half * 1.9;
  const isWater = (x, z) => sc.coverAt?.(x, z) === 7 || (sc.seaY != null && sc.heightAt(x, z) < sc.seaY);
  const spot = (water) => { // un lugar donde posarse: tierra firme o agua, dentro de la maqueta
    if (water && sc.waterSpots?.length) { const w = sc.waterSpots[(R() * sc.waterSpots.length) | 0]; return new THREE.Vector3(w.x, w.y, w.z); }
    for (let k = 0; k < 40; k++) {
      const a = R() * Math.PI * 2, r = 3 + Math.sqrt(R()) * land, x = Math.sin(a) * r, z = -Math.cos(a) * r;
      if (!isWater(x, z) && !sc.obstacles?.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 0.5)) return new THREE.Vector3(x, sc.heightAt(x, z), z);
    }
    return new THREE.Vector3(0, sc.heightAt(0, 0), 0);
  };

  // especies del año: cuántas aves tiene cada bandada y dónde se posa
  const species = new Map();
  for (const m of region.months) for (const e of m.especies) {
    const s = species.get(e.id) || { ...e, peak: 0 };
    s.peak = Math.max(s.peak, e.freq); species.set(e.id, s);
  }
  const counts = { residente: 0, verano: 0, invierno: 0 };
  const birds = [];
  for (const s of [...species.values()].sort((a, b) => b.peak - a.peak)) {
    const n = Math.max(1, Math.round(s.peak * PER_SPECIES[s.clase]));
    if (counts[s.clase] + n > MAX_BIRDS[s.clase]) continue;
    counts[s.clase] += n;
    const home = spot(R() < 0.18), from = s.clase === 'invierno' ? 1 : s.clase === 'verano' ? -1 : (R() < 0.5 ? -1 : 1);
    s.birds = [];
    for (let i = 0; i < n; i++) {
      const b = {
        sp: s, i, cls: s.clase, idx: counts[s.clase] - n + i,
        rest: home.clone().add(new THREE.Vector3((R() - 0.5) * 2.4, 0, (R() - 0.5) * 2.4)),
        // de dónde llega: el borde norte (−z) o sur (+z), algo corrido y en altura
        out: new THREE.Vector3((R() - 0.5) * half * 1.4, 14 + R() * 10, from * edge),
        state: 'away', t: 0, delay: i * 0.12 + R() * 0.3, phase: R() * 6.3,
      };
      b.rest.y = isWater(b.rest.x, b.rest.z) && sc.seaY != null ? sc.seaY : sc.heightAt(b.rest.x, b.rest.z);
      s.birds.push(b); birds.push(b);
    }
  }
  const geo = birdGeometry();
  const meshes = {};
  for (const c of Object.keys(CLASS_COLOR)) {
    const m = new THREE.InstancedMesh(geo, mat(texPlain(), { tint: CLASS_COLOR[c], twoSided: true, steady: true }), Math.max(1, counts[c]));
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    meshes[c] = m; root.add(m);
  }

  let month = -1, t = 0;
  function enterMonth(mi) {
    month = mi;
    const now = new Map(region.months[mi].especies.map(e => [e.id, e]));
    for (const s of species.values()) {
      if (!s.birds) continue;
      const here = now.has(s.id), delay = (s.id % 7) / 7 * MONTH * 0.6; // no llegan todas juntas
      const flying = s.birds.filter(b => b.state === 'away' || b.state === 'leaving');
      if (here && flying.length === s.birds.length) {
        for (const b of s.birds) { b.state = 'arriving'; b.t = -(delay + b.delay); }
        onArrive?.(s, delay);
      } else if (!here && s.birds.some(b => b.state === 'here' || b.state === 'arriving')) {
        for (const b of s.birds) { b.from = b.state === 'here' ? b.rest.clone() : b.pos?.clone() || b.rest.clone(); b.state = 'leaving'; b.t = -(delay + b.delay); }
        onLeave?.(s, delay);
      }
    }
  }

  function place(b, time) {
    let pos, heading = 0, flap = 1, lift = 0;
    if (b.state === 'away') { pos = b.out; flap = 0; }
    else if (b.state === 'here') {
      const hop = Math.max(0, Math.sin(time * 1.3 + b.phase * 3)) ** 8; // de vez en cuando un salto o un aleteo corto
      pos = _p.copy(b.rest); lift = hop * 0.5; flap = 0.15 + hop; heading = b.phase;
    } else {
      const k = ease(Math.min(1, Math.max(0, b.t / FLY)));
      const a = b.state === 'arriving' ? b.out : b.from, z = b.state === 'arriving' ? b.rest : b.out;
      pos = _p.copy(a).lerp(z, k);
      lift = Math.sin(k * Math.PI) * 6; // arco de vuelo
      heading = Math.atan2(z.x - a.x, z.z - a.z);
      if (b.t < 0) pos = a;
    }
    b.pos = (b.pos || new THREE.Vector3()).copy(pos);
    const vis = b.state !== 'away' && !(b.state === 'leaving' && b.t >= FLY);
    const sc = vis ? 1.5 : 0; // exagerada, como en una maqueta: a escala real no se verían desde la torre
    _s.set(sc, sc * (0.35 + 0.65 * Math.abs(Math.sin(time * 14 * flap + b.phase))), sc);
    _q.setFromEuler(_e.set(0, heading, 0));
    _m.compose(_p.set(pos.x, pos.y + 0.35 + lift, pos.z), _q, _s);
    meshes[b.cls].setMatrixAt(b.idx, _m);
  }

  function update(dt, time) {
    t = (t + dt) % YEAR_SECS;
    const mi = Math.floor(t / MONTH);
    if (mi !== month) enterMonth(mi);
    for (const b of birds) {
      if (b.state === 'arriving' || b.state === 'leaving') {
        b.t += dt;
        if (b.t >= FLY) b.state = b.state === 'arriving' ? 'here' : 'away';
      }
      place(b, time);
    }
    for (const m of Object.values(meshes)) m.instanceMatrix.needsUpdate = true;
    return { month: mi, progress: t / YEAR_SECS };
  }

  const reset = () => { // el año empieza con las de enero ya posadas
    t = 0; month = 0;
    const jan = new Set(region.months[0].especies.map(e => e.id));
    for (const b of birds) b.state = jan.has(b.sp.id) ? 'here' : 'away';
  };
  reset();
  return { root, update, reset, counts, months: region.months, dispose: () => { geo.dispose(); for (const m of Object.values(meshes)) m.material.dispose(); } };
}

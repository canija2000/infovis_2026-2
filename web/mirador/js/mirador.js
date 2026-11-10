// Mirador: el Aviario para los binoculares de cartón (teléfono + Arduino como teclado USB).
// No se camina: eliges una región y una de sus zonas, quedas de pie en el centro y giras. Las aves
// destacadas de la zona están fijas en un círculo alrededor, cada especie siempre en el mismo lugar del
// año; las que no se registran ese mes dejan su lugar vacío. La mira elige el ave más cercana al centro:
// canta y muestra su ficha. Datos de un solo año (YEAR), mes a mes.
//
// Flujo: el QR de cada región abre web/mirador/?r=CL-XX → se elige una zona tocando → se pone el teléfono
// en el visor (empieza solo cuando queda de lado y quieto) → se explora solo con el giroscopio:
// mantener un ave en la mira abre su ficha y la acerca, y si se sigue mirando la fotografía; mirar al
// cielo pasa al mes siguiente; mirar al suelo abre la libreta; sacar el teléfono (vertical) pausa.
// El teclado (o el Arduino de arduino/binoculares_teclado) sigue sirviendo: Espacio = foto ·
// Enter = ficha · Z / X = zoom · M = mes siguiente · Esc = pausa.
/* global THREE */
import { shared, createRenderer } from './ps1.js';
import { loadWorld, loadRegion, loadJSON, DATA_BASE, CLASS_LABEL, featuredIn, presenceIn, presentIn } from './data.js';
import { buildScene } from './scene.js';
import { loadKit } from './kit.js';
import { BirdAgent } from './aviary.js';
import { unlockAudio, loadClip, playAt, playSynth, setListener, setAmbience, duckAmbience, blip } from './audio.js';
import { progress, markSeen, rememberRegion, scorePhoto, starText, savePhoto } from './photo.js';

// ------------------------------------------------------------------ ajustes
const YEAR = '2024';
const CFG = {
  regions: ['CL-AP', 'CL-VS', 'CL-RM', 'CL-LR', 'CL-MA'], // de norte a sur: las que tienen zonas modeladas
  eyeHeight: 1.6, // m sobre el suelo del centro de la zona
  fovWide: 42, fovTele: 6, // grados: sin zoom y con todo el zoom
  monthSeconds: 75, // cada cuánto pasa un mes solo (0 = solo con la tecla M); no pasa mientras hay un ave en la mira
  lockDeg: 3.5, lockFov: 0.2, // la mira toma un ave a menos de max(lockDeg, lockFov × campo visual) del centro
  resing: 8, // s entre cantos mientras el ave sigue en la mira
  bookPitch: -0.8, // rad: mirar al suelo abre la libreta
  skyPitch: 0.75, skyHold: 2.0, // rad y s: mirar al cielo ese tiempo pasa al mes siguiente
  dwellCard: 1.2, dwellPhoto: 3.4, // s con el ave en la mira hasta abrir la ficha y hasta tomar la foto
  frame: 0.3, // con la ficha abierta, el zoom deja el ave en esta fracción del campo visual
  placeHold: 1.2, // s de lado y quieto para empezar
};
const SEASON_OF = ['verano', 'verano', 'otoño', 'otoño', 'otoño', 'invierno', 'invierno', 'invierno', 'primavera', 'primavera', 'primavera', 'verano'];
const LIGHT = {
  verano: { sun: 0xfff0c8, amb: 0x7c786a, fog: 0xbfc6c4 }, 'otoño': { sun: 0xf0d0a0, amb: 0x72685c, fog: 0xb0a48e },
  invierno: { sun: 0xc8d0e0, amb: 0x5c6270, fog: 0x8e98a8 }, primavera: { sun: 0xf8f0d0, amb: 0x74806a, fog: 0xacc4b4 },
};
const SCENE_LABEL = { ciudad: 'Ciudad', matorral: 'Matorral', rio: 'Río', cordillera: 'Cordillera', costa: 'Costa',
  humedal: 'Humedal', desierto: 'Desierto', valle: 'Valle', altiplano: 'Altiplano', bosque: 'Bosque', lago: 'Lago',
  pradera: 'Pradera', fiordo: 'Fiordo', estepa: 'Estepa', bofedal: 'Bofedal' };

const $ = id => document.getElementById(id);
const q = new URLSearchParams(location.search);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = a => { a = (a + Math.PI) % (2 * Math.PI); return (a < 0 ? a + 2 * Math.PI : a) - Math.PI; };
const bearingOf = (x, z) => Math.atan2(x, -z); // rumbo de brújula: 0 = norte (−z), π/2 = este (+x)
const cap = s => s[0].toUpperCase() + s.slice(1);
const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } return null; };

const canvas = $('c');
const renderer = createRenderer(canvas);
const camera = new THREE.PerspectiveCamera(CFG.fovWide, 1, 0.3, 200);

const S = {
  mode: 'pick', index: null, reg: null, props: null, sceneKey: null, sc: null, world: null,
  zoneSpecies: [], slots: new Map(), birds: [], marks: [],
  month: q.has('m') ? clamp(+q.get('m'), 0, 11) : new Date().getMonth(), monthT: 0,
  heading: 0, pitch: 0, fov: CFG.fovWide, fovGoal: CFG.fovWide,
  locked: null, cand: null, candT: 0, lockT: 0, cardOpen: false, bookKey: false, bookOn: false, shot: false,
  dwell: 0, shotDone: false, manualZoom: false, skyT: 0, placeT: 0, placeLast: null, phone: matchMedia('(pointer: coarse)').matches,
  bino: q.has('mono') ? false : q.has('bino') ? true : matchMedia('(pointer: coarse)').matches,
  lens: Object.assign({ sep: 41, dia: 36 }, store('mirador.lentes')), // % del ancho de la pantalla
  eyes: [], rects: [], k: 1,
};
const eye = new THREE.Vector3(), fwd = new THREE.Vector3();

// ------------------------------------------------------------------ lentes y HUD (uno por ojo)
function buildEyes() {
  const host = $('eyes'); host.innerHTML = '';
  S.eyes = [0, 1].map(() => host.appendChild($('eye-tpl').content.firstElementChild.cloneNode(true)));
  S.marks = [];
}
const all = (sel, fn) => { for (const e of S.eyes) { const el = e.querySelector(sel); if (el) fn(el, e); } };
const html = (sel, h) => all(sel, el => { el.innerHTML = h; });
const show = (sel, on) => all(sel, el => { el.hidden = !on; });

function layout() {
  const W = innerWidth, H = innerHeight;
  const lines = S.bino ? 420 : 320;
  const k = S.k = lines / H;
  renderer.setSize(Math.round(W * k), lines, false);
  document.body.classList.toggle('mono', !S.bino);
  if (S.bino) {
    const sep = W * S.lens.sep / 100, d = Math.min(W * S.lens.dia / 100, H, sep);
    S.rects = [-1, 1].map(s => ({ x: W / 2 + s * sep / 2 - d / 2, y: H / 2 - d / 2, w: d, h: d }));
    $('mask').firstElementChild.setAttribute('d', `M0 0H${W}V${H}H0Z` + S.rects.map(r => {
      const cx = r.x + d / 2, cy = r.y + d / 2, R = d / 2;
      return `M${cx - R} ${cy}a${R} ${R} 0 1 0 ${d} 0a${R} ${R} 0 1 0 ${-d} 0Z`;
    }).join(''));
  } else {
    S.rects = [{ x: 0, y: 0, w: W, h: H }];
    $('mask').firstElementChild.setAttribute('d', '');
  }
  S.eyes.forEach((e, i) => {
    const r = S.rects[i];
    e.hidden = !r;
    if (!r) return;
    e.style.setProperty('--d', (S.bino ? r.w : Math.min(H, W * 0.8)) + 'px');
    e.style.left = r.x + 'px'; e.style.top = r.y + 'px';
  });
  camera.aspect = S.rects[0].w / S.rects[0].h; camera.updateProjectionMatrix();
  shared.uSnap.value.set(S.rects[0].w * k / 2, S.rects[0].h * k / 2);
}
window.addEventListener('resize', layout);

let toastH = 0;
function toast(h, secs = 3) {
  html('.e-toast', h); show('.e-toast', true);
  clearTimeout(toastH); toastH = setTimeout(() => show('.e-toast', false), secs * 1000);
}

// ------------------------------------------------------------------ pantallas (fuera del visor)
function showScreen(id) { // pick | place | pause | null (explorando)
  for (const k of ['pick', 'place', 'pause']) $(k).hidden = k !== id;
  showHud(!id);
}
function showHud(on) { for (const sel of ['.e-top', '.e-compass', '.e-reticle', '.e-zoom']) show(sel, on); if (!on) for (const sel of ['.e-card', '.e-book', '.e-sky', '.e-toast']) show(sel, false); }

function regionList() {
  S.mode = 'pick'; showScreen('pick');
  $('pick-sub').textContent = `aves de Chile · ${YEAR}`;
  $('pick-status').textContent = 'Elige una región (o escanea su código QR).';
  $('pick-list').innerHTML = CFG.regions.map(code => {
    const meta = S.index.regions.find(r => r.code === code), feat = progress.regions[code];
    const n = feat ? feat.filter(sid => progress.album[sid]).length : 0;
    return `<button data-r="${code}"><b>${meta.name}</b><small>${feat ? 'visitada' : 'sin visitar'}</small><span class="n">${feat ? `${n}/${feat.length}` : ''}</span></button>`;
  }).join('');
}
function zoneList() {
  S.mode = 'pick'; showScreen('pick');
  const scenes = S.reg.terrain.scenes;
  $('pick-sub').textContent = `${S.reg.meta.name} · ${YEAR}`;
  $('pick-status').textContent = 'Elige una zona. Después vas a poner el teléfono en el visor.';
  $('pick-list').innerHTML = Object.keys(scenes).map(key => {
    const sids = zoneSids(key), n = sids.filter(sid => progress.album[sid]).length;
    return `<button data-z="${key}"><b>${SCENE_LABEL[key] || cap(key)}</b><small>${scenes[key].name}</small><span class="n">${n}/${sids.length}</span></button>`;
  }).join('') + (q.get('r') ? '' : '<button data-back="1"><small>← Otra región</small></button>');
}
$('pick-list').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.r) { history.replaceState(null, '', `?r=${b.dataset.r}`); enterRegion(b.dataset.r); }
  else if (b.dataset.z) pickZone(b.dataset.z);
  else if (b.dataset.back) { history.replaceState(null, '', location.pathname); regionList(); }
});

// El toque en la zona es el gesto que el navegador exige para pedir el giroscopio (iPhone), el sonido,
// la pantalla siempre encendida, la pantalla completa y la orientación horizontal.
let sensorsAsked = false;
function wakeUp() {
  goFullscreen(); // primero: el navegador solo lo permite justo en el toque
  unlockAudio(); blip(660, 0.08);
  if (!sensorsAsked) { sensorsAsked = true; startGyro(); }
  navigator.wakeLock?.request('screen').catch(() => {});
}
// Pantalla completa (sin barra de dirección). Funciona en Android; en iPhone Safari no lo permite para
// páginas, así que ahí se instala en la pantalla de inicio (ver installHint).
const standalone = () => matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true;
function goFullscreen() {
  if (!S.phone || standalone() || document.fullscreenElement || document.webkitFullscreenElement) return;
  const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return;
  try {
    Promise.resolve(req.call(el, { navigationUI: 'hide' })).catch(() => {}); // sin bloquear la orientación: vertical = sacó el teléfono (pausa)
  } catch { /* sin pantalla completa */ }
}
const isIOS = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function installHint() {
  const el = $('install');
  if (!S.phone || standalone()) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = isIOS
    ? '<b>Para verlo sin la barra de Safari:</b> toca Compartir ⬆︎ → «Agregar a inicio» y abre el Mirador desde ese ícono.'
    : (document.documentElement.requestFullscreen
      ? '<b>Pantalla completa:</b> se activa al elegir la zona. También puedes instalarlo: menú ⋮ → «Agregar a la pantalla principal».'
      : '<b>Para verlo sin la barra:</b> menú ⋮ → «Agregar a la pantalla principal» y ábrelo desde ese ícono.');
}
async function pickZone(key) {
  wakeUp();
  $('pick-status').textContent = 'Cargando la zona…';
  await enterZone(key);
  toPlace();
}
function toPlace() {
  S.mode = 'place'; S.placeT = 0; showScreen('place');
  $('place-msg').textContent = 'Gíralo de lado, con la pantalla hacia los tubos, y míralo como unos binoculares.';
  $('b-enter').hidden = S.phone && gyro.have;
}
function go() { // entrar al mundo; el rumbo actual del teléfono pasa a ser el de partida
  S.mode = 'look'; showScreen(null); layout();
  S.heading = S.startHeading; S.pitch = gyro.have ? gyro.p : -0.2;
  if (gyro.have) gyro.off = S.heading - gyro.h;
  blip(990, 0.08);
  toast(`<b>${S.reg.terrain.scenes[S.sceneKey].name}</b><br>Gira para buscar aves. Mantén una en la mira para conocerla y fotografiarla.`, 6);
}
function pause(msg = '') {
  if (S.mode !== 'look') return;
  S.mode = 'pause'; showScreen('pause'); setLock(null);
  $('pause-msg').textContent = msg || `${cap(S.index.months[S.month])} de ${YEAR} · ${S.zoneSpecies.filter(sp => progress.album[sp.id]).length} de ${S.zoneSpecies.length} aves fotografiadas aquí`;
}
$('b-enter').onclick = () => { wakeUp(); go(); };
$('b-resume').onclick = () => { wakeUp(); toPlace(); };
$('b-back1').onclick = $('b-back2').onclick = () => { leaveZone(); zoneList(); };

// ------------------------------------------------------------------ región y zona
function zoneSids(key) {
  const rid = String(S.reg.meta.id);
  return Object.entries(S.reg.region.featured || {})
    .filter(([sid, f]) => f.scene === key && S.index.byId.get(+sid)?.regionalClass[rid]).map(([sid]) => +sid).sort((a, b) => a - b);
}

async function enterRegion(code) {
  $('pick-status').textContent = 'Cargando la región…';
  S.reg = await loadRegion(S.index, code);
  store('mirador.region', code);
  try { S.props = await loadJSON(DATA_BASE + `props-${code}.json`); } catch { S.props = null; }
  featuredIn(S.index, S.reg.region); // deja la paleta de cada especie destacada
  rememberRegion(code, Object.keys(S.reg.region.featured || {}).map(Number));
  S.sceneKey = null;
  zoneList();
}

function leaveZone() {
  setLock(null);
  if (S.world) S.sc.root.traverse(o => o.geometry?.dispose());
  S.world = null; S.sc = null; S.birds = [];
  clearMarks();
  setAmbience(null);
}

async function enterZone(key) {
  await new Promise(r => setTimeout(r, 30)); // que alcance a pintarse el aviso
  leaveZone();
  const data = S.reg.terrain.scenes[key];
  const sc = buildScene(key, data, S.props, [], 20, S.reg.meta.lat < -44);
  const world = new THREE.Scene();
  world.add(sc.root);
  world.updateMatrixWorld(true);
  Object.assign(S, { sc, world, sceneKey: key, zoneSpecies: zoneSids(key).map(id => S.index.byId.get(id)) });
  eye.set(0, sc.heightAt(0, 0) + CFG.eyeHeight, 0);
  assignSlots();
  setAmbience(key);
  S.fov = S.fovGoal = CFG.fovWide; S.pitch = -0.2; S.cardOpen = false; S.bookKey = false;
  buildMarks();
  setMonth(S.month, true);
  S.startHeading = S.birds.length ? S.birds[0].bearing - 0.5 : 0; // empezar con un ave cerca, sin tenerla ya en la mira
  S.heading = S.startHeading;
}

// Cada especie de la zona tiene un sector fijo del círculo. Los sectores se reparten según lo que hay en
// el terreno: primero las que nadan (donde hay más agua), luego las que se posan (donde hay más perchas).
function assignSlots() {
  const sc = S.sc, list = S.zoneSpecies, N = Math.max(1, list.length);
  const half = Math.PI / N, base = (S.sceneKey.length * 1.7) % (2 * Math.PI);
  const centers = [...Array(N).keys()].map(i => wrap(base + (i + 0.5) * 2 * half));
  const count = (pts, c) => pts.filter(p => Math.abs(wrap(bearingOf(p.x, p.z) - c)) < half && Math.hypot(p.x, p.z) < 24).length;
  const water = centers.map(c => count(sc.waterSpots, c)), perch = centers.map(c => count(sc.perches, c));
  const free = new Set(centers.keys());
  const kinds = list.map(sp => { const a = new FixedBird(sp, sc, S.reg.meta.id); return { sp, kind: a.traits.swim ? 0 : a.plan === 'picaflor' || a.groundy < 0.5 ? 1 : 2 }; });
  S.slots = new Map();
  for (const kind of [0, 1, 2]) for (const { sp } of kinds.filter(k => k.kind === kind)) {
    const score = i => kind === 0 ? water[i] : kind === 1 ? perch[i] : -water[i]; // las de suelo, lejos del agua
    const best = [...free].sort((i, j) => score(j) - score(i) || i - j)[0];
    free.delete(best);
    S.slots.set(sp.id, { bearing: centers[best], half });
  }
}

// ------------------------------------------------------------------ aves fijas
// Mismo modelo y gestos que en el Aviario (mirar, picotear, cantar), pero sin cambiar de lugar.
class FixedBird extends BirdAgent {
  setState(s, dur = 0) { super.setState(s === 'idle' && this.plan === 'picaflor' ? 'hover' : s, dur || rnd(1.5, 3)); }
  chooseNext() {
    if (!this.perch && !this.swimming && Math.random() < 0.3) this.setState('peck', 0.9);
    else this.setState('idle', rnd(1, 3));
  }
}

const ray = new THREE.Raycaster();
function visibleFromEye(p) {
  const d = p.clone().sub(eye), len = d.length();
  ray.set(eye, d.normalize());
  const hit = ray.intersectObject(S.sc.ground, false)[0];
  return !hit || hit.distance > len - 0.4;
}

function placeBird(a, slot, taken) {
  const sc = S.sc;
  const ok = (p, r0, r1, wide = 0.8) => {
    const r = Math.hypot(p.x, p.z);
    return r > r0 && r < r1 && Math.abs(wrap(bearingOf(p.x, p.z) - slot.bearing)) < slot.half * wide
      && (p.y - eye.y) / r < 0.7 && !taken.some(t => t.distanceTo(p) < 1.6) && visibleFromEye(p);
  };
  const nearest = (pts, r0, r1, ideal) => pts.filter(p => ok(p, r0, r1)).sort((p, o) => Math.abs(Math.hypot(p.x, p.z) - ideal) - Math.abs(Math.hypot(o.x, o.z) - ideal))[0];
  let p = null;
  a.perch = null; a.swimming = false; a.onTrunk = null;
  if (a.traits.swim && (p = nearest(sc.waterSpots, 4, 24, 9))) { a.perch = p.clone(); a.swimming = true; }
  else if (a.plan === 'picaflor' && (p = nearest(sc.flowers, 3, 14, 6))) { a.perch = p.clone(); a.perch.y += 0.9; }
  else if (a.traits.trunk && (p = nearest((sc.trunks || []).map(t => Object.assign(t.pos.clone(), { t })), 4, 18, 8))) { a.perch = p.clone(); a.onTrunk = p.t; }
  else if (!a.traits.swim && a.plan !== 'picaflor' && a.groundy < 0.5 && (p = nearest(sc.perches, 4, 20, 8))) a.perch = p.clone();
  if (a.plan === 'picaflor' && !a.perch) { // sin flores a la vista: suspendido frente al mirador
    a.perch = new THREE.Vector3(Math.sin(slot.bearing) * 5, eye.y - 0.4, -Math.cos(slot.bearing) * 5);
  }
  const pos = a.perch ? a.perch.clone() : null;
  if (!pos) { // en el suelo: el punto visible más cercano a 6 m, en tierra firme y fuera de los edificios
    search: for (const r of [6, 5, 7, 8, 4.5, 9, 10, 12]) for (const da of [0, 0.25, -0.25, 0.5, -0.5]) {
      const b = slot.bearing + da * slot.half, x = Math.sin(b) * r, z = -Math.cos(b) * r, y = sc.heightAt(x, z);
      if (sc.coverAt(x, z) === 7 || (sc.seaY != null && y < sc.seaY) || sc.obstacles.some(o => Math.hypot(o.x - x, o.z - z) < o.r + 0.3)) continue;
      const c = new THREE.Vector3(x, y, z);
      if (taken.some(t => t.distanceTo(c) < 1.6) || !visibleFromEye(c.clone().setY(y + 0.3))) continue;
      p = c; break search;
    }
    if (!p) { const x = Math.sin(slot.bearing) * 5, z = -Math.cos(slot.bearing) * 5; p = new THREE.Vector3(x, sc.heightAt(x, z), z); }
  }
  a.pos.copy(pos || p);
  taken.push(a.pos.clone());
  a.bearing = bearingOf(a.pos.x, a.pos.z);
  // de perfil a quien mira (así se reconoce mejor); en el tronco, como lo deja el tronco
  a.heading = a.onTrunk ? a.onTrunk.face : Math.atan2(-a.pos.x, -a.pos.z) + (a.sp.id % 2 ? 0 : Math.PI);
  a.setState('idle', rnd(0.5, 2));
  a.pose(a.pos.y);
}

function castNow() {
  return S.zoneSpecies.map(sp => ({ sp, pr: presenceIn(S.reg.region, sp, S.month, YEAR) })).filter(c => c.pr);
}

function setMonth(m, silent = false) {
  S.month = (m + 12) % 12; S.monthT = 0;
  const cast = castNow(), want = new Map(cast.map(c => [c.sp.id, c]));
  const leaving = S.birds.filter(b => !want.has(b.sp.id));
  if (leaving.includes(S.locked)) setLock(null);
  for (const b of leaving) S.world.remove(b.m.group);
  S.birds = S.birds.filter(b => want.has(b.sp.id));
  const taken = S.birds.map(b => b.pos.clone()), arriving = [];
  for (const c of cast) {
    let b = S.birds.find(o => o.sp.id === c.sp.id);
    if (!b) {
      b = new FixedBird(c.sp, S.sc, S.reg.meta.id);
      placeBird(b, S.slots.get(c.sp.id), taken);
      S.world.add(b.m.group);
      S.birds.push(b); arriving.push(b);
      if (c.sp.clip) loadClip(c.sp.clip.grain);
    }
    b.pr = c.pr; b.freq = c.pr.freq;
  }
  S.birds.sort((a, b) => a.bearing - b.bearing);
  // estación
  const season = SEASON_OF[S.month], L = LIGHT[season];
  shared.uLightCol.value.set(L.sun); shared.uAmb.value.set(L.amb);
  const high = S.sceneKey === 'cordillera' || (S.sc.hMin ?? 0) > 3000;
  S.fog = high ? 0x9cb4d8 : S.sc.seaY != null ? 0xa4b8c8 : L.fog;
  shared.uFogColor.value.set(S.fog); shared.uFogNear.value = 18; shared.uFogFar.value = 66;
  shared.uSnow.value = S.sc.setSeason(season, S.month);
  updateTop(); syncMarks(); renderCard();
  if (!silent) {
    const names = l => l.map(b => b.sp.comName).join(', ');
    toast(`<b>${cap(S.index.months[S.month])} de ${YEAR}</b> · ${season}`
      + (arriving.length ? `<br>Llegan: ${names(arriving)}` : '') + (leaving.length ? `<br>Se van: ${names(leaving)}` : ''), 4);
    blip(520, 0.08);
  }
}

function updateTop() {
  html('.e-place', `${S.reg.meta.name} · ${SCENE_LABEL[S.sceneKey] || S.sceneKey}`);
  const n = S.birds.length;
  html('.e-date', `${cap(S.index.months[S.month])} de ${YEAR} · ${n ? `${n} ave${n > 1 ? 's' : ''}` : 'sin aves destacadas este mes'}`);
}

// ------------------------------------------------------------------ brújula
function clearMarks() { for (const m of S.marks) for (const el of m.els) el.remove(); S.marks = []; }
function addMark(cls, text, bearing, extra = {}) {
  const els = S.eyes.map(e => {
    const el = document.createElement('span'); el.className = 'e-mark ' + cls; el.textContent = text;
    e.querySelector('.e-strip').appendChild(el); return el;
  });
  const m = { els, bearing, ...extra }; S.marks.push(m); return m;
}
function buildMarks() {
  clearMarks();
  for (const [t, b] of [['N', 0], ['E', Math.PI / 2], ['S', Math.PI], ['O', -Math.PI / 2]]) addMark('card', t, b);
  const here = S.reg.terrain.scenes[S.sceneKey].center;
  for (const [k, o] of Object.entries(S.reg.terrain.scenes)) if (k !== S.sceneKey) { // hacia dónde quedan las otras zonas
    const dx = (o.center[0] - here[0]) * Math.cos(here[1] * Math.PI / 180), dn = o.center[1] - here[1];
    addMark('zone', `${SCENE_LABEL[k] || k} ${Math.round(Math.hypot(dx, dn) * 111)} km`, Math.atan2(dx, dn));
  }
  let prev = null, row = 0; // las que quedan hacia el mismo lado se apilan
  for (const m of S.marks.filter(m => m.els[0].classList.contains('zone')).sort((a, b) => a.bearing - b.bearing)) {
    row = prev != null && m.bearing - prev < 0.6 ? row + 1 : 0; prev = m.bearing;
    for (const el of m.els) el.style.bottom = -(1.7 + row * 1.2) + 'em';
  }
}
function syncMarks() { // un punto por ave presente
  for (const m of S.marks.filter(m => m.bird)) for (const el of m.els) el.remove();
  S.marks = S.marks.filter(m => !m.bird);
  for (const b of S.birds) {
    const m = addMark('bird', '', b.bearing, { bird: b });
    for (const el of m.els) { el.style.setProperty('--k', b.color); el.classList.toggle('got', !!progress.album[b.sp.id]); }
  }
}
const SPAN = Math.PI / 2;
function updateMarks() {
  for (const m of S.marks) {
    const d = wrap(m.bearing - S.heading), far = Math.abs(d) > SPAN;
    const x = 50 + clamp(d / SPAN, -1, 1) * 50;
    for (const el of m.els) {
      el.style.left = x + '%';
      if (m.bird) { el.classList.toggle('far', far); el.classList.toggle('on', m.bird === S.locked); }
      else el.style.visibility = far ? 'hidden' : 'visible';
    }
  }
}

// ------------------------------------------------------------------ mira, canto y ficha
function centerOf(b, out) { return out.copy(b.m.group.position).setY(b.m.group.position.y + (b.m.height ?? 2.5) * b.s * 0.5); }
const _c = new THREE.Vector3();
function aim(dt) {
  const thr = Math.max(CFG.lockDeg, S.fov * CFG.lockFov) * Math.PI / 180;
  let best = null, bestA = Infinity;
  // Se elige girando: manda el rumbo. En vertical basta con que el ave esté dentro del campo visual.
  const vmax = gyro.have ? Math.max(thr, S.fov * 0.45 * Math.PI / 180) : 9; // sin giroscopio la vista se acomoda sola
  for (const b of S.birds) {
    centerOf(b, _c).sub(eye);
    const dh = Math.abs(wrap(bearingOf(_c.x, _c.z) - S.heading)), dv = Math.abs(Math.atan2(_c.y, Math.hypot(_c.x, _c.z)) - S.pitch);
    const a = dh + dv * 0.15;
    if (dh < (b === S.locked ? thr * 1.4 : thr) && dv < vmax && a < bestA) { best = b; bestA = a; }
  }
  if (S.bookOn) best = null;
  if (best !== S.cand) { S.cand = best; S.candT = 0; }
  S.candT += dt;
  if (S.cand !== S.locked && S.candT > (S.cand ? 0.2 : 0.5)) setLock(S.cand);
  if (S.locked && (S.lockT += dt) > CFG.resing && !S.locked.singing) { S.lockT = 0; sing(S.locked); }
  // Mantener el ave en la mira: primero se abre la ficha (y se acerca), después se toma la foto.
  if (S.locked && S.cand === S.locked && !S.shotDone) {
    S.dwell += dt;
    if (!S.cardOpen && S.dwell > CFG.dwellCard) toggleCard();
    if (S.dwell > CFG.dwellPhoto) { S.shotDone = true; S.shot = true; }
  } else if (!S.locked) S.dwell = 0;
  ring(S.locked && !S.shotDone ? S.dwell / CFG.dwellPhoto : 0, S.locked?.color);
}
function ring(p, color) {
  all('.e-reticle', el => { el.classList.toggle('ringing', p > 0); el.style.setProperty('--p', clamp(p, 0, 1).toFixed(3)); if (color) el.style.setProperty('--k', color); });
}
// Con la ficha abierta el zoom acerca el ave hasta que ocupe CFG.frame del campo visual (salvo que se use Z / X).
function autoZoom() {
  if (S.manualZoom) return;
  if (!S.locked || !S.cardOpen) { S.fovGoal = CFG.fovWide; return; }
  const b = S.locked, d = centerOf(b, _c).distanceTo(eye), size = Math.max(0.5, (b.m.height ?? 2.5) * b.s * 1.4);
  S.fovGoal = clamp(2 * Math.atan(size / 2 / d) * 180 / Math.PI / CFG.frame, CFG.fovTele, CFG.fovWide);
}
// Mirar al cielo: aparece el mes siguiente y, si se sigue mirando, se pasa a él.
function sky(dt) {
  const up = S.pitch > CFG.skyPitch && !S.locked;
  show('.e-sky', up);
  if (!up) { if (S.skyT) { S.skyT = 0; ring(0); } return; }
  S.skyT += dt;
  const next = S.index.months[(S.month + 1) % 12];
  html('.e-sky', `<small>sigue mirando el cielo para pasar a</small><b>${cap(next)}</b><small>${cap(S.index.months[S.month])} de ${YEAR} ahora</small>`);
  ring(S.skyT / CFG.skyHold, '#f2d36b');
  if (S.skyT > CFG.skyHold) { S.skyT = -1.5; setMonth(S.month + 1); } // −1.5: una pausa antes de poder volver a pasar
}

function setLock(b) {
  if (S.locked) S.locked.m.setOutline?.(null);
  S.locked = b; S.lockT = 0; S.cardOpen = false; S.dwell = 0; S.shotDone = false; S.manualZoom = false;
  all('.e-reticle', el => { el.classList.toggle('on', !!b); if (b) el.style.setProperty('--k', b.color); });
  if (b) { b.m.setOutline?.(b.color); blip(880, 0.04); sing(b); }
  renderCard();
}

async function sing(b, full = false) {
  if (b.singing) return;
  let dur = 0;
  if (b.sp.clip) {
    const buf = await loadClip(full ? b.sp.clip.src : b.sp.clip.grain);
    if (buf && b === S.locked) { dur = Math.min(full ? 12 : 6, buf.duration); if (b.sing(dur)) playAt(buf, b.m.group.position, 1.3); }
  } else if (b === S.locked) { dur = playSynth(b.m.group.position, b.sp.id) || 1.5; b.sing(dur); }
  if (dur) duckAmbience(dur);
}

function recordLine(b) {
  const e = S.reg.region.years[YEAR][S.month].cast.find(c => c[0] === b.sp.id);
  const days = new Date(+YEAR, S.month + 1, 0).getDate(), mes = S.index.months[S.month];
  if (e) return `${cap(mes)} de ${YEAR}: registrada <b>${e[1]} de ${days}</b> días${b.pr.offSeason ? ' (fuera de su temporada habitual)' : ''}`;
  return `${cap(mes)} de ${YEAR}: ${b.pr.scarce ? 'ese mes escaseó' : 'pocos registros'} (fuera de las 30 más registradas)`;
}
function renderCard() {
  const b = S.locked;
  show('.e-card', !!b && !S.bookOn);
  if (!b) return;
  const sp = b.sp, ph = progress.album[sp.id];
  const head = `<h3>${sp.comName}</h3>`;
  const chip = `<span class="chip">${CLASS_LABEL[b.cls] || b.cls}</span>`;
  all('.e-card', el => { el.style.setProperty('--k', b.color); el.classList.toggle('full', S.cardOpen); });
  if (!S.cardOpen) { html('.e-card', `${head}${chip} ${ph ? `<span class="stars">${starText(ph.stars)}</span>` : ''}`); return; }
  const months = S.index.months.map((m, i) => `<i class="${presentIn(sp, i) ? 'in' : ''}${i === S.month ? ' now' : ''}">${m[0].toUpperCase()}</i>`).join('');
  html('.e-card', `${head}<div class="sci">${sp.sciName}</div>${chip} ${ph ? `<span class="stars">${starText(ph.stars)}</span>` : ''}
    <div class="ln">${S.reg.meta.name} · ${S.reg.terrain.scenes[S.sceneKey].name}</div>
    <div class="ln">${recordLine(b)}</div>
    <div class="months" title="Meses en que se registra">${months}</div>`);
}
function toggleCard() {
  if (!S.locked) { toast('Pon un ave en la mira para ver su ficha.', 2); return; }
  S.cardOpen = !S.cardOpen; blip(S.cardOpen ? 780 : 560, 0.04);
  renderCard();
  if (S.cardOpen) sing(S.locked, true);
}

// ------------------------------------------------------------------ foto y libreta
function thumb() { // recorta el centro (4:3) del primer lente; llamar justo después de dibujar
  const r = S.rects[0], k = S.k, side = Math.min(r.w, r.h * 4 / 3) * k;
  const cv = document.createElement('canvas'); cv.width = 160; cv.height = 120;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  g.drawImage(canvas, (r.x + r.w / 2) * k - side / 2, (r.y + r.h / 2) * k - side * 0.375, side, side * 0.75, 0, 0, 160, 120);
  return cv.toDataURL('image/jpeg', 0.82);
}
function takePhoto() {
  const fl = $('flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
  blip(1200, 0.03); setTimeout(() => blip(700, 0.04), 60);
  const best = scorePhoto(S.locked ? [S.locked] : S.birds, camera, S.sc.ground);
  if (!best) { toast('No salió ningún ave en la foto.', 2); return; }
  const b = best.agent, code = S.reg.meta.code, img = thumb();
  const res = savePhoto(b.sp.id, { img, score: best.score, stars: best.stars, region: code, month: S.month, year: YEAR, tags: best.tags });
  markSeen(code, b.sp.id);
  const book = new Set(store('aviario.libreta') || []); book.add(b.sp.id); store('aviario.libreta', [...book]); // libreta del Aviario
  const got = S.zoneSpecies.filter(sp => progress.album[sp.id]).length;
  const msg = res === 'nueva' ? `¡Nueva en tu libreta! ${got} de ${S.zoneSpecies.length} en esta zona` : res === 'mejor' ? '¡Tu mejor foto de esta especie!' : 'Ya tenías una foto mejor. Prueba con más zoom.';
  toast(`<img src="${img}" alt=""><b>${b.sp.comName}</b> <span class="stars">${starText(best.stars)}</span><br>${msg}`, 4);
  syncMarks(); renderCard();
}
function renderBook() {
  const cells = S.zoneSpecies.map(sp => {
    const ph = progress.album[sp.id];
    return `<div class="cell">${ph ? `<img src="${ph.img}" alt="">${sp.comName}` : '<div class="none">?</div>&nbsp;'}</div>`;
  }).join('');
  const got = S.zoneSpecies.filter(sp => progress.album[sp.id]).length;
  html('.e-book', `<h3>LIBRETA · ${got} de ${S.zoneSpecies.length}</h3><div class="grid">${cells}</div>`);
}
function setBook(on) {
  if (on === S.bookOn) return;
  S.bookOn = on;
  if (on) { renderBook(); blip(600, 0.05); }
  show('.e-book', on); show('.e-reticle', !on); show('.e-toast', false);
  renderCard();
}

// ------------------------------------------------------------------ giroscopio del teléfono
const gyro = { have: false, h: 0, p: 0, off: 0 };
{
  const e3 = new THREE.Euler(), qd = new THREE.Quaternion(), q0 = new THREE.Quaternion(), f = new THREE.Vector3();
  const q1 = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2), Z = new THREE.Vector3(0, 0, 1), D = Math.PI / 180;
  gyro.onEvent = ev => {
    if (ev.alpha == null || ev.beta == null) return;
    const orient = (screen.orientation?.angle ?? window.orientation ?? 0) * D;
    e3.set(ev.beta * D, ev.alpha * D, -ev.gamma * D, 'YXZ');
    qd.setFromEuler(e3).multiply(q1).multiply(q0.setFromAxisAngle(Z, -orient));
    f.set(0, 0, -1).applyQuaternion(qd);
    gyro.h = Math.atan2(f.x, -f.z); gyro.p = Math.asin(clamp(f.y, -1, 1));
    if (!gyro.have) { gyro.have = true; gyro.off = S.heading - gyro.h; }
  };
}
async function startGyro() {
  try {
    if (typeof DeviceOrientationEvent === 'undefined') return;
    if (DeviceOrientationEvent.requestPermission && await DeviceOrientationEvent.requestPermission() !== 'granted') return; // iPhone
    window.addEventListener('deviceorientation', gyro.onEvent);
  } catch { /* sin sensor o sin permiso: quedan las flechas y el arrastre */ }
}

// ------------------------------------------------------------------ teclado (Arduino) y puntero
const keys = new Set();
function zoom(dir) { S.manualZoom = true; S.fovGoal = clamp(S.fovGoal * (dir > 0 ? 0.86 : 1 / 0.86), CFG.fovTele, CFG.fovWide); }
function saveLens() { store('mirador.lentes', S.lens); layout(); }
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (S.mode === 'place') { if (k === ' ' || k === 'enter') { e.preventDefault(); wakeUp(); go(); } return; }
  if (S.mode === 'pause') { if (k === ' ' || k === 'enter') { e.preventDefault(); toPlace(); } return; }
  if ([' ', 'enter', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
  if (k === 'b') { S.bino = !S.bino; layout(); return; }
  if (k === '[' || k === ']') { S.lens.sep = clamp(S.lens.sep + (k === ']' ? 0.5 : -0.5), 25, 50); saveLens(); return; }
  if (k === '-' || k === '=') { S.lens.dia = clamp(S.lens.dia + (k === '=' ? 0.5 : -0.5), 15, 50); saveLens(); return; }
  if (S.mode !== 'look') return;
  if (k.startsWith('arrow')) { keys.add(k); return; }
  if (k === 'z') zoom(1);
  else if (k === 'x') zoom(-1);
  if (e.repeat) return;
  if (k === ' ') S.shot = true; // se captura en el cuadro, justo después de dibujar
  else if (k === 'enter') toggleCard();
  else if (k === 'm') setMonth(S.month + 1);
  else if (k === 'n') setMonth(S.month - 1);
  else if (k === 'l') S.bookKey = !S.bookKey;
  else if (k === 'c') { S.pitch = 0; if (gyro.have) gyro.off = S.heading - gyro.h; }
  else if (k === 'escape') pause();
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

let drag = null;
canvas.addEventListener('pointerdown', e => { if (S.mode === 'look') { drag = { x: e.clientX, y: e.clientY, moved: 0 }; canvas.setPointerCapture(e.pointerId); } });
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  const k = 0.0035 * S.fov / CFG.fovWide, dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (gyro.have) gyro.off -= dx * k; else { S.heading -= dx * k; S.pitch = clamp(S.pitch + dy * k, -1.2, 1.2); }
  drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
});
canvas.addEventListener('pointerup', () => { if (drag && drag.moved < 5 && S.mode === 'look') { if (gyro.have) pause(); else S.shot = true; } drag = null; });
canvas.addEventListener('wheel', e => { if (S.mode === 'look') { e.preventDefault(); zoom(e.deltaY < 0 ? 1 : -1); } }, { passive: false });

// ------------------------------------------------------------------ bucle
let last = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  requestAnimationFrame(frame);
  if (S.mode === 'place') placeCheck(dt);
  if (S.mode === 'look' && S.phone && gyro.have && portrait()) pause('Sacaste el teléfono del visor.');
  if (S.mode !== 'look' || !S.world) return;
  // mirada: giroscopio (las flechas corren el mundo) o flechas
  const turn = (keys.has('arrowright') ? 1 : 0) - (keys.has('arrowleft') ? 1 : 0), tilt = (keys.has('arrowup') ? 1 : 0) - (keys.has('arrowdown') ? 1 : 0);
  const rate = 1.2 * S.fov / CFG.fovWide;
  if (gyro.have) {
    gyro.off += turn * rate * dt;
    const f = 1 - Math.exp(-dt * (6 + 10 * S.fov / CFG.fovWide)); // con zoom se suaviza más el pulso
    S.heading += wrap(gyro.h + gyro.off - S.heading) * f;
    S.pitch += (gyro.p - S.pitch) * f;
  } else {
    S.heading += turn * rate * dt;
    S.pitch = clamp(S.pitch + tilt * rate * 0.7 * dt, -1.2, 1.2);
    if (S.locked && !tilt && !drag && !S.bookKey) { // sin giroscopio, la vista sube o baja sola hasta el ave elegida
      centerOf(S.locked, _c).sub(eye);
      S.pitch += (Math.atan2(_c.y, Math.hypot(_c.x, _c.z)) - S.pitch) * Math.min(1, dt * 4);
    }
  }
  S.heading = wrap(S.heading);
  if (Math.abs(S.fov - S.fovGoal) > 0.02) S.fov += (S.fovGoal - S.fov) * Math.min(1, dt * 10);
  camera.fov = S.fov; camera.updateProjectionMatrix();
  const cp = Math.cos(S.pitch);
  fwd.set(Math.sin(S.heading) * cp, Math.sin(S.pitch), -Math.cos(S.heading) * cp);
  camera.position.copy(eye); camera.lookAt(eye.x + fwd.x, eye.y + fwd.y, eye.z + fwd.z);
  camera.updateMatrixWorld();
  shared.uLightDir.value.set(0.45, 1, 0.35).normalize().transformDirection(camera.matrixWorldInverse);
  shared.uCutNear.value = 0;
  setListener(eye, fwd);

  acc += dt; // aves a 15 Hz, como en el Aviario
  for (let n = 0; acc >= 1 / 15 && n < 4; n++, acc -= 1 / 15) for (const b of S.birds) b.sim(1 / 15);
  S.sc.animate?.(now / 1000);
  setBook(S.bookKey || S.pitch < CFG.bookPitch);
  aim(dt);
  sky(dt);
  autoZoom();
  if (CFG.monthSeconds && !S.locked && !S.bookOn && (S.monthT += dt) > CFG.monthSeconds) setMonth(S.month + 1);

  renderer.setClearColor(S.fog);
  renderer.setScissorTest(true);
  const H = innerHeight, k = S.k;
  for (const r of S.rects) {
    const v = [r.x * k, (H - r.y - r.h) * k, r.w * k, r.h * k].map(Math.round);
    renderer.setViewport(...v); renderer.setScissor(...v);
    renderer.render(S.world, camera);
  }
  if (S.shot) { S.shot = false; if (!S.bookOn) takePhoto(); }
  updateMarks();
  html('.e-zoom', S.fov < CFG.fovWide - 0.5 ? `${(CFG.fovWide / S.fov).toFixed(1)}×` : '');
}

// ------------------------------------------------------------------ inicio
function syncSetup() {
  $('opt-bino').checked = S.bino; $('lens-opts').hidden = !S.bino;
  $('opt-sep').value = S.lens.sep; $('opt-dia').value = S.lens.dia;
  $('out-sep').textContent = S.lens.sep + ' %'; $('out-dia').textContent = S.lens.dia + ' %';
  layout();
}
$('opt-bino').onchange = e => { S.bino = e.target.checked; syncSetup(); };
$('opt-sep').oninput = e => { S.lens.sep = +e.target.value; store('mirador.lentes', S.lens); syncSetup(); };
$('opt-dia').oninput = e => { S.lens.dia = +e.target.value; store('mirador.lentes', S.lens); syncSetup(); };

// Empieza solo cuando el teléfono queda de lado (horizontal), mirando al frente y quieto un momento.
const portrait = () => innerHeight > innerWidth;
function placeCheck(dt) {
  if (!gyro.have) return;
  const moved = S.placeLast ? Math.abs(wrap(gyro.h - S.placeLast.h)) + Math.abs(gyro.p - S.placeLast.p) : 1;
  S.placeLast = { h: gyro.h, p: gyro.p };
  const ok = !portrait() && Math.abs(gyro.p) < 0.5 && moved < 0.6 * dt * 4;
  S.placeT = ok ? S.placeT + dt : 0;
  $('place-msg').textContent = portrait() ? 'Gíralo de lado, con la pantalla hacia los tubos, y míralo como unos binoculares.'
    : ok ? 'Quieto… ¡ya casi!' : 'Ahora mira hacia el frente, como con unos binoculares.';
  if (S.placeT > CFG.placeHold) go();
}

buildEyes();
syncSetup();
showScreen('pick');
requestAnimationFrame(frame);
Promise.all([loadWorld(), loadKit()]).then(async ([index]) => {
  S.index = index;
  const r = q.get('r'), z = q.get('z');
  if (r && CFG.regions.includes(r)) {
    await enterRegion(r);
    if (z && S.reg.terrain.scenes[z]) { await enterZone(z); if (q.has('auto')) { unlockAudio(); go(); } else toPlace(); }
  } else if (standalone() && CFG.regions.includes(store('mirador.region'))) await enterRegion(store('mirador.region')); // app instalada: la última región
  else regionList();
  installHint();
}).catch(err => { $('pick-status').textContent = 'No se pudieron cargar los datos: ' + err.message; });

window.M = S; window.dbg = { setMonth, enterRegion, enterZone, pause, go, setLock, takePhoto, gyro, camera, CFG }; // para depurar desde la consola

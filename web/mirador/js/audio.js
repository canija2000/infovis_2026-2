// Audio espacial: clips reales de Xeno-canto (species.clip) con PannerNode, y un canto sintetizado
// de respaldo para especies sin grabación (p. ej. la Turca). El AudioContext se crea con el primer
// clic (PRESS START), porque los navegadores bloquean el sonido hasta que hay interacción.
import { AUDIO_BASE } from './data.js';

let ac = null;
let master = null;
const buffers = new Map();

export function unlockAudio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
  }
  ac.resume();
  return ac;
}
export const audioReady = () => !!ac && ac.state === 'running';
export function setMuted(m) { if (master) master.gain.value = m ? 0 : 0.9; }

export async function loadClip(src) {
  if (!ac || !src) return null;
  if (buffers.has(src)) return buffers.get(src);
  const p = fetch(AUDIO_BASE + src).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).catch(() => null);
  buffers.set(src, p);
  return p;
}

function panner(pos) {
  const p = ac.createPanner();
  p.panningModel = 'equalpower'; p.distanceModel = 'inverse';
  p.refDistance = 5; p.rolloffFactor = 1.1; p.maxDistance = 80;
  if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
  else p.setPosition(pos.x, pos.y, pos.z);
  p.connect(master);
  return p;
}

export function setListener(pos, forward) {
  if (!ac) return;
  const L = ac.listener;
  if (L.positionX) {
    L.positionX.value = pos.x; L.positionY.value = pos.y; L.positionZ.value = pos.z;
    L.forwardX.value = forward.x; L.forwardY.value = forward.y; L.forwardZ.value = forward.z;
    L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
  } else {
    L.setPosition(pos.x, pos.y, pos.z);
    L.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
  }
}

// Reproduce un buffer en la posición dada. Devuelve la duración (s) o 0.
export function playAt(buffer, pos, gain = 1) {
  if (!audioReady() || !buffer) return 0;
  const src = ac.createBufferSource(); src.buffer = buffer;
  const g = ac.createGain(); g.gain.value = gain;
  src.connect(g); g.connect(panner(pos));
  src.start();
  return buffer.duration;
}

// Canto sintético de respaldo: serie de notas graves descendentes (tipo "hu-hu-hu-huuu").
export function playSynth(pos, seed = 1) {
  if (!audioReady()) return 0;
  const t0 = ac.currentTime + 0.03;
  const out = ac.createGain(); out.gain.value = 0.35; out.connect(panner(pos));
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.connect(out);
  const n = 5 + (seed % 3);
  let t = t0;
  for (let i = 0; i < n; i++) {
    const d = i === n - 1 ? 0.35 : 0.13;
    const o = ac.createOscillator(); o.type = 'triangle';
    const f = 620 - i * 28;
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.86, t + d);
    const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9, t + 0.02); g.gain.linearRampToValueAtTime(0, t + d);
    o.connect(g); g.connect(lp); o.start(t); o.stop(t + d + 0.02);
    t += d + 0.09;
  }
  return t - t0;
}

// Pequeño efecto de interfaz (8 bits).
export function blip(f = 880, d = 0.06) {
  if (!audioReady()) return;
  const o = ac.createOscillator(); o.type = 'square'; o.frequency.value = f;
  const g = ac.createGain(); g.gain.value = 0.05;
  o.connect(g); g.connect(master); o.start(); o.stop(ac.currentTime + d);
}

// ---------------------------------------------------------------------------------------
// Ambiente por escena, sintetizado (sin archivos): viento, río, ciudad, brisa. Muy tenue y con
// "ducking": baja cuando canta un ave para no taparla.
let amb = null; // { out, nodes[], timers[] }
let noiseBuf = null;
function noise() {
  if (noiseBuf) return noiseBuf;
  const n = ac.sampleRate * 3;
  noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let b = 0;
  for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b = 0.98 * b + 0.02 * w; d[i] = w * 0.6 + b * 3; } // blanco + un poco de rosa
  return noiseBuf;
}
function noiseSrc() { const s = ac.createBufferSource(); s.buffer = noise(); s.loop = true; s.start(); return s; }
function lfo(freq, depth, target) {
  const o = ac.createOscillator(); o.frequency.value = freq;
  const g = ac.createGain(); g.gain.value = depth;
  o.connect(g); g.connect(target); o.start();
  return o;
}

export function setAmbience(kind) {
  if (!ac) return;
  if (amb) {
    const old = amb; amb = null;
    old.out.gain.setTargetAtTime(0, ac.currentTime, 0.4);
    setTimeout(() => { old.nodes.forEach(n => { try { n.stop?.(); n.disconnect(); } catch { /* ya detenido */ } }); old.timers.forEach(clearTimeout); }, 2000);
  }
  if (!kind) return;
  const out = ac.createGain(); out.gain.value = 0; out.connect(master);
  const bed = ac.createGain(); bed.connect(out); // lecho (se atenúa con ducking)
  const nodes = [], timers = [];
  const level = { cordillera: 0.11, bofedal: 0.1, lago: 0.1, rio: 0.12, ciudad: 0.07, matorral: 0.05 }[kind] ?? 0.04;
  if (kind === 'cordillera' || kind === 'bofedal' || kind === 'lago') { // viento de altura
    const s = noiseSrc(); const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.7;
    const g = ac.createGain(); g.gain.value = 0.6;
    s.connect(bp); bp.connect(g); g.connect(bed);
    nodes.push(s, lfo(0.07, 0.35, g.gain), lfo(0.13, 260, bp.frequency));
  } else if (kind === 'rio') {
    const s = noiseSrc(); const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180;
    const g = ac.createGain(); g.gain.value = 0.8;
    s.connect(hp); hp.connect(lp); lp.connect(g); g.connect(bed);
    nodes.push(s, lfo(3.1, 0.12, g.gain), lfo(0.4, 250, lp.frequency));
  } else if (kind === 'ciudad') {
    const s = noiseSrc(); const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    const g = ac.createGain(); g.gain.value = 1.2;
    s.connect(lp); lp.connect(g); g.connect(bed);
    nodes.push(s, lfo(0.05, 0.4, g.gain));
    const horn = (echo = false) => {
      if (amb?.out !== out) return;
      const t = ac.currentTime + 0.05, d = 0.25 + Math.random() * 0.4;
      const pan = ac.createStereoPanner ? ac.createStereoPanner() : ac.createGain();
      if (pan.pan) pan.pan.value = Math.random() * 1.6 - 0.8;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1300;
      const hg = ac.createGain(); hg.gain.setValueAtTime(0, t); hg.gain.linearRampToValueAtTime(0.09, t + 0.03); hg.gain.setValueAtTime(0.09, t + d); hg.gain.linearRampToValueAtTime(0, t + d + 0.05);
      for (const fr of [350, 440]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr * (0.95 + Math.random() * 0.1); o.connect(f); o.start(t); o.stop(t + d + 0.1); }
      f.connect(hg); hg.connect(pan); pan.connect(out);
      if (echo) return;
      if (Math.random() < 0.3) timers.push(setTimeout(() => horn(true), (d + 0.15) * 1000)); // bocinazo doble
      timers.push(setTimeout(horn, 9000 + Math.random() * 16000));
    };
    timers.push(setTimeout(horn, 4000 + Math.random() * 6000));
  } else {
    const s = noiseSrc(); const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650;
    const g = ac.createGain(); g.gain.value = 0.7;
    s.connect(lp); lp.connect(g); g.connect(bed);
    nodes.push(s, lfo(0.09, 0.3, g.gain));
  }
  out.gain.setTargetAtTime(level, ac.currentTime, 1.2);
  amb = { out, bed, nodes, timers, level };
}

export function duckAmbience(secs) {
  if (!amb || !ac) return;
  const g = amb.bed.gain, t = ac.currentTime;
  g.cancelScheduledValues(t);
  g.setTargetAtTime(0.45, t, 0.15);
  g.setTargetAtTime(1, t + secs, 0.6);
}

// Motor de la Citroneta: dos osciladores graves por un filtro; level null = apagado, 0..1 = régimen.
let eng = null;
export function engine(level) {
  if (!audioReady()) return;
  const t = ac.currentTime;
  if (level == null) {
    if (eng) { const e = eng; eng = null; e.g.gain.setTargetAtTime(0, t, 0.08); setTimeout(() => { e.o.stop(); e.o2.stop(); }, 600); }
    return;
  }
  if (!eng) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 420; g.gain.value = 0;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(master); o.start(); o2.start();
    eng = { o, o2, g };
  }
  eng.o.frequency.setTargetAtTime(34 + level * 62, t, 0.1);
  eng.o2.frequency.setTargetAtTime(17 + level * 31, t, 0.1);
  eng.g.gain.setTargetAtTime(0.035 + level * 0.03, t, 0.1);
}
// Bocina de 2CV: un "meep" nasal de dos tonos.
export function horn() {
  if (!audioReady()) return;
  for (const f of [392, 466]) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = 'square'; o.frequency.value = f; g.gain.value = 0.04;
    o.connect(g); g.connect(master); o.start(); o.stop(ac.currentTime + 0.32);
  }
}

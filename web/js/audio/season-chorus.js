import { createBufferCache } from "./buffers.js";
import { bestWindow, songPitch } from "./species-year-plan.js";
import {
  LAYERS,
  layerState,
  nextInterval,
  residentDuck,
} from "./season-chorus-plan.js";
import {
  beakOpening,
  createMeterState,
  detectOnset,
} from "./season-chorus-meter.js";

/**
 * Motor de «El coro de las estaciones» (Web Audio, sin dependencias).
 *
 * No tiene reloj propio: la página mueve la barra y le dice al motor cuántas especies de cada
 * grupo hay en ese punto (setCounts). Cada 50 ms el motor agenda, con 250 ms de anticipación, los
 * cantos que tocan en cada capa. Los cantos llegan como un proceso de Poisson (las aves no cantan
 * a compás), con una tasa y un número de aves que siguen al dato (season-chorus-plan.js).
 *
 * Una capa (residentes, verano o invierno):
 *   ave → envolvente → [pasa-bajos según distancia] → paneo ┐
 *   ave → envolvente → …                                    ├→ capa ┬→ medidor (pico y notas)
 *                         └→ envío de eco (según distancia) ┘       └→ nivel (las residentes
 *                                                                       ceden espacio) → salida
 * Un limitador final evita saturar; no hay compresor: la densidad del coro es el dato.
 */
const LOOKAHEAD = 0.25; // s que se agendan por adelantado
const TICK_MS = 50;
const TARGET_RMS = 0.09; // todas las grabaciones se igualan a este nivel antes de aplicar el dato
const VOICE_SCALE = 0.42; // volumen de un ave dentro del coro
const ATTACK = 0.06;
const RELEASE = 0.35;
const WINDOW_SECONDS = 1.2; // tramos del clip donde hay canto (para no empezar en un silencio)
const REVERB_SECONDS = 2.4;
const FADE = 0.25;
// Nivel del medidor que abre el pico por completo, por capa (las residentes suenan lejos y bajo).
const METER_REFERENCE = [0.018, 0.05, 0.045];

export function createSeasonChorus() {
  let ctx = null;
  let master = null;
  let impulse = null;
  let session = null;
  let counts = [0, 0, 0];
  let peaks = [1, 1, 1];
  const clips = { 0: [], 1: [], 2: [] };
  const analysed = new WeakMap(); // AudioBuffer → tramos con canto, nivel y tono
  const meters = [0, 1, 2].map(() => createMeterState());
  const { buffers, load: loadBuffers } = createBufferCache({
    getContext: ensure,
  });

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(limiter).connect(ctx.destination);
    return ctx;
  }

  // Dentro del clic: Safari solo desbloquea el audio si algo empieza a sonar en el mismo gesto.
  function unlock() {
    if (!ensure()) return false;
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    const silent = ctx.createBufferSource();
    silent.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    silent.connect(ctx.destination);
    silent.start(0);
    return true;
  }

  // Tramos con canto de un clip (los de más energía, sin solaparse), su nivel y su tono.
  function analyse(buffer) {
    const mono = new Float32Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i++)
        mono[i] += data[i] / buffer.numberOfChannels;
    }
    const rate = buffer.sampleRate;
    const best = bestWindow(mono, rate, WINDOW_SECONDS);
    const norm = Math.min(
      6,
      Math.max(0.25, TARGET_RMS / Math.max(best.rms, 1e-6)),
    );
    const a = Math.round(best.start * rate);
    const pitch = songPitch(
      mono.subarray(a, a + Math.round(WINDOW_SECONDS * rate)),
      rate,
    );
    // Arranques candidatos: cada 0,25 s, quedan los que tienen al menos 35 % de la energía del mejor.
    const hop = Math.round(0.25 * rate);
    const width = Math.round(WINDOW_SECONDS * rate);
    const energy = [];
    for (let i = 0; i + width <= mono.length; i += hop) {
      let sum = 0;
      for (let j = i; j < i + width; j += 4) sum += mono[j] * mono[j];
      energy.push({ start: i / rate, sum });
    }
    const top = Math.max(...energy.map((e) => e.sum), 1e-12);
    const starts = energy
      .filter((e) => e.sum >= 0.35 * top)
      .map((e) => e.start);
    return {
      buffer,
      norm,
      pitch,
      starts: starts.length ? starts : [best.start],
    };
  }

  /** urls: { 0: [...], 1: [...], 2: [...] }. Devuelve false si falta alguna capa. */
  async function load(urls) {
    if (!ensure()) return false;
    const all = Object.values(urls).flat();
    await loadBuffers(all);
    for (const k of [0, 1, 2]) {
      clips[k] = urls[k]
        .map((url) => buffers.get(url))
        .filter(Boolean)
        .map((buffer) => {
          if (!analysed.has(buffer)) analysed.set(buffer, analyse(buffer));
          return analysed.get(buffer);
        });
    }
    return [0, 1, 2].every((k) => clips[k].length > 0);
  }

  function reverbImpulse() {
    if (impulse) return impulse;
    const length = Math.round(ctx.sampleRate * REVERB_SECONDS);
    impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = impulse.getChannelData(c);
      for (let i = 0; i < length; i++)
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.6);
    }
    return impulse;
  }

  function buildGraph() {
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.gain.exponentialRampToValueAtTime(1, ctx.currentTime + FADE);
    out.connect(master);
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.045;
    const reverb = ctx.createConvolver();
    reverb.buffer = reverbImpulse();
    delay.connect(reverb).connect(out);
    const layers = [0, 1, 2].map((k) => {
      const input = ctx.createGain();
      const fader = ctx.createGain();
      fader.gain.value = 1;
      input.connect(fader).connect(out);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      input.connect(analyser);
      return {
        k,
        input,
        fader,
        analyser,
        frame: new Float32Array(analyser.fftSize),
        nextAt: ctx.currentTime + (k === 0 ? 0 : 0.15 + Math.random() * 0.4),
        last: -1,
      };
    });
    return { out, delay, layers };
  }

  function pick(layer) {
    const options = clips[layer.k];
    let j = Math.floor(Math.random() * options.length);
    if (options.length > 1 && j === layer.last)
      j =
        (j + 1 + Math.floor(Math.random() * (options.length - 1))) %
        options.length;
    layer.last = j;
    return options[j];
  }

  function voice(layer, at, state) {
    const spec = LAYERS[layer.k];
    const clip = pick(layer);
    const rate = 1 + (Math.random() - 0.5) * 0.07;
    const duration = spec.phrase * (0.85 + Math.random() * 0.3);
    const want = duration * rate;
    const candidates = clip.starts.filter(
      (s) => s + want <= clip.buffer.duration - 0.02,
    );
    const offset = candidates.length
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : Math.max(0, clip.buffer.duration - want - 0.02);
    const distance = Math.min(
      1,
      state.distance + (spec.fixed ? 0 : Math.random() * 0.15),
    );
    const gain =
      state.gain * clip.norm * VOICE_SCALE * (0.8 + Math.random() * 0.2);

    const src = ctx.createBufferSource();
    src.buffer = clip.buffer;
    src.playbackRate.value = rate;
    const env = ctx.createGain();
    const release = Math.min(RELEASE, duration / 2);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + ATTACK);
    env.gain.setValueAtTime(gain, at + duration - release);
    env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    src.connect(env);
    let node = env;
    if (distance > 0.05) {
      // Lejos: apagado respecto del tono propio del canto, para que un picaflor y una tórtola
      // suenen igual de lejanos.
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = Math.min(
        ctx.sampleRate / 2 - 100,
        Math.max(700, clip.pitch * (2.2 - 1.6 * distance)),
      );
      filter.Q.value = Math.SQRT1_2;
      node = node.connect(filter);
    }
    const send = ctx.createGain();
    send.gain.value = 0.08 + 0.9 * distance;
    node.connect(send).connect(session.graph.delay);
    if (ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(
        -1,
        Math.min(1, spec.pan + (Math.random() * 2 - 1) * spec.spread),
      );
      node.connect(panner).connect(layer.input);
    } else node.connect(layer.input);
    src.start(at, offset, want + 0.02);
    session.sources.push({ src, env, at, end: at + duration, k: layer.k });
  }

  function tick() {
    if (!session) return;
    const now = ctx.currentTime;
    session.sources = session.sources.filter((s) => s.end > now - 0.5);
    const states = [0, 1, 2].map((k) => layerState(k, counts[k], peaks[k]));
    const duck = residentDuck(states.map((s) => s.level));
    const resident = session.graph.layers[0].fader.gain;
    resident.setTargetAtTime(duck, now, 0.4);
    for (const layer of session.graph.layers) {
      const state = states[layer.k];
      const spec = LAYERS[layer.k];
      // Poisson no homogéneo por «adelgazamiento»: candidatos a la tasa del pico, y cada uno
      // se acepta con la proporción de la tasa actual. Así un aumento de especies se oye de
      // inmediato, sin esperar un intervalo largo calculado cuando había pocas.
      if (layer.nextAt < now) layer.nextAt = now + 0.02;
      while (layer.nextAt < now + LOOKAHEAD) {
        const at = layer.nextAt;
        layer.nextAt += nextInterval(spec.rate);
        if (Math.random() >= state.rate / spec.rate) continue;
        const singing = session.sources.filter(
          (s) => s.k === layer.k && s.end > at && s.at <= at,
        ).length;
        if (singing < state.birds) voice(layer, at, state);
      }
    }
  }

  /** peaks: el pico de cada grupo durante el año. Empieza a cantar (o sigue, si ya cantaba). */
  function start(groupPeaks) {
    if (!ensure() || session) return Boolean(session);
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    peaks = groupPeaks;
    session = { graph: buildGraph(), sources: [], timer: null };
    session.timer = setInterval(tick, TICK_MS);
    tick();
    return true;
  }

  function setCounts(next) {
    counts = next;
  }

  function stop() {
    if (!session) return;
    const { graph, sources, timer } = session;
    session = null;
    clearInterval(timer);
    const now = ctx.currentTime;
    graph.out.gain.cancelScheduledValues(now);
    graph.out.gain.setValueAtTime(Math.max(0.0001, graph.out.gain.value), now);
    graph.out.gain.exponentialRampToValueAtTime(0.0001, now + FADE);
    for (const { src, at } of sources) {
      if (at > now) src.stop();
      else src.stop(now + FADE + 0.05);
    }
    setTimeout(() => graph.out.disconnect(), (FADE + 3) * 1000);
    meters.forEach((m) => Object.assign(m, createMeterState()));
  }

  /** Por capa: apertura del pico (0–1), si empieza una sílaba y el nivel medido. */
  function read(dt) {
    if (!session) return null;
    const time = ctx.currentTime;
    return session.graph.layers.map((layer) => {
      layer.analyser.getFloatTimeDomainData(layer.frame);
      let sum = 0;
      for (const v of layer.frame) sum += v * v;
      const rms = Math.sqrt(sum / layer.frame.length);
      const meter = meters[layer.k];
      const onset = detectOnset(meter, rms, time);
      const open = beakOpening(meter, rms, METER_REFERENCE[layer.k], dt);
      return {
        rms,
        open,
        onset,
        strength: Math.min(1, rms / METER_REFERENCE[layer.k]),
      };
    });
  }

  return {
    unlock,
    load,
    start,
    setCounts,
    stop,
    read,
    get running() {
      return session !== null;
    },
    get audioRunning() {
      return Boolean(ctx) && ctx.state === "running";
    },
  };
}

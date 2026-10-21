import { createBufferCache } from "./buffers.js";
import { songPitch } from "./species-year-plan.js";
import {
  LAYERS,
  SPECIES,
  freeSlot,
  layerState,
  nextInterval,
  residentDuck,
} from "./season-chorus-plan.js";
import {
  analyseSong,
  beakOpening,
  envelopeAt,
  thinOnsets,
} from "./season-chorus-meter.js";

/**
 * Motor de «El coro de las estaciones» (Web Audio, sin dependencias).
 *
 * No tiene reloj propio: la página mueve la barra y le dice al motor cuántas especies de cada
 * grupo hay en ese punto (setCounts). Cada 50 ms el motor agenda, con 250 ms de anticipación, los
 * cantos que tocan en cada capa: las residentes, uno tras otro; las visitantes, al azar (proceso de
 * Poisson), con una tasa y un número de aves que siguen al dato (season-chorus-plan.js).
 *
 * Cada canto ocupa un «lugar» de su grupo, y cada lugar es un ave dibujada: la 0, posada en la
 * curva; las demás, a su lado, solo mientras cantan. El lugar decide también de dónde suena (más
 * afuera en el estéreo cuanto más lejos de la barra está el ave). Para que el pico se mueva con el
 * canto, read() devuelve, por ave, la envolvente de su propia voz en el instante que se oye (el
 * reloj del audio menos la latencia de salida) y las sílabas que acaban de empezar.
 *
 *   canto → banda de la especie → envolvente → [pasa-bajos según distancia] → paneo → capa → salida
 *                                                └→ eco (según distancia)
 * Un limitador final evita saturar; no hay compresor: la densidad del coro es el dato.
 */
const LOOKAHEAD = 0.25; // s que se agendan por adelantado
const TICK_MS = 50;
const TARGET_RMS = 0.09; // todas las grabaciones se igualan a este nivel antes de aplicar el dato
const VOICE_SCALE = 0.22; // volumen de un ave dentro del coro
const ATTACK = 0.02;
const RELEASE = 0.12;
const REVERB_SECONDS = 2.2;
const FADE = 0.25;
const SHOW = 0.3; // s que un ave acompañante aparece antes de cantar y se queda después
const SLOT_GAP = 0.15; // un lugar queda libre un poco después de que su ave termina

export function createSeasonChorus() {
  let ctx = null;
  let master = null;
  let impulse = null;
  let session = null;
  let counts = [0, 0, 0];
  let peaks = [1, 1, 1];
  const clips = { 0: null, 1: null, 2: null };
  const analysed = new WeakMap(); // AudioBuffer → envolvente, sílabas, nivel y tono
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

  // El tramo de la especie: envolvente y sílabas (para el ave), nivel (para igualar) y tono.
  function analyse(buffer, spec) {
    const rate = buffer.sampleRate;
    const a = Math.min(buffer.length - 1, Math.round(spec.start * rate));
    const b = Math.min(buffer.length, a + Math.round(spec.length * rate));
    const mono = new Float32Array(b - a);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = a; i < b; i++)
        mono[i - a] += data[i] / buffer.numberOfChannels;
    }
    const song = analyseSong(mono, rate, spec.band);
    return {
      buffer,
      spec,
      length: (b - a) / rate,
      ...song,
      onsets: thinOnsets(song.onsets, spec.noteMin, spec.noteGap),
      norm: Math.min(8, Math.max(0.25, TARGET_RMS / Math.max(song.rms, 1e-6))),
      pitch: songPitch(mono, rate),
    };
  }

  /** urls: { 0: url, 1: url, 2: url }, la grabación de la especie de cada grupo. */
  async function load(urls) {
    if (!ensure()) return false;
    await loadBuffers(Object.values(urls));
    for (const k of [0, 1, 2]) {
      const buffer = buffers.get(urls[k]);
      if (!buffer) return false;
      if (!analysed.has(buffer))
        analysed.set(buffer, analyse(buffer, SPECIES[k]));
      clips[k] = analysed.get(buffer);
    }
    return true;
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
      input.connect(out);
      return {
        k,
        input,
        busy: new Array(LAYERS[k].maxBirds).fill(-Infinity),
        nextAt: ctx.currentTime + (k === 0 ? 0.02 : 0.15 + Math.random() * 0.4),
      };
    });
    return { out, delay, layers };
  }

  // Lado del estéreo de cada ave: más afuera cuanto más lejos de la barra está dibujada.
  function panOf(k, slot) {
    const spec = LAYERS[k];
    const side = Math.sign(spec.pan);
    const share = spec.maxBirds > 1 ? slot / (spec.maxBirds - 1) : 0;
    return Math.max(
      -1,
      Math.min(1, spec.pan + side * spec.spread * (share - 0.35)),
    );
  }

  function voice(layer, slot, at, state) {
    const k = layer.k;
    const clip = clips[k];
    const spec = LAYERS[k];
    const rate = 1 + (Math.random() - 0.5) * 0.08; // cada ave, un poco más aguda o más grave
    const duration = clip.length / rate;
    const end = at + duration;
    const distance = Math.min(
      1,
      state.distance + (spec.fixed ? 0 : Math.random() * 0.12),
    );
    const gain =
      state.gain * clip.norm * VOICE_SCALE * (0.85 + Math.random() * 0.15);

    const src = ctx.createBufferSource();
    src.buffer = clip.buffer;
    src.playbackRate.value = rate;
    let node = src;
    const [low, high] = clip.spec.band;
    for (const [type, frequency] of [
      ["highpass", low],
      ["highpass", low],
      ["lowpass", high],
      ["lowpass", high],
    ]) {
      if (!frequency) continue;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      filter.Q.value = Math.SQRT1_2;
      node = node.connect(filter);
    }
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + ATTACK);
    env.gain.setValueAtTime(gain, Math.max(at + ATTACK, end - RELEASE));
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    node = node.connect(env);
    if (distance > 0.05) {
      // Lejos: apagado respecto del tono propio del canto.
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = Math.min(
        ctx.sampleRate / 2 - 100,
        Math.max(700, clip.pitch * (2.4 - 1.6 * distance)),
      );
      filter.Q.value = Math.SQRT1_2;
      node = node.connect(filter);
    }
    const send = ctx.createGain();
    send.gain.value = 0.06 + 0.8 * distance;
    node.connect(send).connect(session.graph.delay);
    if (ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = panOf(k, slot);
      node.connect(panner).connect(layer.input);
    } else node.connect(layer.input);
    src.start(at, clip.spec.start, clip.length + 0.02);
    layer.busy[slot] = end + SLOT_GAP;
    session.voices.push({ src, k, slot, at, end, rate, distance, open: 0 });
  }

  function tick() {
    if (!session) return;
    const now = ctx.currentTime;
    const states = [0, 1, 2].map((k) => layerState(k, counts[k], peaks[k]));
    const duck = residentDuck(states.map((s) => s.level));
    session.graph.layers[0].input.gain.setTargetAtTime(duck, now, 0.4);
    for (const layer of session.graph.layers) {
      const state = states[layer.k];
      const spec = LAYERS[layer.k];
      if (layer.nextAt < now) layer.nextAt = now + 0.02;
      while (layer.nextAt < now + LOOKAHEAD) {
        const at = layer.nextAt;
        if (spec.steady) {
          // Las residentes: un canto tras otro, con una pausa breve y variable.
          voice(layer, 0, at, state);
          layer.nextAt = layer.busy[0] - SLOT_GAP + 0.05 + Math.random() * 0.2;
          continue;
        }
        // Poisson no homogéneo por «adelgazamiento»: candidatos a la tasa del pico, aceptados
        // con la proporción de la tasa actual; así un aumento de especies se oye de inmediato.
        layer.nextAt += nextInterval(spec.rate);
        if (Math.random() >= state.rate / spec.rate) continue;
        const slot = freeSlot(layer.busy, at, state.birds);
        if (slot >= 0) voice(layer, slot, at, state);
      }
    }
  }

  /** peaks: el pico de cada grupo durante el año. Empieza a cantar (o sigue, si ya cantaba). */
  function start(groupPeaks) {
    if (!ensure() || session) return Boolean(session);
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    peaks = groupPeaks;
    session = { graph: buildGraph(), voices: [], timer: null, heard: null };
    session.timer = setInterval(tick, TICK_MS);
    tick();
    return true;
  }

  /**
   * «Así suena»: un solo canto del grupo k, como suena en el coro cuando el grupo está en su pico
   * (las residentes, a su distancia de siempre). Su ave posada canta. Devuelve cuánto dura (s).
   */
  function preview(k, groupPeaks) {
    stop();
    if (!ensure() || !clips[k]) return 0;
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    peaks = groupPeaks;
    session = { graph: buildGraph(), voices: [], timer: null, heard: null };
    const layer = session.graph.layers[k];
    const state = layerState(k, peaks[k], peaks[k]);
    voice(layer, 0, ctx.currentTime + 0.05, {
      ...state,
      distance: LAYERS[k].far,
    });
    return clips[k].length + 0.1;
  }

  function setCounts(next) {
    counts = next;
  }

  function stop() {
    if (!session) return;
    const { graph, voices, timer } = session;
    session = null;
    clearInterval(timer);
    const now = ctx.currentTime;
    graph.out.gain.cancelScheduledValues(now);
    graph.out.gain.setValueAtTime(Math.max(0.0001, graph.out.gain.value), now);
    graph.out.gain.exponentialRampToValueAtTime(0.0001, now + FADE);
    for (const { src, at } of voices) {
      if (at > now) src.stop();
      else src.stop(now + FADE + 0.05);
    }
    setTimeout(() => graph.out.disconnect(), (FADE + 3) * 1000);
  }

  /**
   * Lo que se oye ahora, ave por ave: para cada grupo, un arreglo con un elemento por lugar
   * (null si esa ave no está). Cada ave: visible (0–1, aparece y desaparece), open (pico 0–1),
   * onset (fuerza 0–1 de la sílaba que acaba de empezar, o 0) y distance (0 cerca, 1 lejos).
   */
  function read(dt) {
    if (!session) return null;
    // El instante que de verdad suena: el reloj del audio va adelante del parlante.
    const latency = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
    const heard = ctx.currentTime - latency;
    const before = session.heard ?? heard;
    session.heard = heard;
    session.voices = session.voices.filter((v) => v.end + SHOW + 1 > heard);
    return [0, 1, 2].map((k) => {
      const clip = clips[k];
      const birds = new Array(LAYERS[k].maxBirds).fill(null);
      for (const v of session.voices) {
        if (v.k !== k || heard < v.at - SHOW || heard > v.end + SHOW) continue;
        const current = birds[v.slot];
        if (current && current.at > v.at) continue;
        const t = (heard - v.at) * v.rate; // segundo del tramo que se oye
        const level =
          heard >= v.at && heard <= v.end ? envelopeAt(clip.env, t) : 0;
        v.open = beakOpening(v.open, level, dt);
        let onset = 0;
        for (const o of clip.onsets) {
          const when = v.at + o.t / v.rate;
          if (when > before && when <= heard)
            onset = Math.max(onset, o.strength);
        }
        const visible =
          heard < v.at
            ? 1 - (v.at - heard) / SHOW
            : heard > v.end
              ? 1 - (heard - v.end) / SHOW
              : 1;
        birds[v.slot] = {
          at: v.at,
          visible: Math.max(0, Math.min(1, visible)),
          open: v.open,
          onset,
          distance: v.distance,
        };
      }
      return birds;
    });
  }

  return {
    unlock,
    load,
    start,
    preview,
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

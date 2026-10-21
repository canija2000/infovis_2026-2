import { createBufferCache } from "./buffers.js";
import {
  PHRASE_SECONDS,
  bestWindow,
  planSpeciesYear,
  yearDuration,
} from "./species-year-plan.js";

/**
 * Motor de «Escuchar su año» (Web Audio, sin dependencias).
 * Programa de una vez las doce frases del canto con su volumen y avisa qué mes suena,
 * para que la página mueva el cursor. Cada página crea su propio reproductor.
 * Sin compresor: el volumen es el dato y no debe aplanarse; solo un limitador evita saturar.
 */
const TARGET_RMS = 0.09; // todas las grabaciones se igualan a este nivel antes de aplicar el dato
const ATTACK = 0.03;
const RELEASE = 0.3;

export function createSpeciesYearPlayer() {
  let ctx = null;
  let master = null;
  let session = null;
  let token = 0;
  const windows = new Map();
  const { buffers, load } = createBufferCache({ getContext: ensure });

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

  // El navegador solo deja sonar audio tras un gesto: se llama dentro del clic, antes de cargar nada.
  function unlock() {
    if (!ensure()) return false;
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    return true;
  }

  function windowOf(url, buffer) {
    if (!windows.has(url)) {
      const mono = new Float32Array(buffer.length);
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const data = buffer.getChannelData(c);
        for (let i = 0; i < data.length; i++)
          mono[i] += data[i] / buffer.numberOfChannels;
      }
      const { start, rms } = bestWindow(
        mono,
        buffer.sampleRate,
        PHRASE_SECONDS,
      );
      const norm = Math.min(
        6,
        Math.max(0.25, TARGET_RMS / Math.max(rms, 1e-6)),
      );
      windows.set(url, { start, norm });
    }
    return windows.get(url);
  }

  function phrase(buffer, offset, at, gain) {
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + ATTACK);
    env.gain.setValueAtTime(gain, at + PHRASE_SECONDS - RELEASE);
    env.gain.exponentialRampToValueAtTime(0.0001, at + PHRASE_SECONDS);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(env).connect(master);
    const length = Math.min(PHRASE_SECONDS, buffer.duration - offset);
    src.start(at, offset, length + 0.02);
    return { src, env, at };
  }

  function stop() {
    token += 1;
    if (!session) return;
    const { sources, timer, onEnd } = session;
    session = null;
    clearInterval(timer);
    const now = ctx.currentTime;
    for (const { src, env, at } of sources) {
      if (at > now) {
        src.stop();
        continue;
      }
      // Ya suena: baja en 80 ms en vez de cortar en seco.
      env.gain.cancelScheduledValues(now);
      env.gain.setValueAtTime(Math.max(0.0001, env.gain.value), now);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      src.stop(now + 0.1);
    }
    if (onEnd) onEnd({ completed: false });
  }

  /**
   * url: clip de la especie. steps: [{ month, profile, years }] en orden de recorrido.
   * onStep(index, step) se llama cuando empieza cada mes; onEnd({ completed }) al terminar o detener.
   * Devuelve false si el navegador no tiene Web Audio o el clip no se pudo cargar.
   */
  async function play({ url, steps, onStep, onEnd }) {
    stop();
    const mine = token;
    if (!unlock()) return false;
    await load([url]);
    if (mine !== token) return false; // otra reproducción o una detención llegó mientras cargaba
    const buffer = buffers.get(url);
    if (!buffer) return false;
    if (ctx.state !== "running") await ctx.resume().catch(() => {});
    if (mine !== token) return false;
    const { start, norm } = windowOf(url, buffer);
    const plan = planSpeciesYear(steps, ctx.currentTime);
    const sources = plan
      .filter((step) => step.gain > 0)
      .map((step) => phrase(buffer, start, step.at, step.gain * norm));
    const end = ctx.currentTime + yearDuration(steps.length) + 0.05;
    let next = 0;
    const tick = () => {
      if (!session || session.token !== mine) return;
      const now = ctx.currentTime;
      while (next < plan.length && plan[next].at <= now) {
        if (onStep) onStep(next, steps[next]);
        next += 1;
      }
      if (now >= end) {
        clearInterval(session.timer);
        session = null;
        if (onEnd) onEnd({ completed: true });
      }
    };
    session = {
      token: mine,
      sources,
      onEnd,
      timer: setInterval(tick, 25),
    };
    tick();
    return true;
  }

  return {
    unlock,
    play,
    stop,
    get playing() {
      return session !== null;
    },
  };
}

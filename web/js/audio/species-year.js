import { createBufferCache } from "./buffers.js";
import {
  PHRASE_SECONDS,
  bestWindow,
  lowpassRatio,
  planSpeciesYear,
  songPitch,
  yearDuration,
} from "./species-year-plan.js";

/**
 * Motor de «Escuchar su año» (Web Audio, sin dependencias).
 * Programa de una vez los doce meses (escena: número de aves, distancia y volumen) y avisa qué
 * mes suena, para que la página mueva el cursor. Cada página crea su propio reproductor.
 * Sin compresor: el volumen es parte del dato y no debe aplanarse; solo un limitador evita saturar.
 *
 * Cadena de un mes:  ave → envolvente → paneo ┐
 *                    ave → envolvente → paneo ├→ pasa-bajos (distancia) ┬→ directo → salida
 *                    ave → envolvente → paneo ┘                         └→ retardo → eco → salida
 */
const TARGET_RMS = 0.09; // todas las grabaciones se igualan a este nivel antes de aplicar el dato
const ATTACK = 0.015;
const RELEASE = 0.15;
const REVERB_SECONDS = 2.2; // cola del eco de un ave lejana
const PRE_DELAY = 0.04; // el eco llega un poco después que el sonido directo, como en un valle

export function createSpeciesYearPlayer() {
  let ctx = null;
  let master = null;
  let impulse = null; // respuesta al impulso del eco, generada una vez por contexto
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
  // Además de resume(), toca una muestra en silencio: Safari solo desbloquea el audio si algo
  // empieza a sonar dentro del mismo gesto.
  function unlock() {
    if (!ensure()) return false;
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    const silent = ctx.createBufferSource();
    silent.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    silent.connect(ctx.destination);
    silent.start(0);
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
      // Tramo del canto, para medir su tono y cuánto le quita cada filtro de distancia.
      const a = Math.round(start * buffer.sampleRate);
      const song = mono.subarray(
        a,
        a + Math.round(PHRASE_SECONDS * buffer.sampleRate),
      );
      const pitch = songPitch(song, buffer.sampleRate);
      const ratio = (cutoff) => lowpassRatio(song, buffer.sampleRate, cutoff);
      windows.set(url, { start, norm, pitch, ratio, cache: new Map() });
    }
    return windows.get(url);
  }

  // Eco sintético: ruido estéreo que decae. Basta para que un canto «lejano» suene en un espacio abierto.
  function reverbImpulse() {
    if (impulse) return impulse;
    const length = Math.round(ctx.sampleRate * REVERB_SECONDS);
    impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = impulse.getChannelData(c);
      for (let i = 0; i < length; i++)
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
    }
    return impulse;
  }

  // Distancia de una escena para este canto: filtro relativo a su tono y volumen compensado.
  function distanceOf(step, tone) {
    const nyquist = ctx.sampleRate / 2 - 100;
    if (step.muffle === null) return { cutoff: nyquist, makeup: 1 };
    const cutoff = Math.min(nyquist, Math.max(600, step.muffle * tone.pitch));
    if (!tone.cache.has(cutoff)) tone.cache.set(cutoff, tone.ratio(cutoff));
    const left = Math.max(0.02, tone.cache.get(cutoff));
    const makeup = Math.min(12, Math.pow(10, step.db / 20) / (step.dry * left));
    return { cutoff, makeup };
  }

  // Un mes: pasa-bajos y mezcla directo/eco según la escena; devuelve dónde conectar sus aves.
  function monthBus(step, cutoff, reverb) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    filter.Q.value = Math.SQRT1_2;
    const dry = ctx.createGain();
    dry.gain.value = step.dry;
    filter.connect(dry).connect(master);
    if (step.wet > 0) {
      const send = ctx.createGain();
      send.gain.value = step.wet;
      filter.connect(send).connect(reverb);
    }
    return filter;
  }

  function voice(buffer, offset, spec, bus) {
    const { at, duration, gain, rate, pan, shift } = spec;
    const env = ctx.createGain();
    const release = Math.min(RELEASE, duration / 2);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + ATTACK);
    env.gain.setValueAtTime(gain, at + duration - release);
    env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    src.connect(env);
    if (pan && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      env.connect(panner).connect(bus);
    } else env.connect(bus);
    const start = Math.min(offset + shift, Math.max(0, buffer.duration - 0.2));
    const length = Math.min(duration * rate, buffer.duration - start);
    src.start(at, start, length + 0.02);
    return { src, env, at };
  }

  function stop() {
    token += 1;
    if (!session) return;
    const { sources, timer, onEnd, echo } = session;
    session = null;
    clearInterval(timer);
    const now = ctx.currentTime;
    // La cola del eco también se apaga, en vez de seguir sonando 2 s.
    echo.gain.cancelScheduledValues(now);
    echo.gain.setValueAtTime(echo.gain.value, now);
    echo.gain.linearRampToValueAtTime(0, now + 0.15);
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
   * onStep(index, step, planned) se llama cuando empieza cada mes (planned.scene dice cómo suena);
   * onEnd({ completed }) al terminar o detener.
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
    // No se espera a resume(): fuera del gesto, en algunos navegadores esa promesa no se cumple
    // nunca y la primera pulsación quedaba sin sonar. Se programa ya; si el audio arranca un poco
    // después, el reloj de Web Audio, las frases y el cursor arrancan juntos.
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    const tone = windowOf(url, buffer);
    const { start, norm } = tone;
    const plan = planSpeciesYear(steps, ctx.currentTime);
    const delay = ctx.createDelay(1);
    delay.delayTime.value = PRE_DELAY;
    const reverb = ctx.createConvolver();
    reverb.buffer = reverbImpulse();
    const echo = ctx.createGain();
    echo.gain.value = 1;
    delay.connect(reverb).connect(echo).connect(master);
    const sources = plan
      .filter((step) => step.voices.length)
      .flatMap((step) => {
        const { cutoff, makeup } = distanceOf(step, tone);
        const bus = monthBus(step, cutoff, delay);
        return step.voices.map((v) =>
          voice(buffer, start, { ...v, gain: v.gain * norm * makeup }, bus),
        );
      });
    const end = ctx.currentTime + yearDuration(steps.length) + 0.05;
    let next = 0;
    const tick = () => {
      if (!session || session.token !== mine) return;
      const now = ctx.currentTime;
      while (next < plan.length && plan[next].at <= now) {
        if (onStep) onStep(next, steps[next], plan[next]);
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
      echo,
      onEnd,
      timer: setInterval(tick, 25),
    };
    tick();
    // Si el navegador no dejó arrancar el audio, se libera el botón: el siguiente clic lo intenta de nuevo.
    setTimeout(() => {
      if (session && session.token === mine && ctx.state !== "running") stop();
    }, 1500);
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

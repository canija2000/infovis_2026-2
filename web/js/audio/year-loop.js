import { createBufferCache } from "./buffers.js";
// Loop sonoro de la portada (Web Audio API, sin dependencias).
// El año suena como una pieza en bucle: cada mes son `barsPerMonth` compases de `barSeconds` segundos.
// En cada compás, la página entrega la descripción sonora (plan):
//   { hits: [{ url, gain, pan, seed, win }], pad: { freqs, gain, cutoff }, tick, tickFreq }.
// `win`: inicios (s) de los mejores tramos del clip; cada copia toca uno de ellos.
// Los navegadores no dejan sonar audio sin un gesto del usuario: el AudioContext se crea al cargar, pero
// queda suspendido hasta el primer clic o tecla (unlock).

export const SoundLoop = (() => {
  const LOOKAHEAD = 0.3;
  const SEGMENT = 2.0; // segundos de canto por copia, como máximo
  let ctx = null;
  let master = null;
  let timer = null;
  let raf = null;
  let barSeconds = 3;
  let barsPerMonth = 4;
  let nextTime = 0;
  let month = 0;
  let bar = 0;
  let plan = null;
  let onBar = null;
  let muted = false;
  const { buffers, load } = createBufferCache({ getContext: ensure });
  const queue = [];
  const pads = []; // colchones agendados: se apagan al pausar o saltar de mes
  const hits = []; // cantos agendados: se apagan al pausar

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.85;
    master.connect(comp).connect(ctx.destination);
    return ctx;
  }

  // Generador pseudoaleatorio con semilla: el mismo compás suena igual en cada vuelta del año.
  function seeded(seed) {
    let t = seed + 0x6d2b79f5;
    return () => {
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hit(time, { url, gain, pan, seed, win }) {
    const buffer = buffers.get(url);
    if (!buffer) return; // aún cargando: ese compás suena sin esta copia
    const rand = seeded(seed);
    const len = Math.min(SEGMENT, buffer.duration);
    // Desde uno de los mejores tramos del clip (análisis previo), no desde un punto al azar:
    // así no suena un pedazo de puro fondo entre dos cantos.
    const pick =
      win && win.length
        ? win[Math.floor(rand() * win.length)]
        : rand() * Math.max(0, buffer.duration - len);
    const offset = Math.min(pick, Math.max(0, buffer.duration - len));
    const at = time + rand() * Math.max(0.05, barSeconds - len * 0.6);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + 0.06);
    env.gain.setValueAtTime(gain, at + len * 0.6);
    env.gain.exponentialRampToValueAtTime(0.0001, at + len);
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    src.connect(env);
    if (panner) {
      panner.pan.value = pan;
      env.connect(panner).connect(master);
    } else env.connect(master);
    src.start(at, offset, len + 0.05);
    for (let i = hits.length - 1; i >= 0; i--)
      if (hits[i].end <= ctx.currentTime) hits.splice(i, 1);
    hits.push({ src, env, at, end: at + len });
  }
  // Al pausar, los cantos ya agendados (hasta ~5 s adelante) no deben seguir sonando.
  function silenceHits() {
    const now = ctx.currentTime;
    for (const { src, env, at } of hits.splice(0)) {
      if (at > now) {
        src.stop();
        continue;
      }
      env.gain.cancelScheduledValues(now);
      env.gain.setValueAtTime(Math.max(0.0001, env.gain.value), now);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      src.stop(now + 0.1);
    }
  }

  // Colchón armónico continuo que sostiene el piso residente y refleja la estación del año.
  function pad(time, { freqs, gain, cutoff = 700 }) {
    if (!freqs || !freqs.length || gain <= 0) return;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(gain, time + 0.45);
    env.gain.setValueAtTime(gain, time + Math.max(0.5, barSeconds - 0.35));
    env.gain.linearRampToValueAtTime(0.0001, time + barSeconds + 0.2);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    filter.connect(env).connect(master);
    const end = time + barSeconds + 0.25;
    for (let i = pads.length - 1; i >= 0; i--)
      if (pads[i].end <= ctx.currentTime) pads.splice(i, 1);
    pads.push({ env, time, gain, end });
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "sine" : "triangle";
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.65 : 0.35;
      osc.connect(g).connect(filter);
      osc.start(time);
      osc.stop(end);
    });
  }
  // Un colchón dura un compás entero: sin esto, seguiría sonando hasta 3 s tras pausar o elegir otro mes.
  function silencePads() {
    const now = ctx.currentTime;
    for (const { env, time, gain } of pads.splice(0)) {
      if (time >= now) {
        env.disconnect();
        continue;
      }
      // Valor aproximado de la envolvente ahora, para bajar desde ahí sin un clic.
      const plateau = time + Math.max(0.5, barSeconds - 0.35);
      const level =
        now < time + 0.45
          ? Math.max(0.0001, (gain * (now - time)) / 0.45)
          : now < plateau
            ? gain
            : Math.max(
                0.0001,
                gain *
                  (1 - (now - plateau) / (time + barSeconds + 0.2 - plateau)),
              );
      env.gain.cancelScheduledValues(now);
      env.gain.setValueAtTime(level, now);
      env.gain.linearRampToValueAtTime(0.0001, now + 0.08);
    }
  }

  // Inicio de mes: golpe grave y suave cuya altura sube con la riqueza total del mes.
  function tick(time, freq = 130) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(freq / 2, time + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.16, time + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.25);
    osc.connect(g).connect(master);
    osc.start(time);
    osc.stop(time + 0.3);
  }

  function schedule() {
    // Suspendido (sin gesto del usuario): no se agenda nada; al reanudar, el año parte desde aquí.
    if (ctx.state !== "running") {
      nextTime = ctx.currentTime + 0.1;
      return;
    }
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      const p = plan(month, bar) || {};
      if (p.tick) tick(nextTime, p.tickFreq);
      if (p.pad) pad(nextTime, p.pad);
      (p.hits || []).forEach((h) => hit(nextTime, h));
      queue.push({ month, bar, time: nextTime });
      nextTime += barSeconds;
      bar += 1;
      if (bar >= barsPerMonth) {
        bar = 0;
        month = (month + 1) % 12;
      }
    }
  }

  // Avisa el compás que está sonando (cada cuadro y en el temporizador: rAF se pausa con la pestaña oculta).
  function flush() {
    while (queue.length && queue[0].time <= ctx.currentTime) {
      const item = queue.shift();
      if (onBar) onBar(item.month, item.bar);
    }
  }
  function frame() {
    flush();
    raf = requestAnimationFrame(frame);
  }

  return {
    load,
    get playing() {
      return timer !== null;
    },
    // true si el navegador ya deja sonar (hubo un gesto del usuario).
    get unlocked() {
      return !!ctx && ctx.state === "running";
    },
    configure(opts) {
      barSeconds = opts.barSeconds || barSeconds;
      barsPerMonth = opts.barsPerMonth || barsPerMonth;
      ensure();
    },
    setBarsPerMonth(n) {
      barsPerMonth = n || 4;
      if (bar >= barsPerMonth) bar = 0;
    },
    async unlock() {
      if (!ensure()) return false;
      if (ctx.state !== "running") {
        try {
          await ctx.resume();
        } catch (err) {
          return false;
        }
      }
      return ctx.state === "running";
    },
    start(fromMonth, planFn, barFn) {
      if (!ensure()) return false;
      plan = planFn;
      onBar = barFn;
      month = fromMonth;
      bar = 0;
      nextTime = ctx.currentTime + 0.1;
      queue.length = 0;
      clearInterval(timer);
      cancelAnimationFrame(raf);
      schedule();
      timer = setInterval(() => {
        schedule();
        flush();
      }, 50);
      raf = requestAnimationFrame(frame);
      return true;
    },
    // Salta a otro mes en el próximo compás (cuando el usuario elige un mes).
    jump(m) {
      if (!ctx || timer === null) return;
      queue.length = 0;
      silencePads();
      month = m;
      bar = 0;
      nextTime = Math.max(ctx.currentTime + 0.05, nextTime - barSeconds); // descarta el compás ya agendado
    },
    stop() {
      clearInterval(timer);
      cancelAnimationFrame(raf);
      timer = null;
      queue.length = 0;
      if (ctx) {
        silencePads();
        silenceHits();
      }
    },
    setMuted(value) {
      muted = value;
      if (master)
        master.gain.setTargetAtTime(value ? 0 : 0.85, ctx.currentTime, 0.05);
    },
  };
})();

// Sonificación con Web Audio API (sin dependencias).
// Un mes = un compás. app.js entrega, por compás, una descripción declarativa:
//   { pad:  { freqs: [Hz…], gain },            colchón sostenido (residentes)
//     hits: [{ at, sample, rate, gain, pan }],  cantos reales (granos de Xeno-canto)
//     tick: true }                              golpe suave que marca el inicio del mes
// `at` va de 0 a 1 dentro del compás; `rate` transpone el grano (tono ← latitud).
// El AudioContext solo se crea tras un gesto del usuario (clic en Play).

const Sonifier = (() => {
  const BAR_SECONDS = 2.4;
  const GRAIN_SECONDS = 0.9;
  // Los cantos se bajan una quinta y se filtran: los granos cortos de cantos agudos (Fío-fío ~4 kHz,
  // Picaflor chico ~8 kHz) sonaban como "beeps".
  const TRANSPOSE = Math.pow(2, -7 / 12);
  const GRAIN_LOWPASS = 3500;
  const LOOKAHEAD = 0.2;
  let ctx = null;
  let master = null;
  let timer = null;
  let raf = null;
  let nextBar = 0;
  let month = 0;
  let getBar = null;
  let onMonth = null;
  let muted = false;
  const buffers = new Map();
  const queue = [];

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 3;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(comp).connect(ctx.destination);
    return ctx;
  }

  async function load(urls) {
    if (!ensure()) return;
    await Promise.all(
      urls.filter((u) => u && !buffers.has(u)).map(async (url) => {
        buffers.set(url, null); // evita cargas duplicadas
        try {
          const data = await fetch(url).then((r) => r.arrayBuffer());
          buffers.set(url, await ctx.decodeAudioData(data));
        } catch (err) {
          buffers.delete(url);
          console.warn("No se pudo cargar", url, err);
        }
      }),
    );
  }

  // Colchón: dos osciladores suaves por nota con filtro cálido; entra y sale con rampas.
  function pad(time, { freqs, gain }) {
    if (!freqs || !freqs.length || gain <= 0) return;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(gain, time + 0.5);
    env.gain.setValueAtTime(gain, time + BAR_SECONDS - 0.35);
    env.gain.linearRampToValueAtTime(0.0001, time + BAR_SECONDS + 0.25);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.connect(env).connect(master);
    freqs.forEach((f, i) => {
      for (const [type, detune] of [["sine", 0], ["triangle", i % 2 ? 6 : -6]]) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = f;
        osc.detune.value = detune;
        const g = ctx.createGain();
        g.gain.value = type === "sine" ? 0.6 : 0.25;
        osc.connect(g).connect(filter);
        osc.start(time);
        osc.stop(time + BAR_SECONDS + 0.3);
      }
    });
  }

  // Grano de canto real. Si el audio no cargó, cae a un pulso sintético.
  function hit(time, { sample, rate = 1, gain = 0.3, pan = 0 }) {
    const out = ctx.createGain();
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = GRAIN_LOWPASS;
    lowpass.Q.value = 0.5;
    lowpass.connect(out);
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = pan;
      out.connect(panner).connect(master);
    } else out.connect(master);
    const buffer = buffers.get(sample);
    const dur = GRAIN_SECONDS;
    const r = rate * TRANSPOSE;
    // Envolvente suave: entra en 60 ms y se desvanece en la segunda mitad.
    out.gain.setValueAtTime(0.0001, time);
    out.gain.exponentialRampToValueAtTime(gain, time + 0.06);
    out.gain.setValueAtTime(gain, time + dur * 0.45);
    out.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    if (buffer) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = r;
      src.connect(lowpass);
      src.start(time, 0, dur * r + 0.05);
    } else {
      // Especie sin clip: nota suave y grave en vez de un pitido.
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 330 * rate;
      osc.connect(lowpass);
      osc.start(time);
      osc.stop(time + dur);
    }
  }

  // Marca de mes: golpe grave y corto (tipo tambor apagado), no un clic agudo.
  function tick(time) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(70, time + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.18, time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    osc.connect(g).connect(master);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  function scheduleBar(m, t0) {
    const bar = getBar(m) || {};
    if (bar.tick) tick(t0);
    if (bar.pad) pad(t0, bar.pad);
    (bar.hits || []).forEach((h) => hit(t0 + h.at * BAR_SECONDS, h));
  }

  function schedule() {
    while (nextBar < ctx.currentTime + LOOKAHEAD) {
      scheduleBar(month, nextBar);
      queue.push({ month, time: nextBar });
      nextBar += BAR_SECONDS;
      month = (month + 1) % 12;
    }
  }

  // Avisa el mes que está sonando. Corre en cada cuadro y también en el temporizador,
  // porque requestAnimationFrame se pausa cuando la pestaña no está visible.
  function flush() {
    while (queue.length && queue[0].time <= ctx.currentTime) {
      const item = queue.shift();
      if (onMonth) onMonth(item.month);
    }
  }

  function frame() {
    flush();
    raf = requestAnimationFrame(frame);
  }

  return {
    BAR_SECONDS,
    load,
    get playing() {
      return timer !== null;
    },
    async start(fromMonth, barFn, monthFn, urls = []) {
      if (!ensure()) return false;
      if (ctx.state === "suspended") await ctx.resume();
      await load(urls);
      getBar = barFn;
      onMonth = monthFn;
      month = fromMonth;
      nextBar = ctx.currentTime + 0.08;
      queue.length = 0;
      schedule();
      timer = setInterval(() => {
        schedule();
        flush();
      }, 50);
      raf = requestAnimationFrame(frame);
      return true;
    },
    stop() {
      clearInterval(timer);
      cancelAnimationFrame(raf);
      timer = null;
      queue.length = 0;
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.setTargetAtTime(value ? 0 : 0.9, ctx.currentTime, 0.05);
    },
  };
})();

// Sonificación con Web Audio API (sin dependencias).
// Un mes = un compás de STEPS pulsos. Cada voz trae {freq, pulses, bright, gain}:
//   freq   ← latitud (lo calcula app.js sobre una escala pentatónica)
//   pulses ← riqueza o presencia (0..STEPS notas en el compás)
//   bright ← proporción de visitantes (0 = onda pura, 1 = brillante)
// El AudioContext solo se crea tras un gesto del usuario (clic en Play).

const Sonifier = (() => {
  const STEPS = 8;
  const BAR_SECONDS = 1.6;
  const LOOKAHEAD = 0.15;
  let ctx = null;
  let master = null;
  let timer = null;
  let nextBar = 0;
  let month = 0;
  let getVoices = null;
  let onMonth = null;
  let muted = false;
  let raf = null;
  const queue = [];

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(comp).connect(ctx.destination);
    return ctx;
  }

  // Ritmo euclidiano: reparte k pulsos en n pasos lo más parejo posible.
  function euclid(k, n, rotate) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const j = (i + rotate) % n;
      out.push(Math.floor(((j + 1) * k) / n) - Math.floor((j * k) / n) === 1);
    }
    return out;
  }

  function note(time, voice) {
    const dur = 0.42;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(Math.max(voice.gain, 0.0002), time + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 350 + voice.bright * 5200;
    filter.Q.value = 0.8;

    const pure = ctx.createOscillator();
    pure.type = "sine";
    pure.frequency.value = voice.freq;
    const rich = ctx.createOscillator();
    rich.type = "sawtooth";
    rich.frequency.value = voice.freq;
    const richGain = ctx.createGain();
    richGain.gain.value = 0.05 + voice.bright * 0.75;

    pure.connect(filter);
    rich.connect(richGain).connect(filter);
    filter.connect(env).connect(master);
    for (const osc of [pure, rich]) {
      osc.start(time);
      osc.stop(time + dur + 0.05);
    }
  }

  function scheduleBar(m, t0) {
    const voices = getVoices(m) || [];
    const step = BAR_SECONDS / STEPS;
    voices.forEach((voice, i) => {
      const k = Math.max(0, Math.min(STEPS, Math.round(voice.pulses)));
      if (!k) return;
      euclid(k, STEPS, (i * 3) % STEPS).forEach((on, s) => {
        if (on) note(t0 + s * step + (i % 4) * 0.004, voice);
      });
    });
  }

  function tick() {
    while (nextBar < ctx.currentTime + LOOKAHEAD) {
      scheduleBar(month, nextBar);
      queue.push({ month, time: nextBar });
      nextBar += BAR_SECONDS;
      month = (month + 1) % 12;
    }
  }

  function frame() {
    while (queue.length && queue[0].time <= ctx.currentTime) {
      const item = queue.shift();
      if (onMonth) onMonth(item.month);
    }
    raf = requestAnimationFrame(frame);
  }

  return {
    STEPS,
    BAR_SECONDS,
    get playing() {
      return timer !== null;
    },
    async start(fromMonth, voicesFn, monthFn) {
      if (!ensure()) return false;
      if (ctx.state === "suspended") await ctx.resume();
      getVoices = voicesFn;
      onMonth = monthFn;
      month = fromMonth;
      nextBar = ctx.currentTime + 0.05;
      queue.length = 0;
      tick();
      timer = setInterval(tick, 40);
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

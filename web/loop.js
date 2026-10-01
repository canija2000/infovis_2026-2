// Loop sonoro de la portada (Web Audio API, sin dependencias).
// El año suena como una pieza en bucle: cada mes son `barsPerMonth` compases de `barSeconds` segundos.
// En cada compás, la página entrega la lista de cantos a tocar (plan): { hits: [{ url, gain, pan, seed, win }], tick }.
// `win`: inicios (s) de los mejores tramos del clip; cada copia toca uno de ellos.
// Cada «hit» es un fragmento de la grabación de una especie que entra en un momento al azar del compás;
// una especie con 4 copias suena 4 veces en el mismo compás.
// Los navegadores no dejan sonar audio sin un gesto del usuario: el AudioContext se crea al cargar, pero
// queda suspendido hasta el primer clic o tecla (unlock).

const SoundLoop = (() => {
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
  const buffers = new Map();
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
    master.gain.value = muted ? 0 : 0.85;
    master.connect(comp).connect(ctx.destination);
    return ctx;
  }

  function load(urls) {
    if (!ensure()) return Promise.resolve();
    return Promise.all(
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
    const pick = win && win.length ? win[Math.floor(rand() * win.length)] : rand() * Math.max(0, buffer.duration - len);
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
  }

  // Inicio de mes: golpe grave y suave, para que se oigan los «compases» del año.
  function tick(time) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(130, time);
    osc.frequency.exponentialRampToValueAtTime(65, time + 0.15);
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
      if (p.tick) tick(nextTime);
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
      month = m;
      bar = 0;
      nextTime = Math.max(ctx.currentTime + 0.05, nextTime - barSeconds); // descarta el compás ya agendado
    },
    stop() {
      clearInterval(timer);
      cancelAnimationFrame(raf);
      timer = null;
      queue.length = 0;
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.setTargetAtTime(value ? 0 : 0.85, ctx.currentTime, 0.05);
    },
  };
})();

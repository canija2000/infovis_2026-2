/**
 * Lo que la animación necesita saber de un canto, calculado una vez sobre la grabación.
 *
 * Antes el pico seguía el nivel medido de toda la capa (todas las aves de un grupo sumadas) en el
 * momento en que el audio se procesaba, no cuando llegaba al parlante: con varias aves a la vez el
 * pico quedaba casi siempre abierto y no se veía cantar a ninguna en particular. Ahora cada ave
 * dibujada corresponde a una sola voz: se conoce de antemano la envolvente de su tramo (cada 10 ms)
 * y el comienzo de cada sílaba, y la página las lee en el instante que de verdad se está oyendo.
 */
export const FRAME = 0.01; // s por cuadro de la envolvente
const MIN_LEVEL = 0.06; // fracción del máximo bajo la cual no hay sílaba
const REARM = 0.5; // la sílaba terminó cuando el nivel cae bajo esta fracción de su pico
const MIN_GAP = 0.06; // s entre dos sílabas

// Pasa-banda de segundo orden (RBJ) aplicado en el lugar: el mismo filtro que suena en la página.
function biquad(samples, sampleRate, type, frequency) {
  const w =
    (2 * Math.PI * Math.min(frequency, sampleRate / 2 - 100)) / sampleRate;
  const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
  const cos = Math.cos(w);
  const a0 = 1 + alpha;
  const b =
    type === "lowpass"
      ? [(1 - cos) / 2, 1 - cos, (1 - cos) / 2]
      : [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  const [b0, b1, b2] = b.map((v) => v / a0);
  const a1 = (-2 * cos) / a0,
    a2 = (1 - alpha) / a0;
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    samples[i] = y;
  }
}

/**
 * samples: Float32Array mono del tramo; band: [desde, hasta] Hz (null = sin límite).
 * Devuelve { env (0–1 por cuadro), onsets ([{ t, strength }], s desde el inicio), rms (del tramo
 * filtrado, para igualar volúmenes) }.
 */
export function analyseSong(samples, sampleRate, band) {
  const x = Float32Array.from(samples);
  const [low, high] = band || [null, null];
  if (low) {
    biquad(x, sampleRate, "highpass", low);
    biquad(x, sampleRate, "highpass", low);
  }
  if (high) {
    biquad(x, sampleRate, "lowpass", high);
    biquad(x, sampleRate, "lowpass", high);
  }
  const hop = Math.max(1, Math.round(sampleRate * FRAME));
  const frames = Math.max(1, Math.floor(x.length / hop));
  const env = new Float32Array(frames);
  let total = 0;
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * hop; i < (f + 1) * hop && i < x.length; i++)
      sum += x[i] * x[i];
    total += sum;
    env[f] = Math.sqrt(sum / hop);
  }
  const peak = Math.max(...env, 1e-9);
  for (let f = 0; f < frames; f++) env[f] /= peak;
  return {
    env,
    onsets: findOnsets(env),
    rms: Math.sqrt(total / Math.max(1, frames * hop)),
  };
}

// Comienzos de sílaba sobre la envolvente normalizada: sube sobre el umbral y, antes de la
// siguiente, vuelve a bajar de la mitad de su pico.
export function findOnsets(env) {
  const onsets = [];
  let armed = true,
    peak = 0,
    last = -Infinity;
  for (let f = 0; f < env.length; f++) {
    const v = env[f];
    const t = f * FRAME;
    if (!armed) {
      if (v > peak) {
        peak = v;
        onsets[onsets.length - 1].strength = v;
      }
      if (v < peak * REARM) armed = true;
      continue;
    }
    if (v > MIN_LEVEL && t - last >= MIN_GAP) {
      onsets.push({ t, strength: v });
      armed = false;
      peak = v;
      last = t;
    }
  }
  return onsets;
}

// Las notas que se dibujan: solo sílabas claras y con una separación mínima, según cómo canta la
// especie (un silbido largo es una sola nota aunque su volumen tiemble).
export function thinOnsets(onsets, minStrength = 0, minGap = 0) {
  const kept = [];
  for (const o of onsets) {
    if (o.strength < minStrength) continue;
    if (kept.length && o.t - kept[kept.length - 1].t < minGap) continue;
    kept.push(o);
  }
  return kept;
}

// Nivel de la envolvente en el segundo t del tramo (0 fuera de él).
export function envelopeAt(env, t) {
  const f = Math.floor(t / FRAME);
  return f >= 0 && f < env.length ? env[f] : 0;
}

// Apertura del pico 0–1: abre al instante y cierra en ~60 ms, para que se vea cada sílaba.
export function beakOpening(previous, target, dt) {
  if (target >= previous) return target;
  return previous + (target - previous) * Math.min(1, 18 * dt);
}

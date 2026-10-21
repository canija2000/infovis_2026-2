/**
 * «Escuchar su año»: una especie, doce meses, un solo dato.
 *
 * Cada mes suena el canto de la especie. El nivel de presencia del mes elige una de tres escenas
 * bien distintas, para que se reconozcan sin explicación (codificación redundante de una sola
 * variable: número de aves, distancia y volumen dicen lo mismo):
 *   cerca · un coro de cinco aves que cantan juntas el canto completo, de lado a lado;
 *   medio · dos aves cantando juntas, algo apagadas y con un poco de eco;
 *   lejos · un ave sola, muy apagada y con mucho eco, como desde el otro lado de un valle.
 * En silencio cuando casi no está. No hay que reconocer el canto: la persona ya eligió el ave
 * y ve avanzar el cursor sobre el gráfico.
 */
export const MONTH_SECONDS = 1.5; // un año completo dura 18 s
export const PHRASE_SECONDS = 1.35; // cada ave canta este tramo completo del clip, sin cortarlo
export const SILENT_BELOW = 0.05; // nivel bajo el cual el mes queda en silencio
const LEAD_IN = 0.12; // margen para que el primer mes no quede cortado

// Nivel 0–1 del mes: perfil relativo × fracción de años con registro.
// Es la regla que usaba la sonificación retirada de Explorar para una especie: un mes con un
// solo registro aislado no suena tan fuerte como uno que se repite cada año.
export function stepLevel({ profile, years }) {
  if (profile === null || profile === undefined) return 0;
  const p = Math.min(1, Math.max(0, profile / 100));
  const y = years === null || years === undefined ? 1 : years / 8;
  return p * Math.min(1, Math.max(0, y));
}

// Las tres escenas. Los extremos están lejos a propósito: una diferencia sutil no se oye.
//   birds: cuántas aves cantan; dry/wet: sonido directo y eco. El eco es la señal principal de
//     distancia: un canto casi tonal filtrado solo baja de volumen, pero uno que llega sobre
//     todo como eco se oye lejano;
//   muffle: el pasa-bajos se fija en esta fracción del tono propio del canto (null = sin filtro),
//     así un ave lejana suena igual de apagada sea su canto grave (Chincol) o muy agudo (Picaflor);
//   db: volumen objetivo respecto del coro cercano, una vez compensado lo que quita el filtro
//     (sin compensar, un canto agudo filtrado quedaba ~30 dB abajo: inaudible).
export const SCENES = {
  near: {
    label: "un coro de aves, cerca",
    birds: 5,
    muffle: null,
    dry: 1,
    wet: 0.12, // un poco de aire común: une al coro en un mismo lugar
    db: 0,
  },
  mid: {
    label: "dos aves, a media distancia",
    birds: 2,
    muffle: 0.8,
    dry: 0.75,
    wet: 0.35,
    db: -5,
  },
  far: {
    label: "un ave sola, lejos",
    birds: 1,
    muffle: 0.35,
    dry: 0.3,
    wet: 1,
    db: -13,
  },
};

// Un mes de ejemplo por escena, para la leyenda sonora («Así suena»).
export const SCENE_EXAMPLES = { near: 1, mid: 0.55, far: 0.25 };
export const exampleStep = (scene) => ({
  month: null,
  profile: SCENE_EXAMPLES[scene] * 100,
  years: 8,
});

export function stepScene(level) {
  if (!(level >= SILENT_BELOW)) return null;
  return level >= 0.75 ? "near" : level >= 0.4 ? "mid" : "far";
}

// Volumen: dentro de cada escena sigue al nivel, pero sin bajar tanto que el ave lejana se pierda
// (el eco y el filtro ya la hacen sonar débil).
export function stepGain(level) {
  if (!(level >= SILENT_BELOW)) return 0;
  return 0.45 + 0.55 * Math.min(1, level);
}

// El coro: todas las aves cantan a la vez el canto completo, como al amanecer. Para que suene a
// muchas aves y no a una sola duplicada, cada una entra apenas desfasada (menos de 0,15 s), canta
// desde otro punto de la grabación (así se cruzan notas distintas), con una afinación levemente
// propia (±1,5–3,5 %), en otro lugar del espacio estéreo y algo más cerca o más atrás (level).
// Antes, con fragmentos cortos, entradas muy separadas y ±5–8 % de afinación, sonaba entrecortado.
// El orden es fijo para que cada vuelta del año suene igual.
const BIRDS = [
  { delay: 0, shift: 0, rate: 1, pan: 0, level: 1 },
  { delay: 0.07, shift: 0.45, rate: 1.02, pan: -0.75, level: 0.85 },
  { delay: 0.13, shift: 0.9, rate: 0.98, pan: 0.75, level: 0.85 },
  { delay: 0.04, shift: 0.25, rate: 1.035, pan: -0.4, level: 0.7 },
  { delay: 0.1, shift: 0.65, rate: 0.97, pan: 0.4, level: 0.7 },
];
// Con un ave o dos, se quedan al centro o se reparten suave entre ambos lados.
const PANS = { 1: [0], 2: [-0.35, 0.35], 5: null };

// steps: [{ month, profile, years }] en el orden en que se recorren.
export function planSpeciesYear(steps, start = 0) {
  return steps.map((step, index) => {
    const level = stepLevel(step);
    const scene = stepScene(level);
    const at = start + LEAD_IN + index * MONTH_SECONDS;
    if (!scene)
      return {
        index,
        month: step.month,
        at,
        level,
        scene,
        gain: 0,
        voices: [],
      };
    const { birds, muffle, dry, wet, db } = SCENES[scene];
    const gain = stepGain(level);
    const pans = PANS[birds];
    const chorus = BIRDS.slice(0, birds);
    // Voces no correlacionadas suman energía: se reparte para que el volumen total siga a `gain`.
    const scale = gain / Math.hypot(...chorus.map((bird) => bird.level));
    return {
      index,
      month: step.month,
      at,
      level,
      scene,
      gain,
      muffle,
      dry,
      wet,
      db,
      voices: chorus.map((bird, i) => ({
        at: at + bird.delay,
        duration: PHRASE_SECONDS - bird.delay,
        shift: bird.shift,
        rate: bird.rate,
        pan: pans ? pans[i] : bird.pan,
        gain: bird.level * scale,
      })),
    };
  });
}

export function yearDuration(count) {
  return LEAD_IN + count * MONTH_SECONDS;
}

// Busca el tramo del clip con más energía (donde está el canto, no el fondo) y su RMS.
// samples: Float32Array mono. Devuelve { start (s), rms }.
export function bestWindow(samples, sampleRate, seconds) {
  const hop = Math.max(1, Math.round(sampleRate * 0.01));
  const frames = Math.floor(samples.length / hop);
  const width = Math.max(1, Math.round((seconds * sampleRate) / hop));
  const energy = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * hop, end = i + hop; i < end; i++)
      sum += samples[i] * samples[i];
    energy[f] = sum;
  }
  if (frames <= width) {
    const total = energy.reduce((a, b) => a + b, 0);
    return { start: 0, rms: Math.sqrt(total / Math.max(1, frames * hop)) };
  }
  let sum = 0;
  for (let f = 0; f < width; f++) sum += energy[f];
  let best = sum,
    bestFrame = 0;
  for (let f = width; f < frames; f++) {
    sum += energy[f] - energy[f - width];
    if (sum > best) {
      best = sum;
      bestFrame = f - width + 1;
    }
  }
  return {
    start: (bestFrame * hop) / sampleRate,
    rms: Math.sqrt(best / (width * hop)),
  };
}

// Tono aproximado del canto: cruces por cero / 2. En un canto (casi tonal) se acerca a su
// frecuencia dominante. Se limita a 1–9 kHz.
export function songPitch(samples, sampleRate) {
  let crossings = 0;
  for (let i = 1; i < samples.length; i++)
    if (samples[i - 1] < 0 !== samples[i] < 0) crossings++;
  const hz = (crossings / 2) * (sampleRate / Math.max(1, samples.length));
  return Math.min(9000, Math.max(1000, hz));
}

// RMS que deja un pasa-bajos de segundo orden (RBJ, Q 0,707) en `cutoff` Hz, relativo al original.
export function lowpassRatio(samples, sampleRate, cutoff) {
  const w = (2 * Math.PI * Math.min(cutoff, sampleRate / 2 - 100)) / sampleRate;
  const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
  const cos = Math.cos(w);
  const a0 = 1 + alpha;
  const b0 = (1 - cos) / 2 / a0,
    b1 = (1 - cos) / a0,
    b2 = b0,
    a1 = (-2 * cos) / a0,
    a2 = (1 - alpha) / a0;
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0,
    raw = 0,
    out = 0;
  for (const x of samples) {
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    raw += x * x;
    out += y * y;
  }
  return raw ? Math.sqrt(out / raw) : 1;
}

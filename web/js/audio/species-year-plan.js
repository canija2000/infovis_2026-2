/**
 * «Escuchar su año»: una especie, doce meses, un solo dato.
 *
 * Cada mes suena el canto de la especie. El nivel de presencia del mes elige una de tres escenas
 * bien distintas, para que se reconozcan sin explicación (codificación redundante de una sola
 * variable: número de aves, distancia y volumen dicen lo mismo):
 *   cerca · un coro de seis aves que cantan a la vez, cada una en su lugar, distancia y ritmo;
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
    birds: 6,
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
    db: -8,
  },
  far: {
    label: "un ave sola, lejos",
    birds: 1,
    muffle: 0.35,
    dry: 0.3,
    wet: 1,
    db: -15,
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

// El coro. Con una sola grabación, cinco copias casi sincrónicas sonaban como una sola ave: los
// canales izquierdo y derecho quedaban casi iguales (correlación 0,8–0,9) y, en cantos de notas
// cortas y regulares como el del Picaflor chico, las copias se alineaban en una sola secuencia
// más rápida («la misma ave cantando seguido»). Para que se oigan varias aves a la vez:
//   · seis aves repartidas de un extremo al otro, sin ninguna que domine al centro;
//   · cada una a su propia distancia (depth): las de atrás, más apagadas y con más eco;
//   · cada una con su ritmo y su tono (±3–9 %): sus notas dejan de coincidir y se entrecruzan,
//     como aves distintas que no cantan sincronizadas;
//   · cada mes, otra mezcla de entradas y de puntos del canto (al azar con semilla: cada vuelta del
//     año suena igual, pero un mes no repite al anterior).
const CHORUS = [
  { pan: -0.9, depth: 0.1, rate: 1, level: 1 },
  { pan: 0.85, depth: 0, rate: 1.06, level: 1 },
  { pan: -0.35, depth: 0.45, rate: 0.93, level: 0.85 },
  { pan: 0.4, depth: 0.3, rate: 1.03, level: 0.9 },
  { pan: -0.6, depth: 0.7, rate: 1.09, level: 0.75 },
  { pan: 0.1, depth: 0.6, rate: 0.96, level: 0.8 },
];
const PAIR = [
  { pan: -0.45, depth: 0, rate: 1, level: 1 },
  { pan: 0.45, depth: 0.25, rate: 0.95, level: 0.9 },
];
const SOLO = [{ pan: 0, depth: 0, rate: 1, level: 1 }];
const GROUPS = { 1: SOLO, 2: PAIR, 6: CHORUS };

// Generador con semilla (mulberry32): el mismo mes suena igual en cada vuelta.
function seeded(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

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
    const group = GROUPS[birds];
    const random = seeded(1 + (step.month ?? 12) * 101 + birds * 7);
    // Voces no correlacionadas suman energía: se reparte para que el volumen total siga a `gain`.
    const scale = gain / Math.hypot(...group.map((bird) => bird.level));
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
      voices: group.map((bird, i) => {
        // La primera ave entra al inicio del mes (marca el mes); las demás, repartidas en 0,35 s.
        const delay = i === 0 ? 0 : 0.03 + random() * 0.32;
        // Algunas callan un poco antes: no todas terminan juntas.
        const early = i === 0 ? 0 : random() * 0.25;
        return {
          at: at + delay,
          duration: PHRASE_SECONDS - delay - early,
          shift: birds === 1 ? 0 : random() * 1.2,
          rate: bird.rate,
          pan: bird.pan,
          depth: bird.depth,
          gain: bird.level * scale,
        };
      }),
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

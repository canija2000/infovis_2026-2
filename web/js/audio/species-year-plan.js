/**
 * «Escuchar su año»: una especie, doce meses, un solo dato.
 *
 * Cada mes suena el canto de la especie. El nivel de presencia del mes se oye de tres maneras
 * a la vez, todas en la misma dirección (codificación redundante de una sola variable):
 *   volumen  · más fuerte cuanto más presente;
 *   densidad · de un canto solitario a un pequeño coro de tres;
 *   distancia· poco presente suena lejos (apagado y con eco); muy presente, cerca y nítido.
 * En silencio cuando casi no está. No hay que reconocer el canto: la persona ya eligió el ave
 * y ve avanzar el cursor sobre el gráfico.
 */
export const MONTH_SECONDS = 1.5; // un año completo dura 18 s
export const PHRASE_SECONDS = 1.35; // la frase deja una pausa breve que separa los meses
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

// Amplitud del mes, proporcional al nivel (50 % ≈ −6 dB, 25 % ≈ −12 dB). La distancia (filtro)
// y la densidad ya agrandan la diferencia: con un exponente mayor, los meses débiles se perdían.
export function stepGain(level) {
  if (!(level >= SILENT_BELOW)) return 0;
  return Math.min(1, level);
}

// Densidad: cuántas aves cantan ese mes. Umbrales parejos sobre el nivel (0–1).
export function stepVoices(level) {
  if (!(level >= SILENT_BELOW)) return 0;
  return level >= 0.75 ? 3 : level >= 0.4 ? 2 : 1;
}

// Distancia: un ave lejana suena más apagada (filtro pasa-bajos) y con más eco (reverberación).
// cutoff va de 1,5 kHz (lejos) a 16 kHz (cerca, sin filtrar en la práctica); el exponente 1,5
// deja apagados también los meses intermedios (nivel 0,33 ≈ 2,4 kHz; 0,68 ≈ 5,3 kHz), porque los
// cantos suelen estar entre 2 y 8 kHz. wet (eco) va de 0,55 a 0.
export function stepDistance(level) {
  const l = Math.min(1, Math.max(0, level || 0));
  return {
    cutoff: Math.round(1500 * Math.pow(16000 / 1500, Math.pow(l, 1.5))),
    wet: 0.55 * (1 - l),
  };
}

// Cada voz extra entra un poco después, desde otro punto del canto, algo desafinada y hacia un
// lado: así suenan como aves distintas y no como un eco de la primera. Todas terminan antes del mes siguiente.
const VOICES = [
  { delay: 0, shift: 0, rate: 1, pan: 0 },
  { delay: 0.17, shift: 0.12, rate: 1.03, pan: -0.35 },
  { delay: 0.34, shift: 0.24, rate: 0.97, pan: 0.35 },
];

// steps: [{ month, profile, years }] en el orden en que se recorren.
export function planSpeciesYear(steps, start = 0) {
  return steps.map((step, index) => {
    const level = stepLevel(step);
    const gain = stepGain(level);
    const count = stepVoices(level);
    const at = start + LEAD_IN + index * MONTH_SECONDS;
    // Voces no correlacionadas suman energía: se reparte para que el volumen total siga a `gain`.
    const each = count ? gain / Math.sqrt(count) : 0;
    return {
      index,
      month: step.month,
      at,
      level,
      gain,
      ...stepDistance(level),
      voices: VOICES.slice(0, count).map((voice) => ({
        at: at + voice.delay,
        duration: PHRASE_SECONDS - voice.delay,
        shift: voice.shift,
        rate: voice.rate,
        pan: voice.pan,
        gain: each,
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

/**
 * «Escuchar su año»: una especie, doce meses, un solo dato.
 *
 * Cada mes suena la misma frase del canto de la especie. Lo único que cambia es su volumen:
 * más fuerte en los meses en que más se registra y con más regularidad, en silencio cuando no está.
 * No hay que reconocer el canto: la persona ya eligió el ave y ve avanzar el cursor sobre el gráfico.
 */
export const MONTH_SECONDS = 1.5; // un año completo dura 18 s
export const PHRASE_SECONDS = 1.35; // la frase deja una pausa breve que separa los meses
export const SILENT_BELOW = 0.05; // nivel bajo el cual el mes queda en silencio
const LEAD_IN = 0.12; // margen para que el primer mes no quede cortado

// Nivel 0–1 del mes: perfil relativo × fracción de años con registro.
// Es la misma regla que usa la sonificación de Explorar para una especie (atlas-plan.js):
// un mes con un solo registro aislado no suena tan fuerte como uno que se repite cada año.
export function stepLevel({ profile, years }) {
  if (profile === null || profile === undefined) return 0;
  const p = Math.min(1, Math.max(0, profile / 100));
  const y = years === null || years === undefined ? 1 : years / 8;
  return p * Math.min(1, Math.max(0, y));
}

// Amplitud de la frase. El exponente 1,3 abre la diferencia entre niveles medios y altos,
// para que «más presente» se oiga claramente más fuerte (50 % ≈ −8 dB, 25 % ≈ −16 dB).
export function stepGain(level) {
  if (!(level >= SILENT_BELOW)) return 0;
  return Math.pow(Math.min(1, level), 1.3);
}

// steps: [{ month, profile, years }] en el orden en que se recorren.
export function planSpeciesYear(steps, start = 0) {
  return steps.map((step, index) => {
    const level = stepLevel(step);
    return {
      index,
      month: step.month,
      at: start + LEAD_IN + index * MONTH_SECONDS,
      level,
      gain: stepGain(level),
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

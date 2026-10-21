/**
 * Medidor de una capa del coro: a partir del nivel (RMS) que suena en cada cuadro, dice cuánto
 * abrir el pico del ave y cuándo empieza una sílaba (para soltar una nota). Así la animación sigue
 * al sonido real: un gorjeo rápido suelta muchas notas, un silbido lento pocas.
 */
const MIN_LEVEL = 0.006; // bajo esto no hay canto, solo cola de eco
const REARM = 0.55; // la sílaba terminó cuando el nivel cae bajo esta fracción de su pico
const MIN_GAP = 0.08; // s entre dos notas de la misma capa

export function createMeterState() {
  return { floor: 0, armed: true, peak: 0, last: -Infinity, open: 0 };
}

// rms: nivel del cuadro; time: s. Devuelve true si empieza una sílaba.
export function detectOnset(state, rms, time) {
  // Piso: sigue de inmediato las bajadas y muy lento las subidas (el «fondo» de la capa).
  if (rms < state.floor) state.floor = rms;
  else state.floor += (rms - state.floor) * 0.05;
  if (!state.armed) {
    state.peak = Math.max(state.peak, rms);
    if (rms < state.peak * REARM) state.armed = true;
    return false;
  }
  const threshold = Math.max(MIN_LEVEL, state.floor * 2 + MIN_LEVEL * 0.5);
  if (rms > threshold && time - state.last > MIN_GAP) {
    state.armed = false;
    state.peak = rms;
    state.last = time;
    return true;
  }
  return false;
}

// Apertura del pico 0–1: sube rápido con el sonido y cierra un poco más lento, como un ave real.
export function beakOpening(state, rms, reference, dt) {
  const target = Math.min(1, Math.max(0, rms / reference));
  const speed = target > state.open ? 22 : 9;
  state.open += (target - state.open) * Math.min(1, speed * dt);
  return state.open;
}

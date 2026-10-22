/**
 * «El coro de las estaciones»: la barra recorre el gráfico de julio a junio y en cada curva un ave
 * canta por su grupo. Reglas puras (sin Web Audio ni DOM), para poder probarlas.
 *
 * Una sola idea por capa: cuántas especies de su grupo hay en ese momento del año.
 *   · Residentes: siempre presentes y casi constantes. Un arrullo grave y parejo, de fondo, que no
 *     cambia en todo el año: el piso verde que no se mueve.
 *   · Verano e invierno: al frente. Cuantas más especies hay, más aves cantan a la vez (y se ven
 *     más aves sobre la curva), más seguido y más cerca; cuando hay pocas, un ave sola cada tanto.
 * La forma de cada capa sigue su propia curva (el pico de invierno, en mayo, se oye), pero el
 * tamaño del coro respeta la diferencia entre grupos: verano llega a cuatro aves y el invierno a tres.
 * Las residentes son siempre una sola ave que arrulla sin pausa.
 *
 * Una especie por grupo, elegida para que los tres se reconozcan sin ver el gráfico:
 *   residentes · Tortolita cuyana: arrullo grave (~600 Hz), parejo como un pulso;
 *   verano · Picaflor cordillerano: chillidos agudos (5–8 kHz) y rápidos (~8 por segundo);
 *   invierno · Viudita: un silbido largo que baja (~4,5 kHz), el emblema del invierno en Chile central.
 * Las tres difieren a la vez en altura, ritmo y forma (pulso grave, ráfaga aguda, nota larga). Con
 * cuatro especies por grupo los grupos se confundían entre sí: un silbido de invierno se parecía al
 * de un chincol residente y un gorjeo de verano al trino de otra.
 *
 * Además, cada grupo sale de su lado del estéreo, el mismo lado donde está su ave en el gráfico
 * (verano a la izquierda de la barra, invierno a la derecha, residentes al centro y atrás).
 */

export const SECONDS_PER_MONTH = 3; // la barra recorre los 11 tramos jul → jun en 33 s

// La especie de cada grupo (nombre de overview.json), el tramo de su grabación que se toca (s) y
// la banda que se deja pasar (Hz; null = sin límite), que limpia el ruido de fondo de la grabación.
//   note: cómo se dibujan sus notas (pulse: notas sueltas; burst: pares, ráfaga; long: blanca, nota
//   sostenida), para que también a la vista cada grupo cante distinto; noteGap y noteMin: separación
//   mínima (s) y fuerza mínima (0–1) de las sílabas que sueltan una nota.
export const SPECIES = {
  0: {
    name: "Tortolita cuyana",
    start: 0,
    length: 1.45, // dos arrullos «u-up, u-up»
    band: [280, 1600],
    note: "pulse",
    noteGap: 0.3, // una nota por arrullo
    noteMin: 0.4,
    sound: "arrullo grave y parejo",
  },
  1: {
    name: "Picaflor cordillerano",
    start: 0.4,
    length: 2, // una ráfaga de chillidos que bajan
    band: [2600, null],
    note: "burst",
    noteGap: 0.2, // cada par de notas, dos chillidos
    noteMin: 0.2,
    sound: "chillidos agudos y rápidos",
  },
  2: {
    name: "Viudita",
    start: 1.28,
    length: 0.85, // su silbido largo
    band: [3500, 6200],
    note: "long",
    noteGap: 10, // el silbido es una sola nota aunque su volumen tiemble
    noteMin: 0.3,
    sound: "un silbido largo que baja",
  },
};

export const LAYER_LABEL = [
  "Residentes",
  "Visitantes de verano",
  "Visitantes de invierno",
];

// Cada capa:
//   maxBirds: aves que pueden cantar a la vez en el pico (y aves que se dibujan en la curva);
//   rate: cantos por segundo en el pico; pan/spread: lado del estéreo y cuánto se reparten;
//   gain: volumen de la capa; far: distancia fija (0 cerca, 1 lejos); fixed: no sigue al dato;
//   steady: canta parejo, un canto tras otro (las residentes), en vez de al azar.
export const LAYERS = {
  0: {
    maxBirds: 1,
    rate: 0.7,
    pan: 0,
    spread: 0.35,
    gain: 0.75,
    far: 0.55,
    fixed: true,
    steady: true,
  },
  1: {
    maxBirds: 4,
    rate: 2.2,
    pan: -0.6,
    spread: 0.35,
    gain: 1,
    far: 0,
    fixed: false,
    steady: false,
  },
  2: {
    maxBirds: 3,
    rate: 2,
    pan: 0.6,
    spread: 0.3,
    gain: 0.75, // un silbido sostenido suena más fuerte que una ráfaga del mismo nivel medio
    far: 0,
    fixed: false,
    steady: false,
  },
};

// Contraste: elevar a una potencia separa los meses bajos de los altos (un oído no distingue
// bien 31 % de 42 %, pero sí «casi nada» de «mucho»).
export const CONTRAST = 1.6;
// Piso: aun en su mes más bajo el grupo tiene decenas de especies; su ave canta poco y lejos,
// pero no se calla varios segundos seguidos (eso se leería como «no hay ninguna»).
export const FLOOR = 0.1;

// Nivel 0–1 de una capa: especies del grupo / su propio pico, con contraste y piso.
export function layerLevel(k, count, peak) {
  if (LAYERS[k].fixed) return 1;
  if (!(peak > 0)) return 0;
  const ratio = Math.min(1, Math.max(0, count / peak));
  return ratio > 0 ? FLOOR + (1 - FLOOR) * Math.pow(ratio, CONTRAST) : 0;
}

/**
 * Cómo suena una capa en un momento: cuántas aves pueden cantar a la vez, cada cuánto entra una
 * nueva, a qué volumen y a qué distancia.
 */
export function layerState(k, count, peak) {
  const layer = LAYERS[k];
  const level = layerLevel(k, count, peak);
  const birds = layer.fixed
    ? 1
    : Math.max(1, Math.round(level * layer.maxBirds));
  return {
    level,
    birds,
    rate: layer.rate * level,
    gain: layer.gain * (0.55 + 0.45 * level),
    // Pocas especies: el canto llega de más lejos.
    distance: layer.fixed ? layer.far : 0.55 * (1 - level),
  };
}

// Las residentes ceden espacio cuando las visitantes cantan fuerte.
export function residentDuck(levels) {
  return 1 - 0.3 * Math.max(levels[1] ?? 0, levels[2] ?? 0);
}

// Tiempo hasta el próximo canto: proceso de Poisson (las aves no cantan a compás).
export function nextInterval(rate, random = Math.random) {
  if (!(rate > 0.01)) return Infinity;
  return -Math.log(1 - random()) / rate;
}

// Primer lugar libre para un ave nueva: el ave 0 es la que está posada en la curva; las demás
// aparecen a su lado solo mientras cantan. busyUntil: hasta cuándo está ocupado cada lugar.
export function freeSlot(busyUntil, at, birds) {
  for (let i = 0; i < Math.min(birds, busyUntil.length); i++)
    if (busyUntil[i] <= at) return i;
  return -1;
}

export const yearSeconds = (segments) => segments * SECONDS_PER_MONTH;

/**
 * «El coro de las estaciones»: la barra recorre el gráfico de julio a junio y en cada curva un ave
 * canta por su grupo. Reglas puras (sin Web Audio ni DOM), para poder probarlas.
 *
 * Una sola idea por capa: cuántas especies de su grupo hay en ese momento del año.
 *   · Residentes: siempre presentes y casi constantes. Suenan de fondo, lejos (apagadas y con eco),
 *     sin cambiar durante todo el año: el piso verde que no se mueve.
 *   · Verano e invierno: al frente, nítidas. Cuantas más especies hay, más aves cantan a la vez,
 *     más seguido y más cerca; cuando hay pocas, un ave suelta cada tanto, lejana.
 * La forma de cada capa sigue su propia curva (el pico de invierno, en mayo, se oye), pero el
 * tamaño del coro respeta la diferencia entre grupos: verano llega a cinco aves y el invierno a tres.
 *
 * Para que tres coros a la vez se sigan oyendo por separado:
 *   · distancia: las residentes atrás; las visitantes adelante (la misma metáfora que «Escuchar
 *     su año»: menos presencia, más lejos);
 *   · lugar: cada grupo sale de su lado del estéreo, el mismo lado donde está su ave en el gráfico
 *     (verano a la izquierda de la barra, invierno a la derecha, residentes al centro y atrás);
 *   · timbre y ritmo: especies elegidas por contraste dentro de cada grupo (ver SPECIES);
 *   · pocas voces y entradas desfasadas; las residentes bajan un poco cuando cantan las visitantes.
 */

export const SECONDS_PER_MONTH = 3; // la barra recorre los 11 tramos jul → jun en 33 s

// Especies que cantan por cada grupo (nombres de overview.json). Elegidas porque su presencia
// nacional sigue la estación de su grupo (las de verano, ausentes de jun a ago; las de invierno,
// de dic a feb), porque tienen una grabación limpia y porque se distinguen entre sí:
//   verano: canto agudo y rápido (gorjeos de golondrina y jilguero, chillido de picaflor) y el
//     «fío-fío», la visitante de verano más conocida;
//   invierno: notas más lentas y algo más graves (la Viudita, emblema del invierno en Chile central;
//     la Tenca de alas blancas, la Bandurrilla de los bosques y el silbido del Chorlito chileno);
//   residentes: el Chincol, la Diuca, la Loica y el arrullo grave de la Tórtola.
export const SPECIES = {
  0: ["Chincol", "Diuca común", "Loica", "Tórtola"],
  1: [
    "Fío-fío",
    "Jilguero cordillerano",
    "Golondrina barranquera",
    "Picaflor cordillerano",
  ],
  2: [
    "Viudita",
    "Tenca de alas blancas",
    "Bandurrilla de los bosques",
    "Chorlito chileno",
  ],
};

export const LAYER_LABEL = [
  "Residentes",
  "Visitantes de verano",
  "Visitantes de invierno",
];

// Cada capa:
//   maxBirds: aves que pueden cantar a la vez en el pico; rate: cantos por segundo en el pico;
//   phrase: duración de cada canto (s); pan/spread: lado del estéreo y cuánto se reparten;
//   gain: volumen de la capa; far: distancia fija (0 cerca, 1 lejos); fixed: no sigue al dato.
export const LAYERS = {
  0: {
    maxBirds: 2,
    rate: 1.2,
    phrase: 2.6,
    pan: 0,
    spread: 0.9,
    gain: 0.55,
    far: 0.85,
    fixed: true,
  },
  1: {
    maxBirds: 5,
    rate: 3.2,
    phrase: 1.6,
    pan: -0.55,
    spread: 0.5,
    gain: 1,
    far: 0,
    fixed: false,
  },
  2: {
    maxBirds: 3,
    rate: 2,
    phrase: 1.8,
    pan: 0.55,
    spread: 0.45,
    gain: 0.95,
    far: 0,
    fixed: false,
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
  const birds = Math.max(1, Math.round(level * layer.maxBirds));
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

export const yearSeconds = (segments) => segments * SECONDS_PER_MONTH;

/**
 * «Especies presentes en Chile, mes a mes» como curva continua.
 *
 * El gráfico apila las tres clases (residentes abajo, invierno al medio, verano arriba) y une los
 * doce meses con d3.curveMonotoneX. La barra que recorre el año necesita saber, en cualquier punto
 * entre dos meses, dónde está cada borde y cuán gruesa es cada banda: este módulo reproduce esa
 * misma curva (los mismos puntos de control de Bézier que dibuja d3), para que el sonido y las
 * aves sigan exactamente lo que se ve, y no un escalón por mes.
 *
 * Posición p: 0 = julio … 11 = junio (orden austral, el mismo del eje X).
 */
import { AUSTRAL } from "../shared/calendar.js";

// Orden de apilado del gráfico: residentes (0), invierno (2), verano (1).
export const STACK = [0, 2, 1];
export const LAST = AUSTRAL.length - 1;

// Pendientes de d3.curveMonotoneX (d3-shape, monotone.js) con x equiespaciado (h = 1).
const sign = (x) => (x < 0 ? -1 : 1);
function slope3(y0, y1, y2) {
  const s0 = y1 - y0,
    s1 = y2 - y1,
    p = (s0 + s1) / 2;
  return (
    (sign(s0) + sign(s1)) *
      Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0
  );
}
const slope2 = (y0, y1, t) => (3 * (y1 - y0) - t) / 2;

// Pendiente en cada punto, tal como la usa d3 (los extremos, con slope2).
export function tangents(values) {
  const n = values.length;
  const t = new Array(n).fill(0);
  if (n < 2) return t;
  if (n === 2) {
    t[0] = t[1] = values[1] - values[0];
    return t;
  }
  for (let i = 1; i < n - 1; i++)
    t[i] = slope3(values[i - 1], values[i], values[i + 1]);
  t[0] = slope2(values[0], values[1], t[1]);
  t[n - 1] = slope2(values[n - 2], values[n - 1], t[n - 2]);
  return t;
}

// Valor de la curva en p (0 … n−1). Con x equiespaciado, la Bézier de d3 avanza en x de forma
// lineal: el parámetro del tramo es directamente la fracción entre los dos meses.
export function curveAt(values, slopes, p) {
  const n = values.length;
  const q = Math.min(n - 1, Math.max(0, p));
  const i = Math.min(n - 2, Math.floor(q));
  const s = q - i;
  const y0 = values[i],
    y1 = values[i + 1];
  const c0 = y0 + slopes[i] / 3,
    c1 = y1 - slopes[i + 1] / 3;
  const u = 1 - s;
  return (
    u * u * u * y0 + 3 * u * u * s * c0 + 3 * u * s * s * c1 + s * s * s * y1
  );
}

/**
 * months: conteos por mes calendario [[residentes, verano, invierno], …] (overview.json).
 * Devuelve at(p) → { edges: [abajo de residentes, techo de residentes, techo de invierno, techo de
 * verano], counts: [residentes, verano, invierno] (grosor de cada banda, por clase) }.
 */
export function createPulseCurve(months) {
  const rows = AUSTRAL.map((m) => months[m]);
  // Bordes acumulados en el orden de apilado; d3.area interpola cada borde por separado.
  const edgeValues = [0, 1, 2].map((e) =>
    rows.map((v) => STACK.slice(0, e + 1).reduce((sum, k) => sum + v[k], 0)),
  );
  const edgeSlopes = edgeValues.map(tangents);
  const peak = [0, 1, 2].map((k) => Math.max(...rows.map((v) => v[k])));
  function at(p) {
    const top = edgeValues.map((values, e) =>
      curveAt(values, edgeSlopes[e], p),
    );
    const edges = [0, ...top];
    const counts = [0, 0, 0];
    STACK.forEach((k, e) => {
      counts[k] = Math.max(0, edges[e + 1] - edges[e]);
    });
    return { p, edges, counts };
  }
  return { at, peak, rows };
}

// Mes calendario más cercano a la posición p.
export const monthAt = (p) =>
  AUSTRAL[Math.min(LAST, Math.max(0, Math.round(p)))];
export const positionOf = (month) => AUSTRAL.indexOf(month);

/** Describe los eventos sonoros del atlas según mes, región y especie. */
import { d3 } from "../shared/d3.js";

export function createAtlasPlan({ data, state, rm, grainOf, getSounds }) {
  const ZONES = [
    { name: "Norte Grande", ids: [1, 2, 3] },
    { name: "Norte Chico", ids: [4, 5] },
    { name: "Centro", ids: [6, 7, 8, 9] },
    { name: "Sur", ids: [10, 11, 12, 13, 14] },
    { name: "Austral", ids: [15, 16] },
  ];
  const PENTATONIC = [0, 3, 5, 7, 10];
  const regionLat = (id) => data.regionById.get(id).lat;
  function latSemis(lat) {
    const [lo, hi] = d3.extent(
      data.meta.regions.filter((r) => r.id),
      (r) => r.lat,
    );
    const degree = Math.round(((lat - lo) / (hi - lo)) * 5); // 0 = sur … 5 = norte
    return 12 * Math.floor(degree / 5) + PENTATONIC[degree % 5] - 6; // −6 … +6 semitonos
  }
  const rateFor = (lat) => Math.pow(2, latSemis(lat) / 12);

  // Presencia estacional de una clase en una región, 0–1 respecto de su propio rango anual.
  function waveLevel(id, col, m) {
    const series = data.regionMonth[String(id)].map((x) => x[col]);
    const [lo, hi] = d3.extent(series);
    return hi > lo ? (series[m] - lo) / (hi - lo) : 0;
  }
  // Peso absoluto (para el volumen): cuántas especies de la clase hay, vs. el máximo nacional.
  function waveWeight(id, col, m) {
    const max = d3.max(
      data.meta.regions.filter((r) => r.id),
      (r) => d3.max(data.regionMonth[String(r.id)], (x) => x[col]),
    );
    return rm(id, m)[col] / max;
  }

  function barFor(m) {
    const layers = (getSounds() && getSounds().layers) || {};
    const zones = state.scope ? [{ ids: [state.scope] }] : ZONES;
    const slot = 1 / zones.length;
    // Pocos cantos por zona: con más, los granos se encimaban y el resultado era ruido.
    const maxPer = state.scope ? 3 : 2;
    const hits = [];
    const place = (z, k, n, shift) =>
      z * slot + ((k + 0.5) / n + shift) * slot * 0.9;
    zones.forEach((zone, z) => {
      const lat = d3.mean(zone.ids, regionLat);
      if (state.species !== null) {
        const rows = data.bySpecies.get(state.species);
        const level =
          d3.max(zone.ids, (id) =>
            rows.get(id)
              ? (rows.get(id).prof[m] / 100) * (rows.get(id).years[m] / 8)
              : 0,
          ) || 0;
        const n = Math.round(level * maxPer);
        for (let k = 0; k < n; k++)
          hits.push({
            at: place(z, k, n, 0),
            sample: grainOf(state.species),
            rate: rateFor(lat),
            gain: 0.32,
            pan: 0,
          });
        return;
      }
      [
        [1, "visitante_estival", -0.35, 0],
        [2, "visitante_invernal", 0.35, 0.25 / maxPer],
      ].forEach(([cls, key, pan, shift]) => {
        const col = cls + 1;
        const level = d3.mean(zone.ids, (id) => waveLevel(id, col, m));
        const weight = d3.mean(zone.ids, (id) => waveWeight(id, col, m));
        const n = Math.round(level * maxPer);
        const sample = layers[key] !== undefined ? grainOf(layers[key]) : null;
        for (let k = 0; k < n; k++) {
          hits.push({
            at: place(z, k, n, shift),
            sample,
            rate: rateFor(lat),
            gain: 0.1 + 0.3 * Math.sqrt(weight),
            pan,
          });
        }
      });
    });
    const root = state.scope ? 110 * rateFor(regionLat(state.scope)) : 110;
    const residents =
      rm(state.scope, m)[1] /
      d3.max(data.regionMonth[String(state.scope)], (x) => x[1]);
    return {
      tick: true,
      pad: {
        freqs: [root, root * 1.5],
        gain: (state.species !== null ? 0.025 : 0.06) * residents,
      },
      hits,
    };
  }

  return { barFor };
}

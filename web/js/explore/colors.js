/** Configura las escalas de color del atlas. */
import { d3 } from "../shared/d3.js";

export function createExploreColors({ data }) {
  const dark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  // Una rampa secuencial por clase (mismo tono que su muestra de color).
  const RAMPS = dark
    ? [
        ["#1b2622", "#11533e", "#288665", "#5cc79f", "#cdeee0"], // residentes: verde
        ["#2a2219", "#7a4a16", "#c9701e", "#ee9b45", "#fbe0bf"], // verano: naranja
        ["#1b232b", "#123f63", "#1f78b4", "#6fb9e6", "#d2ecfa"], // invierno: azul frío
      ]
    : [
        ["#edf6f2", "#b3dcc9", "#58ad8a", "#288665", "#0e4733"],
        ["#fdf4ea", "#f9d3a9", "#ee9b45", "#c9701e", "#7e420c"],
        ["#eef6fb", "#b6dcf0", "#5eb0dc", "#1f78b4", "#0b4470"],
      ];
  const classScale = RAMPS.map((r) =>
    d3.scaleSequential(d3.interpolateRgbBasis(r)).domain([0, 100]),
  );
  // Grilla general: desviación de la proporción de visitantes respecto del promedio anual de la región.
  // Verde (dominan las residentes) ↔ violeta (más visitantes que lo habitual); legible con daltonismo.
  const DIVERGING = dark
    ? ["#36a67e", "#1c4a3a", "#2a2a28", "#4e3a7a", "#a58be6"]
    : ["#1f6f53", "#a9d6c3", "#f1f0ec", "#c9b8e8", "#6a3fb0"];
  const deviation = d3.scaleDiverging(d3.interpolateRgbBasis(DIVERGING));
  deviation.domain(data.deviationDomain).clamp(true);

  return { RAMPS, classScale, deviation };
}

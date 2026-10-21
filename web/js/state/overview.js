// Mes del gráfico «Especies presentes en Chile, mes a mes» (y de los mapas por mes).
export function createOverviewState() {
  return { month: 0 };
}
// Mes propio de «Una silueta, una especie», con su selector bajo el gráfico.
export function createFlockState() {
  return { month: 0 };
}
export function createMapState() {
  return { mode: "zones", region: 7 };
}

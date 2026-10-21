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
// «El coro de las estaciones»: estado del recorrido sonoro del gráfico de arriba.
// position: dónde está la barra (0 = julio … 11 = junio); null = sigue al mes elegido.
export function createChorusState() {
  return { status: "idle", position: null, scrubbing: false };
}

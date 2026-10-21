export function createOverviewState() {
  return { month: 0 };
}
export function createMapState() {
  return { mode: "zones", region: 7 };
}
// Avance automático del mes: el año recorre sus meses solo, hasta que se pausa.
export function createClockState() {
  return { paused: false };
}

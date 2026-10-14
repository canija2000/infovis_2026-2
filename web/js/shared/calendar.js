export const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
export const MON = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];
// Año austral (jul → jun): el verano queda al centro. Año calendario (ene → dic): el invierno queda al centro.
export const AUSTRAL = [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5];
export const CALENDAR = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
export const SEASON_OF = [
  "verano",
  "verano",
  "otoño",
  "otoño",
  "otoño",
  "invierno",
  "invierno",
  "invierno",
  "primavera",
  "primavera",
  "primavera",
  "verano",
];
export function seasonRuns(order) {
  const runs = [];
  order.forEach((m, i) => {
    const last = runs[runs.length - 1];
    if (last && last.label === SEASON_OF[m]) last.to = i + 1;
    else runs.push({ label: SEASON_OF[m], from: i, to: i + 1 });
  });
  runs.forEach((r) => {
    if (r.to - r.from === 1) r.label = r.label.slice(0, 3) + ".";
  });
  return runs;
}

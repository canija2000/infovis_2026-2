export const fmt = new Intl.NumberFormat("es-CL");
export const pct = (v, d = 0) => `${(v * 100).toFixed(d).replace(".", ",")} %`;
export function freqText(row, m) {
  const f = row.freq[m] / 1000;
  if (row.rid === 0)
    return `registrada en ${pct(f)} de los días (media de las 16 regiones)`;
  const days = new Date(2021, m + 1, 0).getDate();
  return `registrada en ${pct(f)} de los días (≈ ${(f * days).toFixed(1).replace(".", ",")} de ${days})`;
}

/** Locale-aware decimal formatting for metric values and worked calculations. */
export const formatNumber = (value, digits = 1) =>
  value.toLocaleString("es-CL", { maximumFractionDigits: digits });

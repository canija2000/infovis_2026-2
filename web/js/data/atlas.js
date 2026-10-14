/** Carga los datos base y construye índices de consulta del atlas. */
import { d3 } from "../shared/d3.js";
export async function loadAtlas() {
  const get = (f) =>
    fetch(`data/${f}`).then((r) => {
      if (!r.ok) throw new Error(`${f}: ${r.status}`);
      return r.json();
    });
  const [meta, species, typical, regionMonth, geo] = await Promise.all([
    get("meta.json"),
    get("species.json"),
    get("typical_year.json"),
    get("region_month.json"),
    get("regions.min.geojson"),
  ]);
  const byScope = new Map();
  const bySpecies = new Map();
  for (const r of typical.rows) {
    const row = {
      sid: r[0],
      rid: r[1],
      cls: r[2],
      peak: r[3],
      phase: r[4],
      amp: r[5],
      present: r[6],
      freq: r.slice(7, 19),
      prof: r.slice(19, 31),
      years: r.slice(31, 43),
    };
    row.mean = d3.mean(row.freq);
    if (!byScope.has(row.rid)) byScope.set(row.rid, []);
    byScope.get(row.rid).push(row);
    if (!bySpecies.has(row.sid)) bySpecies.set(row.sid, new Map());
    bySpecies.get(row.sid).set(row.rid, row);
  }
  const regionById = new Map(meta.regions.map((r) => [r.id, r]));
  const effortMean = new Map(
    Object.entries(regionMonth.scopes).map(([k, months]) => [
      +k,
      d3.mean(months, (x) => x[5]),
    ]),
  );
  // Dominio simétrico de la desviación (proporción de visitantes − promedio anual de la región).
  // Percentil 95 de |desviación| para que un extremo no apague el resto (la escala satura arriba de eso).
  const devs = [];
  for (const months of Object.values(regionMonth.scopes)) {
    const mean = d3.mean(months, (x) => x[4]);
    months.forEach((x) => devs.push(Math.abs(x[4] - mean)));
  }
  const dev = Math.ceil(d3.quantile(devs.sort(d3.ascending), 0.95) * 100) / 100;

  return {
    meta,
    species,
    byScope,
    bySpecies,
    regionMonth: regionMonth.scopes,
    geo,
    regionById,
    effortMean,
    deviationDomain: [-dev, 0, dev],
  };
}

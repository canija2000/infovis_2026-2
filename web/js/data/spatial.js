/** Carga la geografía y las grillas espaciales; conserva cada detalle regional por código. */
import { d3 } from "../shared/d3.js";
const CONTINENT_WEST = -76; // longitud: deja fuera Juan Fernández, Desventuradas y Rapa Nui
const getJSON = (f) =>
  fetch(`data/${f}`).then((r) => {
    if (!r.ok) throw new Error(`${f}: ${r.status}`);
    return r.json();
  });

// Quita del contorno las islas oceánicas (polígonos al oeste de CONTINENT_WEST).
function continental(feature) {
  const g = feature.geometry;
  const keep = (poly) => d3.max(poly[0], (p) => p[0]) > CONTINENT_WEST;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return {
    ...feature,
    geometry: { type: "MultiPolygon", coordinates: polys.filter(keep) },
  };
}

export async function loadSpatialMaps() {
  const [meta, grid, regionMonth, geo] = await Promise.all([
    getJSON("meta.json"),
    getJSON("grid_month.json?v=1"),
    getJSON("region_month.json"),
    getJSON("regions.min.geojson"),
  ]);
  const names = new Map(meta.regions.map((r) => [r.id, r.name]));
  const codes = new Map(meta.regions.map((r) => [r.id, r.code]));
  const months = grid.months.map((rows) =>
    rows
      .filter(([cell]) => grid.cells[cell][0] > CONTINENT_WEST)
      .map(([cell, total, res, est, inv, wave]) => ({
        cell: grid.cells[cell],
        total,
        res,
        est,
        inv,
        wave: wave / 1000,
      }))
      .sort((a, b) => b.total - a.total),
  ); // los grandes abajo, los chicos encima
  // Modo regiones: nivel de cada ola relativo al rango anual de la región.
  const level = (series) => {
    const [lo, hi] = d3.extent(series);
    return series.map((v) => (hi > lo ? (v - lo) / (hi - lo) : 0));
  };
  const regionWave = new Map();
  for (const f of geo.features) {
    const rows = regionMonth.scopes[String(f.properties.id)];
    if (!rows) continue;
    const summer = level(rows.map((x) => x[2]));
    const winter = level(rows.map((x) => x[3]));
    regionWave.set(f.properties.id, {
      index: summer.map((v, m) => v - winter[m]),
      rows,
      low: d3.mean(rows, (x) => x[5]) < 400,
    });
  }
  const land = {
    type: "FeatureCollection",
    features: geo.features.map(continental),
  };
  return { geo, land, grid, months, regionWave, names, codes };
}

export function createRegionLoader() {
  const cache = new Map();
  async function loadRegion(code) {
    if (!cache.has(code)) {
      cache.set(
        code,
        getJSON(`grid_region/${code}.json?v=1`).catch((err) => {
          cache.delete(code);
          throw err;
        }),
      );
    }
    return cache.get(code);
  }
  return loadRegion;
}

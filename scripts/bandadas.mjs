// Datos de bandadas para la vista inmersiva del Mirador y para el servo: 2024, mes a mes, por región.
//
//   node scripts/bandadas.mjs
//
// Entrada: web/data/observations-*.json (días con registro por especie, región y mes; GBIF, 91–98 % eBird)
// y web/mirador/data/game/index.json (clase de cada especie en cada región).
// Salida en web/mirador/data/:
//   bandadas-2024.json  por región y mes: cada especie presente con su clase y sus días; cuáles llegan y cuáles se van
//   bandadas-2024.csv   una fila por región y mes, solo números: lo que necesita el servo o el Arduino
//
// Por qué por región y no por zona: las zonas miden ~1,4 km y los registros locales son escasos (en el bosque
// de Los Ríos, casi cero en todo el año). La región en 2024 trae ~150 especies por mes y muestra la ola.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'web/mirador/data');
const YEAR = 2024;
const REGIONS = ['CL-AP', 'CL-VS', 'CL-RM', 'CL-LR', 'CL-MA']; // las que tienen zonas en el Mirador, de norte a sur
const MIN_DAYS = 3; // días con registro en el mes para contar como presente: evita que un registro suelto entre y salga
const CLASES = { residente: 'residente', visitante_estival: 'verano', visitante_invernal: 'invierno' };

const read = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const index = read('web/mirador/data/game/index.json');
const bySci = new Map(index.species.map(s => [s.sciName, s]));
const obs = [...read('web/data/observations-01.json'), ...read('web/data/observations-02.json')];
const daysIn = m => new Date(YEAR, m + 1, 0).getDate();

const out = {
  year: YEAR,
  months: index.months,
  minDays: MIN_DAYS,
  notes: [
    `Una especie está presente en un mes si se registró al menos ${MIN_DAYS} días de ese mes en la región (2024).`,
    'dias: días del mes con al menos un registro (1 a 31). freq = dias / días del mes, de 0 a 1: sirve como tamaño de la bandada.',
    'llegan / se_van: especies presentes este mes y no el anterior, y al revés. Enero se compara con diciembre de 2024.',
    'aves: suma de freq de las presentes de esa clase. Es el «tamaño» total de las bandadas, no un conteo de individuos.',
    'indice_*: aves de esa clase en ese mes, de 0 a 100 respecto del mes con más en la región. Listo para el ángulo de un servo.',
    'Clases (año típico 2017–2024, Entrega 1): residente, verano (visitante estival), invierno (visitante invernal). Las ocasionales y sin clase no se cuentan.',
    'Fuente: GBIF (91–98 % eBird).',
  ],
  regions: [],
};
const csv = ['region,mes,presentes,llegan,se_van,residentes,verano,invierno,aves_residentes,aves_verano,aves_invierno,indice_verano,indice_invierno,indice_visitantes'];

for (const code of REGIONS) {
  const meta = index.regions.find(r => r.code === code), rid = String(meta.id);
  const present = index.months.map((_, m) => {
    const ym = `${YEAR}-${String(m + 1).padStart(2, '0')}`, map = new Map();
    for (const o of obs) {
      if (o.region_code !== code || o.year_month !== ym || o.reportDays < MIN_DAYS) continue;
      const sp = bySci.get(o.sciName), clase = CLASES[sp?.regionalClass[rid]];
      if (clase) map.set(sp.id, { id: sp.id, nombre: sp.comName, clase, dias: o.reportDays, freq: +(o.reportDays / daysIn(m)).toFixed(3) });
    }
    return map;
  });
  const months = present.map((now, m) => {
    const prev = present[(m + 11) % 12], list = [...now.values()].sort((a, b) => b.dias - a.dias);
    const of = c => list.filter(s => s.clase === c);
    const aves = c => +of(c).reduce((a, s) => a + s.freq, 0).toFixed(2);
    return {
      mes: m,
      presentes: list.length,
      residentes: of('residente').length, verano: of('verano').length, invierno: of('invierno').length,
      aves_residentes: aves('residente'), aves_verano: aves('verano'), aves_invierno: aves('invierno'),
      llegan: list.filter(s => !prev.has(s.id)).map(s => s.id),
      se_van: [...prev.values()].filter(s => !now.has(s.id)).map(s => s.id),
      especies: list,
    };
  });
  const top = k => Math.max(...months.map(x => x[k])) || 1;
  const tv = top('aves_verano'), ti = top('aves_invierno'), tvis = Math.max(...months.map(x => x.aves_verano + x.aves_invierno)) || 1;
  for (const x of months) {
    x.indice_verano = Math.round(x.aves_verano / tv * 100);
    x.indice_invierno = Math.round(x.aves_invierno / ti * 100);
    x.indice_visitantes = Math.round((x.aves_verano + x.aves_invierno) / tvis * 100);
    csv.push([code, x.mes, x.presentes, x.llegan.length, x.se_van.length, x.residentes, x.verano, x.invierno,
      x.aves_residentes, x.aves_verano, x.aves_invierno, x.indice_verano, x.indice_invierno, x.indice_visitantes].join(','));
  }
  out.regions.push({ code, name: meta.name, zones: Object.keys(read(`web/mirador/data/game/${meta.terrainFile}`).scenes), months });
}

writeFileSync(join(OUT, 'bandadas-2024.json'), JSON.stringify(out) + '\n');
writeFileSync(join(OUT, 'bandadas-2024.csv'), csv.join('\n') + '\n');
console.log(`bandadas-2024: ${out.regions.length} regiones × 12 meses = ${csv.length - 1} filas`);

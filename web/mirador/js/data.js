// Carga de datos (generados por infovis_2026-2/python_scripts/build_game_data.py) y textos
// derivados: diálogo en primera persona de cada ave y cartel de bienvenida de la región.
// Nunca se comparan reportDays crudos entre años o regiones (ver SET_UP §4): se usan share,
// bestYear, topRegions y el perfil estacional.

// Copia local (scripts/sync_data.py). Cuando el repo principal publique los datos en Pages:
// 'https://canija2000.github.io/infovis_2026-2/data/game/' (y audio desde .../infovis_2026-2/).
export const DATA_BASE = 'data/game/';
export const AUDIO_BASE = '';

export const CLASS_COLORS = {
  residente: '#288665', visitante_estival: '#ee9b45', visitante_invernal: '#4a7fd0', ocasional: '#9a9aa6',
};
const CLASS_LABEL = {
  residente: 'residente', visitante_estival: 'visitante de verano',
  visitante_invernal: 'visitante de invierno', ocasional: 'ocasional',
};

// Voz de las especies destacadas: artículo y onomatopeya del saludo (el resto usa "¡Pío!").
// Qué especies aparecen en cada escena lo dice species.habitat.scenes = {región: escena}.
export const VOICE = {
  'Turdus falcklandii': { art: 'el', hi: '¡Chiuit chiuit!' },
  'Zonotrichia capensis': { art: 'el', hi: '¡Tiu tiu tiriú!' },
  'Troglodytes musculus': { art: 'el', hi: '¡Trrr-tiriri!' },
  'Zenaida auriculata': { art: 'la', hi: '¡Cu-cuuu!' },
  'Pteroptochos megapodius': { art: 'la', hi: '¡Hu-hu-hu-huuu!' },
  'Mimus thenca': { art: 'la', hi: '¡Chirivirí chirí!' },
  'Scelorchilus albicollis': { art: 'el', hi: '¡Tapa-tapa-culo!' },
  'Diuca diuca': { art: 'la', hi: '¡Diu-diu-diuca!' },
  'Vanellus chilensis': { art: 'el', hi: '¡Tero-tero-teru!' },
  'Sturnella loyca': { art: 'la', hi: '¡Tsi-trriii!' },
  'Oreotrochilus leucopleurus': { art: 'el', hi: '¡Tsip! ¡Tsip!' },
  'Muscisaxicola frontalis': { art: 'la', hi: '¡Tic… tic!' },
  'Pelecanus thagus': { art: 'el', hi: '(…silencio de pelícano…) ¡Gruac!' },
  'Larus dominicanus': { art: 'la', hi: '¡Kiau-kiau-kiau!' },
  'Haematopus palliatus': { art: 'el', hi: '¡Pli-pli-pilpilén!' },
  'Leucophaeus modestus': { art: 'la', hi: '¡Kruu-kruu!' },
  'Phalacrocorax brasilianus': { art: 'el', hi: '¡Groc!' },
  'Egretta thula': { art: 'la', hi: '¡Graaak!' },
  'Himantopus mexicanus': { art: 'el', hi: '¡Kek-kek-kek!' },
  'Anas georgica': { art: 'el', hi: '¡Cuac-cuac!' },
  'Phytotoma rara': { art: 'la', hi: '¡Rrraaa-ra!' },
  'Patagona gigas': { art: 'el', hi: '¡Tsuiip!' },
  'Callipepla californica': { art: 'la', hi: '¡Cu-cá-cou!' },
  'Anairetes parulus': { art: 'el', hi: '¡Tri-tri-tri!' },
  'Cathartes aura': { art: 'el', hi: '(los jotes no cantan: solo sisean) ¡Shhh!' },
  'Columbina picui': { art: 'la', hi: '¡Cuú-cuú!' },
  'Sephanoides sephaniodes': { art: 'el', hi: '¡Tsi-tsi-tsi!' },
  'Columba livia': { art: 'la', hi: '¡Gru-gruu!' },
  'Chloephaga picta': { art: 'el', hi: '¡Sip-sip! (y la hembra: ¡Grrr!)' },
  'Rhea pennata': { art: 'el', hi: '(el ñandú casi no canta) ¡Hmmm-bum!' },
  'Vultur gryphus': { art: 'el', hi: '(los cóndores no cantan) ¡Fshhh!' },
  'Phoenicopterus chilensis': { art: 'el', hi: '¡Honk-honk!' },
  'Aphrastura spinicauda': { art: 'el', hi: '¡Tri-tri-tri-rayadito!' },
  'Enicognathus ferrugineus': { art: 'la', hi: '¡Crii-crii-cachaña!' },
  'Campephilus magellanicus': { art: 'el', hi: '¡Tok… tok-tok!' },
  'Phrygilus patagonicus': { art: 'el', hi: '¡Tsuit-tsuit!' },
  'Spheniscus magellanicus': { art: 'el', hi: '¡Hiaaa-hiaaa! (como un burro)' },
  'Leucocarbo atriceps': { art: 'el', hi: '¡Arrk!' },
  'Haematopus leucopodus': { art: 'el', hi: '¡Pii-pii-piip!' },
  'Stercorarius chilensis': { art: 'el', hi: '¡Kek-kek-kiaah!' },
  'Cygnus melancoryphus': { art: 'el', hi: '¡Uíp-uíp!' },
  'Tachyeres patachonicus': { art: 'el', hi: '¡Graak! (y a remar)' },
  'Lophonetta specularioides': { art: 'el', hi: '¡Cuac-cuac-cuaac!' },
  'Coscoroba coscoroba': { art: 'el', hi: '¡Cos-co-rooo-ba!' },
  // Arica y Parinacota
  'Larus belcheri': { art: 'la', hi: '¡Kiaau-kiaau!' },
  'Chroicocephalus serranus': { art: 'la', hi: '¡Krii-krii!' },
  'Ardea alba': { art: 'la', hi: '¡Grrraak!' },
  'Nycticorax nycticorax': { art: 'el', hi: '¡Kuak! (de noche se me oye más)' },
  'Gallinula chloropus': { art: 'la', hi: '¡Krrruk-kek-kek!' },
  'Spatula cyanoptera': { art: 'el', hi: '¡Cuac-cuac!' },
  'Plegadis ridgwayi': { art: 'el', hi: '¡Grrr-grrr!' },
  'Zenaida meloda': { art: 'la', hi: '¡Cuu-cu-cuuu!' },
  'Columbina cruziana': { art: 'la', hi: '¡Pru-up! ¡Pru-up!' },
  'Rhodopis vesper': { art: 'el', hi: '¡Tsit-tsit!' },
  'Thaumastura cora': { art: 'el', hi: '¡Tsi-tsi-tsi!' },
  'Pyrocephalus rubinus': { art: 'el', hi: '¡Pi-pi-tirrí!' },
  'Conirostrum cinereum': { art: 'el', hi: '¡Tsi-tsi-tsui!' },
  'Xenospingus concolor': { art: 'la', hi: '¡Tsuit-tsuit!' },
  'Sturnella bellicosa': { art: 'el', hi: '¡Tsiii-trrrr!' },
  'Chloephaga melanoptera': { art: 'el', hi: '¡Guá-guá!' },
  'Lessonia oreas': { art: 'el', hi: '¡Tsip!' },
  'Phrygilus atriceps': { art: 'el', hi: '¡Tui-tui-trrr!' },
  'Metriopelia aymara': { art: 'la', hi: '¡Cu-cuú!' },
  'Oreotrochilus estella': { art: 'el', hi: '¡Tsiik!' },
  'Recurvirostra andina': { art: 'la', hi: '¡Kliit-kliit!' },
  'Fulica gigantea': { art: 'la', hi: '¡Gok-gok! (soy grande y no me gusta volar)' },
  'Podiceps occipitalis': { art: 'el', hi: '¡Pii-uú!' },
  'Phoenicoparrus jamesi': { art: 'la', hi: '¡Ank-ank!' },
  'Spatula puna': { art: 'el', hi: '¡Cuaac!' },
  'Anas flavirostris': { art: 'el', hi: '¡Prrrit-prrrit!' },
  // Los Ríos
  'Scelorchilus rubecula': { art: 'el', hi: '¡Chucaaao! (si canto a tu derecha, es buen augurio)' },
  'Pteroptochos tarnii': { art: 'el', hi: '¡Hued-hued-hued!' },
  'Scytalopus magellanicus': { art: 'el', hi: '¡Pit-pit-pit-pit!' },
  'Sylviorthorhynchus desmursii': { art: 'la', hi: '¡Tsi-tsi-trrrrr!' },
  'Elaenia albiceps': { art: 'el', hi: '¡Fío-fío!' },
  'Patagioenas araucana': { art: 'la', hi: '¡Cuuu-cuu-cuu!' },
  'Podiceps major': { art: 'la', hi: '¡Ua-uaaa! (un lamento largo)' },
  'Agelasticus thilius': { art: 'el', hi: '¡Trile-trile!' },
  'Hymenops perspicillatus': { art: 'el', hi: '¡Tic! (y un saltito al aire)' },
  'Tachuris rubrigastra': { art: 'el', hi: '¡Tic-tic-tirrí!' },
  'Megaceryle torquata': { art: 'el', hi: '¡Kek-kek-kek-kek!' },
  'Chroicocephalus maculipennis': { art: 'la', hi: '¡Kirr-kirr!' },
  'Theristicus melanopis': { art: 'la', hi: '¡Cuá-cuá-cuá! (y despierto a todo el barrio)' },
  'Coragyps atratus': { art: 'el', hi: '(los jotes no cantan: solo sisean) ¡Shhh!' },
  'Caracara plancus': { art: 'el', hi: '¡Traaa-rooo!' },
  'Curaeus curaeus': { art: 'el', hi: '¡Tuit-tuit-tordo!' },
};
export const MVP = VOICE; // compatibilidad

// Especies destacadas de una región (region-<CODE>.json → featured = {sid: {scene, palette, images}}).
// Devuelve {sciName: escena} y deja la paleta de cada una en su ficha de especie.
export function featuredIn(index, region) {
  const out = {};
  for (const [sid, f] of Object.entries(region.featured || {})) {
    const sp = index.byId.get(+sid);
    if (!sp) continue;
    sp.palette = f.palette || sp.palette;
    sp.refImages = f.images;
    out[sp.sciName] = f.scene;
  }
  return out;
}

export async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

export async function loadWorld() {
  const index = await loadJSON(DATA_BASE + 'index.json');
  index.byId = new Map(index.species.map(s => [s.id, s]));
  index.bySci = new Map(index.species.map(s => [s.sciName, s]));
  return index;
}

export async function loadRegion(index, code) {
  const meta = index.regions.find(r => r.code === code);
  const [region, terrain] = await Promise.all([
    loadJSON(DATA_BASE + meta.file),
    meta.terrainFile ? loadJSON(DATA_BASE + meta.terrainFile) : null,
  ]);
  return { meta, region, terrain };
}

export const presentIn = (sp, m) => ((sp.monthsPresent >> m) & 1) === 1;

// Frecuencia (‰ de días con registro) del año típico en la región; si la especie no está entre
// las 40 más frecuentes del mes se usa un valor bajo, para que igual aparezca a veces.
export function freqOf(region, sid, m) {
  const e = region.typical[m].find(r => r[0] === sid);
  return e ? e[2] : 120;
}

// Presencia de una especie en un mes: año típico (year = null) o un año concreto. De cada año solo
// vienen las 30 especies con más registros por mes (years[y][m].cast = [sid, reportDays, share‰]), así
// que no estar ahí no prueba ausencia: una especie del año típico se mantiene, salvo que en el año típico
// sea de las 15 más frecuentes del mes (entonces su ausencia sí dice algo: ese año escaseó). Y una que
// aparece en el elenco del año fuera de su temporada típica, llegó antes o se quedó más.
// Devuelve null (no está) o { freq: ‰ de días con registro, n: cuántas en escena, scarce?, offSeason? }.
export function presenceIn(region, sp, m, year = null) {
  const typical = presentIn(sp, m);
  const f = freqOf(region, sp.id, m);
  const base = typical ? { freq: f, n: f > 900 ? 3 : 2 } : null; // mínimo 2: las destacadas deben verse
  const ym = year && region.years?.[year]?.[m];
  if (!ym) return base;
  const e = ym.cast.find(c => c[0] === sp.id);
  if (e) {
    const fy = Math.min(1000, e[1] / new Date(+year, m + 1, 0).getDate() * 1000);
    return { freq: fy, n: fy > 900 ? 3 : 2, offSeason: !typical };
  }
  if (!typical) return null;
  const rank = region.typical[m].findIndex(r => r[0] === sp.id);
  return rank >= 0 && rank < 15 ? { freq: f * 0.4, n: 1, scarce: true } : base;
}

function monthsRange(sp, months) {
  const on = [...Array(12).keys()].filter(m => presentIn(sp, m));
  if (on.length >= 12) return null;
  // primer mes de la racha (circular) y último
  const start = on.find(m => !presentIn(sp, (m + 11) % 12));
  let end = start;
  while (presentIn(sp, (end + 1) % 12)) end = (end + 1) % 12;
  return [months[start], months[end]];
}

const DIET = {
  'invertebrados': 'bichitos: insectos, arañas y larvas', 'semillas': 'semillas', 'fruta/néctar': 'néctar de flores y algún insecto',
  'omnívoro': 'de todo un poco', 'vertebrados/peces/carroña': 'animalitos más grandes',
};

export function birdDialog(index, sp, regionId, year = null) {
  const mv = VOICE[sp.sciName] || { art: '', hi: '¡Pío!' };
  const months = index.months;
  const cls = sp.regionalClass[String(regionId)] || sp.class;
  const lines = [];
  lines.push(`${mv.hi} Soy ${mv.art ? mv.art + ' ' : ''}<b>${sp.comName}</b>.`);
  if (cls === 'residente') lines.push('Aquí vivo todo el año: soy <b>residente</b>.');
  else {
    const r = monthsRange(sp, months);
    lines.push(`Soy <b>${CLASS_LABEL[cls]}</b>${r ? `: vuelvo cada año entre ${r[0]} y ${r[1]}` : ''}.`);
  }
  lines.push(`Mi mes favorito es <b>${months[sp.peakMonth]}</b>.`);
  const top = index.regions.find(r => r.id === sp.topRegions[0]);
  if (top) lines.push(top.id === regionId ? 'Y donde más me registran en Chile es justo aquí.'
    : `Donde más me registran es en <b>${top.name}</b>.`);
  if (sp.bestYear) lines.push(`En ${sp.bestYear} me registraron más que nunca en relación con las demás aves.`);
  const yi = year && sp.yearIndex?.[index.years.indexOf(+year)];
  if (yi && String(sp.bestYear) !== year) {
    lines.push(yi >= 115 ? `Y en ${year} me vieron más que en un año promedio.` : yi <= 85 ? `En ${year} me vieron menos que en un año promedio.`
      : `En ${year} me vieron más o menos como siempre.`);
  }
  const mo = sp.morphology;
  if (mo) {
    const bits = [];
    if (mo.mass) bits.push(`peso unos ${Math.round(mo.mass)} gramos`);
    if (mo.diet) bits.push(`como ${DIET[mo.diet] || mo.diet}`);
    if (bits.length) lines.push(`Por si te lo preguntabas: ${bits.join(' y ')}.`);
  }
  return lines.join(' ');
}

export function welcomeText(index, meta, month, year = null, region = null) {
  const yearLabel = year || 'año típico';
  const name = id => index.byId.get(id)?.comName;
  const ms = meta.months[month];
  const res = meta.topResidents.slice(0, 3).map(name).filter(Boolean);
  const vis = (ms.visitante_estival >= ms.visitante_invernal ? meta.topSummer : meta.topWinter)
    .map(id => index.byId.get(id)).filter(s => s && presentIn(s, month)).slice(0, 3).map(s => s.comName);
  const car = meta.characteristic.slice(0, 2).map(name).filter(Boolean);
  const art = /^Metropolitana$/.test(meta.name) ? 'la ' : ''; // "la Metropolitana", pero "Valparaíso"
  let t = `Bienvenido a ${art}<b>${meta.name}</b>, ${yearLabel}. En ${year ? 'un ' + index.months[month] + ' típico' : index.months[month]} se registran unas <b>${ms.richness}</b> especies. `;
  t += `Nuestros residentes más vistos son ${list(res)}. `;
  if (vis.length) t += `Este mes nos visitan ${list(vis)}. `;
  if (car.length) t += `Y si tienes suerte, verás a ${list(car)}, más propios de aquí que del resto del país.`;
  const ym = year && region?.years?.[year]?.[month];
  if (ym) {
    // visitantes que más destacaron ese mes por share (‰ de lo registrado), no por conteo crudo
    const stars = ym.cast.map(([sid, , share]) => ({ sp: index.byId.get(sid), share }))
      .filter(({ sp }) => sp && /^visitante/.test(sp.regionalClass[String(meta.id)] || ''))
      .sort((a, b) => b.share - a.share).slice(0, 3).map(({ sp }) => sp.comName);
    t += `<br><br>En ${index.months[month]} de ${year} se registraron <b>${ym.richness}</b> especies (un número que también depende de cuánta gente salió a observar).`;
    if (stars.length) t += ` Entre los visitantes destacaron ${list(stars)}.`;
  }
  return t;
}

const list = a => a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1];

export { CLASS_LABEL };

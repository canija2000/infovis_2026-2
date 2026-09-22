const DATA_PATH = "data/";
let observations = [];
let regions = [];
let regionLayer;
let map;

const number = (value) =>
  new Intl.NumberFormat("es-CL").format(Math.round(value || 0));
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>\"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char],
  );

async function loadData() {
  const [
    regionResponse,
    observationsPartOneResponse,
    observationsPartTwoResponse,
    metadataResponse,
  ] = await Promise.all([
    fetch(`${DATA_PATH}regions.geojson`),
    fetch(`${DATA_PATH}observations-01.json`),
    fetch(`${DATA_PATH}observations-02.json`),
    fetch(`${DATA_PATH}metadata.json`).catch(() => null),
  ]);
  const geojson = await regionResponse.json();
  const [observationsPartOne, observationsPartTwo] = await Promise.all([
    observationsPartOneResponse.json(),
    observationsPartTwoResponse.json(),
  ]);
  observations = observationsPartOne.concat(observationsPartTwo);
  regions = geojson.features;
  const metadata = metadataResponse ? await metadataResponse.json() : {};
  document.querySelector("#coverage").textContent =
    metadata.startDate && metadata.endDate
      ? `${metadata.startDate} — ${metadata.endDate}`
      : "datos disponibles";
  return geojson;
}

function featureStyle(feature) {
  const value = feature.properties.participacion || 0;
  return {
    fillColor: colorFor(value),
    weight: 1.3,
    color: "#fffdf7",
    fillOpacity: 0.88,
  };
}

function colorFor(value) {
  const colors = ["#d9efe1", "#aadabd", "#74b99c", "#3e806b", "#17463e"];
  const max = Math.max(
    ...regions.map((item) => item.properties.participacion || 0),
    1,
  );
  return colors[
    Math.min(colors.length - 1, Math.floor((value / max) * colors.length))
  ];
}

function showRegion(feature) {
  const props = feature.properties;
  const code = props.region_code;
  const selected = observations.filter((item) => item.region_code === code);
  const speciesMap = new Map();
  selected.forEach((item) => {
    const key = item.speciesCode || item.sciName || item.comName;
    const entry = speciesMap.get(key) || {
      name: item.comName,
      scientific: item.sciName,
      count: 0,
      individuals: 0,
    };
    entry.count += Number(item.obsCount || 1);
    entry.individuals += Number(item.howMany) || 0;
    speciesMap.set(key, entry);
  });
  const topSpecies = [...speciesMap.values()]
    .sort((a, b) => b.count - a.count || b.individuals - a.individuals)
    .slice(0, 5);

  document.querySelector("#region-name").textContent = props.Region || code;
  document.querySelector("#region-observations").textContent = number(
    props.observaciones,
  );
  document.querySelector("#region-species").textContent = number(
    props.especies,
  );
  document.querySelector("#region-individuals").textContent = number(
    props.individuos_reportados,
  );
  document.querySelector("#timeline-label").textContent =
    `${selected.length ? selected.length : 0} registros`;

  const list = document.querySelector("#species-list");
  list.innerHTML = topSpecies.length
    ? topSpecies
        .map(
          (item) => `
    <li><div class="bird-name">${escapeHtml(item.name)}<span class="scientific">${escapeHtml(item.scientific)}</span></div><span class="species-count">${number(item.count)} obs.</span></li>
  `,
        )
        .join("")
    : `<li class="empty">No hay observaciones para esta región.</li>`;
  renderTimeline(selected);
}

function renderTimeline(selected) {
  const counts = new Map();
  selected.forEach((item) =>
    counts.set(
      item.year_month,
      (counts.get(item.year_month) || 0) + Number(item.obsCount || 1),
    ),
  );
  const months = [...counts.keys()].sort();
  const max = Math.max(...months.map((month) => counts.get(month)), 1);
  document.querySelector("#timeline").innerHTML = months.length
    ? months
        .map(
          (month) => `
    <div class="bar-wrap" title="${month}: ${counts.get(month)} observaciones"><div class="bar" style="height:${Math.max(3, (counts.get(month) / max) * 125)}px"></div><span class="bar-label">${month}</span></div>
  `,
        )
        .join("")
    : `<span class="empty">No hay serie mensual para esta región.</span>`;
}

function initMap(geojson) {
  map = L.map("map", { zoomControl: false, scrollWheelZoom: false }).setView(
    [-33.4, -70.7],
    4.2,
  );
  L.control.zoom({ position: "bottomright" }).addTo(map);
  L.control
    .attribution({ prefix: false })
    .addAttribution("Regiones: BCN Chile · datos: eBird")
    .addTo(map);
  regionLayer = L.geoJSON(geojson, {
    style: featureStyle,
    onEachFeature: (feature, layer) => {
      layer.bindTooltip(
        feature.properties.Region || feature.properties.region_code,
        { sticky: true },
      );
      layer.on({
        mouseover: (event) =>
          event.target.setStyle({
            weight: 3,
            color: "#e98468",
            fillOpacity: 1,
          }),
        mouseout: (event) => regionLayer.resetStyle(event.target),
        click: (event) => {
          regionLayer.eachLayer((item) =>
            item.setStyle(featureStyle(item.feature)),
          );
          event.target.setStyle({
            weight: 3,
            color: "#e98468",
            fillOpacity: 1,
          });
          showRegion(feature);
          map.fitBounds(event.target.getBounds(), {
            padding: [35, 35],
            maxZoom: 7,
          });
        },
      });
    },
  }).addTo(map);
  const first =
    geojson.features.find(
      (feature) => (feature.properties.observaciones || 0) > 0,
    ) || geojson.features[0];
  showRegion(first);
}

loadData()
  .then(initMap)
  .catch((error) => {
    console.error(error);
    document.querySelector("#coverage").textContent = "faltan datos exportados";
    document.querySelector("#region-name").textContent =
      "Exporta el pipeline desde Jupyter";
    document.querySelector("#species-list").innerHTML =
      `<li class="empty">Ejecuta la celda “Exportar datos para la webpage” y vuelve a cargar esta página.</li>`;
  });

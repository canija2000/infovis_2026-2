/** Presenta el selector regional y los doce mapas de la región elegida. */
import { d3 } from "../../shared/d3.js";
import { seeded } from "../../shared/random.js";
export function createRegionDetail({
  maps,
  state,
  buildStrip,
  cardWidth,
  updateMaps,
  selectRegion,
  showTip,
  hideTip,
}) {
  let picker = null;
  function drawRegionPicker() {
    if (!maps.geo) return;
    const host = document.getElementById("region-picker");
    host.innerHTML = "";
    const w = host.clientWidth;
    // Girar 90°: el norte queda a la izquierda y el país se lee de norte a sur. Se ajusta al ancho y el alto
    // sigue a la forma, con tope.
    const projection = d3.geoMercator().angle(90).fitWidth(w, maps.land);
    const path = d3.geoPath(projection);
    const h = Math.min(
      Math.ceil(path.bounds(maps.land)[1][1]) + 14,
      w < 560 ? 90 : 170,
    );
    projection.fitExtent(
      [
        [0, 0],
        [w, h - 14],
      ],
      maps.land,
    );
    const [[x0], [x1]] = path.bounds(maps.land);
    const svg = d3
      .select(host)
      .append("svg")
      .attr("viewBox", `0 0 ${w} ${h}`)
      .attr("width", w)
      .attr("height", h)
      .attr("role", "group")
      .attr("aria-label", "Elegir región");
    svg
      .selectAll("path")
      .data(maps.land.features)
      .join("path")
      .attr("class", "pick")
      .attr("d", path)
      .attr("tabindex", 0)
      .attr("role", "button")
      .attr("aria-label", (f) => maps.names.get(f.properties.id))
      .on("click", (event, f) => selectRegion(f.properties.id))
      .on("keydown", (event, f) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectRegion(f.properties.id);
        }
      })
      .on("pointermove", (event, f) =>
        showTip(event, `<b>${maps.names.get(f.properties.id)}</b>`),
      )
      .on("pointerleave", hideTip);
    svg
      .append("text")
      .attr("class", "pick-dir")
      .attr("x", x0)
      .attr("y", h - 2)
      .text("← norte");
    svg
      .append("text")
      .attr("class", "pick-dir")
      .attr("x", x1)
      .attr("y", h - 2)
      .attr("text-anchor", "end")
      .text("sur →");
    picker = svg;
    // Lista desplegable equivalente (teclado, lectores de pantalla y pantallas chicas).
    const select = d3.select("#region-select");
    select
      .selectAll("option")
      .data(maps.land.features)
      .join("option")
      .attr("value", (f) => f.properties.id)
      .text((f) => maps.names.get(f.properties.id));
    select.on("change", function () {
      selectRegion(+this.value);
    });
    updatePicker();
  }
  function updatePicker() {
    if (!picker) return;
    picker
      .selectAll("path.pick")
      .classed("selected", (f) => f.properties.id === state.region)
      .attr("aria-pressed", (f) => String(f.properties.id === state.region));
    document.getElementById("region-select").value = String(state.region);
    document.getElementById("region-name").textContent = maps.names.get(
      state.region,
    );
  }
  function cellDots(cell, ci, counts, perDot, res) {
    const dots = [];
    counts.forEach((days, cls) => {
      const rand = seeded(ci * 7919 + cls * 104729);
      const exact = days / perDot;
      const n =
        Math.floor(exact) + (seeded(ci * 31 + cls)() < exact % 1 ? 1 : 0);
      for (let k = 0; k < n; k++)
        dots.push({
          cls,
          lon: cell[0] + rand() * res,
          lat: cell[1] + rand() * res,
        });
    });
    return dots;
  }

  function showLoadError() {
    document.getElementById("region-maps").textContent =
      "No se pudieron cargar los datos de la región.";
  }
  function drawRegionMaps(data, id) {
    const host = document.getElementById("region-maps");
    const feature = maps.land.features.find((f) => f.properties.id === id);
    const cardW = cardWidth(host, 150);
    const w = cardW - 16;
    const projection = d3.geoMercator().fitWidth(w, feature);
    const path = d3.geoPath(projection);
    const [[, y0], [, y1]] = path.bounds(feature);
    // Alto según la forma de la región, con tope (Chile tiene regiones muy alargadas).
    const h = Math.min(Math.ceil(y1 - y0) + 2, 460);
    projection.fitSize([w, h], feature);
    const r = Math.max(1.1, Math.min(2, w / 150));
    const classes = [0, 1, 2];
    const cards = buildStrip(
      "region-maps",
      cardW,
      h,
      (svg, m) => {
        svg.append("path").attr("class", "land").attr("d", path(feature));
        const dots = data.months[m].flatMap(([ci, ...counts]) =>
          cellDots(data.cells[ci], ci, counts, data.perDot, data.res),
        );
        // Residentes abajo; visitantes encima (son menos y no deben quedar tapados).
        dots.sort((a, b) => a.cls - b.cls);
        svg
          .append("g")
          .selectAll("circle")
          .data(dots)
          .join("circle")
          .attr("class", (d) => `dot-r c${d.cls}`)
          .attr("cx", (d) => projection([d.lon, d.lat])[0])
          .attr("cy", (d) => projection([d.lon, d.lat])[1])
          .attr("r", r);
      },
      `Mapa de ${maps.names.get(id)}`,
    );
    // Bajo cada mapa: qué parte de lo registrado son visitantes.
    cards
      .append("p")
      .attr("class", "map-n")
      .html((m) => {
        const sums = classes.map((c) =>
          d3.sum(data.months[m], (row) => row[c + 1]),
        );
        const total = d3.sum(sums);
        if (!total) return "sin datos";
        const p = (x) => `${Math.round((100 * x) / total)} %`;
        return `<span class="t1">${p(sums[1])} verano</span> · <span class="t2">${p(sums[2])} invierno</span>`;
      });
    applyResidentToggle();
    document.getElementById("region-scale").textContent =
      `1 punto ≈ ${data.perDot.toLocaleString("es-CL")} especie-días · celdas de ~5 km`;
    updateMaps(false);
  }

  // Ocultar residentes: deja ver dónde están los nómadas (con residentes, los tapan en zonas muy observadas).
  function applyResidentToggle() {
    const hide = document.getElementById("hide-residents").checked;
    d3.select("#region-maps").classed("no-residents", hide);
  }

  return {
    showLoadError,
    drawRegionPicker,
    updatePicker,
    drawRegionMaps,
    applyResidentToggle,
  };
}

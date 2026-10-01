/* Atlas sonoro de aves de Chile — portada (Visualización)
 * Una sola idea, sin necesidad de interactuar:
 *   A · El pulso del año: especies presentes en Chile por mes, apiladas por clase (año austral jul → jun).
 *   B · Un punto, una especie: las residentes quedan quietas; las visitantes entran y salen del país.
 * El mes (botones o clic en un gráfico) manda en todas las vistas. El loop sonoro (loop.js) recorre el año
 * y mueve el mes; si el usuario elige un mes, el loop salta a él.
 * Datos: data/overview.json (python_scripts/build_overview_data.py).
 */
(() => {
  "use strict";

  const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const MON = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  // Año austral: el verano queda al centro y la ola no se corta en los bordes.
  const AUSTRAL = [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5];
  const LABEL = ["Residentes", "Visitantes de verano", "Visitantes de invierno"];
  const SHORT = ["residentes", "de verano", "de invierno"];
  // Orden de apilado: residentes abajo, invierno al medio (banda delgada), verano arriba (la ola).
  const STACK = [0, 2, 1];

  const state = { month: 0, playing: false };
  let D = null;

  // ---------------------------------------------------------------- tooltip
  const tip = document.getElementById("tooltip");
  function showTip(event, html) {
    tip.innerHTML = html;
    tip.hidden = false;
    const pad = 14;
    const r = tip.getBoundingClientRect();
    let x = event.clientX + pad;
    let y = event.clientY + pad;
    if (x + r.width > innerWidth - 8) x = event.clientX - r.width - pad;
    if (y + r.height > innerHeight - 8) y = event.clientY - r.height - pad;
    tip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  }
  const hideTip = () => (tip.hidden = true);

  // ---------------------------------------------------------------- datos
  async function load() {
    const raw = await fetch("data/overview.json?v=1").then((r) => {
      if (!r.ok) throw new Error(`overview.json: ${r.status}`);
      return r.json();
    });
    const species = raw.species.map(([sid, cls, mask, phase], i) => ({
      sid, cls, mask, phase, name: raw.names[i], grain: raw.sound[String(sid)] || null,
    }));
    D = { months: raw.months, species };
  }
  const present = (s, m) => ((s.mask >> m) & 1) === 1;

  // ---------------------------------------------------------------- A · pulso
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const pulse = {};
  function drawPulse() {
    const host = document.getElementById("pulse");
    host.innerHTML = "";
    const width = host.clientWidth;
    const narrow = width < 640;
    const margin = { top: 28, right: narrow ? 12 : 170, bottom: 30, left: 40 };
    const height = narrow ? 300 : 360;
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;

    const x = d3.scalePoint().domain(d3.range(12)).range([0, w]).padding(0.3);
    const total = d3.max(D.months, (m) => m[0] + m[1] + m[2]);
    const y = d3.scaleLinear().domain([0, Math.ceil(total / 50) * 50]).range([h, 0]);
    // Series apiladas sobre el orden austral (i = posición, m = mes calendario).
    const rows = AUSTRAL.map((m, i) => ({ i, m, v: D.months[m] }));
    const layers = d3.stack().keys(STACK).value((d, k) => d.v[k])(rows);
    const area = d3.area().x((d) => x(d.data.i)).y0((d) => y(d[0])).y1((d) => y(d[1])).curve(d3.curveMonotoneX);

    const svg = d3.select(host).append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height)
      .attr("role", "img")
      .attr("aria-label", "Gráfico de áreas apiladas: 214 especies residentes constantes todo el año; las visitantes de verano suben de 33 en junio a 106 en noviembre; las de invierno, entre 11 y 26.");
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Grilla y ejes recesivos.
    g.append("g").attr("class", "grid")
      .selectAll("line").data(y.ticks(4).filter((t) => t > 0)).join("line")
      .attr("x1", 0).attr("x2", w).attr("y1", y).attr("y2", y);
    g.append("g").attr("class", "axis")
      .call(d3.axisLeft(y).ticks(4).tickSize(0).tickPadding(8))
      .call((s) => s.select(".domain").remove());
    g.append("g").attr("class", "axis").attr("transform", `translate(0,${h})`)
      .call(d3.axisBottom(x).tickFormat((i) => MON[AUSTRAL[i]]).tickSize(0).tickPadding(10))
      .call((s) => s.select(".domain").remove());
    g.append("text").attr("class", "axis-title").attr("x", -margin.left).attr("y", -12).text("especies");

    g.append("g").selectAll("path").data(layers).join("path")
      .attr("class", (d) => `band c${d.key}`)
      .attr("d", area);

    // Rótulos directos al final de cada banda (o, en móvil, solo la leyenda de arriba).
    if (!narrow) {
      const last = rows.length - 1;
      const peak = rows.reduce((a, b) => (b.v[1] > a.v[1] ? b : a));
      const lab = g.append("g").attr("class", "direct");
      layers.forEach((layer) => {
        const k = layer.key;
        const d = layer[last];
        let cy = y((d[0] + d[1]) / 2);
        if (k === 2) cy = Math.min(cy, y(d[1]) + 2); // banda delgada: rótulo sobre su borde
        const t = lab.append("text").attr("x", w + 10).attr("y", cy).attr("dy", "0.35em");
        t.append("tspan").attr("class", "lab-n").text(k === 0 ? `${d3.max(D.months, (m) => m[0])}` : `${d3.min(D.months, (m) => m[k])}–${d3.max(D.months, (m) => m[k])}`);
        t.append("tspan").attr("dx", 6).text(SHORT[k]);
      });
      // Anotación del pico de la ola de verano.
      const top = layers.find((l) => l.key === 1)[peak.i];
      g.append("text").attr("class", "note")
        .attr("x", x(peak.i)).attr("y", y(top[1]) - 10).attr("text-anchor", "middle")
        .text(`+${peak.v[1]} de verano en ${MONTHS[peak.m]}`);
    }

    // Cursor del mes actual y capa de hover (crosshair + tooltip; clic fija el mes).
    const cursor = g.append("line").attr("class", "cursor").attr("y1", 0).attr("y2", h);
    const hover = g.append("line").attr("class", "hover").attr("y1", 0).attr("y2", h).style("opacity", 0);
    const step = x.step();
    g.append("g").selectAll("rect").data(rows).join("rect")
      .attr("class", "hit")
      .attr("x", (d) => x(d.i) - step / 2).attr("width", step)
      .attr("y", 0).attr("height", h)
      .on("pointermove", (event, d) => {
        hover.attr("x1", x(d.i)).attr("x2", x(d.i)).style("opacity", 1);
        const sum = d.v[0] + d.v[1] + d.v[2];
        showTip(event, `<b>${MONTHS[d.m]}</b> · ${sum} especies<br>` +
          [1, 2, 0].map((k) => `<span class="tt-row"><i class="sw c${k}"></i>${LABEL[k]} <b>${d.v[k]}</b></span>`).join(""));
      })
      .on("pointerleave", () => { hover.style("opacity", 0); hideTip(); })
      .on("click", (event, d) => setMonth(d.m));

    Object.assign(pulse, { x, cursor });
    updatePulse();
  }
  function updatePulse() {
    if (!pulse.x) return;
    const i = AUSTRAL.indexOf(state.month);
    pulse.cursor.attr("x1", pulse.x(i)).attr("x2", pulse.x(i));
  }

  // ---------------------------------------------------------------- B · puntos
  // Escenario fijo en coordenadas de viewBox; el SVG escala con el ancho.
  // Ancho: «en Chile» y «fuera» lado a lado. Angosto (móvil): «fuera» va debajo, para que los puntos no se achiquen.
  const COLS = 12;
  const GAP = 10; // distancia entre centros
  const flock = {};
  function flockLayout(narrow) {
    const base = 270; // línea base de las columnas dentro de Chile
    const out = narrow ? { dx: 134, base: 500, label: [20, 330] } : { dx: 430, base, label: [446, 22] };
    return {
      w: narrow ? 430 : 720,
      h: narrow ? 540 : 330,
      box: { x: 8, y: 30, w: 418, h: base - 18 },
      outLabel: out.label,
      groups: {
        in0: { x: 24, base, cls: 0 }, in1: { x: 158, base, cls: 1 }, in2: { x: 292, base, cls: 2 },
        out1: { x: out.dx + 24, base: out.base, cls: 1 }, out2: { x: out.dx + 158, base: out.base, cls: 2 },
      },
    };
  }

  function drawFlock() {
    const host = document.getElementById("flock");
    host.innerHTML = "";
    const L = flockLayout(host.clientWidth < 560);
    flock.L = L;
    const svg = d3.select(host).append("svg")
      .attr("viewBox", `0 0 ${L.w} ${L.h}`).attr("width", "100%")
      .attr("role", "img").attr("aria-labelledby", "flock-title");

    svg.append("rect").attr("class", "country").attr("x", L.box.x).attr("y", L.box.y).attr("width", L.box.w).attr("height", L.box.h).attr("rx", 10);
    svg.append("text").attr("class", "zone").attr("x", 20).attr("y", 22).text("EN CHILE");
    svg.append("text").attr("class", "zone").attr("x", L.outLabel[0]).attr("y", L.outLabel[1]).text("FUERA DE CHILE");

    // Rótulos de conteo bajo cada columna.
    flock.counts = svg.append("g").selectAll("text").data(Object.entries(L.groups)).join("text")
      .attr("class", "count")
      .attr("x", ([, gr]) => gr.x).attr("y", ([, gr]) => gr.base + 34);

    // Las visitantes se ordenan por fecha de llegada: entran y salen en ese orden.
    flock.dots = svg.append("g").selectAll("circle").data(D.species, (s) => s.sid).join("circle")
      .attr("class", (s) => `dot c${s.cls}`)
      .attr("r", 3.6)
      .on("pointermove", (event, s) => {
        const months = d3.range(12).filter((m) => present(s, m));
        const span = s.cls === 0 ? "todo el año" : months.map((m) => MON[m]).join(" ");
        showTip(event, `<b>${s.name}</b><br><i>${LABEL[s.cls]}</i><br>${span}`);
      })
      .on("pointerleave", hideTip);
    updateFlock(false);
  }

  function slot(group, k) {
    return [group.x + 4 + (k % COLS) * GAP, group.base - 4 - Math.floor(k / COLS) * GAP];
  }

  function updateFlock(animate = true) {
    if (!flock.dots) return;
    const m = state.month;
    const rank = { in0: 0, in1: 0, in2: 0, out1: 0, out2: 0 };
    const pos = new Map();
    // Residentes por sid (fijas); visitantes por fase (llegada), para que la columna crezca en orden.
    const order = [...D.species].sort((a, b) => a.cls - b.cls || (a.cls ? a.phase - b.phase : a.sid - b.sid));
    for (const s of order) {
      const key = s.cls === 0 ? "in0" : `${present(s, m) ? "in" : "out"}${s.cls}`;
      pos.set(s.sid, { key, xy: slot(flock.L.groups[key], rank[key]++) });
    }
    const dur = animate ? 900 : 0;
    flock.dots
      .classed("away", (s) => pos.get(s.sid).key.startsWith("out"))
      .transition().duration(dur).ease(d3.easeCubicInOut)
      .delay((s) => (animate && s.cls ? (s.phase / 12) * 500 : 0))
      .attr("cx", (s) => pos.get(s.sid).xy[0])
      .attr("cy", (s) => pos.get(s.sid).xy[1]);
    flock.counts.text(([key, gr]) => `${rank[key]} ${SHORT[gr.cls]}`);
    document.getElementById("flock-month").textContent = MONTHS[m];
  }

  // ---------------------------------------------------------------- C · mapas por mes
  // Dos franjas de 12 mapas (jul → jun), cuatro a la vista y el resto con scroll horizontal:
  //   C1 · Chile: un interruptor alterna entre
  //        «zonas»   un punto por celda de 0,2° (~22 km) con datos suficientes (grid_month.json);
  //                  color = ola: (prop. de visitantes de verano − la de su región en el año) − (ídem invierno);
  //                  tamaño = especie-días registrados (dónde se observa más, sin esconder el sesgo de esfuerzo).
  //        «regiones» una región = un color: nivel de la ola de verano − la de invierno, cada uno relativo
  //                  al rango anual de la región (region_month.json).
  //   C2 · Una región de cerca: Chile en horizontal como selector; mapas de puntos por clase
  //        (1 punto ≈ k especie-días, repartidos al azar dentro de su celda de 0,05°; grid_region/<código>.json).
  const CONTINENT_WEST = -76; // longitud: deja fuera Juan Fernández, Desventuradas y Rapa Nui
  const CHILE_FRAME = { type: "MultiPoint", coordinates: [[-75.8, -17.4], [-66.3, -56]] };
  const strips = []; // { id, cards } de cada franja, para marcar el mes y seguirlo
  const maps = { mode: "zones", region: 7 }; // por defecto: Metropolitana
  const getJSON = (f) => fetch(`data/${f}`).then((r) => {
    if (!r.ok) throw new Error(`${f}: ${r.status}`);
    return r.json();
  });

  // Quita del contorno las islas oceánicas (polígonos al oeste de CONTINENT_WEST).
  function continental(feature) {
    const g = feature.geometry;
    const keep = (poly) => d3.max(poly[0], (p) => p[0]) > CONTINENT_WEST;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    return { ...feature, geometry: { type: "MultiPolygon", coordinates: polys.filter(keep) } };
  }

  async function loadMaps() {
    const [meta, grid, regionMonth, geo] = await Promise.all([
      getJSON("meta.json"), getJSON("grid_month.json?v=1"), getJSON("region_month.json"), getJSON("regions.min.geojson"),
    ]);
    const names = new Map(meta.regions.map((r) => [r.id, r.name]));
    const codes = new Map(meta.regions.map((r) => [r.id, r.code]));
    const months = grid.months.map((rows) => rows
      .filter(([cell]) => grid.cells[cell][0] > CONTINENT_WEST)
      .map(([cell, total, res, est, inv, wave]) => ({ cell: grid.cells[cell], total, res, est, inv, wave: wave / 1000 }))
      .sort((a, b) => b.total - a.total)); // los grandes abajo, los chicos encima
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
        index: summer.map((v, m) => v - winter[m]), rows, low: d3.mean(rows, (x) => x[5]) < 400,
      });
    }
    const land = { type: "FeatureCollection", features: geo.features.map(continental) };
    Object.assign(maps, { geo, land, grid, months, regionWave, names, codes, regionCache: new Map() });
  }

  // Tarjetas de una franja: una por mes en orden austral; `draw(svg, m, w, h)` dibuja cada mapa.
  function buildStrip(id, cardW, h, draw, label) {
    const host = document.getElementById(id);
    host.innerHTML = "";
    const w = cardW - 16;
    const cards = d3.select(host).selectAll("div.map-card").data(AUSTRAL).join("div")
      .attr("class", "map-card")
      .style("width", `${cardW}px`)
      .on("click", (event, m) => setMonth(m));
    cards.append("h3").text((m) => MONTHS[m]);
    cards.append("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("width", w).attr("height", h)
      .attr("role", "img").attr("aria-label", (m) => `${label} · ${MONTHS[m]}`)
      .each(function (m) { draw(d3.select(this), m, w, h); });
    const strip = strips.find((s) => s.id === id) || strips[strips.push({ id }) - 1];
    strip.cards = cards;
    return cards;
  }
  const cardWidth = (host, min = 130) => Math.max(min, Math.floor(host.clientWidth / (host.clientWidth < 560 ? 2 : 4)));

  // ------------------------------ C1 · Chile (zonas | regiones)
  function drawMaps() {
    if (!maps.geo) return;
    const host = document.getElementById("maps");
    const cardW = cardWidth(host);
    const w = cardW - 16;
    const h = Math.min(Math.round(w * 3.4), 640);
    const projection = d3.geoMercator().fitSize([w, h], CHILE_FRAME);
    const path = d3.geoPath(projection);
    const zones = maps.mode === "zones";
    let color;
    let radius = null;
    if (zones) {
      const sat = maps.grid.saturation;
      color = d3.scaleDiverging(d3.interpolateRgbBasis([css("--c2"), css("--ink-3"), css("--c1")])).domain([-sat, 0, sat]).clamp(true);
      const k = Math.min(1.25, h / 520);
      const maxTotal = d3.max(maps.months, (rows) => d3.max(rows, (d) => d.total));
      radius = d3.scaleSqrt().domain([maps.grid.minDays, maxTotal]).range([1.3 * k, 4.2 * k]).clamp(true);
    } else {
      color = d3.scaleDiverging(d3.interpolateRgbBasis([css("--c2"), css("--empty"), css("--c1")])).domain([-1, 0, 1]);
    }
    const cards = buildStrip("maps", cardW, h, (svg, m) => {
      if (zones) {
        svg.append("path").attr("class", "land").attr("d", path(maps.land));
        svg.append("g").selectAll("circle").data(maps.months[m]).join("circle")
          .attr("class", "cell")
          .attr("cx", (d) => projection([d.cell[0], d.cell[1]])[0])
          .attr("cy", (d) => projection([d.cell[0], d.cell[1]])[1])
          .attr("r", (d) => radius(d.total))
          .attr("fill", (d) => color(d.wave))
          .on("pointermove", (event, d) => zoneTip(event, d, m))
          .on("pointerleave", hideTip);
      } else {
        svg.selectAll("path").data(maps.land.features).join("path")
          .attr("class", (f) => `region${maps.regionWave.get(f.properties.id)?.low ? " low" : ""}`)
          .attr("d", path)
          .attr("fill", (f) => {
            const r = maps.regionWave.get(f.properties.id);
            return r ? color(r.index[m]) : "none";
          })
          .on("pointermove", (event, f) => regionTip(event, f.properties.id, m))
          .on("pointerleave", hideTip);
      }
    }, "Mapa de Chile");
    cards.append("p").attr("class", "map-n").text((m) => (zones ? `${maps.months[m].length} zonas` : ""));
    drawMapsLegend(color, zones ? maps.grid.saturation : 1, radius);
    document.getElementById("maps-note").textContent = zones
      ? "Zonas con ≥ 50 especie-días en el mes y registros en ≥ 3 de los 8 años (GBIF 2017–2024). Sin punto: no hay datos suficientes ese mes, no que no haya aves."
      : "Contorno punteado: región con pocos registros (< 400 días-especie al mes), valores inestables.";
    document.getElementById("maps-lede").textContent = zones
      ? "Un punto por zona de unos 22 km donde se observan aves. Naranja: ese mes llegan más visitantes de verano de lo habitual en su región; azul, más de invierno. El tamaño indica cuánto se observa allí."
      : "Una región, un color. Cada región comparada con su propio año: naranja, el mes en que más pesan sus visitantes de verano; azul, los de invierno.";
    updateMaps(false);
  }

  function zoneTip(event, d, m) {
    const v = d.wave;
    const verdict = v > 0.03 ? "más visitantes de verano que lo habitual en la región"
      : v < -0.03 ? "más visitantes de invierno que lo habitual en la región" : "cerca de lo habitual en la región";
    const share = (x) => `${Math.round((100 * x) / d.total)} %`;
    showTip(event, `<b>${maps.names.get(d.cell[2])}</b> · ${MONTHS[m]}<br>` +
      `Zona de ~22 km · ${d.total.toLocaleString("es-CL")} especie-días<br>` +
      `<span class="tt-row"><i class="sw c0"></i>Residentes <b>${share(d.res)}</b></span>` +
      `<span class="tt-row"><i class="sw c1"></i>Visitantes de verano <b>${share(d.est)}</b></span>` +
      `<span class="tt-row"><i class="sw c2"></i>Visitantes de invierno <b>${share(d.inv)}</b></span>` +
      `<i>${verdict}</i>`);
  }
  function regionTip(event, id, m) {
    const r = maps.regionWave.get(id);
    if (!r) return;
    const [, , est, inv] = r.rows[m];
    const v = r.index[m];
    const verdict = v > 0.25 ? "domina la ola de verano" : v < -0.25 ? "domina la ola de invierno" : "entre olas";
    showTip(event, `<b>${maps.names.get(id)}</b> · ${MONTHS[m]}<br>` +
      `<span class="tt-row"><i class="sw c1"></i>Visitantes de verano <b>${est}</b> especies</span>` +
      `<span class="tt-row"><i class="sw c2"></i>Visitantes de invierno <b>${inv}</b> especies</span>` +
      `<i>${verdict}</i>${r.low ? "<br><i>pocos registros: valor inestable</i>" : ""}`);
  }

  function drawMapsLegend(color, sat, radius) {
    const host = d3.select("#maps-legend");
    host.selectAll("*").remove();
    const w = 220;
    const svg = host.append("svg").attr("viewBox", `0 0 ${w} 34`).attr("width", w).attr("height", 34);
    const grad = svg.append("defs").append("linearGradient").attr("id", "maps-grad");
    d3.range(0, 1.01, 0.1).forEach((t) => grad.append("stop").attr("offset", `${t * 100}%`).attr("stop-color", color((t * 2 - 1) * sat)));
    svg.append("rect").attr("x", 0).attr("y", 2).attr("width", w).attr("height", 10).attr("rx", 2).attr("fill", "url(#maps-grad)");
    [["invierno", 0, "start"], [radius ? "como siempre" : "entre olas", w / 2, "middle"], ["verano", w, "end"]].forEach(([t, x, anchor]) =>
      svg.append("text").attr("x", x).attr("y", 28).attr("text-anchor", anchor).text(t));
    if (!radius) return;
    // Tamaño: especie-días registrados.
    const g = host.append("svg").attr("viewBox", "0 0 210 34").attr("width", 210).attr("height", 34).append("g");
    let x = 0;
    [100, 1000, 10000].forEach((v) => {
      const r = radius(v);
      g.append("circle").attr("class", "size-key").attr("cx", x + r).attr("cy", 7).attr("r", r);
      g.append("text").attr("x", x + 2 * r + 4).attr("y", 11).text(v.toLocaleString("es-CL"));
      x += 2 * r + 4 + v.toLocaleString("es-CL").length * 7.5 + 12;
    });
    g.append("text").attr("x", 0).attr("y", 28).text("especie-días registrados");
  }

  function initMapsMode() {
    const buttons = d3.selectAll("#maps-mode button");
    const sync = () => buttons.attr("aria-pressed", function () { return String(this.dataset.mode === maps.mode); });
    buttons.on("click", function () {
      maps.mode = this.dataset.mode;
      sync();
      drawMaps();
    });
    sync();
  }

  // ------------------------------ C2 · una región de cerca
  // Selector: Chile acostado (norte a la izquierda), una región por clic.
  function drawRegionPicker() {
    if (!maps.geo) return;
    const host = document.getElementById("region-picker");
    host.innerHTML = "";
    const w = host.clientWidth;
    // Girar 90°: el norte queda a la izquierda y el país se lee de norte a sur. Se ajusta al ancho y el alto
    // sigue a la forma, con tope.
    const projection = d3.geoMercator().angle(90).fitWidth(w, maps.land);
    const path = d3.geoPath(projection);
    const h = Math.min(Math.ceil(path.bounds(maps.land)[1][1]) + 14, w < 560 ? 90 : 170);
    projection.fitExtent([[0, 0], [w, h - 14]], maps.land);
    const [[x0], [x1]] = path.bounds(maps.land);
    const svg = d3.select(host).append("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("width", w).attr("height", h)
      .attr("role", "group").attr("aria-label", "Elegir región");
    svg.selectAll("path").data(maps.land.features).join("path")
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
      .on("pointermove", (event, f) => showTip(event, `<b>${maps.names.get(f.properties.id)}</b>`))
      .on("pointerleave", hideTip);
    svg.append("text").attr("class", "pick-dir").attr("x", x0).attr("y", h - 2).text("← norte");
    svg.append("text").attr("class", "pick-dir").attr("x", x1).attr("y", h - 2).attr("text-anchor", "end").text("sur →");
    maps.picker = svg;
    // Lista desplegable equivalente (teclado, lectores de pantalla y pantallas chicas).
    const select = d3.select("#region-select");
    select.selectAll("option").data(maps.land.features).join("option")
      .attr("value", (f) => f.properties.id)
      .text((f) => maps.names.get(f.properties.id));
    select.on("change", function () { selectRegion(+this.value); });
    updatePicker();
  }
  function updatePicker() {
    if (!maps.picker) return;
    maps.picker.selectAll("path.pick").classed("selected", (f) => f.properties.id === maps.region)
      .attr("aria-pressed", (f) => String(f.properties.id === maps.region));
    document.getElementById("region-select").value = String(maps.region);
    document.getElementById("region-name").textContent = maps.names.get(maps.region);
  }
  async function selectRegion(id) {
    maps.region = id;
    updatePicker();
    onRegionChange(id);
    await drawRegionMaps();
  }

  async function loadRegion(id) {
    if (!maps.regionCache.has(id)) {
      maps.regionCache.set(id, getJSON(`grid_region/${maps.codes.get(id)}.json?v=1`).catch((err) => {
        maps.regionCache.delete(id);
        throw err;
      }));
    }
    return maps.regionCache.get(id);
  }

  // Puntos de una celda: n por clase, en posiciones al azar dentro de la celda pero fijas para esa celda y
  // clase (el k-ésimo punto cae siempre en el mismo lugar), así de un mes a otro solo aparecen o desaparecen.
  function cellDots(cell, ci, counts, perDot, res) {
    const dots = [];
    counts.forEach((days, cls) => {
      const rand = seeded(ci * 7919 + cls * 104729);
      const exact = days / perDot;
      const n = Math.floor(exact) + (seeded(ci * 31 + cls)() < exact % 1 ? 1 : 0);
      for (let k = 0; k < n; k++) dots.push({ cls, lon: cell[0] + rand() * res, lat: cell[1] + rand() * res });
    });
    return dots;
  }

  async function drawRegionMaps() {
    const id = maps.region;
    const host = document.getElementById("region-maps");
    let data;
    try {
      data = await loadRegion(id);
    } catch (err) {
      console.error(err);
      host.textContent = "No se pudieron cargar los datos de la región.";
      return;
    }
    if (id !== maps.region) return; // llegó tarde: ya se eligió otra
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
    const cards = buildStrip("region-maps", cardW, h, (svg, m) => {
      svg.append("path").attr("class", "land").attr("d", path(feature));
      const dots = data.months[m].flatMap(([ci, ...counts]) => cellDots(data.cells[ci], ci, counts, data.perDot, data.res));
      // Residentes abajo; visitantes encima (son menos y no deben quedar tapados).
      dots.sort((a, b) => a.cls - b.cls);
      svg.append("g").selectAll("circle").data(dots).join("circle")
        .attr("class", (d) => `dot-r c${d.cls}`)
        .attr("cx", (d) => projection([d.lon, d.lat])[0])
        .attr("cy", (d) => projection([d.lon, d.lat])[1])
        .attr("r", r);
    }, `Mapa de ${maps.names.get(id)}`);
    // Bajo cada mapa: qué parte de lo registrado son visitantes.
    cards.append("p").attr("class", "map-n").html((m) => {
      const sums = classes.map((c) => d3.sum(data.months[m], (row) => row[c + 1]));
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

  // ------------------------------ comunes a las dos franjas
  function updateMaps(follow) {
    for (const { id, cards } of strips) {
      if (!cards) continue;
      cards.classed("current", (m) => m === state.month);
      if (!follow) continue;
      // Si el mes actual no está a la vista, se desplaza la franja (no la página).
      const strip = document.getElementById(id);
      const card = cards.filter((m) => m === state.month).node();
      if (!card) continue;
      const w = card.offsetWidth;
      const i = AUSTRAL.indexOf(state.month);
      if (i * w < strip.scrollLeft || (i + 1) * w > strip.scrollLeft + strip.clientWidth) {
        const perPage = Math.max(1, Math.round(strip.clientWidth / w));
        strip.scrollTo({ left: Math.floor(i / perPage) * perPage * w, behavior: "smooth" });
      }
    }
  }

  function initStripNav(id) {
    const strip = document.getElementById(id);
    const page = (dir) => {
      const card = strip.querySelector(".map-card");
      const w = card ? card.offsetWidth : strip.clientWidth / 4;
      strip.scrollBy({ left: dir * Math.round(strip.clientWidth / w) * w, behavior: "smooth" });
    };
    document.querySelectorAll(`[data-strip="${id}"]`).forEach((b) =>
      b.addEventListener("click", () => page(b.dataset.dir === "prev" ? -1 : 1)));
  }
  function initMapsNav() {
    initStripNav("maps");
    initStripNav("region-maps");
    initMapsMode();
    document.getElementById("hide-residents").addEventListener("change", applyResidentToggle);
  }
  function drawAllMaps() {
    drawMaps();
    drawRegionPicker();
    drawRegionMaps();
  }

  // ---------------------------------------------------------------- tabla (vista accesible)
  function drawTable() {
    const rows = AUSTRAL.map((m) => `<tr><th scope="row">${MONTHS[m]}</th>${D.months[m].map((v) => `<td>${v}</td>`).join("")}</tr>`).join("");
    document.getElementById("table").innerHTML =
      `<table><thead><tr><th scope="col">Mes</th>${LABEL.map((l) => `<th scope="col">${l}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  // ---------------------------------------------------------------- mes
  function drawMonths() {
    const host = d3.select("#months");
    host.selectAll("button").data(AUSTRAL).join("button")
      .attr("type", "button").attr("class", "month")
      .attr("aria-label", (m) => MONTHS[m])
      .text((m) => MON[m])
      .on("click", (event, m) => setMonth(m));
    updateMonths();
  }
  function updateMonths() {
    d3.select("#months").selectAll("button").attr("aria-pressed", (m) => String(m === state.month));
  }
  // fromLoop: el cambio viene del loop sonoro; si no, lo eligió el usuario y el loop salta a ese mes.
  function setMonth(m, fromLoop = false) {
    state.month = m;
    if (!fromLoop) {
      SoundLoop.jump(m);
      updateNowPlaying(m);
    }
    updatePulse();
    updateFlock(true);
    updateMonths();
    updateMaps(true);
  }

  // ---------------------------------------------------------------- sonido: loop del año
  // El año suena en bucle (loop.js): cada mes son 4 compases de 3 s. En cada compás suenan fragmentos de cantos
  // reales de las especies presentes ese mes en el ámbito elegido (Chile o la región de «Una región de cerca»);
  // cuanto más extendida está una especie ese mes, más copias de su canto (1 a 4). Datos: data/loop.json.
  // Arranca solo al cargar la página; el navegador lo deja sonar desde el primer clic o tecla.
  const PLAY_D = "M4.5 2.5v11l9-5.5z";
  const PAUSE_D = "M4 2.5h3v11H4zM9 2.5h3v11H9z";
  const sound = { data: null, scope: 0, paused: false, muted: false };
  try {
    sound.muted = localStorage.getItem("loop-muted") === "1";
  } catch (err) { /* sin almacenamiento: queda con sonido */ }

  function seeded(seed) {
    let t = seed + 0x6d2b79f5;
    return () => {
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const voicesFor = (m) => (sound.data.scopes[String(sound.scope)] || sound.data.scopes["0"])[m];
  const clipsFor = (m) => voicesFor(m).map(([sid]) => sound.data.species[sid].clip);

  function planBar(m, b) {
    const voices = voicesFor(m);
    const total = d3.sum(voices, (v) => v[1]) || 1;
    const hits = [];
    voices.forEach(([sid, copies], vi) => {
      for (let k = 0; k < copies; k++) {
        const seed = (((m * 8 + b) * 32 + vi) * 8 + k) * 31 + sid;
        hits.push({ url: sound.data.species[sid].clip, gain: 0.6 / Math.sqrt(total), pan: (seeded(seed)() * 2 - 1) * 0.7, seed: seed * 7 + 3 });
      }
    });
    if (b === 0) SoundLoop.load(clipsFor((m + 1) % 12)); // precarga el mes siguiente
    return { tick: b === 0, hits };
  }
  function onBar(m, b) {
    if (m !== state.month) setMonth(m, true);
    d3.selectAll("#bars i").classed("on", (d, i) => i === b);
    updateNowPlaying(m);
  }
  function updateNowPlaying(m = state.month) {
    if (!sound.data) return;
    const names = voicesFor(m).map(([sid, copies]) => {
      const sp = sound.data.species[sid];
      return `<span class="v c${sp.cls}">${sp.name}${copies > 1 ? ` <b>×${copies}</b>` : ""}</span>`;
    });
    document.getElementById("now-playing").innerHTML = names.join(" ");
  }

  async function initSound() {
    try {
      sound.data = await fetch("data/loop.json?v=1").then((r) => {
        if (!r.ok) throw new Error(`loop.json: ${r.status}`);
        return r.json();
      });
    } catch (err) {
      console.error(err);
      return;
    }
    SoundLoop.configure(sound.data);
    SoundLoop.setMuted(sound.muted);
    syncSoundButtons();
    updateNowPlaying();
    await SoundLoop.load(clipsFor(state.month));
    SoundLoop.start(state.month, planBar, onBar);
    // Sin gesto del usuario el navegador mantiene el audio suspendido: el loop arranca con el primer clic o tecla.
    if (!SoundLoop.unlocked) {
      const hint = document.getElementById("sound-hint");
      hint.hidden = false;
      const unlock = async () => {
        if (await SoundLoop.unlock()) {
          hint.hidden = true;
          removeEventListener("pointerdown", unlock, true);
          removeEventListener("keydown", unlock, true);
        }
      };
      addEventListener("pointerdown", unlock, true);
      addEventListener("keydown", unlock, true);
    }
  }

  function togglePause() {
    if (!sound.data) return;
    sound.paused = !sound.paused;
    if (sound.paused) SoundLoop.stop();
    else SoundLoop.start(state.month, planBar, onBar);
    syncSoundButtons();
  }
  function toggleMute() {
    sound.muted = !sound.muted;
    SoundLoop.setMuted(sound.muted);
    try {
      localStorage.setItem("loop-muted", sound.muted ? "1" : "0");
    } catch (err) { /* sin almacenamiento */ }
    syncSoundButtons();
  }
  function syncSoundButtons() {
    const play = document.getElementById("play");
    play.setAttribute("aria-pressed", String(!sound.paused));
    play.setAttribute("aria-label", sound.paused ? "Reanudar el año" : "Pausar el año");
    play.title = `${sound.paused ? "Reanudar" : "Pausar"} (barra espaciadora)`;
    document.getElementById("play-icon").setAttribute("d", sound.paused ? PLAY_D : PAUSE_D);
    const mute = document.getElementById("mute");
    mute.setAttribute("aria-pressed", String(sound.muted));
    mute.setAttribute("aria-label", sound.muted ? "Activar sonido" : "Silenciar");
    mute.title = sound.muted ? "Activar sonido" : "Silenciar";
    d3.selectAll("#sound-scope button").attr("aria-pressed", function () {
      return String((this.dataset.scope === "region") === (sound.scope !== 0));
    });
  }
  function setSoundScope(scope) {
    sound.scope = scope;
    if (sound.data) SoundLoop.load(clipsFor(state.month));
    syncSoundButtons();
    updateNowPlaying();
  }
  function initSoundControls() {
    document.getElementById("play").addEventListener("click", togglePause);
    document.getElementById("mute").addEventListener("click", toggleMute);
    d3.selectAll("#sound-scope button").on("click", function () {
      setSoundScope(this.dataset.scope === "region" ? maps.region : 0);
    });
    document.addEventListener("keydown", (event) => {
      if (event.code !== "Space" || event.target.closest("button, input, select, a, summary, [role=button]")) return;
      event.preventDefault();
      togglePause();
    });
  }
  // La región elegida en «Una región de cerca» también es la del sonido cuando el ámbito es «región».
  function onRegionChange(id) {
    document.getElementById("sound-region-name").textContent = maps.names.get(id);
    if (sound.scope !== 0) setSoundScope(id);
  }

  // ---------------------------------------------------------------- inicio
  load().then(() => {
    drawPulse();
    drawFlock();
    drawMonths();
    drawTable();
    initMapsNav();
    loadMaps().then(drawAllMaps).catch((err) => {
      console.error(err);
      document.getElementById("maps").textContent = "No se pudieron cargar los mapas.";
    });
    initSoundControls();
    initSound();
    let lastWidth = innerWidth;
    addEventListener("resize", () => {
      if (innerWidth === lastWidth) return;
      lastWidth = innerWidth;
      drawPulse();
      drawFlock();
      drawAllMaps();
    });
  }).catch((err) => {
    console.error(err);
    document.getElementById("pulse").textContent = "No se pudieron cargar los datos.";
  });
})();

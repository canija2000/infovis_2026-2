/* Atlas sonoro de aves de Chile — V1
 * Overview: mapa + grilla región × mes + calendario especie × mes (año típico).
 * Zoom & filter: región, ventana por clase (residentes / verano / invierno), buscador, scrubber de mes con play.
 * Details on demand: ficha de especie con perfil radial, mapa y canto.
 * Datos precalculados por build_web_data.py (ver docs/metodologia-datos.md §10).
 */
(() => {
  "use strict";

  const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const MON = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  // Año austral (jul → jun): el verano queda al centro. Año calendario (ene → dic): el invierno queda al centro.
  const AUSTRAL = [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5];
  const CALENDAR = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const SEASON_OF = ["verano", "verano", "otoño", "otoño", "otoño", "invierno", "invierno", "invierno", "primavera", "primavera", "primavera", "verano"];
  const CLASS_KEYS = ["residente", "visitante_estival", "visitante_invernal", "ocasional"];
  const CLASS_LABEL = ["Residentes", "Visitantes de verano", "Visitantes de invierno", "Ocasionales"];
  const TAB_LABEL = ["Residentes", "De verano", "De invierno"];
  const CLASS_ONE = ["residente", "visitante de verano", "visitante de invierno", "ocasional"];
  // Ventana que se abre por defecto: la ola de verano es la que comunica "la que viaja" sin interacción.
  const DEFAULT_TAB = 1;
  // Cada ventana centra su estación; residentes usan el año austral como la grilla general.
  const TAB_ORDER = [AUSTRAL, AUSTRAL, CALENDAR];
  const TAB_LIMIT = [12, 24, 16];
  // Esfuerzo medio (días-especie por mes) bajo el cual una región tiene valores inestables.
  const EFFORT_LOW = 400;
  // Macrozonas para la sonificación (norte → sur); cada una es un tiempo del compás.
  const ZONES = [
    { name: "Norte Grande", ids: [1, 2, 3] },
    { name: "Norte Chico", ids: [4, 5] },
    { name: "Centro", ids: [6, 7, 8, 9] },
    { name: "Sur", ids: [10, 11, 12, 13, 14] },
    { name: "Austral", ids: [15, 16] },
  ];
  const PENTATONIC = [0, 3, 5, 7, 10];

  const fmt = new Intl.NumberFormat("es-CL");
  const pct = (v, d = 0) => `${(v * 100).toFixed(d).replace(".", ",")} %`;

  const state = {
    scope: 0,
    month: 0, // índice calendario (0 = enero)
    tab: DEFAULT_TAB,
    expanded: false,
    species: null,
    muted: false,
  };

  let D = null; // datos cargados
  let sounds = null;

  // ---------------------------------------------------------------- colores
  const dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  // Una rampa secuencial por clase (mismo tono que su muestra de color).
  const RAMPS = dark
    ? [
        ["#1f242c", "#1d4a86", "#2f73c9", "#72a6e8", "#d0e2f8"],
        ["#29211d", "#7a3414", "#c4541f", "#ee8b55", "#fbd9c4"],
        ["#1c2622", "#0f5a3e", "#179e6c", "#5fd1a0", "#c8f1dd"],
      ]
    : [
        ["#eef3f9", "#b5cef0", "#5e95dc", "#2560b0", "#0f366b"],
        ["#fbf2ec", "#f6c6a8", "#ec8950", "#c2531e", "#76290a"],
        ["#edf7f1", "#b1e1c8", "#4dbd8c", "#138356", "#0a4a31"],
      ];
  const classScale = RAMPS.map((r) => d3.scaleSequential(d3.interpolateRgbBasis(r)).domain([0, 100]));
  // Grilla general: desviación de la proporción de visitantes respecto del promedio anual de la región.
  const DIVERGING = dark
    ? ["#2f73c9", "#23405f", "#2a2a28", "#56427f", "#9a85ea"]
    : ["#2560b0", "#a9c3e6", "#f1f0ec", "#c3b6ec", "#5b44b8"];
  const deviation = d3.scaleDiverging(d3.interpolateRgbBasis(DIVERGING));

  // ---------------------------------------------------------------- tooltip
  const tip = document.getElementById("tooltip");
  function showTip(event, html) {
    tip.innerHTML = html;
    tip.hidden = false;
    const pad = 14;
    const { innerWidth: w, innerHeight: h } = window;
    const r = tip.getBoundingClientRect();
    let x = event.clientX + pad;
    let y = event.clientY + pad;
    if (x + r.width > w - 8) x = event.clientX - r.width - pad;
    if (y + r.height > h - 8) y = event.clientY - r.height - pad;
    tip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  }
  const hideTip = () => (tip.hidden = true);

  // ---------------------------------------------------------------- carga
  async function load() {
    const get = (f) => fetch(`data/${f}`).then((r) => {
      if (!r.ok) throw new Error(`${f}: ${r.status}`);
      return r.json();
    });
    const [meta, species, typical, regionMonth, geo] = await Promise.all([
      get("meta.json"), get("species.json"), get("typical_year.json"), get("region_month.json"), get("regions.min.geojson"),
    ]);
    const byScope = new Map();
    const bySpecies = new Map();
    for (const r of typical.rows) {
      const row = {
        sid: r[0], rid: r[1], cls: r[2], peak: r[3], phase: r[4], amp: r[5], present: r[6],
        freq: r.slice(7, 19), prof: r.slice(19, 31), years: r.slice(31, 43),
      };
      row.mean = d3.mean(row.freq);
      if (!byScope.has(row.rid)) byScope.set(row.rid, []);
      byScope.get(row.rid).push(row);
      if (!bySpecies.has(row.sid)) bySpecies.set(row.sid, new Map());
      bySpecies.get(row.sid).set(row.rid, row);
    }
    const regionById = new Map(meta.regions.map((r) => [r.id, r]));
    const effortMean = new Map(Object.entries(regionMonth.scopes).map(([k, months]) => [+k, d3.mean(months, (x) => x[5])]));
    // Dominio simétrico de la desviación (proporción de visitantes − promedio anual de la región).
    // Percentil 95 de |desviación| para que un extremo no apague el resto (la escala satura arriba de eso).
    const devs = [];
    for (const months of Object.values(regionMonth.scopes)) {
      const mean = d3.mean(months, (x) => x[4]);
      months.forEach((x) => devs.push(Math.abs(x[4] - mean)));
    }
    const dev = Math.ceil(d3.quantile(devs.sort(d3.ascending), 0.95) * 100) / 100;
    deviation.domain([-dev, 0, dev]).clamp(true);
    D = { meta, species, byScope, bySpecies, regionMonth: regionMonth.scopes, geo, regionById, effortMean };
  }

  // ---------------------------------------------------------------- helpers
  const scopeName = (id) => D.regionById.get(id).name;
  const rm = (scope, m) => D.regionMonth[String(scope)][m];
  const colX = (order, m) => LABEL + order.indexOf(m) * CW;
  const tabOrder = () => TAB_ORDER[state.tab];
  const lowEffort = (id) => id !== 0 && D.effortMean.get(id) < EFFORT_LOW;
  const shareMean = (id) => d3.mean(D.regionMonth[String(id)], (x) => x[4]);

  // Tramos de estación consecutivos para el encabezado de una grilla.
  function seasonRuns(order) {
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


  function freqText(row, m) {
    const f = row.freq[m] / 1000;
    if (row.rid === 0) return `registrada en ${pct(f)} de los días (media de las 16 regiones)`;
    const days = new Date(2021, m + 1, 0).getDate();
    return `registrada en ${pct(f)} de los días (≈ ${(f * days).toFixed(1).replace(".", ",")} de ${days})`;
  }

  // ---------------------------------------------------------------- resumen
  function renderSummary() {
    const c = [0, 0, 0, 0];
    D.species.forEach((s) => c[CLASS_KEYS.indexOf(s.class)]++);
    const regular = c[0] + c[1] + c[2];
    document.getElementById("summary").innerHTML =
      `De las <b>${regular}</b> especies que se registran con regularidad en Chile, ` +
      `<b class="c0">${c[0]} (${pct(c[0] / regular)}) son residentes</b> y ` +
      `<b class="c1">${c[1] + c[2]} (${pct((c[1] + c[2]) / regular)}) son visitantes</b>: ` +
      `${c[1]} llegan en verano y ${c[2]} en invierno. Otras ${c[3]} aparecen solo ocasionalmente.`;
  }

  // ---------------------------------------------------------------- mapa
  function drawChile(container, { width, height, fill, onClick, onHover, selected }) {
    const svg = d3.select(container).selectAll("svg").data([0]).join("svg")
      .attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img");
    const projection = d3.geoMercator().fitExtent([[4, 4], [width - 4, height - 4]], D.geo);
    const path = d3.geoPath(projection);
    const paths = svg.selectAll("path.region").data(D.geo.features, (d) => d.id)
      .join("path").attr("class", "region").attr("d", path);
    paths.style("fill", (d) => fill(d.id))
      .classed("selected", (d) => d.id === selected)
      .classed("dim", (d) => selected && d.id !== selected);
    if (onClick) paths.style("cursor", "pointer").on("click", (e, d) => onClick(d.id));
    if (onHover) paths.on("pointermove", (e, d) => showTip(e, onHover(d.id))).on("pointerleave", hideTip);
    paths.filter(".selected").raise();
    return svg;
  }

  // El mapa sigue a la ventana activa: cuántas especies de esa clase están presentes en el mes.
  function mapScale() {
    const col = state.tab + 1;
    const max = d3.max(D.meta.regions.filter((r) => r.id), (r) => d3.max(D.regionMonth[String(r.id)], (x) => x[col]));
    return d3.scaleSequential(d3.interpolateRgbBasis(RAMPS[state.tab])).domain([0, max]);
  }

  function renderMap() {
    const m = state.month;
    const col = state.tab + 1;
    const scale = mapScale();
    document.getElementById("map-month").textContent = MONTHS[m];
    drawChile(document.getElementById("map"), {
      width: 170, height: 760, selected: state.scope || null,
      fill: (id) => scale(rm(id, m)[col]),
      onClick: (id) => selectScope(state.scope === id ? 0 : id),
      onHover: (id) => regionTip(id, m),
    }).attr("aria-label", `Mapa de Chile: ${CLASS_LABEL[state.tab].toLowerCase()} presentes por región en ${MONTHS[m]}`);
    renderLegend(document.getElementById("map-legend"), scale, {
      label: `${TAB_LABEL[state.tab]} · n.º de especies`, ticks: scale.ticks(4), format: (d) => fmt.format(d),
    });
  }

  function regionTip(id, m) {
    const [rich, res, est, inv, share, effort] = rm(id, m);
    const dev = share - shareMean(id);
    return `<b>${scopeName(id)}</b> · ${MONTHS[m]}<br>` +
      `${rich} especies presentes<br>` +
      `<span class="sw c1"></span>${est} de verano · <span class="sw c2"></span>${inv} de invierno · <span class="sw c0"></span>${res} residentes<br>` +
      `Visitantes: <b>${pct(share)}</b> de la presencia (${dev >= 0 ? "+" : "−"}${pct(Math.abs(dev))} vs. su promedio anual)<br>` +
      `<span class="muted">Esfuerzo medio: ${fmt.format(effort)} días-especie${lowEffort(id) ? " · pocos registros, valores inestables" : ""}</span>`;
  }

  function renderLegend(el, scale, { label, ticks, format, width = 220 }) {
    const w = width, h = 34, x0 = 6, x1 = w - 10;
    const dom = scale.domain();
    const [a, b] = [dom[0], dom[dom.length - 1]];
    const x = d3.scaleLinear().domain([a, b]).range([x0, x1]);
    const svg = d3.select(el).selectAll("svg").data([0]).join("svg").attr("viewBox", `0 0 ${w} ${h}`)
      .attr("width", w).attr("height", h).attr("aria-label", label);
    const id = `g${el.id}`;
    const grad = svg.selectAll("defs").data([0]).join("defs").selectAll("linearGradient").data([0]).join("linearGradient").attr("id", id);
    grad.selectAll("stop").data(d3.range(0, 1.01, 0.1)).join("stop")
      .attr("offset", (t) => t).attr("stop-color", (t) => scale(a + t * (b - a)));
    svg.selectAll("rect").data([0]).join("rect").attr("x", x0).attr("y", 14).attr("width", x1 - x0).attr("height", 8).attr("rx", 2).attr("fill", `url(#${id})`);
    svg.selectAll("text.cap").data([label]).join("text").attr("class", "cap").attr("x", x0).attr("y", 10).text((d) => d);
    svg.selectAll("text.tick").data(ticks).join("text").attr("class", "tick")
      .attr("x", (d) => x(d)).attr("y", 32).attr("text-anchor", (d, i) => (i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"))
      .text(format);
  }

  function renderScopeStats() {
    const [rich, res, est, inv, share, effort] = rm(state.scope, state.month);
    document.getElementById("scope-stats").innerHTML =
      `<div><dt>Presentes en ${MON[state.month]}.</dt><dd>${rich}</dd></div>` +
      `<div><dt><span class="sw c0"></span>Residentes</dt><dd>${res}</dd></div>` +
      `<div><dt><span class="sw c1"></span>De verano</dt><dd>${est}</dd></div>` +
      `<div><dt><span class="sw c2"></span>De invierno</dt><dd>${inv}</dd></div>` +
      `<div><dt>Visitantes (ponderado)</dt><dd>${pct(share)}</dd></div>` +
      `<div class="muted"><dt>Esfuerzo</dt><dd>${fmt.format(effort)}</dd></div>`;
  }

  // ---------------------------------------------------------------- grillas
  const W = 760, LABEL = 178, RIGHT = 74;
  const CW = (W - LABEL - RIGHT) / 12;

  function monthAxis(svg, order, y) {
    const g = svg.selectAll("g.axis").data([0]).join("g").attr("class", "axis");
    g.selectAll("text.mon").data(order, (m) => m).join("text").attr("class", "mon")
      .attr("x", (m) => colX(order, m) + CW / 2).attr("y", y).attr("text-anchor", "middle")
      .classed("current", (m) => m === state.month).text((m) => MON[m]);
  }

  function seasonHeader(svg, order, y, h) {
    const runs = seasonRuns(order);
    svg.selectAll("g.seasons").data([0]).join("g").attr("class", "seasons").selectAll("text").data(runs).join("text")
      .attr("x", (s) => LABEL + ((s.from + s.to) / 2) * CW).attr("y", y).attr("text-anchor", "middle").text((s) => s.label);
    svg.selectAll("g.season-lines").data([0]).join("g").attr("class", "season-lines").selectAll("line").data(runs.slice(1))
      .join("line").attr("x1", (s) => LABEL + s.from * CW).attr("x2", (s) => LABEL + s.from * CW).attr("y1", y - 8).attr("y2", h);
  }

  function cursor(svg, order, top, h) {
    svg.node().__order = order;
    svg.selectAll("rect.cursor").data([0]).join("rect").attr("class", "cursor").raise()
      .attr("x", colX(order, state.month)).attr("y", top).attr("width", CW).attr("height", h - top).attr("rx", 3);
  }

  // Matriz general: región × mes, color = cuánto se aleja la proporción de visitantes del promedio anual de la región.
  function renderRegionGrid() {
    const order = AUSTRAL;
    const rowH = 16, top = 36;
    const ids = [0, ...D.meta.regions.filter((r) => r.id).map((r) => r.id)];
    const y = (i) => top + i * rowH + (i > 0 ? 6 : 0);
    const h = y(ids.length) + 4;
    const svg = d3.select("#region-grid").selectAll("svg").data([0]).join("svg").attr("viewBox", `0 0 ${W} ${h}`)
      .attr("aria-label", "Grilla: variación estacional de la proporción de visitantes por región (filas, norte a sur) y mes (columnas)");
    seasonHeader(svg, order, 10, h);
    monthAxis(svg, order, 27);

    const rows = svg.selectAll("g.row").data(ids).join("g").attr("class", "row")
      .attr("transform", (id, i) => `translate(0,${y(i)})`)
      .classed("selected", (id) => id === state.scope)
      .classed("low", (id) => lowEffort(id))
      .style("cursor", "pointer")
      .on("click", (e, id) => selectScope(id === state.scope ? 0 : id));
    rows.selectAll("text").data((id) => [id]).join("text").attr("x", LABEL - 8).attr("y", rowH / 2).attr("dy", "0.35em").attr("text-anchor", "end")
      .attr("class", (id) => (id === 0 ? "label strong" : "label"))
      .text((id) => (id === 0 ? "Chile" : scopeName(id)) + (lowEffort(id) ? " *" : ""));
    rows.selectAll("rect").data((id) => order.map((m) => ({ id, m }))).join("rect")
      .attr("x", (d) => colX(order, d.m) + 1).attr("width", CW - 2).attr("height", rowH - 2).attr("rx", 1.5)
      .attr("fill", (d) => deviation(rm(d.id, d.m)[4] - shareMean(d.id)))
      .on("pointermove", (e, d) => showTip(e, regionTip(d.id, d.m))).on("pointerleave", hideTip);
    cursor(svg, order, top - 2, h);
  }

  // Llegada y salida: inicio y fin del tramo continuo más largo sobre el 50 % del pico, en el orden de la ventana
  // (cada ventana centra su estación, así que la estadía principal no se corta en los bordes).
  function arrival(row, order) {
    let best = [12, 12], start = -1;
    order.forEach((m, i) => {
      const on = row.prof[m] >= 50;
      if (on && start < 0) start = i;
      if (start >= 0 && (!on || i === 11)) {
        const end = on ? i : i - 1;
        if (end - start > best[1] - best[0] || best[0] === 12) best = [start, end];
        start = -1;
      }
    });
    return best;
  }

  function selectRows() {
    const order = tabOrder();
    const pool = (D.byScope.get(state.scope) || []).filter((r) => r.cls === state.tab);
    let rows = pool.slice().sort((a, b) => b.mean - a.mean || a.sid - b.sid);
    if (!state.expanded) rows = rows.slice(0, TAB_LIMIT[state.tab]);
    const pinned = pool.find((r) => r.sid === state.species);
    if (pinned && !rows.includes(pinned)) rows.push(pinned);
    if (state.tab !== 0) {
      // Escalera: primero los que llegan antes; a igual llegada, los que se van antes.
      rows.sort((a, b) => {
        const [a0, a1] = arrival(a, order);
        const [b0, b1] = arrival(b, order);
        return a0 - b0 || a1 - b1 || b.mean - a.mean;
      });
    }
    return { rows, total: pool.length };
  }

  function renderTabs() {
    const rows = D.byScope.get(state.scope) || [];
    const counts = [0, 0, 0, 0];
    rows.forEach((r) => counts[r.cls]++);
    d3.select("#tabs").selectAll("button").data([0, 1, 2]).join("button")
      .attr("type", "button").attr("role", "tab").attr("class", (c) => `tab c${c}`)
      .attr("aria-selected", (c) => c === state.tab)
      .html((c) => `<span class="sw c${c}"></span>${TAB_LABEL[c]} <span class="n">${counts[c]}</span>`)
      .on("click", (e, c) => setTab(c));
  }

  function setTab(c) {
    if (c === state.tab) return;
    state.tab = c;
    state.expanded = false;
    renderTabs();
    renderMap();
    renderCalendar();
  }

  function renderCalendar() {
    document.getElementById("scope-name").textContent = scopeName(state.scope);
    const order = tabOrder();
    const color = classScale[state.tab];
    const { rows: list, total } = selectRows();
    const rowH = 19, top = 36;
    const h = Math.max(top + list.length * rowH + 6, 80);
    const svg = d3.select("#calendar").selectAll("svg").data([0]).join("svg").attr("viewBox", `0 0 ${W} ${h}`)
      .attr("aria-label", `Calendario de ${CLASS_LABEL[state.tab].toLowerCase()} por mes en ${scopeName(state.scope)}`);
    seasonHeader(svg, order, 10, h);
    monthAxis(svg, order, 27);
    const barX = W - RIGHT + 10, barW = RIGHT - 44;
    const maxMean = d3.max(list, (r) => r.mean) || 1;
    svg.selectAll("text.bar-head").data([0]).join("text").attr("class", "bar-head")
      .attr("x", barX).attr("y", 27).text("días/mes");

    const rows = svg.selectAll("g.srow").data(list, (r) => r.sid)
      .join((enter) => {
        const g = enter.append("g").attr("class", "srow");
        g.append("rect").attr("class", "hit").attr("x", 0).attr("width", W).attr("height", rowH);
        g.append("text").attr("class", "label").attr("x", LABEL - 8).attr("y", rowH / 2).attr("dy", "0.35em").attr("text-anchor", "end");
        g.append("rect").attr("class", "freq").attr("y", 5).attr("height", rowH - 10).attr("rx", 1);
        g.append("text").attr("class", "freq-val").attr("y", rowH / 2).attr("dy", "0.35em");
        return g;
      })
      .attr("transform", (r, i) => `translate(0,${top + i * rowH})`)
      .classed("selected", (r) => r.sid === state.species)
      .on("click", (e, r) => openSpecies(r.sid));
    rows.select("text.label").text((r) => D.species[r.sid].comName);
    // Frecuencia absoluta: el color es relativo al mes pico, esta barra dice qué tan común es la especie.
    rows.select("rect.freq").attr("x", barX).attr("width", (r) => Math.max(1, (r.mean / maxMean) * barW))
      .attr("class", `freq c${state.tab}`);
    rows.select("text.freq-val").attr("x", barX + barW + 4)
      .text((r) => (r.mean / 1000 * 30.4).toFixed(r.mean < 330 ? 1 : 0).replace(".", ","));
    rows.selectAll("rect.cell").data((r) => order.map((m) => ({ r, m }))).join("rect").attr("class", "cell")
      .attr("x", (c) => colX(order, c.m) + 1.5).attr("y", 1.5).attr("width", CW - 3).attr("height", rowH - 3).attr("rx", 2)
      .attr("fill", (c) => color(c.r.prof[c.m]))
      // Confianza: menos años con registro en ese mes → celda más tenue.
      .attr("fill-opacity", (c) => 0.3 + 0.7 * (c.r.years[c.m] / 8))
      .on("pointermove", (e, c) => {
        const s = D.species[c.r.sid];
        showTip(e, `<b>${s.comName}</b> <i>${s.sciName}</i><br>${MONTHS[c.m]} · ${scopeName(state.scope)}<br>` +
          `${freqText(c.r, c.m)}<br>Perfil: <b>${c.r.prof[c.m]} %</b> del mes pico (${MONTHS[c.r.peak]})<br>` +
          `<span class="muted">Con registro en ${c.r.years[c.m]} de 8 años · ${CLASS_ONE[c.r.cls]}</span>`);
      })
      .on("pointerleave", hideTip);
    cursor(svg, order, top - 2, h);

    const more = document.getElementById("cal-more");
    more.hidden = total <= TAB_LIMIT[state.tab];
    more.textContent = state.expanded ? `Mostrar solo las ${TAB_LIMIT[state.tab]} más frecuentes` : `Mostrar las ${total} especies`;
    renderLegend(document.getElementById("cal-legend"), color, {
      label: "Presencia (% del mes pico)", ticks: [0, 50, 100], format: (d) => `${d} %`,
    });
    const sortText = state.tab === 0
      ? "<b>Orden:</b> por frecuencia (las más comunes arriba)."
      : `<b>Orden:</b> por llegada, es decir, el inicio del tramo más largo sobre el 50 % de su pico. <b>Eje:</b> ` +
        (order === AUSTRAL ? "julio → junio, con el verano al centro." : "enero → diciembre, con el invierno al centro.");
    document.getElementById("cal-note").innerHTML = list.length
      ? `<b>Se muestran</b> ${list.length} de ${total} especies (las más frecuentes). ` +
        `<b>Color:</b> presencia de cada mes respecto del mes pico de la especie (100 % = su mejor mes), corregida por el ` +
        `esfuerzo de registro de la región y el mes. <b>Tenue:</b> el mes tuvo registro en pocos de los 8 años (2017–2024). ` +
        `${sortText} <b>Barra:</b> días con registro al mes, promedio anual. Clic en una especie para ver su ficha.`
      : "No hay especies de esta clase en la región.";
  }

  function setupSearch() {
    const list = document.getElementById("species-list");
    const byLabel = new Map();
    D.species.forEach((s) => {
      const label = `${s.comName} — ${s.sciName}`;
      byLabel.set(label.toLowerCase(), s.id);
      byLabel.set(s.comName.toLowerCase(), s.id);
      byLabel.set(s.sciName.toLowerCase(), s.id);
      const o = document.createElement("option");
      o.value = label;
      list.appendChild(o);
    });
    const input = document.getElementById("search");
    const pick = () => {
      const q = input.value.trim().toLowerCase();
      if (!q) return;
      let id = byLabel.get(q);
      if (id === undefined) {
        const hit = D.species.find((s) => s.comName.toLowerCase().startsWith(q) || s.sciName.toLowerCase().startsWith(q));
        id = hit && hit.id;
      }
      if (id !== undefined) openSpecies(id);
    };
    input.addEventListener("change", pick);
    input.addEventListener("keydown", (e) => e.key === "Enter" && pick());
  }

  // ---------------------------------------------------------------- ficha de especie
  function openSpecies(sid) {
    state.species = sid;
    const s = D.species[sid];
    const rows = D.bySpecies.get(sid);
    const here = rows.get(state.scope) || rows.get(0);
    if (here && here.cls < 3 && here.cls !== state.tab) {
      state.tab = here.cls;
      state.expanded = false;
      renderTabs();
      renderMap();
    }
    if (Sonifier.playing) loadSounds().then(() => Sonifier.load([grainOf(sid)])).catch(() => {});
    const row = rows.get(state.scope) || rows.get(0);
    const panel = document.getElementById("panel");
    panel.hidden = false;
    document.body.classList.add("with-panel");
    const clsHere = rows.get(state.scope) ? CLASS_ONE[rows.get(state.scope).cls] : "sin registros aquí";
    document.getElementById("p-class").innerHTML =
      `<span class="sw c${CLASS_KEYS.indexOf(s.class)}"></span>En Chile: ${CLASS_ONE[CLASS_KEYS.indexOf(s.class)]}` +
      (state.scope ? ` · en ${scopeName(state.scope)}: ${clsHere}` : "");
    document.getElementById("p-name").textContent = s.comName;
    document.getElementById("p-sci").textContent = s.sciName;
    document.getElementById("p-scope").textContent = rows.get(state.scope) ? scopeName(state.scope) : "Chile";
    document.getElementById("p-note").textContent =
      `Amplitud estacional ${s.seasonality.toFixed(2).replace(".", ",")} (0 = pareja todo el año, 1 = ausente parte del año). ` +
      `Mes pico en Chile: ${MONTHS[s.peak]}. ${fmt.format(s.reportDays)} días-especie 2017–2024 en ${s.regions} regiones con presencia regular.`;
    renderRadial(row);
    renderSpeciesMap(sid);
    renderSound(sid);
    renderCalendar();
  }

  function closeSpecies() {
    state.species = null;
    document.getElementById("panel").hidden = true;
    document.body.classList.remove("with-panel");
    renderCalendar();
  }

  function renderRadial(row) {
    const size = 220, r0 = 18, r1 = 92, c = size / 2;
    const svg = d3.select("#p-radial").selectAll("svg").data([0]).join("svg").attr("viewBox", `0 0 ${size} ${size}`)
      .attr("aria-label", "Perfil anual radial, enero arriba, sentido horario");
    const angle = (m) => (m / 12) * 2 * Math.PI;
    const rad = d3.scaleLinear().domain([0, 100]).range([r0, r1]);
    const g = svg.selectAll("g.root").data([0]).join("g").attr("class", "root").attr("transform", `translate(${c},${c})`);
    g.selectAll("circle.ring").data([25, 50, 75, 100]).join("circle").attr("class", "ring").attr("r", (v) => rad(v));
    // Etiquetas de anillo entre "ene" y "feb" para no chocar con los meses.
    const la = angle(0.5);
    g.selectAll("text.ringlab").data([50, 100]).join("text").attr("class", "ringlab")
      .attr("x", (v) => Math.sin(la) * rad(v) + 2).attr("y", (v) => -Math.cos(la) * rad(v) - 2).text((v) => `${v} %`);
    const area = d3.areaRadial().angle((d) => angle(d.m)).innerRadius(r0).outerRadius((d) => rad(d.v)).curve(d3.curveCardinalClosed.tension(0.4));
    const pts = d3.range(12).map((m) => ({ m, v: row.prof[m] }));
    g.selectAll("path.area").data([pts]).join("path").attr("class", `area c${row.cls}`).attr("d", area);
    g.selectAll("text.mlab").data(d3.range(12)).join("text").attr("class", "mlab")
      .attr("x", (m) => Math.sin(angle(m)) * (r1 + 12)).attr("y", (m) => -Math.cos(angle(m)) * (r1 + 12) + 3)
      .attr("text-anchor", "middle").classed("current", (m) => m === state.month).text((m) => MON[m][0].toUpperCase() + MON[m].slice(1));
    g.selectAll("circle.dot").data(pts).join("circle").attr("class", "dot")
      .attr("cx", (d) => Math.sin(angle(d.m)) * rad(d.v)).attr("cy", (d) => -Math.cos(angle(d.m)) * rad(d.v)).attr("r", 5)
      .on("pointermove", (e, d) => showTip(e, `<b>${MONTHS[d.m]}</b><br>${d.v} % del mes pico<br>${freqText(row, d.m)}`))
      .on("pointerleave", hideTip);
  }

  function renderSpeciesMap(sid) {
    const rows = D.bySpecies.get(sid);
    const means = [...rows.values()].filter((r) => r.rid).map((r) => r.mean);
    const max = Math.max(1, d3.max(means) || 1);
    const scale = d3.scaleSequential(d3.interpolateRgbBasis(RAMPS[0])).domain([0, max]);
    const el = document.getElementById("p-map");
    drawChile(el, {
      width: 60, height: 270, selected: null,
      fill: (id) => (rows.get(id) ? scale(rows.get(id).mean) : "var(--empty)"),
      onClick: (id) => selectScope(id),
      onHover: (id) => {
        const r = rows.get(id);
        return r
          ? `<b>${scopeName(id)}</b><br>Frecuencia media: ${pct(r.mean / 1000, 1)} de los días<br>${CLASS_ONE[r.cls]} en la región`
          : `<b>${scopeName(id)}</b><br>Sin registros 2017–2024`;
      },
    }).attr("aria-label", "Mapa de frecuencia media anual de la especie por región");
  }

  async function loadSounds() {
    if (!sounds) sounds = await fetch("data/sounds.json").then((r) => r.json());
    return sounds;
  }
  const soundEntry = (sid) => sounds && sounds.species.find((x) => x.sid === sid);
  const grainOf = (sid) => {
    const e = soundEntry(sid);
    return e && e.recordings.length ? e.recordings[0].grain : null;
  };

  async function renderSound(sid) {
    const box = document.getElementById("p-sound");
    box.innerHTML = `<p class="muted">Buscando grabaciones…</p>`;
    try {
      await loadSounds();
    } catch (err) {
      box.innerHTML = `<p class="muted">No se pudo cargar el índice de cantos.</p>`;
      return;
    }
    if (state.species !== sid) return;
    const entry = soundEntry(sid);
    if (!entry) return (box.innerHTML = "");
    const name = entry.xcName !== D.species[sid].sciName ? ` (en Xeno-canto: <i>${entry.xcName}</i>)` : "";
    if (!entry.recordings.length) {
      box.innerHTML = `<h3>Canto</h3><p class="muted">Aún no hay un clip para esta especie${name}; al reproducir el año suena ` +
        `con un tono sintético. <a href="${entry.searchUrl}" target="_blank" rel="noopener">Escuchar en Xeno-canto ↗</a></p>`;
      return;
    }
    box.innerHTML = `<h3>Canto${name}</h3>` + entry.recordings.map((r) =>
      `<figure class="rec"><audio controls preload="none" src="${r.src}"></audio>` +
      `<figcaption><a href="${r.url}" target="_blank" rel="noopener">XC${r.id}</a> · ${r.recordist || "autor s/i"}` +
      ` · ${r.type || ""} · ${r.country || ""} · <a href="${r.license}" target="_blank" rel="noopener">licencia</a>` +
      `<br><span class="muted">Clip de 8 s (el tramo de mayor energía) de la grabación original.</span></figcaption></figure>`).join("");
  }

  // ---------------------------------------------------------------- sonificación
  // Residentes = colchón estable ("la que se queda"); visitantes = cantos reales ("la que viaja").
  // Cada mes recorre Chile de norte a sur: tiempo dentro del compás y tono ← latitud; densidad ← la ola.
  const regionLat = (id) => D.regionById.get(id).lat;
  function latSemis(lat) {
    const [lo, hi] = d3.extent(D.meta.regions.filter((r) => r.id), (r) => r.lat);
    const degree = Math.round(((lat - lo) / (hi - lo)) * 5); // 0 = sur … 5 = norte
    return 12 * Math.floor(degree / 5) + PENTATONIC[degree % 5] - 6; // −6 … +6 semitonos
  }
  const rateFor = (lat) => Math.pow(2, latSemis(lat) / 12);

  // Presencia estacional de una clase en una región, 0–1 respecto de su propio rango anual.
  function waveLevel(id, col, m) {
    const series = D.regionMonth[String(id)].map((x) => x[col]);
    const [lo, hi] = d3.extent(series);
    return hi > lo ? (series[m] - lo) / (hi - lo) : 0;
  }
  // Peso absoluto (para el volumen): cuántas especies de la clase hay, vs. el máximo nacional.
  function waveWeight(id, col, m) {
    const max = d3.max(D.meta.regions.filter((r) => r.id), (r) => d3.max(D.regionMonth[String(r.id)], (x) => x[col]));
    return rm(id, m)[col] / max;
  }

  function barFor(m) {
    const layers = (sounds && sounds.layers) || {};
    const zones = state.scope ? [{ ids: [state.scope] }] : ZONES;
    const slot = 1 / zones.length;
    // Pocos cantos por zona: con más, los granos se encimaban y el resultado era ruido.
    const maxPer = state.scope ? 3 : 2;
    const hits = [];
    const place = (z, k, n, shift) => z * slot + ((k + 0.5) / n + shift) * slot * 0.9;
    zones.forEach((zone, z) => {
      const lat = d3.mean(zone.ids, regionLat);
      if (state.species !== null) {
        const rows = D.bySpecies.get(state.species);
        const level = d3.max(zone.ids, (id) => (rows.get(id) ? (rows.get(id).prof[m] / 100) * (rows.get(id).years[m] / 8) : 0)) || 0;
        const n = Math.round(level * maxPer);
        for (let k = 0; k < n; k++) hits.push({ at: place(z, k, n, 0), sample: grainOf(state.species), rate: rateFor(lat), gain: 0.32, pan: 0 });
        return;
      }
      [[1, "visitante_estival", -0.35, 0], [2, "visitante_invernal", 0.35, 0.25 / maxPer]].forEach(([cls, key, pan, shift]) => {
        const col = cls + 1;
        const level = d3.mean(zone.ids, (id) => waveLevel(id, col, m));
        const weight = d3.mean(zone.ids, (id) => waveWeight(id, col, m));
        const n = Math.round(level * maxPer);
        const sample = layers[key] !== undefined ? grainOf(layers[key]) : null;
        for (let k = 0; k < n; k++) {
          hits.push({ at: place(z, k, n, shift), sample, rate: rateFor(lat), gain: 0.1 + 0.3 * Math.sqrt(weight), pan });
        }
      });
    });
    const root = state.scope ? 110 * rateFor(regionLat(state.scope)) : 110;
    const residents = rm(state.scope, m)[1] / d3.max(D.regionMonth[String(state.scope)], (x) => x[1]);
    return {
      tick: true,
      pad: { freqs: [root, root * 1.5], gain: (state.species !== null ? 0.025 : 0.06) * residents },
      hits,
    };
  }

  async function togglePlay() {
    const btn = document.getElementById("play");
    if (Sonifier.playing) {
      Sonifier.stop();
      btn.setAttribute("aria-pressed", "false");
      btn.setAttribute("aria-label", "Escuchar el año");
      btn.title = "Escuchar el año (barra espaciadora)";
      document.getElementById("play-icon").setAttribute("d", "M4.5 2.5v11l9-5.5z");
      return;
    }
    try {
      await loadSounds();
    } catch (err) {
      console.warn("Sin índice de cantos; se usarán tonos sintéticos", err);
    }
    const layers = (sounds && sounds.layers) || {};
    const urls = [...Object.values(layers).map(grainOf), state.species !== null ? grainOf(state.species) : null];
    const ok = await Sonifier.start(state.month, barFor, (m) => setMonth(m), urls);
    if (!ok) return;
    Sonifier.setMuted(state.muted);
    btn.setAttribute("aria-pressed", "true");
    btn.setAttribute("aria-label", "Pausar");
    btn.title = "Pausar (barra espaciadora)";
    document.getElementById("play-icon").setAttribute("d", "M4 2.5h3v11H4zM9 2.5h3v11H9z");
  }


  // ---------------------------------------------------------------- estado
  function setMonth(m) {
    state.month = m;
    document.getElementById("month").value = AUSTRAL.indexOf(m);
    document.getElementById("month-label").textContent = MONTHS[m];
    d3.selectAll("#month-ticks span").classed("current", (d, i) => AUSTRAL[i] === m);
    renderMap();
    renderScopeStats();
    d3.selectAll(".grid-chart svg").each(function () {
      if (this.__order) d3.select(this).select("rect.cursor").attr("x", colX(this.__order, m));
    });
    d3.selectAll("text.mon").classed("current", (d) => d === m);
    d3.selectAll("#p-radial text.mlab").classed("current", (d) => d === m);
  }

  function selectScope(id) {
    state.scope = id;
    document.getElementById("reset").hidden = !id;
    renderMap();
    renderScopeStats();
    renderRegionGrid();
    renderTabs();
    if (state.species !== null) openSpecies(state.species);
    else renderCalendar();
  }

  function setupControls() {
    const ticks = document.getElementById("month-ticks");
    ticks.innerHTML = AUSTRAL.map((m) => `<span>${MON[m][0].toUpperCase()}</span>`).join("");
    document.getElementById("month").addEventListener("input", (e) => setMonth(AUSTRAL[+e.target.value]));
    document.getElementById("cal-more").addEventListener("click", () => {
      state.expanded = !state.expanded;
      renderCalendar();
    });
    document.getElementById("play").addEventListener("click", togglePlay);
    document.getElementById("mute").addEventListener("click", (e) => {
      state.muted = !state.muted;
      Sonifier.setMuted(state.muted);
      e.currentTarget.setAttribute("aria-pressed", String(state.muted));
      e.currentTarget.setAttribute("aria-label", state.muted ? "Activar sonido" : "Silenciar");
      e.currentTarget.title = state.muted ? "Activar sonido" : "Silenciar";
    });
    document.getElementById("reset").addEventListener("click", () => selectScope(0));
    document.getElementById("panel-close").addEventListener("click", closeSpecies);
    document.addEventListener("keydown", (e) => {
      if (e.target.closest("input, textarea, button, audio")) return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "Escape" && state.species !== null) closeSpecies();
    });
  }

  function renderMethod() {
    const m = D.meta;
    document.getElementById("method-text").innerHTML =
      `Datos: registros de aves en Chile descargados de <a href="https://www.gbif.org" target="_blank" rel="noopener">GBIF</a> ` +
      `(eBird aporta 91–98 %). La métrica base es <b>días con registro</b>: días del mes en que la especie se registró en la región. ` +
      `No es abundancia ni número de aves: depende de cuánta gente observa. Por eso se usa un <b>año típico</b> ` +
      `(media ${m.years[0]}–${m.years[1]}; se excluyen ${m.excludedYears}) y el perfil de cada especie se corrige por esfuerzo ` +
      `(participación en el total de días-especie de la región-mes). Una especie está <i>presente</i> en un mes si se registró ` +
      `en al menos ${m.parameters.presenceMinYears} de 8 años y alcanza el ${pct(m.parameters.presenceMinProfile)} de su mes pico; ` +
      `es <i>visitante</i> si su amplitud estacional es ≥ ${String(m.parameters.seasonalMinAmplitude).replace(".", ",")}. ` +
      `Se excluyen islas oceánicas y registros pelágicos fuera de los polígonos regionales.`;
    document.getElementById("dois").innerHTML = `Cita: ${m.gbifCitation} ` +
      m.dois.map((d) => `<a href="${d}" target="_blank" rel="noopener">${d.replace("https://doi.org/", "")}</a>`).join(" · ");
  }

  // ---------------------------------------------------------------- inicio
  load()
    .then(() => {
      renderSummary();
      setupControls();
      setupSearch();
      renderLegend(document.getElementById("grid-legend"), deviation, {
        label: "Visitantes vs. promedio anual de la región", ticks: deviation.domain(), width: 320,
        format: (d) => (d === 0 ? "igual" : `${d > 0 ? "+" : "−"}${pct(Math.abs(d))}${d > 0 ? " o más" : " o menos"}`),
      });
      renderRegionGrid();
      renderTabs();
      renderCalendar();
      renderMethod();
      setMonth(0);
    })
    .catch((err) => {
      console.error(err);
      document.getElementById("summary").textContent = "No se pudieron cargar los datos. Abre la página con un servidor local (python3 -m http.server).";
    });
})();

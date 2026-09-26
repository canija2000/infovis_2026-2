/* Atlas sonoro de aves de Chile — V1
 * Overview: mapa + grilla región × mes + calendario especie × mes (año típico).
 * Zoom & filter: región, clases, buscador, scrubber de mes con play.
 * Details on demand: ficha de especie con perfil radial, mapa y canto.
 * Datos precalculados por build_web_data.py (ver docs/metodologia-datos.md §10).
 */
(() => {
  "use strict";

  const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const MON = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  // Año austral: julio → junio, para que el verano (dic–feb) quede al centro.
  const ORDER = [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5];
  const SEASONS = [
    { label: "invierno", from: 0, to: 2 },
    { label: "primavera", from: 2, to: 5 },
    { label: "verano", from: 5, to: 8 },
    { label: "otoño", from: 8, to: 11 },
    { label: "inv.", from: 11, to: 12 },
  ];
  const CLASS_KEYS = ["residente", "visitante_estival", "visitante_invernal", "ocasional"];
  const CLASS_LABEL = ["Residentes", "Visitantes de verano", "Visitantes de invierno", "Ocasionales"];
  const CHIP_LABEL = ["Residentes", "De verano", "De invierno", "Ocasionales"];
  const CLASS_ONE = ["residente", "visitante de verano", "visitante de invierno", "ocasional"];
  const GROUP_ORDER = [1, 2, 0, 3]; // olas primero, luego el bloque residente
  const GROUP_LIMIT = { 0: 20, 1: 16, 2: 10, 3: 10 };
  const PENTATONIC = [0, 3, 5, 7, 10];

  const fmt = new Intl.NumberFormat("es-CL");
  const pct = (v, d = 0) => `${(v * 100).toFixed(d).replace(".", ",")} %`;

  const state = {
    scope: 0,
    month: 0, // índice calendario (0 = enero)
    classes: new Set([0, 1, 2]),
    species: null,
    muted: false,
  };

  let D = null; // datos cargados
  let sounds = null;

  // ---------------------------------------------------------------- colores
  const dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const RAMP_BLUE = dark
    ? ["#20252d", "#184f95", "#2a78d6", "#6da7ec", "#cde2fb"]
    : ["#f1f4f8", "#b7d3f6", "#5598e7", "#1c5cab", "#0d366b"];
  const RAMP_VIOLET = dark
    ? ["#24222c", "#3b2f8a", "#6a5cd0", "#9085e9", "#d6d0f7"]
    : ["#f3f1f8", "#c9c2ee", "#8a7ddc", "#4a3aa7", "#271b66"];
  const blue = d3.scaleSequential(d3.interpolateRgbBasis(RAMP_BLUE)).domain([0, 100]);
  const violet = d3.scaleSequential(d3.interpolateRgbBasis(RAMP_VIOLET));

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
    const shares = [];
    for (const [k, months] of Object.entries(regionMonth.scopes)) if (k !== "0") months.forEach((m) => shares.push(m[4]));
    violet.domain([0, Math.ceil(d3.max(shares) * 10) / 10]);
    D = { meta, species, byScope, bySpecies, regionMonth: regionMonth.scopes, geo, regionById };
  }

  // ---------------------------------------------------------------- helpers
  const scopeName = (id) => D.regionById.get(id).name;
  const rm = (scope, m) => D.regionMonth[String(scope)][m];
  const displayIndex = (m) => ORDER.indexOf(m);
  const austral = (phase) => (phase - 6 + 12) % 12;

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

  function renderMap() {
    const m = state.month;
    document.getElementById("map-month").textContent = MONTHS[m];
    const el = document.getElementById("map");
    drawChile(el, {
      width: 170, height: 760, selected: state.scope || null,
      fill: (id) => violet(rm(id, m)[4]),
      onClick: (id) => selectScope(state.scope === id ? 0 : id),
      onHover: (id) => regionTip(id, m),
    }).attr("aria-label", `Mapa de Chile: proporción de visitantes por región en ${MONTHS[m]}`);
  }

  function regionTip(id, m) {
    const [rich, res, est, inv, share, effort] = rm(id, m);
    return `<b>${scopeName(id)}</b> · ${MONTHS[m]}<br>` +
      `${rich} especies presentes<br>` +
      `<span class="sw c1"></span>${est} de verano · <span class="sw c2"></span>${inv} de invierno · <span class="sw c0"></span>${res} residentes<br>` +
      `Visitantes: <b>${pct(share)}</b> de la presencia<br><span class="muted">Esfuerzo medio: ${fmt.format(effort)} días-especie</span>`;
  }

  function renderLegend(el, scale, { label, ticks, format }) {
    const w = 220, h = 34, x0 = 6, x1 = w - 10;
    const [a, b] = scale.domain();
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
  const W = 760, LABEL = 178, RIGHT = 8;
  const CW = (W - LABEL - RIGHT) / 12;
  const colX = (m) => LABEL + displayIndex(m) * CW;

  function monthAxis(g, y) {
    g.selectAll("text.mon").data(ORDER).join("text").attr("class", "mon")
      .attr("x", (m) => colX(m) + CW / 2).attr("y", y).attr("text-anchor", "middle")
      .classed("current", (m) => m === state.month).text((m) => MON[m]);
  }

  function renderRegionGrid() {
    const rowH = 13, top = 34;
    const ids = [0, ...D.meta.regions.filter((r) => r.id).map((r) => r.id)];
    const y = (i) => top + i * rowH + (i > 0 ? 6 : 0);
    const h = y(ids.length) + 4;
    const svg = d3.select("#region-grid").selectAll("svg").data([0]).join("svg").attr("viewBox", `0 0 ${W} ${h}`)
      .attr("aria-label", "Grilla: proporción de visitantes por región (filas, norte a sur) y mes (columnas)");
    // estaciones
    svg.selectAll("g.seasons").data([0]).join("g").attr("class", "seasons").selectAll("text").data(SEASONS).join("text")
      .attr("x", (s) => LABEL + ((s.from + s.to) / 2) * CW).attr("y", 10).attr("text-anchor", "middle").text((s) => s.label);
    svg.selectAll("g.season-lines").data([0]).join("g").attr("class", "season-lines").selectAll("line").data(SEASONS.slice(1))
      .join("line").attr("x1", (s) => LABEL + s.from * CW).attr("x2", (s) => LABEL + s.from * CW).attr("y1", 2).attr("y2", h);
    monthAxis(svg.selectAll("g.axis").data([0]).join("g").attr("class", "axis"), 27);

    const rows = svg.selectAll("g.row").data(ids).join("g").attr("class", "row")
      .attr("transform", (id, i) => `translate(0,${y(i)})`)
      .classed("selected", (id) => id === state.scope)
      .style("cursor", "pointer")
      .on("click", (e, id) => selectScope(id === state.scope ? 0 : id));
    rows.selectAll("text").data((id) => [id]).join("text").attr("x", LABEL - 8).attr("y", rowH - 3).attr("text-anchor", "end")
      .attr("class", (id) => (id === 0 ? "label strong" : "label")).text((id) => (id === 0 ? "Chile" : scopeName(id)));
    rows.selectAll("rect").data((id) => ORDER.map((m) => ({ id, m }))).join("rect")
      .attr("x", (d) => colX(d.m) + 1).attr("width", CW - 2).attr("height", rowH - 2).attr("rx", 1.5)
      .attr("fill", (d) => violet(rm(d.id, d.m)[4]))
      .on("pointermove", (e, d) => showTip(e, regionTip(d.id, d.m))).on("pointerleave", hideTip);
    svg.selectAll("rect.cursor").data([0]).join("rect").attr("class", "cursor")
      .attr("x", colX(state.month)).attr("y", top - 2).attr("width", CW).attr("height", h - top).attr("rx", 3);
  }

  function selectRows() {
    const all = (D.byScope.get(state.scope) || []).filter((r) => state.classes.has(r.cls));
    const groups = [];
    for (const cls of GROUP_ORDER) {
      if (!state.classes.has(cls)) continue;
      const pool = all.filter((r) => r.cls === cls);
      if (!pool.length) continue;
      let chosen = pool.slice().sort((a, b) => b.mean - a.mean || a.sid - b.sid).slice(0, GROUP_LIMIT[cls]);
      const pinned = pool.find((r) => r.sid === state.species);
      if (pinned && !chosen.includes(pinned)) chosen.push(pinned);
      chosen.sort((a, b) => austral(a.phase) - austral(b.phase) || b.mean - a.mean);
      if (cls === 0 || cls === 3) chosen.sort((a, b) => b.mean - a.mean);
      groups.push({ cls, rows: chosen, total: pool.length });
    }
    return groups;
  }

  function renderCalendar() {
    document.getElementById("scope-name").textContent = scopeName(state.scope);
    const groups = selectRows();
    const rowH = 12, head = 22, gap = 10, top = 20;
    let y = top;
    const layout = [];
    for (const g of groups) {
      layout.push({ type: "head", g, y });
      y += head;
      for (const r of g.rows) {
        layout.push({ type: "row", r, y });
        y += rowH;
      }
      y += gap;
    }
    const h = Math.max(y, 60);
    const svg = d3.select("#calendar").selectAll("svg").data([0]).join("svg").attr("viewBox", `0 0 ${W} ${h}`)
      .attr("aria-label", `Calendario especie por mes en ${scopeName(state.scope)}`);
    monthAxis(svg.selectAll("g.axis").data([0]).join("g").attr("class", "axis"), 12);
    svg.selectAll("g.season-lines").data([0]).join("g").attr("class", "season-lines").selectAll("line").data(SEASONS.slice(1))
      .join("line").attr("x1", (s) => LABEL + s.from * CW).attr("x2", (s) => LABEL + s.from * CW).attr("y1", top).attr("y2", h);

    const heads = svg.selectAll("g.ghead").data(layout.filter((d) => d.type === "head"), (d) => d.g.cls)
      .join((enter) => {
        const g = enter.append("g").attr("class", "ghead");
        g.append("rect").attr("width", 10).attr("height", 10).attr("rx", 2).attr("y", 5);
        g.append("text").attr("x", 16).attr("y", 14);
        return g;
      })
      .attr("transform", (d) => `translate(0,${d.y})`);
    heads.select("rect").attr("class", (d) => `sw-rect c${d.g.cls}`);
    heads.select("text").html((d) => `<tspan class="strong">${CLASS_LABEL[d.g.cls]}</tspan><tspan class="muted"> · ${d.g.rows.length} de ${d.g.total} especies${d.g.cls === 0 ? ", las más frecuentes" : ""}</tspan>`);

    const rows = svg.selectAll("g.srow").data(layout.filter((d) => d.type === "row"), (d) => `${d.r.cls}-${d.r.sid}`)
      .join((enter) => {
        const g = enter.append("g").attr("class", "srow");
        g.append("rect").attr("class", "hit").attr("x", 0).attr("width", W).attr("height", rowH);
        g.append("text").attr("class", "label").attr("x", LABEL - 8).attr("y", rowH - 2.5).attr("text-anchor", "end");
        return g;
      })
      .attr("transform", (d) => `translate(0,${d.y})`)
      .classed("selected", (d) => d.r.sid === state.species)
      .on("click", (e, d) => openSpecies(d.r.sid));
    rows.select("text.label").text((d) => D.species[d.r.sid].comName);
    rows.selectAll("rect.cell").data((d) => ORDER.map((m) => ({ r: d.r, m }))).join("rect").attr("class", "cell")
      .attr("x", (c) => colX(c.m) + 1).attr("y", 1).attr("width", CW - 2).attr("height", rowH - 2).attr("rx", 1.5)
      .attr("fill", (c) => blue(c.r.prof[c.m]))
      .on("pointermove", (e, c) => {
        const s = D.species[c.r.sid];
        showTip(e, `<b>${s.comName}</b> <i>${s.sciName}</i><br>${MONTHS[c.m]} · ${scopeName(state.scope)}<br>` +
          `${freqText(c.r, c.m)}<br>Perfil: <b>${c.r.prof[c.m]} %</b> del mes pico (${MONTHS[c.r.peak]})<br>` +
          `<span class="muted">Con registro en ${c.r.years[c.m]} de 8 años · ${CLASS_ONE[c.r.cls]}</span>`);
      })
      .on("pointerleave", hideTip);

    svg.selectAll("rect.cursor").data([0]).join("rect").attr("class", "cursor").raise()
      .attr("x", colX(state.month)).attr("y", top - 2).attr("width", CW).attr("height", h - top).attr("rx", 3);

    const shown = groups.reduce((a, g) => a + g.rows.length, 0);
    document.getElementById("cal-note").textContent = shown
      ? `Color: presencia relativa al mes pico de cada especie (100 % = su mejor mes), corregida por esfuerzo de registro. ` +
        `Grupos de visitantes ordenados por mes central de presencia; residentes por frecuencia. Clic en una especie para ver su ficha.`
      : "No hay especies para esta combinación de región y clases.";
  }

  // ---------------------------------------------------------------- chips y buscador
  function renderChips() {
    const rows = D.byScope.get(state.scope) || [];
    const counts = [0, 0, 0, 0];
    rows.forEach((r) => counts[r.cls]++);
    const el = d3.select("#chips");
    el.selectAll("button").data(GROUP_ORDER).join("button")
      .attr("type", "button").attr("class", (c) => `chip c${c}`)
      .attr("aria-pressed", (c) => state.classes.has(c))
      .html((c) => `<span class="sw c${c}"></span>${CHIP_LABEL[c]} <span class="n">${counts[c]}</span>`)
      .on("click", (e, c) => {
        state.classes.has(c) ? state.classes.delete(c) : state.classes.add(c);
        renderChips();
        renderCalendar();
      });
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
    const scale = d3.scaleSequential(d3.interpolateRgbBasis(RAMP_BLUE)).domain([0, max]);
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

  async function renderSound(sid) {
    const box = document.getElementById("p-sound");
    box.innerHTML = `<p class="muted">Buscando grabaciones…</p>`;
    try {
      if (!sounds) sounds = await fetch("data/sounds.json").then((r) => r.json());
    } catch (err) {
      box.innerHTML = `<p class="muted">No se pudo cargar el índice de cantos.</p>`;
      return;
    }
    if (state.species !== sid) return;
    const entry = sounds.species.find((x) => x.sid === sid);
    if (!entry) return (box.innerHTML = "");
    const name = entry.xcName !== D.species[sid].sciName ? ` (en Xeno-canto: <i>${entry.xcName}</i>)` : "";
    if (!entry.recordings.length) {
      box.innerHTML = `<h3>Canto</h3><p class="muted">Aún no hay una grabación seleccionada para esta especie${name}. ` +
        `<a href="${entry.searchUrl}" target="_blank" rel="noopener">Escuchar en Xeno-canto ↗</a></p>`;
      return;
    }
    box.innerHTML = `<h3>Canto${name}</h3>` + entry.recordings.map((r) =>
      `<figure class="rec"><audio controls preload="none" src="${r.src}"></audio>` +
      `<figcaption><a href="${r.url}" target="_blank" rel="noopener">XC${r.id}</a> · ${r.recordist || "autor s/i"}` +
      ` · ${r.type || ""} · ${r.country || ""} · <a href="${r.license}" target="_blank" rel="noopener">licencia</a></figcaption></figure>`).join("");
  }

  // ---------------------------------------------------------------- sonificación
  const lats = () => D.meta.regions.filter((r) => r.id).map((r) => r.lat);
  function pitch(regionId) {
    const [lo, hi] = d3.extent(lats());
    const degree = Math.round(((D.regionById.get(regionId).lat - lo) / (hi - lo)) * 14); // 0 = sur … 14 = norte
    const semis = 12 * Math.floor(degree / 5) + PENTATONIC[degree % 5];
    return 110 * Math.pow(2, semis / 12);
  }

  function voices(m) {
    const ids = state.scope ? [state.scope] : D.meta.regions.filter((r) => r.id).map((r) => r.id);
    const solo = ids.length === 1;
    if (state.species !== null) {
      const rows = D.bySpecies.get(state.species);
      return ids.filter((id) => rows.get(id)).map((id) => {
        const r = rows.get(id);
        return {
          freq: pitch(id),
          pulses: (Sonifier.STEPS * r.prof[m] * r.years[m]) / 800,
          bright: r.cls === 1 || r.cls === 2 ? 0.85 : 0.1,
          gain: solo ? 0.16 : 0.07,
        };
      });
    }
    const maxRich = d3.max(ids, (id) => d3.max(D.regionMonth[String(id)], (x) => x[0]));
    const [, vmax] = violet.domain();
    return ids.map((id) => {
      const [rich, , , , share] = rm(id, m);
      return {
        freq: pitch(id),
        pulses: Math.max(1, Math.round((rich / maxRich) * Sonifier.STEPS)),
        bright: Math.min(1, share / vmax),
        gain: solo ? 0.14 : 0.045,
      };
    });
  }

  async function togglePlay() {
    const btn = document.getElementById("play");
    if (Sonifier.playing) {
      Sonifier.stop();
      btn.setAttribute("aria-pressed", "false");
      document.getElementById("play-label").textContent = "Escuchar el año";
      document.getElementById("play-icon").setAttribute("d", "M4 2.5v11l9-5.5z");
      return;
    }
    const ok = await Sonifier.start(state.month, voices, (m) => setMonth(m));
    if (!ok) return;
    Sonifier.setMuted(state.muted);
    btn.setAttribute("aria-pressed", "true");
    document.getElementById("play-label").textContent = "Pausa";
    document.getElementById("play-icon").setAttribute("d", "M4 2.5h3v11H4zM9 2.5h3v11H9z");
  }

  // ---------------------------------------------------------------- estado
  function setMonth(m) {
    state.month = m;
    document.getElementById("month").value = displayIndex(m);
    document.getElementById("month-label").textContent = MONTHS[m];
    d3.selectAll("#month-ticks span").classed("current", (d, i) => ORDER[i] === m);
    renderMap();
    renderScopeStats();
    d3.selectAll("rect.cursor").attr("x", colX(m));
    d3.selectAll("text.mon").classed("current", (d) => d === m);
    d3.selectAll("#p-radial text.mlab").classed("current", (d) => d === m);
  }

  function selectScope(id) {
    state.scope = id;
    document.getElementById("reset").hidden = !id;
    renderMap();
    renderScopeStats();
    renderRegionGrid();
    renderChips();
    if (state.species !== null) openSpecies(state.species);
    else renderCalendar();
  }

  function setupControls() {
    const ticks = document.getElementById("month-ticks");
    ticks.innerHTML = ORDER.map((m) => `<span>${MON[m][0].toUpperCase()}</span>`).join("");
    document.getElementById("month").addEventListener("input", (e) => setMonth(ORDER[+e.target.value]));
    document.getElementById("play").addEventListener("click", togglePlay);
    document.getElementById("mute").addEventListener("click", (e) => {
      state.muted = !state.muted;
      Sonifier.setMuted(state.muted);
      e.currentTarget.setAttribute("aria-pressed", String(state.muted));
      e.currentTarget.textContent = state.muted ? "Sonido: no" : "Sonido: sí";
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
      renderLegend(document.getElementById("map-legend"), violet, {
        label: "Visitantes (% de la presencia)", ticks: d3.ticks(...violet.domain(), 3), format: (d) => pct(d),
      });
      renderLegend(document.getElementById("cal-legend"), blue, {
        label: "Presencia (% del mes pico)", ticks: [0, 50, 100], format: (d) => `${d} %`,
      });
      renderRegionGrid();
      renderChips();
      renderCalendar();
      renderMethod();
      setMonth(0);
    })
    .catch((err) => {
      console.error(err);
      document.getElementById("summary").textContent = "No se pudieron cargar los datos. Abre la página con un servidor local (python3 -m http.server).";
    });
})();

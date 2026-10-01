/* Atlas sonoro de aves de Chile — portada (Visualización)
 * Una sola idea, sin necesidad de interactuar:
 *   A · El pulso del año: especies presentes en Chile por mes, apiladas por clase (año austral jul → jun).
 *   B · Un punto, una especie: las residentes quedan quietas; las visitantes entran y salen del país.
 * El mes (botones, clic en A o ▶) manda en ambas vistas y en el sonido.
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
  function setMonth(m) {
    state.month = m;
    updatePulse();
    updateFlock(true);
    updateMonths();
  }

  // ---------------------------------------------------------------- sonido
  // Un mes = un compás (sonify.js). Residentes = colchón estable; visitantes = cantos de especies presentes ese mes.
  // Cantidad de cantos ∝ especies visitantes presentes (1 canto por cada 12 especies, mínimo 1): la ola se oye
  // como densidad. Verano a la izquierda, invierno a la derecha.
  const PER_HIT = 12;
  function seeded(seed) {
    let t = seed + 0x6d2b79f5;
    return () => {
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let barCount = 0;
  function barFor(m) {
    const rand = seeded(m * 101 + barCount++);
    const hits = [];
    [[1, -0.4], [2, 0.4]].forEach(([cls, pan]) => {
      const here = D.species.filter((s) => s.cls === cls && present(s, m) && s.grain);
      const count = D.months[m][cls];
      const n = Math.min(here.length, Math.max(1, Math.round(count / PER_HIT)));
      d3.shuffle(here, rand);
      for (let k = 0; k < n; k++) {
        const at = (k + 0.15 + rand() * 0.6) / n;
        hits.push({ at: Math.min(0.92, at), sample: here[k].grain, rate: 1 + (rand() - 0.5) * 0.12, gain: cls === 1 ? 0.22 : 0.28, pan });
      }
    });
    return { tick: true, pad: { freqs: [110, 165], gain: 0.06 * (D.months[m][0] / 214) }, hits };
  }
  async function togglePlay() {
    const btn = document.getElementById("play");
    const icon = document.getElementById("play-icon");
    if (Sonifier.playing) {
      Sonifier.stop();
      btn.setAttribute("aria-pressed", "false");
      btn.setAttribute("aria-label", "Escuchar el año");
      icon.setAttribute("d", "M4.5 2.5v11l9-5.5z");
      return;
    }
    const urls = D.species.filter((s) => s.cls && s.grain).map((s) => s.grain);
    btn.setAttribute("aria-busy", "true");
    const ok = await Sonifier.start(state.month, barFor, (m) => setMonth(m), urls);
    btn.removeAttribute("aria-busy");
    if (!ok) return;
    btn.setAttribute("aria-pressed", "true");
    btn.setAttribute("aria-label", "Pausar");
    icon.setAttribute("d", "M4 2.5h3v11H4zM9 2.5h3v11H9z");
  }

  // ---------------------------------------------------------------- inicio
  load().then(() => {
    drawPulse();
    drawFlock();
    drawMonths();
    drawTable();
    document.getElementById("play").addEventListener("click", togglePlay);
    document.addEventListener("keydown", (event) => {
      if (event.code !== "Space" || event.target.closest("button, input, a, summary")) return;
      event.preventDefault();
      togglePlay();
    });
    let lastWidth = innerWidth;
    addEventListener("resize", () => {
      if (innerWidth === lastWidth) return;
      lastWidth = innerWidth;
      drawPulse();
      drawFlock();
    });
  }).catch((err) => {
    console.error(err);
    document.getElementById("pulse").textContent = "No se pudieron cargar los datos.";
  });
})();

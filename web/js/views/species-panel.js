/** Presenta los hechos, el perfil anual y la distribución de una especie. */
import { d3 } from "../shared/d3.js";
import { MONTHS, MON } from "../shared/calendar.js";
import { CLASS_KEYS, CLASS_ONE } from "../shared/classes.js";
import { fmt, pct, freqText } from "../shared/format.js";
export function createSpeciesPanel({
  data,
  state,
  RAMPS,
  scopeName,
  drawChile,
  selectScope,
  showTip,
  hideTip,
  onPlayYear,
  onPlayScene,
}) {
  const PLAY_D = "M5 3.5v9l7.5-4.5z";
  const STOP_D = "M4.5 4.5h7v7h-7z";
  const yearButton = document.getElementById("p-year");
  yearButton.addEventListener("click", () => onPlayYear());
  const sceneButtons = [...document.querySelectorAll("#p-scenes button")];
  for (const button of sceneButtons)
    button.addEventListener("click", () => onPlayScene(button.dataset.scene));
  const yearNow = document.getElementById("p-year-now");
  const reduceMotion = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  function renderSpecies(sid) {
    const s = data.species[sid];
    const rows = data.bySpecies.get(sid);
    const row = rows.get(state.scope) || rows.get(0);
    const panel = document.getElementById("panel");
    panel.hidden = false;
    document.body.classList.add("with-panel");
    const clsIdx = CLASS_KEYS.indexOf(s.class);
    const hereRow = rows.get(state.scope);
    document.getElementById("p-class").innerHTML =
      `<span class="sw c${clsIdx}"></span>${CLASS_ONE[clsIdx]}`;
    document.getElementById("p-name").textContent = s.comName;
    document.getElementById("p-sci").textContent = s.sciName;
    document.getElementById("p-scope").textContent = hereRow
      ? scopeName(state.scope)
      : "Chile";
    renderFacts(s, rows, hereRow);
    renderRadial(row);
    renderSpeciesMap(sid);
  }

  // Ficha: datos cortos con etiqueta, en vez de un párrafo.
  function hideSpecies() {
    document.getElementById("panel").hidden = true;
    document.body.classList.remove("with-panel");
  }
  function daysIn(row, m) {
    const days = new Date(2021, m + 1, 0).getDate();
    return { m, days, seen: Math.round((row.freq[m] / 1000) * days) };
  }

  function renderFacts(s, rows, hereRow) {
    const facts = [];
    const clsIdx = CLASS_KEYS.indexOf(s.class);
    facts.push([
      "Clase",
      `<span class="sw c${clsIdx}"></span>${CLASS_ONE[clsIdx]} en Chile` +
        (state.scope
          ? `<br><span class="sw c${hereRow ? hereRow.cls : 3}"></span>` +
            (hereRow
              ? `${CLASS_ONE[hereRow.cls]} en ${scopeName(state.scope)}`
              : `sin registros regulares en ${scopeName(state.scope)}`)
          : ""),
    ]);
    // Mejor mes: en la región elegida o, en Chile, en la región donde más se registra ese mes.
    const peak = hereRow ? hereRow.peak : s.peak;
    let where = state.scope && hereRow ? state.scope : null;
    if (!where) {
      const regional = [...rows.values()].filter((r) => r.rid);
      where = regional.length
        ? d3.greatest(regional, (r) => r.freq[peak]).rid
        : null;
    }
    if (where) {
      const b = daysIn(rows.get(where), peak);
      facts.push([
        "Mejor mes",
        `${MONTHS[peak]}: en ${scopeName(where)} se registra <b>${b.seen} de ${b.days} días</b>`,
      ]);
    }
    const a = s.seasonality;
    const shape =
      a < 0.3
        ? "pareja todo el año"
        : a < 0.6
          ? "varía con las estaciones"
          : "se ausenta parte del año";
    facts.push([
      "Estacionalidad",
      `${shape} <span class="muted">(amplitud ${a.toFixed(2).replace(".", ",")}; 0 = pareja, 1 = ausente parte del año)</span>`,
    ]);
    facts.push(["Presencia regular", `${s.regions} de 16 regiones`]);
    facts.push([
      "Registros",
      `${fmt.format(s.reportDays)} días-especie, 2017–2024`,
    ]);
    document.getElementById("p-facts").innerHTML = facts
      .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
      .join("");
  }
  function renderRadial(row) {
    const size = 220,
      r0 = 18,
      r1 = 92,
      c = size / 2;
    const svg = d3
      .select("#p-radial")
      .selectAll("svg")
      .data([0])
      .join("svg")
      .attr("viewBox", `0 0 ${size} ${size}`)
      .attr("aria-label", "Perfil anual radial, enero arriba, sentido horario");
    const angle = (m) => (m / 12) * 2 * Math.PI;
    const rad = d3.scaleLinear().domain([0, 100]).range([r0, r1]);
    const g = svg
      .selectAll("g.root")
      .data([0])
      .join("g")
      .attr("class", "root")
      .attr("transform", `translate(${c},${c})`);
    g.selectAll("circle.ring")
      .data([25, 50, 75, 100])
      .join("circle")
      .attr("class", "ring")
      .attr("r", (v) => rad(v));
    // Etiquetas de anillo entre "ene" y "feb" para no chocar con los meses.
    const la = angle(0.5);
    g.selectAll("text.ringlab")
      .data([50, 100])
      .join("text")
      .attr("class", "ringlab")
      .attr("x", (v) => Math.sin(la) * rad(v) + 2)
      .attr("y", (v) => -Math.cos(la) * rad(v) - 2)
      .text((v) => `${v} %`);
    const area = d3
      .areaRadial()
      .angle((d) => angle(d.m))
      .innerRadius(r0)
      .outerRadius((d) => rad(d.v))
      .curve(d3.curveCardinalClosed.tension(0.4));
    const pts = d3.range(12).map((m) => ({ m, v: row.prof[m] }));
    // Aguja de «Escuchar su año»: oculta hasta que suena.
    const needle = g
      .selectAll("g.needle")
      .data([0])
      .join((enter) => {
        const n = enter.append("g").attr("class", "needle");
        n.append("line")
          .attr("x1", 0)
          .attr("y1", -r0 + 4)
          .attr("x2", 0)
          .attr("y2", -r1 - 3);
        n.append("circle").attr("r", 3);
        return n;
      })
      .attr("visibility", "hidden");
    needle.attr("transform", "rotate(0)");
    g.selectAll("path.area")
      .data([pts])
      .join("path")
      .attr("class", `area c${row.cls}`)
      .attr("d", area);
    g.selectAll("text.mlab")
      .data(d3.range(12))
      .join("text")
      .attr("class", "mlab")
      .attr("x", (m) => Math.sin(angle(m)) * (r1 + 12))
      .attr("y", (m) => -Math.cos(angle(m)) * (r1 + 12) + 3)
      .attr("text-anchor", "middle")
      .classed("current", (m) => m === state.month)
      .text((m) => MON[m][0].toUpperCase() + MON[m].slice(1));
    g.selectAll("circle.dot")
      .data(pts)
      .join("circle")
      .attr("class", "dot")
      .attr("cx", (d) => Math.sin(angle(d.m)) * rad(d.v))
      .attr("cy", (d) => -Math.cos(angle(d.m)) * rad(d.v))
      .attr("r", 5)
      .on("pointermove", (e, d) =>
        showTip(
          e,
          `<b>${MONTHS[d.m]}</b><br>${d.v} % del mes pico<br>${freqText(row, d.m)}`,
        ),
      )
      .on("pointerleave", hideTip);
    g.select("g.needle").raise();
  }

  function renderSpeciesMap(sid) {
    const rows = data.bySpecies.get(sid);
    const means = [...rows.values()].filter((r) => r.rid).map((r) => r.mean);
    const max = Math.max(1, d3.max(means) || 1);
    const cls = CLASS_KEYS.indexOf(data.species[sid].class);
    const scale = d3
      .scaleSequential(
        d3.interpolateRgbBasis(RAMPS[cls >= 0 && cls < 3 ? cls : 0]),
      )
      .domain([0, max]);
    const el = document.getElementById("p-map");
    drawChile(el, {
      width: 60,
      height: 270,
      selected: null,
      fill: (id) => (rows.get(id) ? scale(rows.get(id).mean) : "var(--empty)"),
      onClick: (id) => selectScope(id),
      onHover: (id) => {
        const r = rows.get(id);
        return r
          ? `<b>${scopeName(id)}</b><br>Frecuencia media: ${pct(r.mean / 1000, 1)} de los días<br>${CLASS_ONE[r.cls]} en la región`
          : `<b>${scopeName(id)}</b><br>Sin registros 2017–2024`;
      },
    }).attr(
      "aria-label",
      "Mapa de frecuencia media anual de la especie por región",
    );
  }

  // available: la especie tiene grabación (true), no tiene (false) o aún no se sabe (null).
  function setYearAvailable(available) {
    yearButton.hidden = available === null;
    document.getElementById("p-year-note").hidden = available !== true;
    document.getElementById("p-scenes").hidden = available !== true;
    yearButton.disabled = available !== true;
    if (available === false)
      yearButton.querySelector("span").textContent =
        "Sin grabación para escuchar su año";
    else setYearPlayback(false);
  }
  // Leyenda sonora: marca el ejemplo que suena (o ninguno).
  function setScenePlayback(scene) {
    for (const button of sceneButtons)
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.scene === scene),
      );
  }
  // Mueve la aguja al mes que suena y resalta su punto; month = null deja la aguja oculta.
  // sound: cómo suena ese mes («un coro de aves, cerca»…), escrito bajo el botón.
  function setYearPlayback(playing, month = null, sound = "") {
    yearNow.textContent =
      playing && month !== null ? `♪ ${MONTHS[month]}: ${sound}` : "";
    yearButton.setAttribute("aria-pressed", String(playing));
    yearButton.classList.toggle("is-playing", playing);
    yearButton.querySelector("span").textContent = playing
      ? "Detener"
      : "Escuchar su año";
    yearButton
      .querySelector("path")
      .setAttribute("d", playing ? STOP_D : PLAY_D);
    const g = d3.select("#p-radial g.root");
    const needle = g.select("g.needle");
    g.selectAll("text.mlab").classed("now", (m) => m === month);
    g.selectAll("circle.dot").classed("now", (d) => d.m === month);
    if (month === null) {
      needle.interrupt().attr("visibility", "hidden");
      return;
    }
    const target = `rotate(${month * 30})`;
    if (needle.attr("visibility") === "hidden" || reduceMotion)
      needle.interrupt().attr("transform", target);
    else needle.transition().duration(260).attr("transform", target);
    needle.attr("visibility", "visible");
  }

  function updateMonth() {
    d3.selectAll("#p-radial text.mlab").classed(
      "current",
      (d) => d === state.month,
    );
  }
  return {
    renderSpecies,
    hideSpecies,
    updateMonth,
    setYearAvailable,
    setYearPlayback,
    setScenePlayback,
  };
}

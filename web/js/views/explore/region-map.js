/** Presenta el mapa y las estadísticas del ámbito seleccionado. */
import { d3 } from "../../shared/d3.js";
import { MONTHS, MON } from "../../shared/calendar.js";
import { CLASS_LABEL, TAB_LABEL } from "../../shared/classes.js";
import { fmt, pct } from "../../shared/format.js";
export function createRegionMap({
  data,
  state,
  RAMPS,
  rm,
  scopeName,
  shareMean,
  lowEffort,
  drawChile,
  renderLegend,
  selectScope,
}) {
  function mapScale() {
    const col = state.tab + 1;
    const max = d3.max(
      data.meta.regions.filter((r) => r.id),
      (r) => d3.max(data.regionMonth[String(r.id)], (x) => x[col]),
    );
    return d3
      .scaleSequential(d3.interpolateRgbBasis(RAMPS[state.tab]))
      .domain([0, max]);
  }

  function renderMap() {
    const m = state.month;
    const col = state.tab + 1;
    const scale = mapScale();
    document.getElementById("map-month").textContent = MONTHS[m];
    drawChile(document.getElementById("map"), {
      width: 170,
      height: 760,
      selected: state.scope || null,
      fill: (id) => scale(rm(id, m)[col]),
      onClick: (id) => selectScope(state.scope === id ? 0 : id),
      onHover: (id) => regionTip(id, m),
    }).attr(
      "aria-label",
      `Mapa de Chile: ${CLASS_LABEL[state.tab].toLowerCase()} presentes por región en ${MONTHS[m]}`,
    );
    renderLegend(document.getElementById("map-legend"), scale, {
      label: `${TAB_LABEL[state.tab]} · n.º de especies`,
      ticks: scale.ticks(4),
      format: (d) => fmt.format(d),
    });
  }

  function regionTip(id, m) {
    const [rich, res, est, inv, share, effort] = rm(id, m);
    const dev = share - shareMean(id);
    return (
      `<b>${scopeName(id)}</b> · ${MONTHS[m]}<br>` +
      `${rich} especies presentes<br>` +
      `<span class="sw c1"></span>${est} de verano · <span class="sw c2"></span>${inv} de invierno · <span class="sw c0"></span>${res} residentes<br>` +
      `Visitantes: <b>${pct(share)}</b> de la presencia (${dev >= 0 ? "+" : "−"}${pct(Math.abs(dev))} vs. su promedio anual)<br>` +
      `<span class="muted">Esfuerzo medio: ${fmt.format(effort)} días-especie${lowEffort(id) ? " · pocos registros, valores inestables" : ""}</span>`
    );
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

  return { renderMap, renderScopeStats, regionTip };
}

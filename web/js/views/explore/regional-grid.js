/** Presenta la comparación estacional región por mes. */
import { d3 } from "../../shared/d3.js";
import { AUSTRAL } from "../../shared/calendar.js";
export function createRegionalGrid({
  data,
  state,
  deviation,
  lowEffort,
  scopeName,
  rm,
  shareMean,
  selectScope,
  showTip,
  hideTip,
  regionTip,
  axis,
}) {
  const { W, LABEL, CW, seasonHeader, monthAxis, cursor, colX } = axis;
  function renderRegionGrid() {
    const order = AUSTRAL;
    const rowH = 16,
      top = 36;
    const ids = [0, ...data.meta.regions.filter((r) => r.id).map((r) => r.id)];
    const y = (i) => top + i * rowH + (i > 0 ? 6 : 0);
    const h = y(ids.length) + 4;
    const svg = d3
      .select("#region-grid")
      .selectAll("svg")
      .data([0])
      .join("svg")
      .attr("viewBox", `0 0 ${W} ${h}`)
      .attr(
        "aria-label",
        "Grilla: variación estacional de la proporción de visitantes por región (filas, norte a sur) y mes (columnas)",
      );
    seasonHeader(svg, order, 10, h);
    monthAxis(svg, order, 27);

    const rows = svg
      .selectAll("g.row")
      .data(ids)
      .join("g")
      .attr("class", "row")
      .attr("transform", (id, i) => `translate(0,${y(i)})`)
      .classed("selected", (id) => id === state.scope)
      .classed("low", (id) => lowEffort(id))
      .style("cursor", "pointer")
      .on("click", (e, id) => selectScope(id === state.scope ? 0 : id));
    rows
      .selectAll("text")
      .data((id) => [id])
      .join("text")
      .attr("x", LABEL - 8)
      .attr("y", rowH / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", "end")
      .attr("class", (id) => (id === 0 ? "label strong" : "label"))
      .text(
        (id) =>
          (id === 0 ? "Chile" : scopeName(id)) + (lowEffort(id) ? " *" : ""),
      );
    rows
      .selectAll("rect")
      .data((id) => order.map((m) => ({ id, m })))
      .join("rect")
      .attr("x", (d) => colX(order, d.m) + 1)
      .attr("width", CW - 2)
      .attr("height", rowH - 2)
      .attr("rx", 1.5)
      .attr("fill", (d) => deviation(rm(d.id, d.m)[4] - shareMean(d.id)))
      .on("pointermove", (e, d) => showTip(e, regionTip(d.id, d.m)))
      .on("pointerleave", hideTip);
    cursor(svg, order, top - 2, h);
  }

  return { renderRegionGrid };
}

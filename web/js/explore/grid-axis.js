/** Dibuja ejes estacionales y actualiza los cursores de las grillas. */
import { MON, seasonRuns } from "../shared/calendar.js";
export function createGridAxis({ state }) {
  // ---------------------------------------------------------------- grillas
  const W = 760,
    LABEL = 178,
    RIGHT = 74;
  const CW = (W - LABEL - RIGHT) / 12;
  const colX = (order, m) => LABEL + order.indexOf(m) * CW;

  function monthAxis(svg, order, y) {
    const g = svg.selectAll("g.axis").data([0]).join("g").attr("class", "axis");
    g.selectAll("text.mon")
      .data(order, (m) => m)
      .join("text")
      .attr("class", "mon")
      .attr("x", (m) => colX(order, m) + CW / 2)
      .attr("y", y)
      .attr("text-anchor", "middle")
      .classed("current", (m) => m === state.month)
      .text((m) => MON[m]);
  }

  function seasonHeader(svg, order, y, h) {
    const runs = seasonRuns(order);
    svg
      .selectAll("g.seasons")
      .data([0])
      .join("g")
      .attr("class", "seasons")
      .selectAll("text")
      .data(runs)
      .join("text")
      .attr("x", (s) => LABEL + ((s.from + s.to) / 2) * CW)
      .attr("y", y)
      .attr("text-anchor", "middle")
      .text((s) => s.label);
    svg
      .selectAll("g.season-lines")
      .data([0])
      .join("g")
      .attr("class", "season-lines")
      .selectAll("line")
      .data(runs.slice(1))
      .join("line")
      .attr("x1", (s) => LABEL + s.from * CW)
      .attr("x2", (s) => LABEL + s.from * CW)
      .attr("y1", y - 8)
      .attr("y2", h);
  }

  function cursor(svg, order, top, h) {
    svg.node().__order = order;
    svg
      .selectAll("rect.cursor")
      .data([0])
      .join("rect")
      .attr("class", "cursor")
      .raise()
      .attr("x", colX(order, state.month))
      .attr("y", top)
      .attr("width", CW)
      .attr("height", h - top)
      .attr("rx", 3);
  }

  function updateMonth() {
    d3.selectAll(".grid-chart svg").each(function () {
      if (this.__order)
        d3.select(this)
          .select("rect.cursor")
          .attr("x", colX(this.__order, state.month));
    });
    d3.selectAll("text.mon").classed("current", (d) => d === state.month);
  }
  return {
    updateMonth,
    W,
    LABEL,
    RIGHT,
    CW,
    colX,
    monthAxis,
    seasonHeader,
    cursor,
  };
}

/** Dibuja leyendas de escalas de color. */
import { d3 } from "./d3.js";

export function createLegend() {
  function renderLegend(el, scale, { label, ticks, format, width = 220 }) {
    const w = width,
      h = 34,
      x0 = 6,
      x1 = w - 10;
    const dom = scale.domain();
    const [a, b] = [dom[0], dom[dom.length - 1]];
    const x = d3.scaleLinear().domain([a, b]).range([x0, x1]);
    const svg = d3
      .select(el)
      .selectAll("svg")
      .data([0])
      .join("svg")
      .attr("viewBox", `0 0 ${w} ${h}`)
      .attr("width", w)
      .attr("height", h)
      .attr("aria-label", label);
    const id = `g${el.id}`;
    const grad = svg
      .selectAll("defs")
      .data([0])
      .join("defs")
      .selectAll("linearGradient")
      .data([0])
      .join("linearGradient")
      .attr("id", id);
    grad
      .selectAll("stop")
      .data(d3.range(0, 1.01, 0.1))
      .join("stop")
      .attr("offset", (t) => t)
      .attr("stop-color", (t) => scale(a + t * (b - a)));
    svg
      .selectAll("rect")
      .data([0])
      .join("rect")
      .attr("x", x0)
      .attr("y", 14)
      .attr("width", x1 - x0)
      .attr("height", 8)
      .attr("rx", 2)
      .attr("fill", `url(#${id})`);
    svg
      .selectAll("text.cap")
      .data([label])
      .join("text")
      .attr("class", "cap")
      .attr("x", x0)
      .attr("y", 10)
      .text((d) => d);
    svg
      .selectAll("text.tick")
      .data(ticks)
      .join("text")
      .attr("class", "tick")
      .attr("x", (d) => x(d))
      .attr("y", 32)
      .attr("text-anchor", (d, i) =>
        i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle",
      )
      .text(format);
  }

  return { renderLegend };
}

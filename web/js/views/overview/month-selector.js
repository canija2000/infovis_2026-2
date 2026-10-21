/** Una fila de botones de mes, de julio a junio, que controla un solo gráfico de la portada. */
import { d3 } from "../../shared/d3.js";
import { MONTHS, MON, AUSTRAL } from "../../shared/calendar.js";

export function createMonthSelector({ host, getMonth, onSelect }) {
  function draw() {
    d3.select(host)
      .selectAll("button")
      .data(AUSTRAL)
      .join("button")
      .attr("type", "button")
      .attr("class", "month")
      .attr("aria-label", (m) => MONTHS[m])
      .text((m) => MON[m])
      .on("click", (event, m) => onSelect(m));
    update();
  }
  function update() {
    d3.select(host)
      .selectAll("button")
      .attr("aria-pressed", (m) => String(m === getMonth()));
  }
  return { draw, update };
}

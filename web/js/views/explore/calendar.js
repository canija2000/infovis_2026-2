/** Presenta el calendario especie por mes. */
import { d3 } from "../../shared/d3.js";
import { MONTHS, AUSTRAL } from "../../shared/calendar.js";
import { CLASS_LABEL, CLASS_ONE } from "../../shared/classes.js";
import { freqText } from "../../shared/format.js";
import { selectRows, TAB_LIMIT } from "../../explore/calendar-selection.js";
export function createCalendar({
  data,
  state,
  classScale,
  scopeName,
  tabOrder,
  openSpecies,
  showTip,
  hideTip,
  renderLegend,
  axis,
}) {
  const { W, LABEL, RIGHT, CW, seasonHeader, monthAxis, cursor, colX } = axis;
  function renderCalendar() {
    document.getElementById("scope-name").textContent = scopeName(state.scope);
    const order = tabOrder();
    const color = classScale[state.tab];
    const { rows: list, total } = selectRows(data, state, tabOrder());
    const rowH = 19,
      top = 36;
    const h = Math.max(top + list.length * rowH + 6, 80);
    const svg = d3
      .select("#calendar")
      .selectAll("svg")
      .data([0])
      .join("svg")
      .attr("viewBox", `0 0 ${W} ${h}`)
      .attr(
        "aria-label",
        `Calendario de ${CLASS_LABEL[state.tab].toLowerCase()} por mes en ${scopeName(state.scope)}`,
      );
    seasonHeader(svg, order, 10, h);
    monthAxis(svg, order, 27);
    const barX = W - RIGHT + 10,
      barW = RIGHT - 44;
    const maxMean = d3.max(list, (r) => r.mean) || 1;
    svg
      .selectAll("text.bar-head")
      .data([0])
      .join("text")
      .attr("class", "bar-head")
      .attr("x", barX)
      .attr("y", 27)
      .text("días/mes");

    const rows = svg
      .selectAll("g.srow")
      .data(list, (r) => r.sid)
      .join((enter) => {
        const g = enter.append("g").attr("class", "srow");
        g.append("rect")
          .attr("class", "hit")
          .attr("x", 0)
          .attr("width", W)
          .attr("height", rowH);
        g.append("text")
          .attr("class", "label")
          .attr("x", LABEL - 8)
          .attr("y", rowH / 2)
          .attr("dy", "0.35em")
          .attr("text-anchor", "end");
        g.append("rect")
          .attr("class", "freq")
          .attr("y", 5)
          .attr("height", rowH - 10)
          .attr("rx", 1);
        g.append("text")
          .attr("class", "freq-val")
          .attr("y", rowH / 2)
          .attr("dy", "0.35em");
        return g;
      })
      .attr("transform", (r, i) => `translate(0,${top + i * rowH})`)
      .classed("selected", (r) => r.sid === state.species)
      .on("click", (e, r) => openSpecies(r.sid));
    rows.select("text.label").text((r) => data.species[r.sid].comName);
    // Frecuencia absoluta: el color es relativo al mes pico, esta barra dice qué tan común es la especie.
    rows
      .select("rect.freq")
      .attr("x", barX)
      .attr("width", (r) => Math.max(1, (r.mean / maxMean) * barW))
      .attr("class", `freq c${state.tab}`);
    rows
      .select("text.freq-val")
      .attr("x", barX + barW + 4)
      .text((r) =>
        ((r.mean / 1000) * 30.4)
          .toFixed(r.mean < 330 ? 1 : 0)
          .replace(".", ","),
      );
    rows
      .selectAll("rect.cell")
      .data((r) => order.map((m) => ({ r, m })))
      .join("rect")
      .attr("class", "cell")
      .attr("x", (c) => colX(order, c.m) + 1.5)
      .attr("y", 1.5)
      .attr("width", CW - 3)
      .attr("height", rowH - 3)
      .attr("rx", 2)
      .attr("fill", (c) => color(c.r.prof[c.m]))
      // Confianza: menos años con registro en ese mes → celda más tenue.
      .attr("fill-opacity", (c) => 0.3 + 0.7 * (c.r.years[c.m] / 8))
      .on("pointermove", (e, c) => {
        const s = data.species[c.r.sid];
        showTip(
          e,
          `<b>${s.comName}</b> <i>${s.sciName}</i><br>${MONTHS[c.m]} · ${scopeName(state.scope)}<br>` +
            `${freqText(c.r, c.m)}<br>Perfil: <b>${c.r.prof[c.m]} %</b> del mes pico (${MONTHS[c.r.peak]})<br>` +
            `<span class="muted">Con registro en ${c.r.years[c.m]} de 8 años · ${CLASS_ONE[c.r.cls]}</span>`,
        );
      })
      .on("pointerleave", hideTip);
    cursor(svg, order, top - 2, h);

    const more = document.getElementById("cal-more");
    more.hidden = total <= TAB_LIMIT[state.tab];
    more.textContent = state.expanded
      ? `Mostrar solo las ${TAB_LIMIT[state.tab]} más frecuentes`
      : `Mostrar las ${total} especies`;
    renderLegend(document.getElementById("cal-legend"), color, {
      label: "Presencia (% del mes pico)",
      ticks: [0, 50, 100],
      format: (d) => `${d} %`,
    });
    const sortText =
      state.tab === 0
        ? "<b>Orden:</b> por frecuencia (las más comunes arriba)."
        : `<b>Orden:</b> por llegada, es decir, el inicio del tramo más largo sobre el 50 % de su pico. <b>Eje:</b> ` +
          (order === AUSTRAL
            ? "julio → junio, con el verano al centro."
            : "enero → diciembre, con el invierno al centro.");
    document.getElementById("cal-note").innerHTML = list.length
      ? `<b>Se muestran</b> ${list.length} de ${total} especies (las más frecuentes). ` +
        `<b>Color:</b> presencia de cada mes respecto del mes pico de la especie (100 % = su mejor mes), corregida por el ` +
        `esfuerzo de registro de la región y el mes. <b>Tenue:</b> el mes tuvo registro en pocos de los 8 años (2017–2024). ` +
        `${sortText} <b>Barra:</b> días con registro al mes, promedio anual. Clic en una especie para ver su ficha.`
      : "No hay especies de esta clase en la región.";
  }

  return { renderCalendar };
}

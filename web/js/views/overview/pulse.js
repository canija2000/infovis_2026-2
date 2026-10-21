/** Presenta el pulso anual y su tabla accesible con los mismos conteos. */
import { d3 } from "../../shared/d3.js";
import { MONTHS, MON, AUSTRAL } from "../../shared/calendar.js";
const LABEL = ["Residentes", "Visitantes de verano", "Visitantes de invierno"];
const SHORT = ["residentes", "de verano", "de invierno"];
// Orden de apilado: residentes abajo, invierno al medio (banda delgada), verano arriba (la ola).
const STACK = [0, 2, 1];

export function createPulse({
  data,
  state,
  setMonth,
  showTip,
  hideTip,
  onDrawn,
}) {
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
    const total = d3.max(data.months, (m) => m[0] + m[1] + m[2]);
    const y = d3
      .scaleLinear()
      .domain([0, Math.ceil(total / 50) * 50])
      .range([h, 0]);
    // Series apiladas sobre el orden austral (i = posición, m = mes calendario).
    const rows = AUSTRAL.map((m, i) => ({ i, m, v: data.months[m] }));
    const layers = d3
      .stack()
      .keys(STACK)
      .value((d, k) => d.v[k])(rows);
    const area = d3
      .area()
      .x((d) => x(d.data.i))
      .y0((d) => y(d[0]))
      .y1((d) => y(d[1]))
      .curve(d3.curveMonotoneX);

    const svg = d3
      .select(host)
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", width)
      .attr("height", height)
      .attr("role", "img")
      .attr(
        "aria-label",
        "Gráfico de áreas apiladas: 214 especies residentes constantes todo el año; las visitantes de verano suben de 33 en junio a 106 en noviembre; las de invierno, entre 11 y 26.",
      );
    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Grilla y ejes recesivos.
    g.append("g")
      .attr("class", "grid")
      .selectAll("line")
      .data(y.ticks(4).filter((t) => t > 0))
      .join("line")
      .attr("x1", 0)
      .attr("x2", w)
      .attr("y1", y)
      .attr("y2", y);
    g.append("g")
      .attr("class", "axis")
      .call(d3.axisLeft(y).ticks(4).tickSize(0).tickPadding(8))
      .call((s) => s.select(".domain").remove());
    g.append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${h})`)
      .call(
        d3
          .axisBottom(x)
          .tickFormat((i) => MON[AUSTRAL[i]])
          .tickSize(0)
          .tickPadding(10),
      )
      .call((s) => s.select(".domain").remove());
    g.append("text")
      .attr("class", "axis-title")
      .attr("x", -margin.left)
      .attr("y", -12)
      .text("especies");

    g.append("g")
      .selectAll("path")
      .data(layers)
      .join("path")
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
        const t = lab
          .append("text")
          .attr("x", w + 10)
          .attr("y", cy)
          .attr("dy", "0.35em");
        t.append("tspan")
          .attr("class", "lab-n")
          .text(
            k === 0
              ? `${d3.max(data.months, (m) => m[0])}`
              : `${d3.min(data.months, (m) => m[k])}–${d3.max(data.months, (m) => m[k])}`,
          );
        t.append("tspan").attr("dx", 6).text(SHORT[k]);
      });
      // Anotación del pico de la ola de verano.
      const top = layers.find((l) => l.key === 1)[peak.i];
      g.append("text")
        .attr("class", "note")
        .attr("x", x(peak.i))
        .attr("y", y(top[1]) - 10)
        .attr("text-anchor", "middle")
        .text(`+${peak.v[1]} de verano en ${MONTHS[peak.m]}`);
    }

    // Cursor del mes actual y capa de hover (crosshair + tooltip; clic fija el mes).
    const cursor = g
      .append("line")
      .attr("class", "cursor")
      .attr("y1", 0)
      .attr("y2", h);
    const hover = g
      .append("line")
      .attr("class", "hover")
      .attr("y1", 0)
      .attr("y2", h)
      .style("opacity", 0);
    const step = x.step();
    g.append("g")
      .selectAll("rect")
      .data(rows)
      .join("rect")
      .attr("class", "hit")
      .attr("x", (d) => x(d.i) - step / 2)
      .attr("width", step)
      .attr("y", 0)
      .attr("height", h)
      .on("pointermove", (event, d) => {
        hover.attr("x1", x(d.i)).attr("x2", x(d.i)).style("opacity", 1);
        const sum = d.v[0] + d.v[1] + d.v[2];
        showTip(
          event,
          `<b>${MONTHS[d.m]}</b> · ${sum} especies<br>` +
            [1, 2, 0]
              .map(
                (k) =>
                  `<span class="tt-row"><i class="sw c${k}"></i>${LABEL[k]} <b>${d.v[k]}</b></span>`,
              )
              .join(""),
        );
      })
      .on("pointerleave", () => {
        hover.style("opacity", 0);
        hideTip();
      })
      .on("click", (event, d) => setMonth(d.m));

    Object.assign(pulse, { x, cursor });
    updatePulse();
    // Capas que se dibujan encima del gráfico (la barra y las aves del coro).
    if (onDrawn) onDrawn({ g, x, y, w, h });
  }
  function updatePulse() {
    if (!pulse.x) return;
    const i = AUSTRAL.indexOf(state.month);
    pulse.cursor.attr("x1", pulse.x(i)).attr("x2", pulse.x(i));
  }
  function drawTable() {
    const rows = AUSTRAL.map(
      (m) =>
        `<tr><th scope="row">${MONTHS[m]}</th>${data.months[m].map((v) => `<td>${v}</td>`).join("")}</tr>`,
    ).join("");
    document.getElementById("table").innerHTML =
      `<table><thead><tr><th scope="col">Mes</th>${LABEL.map((l) => `<th scope="col">${l}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  return { drawPulse, updatePulse, drawTable };
}

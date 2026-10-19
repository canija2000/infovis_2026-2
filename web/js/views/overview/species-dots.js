/** Presenta las especies como siluetas de ave que entran y salen de Chile. */
import { d3 } from "../../shared/d3.js";
import { MONTHS, MON } from "../../shared/calendar.js";

export function createSpeciesDots({ data, state, showTip, hideTip }) {
  const SHORT = ["residentes", "de verano", "de invierno"];
  const LABEL = [
    "Residentes",
    "Visitantes de verano",
    "Visitantes de invierno",
  ];
  const present = (s, m) => ((s.mask >> m) & 1) === 1;
  // Columnas por clase: las residentes (la clase más numerosa) usan una grilla más ancha,
  // para que todas las columnas tengan una altura parecida y cada silueta se lea como ave.
  const COLS = [14, 8, 8];
  // Silueta de ave posada mirando a la derecha, centrada en (0, 0); mide ~9.6 × 8.4 unidades.
  const BIRD =
    "M-4.6 2.6L-2.4 0.6C-2.2-1.6-0.2-2.4 1.2-2C1.2-4 4-4.4 4.2-2.4L5-2L4.1-1.5" +
    "C4 1 2.6 2.8 0.2 2.9L0.4 4.4L-0.2 4.4L-0.5 2.9C-1.6 2.8-2.3 2.4-2.9 2Z";
  const flock = {};
  function flockLayout(narrow) {
    const gap = narrow ? 12 : 16; // distancia entre centros
    const pad = gap * 1.25;
    const scale = (gap / 16) * 1.5;
    const total = [0, 1, 2].map(
      (c) => data.species.filter((s) => s.cls === c).length,
    );
    const rows = Math.max(...total.map((n, c) => Math.ceil(n / COLS[c])));
    const width = (c) => COLS[c] * gap;
    const base = 30 + pad + rows * gap; // línea base de las columnas dentro de Chile
    const x0 = 8 + pad;
    const x1 = x0 + width(0) + pad;
    const x2 = x1 + width(1) + pad;
    const boxRight = x2 + width(2) + pad;
    const outBase = narrow ? base + 60 + rows * gap : base;
    const ox1 = narrow ? x1 : boxRight + 2 * pad;
    const ox2 = narrow ? x2 : ox1 + width(1) + pad;
    return {
      gap,
      scale,
      w: narrow ? boxRight : ox2 + width(2) + pad,
      h: outBase + 50,
      box: { x: 8, y: 30, w: boxRight - 8, h: base + 12 - 30 },
      outLabel: narrow ? [20, base + 60] : [ox1, 22],
      groups: {
        in0: { x: x0, base, cls: 0 },
        in1: { x: x1, base, cls: 1 },
        in2: { x: x2, base, cls: 2 },
        out1: { x: ox1, base: outBase, cls: 1 },
        out2: { x: ox2, base: outBase, cls: 2 },
      },
    };
  }

  function drawFlock() {
    const host = document.getElementById("flock");
    host.innerHTML = "";
    const L = flockLayout(host.clientWidth < 560);
    flock.L = L;
    const svg = d3
      .select(host)
      .append("svg")
      .attr("viewBox", `0 0 ${L.w} ${L.h}`)
      .attr("width", "100%")
      .attr("role", "img")
      .attr("aria-labelledby", "flock-title");

    svg
      .append("rect")
      .attr("class", "country")
      .attr("x", L.box.x)
      .attr("y", L.box.y)
      .attr("width", L.box.w)
      .attr("height", L.box.h)
      .attr("rx", 10);
    svg
      .append("text")
      .attr("class", "zone")
      .attr("x", 20)
      .attr("y", 22)
      .text("EN CHILE");
    svg
      .append("text")
      .attr("class", "zone")
      .attr("x", L.outLabel[0])
      .attr("y", L.outLabel[1])
      .text("FUERA DE CHILE");

    // Rótulos de conteo bajo cada columna.
    flock.counts = svg
      .append("g")
      .selectAll("text")
      .data(Object.entries(L.groups))
      .join("text")
      .attr("class", "count")
      .attr("x", ([, gr]) => gr.x)
      .attr("y", ([, gr]) => gr.base + 34);

    // Las visitantes se ordenan por fecha de llegada: entran y salen en ese orden.
    flock.dots = svg
      .append("g")
      .selectAll("path")
      .data(data.species, (s) => s.sid)
      .join("path")
      .attr("class", (s) => `dot bird c${s.cls}`)
      .attr("d", BIRD)
      .on("pointermove", (event, s) => {
        const months = d3.range(12).filter((m) => present(s, m));
        const span =
          s.cls === 0 ? "todo el año" : months.map((m) => MON[m]).join(" ");
        showTip(event, `<b>${s.name}</b><br><i>${LABEL[s.cls]}</i><br>${span}`);
      })
      .on("pointerleave", hideTip);
    updateFlock(false);
  }

  function slot(group, k) {
    const { gap } = flock.L;
    const cols = COLS[group.cls];
    return [
      group.x + gap / 2 + (k % cols) * gap,
      group.base - gap / 2 - Math.floor(k / cols) * gap,
    ];
  }

  function updateFlock(animate = true) {
    if (!flock.dots) return;
    const m = state.month;
    const rank = { in0: 0, in1: 0, in2: 0, out1: 0, out2: 0 };
    const pos = new Map();
    // Residentes por sid (fijas); visitantes por fase (llegada), para que la columna crezca en orden.
    const order = [...data.species].sort(
      (a, b) => a.cls - b.cls || (a.cls ? a.phase - b.phase : a.sid - b.sid),
    );
    for (const s of order) {
      const key =
        s.cls === 0 ? "in0" : `${present(s, m) ? "in" : "out"}${s.cls}`;
      pos.set(s.sid, { key, xy: slot(flock.L.groups[key], rank[key]++) });
    }
    const dur = animate ? 900 : 0;
    flock.dots
      .classed("away", (s) => pos.get(s.sid).key.startsWith("out"))
      .transition()
      .duration(dur)
      .ease(d3.easeCubicInOut)
      .delay((s) => (animate && s.cls ? (s.phase / 12) * 500 : 0))
      .attr("transform", (s) => {
        const [x, y] = pos.get(s.sid).xy;
        return `translate(${x},${y}) scale(${flock.L.scale})`;
      });
    flock.counts.text(([key, gr]) => `${rank[key]} ${SHORT[gr.cls]}`);
    document.getElementById("flock-month").textContent = MONTHS[m];
  }

  return { drawFlock, updateFlock };
}

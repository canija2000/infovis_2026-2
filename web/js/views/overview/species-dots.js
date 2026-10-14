/** Presenta las especies como puntos que entran y salen de Chile. */
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
  const COLS = 12;
  const GAP = 10; // distancia entre centros
  const flock = {};
  function flockLayout(narrow) {
    const base = 270; // línea base de las columnas dentro de Chile
    const out = narrow
      ? { dx: 134, base: 500, label: [20, 330] }
      : { dx: 430, base, label: [446, 22] };
    return {
      w: narrow ? 430 : 720,
      h: narrow ? 540 : 330,
      box: { x: 8, y: 30, w: 418, h: base - 18 },
      outLabel: out.label,
      groups: {
        in0: { x: 24, base, cls: 0 },
        in1: { x: 158, base, cls: 1 },
        in2: { x: 292, base, cls: 2 },
        out1: { x: out.dx + 24, base: out.base, cls: 1 },
        out2: { x: out.dx + 158, base: out.base, cls: 2 },
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
      .selectAll("circle")
      .data(data.species, (s) => s.sid)
      .join("circle")
      .attr("class", (s) => `dot c${s.cls}`)
      .attr("r", 3.6)
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
    return [
      group.x + 4 + (k % COLS) * GAP,
      group.base - 4 - Math.floor(k / COLS) * GAP,
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
      .attr("cx", (s) => pos.get(s.sid).xy[0])
      .attr("cy", (s) => pos.get(s.sid).xy[1]);
    flock.counts.text(([key, gr]) => `${rank[key]} ${SHORT[gr.cls]}`);
    document.getElementById("flock-month").textContent = MONTHS[m];
  }

  return { drawFlock, updateFlock };
}

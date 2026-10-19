/** Presenta las especies como picaflores que vuelan entre Chile y fuera de Chile. */
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
  // Picaflor suspendido mirando a la derecha, centrado en (0, 0); mide ~10 × 10 unidades.
  // Partes de atrás hacia adelante; las alas aletean desde el hombro.
  const HUMMINGBIRD = [
    {
      part: "wing",
      opacity: 0.42,
      lag: 0.35,
      d: "M0.9-0.5C0.7-2.3 0-4-1-5.3C-1.2-3.6-0.9-1.9-0.3-0.1Z",
    },
    {
      part: "body",
      d:
        "M5.9-0.15L2.75-1.5C2.6-2.25 2.1-2.6 1.5-2.6C0.8-2.6 0.35-2.1 0.35-1.4" +
        "C0.35-0.9 0.1-0.4-0.4 0.2C-0.9 0.8-1.3 1.6-1.7 2.3L-3.6 3.5L-2.55 3.6" +
        "L-3 4.75L-2 4L-1.75 5L-1.15 2.95C0.2 2.6 1.4 1.6 2 0.4C2.3-0.1 2.6-0.5 2.8-0.85Z",
    },
    {
      part: "wing",
      opacity: 0.82,
      lag: 0,
      d: "M0.75-0.3C0-2.1-1.5-3.9-3.9-5C-3-3.4-2-1.9-0.6 0.3Z",
    },
    {
      part: "eye",
      d: "M1.45-1.7a0.27 0.27 0 1 0 0.54 0a0.27 0.27 0 1 0-0.54 0Z",
    },
  ];
  const SHOULDER = [0.1, 0];
  const WINGS = HUMMINGBIRD.filter((p) => p.part === "wing");
  const flock = {};
  const reducedMotion = () =>
    !!window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
      .attr("aria-labelledby", "flock-title")
      .classed("narrow", L.gap < 16);

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
    flock.keys = null;
    flock.dots = svg
      .append("g")
      .selectAll("g")
      .data(data.species, (s) => s.sid)
      .join("g")
      .attr("class", (s) => `dot bird c${s.cls}`)
      .each(function () {
        for (const p of HUMMINGBIRD)
          d3.select(this)
            .append("path")
            .attr("class", p.part)
            .attr("d", p.d)
            .attr("opacity", p.opacity ?? null);
      })
      .on("pointerenter", function () {
        flutter(this);
      })
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

  // Posición, inclinación (grados) y orientación (1 = mira a la derecha) de un picaflor.
  function place(node, x, y, tilt = 0, face = 1) {
    const k = flock.L.scale;
    node.__xy = [x, y];
    node.setAttribute(
      "transform",
      `translate(${x.toFixed(2)},${y.toFixed(2)}) rotate(${tilt.toFixed(1)}) scale(${(face * k).toFixed(3)},${k})`,
    );
  }
  // Aleteo: a los `ms` de vuelo, `hz` batidas por segundo; `amp` = 0 deja las alas quietas arriba.
  function flap(node, ms = 0, hz = 0, amp = 0) {
    d3.select(node)
      .selectAll("path.wing")
      .attr("transform", (_, i) => {
        if (amp <= 0) return null;
        const phase = 2 * Math.PI * ((hz * ms) / 1000 - WINGS[i].lag);
        const s = 1 - amp * 0.8 * (1 - Math.cos(phase)); // 1 = arriba, -0.6 = abajo
        const [x, y] = SHOULDER;
        return `translate(${x},${y}) scale(1,${s.toFixed(3)}) translate(${-x},${-y})`;
      });
  }
  // Al pasar el cursor, el picaflor aletea en su lugar.
  function flutter(node) {
    if (node.__moving || reducedMotion()) return;
    const [x, y] = node.__xy;
    d3.select(node)
      .transition("flutter")
      .duration(700)
      .ease(d3.easeLinear)
      .tween("flutter", function () {
        return (t) => {
          place(this, x, y - 1.8 * Math.sin(Math.PI * t));
          flap(this, t * 700, 8, Math.min(1, (1 - t) / 0.25));
        };
      })
      .on("end interrupt", function () {
        place(this, x, y);
        flap(this);
      });
  }
  // Vuelo en arco entre dos puntos: despega, se inclina con la pendiente y gira al aterrizar
  // si voló hacia la izquierda, para que en reposo todas miren al mismo lado.
  function flight(node, from, to, duration) {
    const [x0, y0] = from;
    const [x1, y1] = to;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    let px = -dy / dist;
    let py = dx / dist;
    // El arco sube; si el vuelo es vertical (pantallas angostas), se abre hacia la izquierda.
    if (py > 0 || (Math.abs(py) < 0.2 && px > 0)) [px, py] = [-px, -py];
    const lift = Math.min(150, dist * 0.36) + 4;
    const cx = (x0 + x1) / 2 + px * lift;
    const cy = (y0 + y1) / 2 + py * lift;
    const face = dx < -1 ? -1 : 1;
    return (t) => {
      const e = d3.easeCubicInOut(t);
      const x = (1 - e) * (1 - e) * x0 + 2 * (1 - e) * e * cx + e * e * x1;
      const y = (1 - e) * (1 - e) * y0 + 2 * (1 - e) * e * cy + e * e * y1;
      const tx = 2 * (1 - e) * (cx - x0) + 2 * e * (x1 - cx);
      const ty = 2 * (1 - e) * (cy - y0) + 2 * e * (y1 - cy);
      let fx = face;
      if (face < 0 && t < 0.12) fx = 1 - 2 * (t / 0.12);
      else if (face < 0 && t > 0.88) fx = -1 + 2 * ((t - 0.88) / 0.12);
      const dir = fx >= 0 ? 1 : -1;
      const pitch = Math.max(
        -28,
        Math.min(
          28,
          ((Math.atan2(ty, Math.abs(tx) + 1e-6) * 180) / Math.PI) * 0.55,
        ),
      );
      place(
        node,
        x,
        y,
        dir * pitch * Math.sin(Math.PI * t),
        Math.abs(fx) < 0.08 ? 0.08 * dir : fx,
      );
      flap(node, t * duration, 9, Math.min(1, t / 0.06, (1 - t) / 0.1));
    };
  }
  function slide(node, from, to) {
    return (t) => {
      const e = d3.easeCubicInOut(t);
      place(
        node,
        from[0] + (to[0] - from[0]) * e,
        from[1] + (to[1] - from[1]) * e,
      );
    };
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
    const previous = flock.keys;
    const still = !animate || !previous || reducedMotion();
    flock.dots.each(function (s) {
      const { key, xy } = pos.get(s.sid);
      const away = key.startsWith("out");
      const sel = d3.select(this);
      const target = this.__to;
      this.__to = xy;
      if (still) {
        sel.interrupt("move").interrupt("flutter");
        place(this, xy[0], xy[1]);
        flap(this);
        sel.classed("away", away);
        return;
      }
      // Ya va en camino al mismo lugar: que siga volando.
      if (this.__moving && target && target[0] === xy[0] && target[1] === xy[1])
        return;
      const from = this.__xy;
      if (Math.hypot(xy[0] - from[0], xy[1] - from[1]) < 0.5) {
        sel.classed("away", away);
        return;
      }
      // Solo vuelan las que cruzan la frontera; las que se reacomodan en su columna se deslizan.
      const migrates = previous.get(s.sid) !== key;
      const airborne = this.__moving && this.__started;
      sel.interrupt("move").interrupt("flutter");
      if (!migrates) sel.classed("away", away);
      const duration = migrates
        ? Math.min(
            1700,
            800 + Math.hypot(xy[0] - from[0], xy[1] - from[1]) * 1.6,
          )
        : 900;
      this.__moving = true;
      this.__started = false;
      sel
        .transition("move")
        .delay(airborne || !s.cls ? 0 : (s.phase / 12) * (migrates ? 700 : 500))
        .duration(duration)
        .ease(d3.easeLinear)
        .tween("move", function () {
          this.__started = true;
          return migrates
            ? flight(this, this.__xy, xy, duration)
            : slide(this, this.__xy, xy);
        })
        .on("end", function () {
          this.__moving = false;
          place(this, xy[0], xy[1]);
          flap(this);
          if (migrates) sel.classed("away", away);
        })
        .on("interrupt", function () {
          this.__moving = false;
          flap(this);
        });
    });
    flock.keys = new Map([...pos].map(([sid, { key }]) => [sid, key]));
    flock.counts.text(([key, gr]) => `${rank[key]} ${SHORT[gr.cls]}`);
    document.getElementById("flock-month").textContent = MONTHS[m];
  }

  return { drawFlock, updateFlock };
}

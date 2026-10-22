/**
 * «El coro de las estaciones» sobre «Especies presentes en Chile, mes a mes».
 *
 * Una barra recorre el gráfico de julio a junio. Donde corta el borde de cada banda se posa un ave
 * del color de su grupo. Cada ave dibujada es una voz que se oye: la posada en la curva y, a su
 * lado, las que se suman mientras cantan (más especies, más aves a la vez). Cada una abre el pico
 * con la envolvente de su propio canto, en el instante que se oye, y suelta una nota al comienzo
 * de cada sílaba. Las notas dicen cómo canta su grupo: corcheas sueltas y pequeñas para el arrullo
 * de las residentes, pares de corcheas para la ráfaga de chillidos del verano y una blanca para el
 * silbido largo del invierno. Las aves lejanas se ven más chicas y más tenues.
 *
 * La vista no carga datos ni crea audio: recibe en render() la posición, los bordes y los conteos
 * de la curva, y lo que el motor dice que suena ave por ave.
 */
import { d3 } from "../../shared/d3.js";
import { MONTHS } from "../../shared/calendar.js";

const SHORT = ["residentes", "de verano", "de invierno"];
// Orden de dibujo (de atrás hacia adelante) y lado de cada grupo respecto de la barra
// (el mismo lado del estéreo donde suena).
const ORDER = [0, 2, 1];
const SIDE = { 0: -1, 1: -1, 2: 1 };
// Tamaño del ave y distancia a la barra (px); en pantallas angostas, más chicas.
const SIZES = {
  wide: { scale: 2.1, offset: 27 },
  narrow: { scale: 1.45, offset: 19 },
};
// Dónde se ubican las aves acompañantes respecto del ave posada (px con el ave a escala 2,1):
// hacia afuera de la barra; las de verano, hacia arriba, y las residentes, hacia la banda verde.
const FLOCK = {
  0: [[0, 0]],
  1: [
    [0, 0],
    [-36, -10],
    [-70, -2],
    [-50, -38],
  ],
  2: [
    [0, 0],
    [36, -10],
    [70, -2],
  ],
};
const COMPANION = 0.8; // tamaño de una acompañante respecto del ave posada
// Ave posada mirando hacia adelante en el año (derecha), centrada en el cuerpo; ~22 × 16 unidades.
const HEAD = [5.4, -5.4];
const BIRD = {
  tail: "M-6.2,1.2 L-12.6,-1.6 L-12.2,1.4 L-11.4,3.6 Z",
  body: "M-7,1.6 C-7,-2.6 -3,-5.2 1.6,-4.9 C5.2,-4.6 7.2,-2.4 7.2,0.6 C7.2,4.1 3.6,6.1 -0.4,6.1 C-4,6.1 -7,4.6 -7,1.6 Z",
  wing: "M3.8,-0.6 C2.4,-3.2 -2.6,-3.4 -5.2,-1 C-6.6,0.4 -8.4,2.4 -9.6,3.6 C-6.2,3.4 -2.2,2.8 0.6,1.8 C2.4,1.2 3.6,0.4 3.8,-0.6 Z",
  legs: "M-1,5.6 L-1.6,8.8 M1.8,5.6 L1.8,8.8",
  head: "M-3.7,0 a3.7,3.7 0 1,0 7.4,0 a3.7,3.7 0 1,0 -7.4,0 Z",
  upper: "M3,-1 L7.6,0.1 L3.2,0.7 Z",
  lower: "M3.2,0.5 L6.8,0.8 L3,1.7 Z",
  eye: "M0.6,-0.8 a0.8,0.8 0 1,0 1.6,0 a0.8,0.8 0 1,0 -1.6,0 Z",
};
const BEAK_TIP = [HEAD[0] + 7.4, HEAD[1] + 0.3];
// Notas (unidades de ~9 px de alto, la cabeza en el origen).
const HEAD_NOTE =
  "M-2.3,0.2 C-2.3,-1.2 -0.4,-1.9 1.2,-1.5 C2.3,-1.2 2.6,0.1 2,0.8 C1,1.8 -2.3,1.6 -2.3,0.2 Z";
const NOTE = {
  // corchea: una sílaba suelta (el arrullo)
  pulse:
    HEAD_NOTE +
    "M1.6,-0.6 L1.6,-8.6 L2.6,-8.6 C3,-6.6 5.6,-6 5.2,-3.2 C4.8,-4.6 3.6,-5.4 2.6,-5.6 L2.6,-0.6 Z",
  // dos corcheas unidas: sílabas rápidas (la ráfaga de chillidos)
  burst:
    HEAD_NOTE +
    "M4.2,-0.8 C4.2,-2.2 6.1,-2.9 7.7,-2.5 C8.8,-2.2 9.1,-0.9 8.5,-0.2 C7.5,0.8 4.2,0.6 4.2,-0.8 Z" +
    "M1.6,-0.6 L1.6,-8.6 L9.1,-9.8 L9.1,-1.6 L8.1,-1.6 L8.1,-7.3 L2.6,-6.4 L2.6,-0.6 Z",
  // blanca (cabeza hueca): una nota larga y sostenida (el silbido)
  long:
    "M-2.6,0.2 C-2.6,-1.4 -0.4,-2.1 1.4,-1.7 C2.6,-1.4 2.9,0.1 2.3,0.9 C1.2,2 -2.6,1.8 -2.6,0.2 Z" +
    "M-1.5,0.5 C-1.2,1 1.1,0.2 1.4,-0.6 C1.2,-1 -1.1,-0.3 -1.5,0.5 Z" +
    "M1.8,-0.5 L1.8,-9.4 L2.8,-9.4 L2.8,-0.5 Z",
};
const MAX_NOTES = 60;

export function createPulseChorus({
  birds: flockSize,
  notes: noteStyle,
  onToggle,
  onPreview,
  onScrubStart,
  onScrub,
  onScrubEnd,
}) {
  const button = document.getElementById("chorus-play");
  const label = button ? button.querySelector(".chorus-label") : null;
  const now = document.getElementById("chorus-now");
  const reducedMotion = () =>
    !!window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (button) button.addEventListener("click", () => onToggle());
  // «Así suena»: un botón por grupo toca un canto suelto de su ave.
  const legend = [...document.querySelectorAll(".chorus-legend [data-layer]")];
  legend.forEach((b) =>
    b.addEventListener("click", () => onPreview(Number(b.dataset.layer))),
  );

  let geom = null;
  let birdScale = SIZES.wide.scale;
  let barGap = SIZES.wide.offset;
  let layer = null; // nodos del gráfico actual (se rehacen al redibujar)
  let notes = []; // { node, x, y, vx, vy, age, life, size, sway, base }
  let lastMonth = null;

  // geom: { g, x, y, w, h } del gráfico recién dibujado. Las capas nuevas van encima de las bandas.
  function attach(next) {
    geom = next;
    ({ scale: birdScale, offset: barGap } =
      geom.w < 560 ? SIZES.narrow : SIZES.wide);
    notes = [];
    lastMonth = null;
    // La barra reemplaza al cursor del mes: el contenedor lo oculta.
    geom.g.node().ownerSVGElement.parentNode.classList.add("has-chorus");
    const root = geom.g.append("g").attr("class", "chorus");
    const bar = root.append("g").attr("class", "chorus-bar");
    bar
      .append("line")
      .attr("class", "chorus-line")
      .attr("y1", -6)
      .attr("y2", geom.h);
    const spans = bar
      .append("g")
      .selectAll("line")
      .data(ORDER)
      .join("line")
      .attr("class", (k) => `chorus-span c${k}`);
    // Tirador: se arrastra la barra para escuchar cualquier momento del año.
    const handle = bar.append("g").attr("class", "chorus-handle");
    handle
      .append("rect")
      .attr("class", "chorus-grab")
      .attr("x", -10)
      .attr("y", -18)
      .attr("width", 20)
      .attr("height", geom.h + 18);
    handle
      .append("circle")
      .attr("class", "chorus-knob")
      .attr("cy", -10)
      .attr("r", 6.5);
    handle
      .attr("tabindex", 0)
      .attr("role", "slider")
      .attr(
        "aria-label",
        "Momento del año que suena. Arrastra para escuchar otro.",
      )
      .attr("aria-valuemin", 0)
      .attr("aria-valuemax", 11);
    bindDrag(handle.node());

    // Una bandada por grupo; el ave 0 está siempre posada en la curva.
    const flocks = root
      .append("g")
      .attr("class", "chorus-birds")
      .selectAll("g")
      .data(ORDER)
      .join("g")
      .attr("class", (k) => `chorus-flock c${k}`);
    flocks
      .selectAll("g.chorus-bird")
      .data((k) => d3.range(flockSize[k] || 1).map((slot) => ({ k, slot })))
      .join("g")
      .attr("class", (d) => `chorus-bird c${d.k}${d.slot ? " companion" : ""}`)
      .each(function () {
        const node = d3.select(this);
        node.append("circle").attr("class", "halo").attr("r", 12);
        const bird = node.append("g").attr("class", "figure");
        bird.append("path").attr("class", "legs").attr("d", BIRD.legs);
        bird.append("path").attr("class", "tail").attr("d", BIRD.tail);
        bird.append("path").attr("class", "body").attr("d", BIRD.body);
        bird.append("path").attr("class", "wing").attr("d", BIRD.wing);
        const head = bird.append("g").attr("class", "head");
        head.append("path").attr("class", "lower").attr("d", BIRD.lower);
        head.append("path").attr("class", "upper").attr("d", BIRD.upper);
        head.append("path").attr("class", "skull").attr("d", BIRD.head);
        head.append("path").attr("class", "eye").attr("d", BIRD.eye);
      });
    // Cuántas especies hay: sobre el ave de verano y la de invierno; bajo la residente.
    flocks
      .append("text")
      .attr("class", "chorus-count")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em");
    const noteLayer = root.append("g").attr("class", "chorus-notes");
    layer = { root, spans, handle, flocks, noteLayer };
  }

  function bindDrag(node) {
    const toPosition = (event) => {
      const [px] = d3.pointer(event, geom.g.node());
      const x0 = geom.x(0);
      return Math.min(11, Math.max(0, (px - x0) / geom.x.step()));
    };
    node.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      node.setPointerCapture(event.pointerId);
      node.classList.add("dragging");
      onScrubStart(toPosition(event));
    });
    node.addEventListener("pointermove", (event) => {
      if (node.hasPointerCapture(event.pointerId)) onScrub(toPosition(event));
    });
    const end = (event) => {
      if (!node.hasPointerCapture(event.pointerId)) return;
      node.releasePointerCapture(event.pointerId);
      node.classList.remove("dragging");
      onScrubEnd();
    };
    node.addEventListener("pointerup", end);
    node.addEventListener("pointercancel", end);
    node.addEventListener("keydown", (event) => {
      const step = { ArrowRight: 0.25, ArrowLeft: -0.25 }[event.key];
      if (!step) return;
      event.preventDefault();
      onScrubStart(null, step);
      onScrubEnd();
    });
  }

  /**
   * frame: { p, edges, counts, month, monthCounts (conteos publicados de ese mes), dt,
   * active (si el coro está sonando), meters: por grupo, un arreglo con lo que canta cada ave
   * ({ visible, open, onset, distance } o null), o null si no suena }.
   */
  function render(frame) {
    if (!geom || !layer) return;
    const { x, y } = geom;
    const bx = x(0) + frame.p * x.step();
    const unit = birdScale / SIZES.wide.scale;
    const motion = !reducedMotion();
    layer.root.classed("is-active", !!frame.active);
    geom.g
      .node()
      .ownerSVGElement.parentNode.classList.toggle("chorus-on", !!frame.active);
    layer.root.select(".chorus-bar").attr("transform", `translate(${bx},0)`);
    layer.handle.attr("aria-valuenow", frame.p.toFixed(2));
    layer.handle.attr("aria-valuetext", MONTHS[frame.month]);
    // Grosor de cada banda en la barra: un trazo del color de su grupo, de borde a borde.
    layer.spans
      .attr("y1", (k) => y(frame.edges[ORDER.indexOf(k)]) - 1.5)
      .attr("y2", (k) => y(frame.edges[ORDER.indexOf(k) + 1]) + 1.5);

    layer.flocks.each(function (k) {
      const top = frame.edges[ORDER.indexOf(k) + 1];
      const cx = bx + SIDE[k] * barGap;
      const cy = y(top) - 3;
      const flock = d3.select(this);
      const voices = frame.meters ? frame.meters[k] : null;
      flock.selectAll("g.chorus-bird").each(function ({ slot }) {
        const voice = voices ? voices[slot] : null;
        const open = voice ? voice.open : 0;
        const distance = voice ? voice.distance : 0;
        // El ave posada siempre se ve; las acompañantes, solo mientras cantan.
        const shown = slot === 0 ? 1 : voice ? voice.visible : 0;
        const [ox, oy] = FLOCK[k][slot] || [0, 0];
        const size = birdScale * (slot ? COMPANION : 1) * (1 - 0.25 * distance);
        const bob = motion ? -1.2 * open : 0;
        const bxp = cx + ox * unit;
        const byp = cy + oy * unit + (slot ? (1 - shown) * 6 : 0) + bob;
        const node = d3.select(this);
        node
          .classed("singing", open > 0.08)
          .attr("opacity", (shown * (slot ? 1 - 0.4 * distance : 1)).toFixed(3))
          .attr("transform", `translate(${bxp.toFixed(1)},${byp.toFixed(1)})`);
        node
          .select(".figure")
          .attr("transform", `scale(${size},${size * (1 + 0.05 * open)})`);
        // Cantar: la cabeza se levanta y el pico se abre con el nivel de su propio canto.
        node
          .select(".head")
          .attr(
            "transform",
            `translate(${HEAD[0]},${HEAD[1]}) rotate(${(-14 * open).toFixed(1)})`,
          );
        node
          .select(".upper")
          .attr("transform", `rotate(${(-9 * open).toFixed(1)},3.1,0)`);
        node
          .select(".lower")
          .attr("transform", `rotate(${(34 * open).toFixed(1)},3.1,0.6)`);
        node
          .select(".halo")
          .attr("r", 8 + 6 * open)
          .attr("opacity", (0.3 * open * shown).toFixed(3));
        if (voice && voice.onset && motion && shown > 0.5)
          spawn(k, bxp, byp, size, open, voice);
      });
      const above = k !== 0;
      flock
        .select(".chorus-count")
        .attr("x", cx + 1.5 * unit)
        .attr("y", cy + (above ? -30 : 28) * unit)
        .text(Math.round(frame.counts[k]));
    });
    if (notes.length) step(frame.dt || 0);
    const month = frame.month;
    if (now && month !== lastMonth) {
      lastMonth = month;
      // Los conteos publicados del mes (las aves muestran los de la curva entre meses).
      const c = frame.monthCounts;
      now.innerHTML =
        `<b>${MONTHS[month]}</b>` +
        [1, 2, 0]
          .map(
            (k) => ` <span class="v c${k}"><b>${c[k]}</b> ${SHORT[k]}</span>`,
          )
          .join("");
    }
  }

  // Una nota sale del pico al comenzar una sílaba: su forma dice cómo canta el grupo y su tamaño,
  // qué tan fuerte; las aves lejanas sueltan notas más chicas y tenues.
  function spawn(k, cx, cy, size, open, voice) {
    if (notes.length >= MAX_NOTES) notes.shift().node.remove();
    const style = noteStyle[k] || "pulse";
    const strength = Math.min(1, voice.onset);
    const near = 1 - 0.6 * voice.distance;
    const node = layer.noteLayer
      .append("path")
      .attr("class", `sing-note c${k}`)
      .attr("d", NOTE[style])
      .node();
    const dir = SIDE[k];
    notes.push({
      node,
      x: cx + BEAK_TIP[0] * size,
      y: cy + (BEAK_TIP[1] - 6 * open) * size,
      vx: k === 0 ? (Math.random() - 0.5) * 8 : dir * (8 + Math.random() * 12),
      vy: -(style === "long" ? 18 : 28) - Math.random() * 12,
      age: 0,
      life: style === "long" ? 1.8 : 1.3,
      size: (size / SIZES.wide.scale) * (0.85 + 0.6 * strength) * near,
      sway: Math.random() * Math.PI * 2,
      base: 0.95 * (0.55 + 0.45 * near),
    });
  }

  function step(dt) {
    notes = notes.filter((n) => {
      n.age += dt;
      if (n.age >= n.life) {
        n.node.remove();
        return false;
      }
      n.x += n.vx * dt;
      n.y += n.vy * dt;
      const t = n.age / n.life;
      const wobble = Math.sin(n.sway + n.age * 6) * 2.2;
      const grow = 0.6 + 0.4 * Math.min(1, n.age / 0.15);
      const opacity = n.base * (t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9);
      n.node.setAttribute(
        "transform",
        `translate(${(n.x + wobble).toFixed(1)},${n.y.toFixed(1)}) scale(${(n.size * grow * 1.8).toFixed(2)})`,
      );
      n.node.setAttribute("opacity", Math.max(0, opacity).toFixed(3));
      return true;
    });
  }

  function clearNotes() {
    notes.forEach((n) => n.node.remove());
    notes = [];
  }

  // status: "idle" | "loading" | "playing" | "error"
  function setStatus(status) {
    if (!button) return;
    const playing = status === "playing";
    button.classList.toggle("is-playing", playing);
    button.setAttribute("aria-pressed", String(playing));
    button.setAttribute("aria-busy", String(status === "loading"));
    if (label)
      label.textContent =
        status === "loading"
          ? "Cargando cantos…"
          : playing
            ? "Pausar"
            : status === "error"
              ? "No se pudo reproducir"
              : "Escuchar el año";
    button.querySelector(".i-play").toggleAttribute("hidden", playing);
    button.querySelector(".i-pause").toggleAttribute("hidden", !playing);
    if (!playing) clearNotes();
  }

  // Qué botón de «Así suena» está sonando (null: ninguno).
  function setPreview(k) {
    legend.forEach((b) =>
      b.setAttribute("aria-pressed", String(Number(b.dataset.layer) === k)),
    );
  }

  return { attach, render, setStatus, setPreview };
}

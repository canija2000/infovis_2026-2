/**
 * «El coro de las estaciones» sobre «Especies presentes en Chile, mes a mes».
 *
 * Una barra recorre el gráfico de julio a junio. Donde corta el borde de cada banda se posa un ave
 * del color de su grupo; cuando su grupo suena, el ave canta: abre el pico al ritmo del sonido real
 * y suelta notas. Las notas cambian con el canto: más grandes cuanto más fuerte, en pares cuando las
 * sílabas llegan seguidas (un gorjeo), sueltas cuando son lentas (un silbido); las de las residentes,
 * pequeñas y tenues, como el canto lejano que se oye. Junto a cada ave, cuántas especies hay.
 *
 * La vista no carga datos ni crea audio: recibe en render() la posición, los bordes y los conteos
 * de la curva, y lo que mide el motor sonoro en cada capa.
 */
import { d3 } from "../../shared/d3.js";
import { MONTHS } from "../../shared/calendar.js";

const SHORT = ["residentes", "de verano", "de invierno"];
// Orden de dibujo (de atrás hacia adelante) y lado de cada ave respecto de la barra
// (el mismo lado del estéreo donde suena su grupo).
const ORDER = [0, 2, 1];
const SIDE = { 0: -1, 1: -1, 2: 1 };
// Tamaño del ave y distancia a la barra (px); en pantallas angostas, más chicas.
const SIZES = {
  wide: { scale: 2.1, offset: 27 },
  narrow: { scale: 1.45, offset: 19 },
};
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
const NOTE = {
  single:
    "M-2.3,0.2 C-2.3,-1.2 -0.4,-1.9 1.2,-1.5 C2.3,-1.2 2.6,0.1 2,0.8 C1,1.8 -2.3,1.6 -2.3,0.2 Z" +
    "M1.6,-0.6 L1.6,-8.6 L2.6,-8.6 C3,-6.6 5.6,-6 5.2,-3.2 C4.8,-4.6 3.6,-5.4 2.6,-5.6 L2.6,-0.6 Z",
  pair:
    "M-2.3,0.2 C-2.3,-1.2 -0.4,-1.9 1.2,-1.5 C2.3,-1.2 2.6,0.1 2,0.8 C1,1.8 -2.3,1.6 -2.3,0.2 Z" +
    "M4.2,-0.8 C4.2,-2.2 6.1,-2.9 7.7,-2.5 C8.8,-2.2 9.1,-0.9 8.5,-0.2 C7.5,0.8 4.2,0.6 4.2,-0.8 Z" +
    "M1.6,-0.6 L1.6,-8.6 L9.1,-9.8 L9.1,-1.6 L8.1,-1.6 L8.1,-7.3 L2.6,-6.4 L2.6,-0.6 Z",
};
const MAX_NOTES = 48;

export function createPulseChorus({
  onToggle,
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

  let geom = null;
  let birdScale = SIZES.wide.scale;
  let barGap = SIZES.wide.offset;
  let layer = null; // nodos del gráfico actual (se rehacen al redibujar)
  let notes = []; // { node, k, x, y, vx, vy, age, life, size, sway, base }
  const lastOnset = [-Infinity, -Infinity, -Infinity];
  let clock = 0;
  let lastMonth = null;

  // geom: { g, x, y, h } del gráfico recién dibujado. Las capas nuevas van encima de las bandas.
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

    const birds = root
      .append("g")
      .attr("class", "chorus-birds")
      .selectAll("g")
      .data(ORDER)
      .join("g")
      .attr("class", (k) => `chorus-bird c${k}`);
    birds.append("circle").attr("class", "halo").attr("r", 12);
    const bird = birds.append("g").attr("class", "figure");
    bird.append("path").attr("class", "legs").attr("d", BIRD.legs);
    bird.append("path").attr("class", "tail").attr("d", BIRD.tail);
    bird.append("path").attr("class", "body").attr("d", BIRD.body);
    bird.append("path").attr("class", "wing").attr("d", BIRD.wing);
    const head = bird.append("g").attr("class", "head");
    head.append("path").attr("class", "lower").attr("d", BIRD.lower);
    head.append("path").attr("class", "upper").attr("d", BIRD.upper);
    head.append("path").attr("class", "skull").attr("d", BIRD.head);
    head.append("path").attr("class", "eye").attr("d", BIRD.eye);
    birds
      .append("text")
      .attr("class", "chorus-count")
      .attr("dy", "0.35em")
      .attr("x", (k) => (SIDE[k] < 0 ? -14 : 14) * birdScale)
      .attr("text-anchor", (k) => (SIDE[k] < 0 ? "end" : "start"));
    const noteLayer = root.append("g").attr("class", "chorus-notes");
    layer = { root, spans, handle, birds, noteLayer };
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
   * frame: { p, edges, counts, meters (por capa: { open, onset, strength } o null), month,
   * monthCounts (conteos publicados de ese mes), dt, active (si el coro está sonando) }.
   */
  function render(frame) {
    if (!geom || !layer) return;
    const { x, y } = geom;
    const bx = x(0) + frame.p * x.step();
    clock += frame.dt || 0;
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

    const motion = !reducedMotion();
    layer.birds.each(function (k) {
      const meter = frame.meters ? frame.meters[k] : null;
      const open = meter ? meter.open : 0;
      const top = frame.edges[ORDER.indexOf(k) + 1];
      const cx = bx + SIDE[k] * barGap;
      const cy = y(top) - 3;
      const bob = motion ? -1.2 * open : 0;
      const node = d3.select(this);
      node
        .classed("singing", open > 0.08)
        .attr(
          "transform",
          `translate(${cx.toFixed(1)},${(cy + bob).toFixed(1)})`,
        );
      node
        .select(".figure")
        .attr(
          "transform",
          `scale(${birdScale},${birdScale * (1 + 0.05 * open)})`,
        );
      // Cantar: la cabeza se levanta y el pico se abre con el nivel del sonido.
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
        .attr("transform", `rotate(${(32 * open).toFixed(1)},3.1,0.6)`);
      node
        .select(".halo")
        .attr("r", 10 + 6 * open)
        .attr("opacity", (0.28 * open).toFixed(3));
      node.select(".chorus-count").text(Math.round(frame.counts[k]));
      if (meter && meter.onset && motion) spawn(k, cx, cy + bob, meter, open);
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

  // Una nota sale del pico. Su forma y tamaño dicen cómo es el canto en ese instante.
  function spawn(k, cx, cy, meter, open) {
    if (notes.length >= MAX_NOTES) notes.shift().node.remove();
    const fast = clock - lastOnset[k] < 0.22;
    lastOnset[k] = clock;
    const far = k === 0;
    const dir = SIDE[k];
    const tipX = cx + BEAK_TIP[0] * birdScale;
    const tipY = cy + (BEAK_TIP[1] - 8 * open) * birdScale;
    const size = (far ? 0.6 : 0.75) + (far ? 0.25 : 0.55) * meter.strength;
    const node = layer.noteLayer
      .append("path")
      .attr("class", `sing-note c${k}`)
      .attr("d", fast && !far ? NOTE.pair : NOTE.single)
      .node();
    notes.push({
      node,
      k,
      x: tipX,
      y: tipY,
      // Las notas se alejan de la barra hacia el lado de su ave; las residentes suben casi rectas.
      vx: far ? (Math.random() - 0.5) * 8 : dir * (6 + Math.random() * 12),
      vy: -(far ? 16 : 26) - Math.random() * 14,
      age: 0,
      life: far ? 2 : 1.4,
      size,
      sway: Math.random() * Math.PI * 2,
      base: far ? 0.5 : 0.95,
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
      const grow = 0.6 + 0.4 * Math.min(1, n.age / 0.18);
      const opacity = n.base * (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85);
      n.node.setAttribute(
        "transform",
        `translate(${(n.x + wobble).toFixed(1)},${n.y.toFixed(1)}) scale(${(n.size * grow * 1.7).toFixed(2)})`,
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

  return { attach, render, setStatus };
}

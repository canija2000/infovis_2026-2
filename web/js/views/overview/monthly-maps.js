/** Presenta los doce mapas nacionales en modo zonas o regiones. */
import { d3 } from "../../shared/d3.js";
import { MONTHS } from "../../shared/calendar.js";
import { css } from "../../shared/css.js";
export function createMonthlyMaps({
  maps,
  state,
  buildStrip,
  updateMaps,
  onMode,
  showTip,
  hideTip,
}) {
  const CHILE_FRAME = {
    type: "MultiPoint",
    coordinates: [
      [-75.8, -17.4],
      [-66.3, -56],
    ],
  };
  function drawMaps() {
    if (!maps.geo) return;
    const host = document.getElementById("maps");
    const fitAll = host.clientWidth >= 760;
    const cols = fitAll ? 12 : host.clientWidth < 560 ? 3 : 6;
    const cardW = Math.floor(host.clientWidth / cols);
    const padX = 8;
    const w = cardW - padX;
    const h = Math.min(Math.round(w * 4.1), 420);
    const nav = document.getElementById("maps-nav");
    if (nav) nav.hidden = fitAll;
    const projection = d3.geoMercator().fitSize([w, h], CHILE_FRAME);
    const path = d3.geoPath(projection);
    const zones = state.mode === "zones";
    let color;
    let radius = null;
    if (zones) {
      const sat = maps.grid.saturation;
      color = d3
        .scaleDiverging(
          d3.interpolateRgbBasis([css("--c2"), css("--ink-3"), css("--c1")]),
        )
        .domain([-sat, 0, sat])
        .clamp(true);
      const k = Math.min(1.2, h / 420);
      const maxTotal = d3.max(maps.months, (rows) =>
        d3.max(rows, (d) => d.total),
      );
      radius = d3
        .scaleSqrt()
        .domain([maps.grid.minDays, maxTotal])
        .range([1.15 * k, 3.6 * k])
        .clamp(true);
    } else {
      color = d3
        .scaleDiverging(
          d3.interpolateRgbBasis([css("--c2"), css("--empty"), css("--c1")]),
        )
        .domain([-1, 0, 1]);
    }
    const cards = buildStrip(
      "maps",
      cardW,
      h,
      (svg, m) => {
        if (zones) {
          svg.append("path").attr("class", "land").attr("d", path(maps.land));
          svg
            .append("g")
            .selectAll("circle")
            .data(maps.months[m])
            .join("circle")
            .attr("class", "cell")
            .attr("cx", (d) => projection([d.cell[0], d.cell[1]])[0])
            .attr("cy", (d) => projection([d.cell[0], d.cell[1]])[1])
            .attr("r", (d) => radius(d.total))
            .attr("fill", (d) => color(d.wave))
            .on("pointermove", (event, d) => zoneTip(event, d, m))
            .on("pointerleave", hideTip);
        } else {
          svg
            .selectAll("path")
            .data(maps.land.features)
            .join("path")
            .attr(
              "class",
              (f) =>
                `region${maps.regionWave.get(f.properties.id)?.low ? " low" : ""}`,
            )
            .attr("d", path)
            .attr("fill", (f) => {
              const r = maps.regionWave.get(f.properties.id);
              return r ? color(r.index[m]) : "none";
            })
            .on("pointermove", (event, f) =>
              regionTip(event, f.properties.id, m),
            )
            .on("pointerleave", hideTip);
        }
      },
      "Mapa de Chile",
      padX,
      cardW < 92,
    );
    cards
      .append("p")
      .attr("class", "map-n")
      .text((m) => (zones ? `${maps.months[m].length} zonas` : ""));
    drawMapsLegend(color, zones ? maps.grid.saturation : 1, radius);
    document.getElementById("maps-note").textContent = zones
      ? "Zonas con ≥ 50 especie-días en el mes y registros en ≥ 3 de los 8 años (GBIF 2017–2024). Sin punto: no hay datos suficientes ese mes, no que no haya aves."
      : "Contorno punteado: región con pocos registros (< 400 días-especie al mes), valores inestables.";
    document.getElementById("maps-lede").textContent = zones
      ? "Un punto por zona de unos 22 km donde se observan aves. Naranja: ese mes llegan más visitantes de verano de lo habitual en su región; azul, más de invierno. El tamaño indica cuánto se observa allí."
      : "Una región, un color. Cada región comparada con su propio año: naranja, el mes en que más pesan sus visitantes de verano; azul, los de invierno.";
    updateMaps(false);
  }

  function zoneTip(event, d, m) {
    const v = d.wave;
    const verdict =
      v > 0.03
        ? "más visitantes de verano que lo habitual en la región"
        : v < -0.03
          ? "más visitantes de invierno que lo habitual en la región"
          : "cerca de lo habitual en la región";
    const share = (x) => `${Math.round((100 * x) / d.total)} %`;
    showTip(
      event,
      `<b>${maps.names.get(d.cell[2])}</b> · ${MONTHS[m]}<br>` +
        `Zona de ~22 km · ${d.total.toLocaleString("es-CL")} especie-días<br>` +
        `<span class="tt-row"><i class="sw c0"></i>Residentes <b>${share(d.res)}</b></span>` +
        `<span class="tt-row"><i class="sw c1"></i>Visitantes de verano <b>${share(d.est)}</b></span>` +
        `<span class="tt-row"><i class="sw c2"></i>Visitantes de invierno <b>${share(d.inv)}</b></span>` +
        `<i>${verdict}</i>`,
    );
  }
  function regionTip(event, id, m) {
    const r = maps.regionWave.get(id);
    if (!r) return;
    const [, , est, inv] = r.rows[m];
    const v = r.index[m];
    const verdict =
      v > 0.25
        ? "domina la ola de verano"
        : v < -0.25
          ? "domina la ola de invierno"
          : "entre olas";
    showTip(
      event,
      `<b>${maps.names.get(id)}</b> · ${MONTHS[m]}<br>` +
        `<span class="tt-row"><i class="sw c1"></i>Visitantes de verano <b>${est}</b> especies</span>` +
        `<span class="tt-row"><i class="sw c2"></i>Visitantes de invierno <b>${inv}</b> especies</span>` +
        `<i>${verdict}</i>${r.low ? "<br><i>pocos registros: valor inestable</i>" : ""}`,
    );
  }

  function drawMapsLegend(color, sat, radius) {
    const host = d3.select("#maps-legend");
    host.selectAll("*").remove();
    const w = 220;
    const svg = host
      .append("svg")
      .attr("viewBox", `0 0 ${w} 34`)
      .attr("width", w)
      .attr("height", 34);
    const grad = svg
      .append("defs")
      .append("linearGradient")
      .attr("id", "maps-grad");
    d3.range(0, 1.01, 0.1).forEach((t) =>
      grad
        .append("stop")
        .attr("offset", `${t * 100}%`)
        .attr("stop-color", color((t * 2 - 1) * sat)),
    );
    svg
      .append("rect")
      .attr("x", 0)
      .attr("y", 2)
      .attr("width", w)
      .attr("height", 10)
      .attr("rx", 2)
      .attr("fill", "url(#maps-grad)");
    [
      ["invierno", 0, "start"],
      [radius ? "como siempre" : "entre olas", w / 2, "middle"],
      ["verano", w, "end"],
    ].forEach(([t, x, anchor]) =>
      svg
        .append("text")
        .attr("x", x)
        .attr("y", 28)
        .attr("text-anchor", anchor)
        .text(t),
    );
    if (!radius) return;
    // Tamaño: especie-días registrados.
    const g = host
      .append("svg")
      .attr("viewBox", "0 0 210 34")
      .attr("width", 210)
      .attr("height", 34)
      .append("g");
    let x = 0;
    [100, 1000, 10000].forEach((v) => {
      const r = radius(v);
      g.append("circle")
        .attr("class", "size-key")
        .attr("cx", x + r)
        .attr("cy", 7)
        .attr("r", r);
      g.append("text")
        .attr("x", x + 2 * r + 4)
        .attr("y", 11)
        .text(v.toLocaleString("es-CL"));
      x += 2 * r + 4 + v.toLocaleString("es-CL").length * 7.5 + 12;
    });
    g.append("text")
      .attr("x", 0)
      .attr("y", 28)
      .text("especie-días registrados");
  }

  function initMapsMode() {
    const buttons = d3.selectAll("#maps-mode button");
    const sync = () =>
      buttons.attr("aria-pressed", function () {
        return String(this.dataset.mode === state.mode);
      });
    buttons.on("click", function () {
      onMode(this.dataset.mode);
      sync();
    });
    sync();
  }

  return { drawMaps, initMapsMode };
}

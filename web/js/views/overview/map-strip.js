/** Presenta tarjetas mensuales y gestiona su desplazamiento horizontal. */
import { d3 } from "../../shared/d3.js";
import { MONTHS, MON, AUSTRAL } from "../../shared/calendar.js";

export function createMapStrips({ state, setMonth }) {
  const strips = [];
  function buildStrip(
    id,
    cardW,
    h,
    draw,
    label,
    padX = 16,
    shortMonth = false,
  ) {
    const host = document.getElementById(id);
    host.innerHTML = "";
    const w = cardW - padX;
    const cards = d3
      .select(host)
      .selectAll("div.map-card")
      .data(AUSTRAL)
      .join("div")
      .attr("class", "map-card")
      .style("width", `${cardW}px`)
      .on("click", (event, m) => setMonth(m));
    cards.append("h3").text((m) => (shortMonth ? MON[m] : MONTHS[m]));
    cards
      .append("svg")
      .attr("viewBox", `0 0 ${w} ${h}`)
      .attr("width", w)
      .attr("height", h)
      .attr("role", "img")
      .attr("aria-label", (m) => `${label} · ${MONTHS[m]}`)
      .each(function (m) {
        draw(d3.select(this), m, w, h);
      });
    const strip =
      strips.find((s) => s.id === id) || strips[strips.push({ id }) - 1];
    strip.cards = cards;
    return cards;
  }
  const cardWidth = (host, min = 130) =>
    Math.max(
      min,
      Math.floor(host.clientWidth / (host.clientWidth < 560 ? 2 : 4)),
    );
  function updateMaps(follow) {
    for (const { id, cards } of strips) {
      if (!cards) continue;
      cards.classed("current", (m) => m === state.month);
      if (!follow) continue;
      // Si el mes actual no está a la vista, se desplaza la franja (no la página).
      const strip = document.getElementById(id);
      const card = cards.filter((m) => m === state.month).node();
      if (!card) continue;
      const w = card.offsetWidth;
      const i = AUSTRAL.indexOf(state.month);
      if (
        i * w < strip.scrollLeft ||
        (i + 1) * w > strip.scrollLeft + strip.clientWidth
      ) {
        const perPage = Math.max(1, Math.round(strip.clientWidth / w));
        strip.scrollTo({
          left: Math.floor(i / perPage) * perPage * w,
          behavior: "smooth",
        });
      }
    }
  }

  function initStripNav(id) {
    const strip = document.getElementById(id);
    const page = (dir) => {
      const card = strip.querySelector(".map-card");
      const w = card ? card.offsetWidth : strip.clientWidth / 4;
      strip.scrollBy({
        left: dir * Math.round(strip.clientWidth / w) * w,
        behavior: "smooth",
      });
    };
    document
      .querySelectorAll(`[data-strip="${id}"]`)
      .forEach((b) =>
        b.addEventListener("click", () =>
          page(b.dataset.dir === "prev" ? -1 : 1),
        ),
      );
  }

  return { buildStrip, cardWidth, updateMaps, initStripNav };
}

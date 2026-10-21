import { loadOverview } from "../data/overview.js";
import { loadSpatialMaps, createRegionLoader } from "../data/spatial.js";
import {
  createOverviewState,
  createFlockState,
  createMapState,
} from "../state/overview.js";
import { createTooltip } from "../shared/tooltip.js";
import { createPulse } from "../views/overview/pulse.js";
import { createSpeciesDots } from "../views/overview/species-dots.js";
import { createMapStrips } from "../views/overview/map-strip.js";
import { createMonthlyMaps } from "../views/overview/monthly-maps.js";
import { createRegionDetail } from "../views/overview/region-detail.js";
import { createMonthSelector } from "../views/overview/month-selector.js";

/**
 * Compose the overview. The upper month selector drives the monthly chart (and the
 * monthly maps); «Una silueta, una especie» has its own month and selector.
 */
async function main() {
  const data = await loadOverview();
  const state = createOverviewState(),
    flock = createFlockState(),
    mapState = createMapState();
  const maps = {};
  const loadRegion = createRegionLoader();
  const { showTip, hideTip } = createTooltip();
  const { drawPulse, updatePulse, drawTable } = createPulse({
    data,
    state,
    setMonth,
    showTip,
    hideTip,
  });
  const { drawFlock, updateFlock } = createSpeciesDots({
    data,
    state: flock,
    showTip,
    hideTip,
  });
  const { buildStrip, cardWidth, updateMaps, initStripNav } = createMapStrips({
    state,
    setMonth,
  });
  const { drawMaps, initMapsMode } = createMonthlyMaps({
    maps,
    state: mapState,
    buildStrip,
    updateMaps,
    onMode: (mode) => {
      mapState.mode = mode;
      drawMaps();
    },
    showTip,
    hideTip,
  });
  const {
    showLoadError,
    drawRegionPicker,
    updatePicker,
    drawRegionMaps,
    applyResidentToggle,
  } = createRegionDetail({
    maps,
    state: mapState,
    buildStrip,
    cardWidth,
    updateMaps,
    selectRegion,
    showTip,
    hideTip,
  });
  const months = createMonthSelector({
    host: "#months",
    getMonth: () => state.month,
    onSelect: setMonth,
  });
  const flockMonths = createMonthSelector({
    host: "#flock-months",
    getMonth: () => flock.month,
    onSelect: setFlockMonth,
  });
  function setMonth(m) {
    state.month = m;
    updatePulse();
    months.update();
    updateMaps(true);
  }
  function setFlockMonth(m) {
    flock.month = m;
    updateFlock(true);
    flockMonths.update();
  }
  async function selectRegion(id) {
    mapState.region = id;
    updatePicker();
    await renderRegionMaps();
  }
  async function renderRegionMaps() {
    const id = mapState.region;
    let data;
    try {
      data = await loadRegion(maps.codes.get(id));
    } catch (error) {
      console.error(error);
      showLoadError();
      return;
    }
    if (id !== mapState.region) return;
    drawRegionMaps(data, id);
  }
  function drawAllMaps() {
    drawMaps();
    drawRegionPicker();
    renderRegionMaps();
  }
  drawPulse();
  drawFlock();
  months.draw();
  flockMonths.draw();
  drawTable();
  announceDrawn();
  initStripNav("maps");
  initStripNav("region-maps");
  initMapsMode();
  document
    .getElementById("hide-residents")
    .addEventListener("change", applyResidentToggle);
  loadSpatialMaps()
    .then((data) => {
      Object.assign(maps, data);
      drawAllMaps();
    })
    .catch((err) => {
      console.error(err);
      document.getElementById("maps").textContent =
        "No se pudieron cargar los mapas.";
    });
  let lastWidth = innerWidth;
  addEventListener("resize", () => {
    if (innerWidth === lastWidth) return;
    lastWidth = innerWidth;
    drawPulse();
    drawFlock();
    drawAllMaps();
  });
}
// The sections below (regional calendar) wait for this, once the page above has its final height.
function announceDrawn() {
  document.documentElement.dataset.overview = "drawn";
  document.dispatchEvent(new Event("overview:drawn"));
}
main().catch((err) => {
  console.error(err);
  announceDrawn();
  document.getElementById("pulse").textContent =
    "No se pudieron cargar los datos.";
});

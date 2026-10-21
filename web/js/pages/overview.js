import { loadOverview } from "../data/overview.js";
import { loadSpatialMaps, createRegionLoader } from "../data/spatial.js";
import {
  createOverviewState,
  createMapState,
  createClockState,
} from "../state/overview.js";
import { createTooltip } from "../shared/tooltip.js";
import { createPulse } from "../views/overview/pulse.js";
import { createSpeciesDots } from "../views/overview/species-dots.js";
import { createMapStrips } from "../views/overview/map-strip.js";
import { createMonthlyMaps } from "../views/overview/monthly-maps.js";
import { createRegionDetail } from "../views/overview/region-detail.js";
import { createOverviewPlayer } from "../views/overview/player.js";

// Cada mes del avance automático dura 12 s, como el antiguo recorrido sonoro (4 compases de 3 s).
const MONTH_MS = 12000;

/** Compose the overview; the month clock and manual selections use the same month. */
async function main() {
  const data = await loadOverview();
  const state = createOverviewState(),
    mapState = createMapState(),
    clock = createClockState();
  const maps = {};
  const loadRegion = createRegionLoader();
  let timer = null;
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
    state,
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
  const { syncPlayButton, initControls, drawMonths, updateMonths } =
    createOverviewPlayer({
      state,
      clock,
      setMonth,
      togglePause,
    });
  function setMonth(m, fromClock = false) {
    state.month = m;
    // Un mes elegido a mano dura completo antes de que el avance siga.
    if (!fromClock && !clock.paused) startClock();
    updatePulse();
    updateFlock(true);
    updateMonths();
    updateMaps(true);
  }
  function startClock() {
    clearInterval(timer);
    timer = setInterval(() => setMonth((state.month + 1) % 12, true), MONTH_MS);
  }
  function togglePause() {
    clock.paused = !clock.paused;
    if (clock.paused) {
      clearInterval(timer);
      timer = null;
    } else startClock();
    syncPlayButton();
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
  drawMonths();
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
  initControls();
  if (!clock.paused) startClock();
  syncPlayButton();
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

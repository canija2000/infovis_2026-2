import { loadOverview } from "../data/overview.js";
import { loadSpatialMaps, createRegionLoader } from "../data/spatial.js";
import { loadLoop } from "../data/loop.js";
import {
  createOverviewState,
  createMapState,
  createSoundState,
} from "../state/overview.js";
import { createTooltip } from "../shared/tooltip.js";
import { createPulse } from "../views/overview/pulse.js";
import { createSpeciesDots } from "../views/overview/species-dots.js";
import { createMapStrips } from "../views/overview/map-strip.js";
import { createMonthlyMaps } from "../views/overview/monthly-maps.js";
import { createRegionDetail } from "../views/overview/region-detail.js";
import { createOverviewPlayer } from "../views/overview/player.js";
import { createOverviewPlan } from "../audio/overview-plan.js";
import { SoundLoop } from "../audio/year-loop.js";
import { claimAudio, onAudioClaimed } from "../shared/audio-focus.js";

/** Compose the overview; the sound clock and manual selections use the same month. */
async function main() {
  const data = await loadOverview();
  const state = createOverviewState(),
    mapState = createMapState(),
    sound = createSoundState();
  const maps = {};
  const loadRegion = createRegionLoader();
  let loopData = null;
  const getData = () => loopData;
  const getCounts = (scope) => {
    if (!scope) return data.months;
    const rw = maps.regionWave && maps.regionWave.get(scope);
    return rw ? rw.rows.map((r) => [r[1], r[2], r[3]]) : null;
  };
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
  const { voicesFor, clipsFor, planBar, waveMetrics, classOf } =
    createOverviewPlan({
      sound,
      getData,
      getCounts,
      preload: SoundLoop.load,
    });
  const {
    updateBar,
    setSoundHint,
    updateRegionName,
    updateNowPlaying,
    syncSoundButtons,
    initSoundControls,
    drawMonths,
    updateMonths,
  } = createOverviewPlayer({
    state,
    sound,
    getData,
    mapState,
    voicesFor,
    waveMetrics,
    classOf,
    setMonth,
    togglePause,
    toggleMute,
    setSoundScope,
    setSoundMode,
    setSoundSpeed,
  });
  function setMonth(m, fromLoop = false) {
    state.month = m;
    if (!fromLoop) {
      SoundLoop.jump(m);
      updateNowPlaying(m);
    }
    updatePulse();
    updateFlock(true);
    updateMonths();
    updateMaps(true);
  }
  function onBar(m, b) {
    if (m !== state.month) setMonth(m, true);
    updateBar(b);
    updateNowPlaying(m);
  }
  async function initSound() {
    try {
      loopData = await loadLoop();
    } catch (err) {
      console.error(err);
      return;
    }
    SoundLoop.configure({
      ...loopData,
      barsPerMonth: sound.speed === 2 ? 2 : loopData.barsPerMonth,
    });
    SoundLoop.setMuted(sound.muted);
    syncSoundButtons();
    updateNowPlaying();
    await SoundLoop.load(clipsFor(state.month));
    // Si mientras cargaba se pidió escuchar el año de una especie, el recorrido queda en pausa.
    if (!sound.paused) SoundLoop.start(state.month, planBar, onBar);
    // Sin gesto del usuario el navegador mantiene el audio suspendido: el loop arranca con el primer clic o tecla.
    if (!SoundLoop.unlocked) {
      setSoundHint(true);
      const unlock = async () => {
        if (await SoundLoop.unlock()) {
          setSoundHint(false);
          removeEventListener("pointerdown", unlock, true);
          removeEventListener("keydown", unlock, true);
        }
      };
      addEventListener("pointerdown", unlock, true);
      addEventListener("keydown", unlock, true);
    }
  }
  function togglePause() {
    if (!loopData) return;
    sound.paused = !sound.paused;
    if (sound.paused) SoundLoop.stop();
    else {
      claimAudio("overview-loop");
      SoundLoop.start(state.month, planBar, onBar);
    }
    syncSoundButtons();
  }
  // Escuchar el año de una especie (más abajo en la página) pausa el recorrido: un sonido a la vez.
  onAudioClaimed((owner) => {
    if (owner === "overview-loop" || sound.paused) return;
    sound.paused = true;
    if (loopData) SoundLoop.stop();
    syncSoundButtons();
  });
  function toggleMute() {
    sound.muted = !sound.muted;
    SoundLoop.setMuted(sound.muted);
    try {
      localStorage.setItem("loop-muted", sound.muted ? "1" : "0");
    } catch (err) {
      /* sin almacenamiento */
    }
    syncSoundButtons();
  }
  function setSoundScope(scope) {
    sound.scope = scope;
    if (loopData) {
      SoundLoop.load(clipsFor(state.month));
      SoundLoop.jump(state.month);
    }
    syncSoundButtons();
    updateNowPlaying();
  }
  function setSoundMode(mode) {
    sound.mode = mode;
    if (loopData) SoundLoop.jump(state.month);
    syncSoundButtons();
    updateNowPlaying();
  }
  function setSoundSpeed(speed) {
    sound.speed = speed === 2 ? 2 : 1;
    SoundLoop.setBarsPerMonth(sound.speed === 2 ? 2 : 4);
    if (loopData) SoundLoop.jump(state.month);
    syncSoundButtons();
  }
  function onRegionChange(id) {
    updateRegionName(maps.names.get(id));
    if (sound.scope !== 0) setSoundScope(id);
  }

  async function selectRegion(id) {
    mapState.region = id;
    updatePicker();
    onRegionChange(id);
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
      updateNowPlaying();
    })
    .catch((err) => {
      console.error(err);
      document.getElementById("maps").textContent =
        "No se pudieron cargar los mapas.";
    });
  initSoundControls();
  initSound();
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

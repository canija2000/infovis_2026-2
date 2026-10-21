import { loadAtlas } from "../data/atlas.js";
import { createMediaRepository } from "../data/media.js";
import { createExploreState } from "../state/explore.js";
import { pct } from "../shared/format.js";
import { createTooltip } from "../shared/tooltip.js";
import { createChileMap } from "../shared/chile-map.js";
import { createLegend } from "../shared/legend.js";
import { createExploreColors } from "../explore/colors.js";
import { createExploreQueries } from "../explore/queries.js";
import { createGridAxis } from "../explore/grid-axis.js";
import { createSummary } from "../views/explore/summary.js";
import { createRegionMap } from "../views/explore/region-map.js";
import { createRegionalGrid } from "../views/explore/regional-grid.js";
import { createCalendar } from "../views/explore/calendar.js";
import { createExploreControls } from "../views/explore/controls.js";
import { createMethodology } from "../views/explore/methodology.js";
import { createSpeciesPanel } from "../views/species-panel.js";
import { createSpeciesDetail } from "../species/controller.js";
import { createSpeciesMedia } from "../views/species-media.js";
import { createSpeciesYearPlayer } from "../audio/species-year.js";
import { claimAudio, onAudioClaimed } from "../shared/audio-focus.js";
import { CALENDAR } from "../shared/calendar.js";

/** Compose the atlas. Views report actions; only this page changes atlas selections. */
async function main() {
  const data = await loadAtlas();
  const state = createExploreState();
  const media = createMediaRepository();
  const { showTip, hideTip } = createTooltip();
  const { RAMPS, classScale, deviation } = createExploreColors({ data });
  const { scopeName, rm, tabOrder, lowEffort, shareMean } =
    createExploreQueries({ data, state });
  const { drawChile } = createChileMap({ data, showTip, hideTip });
  const { renderLegend } = createLegend();
  const axis = createGridAxis({ state });
  const { renderSummary } = createSummary({ data });
  const { renderMap, renderScopeStats, regionTip } = createRegionMap({
    data,
    state,
    RAMPS,
    rm,
    scopeName,
    shareMean,
    lowEffort,
    drawChile,
    renderLegend,
    selectScope,
  });
  const { renderRegionGrid } = createRegionalGrid({
    data,
    state,
    deviation,
    lowEffort,
    scopeName,
    rm,
    shareMean,
    selectScope,
    showTip,
    hideTip,
    regionTip,
    axis,
  });
  const calendar = createCalendar({
    data,
    state,
    classScale,
    scopeName,
    tabOrder,
    openSpecies,
    showTip,
    hideTip,
    renderLegend,
    axis,
  });
  const controls = createExploreControls({
    data,
    state,
    setTab,
    openSpecies,
    setMonth,
    toggleExpanded,
    closeSpecies,
    selectScope,
  });
  const { renderTabs, setupSearch, setupControls } = controls;
  const speciesMedia = createSpeciesMedia({
    data,
    onClipPlay: () => claimAudio("clip"),
  });
  const panel = createSpeciesPanel({
    data,
    state,
    RAMPS,
    scopeName,
    drawChile,
    selectScope,
    showTip,
    hideTip,
    onPlayYear: toggleYear,
  });
  const speciesDetail = createSpeciesDetail({
    state,
    media,
    panel,
    mediaView: speciesMedia,
  });
  const { renderMethod } = createMethodology({ data });

  function renderCalendar() {
    calendar.renderCalendar();
  }
  function setTab(c) {
    if (c === state.tab) return;
    state.tab = c;
    state.expanded = false;
    renderTabs();
    renderMap();
    renderCalendar();
  }
  function openSpecies(sid) {
    stopYear();
    state.species = sid;
    const rows = data.bySpecies.get(sid);
    const here = rows.get(state.scope) || rows.get(0);
    if (here && here.cls < 3 && here.cls !== state.tab) {
      state.tab = here.cls;
      state.expanded = false;
      renderTabs();
      renderMap();
    }
    speciesDetail.renderSpecies(sid);
    renderCalendar();
  }
  function closeSpecies() {
    stopYear();
    state.species = null;
    panel.hideSpecies();
    renderCalendar();
  }
  function toggleExpanded() {
    state.expanded = !state.expanded;
    renderCalendar();
  }

  // «Escuchar su año»: el canto de la especie abierta suena mes a mes, con volumen según su perfil
  // en el ámbito de la ficha. Un sonido a la vez: pausa el clip de la ficha y se detiene si este suena.
  const speciesYear = createSpeciesYearPlayer();
  let yearRequest = 0;
  function stopYear() {
    yearRequest += 1;
    if (!state.yearPlaying) return;
    state.yearPlaying = false;
    speciesYear.stop();
    panel.setYearPlayback(false);
  }
  async function toggleYear() {
    if (state.yearPlaying) return stopYear();
    const sid = state.species;
    const recording = media.soundEntry(sid)?.recordings[0];
    if (sid === null || !recording) return;
    const mine = ++yearRequest;
    speciesYear.unlock();
    claimAudio("species-year");
    speciesMedia.pauseClips();
    state.yearPlaying = true;
    panel.setYearPlayback(true);
    const rows = data.bySpecies.get(sid);
    const row = rows.get(state.scope) || rows.get(0);
    const ok = await speciesYear.play({
      url: recording.mixer || recording.src,
      steps: CALENDAR.map((m) => ({
        month: m,
        profile: row.prof[m],
        years: row.years[m],
      })),
      onStep(index, step) {
        if (mine === yearRequest) panel.setYearPlayback(true, step.month);
      },
      onEnd() {
        if (mine !== yearRequest) return;
        state.yearPlaying = false;
        panel.setYearPlayback(false);
      },
    });
    if (!ok && mine === yearRequest) {
      state.yearPlaying = false;
      panel.setYearPlayback(false);
    }
  }
  onAudioClaimed((owner) => {
    if (owner !== "species-year") stopYear();
  });

  // ---------------------------------------------------------------- estado
  function setMonth(m) {
    state.month = m;
    controls.updateMonth();
    renderMap();
    renderScopeStats();
    axis.updateMonth();
    panel.updateMonth();
  }

  function selectScope(id) {
    state.scope = id;
    controls.setScopeSelected(id);
    renderMap();
    renderScopeStats();
    renderRegionGrid();
    renderTabs();
    if (state.species !== null) openSpecies(state.species);
    else renderCalendar();
  }

  renderSummary();
  setupControls();
  setupSearch();
  renderLegend(document.getElementById("grid-legend"), deviation, {
    label: "Visitantes vs. promedio anual de la región",
    ticks: deviation.domain(),
    width: 320,
    format: (d) =>
      d === 0
        ? "igual"
        : `${d > 0 ? "+" : "−"}${pct(Math.abs(d))}${d > 0 ? " o más" : " o menos"}`,
  });
  renderRegionGrid();
  renderTabs();
  renderCalendar();
  renderMethod();
  setMonth(0);
}
main().catch((err) => {
  console.error(err);
  document.getElementById("summary").textContent =
    "No se pudieron cargar los datos. Abre la página con un servidor local (python3 -m http.server).";
});

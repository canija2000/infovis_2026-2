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
import { createMixer } from "../mixer/controller.js";
import { createAtlasPlan } from "../audio/atlas-plan.js";
import { Sonifier } from "../audio/atlas-sonifier.js";

/** Compose the atlas. Views report actions; only this page changes atlas selections. */
async function main() {
  const data = await loadAtlas();
  const state = createExploreState();
  const media = createMediaRepository();
  const { loadSounds, grainOf } = media;
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
  const mixer = createMixer({
    data,
    state,
    media,
    scopeName,
    onTracksChange: () => speciesMedia.updateMixButton(mixer.hasTrack),
  });
  const { updateSceneButton } = mixer;
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
    togglePlay,
    onMute,
    toggleExpanded,
    closeSpecies,
    selectScope,
  });
  const { renderTabs, setupSearch, setupControls } = controls;
  const speciesMedia = createSpeciesMedia({
    data,
    addToMixer: mixer.addToMixer,
    hasTrack: mixer.hasTrack,
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
  });
  const speciesDetail = createSpeciesDetail({
    state,
    media,
    panel,
    mediaView: speciesMedia,
  });
  const { renderMethod } = createMethodology({ data });
  const { barFor } = createAtlasPlan({
    data,
    state,
    rm,
    grainOf,
    getSounds: media.getSounds,
  });

  function renderCalendar() {
    updateSceneButton();
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
    state.species = sid;
    const rows = data.bySpecies.get(sid);
    const here = rows.get(state.scope) || rows.get(0);
    if (here && here.cls < 3 && here.cls !== state.tab) {
      state.tab = here.cls;
      state.expanded = false;
      renderTabs();
      renderMap();
    }
    if (Sonifier.playing)
      loadSounds()
        .then(() => Sonifier.load([grainOf(sid)]))
        .catch(() => {});
    speciesDetail.renderSpecies(sid);
    renderCalendar();
  }
  function closeSpecies() {
    state.species = null;
    panel.hideSpecies();
    renderCalendar();
  }
  function toggleExpanded() {
    state.expanded = !state.expanded;
    renderCalendar();
  }
  function onMute(muted) {
    state.muted = muted;
    Sonifier.setMuted(muted);
    mixer.setMuted(muted);
  }
  async function togglePlay() {
    if (Sonifier.playing) {
      Sonifier.stop();
      controls.setPlayback(false);
      return;
    }
    try {
      await loadSounds();
    } catch (err) {
      console.warn("Sin índice de cantos; se usarán tonos sintéticos", err);
    }
    const layers = (media.getSounds() && media.getSounds().layers) || {};
    const urls = [
      ...Object.values(layers).map(grainOf),
      state.species !== null ? grainOf(state.species) : null,
    ];
    const ok = await Sonifier.start(
      state.month,
      barFor,
      (m) => setMonth(m),
      urls,
    );
    if (!ok) return;
    Sonifier.setMuted(state.muted);
    controls.setPlayback(true);
  }

  // ---------------------------------------------------------------- estado
  function setMonth(m) {
    state.month = m;
    controls.updateMonth();
    renderMap();
    renderScopeStats();
    axis.updateMonth();
    panel.updateMonth();
    updateSceneButton();
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
  mixer.setupMixer();
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

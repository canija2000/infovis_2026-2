/** Compose the regional example independently of the overview's sound and maps. */
import { loadRegionalCalendar } from "../data/regional-calendar.js";
import { createMediaRepository } from "../data/media.js";
import { createRegionalCalendarState } from "../state/regional-calendar.js";
import { queryRegionalCalendar } from "../overview/regional-calendar.js";
import { REGIONAL_EXAMPLES } from "../overview/regional-examples.js";
import { createRegionalCalendarView } from "../views/overview/regional-calendar.js";
import { createSpeciesYearPlayer } from "../audio/species-year.js";
import { SCENES, exampleStep } from "../audio/species-year-plan.js";
import { claimAudio, onAudioClaimed } from "../shared/audio-focus.js";

const state = createRegionalCalendarState();
const media = createMediaRepository();
const player = createSpeciesYearPlayer();
let data;
let model;
let request = 0; // identifica la reproducción vigente: las respuestas tardías se ignoran
const view = createRegionalCalendarView({
  onSpeciesChange(species) {
    stopYear();
    state.species = species;
    render();
  },
  onRegionsChange() {
    stopYear();
    state.allRegions = !state.allRegions;
    render();
  },
  onPlayRegion: toggleYear,
  onPlayScene: toggleScene,
  onRetry: start,
});
function render() {
  model = queryRegionalCalendar(data, state);
  view.render(model);
}

// «Escuchar su año»: el canto de la especie suena mes a mes en una región; cuanto más presente,
// más aves y más cerca. La leyenda sonora toca un mes de ejemplo de cada escena.
function stopYear() {
  request += 1;
  state.playingRegion = null;
  state.playingScene = null;
  player.stop();
  view.setPlayback(null);
  view.setScenePlayback(null);
}
async function clipUrl() {
  try {
    await media.loadSounds();
    const recording = media.soundEntry(model.bird.id)?.recordings[0];
    return recording ? recording.mixer || recording.src : null;
  } catch (error) {
    console.warn("Sin índice de cantos", error);
    return null;
  }
}
// Común a la fila y a la leyenda: desbloquea dentro del gesto, carga el clip y reproduce.
async function listen(steps, { onStep }) {
  const mine = request;
  player.unlock();
  claimAudio("species-year");
  const url = await clipUrl();
  if (mine !== request) return;
  const ok =
    url &&
    (await player.play({
      url,
      steps,
      onStep(index, step, planned) {
        if (mine === request) onStep(step, planned);
      },
      onEnd() {
        if (mine === request) stopYear();
      },
    }));
  if (!ok && mine === request) stopYear();
}
function toggleYear(regionId) {
  if (state.playingRegion === regionId) return stopYear();
  stopYear();
  const row = model.rows.find((item) => item.region.id === regionId);
  if (!row) return;
  state.playingRegion = regionId;
  view.setPlayback(regionId);
  listen(
    row.cells.map((cell) => ({
      month: cell.month,
      profile: cell.profile,
      years: cell.years,
    })),
    {
      onStep: (step, planned) =>
        view.setPlayback(
          regionId,
          step.month,
          planned.scene ? SCENES[planned.scene].label : "en silencio",
        ),
    },
  );
}
function toggleScene(scene) {
  if (state.playingScene === scene) return stopYear();
  stopYear();
  state.playingScene = scene;
  view.setScenePlayback(scene);
  listen([exampleStep(scene)], { onStep: () => {} });
}
onAudioClaimed((owner) => {
  if (
    owner !== "species-year" &&
    (state.playingRegion !== null || state.playingScene !== null)
  )
    stopYear();
});

async function start() {
  view.showLoading();
  // The photos do not depend on the data: fetch them in parallel with it.
  view.preloadPhotos(REGIONAL_EXAMPLES.map((example) => example.photo));
  try {
    data = await loadRegionalCalendar();
    render();
  } catch (error) {
    console.error(error);
    view.showError();
  }
}
// The section sits below the overview: its data waits until it is near the
// viewport, so it does not compete with the maps and sounds of the first screen.
// Observe once the overview has drawn its charts: before that the page above is
// almost empty and the section would look close to the first screen.
function startWhenNear() {
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      start();
    },
    { rootMargin: "300px 0px" },
  );
  observer.observe(document.getElementById("regional-calendar"));
}
if (!("IntersectionObserver" in window)) start();
else if (document.documentElement.dataset.overview === "drawn") startWhenNear();
else document.addEventListener("overview:drawn", startWhenNear, { once: true });

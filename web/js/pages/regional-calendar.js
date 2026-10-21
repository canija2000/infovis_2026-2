/** Compose the regional example independently of the overview's sound and maps. */
import { loadRegionalCalendar } from "../data/regional-calendar.js";
import { createMediaRepository } from "../data/media.js";
import { createRegionalCalendarState } from "../state/regional-calendar.js";
import { queryRegionalCalendar } from "../overview/regional-calendar.js";
import { REGIONAL_EXAMPLES } from "../overview/regional-examples.js";
import { createRegionalCalendarView } from "../views/overview/regional-calendar.js";
import { createSpeciesYearPlayer } from "../audio/species-year.js";
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
  onRetry: start,
});
function render() {
  model = queryRegionalCalendar(data, state);
  view.render(model);
}

// «Escuchar su año»: el canto de la especie suena mes a mes en una región, con volumen según su presencia.
function stopYear() {
  request += 1;
  state.playingRegion = null;
  player.stop();
  view.setPlayback(null);
}
async function toggleYear(regionId) {
  if (state.playingRegion === regionId) return stopYear();
  stopYear();
  const mine = request;
  const row = model.rows.find((item) => item.region.id === regionId);
  if (!row) return;
  // Dentro del gesto: el navegador deja sonar el audio y las demás secciones se callan.
  player.unlock();
  claimAudio("species-year");
  state.playingRegion = regionId;
  view.setPlayback(regionId);
  let url = null;
  try {
    await media.loadSounds();
    const recording = media.soundEntry(model.bird.id)?.recordings[0];
    url = recording ? recording.mixer || recording.src : null;
  } catch (error) {
    console.warn("Sin índice de cantos", error);
  }
  if (mine !== request) return;
  const ok =
    url &&
    (await player.play({
      url,
      steps: row.cells.map((cell) => ({
        month: cell.month,
        profile: cell.profile,
        years: cell.years,
      })),
      onStep(index, step) {
        if (mine === request) view.setPlayback(regionId, step.month);
      },
      onEnd() {
        if (mine !== request) return;
        state.playingRegion = null;
        view.setPlayback(null);
      },
    }));
  if (!ok && mine === request) {
    state.playingRegion = null;
    view.setPlayback(null);
  }
}
onAudioClaimed((owner) => {
  if (owner !== "species-year" && state.playingRegion !== null) stopYear();
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

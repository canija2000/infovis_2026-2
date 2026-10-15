/** Compose the regional example independently of the overview's sound and maps. */
import { loadRegionalCalendar } from "../data/regional-calendar.js";
import { createMediaRepository } from "../data/media.js";
import { createRegionalCalendarState } from "../state/regional-calendar.js";
import { queryRegionalCalendar } from "../overview/regional-calendar.js";
import { createRegionalCalendarView } from "../views/overview/regional-calendar.js";

const state = createRegionalCalendarState();
const media = createMediaRepository();
let data;
let images = null;
const view = createRegionalCalendarView({
  onSpeciesChange(species) {
    state.species = species;
    render();
  },
  onRegionsChange() {
    state.allRegions = !state.allRegions;
    render();
  },
  onRetry: start,
});
function render() {
  view.render(queryRegionalCalendar(data, state, images));
}
async function start() {
  view.showLoading();
  try {
    data = await loadRegionalCalendar();
    render();
  } catch (error) {
    console.error(error);
    view.showError();
  }
}
// A missing remote image index must not hide the regional evidence.
media
  .loadImages()
  .then((result) => {
    images = result;
    if (data) view.renderPhoto(queryRegionalCalendar(data, state, images));
  })
  .catch((error) => console.error(error));
start();

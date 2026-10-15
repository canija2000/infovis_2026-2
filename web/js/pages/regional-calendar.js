/** Compose the regional example independently of the overview's sound and maps. */
import { loadRegionalCalendar } from "../data/regional-calendar.js";
import { createRegionalCalendarState } from "../state/regional-calendar.js";
import { queryRegionalCalendar } from "../overview/regional-calendar.js";
import { REGIONAL_EXAMPLES } from "../overview/regional-examples.js";
import { createRegionalCalendarView } from "../views/overview/regional-calendar.js";

const state = createRegionalCalendarState();
let data;
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
  view.render(queryRegionalCalendar(data, state));
}
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
// Observe after "load", once the stylesheets have given the page its final layout.
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
else if (document.readyState === "complete") startWhenNear();
else window.addEventListener("load", startWhenNear, { once: true });

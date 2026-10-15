/** Connects contextual metric links on Visualización and Explorar to the overlay. */
import { createMetricsDialog } from "../views/metrics/dialog.js";
import { createMetricConceptLinks } from "../views/metrics/concept-links.js";
const dialog = createMetricsDialog();
createMetricConceptLinks(document.body);
document.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-metric]");
  if (
    !link ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  )
    return;
  event.preventDefault();
  dialog.open({
    concept: new window.URL(link.href).hash.slice(1) || "ejemplo",
    trigger: link,
  });
});

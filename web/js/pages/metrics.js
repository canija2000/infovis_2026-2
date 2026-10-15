/** Connects the example's repository, selection, queries and interface blocks. */
import { createMetricsRepository } from "../data/metrics.js";
import { createMetricsState } from "../state/metrics.js";
import { createMetricsQueries } from "../metrics/queries.js";
import { createMetricsOrbit } from "../views/metrics/orbit.js";
import { createMetricsExampleDetail } from "../views/metrics/example-detail.js";
import { createMetricsControls } from "../views/metrics/controls.js";
import { createMetricsReference } from "../views/metrics/reference.js";
const data = createMetricsRepository(
  JSON.parse(document.getElementById("metrics-example-data").textContent),
);
const state = createMetricsState();
const queries = createMetricsQueries({ data, state });
const orbit = createMetricsOrbit();
const detail = createMetricsExampleDetail();
const reference = createMetricsReference();
function render() {
  const example = queries.example();
  orbit.render(example);
  detail.render(example);
}
const controls = createMetricsControls({
  onScopeChange(scope) {
    state.scope = scope;
    render();
  },
  onMonthChange(month) {
    state.month = month;
    render();
  },
});
controls.setup();
render();
reference.revealConcept();

/** Consulta nombres, esfuerzo, composición y orden mensual del ámbito elegido. */
import { d3 } from "../shared/d3.js";
import { AUSTRAL, CALENDAR } from "../shared/calendar.js";
export function createExploreQueries({ data, state }) {
  const EFFORT_LOW = 400;
  const TAB_ORDER = [AUSTRAL, AUSTRAL, CALENDAR];
  const scopeName = (id) => data.regionById.get(id).name;
  const rm = (scope, m) => data.regionMonth[String(scope)][m];
  const tabOrder = () => TAB_ORDER[state.tab];
  const lowEffort = (id) => id !== 0 && data.effortMean.get(id) < EFFORT_LOW;
  const shareMean = (id) => d3.mean(data.regionMonth[String(id)], (x) => x[4]);

  return { scopeName, rm, tabOrder, lowEffort, shareMean };
}

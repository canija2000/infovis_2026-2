/** Presenta y conecta los controles del atlas; delega las selecciones al coordinador. */
import { d3 } from "../../shared/d3.js";
import { MONTHS, AUSTRAL, MON } from "../../shared/calendar.js";
import { TAB_LABEL } from "../../shared/classes.js";
export function createExploreControls({
  data,
  state,
  setTab,
  openSpecies,
  setMonth,
  onMute,
  toggleExpanded,
  closeSpecies,
  selectScope,
}) {
  function renderTabs() {
    const rows = data.byScope.get(state.scope) || [];
    const counts = [0, 0, 0, 0];
    rows.forEach((r) => counts[r.cls]++);
    d3.select("#tabs")
      .selectAll("button")
      .data([0, 1, 2])
      .join("button")
      .attr("type", "button")
      .attr("role", "tab")
      .attr("class", (c) => `tab c${c}`)
      .attr("aria-selected", (c) => c === state.tab)
      .html(
        (c) =>
          `<span class="sw c${c}"></span>${TAB_LABEL[c]} <span class="n">${counts[c]}</span>`,
      )
      .on("click", (e, c) => setTab(c));
  }
  function setupSearch() {
    const list = document.getElementById("species-list");
    const byLabel = new Map();
    data.species.forEach((s) => {
      const label = `${s.comName} — ${s.sciName}`;
      byLabel.set(label.toLowerCase(), s.id);
      byLabel.set(s.comName.toLowerCase(), s.id);
      byLabel.set(s.sciName.toLowerCase(), s.id);
      const o = document.createElement("option");
      o.value = label;
      list.appendChild(o);
    });
    const input = document.getElementById("search");
    const pick = () => {
      const q = input.value.trim().toLowerCase();
      if (!q) return;
      let id = byLabel.get(q);
      if (id === undefined) {
        const hit = data.species.find(
          (s) =>
            s.comName.toLowerCase().startsWith(q) ||
            s.sciName.toLowerCase().startsWith(q),
        );
        id = hit && hit.id;
      }
      if (id !== undefined) openSpecies(id);
    };
    input.addEventListener("change", pick);
    input.addEventListener("keydown", (e) => e.key === "Enter" && pick());
  }
  function setupControls() {
    const ticks = document.getElementById("month-ticks");
    ticks.innerHTML = AUSTRAL.map(
      (m) => `<span>${MON[m][0].toUpperCase()}</span>`,
    ).join("");
    document
      .getElementById("month")
      .addEventListener("input", (e) => setMonth(AUSTRAL[+e.target.value]));
    document.getElementById("cal-more").addEventListener("click", () => {
      toggleExpanded();
    });
    document.getElementById("mute").addEventListener("click", (e) => {
      onMute(!state.muted);
      e.currentTarget.setAttribute("aria-pressed", String(state.muted));
      e.currentTarget.setAttribute(
        "aria-label",
        state.muted ? "Activar sonido" : "Silenciar",
      );
      e.currentTarget.title = state.muted ? "Activar sonido" : "Silenciar";
    });
    document
      .getElementById("reset")
      .addEventListener("click", () => selectScope(0));
    document
      .getElementById("panel-close")
      .addEventListener("click", closeSpecies);
    document.addEventListener("keydown", (e) => {
      if (e.target.closest("input, select, textarea, button, audio")) return;
      if (e.key === "Escape" && state.species !== null) closeSpecies();
    });
  }

  function updateMonth() {
    document.getElementById("month").value = AUSTRAL.indexOf(state.month);
    document.getElementById("month-label").textContent = MONTHS[state.month];
    d3.selectAll("#month-ticks span").classed(
      "current",
      (d, i) => AUSTRAL[i] === state.month,
    );
  }
  function setScopeSelected(selected) {
    document.getElementById("reset").hidden = !selected;
  }
  return {
    renderTabs,
    setupSearch,
    setupControls,
    updateMonth,
    setScopeSelected,
  };
}

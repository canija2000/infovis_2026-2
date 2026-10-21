/** Presenta los meses y el botón que pausa o reanuda el avance automático del año. */
import { d3 } from "../../shared/d3.js";
import { MONTHS, MON, AUSTRAL } from "../../shared/calendar.js";

export function createOverviewPlayer({ state, clock, setMonth, togglePause }) {
  const PLAY_D = "M4.5 2.5v11l9-5.5z";
  const PAUSE_D = "M4 2.5h3v11H4zM9 2.5h3v11H9z";
  function syncPlayButton() {
    const play = document.getElementById("play");
    play.setAttribute("aria-pressed", String(!clock.paused));
    play.setAttribute(
      "aria-label",
      clock.paused ? "Reanudar el año" : "Pausar el año",
    );
    play.title = `${clock.paused ? "Reanudar" : "Pausar"} (barra espaciadora)`;
    document
      .getElementById("play-icon")
      .setAttribute("d", clock.paused ? PLAY_D : PAUSE_D);
  }
  function initControls() {
    document.getElementById("play").addEventListener("click", togglePause);
    document.addEventListener("keydown", (event) => {
      if (
        event.code !== "Space" ||
        event.target.closest("button, input, select, a, summary, [role=button]")
      )
        return;
      event.preventDefault();
      togglePause();
    });
  }
  function drawMonths() {
    const host = d3.select("#months");
    host
      .selectAll("button")
      .data(AUSTRAL)
      .join("button")
      .attr("type", "button")
      .attr("class", "month")
      .attr("aria-label", (m) => MONTHS[m])
      .text((m) => MON[m])
      .on("click", (event, m) => setMonth(m));
    updateMonths();
  }
  function updateMonths() {
    d3.select("#months")
      .selectAll("button")
      .attr("aria-pressed", (m) => String(m === state.month));
  }
  return {
    syncPlayButton,
    initControls,
    drawMonths,
    updateMonths,
  };
}

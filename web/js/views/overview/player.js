/** Presenta controles, compás y voces del recorrido sonoro de la portada. */
import { d3 } from "../../shared/d3.js";
import { MONTHS, MON, AUSTRAL } from "../../shared/calendar.js";

export function createOverviewPlayer({
  state,
  sound,
  getData,
  mapState,
  voicesFor,
  setMonth,
  togglePause,
  toggleMute,
  setSoundScope,
}) {
  const PLAY_D = "M4.5 2.5v11l9-5.5z";
  const PAUSE_D = "M4 2.5h3v11H4zM9 2.5h3v11H9z";
  function updateNowPlaying(m = state.month) {
    if (!getData()) return;
    const names = voicesFor(m).map(([sid, copies]) => {
      const sp = getData().species[sid];
      return `<span class="v c${sp.cls}">${sp.name}${copies > 1 ? ` <b>×${copies}</b>` : ""}</span>`;
    });
    document.getElementById("now-playing").innerHTML = names.join(" ");
  }
  function syncSoundButtons() {
    const play = document.getElementById("play");
    play.setAttribute("aria-pressed", String(!sound.paused));
    play.setAttribute(
      "aria-label",
      sound.paused ? "Reanudar el año" : "Pausar el año",
    );
    play.title = `${sound.paused ? "Reanudar" : "Pausar"} (barra espaciadora)`;
    document
      .getElementById("play-icon")
      .setAttribute("d", sound.paused ? PLAY_D : PAUSE_D);
    const mute = document.getElementById("mute");
    mute.setAttribute("aria-pressed", String(sound.muted));
    mute.setAttribute(
      "aria-label",
      sound.muted ? "Activar sonido" : "Silenciar",
    );
    mute.title = sound.muted ? "Activar sonido" : "Silenciar";
    d3.selectAll("#sound-scope button").attr("aria-pressed", function () {
      return String((this.dataset.scope === "region") === (sound.scope !== 0));
    });
  }
  function initSoundControls() {
    document.getElementById("play").addEventListener("click", togglePause);
    document.getElementById("mute").addEventListener("click", toggleMute);
    d3.selectAll("#sound-scope button").on("click", function () {
      setSoundScope(this.dataset.scope === "region" ? mapState.region : 0);
    });
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

  function updateBar(b) {
    d3.selectAll("#bars i").classed("on", (d, i) => i === b);
  }
  function setSoundHint(visible) {
    document.getElementById("sound-hint").hidden = !visible;
  }
  function updateRegionName(name) {
    document.getElementById("sound-region-name").textContent = name;
  }
  return {
    updateBar,
    setSoundHint,
    updateRegionName,
    updateNowPlaying,
    syncSoundButtons,
    initSoundControls,
    drawMonths,
    updateMonths,
  };
}

/** Presenta controles, compás, dato sonificado y voces del recorrido sonoro de la portada. */
import { d3 } from "../../shared/d3.js";
import { MONTHS, MON, AUSTRAL } from "../../shared/calendar.js";

export function createOverviewPlayer({
  state,
  sound,
  getData,
  mapState,
  voicesFor,
  waveMetrics,
  classOf,
  setMonth,
  togglePause,
  toggleMute,
  setSoundScope,
  setSoundMode,
  setSoundSpeed,
}) {
  const PLAY_D = "M4.5 2.5v11l9-5.5z";
  const PAUSE_D = "M4 2.5h3v11H4zM9 2.5h3v11H9z";
  function updateNowPlaying(m = state.month) {
    if (!getData()) return;
    const voices = voicesFor(m);
    const names = voices.map(([sid, copies, explicitCls]) => {
      const sp = getData().species[sid];
      const cls =
        explicitCls !== undefined
          ? explicitCls
          : classOf
            ? classOf(sid)
            : sp.cls;
      return `<span class="v c${cls}">${sp.name}${copies > 1 ? ` <b>×${copies}</b>` : ""}</span>`;
    });
    const summaryEl = document.getElementById("sound-data-summary");
    if (summaryEl && waveMetrics) {
      const info = waveMetrics(m);
      const verHits = voices
        .filter(([, , cls]) => cls === 1)
        .reduce((a, [, c]) => a + c, 0);
      const invHits = voices
        .filter(([, , cls]) => cls === 2)
        .reduce((a, [, c]) => a + c, 0);
      const resHits = voices
        .filter(([, , cls]) => cls === 0)
        .reduce((a, [, c]) => a + c, 0);
      summaryEl.innerHTML =
        `<span class="sd-month">${MONTHS[m]}</span> · ` +
        `<span class="sd-chip c1" title="Visitantes de verano (canal izquierdo)"><b>${info.summer}</b> de verano (${verHits} ${verHits === 1 ? "canto" : "cantos"} ◀)</span> · ` +
        `<span class="sd-chip c2" title="Visitantes de invierno (canal derecho)"><b>${info.winter}</b> de invierno (${invHits} ${invHits === 1 ? "canto" : "cantos"} ▶)</span>` +
        (sound.mode === "visitors"
          ? ` · <span class="sd-chip muted-floor">residentes silenciadas</span>`
          : ` · <span class="sd-chip c0" title="Residentes todo el año (centro + colchón armónico)"><b>${info.res}</b> residentes (${resHits} + fondo ●)</span>`);
    }
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
    d3.selectAll("#sound-mode button").attr("aria-pressed", function () {
      return String(this.dataset.mode === (sound.mode || "wave"));
    });
    d3.selectAll("#sound-speed button").attr("aria-pressed", function () {
      return String(Number(this.dataset.speed) === (sound.speed || 1));
    });
    const activeBars = (sound.speed || 1) === 2 ? 2 : 4;
    d3.selectAll("#bars i").style("display", (d, i) =>
      i < activeBars ? null : "none",
    );
  }
  function initSoundControls() {
    document.getElementById("play").addEventListener("click", togglePause);
    document.getElementById("mute").addEventListener("click", toggleMute);
    d3.selectAll("#sound-scope button").on("click", function () {
      setSoundScope(this.dataset.scope === "region" ? mapState.region : 0);
    });
    d3.selectAll("#sound-mode button").on("click", function () {
      if (setSoundMode) setSoundMode(this.dataset.mode);
    });
    d3.selectAll("#sound-speed button").on("click", function () {
      if (setSoundSpeed) setSoundSpeed(Number(this.dataset.speed));
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

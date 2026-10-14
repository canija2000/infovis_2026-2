/** Presenta y conecta la barra inferior del mezclador. */
export function createMixerDock({
  state,
  onOpen,
  onPlay,
  onSync,
  onScene,
  onQuery,
  onClass,
  onSceneLabel,
}) {
  function setMixerStatus(message) {
    document.getElementById("mixer-status").textContent = message;
  }
  function updateMixerControls() {
    const button = document.getElementById("mixer-play");
    const label = state.playing ? "Pausar mezcla" : "Reproducir mezcla";
    button.disabled = !state.tracks.size;
    button.setAttribute("aria-pressed", String(state.playing));
    button.setAttribute("aria-label", label);
    button.title = label;
    document
      .getElementById("mixer-play-icon")
      .setAttribute(
        "d",
        state.playing ? "M4 2.5h3v11H4zM9 2.5h3v11H9z" : "M4.5 2.5v11l9-5.5z",
      );
    const count = document.getElementById("mixer-count");
    count.hidden = !state.tracks.size;
    count.textContent = state.tracks.size;
    document
      .getElementById("mixer-open")
      .classList.toggle("playing", state.playing);
  }
  function setMixerOpen(open) {
    const dock = document.getElementById("mixer");
    dock.hidden = !open;
    document.body.classList.toggle("with-mixer", open);
    const button = document.getElementById("mixer-open");
    button.setAttribute("aria-expanded", String(open));
    if (open) onOpen().catch(() => {});
    else if (dock.contains(document.activeElement)) button.focus();
  }
  function setMixerCatalogOpen(open) {
    const toggle = document.getElementById("mixer-search-toggle");
    document.getElementById("mixer-catalog").hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "Cerrar búsqueda" : "+ Especies";
    if (open) document.getElementById("mixer-query").focus();
  }
  function setupMixer() {
    document.getElementById("mixer-play").addEventListener("click", onPlay);
    document
      .getElementById("mixer-sync")
      .addEventListener("change", (event) => {
        onSync(event.target.checked);
        setMixerStatus(
          event.target.checked
            ? "Cantos sincronizados: comenzarán juntos."
            : "Cantos desincronizados: cada ave espera entre repeticiones.",
        );
      });
    const dock = document.getElementById("mixer");
    document
      .getElementById("mixer-open")
      .addEventListener("click", () => setMixerOpen(dock.hidden));
    document
      .getElementById("mixer-close")
      .addEventListener("click", () => setMixerOpen(false));
    const catalog = document.getElementById("mixer-catalog");
    document
      .getElementById("mixer-search-toggle")
      .addEventListener("click", () => setMixerCatalogOpen(catalog.hidden));
    document.getElementById("mixer-scene").addEventListener("click", onScene);
    document.getElementById("mixer-query").addEventListener("input", onQuery);
    document
      .getElementById("mixer-filters")
      .addEventListener("click", (event) => {
        const button = event.target.closest("button[data-class]");
        if (!button) return;
        onClass(button.dataset.class);
        document.querySelectorAll("#mixer-filters button").forEach((item) => {
          item.setAttribute("aria-pressed", String(item === button));
        });
      });
    dock.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      if (!catalog.hidden) {
        setMixerCatalogOpen(false);
        document.getElementById("mixer-search-toggle").focus();
      } else setMixerOpen(false);
    });
    // El alto del dock define el espacio libre al final de la página.
    new ResizeObserver(([entry]) => {
      document.body.style.setProperty(
        "--mixer-h",
        `${Math.ceil(entry.borderBoxSize?.[0]?.blockSize ?? dock.offsetHeight)}px`,
      );
    }).observe(dock);
    onSceneLabel();
  }

  function updateSceneButton(size, group, month, scope) {
    document.getElementById("mixer-scene").title =
      `Añade las ${size} ${group} más registradas en ${month} · ${scope}`;
  }
  function setCatalogAvailable(count) {
    document.getElementById("mixer-search-toggle").disabled = !count;
  }
  return {
    updateSceneButton,
    setCatalogAvailable,
    setMixerStatus,
    updateMixerControls,
    setMixerOpen,
    setMixerCatalogOpen,
    setupMixer,
  };
}

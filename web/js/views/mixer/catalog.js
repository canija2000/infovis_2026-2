/** Presenta y filtra el catálogo de especies disponibles para mezclar. */
export function createMixerCatalog({ species: allSpecies, tracks, onAdd }) {
  const mixerCards = new Map();
  let mixerClass = "all";
  const normalizeMixerName = (value) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  function filterMixerCatalog() {
    const query = normalizeMixerName(
      document.getElementById("mixer-query").value.trim(),
    );
    let visible = 0;
    for (const { element, search, cls } of mixerCards.values()) {
      element.hidden =
        (mixerClass !== "all" && cls !== mixerClass) || !search.includes(query);
      if (!element.hidden) visible++;
    }
    document.getElementById("mixer-result-count").textContent =
      `${visible} ${visible === 1 ? "especie disponible" : "especies disponibles"}`;
  }
  function renderMixerCatalog(available, images) {
    const imageBySid = new Map(
      (images?.species || []).map((entry) => [entry.sid, entry.images[0]]),
    );
    const grid = document.getElementById("mixer-grid");
    const fragment = document.createDocumentFragment();
    mixerCards.clear();
    for (const entry of available) {
      const species = allSpecies[entry.sid];
      const card = document.createElement("button");
      card.type = "button";
      card.className = "mixer-card";
      card.dataset.class = species.class;
      card.setAttribute("aria-pressed", String(tracks.has(entry.sid)));
      card.title = `Añadir ${species.comName} a la mezcla`;
      const photo = document.createElement("span");
      photo.className = "mixer-card-photo";
      const fallback = document.createElement("span");
      fallback.textContent = species.comName[0];
      photo.append(fallback);
      const firstImage = imageBySid.get(entry.sid);
      if (firstImage?.url) {
        const img = document.createElement("img");
        img.src = firstImage.url;
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        img.addEventListener("error", () => img.remove());
        photo.append(img);
      }
      const info = document.createElement("span");
      info.className = "mixer-card-info";
      const name = document.createElement("strong");
      name.textContent = species.comName;
      const cls = document.createElement("small");
      cls.textContent =
        {
          residente: "Residente",
          visitante_estival: "De verano",
          visitante_invernal: "De invierno",
        }[species.class] +
        (entry.recordings[0].mixer ? "" : " · audio original");
      info.append(name, cls);
      const selected = document.createElement("span");
      selected.className = "mixer-card-selected";
      selected.textContent = "✓";
      selected.setAttribute("aria-hidden", "true");
      card.append(photo, info, selected);
      card.addEventListener("click", () => onAdd(entry.sid));
      fragment.append(card);
      mixerCards.set(entry.sid, {
        element: card,
        search: normalizeMixerName(`${species.comName} ${species.sciName}`),
        cls: species.class,
      });
    }
    grid.replaceChildren(fragment);
    filterMixerCatalog();
  }

  function setClass(value) {
    mixerClass = value;
    filterMixerCatalog();
  }
  function markSelected(sid, selected) {
    mixerCards.get(sid)?.element.setAttribute("aria-pressed", String(selected));
  }

  return { renderMixerCatalog, filterMixerCatalog, setClass, markSelected };
}

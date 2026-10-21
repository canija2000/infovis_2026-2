/** Presenta fotografías, grabaciones y sus atribuciones, con datos ya cargados. */
export function createSpeciesMedia({ data, onClipPlay = () => {} }) {
  function showSoundLoading() {
    document.getElementById("p-sound").innerHTML =
      `<p class="muted">Buscando grabaciones…</p>`;
  }
  function showSoundError() {
    document.getElementById("p-sound").innerHTML =
      `<p class="muted">No se pudo cargar el índice de cantos.</p>`;
  }
  function clearImages() {
    document.getElementById("p-images").replaceChildren();
  }
  function showImagesError() {
    document.getElementById("p-images").textContent =
      "No se pudieron cargar las fotografías.";
  }
  function renderSound(sid, entry) {
    const box = document.getElementById("p-sound");
    if (!entry) return (box.innerHTML = "");
    const name =
      entry.xcName !== data.species[sid].sciName
        ? ` (en Xeno-canto: <i>${entry.xcName}</i>)`
        : "";
    if (!entry.recordings.length) {
      box.innerHTML = `<h3>Canto</h3><p class="muted">Aún no hay un clip para esta especie${name}. <a href="${entry.searchUrl}" target="_blank" rel="noopener">Escuchar en Xeno-canto ↗</a></p>`;
      return;
    }
    box.innerHTML =
      `<h3>Canto${name}</h3>` +
      entry.recordings
        .map(
          (r) =>
            `<figure class="rec"><audio controls preload="none" src="${r.src}"></audio>` +
            `<figcaption><a href="${r.url}" target="_blank" rel="noopener">XC${r.id}</a> · ${r.recordist || "autor s/i"}` +
            ` · ${r.type || ""} · ${r.country || ""} · <a href="${r.license}" target="_blank" rel="noopener">licencia</a>` +
            `<br><span class="muted">Clip de 6 s (el tramo con más canto) de la grabación original.</span></figcaption></figure>`,
        )
        .join("");
    box
      .querySelectorAll("audio")
      .forEach((audio) => audio.addEventListener("play", onClipPlay));
  }

  function renderImages(sid, photos) {
    const box = document.getElementById("p-images");
    if (!photos.length) return;

    const title = document.createElement("h3");
    title.textContent = "Fotografías";
    const gallery = document.createElement("div");
    gallery.className = "image-gallery";
    const figures = photos.map((photo, index) => {
      const figure = document.createElement("figure");
      figure.hidden = index > 0;
      const img = document.createElement("img");
      img.src = photo.url;
      img.alt = `${data.species[sid].comName}, fotografía ${index + 1}`;
      img.loading = "lazy";
      img.decoding = "async";
      const caption = document.createElement("figcaption");
      const source = document.createElement("a");
      source.href = photo.source;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      source.textContent = photo.author;
      const license = document.createElement("a");
      license.href = photo.license;
      license.target = "_blank";
      license.rel = "noopener noreferrer";
      license.textContent = photo.licenseCode || "CC BY";
      caption.append(source, " · ", license, " · ", photo.provider || "GBIF");
      figure.append(img, caption);
      gallery.append(figure);
      return figure;
    });
    box.append(title, gallery);
    if (photos.length > 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "image-more ghost";
      button.textContent = `Mostrar más (${photos.length - 1})`;
      button.setAttribute("aria-expanded", "false");
      button.addEventListener("click", () => {
        const expanded = button.getAttribute("aria-expanded") !== "true";
        figures.slice(1).forEach((figure) => {
          figure.hidden = !expanded;
        });
        button.setAttribute("aria-expanded", String(expanded));
        button.textContent = expanded
          ? "Mostrar menos"
          : `Mostrar más (${photos.length - 1})`;
      });
      box.append(button);
    }
  }

  function pauseClips() {
    document
      .querySelectorAll("#p-sound audio")
      .forEach((audio) => audio.pause());
  }

  return {
    showSoundLoading,
    showSoundError,
    clearImages,
    showImagesError,
    pauseClips,
    renderSound,
    renderImages,
  };
}

/** Presenta una pista y delega cambios de volumen y eliminación. */
export function createMixerTrackView() {
  function appendTrack(sid, species, recording, onVolume, onRemove) {
    const item = document.createElement("li");
    item.className = "mixer-track";
    const identity = document.createElement("span");
    identity.className = "mixer-identity";
    const name = document.createElement("strong");
    name.textContent = species.comName;
    name.title = `${species.comName} (${species.sciName})`;
    const credit = document.createElement("a");
    credit.href = recording.url;
    credit.target = "_blank";
    credit.rel = "noopener noreferrer";
    credit.textContent = `XC${recording.id}`;
    credit.title = `Grabación de ${recording.recordist || "autor s/i"} en Xeno-canto`;
    const license = document.createElement("a");
    license.href = recording.license;
    license.target = "_blank";
    license.rel = "noopener noreferrer";
    license.textContent = "CC";
    license.title = "Licencia de la grabación";
    identity.append(name, credit, license);
    if (!recording.mixer) {
      const original = document.createElement("span");
      original.className = "mixer-original";
      original.textContent = "orig.";
      original.title =
        "Grabación original: su licencia no permite limpiarla, puede incluir sonido ambiente";
      identity.append(original);
    }
    const volume = document.createElement("input");
    volume.type = "range";
    volume.id = `mixer-volume-${sid}`;
    volume.min = "0";
    volume.max = "100";
    volume.value = "50";
    volume.setAttribute("aria-label", `Volumen de ${species.comName}`);
    const value = document.createElement("output");
    value.htmlFor = volume.id;
    value.textContent = "50 %";
    volume.addEventListener("input", () => {
      onVolume(Number(volume.value) / 100);
      value.textContent = `${volume.value} %`;
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "mixer-remove";
    remove.textContent = "✕";
    remove.title = "Quitar de la mezcla";
    remove.setAttribute("aria-label", `Quitar ${species.comName} de la mezcla`);
    remove.addEventListener("click", () => {
      onRemove();
      item.remove();
    });
    item.append(identity, volume, value, remove);
    document.getElementById("mixer-tracks").append(item);
  }

  return { appendTrack };
}

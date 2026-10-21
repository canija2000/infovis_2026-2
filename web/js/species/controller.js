/** Coordinate species media loading and ignore late success responses after selection changes. */
export function createSpeciesDetail({ state, media, panel, mediaView }) {
  async function renderSound(sid) {
    mediaView.showSoundLoading();
    panel.setYearAvailable(null);
    try {
      await media.loadSounds();
    } catch (_) {
      mediaView.showSoundError();
      return;
    }
    if (state.species !== sid) return;
    const entry = media.soundEntry(sid);
    mediaView.renderSound(sid, entry);
    panel.setYearAvailable(!!entry?.recordings.length);
  }
  async function renderImages(sid) {
    mediaView.clearImages();
    try {
      await media.loadImages();
    } catch (_) {
      if (state.species === sid) mediaView.showImagesError();
      return;
    }
    if (state.species !== sid) return;
    const photos = (
      media.getImages().species.find((entry) => entry.sid === sid)?.images || []
    ).slice(0, 8);
    mediaView.renderImages(sid, photos);
  }
  function renderSpecies(sid) {
    panel.renderSpecies(sid);
    renderSound(sid);
    renderImages(sid);
  }
  return { renderSpecies };
}

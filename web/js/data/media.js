/** Carga y conserva los índices de cantos y fotografías, bajo demanda. */
export function createMediaRepository() {
  let sounds = null,
    soundsPromise = null,
    images = null,
    imagesPromise = null;
  async function loadSounds() {
    if (!sounds) {
      if (!soundsPromise)
        soundsPromise = fetch("data/sounds.json?v=mixer-3")
          .then((r) => {
            if (!r.ok) throw new Error(`sounds.json: ${r.status}`);
            return r.json();
          })
          .catch((err) => {
            soundsPromise = null;
            throw err;
          });
      sounds = await soundsPromise;
    }
    return sounds;
  }
  async function loadImages() {
    if (!images) {
      if (!imagesPromise)
        imagesPromise = fetch("data/images.json")
          .then((r) => {
            if (!r.ok) throw new Error(`images.json: ${r.status}`);
            return r.json();
          })
          .catch((err) => {
            imagesPromise = null;
            throw err;
          });
      images = await imagesPromise;
    }
    return images;
  }
  const soundEntry = (sid) =>
    sounds && sounds.species.find((x) => x.sid === sid);

  return {
    loadSounds,
    loadImages,
    soundEntry,
    getSounds: () => sounds,
    getImages: () => images,
  };
}

/** Only the page coordinator changes this selection. */
export function createRegionalCalendarState() {
  // playingRegion: región cuyo año se está escuchando, o null.
  return {
    species: "Sephanoides sephaniodes",
    allRegions: false,
    playingRegion: null,
  };
}

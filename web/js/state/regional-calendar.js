/** Only the page coordinator changes this selection. */
export function createRegionalCalendarState() {
  // playingRegion: región cuyo año se está escuchando; playingScene: ejemplo de la leyenda sonora.
  return {
    species: "Sephanoides sephaniodes",
    allRegions: false,
    playingRegion: null,
    playingScene: null,
  };
}

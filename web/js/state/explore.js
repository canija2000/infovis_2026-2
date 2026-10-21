export function createExploreState() {
  return {
    scope: 0,
    month: 0,
    tab: 1,
    expanded: false,
    species: null,
    muted: false,
    yearPlaying: false, // «Escuchar su año» de la especie abierta
  };
}

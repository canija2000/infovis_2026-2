export function createExploreState() {
  return {
    scope: 0,
    month: 0,
    tab: 1,
    expanded: false,
    species: null,
    yearPlaying: false, // «Escuchar su año» de la especie abierta
  };
}

export const MIXER_SCENE_SIZE = 6;
export function sceneSpecies(data, state, sounds) {
  const withSong = new Set(
    sounds.species
      .filter((entry) => entry.recordings.length)
      .map((entry) => entry.sid),
  );
  return (data.byScope.get(state.scope) || [])
    .filter(
      (r) =>
        r.cls === state.tab && r.freq[state.month] > 0 && withSong.has(r.sid),
    )
    .sort((a, b) => b.freq[state.month] - a.freq[state.month])
    .slice(0, MIXER_SCENE_SIZE)
    .map((r) => r.sid);
}

export function createMixerState() {
  return { tracks: new Map(), playing: false, synced: false };
}

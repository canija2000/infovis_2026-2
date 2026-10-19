export function createOverviewState() {
  return { month: 0 };
}
export function createMapState() {
  return { mode: "zones", region: 7 };
}
export function createSoundState() {
  let muted = false;
  try {
    muted = localStorage.getItem("loop-muted") === "1";
  } catch (_) {
    /* same default without storage */
  }
  return { scope: 0, paused: false, muted, mode: "wave", speed: 1 };
}

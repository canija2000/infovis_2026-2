/** Describe cantos, copias y posiciones estéreo de cada compás de la portada. */
import { d3 } from "../shared/d3.js";
import { seeded } from "../shared/random.js";
export function createOverviewPlan({ sound, getData, preload }) {
  const voicesFor = (m) =>
    (getData().scopes[String(sound.scope)] || getData().scopes["0"])[m];
  const clipsFor = (m) =>
    voicesFor(m).map(([sid]) => getData().species[sid].clip);

  function planBar(m, b) {
    const voices = voicesFor(m);
    const total = d3.sum(voices, (v) => v[1]) || 1;
    const hits = [];
    voices.forEach(([sid, copies], vi) => {
      for (let k = 0; k < copies; k++) {
        const seed = (((m * 8 + b) * 32 + vi) * 8 + k) * 31 + sid;
        const sp = getData().species[sid];
        hits.push({
          url: sp.clip,
          win: sp.win,
          gain: 0.6 / Math.sqrt(total),
          pan: (seeded(seed)() * 2 - 1) * 0.7,
          seed: seed * 7 + 3,
        });
      }
    });
    if (b === 0) preload(clipsFor((m + 1) % 12)); // precarga el mes siguiente
    return { tick: b === 0, hits };
  }

  return { voicesFor, clipsFor, planBar };
}

/** Describe cantos, copias, colchón armónico y posiciones estéreo de cada compás de la portada. */
import { d3 } from "../shared/d3.js";
import { seeded } from "../shared/random.js";

// Clases estacionales regionales cuando difieren de la clase nacional en loop.json (0=residente, 1=verano, 2=invierno).
const REGIONAL_CLASS = {
  1: { 40: 0, 122: 2, 130: 2, 159: 2, 174: 2 },
  2: {
    12: 1,
    13: 2,
    25: 1,
    68: 1,
    70: 2,
    122: 2,
    138: 1,
    142: 1,
    154: 1,
    156: 1,
    159: 2,
    163: 2,
    204: 2,
    206: 1,
    226: 1,
  },
  3: { 40: 2, 144: 2, 157: 2, 159: 2, 208: 1 },
  4: { 11: 2, 30: 2, 36: 1, 45: 2, 68: 2, 117: 2, 138: 1 },
  5: { 55: 2, 68: 2 },
  6: { 55: 2 },
  7: { 47: 2, 139: 1 },
  8: { 15: 2, 30: 2, 37: 1, 55: 2, 68: 2 },
  9: { 37: 1, 65: 2, 68: 1, 80: 1, 93: 1, 98: 2 },
  10: { 15: 2, 18: 2, 23: 2, 25: 2, 39: 1, 47: 1, 48: 1, 98: 1 },
  11: { 15: 2, 55: 2, 66: 1, 111: 1 },
  12: { 6: 1, 16: 0, 36: 1, 37: 1, 45: 2, 115: 2 },
  13: { 6: 1, 15: 2, 16: 0, 30: 1, 56: 2, 66: 1, 109: 1, 111: 1 },
  14: { 6: 1, 16: 0, 70: 2, 74: 2, 77: 1, 107: 2 },
  15: {
    2: 1,
    3: 1,
    5: 2,
    6: 1,
    11: 2,
    15: 2,
    16: 1,
    33: 1,
    52: 1,
    80: 2,
    115: 2,
  },
  16: {
    3: 1,
    5: 2,
    6: 1,
    7: 2,
    14: 2,
    25: 2,
    33: 1,
    52: 1,
    102: 1,
    153: 2,
  },
};

// Conteos mensuales [residentes, verano, invierno] por ámbito (0 = Chile, 1..16 = regiones), de region_month.json.
const SCOPE_COUNTS = {
  0: [
    [214, 105, 11],
    [214, 97, 13],
    [214, 85, 15],
    [214, 65, 19],
    [213, 48, 26],
    [212, 33, 19],
    [213, 34, 20],
    [214, 42, 18],
    [214, 58, 21],
    [214, 89, 21],
    [213, 106, 17],
    [214, 104, 13],
  ],
  1: [
    [107, 38, 16],
    [108, 33, 13],
    [108, 32, 13],
    [108, 31, 20],
    [108, 29, 24],
    [107, 13, 21],
    [107, 12, 21],
    [107, 17, 20],
    [108, 27, 22],
    [108, 39, 22],
    [108, 39, 19],
    [108, 33, 16],
  ],
  2: [
    [27, 29, 9],
    [28, 29, 17],
    [28, 29, 30],
    [23, 11, 7],
    [28, 22, 24],
    [28, 15, 20],
    [26, 20, 28],
    [25, 9, 18],
    [26, 30, 24],
    [28, 40, 37],
    [28, 34, 18],
    [23, 21, 7],
  ],
  3: [
    [55, 36, 20],
    [54, 26, 8],
    [54, 32, 24],
    [53, 17, 28],
    [55, 15, 28],
    [54, 11, 33],
    [54, 11, 30],
    [54, 13, 34],
    [55, 26, 34],
    [55, 37, 35],
    [55, 38, 30],
    [54, 33, 17],
  ],
  4: [
    [45, 41, 18],
    [45, 42, 22],
    [45, 29, 19],
    [42, 24, 21],
    [45, 17, 40],
    [45, 16, 39],
    [45, 14, 43],
    [45, 18, 43],
    [45, 29, 46],
    [45, 39, 39],
    [44, 39, 26],
    [45, 40, 20],
  ],
  5: [
    [96, 49, 14],
    [96, 51, 13],
    [96, 43, 13],
    [96, 21, 16],
    [97, 26, 20],
    [96, 11, 23],
    [96, 16, 26],
    [97, 21, 23],
    [96, 28, 19],
    [96, 49, 17],
    [96, 44, 11],
    [96, 49, 8],
  ],
  6: [
    [110, 65, 7],
    [109, 49, 7],
    [110, 42, 8],
    [109, 21, 13],
    [109, 16, 19],
    [107, 14, 17],
    [110, 12, 19],
    [110, 19, 16],
    [110, 24, 19],
    [110, 56, 15],
    [110, 66, 10],
    [110, 61, 8],
  ],
  7: [
    [88, 48, 6],
    [87, 45, 5],
    [88, 42, 4],
    [88, 23, 13],
    [88, 19, 12],
    [88, 9, 12],
    [88, 11, 10],
    [88, 16, 14],
    [88, 25, 11],
    [88, 43, 10],
    [88, 48, 6],
    [88, 49, 6],
  ],
  8: [
    [82, 30, 15],
    [82, 31, 15],
    [82, 20, 15],
    [82, 16, 19],
    [82, 12, 22],
    [82, 6, 19],
    [81, 13, 23],
    [82, 9, 21],
    [82, 13, 20],
    [82, 27, 18],
    [82, 28, 13],
    [82, 31, 13],
  ],
  9: [
    [83, 53, 16],
    [82, 50, 18],
    [83, 36, 14],
    [81, 24, 16],
    [83, 21, 22],
    [82, 10, 17],
    [82, 16, 22],
    [82, 16, 19],
    [80, 30, 19],
    [83, 42, 16],
    [83, 43, 9],
    [83, 56, 9],
  ],
  10: [
    [33, 36, 16],
    [34, 52, 24],
    [32, 20, 13],
    [33, 13, 18],
    [34, 18, 23],
    [32, 15, 18],
    [34, 20, 30],
    [33, 13, 18],
    [34, 25, 23],
    [33, 26, 17],
    [33, 37, 15],
    [34, 39, 16],
  ],
  11: [
    [86, 34, 17],
    [86, 34, 16],
    [85, 23, 21],
    [85, 12, 20],
    [85, 12, 28],
    [83, 9, 23],
    [86, 14, 26],
    [85, 11, 25],
    [85, 18, 24],
    [86, 41, 24],
    [85, 30, 14],
    [85, 30, 12],
  ],
  12: [
    [74, 46, 13],
    [74, 47, 14],
    [74, 34, 11],
    [74, 26, 11],
    [74, 22, 15],
    [71, 14, 10],
    [74, 17, 14],
    [74, 24, 15],
    [74, 31, 16],
    [74, 41, 22],
    [74, 46, 13],
    [74, 49, 10],
  ],
  13: [
    [62, 40, 13],
    [62, 48, 18],
    [61, 35, 14],
    [61, 16, 17],
    [62, 22, 24],
    [62, 11, 19],
    [61, 15, 23],
    [62, 18, 20],
    [60, 25, 21],
    [62, 40, 19],
    [62, 39, 14],
    [62, 37, 12],
  ],
  14: [
    [90, 47, 5],
    [91, 46, 5],
    [91, 42, 12],
    [91, 22, 10],
    [91, 18, 15],
    [90, 12, 13],
    [90, 20, 15],
    [91, 14, 14],
    [90, 25, 11],
    [91, 41, 12],
    [91, 42, 10],
    [91, 47, 6],
  ],
  15: [
    [31, 48, 23],
    [31, 45, 24],
    [31, 41, 23],
    [31, 19, 22],
    [31, 13, 29],
    [30, 4, 14],
    [31, 8, 22],
    [30, 5, 17],
    [31, 27, 30],
    [31, 50, 28],
    [31, 41, 25],
    [31, 41, 19],
  ],
  16: [
    [55, 79, 13],
    [55, 74, 15],
    [55, 65, 15],
    [55, 36, 19],
    [55, 27, 18],
    [55, 14, 15],
    [54, 17, 14],
    [55, 20, 16],
    [55, 43, 14],
    [55, 69, 15],
    [55, 74, 14],
    [55, 81, 10],
  ],
};

export function createOverviewPlan({ sound, getData, getCounts, preload }) {
  const rawVoicesFor = (m) =>
    (getData().scopes[String(sound.scope)] || getData().scopes["0"])[m];
  const classOf = (sid, scope = sound.scope) =>
    REGIONAL_CLASS[scope]?.[sid] ?? getData().species[sid].cls;

  function countsForScope(scope = sound.scope) {
    if (getCounts) {
      const custom = getCounts(scope);
      if (custom && custom.length === 12) return custom;
    }
    return SCOPE_COUNTS[scope] || SCOPE_COUNTS[0];
  }

  function waveMetrics(m, scope = sound.scope) {
    const rows = countsForScope(scope);
    const V = rows.map((r) => r[1]);
    const I = rows.map((r) => r[2]);
    const T = rows.map((r) => r[0] + r[1] + r[2]);
    const vmin = Math.min(...V),
      vmax = Math.max(...V);
    const imin = Math.min(...I),
      imax = Math.max(...I);
    const tmin = Math.min(...T),
      tmax = Math.max(...T);
    const peak = Math.max(vmax, imax, 1);
    const [res, summer, winter] = rows[m];
    const summerLevel = vmax > vmin ? (summer - vmin) / (vmax - vmin) : 0;
    const winterLevel = imax > imin ? (winter - imin) / (imax - imin) : 0;
    const richnessLevel = tmax > tmin ? (T[m] - tmin) / (tmax - tmin) : 0.5;
    const summerShare = summer / peak;
    const winterShare = winter / peak;
    const waveIndex = summerLevel - winterLevel;
    return {
      res,
      summer,
      winter,
      total: T[m],
      summerLevel,
      winterLevel,
      richnessLevel,
      summerShare,
      winterShare,
      waveIndex,
    };
  }

  function voicesFor(m) {
    const raw = rawVoicesFor(m);
    if (!sound.mode) return raw;
    const metrics = waveMetrics(m);
    let resSeen = 0;
    const result = [];
    for (const [sid, copies] of raw) {
      const cls = classOf(sid);
      if (sound.mode === "all") {
        result.push([sid, copies, cls]);
        continue;
      }
      if (cls === 0) {
        if (sound.mode === "visitors") continue;
        if (resSeen < 2) {
          result.push([sid, 1, 0]);
          resSeen += 1;
        }
      } else if (cls === 1) {
        const scale =
          (0.25 + 1.05 * metrics.summerLevel) *
          Math.max(0.5, Math.sqrt(metrics.summerShare));
        const eff = Math.min(
          4,
          Math.max(
            metrics.summerLevel >= 0.15 ? 1 : 0,
            Math.round(copies * scale + (metrics.summerLevel >= 0.7 ? 0.6 : 0)),
          ),
        );
        if (eff > 0) result.push([sid, eff, 1]);
      } else if (cls === 2) {
        const scale =
          (0.25 + 0.85 * metrics.winterLevel) *
          Math.max(0.45, Math.sqrt(metrics.winterShare));
        const eff = Math.min(
          4,
          Math.max(
            metrics.winterLevel >= 0.2 ? 1 : 0,
            Math.round(copies * scale),
          ),
        );
        if (eff > 0) result.push([sid, eff, 2]);
      }
    }
    if (!result.length) {
      const fallback = raw.find(([sid]) => classOf(sid) !== 0) || raw[0];
      if (fallback) result.push([fallback[0], 1, classOf(fallback[0])]);
    }
    return result;
  }

  const clipsFor = (m) =>
    rawVoicesFor(m).map(([sid]) => getData().species[sid].clip);

  function stereoPan(cls, u) {
    if (cls === 1) return -0.78 + u * 0.5; // Verano a la izquierda (-0.78 .. -0.28)
    if (cls === 2) return 0.28 + u * 0.5; // Invierno a la derecha (+0.28 .. +0.78)
    return (u * 2 - 1) * 0.18; // Residentes al centro (-0.18 .. +0.18)
  }

  function planBar(m, b) {
    if (!sound.mode) {
      const voices = rawVoicesFor(m);
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
      if (b === 0) preload(clipsFor((m + 1) % 12));
      return { tick: b === 0, hits };
    }

    const voices = voicesFor(m);
    const metrics = waveMetrics(m);
    const visitorCopies =
      voices
        .filter(([, , cls]) => cls !== 0)
        .reduce((acc, [, c]) => acc + c, 0) || 1;
    const allCopies = voices.reduce((acc, [, c]) => acc + c, 0) || 1;
    const hits = [];
    voices.forEach(([sid, copies, cls], vi) => {
      const sp = getData().species[sid];
      const level =
        cls === 1 ? metrics.summerLevel : cls === 2 ? metrics.winterLevel : 0.5;
      const gain =
        sound.mode === "all"
          ? (cls === 0 ? 0.44 : 0.72) / Math.sqrt(allCopies)
          : cls === 0
            ? 0.13
            : (0.24 + 0.14 * level) / Math.pow(visitorCopies, 0.32);
      for (let k = 0; k < copies; k++) {
        const seed = (((m * 8 + b) * 32 + vi) * 8 + k) * 31 + sid;
        hits.push({
          url: sp.clip,
          win: sp.win,
          gain,
          pan: stereoPan(cls, seeded(seed)()),
          seed: seed * 7 + 3,
        });
      }
    });
    if (b === 0) preload(clipsFor((m + 1) % 12));

    const root = 110 * Math.pow(2, (metrics.waveIndex * 2) / 12);
    const interval = metrics.waveIndex >= 0 ? 1.5 : 4 / 3;
    const pad =
      sound.mode === "visitors"
        ? null
        : {
            freqs: [root, root * interval],
            gain: 0.036 + 0.018 * metrics.summerLevel,
            cutoff: Math.round(
              460 + 540 * Math.max(0, (metrics.waveIndex + 1) / 2),
            ),
          };
    const tickFreq = Math.round(
      110 * Math.pow(2, (metrics.richnessLevel * 7) / 12),
    );
    return {
      tick: b === 0,
      tickFreq,
      pad,
      hits,
    };
  }

  return { voicesFor, clipsFor, planBar, waveMetrics, classOf };
}

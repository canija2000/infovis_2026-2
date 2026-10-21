import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as d3 from "d3";
import {
  createPulseCurve,
  curveAt,
  tangents,
  monthAt,
  positionOf,
} from "../../web/js/overview/pulse-curve.js";
import {
  LAYERS,
  SPECIES,
  layerLevel,
  layerState,
  nextInterval,
  residentDuck,
} from "../../web/js/audio/season-chorus-plan.js";
import {
  detectOnset,
  createMeterState,
} from "../../web/js/audio/season-chorus-meter.js";

const root = path.resolve(import.meta.dirname, "../..");
const overview = JSON.parse(
  fs.readFileSync(path.join(root, "web/data/overview.json"), "utf8"),
);

// Evalúa el path de d3 (M x,y C … C …) en x = p, para comparar con la curva propia.
function d3CurveAt(values, p) {
  const d = d3
    .line()
    .x((_, i) => i)
    .y((v) => v)
    .curve(d3.curveMonotoneX)
    .digits(null)(values);
  const nums = d.match(/-?\d*\.?\d+(e-?\d+)?/g).map(Number);
  const segments = [];
  let x0 = nums[0],
    y0 = nums[1];
  for (let i = 2; i < nums.length; i += 6) {
    const [cx1, cy1, cx2, cy2, x1, y1] = nums.slice(i, i + 6);
    segments.push({ x0, y0, cy1, cy2, x1, y1, cx1, cx2 });
    x0 = x1;
    y0 = y1;
  }
  const seg = segments[Math.min(segments.length - 1, Math.floor(p))];
  const s = p - seg.x0;
  // Con x equiespaciado los controles de d3 quedan en los tercios: x es lineal en el parámetro.
  assert.ok(Math.abs(seg.cx1 - (seg.x0 + 1 / 3)) < 1e-9);
  const u = 1 - s;
  return (
    u * u * u * seg.y0 +
    3 * u * u * s * seg.cy1 +
    3 * u * s * s * seg.cy2 +
    s * s * s * seg.y1
  );
}

test("la curva continua coincide con la que dibuja d3.curveMonotoneX", () => {
  const series = [
    [214, 213, 214, 214, 213, 214, 214, 214, 214, 214, 213, 212],
    [34, 42, 58, 89, 106, 104, 105, 97, 85, 65, 48, 33],
    [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
    [0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10],
  ];
  for (const values of series) {
    const slopes = tangents(values);
    for (let p = 0; p <= 11; p += 0.125)
      assert.ok(
        Math.abs(curveAt(values, slopes, p) - d3CurveAt(values, p)) < 1e-6,
        `p=${p}`,
      );
  }
});

test("en cada mes, los grosores de banda son los conteos publicados", () => {
  const curve = createPulseCurve(overview.months);
  for (let p = 0; p <= 11; p++) {
    const { counts, edges } = curve.at(p);
    const month = monthAt(p);
    assert.equal(positionOf(month), p);
    overview.months[month].forEach((v, k) =>
      assert.ok(Math.abs(counts[k] - v) < 1e-9, `${month} ${k}`),
    );
    assert.ok(
      Math.abs(edges[3] - overview.months[month].reduce((a, b) => a + b)) <
        1e-9,
    );
  }
  assert.deepEqual(curve.peak, [214, 106, 26]);
  // Entre meses, los grosores varían de forma suave y nunca son negativos.
  for (let p = 0; p <= 11; p += 0.05)
    curve.at(p).counts.forEach((c) => assert.ok(c >= 0));
});

test("las capas de visitantes siguen su curva; las residentes no cambian", () => {
  const [, summer, winter] = [0, 1, 2].map((k) =>
    [33, 106].map((c) => layerState(k, c, 106)),
  );
  assert.ok(summer[1].birds > summer[0].birds);
  assert.ok(summer[1].rate > summer[0].rate * 3);
  assert.ok(summer[0].distance > summer[1].distance);
  assert.equal(layerLevel(0, 120, 214), 1);
  assert.equal(layerState(0, 120, 214).distance, LAYERS[0].far);
  assert.ok(winter[1].birds <= LAYERS[2].maxBirds);
  assert.equal(layerState(1, 106, 106).birds, LAYERS[1].maxBirds);
  assert.equal(layerState(2, 26, 26).birds, LAYERS[2].maxBirds);
  assert.ok(LAYERS[1].maxBirds > LAYERS[2].maxBirds);
  assert.ok(residentDuck([1, 1, 0]) < residentDuck([1, 0.1, 0.1]));
  assert.equal(nextInterval(0), Infinity);
  assert.ok(Math.abs(nextInterval(2, () => 1 - Math.exp(-1)) - 0.5) < 1e-9);
});

test("las especies del coro existen, tienen canto y son de su grupo", () => {
  const sounds = JSON.parse(
    fs.readFileSync(path.join(root, "web/data/sounds.json"), "utf8"),
  );
  const bySid = new Map(sounds.species.map((s) => [s.sid, s]));
  for (const [k, names] of Object.entries(SPECIES)) {
    for (const name of names) {
      const i = overview.names.indexOf(name);
      assert.ok(i >= 0, name);
      const [sid, cls] = overview.species[i];
      assert.equal(cls, Number(k), name);
      const recording = bySid.get(sid)?.recordings?.[0];
      assert.ok(recording, name);
      const file = recording.mixer || recording.src;
      assert.ok(fs.existsSync(path.join(root, "web", file)), file);
    }
  }
});

test("un ataque se detecta al subir el nivel, no en cada cuadro de un canto sostenido", () => {
  const meter = createMeterState();
  const hits = [];
  const frames = [0, 0, 0.2, 0.22, 0.21, 0.2, 0.2, 0.2, 0.02, 0.01, 0.25, 0.24];
  frames.forEach((rms, i) => {
    if (detectOnset(meter, rms, i * 0.05)) hits.push(i);
  });
  assert.deepEqual(hits, [2, 10]);
});

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
  freeSlot,
} from "../../web/js/audio/season-chorus-plan.js";
import {
  analyseSong,
  envelopeAt,
  findOnsets,
  thinOnsets,
  beakOpening,
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
  assert.equal(layerState(0, 214, 214).birds, 1);
  assert.ok(winter[1].birds <= LAYERS[2].maxBirds);
  assert.equal(layerState(1, 106, 106).birds, LAYERS[1].maxBirds);
  assert.equal(layerState(2, 26, 26).birds, LAYERS[2].maxBirds);
  assert.equal(layerState(1, 33, 106).birds, 1);
  assert.ok(LAYERS[1].maxBirds > LAYERS[2].maxBirds);
  assert.ok(residentDuck([1, 1, 0]) < residentDuck([1, 0.1, 0.1]));
  assert.equal(nextInterval(0), Infinity);
  assert.ok(Math.abs(nextInterval(2, () => 1 - Math.exp(-1)) - 0.5) < 1e-9);
});

test("cada ave nueva toma el primer lugar libre, sin pasar del número de aves del momento", () => {
  const busy = [5, -Infinity, 2, -Infinity];
  assert.equal(freeSlot(busy, 3, 4), 1);
  assert.equal(freeSlot(busy, 3, 1), -1);
  assert.equal(freeSlot(busy, 6, 1), 0);
  assert.equal(freeSlot([-Infinity], 0, 3), 0);
});

test("una especie por grupo: existe, tiene canto, es de su grupo y su tramo cabe en la grabación", () => {
  const sounds = JSON.parse(
    fs.readFileSync(path.join(root, "web/data/sounds.json"), "utf8"),
  );
  const bySid = new Map(sounds.species.map((s) => [s.sid, s]));
  const names = new Set();
  for (const [k, spec] of Object.entries(SPECIES)) {
    names.add(spec.name);
    const i = overview.names.indexOf(spec.name);
    assert.ok(i >= 0, spec.name);
    const [sid, cls] = overview.species[i];
    assert.equal(cls, Number(k), spec.name);
    const recording = bySid.get(sid)?.recordings?.[0];
    assert.ok(recording, spec.name);
    const file = recording.mixer || recording.src;
    assert.ok(fs.existsSync(path.join(root, "web", file)), file);
    assert.ok(spec.start >= 0 && spec.length > 0.3);
    assert.ok(spec.start + spec.length <= 6, spec.name); // los clips duran ~6 s
  }
  assert.equal(names.size, 3);
  assert.deepEqual(
    new Set(Object.values(SPECIES).map((s) => s.note)).size,
    3,
    "cada grupo dibuja sus notas distinto",
  );
});

test("la envolvente y las sílabas de un canto salen de la grabación, antes de tocarla", () => {
  const rate = 8000;
  const samples = new Float32Array(rate); // 1 s: tres sílabas de 1 kHz
  for (const [from, to, amp] of [
    [0.1, 0.2, 0.8],
    [0.4, 0.45, 0.3],
    [0.7, 0.9, 0.6],
  ])
    for (let i = Math.round(from * rate); i < Math.round(to * rate); i++)
      samples[i] = amp * Math.sin((2 * Math.PI * 1000 * i) / rate);
  const song = analyseSong(samples, rate, [300, 3000]);
  const starts = song.onsets.map((o) => Math.round(o.t * 100) / 100);
  assert.equal(starts.length, 3);
  starts.forEach((t, i) =>
    assert.ok(Math.abs(t - [0.1, 0.4, 0.7][i]) <= 0.02, `${t}`),
  );
  assert.ok(song.onsets[0].strength > song.onsets[1].strength);
  assert.ok(envelopeAt(song.env, 0.15) > 0.8);
  assert.ok(envelopeAt(song.env, 0.3) < 0.05);
  assert.equal(envelopeAt(song.env, 5), 0);
  assert.deepEqual(
    findOnsets(Float32Array.from([0, 0.5, 0.6, 0.5, 0.1, 0.05, 0.05, 0.7])).map(
      (o) => Math.round(o.t * 100) / 100,
    ),
    [0.01, 0.07],
  );
  // El pico abre al instante y cierra en unas centésimas.
  assert.equal(beakOpening(0.2, 0.9, 0.016), 0.9);
  assert.ok(beakOpening(0.9, 0, 0.016) < 0.7);
});

test("un silbido largo suelta una sola nota; una ráfaga, varias", () => {
  const trembling = [0, 0.1, 0.2, 0.35, 0.5].map((t, i) => ({
    t,
    strength: [0.6, 0.4, 0.9, 0.5, 0.7][i],
  }));
  assert.deepEqual(
    thinOnsets(trembling, 0.3, 10).map((o) => o.t),
    [0],
  );
  assert.deepEqual(
    thinOnsets(trembling, 0.45, 0.2).map((o) => o.t),
    [0, 0.2, 0.5],
  );
});

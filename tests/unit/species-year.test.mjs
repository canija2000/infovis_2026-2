import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  MONTH_SECONDS,
  SILENT_BELOW,
  bestWindow,
  SCENES,
  exampleStep,
  lowpassRatio,
  planSpeciesYear,
  songPitch,
  stepGain,
  stepLevel,
  stepScene,
} from "../../web/js/audio/species-year-plan.js";
import { createRegionalCalendarRepository } from "../../web/js/data/regional-calendar.js";
import { queryRegionalCalendar } from "../../web/js/overview/regional-calendar.js";

const root = path.resolve(import.meta.dirname, "../..");
const json = (file) =>
  JSON.parse(fs.readFileSync(path.join(root, "web/data", file), "utf8"));

test("level follows profile and regularity; gain grows with it and is silent near zero", () => {
  assert.equal(stepLevel({ profile: null, years: null }), 0);
  assert.equal(stepLevel({ profile: 100, years: 8 }), 1);
  assert.equal(stepLevel({ profile: 100, years: 4 }), 0.5);
  assert.equal(stepLevel({ profile: 50, years: 8 }), 0.5);
  assert.equal(stepGain(SILENT_BELOW / 2), 0);
  let last = 0;
  for (let level = SILENT_BELOW; level <= 1; level += 0.05) {
    const gain = stepGain(level);
    assert.ok(gain > last, `gain increases at level ${level}`);
    last = gain;
  }
  assert.equal(stepGain(1), 1);
  assert.ok(stepGain(SILENT_BELOW) > 0.4, "a faint month is still audible");
});

test("one step per month, evenly spaced", () => {
  const plan = planSpeciesYear(
    [0, 1, 2].map((month) => ({ month, profile: 80, years: 8 })),
    10,
  );
  assert.deepEqual(
    plan.map((step) => step.month),
    [0, 1, 2],
  );
  assert.ok(Math.abs(plan[1].at - plan[0].at - MONTH_SECONDS) < 1e-9);
  assert.ok(plan[0].at > 10);
});

test("three clearly different scenes: more present means more birds, closer and less echo", () => {
  assert.equal(stepScene(0.02), null);
  assert.equal(stepScene(0.2), "far");
  assert.equal(stepScene(0.5), "mid");
  assert.equal(stepScene(0.9), "near");
  const { near, mid, far } = SCENES;
  assert.deepEqual(
    [far.birds, mid.birds, near.birds],
    [1, 2, 4],
    "birds you can count",
  );
  assert.ok(far.wet > mid.wet && mid.wet > near.wet, "farther, more echo");
  assert.ok(
    far.dry < mid.dry && mid.dry < near.dry,
    "farther, less direct sound",
  );
  assert.ok(far.db < mid.db && mid.db < near.db, "farther, quieter");
  assert.ok(
    far.muffle < mid.muffle && near.muffle === null,
    "farther, more muffled",
  );
  for (const scene of ["near", "mid", "far"])
    assert.equal(stepScene(stepLevel(exampleStep(scene))), scene);
  const [step] = planSpeciesYear([{ month: 0, profile: 100, years: 8 }]);
  assert.equal(step.voices.length, 4);
  const onsets = step.voices.map((voice) => voice.at).sort((a, b) => a - b);
  assert.ok(
    onsets.every((at, i) => i === 0 || at - onsets[i - 1] >= 0.25),
    "each bird enters at least 0,25 s after the previous one: they can be told apart",
  );
  assert.ok(
    step.voices.every((voice) => voice.at + voice.duration <= step.at + 1.45),
    "every bird ends before the next month",
  );
  assert.ok(
    Math.abs(
      Math.hypot(...step.voices.map((voice) => voice.gain)) - step.gain,
    ) < 1e-9,
    "the chorus keeps the month's overall level",
  );
});

test("song pitch and filter loss are measured from the clip itself", () => {
  const rate = 44100;
  const tone = (hz) =>
    new Float32Array(rate).map((_, i) =>
      Math.sin((2 * Math.PI * hz * i) / rate),
    );
  assert.ok(Math.abs(songPitch(tone(4000), rate) - 4000) < 50);
  assert.equal(songPitch(tone(200), rate), 1000, "limited to 1–9 kHz");
  const high = tone(6000);
  assert.ok(lowpassRatio(high, rate, 20000) > 0.95, "no filter, no loss");
  assert.ok(
    lowpassRatio(high, rate, 2000) < 0.2,
    "a low cutoff removes a high song",
  );
});

test("best window finds the song inside a mostly quiet clip", () => {
  const rate = 8000;
  const samples = new Float32Array(rate * 6).map((_, i) =>
    i > rate * 3.2 && i < rate * 4.4 ? Math.sin(i / 3) : 0.002,
  );
  const { start, rms } = bestWindow(samples, rate, 1.35);
  assert.ok(start > 2.9 && start < 3.3, `start ${start}`);
  assert.ok(rms > 0.4);
});

test("published data: the regional examples sound where and when the matrix says", () => {
  const data = createRegionalCalendarRepository({
    meta: json("meta.json"),
    species: json("species.json"),
    typical: json("typical_year.json"),
  });
  const year = (species, regionName) => {
    const model = queryRegionalCalendar(data, { species, allRegions: true });
    const row = model.rows.find((item) => item.region.name === regionName);
    return new Map(
      planSpeciesYear(row.cells).map((step) => [step.month, step.gain]),
    );
  };
  // Fío-fío en Metropolitana: visitante de verano, calla en invierno y canta fuerte en verano.
  const fio = year("Elaenia albiceps", "Metropolitana");
  assert.equal(fio.get(6), 0, "julio en silencio");
  assert.ok(fio.get(0) > 0.5, "enero fuerte");
  // Picaflor chico en Los Ríos es residente: suena todo el año.
  const picaflor = year("Sephanoides sephaniodes", "Los Ríos");
  assert.ok([...picaflor.values()].every((gain) => gain > 0.2));
  // Chorlito chileno en Metropolitana es ocasional: a lo más un ave sola y lejana.
  const model = queryRegionalCalendar(data, {
    species: "Charadrius modestus",
    allRegions: true,
  });
  const row = model.rows.find((item) => item.region.name === "Metropolitana");
  const scenes = planSpeciesYear(row.cells)
    .map((step) => step.scene)
    .filter(Boolean);
  assert.ok(scenes.every((scene) => scene === "far"));
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  MONTH_SECONDS,
  SILENT_BELOW,
  bestWindow,
  planSpeciesYear,
  stepGain,
  stepLevel,
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
  // Medio nivel suena a menos de la mitad de la amplitud: la diferencia se oye.
  assert.ok(stepGain(0.5) < 0.45);
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
  // Chorlito chileno en Metropolitana es ocasional: un registro aislado suena apenas.
  const chorlito = year("Charadrius modestus", "Metropolitana");
  assert.ok(Math.max(...chorlito.values()) < 0.3);
});

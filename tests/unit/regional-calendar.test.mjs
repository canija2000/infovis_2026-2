import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRegionalCalendarRepository } from "../../web/js/data/regional-calendar.js";
import { createRegionalCalendarState } from "../../web/js/state/regional-calendar.js";
import { queryRegionalCalendar } from "../../web/js/overview/regional-calendar.js";
import { REGIONAL_EXAMPLES } from "../../web/js/overview/regional-examples.js";
const read = (name) =>
  JSON.parse(
    fs.readFileSync(
      new URL(`../../web/data/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
const payload = {
  meta: read("meta"),
  species: read("species"),
  typical: read("typical_year"),
};
const data = createRegionalCalendarRepository(payload);
const images = read("images");

test("regional examples match the published roles and different spring calendars", () => {
  const state = createRegionalCalendarState();
  const byRegion = () =>
    new Map(
      queryRegionalCalendar(data, state).rows.map((row) => [
        row.region.id,
        row,
      ]),
    );
  let regions = byRegion();
  assert.equal(regions.get(7).cls, 2);
  for (const id of [12, 13, 14]) assert.equal(regions.get(id).cls, 0);
  state.species = "Charadrius modestus";
  regions = byRegion();
  for (const id of [11, 14]) assert.equal(regions.get(id).cls, 2);
  assert.equal(regions.get(16).cls, 0);
  state.species = "Elaenia albiceps";
  regions = byRegion();
  const present = (rid, month) =>
    regions.get(rid).cells.find((cell) => cell.month === month).present;
  assert.equal(
    present(7, 8),
    true,
    "Metropolitana meets presence in September",
  );
  assert.equal(present(16, 8), false);
  assert.equal(present(16, 9), true, "Magallanes meets presence in October");
  assert.equal(regions.get(1).cls, 0);
});

test("all three matrices preserve every published profile, year count and presence bit", () => {
  const original = JSON.stringify(payload);
  for (const example of REGIONAL_EXAMPLES) {
    const state = { species: example.sciName, allRegions: true };
    const model = queryRegionalCalendar(data, state);
    assert.equal(model.rows.length, 16);
    assert.deepEqual(
      model.rows.map((row) => row.region.id),
      Array.from({ length: 16 }, (_, index) => index + 1),
    );
    assert.deepEqual(
      model.photo,
      images.species.find((entry) => entry.sciName === example.sciName)
        .images[0],
      "the embedded photo matches the first one in data/images.json",
    );
    assert.equal(model.rows[0].cells[0].month, 6);
    assert.equal(model.rows[0].cells.at(-1).month, 5);
    for (const row of model.rows) {
      const source = payload.typical.rows.find(
        (item) => item[0] === model.bird.id && item[1] === row.region.id,
      );
      assert.equal(row.cls, source ? source[2] : null);
      for (const cell of row.cells) {
        assert.equal(cell.profile, source ? source[19 + cell.month] : null);
        assert.equal(cell.years, source ? source[31 + cell.month] : null);
        assert.equal(
          cell.present,
          source ? Boolean(source[6] & (1 << cell.month)) : false,
        );
      }
    }
    assert.deepEqual(state, { species: example.sciName, allRegions: true });
  }
  assert.equal(
    JSON.stringify(payload),
    original,
    "queries do not mutate shared data",
  );
});

test("comparison expands without losing its species; missing data differs from zero and occasional records", () => {
  const state = createRegionalCalendarState();
  assert.equal(queryRegionalCalendar(data, state).rows.length, 7);
  state.allRegions = true;
  const model = queryRegionalCalendar(data, state);
  assert.equal(model.bird.sciName, state.species);
  const missing = model.rows.find((row) => row.region.id === 2);
  assert.equal(missing.cls, null);
  assert.ok(missing.cells.every((cell) => cell.profile === null));
  const occasional = model.rows.find((row) => row.region.id === 1);
  assert.equal(occasional.cls, 3);
  assert.ok(occasional.cells.every((cell) => !cell.present));
  assert.ok(occasional.cells.some((cell) => cell.profile === 0));
});

test("presence is never inferred again from the rounded profile", () => {
  const fixture = createRegionalCalendarRepository({
    meta: payload.meta,
    species: payload.species,
    typical: {
      rows: [
        [
          16,
          7,
          2,
          0,
          0,
          0,
          0,
          ...Array(12).fill(0),
          ...Array(12).fill(20),
          ...Array(12).fill(4),
        ],
      ],
    },
  });
  const row = queryRegionalCalendar(
    fixture,
    createRegionalCalendarState(),
  ).rows.find((item) => item.region.id === 7);
  assert.ok(
    row.cells.every(
      (cell) => cell.profile === 20 && cell.years === 4 && !cell.present,
    ),
  );
});

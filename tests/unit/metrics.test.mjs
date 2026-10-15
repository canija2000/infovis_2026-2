import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { describeExample } from "../../web/js/metrics/queries.js";
const root = new URL("../../", import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), "utf8");
const page = read("web/metricas.html");
const example = JSON.parse(
  page.match(
    /<script type="application\/json" id="metrics-example-data">(.*?)<\/script>/s,
  )[1],
);
test("reference preserves every documented anchor and resolves every internal link", () => {
  const ids = [...page.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, "no duplicate targets");
  const anchors = [
    ...read("docs/METRICAS.md").matchAll(/<a id="([^"]+)"/g),
  ].map((m) => m[1]);
  for (const id of anchors)
    assert.ok(ids.includes(id), `missing concept ${id}`);
  for (const [, id] of page.matchAll(/href="#([^"]+)"/g))
    assert.ok(ids.includes(id), `unresolved link ${id}`);
});
test("worked example stays synchronized with the published species and every scope", () => {
  const species = JSON.parse(read("web/data/species.json"));
  const typical = JSON.parse(read("web/data/typical_year.json"));
  assert.deepEqual(
    example.bird,
    species.find((s) => s.sciName === "Elaenia albiceps"),
  );
  assert.deepEqual(
    example.rows,
    typical.rows.filter((r) => r[0] === example.bird.id),
  );
  assert.deepEqual(
    example.scopes,
    JSON.parse(read("web/data/region_month.json")).scopes,
  );
  const national = example.rows.find((r) => r[1] === 0);
  assert.equal(describeExample(national, 0).present, true);
  assert.equal(describeExample(national, 6).present, false);
});
test("presence uses the original mask even if a rounded profile reaches 20 percent", () => {
  const row = [
    0,
    0,
    1,
    0,
    0,
    1,
    0,
    ...Array(12).fill(500),
    ...Array(12).fill(20),
    ...Array(12).fill(4),
  ];
  const result = describeExample(row, 0);
  assert.equal(result.present, false);
  assert.equal(result.days, 15.5);
  assert.ok(Math.abs(result.opacity - 0.65) < 1e-12);
  assert.equal(result.weight, 0.1);
  assert.equal(result.daysMean, 15.2);
  row[6] = 1;
  assert.equal(describeExample(row, 0).present, true);
  assert.equal(describeExample(row, 1).present, false);
});

test("metric queries follow the selected scope without mutating shared rows or selection", async () => {
  const { createMetricsRepository } = await import(
    "../../web/js/data/metrics.js"
  );
  const { createMetricsState } = await import("../../web/js/state/metrics.js");
  const { createMetricsQueries } = await import(
    "../../web/js/metrics/queries.js"
  );
  const data = createMetricsRepository(example);
  const state = createMetricsState();
  const queries = createMetricsQueries({ data, state });
  const originalRows = JSON.stringify(example.rows);
  const national = queries.example();
  assert.equal(national.scopeName, "Chile");
  state.scope = 7;
  state.month = 6;
  const regional = queries.example();
  assert.equal(regional.scopeName, "Metropolitana");
  assert.equal(regional.row[1], 7);
  assert.equal(regional.month, 6);
  assert.equal(regional.monthly.length, 12);
  assert.deepEqual(regional.context, example.scopes[7][6]);
  assert.equal(national.scope, 0, "previous result remains national");
  assert.deepEqual(state, { scope: 7, month: 6 });
  assert.equal(JSON.stringify(example.rows), originalRows);
  state.scope = 999;
  assert.equal(queries.example(), null);
});

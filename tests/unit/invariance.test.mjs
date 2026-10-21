import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as d3 from "d3";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "../..");
const baseline = (file) =>
  execFileSync("git", ["show", `57b6dc8:${file}`], {
    cwd: root,
    encoding: "utf8",
  });
const script = baseline("web/app.js");
globalThis.window = { d3 };
globalThis.d3 = d3;
const json = (file) =>
  JSON.parse(fs.readFileSync(path.join(root, "web/data", file), "utf8"));
globalThis.fetch = async (url) => ({
  ok: true,
  json: async () => json(url.replace(/^data\//, "").split("?")[0]),
});
const { loadAtlas } = await import("../../web/js/data/atlas.js");
const { selectRows } = await import(
  "../../web/js/explore/calendar-selection.js"
);
const { sceneSpecies } = await import("../../web/js/mixer/scene-selection.js");
const { AUSTRAL, CALENDAR } = await import("../../web/js/shared/calendar.js");
const data = await loadAtlas();
const sounds = json("sounds.json");
const fn = (source, name) => {
  const start = source.indexOf(`  function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf("\n  }", start) + 4);
};

test("atlas decoding preserves every original row and the color domain", () => {
  const body = script.slice(
    script.indexOf("  async function load()"),
    script.indexOf(
      "  // ---------------------------------------------------------------- helpers",
    ),
  );
  const original = new Function(
    "d3",
    "fetch",
    `let D;const deviation={domain(value){this.value=value;return this},clamp(){}};${body};return load().then(()=>({D,domain:deviation.value}));`,
  );
  return original(d3, fetch).then(({ D, domain }) => {
    const { deviationDomain, ...actual } = data;
    assert.deepEqual(actual, D);
    assert.deepEqual(deviationDomain, domain);
  });
});

test("calendar keeps selection, pinned species and ordering in all regions/classes", () => {
  const old = new Function(
    "D",
    "state",
    "order",
    `const TAB_LIMIT=[12,24,16];const tabOrder=()=>order;${fn(script, "arrival")};${fn(script, "selectRows")};return selectRows();`,
  );
  for (const scope of data.byScope.keys())
    for (const tab of [0, 1, 2])
      for (const expanded of [false, true]) {
        const pool = data.byScope.get(scope).filter((r) => r.cls === tab),
          species = pool.at(-1)?.sid ?? null;
        const state = { scope, tab, expanded, species };
        const order = tab === 2 ? CALENDAR : AUSTRAL;
        assert.deepEqual(
          selectRows(data, state, order),
          old(data, state, order),
        );
      }
});

test("mix scene selection retains the original six-song policy", () => {
  const old = new Function(
    "D",
    "state",
    "sounds",
    `const MIXER_SCENE_SIZE=6;${fn(script, "sceneSpecies")};return sceneSpecies();`,
  );
  for (const scope of data.byScope.keys())
    for (const tab of [0, 1, 2])
      for (let month = 0; month < 12; month++) {
        const state = { scope, tab, month };
        assert.deepEqual(
          sceneSpecies(data, state, sounds),
          old(data, state, sounds),
        );
      }
});

test("CSS preserves the original cascade byte for byte", () => {
  const entry = fs.readFileSync(path.join(root, "web/css/site.css"), "utf8");
  const paths = [...entry.matchAll(/@import url\("\.\/(.*?)"\)/g)].map(
    (m) => m[1],
  );
  assert.equal(
    paths
      .map((f) => fs.readFileSync(path.join(root, "web/css", f), "utf8"))
      .join(""),
    baseline("web/styles.css"),
  );
  assert.equal(
    fs.readFileSync(path.join(root, "web/css/overview.css"), "utf8"),
    baseline("web/inicio.css"),
  );
});

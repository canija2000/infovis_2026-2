import test from "node:test";
import assert from "node:assert/strict";
import * as d3 from "d3";
import { createMediaRepository } from "../../web/js/data/media.js";
globalThis.window = { d3 };
const { createRegionLoader } = await import("../../web/js/data/spatial.js");

test("media indices are lazy, coalesce concurrent calls and retry failed requests", async () => {
  const calls = [];
  let fail = true;
  globalThis.fetch = async (url) => {
    calls.push(url);
    if (fail) {
      fail = false;
      return { ok: false, status: 503 };
    }
    return { ok: true, json: async () => ({ species: [] }) };
  };
  const repo = createMediaRepository();
  assert.deepEqual(calls, []);
  await assert.rejects(repo.loadSounds(), /503/);
  const [a, b] = await Promise.all([repo.loadSounds(), repo.loadSounds()]);
  assert.equal(a, b);
  assert.equal(calls.length, 2);
  await repo.loadSounds();
  assert.equal(calls.length, 2);
  await Promise.all([repo.loadImages(), repo.loadImages()]);
  assert.equal(calls.length, 3);
  assert.equal(repo.getSounds(), a);
});

test("regional data stays isolated by code; errors can be retried", async () => {
  let fail = true;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    if (fail) {
      fail = false;
      return { ok: false, status: 503 };
    }
    return { ok: true, json: async () => ({ url }) };
  };
  const load = createRegionLoader();
  await assert.rejects(load("CL-RM"), /503/);
  const [a, b] = await Promise.all([load("CL-RM"), load("CL-RM")]);
  assert.equal(a, b);
  assert.equal(calls.length, 2);
  const c = await load("CL-MA");
  assert.notEqual(c, a);
  assert.equal(calls.length, 3);
  await load("CL-RM");
  assert.equal(calls.length, 3);
});

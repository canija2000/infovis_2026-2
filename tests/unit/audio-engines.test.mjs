import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "../..");
const original = (file) =>
  execFileSync("git", ["show", `57b6dc8:${file}`], {
    cwd: root,
    encoding: "utf8",
  });
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
function environment(code, name) {
  const trace = [],
    contexts = [],
    intervals = new Map();
  let next = 1,
    id = 0;
  const parameter = (node, key) => ({
    value: 0,
    ...Object.fromEntries(
      [
        "setValueAtTime",
        "linearRampToValueAtTime",
        "exponentialRampToValueAtTime",
        "setTargetAtTime",
        "cancelScheduledValues",
      ].map((method) => [
        method,
        (...args) => trace.push([node, key, method, ...args]),
      ]),
    ),
  });
  function node(kind) {
    const key = `${kind}:${++id}`;
    return {
      ...Object.fromEntries(
        [
          "gain",
          "frequency",
          "detune",
          "Q",
          "pan",
          "playbackRate",
          "threshold",
          "ratio",
        ].map((k) => [k, parameter(key, k)]),
      ),
      connect() {
        return this;
      },
      disconnect() {},
      start(...args) {
        trace.push([key, "start", ...args]);
      },
      stop(...args) {
        trace.push([key, "stop", ...args]);
      },
    };
  }
  class AudioContext {
    constructor() {
      this.currentTime = 0;
      this.state = "suspended";
      contexts.push(this);
    }
    async resume() {
      this.state = "running";
      trace.push(["resume"]);
    }
    createGain() {
      return node("gain");
    }
    createDynamicsCompressor() {
      return node("compressor");
    }
    createBufferSource() {
      return node("source");
    }
    createOscillator() {
      return node("oscillator");
    }
    createBiquadFilter() {
      return node("filter");
    }
    createStereoPanner() {
      return node("pan");
    }
    async decodeAudioData() {
      trace.push(["decode"]);
      return { duration: 6 };
    }
  }
  const sandbox = {
    window: { AudioContext },
    console: { warn() {} },
    fetch: async (url) => {
      trace.push(["fetch", url]);
      return { arrayBuffer: async () => new ArrayBuffer(0) };
    },
    setInterval: (fn) => {
      const n = next++;
      intervals.set(n, fn);
      return n;
    },
    clearInterval: (n) => intervals.delete(n),
    requestAnimationFrame: () => next++,
    cancelAnimationFrame() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(
    code.replace(/^import .*;\n/gm, "").replace(/export /g, "") +
      `\nglobalThis.engine=${name};`,
    sandbox,
  );
  return {
    engine: sandbox.engine,
    trace,
    step: (time) => {
      contexts.forEach((c) => (c.currentTime = time));
      [...intervals.values()].forEach((fn) => fn());
    },
  };
}
const cache = source("web/js/audio/buffers.js");
for (const [name, oldFile, newFile] of [
  ["SoundLoop", "web/loop.js", "web/js/audio/year-loop.js"],
  ["Sonifier", "web/sonify.js", "web/js/audio/atlas-sonifier.js"],
]) {
  test(`${name}: unchanged scheduling, envelopes, transposition, callbacks and mute`, async () => {
    const a = environment(original(oldFile), name),
      b = environment(cache + "\n" + source(newFile), name);
    for (const env of [a, b]) {
      const { engine, trace, step } = env;
      if (name === "SoundLoop") {
        engine.configure({ barSeconds: 3, barsPerMonth: 4 });
        await engine.load(["clip.mp3", "clip.mp3"]);
        await engine.unlock();
        engine.start(
          0,
          (month, bar) => ({
            tick: bar === 0,
            hits: [
              {
                url: "clip.mp3",
                gain: 0.3,
                pan: -0.2,
                seed: month * 11 + bar,
                win: [0.5, 2.1],
              },
            ],
          }),
          (month, bar) => trace.push(["month", month, bar]),
        );
        for (const time of [0.11, 3.15, 6.2, 12.2]) step(time);
        engine.jump(6);
        step(15.3);
      } else {
        await engine.start(
          0,
          (month) => ({
            tick: true,
            pad: { freqs: [220, 330], gain: 0.1 },
            hits: [
              { at: 0.2, sample: "clip.mp3", rate: 0.8, gain: 0.3, pan: 0.35 },
              { at: 0.5, sample: null, rate: 1, gain: 0.1 },
            ],
          }),
          (month) => trace.push(["month", month]),
          ["clip.mp3", "clip.mp3"],
        );
        for (const time of [0.1, 2.5, 5, 7.3]) step(time);
      }
      engine.setMuted(true);
      engine.setMuted(false);
      engine.stop();
      assert.equal(engine.playing, false);
    }
    assert.deepEqual(b.trace, a.trace);
  });
}

test("overview data sonification encodes seasonal wave, stereo channels, regional classes and 2x speed", async () => {
  globalThis.window = {
    d3: { sum: (arr, fn) => arr.reduce((a, x) => a + fn(x), 0) },
  };
  const { createOverviewPlan } = await import(
    "../../web/js/audio/overview-plan.js"
  );
  const loop = JSON.parse(source("web/data/loop.json"));
  const sound = { scope: 0, mode: "wave", speed: 1 };
  const plan = createOverviewPlan({
    sound,
    getData: () => loop,
    preload() {},
  });

  // 1. Densidad estacional: noviembre (pico de verano, m=10) duplica los eventos de julio (invierno, m=6)
  const julBar = plan.planBar(6, 0);
  const novBar = plan.planBar(10, 0);
  assert.ok(
    novBar.hits.length >= julBar.hits.length * 1.8,
    `summer bar (${novBar.hits.length}) has noticeably more calls than winter bar (${julBar.hits.length})`,
  );
  assert.ok(
    novBar.tickFreq > julBar.tickFreq,
    `summer month tick (${novBar.tickFreq} Hz) is higher in pitch than winter tick (${julBar.tickFreq} Hz)`,
  );
  assert.ok(
    novBar.pad.cutoff > julBar.pad.cutoff,
    `summer harmonic pad (${novBar.pad.cutoff} Hz) is brighter than winter pad (${julBar.pad.cutoff} Hz)`,
  );

  // 2. Separación espacial estéreo: verano a la izquierda (< -0.25), residentes al centro, invierno a la derecha (> +0.25)
  const novVoices = plan.voicesFor(10);
  const julVoices = plan.voicesFor(6);
  assert.ok(
    novVoices.filter(([, , cls]) => cls === 1).reduce((a, [, c]) => a + c, 0) >=
      8,
    "November has strong summer visitor presence",
  );
  assert.equal(
    julVoices.filter(([, , cls]) => cls === 1).length,
    0,
    "July suppresses summer visitor calls in national wave mode",
  );
  for (const h of novBar.hits) {
    assert.ok(h.pan >= -0.78 && h.pan <= 0.78);
  }

  // 3. Modo «Solo viajeras» silencia residentes y colchón armónico
  sound.mode = "visitors";
  const visVoices = plan.voicesFor(10);
  assert.ok(
    visVoices.every(([, , cls]) => cls !== 0),
    "visitors mode excludes all resident species",
  );
  assert.equal(plan.planBar(10, 0).pad, null, "visitors mode disables pad");

  // 4. Clasificación regional real: Picaflor chico (sid=16) es invernal (2) en RM (7) y residente (0) en Los Lagos (14)
  assert.equal(plan.classOf(16, 7), 2);
  assert.equal(plan.classOf(16, 14), 0);

  // 5. Velocidad 2x en SoundLoop avanza de mes cada 2 compases (6 s)
  const env = environment(
    cache + "\n" + source("web/js/audio/year-loop.js"),
    "SoundLoop",
  );
  env.engine.configure({ barSeconds: 3, barsPerMonth: 4 });
  env.engine.setBarsPerMonth(2);
  await env.engine.unlock();
  const monthsSeen = [];
  env.engine.start(
    6,
    (m, b) => plan.planBar(m, b),
    (m, b) => monthsSeen.push([m, b]),
  );
  env.step(0.11);
  env.step(3.15);
  env.step(6.2);
  assert.deepEqual(monthsSeen, [
    [6, 0],
    [6, 1],
    [7, 0],
  ]);
  env.engine.stop();
});

test("SoundLoop: pausing or jumping fades the harmonic pad instead of letting it ring for a whole bar", async () => {
  const env = environment(
    cache + "\n" + source("web/js/audio/year-loop.js"),
    "SoundLoop",
  );
  env.engine.configure({ barSeconds: 3, barsPerMonth: 4 });
  await env.engine.unlock();
  env.engine.start(
    0,
    () => ({ pad: { freqs: [110, 165], gain: 0.04 } }),
    () => {},
  );
  env.step(1.5);
  env.engine.jump(5);
  const fades = () =>
    env.trace.filter(
      ([, key, method, value]) =>
        key === "gain" &&
        method === "linearRampToValueAtTime" &&
        value === 0.0001,
    );
  const cancelled = env.trace.filter(
    ([, , method]) => method === "cancelScheduledValues",
  );
  assert.equal(cancelled.length, 1, "the sounding pad is cancelled on jump");
  assert.ok(fades().some(([, , , , at]) => Math.abs(at - 1.58) < 1e-9));
  env.step(2);
  env.engine.stop();
  assert.equal(
    env.trace.filter(([, , method]) => method === "cancelScheduledValues")
      .length,
    2,
    "the pad scheduled after the jump is cancelled on pause",
  );
});

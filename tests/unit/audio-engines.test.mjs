import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "../..");
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
          "knee",
          "attack",
          "release",
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
      // Seis segundos a 1 kHz, con el canto entre 3 y 4,5 s (para el motor de «Escuchar su año»).
      const samples = new Float32Array(6000).map((_, i) =>
        i >= 3000 && i < 4500 ? Math.sin(i) * 0.5 : 0.001,
      );
      return {
        duration: 6,
        sampleRate: 1000,
        length: samples.length,
        numberOfChannels: 1,
        getChannelData: () => samples,
      };
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
    code.replace(/^import [\s\S]*?;\n/gm, "").replace(/export /g, "") +
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
test("species year: one phrase per audible month, louder with presence, synced callbacks and clean stop", async () => {
  const env = environment(
    cache +
      "\n" +
      source("web/js/audio/species-year-plan.js") +
      "\n" +
      source("web/js/audio/species-year.js"),
    "createSpeciesYearPlayer",
  );
  const player = env.engine();
  const steps = [
    { month: 6, profile: 100, years: 8 },
    { month: 7, profile: 2, years: 1 },
    { month: 8, profile: 50, years: 8 },
  ];
  const seen = [];
  let ended = null;
  player.unlock();
  const ok = await player.play({
    url: "clip.mp3",
    steps,
    onStep: (index, step) => seen.push(step.month),
    onEnd: (info) => (ended = info),
  });
  assert.equal(ok, true);
  const starts = env.trace.filter(([, method]) => method === "start");
  assert.equal(starts.length, 2, "the near-silent month does not sound");
  assert.ok(
    starts.every(([, , , offset]) => Math.abs(offset - 3) < 0.05),
    "each phrase starts where the song is, not in the background",
  );
  assert.ok(
    Math.abs(starts[1][2] - starts[0][2] - 3) < 1e-9,
    "1,5 s per month",
  );
  const peaks = env.trace
    .filter(
      ([node, key, method, value]) =>
        node.startsWith("gain") &&
        key === "gain" &&
        method === "exponentialRampToValueAtTime" &&
        value > 0.001,
    )
    .map(([, , , value]) => value);
  assert.equal(peaks.length, 2);
  assert.ok(
    peaks[0] > peaks[1] * 2,
    "a full month is clearly louder than a half month",
  );
  env.step(1.7);
  assert.deepEqual(seen, [6, 7]);
  env.step(4.7);
  assert.deepEqual(seen, [6, 7, 8]);
  assert.equal(ended.completed, true);
  assert.equal(player.playing, false);

  await player.play({
    url: "clip.mp3",
    steps,
    onEnd: (info) => (ended = info),
  });
  const before = env.trace.length;
  player.stop();
  assert.equal(ended.completed, false);
  assert.equal(
    env.trace.slice(before).filter(([, method]) => method === "stop").length,
    2,
    "stopping cancels the phrases still to come",
  );
});

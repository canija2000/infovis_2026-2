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

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
    intervals = new Map(),
    timeouts = [];
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
      this.sampleRate = 44100;
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
    createBuffer(channels, length) {
      const data = Array.from(
        { length: channels },
        () => new Float32Array(length),
      );
      return { duration: 0, getChannelData: (c) => data[c] };
    }
    createConvolver() {
      return node("convolver");
    }
    createDelay() {
      return { ...node("delay"), delayTime: { value: 0 } };
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
    setTimeout: (fn, ms) => timeouts.push({ fn, ms }),
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
    timeouts,
    contexts,
    step: (time) => {
      contexts.forEach((c) => (c.currentTime = time));
      [...intervals.values()].forEach((fn) => fn());
    },
  };
}
const cache = source("web/js/audio/buffers.js");
test("species year: one scene per audible month, a chorus when present, synced callbacks and clean stop", async () => {
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
    { month: 8, profile: 30, years: 8 },
  ];
  const seen = [];
  let ended = null;
  player.unlock();
  const ok = await player.play({
    url: "clip.mp3",
    steps,
    onStep: (index, step, planned) => seen.push([step.month, planned.scene]),
    onEnd: (info) => (ended = info),
  });
  assert.equal(ok, true);
  // Las aves llevan offset; el desbloqueo toca una muestra en silencio sin offset.
  const starts = env.trace.filter(
    ([, method, , offset]) => method === "start" && offset !== undefined,
  );
  const julio = starts.filter(([, , at]) => at < 1.5);
  const septiembre = starts.filter(([, , at]) => at >= 3);
  assert.equal(julio.length, 6, "a full month is a chorus of six birds");
  assert.equal(septiembre.length, 1, "a weak month is a single bird");
  assert.equal(starts.length, 7, "the near-silent month does not sound");
  assert.ok(
    starts.every(([, , , offset]) => offset >= 0 && offset < 4.4),
    "every bird sings from the song, not from the background",
  );
  assert.ok(
    starts.every(([, , , offset, length]) => offset + length <= 6.02),
    "no bird is cut off by the end of the clip",
  );
  env.step(1.7);
  assert.deepEqual(seen, [
    [6, "near"],
    [7, null],
  ]);
  env.step(4.7);
  assert.deepEqual(seen.at(-1), [8, "far"]);
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
    env.trace
      .slice(before)
      .filter(
        ([node, method]) => node.startsWith("source") && method === "stop",
      ).length,
    7,
    "stopping cancels every bird still to come",
  );
});

test("species year: the first press unlocks inside the gesture and never waits on resume()", async () => {
  const env = environment(
    cache +
      "\n" +
      source("web/js/audio/species-year-plan.js") +
      "\n" +
      source("web/js/audio/species-year.js"),
    "createSpeciesYearPlayer",
  );
  const player = env.engine();
  player.unlock();
  const [context] = env.contexts;
  assert.ok(
    env.trace.some(
      ([node, method]) => node.startsWith("source") && method === "start",
    ),
    "a silent sample starts within the click (Safari)",
  );
  // Un navegador que nunca cumple resume() fuera del gesto: antes la primera pulsación quedaba colgada.
  context.resume = () => new Promise(() => {});
  context.state = "suspended";
  const steps = [{ month: 0, profile: 100, years: 8 }];
  let ended = null;
  const ok = await player.play({
    url: "clip.mp3",
    steps,
    onEnd: (info) => (ended = info),
  });
  assert.equal(ok, true, "play() returns without waiting for resume()");
  assert.equal(player.playing, true);
  const watchdog = env.timeouts.at(-1);
  assert.equal(watchdog.ms, 1500);
  watchdog.fn();
  assert.equal(
    player.playing,
    false,
    "the button is released if audio never starts",
  );
  assert.equal(ended.completed, false);
});

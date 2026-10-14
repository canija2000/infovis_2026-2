import test from "node:test";
import assert from "node:assert/strict";
import { createMixerEngine } from "../../web/js/audio/mixer-engine.js";

function fixture(t, decode) {
  const saved = {
    window: globalThis.window,
    fetch: globalThis.fetch,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
  t.after(() => Object.assign(globalThis, saved));
  const sources = [],
    timers = new Map(),
    gains = [],
    messages = [];
  let next = 0,
    muted = false;
  const param = () => ({
    value: 0,
    values: [],
    setTargetAtTime(value) {
      this.values.push(value);
    },
  });
  const node = () => ({
    gain: param(),
    connect() {
      return this;
    },
    disconnect() {
      this.disconnected = true;
    },
  });
  class Context {
    currentTime = 3;
    async resume() {}
    createGain() {
      const n = node();
      gains.push(n);
      return n;
    }
    createDynamicsCompressor() {
      return { ...node(), threshold: param(), ratio: param() };
    }
    createBufferSource() {
      const n = {
        ...node(),
        start(at) {
          this.at = at;
        },
        stop() {
          this.stopped = true;
        },
      };
      sources.push(n);
      return n;
    }
    createBuffer(channels, length, sampleRate) {
      const data = Array.from(
        { length: channels },
        () => new Float32Array(length),
      );
      return {
        numberOfChannels: channels,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: (n) => data[n],
      };
    }
    async decodeAudioData() {
      return decode ? decode() : this.createBuffer(1, 100, 100);
    }
  }
  globalThis.window = { AudioContext: Context };
  globalThis.fetch = async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(0),
  });
  globalThis.setTimeout = (fn, delay) => {
    const key = ++next;
    timers.set(key, { fn, delay });
    return key;
  };
  globalThis.clearTimeout = (key) => timers.delete(key);
  const state = { tracks: new Map(), playing: true, synced: true };
  const engine = createMixerEngine({
    state,
    getMuted: () => muted,
    onUnavailable: () => messages.push("unavailable"),
    setMixerStatus: (message) => messages.push(message),
  });
  function add(sid) {
    const track = engine.createTrack(sid, `clip-${sid}.mp3`);
    state.tracks.set(sid, track);
    return track;
  }
  return {
    engine,
    state,
    sources,
    timers,
    gains,
    messages,
    add,
    mute: (value) => (muted = value),
  };
}

test("synchronized mix starts together and pads short clips to six seconds", async (t) => {
  const f = fixture(t);
  f.add(1);
  f.add(2);
  await f.engine.restartMixer();
  assert.equal(f.sources.length, 2);
  assert.equal(f.sources[0].at, f.sources[1].at);
  assert.ok(f.sources.every((s) => s.loop && s.buffer.duration === 6));
  assert.equal(f.timers.size, 0);
});

test("unsynchronized mix waits independently and reschedules after each song", async (t) => {
  const f = fixture(t);
  f.state.synced = false;
  f.add(1);
  f.add(2);
  await f.engine.restartMixer();
  assert.equal(f.sources.length, 0);
  assert.equal(f.timers.size, 2);
  assert.ok(
    [...f.timers.values()].every(
      (timer) => timer.delay >= 200 && timer.delay <= 5200,
    ),
  );
  const [key, timer] = [...f.timers][0];
  f.timers.delete(key);
  timer.fn();
  assert.equal(f.sources.length, 1);
  assert.equal(f.sources[0].loop, false);
  f.sources[0].onended();
  assert.equal(f.timers.size, 2);
});

test("mute preserves track volume and removal stops its source", async (t) => {
  const f = fixture(t);
  const track = f.add(1);
  f.mute(true);
  await f.engine.restartMixer();
  assert.equal(track.gain.gain.value, 0);
  f.engine.setVolume(track, 0.23);
  assert.equal(track.volume, 0.23);
  assert.equal(track.gain.gain.values.at(-1), 0);
  f.mute(false);
  f.engine.setMuted(false);
  assert.equal(track.gain.gain.values.at(-1), 0.23);
  f.engine.removeTrack(track);
  assert.equal(f.state.playing, false);
  assert.equal(f.state.tracks.size, 0);
  assert.equal(f.sources[0].stopped, true);
});

test("removing a track during decoding cannot start a stale source", async (t) => {
  let resolve;
  const f = fixture(t, () => new Promise((r) => (resolve = r)));
  const track = f.add(1);
  const loading = f.engine.restartMixer();
  while (!resolve) await Promise.resolve();
  f.engine.removeTrack(track);
  resolve({ duration: 6 });
  await loading;
  assert.equal(f.sources.length, 0);
  assert.equal(track.gain, null);
  assert.equal(f.state.playing, false);
});

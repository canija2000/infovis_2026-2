/** Reproduce las pistas del mezclador; administra sus fuentes, tiempos y ganancias. */
export function createMixerEngine({
  state,
  getMuted,
  onUnavailable,
  setMixerStatus,
}) {
  let mixerContext = null,
    mixerOutput = null,
    mixerGeneration = 0;
  const MIXER_SYNC_SECONDS = 6;
  function ensureMixerContext() {
    if (mixerContext) return mixerContext;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    mixerContext = new AudioContext();
    const compressor = mixerContext.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.ratio.value = 4;
    mixerOutput = mixerContext.createGain();
    mixerOutput.gain.value = 0.8;
    mixerOutput.connect(compressor).connect(mixerContext.destination);
    return mixerContext;
  }
  async function loadMixerTrack(track) {
    if (track.buffer) return;
    if (!track.loading) {
      track.loading = (async () => {
        const response = await fetch(track.url);
        if (!response.ok) throw new Error(`${track.url}: ${response.status}`);
        const data = await response.arrayBuffer();
        track.buffer = await mixerContext.decodeAudioData(data);
        if (state.tracks.get(track.sid) !== track) return;
        track.gain = mixerContext.createGain();
        track.gain.gain.value = getMuted() ? 0 : track.volume;
        track.gain.connect(mixerOutput);
      })().catch((err) => {
        track.loading = null;
        throw err;
      });
    }
    await track.loading;
  }
  function stopMixerTrack(track) {
    clearTimeout(track.timer);
    track.timer = null;
    if (track.source) {
      const source = track.source;
      track.source = null;
      source.onended = null;
      source.stop();
      source.disconnect();
    }
  }
  function mixerDelay() {
    return 200 + Math.random() * 5000;
  }
  function scheduleMixerTrack(track, delay) {
    clearTimeout(track.timer);
    track.timer = setTimeout(() => {
      track.timer = null;
      if (
        state.playing &&
        !state.synced &&
        state.tracks.get(track.sid) === track
      ) {
        startMixerTrack(track, mixerContext.currentTime + 0.01, false);
      }
    }, delay);
  }
  function startMixerTrack(track, at, loop) {
    const source = mixerContext.createBufferSource();
    if (loop && !track.syncBuffer) {
      const original = track.buffer;
      const length = Math.round(MIXER_SYNC_SECONDS * original.sampleRate);
      track.syncBuffer = mixerContext.createBuffer(
        original.numberOfChannels,
        length,
        original.sampleRate,
      );
      for (let channel = 0; channel < original.numberOfChannels; channel++) {
        track.syncBuffer
          .getChannelData(channel)
          .set(original.getChannelData(channel).subarray(0, length));
      }
    }
    source.buffer = loop ? track.syncBuffer : track.buffer;
    source.loop = loop;
    source.connect(track.gain);
    track.source = source;
    if (!loop) {
      source.onended = () => {
        source.disconnect();
        if (track.source !== source) return;
        track.source = null;
        if (state.playing && state.tracks.get(track.sid) === track)
          scheduleMixerTrack(track, mixerDelay());
      };
    }
    source.start(at);
  }
  async function restartMixer() {
    const generation = ++mixerGeneration;
    for (const track of state.tracks.values()) stopMixerTrack(track);
    if (!state.playing) return;
    const context = ensureMixerContext();
    if (!context) {
      state.playing = false;
      onUnavailable();
      return;
    }
    try {
      await context.resume();
    } catch (err) {
      console.warn("No se pudo activar el mezclador", err);
    }
    const tracks = [...state.tracks.values()];
    const results = await Promise.allSettled(tracks.map(loadMixerTrack));
    if (generation !== mixerGeneration || !state.playing) return;
    const ready = tracks.filter(
      (track, i) =>
        results[i].status === "fulfilled" &&
        state.tracks.get(track.sid) === track,
    );
    if (state.synced) {
      const start = context.currentTime + 0.08;
      ready.forEach((track) => startMixerTrack(track, start, true));
    } else {
      ready.forEach((track) => scheduleMixerTrack(track, mixerDelay()));
    }
    if (ready.length < tracks.length)
      setMixerStatus("Algunos cantos no se pudieron cargar.");
  }

  function createTrack(sid, url) {
    return {
      sid,
      url,
      volume: 0.5,
      buffer: null,
      loading: null,
      gain: null,
      source: null,
      timer: null,
    };
  }
  function setVolume(track, volume) {
    track.volume = volume;
    if (track.gain)
      track.gain.gain.setTargetAtTime(
        getMuted() ? 0 : volume,
        mixerContext.currentTime,
        0.015,
      );
  }
  function setMuted(muted) {
    for (const track of state.tracks.values()) {
      if (track.gain)
        track.gain.gain.setTargetAtTime(
          muted ? 0 : track.volume,
          mixerContext.currentTime,
          0.015,
        );
    }
  }
  function removeTrack(track) {
    stopMixerTrack(track);
    if (track.gain) track.gain.disconnect();
    state.tracks.delete(track.sid);
    if (!state.tracks.size) {
      state.playing = false;
      mixerGeneration++;
    }
  }
  function playAddedTrack(track) {
    if (!state.playing) return Promise.resolve();
    if (state.synced) return restartMixer();
    const generation = mixerGeneration;
    return loadMixerTrack(track).then(() => {
      if (
        generation === mixerGeneration &&
        state.playing &&
        state.tracks.get(track.sid) === track
      ) {
        scheduleMixerTrack(track, mixerDelay());
      }
    });
  }

  return {
    createTrack,
    restartMixer,
    removeTrack,
    setVolume,
    setMuted,
    playAddedTrack,
  };
}

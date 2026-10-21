import { createMixerState } from "../state/mixer.js";
import { createMixerEngine } from "../audio/mixer-engine.js";
import { createMixerCatalog } from "../views/mixer/catalog.js";
import { createMixerTrackView } from "../views/mixer/track.js";
import { createMixerDock } from "../views/mixer/dock.js";
import { sceneSpecies, MIXER_SCENE_SIZE } from "./scene-selection.js";
import { MONTHS } from "../shared/calendar.js";
import { CLASS_LABEL } from "../shared/classes.js";

/** Coordinates the mixer; the atlas state remains owned by the page. */
export function createMixer({
  data,
  state: atlasState,
  media,
  scopeName,
  onTracksChange,
  onStart = () => {},
}) {
  const state = createMixerState();
  const { loadSounds, loadImages, soundEntry } = media;
  const MIXER_EMPTY =
    "Añade especies con «+ Especies», desde la ficha de un ave o con «Mezclar lo que se ve».";
  let mixerReady = null;
  const catalog = createMixerCatalog({
    species: data.species,
    tracks: state.tracks,
    onAdd: addMixerTrack,
  });
  const trackView = createMixerTrackView();
  const dock = createMixerDock({
    state,
    onOpen: ensureMixerData,
    onPlay: toggleMixer,
    onSync: (synced) => {
      state.synced = synced;
      if (state.playing) engine.restartMixer();
    },
    onScene: addScene,
    onQuery: catalog.filterMixerCatalog,
    onClass: catalog.setClass,
    onSceneLabel: updateSceneButton,
  });
  const { setMixerStatus, updateMixerControls, setMixerOpen } = dock;
  const engine = createMixerEngine({
    state,
    getMuted: () => atlasState.muted,
    setMixerStatus,
    onUnavailable: () => {
      updateMixerControls();
      setMixerStatus("Este navegador no admite reproducción de audio.");
    },
  });

  function toggleMixer() {
    if (!state.tracks.size) return;
    state.playing = !state.playing;
    if (state.playing) onStart();
    engine.restartMixer();
    setMixerStatus(
      state.playing
        ? state.synced
          ? "Los cantos comenzarán juntos."
          : "Cada ave cantará tras una breve espera aleatoria."
        : "Mezcla en pausa.",
    );
    updateMixerControls();
  }
  function addMixerTrack(sid, announce = true) {
    if (state.tracks.has(sid)) {
      if (announce)
        setMixerStatus(`${data.species[sid].comName} ya está en la mezcla.`);
      return false;
    }
    const recording = soundEntry(sid)?.recordings[0];
    if (!recording) return false;
    const species = data.species[sid];
    const track = engine.createTrack(sid, recording.mixer || recording.src);
    state.tracks.set(sid, track);
    catalog.markSelected(sid, true);
    trackView.appendTrack(
      sid,
      species,
      recording,
      (volume) => engine.setVolume(track, volume),
      () => {
        engine.removeTrack(track);
        catalog.markSelected(sid, false);
        updateMixerControls();
        updatePanelMixButton();
        setMixerStatus(
          state.tracks.size
            ? `${state.tracks.size} especies en la mezcla.`
            : MIXER_EMPTY,
        );
      },
    );
    engine.playAddedTrack(track).catch((err) => {
      console.warn("No se pudo cargar el canto", err);
      setMixerStatus(`No se pudo cargar ${species.comName}.`);
    });
    updateMixerControls();
    updatePanelMixButton();
    if (announce) setMixerStatus(`${state.tracks.size} especies en la mezcla.`);
    return true;
  }
  function ensureMixerData() {
    if (!mixerReady) {
      setMixerStatus("Cargando especies con grabación…");
      mixerReady = (async () => {
        await loadSounds();
        const available = media
          .getSounds()
          .species.filter((entry) => entry.recordings.length)
          .sort((a, b) =>
            data.species[a.sid].comName.localeCompare(
              data.species[b.sid].comName,
              "es",
            ),
          );
        try {
          await loadImages();
        } catch (err) {
          console.warn("No se pudieron cargar las imágenes del mezclador", err);
        }
        catalog.renderMixerCatalog(available, media.getImages());
        dock.setCatalogAvailable(available.length);
        if (!state.tracks.size)
          setMixerStatus(
            available.length ? MIXER_EMPTY : "No hay grabaciones disponibles.",
          );
        return available;
      })().catch((err) => {
        mixerReady = null;
        setMixerStatus("No se pudieron cargar los cantos. Intenta de nuevo.");
        throw err;
      });
    }
    return mixerReady;
  }
  async function addToMixer(sids) {
    setMixerOpen(true);
    try {
      await ensureMixerData();
    } catch (_) {
      return;
    }
    const added = sids.filter((sid) => addMixerTrack(sid, sids.length === 1));
    if (sids.length > 1) {
      setMixerStatus(
        added.length
          ? `Se añadieron ${added.length} especies · ${state.tracks.size} en la mezcla.`
          : "Esas especies ya estaban en la mezcla.",
      );
    }
  }
  // Las especies de la pestaña visible más registradas en el mes y la región seleccionados.
  function updateSceneButton() {
    dock.updateSceneButton(
      MIXER_SCENE_SIZE,
      CLASS_LABEL[atlasState.tab].toLowerCase(),
      MONTHS[atlasState.month],
      scopeName(atlasState.scope),
    );
  }
  function updatePanelMixButton() {
    onTracksChange();
  }

  async function addScene() {
    try {
      await ensureMixerData();
    } catch (_) {
      return;
    }
    const sids = sceneSpecies(data, atlasState, media.getSounds());
    if (sids.length) addToMixer(sids);
    else
      setMixerStatus(
        "No hay especies con canto para este mes y región en la pestaña actual.",
      );
  }
  return {
    setupMixer: dock.setupMixer,
    addToMixer,
    updateSceneButton,
    setMuted: engine.setMuted,
    hasTrack: (sid) => state.tracks.has(sid),
    // Pausa la mezcla si suena (cuando el usuario pide escuchar el año de una especie).
    pause() {
      if (state.playing) toggleMixer();
    },
  };
}

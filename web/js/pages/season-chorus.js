/**
 * Coordina «El coro de las estaciones»: el reloj de la barra, el motor sonoro y la vista.
 *
 * La barra avanza de forma continua (requestAnimationFrame); en cada cuadro se lee la curva en esa
 * posición, el motor recibe cuántas especies hay de cada grupo y la vista dibuja la barra, las aves
 * y las notas con lo que el motor midió. Al pasar por cada mes se marca el mes en el selector y en
 * los mapas por mes. Arrastrar la barra también suena, esté o no corriendo el año.
 */
import {
  createPulseCurve,
  monthAt,
  positionOf,
  LAST,
} from "../overview/pulse-curve.js";
import { createSeasonChorus } from "../audio/season-chorus.js";
import {
  LAYERS,
  SPECIES,
  SECONDS_PER_MONTH,
} from "../audio/season-chorus-plan.js";
import { createMediaRepository } from "../data/media.js";
import { createChorusState } from "../state/overview.js";
import { createPulseChorus } from "../views/overview/pulse-chorus.js";
import { claimAudio, onAudioClaimed } from "../shared/audio-focus.js";

const OWNER = "season-chorus";

export function createSeasonChorusController({
  months,
  species,
  getMonth,
  showMonth,
}) {
  const curve = createPulseCurve(months);
  const engine = createSeasonChorus();
  const media = createMediaRepository();
  const state = createChorusState();
  const view = createPulseChorus({
    birds: [0, 1, 2].map((k) => LAYERS[k].maxBirds),
    notes: [0, 1, 2].map((k) => SPECIES[k].note),
    onToggle: toggle,
    onPreview: preview,
    onScrubStart: scrubStart,
    onScrub: scrubTo,
    onScrubEnd: scrubEnd,
  });
  let frameId = null;
  let lastTime = null;
  let request = 0; // identifica la reproducción vigente: las cargas tardías se ignoran
  let loading = null;

  const position = () => state.position ?? positionOf(getMonth());
  const clamp = (p) => Math.min(LAST, Math.max(0, p));

  function paint(dt = 0, meters = null) {
    const p = position();
    const month = monthAt(p);
    const frame = {
      ...curve.at(p),
      p,
      month,
      monthCounts: months[month],
      dt,
      meters,
      active: engine.running,
    };
    if (engine.running) engine.setCounts(frame.counts);
    view.render(frame);
    return frame;
  }

  function loop(time) {
    frameId = null;
    if (state.status === "idle" && !state.scrubbing) return;
    const dt = lastTime === null ? 0 : Math.min(0.1, (time - lastTime) / 1000);
    lastTime = time;
    if (state.status === "playing" && !state.scrubbing)
      state.position = clamp(position() + dt / SECONDS_PER_MONTH);
    const frame = paint(dt, engine.read(dt));
    if (frame.month !== getMonth()) showMonth(frame.month);
    if (state.status === "playing" && state.position >= LAST) return stop();
    frameId = requestAnimationFrame(loop);
  }
  function run() {
    if (frameId !== null) return;
    lastTime = null;
    frameId = requestAnimationFrame(loop);
  }

  // Canto de cada grupo: la grabación limpia de su especie (o la original).
  function load() {
    if (!loading)
      loading = media
        .loadSounds()
        .then(() => {
          const urls = {};
          for (const k of [0, 1, 2]) {
            const bird = species.find((s) => s.name === SPECIES[k].name);
            const recording =
              bird && media.soundEntry(bird.sid)?.recordings?.[0];
            if (!recording) return false;
            urls[k] = recording.mixer || recording.src;
          }
          return engine.load(urls);
        })
        .then((ok) => {
          if (!ok) loading = null;
          return ok;
        })
        .catch((error) => {
          console.warn("No se pudieron cargar los cantos del coro", error);
          loading = null;
          return false;
        });
    return loading;
  }

  async function play() {
    if (state.status === "preview") stop();
    const mine = ++request;
    if (!engine.unlock()) return view.setStatus("error");
    claimAudio(OWNER);
    if (state.position === null || state.position >= LAST - 0.01)
      state.position = 0;
    state.status = "loading";
    view.setStatus("loading");
    paint();
    const ok = await load();
    if (mine !== request) return;
    if (!ok) {
      state.status = "idle";
      return view.setStatus("error");
    }
    engine.start(curve.peak);
    state.status = "playing";
    view.setStatus("playing");
    run();
    // Si el navegador no dejó arrancar el audio, se libera el botón para intentarlo de nuevo.
    setTimeout(() => {
      if (
        mine === request &&
        state.status === "playing" &&
        !engine.audioRunning
      )
        stop();
    }, 1500);
  }

  // «Así suena»: un canto suelto de un grupo, con su ave cantando sobre la curva.
  async function preview(k) {
    const again = state.status === "preview" && state.preview === k;
    stop();
    if (again) return;
    const mine = ++request;
    if (!engine.unlock()) return;
    claimAudio(OWNER);
    state.status = "preview";
    state.preview = k;
    view.setPreview(k);
    const ok = await load();
    if (mine !== request) return;
    if (!ok) return stop();
    const seconds = engine.preview(k, curve.peak);
    run();
    setTimeout(
      () => {
        if (mine === request) stop();
      },
      seconds * 1000 + 400,
    );
  }

  // Pausa: la barra queda donde estaba; el siguiente ▶ sigue desde ahí (o parte de julio si terminó).
  function stop() {
    request += 1;
    state.status = "idle";
    state.preview = null;
    view.setPreview(null);
    state.scrubbing = false;
    engine.stop();
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    view.setStatus("idle");
    paint();
  }

  function toggle() {
    if (state.status === "playing" || state.status === "loading") stop();
    else play();
  }

  // Arrastrar la barra (o moverla con las flechas: delta en meses).
  function scrubStart(p, delta) {
    if (delta) {
      state.position = clamp(position() + delta);
      const frame = paint();
      if (frame.month !== getMonth()) showMonth(frame.month);
      return;
    }
    state.scrubbing = true;
    state.position = clamp(p);
    if (state.status === "idle") {
      // Sin el año corriendo, la barra suena solo mientras se arrastra.
      if (engine.unlock()) {
        claimAudio(OWNER);
        const mine = request;
        load().then((ok) => {
          if (ok && mine === request && state.scrubbing && !engine.running)
            engine.start(curve.peak);
        });
      }
    }
    run();
  }
  function scrubTo(p) {
    state.position = clamp(p);
  }
  function scrubEnd() {
    state.scrubbing = false;
    if (state.status === "idle") {
      engine.stop();
      paint();
    }
  }

  onAudioClaimed((owner) => {
    if (owner !== OWNER && (state.status !== "idle" || engine.running)) stop();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.status !== "idle") stop();
  });

  return {
    // El gráfico se redibujó (al cargar o al cambiar el ancho): la barra y las aves se rehacen.
    attach(geom) {
      view.attach(geom);
      paint();
    },
    // Se eligió un mes en el selector o en el gráfico: con el año sonando, la barra salta ahí.
    monthSelected(month) {
      state.position = state.status === "idle" ? null : positionOf(month);
      paint();
    },
  };
}

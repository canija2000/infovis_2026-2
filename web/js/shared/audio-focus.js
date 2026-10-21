/**
 * Un sonido a la vez entre secciones que no se conocen entre sí.
 * Quien empieza a sonar por un gesto del usuario avisa con claimAudio(owner);
 * cada coordinador decide qué detener con onAudioClaimed. Igual que «overview:drawn»,
 * es un evento del documento: las páginas no se importan unas a otras.
 */
const EVENT = "audio:claim";

export function claimAudio(owner) {
  document.dispatchEvent(new CustomEvent(EVENT, { detail: { owner } }));
}

export function onAudioClaimed(handler) {
  document.addEventListener(EVENT, (event) => handler(event.detail.owner));
}

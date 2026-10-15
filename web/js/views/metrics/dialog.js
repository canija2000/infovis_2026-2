/** Presents the reference overlay and manages close, focus and frame messages. */
export function createMetricsDialog() {
  const dialog = document.createElement("dialog");
  dialog.className = "metrics-dialog";
  dialog.setAttribute("aria-labelledby", "metrics-dialog-title");
  dialog.innerHTML = `<header class="metrics-dialog-bar"><div><span class="kicker">Atlas sonoro · Guía de lectura</span><h2 id="metrics-dialog-title">Ficha de métricas</h2></div><div><a class="metrics-fullpage" href="metricas.html" target="_blank" rel="noopener">Abrir página ↗</a><button class="metrics-close" type="button" aria-label="Cerrar ficha de métricas">✕</button></div></header><iframe title="Definiciones, fórmulas y ejemplo de las métricas del atlas"></iframe>`;
  document.body.append(dialog);
  const frame = dialog.querySelector("iframe");
  const fullpage = dialog.querySelector(".metrics-fullpage");
  let opener;
  function open({ concept, trigger }) {
    const id = `#${concept}`;
    opener = trigger;
    fullpage.href = `metricas.html${id}`;
    frame.src = `metricas.html?embed=1${id}`;
    if (!dialog.open) dialog.showModal();
    document.body.classList.add("metrics-modal-open");
  }
  window.addEventListener("message", (event) => {
    if (
      event.origin === window.location.origin &&
      event.source === frame.contentWindow &&
      event.data?.type === "metrics-close"
    )
      dialog.close();
  });
  dialog
    .querySelector("button")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    document.body.classList.remove("metrics-modal-open");
    opener?.focus({ preventScroll: true });
  });
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      dialog.close();
  });
  // Guard the background player's shortcuts, including events inside the iframe.
  for (const type of ["keydown", "keyup"]) {
    dialog.addEventListener(type, (event) => event.stopPropagation());
  }
  return { open };
}

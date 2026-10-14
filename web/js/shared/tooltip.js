/** Presenta y posiciona el tooltip dentro de la ventana. */
export function createTooltip() {
  const tip = document.getElementById("tooltip");
  function showTip(event, html) {
    tip.innerHTML = html;
    tip.hidden = false;
    const pad = 14;
    const { innerWidth: w, innerHeight: h } = window;
    const r = tip.getBoundingClientRect();
    let x = event.clientX + pad;
    let y = event.clientY + pad;
    if (x + r.width > w - 8) x = event.clientX - r.width - pad;
    if (y + r.height > h - 8) y = event.clientY - r.height - pad;
    tip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  }
  const hideTip = () => (tip.hidden = true);

  return { showTip, hideTip };
}

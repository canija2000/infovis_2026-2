/** Presenta el resumen nacional de clases estacionales. */
import { CLASS_KEYS } from "../../shared/classes.js";
export function createSummary({ data }) {
  function renderSummary() {
    const c = [0, 0, 0, 0];
    data.species.forEach((s) => c[CLASS_KEYS.indexOf(s.class)]++);
    document.getElementById("summary").innerHTML =
      `<li><span class="term term-stay">Sedentarios</span>: ${c[0]} especies que se registran parejo todo el año.</li>` +
      `<li><span class="term term-travel">Nómadas</span>: ${c[1] + c[2]} especies que llegan y se van, ` +
      `${c[1]} en verano y ${c[2]} en invierno.</li>` +
      `<li class="muted">Otras ${c[3]} especies aparecen solo ocasionalmente y no se clasifican.</li>`;
  }

  return { renderSummary };
}

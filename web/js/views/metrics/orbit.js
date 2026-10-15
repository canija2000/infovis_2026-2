/** Presents the circular species portrait status and its twelve readings. */
import { MONTHS } from "../../shared/calendar.js";
import { CLASS_ONE } from "../../shared/classes.js";
import { formatNumber as number } from "../../shared/format.js";
export function createMetricsOrbit() {
  const host = document.getElementById("example-results");
  const presence = document.getElementById("example-presence");
  function render(example) {
    if (!example) {
      presence.textContent = "Sin datos en este ámbito";
      presence.classList.remove("is-present");
      host.replaceChildren();
      return;
    }
    const { row, d, bird } = example;
    presence.textContent = d.present
      ? "Presente"
      : "No supera la regla de presencia";
    presence.classList.toggle("is-present", d.present);
    const readings = [
      ["frecuencia", "Frecuencia", `${number(d.freq, 0)} ‰`, "mensual"],
      ["perfil", "Perfil", `${d.profile} %`, "del máximo"],
      ["anios-registro", "Regularidad", `${d.years}/8`, "años con registro"],
      ["amplitud", "Amplitud", number(row[5], 3), "en este ámbito"],
      ["fase", "Fase", number(row[4], 2), "0 = enero"],
      ["pico", "Mejor mes", MONTHS[row[3]], "en este ámbito"],
      [
        "clases",
        "Clase",
        CLASS_ONE[row[2]].replace("visitante de ", "de "),
        "en este ámbito",
      ],
      [
        "regiones-regulares",
        "Regiones regulares",
        `${bird.regions}/16`,
        "en Chile",
      ],
      [
        "dias-especie",
        "Días-especie",
        number(bird.reportDays, 0),
        "Chile · ocho años",
      ],
      ["dias-mes", "Días/mes", `≈ ${number(d.daysMean)}`, "media anual"],
      [
        "peso-visitantes",
        "Peso continuo",
        `≈ ${number(d.weight, 3)}`,
        row[2] === 3 ? "excluido de q" : "perfil × años/8",
      ],
      [
        "anios-registro",
        "Opacidad",
        number(d.opacity, 3),
        "0,3 + 0,7 × años/8",
      ],
    ];
    host.innerHTML = readings
      .map(([id, label, value, note], i) => {
        const angle = -Math.PI / 2 + (i * Math.PI) / 6;
        return `<a class="orbit-metric" href="#${id}" style="--x:${Math.cos(angle).toFixed(5)};--y:${Math.sin(angle).toFixed(5)}"><span class="orbit-label">${label}</span><strong>${value}</strong><span class="orbit-note">${note}</span></a>`;
      })
      .join("");
  }
  return { render };
}

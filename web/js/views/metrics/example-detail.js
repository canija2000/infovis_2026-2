/** Presents the worked calculation and the twelve-month comparison table. */
import { MONTHS } from "../../shared/calendar.js";
import { formatNumber as number } from "../../shared/format.js";
export function createMetricsExampleDetail() {
  const table = document.getElementById("example-table");
  const calculation = document.getElementById("example-calculation");
  function render(example) {
    if (!example) {
      table.replaceChildren();
      calculation.replaceChildren();
      return;
    }
    const { d, bird, scope, month, scopeName, context, qMean, monthly } =
      example;
    calculation.innerHTML = `<p><b>${MONTHS[month]} · ${scopeName}</b></p><p>Frecuencia: ${d.freq}/1.000 = ${number(d.freq / 10)} %${scope === 0 ? ", media de las 16 regiones" : " de los días de la región"}. Para este mes: ≈ ${number(d.days)} días.</p><p>Presencia guardada: ${d.present ? "sí" : "no"}. Años: ${d.years} ≥ 4; perfil publicado: ${d.profile} % frente a 20 %.</p><p>Frecuencia media anual: ${number(d.mean)} ‰. Amplitud nacional: ${number(bird.seasonality, 3)}.</p><p class="metric-footnote">El perfil se publica redondeado: el peso mostrado es aproximado y la presencia usa la máscara original. Los días mensuales crudos y la participación sin redondear no se reconstruyen desde la frecuencia.</p><p class="metric-footnote">Todas las especies del ámbito: <a href="#riqueza">${context[0]} presentes</a> · <a href="#peso-visitantes">${number(context[4] * 100)} % visitantes ponderados</a> · <a href="#desviacion">${number((context[4] - qMean) * 100)} pp frente a su media</a> · <a href="#esfuerzo">${number(context[5], 0)} días-especie de esfuerzo medio</a>.</p>`;
    table.innerHTML = `<table><caption>Fío-fío · ${scopeName}</caption><thead><tr><th scope="col">Mes</th><th scope="col">Frecuencia ‰</th><th scope="col">Perfil %</th><th scope="col">Años /8</th><th scope="col">Presente</th><th scope="col">Peso ≈</th></tr></thead><tbody>${MONTHS.map(
      (name, i) => {
        const v = monthly[i];
        return `<tr${i === month ? ' class="is-selected" aria-current="true"' : ""}><th scope="row">${name}</th><td>${v.freq}</td><td>${v.profile}</td><td>${v.years}</td><td>${v.present ? "Sí" : "No"}</td><td>${number(v.weight, 3)}</td></tr>`;
      },
    ).join("")}</tbody></table>`;
  }
  return { render };
}

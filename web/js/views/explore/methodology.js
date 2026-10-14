/** Presenta la metodología y las fuentes bibliográficas. */
import { pct } from "../../shared/format.js";
export function createMethodology({ data }) {
  function renderMethod() {
    const m = data.meta;
    document.getElementById("method-text").innerHTML =
      `Datos: registros de aves en Chile descargados de <a href="https://www.gbif.org" target="_blank" rel="noopener">GBIF</a> ` +
      `(eBird aporta 91–98 %). La métrica base es <b>días con registro</b>: días del mes en que la especie se registró en la región. ` +
      `No es abundancia ni número de aves: depende de cuánta gente observa. Por eso se usa un <b>año típico</b> ` +
      `(media ${m.years[0]}–${m.years[1]}; se excluyen ${m.excludedYears}) y el perfil de cada especie se corrige por esfuerzo ` +
      `(participación en el total de días-especie de la región-mes). Una especie está <i>presente</i> en un mes si se registró ` +
      `en al menos ${m.parameters.presenceMinYears} de 8 años y alcanza el ${pct(m.parameters.presenceMinProfile)} de su mes pico; ` +
      `es <i>visitante</i> si su amplitud estacional es ≥ ${String(m.parameters.seasonalMinAmplitude).replace(".", ",")}. ` +
      `Se excluyen islas oceánicas y registros pelágicos fuera de los polígonos regionales.`;
    document.getElementById("dois").innerHTML =
      `Cita: ${m.gbifCitation} ` +
      m.dois
        .map(
          (d) =>
            `<a href="${d}" target="_blank" rel="noopener">${d.replace("https://doi.org/", "")}</a>`,
        )
        .join(" · ");
  }

  return { renderMethod };
}

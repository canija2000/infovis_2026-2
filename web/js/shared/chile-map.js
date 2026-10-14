/** Dibuja el contorno regional de Chile y conecta callbacks de interacción. */
import { d3 } from "./d3.js";

export function createChileMap({ data, showTip, hideTip }) {
  function drawChile(
    container,
    { width, height, fill, onClick, onHover, selected },
  ) {
    const svg = d3
      .select(container)
      .selectAll("svg")
      .data([0])
      .join("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("role", "img");
    const projection = d3.geoMercator().fitExtent(
      [
        [4, 4],
        [width - 4, height - 4],
      ],
      data.geo,
    );
    const path = d3.geoPath(projection);
    const paths = svg
      .selectAll("path.region")
      .data(data.geo.features, (d) => d.id)
      .join("path")
      .attr("class", "region")
      .attr("d", path);
    paths
      .style("fill", (d) => fill(d.id))
      .classed("selected", (d) => d.id === selected)
      .classed("dim", (d) => selected && d.id !== selected);
    if (onClick)
      paths.style("cursor", "pointer").on("click", (e, d) => onClick(d.id));
    if (onHover)
      paths
        .on("pointermove", (e, d) => showTip(e, onHover(d.id)))
        .on("pointerleave", hideTip);
    paths.filter(".selected").raise();
    return svg;
  }

  return { drawChile };
}

/** Builds the authored minimal reference and embeds its published example. */
import fs from "node:fs/promises";
import { groups } from "./metrics-content.mjs";
import { MONTHS } from "../web/js/shared/calendar.js";
const root = new URL("../", import.meta.url);
const json = async (file) =>
  JSON.parse(await fs.readFile(new URL(`web/data/${file}.json`, root), "utf8"));
const escape = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const [species, typical, images, meta, regionMonth] = await Promise.all([
  json("species"),
  json("typical_year"),
  json("images"),
  json("meta"),
  json("region_month"),
]);
const bird = species.find((s) => s.sciName === "Elaenia albiceps");
const photo = images.species.find((s) => s.sid === bird.id).images[0];
const example = {
  bird,
  regions: meta.regions,
  rows: typical.rows.filter((r) => r[0] === bird.id),
  scopes: regionMonth.scopes,
};
const definition = (
  item,
) => `<details class="metric-definition" id="${item.id}">
  <summary><span>${item.title}</span><span class="metric-symbol" aria-hidden="true">${escape(item.symbol)}</span></summary>
  <div class="metric-definition-body"><p>${item.description}</p><div class="metrics-equation"><math display="block" aria-label="${escape(item.title + ": " + item.description)}"><mrow>${item.math}</mrow></math></div>${item.note ? `<p class="metric-footnote">${item.note}</p>` : ""}</div>
</details>`;
const sections = groups
  .map(
    (group) =>
      `<section class="metric-group" id="${group.id}" aria-labelledby="heading-${group.id}"><h2 id="heading-${group.id}">${group.title}</h2>${group.extra ? '<details class="metrics-other"><summary>Ver medidas del aviario, medios y análisis</summary>' : ""}${group.items.map(definition).join("\n")}${group.extra ? "</details>" : ""}</section>`,
  )
  .join("\n");
const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ficha de métricas · Atlas sonoro</title>
  <meta name="description" content="Las métricas del atlas, alrededor de un Fío-fío. Definiciones breves, fórmulas y datos reales de 2017–2024.">
  <link rel="stylesheet" href="css/site.css?v=refactor-1"><link rel="stylesheet" href="css/metrics.css">
</head>
<body class="metrics-page">
  <nav class="site-nav" aria-label="Secciones"><a class="brand" href="index.html">Atlas sonoro · Aves de Chile</a><ul><li><a class="site-tab" href="index.html">Visualización</a></li><li><a class="site-tab" href="explorar.html">Explorar</a></li><li><a class="site-tab" href="metricas.html" aria-current="page">Ficha de métricas</a></li></ul></nav>
  <main class="metrics-main">
    <header class="metrics-hero"><p class="kicker">2017–2024 · Un ejemplo real</p><h1>Ficha de métricas</h1><p>Una especie. Distintas formas de leer sus registros.</p></header>
    <section id="ejemplo" class="metrics-example" aria-labelledby="example-title" tabindex="-1">
      <div class="metrics-example-controls"><label>Ámbito<select id="example-scope">${meta.regions.map((r) => `<option value="${r.id}">${escape(r.name)}</option>`).join("")}</select></label><label>Mes<select id="example-month">${MONTHS.map((m, i) => `<option value="${i}">${m}</option>`).join("")}</select></label></div>
      <div class="metrics-orbit">
        <figure class="metrics-bird"><img src="${escape(photo.url)}" alt="Fío-fío (Elaenia albiceps)" width="400" height="400" decoding="async"><figcaption><h2 id="example-title">${bird.comName}</h2><i>${bird.sciName}</i><span id="example-presence" role="status"></span></figcaption></figure>
        <div id="example-results" class="metrics-orbit-values" aria-live="polite"></div>
      </div>
      <p class="metrics-orbit-hint">Pasa sobre una cifra para ampliarla. Haz clic para ver su fórmula.</p>
      <p class="metrics-photo-credit">Foto: <a href="${escape(photo.source)}" target="_blank" rel="noopener">${escape(photo.author)}</a> · <a href="${escape(photo.license)}" target="_blank" rel="noopener">CC BY 4.0</a></p>
      <details class="metrics-example-extra"><summary>Ver el cálculo y los doce meses</summary><div id="example-calculation"></div><div id="example-table" class="metrics-table-wrap" tabindex="0" role="region" aria-label="Métricas mensuales del Fío-fío"></div></details>
    </section>
    <nav class="metrics-section-nav" aria-label="Familias de métricas"><a href="#ejemplo">La especie</a><a href="#registro">Registros</a><a href="#estacionalidad">Ciclo anual</a><a href="#mapas">Mapas</a><a href="#sonido">Sonido</a></nav>
    <div class="metrics-reference"><p class="metrics-notation"><i>s</i> especie · <i>r</i> ámbito · <i>m</i> mes · <i>a</i> año · <i>d</i> días de registro · <i>D</i> días del mes · <i>E</i> esfuerzo · <i>Y</i> años con registro. Los promedios incluyen los años sin registro.</p>${sections}</div>
    <footer class="metrics-footer">Registros de GBIF · Año típico 2017–2024 · Un registro no equivale a un individuo.</footer>
  </main>
  <script type="application/json" id="metrics-example-data">${JSON.stringify(example).replaceAll("<", "\\u003c")}</script>
  <script type="module" src="js/pages/metrics.js"></script>
</body></html>`;
await fs.writeFile(new URL("web/metricas.html", root), html);
console.log("Generated the minimal metrics reference and its real example.");

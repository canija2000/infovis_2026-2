/** Present a single species, its photograph and an accessible regional matrix. */
import { AUSTRAL, MONTHS, MON } from "../../shared/calendar.js";
import { CLASS_ONE } from "../../shared/classes.js";

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createRegionalCalendarView({
  onSpeciesChange,
  onRegionsChange,
  onRetry,
}) {
  const root = document.getElementById("regional-calendar");
  const content = root.querySelector(".regional-content");
  const status = root.querySelector(".regional-status");
  const select = root.querySelector("select");
  const photoBox = root.querySelector(".regional-photo");
  const matrix = root.querySelector(".regional-matrix");
  const detail = root.querySelector(".regional-cell-detail");
  const regionsButton = root.querySelector(".regional-expand");
  let activeButton = null;

  select.addEventListener("change", () => onSpeciesChange(select.value));
  regionsButton.addEventListener("click", onRegionsChange);
  root.querySelector(".regional-retry").addEventListener("click", onRetry);

  function showLoading() {
    root.setAttribute("aria-busy", "true");
    status.hidden = false;
    status.querySelector("span").textContent =
      "Preparando los calendarios regionales…";
    status.querySelector("button").hidden = true;
    select.disabled = true;
    content.hidden = true;
  }
  function showError() {
    root.setAttribute("aria-busy", "false");
    status.querySelector("span").textContent =
      "No se pudieron cargar los calendarios regionales.";
    status.querySelector("button").hidden = false;
  }
  function renderPhoto({ bird, photo }) {
    // Expanding the matrix re-renders the same bird: keep its loaded photo.
    if (photo && photoBox.dataset.url === photo.url) return;
    photoBox.dataset.url = photo ? photo.url : "";
    photoBox.replaceChildren();
    if (!photo) {
      photoBox.append(
        element("p", "regional-photo-fallback", "Fotografía no disponible"),
      );
      return;
    }
    const img = element("img");
    img.alt = `${bird.comName} (${bird.sciName})`;
    img.width = 240;
    img.height = 240;
    img.decoding = "async";
    img.src = photo.url;
    img.addEventListener(
      "error",
      () => {
        img.replaceWith(
          element("p", "regional-photo-fallback", "Fotografía no disponible"),
        );
      },
      { once: true },
    );
    const caption = element("figcaption");
    const author = element("a", "", photo.author);
    author.href = photo.source;
    author.target = "_blank";
    author.rel = "noopener noreferrer";
    const license = element("a", "", photo.licenseCode || "CC BY 4.0");
    license.href = photo.license;
    license.target = "_blank";
    license.rel = "noopener noreferrer";
    caption.append(author, " · ", license);
    photoBox.append(img, caption);
  }

  // Warm the browser cache so switching species shows its photo at once.
  function preloadPhotos(photos) {
    for (const photo of photos) if (photo) new Image().src = photo.url;
  }

  function render(model) {
    root.setAttribute("aria-busy", "false");
    status.hidden = true;
    content.hidden = false;
    select.disabled = false;
    if (!select.options.length) {
      for (const choice of model.choices) {
        const option = element("option", "", choice.name);
        option.value = choice.sciName;
        select.append(option);
      }
    }
    select.value = model.bird.sciName;
    root.querySelector(".regional-bird-name").textContent = model.bird.comName;
    root.querySelector(".regional-scientific").textContent = model.bird.sciName;
    root.querySelector(".regional-reading").textContent = model.reading;
    renderPhoto(model);
    regionsButton.textContent = model.allRegions
      ? "Volver a la comparación breve"
      : `Ver las ${model.regionCount} regiones`;
    regionsButton.setAttribute("aria-expanded", String(model.allRegions));
    const table = element("table");
    const caption = element(
      "caption",
      "regional-sr-only",
      `${model.bird.comName}: perfil relativo y presencia regular por región y mes. Julio a junio; regiones de norte a sur.`,
    );
    const head = element("thead");
    const header = element("tr");
    const axis = element("th", "regional-axis", "Norte → sur");
    axis.scope = "col";
    header.append(axis);
    for (const month of AUSTRAL) {
      const label = element("th", "", MON[month]);
      label.scope = "col";
      label.setAttribute("aria-label", MONTHS[month]);
      header.append(label);
    }
    head.append(header);
    const body = element("tbody");
    const buttons = [];
    for (const [rowIndex, row] of model.rows.entries()) {
      const tr = element(
        "tr",
        row.cls === null ? "regional-no-data" : `regional-class-${row.cls}`,
      );
      const heading = element("th");
      heading.scope = "row";
      heading.append(
        element("span", "regional-region-name", row.region.name),
        element(
          "span",
          "regional-role",
          row.cls === null ? "sin datos" : CLASS_ONE[row.cls],
        ),
      );
      tr.append(heading);
      const rowButtons = [];
      for (const [columnIndex, cell] of row.cells.entries()) {
        const td = element("td");
        const button = element(
          "button",
          `regional-cell${cell.present ? " is-present" : ""}${cell.profile === null ? " is-missing" : ""}`,
        );
        button.type = "button";
        button.tabIndex = -1;
        button.dataset.month = cell.month;
        button.dataset.region = row.region.id;
        if (cell.profile !== null)
          button.style.setProperty(
            "--profile-tint",
            `${8 + cell.profile * 0.58}%`,
          );
        const description =
          cell.profile === null
            ? `${row.region.name}, ${MONTHS[cell.month]}: sin datos para esta especie.`
            : `${row.region.name} · ${MONTHS[cell.month]}: ${cell.profile}% de su pico regional · ${cell.years} de 8 años con registro · ${cell.present ? "cumple presencia regular" : "no cumple presencia regular"}.`;
        button.setAttribute("aria-label", description);
        button.setAttribute("aria-describedby", "regional-cell-detail");
        const inspect = () => {
          detail.textContent = description;
        };
        button.addEventListener("pointerenter", inspect);
        button.addEventListener("focus", () => {
          if (activeButton) activeButton.tabIndex = -1;
          activeButton = button;
          button.tabIndex = 0;
          inspect();
        });
        button.addEventListener("click", inspect);
        button.addEventListener("keydown", (event) => {
          let nextRow = rowIndex,
            nextColumn = columnIndex;
          if (event.key === "ArrowDown") nextRow++;
          else if (event.key === "ArrowUp") nextRow--;
          else if (event.key === "ArrowRight") nextColumn++;
          else if (event.key === "ArrowLeft") nextColumn--;
          else if (event.key === "Home") nextColumn = 0;
          else if (event.key === "End") nextColumn = 11;
          else return;
          event.preventDefault();
          buttons[Math.max(0, Math.min(buttons.length - 1, nextRow))][
            Math.max(0, Math.min(11, nextColumn))
          ].focus();
        });
        td.append(button);
        tr.append(td);
        rowButtons.push(button);
      }
      buttons.push(rowButtons);
      body.append(tr);
    }
    table.append(caption, head, body);
    matrix.replaceChildren(table);
    activeButton = buttons[0][0];
    activeButton.tabIndex = 0;
    detail.textContent =
      "Toca una celda para ver su detalle. Con teclado, entra con Tab y recorre con las flechas.";
  }
  return { render, preloadPhotos, showLoading, showError };
}

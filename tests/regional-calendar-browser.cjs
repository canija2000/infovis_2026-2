/** Interaction and layout checks for the regional examples, on a local static server. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const output = fs.mkdtempSync(path.join(os.tmpdir(), "infovis-regional-"));
const web = path.resolve(__dirname, "../web");
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const file = path.resolve(web, "." + decodeURIComponent(url.pathname));
  if (!file.startsWith(web + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (error, body) => {
    if (error) return res.writeHead(404).end();
    const mime = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".geojson": "application/json",
      ".mp3": "audio/mpeg",
    };
    res.setHeader(
      "Content-Type",
      mime[path.extname(file)] || "application/octet-stream",
    );
    res.end(body);
  });
});
(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const browser = await chromium.launch({
    headless: true,
    ...(fs.existsSync(chrome) ? { executablePath: chrome } : {}),
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "127.0.0.1") return route.continue();
      if (url.hostname === "cdn.jsdelivr.net")
        return route.fulfill({
          body: fs.readFileSync("node_modules/d3/dist/d3.min.js"),
          contentType: "text/javascript",
        });
      if (route.request().resourceType() === "image")
        return route.fulfill({
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"/>',
          contentType: "image/svg+xml",
        });
      return route.fulfill({ body: "", contentType: "text/css" });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const base = `http://127.0.0.1:${server.address().port}/index.html`;
    await page.goto(base);
    const root = page.locator("#regional-calendar");
    const selector = root.locator("select");
    // The section loads its data only when it nears the viewport.
    assert.equal(await root.getAttribute("aria-busy"), "true");
    await root.scrollIntoViewIfNeeded();
    await root.locator("tbody tr").first().waitFor();
    assert.equal(await selector.locator("option").count(), 3);
    assert.equal(await root.locator("tbody tr").count(), 7);
    assert.equal(await root.locator(".regional-photo img").count(), 1);
    assert.equal(await root.locator(".regional-cell[tabindex='0']").count(), 1);
    await root.locator(".regional-cell[tabindex='0']").focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(
      await page.evaluate(() => document.activeElement.dataset.month),
      "7",
    );
    await page.keyboard.press("ArrowDown");
    assert.equal(
      await page.evaluate(() => document.activeElement.dataset.region),
      "7",
    );
    await page.keyboard.press("End");
    assert.equal(
      await page.evaluate(() => document.activeElement.dataset.month),
      "5",
    );
    assert.match(
      await root.locator(".regional-cell-detail").textContent(),
      /Metropolitana.*junio/,
    );
    await selector.selectOption("Charadrius modestus");
    await root
      .locator(".regional-bird-name")
      .getByText("Chorlito chileno", { exact: true })
      .waitFor();
    assert.match(
      await root.locator(".regional-reading").textContent(),
      /Magallanes/,
    );
    assert.match(
      await root.locator(".regional-photo img").getAttribute("alt"),
      /Chorlito chileno/,
    );
    await selector.selectOption("Elaenia albiceps");
    assert.match(
      await root.locator(".regional-reading").textContent(),
      /septiembre.*octubre/,
    );
    assert.match(
      await root
        .locator('.regional-cell[data-region="7"][data-month="8"]')
        .getAttribute("class"),
      /is-present/,
    );
    assert.doesNotMatch(
      await root
        .locator('.regional-cell[data-region="16"][data-month="8"]')
        .getAttribute("class"),
      /is-present/,
    );
    await root.locator(".regional-expand").click();
    assert.equal(await root.locator("tbody tr").count(), 16);
    assert.equal(
      await root.locator(".regional-expand").getAttribute("aria-expanded"),
      "true",
    );
    await selector.selectOption("Sephanoides sephaniodes");
    assert.equal(
      await root.locator("tbody tr").count(),
      16,
      "species changes preserve expansion",
    );
    assert.equal(
      await root.locator(".is-missing").count(),
      12,
      "Tarapacá has no regional row, rather than twelve zeroes",
    );
    await root.locator(".regional-expand").click();
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await root.scrollIntoViewIfNeeded();
      assert.equal(
        await root.evaluate(
          (node) =>
            node.scrollWidth > node.clientWidth ||
            node.getBoundingClientRect().right > innerWidth,
        ),
        false,
        `Regional block stays within the viewport at ${width}px`,
      );
      if (width < 1000) {
        assert.equal(
          await root
            .locator(".regional-matrix")
            .evaluate((node) => node.scrollWidth > node.clientWidth),
          true,
          "narrow screens scroll within the matrix",
        );
        await root.locator(".regional-matrix").evaluate((node) => {
          node.scrollLeft = node.scrollWidth;
        });
        assert.ok(
          await root
            .locator(".regional-matrix")
            .evaluate((node) => node.scrollLeft > 0),
        );
      }
      await root.screenshot({
        path: path.join(output, `regional-${width}.png`),
      });
    }
    await page.emulateMedia({ colorScheme: "dark" });
    await root.screenshot({ path: path.join(output, "regional-dark.png") });
    // The existing shared controls continue to respond after species changes.
    const month = page.locator("#months button").first();
    await month.click();
    assert.equal(await month.getAttribute("aria-pressed"), "true");
    assert.equal(
      await root.locator("a[data-metric]").count(),
      2,
      "the matrix uses only its explicit help links",
    );
    await root.locator('.regional-note a[data-metric="perfil"]').click();
    await page.locator(".metrics-dialog").waitFor({ state: "visible" });
    await page.locator(".metrics-close").click();
    // «Escuchar su año»: ▶ recorre la fila mes a mes y el mismo botón la detiene.
    await page.emulateMedia({ colorScheme: "light" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const play = root.locator(".regional-play").nth(1);
    const region = await root
      .locator("tbody tr")
      .nth(1)
      .locator(".regional-region-name")
      .textContent();
    assert.match(
      await play.getAttribute("aria-label"),
      new RegExp(`^Escuchar el año de .+ en ${region}$`),
    );
    await play.click();
    await root.locator(".regional-cell.is-now").waitFor();
    assert.equal(await play.getAttribute("aria-pressed"), "true");
    const first = await root
      .locator(".regional-cell.is-now")
      .getAttribute("data-month");
    await page.waitForTimeout(1700);
    assert.notEqual(
      await root.locator(".regional-cell.is-now").getAttribute("data-month"),
      first,
      "the marker advances one month every 1.5 s",
    );
    assert.match(
      await root.locator(".regional-cell-detail").textContent(),
      /^♪ /,
    );
    await root.screenshot({ path: path.join(output, "regional-playing.png") });
    await play.click();
    assert.equal(await play.getAttribute("aria-pressed"), "false");
    assert.equal(await root.locator(".regional-cell.is-now").count(), 0);
    // Retry after a data failure, independently of the other overview requests.
    let failData = true;
    await page.route("**/data/typical_year.json", (route) =>
      failData
        ? route.fulfill({ status: 503, body: "Unavailable" })
        : route.continue(),
    );
    await page.goto(base);
    await root.scrollIntoViewIfNeeded();
    await root.locator(".regional-retry").waitFor({ state: "visible" });
    failData = false;
    await root.locator(".regional-retry").click();
    await root.locator("tbody tr").first().waitFor();
    assert.equal(await selector.isEnabled(), true);
    // Photo failures leave a useful matrix and an explicit fallback.
    await page.route("**/inaturalist-open-data.s3.amazonaws.com/**", (route) =>
      route.fulfill({ status: 503, body: "Unavailable" }),
    );
    await page.goto(base);
    await root.scrollIntoViewIfNeeded();
    await root.locator("tbody tr").first().waitFor();
    await root.locator(".regional-photo-fallback").waitFor();
    assert.equal(await root.locator("tbody tr").count(), 7);
    assert.deepEqual(errors, []);
    await context.close();

    // A separate visual pass uses the actual published photographs and remote fonts.
    const real = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    });
    await real.route("**/d3.min.js", (route) =>
      route.fulfill({
        body: fs.readFileSync("node_modules/d3/dist/d3.min.js"),
        contentType: "text/javascript",
      }),
    );
    const visual = await real.newPage();
    await visual.goto(base);
    const section = visual.locator("#regional-calendar");
    await section.scrollIntoViewIfNeeded();
    for (const [name, value] of [
      ["picaflor", "Sephanoides sephaniodes"],
      ["chorlito", "Charadrius modestus"],
      ["fiofio", "Elaenia albiceps"],
    ]) {
      await section.locator("select").selectOption(value);
      await section.scrollIntoViewIfNeeded();
      await section.locator("img").waitFor();
      await visual.waitForFunction(
        () => {
          const img = document.querySelector(".regional-photo img");
          return img?.complete && img.naturalWidth > 0;
        },
        null,
        { timeout: 25000 },
      );
      await section.screenshot({
        path: path.join(output, `regional-real-${name}.png`),
      });
    }
    await visual.setViewportSize({ width: 390, height: 1100 });
    await section.screenshot({
      path: path.join(output, "regional-real-mobile.png"),
    });
    await real.close();
    console.log(
      `Regional calendar: selection, 3 real photos, published profiles, keyboard, expansion, listening to a region, responsive layout, retry and photo failure passed. Screenshots: ${output}`,
    );
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

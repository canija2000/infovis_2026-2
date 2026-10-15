/** Reference integration checks with an isolated local static server. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const os = require("node:os");
const output = fs.mkdtempSync(path.join(os.tmpdir(), "infovis-metrics-"));
const webRoot = path.resolve(__dirname, "../web");
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const file = path.resolve(webRoot, "." + decodeURIComponent(url.pathname));
  if (!file.startsWith(webRoot + path.sep)) return res.writeHead(403).end();
  const mime = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".geojson": "application/json",
    ".mp3": "audio/mpeg",
  };
  fs.readFile(file, (error, body) => {
    if (error) return res.writeHead(404).end();
    res.setHeader(
      "Content-Type",
      mime[path.extname(file)] || "application/octet-stream",
    );
    res.end(body);
  });
});
(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : fs.existsSync(
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          )
        ? {
            executablePath:
              "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          }
        : {}),
    headless: true,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    // Keep interface checks independent of remote photo/font availability.
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "127.0.0.1" || url.hostname === "localhost")
        return route.continue();
      if (url.hostname === "cdn.jsdelivr.net")
        return route.fulfill({
          body: fs.readFileSync("node_modules/d3/dist/d3.min.js"),
          contentType: "text/javascript",
        });
      if (route.request().resourceType() === "stylesheet")
        return route.fulfill({ body: "", contentType: "text/css" });
      if (route.request().resourceType() === "image")
        return route.fulfill({
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"/>',
          contentType: "image/svg+xml",
        });
      return route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const base =
      process.env.METRICS_TEST_URL ||
      `http://127.0.0.1:${server.address().port}`;
    for (const name of ["index.html", "explorar.html"]) {
      await page.goto(`${base}/${name}`);
      await page.locator('a[data-metric="presente"]').first().waitFor();
      await page.locator('a[data-metric="presente"]').first().click();
      const dialog = page.locator(".metrics-dialog");
      await dialog.waitFor({ state: "visible" });
      const frame = page.frameLocator(".metrics-dialog iframe");
      await frame.locator("#presente").waitFor();
      await page.waitForFunction(() => {
        const doc = document.querySelector(
          ".metrics-dialog iframe",
        ).contentDocument;
        return (
          doc?.location.hash === "#presente" &&
          doc.getElementById("presente").getBoundingClientRect().top < 100
        );
      });
      assert.ok((await frame.locator("math").count()) >= 35);
      assert.equal(
        await frame.locator("#presente").evaluate((el) => el.open),
        true,
      );
      assert.equal(await frame.locator(".site-nav").count(), 0);
      await page.screenshot({ path: path.join(output, `metrics-${name}.png`) });
      await page.locator(".metrics-close").click();
      assert.equal(
        await page.locator(".metrics-dialog").evaluate((e) => e.open),
        false,
      );
      assert.equal(
        await page.evaluate(() => document.activeElement.dataset.metric),
        "presente",
      );
      await page.locator('a[data-metric="ejemplo"]').click();
      await frame.locator("#example-month").selectOption("6");
      await frame
        .locator("#example-presence")
        .getByText("No supera la regla de presencia", { exact: true })
        .waitFor();
      await frame.locator("#example-month").selectOption("0");
      await frame
        .locator("#example-presence")
        .getByText("Presente", { exact: true })
        .waitFor();
      await frame.locator("#example-scope").selectOption("7");
      assert.match(
        await frame
          .locator("#example-scope")
          .evaluate((el) => el.selectedOptions[0].textContent),
        /Metropolitana/,
      );
      await frame.locator("#example-month").focus();
      await page.keyboard.press("Escape");
      await page.waitForTimeout(100);
      assert.equal(
        await dialog.evaluate((e) => e.open),
        false,
        "Escape closes from iframe",
      );
    }
    await page.goto(`${base}/metricas.html`);
    const missing = await page
      .locator('a[href^="#"]')
      .evaluateAll((links) =>
        links
          .map((a) => a.hash.slice(1))
          .filter((id) => !document.getElementById(id)),
      );
    assert.deepEqual(missing, [], "Every internal concept resolves");
    assert.equal(
      await page.locator("img").getAttribute("alt"),
      "Fío-fío (Elaenia albiceps)",
    );
    assert.equal(await page.locator(".orbit-metric").count(), 12);
    assert.equal(
      await page
        .locator(".metrics-bird img")
        .evaluate((el) => getComputedStyle(el).borderRadius),
      "50%",
    );
    const orbitMetric = page.locator(".orbit-metric").first();
    const before = await orbitMetric.boundingBox();
    await orbitMetric.hover();
    const after = await orbitMetric.boundingBox();
    assert.ok(
      after.width > before.width * 1.15,
      "Hover enlarges an orbit metric",
    );
    await orbitMetric.click();
    await page.waitForFunction(
      () => document.getElementById("frecuencia").open,
    );
    await page.goto(`${base}/metricas.html#calidad-audio`);
    await page.waitForFunction(
      () => document.getElementById("calidad-audio").open,
    );
    assert.equal(
      await page.locator(".metrics-other").evaluate((el) => el.open),
      true,
    );
    await page.goto(`${base}/metricas.html`);
    await page.screenshot({
      path: path.join(output, "metrics-desktop.png"),
      fullPage: false,
    });
    for (const width of [390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${base}/metricas.html`);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        "No page overflow",
      );
      const collisions = await page
        .locator(".orbit-metric")
        .evaluateAll((nodes) => {
          const overlaps = [];
          const texts = nodes.flatMap((node, i) =>
            [...node.children].map((el) => ({
              i,
              text: el.textContent,
              r: el.getBoundingClientRect(),
            })),
          );
          for (let a = 0; a < texts.length; a++)
            for (let b = a + 1; b < texts.length; b++) {
              const x = texts[a],
                y = texts[b];
              if (
                x.i !== y.i &&
                Math.min(x.r.right, y.r.right) - Math.max(x.r.left, y.r.left) >
                  2 &&
                Math.min(x.r.bottom, y.r.bottom) - Math.max(x.r.top, y.r.top) >
                  2
              )
                overlaps.push([x.text, y.text]);
            }
          return overlaps;
        });
      assert.deepEqual(
        collisions,
        [],
        `Orbit labels do not overlap at ${width}px`,
      );
      await page.screenshot({
        path: path.join(output, `metrics-${width}.png`),
      });
      await page.goto(`${base}/explorar.html`);
      await page.locator('a[data-metric="ejemplo"]').click();
      await page.frameLocator("iframe").locator("#example-title").waitFor();
      await page.screenshot({
        path: path.join(output, `metrics-modal-${width}.png`),
      });
      await page.locator(".metrics-close").click();
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(
    `Metrics: links, anchors, real example, keyboard, desktop and mobile passed. Screenshots: ${output}`,
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

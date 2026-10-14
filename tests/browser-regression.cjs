/* Compare the public UI against an untouched Git revision; no production hooks. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const { PNG } = require("pngjs");
const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const baseline = args[args.indexOf("--baseline") + 1] || "57b6dc8";
const output =
  process.env.REGRESSION_OUTPUT ||
  fs.mkdtempSync(path.join(os.tmpdir(), "infovis-regression-"));
fs.mkdirSync(output, { recursive: true });
const baselineRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "infovis-original-"),
);
execFileSync("git", ["archive", "--format=tar", baseline], {
  cwd: root,
  stdio: [
    "ignore",
    fs.openSync(path.join(baselineRoot, "source.tar"), "w"),
    "pipe",
  ],
});
execFileSync("tar", [
  "-xf",
  path.join(baselineRoot, "source.tar"),
  "-C",
  baselineRoot,
]);
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".geojson": "application/json",
  ".mp3": "audio/mpeg",
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const [kind, ...parts] = decodeURIComponent(url.pathname)
    .split("/")
    .filter(Boolean);
  const base = kind === "original" ? baselineRoot : root;
  const file = path.resolve(base, "web", parts.join("/") || "index.html");
  if (!file.startsWith(path.join(base, "web") + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      "Content-Type",
      mime[path.extname(file)] || "application/octet-stream",
    );
    res.end(data);
  });
});
const transparent = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
  "base64",
);
async function installEnvironment(context, mockAudio = true) {
  await context.route("**/*", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.hostname === "127.0.0.1") return route.continue();
    if (url.hostname === "cdn.jsdelivr.net")
      return route.fulfill({
        body: fs.readFileSync(
          process.env.D3_BUNDLE ||
            path.join(path.dirname(require.resolve("d3")), "../dist/d3.min.js"),
        ),
        contentType: "text/javascript",
      });
    if (req.resourceType() === "image")
      return route.fulfill({ body: transparent, contentType: "image/png" });
    if (req.resourceType() === "stylesheet")
      return route.fulfill({ body: "", contentType: "text/css" });
    return route.abort();
  });
  if (!mockAudio) return;
  await context.addInitScript(() => {
    let seed = 41;
    Math.random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const param = () => ({
      value: 0,
      setValueAtTime() {},
      linearRampToValueAtTime() {},
      exponentialRampToValueAtTime() {},
      setTargetAtTime() {},
    });
    const node = () => ({
      gain: param(),
      frequency: param(),
      detune: param(),
      Q: param(),
      pan: param(),
      playbackRate: param(),
      threshold: param(),
      ratio: param(),
      connect() {
        return this;
      },
      disconnect() {},
      start() {},
      stop() {},
    });
    window.AudioContext = class {
      constructor() {
        this.currentTime = 0;
        this.state = "suspended";
      }
      async resume() {
        this.state = "running";
      }
      createGain() {
        return node();
      }
      createDynamicsCompressor() {
        return node();
      }
      createBufferSource() {
        return node();
      }
      createOscillator() {
        return node();
      }
      createBiquadFilter() {
        return node();
      }
      createStereoPanner() {
        return node();
      }
      createBuffer(channels, length, rate) {
        const data = Array.from(
          { length: channels },
          () => new Float32Array(length),
        );
        return {
          numberOfChannels: channels,
          sampleRate: rate,
          duration: length / rate,
          getChannelData: (c) => data[c],
        };
      }
      async decodeAudioData() {
        return this.createBuffer(1, 132300, 22050);
      }
    };
  });
}
async function capture(page, name, ids) {
  await page.waitForTimeout(1700);
  const snapshot = await page.evaluate(
    (ids) =>
      Object.fromEntries(
        ids.map((id) => [id, document.getElementById(id)?.outerHTML]),
      ),
    ids,
  );
  const image = await page.screenshot({
    fullPage: true,
    animations: "disabled",
  });
  return { name, snapshot, image };
}
async function scenarios(browser, kind, config) {
  const context = await browser.newContext({
    viewport: config.viewport,
    colorScheme: config.dark ? "dark" : "light",
    deviceScaleFactor: 1,
  });
  await installEnvironment(context);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.stack));
  page.on("response", (r) => {
    if (r.url().startsWith("http://127.") && r.status() >= 400)
      errors.push(`${r.status()} ${r.url()}`);
  });
  const records = [];
  const ids = [
    "pulse",
    "flock",
    "months",
    "maps",
    "region-picker",
    "region-maps",
    "table",
    "now-playing",
    "play",
    "mute",
  ];
  await page.goto(`${config.url}/${kind}/index.html`);
  await page.waitForSelector("#region-maps svg");
  await page.waitForSelector("#now-playing .v");
  records.push(await capture(page, "inicio-default", ids));
  if (config.full) {
    await page.locator("#months button").filter({ hasText: "jul" }).click();
    records.push(await capture(page, "inicio-julio", ids));
    await page.locator('#maps-mode [data-mode="regions"]').click();
    records.push(await capture(page, "inicio-regiones", ids));
    await page.selectOption("#region-select", "16");
    await page.waitForFunction(() =>
      document.querySelector("#region-name").textContent.includes("Magallanes"),
    );
    await page.locator('#sound-scope [data-scope="region"]').click();
    await page.locator("#hide-residents").check();
    records.push(await capture(page, "inicio-magallanes", ids));
    await page.locator("#mute").click();
    await page.reload();
    await page.waitForSelector("#region-maps svg");
    assert.equal(await page.getAttribute("#mute", "aria-pressed"), "true");
    records.push(await capture(page, "inicio-silencio-persistido", ids));
  }
  const eids = [
    "summary",
    "map",
    "scope-stats",
    "tabs",
    "calendar",
    "region-grid",
    "panel",
    "mixer",
    "mixer-open",
    "month-label",
    "play",
    "mute",
  ];
  await page.goto(`${config.url}/${kind}/explorar.html`);
  await page.waitForSelector("#calendar .srow");
  assert.equal(
    await page.locator("#mixer-grid .mixer-card").count(),
    0,
    "catalog should load lazily",
  );
  records.push(await capture(page, "explorar-default", eids));
  if (config.full) {
    await page.locator("#tabs button").first().click();
    await page.locator("#map path.region").nth(6).click();
    await page.locator("#month").fill("3");
    records.push(await capture(page, "explorar-region-residentes", eids));
    await page.locator("#cal-more").click();
    records.push(await capture(page, "explorar-expandido", eids));
    await page.locator("#search").fill("Zonotrichia capensis");
    await page.locator("#search").press("Enter");
    await page.waitForSelector("#p-sound #p-mix");
    records.push(await capture(page, "explorar-ficha", eids));
    await page.locator("#p-mix").click();
    await page.waitForSelector("#mixer-tracks li");
    await page.locator("#mixer-search-toggle").click();
    await page.locator("#mixer-query").fill("fio fio");
    records.push(await capture(page, "mezclador-busqueda", eids));
    await page.locator("#mixer-grid .mixer-card:visible").first().click();
    await page.locator("#mixer-play").click();
    await page.locator("#mixer-sync").check();
    await page.locator("#mixer-tracks input").first().fill("23");
    await page.locator("#mute").click();
    records.push(await capture(page, "mezclador-reproduccion", eids));
    await page.locator("#mixer-tracks .mixer-remove").first().click();
    await page.locator("#mixer-query").press("Escape");
    assert.equal(await page.locator("#mixer-catalog").isVisible(), false);
    await page.locator("#mixer-close").click();
    await page.locator("#panel-close").click();
    await page.locator("#play").click();
    await page.locator("#play").click();
    records.push(await capture(page, "explorar-cierre", eids));
  }
  assert.deepEqual(errors, [], `browser errors (${kind})`);
  await context.close();
  return records;
}
async function realAudioSmoke(browser, kind, url) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await installEnvironment(context, false);
  await context.addInitScript(() => {
    const Native = window.AudioContext || window.webkitAudioContext;
    window.__audio = { decoded: 0, starts: 0 };
    window.AudioContext = class extends Native {
      async decodeAudioData(...args) {
        const buffer = await super.decodeAudioData(...args);
        window.__audio.decoded++;
        return buffer;
      }
      createBufferSource() {
        const source = super.createBufferSource(),
          start = source.start.bind(source);
        source.start = (...args) => {
          window.__audio.starts++;
          return start(...args);
        };
        return source;
      }
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.stack));
  await page.goto(`${url}/${kind}/index.html`);
  await page.waitForSelector("#now-playing .v");
  await page.locator("#months button").first().click();
  await page.waitForFunction(() => window.__audio.starts > 0);
  await page.waitForFunction(
    () => document.querySelectorAll("#bars .on").length === 1,
  );
  await page.locator("#play").click();
  assert.equal(await page.getAttribute("#play", "aria-pressed"), "false");
  await page.goto(`${url}/${kind}/explorar.html`);
  await page.waitForSelector("#calendar .srow");
  await page.locator("#play").click();
  await page.waitForFunction(
    () => window.__audio.decoded > 0 && window.__audio.starts > 0,
  );
  await page.locator("#play").click();
  await page.locator("#search").fill("Zonotrichia capensis");
  await page.locator("#search").press("Enter");
  await page.waitForSelector("#p-mix");
  await page.locator("#p-mix").click();
  await page.waitForSelector("#mixer-tracks li");
  const previous = await page.evaluate(() => window.__audio.starts);
  await page.locator("#mixer-sync").check();
  await page.locator("#mixer-play").click();
  await page.waitForFunction(
    (before) => window.__audio.starts > before,
    previous,
  );
  await page.locator("#mixer-tracks .mixer-remove").click();
  assert.equal(await page.getAttribute("#mixer-play", "aria-pressed"), "false");
  assert.deepEqual(errors, []);
  await context.close();
  console.log(
    `PASS ${kind}: real browser decoding and all three audio systems`,
  );
}
async function edgeCases(browser, kind, url) {
  const results = {};
  for (const scenario of [
    "initial-data-failure",
    "slow-region",
    "media-retry",
    "remove-loading-track",
  ]) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    await installEnvironment(context);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.stack));
    if (scenario === "initial-data-failure") {
      await page.route("**/data/overview.json*", (route) =>
        route.fulfill({ status: 503, body: "unavailable" }),
      );
      await page.goto(`${url}/${kind}/index.html`);
      await page.waitForFunction(() =>
        document.querySelector("#pulse").textContent.includes("No se pudieron"),
      );
      results[scenario] = await page.locator("#pulse").innerHTML();
    } else if (scenario === "slow-region") {
      await page.route("**/grid_region/CL-RM.json*", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await route.continue();
      });
      await page.goto(`${url}/${kind}/index.html`);
      await page.waitForSelector("#region-picker svg");
      await page.selectOption("#region-select", "16");
      await page.waitForSelector("#region-maps svg");
      await page.waitForTimeout(1300);
      results[scenario] = await page.locator("#region-maps").innerHTML();
      assert.match(
        await page.locator("#region-name").textContent(),
        /Magallanes/,
      );
    } else {
      if (scenario === "media-retry") {
        let requests = 0;
        await page.route("**/data/sounds.json*", (route) =>
          ++requests === 1
            ? route.fulfill({ status: 503, body: "unavailable" })
            : route.continue(),
        );
      }
      await page.goto(`${url}/${kind}/explorar.html`);
      await page.waitForSelector("#calendar .srow");
      await page.locator("#search").fill("Zonotrichia capensis");
      await page.locator("#search").press("Enter");
      if (scenario === "media-retry") {
        await page.waitForFunction(() =>
          document.querySelector("#p-sound").textContent.includes("No se pudo"),
        );
        await page.locator("#mixer-open").click();
        await page.waitForFunction(
          () => !document.querySelector("#mixer-search-toggle").disabled,
        );
        results[scenario] = await page.locator("#mixer-grid").innerHTML();
      } else {
        await page.waitForSelector("#p-mix");
        await page.locator("#p-mix").click();
        await page.waitForSelector("#mixer-tracks li");
        await page.route("**/audio/**/*.mp3", async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 700));
          await route.continue();
        });
        await page.locator("#mixer-sync").check();
        await page.locator("#mixer-play").click();
        await page.locator("#mixer-tracks .mixer-remove").click();
        await page.waitForTimeout(1000);
        results[scenario] = {
          tracks: await page.locator("#mixer-tracks").innerHTML(),
          playing: await page.getAttribute("#mixer-play", "aria-pressed"),
          status: await page.locator("#mixer-status").textContent(),
        };
        assert.equal(results[scenario].playing, "false");
      }
    }
    assert.deepEqual(errors, [], scenario);
    await context.close();
  }
  return results;
}

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const options = { headless: true };
  if (process.env.CHROME_PATH) options.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(options);
  const report = [];
  const pixelmatch = (await import(require.resolve("pixelmatch"))).default;
  try {
    for (const config of [
      { name: "desktop", viewport: { width: 1280, height: 900 }, full: true },
      { name: "mobile", viewport: { width: 390, height: 844 } },
      { name: "dark", viewport: { width: 1280, height: 900 }, dark: true },
    ]) {
      const original = await scenarios(browser, "original", { ...config, url });
      const changed = await scenarios(browser, "refactored", {
        ...config,
        url,
      });
      for (let i = 0; i < original.length; i++) {
        const a = original[i],
          b = changed[i],
          name = `${config.name}-${a.name}`;
        fs.writeFileSync(path.join(output, `${name}-before.png`), a.image);
        fs.writeFileSync(path.join(output, `${name}-after.png`), b.image);
        fs.writeFileSync(
          path.join(output, `${name}-before.json`),
          JSON.stringify(a.snapshot, null, 2),
        );
        fs.writeFileSync(
          path.join(output, `${name}-after.json`),
          JSON.stringify(b.snapshot, null, 2),
        );
        assert.deepEqual(b.snapshot, a.snapshot, `DOM differs: ${name}`);
        const pa = PNG.sync.read(a.image),
          pb = PNG.sync.read(b.image);
        assert.equal(pb.width, pa.width, name);
        assert.equal(pb.height, pa.height, name);
        let pixels = 0;
        for (let j = 0; j < pa.data.length; j += 4)
          if (pa.data.subarray(j, j + 4).some((v, k) => v !== pb.data[j + k]))
            pixels++;
        // Animation timing and focus carets may vary; the exact DOM is checked above.
        const visiblePixels = pixelmatch(
          pa.data,
          pb.data,
          null,
          pa.width,
          pa.height,
          { threshold: 0.1 },
        );
        const ratio = visiblePixels / (pa.width * pa.height);
        assert.equal(
          visiblePixels,
          0,
          `${name}: ${visiblePixels} perceptually different pixels`,
        );
        report.push({ name, pixels, visiblePixels, ratio });
        console.log(
          `PASS ${name}: identical DOM, ${visiblePixels} perceptual differences (${pixels} raw)`,
        );
      }
    }
    const beforeEdges = await edgeCases(browser, "original", url);
    const afterEdges = await edgeCases(browser, "refactored", url);
    assert.deepEqual(
      afterEdges,
      beforeEdges,
      "failed or slow loads changed behavior",
    );
    console.log(
      "PASS edge cases: initial failure, slow region, retry and removing a loading track",
    );
    await realAudioSmoke(browser, "original", url);
    await realAudioSmoke(browser, "refactored", url);
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(`Artifacts: ${output}`);
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
    fs.rmSync(baselineRoot, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error(err);
  server.close();
  process.exitCode = 1;
});

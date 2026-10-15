import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, "../.."),
  js = path.join(root, "web/js");
function files(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? files(path.join(dir, e.name))
        : [path.join(dir, e.name)],
    );
}
const modules = files(js).filter((f) => f.endsWith(".js"));
test("all module imports exist and dependencies have no cycles", () => {
  const graph = new Map(
    modules.map((file) => [
      file,
      [...fs.readFileSync(file, "utf8").matchAll(/from\s+"([^"]+)"/g)].map(
        (m) => path.resolve(path.dirname(file), m[1]),
      ),
    ]),
  );
  const visited = new Set(),
    active = new Set();
  function walk(file) {
    assert.ok(graph.has(file), `missing module ${file}`);
    assert.ok(!active.has(file), `circular dependency ${file}`);
    if (visited.has(file)) return;
    active.add(file);
    graph.get(file).forEach(walk);
    active.delete(file);
    visited.add(file);
  }
  modules.forEach(walk);
});
test("data and audio do not render DOM; views never load files or create AudioContexts", () => {
  for (const file of modules) {
    const rel = path.relative(js, file),
      body = fs.readFileSync(file, "utf8");
    if (/^(data|audio)\//.test(rel)) assert.ok(!/\bdocument\b/.test(body), rel);
    if (rel.startsWith("views/"))
      assert.ok(
        !/\bfetch\(|\bAudioContext\b|\bdecodeAudioData\b|\bloadRegion\(|\bloadImages\(|\bloadSounds\(/.test(
          body,
        ),
        rel,
      );
    if (rel.startsWith("views/"))
      assert.ok(
        !/\bstate\.\w+\s*=(?!=)/.test(body),
        `view mutates application state: ${rel}`,
      );
  }
});
test("published data, audio and deployment configuration are unchanged", () => {
  execFileSync(
    "git",
    [
      "diff",
      "--exit-code",
      "57b6dc8",
      "--",
      "web/data",
      "web/audio",
      "wrangler.jsonc",
      ".github/workflows/pages.yml",
    ],
    { cwd: root },
  );
});

test("metrics coordinators delegate presentation and rules stay independent of the DOM", () => {
  for (const name of ["metrics.js", "metrics-links.js"]) {
    const body = fs.readFileSync(path.join(js, "pages", name), "utf8");
    assert.ok(
      !/\b(innerHTML|createElement|createTreeWalker|MutationObserver|showModal|scrollIntoView)\b/.test(
        body,
      ),
      `presentation leaked into pages/${name}`,
    );
  }
  for (const dir of ["metrics", "state"]) {
    for (const file of files(path.join(js, dir))) {
      const body = fs.readFileSync(file, "utf8");
      assert.ok(
        !/\b(document|window|fetch|toLocaleString)\b/.test(body),
        `DOM, loading or formatting leaked into ${file}`,
      );
    }
  }
  for (const file of files(path.join(js, "views/metrics"))) {
    const body = fs.readFileSync(file, "utf8");
    assert.ok(
      !/from\s+["'][^"']*\/(pages|state|data)\//.test(body),
      `view depends on coordination, state or data loading: ${file}`,
    );
  }
});

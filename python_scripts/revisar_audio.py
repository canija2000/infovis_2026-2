"""Revisión de los cantos del loop: servidor local para escuchar cada clip y decidir.

Uso (desde la raíz del repo):
    python3 python_scripts/revisar_audio.py [--port 8778]
    → abre http://localhost:8778

Muestra primero las especies que suenan en el loop de la portada (las que suenan con
más copias, arriba) y, dentro de eso, los clips más sospechosos (menos contraste entre
canto y fondo, según python_scripts/audio_review/analisis.json). Por cada especie:
el clip original, la pista limpiada del mezclador y los tramos de 2 s que toca el loop.

Decisiones (se guardan al instante en python_scripts/audio_review/decisiones.json):
    bien      el clip sirve tal cual
    original  la pista limpiada suena rara (artefactos): el loop usa el clip sin limpiar
    excluir   el clip no sirve (casi solo fondo, otra especie, ruido): la especie sale
              del loop y entra la siguiente más extendida
Después:  python3 python_scripts/build_loop_data.py
Para cambiar la grabación de una especie (no solo excluirla), anotar en
audio_overrides.json {"Nombre científico": {"exclude": ["<id XC>"]}} y volver a correr
preparar_audio_web.py (ver su documentación).
"""

from __future__ import annotations

import argparse
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "python_scripts" / "audio_review"
ANALYSIS = REVIEW / "analisis.json"
DECISIONS = REVIEW / "decisiones.json"

PAGE = """<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Revisión de cantos</title>
<style>
 :root { --bg:#fcfcfb; --ink:#16161a; --ink2:#4f4e4a; --ink3:#85847e; --rule:#e4e2dc; --ok:#288665; --warn:#b86a14; --bad:#b3261e; }
 @media (prefers-color-scheme: dark) { :root { --bg:#151514; --ink:#f4f3ef; --ink2:#c3c2b7; --ink3:#8f8e86; --rule:#34332f; } }
 body { margin:0; padding:16px 24px 48px; background:var(--bg); color:var(--ink); font:15px/1.45 system-ui, sans-serif; }
 h1 { font-size:20px; margin:0 0 4px; } p.lede { color:var(--ink2); margin:0 0 12px; max-width:90ch; }
 .bar { position:sticky; top:0; background:var(--bg); padding:8px 0; border-bottom:1px solid var(--rule); display:flex; gap:16px; flex-wrap:wrap; align-items:center; z-index:2; }
 .bar label { font-size:13px; color:var(--ink2); }
 .count { font:12px ui-monospace, monospace; color:var(--ink3); }
 .row { display:grid; grid-template-columns: 240px 1fr 260px; gap:12px 20px; padding:12px 0; border-bottom:1px solid var(--rule); align-items:start; }
 .row.done { opacity:.6; }
 .name b { display:block; } .name i { color:var(--ink3); font-size:13px; }
 .meta { font:12px ui-monospace, monospace; color:var(--ink2); margin-top:4px; }
 .meta .low { color:var(--bad); font-weight:600; }
 .players { display:grid; gap:6px; } .players div { display:flex; align-items:center; gap:8px; font-size:12px; color:var(--ink3); }
 .players span { width:64px; flex:none; } audio { height:32px; width:100%; max-width:420px; }
 .wins button { font:12px ui-monospace, monospace; padding:3px 8px; border:1px solid var(--rule); border-radius:6px; background:none; color:var(--ink); cursor:pointer; margin-right:4px; }
 .choice { display:flex; flex-direction:column; gap:6px; }
 .choice .opts { display:flex; gap:4px; flex-wrap:wrap; }
 .choice button { font:13px system-ui; padding:4px 10px; border:1px solid var(--rule); border-radius:999px; background:none; color:var(--ink); cursor:pointer; }
 .choice button[aria-pressed=true][data-v=bien] { background:var(--ok); color:#fff; border-color:var(--ok); }
 .choice button[aria-pressed=true][data-v=original] { background:var(--warn); color:#fff; border-color:var(--warn); }
 .choice button[aria-pressed=true][data-v=excluir] { background:var(--bad); color:#fff; border-color:var(--bad); }
 .choice input { font:13px system-ui; padding:4px 6px; border:1px solid var(--rule); border-radius:6px; background:none; color:var(--ink); }
 .saved { font:11px ui-monospace, monospace; color:var(--ok); min-height:14px; }
 @media (max-width: 900px) { .row { grid-template-columns: 1fr; } }
</style></head><body>
<h1>Revisión de cantos del loop</h1>
<p class="lede">Escucha cada clip y decide. <b>Bien</b>: sirve. <b>Original</b>: la pista limpiada suena rara; el loop usa
 el clip sin limpiar. <b>Excluir</b>: casi solo fondo, otra especie o ruido; la especie sale del loop. Arriba, las que más
 suenan; en rojo, contraste bajo (posible fondo). Los botones «tramo» tocan los 2 s que usa el loop. Cada cambio se guarda solo.
 Al terminar: <code>python3 python_scripts/build_loop_data.py</code>.</p>
<div class="bar">
 <label><input type="checkbox" id="only-loop" checked> Solo las que suenan en el loop</label>
 <label><input type="checkbox" id="only-pending"> Solo sin revisar</label>
 <label>Ámbito <select id="scope"><option value="">todos</option></select></label>
 <span class="count" id="count"></span>
</div>
<div id="list"></div>
<script>
const CLS = ["residente", "visitante de verano", "visitante de invierno", "ocasional"];
const REGIONS = __REGIONS__;
let A = {}, D = {};
async function save(sid, patch) {
  D[sid] = { ...(D[sid] || {}), ...patch };
  const r = await fetch("/decision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sid, ...D[sid] }) });
  const el = document.querySelector(`[data-sid="${sid}"] .saved`);
  if (el) el.textContent = r.ok ? "guardado" : "error al guardar";
  render();
}
function playWindow(src, start) {
  const a = new Audio(src);
  a.currentTime = start;
  a.play();
  setTimeout(() => a.pause(), 2000);
}
function row(sid, e) {
  const d = D[sid] || {};
  const s = e.src || {}, m = e.mixer;
  const low = (x) => (x < 15 ? ` class="low"` : "");
  const file = m && d.estado !== "original" ? m : s;
  const wins = (file.windows || []).map((w) => `<button type="button" data-play="/web/${file.path}" data-at="${w}">tramo ${w.toFixed(1)} s</button>`).join("");
  return `<div class="row${d.estado ? " done" : ""}" data-sid="${sid}">
   <div class="name"><b>${e.name}</b><i>${e.sci} · ${CLS[e.cls]}</i>
    <div class="meta">banda ${s.band} · contraste <span${low(s.contrast)}>${s.contrast} dB</span> · canto ${s.activity} %</div>
    <div class="meta">${e.maxCopies ? `loop: hasta ×${e.maxCopies} · ${e.scopes.map((x) => REGIONS[x] || x).join(", ")}` : "no suena en el loop"}</div>
    <div class="meta"><a href="${e.url}" target="_blank" rel="noopener">XC${e.xc}</a> · ${e.recordist || ""}</div></div>
   <div class="players">
    <div><span>original</span><audio controls preload="none" src="/web/${s.path}"></audio></div>
    ${m ? `<div><span>limpiado</span><audio controls preload="none" src="/web/${m.path}"></audio></div>
    <div class="meta">limpiado: contraste <span${low(m.contrast)}>${m.contrast} dB</span></div>` : `<div class="meta">sin pista limpiada (licencia ND)</div>`}
    <div class="wins">${wins}</div></div>
   <div class="choice"><div class="opts">
    ${["bien", "original", "excluir"].map((v) => `<button type="button" data-v="${v}" aria-pressed="${d.estado === v}"${v === "original" && !m ? " disabled" : ""}>${v}</button>`).join("")}</div>
    <input type="text" placeholder="nota (opcional)" value="${(d.nota || "").replace(/"/g, "&quot;")}">
    <div class="saved"></div></div></div>`;
}
function render() {
  const onlyLoop = document.getElementById("only-loop").checked;
  const onlyPending = document.getElementById("only-pending").checked;
  const scope = document.getElementById("scope").value;
  const items = Object.entries(A)
    .filter(([sid, e]) => (!onlyLoop || e.maxCopies) && (!onlyPending || !(D[sid] || {}).estado) && (!scope || e.scopes.includes(+scope)))
    .sort(([, a], [, b]) => b.maxCopies - a.maxCopies || a.src.contrast - b.src.contrast);
  const list = document.getElementById("list");
  const open = document.activeElement && document.activeElement.tagName === "INPUT" && document.activeElement.type === "text";
  if (open) return; // no redibujar mientras se escribe una nota
  list.innerHTML = items.map(([sid, e]) => row(sid, e)).join("");
  const done = Object.values(D).filter((d) => d.estado).length;
  document.getElementById("count").textContent = `${items.length} especies · ${done} revisadas`;
}
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("button");
  if (!b) return;
  if (b.dataset.play) return playWindow(b.dataset.play, +b.dataset.at);
  const r = b.closest("[data-sid]");
  if (r && b.dataset.v) save(r.dataset.sid, { estado: b.dataset.v });
});
document.addEventListener("change", (ev) => {
  if (ev.target.matches(".choice input")) {
    const r = ev.target.closest("[data-sid]");
    ev.target.blur();
    save(r.dataset.sid, { nota: ev.target.value });
  } else render();
});
// Un solo audio a la vez.
document.addEventListener("play", (ev) => document.querySelectorAll("audio").forEach((a) => a !== ev.target && a.pause()), true);
(async () => {
  [A, D] = await Promise.all([fetch("/analisis").then((r) => r.json()), fetch("/decisiones").then((r) => r.json())]);
  const sel = document.getElementById("scope");
  Object.entries(REGIONS).forEach(([id, n]) => sel.insertAdjacentHTML("beforeend", `<option value="${id}">${n}</option>`));
  render();
})();
</script></body></html>
"""


def load(path: Path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *args):  # silencioso
        pass

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            meta = load(ROOT / "web" / "data" / "meta.json", {"regions": []})
            regions = {r["id"]: r["name"] for r in meta["regions"]}
            body = PAGE.replace("__REGIONS__", json.dumps(regions, ensure_ascii=False)).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path == "/analisis":
            self.send_json(load(ANALYSIS, {}))
        elif self.path == "/decisiones":
            self.send_json(load(DECISIONS, {}))
        elif self.path.startswith("/web/audio/"):
            super().do_GET()  # solo se sirven los audios publicados
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path != "/decision":
            return self.send_error(404)
        data = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        sid = str(data.pop("sid", ""))
        if sid not in load(ANALYSIS, {}) or data.get("estado") not in (None, "bien", "original", "excluir"):
            return self.send_json({"error": "dato inválido"}, 400)
        decisions = load(DECISIONS, {})
        entry = {k: v for k, v in data.items() if k in ("estado", "nota") and v}
        entry["especie"] = load(ANALYSIS, {})[sid]["name"]
        decisions[sid] = entry
        DECISIONS.write_text(json.dumps(decisions, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")
        self.send_json({"ok": True})


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8778)
    args = ap.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Revisión de cantos en http://localhost:{args.port} (Ctrl+C para salir)")
    server.serve_forever()


if __name__ == "__main__":
    main()

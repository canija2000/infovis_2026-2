"""Revisión editable de paletas: servidor local con un selector de color por zona y botón Aprobar.

Uso:
    python3 python_scripts/enrich/review_palettes.py [--region CL-VS] [--port 8777]
    → abre http://localhost:8777

Cada cambio se guarda al instante en web/data/game/enrich/palette_review.json (versionado):
    {sciName: {"colors": {zona: [r,g,b]}, "accentWhere": ..., "pattern": {...}, "approved": bool}}
y se aplica también a enrich/palette.json. extract_palette.py vuelve a aplicar estas decisiones cada vez
que corre, así que no se pierden. Los colores se cuantizan a 5 bits por canal (como makeTex del juego).
Las fotos se sirven desde refs/ (local, no se publican).
"""

from __future__ import annotations

import argparse
import html
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import common as c

ZONES = ["back", "back_dark", "belly", "flank", "head", "throat", "wing", "tail", "beak", "legs", "eye", "accent"]
ZONE_ES = {"back": "dorso", "back_dark": "dorso oscuro", "belly": "vientre", "flank": "flanco", "head": "cabeza",
           "throat": "garganta", "wing": "ala", "tail": "cola", "beak": "pico", "legs": "patas", "eye": "ojo", "accent": "acento"}
ACCENTS = ["", "pecho", "gorguera", "collar", "frente", "bigote", "subcaudales", "ala y cola"]
PATTERN_ZONES = ["back", "belly", "flank", "head", "throat", "wing", "tail"]
PATTERNS = ["", "barred", "streaked", "spotted", "striped"]
PATTERN_ES = {"": "liso", "barred": "barrado", "streaked": "estriado", "spotted": "moteado", "striped": "listado"}

REVIEW = c.ENRICH_DIR / "palette_review.json"
PALETTE = c.ENRICH_DIR / "palette.json"


def quant(v) -> list[int]:
    return [int(min(248, max(0, round(int(x) / 8) * 8))) for x in v]


def load(path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def apply_review(entry: dict, rev: dict) -> dict:
    """Aplica una decisión de revisión a una entrada de palette.json (usado también por extract_palette)."""
    out = dict(entry)
    for z, v in (rev.get("colors") or {}).items():
        if z in ZONES:
            out[z] = quant(v)
    if "accentWhere" in rev:
        out["accentWhere"] = rev["accentWhere"] or None
        if out["accentWhere"] and "accent" not in out:
            out["accent"] = out.get("belly", [200, 80, 40])
    if "pattern" in rev:
        out["pattern"] = {k: v for k, v in rev["pattern"].items() if v}
    out["reviewed"] = bool(rev.get("approved"))
    if rev.get("colors"):
        out["edited"] = sorted(rev["colors"])
    return out


def page(species: list[str]) -> str:
    pal, rev = load(PALETTE), load(REVIEW)
    manifest = load(c.REFS_DIR / "manifest.json")
    names = {s["sciName"]: s["comName"] for s in c.load_index()["species"]}
    photo_by_page = {p["page"]: p["id"] for e in manifest.values() for p in e["photos"]}
    cards = []
    for sci in species:
        e = pal.get(sci)
        if not e:
            continue
        r = rev.get(sci, {})
        hexc = lambda v: "#%02x%02x%02x" % tuple(v)
        zones = "".join(
            f'<label class="z"><input type="color" data-zone="{z}" value="{hexc(e[z])}"><span>{ZONE_ES[z]}</span></label>'
            for z in ZONES if z in e)
        acc = "".join(f'<option value="{a}"{" selected" if (e.get("accentWhere") or "") == a else ""}>{a or "sin acento"}</option>' for a in ACCENTS)
        pats = "".join(
            f'<label class="p">{ZONE_ES[z]} <select data-pz="{z}">' +
            "".join(f'<option value="{p}"{" selected" if e.get("pattern", {}).get(z, "") == p else ""}>{PATTERN_ES[p]}</option>' for p in PATTERNS) +
            "</select></label>" for z in PATTERN_ZONES)
        imgs = "".join(
            f'<figure><img class="ph" data-id="{photo_by_page.get(u, "")}" src="/refs/palettes/{photo_by_page.get(u, "")}_clean.jpg" loading="lazy" onerror="this.src=this.src.replace(\'_clean\',\'\')">'
            f'<a href="{html.escape(u)}" target="_blank" title="Ver en iNaturalist">iNat ↗</a></figure>'
            for u in e.get("photos", []))
        src = e.get("annotation", "manual")
        cards.append(f'''<section class="card{' ok' if e.get("reviewed") else ''}" data-sci="{html.escape(sci)}">
  <header><h2>{html.escape(names.get(sci, sci))} <i>{html.escape(sci)}</i></h2>
    <span class="src">{html.escape(src)}</span><span class="state"></span>
    <button class="approve">{"✔ Aprobada" if e.get("reviewed") else "Aprobar"}</button>
    <button class="reset" title="Descartar mis cambios de color">Restaurar</button></header>
  <div class="body"><div class="zones">{zones}</div>
    <div class="side"><label>Acento: <select class="acc">{acc}</select></label><div class="pats">{pats}</div></div>
    <div class="imgs">{imgs}</div></div></section>''')
    n_ok = sum(1 for s in species if pal.get(s, {}).get("reviewed"))
    return f'''<!doctype html><html lang="es"><meta charset="utf-8"><title>Revisión de paletas</title>
<style>
body{{margin:0;background:#101218;color:#e8eaf0;font:15px/1.45 system-ui,sans-serif}}
.top{{position:sticky;top:0;z-index:2;background:#0b0c11;border-bottom:1px solid #2a2e3a;padding:10px 16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}}
.top h1{{font-size:18px;margin:0}} .top label{{color:#aab}}
main{{padding:12px 16px;display:grid;gap:14px}}
.card{{background:#171a22;border:2px solid #2a2e3a;border-radius:8px;padding:10px 12px}}
.card.ok{{border-color:#288665}} .card.hide{{display:none}}
header{{display:flex;gap:10px;align-items:center;flex-wrap:wrap}} header h2{{font-size:17px;margin:0;flex:1}}
header i{{color:#99a;font-weight:400}} .src{{font-size:12px;color:#99a;border:1px solid #333;border-radius:4px;padding:1px 6px}}
.state{{font-size:12px;color:#f4d35e;min-width:70px}}
button{{font:inherit;background:#232838;color:#e8eaf0;border:1px solid #444;border-radius:5px;padding:4px 12px;cursor:pointer}}
button.approve{{background:#1d3a2f;border-color:#288665}} .card.ok button.approve{{background:#288665}}
.body{{display:grid;grid-template-columns:minmax(260px,330px) 200px 1fr;gap:14px;margin-top:8px}}
@media(max-width:900px){{.body{{grid-template-columns:1fr}}}}
.zones{{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;align-content:start}}
.z{{display:flex;flex-direction:column;align-items:center;font-size:12px;color:#bbc}}
.z input{{width:64px;height:40px;border:0;padding:0;background:none;cursor:pointer}}
.side{{display:grid;gap:6px;align-content:start;font-size:13px}} .pats{{display:grid;gap:3px}} .p{{display:flex;justify-content:space-between;gap:6px;color:#bbc}}
select{{font:inherit;font-size:13px;background:#232838;color:#e8eaf0;border:1px solid #444;border-radius:4px}}
.imgs{{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start}} figure{{margin:0;position:relative}}
.imgs img{{height:230px;border-radius:4px;border:1px solid #333;cursor:zoom-in;display:block}}
figure a{{position:absolute;right:4px;bottom:4px;font-size:11px;background:#000a;color:#9cf;padding:1px 5px;border-radius:3px;text-decoration:none}}
#zoom{{position:fixed;inset:0;background:#000d;display:none;place-items:center;z-index:9;cursor:zoom-out}} #zoom img{{max-width:94vw;max-height:92vh}}
</style>
<div class="top"><h1>Revisión de paletas</h1><span id="count">{n_ok}/{len(species)} aprobadas</span>
<label><input type="checkbox" id="pending"> mostrar solo pendientes</label>
<label><input type="checkbox" id="points"> mostrar puntos de muestreo</label>
<span style="color:#99a;font-size:13px">Cada cambio se guarda solo. Los colores se redondean a 5 bits por canal, igual que en el juego.</span></div>
<main>{"".join(cards)}</main>
<div id="zoom"><img alt=""></div>
<script>
async function save(card, extra) {{
  const colors = {{}};
  card.querySelectorAll('input[type=color]').forEach(i => {{ if (i.dataset.touched) colors[i.dataset.zone] = [1,3,5].map(k => parseInt(i.value.slice(k, k+2), 16)); }});
  const pattern = {{}}; card.querySelectorAll('[data-pz]').forEach(s => pattern[s.dataset.pz] = s.value);
  const body = {{ sci: card.dataset.sci, colors, accentWhere: card.querySelector('.acc').value, pattern, ...extra }};
  const st = card.querySelector('.state'); st.textContent = 'guardando…';
  const r = await fetch('/api/review', {{ method: 'POST', headers: {{'Content-Type': 'application/json'}}, body: JSON.stringify(body) }});
  const d = await r.json();
  st.textContent = r.ok ? 'guardado' : 'error';
  for (const [z, v] of Object.entries(d.entry || {{}})) {{
    const i = card.querySelector(`input[data-zone="${{z}}"]`);
    if (i && Array.isArray(v)) i.value = '#' + v.map(x => x.toString(16).padStart(2, '0')).join('');
  }}
  card.classList.toggle('ok', !!d.entry?.reviewed);
  card.querySelector('.approve').textContent = d.entry?.reviewed ? '✔ Aprobada' : 'Aprobar';
  document.getElementById('count').textContent = `${{d.approved}}/${{d.total}} aprobadas`;
  filter();
}}
document.querySelectorAll('.card').forEach(card => {{
  card.querySelectorAll('input[type=color]').forEach(i => i.addEventListener('change', () => {{ i.dataset.touched = 1; save(card, {{ approved: card.classList.contains('ok') }}); }}));
  card.querySelectorAll('select').forEach(s => s.addEventListener('change', () => save(card, {{ approved: card.classList.contains('ok') }})));
  card.querySelector('.approve').onclick = () => save(card, {{ approved: !card.classList.contains('ok') }});
  card.querySelector('.reset').onclick = async () => {{ await fetch('/api/reset', {{ method: 'POST', body: card.dataset.sci }}); location.reload(); }};
}});
const pend = document.getElementById('pending');
function filter() {{ document.querySelectorAll('.card').forEach(c => c.classList.toggle('hide', pend.checked && c.classList.contains('ok'))); }}
pend.onchange = filter;
// fotos limpias por defecto; con el interruptor se ven los puntos donde se tomó cada color
const pts = document.getElementById('points');
pts.onchange = () => document.querySelectorAll('img.ph').forEach(i => {{ i.src = '/refs/palettes/' + i.dataset.id + (pts.checked ? '' : '_clean') + '.jpg'; }});
const zoom = document.getElementById('zoom');
document.querySelectorAll('img.ph').forEach(i => i.onclick = () => {{ zoom.querySelector('img').src = i.src; zoom.style.display = 'grid'; }});
zoom.onclick = () => {{ zoom.style.display = 'none'; }};
</script></html>'''


class Handler(BaseHTTPRequestHandler):
    species: list[str] = []

    def _send(self, code, body, ctype="application/json"):
        data = body.encode() if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):  # silencioso
        pass

    def do_GET(self):
        path = urlparse(self.path).path
        if path in ("/", "/index.html"):
            return self._send(200, page(self.species), "text/html; charset=utf-8")
        if path.startswith("/refs/"):
            f = (c.REFS_DIR / path[len("/refs/"):]).resolve()
            if c.REFS_DIR.resolve() in f.parents and f.exists():
                return self._send(200, f.read_bytes(), "image/jpeg")
        self._send(404, "{}")

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        pal, rev = load(PALETTE), load(REVIEW)
        if self.path == "/api/reset":
            sci = body.decode()
            rev.pop(sci, None)
            c.write_json(REVIEW, rev)
            return self._send(200, json.dumps({"ok": True, "note": "correr extract_palette.py para recuperar los colores originales"}))
        d = json.loads(body)
        sci = d["sci"]
        if sci not in pal:
            return self._send(400, "{}")
        r = rev.get(sci, {})
        r.setdefault("colors", {}).update({z: quant(v) for z, v in (d.get("colors") or {}).items() if z in ZONES})
        r["accentWhere"] = d.get("accentWhere") or None
        r["pattern"] = {k: v for k, v in (d.get("pattern") or {}).items() if v in PATTERNS and v}
        r["approved"] = bool(d.get("approved"))
        rev[sci] = r
        pal[sci] = apply_review(pal[sci], r)
        c.write_json(REVIEW, rev)
        c.write_json(PALETTE, pal)
        approved = sum(1 for s in self.species if pal.get(s, {}).get("reviewed"))
        self._send(200, json.dumps({"entry": pal[sci], "approved": approved, "total": len(self.species)}))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    c.species_args(ap)
    ap.add_argument("--port", type=int, default=8777)
    args = ap.parse_args()
    index = c.load_index()
    pal = load(PALETTE)
    Handler.species = [s for s in c.selected_species(args, index) if s in pal] if (args.species or args.mvp or args.region) else sorted(pal)
    print(f"Revisión de {len(Handler.species)} paletas → http://localhost:{args.port}  (Ctrl+C para salir)")
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()

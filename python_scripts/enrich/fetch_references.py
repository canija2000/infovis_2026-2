"""Paso 1: imágenes de referencia por especie (solo para extraer proporciones y paletas).

Uso:
    python3 python_scripts/enrich/fetch_references.py --mvp [--download]
    python3 python_scripts/enrich/fetch_references.py --species "Diuca diuca" --download

Fuentes, en orden de preferencia:
  1. iNaturalist (observaciones research-grade en Chile, place_id 7182),
     primero licencias libres (CC0, CC BY, CC BY-SA) y luego CC BY-NC para completar.
  2. Wikimedia Commons (P18 de Wikidata + búsqueda en el espacio File:), solo licencias libres.
  3. GBIF (ocurrencias con StillImage en Chile) como respaldo.
  Macaulay Library / eBird: solo un link de consulta manual (sus términos no permiten descargar).

Salidas:
  web/data/game/enrich/images.json   metadatos públicos por sciName. Si hay ≥ MIN_FREE fotos
                                     libres se omiten las NC; si no, las NC van con "nc": true.
  refs/manifest.json                 todo lo seleccionado, con ruta local (gitignored)
  refs/<Genero_especie>/*.jpg        fotos descargadas con --download (gitignored, no se publican)
  refs/INDEX.html                    miniaturas para revisar y marcar la vista (lateral/frontal)

La vista marcada a mano se guarda en refs/views.json ({"<id foto>": "lateral"|"frontal"|"descartar"})
y se aplica al volver a correr el script. Idempotente: las respuestas HTTP quedan en caché.
"""

from __future__ import annotations

import argparse
import csv
import html
import io
import json
import re
import urllib.parse

import common as c

PER_SPECIES = 8
MIN_FREE = 3
FREE = {"cc0", "cc-by", "cc-by-sa", "pd"}
INAT_SEX = {10: "hembra", 11: "macho"}
INAT_STAGE = {2: "adulto", 8: "juvenil", 6: "polluelo", 7: "huevo"}
INAT_PHOTO_RE = re.compile(r"/photos/(\d+)/")


# --- iNaturalist -----------------------------------------------------------------
def inat_taxon(sci: str) -> dict | None:
    d = c.fetch_json("https://api.inaturalist.org/v1/taxa", {"q": sci, "rank": "species", "is_active": "any"})
    exact = [t for t in d["results"] if t["name"] == sci]
    if exact:
        t = exact[0]
    else:  # sinónimo: iNat devuelve el taxón vigente con matched_term = nombre buscado
        syn = [t for t in d["results"] if t.get("matched_term", "").lower() == sci.lower()]
        if not syn:
            return None
        t = syn[0]
    if not t.get("is_active", True) and t.get("current_synonymous_taxon_ids"):
        t = c.fetch_json(f"https://api.inaturalist.org/v1/taxa/{t['current_synonymous_taxon_ids'][0]}")["results"][0]
    return {"id": t["id"], "name": t["name"]}


def inat_photos(taxon_id: int, licenses: str) -> list[dict]:
    d = c.fetch_json("https://api.inaturalist.org/v1/observations", {
        "taxon_id": taxon_id, "place_id": 7182, "quality_grade": "research", "photos": "true",
        "photo_license": licenses, "order_by": "votes", "per_page": 30,
    })
    out = []
    for o in d["results"]:
        ann = {a["controlled_attribute_id"]: a["controlled_value_id"] for a in o.get("annotations") or []}
        for p in o["photos"]:
            if not p.get("license_code") or p["license_code"] not in licenses.split(","):
                continue
            out.append({
                "id": f"inat-{p['id']}",
                "src": "inat",
                "url": re.sub(r"/square\.", "/large.", p["url"]),
                "thumb": re.sub(r"/square\.", "/small.", p["url"]),
                "page": o["uri"],
                "author": p["attribution"],
                "license": p["license_code"],
                "sex": INAT_SEX.get(ann.get(9)),
                "stage": INAT_STAGE.get(ann.get(1)),
            })
            break  # una foto por observación: más variedad de individuos
    return out


# --- Wikimedia Commons ------------------------------------------------------------
def _license_code(short: str) -> str | None:
    s = short.lower().replace(" ", "-")
    if s.startswith("cc0") or "public-domain" in s or s == "pd" or s.startswith("pd-"):
        return "cc0" if s.startswith("cc0") else "pd"
    m = re.match(r"cc-(by(?:-sa)?|by-nc(?:-sa)?|by-nd)", s)
    return f"cc-{m.group(1)}" if m else None


def _strip_html(s: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def commons_files(titles: list[str] | None = None, search: str | None = None) -> list[dict]:
    params = {"action": "query", "format": "json", "prop": "imageinfo",
              "iiprop": "url|extmetadata", "iiurlwidth": 1024}
    if titles:
        params["titles"] = "|".join(titles)
    else:
        params.update({"generator": "search", "gsrsearch": search, "gsrnamespace": 6, "gsrlimit": 15})
    d = c.fetch_json("https://commons.wikimedia.org/w/api.php", params)
    out = []
    for p in (d.get("query", {}).get("pages") or {}).values():
        if "imageinfo" not in p or not re.search(r"\.(jpe?g|png)$", p["title"], re.I):
            continue
        ii = p["imageinfo"][0]
        meta = ii.get("extmetadata", {})
        lic = _license_code(meta.get("LicenseShortName", {}).get("value", ""))
        if lic not in FREE:
            continue
        out.append({
            "id": f"commons-{p['pageid']}",
            "src": "commons",
            "url": ii.get("thumburl") or ii["url"],
            "thumb": ii.get("thumburl") or ii["url"],
            "page": ii["descriptionurl"],
            "author": _strip_html(meta.get("Artist", {}).get("value", "")) or "desconocido",
            "license": lic,
            "title": p["title"],
        })
    return out


def wikidata_p18(sci: str) -> list[str]:
    q = f'SELECT ?img WHERE {{ ?item wdt:P225 "{sci}"; wdt:P18 ?img }}'
    d = c.fetch_json("https://query.wikidata.org/sparql", {"query": q, "format": "json"})
    return ["File:" + urllib.parse.unquote(b["img"]["value"].rsplit("/", 1)[1])
            for b in d["results"]["bindings"]]


# --- GBIF ---------------------------------------------------------------------------
def gbif_photos(sci: str) -> list[dict]:
    d = c.fetch_json("https://api.gbif.org/v1/occurrence/search",
                     {"mediaType": "StillImage", "country": "CL", "scientificName": sci, "limit": 20})
    out = []
    for r in d["results"]:
        for m in r.get("media", []):
            if m.get("type") != "StillImage" or not m.get("identifier"):
                continue
            lic_url = m.get("license") or r.get("license") or ""
            lm = re.search(r"(publicdomain/zero|licenses/(by(?:-nc)?(?:-sa)?))/", lic_url)
            lic = "cc0" if lm and lm.group(1).startswith("publicdomain") else (f"cc-{lm.group(2)}" if lm else None)
            if lic not in FREE | {"cc-by-nc"}:
                continue
            ph = INAT_PHOTO_RE.search(m["identifier"])
            out.append({
                "id": f"inat-{ph.group(1)}" if ph else f"gbif-{r['key']}",
                "src": "gbif",
                "url": m["identifier"].replace("/original.", "/large."),
                "thumb": m["identifier"].replace("/original.", "/small."),
                "page": f"https://www.gbif.org/occurrence/{r['key']}",
                "author": m.get("rightsHolder") or m.get("creator") or r.get("recordedBy") or "desconocido",
                "license": lic,
            })
            break
    return out


# --- eBird / Macaulay -------------------------------------------------------------------
def ebird_codes() -> dict[str, str]:
    raw = c.fetch("https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=csv&cat=species")
    return {r["SCIENTIFIC_NAME"]: r["SPECIES_CODE"] for r in csv.DictReader(io.StringIO(raw.decode("utf-8")))}


def macaulay_link(sci: str, codes: dict[str, str], syn: dict) -> str | None:
    code = codes.get(sci) or codes.get(syn.get(sci, {}).get("xc", ""))
    return f"https://search.macaulaylibrary.org/catalog?taxonCode={code}&mediaType=photo" if code else None


# --- selección, descarga e índice ------------------------------------------------------
def collect(sci: str, syn: dict) -> tuple[dict, list[dict]]:
    info: dict = {"inat": None}
    taxon = inat_taxon(sci)
    if taxon is None and sci in syn:
        taxon = inat_taxon(syn[sci]["xc"])
    info["inat"] = taxon
    free, nc = [], []
    if taxon:
        free += inat_photos(taxon["id"], "cc0,cc-by,cc-by-sa")
    titles = wikidata_p18(sci)
    commons = (commons_files(titles=titles) if titles else []) + commons_files(search=f'"{sci}"')
    free += commons
    if taxon and len(free) < PER_SPECIES:
        nc += inat_photos(taxon["id"], "cc-by-nc")
    if len(free) + len(nc) < MIN_FREE:
        for p in gbif_photos(sci):
            (free if p["license"] in FREE else nc).append(p)

    # Sin duplicados: Commons y GBIF suelen re-publicar fotos de iNat (nombre "... <id>.jpg").
    seen, picked = set(), []
    for p in free + nc:
        m = re.search(r"(\d{6,})\.(?:jpe?g|png)$", p.get("title", ""), re.I)
        keys = {p["id"], p["url"]} | ({f"inat-{m.group(1)}"} if m else set())
        if keys & seen:
            continue
        seen |= keys
        p["nc"] = p["license"] not in FREE
        picked.append(p)
    return info, picked[:PER_SPECIES]


def download(sci: str, photos: list[dict]) -> None:
    folder = c.REFS_DIR / c.slug(sci)
    folder.mkdir(parents=True, exist_ok=True)
    for p in photos:
        ext = ".png" if p["url"].lower().endswith(".png") else ".jpg"
        path = folder / f"{p['id']}{ext}"
        if not path.exists():
            path.write_bytes(c.fetch(p["url"], binary=True, cache=False))
        p["file"] = str(path.relative_to(c.REFS_DIR))


def write_index(manifest: dict, index_names: dict) -> None:
    cards = []
    for sci, entry in manifest.items():
        figs = []
        for p in entry["photos"]:
            img = p.get("file") or p["thumb"]
            tag = " · ".join(x for x in (p["src"], p["license"], p.get("sex"), p.get("stage")) if x)
            figs.append(
                f'<figure data-id="{p["id"]}" class="{"nc" if p["nc"] else ""}">'
                f'<a href="{html.escape(p["page"])}" target="_blank"><img loading="lazy" src="{html.escape(img)}"></a>'
                f'<figcaption>{html.escape(tag)}<br><small>{html.escape(p["author"][:60])}</small><br>'
                + "".join(f'<label><input type="radio" name="{p["id"]}" value="{v}"'
                          f'{" checked" if p.get("view") == v else ""}>{v}</label>'
                          for v in ("lateral", "frontal", "descartar"))
                + "</figcaption></figure>")
        mac = f' · <a href="{entry["macaulay"]}" target="_blank">Macaulay (solo consulta)</a>' if entry.get("macaulay") else ""
        cards.append(f'<section><h2>{html.escape(index_names.get(sci, ""))} <i>{sci}</i> '
                     f'<small>{len(entry["photos"])} fotos{mac}</small></h2><div class="row">{"".join(figs)}</div></section>')
    page = f"""<!doctype html><html lang="es"><meta charset="utf-8"><title>Referencias</title>
<style>body{{font:14px system-ui;margin:16px;background:#111;color:#ddd}}a{{color:#8cf}}
.row{{display:flex;flex-wrap:wrap;gap:8px}}figure{{margin:0;width:220px;background:#222;padding:6px;border:2px solid #333}}
figure.nc{{border-color:#a63}}img{{width:100%;height:170px;object-fit:contain;background:#000}}
figcaption{{font-size:11px}}label{{margin-right:6px}}#out{{width:100%;height:120px}}</style>
<h1>Fotos de referencia (uso interno, no publicar)</h1>
<p>Borde naranja = licencia NC. Marca la vista de cada foto y copia el JSON a <code>refs/views.json</code>.</p>
{"".join(cards)}
<h2>views.json</h2><textarea id="out"></textarea>
<script>
const out=document.getElementById('out');
function dump(){{const v={{}};document.querySelectorAll('input:checked').forEach(i=>v[i.name]=i.value);
out.value=JSON.stringify(v,null,1);}}
document.addEventListener('change',dump);dump();
</script></html>"""
    (c.REFS_DIR / "INDEX.html").write_text(page, encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    c.species_args(ap)
    ap.add_argument("--download", action="store_true", help="descargar las fotos a refs/ (gitignored)")
    args = ap.parse_args()

    index = c.load_index()
    names = {s["sciName"]: s["comName"] for s in index["species"]}
    species = c.selected_species(args, index)
    syn = json.loads((c.ROOT / "gbif" / "synonyms_xc.json").read_text(encoding="utf-8"))["synonyms"]
    codes = ebird_codes()

    manifest_path = c.REFS_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    views_path = c.REFS_DIR / "views.json"
    views = json.loads(views_path.read_text(encoding="utf-8")) if views_path.exists() else {}

    for sci in species:
        info, photos = collect(sci, syn)
        for p in photos:
            p["view"] = views.get(p["id"], "?")
        if args.download:
            download(sci, photos)
        manifest[sci] = {**info, "macaulay": macaulay_link(sci, codes, syn), "photos": photos}
        n_free = sum(not p["nc"] for p in photos)
        print(f"{sci:32s} iNat={info['inat'] and info['inat']['id']!s:8s} fotos={len(photos)} libres={n_free}")

    c.write_json(manifest_path, manifest)
    write_index(manifest, names)

    # JSON público: sin rutas locales ni miniaturas; sin NC si hay suficientes libres; sin descartadas.
    images_path = c.ENRICH_DIR / "images.json"
    public = json.loads(images_path.read_text(encoding="utf-8")) if images_path.exists() else {}
    keep = ("src", "url", "page", "author", "license", "view", "nc")
    for sci, entry in manifest.items():
        photos = [p for p in entry["photos"] if p.get("view") != "descartar"]
        if sum(not p["nc"] for p in photos) >= MIN_FREE:
            photos = [p for p in photos if not p["nc"]]
        public[sci] = [{k: p[k] for k in keep if k in p and (k != "nc" or p["nc"])} for p in photos]
    c.write_json(images_path, public)
    print(f"→ {images_path.relative_to(c.ROOT)}  ·  {(c.REFS_DIR / 'INDEX.html').relative_to(c.ROOT)}")


if __name__ == "__main__":
    main()

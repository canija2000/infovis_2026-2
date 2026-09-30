# web/ — Atlas sonoro de aves de Chile (V1)

Sitio estático sin build step: `index.html`, `styles.css`, `app.js` (vistas e
interacción, D3 v7 desde jsDelivr) y `sonify.js` (sonificación con Web Audio API).

```bash
cd web && python3 -m http.server 8000   # abrir http://localhost:8000
```

La página carga solo los archivos derivados de `data/` (~0,9 MB):
`meta.json`, `species.json`, `typical_year.json`, `region_month.json`,
`regions.min.geojson`; `sounds.json` e `images.json` se piden al abrir una ficha de especie.
Se regeneran con `python3 python_scripts/build_web_data.py` desde la raíz del repo.
Las candidatas se reúnen con `python3 python_scripts/preparar_imagenes_web.py`;
después `python3 python_scripts/ordenar_imagenes_web.py` analiza hasta 64 por
especie y publica las ocho mejores. Este análisis se ejecuta al preparar los
datos, no en el navegador. Sus dependencias y caché se describen en el README raíz.
El build normal conserva las fotos y vuelve a asociarlas por nombre científico.

`data/observations-*.json`, `data/regions.geojson` y `data/metadata.json` son
la entrada del build (agregado GBIF completo); la web no los descarga.

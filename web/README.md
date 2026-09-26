# web/ — Atlas sonoro de aves de Chile (V1)

Sitio estático sin build step: `index.html`, `styles.css`, `app.js` (vistas e
interacción, D3 v7 desde jsDelivr) y `sonify.js` (sonificación con Web Audio API).

```bash
cd web && python3 -m http.server 8000   # abrir http://localhost:8000
```

La página carga solo los archivos derivados de `data/` (~0,9 MB):
`meta.json`, `species.json`, `typical_year.json`, `region_month.json`,
`regions.min.geojson`; `sounds.json` se pide al abrir una ficha de especie.
Se regeneran con `python3 build_web_data.py` desde la raíz del repo.

`data/observations-*.json`, `data/regions.geojson` y `data/metadata.json` son
la entrada del build (agregado GBIF completo); la web no los descarga.

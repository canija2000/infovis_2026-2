# Atlas sonoro de aves de Chile

Visualización interactiva y sonora (curso de Visualización de Información
2026-2). El mensaje es: **“Chile tiene dos avifaunas: la que se queda y la que
viaja”**. Un calendario especie × mes (año típico 2017–2024) muestra el bloque
de especies residentes y las “olas” de visitantes de verano e invierno, por
región. El año se puede reproducir como sonido.

## Arquitectura

```text
GBIF (11 descargas anuales, Aves, Chile)
  └─ gbif/*.py ───────────────► web/data/observations-*.json   agregado región × mes × especie
                                 web/data/regions.geojson       (entrada, no la carga la web)
  └─ build_web_data.py ───────► web/data/meta.json, species.json, typical_year.json,
                                 region_month.json, regions.min.geojson, sounds.json
  └─ web/ (HTML + D3 + Web Audio, sin build step) ─► GitHub Pages / Cloudflare
```

- `gbif/`: pipeline de descarga, join espacial y agregación desde GBIF. Ver
  [`docs/metodologia-datos.md`](docs/metodologia-datos.md) (fuente, DOIs,
  limpieza, métrica y, en §10, año típico y clasificación estacional).
- `build_web_data.py`: genera los archivos livianos de la web (~0,86 MB de
  carga inicial). Solo usa la biblioteca estándar y su salida es determinista.
- `gbif/synonyms_xc.json`: nombres científicos GBIF → Xeno-canto (IOC).
- `web/`: frontend estático. `app.js` contiene las vistas y la interacción;
  `sonify.js`, la sonificación.
- `descargar_sonidos.py`, `optimizar_sonidos.py`: cantos desde Xeno-canto (local).
- `docs/proceso/`: bitácora de versiones (V1 → V4) para la entrega.
- Histórico (se conserva como evidencia del proceso, no se usa en la web):
  `10anios.py` (eBird nacional), `pull_regional.py`, `progress_check.py`,
  `docs/re_pull_regional.md` e `instrucciones_re_pull_de_datos.md` (ruta eBird
  por región, abandonada por errores 429 sostenidos), `testeo.ipynb`.

## Regenerar los datos de la web

```bash
python3 build_web_data.py            # reescribe web/data/*.json derivados
python3 build_web_data.py --report   # además imprime especies de control
```

Para rehacer el agregado desde GBIF, ver `gbif/run_pipeline.py` y la
metodología. Las descargas crudas quedan fuera de Git.

## Ejecutar la web localmente

```bash
cd web
python3 -m http.server 8000
```

Abrir <http://localhost:8000>. D3 se carga desde jsDelivr, así que se necesita
conexión a internet.

- **Overview:** mensaje, resumen de clases, mapa y grilla región × mes con la
  proporción de visitantes, y el calendario de la avifauna.
- **Zoom & filter:** clic en una región (mapa o grilla), filtros por clase,
  buscador de especie y scrubber de mes con ▶ (también con la barra espaciadora).
- **Detalle:** ficha de especie con perfil anual radial, mapa de frecuencia
  por región y canto de Xeno-canto (si hay grabación).
- **Sonificación:** cada mes es un compás y cada región una voz. Tono ←
  latitud, ritmo ← riqueza, timbre ← proporción de visitantes. El audio parte
  solo después de pulsar Play.

## Publicación

GitHub Pages: publicar la carpeta `web/` como raíz del sitio (por ejemplo, con
una GitHub Action de Pages que suba `web/`). Cloudflare Workers también la
sirve como assets estáticos (`wrangler.jsonc`).

## Cantos (Xeno-canto)

```bash
python3 descargar_sonidos.py --dry-run
python3 descargar_sonidos.py --top 25 --recordings-per-species 3
python3 build_web_data.py            # incorpora sounds/manifest.json a web/data/sounds.json
```

La API key se lee de `api_sounds` (`.env` o una variable de entorno) y nunca
se escribe en archivos ni en logs. La consulta usa el nombre de Xeno-canto
según `gbif/synonyms_xc.json`. Los audios quedan en `sounds/` (fuera de Git);
la web los reproduce desde xeno-canto.org, con autor y licencia. El plan de
mejora (filtro por país, calidad, clips propios) está en
`refactorizacion_sounds_api.md`.

## Fuentes y atribución

- Ocurrencias: GBIF.org, 11 descargas (DOIs en `docs/metodologia-datos.md` y
  en el pie de la web). eBird aporta el 91–98 % de los registros 2016–2024.
- Divisiones regionales: [Mapoteca BCN](https://www.bcn.cl/siit/mapas_vectoriales/index_html).
- Cantos: [Xeno-canto](https://xeno-canto.org), licencias Creative Commons por grabación.

Uso educativo y no comercial.

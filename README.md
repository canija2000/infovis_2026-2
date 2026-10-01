# Atlas sonoro de aves de Chile

Visualización interactiva y sonora (curso de Visualización de Información
2026-2). El mensaje es: **“Nómadas & sedentarios: las avifaunas de Chile
continental”**. Un calendario especie × mes (año típico 2017–2024) muestra el bloque
de especies residentes y las “olas” de visitantes de verano e invierno, por
región. El año se puede reproducir como sonido.

## Arquitectura

```text
GBIF (11 descargas anuales, Aves, Chile)
  └─ python_scripts/gbif/*.py ► web/data/observations-*.json   agregado región × mes × especie
                                 web/data/regions.geojson       (entrada, no la carga la web)
  └─ python_scripts/build_web_data.py ► web/data/meta.json, species.json, typical_year.json,
                                 region_month.json, regions.min.geojson, sounds.json
  └─ web/ (HTML + D3 + Web Audio, sin build step) ─► GitHub Pages / Cloudflare
```

- `python_scripts/`: scripts de Python en uso (ver «Estructura de scripts» abajo).
- `python_scripts/gbif/`: pipeline de descarga, join espacial y agregación desde GBIF;
  sus datos intermedios y tablas de nombres viven en `gbif/`. Ver
  [`docs/metodologia-datos.md`](docs/metodologia-datos.md) (fuente, DOIs,
  limpieza, métrica y, en §10, año típico y clasificación estacional).
- `python_scripts/build_overview_data.py`: deriva `web/data/overview.json` (~20 KB) para la portada
  a partir de los archivos que ya genera `build_web_data.py`. Correrlo después de ese script.
- `python_scripts/gbif/grid_aggregate.py` + `python_scripts/build_grid_data.py`: agregan las descargas
  GBIF 2017–2024 en celdas de 0,2° × mes × clase y generan `web/data/grid_month.json` (~130 KB) para los
  mapas por mes de la portada, y con `--res 0.05` también `web/data/grid_region/<código>.json` (vista de una
  región). Necesitan `shapely` y las descargas en `gbif/downloads/` (se bajan por DOI). Orden:
  `python3 python_scripts/gbif/grid_aggregate.py --res 0.2 0.05 && python3 python_scripts/build_grid_data.py`.
- `python_scripts/gbif/loop_aggregate.py` + `python_scripts/build_loop_data.py`: lugar-días por especie, región
  y mes (celdas de ~5 km × fechas) → `web/data/loop.json`, qué especies suenan y cuántas copias en el loop de
  la portada.
- `python_scripts/build_web_data.py`: genera los archivos livianos de la web (~0,86 MB de
  carga inicial). Solo usa la biblioteca estándar y su salida es determinista.
- `gbif/synonyms_xc.json`: nombres científicos GBIF → Xeno-canto (IOC).
- `web/`: frontend estático en dos páginas enlazadas. `index.html` (Visualización) es la portada:
  una sola idea a primera vista (`inicio.js`, `inicio.css`, datos en `data/overview.json`).
  `explorar.html` (Explorar) es el atlas completo: `app.js` contiene sus vistas y la interacción;
  `sonify.js`, la sonificación.
- `python_scripts/preparar_audio_web.py`: elige, descarga (Xeno-canto, `cnt:chile`) y recorta los
  cantos que publica la web en `web/audio/` (clips + `clips.json`).
- `python_scripts/preparar_audio_mixer.py`: reduce el ambiente de los clips que
  admiten modificaciones y prepara las pistas independientes del mezclador.
  Ver [`docs/mezclador-sonoro.md`](docs/mezclador-sonoro.md) para su uso,
  funcionamiento y límites.
- `python_scripts/preparar_imagenes_web.py`: consulta fotos de ocurrencias chilenas en GBIF
  y, si reúne menos de 32, completa con registros globales de la misma especie.
  Reúne hasta 64 candidatas
  CC BY por especie, con autor, licencia y fuente, en `cache_images/candidates.json`.
- `python_scripts/ordenar_imagenes_web.py`: analiza todas las candidatas y publica
  las ocho mejores por especie en `web/data/images.json`, priorizando aves grandes,
  nítidas y reconocibles. Usa un detector SSD MobileNet del ONNX Model Zoo y guarda
  las puntuaciones en `cache_images/` para reutilizarlas. Ver
  [`docs/imagenes-especies.md`](docs/imagenes-especies.md) para filtros, puntuación,
  regeneración y límites.
- `docs/proceso/`: bitácora de versiones (V1 → V4) para la entrega.
- `python_scripts/python_historicos/`: scripts antiguos, conservados como
  evidencia del proceso (no se usan en la web). Ver «Estructura de scripts».
  Documentación asociada: `docs/re_pull_regional.md` e
  `instrucciones_re_pull_de_datos.md` (ruta eBird por región, abandonada por
  errores 429 sostenidos), `testeo.ipynb`.
- `CAMBIOS.md`: registro compartido de cambios, ideas e innovaciones del equipo.

## Estructura de scripts

Todos se ejecutan desde la raíz del repo (las rutas se resuelven solas).

```text
python_scripts/
├── build_web_data.py        genera web/data/ (año típico, clases, geometría, sonidos)
├── preparar_audio_web.py    cantos de Xeno-canto → clips en web/audio/
├── preparar_audio_mixer.py  clips con menos ambiente → web/audio/mixer/
├── preparar_imagenes_web.py fotos CC BY de GBIF → cache_images/candidates.json
├── ordenar_imagenes_web.py  puntúa candidatas → ocho mejores en web/data/images.json
├── gbif/                    pipeline GBIF (datos en <repo>/gbif/)
│   ├── gbif_downloads.py    pedir descargas anuales (API GBIF)
│   ├── run_pipeline.py      orquesta descarga + estado (gbif/state.json)
│   ├── progress.py          estado de las descargas
│   ├── join_aggregate.py    join espacial a regiones + agregado región × mes × especie
│   ├── fetch_vernacular_es.py, merge_names.py, patch_comnames.py   nombres en español
│   └── install.py           instala los agregados en web/data/
└── python_historicos/       solo registro, no forman parte del flujo actual
    ├── 10anios.py           pipeline original eBird nacional
    ├── pull_regional.py, progress_check.py   ruta eBird por región (abandonada, 429)
    ├── descargar_sonidos.py, optimizar_sonidos.py   primera descarga de cantos
    └── gbif_pruebas/        prototipos y validaciones de la migración a GBIF
```

## Regenerar los datos de la web

```bash
python3 python_scripts/build_web_data.py            # reescribe web/data/*.json derivados
python3 python_scripts/build_web_data.py --report   # además imprime especies de control
python3 python_scripts/preparar_imagenes_web.py      # reúne hasta 64 candidatas por especie
python3 python_scripts/ordenar_imagenes_web.py       # publica las ocho mejores en la web
```

Para ordenar las fotos se necesitan `pillow`, `numpy` y `onnxruntime`
(`python3 -m pip install pillow numpy onnxruntime`). La primera
ejecución descarga el detector (~9 MB) y las miniaturas; todo queda en
`cache_images/`, fuera de Git. La web solo lee las ocho seleccionadas en `images.json`.
El detector es [SSD MobileNet v1 de ONNX Model Zoo](https://huggingface.co/onnxmodelzoo/ssd_mobilenet_v1_12-int8).
Las fotos que no se pueden descargar para el análisis no se publican en la galería.
Si se regeneran todas las candidatas con `preparar_imagenes_web.py --force`, hay que
volver a ejecutar el ordenador. Se puede revisar una sola especie con
`python3 python_scripts/ordenar_imagenes_web.py --species "Zonotrichia capensis" --dry-run`.

Para rehacer el agregado desde GBIF, ver `python_scripts/gbif/run_pipeline.py` y la
metodología. Las descargas crudas quedan fuera de Git.

## Ejecutar la web localmente

```bash
cd web
python3 -m http.server 8000
```

Abrir <http://localhost:8000>. D3 se carga desde jsDelivr, así que se necesita
conexión a internet.

- **Overview:** mensaje, resumen de clases, mapa y una "ventana" con el
  calendario especie × mes de una clase (pestañas Residentes / De verano / De
  invierno, cada una con su rampa de color; abre en verano). Debajo, la grilla
  general región × mes: cuánto se aleja cada mes del promedio anual de
  visitantes de la región.
- **Zoom & filter:** clic en una región (mapa o grilla), pestañas por clase,
  "mostrar todas", buscador de especie y scrubber de mes con ▶ (también con la
  barra espaciadora).
- **Detalle:** ficha de especie con perfil anual radial, mapa de frecuencia
  por región, clip de canto (si hay) y galería de hasta ocho fotos (si hay).
- **Sonificación:** cada mes (2,4 s) recorre Chile de norte a sur en cinco
  macrozonas. Residentes = colchón sostenido; visitantes = cantos reales
  (Fío-fío en verano, Picaflor chico en invierno). Densidad ← la ola de cada
  zona respecto de su propio año; tono ← latitud; volumen ← cantidad. El audio
  parte solo después de pulsar Play.
- **Mezclador:** grilla con foto, búsqueda y filtro estacional para elegir
  especies; volumen individual y reproducción simultánea, desincronizada por
  defecto o sincronizada con la casilla. Ver
  [`docs/mezclador-sonoro.md`](docs/mezclador-sonoro.md).

## Publicación

GitHub Pages: publicar la carpeta `web/` como raíz del sitio (por ejemplo, con
una GitHub Action de Pages que suba `web/`). Cloudflare Workers también la
sirve como assets estáticos (`wrangler.jsonc`).

## Cantos (Xeno-canto)

```bash
python3 python_scripts/preparar_audio_web.py --dry-run   # selección y faltantes
python3 python_scripts/preparar_audio_web.py             # descarga faltantes y genera web/audio/
python3 python_scripts/build_web_data.py                 # enlaza web/audio/clips.json en web/data/sounds.json
python3 python_scripts/preparar_audio_mixer.py           # crea pistas con menos ambiente para el mezclador
```

`python_scripts/preparar_audio_web.py` cubre todas las especies que la web muestra sin
expandir (232: top por pestaña en Chile y en cada región). Junta candidatas
locales (`sounds/`) y de Xeno-canto (Chile primero, calidad A/B) y elige la
mejor (Chile, canto o llamado, calidad, priorizando licencias sin ND). De cada una publica
un clip de 6 s y un grano de 0,9 s para la sonificación, tomados del tramo con
más energía en la banda de las aves (1,5–9 kHz) ponderada por tonalidad, para
evitar viento o ruido de fondo. Hoy: 231 de 232 especies (falta el Guanay, sin
grabaciones en Xeno-canto), ~13 MB. Los ajustes a mano (excluir una grabación,
forzar otra, fijar el segundo de inicio) van en `audio_overrides.json`; las
respuestas de la API quedan en `cache_xenocanto/` (fuera de Git). Requiere `ffmpeg` y `numpy`. La API key se
lee de `api_sounds` (`.env` o variable de entorno) y nunca se escribe ni se
imprime. `sounds/` (originales) sigue fuera de Git; `web/audio/` sí se publica,
con autor, licencia y enlace a la grabación original en la ficha.
El mezclador usa 178 pistas con reducción espectral del fondo (177 archivos
únicos); 53 grabaciones con licencia ND conservan el clip previo y aparecen
marcadas como audio original. [Creative Commons explica que las licencias ND no
permiten compartir adaptaciones](https://creativecommons.org/licenses/by-nc-nd/4.0/).

## Fuentes y atribución

- Ocurrencias: GBIF.org, 11 descargas (DOIs en `docs/metodologia-datos.md` y
  en el pie de la web). eBird aporta el 91–98 % de los registros 2016–2024.
- Divisiones regionales: [Mapoteca BCN](https://www.bcn.cl/siit/mapas_vectoriales/index_html).
- Cantos: [Xeno-canto](https://xeno-canto.org), licencias Creative Commons por grabación.
- Fotos: [GBIF](https://www.gbif.org), licencia CC BY explícita por medio; cada foto
  enlaza su ocurrencia, autor y licencia. Las fotos se sirven desde el proveedor
  original, por lo que su disponibilidad depende de él.

Uso educativo y no comercial.

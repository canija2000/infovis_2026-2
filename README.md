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
- `preparar_audio_web.py`: elige, descarga (Xeno-canto, `cnt:chile`) y recorta los
  cantos que publica la web en `web/audio/` (clips + `clips.json`).
- `descargar_sonidos.py`, `optimizar_sonidos.py`: descarga inicial de cantos (histórico).
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

- **Overview:** mensaje, resumen de clases, mapa y una "ventana" con el
  calendario especie × mes de una clase (pestañas Residentes / De verano / De
  invierno, cada una con su rampa de color; abre en verano). Debajo, la grilla
  general región × mes: cuánto se aleja cada mes del promedio anual de
  visitantes de la región.
- **Zoom & filter:** clic en una región (mapa o grilla), pestañas por clase,
  "mostrar todas", buscador de especie y scrubber de mes con ▶ (también con la
  barra espaciadora).
- **Detalle:** ficha de especie con perfil anual radial, mapa de frecuencia
  por región y clip de canto (si hay).
- **Sonificación:** cada mes (2,4 s) recorre Chile de norte a sur en cinco
  macrozonas. Residentes = colchón sostenido; visitantes = cantos reales
  (Fío-fío en verano, Picaflor chico en invierno). Densidad ← la ola de cada
  zona respecto de su propio año; tono ← latitud; volumen ← cantidad. El audio
  parte solo después de pulsar Play.

## Publicación

GitHub Pages: publicar la carpeta `web/` como raíz del sitio (por ejemplo, con
una GitHub Action de Pages que suba `web/`). Cloudflare Workers también la
sirve como assets estáticos (`wrangler.jsonc`).

## Cantos (Xeno-canto)

```bash
python3 preparar_audio_web.py --dry-run   # selección y faltantes
python3 preparar_audio_web.py             # descarga faltantes y genera web/audio/
python3 build_web_data.py                 # enlaza web/audio/clips.json en web/data/sounds.json
```

`preparar_audio_web.py` toma la mejor grabación de cada especie en `sounds/`
(prioriza Chile, canto o llamado, calidad A y licencias sin ND) y descarga
desde Xeno-canto (`cnt:chile`) los visitantes más frecuentes y las especies
cuya grabación local no era de Chile o Argentina. De cada una publica un clip
de 8 s (la ventana de mayor energía, normalizada) y un grano de 1,2 s para la
sonificación, en total unos 3 MB. Requiere `ffmpeg` y `numpy`. La API key se
lee de `api_sounds` (`.env` o variable de entorno) y nunca se escribe ni se
imprime. `sounds/` (originales) sigue fuera de Git; `web/audio/` sí se publica,
con autor, licencia y enlace a la grabación original en la ficha.

## Fuentes y atribución

- Ocurrencias: GBIF.org, 11 descargas (DOIs en `docs/metodologia-datos.md` y
  en el pie de la web). eBird aporta el 91–98 % de los registros 2016–2024.
- Divisiones regionales: [Mapoteca BCN](https://www.bcn.cl/siit/mapas_vectoriales/index_html).
- Cantos: [Xeno-canto](https://xeno-canto.org), licencias Creative Commons por grabación.

Uso educativo y no comercial.

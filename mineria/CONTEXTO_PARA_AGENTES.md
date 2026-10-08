# Contexto para agentes · Proyecto de Minería de Datos (IIC2433) sobre aves de Chile

> **Lee esto completo antes de proponer nada.** Este proyecto **no parte de cero**. Existe otro
> proyecto del mismo equipo (Visualización de Información, repo `canija2000/infovis_2026-2`) que ya
> descargó, limpió, agregó y analizó **todos los datos** que necesita este. Hay semanas de trabajo
> específico detrás: decisiones metodológicas, trampas ya descubiertas y archivos listos para usar.
> Las propuestas deben construir sobre eso, no reemplazarlo ni ignorarlo.
>
> Última actualización: 2026-10-08. Fuente de verdad: el repo `canija2000/infovis_2026-2` (rama `main`).

---

## 0. Resumen en 10 líneas

1. **Datos:** 6,6 M de registros de aves en Chile (GBIF, 2016–2026; 98 % eBird), con especie, fecha y
   coordenadas. Son públicos (CC0 / CC BY), con DOI, y se bajan **en un comando** sin credenciales.
2. **Ya procesados:** agregados región × mes × especie, «año típico» 2017–2024, clasificación estacional
   de 551 especies, grillas espaciales de 5 km y 22 km, y medidas de esfuerzo de observación.
3. **Multimedia ya curada:** 230 cantos (Xeno-canto, recortados y analizados), 4.167 fotos CC BY
   (hasta 8 por especie, 551 especies) y rasgos morfológicos y de hábitat (AVONET / EltonTraits) de las 551.
4. **Lección central:** los datos miden **registros, no aves**. Todo análisis tiene que corregir por
   **esfuerzo de observación**. Ya hay métodos probados para eso (sección 5).
5. **Muestra de minería ya hecha:** clustering de las curvas anuales de 2024 (sección 6).
6. **Idea innovadora del equipo:** usar **EmbeddingGemma 2** (multimodal: texto, imagen y audio en un
   mismo espacio) para representar cada especie y comparar clústeres por fenología, rasgos, canto e imagen
   (sección 7). No hay que descartarla: los insumos ya existen y la escala es pequeña (~550 especies).

---

## 1. Dos proyectos, un mismo conjunto de datos

| | Visualización (IIC2026) | Minería de Datos (IIC2433) |
|---|---|---|
| Repo | `canija2000/infovis_2026-2` (público) | Repo local del equipo (aparte) |
| Producto | Sitio web «Nómadas & sedentarios: las avifaunas de Chile continental» (D3 + Web Audio) | Modelos, métricas y una demo en vivo |
| Mensaje | ~214 especies residentes todo el año; cada verano llegan ~100 visitantes más y se van | Por definir; ver sección 8 |
| Datos | Los de la sección 2 | **Los mismos** (leerlos desde el repo de Visualización o bajarlos con su script) |

**Uso doble:** se pueden reutilizar los datos y el preprocesamiento, pero el trabajo evaluado en
Minería tiene que ser nuevo (modelos, evaluación, causalidad). Conviene declararlo a ambos profesores.

---

## 2. Datos crudos (GBIF)

### Cómo obtenerlos
```bash
git clone https://github.com/canija2000/infovis_2026-2 && cd infovis_2026-2
python3 python_scripts/gbif/bajar_crudos.py          # ~810 MB → gbif/downloads/2016.zip … 2026.zip
python3 python_scripts/gbif/bajar_crudos.py --verify # verifica tamaño, zip y SHA-256
```
- `gbif/descargas.json` (versionado) registra para cada año: DOI, clave GBIF, nº de registros, bytes y SHA-256.
  **Todo el equipo trabaja con los mismos bytes.**
- **No usar** `gbif_downloads.py` ni `run_pipeline.py`: piden descargas *nuevas* (requieren credenciales) y
  darían datos distintos.
- `gbif/downloads/` y `gbif/staging/` están en `.gitignore`: no se suben al repo.

### Qué contienen
- Un zip por año. Cada uno trae **un CSV separado por tabuladores** (formato SIMPLE_CSV de GBIF, 50 columnas).
- **Filtros de la descarga:** clase Aves, país Chile, con coordenadas, sin problemas geoespaciales,
  eventDate entre 2016-09-17 y 2026-09-25.
- **Registros por año:** 2016: 95 k (parcial) · 2017: 330 k · 2018: 427 k · 2019: 588 k · 2020: 563 k · 2021: 738 k ·
  2022: 1,04 M · 2023: 1,39 M · 2024: 1,53 M · 2025: 29 k · 2026: 18 k.
- **2025–2026 casi no tienen datos:** eBird todavía no los había publicado en GBIF; solo hay iNaturalist y otros.
  **Usar 2017–2024** (8 años completos).
- **Columnas útiles:** `species` (binomio limpio), `scientificName` (con autor), `decimalLatitude`,
  `decimalLongitude`, `coordinateUncertaintyInMeters`, `eventDate`, `year`, `month`, `day`,
  `individualCount`, `datasetKey`, `occurrenceID`, `locality`, `recordedBy`, `basisOfRecord`, `issue`.

### Trampas ya conocidas de los datos crudos
- **No hay nombre común.** Cruzar `species` con `gbif/sci_to_comname.json` (644 especies → nombre en español)
  o con `web/data/species.json` (las 551 del atlas). Cubre el 96 % de las filas.
- **`species` vacío** = identificación solo a género o superior. Descartar esas filas.
- **`individualCount` = individuos contados por el observador en ese registro**, no número de avistamientos.
  En 2024: mediana 2, p90 15, p99 150, máximo 225.000 (bandadas o errores); 3,2 % vacío (presencia sin conteo).
  No sirve como medida de abundancia. Si se usa, que sea la mediana o el logaritmo por especie y mes.
- **Cada fila es un registro:** una especie en una lista de observación (checklist). `occurrenceStatus`
  es siempre PRESENT, así que **no hay ausencias explícitas**.
- **El SIMPLE_CSV no trae el ID de la lista** (eventID / samplingEvent). Para reconstruir «canastas» se usa
  *lugar × día* (sección 5).
- **~10 % cae fuera de los polígonos regionales** (mar, fronteras). El pipeline lo filtra con un join espacial.
- **Esfuerzo creciente:** de 2017 a 2024 los registros crecen ~2,5×. Una tendencia anual cruda refleja
  más observadores, no más aves.
- **Esfuerzo estacional:** en verano hay ~1,6× más registros que en invierno.
- **Detectabilidad:** las aves se registran más cuando cantan (primavera). El Chincol, residente, aparece en el
  44 % de las «salidas» de octubre y en el 23 % de febrero. Presencia ≠ detección.

### Cargar en pandas (probado)
```python
import json, pandas as pd
cols = ["species", "decimalLatitude", "decimalLongitude", "eventDate", "individualCount",
        "datasetKey", "locality", "coordinateUncertaintyInMeters"]
df = pd.read_csv("gbif/downloads/2024.zip", sep="\t", usecols=cols, quoting=3,   # quoting=3: sin comillas
                 dtype={"individualCount": "Int64"}, on_bad_lines="skip")
df = df[df["species"].notna()]
df["date"] = df["eventDate"].str[:10]
df["comName"] = df["species"].map(json.load(open("gbif/sci_to_comname.json", encoding="utf-8")))
```
Leer los 8 años completos en CSV toma algunos minutos. Para iterar rápido conviene convertirlos una vez a
Parquet con solo estas columnas.

---

## 3. Datos ya procesados en el repo de Visualización (listos para usar)

Todos en `web/data/` salvo que se indique otra ruta. Generados por scripts de `python_scripts/`, de forma
determinista. La metodología completa está en `docs/metodologia-datos.md`.

| Archivo | Contenido |
|---|---|
| `species.json` | 551 especies: `id`, `sciName`, `comName`, `class` (residente / visitante_estival / visitante_invernal / ocasional), `peak`, `phase`, `seasonality`, `reportDays`, `meanFreq`, `regions`, `hasSound` |
| `meta.json` | 16 regiones (`id` 1–16, código ISO `CL-XX`, nombre, centroide) + `id` 0 = Chile; parámetros de clasificación; DOIs; cita GBIF |
| `typical_year.json` | 4.421 filas especie × región: `[sid, rid, cls, peak, phase, amp, present, freq×12, prof×12, years×12]`. `freq` = ‰ de días del mes con registro (media 2017–2024); `prof` = perfil relativo a su mejor mes (0–100), corregido por esfuerzo; `years` = nº de años (0–8) con registro ese mes; `present` = máscara de bits por mes |
| `region_month.json` | Por región y mes: riqueza, nº de residentes / estivales / invernales presentes, proporción de visitantes y esfuerzo |
| `observations-01/02.json` | Agregado completo región × año-mes × especie con `reportDays` (días distintos con registro), 2016–2026 (~26 MB) |
| `grid_month.json` | Grilla de 0,2° (~22 km) × mes: especie-días por clase e índice de «ola» por celda |
| `grid_region/CL-XX.json` | Grilla de 0,05° (~5 km) × mes por región: especie-días de residentes, verano e invierno |
| `regions.geojson` / `regions.min.geojson` | Polígonos de las 16 regiones (Mapoteca BCN) |
| `sounds.json` | 231 especies con grabación: `src` (clip de 6 s), `grain` (0,9 s), `mixer` (fondo atenuado), autor, licencia y URL de Xeno-canto |
| `images.json` | 551 especies × hasta 8 fotos (4.167 en total): URL, autor, licencia CC BY y fuente (GBIF / iNaturalist). Ordenadas por calidad con un detector de objetos (`python_scripts/ordenar_imagenes_web.py`) |
| `game/enrich/morphology.json` | 551 especies: rasgos AVONET (medidas en mm y g, índice alar HWI, proporciones), familia, dieta (EltonTraits), estilo de vida y estatus migratorio de la literatura |
| `game/enrich/habitat.json` | 551 especies: hábitat AVONET, biomas y densidad de vegetación |
| `game/enrich/palette.json` | 87 especies: colores por zona del cuerpo (extraídos de fotos y revisados a mano) |
| `../audio/` (`web/audio/`) | 230 clips MP3 de 6 s + granos + 177 pistas con fondo atenuado (`mixer/`); ~21 MB |
| `../../python_scripts/audio_review/analisis.json` | Por clip: banda de frecuencia propia, contraste canto/fondo (dB), % del clip con canto y los 3 mejores tramos de 2 s |

Agregados intermedios (no versionados; se regeneran desde los zips):
- `python_scripts/gbif/grid_aggregate.py --res 0.2 0.05` → `gbif/staging/grid-<res>.json`: especie-días
  por celda × mes × clase.
- `python_scripts/gbif/loop_aggregate.py` → `gbif/staging/place_days.json`: **lugar-días** por especie,
  región y mes.

---

## 4. Licencias y citas
- **GBIF:** citar los 11 DOIs de `web/data/metadata.json` (también en `gbif/descargas.json`).
- **Xeno-canto:** licencias CC por grabación (varias no comerciales, y algunas ND que no se pueden modificar).
  Autor y licencia van en `sounds.json`.
- **Fotos:** CC BY con autor en `images.json`. Se enlazan; no están copiadas en el repo.
- **AVONET** (Tobias et al. 2022, CC BY 4.0) y **EltonTraits 1.0** (Wilman et al. 2014, CC0).

---

## 5. Decisiones metodológicas ya tomadas (y por qué)

**Métricas de presencia** (nunca conteos brutos):
- **días-con-registro (`reportDays`):** días distintos del mes con al menos un registro de la especie en la región.
- **especie-día:** par (especie, fecha) distinto dentro de una celda.
- **salida / lugar-día:** (celda de 0,05° ≈ 5 km, fecha) con al menos un registro de cualquier especie.
  Es la unidad de esfuerzo y la «canasta» para reglas de asociación: en 2024 hay **72.656 salidas**, con
  10 especies en promedio (mediana 7, p90 23).
- **tasa de detección:** salidas del mes con la especie / salidas del mes. Corrige el esfuerzo estacional.
- **lugar-días de una especie:** mide qué tan **extendida** está. Se usa porque la frecuencia de detección
  (‰ de días) **se satura** cerca de 1.000 ‰ en todas las especies comunes y no las distingue.

**Corrección por esfuerzo del perfil anual:**
`r[s,m] = (1/8) · Σ_años d[s,m,a] / E[m,a]`, donde `E` es la suma de días-especie de todas las especies
en ese mes y año. Sin esta corrección **la Tórtola parecía migratoria**.

**Año típico:** 2017–2024. Se excluye 2016 (parcial) y 2025–2026 (sin eBird).

**Clasificación estacional por reglas** (`build_web_data.py`, parámetros en `meta.json`):
- **Presente en un mes:** registrada en ≥ 4 de 8 años y con ≥ 20 % del perfil de su mes pico.
- **Estacional:** amplitud del perfil ≥ 0,6. La fase decide si es de verano o de invierno.
- **Resultado nacional:** 214 residentes, 121 visitantes de verano, 31 de invierno y 185 ocasionales.
  **Este es el baseline natural para cualquier clustering.**

**Comparaciones espaciales:** comparar cada región (o celda) **con su propio promedio anual**, no en
valores absolutos. Si no, las zonas con pocos registros o hábitats especiales (humedales) parecen
anómalas solo por eso.

**Hallazgos ya documentados:**
- **La ola estacional es nacional:** casi todo Chile cambia a la vez, no hay un frente norte → sur. En julio y agosto
  ~95 % de las celdas tienen más visitantes de invierno que lo habitual; de noviembre a enero, ~85 % más de verano.
- **Palomas y tórtolas arrullan grave** (~300–900 Hz). El recorte automático de cantos buscaba en 1,5–9 kHz y
  fallaba. Ya está corregido (`recortar_audio_banda.py`, `"band"` en `audio_overrides.json`).

---

## 6. Minería ya hecha: fenología de 2024 (`mineria/fenologia_2024.py`)

- **Entrada:** `gbif/downloads/2024.zip`, solo registros dentro de Chile continental (join con los polígonos).
- **Unidad:** tasa de detección por especie y mes (sección 5). 321 especies con ≥ 30 salidas.
- **Forma del ciclo:** curva de 12 meses dividida por su máximo.
- **K-means (k = 2…8) + GMM (BIC):** la silueta elige **k = 2** (0,31): residentes contra visitantes de
  verano, con **ARI 0,54** frente a las reglas. El PCA (PC1 46 %, PC2 18 %) muestra un **gradiente**, no
  grupos separados.
- **k = 5 (exploración, ARI 0,28):** curvas planas (Zorzal, Chincol) · pico en primavera (Golondrina chilena,
  Chirihue: más detectables en época de cría) · **pico en invierno** (Picaflor chico, Diucón, Viudita: incluye
  **49 especies que las reglas llaman «residentes»**, probablemente migración altitudinal) · verano largo
  (Fío-fío) · pico breve en noviembre (Run-run, Pilpilén austral).
- Las figuras están en `mineria/figuras/` y los números en `mineria/resultados_2024.json`.

---

## 7. La idea innovadora: EmbeddingGemma 2 (multimodal)

**El modelo:** `google/embeddinggemma-2` en Hugging Face, publicado el 14-09-2026, licencia Apache 2.0, sin
acceso restringido.
- **Tamaño:** 740 M de parámetros (texto 270 M + visión 170 M + audio 300 M); ~1,5 GB, así que **corre en CPU**.
- **Modalidades:** texto, imagen, audio y video en **un mismo espacio de 768 dimensiones**. Admite
  truncar a 512, 256 o 128 dimensiones (Matryoshka).
- **Uso:** con `sentence-transformers`. Los textos llevan prefijos de tarea (hay uno de *Clustering*);
  las imágenes y el audio van sin prefijo. Contexto de 8 K tokens; más de 100 idiomas (incluye español).

**Por qué es viable aquí:**
- La escala es chica: ~550 especies.
- **Los insumos ya existen y están curados:** cantos (sección 3, con sus mejores tramos ya marcados),
  fotos (URLs CC BY ordenadas por calidad) y rasgos.
- **Calza con el curso:** embeddings de texto (clase del 9 de noviembre) + PCA / t-SNE / UMAP + clustering
  (ya vistos). El enunciado del proyecto premia la «integración» de técnicas y los dominios poco convencionales.

**Diseño propuesto:** varias representaciones de la misma especie, comparadas entre sí.

| Representación | Fuente | Estado |
|---|---|---|
| A · Fenología | Curvas de detección (sección 6) | Hecha para 2024 |
| B · Rasgos | `morphology.json` + `habitat.json` | Lista |
| C · Texto | Descripciones externas (por ejemplo Wikipedia ES/EN, CC BY-SA) → embedding | Hay que bajarla |
| D · Canto | `web/audio/` (los mejores tramos) → embedding | Lista para incrustar |
| E · Imagen | `images.json` (URLs) → embedding | Lista para incrustar |

**Análisis:**
1. Para cada representación: UMAP en 2D/3D para visualizar, y clustering **en el espacio original**
   (similitud coseno), no sobre la proyección.
2. Comparar representaciones: ARI entre clusterings, solapamiento de k vecinos más cercanos y test de
   Mantel entre matrices de distancia.
3. **Evaluación con baseline**, como pide el proyecto: predecir con k-NN o regresión logística, con validación
   cruzada, una variable que el insumo no diga explícitamente (dieta, hábitat, forma del ciclo, familia).
   Comparar contra el clasificador mayoritario y contra los rasgos numéricos.
4. **Hipótesis ecológica:** **adaptación acústica** (Morton 1975): en hábitat cerrado (bosque) los cantos son más
   graves y tonales. Se pone a prueba con D (canto) frente a B (densidad de hábitat).

**Riesgos que hay que manejar, no razones para descartar la idea:**
- **Circularidad:** si el texto se genera desde nuestros propios datos («residente, pico en julio…»), el
  embedding solo vuelve a codificar esos números. El texto tiene que traer información externa.
- **Fuga:** si una descripción dice «visitante estival», usarla para predecir la clase estacional es trivial.
  Hay que enmascarar esas frases o elegir otra variable objetivo.
- **Rendimiento en cantos de aves:** desconocido. Los benchmarks del modelo son de sonido general. Por eso el
  **primer paso es una prueba rápida**: incrustar los ~230 cantos, proyectar con UMAP y colorear por familia y
  por clase. Si separa algo, entra a la propuesta.
- **Demo:** el espacio en 3D podría mostrarse como una «bandada» en el Aviario 3D del equipo
  (https://canija2000.github.io/3d_aviario/).

---

## 8. Requisitos del proyecto de Minería (IIC2433, 2026-2)

- **Propuesta (23 oct, Canvas):** presentación + *graphical abstract* + plan de actividades + video de 3 min.
  Debe incluir: nombre, integrantes, problema, técnicas, datos (abiertos, volumen y tipo), contribuciones
  y entregables.
- **Avance (2 y 5 nov, presencial):** video de 4 min + preguntas. Datos recolectados y código experimental
  listos. **Los datos ya están**: el avance puede mostrar resultados.
- **Final (23 y 26 nov):** video de 5 min + **demo en vivo** + **evaluación con métricas contra un baseline** +
  algo de las últimas clases (**causalidad / redes bayesianas**, autoencoders, embeddings).
- **Prohibido:** rendimiento o deserción estudiantil, PAES/SIMCE, CASEN y datasets usados en actividades del curso.
- **Calendario del curso:** PCA, t-SNE/UMAP, K-means/DBSCAN/HDBSCAN, GMM, series de tiempo (descomposición,
  estacionariedad, ACF/PACF, ARIMA), reglas de asociación (5 oct), redes bayesianas (19 oct), autoencoders
  (26 oct), embeddings de texto (9 nov). Material en https://github.com/MaxOjeda/IIC2433-2026.

### Módulos candidatos, cada uno con su baseline

| Módulo | Técnica | Baseline y métrica |
|---|---|---|
| Fenología | Clustering de curvas (K-means / GMM / HDBSCAN) + PCA / UMAP | Clases por reglas · silueta, ARI |
| Bioregiones | Clustering de celdas por composición especie × mes | 16 regiones administrativas · ARI, silueta |
| Pronóstico | STL + SARIMA, entrenando 2017–2023 y probando en 2024 (split secuencial) | Mismo mes del año anterior; promedio histórico · MAE, MASE |
| Comunidades | Reglas de asociación sobre canastas lugar × día | *Lift* contra coocurrencia esperada · soporte, confianza, *lift* |
| Multimodal | EmbeddingGemma 2 (sección 7) | Clasificador mayoritario y rasgos numéricos · exactitud, F1, ARI, Mantel |
| Causalidad | 2020 (pandemia) como experimento natural: serie interrumpida + red bayesiana esfuerzo → registro ← presencia; o El Niño (ONI) → irrupciones de aves marinas | Contrafactual sin intervención |

---

## 9. Reglas para el agente que trabaje en este proyecto

1. **No propongas volver a conseguir los datos** (eBird API, scraping, otros datasets) para lo que ya existe.
   Usa `bajar_crudos.py` y los archivos de la sección 3.
2. **No uses conteos brutos ni `individualCount` como abundancia.** Corrige por esfuerzo (sección 5).
3. **Usa 2017–2024** como base; 2016 es parcial y 2025–2026 no tienen eBird.
4. **Usa la clasificación por reglas como baseline**, no como verdad.
5. **No descartes la idea de EmbeddingGemma 2** sin antes hacer la prueba rápida de la sección 7. Si ves un
   riesgo, propón cómo mitigarlo.
6. **En series de tiempo:** split secuencial, nunca aleatorio.
7. **Si algo de este documento no coincide con el repo**, el repo manda. Revisa `README.md`,
   `docs/metodologia-datos.md` y la docstring de cada script.

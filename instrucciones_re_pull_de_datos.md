# Instrucciones: re-pull de datos eBird por región (ruta A)

Documento para un agente que retoma el proyecto **Atlas de aves de Chile** con
acceso al repositorio en su estado actual. El objetivo es reemplazar la fuente
de datos actual (una consulta nacional por día) por una nueva fuente: **una
consulta por región y por día** al endpoint histórico de eBird.

Lee este documento completo antes de tocar código.

---

## 1. Contexto del proyecto

Visualización interactiva (curso de Visualización de Información) de
observaciones de aves en Chile, 2016-09-17 a 2026-09-18.

| Ruta | Rol |
|---|---|
| `10anios.py` | Pipeline actual: descarga, cachea, asigna región con shapefile, agrega y exporta a `web/data/`. |
| `cache_ebird/AAAA-MM-DD.json` | Caché **nacional** actual (3.654 archivos, ~218 MB, fuera de Git). **No borrar.** |
| `Regiones/Regional.shp` | Shapefile BCN de las 16 regiones (`codregion` → código ISO vía `REGION_CODES`). |
| `web/` | Frontend estático (Leaflet + JS puro). Consume `web/data/`. |
| `web/data/regions.geojson` | Geometrías simplificadas + métricas por región. |
| `web/data/observations-01.json`, `-02.json` | Agregado región × mes × especie, partido en dos por el límite de 25 MiB/asset de Cloudflare. |
| `web/data/metadata.json` | Rango de fechas, totales, tipo de agregación. |
| `descargar_sonidos.py`, `optimizar_sonidos.py` | Sonidos de Xeno-canto (fuera de alcance aquí; ver `refactorizacion_sounds_api.md`). |
| `.env` | Contiene `API_BIRD_KEY` (eBird) y `api_sounds` (Xeno-canto). **Nunca imprimir, loguear ni commitear.** |

Dependencias: Python ≥ 3.11, `geopandas pandas requests pyarrow`.

## 2. El problema que motiva la ruta A

`GET /v2/data/obs/{regionCode}/historic/{y}/{m}/{d}` **no devuelve todas las
observaciones del día**: devuelve **una fila por especie** para la región
consultada (por defecto `rank=mrec`, el avistamiento más reciente). Verificado
en la caché:

```
2016-09-17.json  134 filas  134 especies únicas
2021-08-22.json  197 filas  197 especies únicas
2024-02-08.json  216 filas  216 especies únicas
```

Como hoy se consulta `CL` (todo Chile) y después se asigna región por la
coordenada de esa única fila, cada especie cuenta **en una sola región por
día** (la del último avistamiento), aunque se haya visto en diez. Resultado:

- `obsCount` en realidad es "días en que la especie se reportó en Chile".
- La distribución regional está sesgada hacia las regiones con más actividad
  a última hora del día; `participacion`, `especies` por región y el top 5
  regional heredan ese sesgo.

La **ruta B** (rama `metrica-dias-registro`) solo reetiqueta honestamente la
métrica sin cambiar los datos. La **ruta A**, la tuya, cambia la fuente para
que cada región tenga su propia lista diaria de especies.

## 3. Qué significa la nueva métrica (importante)

Consultando `CL-XX` por separado, cada fila pasa a ser:

> "la especie *S* fue reportada al menos una vez en la región *R* el día *D*"

Por lo tanto, el agregado por región × mes × especie da **días con registro
por región** (0–31 por mes). Sigue **sin ser** el número de observaciones ni
de listas (checklists), pero ya no hay sesgo de asignación entre regiones.
Una normalización natural es `reportDays / días del mes` → **frecuencia de
detección** en [0, 1].

Nombra los campos de acuerdo con esto (alinear con la rama B si ya existe):
`reportDays` en vez de `obsCount`. `howMany` y `places` solo describen la fila
representativa de cada día; documéntalo o descártalos.

> Si en algún momento se necesitan conteos reales (número de listas,
> individuos por lista, esfuerzo), la fuente correcta es el **eBird Basic
> Dataset (EBD)**, que requiere solicitud de acceso. No es parte de esta
> tarea; solo menciónalo al usuario si surge la necesidad.

## 4. Plan de trabajo

Trabaja en una rama nueva desde `main`: `ruta-a-pull-regional`.

### Paso 0 — Verificación empírica (antes de lanzar la descarga)

Con **pocas** solicitudes (≤ 40), comprueba y reporta al usuario:

1. Para 1–2 fechas, consulta las 16 regiones y compara:
   - ¿cada respuesta regional tiene también 1 fila por especie?
   - ¿las coordenadas caen dentro del polígono de su región (sjoin)? ¿qué %
     cae fuera (costa/mar, bordes)?
   - unión de especies regionales vs. lista nacional del mismo día en
     `cache_ebird/` (debería coincidir o ser muy similar).
2. Si pruebas el parámetro `r` (varias regiones en una sola llamada), verifica
   si devuelve filas **por región** o una lista **fusionada**. No lo asumas;
   si fusiona, no sirve.
3. Parámetros a usar: `sppLocale=es_CL`, `rank=mrec` (explícito), `detail=simple`.
   Decide y documenta `includeProvisional` (por defecto `false`, igual que la
   fuente actual; mantenerlo para comparabilidad).

### Paso 1 — Descarga

- Volumen: 16 regiones × 3.654 días = **58.464 solicitudes** (~16 h a 1 s de
  pausa). Diseña para ejecución larga y reanudable.
- Caché nueva, separada de la actual:
  `cache_ebird_regional/{REGION}/{AAAA-MM-DD}.json`. Guarda también las
  respuestas vacías (`[]`), para no reconsultarlas. Agrega el directorio a
  `.gitignore`.
- Reutiliza la lógica de `fetch_day` de `10anios.py` (reintentos con backoff
  en 5xx, parada inmediata en 429, error claro en 401/403). Escritura atómica
  (archivo temporal + `replace`) para no dejar JSON truncados si se corta.
- Flags sugeridos: `--regions CL-RM,CL-VS`, `--start`, `--end`, `--pause`,
  `--dry-run` (cuenta pendientes por región), `--workers` (por defecto 1; como
  máximo 2–3, eBird no publica cuota y un 429 detiene todo).
- Ejecútalo en segundo plano y reporta progreso periódico (por región y
  total). No lances las 58k solicitudes sin confirmar antes con el usuario
  el tiempo estimado.

### Paso 2 — Procesamiento

- La región viene de la consulta: **no hace falta el sjoin para asignar**.
  Úsalo solo como validación (reporta % fuera de polígono) y **no descartes**
  esas filas (hoy se pierde ~10 % de los datos por puntos fuera del polígono,
  p. ej. pelágicos).
- Agregado: `region_code, year_month, speciesCode, comName, sciName` →
  `reportDays` (días distintos), más lo que se decida de `howMany`/`places`.
- Añade `exoticCategory` si está disponible (útil para la visualización:
  nativa / exótica).
- Métricas por región en `regions.geojson`: especies distintas, total de
  especie-días, meses con datos. Revisa si `participacion` sigue teniendo
  sentido (tiende a reflejar esfuerzo de observación, no riqueza); discútelo
  con el usuario.

### Paso 3 — Exportación y frontend

- El agregado crecerá (una especie común aparece en varias regiones por mes).
  Mide el tamaño. Exporta **minificado** (`separators=(",", ":")`, como ya
  hace `10anios.py`) y parte en N archivos según tamaño (< 20 MiB cada uno),
  no en dos fijos.
- Lista los archivos en `metadata.json` (`"observationFiles": [...]`) y
  cambia `web/app.js` para leerlos desde ahí en vez de tener
  `observations-01/02` hardcodeados. Actualiza también `descargar_sonidos.py`
  si lee esos nombres.
- `metadata.json` debe incluir `"source": "ebird-historic-by-region"`, la
  definición de la métrica y los parámetros de la API usados.

### Paso 4 — Estructura de código

Opción recomendada: script nuevo `pull_regional.py` (descarga + caché) y
extraer el agregado/exportación compartidos a un módulo (`pipeline_export.py`)
para que `10anios.py` (fuente nacional, histórica) siga funcionando. Mantén el
estilo del repo: español en mensajes y docstrings, `argparse`, `pathlib`,
funciones pequeñas.

## 5. Criterios de aceptación

- [ ] Informe del Paso 0 entregado al usuario antes de la descarga masiva.
- [ ] Caché regional completa (o reanudable, con conteo de pendientes = 0).
- [ ] `web/data/` regenerado; la web carga sin errores en
      `python3 -m http.server` desde `web/`.
- [ ] Ningún archivo de `web/data/` > 25 MiB.
- [ ] Tabla comparativa por región: métrica antigua vs. nueva (sirve como
      evidencia de iteración para la entrega del curso).
- [ ] README actualizado: nueva fuente, semántica de la métrica, comandos.
- [ ] La API key no aparece en logs, en commits ni en `web/`.
- [ ] Commits pequeños y descriptivos en la rama `ruta-a-pull-regional`; sin
      push ni merge a `main` sin confirmación del usuario.

## 6. Qué no hacer

- No borrar ni sobrescribir `cache_ebird/` (es la fuente anterior y respaldo).
- No versionar cachés ni audios.
- No cambiar el diseño visual del frontend más allá de lo necesario para
  leer la nueva fuente (hay una propuesta separada en `propuesta_mejoras.md`).

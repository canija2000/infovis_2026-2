# Metodología de datos — Ruta A (vía GBIF)

## 1. Contexto y decisión

El plan original (ruta A) contemplaba descargar observaciones históricas de
eBird consultando la API una vez por día (~58.000 consultas para 2016–2026).
En la práctica, la API devolvió errores 429 (rate limit) de forma sostenida,
lo que volvió inviable esa vía.

Se pivotó a **descargas masivas de GBIF** (Global Biodiversity Information
Facility), que agrega los mismos datos de eBird (entre 91% y 98% de los
registros 2016–2024 provienen del dataset oficial de eBird en GBIF) más otras
fuentes (iNaturalist, etc.), con filtros de calidad equivalentes.

## 2. Fuente y filtros

11 descargas anuales (2016–2026) desde `api.gbif.org`, cuenta `juacorio`,
formato TSV simple. Filtros idénticos en las 11:

- `TAXON_KEY = 212` (Aves)
- `COUNTRY = CL` (Chile)
- `HAS_COORDINATE = true`
- `HAS_GEOSPATIAL_ISSUE = false`
- `YEAR = {año}`
- `EVENT_DATE` entre `2016-09-17` y `2026-09-25`

2016 y 2026 son años parciales (coinciden con el rango histórico original).

## 3. Descargas

| Año | Registros | DOI |
|-----|----------:|-----|
| 2016 | 95.167 | 10.15468/dl.kzmxav |
| 2017 | 330.324 | 10.15468/dl.q4gkgp |
| 2018 | 427.262 | 10.15468/dl.bbzdhf |
| 2019 | 587.809 | 10.15468/dl.zd43an |
| 2020 | 562.625 | 10.15468/dl.6g73xy |
| 2021 | 737.873 | 10.15468/dl.ay45wx |
| 2022 | 1.035.882 | 10.15468/dl.c8636y |
| 2023 | 1.388.977 | 10.15468/dl.ha69dg |
| 2024 | 1.526.831 | 10.15468/dl.mhq47r |
| 2025 | 29.239 | 10.15468/dl.zduqq6 |
| 2026 | 18.208 | 10.15468/dl.ykt9z2 |
| **Total** | **6.739.197** | |

Verificación: los 11 zips se descargaron íntegros (conteo de filas = registros
informados por GBIF en los 11 casos) y con las mismas 50 columnas.

## 4. Validación previa (prueba mayo 2024)

Antes del pipeline completo se validó una descarga de prueba (2024-05,
120.561 registros):

- 90,8% de los registros cae dentro de los 16 polígonos regionales.
- Comparación con el caché eBird del proyecto para 2024-05-15: GBIF cubre el
  81,1% de las especies del caché (458 de 565), con las 16 regiones
  representadas.

## 5. Limpieza y decisiones

- **Todos los datasets incluidos** (no solo eBird): eBird aporta 91–98% en
  2016–2024; el resto es mayoritariamente `HUMAN_OBSERVATION` (98,6% global)
  con coordenadas válidas. Sin `occurrenceID` duplicados en ningún año.
- **Solo rango especie**: se excluyen identificaciones a género o superior
  (ej. *"Anas Linnaeus, 1758"*), ~2,5% de los días-especie. El atlas es a
  nivel de especie.
- **Join espacial**: cada registro se asigna a la región cuyo polígono
  contiene sus coordenadas (`regions.geojson`, 16 regiones). ~9–13% de los
  registros cae fuera de los polígonos (pelágicos/costeros) y se excluye del
  agregado; se documenta, no se imputa.
- **2025–2026 incompletos**: el snapshot de eBird en GBIF aún no incluye
  esos años (0% eBird; solo iNaturalist y otros, ~47 mil registros entre
  ambos). La visualización los muestra con esa salvedad.
- **Nombres comunes**: GBIF no trae nombres en español. Se cruzan desde tres
  fuentes (prioridad en este orden): 565 nombres del proyecto anterior (vía
  eBird, locale es), 55 nombres vernáculos españoles de la API de GBIF y
  24 verificados manualmente (Wikipedia en español). La taxonomía de GBIF
  usa géneros distintos a eBird para ~79 especies (ej. *Phalacrocorax
  brasilianus* = *Nannopterum brasilianum* = Yeco); el cruce es por nombre
  científico GBIF. Cobertura final: 100% de los registros agregados tiene
  nombre en español (`gbif/sci_to_comname.json`, 644 mapeos).

## 6. Métrica: `reportDays`

`reportDays` = **número de días distintos del mes en que la especie se
registró en la región**. Múltiples registros de la misma especie el mismo día
cuentan una sola vez. No es un conteo de observaciones ni de individuos.

Diferencia con la versión anterior (eBird directo): antes cada día-especie se
asignaba a una sola región (la del avistamiento más reciente del día, porque
las consultas eran nacionales); ahora cada registro cae en su región por
coordenadas, por lo que una especie puede sumar días en varias regiones el
mismo mes. Los valores no son comparables 1:1 entre versiones.

`exoticCategory` (eBird) no existe en GBIF y no se incluye.

## 7. Agregación y archivos

- Grano: `region_code × year_month × sciName` → `reportDays`.
- 197.553 registros agregados, 564 especies, 121 meses (2016-09 a 2026-09),
  16 regiones.
- `web/data/observations-01.json`, `observations-02.json` (partidos bajo
  20 MiB).
- `web/data/metadata.json` lista los archivos en `observationFiles` (el
  frontend los lee dinámicamente) y registra fuente, DOIs y métrica.
- `web/data/regions.geojson`: se recalcularon `dias_especie`, `especies` y
  `meses` por región con los datos nuevos.

## 8. Comparación con la versión anterior

Muestra: Región Metropolitana, mayo 2024.

- Versión eBird directo: 113 especies en el mes.
- Versión GBIF: 135 especies, 99 en común (87,6% de las anteriores).

GBIF captura más especies (más fuentes y sin el sesgo de "avistamiento más
reciente del día"). Total: 1.524.227 días-especie (vs 604.225 antes).

## 9. Limitaciones

- 2025–2026 subrepresentados (sin eBird aún en GBIF).
- ~10% de registros fuera de polígonos (principalmente pelágicos) excluido.
- La taxonomía sigue a GBIF; puede diferir puntualmente de la de eBird.
- Sin `exoticCategory`: no se distingue especie exótica/nativa en esta versión.

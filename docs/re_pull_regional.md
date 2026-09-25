# Re-pull regional de eBird — informe del Paso 0

Fecha del informe: 2026-09-25 21:15 UTC
Solicitudes realizadas: 35 (límite: 40)
Fechas probadas: 2024-05-15, 2021-08-22; regiones: las 16 + CL nacional
Parámetros: {"sppLocale": "es_CL", "rank": "mrec", "detail": "simple", "includeProvisional": "false"}

## 1. ¿Una fila por especie por región?

| Fecha | Región | Filas | Especies únicas | 1 fila/especie |
|---|---|---|---|---|
| 2024-05-15 | CL-AP | 34 | 34 | sí |
| 2024-05-15 | CL-TA | 2 | 2 | sí |
| 2024-05-15 | CL-AN | 1 | 1 | sí |
| 2024-05-15 | CL-AT | 26 | 26 | sí |
| 2024-05-15 | CL-CO | 34 | 34 | sí |
| 2024-05-15 | CL-VS | 74 | 74 | sí |
| 2024-05-15 | CL-RM | 44 | 44 | sí |
| 2024-05-15 | CL-LI | 80 | 80 | sí |
| 2024-05-15 | CL-ML | 28 | 28 | sí |
| 2024-05-15 | CL-NB | 4 | 4 | sí |
| 2024-05-15 | CL-BI | 36 | 36 | sí |
| 2024-05-15 | CL-AR | 29 | 29 | sí |
| 2024-05-15 | CL-LR | 44 | 44 | sí |
| 2024-05-15 | CL-LL | 78 | 78 | sí |
| 2024-05-15 | CL-AI | 9 | 9 | sí |
| 2024-05-15 | CL-MA | 42 | 42 | sí |
| 2021-08-22 | CL-AP | 21 | 21 | sí |
| 2021-08-22 | CL-TA | 9 | 9 | sí |
| 2021-08-22 | CL-AN | 17 | 17 | sí |
| 2021-08-22 | CL-AT | 48 | 48 | sí |
| 2021-08-22 | CL-CO | 89 | 89 | sí |
| 2021-08-22 | CL-VS | 94 | 94 | sí |
| 2021-08-22 | CL-RM | 77 | 77 | sí |
| 2021-08-22 | CL-LI | 66 | 66 | sí |
| 2021-08-22 | CL-ML | 58 | 58 | sí |
| 2021-08-22 | CL-NB | 0 | 0 | sí |
| 2021-08-22 | CL-BI | 74 | 74 | sí |
| 2021-08-22 | CL-AR | 69 | 69 | sí |
| 2021-08-22 | CL-LR | 73 | 73 | sí |
| 2021-08-22 | CL-LL | 80 | 80 | sí |
| 2021-08-22 | CL-AI | 28 | 28 | sí |
| 2021-08-22 | CL-MA | 33 | 33 | sí |

**Resultado:** todas las respuestas regionales traen 1 fila por especie.

## 2. Unión de especies regionales vs. lista nacional

| Fecha | Especies nacional (CL) | Unión regional | Cobertura |
|---|---|---|---|
| 2024-05-15 | 173 | 173 | 100.0% de la lista nacional |
| 2021-08-22 | 197 | 197 | 100.0% de la lista nacional |

## 3. Validación espacial (sjoin contra el shapefile)

Filas con coordenadas válidas: 1401
- dentro del polígono de su región consultada: 1334 (95.2%)
- dentro de Chile pero en otra región (bordes/costa): 0 (0.0%)
- fuera de todo polígono (p. ej. pelágicos): 67 (4.8%)

**Decisión:** la región se toma de la consulta, no del sjoin. El sjoin se usa
solo como validación y no se descartan filas (a diferencia del pipeline
anterior, que perdía ~10% por puntos fuera de polígono).

## 4. Parámetro `r` (varias regiones en una llamada)

Prueba: HTTP 200, 44 filas, subnational1Code distintos: [None]

**Decisión:** no se usa `r`; una solicitud por región y día.

## 5. Parámetros y decisiones

- `sppLocale=es_CL`, `rank=mrec` (explícito), `detail=simple`.
- `includeProvisional=false`: igual que la fuente anterior (10anios.py no lo
  enviaba), para que la métrica antigua y la nueva sean comparables.
- `detail=simple` incluye `lat/lng`, `exoticCategory`, `howMany`: suficiente
  para validación y para la visualización (nativa/exótica).
- Caché en `cache_ebird_regional/{REGION}/{AAAA-MM-DD}.json`, escritura
  atómica, respuestas vacías (`[]`) también cacheadas.

## 6. Estimación de la descarga completa

- Solicitudes: 16 regiones x N días (Paso 0: 86s para 35 solicitudes).
- Ante un 429: el script se detiene y se reanuda desde la caché.

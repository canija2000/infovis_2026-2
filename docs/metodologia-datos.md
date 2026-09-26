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
- `web/data/metadata.json` lista los archivos en `observationFiles` (desde
  V1 los lee `build_web_data.py`, no el frontend; ver §10) y registra fuente, DOIs y métrica.
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

## 10. Capa web: año típico y clasificación estacional (V1)

`build_web_data.py` (solo biblioteca estándar, salida determinista) lee
`web/data/observations-*.json` + `regions.geojson` y escribe los archivos
livianos que consume la web. La carga inicial baja de ~26 MB a ~0,86 MB.

| Archivo | Contenido | Tamaño |
|---|---|---:|
| `meta.json` | regiones (id 0 = Chile, 1–16 de norte a sur), parámetros, DOIs | 4 KB |
| `species.json` | id, sciName, comName, `taxonGroup`, clase nacional, mes pico, amplitud, totales, `hasSound` | 116 KB |
| `typical_year.json` | filas dispersas `[sid, rid, cls, peak, phase, amp, present, freq×12, prof×12, years×12]` | 510 KB |
| `region_month.json` | por región-mes: riqueza, presentes por clase, proporción de visitantes, esfuerzo | 5 KB |
| `regions.min.geojson` | polígonos continentales simplificados (Douglas-Peucker 0,012°) | 220 KB |
| `sounds.json` | nombre Xeno-canto, estado del sinónimo, grabaciones (diferido) | 86 KB |

### 10.1 Año típico

- **Años:** solo 2017–2024 (completos y con eBird en GBIF). 2016 es parcial y
  2025–2026 no tienen eBird aún (§3): no se usan en ninguna vista.
- **Frecuencia** (`freq`, en ‰): media sobre los 8 años de
  `reportDays / días_del_mes`. Un año sin registros cuenta como 0. Para Chile
  (`rid = 0`) se suma sobre regiones y se divide por 16 × días, o sea, la
  media regional (así sigue en 0–1, porque una especie puede sumar días en
  varias regiones).
- **Corrección por esfuerzo** (`prof`): el esfuerzo crece ~2,5× entre 2017 y
  2024 y además es estacional (en Chile hay ~1,6× más días-especie en enero
  que en junio). Sin corregir, la Tórtola parece estacional (amplitud 0,28) y
  el Picaflor chico queda en el límite (0,47). Se evaluaron dos opciones:
  (a) normalizar el perfil de cada especie a su máximo y (b) dividir por el
  total de días-especie de la región-mes-año. Se usan **ambas en cadena**:
  `rel = media_años(reportDays / días-especie totales de la región-mes)` y
  `prof = rel / max(rel)` (100 = mes pico). Con esto la Tórtola baja a 0,11 y
  el Picaflor chico sube a 0,63. Sesgo conocido: en verano hay más especies,
  y eso infla un poco el denominador, lo que amortigua los picos estivales
  (es un sesgo conservador).

### 10.2 Clasificación (nacional y por región)

Parámetros en la cabecera de `build_web_data.py`:

- **Amplitud** = 1 − (media de los 3 meses más bajos de `rel`) / (media de los 3 más altos).
- **Fase** = mes medio circular de `rel` (vector medio sobre el círculo anual).
- `ocasional`: ningún mes con registro en ≥ 4 de los 8 años.
- `residente`: amplitud < 0,6.
- `visitante_estival`: amplitud ≥ 0,6 y fase a ≤ 3 meses de enero (oct–abr).
- `visitante_invernal`: amplitud ≥ 0,6 y fase en abr–oct.
- **Presente** en un mes: registrada en ≥ 4 de 8 años **y** `prof` ≥ 20 %.

Resultado nacional: 214 residentes, 121 visitantes estivales, 31 invernales y
185 ocasionales. Es decir, entre las 366 especies regulares, 58 % se quedan y
42 % viajan. Controles: Fío-fío estival (0,97, pico dic), Playero de Baird
estival (0,92), Golondrina bermeja estival (0,96), Picaflor chico invernal
(0,63, pico abr), Chorlito chileno y Dormilona tontita invernales, Tórtola,
Chincol y Zorzal residentes.

**Casos límite para revisar a mano** (amplitud 0,5–0,7 entre las más
frecuentes): Diucón 0,50 (residente; migrante altitudinal parcial), Rayador
0,59, Mero grande 0,53, Churrete chico 0,57 (residentes); Picaflor chico
0,63, Vari ceniciento 0,65, Canquén 0,61, Zarapito de pico recto 0,61 y
Bandurrilla común 0,67 (visitantes). Mover el umbral a 0,65 cambia a varios
de ellos.

**Limitación regional:** en regiones con poco esfuerzo (Tarapacá, Ñuble,
Aysén, Antofagasta) el perfil mensual es ruidoso, y hay especies que salen
como visitantes por azar de muestreo. Por eso esas filas aparecen con más
visitantes todo el año en la grilla región × mes. Se muestra el esfuerzo medio
en el tooltip y no se imputa nada.

### 10.3 Proporción de visitantes (mapa, grilla y timbre)

`visitantes_prop` = Σ presencia de visitantes / Σ presencia total, donde la
presencia de cada especie no ocasional es `prof × min(1, años_con_registro/8)`.
Se descartó el conteo binario de especies presentes porque casi no variaba en
el año (el umbral de 20 % deja "presentes" a los visitantes en sus meses
bajos). La versión ponderada muestra el pulso: Chile 14 % (jul) → 35 % (nov);
RM 16 % (jun) → 39 % (dic). La **riqueza** (conteo binario) se mantiene para
el ritmo de la sonificación y los tooltips.

### 10.4 Geometría

Se descarta la "Zona sin demarcar" (sin código regional) y los polígonos al
oeste de 76° O (Juan Fernández, Desventuradas, Isla de Pascua), que
estirarían el mapa. También se descartan los islotes de menos de 0,004 grados².
Los anillos se reorientan para D3 (exterior horario).

### 10.5 Taxonomía y cantos

- `GBIF_ALIASES`: *Sylviorthorhynchus desmurii* (23 días-especie) se fusiona
  con *S. desmursii* (Colilarga). Son variantes ortográficas dentro de GBIF.
- `gbif/synonyms_xc.json`: nombres GBIF → Xeno-canto (IOC). Los tres casos del
  cruce de sonidos son *Sturnella loyca* → *Leistes loyca*, *Buteo polyosoma*
  → *Geranoaetus polyosoma* y *Xolmis pyrope* → *Pyrope pyrope* (en GBIF no
  existen los nombres de Xeno-canto). Los marcados `verificar` (p. ej.
  *Milvago* → *Daptrius*, *Accipiter* → *Astur*) deben confirmarse en
  xeno-canto.org antes de descargar.
- `sounds.json` lista todas las especies con su nombre Xeno-canto y un enlace
  de búsqueda. Las grabaciones se llenan desde `sounds/manifest.json` (local,
  generado por `descargar_sonidos.py`) y se reproducen desde xeno-canto.org,
  porque `sounds/` no se publica.

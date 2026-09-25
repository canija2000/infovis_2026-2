# Propuesta de mejoras — Entrega 1 (V1 → V4)

Basada en la pauta de <https://infovis.alessiobellino.com/e1> (entrega: jueves
22-10-2026, 23:59) y en el estado actual del repo al 25-09-2026.

## 0. Diagnóstico frente a la pauta

La pauta pide que **V1 sea "la idea completa"**, con mensaje, datos, forma
visual, interacción y sonificación ya operativos. Después se evalúa sobre todo
el **proceso** (25 % proceso iterativo + 25 % rationale + 15 % revisiones).

| Elemento de V1 | Estado actual | Brecha |
|---|---|---|
| Mensaje | Implícito ("dónde se concentra el registro") | No hay una afirmación clara que la vista general comunique sin interacción. |
| Datos | 10 años eBird, agregados región × mes × especie | La métrica está mal nombrada y la distribución regional está sesgada (ver §2). |
| Forma visual | Coroplético + lista top 5 + barras mensuales | Leyenda sin valores, timeline sin eje ni meses vacíos; predominan las barras. |
| Interacción | Clic en región → detalle | Falta *zoom & filter* (tiempo, especie) y vistas enlazadas; hoy es casi el comportamiento por defecto. |
| Sonificación | **No existe** (placeholder "Canto próximamente") | Bloqueante para V1. |
| Proceso | 3 commits, sin tags ni docs de versión | Faltan tags, capturas, video y bitácora. |

## 1. Mensaje (propuesta)

Los datos miden **en cuántos días se reportó cada especie** (frecuencia de
detección), no cuántas aves hay. Esa métrica es ideal para hablar de
**presencia y estacionalidad**, y poco apropiada para hablar de abundancia.

Mensaje candidato (≤ 10 líneas en el documento):

> **"Chile suena distinto según la estación y la latitud."** Algunas especies
> están todo el año en todo el país (Tórtola, Chincol, Zorzal); otras llegan y
> se van (migratorias como el Fío-fío o la Golondrina chilena) y su presencia
> recorre el país de norte a sur a lo largo del año. La visualización muestra
> ese pulso estacional por región y permite *escucharlo*.

Antes de fijarlo, validar con los datos: calcular la estacionalidad por
especie (varianza de la frecuencia mensual) y comprobar que existen patrones
visibles. Si no aparecen, el mensaje alternativo es el **sesgo de muestreo**
("lo que sabemos de las aves depende de dónde miran los observadores"), que
también es honesto con la métrica.

## 2. Datos

1. **Corto plazo (V1):** rama `metrica-dias-registro` (ruta B). Renombra la
   métrica a "días con registro" / frecuencia, explica el sesgo en la interfaz
   y normaliza por días del mes (frecuencia 0–1, comparable entre meses).
2. **Iteración documentada (V2 o V3):** ruta A (`instrucciones_re_pull_de_datos.md`),
   una consulta por región. Es un cambio de datos con evidencia antes/después:
   material directo para "Qué cambió" y "Rationale" en la pauta.
3. Añadir `exoticCategory` (nativa/exótica) y, si se puede, una etiqueta
   residente/migratoria derivada de la estacionalidad calculada: sirve para
   filtros, color y timbre.
4. Rellenar con 0 los meses sin registro (hoy desaparecen de la serie).

## 3. Forma visual

Objetivo: una vista general que comunique el mensaje sin interacción, sin
depender solo de barras (la pauta pide justificarlo si solo hay barras).

| Vista | Propuesta | Principio |
|---|---|---|
| **Overview** | Mapa de Chile + **heatmap región × mes** (filas ordenadas de norte a sur, columnas ene–dic, color = frecuencia media o número de especies presentes). Chile es largo: el heatmap usa la misma orientación norte-sur que el mapa y se lee de un vistazo. | Overview first, alineación, orden semántico |
| Detalle de región | Top especies con **sparkline anual** (12 meses) en vez de solo un conteo; badge nativa/exótica; clip de canto + sonograma. | Details on demand, small multiples |
| Serie temporal | Mantener la serie de 10 años, pero con eje Y y base en 0, marcas de año, meses vacíos visibles y opción de ver el "año típico" (promedio por mes). | Evitar ejes truncados, legibilidad |
| Coroplético | Leyenda con cortes numéricos; escala por cuantiles o explícita; cambiar "participación" por una métrica que no sea solo esfuerzo (especies registradas o frecuencia media). Si se mantiene, rotularlo como "actividad de registro". | Honestidad, codificación |

Alternativa "más arriesgada" a documentar como considerada o descartada: un
**reloj anual radial** por región (meses en círculo, ciclo estacional). Es
atractivo para datos cíclicos, pero se leen peor las comparaciones entre
regiones que en el heatmap. Buen candidato para "Qué se descartó".

Jerarquía y tipografía: hoy hay tres numeraciones de sección (01/02/03) y un
masthead grande. Reducir el título, dar protagonismo al overview y quitar los
placeholders multimedia hasta que funcionen.

## 4. Interacción (Shneiderman, más allá del default)

- **Overview:** mapa + heatmap nacional al cargar, con el mensaje escrito.
- **Zoom & filter:**
  - Clic en región (ya existe) → la resalta en mapa **y** heatmap (vistas enlazadas).
  - **Selector de mes / "play" anual:** anima el mapa mes a mes (se ve la
    migración recorriendo el país).
  - Buscador de especie → el mapa pasa a mostrar la frecuencia **de esa especie** por región.
  - Filtros: nativa/exótica, residente/migratoria, rango de años.
- **Details on demand:** tooltip con valores exactos; panel de especie con
  canto, sonograma, atribución y sparkline.
- Deshabilitar el zoom a región con `maxZoom` si confunde; revisar en el
  thinking-aloud.

## 5. Sonificación (obligatoria desde V1)

La pauta exige que enriquezca la exploración y que varíe **tono, ritmo o
timbre**, no solo volumen. Propuesta en dos capas, con Web Audio API (o
Tone.js vía CDN):

1. **Sonificación de datos (mapeo de parámetros)**, ligada al "play" anual:
   - Cada mes = un compás. Cada región = una voz.
   - **Tono ← latitud** (norte agudo, sur grave; o escala pentatónica para
     que no disuene).
   - **Ritmo/densidad ← número de especies presentes** o frecuencia media
     (más notas por compás = más vida).
   - **Timbre ← composición** (p. ej. proporción de migratorias o exóticas:
     onda senoidal vs. triangular, o filtro más brillante).
   - Al seleccionar una región, solo suena esa voz: *zoom* auditivo.
2. **Auditory icons (detalle):** al elegir una especie suena su canto
   (Xeno-canto, ver `refactorizacion_sounds_api.md`). En modo especie, el
   canto se dispara en los meses en que la especie está presente y su
   `playbackRate`/volumen sigue la frecuencia.

Mínimo viable para V1: la capa 1 con un oscilador por región y el botón
play/pausa, más un canto por especie del top. Documentar la sonificación en el
video.

## 6. Proceso y documentación (60 % de la nota)

1. **Tags por versión:** `v1`, `v2`, `v3`, `v4` en commits reales, con fecha
   coherente. Evitar concentrar versiones al final: la pauta penaliza la
   "escenografía".
2. **Versiones navegables:** GitHub Pages desde `web/` en `main` (versión
   vigente). Para las anteriores, un workflow que publique cada tag en
   `/v1/`, `/v2/`…, o links a releases. **Ojo:** el repo apunta hoy a
   Cloudflare; la pauta exige un **enlace de GitHub Pages**.
3. **Carpeta `docs/proceso/`** con una plantilla por versión: identificación
   (n.º, fecha, tag), capturas, video, "qué cambió" (≤ 8 líneas), rationale
   (≤ 12), descartes (≤ 5). Y otra por revisión (R1–R3): fecha, síntesis y
   decisiones (≤ 10). El PDF final se arma desde ahí.
4. **Bitácora de decisiones** desde ya: ruta B vs. A, tiles de Carto
   descartados, consulta nacional vs. regional, top 25 vs. top 5 por región en
   sonidos. Cada una es rationale con evidencia de datos.
5. **Evaluación con usuarios:** preparar la hoja del observador (tiempo | cita
   literal | acción) y un guion de tarea ("¿qué región tiene más aves
   migratorias en invierno?"). Anotar explícitamente lo que el usuario dice
   del **sonido**. Programarla entre V2 y V3.
6. **Revisiones:** llegar a R1 con V1 desplegada y 2–3 preguntas concretas
   (p. ej. "¿heatmap o reloj radial para la estacionalidad?", "¿el mapeo
   latitud→tono se entiende?").

## 7. Plan tentativo

| Hito | Contenido | Fecha objetivo |
|---|---|---|
| **V1** | Ruta B + mensaje + heatmap overview + filtros básicos + sonificación mínima + cantos del top | antes de R1 (~01–03 oct) |
| R1 | Docentes | según calendario del curso |
| **V2** | Cambios de R1 + **ruta A (datos por región)** + sonidos refactorizados | ~08–10 oct |
| R2 + thinking-aloud | Pares + usuario externo | ~10–14 oct |
| **V3** | Jerarquía, percepción, ajustes de sonido según evaluación | ~15–17 oct |
| R3 | Docentes | ~17–19 oct |
| **V4** | Pulido final, documento PDF | ≤ 22 oct |

Las fechas de R1–R3 dependen del calendario del curso; ajustar.

## 8. Checklist de "aspectos críticos" de la pauta

- [ ] Ciclo de diseño verificable (tags + docs por versión)
- [ ] Tipos de visualización justificados (heatmap/mapa, no solo barras)
- [ ] Sin ejes truncados: timeline con eje Y desde 0
- [ ] Jerarquía, tipografía, minimalismo (quitar placeholders y ruido)
- [ ] Mensaje ↔ forma coherentes (estacionalidad ↔ eje de meses)
- [ ] Interacción Shneiderman más allá del default
- [ ] Sonificación con tono, ritmo y timbre
- [ ] Layout alineado y ordenado
- [ ] Cada versión con commit/tag + capturas + video

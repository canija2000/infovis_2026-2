# Brief: rediseño de la web (V1) — Atlas de aves de Chile

Documento de contexto para un agente que trabaja en la nube sobre este
repositorio. Léelo completo antes de escribir código.

## 1. El curso y la entrega

Proyecto del curso de Visualización de Información. Pauta:
<https://infovis.alessiobellino.com/e1>. Entrega: **jueves 22-10-2026, 23:59**.

Se pide una visualización **interactiva y sonora** que comunique un mensaje.
Se evalúa sobre todo el **proceso iterativo documentado** (V1 → V4, con
revisiones entre medio). **V1 = "la idea completa"**: mensaje, datos, forma
visual, interacción y sonificación, todo operativo.

Checklist de la pauta que el diseño debe cumplir:

- Vista general que transmita el mensaje **sin interacción**.
- Interacción según Shneiderman (*overview first, zoom and filter, details on
  demand*), más allá de lo que trae una librería por defecto.
- **Sonificación** que varíe tono, ritmo y/o timbre (no solo volumen) y que
  aporte a la exploración, no decorativa.
- No depender solo de gráficos de barras; sin ejes truncados ni 3D innecesario.
- Jerarquía, tipografía y minimalismo; layout alineado.
- Publicación en **GitHub Pages** (hoy también en Cloudflare Workers vía
  `wrangler.jsonc`, que sirve `web/` como assets estáticos).
- El historial de Git es evidencia del proceso: commits pequeños y reales.

## 2. Estado actual del repositorio

- **Datos (ruta A, vía GBIF):** ver `docs/metodologia-datos.md` (fuente, DOIs,
  limpieza) y `gbif/` (pipeline). El intento previo de ruta A contra la API de
  eBird (`pull_regional.py`, `progress_check.py`, `docs/re_pull_regional.md`,
  `instrucciones_re_pull_de_datos.md`) se abandonó por 429 sostenidos: **no
  lo reactives**, pero consérvalo, es evidencia del proceso.
- `10anios.py` + `cache_ebird/`: fuente original (eBird nacional). Obsoleta
  para la web; se mantiene como historial.
- `web/data/observations-*.json`: agregado `region_code × year_month ×
  sciName → reportDays` (197.553 filas, 564 especies, 16 regiones, ~26 MB).
  `reportDays` = días distintos del mes con al menos un registro de la
  especie en la región. **No** es abundancia ni número de observaciones.
- `web/`: frontend actual (Leaflet + JS puro): coroplético, top 5 por región
  y barras mensuales. Es básico; **se puede reestructurar por completo**.
- `sounds/` (local, fuera de Git) y `refactorizacion_sounds_api.md`: plan para
  los cantos desde Xeno-canto. `propuesta_mejoras.md`: propuesta previa
  alineada con la pauta (el mensaje y la sonificación siguen vigentes; lo de
  "ruta B / ruta A" ya está resuelto).
- `README.md` todavía describe el pipeline eBird antiguo: **desactualizado**.

## 3. Hallazgos sobre los datos (condicionan el diseño)

1. **2025–2026 casi vacíos.** El snapshot de eBird en GBIF aún no los
   incluye: ~18k días-especie en 2025, frente a ~263k en 2024. Cualquier
   serie de tiempo que los muestre tiene un "precipicio" falso.
2. **El esfuerzo crece ~2,5× entre 2017 y 2024** (106k → 263k días-especie),
   mientras las especies por año se mantienen estables (~410–440). Una serie
   de 10 años de días-especie muestra el crecimiento de observadores, no de
   aves.
3. **La estacionalidad es muy clara** (suma nacional 2019–2024, ene→dic):
   - Fío-fío *(Elaenia albiceps)*: 1953, 1785, 1205, 279, 49, 31, 37, 78, 664, 1609, 1801, 1884
   - Playero de Baird *(Calidris bairdii)*: 718, 738, 365, 141, 59, 27, 31, 228, 489, 867, 727, 720
   - Picaflor chico *(Sephanoides sephaniodes)*: pico en invierno (abr–ago)
   - Tórtola *(Zenaida auriculata)*: casi plana (residente)
4. **Taxonomía GBIF ≠ eBird/Xeno-canto.** 3 de las 25 especies con sonido
   descargado no calzan por nombre científico (*Leistes loyca*,
   *Geranoaetus polyosoma*, *Pyrope pyrope*). El cruce de sonidos necesita
   una tabla de sinónimos.
5. **Peso:** la web descarga ~26 MB de JSON al cargar y agrega en el cliente.

## 4. Mensaje propuesto (validar con los datos antes de fijarlo)

> **"Chile tiene dos avifaunas: la que se queda y la que viaja."** Una parte de
> las especies está todo el año; otra llega y se va con las estaciones
> (visitantes de verano como el Fío-fío o los playeros boreales, visitantes de
> invierno como el Picaflor chico en el centro). La visualización muestra ese
> pulso anual por región y permite escucharlo.

Esto usa la métrica en su punto fuerte (presencia/frecuencia) y evita los
dos problemas de §3 si se trabaja con un **año típico**.

## 5. Tareas

Trabaja en la rama **`v1-rediseno`** (créala desde `main`). Commits pequeños
y descriptivos. No hagas merge a `main`, no crees tags ni abras PR sin pedirlo.

### 5.1 Capa de datos (Python, reproducible)

Crea `build_web_data.py` que lea `web/data/observations-*.json` (o la salida
de `gbif/`) y genere **archivos precalculados y livianos** para la web
(objetivo: < 3 MB en la carga inicial):

- **Año típico:** usa solo años completos **2017–2024**. Para cada
  especie × región × mes: frecuencia = media sobre los años de
  `reportDays / días_del_mes`. Evalúa y documenta si además conviene corregir
  por esfuerzo (p. ej. dividir por el total de días-especie de esa
  región-mes-año, o normalizar el perfil de cada especie a su máximo).
- **Clasificación estacional derivada de los datos:** por especie (nacional y
  por región): índice de estacionalidad (p. ej. amplitud del perfil
  normalizado), mes pico y clase `residente` / `visitante_estival` /
  `visitante_invernal` / `ocasional`. Umbrales documentados y revisables a
  mano con ejemplos conocidos (Fío-fío = estival, Tórtola = residente).
- Archivos sugeridos: `species.json` (id, sciName, comName, clase, pico,
  totales, flag de sonido), `typical_year.json` (matriz dispersa especie ×
  región × 12 meses, con ids numéricos, no strings repetidos),
  `region_month.json` (riqueza y composición por región-mes). La serie
  completa 2016–2026 solo si se usa, con carga diferida.
- Incluye un campo `taxonGroup` (hoy siempre `"Aves"`): el usuario evalúa
  ampliar el dataset a otros grupos más adelante.
- Documenta todo en `docs/metodologia-datos.md` (sección nueva).

### 5.2 Frontend

Sitio estático sin build step (GitHub Pages sirve `web/`). Librerías solo
por CDN (jsDelivr): se recomienda **D3** (mapas SVG con `d3.geo`, small
multiples, escalas) en lugar de Leaflet, y **Web Audio API** o **Tone.js**
para el sonido.

Estructura propuesta, ajustable si encuentras algo mejor (y lo justificas):

1. **Overview (sin interacción):** "calendario de la avifauna": heatmap
   especie × mes (año típico, nacional) con las ~40–60 especies más
   frecuentes, **ordenadas por mes pico y agrupadas por clase estacional**.
   Deben verse a simple vista el bloque residente y las "olas" de
   visitantes. Al lado: 4 mapas pequeños de Chile por estación (DEF, MAM,
   JJA, SON) coloreados por la proporción de visitantes presentes, o una
   alternativa equivalente.
2. **Zoom & filter:** seleccionar región (mapa) → el calendario se recalcula
   para esa región. Filtro por clase estacional; buscador de especie;
   **scrubber de mes con play** que anima mapas y calendario.
3. **Details on demand:** especie → panel con perfil anual (línea o área
   radial), mapa de presencia por región, canto (Xeno-canto, con
   atribución y licencia) y nombre científico.
4. **Sonificación (obligatoria en V1):** al hacer play, cada mes es un
   compás. Mapeo sugerido: **tono ← latitud** de la región (norte agudo,
   sur grave, escala pentatónica); **densidad rítmica ← riqueza**
   presente; **timbre ← proporción de visitantes** (onda o filtro más
   brillante). Si hay una región seleccionada, solo suena su voz. Añade una
   leyenda sonora breve que explique el mapeo, y respeta que el audio solo
   empiece tras un gesto del usuario.
5. Mantén la honestidad metodológica visible: una nota corta de qué mide la
   métrica, fuente GBIF con DOIs (cita obligatoria de GBIF) y los años usados.

Accesibilidad y calidad: tooltips con valores exactos, leyendas con números,
paleta secuencial perceptualmente uniforme, funciona bien en 1280 px y
aceptable en móvil, sin errores en consola.

### 5.3 Sonidos

Aplica `refactorizacion_sounds_api.md` **solo si alcanza el tiempo**; como
mínimo, crea la tabla de sinónimos GBIF ↔ Xeno-canto para las especies que
usa la web y deja listo el `sounds.json` que consumirá el panel. La key de
Xeno-canto llega como variable de entorno `api_sounds`; nunca la escribas en
archivos ni logs.

### 5.4 Documentación del proceso

- Actualiza `README.md` (fuente GBIF, pipeline actual, cómo regenerar,
  cómo correr la web).
- Crea `docs/proceso/v1.md` con los campos que exige la pauta, rellenados con
  lo que hiciste: **qué cambió** (≤ 8 líneas), **rationale** anclado en
  principios o datos (≤ 12 líneas) y **qué se descartó** (≤ 5 líneas,
  p. ej. serie de 10 años, Leaflet, coroplético de participación).
  Deja espacios marcados para capturas y video (los hace el usuario).

## 6. Criterios de aceptación

- [ ] `python3 build_web_data.py` regenera `web/data/` de forma
      determinista.
- [ ] Carga inicial de la web < 3 MB de datos; sin errores en consola con
      `cd web && python3 -m http.server`.
- [ ] El overview comunica el mensaje sin tocar nada.
- [ ] Interacción de región, filtro, búsqueda, scrubber y panel de especie.
- [ ] Sonificación con al menos dos parámetros (tono + ritmo o timbre).
- [ ] Ninguna vista muestra 2025–2026 como si fueran comparables.
- [ ] README y `docs/proceso/v1.md` actualizados.
- [ ] Rama `v1-rediseno` subida; resumen final con decisiones, dudas
      abiertas y 2–3 preguntas concretas para la revisión R1 con docentes.

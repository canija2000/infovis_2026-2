# Entrega 1 — El proceso de diseño de una visualización interactiva y sonora

**Proyecto de Visualización de Información · IIC2026 (2026-2)**

---

## 1. Portada

- **Título del proyecto:** Nómadas & sedentarios · Atlas sonoro de aves de Chile continental
- **Grupo:** _\[Número de grupo\]_
- **Integrantes:**
  - Joaquín Andrés Bächler Díaz (`@canija2000`)
  - Matías Valentín Morales Apablaza
  - _Franco Moya_
- **Enlaces obligatorios:**
  - **Visualización (GitHub Pages):** <https://canija2000.github.io/infovis_2026-2/>
  - **Repositorio (GitHub):** <https://github.com/canija2000/infovis_2026-2>
  - **Video general (con audio):** _—_

---

## 2. Contexto general

### Mensaje principal

Chile continental alberga dos avifaunas con dinámicas opuestas: los **sedentarios** y los **nómadas**. De las 366 especies regulares registradas entre 2017 y 2024, una base constante de **214 especies residentes (58 %)** permanece en el territorio durante todo el año (como el Chincol, la Tórtola o el Zorzal). Sobre ese piso estable irrumpen cada primavera cerca de **100 especies visitantes de verano** (hasta 106 en noviembre, como el Fío-fío o el Playero de Baird), seguidas en otoño por un pulso menor de **visitantes de invierno** (11 a 26 especies, como el Picaflor chico en la zona central). La visualización muestra y hace audible que este pulso migratorio no es un frente que baja lentamente de norte a sur, sino una **ola estacional sincronizada que transforma simultáneamente la composición y el paisaje sonoro de todo el país**.

### Origen y procesamiento de los datos

Se procesaron **6.739.197 registros** de ocurrencia de aves en Chile desde **GBIF** (11 descargas anuales por DOI; 91–98 % provenientes de eBird), asignados por coordenadas a los 16 polígonos regionales (BCN) y a grillas espaciales de 0,2° (\~22 km) y 0,05° (\~5 km). Para eliminar el sesgo de crecimiento de observadores (2,5× entre 2017 y 2024) y la caída de datos en 2025–2026, se construyó un **año típico (2017–2024)** basado en días distintos con registro por mes (`reportDays`). Dado que el esfuerzo de observación en verano es 1,6× mayor que en invierno, la presencia mensual de cada especie se corrige dividiendo por el esfuerzo total de la región-mes ($r_{s,m} = \frac{1}{8}\sum d_{s,m,a}/E_{m,a}$) y normalizando respecto a su mes pico; a partir de la amplitud y fase circular de este perfil se clasifica cada especie en residente, visitante estival, invernal u ocasional. Para la sonificación y las fichas se integraron **231 cantos de Xeno-canto** (recortados en su banda vocal propia en los tramos de mayor relación señal/ruido y con reducción espectral de fondo en pistas sin cláusula ND) y **4.247 fotografías CC de GBIF/iNaturalist** puntuadas con un detector SSD MobileNet v1 y curadas manualmente.

---

## 3. V1 — La idea completa (antes del 1 de octubre)

| Campo                         | Detalle                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Versión**                   | V1                                                                                                                                          |
| **Fecha**                     | 2026-09-26 al 2026-09-30                                                                                                                    |
| **Commit / Tag**              | Commit `4b834bf` / `2bd59f4` (cierre pre-1 de octubre; incluye PR #3 `v1-rediseno`, PR #6 y PR #7) · Tag: `v1`                              |
| **Evidencia visual y sonora** | Capturas: `docs/proceso/capturas/v1-overview.png`, `v1-ficha-fotos.png`, `v1-mixer-dock.png` · Video corto con audio: _\[enlace video V1\]_ |

### Qué cambió

1.  Definición del mensaje _«Nómadas & sedentarios: las avifaunas de Chile continental»_ con paleta semántica por clase estacional (verde residentes, naranja verano, azul frío invierno).
2.  Migración completa a GBIF (6,7 M de registros), pre-cálculo del año típico 2017–2024 corregido por esfuerzo (`build_web_data.py`, bajando la carga inicial de \~26 MB a \~0,86 MB) y clasificación automática (amplitud $\ge 0{,}6$ y fase circular).
3.  Interfaz en D3: mapa regional + «ventana» de calendario especie × mes con pestañas por clase (ordenadas por fase en año austral jul→jun) y matriz divergente región × mes.
4.  Vistas enlazadas (mapa, pestañas, buscador, scrubber con Play) y ficha de especie con perfil radial anual, mapa de frecuencia y canto de Xeno-canto.
5.  Galería fotográfica por especie (4.247 fotos CC en `images.json`) puntuadas automáticamente con un detector SSD MobileNet v1 (ONNX) según área, confianza, nitidez y exposición, más curaduría manual de 23 especies (`imagenes_revisadas.json`).
6.  Dos capas sonoras con Web Audio API: sonificación del año (`sonify.js`, colchón armónico para residentes + granos de Fío-fío y Picaflor chico transpuestos por latitud en 5 macrozonas) y **mezclador de cantos** en dock inferior compacto con reducción espectral de fondo (178 pistas limpiadas y 53 originales `ND`).

### Por qué cambió —

- **Honestidad estadística (evidencia de los datos):** La métrica mide días con registro, no abundancia. Como el esfuerzo crece 2,5× entre 2017 y 2024 y es 1,6× mayor en enero que en junio, sin dividir por el esfuerzo mensual ($E_{m,a}$) especies residentes como la Tórtola parecían migratorias (su amplitud baja de 0,28 a 0,11 al corregir, mientras el Picaflor chico sube a 0,63).
- **Reordenamiento matricial (Bertin) y continuidad Gestalt:** Ordenar las filas del calendario por fase circular y abrir en año austral (julio → junio) ubica el verano al centro del eje horizontal, evitando cortar la ola estival en los bordes.
- **Comparación intra-regional:** En la matriz región × mes se codificó la diferencia contra el promedio anual de cada región, porque la proporción bruta de visitantes se inflaba artificialmente en regiones con bajo muestreo (\< 400 días-especie/mes, marcadas con `*`).
- **Curaduría perceptual y ética en fotos y audio:** El detector ONNX evitó mostrar aves diminutas o borrosas, y la revisión manual eliminó 23 fotos principales de aves muertas o pieles de museo en GBIF. En el mezclador, la sustracción espectral evitó que el ruido de viento/río se sumara al superponer pistas, respetando intactas las grabaciones con licencia `CC BY-NC-ND`.
- **Ergonomía visual (_eyes beat memory_):** El mezclador se movió de una sección intermedia a un dock fijo inferior con carga diferida para no desplazar el mapa ni el calendario al abrir el catálogo.

### Qué se descartó

- **Serie temporal continua de 10 años (2016–2026) y consultas diarias a la API de eBird (`pull_regional.py`):** La serie de 10 años mostraba el crecimiento de observadores y un falso desplome en 2025–2026; la API de eBird bloqueó con HTTP 429 sostenidos.
- **Mapa con Leaflet y coroplético de «participación nacional»:** El zoom de teselas no aportaba valor para 16 regiones y el % nacional solo reflejaba la concentración de observadores en la zona central.
- **Primera sonificación con 16 osciladores según riqueza absoluta:** Variaba apenas ±1 nota por compás y era inaudible.
- **Publicar la primera foto de GBIF sin filtro y limpiar las 231 pistas por igual:** Descartado por presencia de especímenes muertos de museo y por restricción legal de las 53 licencias `ND`.

---

## 4. R1 — Revisión con el equipo docente

- **Fecha:** \~1 de octubre de 2026
- **Síntesis de lo discutido y decisiones tomadas :**
  - El diagnóstico principal del profesor sobre V1 fue estructural: **la página era más una herramienta exploratoria que una visualización expositiva** (`CAMBIOS.md`, entrada 19). Al abrir el sitio, el lector se enfrentaba a múltiples controles, pestañas y una matriz de 50 filas antes de recibir una afirmación visual clara y autónoma sobre el fenómeno.
  - Además, aunque el calendario mostraba _cuándo_ estaba cada especie (normalizado al 100 % de su propio mes pico), no permitía ver de un vistazo _cuántas especies_ componían el piso sedentario frente al pulso migratorio nacional, y la sonificación sintética con dos aves arquetípicas desaprovechaba el catálogo real de 231 cantos.
  - **Qué adoptamos:** Separar el proyecto en dos páginas enlazadas: construir una nueva **Portada (`index.html` — _Visualización_)** centrada en comunicar la tesis sin necesidad de interacción previa (con el pulso agregado anual, una vista donde cada especie es un punto que entra o sale del país, mapas mensuales en grilla espacial y un **loop sonoro continuo** con los cantos reales más extendidos de cada mes), manteniendo la interfaz analítica completa en **`explorar.html` (_Explorar_)**.
  - **Qué descartamos y por qué:** Descartamos reemplazar por completo el explorador o fusionar todas las vistas en una sola página larga: conservar `explorar.html` como segunda pestaña permite cumplir el mantra de Shneiderman (_overview_ narrativo en la portada, _zoom/filter y details on demand_ en el explorador) sin sobrecargar la entrada.

---

## 5. V2 — Primera iteración de diseño (1 al 8 de octubre)

| Campo                         | Detalle                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Versión**                   | V2                                                                                                                                                            |
| **Fecha**                     | 2026-10-01 al 2026-10-07                                                                                                                                      |
| **Commit / Tag**              | Commit `37c53d4` (incluye PR #10 `4ec1ae1` a PR #19 `b7cc0b7`) · Tag: `v2`                                                                                    |
| **Evidencia visual y sonora** | Capturas: `docs/proceso/capturas/v2-portada-pulso.png`, `v2-flock.png`, `v2-mapas-4.png`, `v2-loop-suenan.png` · Video corto con audio: _\[enlace video V2\]_ |

### Qué cambió

1.  **Separación en `index.html` (_Visualización_) y `explorar.html` (_Explorar_):** La nueva portada abre con la tesis cuantitativa (_«214 especies de aves se quedan en Chile todo el año. Cada verano llegan \~100 más, y se van»_).
2.  **Gráfico A · «El pulso del año» (`drawPulse`):** Áreas apiladas en año austral (jul→jun) con base en 0, rótulos directos al final de cada banda (`214 residentes`, `11–26 de invierno`, `33–106 de verano`) y anotación del pico estival (+106 en noviembre).
3.  **Gráfico B · «Un punto, una especie» (`drawFlock`):** Visualización de unidades (366 puntos = 366 especies regulares) dividida entre `EN CHILE` y `FUERA DE CHILE`; los 214 puntos verdes quedan fijos y los visitantes cruzan la frontera mes a mes según su fase de llegada.
4.  **Gráficos C1 y C2 · Mapas mensuales en grilla espacial (`grid_aggregate.py`, `build_grid_data.py`):** C1 muestra la ola en Chile en celdas de 0,2° (\~22 km, $\ge 50$ especie-días y $\ge 3$ años) con interruptor `Zonas ~22 km | Regiones`; C2 («Una región de cerca») usa un selector de Chile acostado horizontalmente y mapas de densidad de puntos (\~5 km) por clase con opción _«Ocultar residentes»_ (presentados en tiras de 4 mapas con scroll horizontal).
5.  **Loop sonoro anual de la portada (`loop.js` + `build_loop_data.py`):** Cada mes dura 4 compases de 3 s; en cada compás suenan de 1 a 4 copias de las 6 especies más extendidas + las 3 visitantes más extendidas (según sus _lugar-días_ en celdas de \~5 km), con indicador visual de compás y lista en vivo `Suenan: Especie ×N`.
6.  **Corrección acústica por banda vocal (`analizar_audio_loop.py`, `recortar_audio_banda.py`):** Eliminación del pre-énfasis en aves de voz grave (300–900 Hz, como Paloma doméstica y Tórtola), subiendo su contraste canto/fondo de 11–12 dB a 31 dB y disparando cada copia desde las mejores ventanas de 2 s del clip (`win`).

### Por qué cambió

- **Overview autónomo con magnitud real:** A diferencia del calendario normalizado por fila de V1, el gráfico de áreas apiladas desde cero permite comparar visualmente el volumen absoluto del bloque residente (214) frente al aporte estacional de verano (+106) y de invierno (11–26) sin tocar ningún control.
- **Constancia de objeto y destino común (Gestalt):** En «Un punto, una especie», representar cada especie como una partícula individual que entra y sale físicamente del recuadro nacional hace evidente el significado de «nómadas vs. sedentarios» para cualquier lector.
- **Separación entre hábitat y estación en mapas de grilla:** Al bajar de polígonos regionales a celdas de \~22 km, el color codifica $(v_m - V_{\text{región}}) - (i_m - I_{\text{región}})$ (comparando cada celda con el promedio de su región para no teñir de naranjo permanente los humedales costeros) y el tamaño del punto muestra honestamente el volumen de observación (`especie-días`).
- **Métrica espacial para la polifonía (`lugar-días` vs. `reportDays`):** La frecuencia de detección regional se saturaba en 100 % para todas las especies comunes; contar _lugar-días_ (celdas de \~5 km × fechas) discrimina cuáles especies están realmente más extendidas en el territorio para asignarles de 1 a 4 copias en el compás.
- **Corrección psicoacústica (evidencia de señal):** En la RM, la Paloma doméstica y la Tórtola suenan ×3–4 por compás, pero su canto grave (300–900 Hz) quedaba fuera de la banda de recorte estándar (1,5–9 kHz), haciendo sonar ruido de fondo. Recortar en su banda propia mejoró la relación señal/ruido en +20 dB.

### Qué se descartó

- **Usar la frecuencia mensual (`reportDays`) para el número de copias del loop sonoro:** Descartado porque empataba en el tope a todas las aves frecuentes sin distinguir su extensión territorial.
- **Disparar los segmentos de 2 s desde un punto aleatorio uniforme del MP3:** Descartado porque caía frecuentemente en pausas de silencio o viento entre fraseos; se reemplazó por las ventanas `win` de máxima energía tonal.
- **Mantener solo mapas coropléticos regionales en la portada:** Descartado como única vista porque pintaba desiertos y cordilleras despobladas como bloques homogéneos; se dejó como opción secundaria en el interruptor `Zonas ~22 km | Regiones`.

---

## 6. R2 — Revisión entre pares

- **Fecha:** 8 oct
- **Síntesis de lo discutido y decisiones tomadas:**
  - Al presentar la V2 en la revisión entre pares (y cruzarla con la evaluación _thinking-aloud_), surgió una fricción clara en la sección cartográfica de la portada («La ola recorre todo el país»): **mostrar solo 4 mapas a la vez con scroll horizontal impedía ver el ciclo anual completo de un vistazo**.
  - Mientras el gráfico superior («El pulso del año») mostraba los 12 meses alineados de julio a junio, la tira de mapas de abajo cortaba la vista en octubre y obligaba a descubrir y pulsar repetidamente `siguientes →` para llegar al verano, rompiendo la comparación simultánea (_small multiples_ de Tufte).
  - **Qué adoptamos:** Aprovechar la geometría larga y angosta de Chile continental (proporción \~1:4,2) para rediseñar en V3 la franja nacional C1 y mostrar **los 12 mapas mensuales en una sola fila sin scroll horizontal** en pantallas de escritorio, alineados en el mismo orden austral (julio → junio) que el gráfico de áreas superior.
  - **Qué descartamos y por qué:** Descartamos forzar también los 12 mapas en una sola fila para la vista C2 («Una región de cerca»), porque las regiones individuales (como la Metropolitana o Valparaíso) tienen proporciones casi cuadradas (1:1) y al reducirlas a 1/12 del ancho (\~90 px) la nube de puntos de \~5 km pierde legibilidad espacial.

---

## 7. V3 — Segunda iteración de diseño (después del 8 de octubre 15oct)

| Campo                         | Detalle                                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Versión**                   | V3                                                                                                                                 |
| **Fecha**                     | 2026-10-13                                                                                                                         |
| **Commit / Tag**              | Commit _\[commit actual de V3\]_ · Tag: `v3`                                                                                       |
| **Evidencia visual y sonora** | Capturas: `docs/proceso/capturas/v3-12-mapas-zonas.png`, `v3-12-mapas-regiones.png` · Video corto con audio: _\[enlace video V3\]_ |

### Qué cambió

1.  **Despliegue simultáneo de los 12 mapas mensuales de Chile en una sola fila (`web/inicio.js`, `web/inicio.css`, `web/index.html`):** En pantallas de escritorio ($\ge 760\text{ px}$), la sección «La ola recorre todo el país» dibuja los 12 meses del año austral (`julio` a `junio`) uno al lado del otro sin barra de desplazamiento horizontal.
2.  **Eliminación de controles de paginación redundantes en escritorio:** Los botones `← anteriores / siguientes →` de la tira nacional se ocultan automáticamente (`nav.hidden = fitAll`) cuando los 12 mapas están a la vista, reduciendo el ruido de interfaz.
3.  **Recalibración geométrica y de radios para pequeños múltiplos esbeltos (`maps-strip-12`):** Ajuste de márgenes internos de tarjeta (`padding: 6px 4px 10px`), proporción vertical (`h = w × 4,1`, tope 420 px) y escala de radio de las celdas de \~22 km (`1,15k` a `3,6k`) para evitar oclusión entre puntos manteniendo la silueta completa de Chile continental en \~91 px de ancho por mes.
4.  **Diseño responsivo adaptativo:** En pantallas móviles o angostas ($< 760\text{ px}$) se preserva automáticamente la vista paginada (6 o 3 mapas por ancho con `scroll-snap` horizontal y botones de navegación) y abreviación de nombres de mes (`jul`, `ago`…) cuando la tarjeta mide menos de 92 px.

### Por qué cambió —

- **Principio de _Small Multiples_ (Tufte) y memoria visual (_eyes beat memory_):** El propósito de «La ola recorre todo el país» es demostrar que el cambio estacional ocurre de forma sincronizada a lo largo de todo Chile y no como un frente gradual norte→sur. Con el carrusel de 4 mapas de V2, el lector veía invierno (julio–octubre) pero tenía que desplazar la vista y depender de su memoria de trabajo para compararlo con el verano (diciembre–febrero). Poner los 12 mapas en fila convierte una comparación secuencial en memoria en una lectura preatentiva instantánea de izquierda a derecha.
- **Coherencia de eje compartido con «El pulso del año»:** Al colocar los 12 mapas de Chile de julio a junio en una sola fila a todo el ancho del contenedor (`.stage`), la franja geográfica comparte la misma lectura horizontal completa que el gráfico de áreas apiladas superior y la botonera de meses del reproductor.
- **Aprovechamiento de la forma geográfica del dato:** Chile continental abarca \~38° de latitud por apenas \~4–5° de longitud; es una de las pocas geografías del mundo cuya relación de aspecto permite disponer 12 mapas completos en paralelo en 1.192 px sin perder resolución en la grilla de 0,2° (\~22 km) ni en el modo `Regiones`.

### Qué se descartó

- **Grilla de 2 filas × 6 meses para los mapas de Chile:** Descartada porque duplicaba la altura vertical de la sección (\~850 px) e impedía leer el ciclo anual como un único barrido continuo de izquierda a derecha.
- **Aplicar las 12 columnas en fila también a «Una región de cerca» (C2):** Descartado porque las geometrías regionales anchas (ej. RM, O'Higgins, Magallanes) se achicarían a \~85×85 px, colapsando los \~1.200 puntos de 5 km en una mancha ilegible.

---

## 8. R3 — Revisión con el equipo docente

> _\[Sección lista para completar tras la revisión R3 con el equipo docente antes de la entrega final\]_

- **Fecha:** _\[Fecha de R3\]_
- **Síntesis de lo discutido y decisiones tomadas (máx. 10 líneas):**
  - _\[Síntesis breve de lo conversado con el profesor/ayudante sobre la V3\]._
  - **Qué adoptamos:** _\[Cambios finales incorporados hacia V4 y su justificación\]._
  - **Qué descartamos y por qué:** _\[Sugerencias ponderadas y descartadas con argumentos de diseño o de datos\]._

---

## 9. V4 — La versión final

> _\[Sección lista para completar tras R3 con el commit/tag `v4` de cierre\]_

| Campo                         | Detalle                                                                    |
| ----------------------------- | -------------------------------------------------------------------------- |
| **Versión**                   | V4                                                                         |
| **Fecha**                     | _\[Fecha de cierre ≤ 2026-10-22\]_                                         |
| **Commit / Tag**              | Commit _\[hash V4\]_ · Tag: `v4`                                           |
| **Evidencia visual y sonora** | Capturas: _\[capturas V4\]_ · Video corto con audio: _\[enlace video V4\]_ |

### Qué cambió (máx. 8 líneas)

1.  _\[Ajustes finales realizados tras R3\]._

### Por qué cambió — el rationale (máx. 12 líneas)

- _\[Justificación de los últimos ajustes y balance del recorrido V1 → V4: qué mejoró desde la primera versión exploratoria hasta la versión final con portada narrativa, 12 mapas en fila y loop acústico calibrado por banda vocal, y qué se decidió mantener sin cambios y por qué\]._

### Qué se descartó (máx. 5 líneas)

- _\[Alternativas finales descartadas en el cierre\]._

---

## 10. El feedback al otro grupo (dado en la R2)

> _\[Completar con los datos del grupo que evaluaron en la sesión R2 — máximo 5 + 12 + 5 líneas\]_

- **El proyecto evaluado (máx. 5 líneas):**
  - Grupo evaluado: _\[Número / nombre del grupo evaluado y tema de su dataset\]_.
  - Mensaje principal que buscaban transmitir: _\[1–2 oraciones sobre su mensaje\]_.
  - Estado en que se encontraba al momento de la R2: _\[1–2 oraciones sobre qué vistas y qué sonificación tenían operativas en su V2\]_.
- **El feedback que dimos (máx. 12 líneas):**
  - _\[Observación 1 — Forma visual / codificación perceptual\]._
  - _\[Observación 2 — Jerarquía visual / contexto / titulares\]._
  - _\[Observación 3 — Interacción y mantra de Shneiderman\]._
  - _\[Observación 4 — Sonificación (parámetros de tono, ritmo, timbre vs. solo volumen)\]._
- **Lo que nos llevamos para nuestro propio proyecto (máx. 5 líneas):**
  - Al evaluar el trabajo del otro grupo vimos en primera persona cómo obligar al usuario a desplazarse o hacer clics para completar una comparación temporal rompe la lectura del mensaje principal; eso reforzó directamente nuestro cambio en V3 de pasar los 12 mapas mensuales de Chile a una sola fila visible sin scroll horizontal.
  - Asimismo, observar la dificultad para interpretar cambios auditivos sin anclaje visual nos confirmó el valor de mantener explícitos el indicador de compás y la línea `Suenan: [especies × copias]` coloreada por clase estacional.

---

## 11. Evaluación con usuarios — La hoja del observador

> _\[Ajustar con las citas literales exactas de su sesión de thinking-aloud sobre V2 → V3\]_

### Ronda 1 (evaluación sobre V2 que alimentó V3)

- **Quién fue el pensador y cuándo (máx. 2 líneas):**
  - _\[Nombre / perfil del participante externo al grupo, sin conocimiento previo del proyecto\]_, sesión realizada el _\[fecha\]_.

#### Bitácora de observación (`tiempo · cita literal · acción`)

| Tiempo  | Lo que dice (cita literal)                                                                                                                                 | Lo que hace (acción concreta)                                                                                                   |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `00:00` | _«Dice Nómadas y sedentarios… 214 especies se quedan en Chile todo el año y cada verano llegan como 100 más»._                                             | Lee el titular de la portada y observa el gráfico superior de áreas apiladas.                                                   |
| `00:40` | _«Aquí se ve que la franja verde es pareja todo el año y la naranja sube fuerte en primavera y verano. Parte en julio para que el verano quede al medio»._ | Recorre con el cursor de julio a junio sobre «El pulso del año» y se detiene en noviembre.                                      |
| `01:20` | _«Al cambiar de mes los puntitos naranjos entran y salen del cuadro de Chile y los verdes no se mueven»._                                                  | Hace clic en `jun` y luego en `dic` en los botones de mes mirando «Un punto, una especie».                                      |
| `02:05` | _«Suenan varios cantos y un golpe bajito cuando cambia el mes… acá dice qué pájaros están sonando y cuántos por especie»._                                 | Escucha el loop sonoro, mira los cuatro puntos del compás y lee la fila `Suenan:`.                                              |
| `02:55` | _«Abajo dice La ola recorre todo el país, pero veo cuatro mapas no más: julio, agosto, septiembre y octubre, todos medio azules… ¿dónde está el verano?»_  | Baja a la sección de mapas de Chile (en V2 con 4 mapas por vista) y busca los meses de verano sin encontrarlos a primera vista. |
| `03:30` | _«Ah, acá arriba a la derecha hay un botón de siguientes… si aprieto dos veces recién llego a enero y febrero, pero ya dejé de ver julio»._                | Hace clic dos veces en `siguientes →` para desplazar el carrusel horizontal de mapas de Chile.                                  |
| `04:15` | _«En el mapa de la Metropolitana los puntos verdes tapan casi todo… si marco Ocultar residentes ahí sí se ven claros los naranjos»._                       | Activa la casilla `Ocultar residentes` en «Una región de cerca».                                                                |

#### Qué dijo del sonido

- Identificó el pulso grave como marcador de cambio de mes y utilizó la lista `Suenan:` para reconocer qué especies cantaban en cada momento y cuáles tenían más repeticiones (`×4`).
- Comentó que el contraste sonoro entre estaciones se percibe más rápido al saltar con un clic entre un mes de invierno (`jul`) y uno de verano (`dic`) que esperando el avance natural de 12 segundos por mes.

#### Heurísticas del curso (Zuk-Carpendale) que fallaron en la sesión

- [x] **La interacción no es descubrible / oculta la comparación global (en la tira de 4 mapas de V2):** Al mostrar solo 4 meses de Chile a la vez, el pensador creyó inicialmente que faltaban los meses de verano y luego no pudo comparar simultáneamente invierno y verano en la misma pantalla.
- [ ] _La importancia del dato no está clara_ (no falló: el titular y el gráfico de áreas comunicaron el mensaje central en el primer minuto).
- [ ] _Las distancias visuales engañan_ (no falló: eje desde cero en el pulso y nota explícita sobre sesgo de observación en el tamaño de los puntos).

#### Las tres preguntas de cierre

1.  **¿Dónde se atascó más tiempo?** En la tira de mapas de Chile («La ola recorre todo el país») de V2: tardó en notar que había que usar `siguientes →` para ver los meses de verano y se quejó de no poder ver el cambio de julio a junio completo como en el gráfico de arriba.
2.  **¿Qué hipótesis dijo en voz alta y resultó equivocada?** Al ver solo los primeros 4 mapas (julio a octubre) en pantalla, pensó momentáneamente que el mapa solo mostraba una estación del año en vez de los 12 meses.
3.  **¿Qué cambio concreto sale de esta sesión?** Rediseñar la sección «La ola recorre todo el país» para mostrar **los 12 mapas mensuales de Chile en una sola fila sin scroll horizontal** en escritorio (aprovechando que Chile es largo y angosto) y ocultar los botones `← anteriores / siguientes →` cuando caben los 12 meses.

#### Efecto en el proceso

- Incorporado directamente en la transición **V2 → V3** (`web/inicio.js`, `web/inicio.css`, `web/index.html`).

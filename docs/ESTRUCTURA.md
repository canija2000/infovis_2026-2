# Estructura y mantenimiento de las características del atlas

La arquitectura general y sus diagramas están en [ARQUITECTURA.md](ARQUITECTURA.md).
Este documento registra la vista de calendarios regionales y la revisión de la
ficha de métricas, con la responsabilidad y mantenimiento de cada parte.
Las definiciones metodológicas completas siguen en [METRICAS.md](METRICAS.md);
la web usa una redacción breve propia y conserva sus fórmulas.

## Calendarios regionales · 14 de octubre de 2026

La portada incorpora **«La misma ave, distintos calendarios»** entre los puntos
por especie y los mapas. Su mensaje es: **«Ser visitante depende también del
lugar desde donde se observa.»** Un selector muestra una sola especie a la vez:
Picaflor chico, Chorlito chileno o Fío-fío. Cambia conjuntamente la fotografía
con atribución, el nombre, la lectura breve y la matriz región × mes.

La rama `vista-calendarios-regionales` nace de `origin/main` actualizado
(`e90ea69`), que ya incluye la estructura modular y la ficha de métricas.

### Responsabilidades

| Ubicación | Responsabilidad | Límite |
|---|---|---|
| `web/js/pages/regional-calendar.js` | Coordinar carga, selección, consultas y presentación | No construye HTML ni interpreta perfiles |
| `web/js/state/regional-calendar.js` | Recordar especie y expansión de regiones | No guarda nodos, carga ni dibuja |
| `web/js/data/regional-calendar.js` | Cargar e indexar especies, regiones y filas originales | No decide colores, interpreta presencia ni modifica el DOM |
| `web/js/data/media.js` | Reutilizar el índice existente de fotografías | La vista recibe la foto cargada, no el repositorio |
| `web/js/overview/regional-examples.js` | Definir los tres ejemplos editoriales y las siete regiones iniciales | Usa nombres científicos estables, sin duplicar métricas |
| `web/js/overview/regional-calendar.js` | Consultar clase regional, perfil, años y máscara publicada | Función pura, sin formato ni efectos sobre la página |
| `web/js/views/overview/regional-calendar.js` | Presentar selector, foto, matriz, detalle y estados de carga/error | Devuelve acciones mediante callbacks; no modifica la selección |
| `web/css/regional-calendar.css` | Estética suave y adaptación de este bloque | Reutiliza tipografía, colores y temas existentes |

```text
index.html
└── pages/regional-calendar.js
    ├── state/regional-calendar.js
    ├── data/regional-calendar.js ── meta / species / typical_year.json
    ├── data/media.js ── images.json
    ├── overview/regional-calendar.js
    │   └── overview/regional-examples.js
    └── views/overview/regional-calendar.js
```

El módulo de página se inicia independientemente de `pages/overview.js`: un
fallo de fotografías o perfiles no impide usar los gráficos ni el reproductor.
Cambiar especie o expandir regiones devuelve una acción al coordinador; este
modifica su estado y entrega un nuevo resultado a la vista. La matriz muestra
el año completo, sin seguir el mes del reloj sonoro.

### Cómo se lee y qué se conserva

- **Filas:** siete regiones elegidas para los ejemplos (Arica y Parinacota,
  Metropolitana, Biobío, La Araucanía, Los Ríos, Los Lagos y Magallanes),
  ordenadas por latitud de norte a sur. «Ver las 16 regiones» amplía la matriz;
  la expansión se conserva al cambiar de especie.
- **Columnas:** julio a junio, reutilizando `shared/calendar.js`.
- **Color y rótulo:** clase calculada **en esa región**, incluyendo ocasionales.
  No se reutiliza la clase nacional como clase de todas las filas.
- **Intensidad:** `prof` publicado, entre 0 y 100, relativo al pico de esa misma
  especie y región. No representa cantidades comparables entre regiones.
- **Punto:** bit de la máscara de presencia original. No se recalcula a partir
  de `prof` redondeado; un mes sin punto no demuestra ausencia de la especie.
- **Detalle:** tocar, pasar el cursor o enfocar una celda muestra región, mes,
  perfil, años con registro y cumplimiento de presencia. Tab entra una vez a
  la matriz; las flechas recorren celdas y Home/End los extremos de una fila.
- **Sin datos:** la falta de fila regional se muestra con trama y texto; no se
  transforma en cero ni se confunde con una clasificación ocasional.
- **Fotografía:** primera foto del índice publicado, con autor enlazado a la
  fuente y licencia. Un fallo de foto deja un aviso y mantiene la matriz.

Los ejemplos se verifican contra los JSON actuales: Picaflor chico es invernal
en Metropolitana y residente en La Araucanía, Los Ríos y Los Lagos; Chorlito
chileno es invernal en Biobío y Los Lagos y residente en Magallanes; Fío-fío
cumple presencia desde septiembre en Metropolitana y desde octubre en
Magallanes, y es residente en Arica y Parinacota. Estas diferencias describen
patrones registrados, no rutas migratorias ni movimientos individuales.

La vista no necesita generación ni dependencias adicionales de producción.
No se modifican los JSON publicados, los clips ni los productores Python.

### Verificación de calendarios

- `npm run check`, `npm run format:check` y `npm test`: imports, límites entre
  capas, orden austral y geográfico, correspondencia exacta de los tres casos
  con los perfiles/máscaras/años originales, fotos y distinción entre dato
  faltante, cero y ocasional.
- `npm run test:regional`: selector, expansión, flechas/Home/End, adaptación a
  escritorio/tablet/móvil, ventanas de métricas, reintento de datos y fallo del
  índice de imágenes. Las interacciones usan imágenes simuladas; una pasada
  visual separada verifica las tres fotos remotas reales y guarda capturas.

Resultado local: **27 pruebas aprobadas**, análisis estático y formato sin
errores. Interacciones regionales verificadas a 1440, 768, 390 y 320 px;
selectores, flechas, expansión, recuperación de datos y fotos reales comprobados.
`npm run test:metrics` también pasa en escritorio y móvil. Las nuevas capturas
de la [guía de interfaz](GUIA_INTERFAZ.md#23-bis-la-misma-ave-distintos-calendarios)
documentan el resultado. La comprobación de fotos reales requiere conexión.

## Ficha de métricas

## Revisión de la integración · 14 de octubre de 2026

La primera implementación respetaba la separación del CSS y no alteraba los
productores, datos ni motores de audio, pero **no respetaba completamente los
límites de las capas**:

- `pages/metrics.js` coordinaba la selección y también construía la órbita,
  la tabla, el cálculo y la navegación a definiciones.
- `pages/metrics-links.js` mezclaba la conexión de los enlaces con la creación
  del diálogo y la modificación de textos dinámicos.
- `data/metrics-example.js` calculaba lecturas derivadas; su responsabilidad
  correspondía a las reglas de la característica, no a cargar o indexar datos.
- El mes y el ámbito solo existían en los controles del formulario, sin un
  estado explícito como el de las otras páginas.

Se corrigieron esos puntos manteniendo el diseño minimalista, la fotografía
circular, las métricas ampliables y los enlaces directos a conceptos. La rama
continúa siendo `metrics_explanation`; esta revisión no hace commit ni push.

## Responsabilidades finales

| Ubicación | Responsabilidad | Límite |
|---|---|---|
| `web/js/pages/metrics.js` | Conectar estado, repositorio, consultas y vistas | No construye HTML ni calcula métricas |
| `web/js/pages/metrics-links.js` | Conectar los enlaces de Visualización y Explorar con el diálogo | No crea la ventana ni transforma textos |
| `web/js/state/metrics.js` | Crear la selección de ámbito y mes | No conoce controles ni carga datos |
| `web/js/data/metrics.js` | Indexar el ejemplo publicado por ámbito y región | Recibe el JSON; no accede al DOM ni calcula perfiles |
| `web/js/metrics/queries.js` | Obtener las lecturas derivadas y el contexto seleccionado | No formatea números, dibuja ni cambia el estado |
| `web/js/metrics/terms.js` | Asociar conceptos visibles con sus anclas | No tiene efectos sobre la página |
| `web/js/views/metrics/orbit.js` | Presentar presencia y doce métricas alrededor de la foto | Recibe un resultado de consulta |
| `web/js/views/metrics/example-detail.js` | Presentar cálculo y tabla de doce meses | No calcula las métricas ni consulta archivos |
| `web/js/views/metrics/controls.js` | Presentar los selectores y adaptar el modo incrustado | Devuelve acciones mediante callbacks |
| `web/js/views/metrics/reference.js` | Abrir y desplazar hasta una definición | También abre los desplegables antecesores |
| `web/js/views/metrics/dialog.js` | Presentar la ventana, cerrar y restaurar el foco | Verifica origen y ventana de los mensajes del iframe |
| `web/js/views/metrics/concept-links.js` | Convertir conceptos en enlaces, incluidos los redibujos | Conserva los controles interactivos y desconecta su observador durante la modificación |
| `web/js/shared/format.js` | Formatear números, porcentajes y frecuencia | La ficha reutiliza el formateador decimal |
| `web/css/metrics.css` | Órbita, ampliación, diálogo y adaptación móvil | Se carga después de los estilos existentes |

Las vistas no importan coordinadores, estado ni repositorios. La página es la
única que modifica el estado de selección. Las consultas reciben ese estado y
el repositorio; las vistas reciben el resultado y callbacks cuando corresponde.
El diálogo conserva su foco y sus elementos como estado propio de presentación.

## Dos recorridos

```text
metricas.html
└── pages/metrics.js
    ├── state/metrics.js
    ├── data/metrics.js
    ├── metrics/queries.js
    └── views/metrics/{controls,orbit,example-detail,reference}.js

index.html / explorar.html
└── pages/metrics-links.js
    ├── views/metrics/dialog.js
    └── views/metrics/concept-links.js
        └── metrics/terms.js
```

Cambiar mes o ámbito vuelve al coordinador mediante un callback. Este actualiza
la selección, consulta el ejemplo y entrega el mismo resultado a las dos vistas.
Abrir un concepto muestra `metricas.html?embed=1#concepto`; la vista de referencia
abre la definición y sus antecesores, incluso cuando el hash ya estaba activo.

## Contenido y generación estática

- `scripts/metrics-content.mjs` contiene las definiciones breves y MathML,
  redactadas para la web. No convierte ni copia el Markdown.
- `scripts/build-metrics.mjs` prepara `web/metricas.html` con esas definiciones,
  el ejemplo del Fío-fío y su foto con atribución, usando los JSON publicados.
  Reutiliza los nombres de meses de `shared/calendar.js`.
- `npm run build:metrics` regenera ese HTML cuando cambia el contenido o los
  datos del ejemplo. El HTML resultante se versiona.

Esta preparación es opcional para editar la ficha; el despliegue sigue sirviendo
`web/` directamente, sin un compilador de frontend ni bibliotecas adicionales.
No se duplican o regeneran los archivos publicados de `web/data/` y `web/audio/`.
La presencia usa la máscara original; el peso mostrado sigue identificado como
aproximado porque usa el perfil publicado redondeado.

## Verificación de la revisión

- `npm run check` y `npm run format:check`: análisis estático y formato.
- `npm test`: imports válidos, ausencia de ciclos, límites de las capas,
  correspondencia del ejemplo con los datos y consultas por ámbito y mes.
- `npm run test:metrics`: enlaces, fórmulas desplegables, ventana y Escape,
  restauración de foco, selección, ampliación y etiquetas sin cruces en móvil.
  Las fuentes y fotografías remotas se sustituyen en la prueba para evitar
  bloqueos de red; su disponibilidad real no forma parte de esa verificación.
- Comparación anterior/posterior del HTML de la órbita, presencia, cálculo y
  tabla en cuatro selecciones de Chile y regiones para verificar equivalencia.

Las reglas de arquitectura incluyen comprobaciones para impedir que el dibujo
vuelva a los dos coordinadores o que las consultas incorporen acceso al DOM.

Resultado local: **22 pruebas aprobadas**, análisis estático y formato sin
errores; interacciones verificadas en escritorio y móvil. La órbita, presencia,
cálculo y tabla mantienen HTML idéntico antes y después en las cuatro
selecciones comparadas. La regeneración del HTML estático conserva sus bytes.

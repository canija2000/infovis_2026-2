# Estructura y mantenimiento de la ficha de métricas

La arquitectura general y sus diagramas están en [ARQUITECTURA.md](ARQUITECTURA.md).
Este documento registra la revisión de la ficha y dónde mantener cada parte.
Las definiciones metodológicas completas siguen en [METRICAS.md](METRICAS.md);
la web usa una redacción breve propia y conserva sus fórmulas.

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

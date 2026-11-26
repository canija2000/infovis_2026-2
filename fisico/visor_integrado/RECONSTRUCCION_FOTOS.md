# Ensamble construido · reconstrucción desde fotografías

El modelo de `blender_ensamble.py` se actualizó con las vistas IMG_6241 e
IMG_6246–IMG_6255 proporcionadas el 26 de noviembre de 2026. Las fotos originales
se usan como referencia y no se copian al sitio público.

## Orientación y cambios observados

- Se conserva el tamaño nominal de las piezas de `piezas.json` (MDF de 3 mm).
  Las fotos no incluyen una regla para deducir medidas nuevas con precisión.
- Las asas y los paneles laterales se invierten respecto de la disposición del
  modelo inicial: giro de 180° alrededor del eje longitudinal, intercambiando
  izquierda y derecha. Así los pasos de las asas quedan abajo y los agujeros
  de los motores siguen coincidiendo con sus tornillos. La propiedad
  `pieza_plano` de cada malla conserva el nombre de la pieza de corte original.
- Las fotos incluyen ambas caras del equipo. El GLB conserva las coordenadas
  del plano; la web gira el ensamble completo 180° sobre el eje longitudinal.
  La electrónica se coloca considerando esa orientación final: la protoboard
  apoya en el piso físico, que corresponde a `MOCHILA ARRIBA` en el plano.
- Los cables salen de las asas y hacen un recorrido exterior por los costados,
  con conectores negros. Se elimina el tendido sobre la tapa y las bridas
  representadas en la propuesta inicial.
- El Leonardo se representa vertical y recto contra la pared interior de la
  mochila, girado 180° en su propio plano para orientar el USB hacia la abertura
  por donde sale el cable. Se omite la cinta sobre la placa. La protoboard,
  sus contactos y conectores quedan apoyados en el piso, centrados cerca de la
  apertura trasera, como en IMG_6255. Los cables siguen los terminales corregidos.
  No se representa la cuna horizontal del diseño previo.
- Los cuatro módulos tienen PCB negro, motor circular metálico, conector de
  tres pines y tornillos. Se mantienen las funciones y los pines del sketch.
- Toda la carcasa es MDF natural con cantos oscuros de corte láser. La tapa
  trasera incorpora las dos tiras de cinta visibles en las fotografías.
- El USB termina libre fuera de un paso lateral. El teléfono no está colocado
  en las fotos: se conserva como referencia opcional, oculta al abrir el visor.

## Alcance y límites

La orientación de las piezas, el volumen exterior y la disposición visible del
circuito se basan en las fotografías. Los detalles de placas, conectores, cinta
y las curvas de los cables son aproximaciones geométricas, no fotogrametría ni
un esquema de cableado. El modelo no permite inferir medidas de fabricación
adicionales ni el pin de cada conductor a partir de su color.

Los archivos de corte no se regeneran ni se modifican al actualizar el ensamble.

## Regenerar

Desde la raíz del repositorio:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python fisico/visor_integrado/blender_ensamble.py
```

Se actualizan `ensamble.blend`, `ensamble.glb` y las cinco vistas `render_*.jpg`.
Al finalizar se copian automáticamente el GLB y la vista frontal a
`web/models/visor-bandadas/`. La copia web y el visor fuente permiten activar
el teléfono de referencia; por defecto muestran el equipo sin él.

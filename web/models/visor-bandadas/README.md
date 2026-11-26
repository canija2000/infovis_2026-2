# Modelo publicado del Visor de Bandadas

`ensamble.glb` y `ensamble.jpg` son copias de `ensamble.glb` y
`render_armado_frente.jpg` de `fisico/visor_integrado/`.
Se incluyen dentro de `web/` porque GitHub Pages publica únicamente ese árbol,
tanto en la raíz como en `/v4/`.

Para actualizar el modelo, ejecutar `fisico/visor_integrado/blender_ensamble.py`:
el script regenera los archivos y actualiza automáticamente estas dos copias.
Las etiquetas y funciones de los componentes están en
`web/js/pages/video-prototipo.js`, basadas en el README del ensamble y el sketch
`arduino/vibraciones_aves/` (pines 10, 8, 6 y 4).

El modelo corresponde al ensamble construido de las fotos IMG_6241 y
IMG_6246–IMG_6255: asas y laterales invertidos, cables por los costados, Leonardo
vertical y protoboard cerca de la apertura trasera. La reconstrucción y sus
límites se documentan en `fisico/visor_integrado/RECONSTRUCCION_FOTOS.md`.

La página aplica un giro de 180° alrededor del eje longitudinal al ensamble
completo para mostrar el prototipo apoyado sobre su cara correcta. La imagen
de respaldo utiliza la misma orientación; las coordenadas del GLB se conservan.

«Abrir carcasa» oculta temporalmente
los paneles que quedan arriba en esta orientación (`VISOR BASE` y
`MOCHILA ABAJO` en el plano), la tapa trasera con sus listones y
las asas para acceder a las piezas internas. «Restablecer vista» vuelve a mostrar
el ensamble completo. El teléfono de referencia está oculto por defecto y se
puede activar con su casilla o al seleccionarlo en la lista de componentes.

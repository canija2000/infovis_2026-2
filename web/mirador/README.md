# Mirador (binoculares de cartón)

`web/mirador/` es el Aviario 3D adaptado para la instalación de los binoculares: un teléfono dentro de dos tubos de
cartón. **Toda la interacción sale del teléfono** (su giroscopio); el Arduino ya no es necesario, aunque
sus teclas siguen funcionando. No se camina: se elige una región y una de sus zonas ya modeladas, uno queda
de pie en el centro y gira.

## Recorrido

1. **QR de la región.** Cada visor tiene impreso el código de una región (`qr.html` los genera;
   apuntan a `web/mirador/?r=CL-AP`, `?r=CL-VS`, `?r=CL-RM`, `?r=CL-LR`, `?r=CL-MA`).
2. **Elegir zona** en el teléfono, tocando. Ese toque es el que pide los permisos (giroscopio en iPhone,
   sonido, pantalla siempre encendida, pantalla completa y horizontal en Android).
3. **Poner el teléfono en el visor.** La pantalla lo pide y empieza sola cuando el teléfono queda de lado,
   mirando al frente y quieto 1,2 s. El rumbo de ese momento pasa a ser el de partida.
4. **Explorar** girando el cuerpo.
5. **Sacar el teléfono** (queda vertical) o tocar la pantalla pausa: desde ahí se vuelve al visor o se
   elige otra zona.

## Pantalla de inicio: selector de niveles

Pensada como la pantalla de inicio de un juego (la referencia fue `cambios.png`):

- **Barra:** logo, interruptor **Mirar / Caminar** y un engranaje con lo técnico (lentes del visor e
  instrucciones para instalar la app).
- **Mundo:** la región, con flechas para cambiarla. El QR de cada visor la deja puesta.
- **Niveles:** las zonas de la región, como fotos pegadas con cinta: paisaje, nombre, lugar a mano y un
  sello por ave (cuando la fotografías, el sello es tu foto).
- **Entrar:** tocar un nivel solo lo marca; se entra con el botón de abajo. El pato dice cuántas faltan.

Regla de materiales (está al principio de `css/mirador.css`): lo que se toca para jugar es sólido (tinta
café y ámbar, borde grueso, sombra dura); lo que se observa y colecciona es papel (fotos, cinta, sellos,
letra a mano).

**Modos.** *Mirar*: de pie en el centro de la zona, se gira. *Caminar*: se **camina en el lugar** y se
avanza hacia donde se mira; el acelerómetro cuenta los pasos (`devicemotion`, `CFG.stepLen` m por paso). No
se entra al agua desde tierra, ni a obstáculos, ni a menos de 1,2 m de un ave. Solo se activa si el teléfono
tiene acelerómetro; en el computador se camina con W / S. Para probar: `?modo=mirar|caminar`.

## Diálogo del ave (dentro del visor)

Caja de diálogo de juego de rol: la pestaña lleva **nombre | clase** (el color de la clase) y el cuerpo
queda libre para lo que el ave «dice», una frase a la vez, sacada de los datos (`birdLines` en
`js/mirador.js`):

- cuántos días del mes la registraron en 2024 («En enero me vieron 18 de 31 días.»);
- si vive todo el año o cuándo llega y se va;
- su estación preferida (la del mes con más registros);
- la región donde más la registran («Me gusta la región de Los Ríos.»);
- si en 2024 la vieron más o menos que de costumbre;
- qué come y cuánto pesa.

Al entrar en la mira se ve la primera; a los 1,2 s se abre la ficha (las frases pasan cada `CFG.lineSecs`
segundos, con la franja de los 12 meses) y a los 5 s se toma la foto.

El pato (`img/pato.png`) está recortado de `cambios.png`.

## Gestos (solo con el teléfono)

| Qué hago | Qué pasa |
| --- | --- |
| Girar | la mira toma el ave más cercana al centro: canta y aparece su nombre y clase |
| Mantener el ave en la mira 1,2 s | se abre su ficha: el zoom la acerca y van pasando sus frases |
| Seguir mirándola hasta 5 s | se toma la foto (el anillo de la mira muestra cuánto falta) |
| Mirar al cielo 2 s | pasa al mes siguiente |
| Mirar al suelo | libreta de la zona |
| Sacar el teléfono / tocar la pantalla | pausa |

Los tiempos están en `CFG` al principio de `js/mirador.js` (`dwellCard`, `dwellPhoto`, `skyHold`,
`placeHold`). El mes también avanza solo cada 75 s (`monthSeconds`) mientras no hay un ave en la mira.

## Qué muestra

- Datos de **un solo año** (`YEAR = '2024'`), mes a mes.
- Las aves destacadas de la zona están **fijas en un círculo**. Cada especie tiene su sector todo el año
  (las que nadan donde hay agua, las que se posan donde hay perchas); si ese mes no se registra, su lugar
  queda vacío.
- La **ficha**: nombre común y científico, clase (residente, visitante de verano, visitante de invierno),
  región y lugar, cuántos días de ese mes de 2024 se registró y la franja de los 12 meses.
- La **foto** se puntúa como en el Aviario y se guarda en el mismo álbum (`localStorage`).
- La **brújula**: un punto por ave presente (relleno si ya está fotografiada) y hacia dónde quedan las
  otras zonas de la región.

## Sensores: no hace falta una librería

Protobject lee los mismos datos que cualquier página web puede leer: el evento `deviceorientation` del
navegador (ángulos alpha, beta y gamma del teléfono). El Mirador los usa directamente y los convierte en
rumbo e inclinación de la cámara (`gyro` en `js/mirador.js`, la misma cuenta que `DeviceOrientationControls`
de three.js). Condiciones:

- La página tiene que servirse por **HTTPS** (GitHub Pages sirve). Por `http://` con la IP del computador
  el navegador no entrega los sensores.
- En iPhone el permiso se pide con un toque (por eso se pide al elegir la zona).
- Si el permiso se niega o no hay sensor, aparece «Entrar sin sensores» y se gira con el dedo o las flechas.

## Pantalla completa (sin barra de dirección)

- **Android:** se activa sola al tocar la zona.
- **iPhone:** Safari no deja que una página ocupe toda la pantalla (solo los videos). Hay que instalarla:
  Compartir → «Agregar a inicio», y abrir el Mirador desde ese ícono. La pantalla de zonas lo explica.
- Instalado (`manifest.webmanifest`) abre sin barras en los dos. Como el QR abre el navegador y no la app,
  la app instalada recuerda la última región elegida y deja cambiarla.

## Visor

En la pantalla de inicio, el engranaje abre los ajustes: ahí se cambian la separación y el tamaño de los dos círculos (en % del
ancho de la pantalla) hasta que cada uno quede centrado en su tubo. Queda guardado en el teléfono.

## Teclado y Arduino (opcional)

| Arduino | Tecla | Acción |
| --- | --- | --- |
| FOTO, toque corto | Espacio | foto |
| FOTO, mantener | Esc | pausa |
| INFO, toque corto | Enter | ficha |
| INFO, mantener | M (N) | mes siguiente (anterior) |
| rueda | Z / X | zoom (desactiva el zoom automático hasta cambiar de ave) |
| | flechas / arrastrar | girar sin giroscopio |
| | L · C · B | libreta · recentrar · uno o dos lentes |

## Origen

Es una copia del modo Mirador del [Aviario 3D](https://github.com/canija2000/3d_aviario) (rama `mirador`),
con solo los módulos, datos (`data/game`), sonidos (`audio`) y modelos (`models/kit`) que usa. Si se
regeneran los datos del Aviario, hay que volver a copiarlos aquí.

## Para probar

`web/mirador/?r=CL-LR&z=bosque&m=9&auto` entra directo a una zona y un mes (0 = enero) sin pasar por el
visor. Con el servidor local: `python3 -m http.server 8765 --directory web` y abrir
`http://localhost:8765/mirador/`. `&mono` fuerza un solo lente y `&bino` dos. En la consola, `M` es el estado y `dbg` trae
`setMonth`, `enterZone`, `pause`, `go`, `gyro`, etc.

# Mezclador de cantos

El mezclador permite escuchar varias especies a la vez y ajustar el volumen de
cada una. Funciona de forma independiente de **Escuchar el año**, la sonificación
mensual descrita en la página: ambas pueden sonar al mismo tiempo. El botón de
silencio general afecta a las dos.

## Uso en la web

1. Pulsa **Buscar especies**. Se abre una grilla con las especies que tienen una
   grabación disponible. Cada tarjeta muestra el nombre común, su clase
   estacional y la primera foto (`images[0]`) de esa especie en
   `web/data/images.json`. Si la foto remota falla, aparece su inicial.
2. Escribe un nombre común o científico para filtrar. La búsqueda ignora tildes,
   guiones y diferencias entre mayúsculas y minúsculas. Los filtros **Todas**,
   **Residentes**, **De verano** y **De invierno** se pueden combinar con el texto.
   Usan la clase de `web/data/species.json`; la región seleccionada en el mapa
   no cambia esa clasificación del mezclador.
3. Pulsa una tarjeta para añadir el ave directamente. Una marca indica que ya
   está en la mezcla; pulsarla otra vez no crea una segunda pista. Cada pista
   muestra sus créditos, enlace de licencia, control de volumen de 0 a 100 % y
   botón **Quitar**.
4. Pulsa **Reproducir mezcla** para empezar y **Pausar mezcla** para detenerla.
   Se pueden añadir y quitar especies mientras suena. Al quitar una pista se
   cancelan su reproducción y sus esperas pendientes.

El selector ofrece 231 especies con canto. Las fotos se sirven desde los
proveedores originales, por lo que una imagen puede no estar disponible aunque
el canto sí lo esté.

## Modos de reproducción

La casilla **Sincronizar cantos** está desmarcada inicialmente.

| Modo | Comportamiento |
| --- | --- |
| Desincronizado (predeterminado) | Cada pista espera un tiempo aleatorio de 0,2 a 5,2 s antes de empezar. Tras terminar su clip, vuelve a esperar un intervalo aleatorio independiente antes del siguiente canto. |
| Sincronizado | Todas las pistas cargadas comienzan en el mismo instante del reloj de Web Audio y repiten en ciclos comunes de 6 s. Los clips más cortos se completan con silencio hasta el final del ciclo. |

Marcar o desmarcar la casilla mientras suena reinicia la mezcla en el nuevo
modo. **Pausar** cancela las fuentes y temporizadores; al volver a reproducir,
las pistas comienzan un ciclo nuevo. Una especie añadida durante el modo
desincronizado recibe su propia espera; en el sincronizado se reinicia el grupo
para mantener el mismo punto de partida.

## Archivos y flujo de datos

| Archivo | Función |
| --- | --- |
| `web/data/species.json` | Nombres y clase estacional de cada especie. |
| `web/data/images.json` | Fotos ordenadas; el mezclador usa la primera de cada especie. |
| `web/audio/clips.json` | Ruta del clip original, ruta `mixer` cuando existe, fuente, autor y licencia. |
| `web/data/sounds.json` | Asocia esas rutas y créditos con el ID de especie para la web. |
| `web/audio/mixer/XC*.mp3` | Archivos con reducción de sonido ambiente para el mezclador. |
| `web/app.js` | Selector, filtros, volúmenes y programación de las pistas con Web Audio. |
| `web/sonify.js` | Sonificación mensual existente; no usa las pistas nuevas del mezclador. |

El navegador carga `sounds.json` e `images.json` para preparar el selector. Los
MP3 de las especies se descargan y decodifican al reproducirlas. Cada pista
tiene su propio control de ganancia y todas pasan por un compresor antes de la
salida. La ficha de especie sigue usando el clip `src`; el mezclador prefiere
`mixer` y recurre a `src` cuando no hay pista limpiada.

## Preparación de las pistas

Desde la raíz del repositorio:

```bash
python3 python_scripts/preparar_audio_web.py
python3 python_scripts/build_web_data.py
python3 python_scripts/preparar_audio_mixer.py
```

El último script necesita `numpy` y `ffmpeg`. Parte de los clips de la web,
estima el fondo persistente por frecuencia y lo atenúa mediante una máscara
espectral suavizada. También reduce gradualmente el ruido grave y mantiene un
piso de señal para evitar cortes bruscos. Esto **reduce** río, viento y otros
fondos, pero no garantiza separar por completo el canto de sonidos que ocupan
las mismas frecuencias.

Actualmente 178 especies usan pistas procesadas (177 archivos distintos: dos
especies comparten una grabación). Otras 53 conservan su clip anterior y están
marcadas como **audio original**: las
[licencias Creative Commons ND](https://creativecommons.org/licenses/by-nc-nd/4.0/)
no permiten compartir una adaptación como la versión limpiada. Cada pista
conserva un enlace a la grabación y a su licencia. Si se vuelven a preparar los clips originales,
ejecuta otra vez `preparar_audio_mixer.py` para recrear las pistas y las rutas
`mixer` del catálogo.

## Comprobaciones realizadas

Se verificó en navegador que la búsqueda y los filtros muestran las especies
correspondientes, que un clic añade una sola pista y que las miniaturas usan la
primera imagen del catálogo. Con dos especies se comprobó que sus inicios se
separan en modo libre, que coinciden en modo sincronizado, que sus bucles tienen
la misma duración y que al pausar no quedan inicios pendientes. También se
comprobó que una pista libre espera de nuevo tras terminar su canto.

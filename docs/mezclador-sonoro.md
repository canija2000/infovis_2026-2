# Pistas con menos ruido de fondo (`audio/mixer/`)

El **mezclador de cantos de Explorar se retiró** (ver la entrada 28 de
[CAMBIOS](../CAMBIOS.md)): ya no existen su barra inferior, su catálogo ni el
botón «+ Añadir a la mezcla» de la ficha. Sus pistas procesadas siguen
publicadas en `web/audio/mixer/` y tienen un uso nuevo: son el clip preferido de
[«Escuchar su año»](METRICAS.md#ano-especie), que toma `recordings[0].mixer` de
`sounds.json` y recurre a `recordings[0].src` cuando no hay pista limpiada.

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
no permiten compartir una adaptación como la versión limpiada. Si se vuelven a preparar los clips originales,
ejecuta otra vez `preparar_audio_mixer.py` para recrear las pistas y las rutas
`mixer` de `sounds.json`.

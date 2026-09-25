# Atlas de aves de Chile

Prototipo de visualización interactiva de observaciones de aves en Chile usando la API de eBird 2.0 y las divisiones regionales de Chile de la Biblioteca del Congreso Nacional.

## Arquitectura

```text
eBird API -> 10anios.py -> datos procesados -> web/
                                      |
                                      +-> GitHub Pages / Railway
```

- `10anios.py`: descarga histórica, usa caché local, asigna observaciones a regiones y genera los archivos que consume la web.
- `testeo.ipynb`: exploración inicial de la API (histórico; ya no forma parte del pipeline).
- `Regiones/`: shapefile regional de Chile usado para el mapa y la asignación espacial.
- `web/`: frontend estático con Leaflet, HTML, CSS y JavaScript.
- `web/data/`: datos procesados publicados por el frontend.

El frontend utiliza el GeoJSON local de las regiones. No depende de Carto ni de otro proveedor de teselas de mapas.

## Datos históricos

La descarga completada cubre `2016-09-17` a `2026-09-18`:

- 3.654 días consultados.
- 674.004 observaciones crudas.
- 604.225 registros especie-día asignados a las 16 regiones de Chile.
- 171.341 filas compactas agregadas por región, mes y especie.
- `cache_ebird/`: aproximadamente 218 MB, solo local y excluida de Git.
- `web/data/`: aproximadamente 39 MB, destinada a la webpage.

El dataset web contiene observaciones agregadas por:

```text
region_code + year_month + speciesCode + comName + sciName
```

Cada fila tiene `reportDays`: **días del mes en que la especie se reportó en
Chile** y cuyo avistamiento más reciente del día cayó en esa región.

> **Limitación de la fuente.** El endpoint histórico de eBird devuelve una sola
> fila por especie y día (el avistamiento más reciente, `rank=mrec`), no todas
> las observaciones. Por eso la métrica no es un conteo de observaciones ni de
> individuos, sino una frecuencia de reporte. Como se consulta todo Chile a la
> vez, cada especie queda asignada a una sola región por día, lo que sesga la
> distribución regional hacia las regiones con más actividad. La corrección
> (una consulta por región) está descrita en `instrucciones_re_pull_de_datos.md`.

## Requisitos

Python 3.11 o superior y estas dependencias:

```bash
python3 -m pip install geopandas pandas requests pyarrow
```

La API key debe estar en `.env` y nunca debe subirse al repositorio:

```text
API_BIRD_KEY=...
```

## Procesar la caché existente

Para regenerar los datos de la webpage sin hacer nuevas solicitudes:

```bash
python3 10anios.py --start 2016-09-17 --end 2026-09-18 --pause 0
```

El script detecta automáticamente los JSON ya descargados en `cache_ebird/`.

Para revisar el número de solicitudes pendientes sin consultar la API:

```bash
python3 10anios.py --dry-run
```

La API histórica requiere una solicitud por fecha. eBird no publica en su documentación una cuota numérica fija de solicitudes por minuto; ante un `429`, el script se detiene y conserva la caché para reanudar posteriormente.

## Ejecutar la webpage localmente

```bash
cd web
python3 -m http.server 8000
```

Abrir <http://localhost:8000>.

La página permite:

- Explorar un mapa de las regiones de Chile.
- Ver la participación relativa de días-especie registrados por región.
- Seleccionar una región mediante clic.
- Revisar sus métricas generales.
- Ver las cinco especies con más días de registro.
- Explorar la serie mensual.
- Reservar espacios para futuras imágenes y audios.

## Publicación

La carpeta `web/` puede publicarse como sitio estático en GitHub Pages. Railway también puede servirla, aunque no es necesario un backend para esta versión: los diez años ya están procesados en archivos estáticos.

Las observaciones se publican en dos archivos JSON para respetar el límite de 25 MiB por asset de Cloudflare Workers.

## Descargar sonidos de las especies principales

`descargar_sonidos.py` suma los días con registro de ambos archivos de la web,
selecciona las especies reportadas más días y consulta sus grabaciones en
[Xeno-canto](https://xeno-canto.org/). La API key se lee desde `api_sounds` en
`.env`; nunca se escribe en el manifiesto.

```bash
python3 descargar_sonidos.py --dry-run
python3 descargar_sonidos.py --top 25 --recordings-per-species 3
```

Los audios se guardan localmente en `sounds/` y sus metadatos, licencias y
fuentes en `sounds/manifest.json`. La carpeta se excluye de Git porque los
archivos binarios pueden ocupar cientos de megabytes.

Para reducir audios PCM que Xeno-canto entrega con extensión `.mp3`:

```bash
python3 optimizar_sonidos.py --dry-run
python3 optimizar_sonidos.py
```

El script conserva los nombres usados por el manifiesto y convierte los
archivos a MP3 VBR a 44,1 kHz.

## Fuentes y atribución

- Datos: [eBird API 2.0](https://documenter.getpostman.com/view/664302/S1ENwy59).
- Divisiones regionales: [Mapoteca BCN](https://www.bcn.cl/siit/mapas_vectoriales/index_html).
- eBird debe atribuirse como fuente de los datos publicados.

El uso está planteado para un proyecto educativo y no comercial. La API key no debe exponerse en el frontend ni compartirse públicamente.

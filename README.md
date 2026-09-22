# Atlas de aves de Chile

Prototipo de visualización interactiva de observaciones de aves en Chile usando la API de eBird 2.0 y las divisiones regionales de Chile de la Biblioteca del Congreso Nacional.

## Arquitectura

```text
eBird API -> 10anios.py -> datos procesados -> web/
                                      |
                                      +-> GitHub Pages / Railway
```

- `10anios.py`: descarga histórica, usa caché local, asigna observaciones a regiones y genera los archivos que consume la web.
- `testeo.ipynb`: exploración de la API, pruebas del pipeline y exportación desde Jupyter.
- `Regiones/`: shapefile regional de Chile usado para el mapa y la asignación espacial.
- `web/`: frontend estático con Leaflet, HTML, CSS y JavaScript.
- `web/data/`: datos procesados publicados por el frontend.

El frontend utiliza el GeoJSON local de las regiones. No depende de Carto ni de otro proveedor de teselas de mapas.

## Datos históricos

La descarga completada cubre `2016-09-17` a `2026-09-18`:

- 3.654 días consultados.
- 674.004 observaciones crudas.
- 604.225 observaciones asignadas a las 16 regiones de Chile.
- 171.341 filas compactas agregadas por región, mes y especie.
- `cache_ebird/`: aproximadamente 218 MB, solo local y excluida de Git.
- `web/data/`: aproximadamente 39 MB, destinada a la webpage.

El dataset web contiene observaciones agregadas por:

```text
region_code + year_month + speciesCode + comName + sciName
```

Cada fila conserva el número de observaciones (`obsCount`), individuos reportados (`howMany`) y lugares (`places`).

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
- Ver la participación relativa de observaciones por región.
- Seleccionar una región mediante clic.
- Revisar sus métricas generales.
- Ver las cinco especies más reportadas.
- Explorar la serie mensual.
- Reservar espacios para futuras imágenes y audios.

## Publicación

La carpeta `web/` puede publicarse como sitio estático en GitHub Pages. Railway también puede servirla, aunque no es necesario un backend para esta versión: los diez años ya están procesados en archivos estáticos.

Las observaciones se publican en dos archivos JSON para respetar el límite de 25 MiB por asset de Cloudflare Workers.

## Fuentes y atribución

- Datos: [eBird API 2.0](https://documenter.getpostman.com/view/664302/S1ENwy59).
- Divisiones regionales: [Mapoteca BCN](https://www.bcn.cl/siit/mapas_vectoriales/index_html).
- eBird debe atribuirse como fuente de los datos publicados.

El uso está planteado para un proyecto educativo y no comercial. La API key no debe exponerse en el frontend ni compartirse públicamente.

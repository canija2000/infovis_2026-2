# Atlas de aves de Chile

La webpage es un frontend estático. No ejecuta Python ni necesita la API key de eBird.
El mapa usa solamente el GeoJSON local de las regiones, sin teselas de Carto,
OpenStreetMap ni otro proveedor externo de mapas.

## Flujo

1. Generar `web/data/` con `10anios.py` (usa la caché local si existe).
2. Abrir `web/index.html` mediante un servidor HTTP local.

```bash
python 10anios.py --dry-run
python 10anios.py
```

El script consulta Chile una vez por día, asigna cada observación a una región
mediante `Regional.shp`, y publica datos compactos agregados por región, mes y
especie. Las respuestas diarias quedan en `cache_ebird/` y no se versionan.
Una década implica aproximadamente 3.650 solicitudes nuevas la primera vez.

```bash
cd web
python3 -m http.server 8000
```

Luego visitar <http://localhost:8000>.

El script genera:

- `data/regions.geojson`: regiones y métricas agregadas.
- `data/observations-01.json` y `data/observations-02.json`: observaciones normalizadas particionadas para respetar el límite de tamaño de assets de Cloudflare Workers.
- `data/metadata.json`: cobertura y fecha de actualización.

Para GitHub Pages, publicar la carpeta `web/` como raíz del sitio. Las fotografías y audios todavía son placeholders; se pueden completar en `app.js` cuando exista la tabla de correspondencias por nombre científico.

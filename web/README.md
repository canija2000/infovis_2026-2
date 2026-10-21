# web/ — Atlas sonoro de aves de Chile

Sitio estático con dos páginas: `index.html` (Visualización) y `explorar.html`
(Explorar). La guía completa, con mapas generales y por característica, está
en [docs/ARQUITECTURA.md](../docs/ARQUITECTURA.md).

```text
js/pages/       coordina las páginas
js/state/       conserva las selecciones
js/data/        carga e indexa JSON
js/views/       presenta gráficos y controles
js/species/     coordina la carga de las fichas
js/audio/       planes y motores de reproducción
js/explore/     reglas, consultas, colores y ejes del atlas
js/shared/      utilidades explícitas
css/            estilos por responsabilidad
```

D3 7.9.0 se carga desde jsDelivr; el JavaScript usa módulos ES nativos y no
necesita compilación. `css/site.css` conserva el orden de la cascada anterior;
la portada añade `css/overview.css`.

```bash
cd web
python3 -m http.server 8000
```

La portada solicita `overview.json` y los datos espaciales. Los archivos de
`grid_region/` se cargan al elegir una región. Su único audio es «Escuchar su
año» en los calendarios regionales (`js/audio/species-year.js`), que pide
`sounds.json` y el clip al pulsar ▶. `loop.json` sigue publicado, pero ya no se
usa.

Explorar solicita los cinco archivos base: `meta.json`, `species.json`,
`typical_year.json`, `region_month.json` y `regions.min.geojson`. Los índices
`sounds.json` e `images.json` se solicitan al abrir una ficha,
y se reutilizan. «Escuchar su año», en la ficha, usa `species-year.js`.

Los datos publicados se conservan en `data/` y los clips en `audio/`.
`observations-*.json`, `metadata.json` y `regions.geojson` son entradas de los
constructores de Python; el navegador no los solicita para dibujar el sitio.
`data/game/` conserva las rutas que consume el proyecto externo del Aviario.

Los scripts están organizados por tarea en `python_scripts/`; los comandos
anteriores siguen disponibles mediante entradas de compatibilidad. Por ejemplo,
`python3 python_scripts/build_web_data.py` y
`python3 python_scripts/atlas/build_web_data.py` ejecutan la misma implementación.

Las herramientas de verificación se ejecutan desde la raíz del repositorio:

```bash
npm ci
npm run check
npm test
python3 tests/python-invariance.py
npx playwright install chromium
npm run test:browser
```

Node y las dependencias npm solo se necesitan para verificar el proyecto.
La publicación sigue sirviendo la carpeta `web/` directamente.

# Versiones históricas publicadas

Las cuatro versiones del informe se publican en rutas independientes:

| Versión | Corte del informe | Commit | Página |
| --- | --- | --- | --- |
| V1 | 30 de septiembre de 2026, antes de R1 | `4b834bfaf7cad8b3d01cde916a0e29225de75a9e` | [Abrir V1](https://canija2000.github.io/infovis_2026-2/v1/) |
| V2 | 7 de octubre de 2026, antes de R2 | `37c53d46ba8e928de165d5cb40f1206b5231a618` | [Abrir V2](https://canija2000.github.io/infovis_2026-2/v2/) |
| V3 | 14 de octubre de 2026, antes de R3 | `bf631bb687b606d9b33553e33ebf075f9dee5692` | [Abrir V3](https://canija2000.github.io/infovis_2026-2/v3/) |
| V4 | 19 de octubre de 2026, cierre documentado | `e216501cf252605a9913a64f8336791be26a1c16` | [Abrir V4](https://canija2000.github.io/infovis_2026-2/v4/) |

La página principal conserva la versión actual de `main`. Las rutas históricas
se reconstruyen desde los mismos commits en cada despliegue, por lo que no
cambian cuando se actualiza la página principal.

Cada copia incluye toda la carpeta `web/` de su commit: páginas, módulos,
estilos, datos y audios. Las rutas relativas siguen funcionando dentro de su
versión, incluido Explorar cuando ya existía. Los enlaces externos conservan
sus destinos originales.

V2 se reconstruye desde el commit del informe, aunque el despliegue histórico
equivalente fue `738514e`: ambas carpetas `web/` son idénticas.

## Preparación y comprobación

```bash
python3 scripts/build-pages.py
python3 tests/pages-build.py
python3 -m http.server 8000 --directory _site
```

El script requiere Python 3.12 o superior y los commits del historial local.
GitHub Actions los obtiene con `fetch-depth: 0`. Las copias se generan en
`_site/`; no se duplican los archivos históricos dentro del repositorio.
La comprobación compara cada archivo publicado con su objeto de Git y también
se ejecuta antes de subir el sitio a Pages.

El manifiesto público [versions.json](https://canija2000.github.io/infovis_2026-2/versions.json)
permite comprobar qué commit corresponde a cada ruta. La configuración está en
`scripts/pages-versions.json` y la publicación en `.github/workflows/pages.yml`.

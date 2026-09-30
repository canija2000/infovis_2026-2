# Fotografías de las fichas de especie

Este documento describe cómo se obtienen, seleccionan y muestran las fotografías
de las fichas. El proceso usa las especies de `web/data/species.json` y la API de
ocurrencias de GBIF. Es independiente del cálculo de presencia y estacionalidad
descrito en [metodologia-datos.md](metodologia-datos.md).

## Flujo y archivos

```text
web/data/species.json
        │
        ▼
python_scripts/preparar_imagenes_web.py ─► cache_images/candidates.json
        │                                  (hasta 64 candidatas por especie)
        ▼
python_scripts/ordenar_imagenes_web.py  ─► web/data/images.json
                                           (hasta 8 seleccionadas por especie)
        ▼
web/app.js ─► ficha: una foto bajo el canto y «Mostrar más» para el resto
```

`cache_images/` está excluido de Git. Guarda las candidatas, las miniaturas
descargadas, el detector y `scores.json` para poder reanudar el análisis. El
archivo que se publica con la web es `web/data/images.json`; contiene solo URL,
autor, licencia y enlace a la ocurrencia de cada foto seleccionada. Cada lista
se asocia mediante `sid` y `sciName`; el orden del arreglo `images` es el orden
de calidad. Las puntuaciones no se envían al navegador. La web
solicita ese JSON al abrir una ficha, carga primero una foto y permite expandir
la galería hasta un máximo de ocho. Las imágenes se sirven desde sus proveedores,
no desde el repositorio.

`python_scripts/build_web_data.py` conserva las fotos publicadas y vuelve a
asociarlas por nombre científico si cambian los IDs de `species.json`. Ese build
no consulta GBIF ni ejecuta el detector. Cuando se incorporen especies nuevas o
se quiera renovar la selección, hay que ejecutar las dos etapas de este flujo.

## 1. Reunir candidatas en GBIF

`preparar_imagenes_web.py` consulta `GET /v1/occurrence/search` con
`mediaType=StillImage` y el nombre científico de cada especie. Examina primero
ocurrencias de Chile, hasta dos páginas de 100 resultados. Si reúne menos de 32
fotos aptas, consulta hasta dos páginas globales de la misma especie. El cupo
predeterminado es de 64 candidatas por especie; puede haber menos si GBIF no
ofrece suficientes fotos que cumplan los filtros. No es una muestra exhaustiva
de todas las fotos existentes en GBIF.

Una foto entra al conjunto solo si:

- La ocurrencia declara exactamente la especie solicitada y el medio es
  `StillImage`.
- La URL del medio usa HTTPS.
- **La licencia del medio** es una URL CC BY de Creative Commons. La licencia de
  la ocurrencia puede ser distinta y no se usa como sustituto. Se excluyen
  licencias NC, ND, SA y medios sin licencia explícita.
- Hay autor (`creator`, `rightsHolder` o `recordedBy`) y clave de ocurrencia para
  enlazar la fuente.

Se eliminan URL repetidas dentro de cada especie. Las fotos originales de
iNaturalist se solicitan en su variante `medium` para el análisis y la ficha.
Cada candidata conserva `url`, `author`, `license` y `source`. Las fotos que ya
estaban publicadas se mantienen entre las candidatas al actualizar la consulta.
El archivo incluye `incomplete` para reintentar especies cuya consulta falló;
ante HTTP 429 se respeta `Retry-After` cuando GBIF lo entrega.

## 2. Puntuar y publicar las ocho mejores

`ordenar_imagenes_web.py` descarga las candidatas para analizarlas con
[SSD MobileNet v1 int8 de ONNX Model Zoo](https://huggingface.co/onnxmodelzoo/ssd_mobilenet_v1_12-int8).
El modelo se verifica mediante el SHA-256 fijado en el script y busca la clase
general `bird` de COCO, con confianza mínima de 0,25. No identifica visualmente
la especie: esa asociación procede del registro de GBIF.

Para cada foto con un ave detectada, la puntuación de 0 a 100 combina:

| Señal | Peso | Qué favorece |
|---|---:|---|
| Tamaño del ave en el encuadre | 58 % | Ave cercana y fácil de reconocer |
| Confianza del detector | 19 % | Detección clara |
| Nitidez del recorte del ave | 13 % | Detalles visibles |
| Exposición del recorte | 7 % | Ave que no queda demasiado oscura o clara |
| Cercanía al centro | 3 % | Composición legible |

Si hay varias aves detectadas, se toma la de mayor área visible. El tamaño es
la fracción del encuadre ocupada por su caja de detección, transformada con una
raíz cuadrada y acotada. La nitidez se estima con la variación del Laplaciano
sobre el recorte del ave y se comprime logarítmicamente. La puntuación final es
la suma ponderada de la tabla, multiplicada por 100.
Una foto analizada sin ave detectada recibe puntuación cero y queda detrás de
las fotos con detección. Entre puntuaciones iguales se conserva el orden de
GBIF. Si no se pudo descargar o decodificar una foto, queda sin puntuación y
no se publica. Las descargas para el análisis están limitadas a 8 MB por foto.
El script ordena todas las candidatas puntuadas de cada especie y escribe solo
las primeras ocho en `web/data/images.json`. Las puntuaciones y
las miniaturas quedan en la caché local, fuera del sitio publicado.

## Regeneración y revisión

Desde la raíz del repositorio:

```bash
python3 python_scripts/build_web_data.py
python3 python_scripts/preparar_imagenes_web.py
python3 -m pip install pillow numpy onnxruntime
python3 python_scripts/ordenar_imagenes_web.py
cd web && python3 -m http.server 8000
```

Abrir `http://localhost:8000`, buscar una especie y abrir su ficha. Tras
regenerar `images.json`, recargar la página para que una ficha ya abierta lea
la selección nueva. La inferencia requiere Python 3.11 o posterior y las tres
bibliotecas indicadas; el navegador no necesita esas dependencias. La primera
ejecución descarga el detector (aproximadamente 9 MB) y las miniaturas.

- Sin opciones, la consulta conserva las especies ya completadas y busca las
  faltantes. `--force` vuelve a consultar todas; `--retry-empty` repite las que
  no tenían fotos. `--limit 64` ajusta el cupo y `--workers 2` reduce las
  consultas simultáneas si GBIF responde con 429. Tras cualquier actualización
  de candidatas, volver a ejecutar el ordenador para publicar la nueva selección.
- `python3 python_scripts/ordenar_imagenes_web.py --species "Zonotrichia capensis" --dry-run`
  muestra las mejores fotos de chincol sin modificar el JSON publicado.
- `python3 python_scripts/ordenar_imagenes_web.py --publish-only` vuelve a
  generar `images.json` con las puntuaciones guardadas, sin reintentar descargas.
  La ejecución normal reutiliza las puntuaciones existentes y reintenta las URL
  aún no analizadas.
- Si se cambia la fórmula o el detector, eliminar o renombrar
  `cache_images/scores.json` antes de ejecutar el ordenador para recalcular
  todas las puntuaciones. Las miniaturas descargadas seguirán en la caché.

## Cobertura y límites

En la generación del **30 de septiembre de 2026** se reunieron 25.673
candidatas para 551 especies (mediana de 53 por especie); 520 especies tenían
más de ocho candidatas. Se pudieron publicar 4.247 fotos: 523 especies tienen
ocho, 18 tienen entre una y siete, y 10 no tienen foto. En ocho de estas
últimas no se hallaron candidatas aptas en las páginas consultadas; en las otras
dos, las URL disponibles no pudieron analizarse. En total, 193 URL candidatas
fallaron durante la descarga o el análisis y se excluyeron de la publicación.

La selección es una **heurística de legibilidad**, no una evaluación humana de
la fotografía ni una verificación visual de la especie. Puede favorecer fotos
parecidas de una misma ocurrencia, y no garantiza diversidad de ángulos, sexo o
edad. La búsqueda paginada favorece registros que GBIF devuelve primero. Como
las fotos publicadas siguen alojadas fuera del proyecto, una URL puede dejar de
funcionar después de generar el índice. La ficha muestra el autor enlazado a
la ocurrencia y un enlace a la licencia CC BY de cada imagen.

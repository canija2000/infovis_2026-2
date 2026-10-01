# web/ — Atlas sonoro de aves de Chile

Sitio estático sin build step, en dos páginas enlazadas por la barra superior (`.site-nav`):

- `index.html` · **Visualización** (portada): titular + «el pulso del año» (áreas apiladas de especies
  presentes por mes y clase) + «un punto, una especie» (residentes quietas; visitantes que entran y salen
  del país) + «la ola recorre todo el país» (un mapa por mes, cuatro a la vista y scroll horizontal; un
  punto por zona de 0,2° con datos suficientes, color = ola de verano − ola de invierno respecto de su
  región, tamaño = especie-días; usa `grid_month.json` y `regions.min.geojson`). Un interruptor la cambia a
  «Regiones» (un color por región, desde `region_month.json`). Debajo, «Una región de cerca»: Chile en
  horizontal como selector y los 12 meses de la región elegida como mapa de puntos por clase
  (1 punto ≈ k especie-días, celdas de 0,05°; `data/grid_region/<código>.json`, cargado al elegirla).
- Sonido de la portada: `loop.js`, un loop del año que arranca solo (o con el primer gesto, si el navegador
  lo bloquea). Cada mes = 4 compases de 3 s; en cada compás suenan cantos de las especies presentes en Chile o
  en la región elegida, con 1 a 4 copias según qué tan extendida está la especie (`data/loop.json`,
  `python3 python_scripts/build_loop_data.py`). Pausa, silencio (recordado en `localStorage`) y nota «Cómo se
  compone el sonido» al final. Explorar sigue usando `sonify.js`. Un mes compartido (botones, clic en un gráfico o ▶) mueve
  las vistas y el sonido:
  residentes = colchón; visitantes = cantos de especies presentes ese mes, 1 por cada 12 especies.
  Código en `inicio.js` e `inicio.css`; datos en `data/overview.json`
  (`python3 python_scripts/build_overview_data.py`).
- `explorar.html` · **Explorar**: el atlas completo, descrito abajo.

Explorar usa `styles.css`, `app.js` (vistas e
interacción, D3 v7 desde jsDelivr) y `sonify.js` (sonificación con Web Audio API).
El mezclador permite añadir especies con grabación, escuchar sus clips juntos
y ajustar el volumen de cada pista. El botón de silencio
general también silencia la mezcla. Sus pistas limpias se generan con
`python3 python_scripts/preparar_audio_mixer.py` desde la raíz del repositorio.
El proceso reduce el fondo de los clips con licencia que admite modificaciones;
las grabaciones con licencia ND se identifican como audio original en el selector.
El selector muestra una grilla con la primera foto de `data/images.json`; permite
buscar por nombre común o científico y filtrar por residentes, visitantes de
verano o visitantes de invierno. Un clic en una tarjeta añade la especie al mix.
Por defecto cada canto entra tras una espera aleatoria de 0,2 a 5,2 s y vuelve
a esperar entre repeticiones. «Sincronizar cantos» inicia todas las pistas seleccionadas
en el mismo instante y las repite en ciclos comunes de 6 s; cambiar el modo
reinicia la mezcla. La guía completa está en
[`docs/mezclador-sonoro.md`](../docs/mezclador-sonoro.md).

```bash
cd web && python3 -m http.server 8000   # abrir http://localhost:8000
```

La página carga los datos base derivados de `data/` (~0,9 MB):
`meta.json`, `species.json`, `typical_year.json`, `region_month.json`,
`regions.min.geojson`; el mezclador pide `sounds.json` e `images.json` al
inicializarse y las fichas de especie reutilizan esos datos.
Se regeneran con `python3 python_scripts/build_web_data.py` desde la raíz del repo.
Las candidatas se reúnen con `python3 python_scripts/preparar_imagenes_web.py`;
después `python3 python_scripts/ordenar_imagenes_web.py` analiza hasta 64 por
especie y publica las ocho mejores. Este análisis se ejecuta al preparar los
datos, no en el navegador. Sus dependencias y caché se describen en el README raíz.
La metodología completa está en [`docs/imagenes-especies.md`](../docs/imagenes-especies.md).
El build normal conserva las fotos y vuelve a asociarlas por nombre científico.

`data/observations-*.json`, `data/regions.geojson` y `data/metadata.json` son
la entrada del build (agregado GBIF completo); la web no los descarga.

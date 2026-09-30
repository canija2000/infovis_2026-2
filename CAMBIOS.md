# Cambios e ideas del equipo

Registro compartido de cambios hechos, innovaciones e ideas por explorar.
Agrega una línea numerada por entrada, con tu nombre entre paréntesis.

1. Posible mundo 3D. (Joaquín)
2. Datos para el mundo 3D: `python_scripts/build_game_data.py` genera `web/data/game/` (fichas de especie,
   resumen por región y elenco de aves por región × mes, año típico y 2017–2024, corregido por esfuerzo).
   El juego se desarrollará en un repositorio aparte que consume estos JSON y los cantos de `web/audio/`. (Joaquín)
3. Referencias fotográficas para el mundo 3D: `python_scripts/enrich/fetch_references.py --mvp [--download]`
   busca fotos de las 12 especies del MVP (RM) en iNaturalist (Chile, research grade), Wikimedia Commons y GBIF,
   prefiriendo CC0/CC BY/CC BY-SA. Escribe solo metadatos (autor, licencia, página) en
   `web/data/game/enrich/images.json`; las fotos quedan en `refs/` (gitignored, no se publican: son referencia
   para proporciones y paletas). `refs/INDEX.html` sirve para marcar la vista de cada foto. (Joaquín)
4. Morfología y hábitat: `python_scripts/enrich/join_traits.py` cruza las 551 especies con AVONET (Tobias et al.
   2022, hoja eBird, CC BY 4.0) y EltonTraits 1.0 (Wilman et al. 2014, CC0). Escribe `enrich/morphology.json`
   (medidas en mm y g, proporciones para el modelo, escala relativa al chucao, dieta y estratos de forrajeo) y
   `enrich/habitat.json` (hábitat AVONET → biomas del juego vía `enrich/habitat_map.json`, editable; bioma de la
   RM revisado a mano para el MVP). Cobertura 551/551; 26 nombres resueltos a mano en `enrich/synonyms.json`
   (8 son especies separadas recientemente: se usa la especie madre como aproximación). (Joaquín)
5. Paletas por zona del cuerpo (MVP): `python_scripts/enrich/extract_palette.py` (venv con numpy y Pillow en
   `python_scripts/enrich/.venv`, gitignored) toma 2–3 fotos laterales por especie, un punto anotado a mano por
   zona (`refs/zones.json`, con ayuda de las grillas de `palette_grid.py`), k-means k=3 por muestra, mediana entre
   fotos y cuantizado a 5 bits por canal como `makeTex`. Pico, patas, ojo y algunos acentos se fijan a mano
   (listados en `manual`). Salida `web/data/game/enrich/palette.json` con patrón (barrado/estriado/liso) y dónde va
   el acento; `reviewed: false` hasta revisión humana en `refs/PALETTES.html`. `fetch_references.py` ahora
   conserva la selección entre corridas y con `--refill` reemplaza fotos descartadas (aves muertas, nidos). (Joaquín)
6. Terreno de la RM: `python_scripts/enrich/bake_terrain.py` hornea 4 mini-escenas ("cuartos" unidos por senderos,
   1,4 × 1,4 km, grilla 48×48): ciudad (Cerro Santa Lucía y Parque Forestal), matorral (Aguas de Ramón), río (Maipo en
   Los Morros) y cordillera (La Parva, 2.500–2.900 m). Relieve de AWS Terrain Tiles, cobertura de ESA WorldCover 10 m
   2021 y ríos de OpenStreetMap. Salida `web/data/game/terrain-CL-RM.json` (< 100 KB); preview en
   `refs/terrain_preview.png`. Vegetación y props por escena en `enrich/props_rm.json` (tabla manual). (Joaquín)
7. `build_game_data.py` ahora integra el enriquecimiento: si existe `web/data/game/enrich/<campo>.json` usa ese valor
   (por sciName) en vez de `null` en `habitat`, `morphology` y `palette`, y en `images` reemplaza la URL de búsqueda GBIF
   por las fotos de referencia con licencia. En `index.json` va una versión compacta (proporciones, escala, masa, dieta,
   estratos; medidas crudas quedan en `enrich/`). La RM gana `terrainFile`. `notes`, `source` y `dois` citan AVONET,
   EltonTraits, iNaturalist/Commons, WorldCover, AWS Terrain Tiles y OSM. `index.json`: 414 → 531 KB (+28 %). (Joaquín)
8. Resumen del enriquecimiento del mundo 3D (rama `enrich-referencias`): fotos de referencia con licencia, morfología y
   hábitat de las 551 especies (AVONET + EltonTraits), paletas por zona de las 12 aves del MVP, terreno de 4 mini-escenas
   de la RM y `build_game_data.py` integrando todo en `web/data/game/` sin publicar las fotos. (Joaquín)
9. Agregar imagen/es al perfil de cada especie. (Matías)


10.  [Idea tentativa]
 Agregar sonidos de *background* al recorrido sonoro, para potenciar la distinción entre las distintas estaciones (ej: sonido de viento en otoño y lluvia en invierno). Aunque es importante que no ensucie la experiencia. (Matías)
11. Agregar opciones/botones para que el usuario pueda reproducir sonidos de manera personalizada. Por ej: podría seleccionar varios pájaros de la región de Magallanes y otras especies poco frecuentes en el mismo mix. Además podrían haber mixes predeterminados para centrarse en un ambiente solo de pájaros sedentarios, otro solo de pájaros nómadas, u otro mix interesante. (Matías)

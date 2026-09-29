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

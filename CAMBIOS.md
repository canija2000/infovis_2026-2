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

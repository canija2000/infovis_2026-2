# Cambios e ideas del equipo

Registro compartido de cambios hechos, innovaciones e ideas por explorar.
Agrega una línea numerada por entrada, con tu nombre entre paréntesis.

1. Posible mundo 3D. (Joaquín)
2. Datos para el mundo 3D: `python_scripts/build_game_data.py` genera `web/data/game/` (fichas de especie,
   resumen por región y elenco de aves por región × mes, año típico y 2017–2024, corregido por esfuerzo).
   El juego se desarrollará en un repositorio aparte que consume estos JSON y los cantos de `web/audio/`. (Joaquín)
3. Agregar imagen/es al perfil de cada especie. (Matías)


4.  [Idea tentativa]
 Agregar sonidos de *background* al recorrido sonoro, para potenciar la distinción entre las distintas estaciones (ej: sonido de viento en otoño y lluvia en invierno). Aunque es importante que no ensucie la experiencia. (Matías)
5. Agregar opciones/botones para que el usuario pueda reproducir sonidos de manera personalizada. Por ej: podría seleccionar varios pájaros de la región de Magallanes y otras especies poco frecuentes en el mismo mix. Además podrían haber mixes predeterminados para centrarse en un ambiente solo de pájaros sedentarios, otro solo de pájaros nómadas, u otro mix interesante. (Matías)
6. Fotos: 23 especies cuya foto principal era un ave muerta, piel de museo o libreta ahora usan fotos revisadas de `imagenes_aves_chile`
   (`python_scripts/imagenes_revisadas.json`); la ficha muestra la licencia real de cada foto (algunas CC BY-NC). (Joaquín)

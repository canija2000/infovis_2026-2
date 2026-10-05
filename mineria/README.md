# Minería de datos (IIC2433) — muestras

Pruebas para el proyecto de Minería de Datos con los mismos datos GBIF del atlas.
No forman parte de la web.

## `fenologia_2024.py` — clustering de ciclos anuales (2024)

```bash
python3 mineria/fenologia_2024.py   # requiere gbif/downloads/2024.zip, numpy, shapely, scikit-learn, matplotlib
```

1. **Esfuerzo.** Una *salida* es una celda de ~5 km × día con algún registro (66.064 en 2024).
   Tasa de detección = salidas del mes con la especie / salidas del mes. Corrige que en
   verano sale más gente a observar (`figuras/f1_esfuerzo.png`).
2. **Forma del ciclo.** Curva de 12 meses de cada especie (321 con ≥ 30 salidas), dividida por su
   mejor mes.
3. **Clustering.** K-means con k = 2…8 (silueta) y GMM (BIC) (`f2_eleccion_k.png`). La silueta
   elige k = 2 (residentes vs verano, ARI 0,54 contra las reglas): las curvas forman un gradiente,
   no grupos separados (PCA, `f5_pca.png`). Con k = 5 (`f3_centroides.png`, `f4_heatmap.png`):
   - G1 planas (Zorzal, Chincol): residentes estables;
   - G2 pico en primavera (Golondrina chilena, Chirihue): residentes más detectables en época de cría;
   - G3 pico en invierno (Picaflor chico, Diucón, Viudita): visitantes de invierno **y 49 «residentes»**
     que bajan de la cordillera o se juntan en invierno (migración altitudinal que la escala nacional esconde);
   - G4 verano largo (Fío-fío, Golondrina de dorso negro): migrantes de verano;
   - G5 pico breve en noviembre (Run-run, Pilpilén austral): reproducción o paso.
4. **Validación.** Tabla de contingencia y ARI contra la clase por reglas de `web/data/species.json`
   (`f6_contingencia.png`). Resultados numéricos en `resultados_2024.json`.

Cuidado: la tasa de detección mezcla presencia y **detectabilidad** (cantos en primavera). El Chincol,
residente, se detecta en el 44 % de las salidas en octubre y en el 23 % en febrero.

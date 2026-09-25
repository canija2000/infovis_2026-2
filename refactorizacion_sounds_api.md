# Refactorización: descarga de sonidos desde Xeno-canto

Instrucciones para rehacer `descargar_sonidos.py` (y su integración con
`optimizar_sonidos.py`) para que los cantos sean **representativos de Chile**,
de **buena calidad**, **publicables en GitHub Pages** y con **atribución**
correcta.

## 1. Estado actual

- Selecciona las 25 especies con más `obsCount` a nivel nacional.
- Consulta `https://xeno-canto.org/api/3/recordings?query=sp:"<nombre científico>"&key=<key>`.
- Toma las **3 primeras** grabaciones en el orden que las entrega la API.
- Guarda los audios en `sounds/` (ignorado por Git) y los metadatos en
  `sounds/manifest.json`.
- `optimizar_sonidos.py` convierte a MP3 VBR los archivos PCM que llegan con
  extensión `.mp3`.
- `api-sounds.md` es una respuesta de ejemplo de la API v3 (referencia de campos).

## 2. Problemas detectados

1. **Sin filtro de país.** La Tórtola (*Zenaida auriculata*) quedó con
   grabaciones de Brasil, Ecuador y Francia. Los dialectos y subespecies
   difieren; para un atlas de Chile, debe primar `cnt:chile`.
2. **Sin filtro de tipo.** Entró una grabación `type: "Wingbeat"`. Hay que
   preferir `song` y, en segundo lugar, `call`.
3. **Sin criterio de calidad ni de duración.** Las primeras 3 son arbitrarias;
   hay grabaciones de varios minutos y archivos PCM pesados.
4. **Selección de especies desalineada con la UI.** La web muestra el **top 5
   por región**, pero los sonidos cubren el top 25 nacional: puede haber
   regiones cuyo top 5 no tenga audio.
5. **No publicable.** `sounds/` está fuera de Git, así que GitHub Pages no
   puede servir los audios.
6. **Posible filtración de la key.** `response.raise_for_status()` incluye la
   URL completa (con `key=`) en el mensaje de excepción; si se imprime o
   loguea, la key queda expuesta.
7. **Sin caché de respuestas de la API.** Cada ejecución repite las consultas.
8. **Métrica de selección.** `obsCount` significa "días con registro" (ver
   `instrucciones_re_pull_de_datos.md` §2); sirve para ordenar por
   frecuencia, pero hay que nombrarla correctamente (`reportDays` si ya se
   aplicó la rama `metrica-dias-registro`).

## 3. Diseño propuesto

### 3.1 Selección de especies

- Unión de: **top N por región** (N = 5, igual que la UI) ∪ top K nacional
  (K configurable, p. ej. 25). Guardar en el manifiesto qué regiones usan a
  cada especie.
- Leer los archivos de observaciones desde `web/data/metadata.json`
  (`observationFiles`) si existe; si no, desde `observations-*.json` (glob),
  no desde una lista fija.
- Aceptar `reportDays` u `obsCount` para la métrica.

### 3.2 Consulta con cascada de filtros

Para cada especie, probar niveles en orden y quedarse con el primero que
entregue al menos `--recordings-per-species` candidatos:

| Nivel | Query |
|---|---|
| 1 | `sp:"Genus species" cnt:chile type:song q:A` |
| 2 | `sp:"Genus species" cnt:chile type:song` |
| 3 | `sp:"Genus species" cnt:chile type:call` |
| 4 | `sp:"Genus species" cnt:chile` |
| 5 | `sp:"Genus species" cnt:argentina` (país vecino, mismas poblaciones en muchos casos) |
| 6 | `sp:"Genus species"` (sin filtro de país, marcado como tal) |

**Verifica la sintaxis exacta de v3** en <https://xeno-canto.org/explore/api>
antes de implementar (tags `cnt:`, `type:`, `q:`, `len:`, rangos de calidad
como `q:">C"` y paginación `page`/`per_page`). Si algún tag no existe o
cambia, ajusta la cascada y déjalo documentado. Registra en el manifiesto el
nivel usado (`queryLevel`) y la query sin key.

### 3.3 Ranking local de candidatos

Dentro de lo que devuelve la query:

1. Descartar `type` que contenga `wingbeat`, `flight`, `mechanical`, `drumming`,
   salvo que no haya nada más.
2. Preferir `q` A > B > C; descartar D/E.
3. Preferir `length` entre 5 s y 60 s.
4. Preferir `playback-used: "no"` y `also` vacío o corto (menos especies de fondo).
5. Diversidad: si se piden 3, intentar 1–2 `song` + 1 `call` y distintos grabadores.

### 3.4 Descarga y procesamiento de audio

- Caché de respuestas JSON en `cache_xenocanto/{sciName}_{nivel}.json` (fuera de Git).
- Original descargado en `sounds/raw/` (fuera de Git).
- Integrar la lógica de `optimizar_sonidos.py` en el pipeline: con `ffprobe`
  + `ffmpeg`, generar **clips para la web** en `web/audio/`:
  - recorte de 8–15 s (el tramo de mayor energía, o desde el inicio si es
    más simple), con fade in/out de 0,2 s;
  - mono, 44,1 kHz, MP3 ~64–96 kbps (o `.ogg`/`.m4a` con fallback);
  - presupuesto total < 15 MB para que el repo y Pages sigan livianos.
- Nombre estable: `XC{id}-{sciName_con_guiones}.mp3`. No usar el nombre en
  inglés (`en`) en el archivo.
- Escritura atómica (temporal + `replace`).

### 3.5 Manifiesto para la web

Publicar `web/data/sounds.json` (sin key) con, por especie:

```json
{
  "sciName": "Zenaida auriculata",
  "comName": "Tórtola",
  "regions": ["CL-RM", "CL-VS"],
  "recordings": [
    {
      "id": "1163638",
      "clip": "audio/XC1163638-Zenaida_auriculata.mp3",
      "type": "song",
      "quality": "A",
      "country": "Chile",
      "locality": "…",
      "recordist": "…",
      "license": "https://creativecommons.org/licenses/by-nc-sa/4.0/",
      "sourceUrl": "https://xeno-canto.org/1163638",
      "sonogram": "https://xeno-canto.org/sounds/spectrograms/…/grey-small.png",
      "queryLevel": 1
    }
  ]
}
```

El sonograma (`sono.small`/`sono.med`) puede servir como imagen en el panel
de detalle.

### 3.6 Licencias y atribución

- Todas las grabaciones son CC; muchas son **NC** y/o **ND**. Uso educativo y
  no comercial: OK. **ND**: el recorte o la recodificación pueden considerarse
  obra derivada. Opciones: preferir licencias sin ND en el ranking, o para las
  ND enlazar/servir el archivo original sin recortar. Documenta la decisión.
- La UI debe mostrar junto a cada audio: grabador, `XC{id}` enlazado y la
  licencia.

### 3.7 Seguridad

- Construir la URL con `params=` y **nunca** imprimir `response.url` ni la
  excepción cruda de `requests`; capturar `HTTPError` y mostrar solo el status
  y la query sin key.
- La key se sigue leyendo de `.env` (`api_sounds`); no debe aparecer en el
  manifiesto, en `web/` ni en logs.

## 4. CLI esperada

```bash
python3 descargar_sonidos.py --dry-run                  # especies seleccionadas y regiones que cubren
python3 descargar_sonidos.py --per-region 5 --top 25 --recordings-per-species 2
python3 descargar_sonidos.py --only "Zenaida auriculata"  # reprocesar una especie
python3 descargar_sonidos.py --refresh                  # ignorar caché de la API
```

`--dry-run` debe mostrar, además, qué especies del top 5 de cada región
quedarían sin audio.

## 5. Criterios de aceptación

- [ ] Cada especie del top 5 de cada región tiene ≥ 1 clip, o el faltante
      queda justificado en el reporte final.
- [ ] ≥ 80 % de los clips con `country == "Chile"`; ninguno con tipo no vocal
      si existía alternativa.
- [ ] `web/audio/` < 15 MB en total; cada clip < 500 KB.
- [ ] `web/data/sounds.json` válido y sin key.
- [ ] Reejecutar sin `--refresh` no hace solicitudes nuevas.
- [ ] README actualizado (flujo, licencias, dependencia de `ffmpeg`).
- [ ] `optimizar_sonidos.py` eliminado o reducido a un wrapper del nuevo
      paso, sin lógica duplicada.

## 6. Nota: canto ≠ sonificación

Reproducir el canto de una especie es **detalle bajo demanda**. La rúbrica
del curso pide además **sonificación** de los datos (variar tono, ritmo o
timbre según valores). Los clips pueden usarse como timbre dentro de esa
sonificación, pero no la reemplazan. Ver `propuesta_mejoras.md`.

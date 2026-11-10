// Tabla de escala del mundo (estilo Ocarina of Time): 1 unidad = 1 metro.
// Poroto mide ~1 m (models/poroto.glb ya viene en metros). Las aves y la vegetación siguen proporciones
// reales, con dos licencias de diseño: las aves se exageran con un mismo factor para que se lean junto a
// Poroto, y los árboles se estilizan un poco más bajos que en la realidad para que quepan en cámara.

// Aves: largo real estimado desde la masa (morphology.scale = raíz cúbica de la masa relativa al chucao,
// cuyo largo es ~0,26 m) × exageración. El modelo de bird.js mide ~3,6 unidades de pico a cola a escala 1.
export const BIRD_REF_LENGTH = 0.26;
export const BIRD_EXAGGERATION = 1.75;
export const BIRD_MODEL_LENGTH = 3.6;
export const BIRD_PICK_RADIUS = 0.35; // radio mínimo (m) del área para hacer clic en un ave

// Cuerpos densos: a igual masa son más cortos (patos, cisnes, ñandú, pingüinos).
const DENSE = { pato: 0.85, cisne: 0.9, nandu: 0.7, pinguino: 0.85 };

export function birdScale(sp, plan) {
  // la estimación desde la masa sobreestima a las aves pesadas (pilpilén, gaviotas, cóndor): a ellas se les
  // exagera menos y el largo crece más lento que la raíz cúbica de la masa (si no, quedan gigantes)
  const k = sp.morphology?.scale ?? 1;
  const exag = Math.max(1.1, Math.min(BIRD_EXAGGERATION, BIRD_EXAGGERATION - 0.25 * (k - 1)));
  const len = BIRD_REF_LENGTH * (k > 1 ? k ** 0.85 : k) * exag * (DENSE[plan] ?? 1);
  return Math.max(0.05, Math.min(0.8, len / BIRD_MODEL_LENGTH));
}

// Altura objetivo (m) de cada prop de scene.js. El factor de escala se calcula contra su altura actual
// (el valor `perch` del catálogo, o `natural` si no tiene percha). Edificios: ancho objetivo en `width`.
export const PROP_SIZE = {
  platano_oriental: 11, palma_chilena: 9, pimiento: 6.5, quillay: 8, litre: 4.5, peumo: 8, maiten: 7,
  sauce_chileno: 8, espino: 3.5, boldo: 2.4, zarzamora: 1.3, quisco: 2.2, eucalipto: 15, lenga: 11, nirre: 4,
  calafate: 1.5, mata_negra: 0.9, hierba_blanca: 0.8, chagual: 2.8,
  roca: 1.0, roca_cerro: 1.6, bolones: 0.6, roca_andina: 1.4, roca_costa: 1.6, llareta: 0.5,
  coiron: { natural: 0.8, h: 0.7 }, totora: 2.0, flores_altura: 0.35,
  doca: { natural: 0.2, h: 0.25 }, madriguera: { natural: 0.25, h: 0.4 }, tronco_caido: 0.8,
  banca_farol: 3.2, muelle: 1.6,
  olivo: 4.5, algarrobo: 6, brea: 1.4, tola: 0.6, quenoa: 3, paja_brava: { natural: 0.8, h: 0.7 },
  coigue: 14, ulmo: 11, arrayan: 6, canelo: 8, nalca: 1.6, quila: { natural: 1.6, h: 2.2 }, helecho: { natural: 0.7, h: 0.8 },
  edificio: { width: 9 }, casa_color: { width: 6 },
};

export function propFactor(id, kind) {
  if (kind.real) return 1; // pieza modelada a tamaño real (blender/pueblo_build.py)
  const t = PROP_SIZE[id];
  if (t == null) return 1;
  if (typeof t === 'number') return kind.perch ? t / kind.perch : 1;
  if (t.width) return t.width / (id === 'edificio' ? 1.8 : 1.6);
  return t.h / t.natural;
}

// Relieve máximo de una escena (m): colinas caminables, no cerros.
export const MAX_RELIEF = 8;

// Cámara en tercera persona, cercana a Poroto.
// La cámara va baja, casi a la altura de los ojos de Poroto (≈0,7 m), y lo sigue por detrás.
export const CAMERA = {
  scene: { dist: 5, pitch: 0.2 }, hub: { dist: 9, pitch: 0.55, yaw: Math.PI }, // en el menú, desde el oeste: el camino y los portales detrás de Poroto
  minDist: 2.5, maxDist: 14, minPitch: 0.05, maxPitch: 1.25, targetY: 0.75,
  follow: 1.6, // rad/s con que la cámara se acomoda detrás de Poroto cuando camina hacia adelante
};
export const PORORO_BUBBLE_Y = 1.45; // altura del globito de diálogo sobre los pies

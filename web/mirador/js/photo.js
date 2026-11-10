// Juego: fotografiar aves (puntaje por encuadre, tamaño y acción) y el pasaporte de regiones (sellos de
// bronce, plata y oro). Todo se guarda en el navegador (localStorage): es progreso de quien juega.
/* global THREE */

// ------------------------------------------------------------------ almacenamiento
const KEY = { album: 'aviario.album', seen: 'aviario.vistas', regions: 'aviario.regiones' };
const read = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

export const progress = {
  album: read(KEY.album, {}), // sid → { img, score, stars, region, month, year, tags }
  seen: read(KEY.seen, {}), // código de región → [sid] vistas ahí
  regions: read(KEY.regions, {}), // código de región → [sid] destacadas (se anota al visitarla)
};

export function rememberRegion(code, sids) { progress.regions[code] = sids; write(KEY.regions, progress.regions); }

// Anota una especie vista en una región. Devuelve true si es nueva para esa región.
export function markSeen(code, sid) {
  const s = new Set(progress.seen[code] || []);
  if (s.has(sid)) return false;
  s.add(sid); progress.seen[code] = [...s]; write(KEY.seen, progress.seen);
  return true;
}

// ------------------------------------------------------------------ sellos del pasaporte
// bronce: un tercio de las destacadas vistas · plata: todas vistas · oro: todas fotografiadas con ★★ o más
export const TIERS = [
  { id: 'bronce', label: 'Bronce', color: '#c98a4a', need: 'un tercio de sus aves destacadas' },
  { id: 'plata', label: 'Plata', color: '#c8d0dc', need: 'todas sus aves destacadas' },
  { id: 'oro', label: 'Oro', color: '#f4d35e', need: 'una foto ★★ de cada destacada' },
];
export function regionStatus(code) {
  const feat = progress.regions[code];
  if (!feat) return null; // sin visitar
  const seen = new Set(progress.seen[code] || []);
  const nSeen = feat.filter(s => seen.has(s)).length;
  const nPhoto = feat.filter(s => (progress.album[s]?.stars ?? 0) >= 2).length;
  const n = feat.length;
  let tier = -1;
  if (n && nSeen >= Math.ceil(n / 3)) tier = 0;
  if (n && nSeen === n) tier = 1;
  if (n && nPhoto === n) tier = 2;
  return { n, nSeen, nPhoto, tier, stamp: TIERS[tier] || null };
}

// ------------------------------------------------------------------ puntaje de una foto
// Para cada ave en cuadro: tamaño aparente (llena ~¼ de la altura = máximo), cercanía al centro y si
// está cantando o volando. Se queda con la mejor; un ave tapada por el terreno no cuenta.
const _p = new THREE.Vector3(), _ray = new THREE.Raycaster();
export function scorePhoto(agents, camera, ground) {
  let best = null;
  const tanHalf = Math.tan(camera.fov * Math.PI / 360);
  for (const a of agents) {
    if (a.state === 'wait' || a.gone) continue;
    const h = (a.m.height ?? 2.5) * a.s;
    _p.copy(a.m.group.position); _p.y += h * 0.5;
    const d = camera.position.distanceTo(_p);
    const world = _p.clone();
    _p.project(camera);
    if (_p.z > 1 || Math.abs(_p.x) > 0.92 || Math.abs(_p.y) > 0.92) continue;
    if (ground) {
      _ray.set(camera.position, world.clone().sub(camera.position).normalize());
      const hit = _ray.intersectObject(ground, false)[0];
      if (hit && hit.distance < d - 0.3) continue;
    }
    const size = Math.max(h, 3.6 * a.s * 0.6) / (2 * d * tanHalf); // fracción de la altura del cuadro
    const fill = Math.min(1, size / 0.25);
    const center = 1 - Math.min(1, Math.hypot(_p.x, _p.y) / 0.92);
    const tags = [];
    let bonus = 0;
    if (a.singing) { bonus += 0.15; tags.push('cantando'); }
    if (a.state === 'fly' || a.state === 'hover') { bonus += 0.15; tags.push(a.state === 'hover' ? 'suspendido en el aire' : 'en vuelo'); }
    if (a.cls === 'ocasional') { bonus += 0.1; tags.push('rara'); }
    const score = Math.round(Math.min(1, 0.55 * fill + 0.35 * center + bonus + (fill > 0.15 ? 0.05 : 0)) * 100);
    if (!best || score > best.score) best = { agent: a, score, tags };
  }
  if (best) best.stars = best.score >= 75 ? 3 : best.score >= 45 ? 2 : 1;
  return best;
}
export const starText = n => '★'.repeat(n) + '☆'.repeat(3 - n);

// Recorta el centro del lienzo 3D (4:3) a una miniatura. Llamar justo después de renderer.render().
export function captureThumb(canvas, w = 160, h = 120) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  const sw = Math.min(canvas.width, canvas.height * 4 / 3), sh = sw * 3 / 4;
  g.drawImage(canvas, (canvas.width - sw) / 2, (canvas.height - sh) / 2, sw, sh, 0, 0, w, h);
  return cv.toDataURL('image/jpeg', 0.82);
}

// Guarda la foto si es la primera de la especie o mejor que la anterior. Devuelve 'nueva', 'mejor' o 'peor'.
export function savePhoto(sid, entry) {
  const old = progress.album[sid];
  if (old && old.score >= entry.score) return 'peor';
  progress.album[sid] = entry;
  if (!write(KEY.album, progress.album)) { // sin espacio: se queda en memoria esta sesión
    console.warn('No se pudo guardar el álbum en el navegador');
  }
  return old ? 'mejor' : 'nueva';
}

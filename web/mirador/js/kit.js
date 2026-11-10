// Kit de piezas modeladas en Blender (blender/kit_build.py → models/kit/*.glb): roca, árbol de copa, espino,
// arbusto y pasto. Se cargan una vez al inicio; scene.js arma con ellas las especies del catálogo
// (cada especie = una pieza + color + tamaño), en vez de las formas procedurales de antes.
/* global THREE */

export const KIT_PIECES = ['roca', 'arbol_copa', 'espino', 'arbusto', 'pasto', 'ave_partes',
  // geometría CC0 de Kenney re-texturizada al estilo N64 (blender/kenney_build.py)
  'palma_chilena', 'quisco', 'eucalipto', 'sauce_chileno', 'lenga', 'nirre', 'tronco_caido', 'flores_altura', 'chagual', 'totora',
  // pueblo (blender/pueblo_build.py)
  'casa_color', 'edificio', 'banca_farol', 'muelle'];
export const KIT = {}; // id → { meshes: [{ name, geometry, map, alpha }], variants?: [[...]] }

function loadGLTF(url) {
  return new Promise((resolve, reject) => new THREE.GLTFLoader().load(url, resolve, undefined, reject));
}

// Geometría con la transformación de su nodo ya aplicada (relativa a la raíz de la pieza).
function bake(mesh, offset) {
  mesh.updateWorldMatrix(true, false);
  const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  if (offset) g.translate(-offset.x, 0, -offset.z);
  return g;
}

function entry(mesh, offset) {
  const src = mesh.material;
  const map = src.map || null;
  if (map) { map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter; }
  return { name: mesh.name, geometry: bake(mesh, offset), map, alpha: src.transparent || src.alphaTest > 0 || /borde|pasto/.test(src.name), material: src.name };
}

export async function loadKit(base = 'models/kit/') {
  const results = await Promise.allSettled(KIT_PIECES.map(id => loadGLTF(`${base}${id}.glb`)));
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled') { console.warn('kit: no se pudo cargar', KIT_PIECES[i], r.reason); return; }
    const id = KIT_PIECES[i], scene = r.value.scene;
    scene.updateMatrixWorld(true);
    if (id === 'roca') {
      // cada hijo es una variante de forma, centrada en el origen
      const variants = [];
      scene.traverse(o => { if (o.isMesh) variants.push([entry(o, o.getWorldPosition(new THREE.Vector3()))]); });
      KIT[id] = { variants };
    } else {
      const meshes = [];
      scene.traverse(o => { if (o.isMesh) meshes.push(entry(o)); });
      KIT[id] = { meshes };
    }
  });
  return KIT;
}

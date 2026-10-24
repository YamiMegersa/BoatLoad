import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merge static meshes under `root` into one mesh per (bucket, material, shadow flags).
 *
 * A mesh is merged only if it is "plain static": single material, not instanced/skinned,
 * empty userData (no noWalk / interaction tags), not in `keep`, and not under any
 * `excludeSubtrees` node. Everything else is left untouched so animation, raycast
 * interaction and walkability logic keep working.
 *
 * @param {THREE.Object3D} root
 * @param {object} opts
 * @param {THREE.Object3D[]} [opts.excludeSubtrees] animated/interactive nodes whose descendants must stay separate
 * @param {Set<THREE.Object3D>} [opts.keep] specific meshes to keep
 * @param {THREE.Object3D[]} [opts.buckets] containers (e.g. shop group) whose meshes merge into a mesh parented to that container
 * @returns {{before:number, after:number}}
 */
export function mergeStaticMeshes(root, opts = {}) {
  const exclude = new Set((opts.excludeSubtrees || []).filter(Boolean));
  const keep = opts.keep || new Set();
  const buckets = (opts.buckets || []).filter(Boolean);

  root.updateMatrixWorld(true);

  const isExcluded = (obj) => {
    for (let n = obj; n; n = n.parent) {
      if (exclude.has(n)) return true;
      if (n === root) break;
    }
    return false;
  };

  const bucketOf = (obj) => {
    for (let n = obj.parent; n; n = n.parent) {
      if (buckets.includes(n)) return n;
      if (n === root) break;
    }
    return root;
  };

  const groups = new Map(); // key -> { bucket, material, cast, receive, geos:[] , meshes:[] }
  let before = 0;

  root.traverse((obj) => {
    if (!obj.isMesh || obj.isInstancedMesh || obj.isSkinnedMesh) return;
    before++;
    if (keep.has(obj) || isExcluded(obj)) return;
    if (!obj.visible || Array.isArray(obj.material) || !obj.material) return;
    if (obj.material.visible === false) return;
    const ud = Object.keys(obj.userData || {});
    const noWalk = ud.length === 1 && ud[0] === 'noWalk' && obj.userData.noWalk === true;
    if (ud.length > 0 && !noWalk) return;
    if (!obj.geometry || !obj.geometry.attributes.position) return;

    const geo = obj.geometry;
    const sig = Object.keys(geo.attributes).sort().join(',') + (geo.index ? '|i' : '|n');
    const bucket = bucketOf(obj);
    const key = `${bucket.uuid}|${obj.material.uuid}|${obj.castShadow ? 1 : 0}${obj.receiveShadow ? 1 : 0}|${noWalk ? 'nw' : 'w'}|${sig}`;
    let g = groups.get(key);
    if (!g) {
      g = { bucket, material: obj.material, cast: obj.castShadow, receive: obj.receiveShadow, noWalk, geos: [], meshes: [] };
      groups.set(key, g);
    }
    g.meshes.push(obj);
  });

  const inv = new THREE.Matrix4();
  const rel = new THREE.Matrix4();
  let after = before;

  for (const g of groups.values()) {
    if (g.meshes.length < 2) continue;
    g.bucket.updateMatrixWorld(true);
    inv.copy(g.bucket.matrixWorld).invert();
    const geos = [];
    for (const m of g.meshes) {
      rel.multiplyMatrices(inv, m.matrixWorld);
      const cloned = m.geometry.clone();
      cloned.applyMatrix4(rel);
      geos.push(cloned);
    }
    const merged = mergeGeometries(geos, false);
    geos.forEach((x) => x.dispose());
    if (!merged) continue;
    if (typeof merged.computeBoundsTree === 'function') merged.computeBoundsTree();

    const mesh = new THREE.Mesh(merged, g.material);
    mesh.name = 'MergedStatic';
    mesh.castShadow = g.cast;
    mesh.receiveShadow = g.receive;
    if (g.noWalk) mesh.userData.noWalk = true;
    mesh.matrixAutoUpdate = false;
    g.bucket.add(mesh);
    mesh.updateMatrix();

    for (const m of g.meshes) {
      if (m.parent) m.parent.remove(m);
    }
    after -= g.meshes.length - 1;
  }

  return { before, after };
}

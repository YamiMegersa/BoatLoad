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
function getMaterialKey(mat) {
  if (!mat) return 'nomat';
  if (mat.map) return `map_${mat.map.id || mat.uuid}`;
  const c = mat.color ? mat.color.getHexString() : '';
  const em = mat.emissive ? mat.emissive.getHexString() : '';
  const op = mat.transparent ? mat.opacity : 1;
  return `${mat.type}|${c}|${mat.roughness}|${mat.metalness}|${op}|${em}|${Boolean(mat.wireframe)}`;
}

export function mergeStaticMeshes(root, opts = {}) {
  const exclude = new Set((opts.excludeSubtrees || []).filter(Boolean));
  const keep = opts.keep || new Set();
  const buckets = (opts.buckets || []).filter(Boolean);

  root.updateMatrixWorld(true);

  const isExcluded = (obj) => {
    for (let n = obj; n; n = n.parent) {
      if (exclude.has(n) || n.visible === false) return true;
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

  const groups = new Map(); // key -> { bucket, material, cast, receive, noWalk, meshes:[] }
  let before = 0;

  root.traverse((obj) => {
    if (!obj.isMesh || obj.isInstancedMesh || obj.isSkinnedMesh) return;
    before++;
    if (keep.has(obj) || isExcluded(obj)) return;
    if (!obj.visible || Array.isArray(obj.material) || !obj.material) return;
    if (obj.material.visible === false) return;

    // Filter userData: keep interactive targets separate
    const ud = Object.keys(obj.userData || {});
    const isInteractive = ud.some(k => k === 'isNPC' || k === 'isBunny' || k === 'isGhostMerchant');
    if (isInteractive) return;

    if (!obj.geometry || !obj.geometry.attributes.position) return;

    const noWalk = Boolean(obj.userData?.noWalk);
    const cast = (obj.material.transparent || obj.material.wireframe) ? false : Boolean(obj.castShadow);
    const receive = Boolean(obj.receiveShadow);
    const matKey = getMaterialKey(obj.material);
    const bucket = bucketOf(obj);

    const key = `${bucket.uuid}|${matKey}|${cast ? 1 : 0}${receive ? 1 : 0}|${noWalk ? 'nw' : 'w'}`;
    let g = groups.get(key);
    if (!g) {
      g = { bucket, material: obj.material, cast, receive, noWalk, meshes: [] };
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
      if (!cloned.attributes.normal) cloned.computeVertexNormals();
      if (!cloned.attributes.uv && cloned.attributes.position) {
        const uvs = new Float32Array(cloned.attributes.position.count * 2);
        cloned.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      }
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

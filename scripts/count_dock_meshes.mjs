// Headless check: builds the real DockStall with real three.js and reports mesh counts after static merge.
const mkCtx = () => new Proxy({}, {
  get: (t, k) => k === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) })
    : k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) })
    : k === 'measureText' ? () => ({ width: 10 })
    : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} })
    : (typeof k === 'string' ? (t[k] ?? (() => {})) : undefined),
  set: (t, k, v) => { t[k] = v; return true; }
});
globalThis.document = {
  createElementNS: () => ({ style: {}, addEventListener() {}, removeEventListener() {}, set src(v) {} }),
  createElement: () => ({ width: 64, height: 64, style: {}, getContext: () => mkCtx(), addEventListener() {} })
};
globalThis.window = { innerWidth: 1920, innerHeight: 1080, location: { search: '?debug' } };

const { DockStall } = await import('../src/environment/DockStall.js');
const ds = new DockStall();
ds.build();
let meshes = 0, merged = 0, items = 0;
ds.group.traverse(o => {
  if (o.isMesh) {
    meshes++; items += Array.isArray(o.material) ? o.material.length : 1;
    if (o.name === 'MergedStatic') merged++;
  }
});
console.log(JSON.stringify({ totalMeshesAfterMerge: meshes, mergedMeshes: merged, drawItems: items }));

const why = {}; ds.group.traverse(o => { if (o.isMesh && o.name !== 'MergedStatic') { const k = o.isInstancedMesh ? 'instanced' : Array.isArray(o.material) ? 'multimat' : Object.keys(o.userData).sort().join(',') || (o.castShadow ? 'plain' : 'plain-noshadow'); why[k] = (why[k] || 0) + 1; } }); console.log(JSON.stringify(why));

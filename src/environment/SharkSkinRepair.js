import * as THREE from 'three';

/**
 * SharkSkinRepair
 *
 * The shark.glb has per-vertex JOINTS_0 / WEIGHTS_0 data (the mesh IS
 * weight-painted) but the GLTF "skins" array was never written during export.
 * Three.js therefore loads the mesh as a plain static Mesh and ignores the
 * skinning data.
 *
 * Analysis of the binary data shows:
 *   - ALL 9780 vertices use joint index 8 with weight 1.0
 *   - Joint index 8 corresponds to node[8] = "Tail" (by GLTF node-index order)
 *   - The whole mesh deforms as a single rigid piece driven by the Tail bone
 *
 * This module reconstructs the skin at runtime so Three.js can animate it.
 */
export class SharkSkinRepair {
  /**
   * @param {THREE.Group} sharkScene  A clone of fishModel.scene (not yet parented to any live scene)
   * @returns {{ skinnedMesh: THREE.SkinnedMesh, tailBone: THREE.Object3D } | null}
   */
  static repair(sharkScene) {
    // -----------------------------------------------------------------------
    // 1. Add to a dummy scene so matrixWorld is computed from rest pose
    //    transforms embedded in the GLTF nodes.
    // -----------------------------------------------------------------------
    const dummy = new THREE.Scene();
    dummy.add(sharkScene);
    dummy.updateMatrixWorld(true);

    // -----------------------------------------------------------------------
    // 2. Locate the static mesh and the Tail bone node
    // -----------------------------------------------------------------------
    let staticMesh = null;
    let tailNode   = null;

    sharkScene.traverse(c => {
      if (c.isMesh && !c.isSkinnedMesh && c.geometry) staticMesh = c;
      if (c.name === 'Tail') tailNode = c;
    });

    if (!staticMesh || !tailNode) {
      console.warn('[SharkSkinRepair] Required nodes not found — skipping.');
      dummy.remove(sharkScene);
      return null;
    }

    // -----------------------------------------------------------------------
    // 3. Create a new THREE.Bone that mirrors the Tail node's rest-pose
    //    world transform.  We create a FRESH bone (rather than prototype-
    //    swapping the existing node) and add it to sharkScene so its
    //    matrixWorld stays in sync with sharkScene's movement.
    // -----------------------------------------------------------------------
    const tailBone = new THREE.Bone();
    tailBone.name = 'TailBone_repaired';

    // Copy rest-pose world position / rotation / scale into local space.
    // Because sharkScene is at identity in the dummy scene, local == world.
    tailNode.getWorldPosition(tailBone.position);
    tailNode.getWorldQuaternion(tailBone.quaternion);
    tailNode.getWorldScale(tailBone.scale);

    sharkScene.add(tailBone);
    dummy.updateMatrixWorld(true); // propagate so tailBone.matrixWorld is valid

    // -----------------------------------------------------------------------
    // 4. Build a 9-bone skeleton.
    //    JOINTS_0 values in the mesh are 0 (unused, weight 0) and 8 (the real
    //    joint).  We need at least 9 entries; bones[8] = our tailBone.
    //    The other slots get dummy bones positioned at the same place so any
    //    stray zero-weight references are harmless.
    // -----------------------------------------------------------------------
    const bones = [];
    for (let i = 0; i < 9; i++) {
      if (i === 8) {
        bones.push(tailBone);
      } else {
        const d = new THREE.Bone();
        d.name = `dummy_${i}`;
        // Position at tailBone so identity-weight refs produce no offset
        d.position.copy(tailBone.position);
        sharkScene.add(d);
        bones.push(d);
      }
    }

    dummy.updateMatrixWorld(true);

    const skeleton = new THREE.Skeleton(bones);

    // -----------------------------------------------------------------------
    // 5. Create a SkinnedMesh from the static mesh's geometry + material
    // -----------------------------------------------------------------------
    const skinnedMesh = new THREE.SkinnedMesh(
      staticMesh.geometry,
      staticMesh.material
    );
    skinnedMesh.name          = 'Shark_skinned';
    skinnedMesh.castShadow    = true;
    skinnedMesh.receiveShadow = true;
    skinnedMesh.frustumCulled = false; // bones can push verts outside rest AABB

    // Keep the same local transform as the original mesh node
    skinnedMesh.position.copy(staticMesh.position);
    skinnedMesh.quaternion.copy(staticMesh.quaternion);
    skinnedMesh.scale.copy(staticMesh.scale);

    // -----------------------------------------------------------------------
    // 6. Swap the static mesh for the skinned mesh in the scene graph
    // -----------------------------------------------------------------------
    const meshParent = staticMesh.parent;
    if (meshParent) {
      meshParent.add(skinnedMesh);
      meshParent.remove(staticMesh);
    }

    dummy.updateMatrixWorld(true);

    // -----------------------------------------------------------------------
    // 7. Bind.
    //    bind(skeleton) calls skeleton.calculateInverses() which stores
    //    inverse(bone.matrixWorld) for each bone — computed NOW while
    //    every bone is in its rest pose.  This gives the correct inverse-
    //    bind matrices so that rotating tailBone later produces a delta
    //    rotation around the tail pivot, not the world origin.
    // -----------------------------------------------------------------------
    skinnedMesh.bind(skeleton);

    // -----------------------------------------------------------------------
    // 8. Remove from dummy scene.  sharkScene (with tailBone inside) will be
    //    added to the real THREE.Scene by the caller.
    // -----------------------------------------------------------------------
    dummy.remove(sharkScene);

    return { skinnedMesh, tailBone, skeleton };
  }
}

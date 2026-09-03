import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { FishAnimator }    from './FishAnimator.js';

export class EnvironmentManager {
  constructor() {
    this._scene      = null;
    this._fishModels = null;
    this._sharks     = [];
  }

  /**
   * @param {THREE.Scene} scene
   * @param {object[]}    fishModels  - Array of GLTF objects from LevelConfig
   */
  init(scene, fishModels) {
    this._scene      = scene;
    this._fishModels = fishModels;
    this._sharks     = [];

    if (this._fishModels && this._fishModels.length > 0) {
      for (let i = 0; i < 15; i++) {
        // 30% chance to spawn a school of 3-5 fish
        if (Math.random() < 0.3) {
          const schoolSize = 3 + Math.floor(Math.random() * 3);
          const baseX = (Math.random() - 0.5) * 400; // 200 radius
          const baseY = -4 - Math.random() * 4;
          const baseZ = (Math.random() - 0.5) * 400;
          const baseYaw = Math.random() * Math.PI * 2;
          const fishModel = this._fishModels[Math.floor(Math.random() * this._fishModels.length)];
          
          for(let j = 0; j < schoolSize; j++) {
            this._spawnShark(
              fishModel, 
              baseX + (Math.random() - 0.5) * 4, 
              baseY + (Math.random() - 0.5) * 2, 
              baseZ + (Math.random() - 0.5) * 4, 
              baseYaw + (Math.random() - 0.5) * 0.4
            );
          }
        } else {
          this._spawnShark();
        }
      }
    }
  }

  _spawnShark(model = null, px = null, py = null, pz = null, yaw = null) {
    const fishModel = model || this._fishModels[Math.floor(Math.random() * this._fishModels.length)];
    // Clone the scene (preserves hierarchy but bones become plain Object3Ds)
    const mesh = SkeletonUtils.clone(fishModel.scene);

    // Place + orient randomly around the play area, or use provided school base
    const x = px !== null ? px : (Math.random() - 0.5) * 400;
    const y = py !== null ? py : -4 - Math.random() * 4;
    const z = pz !== null ? pz : (Math.random() - 0.5) * 400;
    const ry = yaw !== null ? yaw : Math.random() * Math.PI * 2;
    
    mesh.position.set(x, y, z);
    mesh.rotation.set((Math.random() - 0.5) * 0.1, ry, 0);

    // Apply the pre-computed normalisation scale with slight random variation
    // Only scale down (0.4 to 1.0 of the base scale)
    const baseScale = fishModel.normSharkScale * (0.4 + Math.random() * 0.6);
    mesh.scale.setScalar(baseScale);

    mesh.traverse(c => {
      if (c.isMesh || c.isSkinnedMesh) {
        c.castShadow    = true;
        c.receiveShadow = true;
        c.frustumCulled = false; // prevent pop-in when bones push verts out of rest AABB
      }
    });

    this._scene.add(mesh);

    const speed     = 2.0 + Math.random() * 2.5;
    const animator  = new FishAnimator(mesh, 0.8 + Math.random() * 0.4);

    this._sharks.push({
      mesh,
      animator,
      speed,
      baseY:   mesh.position.y,
      baseYaw: mesh.rotation.y,
    });
  }

  update(delta) {
    for (const shark of this._sharks) {
      shark.animator.update(delta);

      // Apply the bob offset from the animator on top of the fixed baseY
      shark.mesh.position.y = shark.baseY + shark.animator.bobOffset;
      shark.mesh.rotation.y = shark.baseYaw + shark.animator.yawOffset;

      // Swim forward
      shark.mesh.translateZ(shark.speed * delta);

      // Wrap around the play area (200 radius = -200 to 200)
      const p = shark.mesh.position;
      if (p.z >  200) p.z -= 400;
      if (p.z < -200) p.z += 400;
      if (p.x >  200) p.x -= 400;
      if (p.x < -200) p.x += 400;
    }
  }

  dispose() {
    for (const shark of this._sharks) {
      this._scene?.remove(shark.mesh);
    }
    this._sharks = [];
  }
}

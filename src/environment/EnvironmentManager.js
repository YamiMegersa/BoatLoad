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
      for (let i = 0; i < 8; i++) {
        this._spawnShark();
      }
    }
  }

  _spawnShark() {
    const fishModel = this._fishModels[Math.floor(Math.random() * this._fishModels.length)];
    // Clone the scene (preserves hierarchy but bones become plain Object3Ds)
    const mesh = SkeletonUtils.clone(fishModel.scene);

    // Place + orient randomly around the play area
    mesh.position.set(
      (Math.random() - 0.5) * 60,
      -4 - Math.random() * 4,      // −4 to −8 below surface
      (Math.random() - 0.5) * 60
    );
    mesh.rotation.set(
      (Math.random() - 0.5) * 0.1,
      Math.random() * Math.PI * 2,
      0
    );

    // Apply the pre-computed normalisation scale with slight random variation
    const baseScale = fishModel.normSharkScale * (0.8 + Math.random() * 0.4);
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

      // Swim forward (local −Z is the shark's nose direction after Blender export)
      shark.mesh.translateZ(-shark.speed * delta);

      // Wrap around the play area
      const p = shark.mesh.position;
      if (p.z >  60) p.z -= 120;
      if (p.z < -60) p.z += 120;
      if (p.x >  60) p.x -= 120;
      if (p.x < -60) p.x += 120;
    }
  }

  dispose() {
    for (const shark of this._sharks) {
      this._scene?.remove(shark.mesh);
    }
    this._sharks = [];
  }
}

import * as THREE from 'three';
import { emit } from '../core/EventBus.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { FishAnimator } from './FishAnimator.js';
import { WindParticles } from './WindParticles.js';
import { RainManager } from './RainManager.js';
import { FogVolume } from './FogVolume.js';
import { StormClouds } from './StormClouds.js';

export class EnvironmentManager {
  constructor() {
    this._scene = null;
    this._fishModels = null;
    this._sharks = [];
    this._windParticles = null;
    this._rainManager = null;
    this._fogVolume = null;
    this._stormClouds = null;
    this._isDenseFog = false;
  }

  /**
   * @param {THREE.Scene} scene
   * @param {object[]}    fishModels  - Array of GLTF objects from LevelConfig
   */
  init(scene, fishModels, qteSystem) {
    this._scene = scene;
    this._fishModels = fishModels;
    this.qteSystem = qteSystem;
    this._sharks = [];

    // Enable true depth-based fog to obscure objects like islands and the ship
    scene.fog = new THREE.FogExp2(0x1a2430, 0.006);

    this._windParticles = new WindParticles(scene);
    this._rainManager = new RainManager(scene);
    this._fogVolume = new FogVolume(scene);
    this._stormClouds = new StormClouds(scene);

    if (this._fishModels && this._fishModels.length > 0) {
      for (let i = 0; i < 15; i++) {
        // 30% chance to spawn a school of 3-5 fish
        if (Math.random() < 0.3) {
          const schoolSize = 3 + Math.floor(Math.random() * 3);
          const baseX = (Math.random() - 0.5) * 60;
          const fishModel = this._getRandomFishModel();
          const baseY = fishModel.isShark ? -1.0 : -3.0 - Math.random() * 5.0;
          const baseZ = (Math.random() - 0.5) * 60;
          const baseX = (Math.random() - 0.5) * 400; // 200 radius
          const baseY = -4 - Math.random() * 4;
          const baseZ = (Math.random() - 0.5) * 400;
          const baseYaw = Math.random() * Math.PI * 2;

          for (let j = 0; j < schoolSize; j++) {
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

  _getRandomFishModel() {
    if (!this._fishModels || this._fishModels.length === 0) return null;

    // 60% chance to force a shark spawn
    if (Math.random() < 0.6) {
      const shark = this._fishModels.find(m => m.isShark);
      if (shark) return shark;
    }

    // Otherwise pick completely randomly
    return this._fishModels[Math.floor(Math.random() * this._fishModels.length)];
  }

  _spawnShark(model = null, px = null, py = null, pz = null, yaw = null) {
    const fishModel = model || this._getRandomFishModel();
    // Clone the scene (preserves hierarchy but bones become plain Object3Ds)
    const mesh = SkeletonUtils.clone(fishModel.scene);

    // Place + orient randomly around the play area, or use provided school base
    const x = px !== null ? px : (Math.random() - 0.5) * 60;
    const y = py !== null ? py : (fishModel.isShark ? -1.0 : -3.0 - Math.random() * 5.0);
    const z = pz !== null ? pz : (Math.random() - 0.5) * 60;
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
        c.castShadow = true;
        c.receiveShadow = true;
        c.frustumCulled = false; // prevent pop-in when bones push verts out of rest AABB
      }
    });

    this._scene.add(mesh);

    const speed = 2.0 + Math.random() * 2.5;
    const animator = new FishAnimator(mesh, 0.8 + Math.random() * 0.4);

    this._sharks.push({
      mesh,
      animator,
      speed,
      baseY: mesh.position.y,
      baseYaw: mesh.rotation.y,
      baseScale: baseScale,
      qteTriggered: false,
      shrinking: false,
      hitPending: false,
      hitDelay: 0,
      flashing: false,
      flashTimer: 0,
      sinking: false,
      isShark: fishModel.isShark
    });
  }

  update(delta, playerShip) {
    const toRemove = [];
    update(delta, windManager, shipPos) {
      if (this._windParticles) {
        this._windParticles.update(delta, windManager);
      }

      const localWind = shipPos ? windManager.getWindAt(shipPos.x, shipPos.z) : new THREE.Vector3(0, 0, -1);
      if (this._rainManager) this._rainManager.update(delta, shipPos, localWind);
      if (this._fogVolume) this._fogVolume.update(delta, shipPos, localWind);
      if (this._stormClouds) this._stormClouds.update(delta, shipPos, localWind);

      for (const shark of this._sharks) {
        shark.animator.update(delta);

        // Apply the bob offset from the animator on top of the fixed baseY
        shark.mesh.position.y = shark.baseY + shark.animator.bobOffset;
        shark.mesh.rotation.y = shark.baseYaw + shark.animator.yawOffset;

        // Swim forward
        shark.mesh.translateZ(shark.speed * delta);

        // Handle QTE hit sequence
        if (shark.hitPending) {
          shark.hitDelay -= delta;
          if (shark.hitDelay <= 0) {
            shark.hitPending = false;
            shark.flashing = true;
            shark.flashTimer = 0.5;

            // Trigger particles
            emit('spawnParticles', { type: 'massiveSplash', position: shark.mesh.position.clone() });
            emit('spawnParticles', { type: 'bloodSplash', position: shark.mesh.position.clone() });

            // Change emissive to red
            shark.mesh.traverse(c => {
              if ((c.isMesh || c.isSkinnedMesh) && c.material) {
                if (!c.userData.hasClonedMaterial) {
                  c.material = c.material.clone();
                  c.userData.hasClonedMaterial = true;
                }
                if (!c.userData.originalEmissive) {
                  c.userData.originalEmissive = c.material.emissive ? c.material.emissive.clone() : new THREE.Color(0x000000);
                }
                if (c.material.emissive) {
                  c.material.emissive.setHex(0xff0000);
                }
              }
            });
          }
        } else if (shark.flashing) {
          shark.flashTimer -= delta;
          if (shark.flashTimer <= 0) {
            shark.flashing = false;
            shark.sinking = true;
          }
        } else if (shark.sinking) {
          shark.baseY -= 15.0 * delta; // Sink rapidly
          if (shark.baseY <= -10) {
            toRemove.push(shark);
          }
          continue; // skip other updates while sinking
        }

        if (shark.shrinking) {
          const currentScale = shark.mesh.scale.x;
          const newScale = Math.max(0, currentScale - 5.0 * delta); // Shrink rapidly
          shark.mesh.scale.setScalar(newScale);
          if (newScale <= 0) {
            toRemove.push(shark);
          }
          continue; // skip other updates while shrinking
        }

        if (playerShip && !shark.qteTriggered && this.qteSystem && shark.isShark) {
          const dx = shark.mesh.position.x - playerShip.mesh.position.x;
          const dz = shark.mesh.position.z - playerShip.mesh.position.z;
          const dist2D = Math.sqrt(dx * dx + dz * dz);

          // Only trigger if shark is within 20 units AND near or in front of the boat (dz < 4)
          if (dist2D < 20 && dz < 4) {
            const success = this.qteSystem.trigger({
              type: 'HARPOON',
              windowMs: 1500,
              onSuccess: () => {
                shark.hitPending = true;
                shark.hitDelay = 0.3; // Matches harpoon travel time
                emit('spawnParticles', { type: 'harpoon', start: playerShip.mesh.position.clone(), end: shark.mesh.position.clone() });
              },
              onFail: () => {
                console.log(`[Shark] Harpoon missed! Shark swims away.`);
              }
            });

            if (success) {
              shark.qteTriggered = true;
            }
          }
        }

        // Wrap around the play area
        const p = shark.mesh.position;
        let wrapped = false;
        if (p.z > 60) { p.z -= 120; wrapped = true; }
        if (p.z < -60) { p.z += 120; wrapped = true; }
        if (p.x > 60) { p.x -= 120; wrapped = true; }
        if (p.x < -60) { p.x += 120; wrapped = true; }

        if (wrapped) {
          shark.qteTriggered = false;
        }
      }

      for (const shark of toRemove) {
        this._scene?.remove(shark.mesh);
        const idx = this._sharks.indexOf(shark);
        if (idx !== -1) {
          this._sharks.splice(idx, 1);

          // Respawn to maintain population, giving a random wide offset
          // so it doesn't spawn directly inside the boat
          if (playerShip) {
            const spawnZ = playerShip.mesh.position.z + 40 + Math.random() * 40;
            const spawnX = (Math.random() - 0.5) * 80;
            this._spawnShark(null, spawnX, null, spawnZ);
          } else {
            this._spawnShark();
          }
        }
        // Wrap around the play area (200 radius = -200 to 200)
        const p = shark.mesh.position;
        if (p.z > 200) p.z -= 400;
        if (p.z < -200) p.z += 400;
        if (p.x > 200) p.x -= 400;
        if (p.x < -200) p.x += 400;
      }
    }

    toggleDenseFog(forceState) {
      if (forceState !== undefined) {
        this._isDenseFog = forceState;
      } else {
        this._isDenseFog = !this._isDenseFog;
      }

      if (this._scene && this._scene.fog) {
        // 0.05 is very dense, simulating Silent Hill style limited visibility
        this._scene.fog.density = this._isDenseFog ? 0.05 : 0.006;
        this._scene.background = this._isDenseFog ? this._scene.fog.color : new THREE.Color(0x222233);
      }

      if (this._fogVolume && this._fogVolume.mesh) {
        this._fogVolume.mesh.visible = !this._isDenseFog;
      }

      if (this._stormClouds && this._stormClouds.mesh) {
        this._stormClouds.mesh.visible = !this._isDenseFog;
      }

      return this._isDenseFog;
    }

    dispose() {
      for (const shark of this._sharks) {
        this._scene?.remove(shark.mesh);
      }
      this._sharks = [];

      if (this._windParticles) {
        this._windParticles.dispose();
        this._windParticles = null;
      }
      if (this._rainManager) { this._rainManager.dispose(); this._rainManager = null; }
      if (this._fogVolume) { this._fogVolume.dispose(); this._fogVolume = null; }
      if (this._stormClouds) { this._stormClouds.dispose(); this._stormClouds = null; }
      if (this._scene) { this._scene.fog = null; }
    }
  }

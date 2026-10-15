import * as THREE from 'three';
import { emit } from '../core/EventBus.js';
import { LevelConfig } from '../core/LevelConfig.js';

// ---------------------------------------------------------------------------
// SirenParticles — vertical shimmer column
// ---------------------------------------------------------------------------

class SirenParticles {
  constructor(height = 8, count = 60) {
    this.count = count;
    this.height = height;

    const geo = new THREE.SphereGeometry(0.15, 4, 4);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff66cc,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.dummy = new THREE.Object3D();
    this.particleData = [];

    for (let i = 0; i < count; i++) {
      this.particleData.push({
        angle: Math.random() * Math.PI * 2,
        y: Math.random() * height,
        radius: 0.5 + Math.random() * 1.5,
        speed: 0.8 + Math.random() * 1.2,
        riseSpeed: 0.5 + Math.random() * 1.0,
      });
      this._updateInstance(i);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  _updateInstance(i) {
    const p = this.particleData[i];
    const x = Math.cos(p.angle) * p.radius;
    const z = Math.sin(p.angle) * p.radius;
    this.dummy.position.set(x, p.y, z);
    const s = 0.3 + (p.y / this.height) * 0.7; // fade smaller at top
    this.dummy.scale.setScalar(s);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this.dummy.matrix);
  }

  update(delta) {
    for (let i = 0; i < this.count; i++) {
      const p = this.particleData[i];
      p.angle += p.speed * delta;
      p.y += p.riseSpeed * delta;
      if (p.y > this.height) {
        p.y = 0;
        p.angle = Math.random() * Math.PI * 2;
      }
      this._updateInstance(i);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// ---------------------------------------------------------------------------
// SirenInstance — per-siren data
// ---------------------------------------------------------------------------

/**
 * @typedef {object} SirenDef
 * @property {{ x:number, y:number, z:number }} position
 * @property {number} intensity       0.0–1.0
 * @property {number} attractRadius   World-space radius of pull effect
 */

// ---------------------------------------------------------------------------
// SirenManager
// ---------------------------------------------------------------------------

/**
 * SirenManager — spawns siren instances from level config and applies
 * an involuntary steering pull to the PlayerShip each frame.
 *
 * Rather than translating the ship position directly, Sirens exert a
 * hypnotic steering torque on the ship's rudder/yaw, compelling the vessel
 * to veer towards the siren's reef. Players must actively fight the steering
 * wheel to maintain heading and break away.
 *
 * Colliding with a Siren reef inflicts the exact same damage and physical
 * reaction as a rock (20 HP damage, rock bounce-back, knockback, collision sound).
 */
export class SirenManager {
  constructor() {
    /** @type {{ def: SirenDef, group: THREE.Group, particles: SirenParticles, modelGroup?: THREE.Group|THREE.Mesh, isFallbackIdol?: boolean, seed: number }[]} */
    this._sirens = [];
    this._scene = null;
    this._sirenModel = null;
    this._rockModels = null;
    this._qteSystem = null;
    this._time = 0;
  }

  /**
   * @param {object} levelCfg   Level JSON — reads `levelCfg.sirens[]`
   * @param {THREE.Scene} scene
   * @param {object} [sirenModel]
   * @param {object[]} [rockModels]
   * @param {object} [qteSystem]
   */
  init(levelCfg, scene, sirenModel = null, rockModels = null, qteSystem = null) {
    this._scene = scene;
    this._sirenModel = sirenModel || (typeof LevelConfig !== 'undefined' ? LevelConfig._cache?.get('sirenModel') : null);
    this._rockModels = rockModels || (typeof LevelConfig !== 'undefined' ? LevelConfig._cache?.get('rockModels') : null);
    this._qteSystem = qteSystem;
    this._time = 0;
    const defs = levelCfg?.sirens || [];

    for (const def of defs) {
      this._spawn(def);
    }
  }

  /**
   * Per-frame update — apply steering pull force and check rock collision.
   * @param {number} delta
   * @param {import('../obstacle/PlayerShip.js').PlayerShip} playerShip
   */
  update(delta, playerShip) {
    if (!playerShip || playerShip.sunk) return;

    this._time += delta;
    const shipPos = playerShip.mesh.position;
    let maxIntensityThisFrame = 0;
    let netSteerPullThisFrame = 0;

    for (const siren of this._sirens) {
      const def = siren.def;
      const sx = def.position.x;
      const sz = def.position.z;

      const dx = sx - shipPos.x;
      const dz = sz - shipPos.z;
      const dist = Math.hypot(dx, dz) || 0.001;

      // Animate siren model: hovering bob & smooth swiveling to face approaching player ship
      if (siren.modelGroup) {
        const baseBobY = siren.isFallbackIdol ? 3.6 : (siren.rockTopY ?? 2.45);
        siren.modelGroup.position.y = baseBobY + Math.sin(this._time * 2.2 + siren.seed) * 0.12;
        siren.modelGroup.rotation.z = Math.sin(this._time * 1.4 + siren.seed) * 0.04;

        if (dist < def.attractRadius * 1.5) {
          const targetYaw = Math.atan2(dx, dz);
          let diff = (targetYaw - siren.modelGroup.rotation.y) % (Math.PI * 2);
          if (diff > Math.PI) diff -= Math.PI * 2;
          if (diff < -Math.PI) diff += Math.PI * 2;
          siren.modelGroup.rotation.y += diff * Math.min(delta * 3.0, 1.0);
        } else {
          siren.modelGroup.rotation.y += 0.25 * delta;
        }
      }

      // 1. Collision with Siren reef (same damage type & physical reaction as a rock)
      const collisionRadius = 2.8;
      if (dist < collisionRadius) {
        const pushDx = shipPos.x - sx;
        const pushDz = shipPos.z - sz;
        const pushDist = Math.hypot(pushDx, pushDz) || 0.001;
        const nx = pushDx / pushDist;
        const nz = pushDz / pushDist;

        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(playerShip.mesh.quaternion).normalize();
        let tx = -nz, tz = nx;
        if (forward.x * tx + forward.z * tz < 0) {
          tx = nz;
          tz = -nx;
        }

        if (!playerShip.isImmune()) {
          const rockDamage = 20; // Identical damage to rock collision
          playerShip.takeDamage(rockDamage, 'rock');
          playerShip.setImmune(2.0);

          // Physical rock collision reaction: pitch/roll bounceBack
          playerShip.bounceBack(pushDx, pushDz, 'rock');

          // Audio and obstacle hit events
          emit('obstacleHit', { type: 'rock', damage: rockDamage });
          emit('playSound', { sound: 'collision' });
        }

        // Static push away from rock center to avoid sticking
        playerShip.mesh.position.x = sx + nx * (collisionRadius + 0.6);
        playerShip.mesh.position.z = sz + nz * (collisionRadius + 0.6);

        // Slide along tangent
        const forwardSpeed = playerShip._isHalted ? 0 : 15.0 * (playerShip.speedMultiplier || 1.0);
        const inDot = forward.x * nx + forward.z * nz;
        if (inDot < 0) {
          const inStep = inDot * forwardSpeed * delta;
          playerShip.mesh.position.x -= inStep * nx;
          playerShip.mesh.position.z -= inStep * nz;

          playerShip.mesh.position.x += tx * Math.abs(inStep) * 0.95;
          playerShip.mesh.position.z += tz * Math.abs(inStep) * 0.95;
        }

        // Sliding knockback velocity
        playerShip.knockbackVelocity.set(tx * (forwardSpeed * 0.4) + nx * 5.0, 0, tz * (forwardSpeed * 0.4) + nz * 5.0);

        // Steer rudder along tangent
        const cross = forward.x * tz - forward.z * tx;
        playerShip.yawVelocity += Math.sign(cross) * 2.0 * delta;

        playerShip.mesh.updateMatrixWorld(true);
        if (playerShip.obb && playerShip.baseOBB) {
          playerShip.obb.copy(playerShip.baseOBB).applyMatrix4(playerShip.mesh.matrixWorld);
        }
      }

      // 2. Steering Pull: draws the player in by pulling the ship's steering/rudder
      if (dist < def.attractRadius) {
        // Proximity ramp: 0 at outer boundary, 1 at center
        const t = Math.max(0, 1.0 - dist / def.attractRadius);
        const intensity = def.intensity ?? 0.8;

        // Desired yaw to point directly at the siren
        const targetYaw = Math.atan2(-dx, -dz);

        // Signed angular difference from ship's current yaw
        let angleDiff = (targetYaw - playerShip.yaw) % (Math.PI * 2);
        if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        // In Three.js ship heading coordinates:
        // angleDiff > 0 means Siren is to the LEFT (turns left, yaw increases)
        // angleDiff < 0 means Siren is to the RIGHT (turns right, yaw decreases)
        const turnDir = Math.sign(angleDiff);
        const turnFactor = Math.min(Math.abs(angleDiff) * 1.5, 1.0);

        // Torque applied to ship yawVelocity:
        // Player's rudder turnAccel is ~2.0 rad/s².
        // By scaling torque up to ~2.6 rad/s² near the center, the Siren exerts
        // a compelling pull that requires deliberate counter-steering to fight off.
        const torque = turnDir * turnFactor * (2.6 * intensity) * t;
        playerShip.yawVelocity += torque * delta;

        // Visceral physical leaning into the forced turn
        playerShip.rollVelocity -= turnDir * t * 0.4 * delta;

        const pullStrength = t * intensity;
        if (pullStrength > maxIntensityThisFrame) {
          maxIntensityThisFrame = pullStrength;
          // In HUD conventions: positive steerInput is RIGHT, negative is LEFT.
          // Since turnDir < 0 is right and turnDir > 0 is left:
          netSteerPullThisFrame = -turnDir * pullStrength;
        }

        // Trigger SIREN QTE when close
        if (siren.cooldown > 0) {
          siren.cooldown = Math.max(0, siren.cooldown - delta);
        }
        if (this._qteSystem && !siren.qteTriggered && (siren.cooldown || 0) <= 0 && dist < def.attractRadius * 0.7) {
          const accepted = this._qteSystem.trigger({
            type: 'SIREN',
            metadata: { source: 'siren' },
            onSuccess: () => {
              siren.cooldown = 7;
              siren.qteTriggered = false;
            },
            onFail: () => {
              siren.cooldown = 4;
              siren.qteTriggered = false;
              playerShip.takeDamage?.(10, 'siren');
            }
          });
          if (accepted) siren.qteTriggered = true;
        }
      }

      // Animate particles
      siren.particles.update(delta);
    }

    if (maxIntensityThisFrame > 0) {
      emit('sirenPulling', {
        intensity: maxIntensityThisFrame,
        steerPull: netSteerPullThisFrame,
      });
    }
  }

  dispose() {
    for (const siren of this._sirens) {
      siren.particles.dispose();
      if (siren.modelGroup) {
        siren.modelGroup.traverse(child => {
          if (child.isMesh) {
            child.geometry?.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            } else {
              child.material?.dispose();
            }
          }
        });
      }
      this._scene?.remove(siren.group);
    }
    this._sirens.length = 0;
    this._scene = null;
    this._sirenModel = null;
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  /**
   * Spawn a single siren instance.
   * @param {SirenDef} def
   */
  _spawn(def) {
    const group = new THREE.Group();
    group.position.set(def.position.x, def.position.y ?? 0, def.position.z);

    // Use genuine obstacle rock model for the reef base
    const rocks = this._rockModels || (typeof LevelConfig !== 'undefined' ? LevelConfig._cache?.get('rockModels') : null);
    const selectedRock = rocks?.find(m => m.url?.includes('voxel_Cliff')) ||
                         rocks?.find(m => m.url?.includes('voxel_Rock Large.glb')) ||
                         rocks?.find(m => m.url?.includes('Rock Large')) ||
                         rocks?.[0];

    let rockTopY = 2.45;
    if (selectedRock && selectedRock.scene) {
      const rockClone = selectedRock.scene.clone(true);
      rockClone.traverse(c => {
        if (c.isMesh) {
          c.castShadow = true;
          c.receiveShadow = true;
        }
      });
      rockClone.updateMatrixWorld(true);
      const rBox = new THREE.Box3().setFromObject(rockClone);
      const rSize = new THREE.Vector3();
      rBox.getSize(rSize);
      const rCenter = new THREE.Vector3();
      rBox.getCenter(rCenter);

      // Fit to a natural sea reef ~4.6m wide
      const maxXZ = Math.max(rSize.x, rSize.z) || 1;
      const targetWidth = 4.6;
      const rScale = targetWidth / maxXZ;
      const rScaleY = (rSize.y * rScale < 2.5) ? (2.8 / (rSize.y || 1)) : rScale;

      rockClone.scale.set(rScale, rScaleY, rScale);
      rockClone.position.set(
        -rCenter.x * rScale,
        -rBox.min.y * rScaleY - 0.4,
        -rCenter.z * rScale
      );
      rockClone.rotation.y = Math.random() * Math.PI * 2;
      group.add(rockClone);

      rockTopY = (rBox.max.y - rBox.min.y) * rScaleY - 0.4;
    }

    // Mount Siren.glb model atop the reef
    const sModel = this._sirenModel || (typeof LevelConfig !== 'undefined' ? LevelConfig._cache?.get('sirenModel') : null);
    let modelGroup = null;
    let isFallbackIdol = false;

    if (sModel && sModel.scene) {
      const clone = sModel.scene.clone(true);
      clone.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      const box = new THREE.Box3().setFromObject(clone);
      const center = new THREE.Vector3();
      box.getCenter(center);
      // Center on X and Z, align base at Y = 0
      clone.position.set(-center.x, -box.min.y, -center.z);

      modelGroup = new THREE.Group();
      modelGroup.scale.setScalar(2.6);
      modelGroup.position.set(0, rockTopY, 0);
      modelGroup.add(clone);
      group.add(modelGroup);
    } else {
      // Fallback: Glowing mystic gem / siren idol perched atop the reef
      isFallbackIdol = true;
      const idolGeo = new THREE.OctahedronGeometry(0.7, 0);
      const idolMat = new THREE.MeshPhongMaterial({
        color: 0xff66cc,
        emissive: 0xff33aa,
        emissiveIntensity: 0.8,
        shininess: 80,
      });
      const idol = new THREE.Mesh(idolGeo, idolMat);
      idol.position.y = 3.6;
      idol.scale.set(0.8, 1.4, 0.8);
      group.add(idol);
      modelGroup = idol;
    }

    // Radius visualisation ring (subtle, always visible; excluded from god ray occlusion)
    const ringGeo = new THREE.RingGeometry(
      def.attractRadius - 0.4,
      def.attractRadius,
      48
    );
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff66cc,
      transparent: true,
      opacity: 0.20,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    ring.userData.noGodRays = true;
    ring.userData.noOcclusion = true;
    group.add(ring);

    // Shimmer particles column
    const particles = new SirenParticles(9, 70);
    group.add(particles.mesh);

    this._scene.add(group);
    this._sirens.push({
      def,
      group,
      particles,
      modelGroup,
      isFallbackIdol,
      rockTopY,
      seed: Math.random() * Math.PI * 2,
    });
  }
}

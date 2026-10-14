import * as THREE from 'three';
import { emit } from '../core/EventBus.js';

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
    /** @type {{ def: SirenDef, group: THREE.Group, particles: SirenParticles }[]} */
    this._sirens = [];
    this._scene = null;
  }

  /**
   * @param {object} levelCfg   Level JSON — reads `levelCfg.sirens[]`
   * @param {THREE.Scene} scene
   */
  init(levelCfg, scene) {
    this._scene = scene;
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

      // 1. Collision with Siren reef (same damage type & physical reaction as a rock)
      const collisionRadius = 2.8;
      if (dist < collisionRadius) {
        const pushDx = shipPos.x - sx;
        const pushDz = shipPos.z - sz;
        const pushDist = Math.hypot(pushDx, pushDz) || 0.001;
        const nx = pushDx / pushDist;
        const nz = pushDz / pushDist;

        if (!playerShip.isImmune()) {
          const rockDamage = 20; // Identical damage to rock collision
          playerShip.takeDamage(rockDamage, 'rock');
          playerShip.setImmune(2.0);

          // Physical rock collision reaction: pitch/roll bounceBack
          playerShip.bounceBack(pushDx, pushDz, 'rock');

          // Static push away from rock center to avoid sticking
          playerShip.mesh.position.x = sx + nx * (collisionRadius + 0.8);
          playerShip.mesh.position.z = sz + nz * (collisionRadius + 0.8);

          // Pinball knockback velocity
          playerShip.applyKnockback(new THREE.Vector3(nx * 40, 0, nz * 40));

          // Audio and obstacle hit events
          emit('obstacleHit', { type: 'rock', damage: rockDamage });
          emit('playSound', { sound: 'collision' });
        } else {
          // While immune, keep ship from penetrating solid rock core
          playerShip.mesh.position.x = sx + nx * (collisionRadius + 0.5);
          playerShip.mesh.position.z = sz + nz * (collisionRadius + 0.5);
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
      this._scene?.remove(siren.group);
    }
    this._sirens.length = 0;
    this._scene = null;
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

    // Rugged Siren rock reef core
    const rockMat = new THREE.MeshPhongMaterial({
      color: 0x4a2e5b,
      emissive: 0x240e36,
      emissiveIntensity: 0.5,
      shininess: 25,
    });

    // Main jagged rock spire
    const mainRockGeo = new THREE.DodecahedronGeometry(1.8, 1);
    const mainRock = new THREE.Mesh(mainRockGeo, rockMat);
    mainRock.scale.set(1.1, 1.8, 1.1);
    mainRock.position.y = 1.2;
    mainRock.rotation.y = Math.random() * Math.PI;
    group.add(mainRock);

    // Secondary craggy rocks around the water line
    const subRockGeo = new THREE.DodecahedronGeometry(1.0, 0);
    const subPositions = [
      { x: 1.2, z: 0.6, s: 0.9 },
      { x: -1.1, z: 0.8, s: 0.8 },
      { x: 0.3, z: -1.3, s: 1.0 },
    ];
    for (const sp of subPositions) {
      const subRock = new THREE.Mesh(subRockGeo, rockMat);
      subRock.scale.set(sp.s, sp.s * 1.3, sp.s);
      subRock.position.set(sp.x, 0.4, sp.z);
      subRock.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.5);
      group.add(subRock);
    }

    // Glowing mystic gem / siren idol perched atop the reef
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

    // Radius visualisation ring (subtle, always visible)
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
    group.add(ring);

    // Shimmer particles column
    const particles = new SirenParticles(9, 70);
    group.add(particles.mesh);

    this._scene.add(group);
    this._sirens.push({ def, group, particles });
  }
}

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
 * a directional pull force to the PlayerShip each frame.
 *
 * Pull is purely directional (no tangential spiral like whirlpools).
 * Sirens deal no damage directly — the danger is being lured into
 * terrain or other hazards.
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
   * Per-frame update — apply pull force to ship.
   * @param {number} delta
   * @param {import('../obstacle/PlayerShip.js').PlayerShip} playerShip
   */
  update(delta, playerShip) {
    if (!playerShip || playerShip.sunk) return;

    const shipPos = playerShip.mesh.position;

    for (const siren of this._sirens) {
      const def = siren.def;
      const sx = def.position.x;
      const sz = def.position.z;

      const dx = sx - shipPos.x;
      const dz = sz - shipPos.z;
      const dist = Math.hypot(dx, dz) || 0.001;

      if (dist < def.attractRadius) {
        // Strength ramps up as player gets closer
        const t = 1.0 - dist / def.attractRadius;
        const pullMag = def.intensity * 15.0 * t; // base force scaled by intensity

        shipPos.x += (dx / dist) * pullMag * delta;
        shipPos.z += (dz / dist) * pullMag * delta;

        emit('sirenPulling', { intensity: t * def.intensity });
      }

      // Animate particles
      siren.particles.update(delta);
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

    // Placeholder rock mesh
    const rockGeo = new THREE.DodecahedronGeometry(1.2, 1);
    const rockMat = new THREE.MeshPhongMaterial({
      color: 0x553377,
      emissive: 0x331155,
      emissiveIntensity: 0.4,
    });
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.y = 0.6;
    group.add(rock);

    // Radius visualisation ring (subtle, always visible)
    const ringGeo = new THREE.RingGeometry(
      def.attractRadius - 0.3,
      def.attractRadius,
      48
    );
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff66cc,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    group.add(ring);

    // Particles
    const particles = new SirenParticles(8, 60);
    group.add(particles.mesh);

    this._scene.add(group);
    this._sirens.push({ def, group, particles });
  }
}

import * as THREE from 'three';
import { emit, on, off } from '../core/EventBus.js';

// ---------------------------------------------------------------------------
// Obstacle type definitions
// ---------------------------------------------------------------------------

/** @readonly */
export const ObstacleType = Object.freeze({
  ROCK:       'rock',
  BARREL:     'barrel',
  WAVE_SMALL: 'wave_small',
  SEAWEED:    'seaweed',
  WHIRLPOOL:  'whirlpool',
});

// ---------------------------------------------------------------------------
// PlayerShip
// ---------------------------------------------------------------------------

/**
 * PlayerShip — the player-controlled vessel during the Obstacle Trial phase.
 *
 * Movement: kinematic X-axis steering, fixed Z scroll speed.
 * Collision:  THREE.Box3 AABB bounding volume, updated every frame.
 * Stats:      hullHP, speedMultiplier — degraded by incomplete repairs.
 */
export class PlayerShip {
  /**
   * @param {object} stats   { hullHP, speedMultiplier, laneHalfWidth }
   * @param {THREE.Scene} scene
   */
  constructor(stats, scene) {
    this.hullHP          = stats.hullHP          ?? 100;
    this.maxHullHP       = this.hullHP;
    this.speedMultiplier = stats.speedMultiplier  ?? 1.0;
    this._laneHalfWidth  = stats.laneHalfWidth   ?? 6;

    /** @type {number} Steering input in [-1, +1] from wheel drag or keyboard */
    this.steerInput = 0;
    /** px/s lateral speed */
    this._steerSpeed = 5.0;

    /** @type {boolean} True when the ship has sunk (HP ≤ 0) */
    this.sunk = false;

    // Build a simple placeholder mesh (replaced by the real ship model later)
    this.mesh = this._buildMesh();
    scene.add(this.mesh);

    /** AABB updated every frame */
    this.box = new THREE.Box3().setFromObject(this.mesh);
  }

  // -------------------------------------------------------------------------
  // Frame update
  // -------------------------------------------------------------------------

  /**
   * @param {number} delta  Seconds since last frame
   */
  update(delta) {
    if (this.sunk) return;

    // Lateral steering
    this.mesh.position.x += this.steerInput * this._steerSpeed * this.speedMultiplier * delta;

    // Clamp to lane boundaries
    this.mesh.position.x = THREE.MathUtils.clamp(
      this.mesh.position.x,
      -this._laneHalfWidth,
      this._laneHalfWidth,
    );

    // Update bounding box
    this.box.setFromObject(this.mesh);
  }

  // -------------------------------------------------------------------------
  // Damage
  // -------------------------------------------------------------------------

  /**
   * Apply damage and emit events.
   * @param {number} amount
   * @param {string} [source]  Obstacle type that caused damage
   */
  takeDamage(amount, source = 'unknown') {
    if (this.sunk) return;
    this.hullHP = Math.max(0, this.hullHP - amount);
    emit('playerDamaged', { hullHP: this.hullHP, maxHullHP: this.maxHullHP, source });

    if (this.hullHP <= 0) {
      this.sunk = true;
      emit('playerSunk');
    }
  }

  /**
   * Apply a brief X-axis bounce-back effect.
   * @param {number} direction  +1 or -1
   */
  bounceBack(direction) {
    const target = this.mesh.position.x + direction * 1.5;
    // Simple lerp toward bounce target over the next few frames via a flag
    this._bounceTarget = target;
    this._bounceDuration = 0.15; // seconds
    this._bounceElapsed  = 0;
  }

  // -------------------------------------------------------------------------
  // Speed modifiers
  // -------------------------------------------------------------------------

  /**
   * Temporarily slow the ship (e.g. seaweed effect).
   * @param {number} multiplier  e.g. 0.5 for half speed
   * @param {number} duration    seconds
   */
  applySpeedModifier(multiplier, duration) {
    this.speedMultiplier = multiplier;
    clearTimeout(this._speedTimer);
    this._speedTimer = setTimeout(() => {
      this.speedMultiplier = 1.0;
    }, duration * 1000);
  }

  // -------------------------------------------------------------------------
  // Dispose
  // -------------------------------------------------------------------------

  dispose(scene) {
    clearTimeout(this._speedTimer);
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  _buildMesh() {
    // Placeholder box until the full ship model is integrated
    const geo = new THREE.BoxGeometry(2, 1, 4);
    const mat = new THREE.MeshLambertMaterial({ color: 0x9A5B2E });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 0.5, 0);
    return mesh;
  }
}

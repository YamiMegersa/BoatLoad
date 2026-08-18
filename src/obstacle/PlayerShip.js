import * as THREE from 'three';
import { emit, on, off } from '../core/EventBus.js';
import { OBB } from 'three/examples/jsm/math/OBB.js';

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
   * @param {import('../shipyard/ChunkRenderer.js').ChunkRenderer} [chunkRenderer]
   */
  constructor(stats, scene, chunkRenderer) {
    this.hullHP          = stats.hullHP          ?? 100;
    this.maxHullHP       = this.hullHP;
    this.speedMultiplier = stats.speedMultiplier  ?? 1.0;
    this._laneHalfWidth  = stats.laneHalfWidth   ?? 6;

    /** @type {number} Steering input in [-1, +1] from wheel drag or keyboard */
    this.steerInput = 0;
    
    // Physics & Rotation
    this.yaw = 0;
    this.yawVelocity = 0;
    this.pitch = 0;
    this.roll = 0;
    this.pitchVelocity = 0;
    this.rollVelocity = 0;

    /** @type {boolean} True when the ship has sunk (HP ≤ 0) */
    this.sunk = false;

    // Use the actual voxel model if provided
    this.mesh = new THREE.Group();
    if (chunkRenderer && chunkRenderer.container) {
      // Create a wrapper to handle scaling and centering independently
      const wrapper = new THREE.Group();
      wrapper.add(chunkRenderer.container);
      
      // Calculate bounding box to center the voxel grid horizontally
      const tempBox = new THREE.Box3().setFromObject(chunkRenderer.container);
      const center = new THREE.Vector3();
      tempBox.getCenter(center);
      
      // Offset so the ship is centered on X and Z, resting on Y=0
      chunkRenderer.container.position.set(-center.x, -tempBox.min.y, -center.z);
      
      // Scale the wrapper down so the massive 24x48 voxel ship fits the 12-unit wide lane
      wrapper.scale.setScalar(0.1);
      
      this.mesh.add(wrapper);
    } else {
      this.mesh.add(this._buildMesh());
    }
    
    scene.add(this.mesh);

    // OBB Collision (compute base unrotated bounds from local mesh)
    const localBox = new THREE.Box3().setFromObject(this.mesh);
    this.baseOBB = new OBB();
    localBox.getCenter(this.baseOBB.center);
    localBox.getSize(this.baseOBB.halfSize).multiplyScalar(0.5);

    /** Active OBB updated every frame */
    this.obb = new OBB();
  }

  // -------------------------------------------------------------------------
  // Frame update
  // -------------------------------------------------------------------------

  update(delta) {
    if (this.sunk) return;

    // Time for natural bobbing
    const time = performance.now() / 1000;

    // Driving Model: Steer input controls Yaw with inertia (heavy boat feel)
    const maxYaw = Math.PI / 6; // 30 degrees max turn
    const turnAccel = 3.5;      // How fast the rudder can apply turning force
    const damping = 2.5;        // Water resistance against turning
    
    // Base turning acceleration from player input
    let yawAccel = -this.steerInput * turnAccel;
    
    // Auto-center yaw slowly when no input (water straightening the hull)
    if (this.steerInput === 0) {
      yawAccel -= this.yaw * 4.0;
    }
    
    // Apply water damping/friction
    yawAccel -= this.yawVelocity * damping;
    
    // Euler integration for heavy momentum
    this.yawVelocity += yawAccel * delta;
    this.yaw += this.yawVelocity * delta;
    this.yaw = THREE.MathUtils.clamp(this.yaw, -maxYaw, maxYaw);
    
    // Lateral movement based on where the ship is pointing (Yaw)
    const forwardSpeed = 15.0;
    this.mesh.position.x -= Math.sin(this.yaw) * forwardSpeed * this.speedMultiplier * delta;

    // Clamp to lane boundaries
    this.mesh.position.x = THREE.MathUtils.clamp(
      this.mesh.position.x,
      -this._laneHalfWidth,
      this._laneHalfWidth,
    );

    // Natural bobbing (Pitch and Roll)
    const naturalPitch = Math.sin(time * 2.0) * 0.05;
    const naturalRoll = Math.cos(time * 1.5) * 0.05;

    // Apply spring physics for impact bobbing
    this.pitchVelocity *= 0.9; // damping
    this.rollVelocity *= 0.9;
    
    // Spring back to 0
    this.pitchVelocity -= (this.pitch - 0) * 10 * delta; 
    this.rollVelocity -= (this.roll - 0) * 10 * delta;

    this.pitch += this.pitchVelocity * delta;
    this.roll += this.rollVelocity * delta;

    // Apply rotations
    this.mesh.rotation.order = 'YXZ';
    this.mesh.rotation.y = this.yaw;
    this.mesh.rotation.x = this.pitch + naturalPitch;
    this.mesh.rotation.z = this.roll + naturalRoll;

    // Update OBB collision volume
    this.mesh.updateMatrixWorld(true);
    this.obb.copy(this.baseOBB);
    this.obb.applyMatrix4(this.mesh.matrixWorld);
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
   * Apply a massive rotational impulse for visual impact feedback.
   * @param {number} direction  +1 or -1
   */
  bounceBack(direction) {
    // direction is 1 (hit from right) or -1 (hit from left)
    // We add a sudden spike to roll and pitch velocity
    this.rollVelocity += direction * 8.0; 
    this.pitchVelocity -= 5.0; // Bow dips down abruptly
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
    // Note: chunkRenderer disposal is handled by GameState phase teardown later,
    // so we don't deeply dispose its geometry here.
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

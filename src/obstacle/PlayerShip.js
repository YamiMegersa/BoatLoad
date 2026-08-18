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
   * @param {object} stats
   * @param {THREE.Scene} scene
   * @param {import('../shipyard/ChunkRenderer.js').ChunkRenderer} [chunkRenderer]
   * @param {import('../shipyard/VoxelGrid.js').VoxelGrid} [grid]
   */
  constructor(stats, scene, chunkRenderer, grid) {
    this.speedMultiplier = stats.speedMultiplier  ?? 1.0;
    this._laneHalfWidth  = stats.laneHalfWidth   ?? 6;

    this.chunkRenderer = chunkRenderer;
    this.grid = grid;

    // Leak System
    this.waterLevel = 0;
    this.maxWaterLevel = 100;
    this.waterlineY = 4; // Any hole below Y=4 leaks water
    this.numLeaks = 0;

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

    // Initialise leaks from any unpatched holes left from the shipyard
    this._countLeaks();
  }

  _countLeaks() {
    if (!this.grid) return;
    this.numLeaks = 0;
    this.grid.forEach((x, y, z, state) => {
      // 3 = CellState.MISSING
      if (y <= this.waterlineY && state === 3) {
        this.numLeaks++;
      }
    });
  }

  // -------------------------------------------------------------------------
  // Frame update
  // -------------------------------------------------------------------------

  update(delta) {
    if (this.sunk) return;

    // Time for natural bobbing
    const time = performance.now() / 1000;

    // --- LEAK SYSTEM ---
    if (this.numLeaks > 0) {
      // e.g. 1.5 water units per second per hole
      this.waterLevel += this.numLeaks * 1.5 * delta;
      // Tell UI the water level rose
      emit('playerWaterLevel', { level: this.waterLevel, max: this.maxWaterLevel });
    }
    const waterRatio = Math.min(this.waterLevel / this.maxWaterLevel, 1.0);
    
    // Check for sinking
    if (this.waterLevel >= this.maxWaterLevel && !this.sunk) {
      this.sunk = true;
      emit('playerSunk');
    }

    // Heavy Debuffs based on water level
    const handlingMultiplier = Math.max(0.1, 1.0 - (waterRatio * 1.2)); // Drops handling drastically as water fills
    
    // Driving Model: Steer input controls Yaw with inertia (heavy boat feel)
    const maxYaw = Math.PI / 6; // 30 degrees max turn
    const turnAccel = 3.5 * handlingMultiplier;      // How fast the rudder can apply turning force
    const damping = 2.5 * (1.0 + waterRatio * 2.0);  // Water resistance against turning (heavier when flooded)
    
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
    const speedPenalty = Math.max(0.3, 1.0 - waterRatio);
    const forwardSpeed = 15.0 * speedPenalty;
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

    // Visually sink the ship on the Y axis
    // Wrapper is at Y=0. We push the whole mesh down based on water ratio
    this.mesh.position.y = -(waterRatio * 2.0);

    // Update OBB collision volume
    this.mesh.updateMatrixWorld(true);
    this.obb.copy(this.baseOBB);
    this.obb.applyMatrix4(this.mesh.matrixWorld);
  }

  // -------------------------------------------------------------------------
  // Damage
  // -------------------------------------------------------------------------

  /**
   * Physically blow holes in the voxel hull.
   * @param {number} amount
   * @param {string} [source]  Obstacle type that caused damage
   */
  takeDamage(amount, source = 'unknown') {
    if (this.sunk) return;

    if (this.grid && this.chunkRenderer) {
      // 10 damage = 1 hole. Wave = 5 (no hole usually, but 50% chance?)
      let holesToMake = Math.floor(amount / 10);
      if (Math.random() < (amount % 10) / 10) holesToMake++;

      let holesMade = 0;
      let attempts = 0;
      
      // Find random INTACT cells near the waterline and blow them out
      while (holesMade < holesToMake && attempts < 100) {
        attempts++;
        const cx = Math.floor(Math.random() * this.grid.width);
        const cy = Math.floor(Math.random() * (this.waterlineY + 2)); // Up to slightly above waterline
        const cz = Math.floor(Math.random() * this.grid.depth);

        // 1 = CellState.INTACT
        if (this.grid.getState(cx, cy, cz) === 1) {
          // 3 = CellState.MISSING
          this.grid.setState(cx, cy, cz, 3);
          holesMade++;
        }
      }

      if (holesMade > 0) {
        this._countLeaks();
        this.chunkRenderer.sync(this.grid);
        emit('playerDamaged', { source });
      }
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

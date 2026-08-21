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
      
      // The voxel model faces +Z by default, but we move towards -Z
      wrapper.rotation.y = Math.PI;
      
      this.mesh.add(wrapper);
    } else {
      this.mesh.add(this._buildMesh());
    }
    
    // Internal water plane (rises as boat sinks)
    // Scaled down to prevent poking out of the tapered bow/stern
    const innerWaterGeo = new THREE.PlaneGeometry(1.4, 3.6);
    innerWaterGeo.rotateX(-Math.PI / 2);
    const innerWaterMat = new THREE.MeshPhongMaterial({
      color: 0x1c343d, // Matches the deep sea color from Ocean.js
      transparent: true,
      opacity: 0.85,
      depthWrite: false // don't occlude other transparent objects weirdly
    });
    this.innerWater = new THREE.Mesh(innerWaterGeo, innerWaterMat);
    // Position it at the bottom of the boat internally
    this.innerWater.position.set(0, 0.1, 0); 
    this.innerWater.visible = false;
    this.mesh.add(this.innerWater);

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

  update(delta, ocean) {
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

    // Sample the ocean wave height and normal at the ship's center
    let waveHeight = 0;
    let waveNormal = new THREE.Vector3(0, 1, 0);
    if (ocean) {
      const info = ocean.getWaveInfo(this.mesh.position.x, this.mesh.position.z);
      waveHeight = info.height;
      waveNormal = info.normal;
    }

    // Natural bobbing (Pitch and Roll) from wave normal
    // waveNormal.z is the slope along the Z axis (forward), which translates to Pitch (X rotation)
    // waveNormal.x is the slope along the X axis (sideways), which translates to Roll (Z rotation)
    const targetPitch = Math.asin(-waveNormal.z) + Math.sin(time * 2.0) * 0.02;
    const targetRoll = Math.asin(waveNormal.x) + Math.cos(time * 1.5) * 0.02;

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
    this.mesh.rotation.x = this.pitch + targetPitch;
    this.mesh.rotation.z = this.roll + targetRoll;

    // Set Y based on wave height so the boat rides the waves, minus the sinking amount.
    // +0.2 adds a slight buffer to ensure corners of the flat boat bottom don't clip the curved wave.
    this.mesh.position.y = waveHeight + 0.2 - (waterRatio * 1.5);

    // Update internal water plane
    if (waterRatio > 0) {
      this.innerWater.visible = true;
      // The boat walls are ~1.1 units high in world space.
      // Fill the boat bathtub style as it sinks.
      this.innerWater.position.y = 0.1 + (waterRatio * 1.0);
    } else {
      this.innerWater.visible = false;
    }

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
   * Heal the hull by patching missing holes.
   * @param {number} amount
   */
  healDamage(amount) {
    if (this.sunk || !this.grid || !this.chunkRenderer) return;
    
    let holesPatched = 0;
    
    // Find MISSING cells (state === 3). Prioritize those below the waterline first.
    const missingCells = [];
    this.grid.forEach((x, y, z, state) => {
      if (state === 3) {
        missingCells.push({ x, y, z, isLeak: y <= this.waterlineY });
      }
    });
    
    // Sort so leaks are repaired first
    missingCells.sort((a, b) => {
      if (a.isLeak && !b.isLeak) return -1;
      if (!a.isLeak && b.isLeak) return 1;
      return 0;
    });
    
    for (const cell of missingCells) {
      if (holesPatched >= amount) break;
      
      // 1 = CellState.INTACT
      this.grid.setState(cell.x, cell.y, cell.z, 1);
      holesPatched++;
    }
    
    if (holesPatched > 0) {
      this._countLeaks();
      this.chunkRenderer.sync(this.grid);
      
      // Optionally lower the water level slightly as a reward?
      // this.waterLevel = Math.max(0, this.waterLevel - holesPatched * 5.0);
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

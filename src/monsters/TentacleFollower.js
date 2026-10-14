import * as THREE from 'three';
import { emit } from '../core/EventBus.js';

// ---------------------------------------------------------------------------
// TentacleFollower — procedural segmented tentacle that chases the player
// ---------------------------------------------------------------------------

/**
 * A single Kraken tentacle built from a chain of cylinder segments.
 * The head chases the player; each subsequent segment follows the
 * previous one via IK-style constraints.  All segments ride the
 * ocean surface.
 *
 * States:
 *   'pursuing'  — chasing the player during a waypoint race
 *   'attacking' — player failed the race; tentacle accelerates and deals damage
 *   'caught'    — wrapped around terrain (frozen)
 *   'idle'      — not yet activated
 */
export class TentacleFollower {
  /**
   * @param {object} config
   * @param {THREE.Vector3} config.spawnPos       World position to spawn at
   * @param {number}        config.speed          Base follow speed
   * @param {number}        [config.segmentCount] Number of segments (default 10)
   * @param {number}        [config.segmentLen]   Spacing between segments (default 2.5)
   * @param {THREE.Scene}   scene
   * @param {import('../environment/Ocean.js').Ocean} ocean
   */
  constructor(config, scene, ocean) {
    this._scene = scene;
    this._ocean = ocean;
    this._speed = config.speed ?? 12;
    this._attackSpeed = Math.max(35, this._speed * 2.5);
    this._state = 'idle';
    this._time = 0;
    this._hasImpacted = false;

    const segCount = config.segmentCount ?? 10;
    const segLen = config.segmentLen ?? 2.5;
    this._segmentLen = segLen;
    this._segmentCount = segCount;

    // Build segment meshes — tapering cylinders
    /** @type {THREE.Mesh[]} */
    this._segments = [];
    this._group = new THREE.Group();

    const baseRadius = 1.2;
    const tipRadius = 0.3;

    for (let i = 0; i < segCount; i++) {
      const t = i / (segCount - 1); // 0 = base, 1 = tip
      const rTop = THREE.MathUtils.lerp(baseRadius, tipRadius, t);
      const rBot = THREE.MathUtils.lerp(baseRadius, tipRadius, Math.max(0, t - 1 / segCount));

      const geo = new THREE.CylinderGeometry(rTop, rBot, segLen * 0.9, 8);
      geo.rotateX(Math.PI / 2); // orient along Z so segments can be chained

      const hue = THREE.MathUtils.lerp(0.78, 0.42, t); // purple → green
      const mat = new THREE.MeshPhongMaterial({
        color: new THREE.Color().setHSL(hue, 0.6, 0.25),
        emissive: new THREE.Color().setHSL(hue, 0.4, 0.08),
        shininess: 40,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false; // segments may move rapidly
      this._group.add(mesh);
      this._segments.push(mesh);
    }

    // Place all segments at spawn position
    const spawn = config.spawnPos ?? new THREE.Vector3(0, 0, 0);
    for (const seg of this._segments) {
      seg.position.copy(spawn);
    }

    scene.add(this._group);
  }

  /** @returns {'idle'|'pursuing'|'attacking'|'caught'} */
  get state() { return this._state; }

  /**
   * Activate the tentacle — start pursuing.
   * @param {import('../obstacle/PlayerShip.js').PlayerShip} [playerShip]
   */
  activate(playerShip) {
    this._state = 'pursuing';
    this._hasImpacted = false;
    if (playerShip) {
      this.resetBehind(playerShip, 30);
    }
  }

  /**
   * Position the tentacle chain trailing behind the player boat.
   * @param {import('../obstacle/PlayerShip.js').PlayerShip} playerShip
   * @param {number} [distance=30]
   */
  resetBehind(playerShip, distance = 30) {
    const shipPos = playerShip.mesh.position;
    const yaw = playerShip.yaw ?? 0;
    // Behind direction in world coordinates:
    const behindX = Math.sin(yaw);
    const behindZ = Math.cos(yaw);

    for (let i = 0; i < this._segmentCount; i++) {
      const segDist = distance + i * this._segmentLen;
      const px = shipPos.x + behindX * segDist;
      const pz = shipPos.z + behindZ * segDist;
      let py = 0;
      if (this._ocean) {
        py = this._ocean.getWaveInfo(px, pz).height + 0.3;
      }
      this._segments[i].position.set(px, py, pz);
      if (i > 0) {
        this._segments[i].lookAt(this._segments[i - 1].position);
      } else {
        this._segments[0].lookAt(shipPos.x, py, shipPos.z);
      }
    }
  }

  /**
   * Switch to attack mode (player failed the race).
   */
  startAttack() {
    this._state = 'attacking';
    this._hasImpacted = false;
  }

  /**
   * Freeze the tentacle in place (wrapped around terrain).
   */
  catch() {
    this._state = 'caught';
  }

  /**
   * Per-frame update.
   * @param {number} delta
   * @param {import('../obstacle/PlayerShip.js').PlayerShip} playerShip
   * @param {number} [timeRatio=1.0] Ratio of time remaining (1.0 = start, 0.0 = expired)
   */
  update(delta, playerShip, timeRatio = 1.0) {
    if (this._state === 'idle' || this._state === 'caught') return;

    this._time += delta;

    const head = this._segments[0];
    const shipPos = playerShip.mesh.position;

    // Direction vector from tentacle head to player ship
    const dx = shipPos.x - head.position.x;
    const dz = shipPos.z - head.position.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const dirX = dx / dist;
    const dirZ = dz / dist;

    if (this._state === 'pursuing') {
      // Approach relative to time remaining:
      // When timeRatio = 1.0 (start), distance is 30.0 units.
      // When timeRatio = 0.0 (near end), distance is 5.2 units (close menace, strictly no premature intersection).
      const clampedRatio = Math.max(0, Math.min(1, timeRatio));
      const desiredDist = 5.2 + 24.8 * clampedRatio;

      if (dist < desiredDist) {
        // Enforce safe boundary so tentacle never intersects boat before time is up
        head.position.x = shipPos.x - dirX * desiredDist;
        head.position.z = shipPos.z - dirZ * desiredDist;
      } else {
        // Smoothly close distance towards desiredDist, scaling speed to match or catch boat
        const followSpeed = Math.max(this._speed, 20.0);
        const step = Math.min(dist - desiredDist, followSpeed * delta);
        head.position.x += dirX * step;
        head.position.z += dirZ * step;
      }

      // Ride ocean surface with slight menacing bob
      if (this._ocean) {
        const waveInfo = this._ocean.getWaveInfo(head.position.x, head.position.z);
        head.position.y = waveInfo.height + 0.4;
      }

      head.lookAt(shipPos.x, head.position.y, shipPos.z);
    } else if (this._state === 'attacking') {
      // Time is up! Tentacle accelerates and slams into the boat
      if (!this._hasImpacted) {
        const surgeStep = Math.min(dist, this._attackSpeed * delta);
        head.position.x += dirX * surgeStep;
        head.position.z += dirZ * surgeStep;

        // Arch up menacingly out of the water like a striking strike
        if (this._ocean) {
          const waveInfo = this._ocean.getWaveInfo(head.position.x, head.position.z);
          const arch = Math.sin(Math.min(1.0, dist / 8.0) * Math.PI) * 2.5;
          head.position.y = waveInfo.height + 0.5 + arch;
        }

        head.lookAt(shipPos.x, head.position.y, shipPos.z);

        // Check for boat impact
        if (dist < 3.2 && !playerShip.isImmune()) {
          this._hasImpacted = true;
          const rockDamage = 20; // Identical damage to rock collision

          // Deal damage: punches holes in hull, updates HP and HUD
          playerShip.takeDamage(rockDamage, 'kraken_tentacle');
          playerShip.setImmune(2.0);

          // Physical rock collision response: violent pitch and roll impulse
          playerShip.bounceBack(dx, dz, 'rock');

          // Static push away from impact direction
          playerShip.mesh.position.x += dirX * 3.0;
          playerShip.mesh.position.z += dirZ * 3.0;

          // Pinball knockback velocity
          playerShip.applyKnockback(new THREE.Vector3(dirX * 45, 0, dirZ * 45));

          // Audio and screen shake feedback
          emit('obstacleHit', { type: 'rock', damage: rockDamage });
          emit('playSound', { sound: 'collision' });

          // Recoil tentacle head back so it doesn't clip through the hull
          head.position.x = shipPos.x - dirX * 10.0;
          head.position.z = shipPos.z - dirZ * 10.0;
        }
      } else {
        // Lingering at recoil distance in water after impact
        if (this._ocean) {
          const waveInfo = this._ocean.getWaveInfo(head.position.x, head.position.z);
          head.position.y = waveInfo.height - 0.2;
        }
      }
    }

    // IK chain — each segment follows the previous
    for (let i = 1; i < this._segmentCount; i++) {
      const prev = this._segments[i - 1];
      const curr = this._segments[i];

      const fx = prev.position.x - curr.position.x;
      const fz = prev.position.z - curr.position.z;
      const fDist = Math.hypot(fx, fz) || 0.001;

      if (fDist > this._segmentLen) {
        const move = fDist - this._segmentLen;
        curr.position.x += (fx / fDist) * move;
        curr.position.z += (fz / fDist) * move;
      }

      // Ride ocean surface
      if (this._ocean) {
        const waveInfo = this._ocean.getWaveInfo(curr.position.x, curr.position.z);
        curr.position.y = waveInfo.height + 0.3;
      }

      // Orient toward previous segment
      curr.lookAt(prev.position.x, curr.position.y, prev.position.z);

      // Procedural sine undulation on Y axis for organic motion
      const phase = i * 0.7;
      const undulate = Math.sin(this._time * 3.5 - phase) * 0.4 * (i / this._segmentCount);
      curr.position.y += undulate;
    }
  }

  /**
   * Get the world position of the tentacle head.
   * @returns {THREE.Vector3}
   */
  getHeadPosition() {
    return this._segments[0].position.clone();
  }

  /**
   * Play a visual "wrap" animation — tween segments to fixed positions
   * around a terrain anchor point.
   * @param {THREE.Vector3} terrainPoint  The center of the terrain to wrap around
   * @param {number} [wrapRadius=8]
   */
  playWrapAnimation(terrainPoint, wrapRadius = 8) {
    this._state = 'caught';

    // Compute wrap positions — spiral around the terrain point
    for (let i = 0; i < this._segmentCount; i++) {
      const t = i / (this._segmentCount - 1);
      const angle = t * Math.PI * 2.5; // 2.5 full wraps
      const r = wrapRadius * (1 - t * 0.3); // spiral inward slightly
      const targetX = terrainPoint.x + Math.cos(angle) * r;
      const targetZ = terrainPoint.z + Math.sin(angle) * r;
      const targetY = terrainPoint.y + t * 3; // rise slightly

      // Store target for tweening
      this._segments[i].userData.wrapTarget = new THREE.Vector3(targetX, targetY, targetZ);
      this._segments[i].userData.wrapProgress = 0;
    }

    this._wrapAnimating = true;
  }

  /**
   * Update the wrap animation if active.
   * @param {number} delta
   * @returns {boolean} True if animation is still playing
   */
  updateWrapAnimation(delta) {
    if (!this._wrapAnimating) return false;

    let allDone = true;
    for (const seg of this._segments) {
      if (seg.userData.wrapTarget) {
        seg.userData.wrapProgress += delta * 2.0; // 0.5 seconds
        const t = Math.min(seg.userData.wrapProgress, 1.0);
        const eased = t * t * (3 - 2 * t); // smoothstep
        seg.position.lerp(seg.userData.wrapTarget, eased);
        if (t < 1.0) allDone = false;
      }
    }

    if (allDone) {
      this._wrapAnimating = false;
      // Clean up userData
      for (const seg of this._segments) {
        delete seg.userData.wrapTarget;
        delete seg.userData.wrapProgress;
      }
    }

    return !allDone;
  }

  /**
   * Set visibility of the entire tentacle.
   * @param {boolean} visible
   */
  setVisible(visible) {
    this._group.visible = visible;
  }

  dispose() {
    for (const seg of this._segments) {
      seg.geometry.dispose();
      seg.material.dispose();
    }
    this._scene?.remove(this._group);
  }
}

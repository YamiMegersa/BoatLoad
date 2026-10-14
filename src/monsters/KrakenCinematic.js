import * as THREE from 'three';

// ---------------------------------------------------------------------------
// KrakenCinematic — Bezier curve camera flight for boss damage reveals
// ---------------------------------------------------------------------------

/**
 * Controls the camera during the damage reveal after each tentacle is caught.
 * Flies the camera from the player to the Kraken along a cubic Bezier curve,
 * holds for a moment while the Kraken flinches, then flies back.
 */
export class KrakenCinematic {
  constructor() {
    this._active = false;

    /** @type {THREE.CubicBezierCurve3|null} */
    this._curve = null;
    this._returnCurve = null;

    this._duration = 2.8;     // fly-to duration (seconds)
    this._holdDuration = 1.2; // hold at kraken
    this._returnDuration = 1.6; // fly-back duration
    this._elapsed = 0;

    this._phase = 'idle'; // 'fly_to' | 'hold' | 'fly_back' | 'idle'

    /** @type {THREE.Camera|null} */
    this._camera = null;
    this._krakenPos = null;
    this._krakenMesh = null;
    this._tentacle = null;
    this._playerShip = null;

    this._savedCamPos = new THREE.Vector3();
    this._savedCamTarget = new THREE.Vector3();
    this._tentacleWaterPos = new THREE.Vector3();

    /** @type {Function|null} */
    this._onComplete = null;

    // Flinch animation state
    this._flinchTime = 0;
    this._originalKrakenPos = new THREE.Vector3();
  }

  /** @returns {boolean} Is a cinematic currently playing? */
  get isActive() { return this._active; }

  /**
   * Start the cinematic sequence.
   *
   * @param {THREE.Camera} camera
   * @param {THREE.Vector3} fromPos        Current camera position
   * @param {THREE.Vector3} krakenPos      World position of the Kraken
   * @param {THREE.Object3D|null} krakenMesh  The Kraken mesh to shake
   * @param {import('./TentacleFollower.js').TentacleFollower|Function} [tentacle]  Defeated tentacle to frame sinking
   * @param {import('../obstacle/PlayerShip.js').PlayerShip|Function} [playerShip] Player ship reference
   * @param {Function} [onComplete]          Called when the cinematic finishes
   */
  play(camera, fromPos, krakenPos, krakenMesh, tentacle, playerShip, onComplete) {
    // Backwards-compatibility argument handling
    if (typeof tentacle === 'function') {
      onComplete = tentacle;
      tentacle = null;
      playerShip = null;
    } else if (typeof playerShip === 'function') {
      onComplete = playerShip;
      playerShip = null;
    }

    this._camera = camera;
    this._krakenPos = krakenPos.clone();
    this._krakenMesh = krakenMesh;
    this._tentacle = tentacle;
    this._playerShip = playerShip;
    this._onComplete = onComplete;
    this._elapsed = 0;
    this._active = true;
    this._phase = 'fly_to';

    this._duration = 2.8;     // 2.8s clean forward sweep
    this._holdDuration = 1.2; // 1.2s hold at kraken to see damage
    this._returnDuration = 1.6; // 1.6s smooth return back to ship

    // Save initial camera state
    this._savedCamPos.copy(camera.position);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    this._savedCamTarget.copy(camera.position).addScaledVector(dir, 25);

    if (krakenMesh) {
      this._originalKrakenPos.copy(krakenMesh.position);
    }

    // Unified direction vector in horizontal XZ plane from camera towards octopus
    const sweepDir = new THREE.Vector3(krakenPos.x - fromPos.x, 0, krakenPos.z - fromPos.z);
    const totalDist = Math.max(20, sweepDir.length());
    sweepDir.normalize();

    // Stable water-level position where the tentacle falls into the sea
    let tentacleWaterPos = fromPos.clone().addScaledVector(sweepDir, 16);
    tentacleWaterPos.y = 0;
    if (tentacle && typeof tentacle.getDefeatFocusPosition === 'function') {
      const p = tentacle.getDefeatFocusPosition();
      tentacleWaterPos.set(p.x, 0, p.z);
    }
    this._tentacleWaterPos.copy(tentacleWaterPos);

    // P0: Start position at current camera
    const P0 = fromPos.clone();

    // P3: Framing position directly in front of the octopus
    const P3 = krakenPos.clone()
      .addScaledVector(sweepDir, -24)
      .add(new THREE.Vector3(0, 7.5, 0));

    // Clean, elegant parabolic crane flight curve along sweepDir:
    // P1 smoothly lifts camera up to 14-18m height giving clean downward view of the falling tentacle
    const liftY = Math.min(20, Math.max(12, totalDist * 0.13));
    const P1 = P0.clone()
      .addScaledVector(sweepDir, totalDist * 0.30)
      .add(new THREE.Vector3(0, liftY, 0));

    // P2 smooth deceleration approach towards P3
    const P2 = P3.clone()
      .addScaledVector(sweepDir, -totalDist * 0.28)
      .add(new THREE.Vector3(0, liftY * 0.60, 0));

    this._curve = new THREE.CubicBezierCurve3(P0, P1, P2, P3);

    // Return curve: mirror along sweepDir back to player camera
    const R0 = P3.clone();
    const R1 = P3.clone()
      .addScaledVector(sweepDir, -totalDist * 0.28)
      .add(new THREE.Vector3(0, liftY * 0.60, 0));
    const R2 = this._savedCamPos.clone()
      .addScaledVector(sweepDir, totalDist * 0.25)
      .add(new THREE.Vector3(0, liftY * 0.50, 0));
    const R3 = this._savedCamPos.clone();

    this._returnCurve = new THREE.CubicBezierCurve3(R0, R1, R2, R3);
  }

  /**
   * Per-frame update. Call every frame while `isActive` is true.
   * @param {number} delta
   */
  update(delta) {
    if (!this._active) return;

    this._elapsed += delta;

    switch (this._phase) {
      case 'fly_to':
        this._updateFlyTo(delta);
        break;
      case 'hold':
        this._updateHold(delta);
        break;
      case 'fly_back':
        this._updateFlyBack(delta);
        break;
    }
  }

  // -----------------------------------------------------------------------
  // Phase handlers
  // -----------------------------------------------------------------------

  _updateFlyTo(delta) {
    const t = Math.min(this._elapsed / this._duration, 1.0);
    const eased = this._easeInOut(t);

    // Clean forward camera sweep
    const pos = this._curve.getPoint(eased);
    this._camera.position.copy(pos);

    // Gaze behavior:
    // 1. Facing downwards to see the tentacle fall (t: 0.0 -> 0.40)
    // 2. Tilting upwards to see the octopus take damage (t: 0.40 -> 1.0)
    const krakenLookTarget = this._krakenPos.clone().add(new THREE.Vector3(0, 3.5, 0));
    const lookTarget = new THREE.Vector3();

    if (t < 0.40) {
      // Facing downwards: smoothly ease from initial view to facing the water where tentacle falls
      const easeDown = this._easeInOut(Math.min(1.0, t / 0.15));
      lookTarget.lerpVectors(this._savedCamTarget, this._tentacleWaterPos, easeDown);
    } else {
      // Tilting upwards: smooth cinematic tilt from the ocean surface up to the octopus taking damage
      const easeUp = this._easeInOut((t - 0.40) / 0.60);
      lookTarget.lerpVectors(this._tentacleWaterPos, krakenLookTarget, easeUp);
    }

    this._camera.lookAt(lookTarget);

    if (t >= 1.0) {
      this._phase = 'hold';
      this._elapsed = 0;
      this._flinchTime = 0;
    }
  }

  _updateHold(delta) {
    // Camera stays put, looking at the Kraken
    const krakenLookTarget = this._krakenPos.clone().add(new THREE.Vector3(0, 3.5, 0));
    this._camera.lookAt(krakenLookTarget);

    // Kraken flinch — violent shake
    this._flinchTime += delta;
    if (this._krakenMesh) {
      const shake = Math.sin(this._flinchTime * 40) * Math.max(0, 1 - this._flinchTime / this._holdDuration);
      this._krakenMesh.position.x = this._originalKrakenPos.x + shake * 1.5;
      this._krakenMesh.position.z = this._originalKrakenPos.z + shake * 0.8;

      // Flash the material red briefly
      this._krakenMesh.traverse(child => {
        if (child.isMesh && child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const mat of mats) {
            if (mat.emissive) {
              const flash = Math.max(0, 1 - this._flinchTime / 0.3);
              mat.emissive.setRGB(flash * 0.8, 0, 0);
            }
          }
        }
      });
    }

    if (this._elapsed >= this._holdDuration) {
      // Reset kraken position
      if (this._krakenMesh) {
        this._krakenMesh.position.copy(this._originalKrakenPos);
        // Reset emissive
        this._krakenMesh.traverse(child => {
          if (child.isMesh && child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            for (const mat of mats) {
              if (mat.emissive) mat.emissive.setRGB(0, 0, 0);
            }
          }
        });
      }
      this._startFlyBack();
    }
  }

  _startFlyBack() {
    this._phase = 'fly_back';
    this._elapsed = 0;

    // Start position and gaze of return flight in front of Kraken
    this._returnStartCamPos = this._camera.position.clone();
    this._returnStartLookTarget = this._krakenPos.clone().add(new THREE.Vector3(0, 3.5, 0));
  }

  _updateFlyBack(delta) {
    const t = Math.min(this._elapsed / this._returnDuration, 1.0);
    const eased = this._easeInOut(t);

    // Dynamic destination: calculate live chase camera position & look target behind player ship
    let targetCamPos = this._savedCamPos.clone();
    let targetLook = this._savedCamTarget.clone();

    if (this._playerShip && this._playerShip.mesh) {
      const p = this._playerShip.mesh.position;
      const yaw = this._playerShip.yaw ?? 0;
      const shipDir = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      targetCamPos = p.clone().addScaledVector(shipDir, -16).add(new THREE.Vector3(0, 5, 0));
      targetLook = p.clone();
    }

    // Dynamic cubic Bezier from _returnStartCamPos to targetCamPos
    const R0 = this._returnStartCamPos || this._camera.position.clone();
    const R3 = targetCamPos;

    const returnVec = new THREE.Vector3().subVectors(R3, R0);
    const returnDist = Math.max(15, returnVec.length());
    const returnDir = returnVec.clone().normalize();

    const liftY = Math.min(18, Math.max(10, returnDist * 0.12));
    const R1 = R0.clone()
      .addScaledVector(returnDir, returnDist * 0.32)
      .add(new THREE.Vector3(0, liftY * 0.55, 0));
    const R2 = R3.clone()
      .addScaledVector(returnDir, -returnDist * 0.28)
      .add(new THREE.Vector3(0, liftY * 0.40, 0));

    // Evaluate cubic Bezier at eased t: B(u) = (1-u)^3 R0 + 3(1-u)^2 u R1 + 3(1-u) u^2 R2 + u^3 R3
    const u = eased;
    const u2 = u * u;
    const u3 = u2 * u;
    const oneMinusU = 1.0 - u;
    const oneMinusU2 = oneMinusU * oneMinusU;
    const oneMinusU3 = oneMinusU2 * oneMinusU;

    const pos = new THREE.Vector3()
      .addScaledVector(R0, oneMinusU3)
      .addScaledVector(R1, 3.0 * oneMinusU2 * u)
      .addScaledVector(R2, 3.0 * oneMinusU * u2)
      .addScaledVector(R3, u3);

    this._camera.position.copy(pos);

    // Smoothly tilt and pan from Kraken back to ship
    const startLook = this._returnStartLookTarget || this._krakenPos.clone().add(new THREE.Vector3(0, 3.5, 0));
    const lookTarget = new THREE.Vector3().lerpVectors(
      startLook,
      targetLook,
      eased
    );
    this._camera.lookAt(lookTarget);

    if (t >= 1.0) {
      this._finish(targetCamPos, targetLook);
    }
  }

  _finish(finalCamPos, finalLookTarget) {
    this._active = false;
    this._phase = 'idle';

    // Camera is already at return target — ensure exact alignment with zero jump
    if (finalCamPos) {
      this._camera.position.copy(finalCamPos);
    }
    if (finalLookTarget) {
      this._camera.lookAt(finalLookTarget);
    }

    if (this._onComplete) {
      const cb = this._onComplete;
      this._onComplete = null;
      cb();
    }
  }

  dispose() {
    if (this._active) {
      this._finish();
    }
  }

  /**
   * Smootherstep ease (Ken Perlin): 6t^5 - 15t^4 + 10t^3.
   * Continuous 1st and 2nd derivatives ensure zero jerk and silky smooth acceleration/deceleration.
   * @param {number} t  0–1
   * @returns {number}
   */
  _easeInOut(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
}

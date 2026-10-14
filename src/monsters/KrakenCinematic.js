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

    this._duration = 2.5;     // fly-to duration (seconds)
    this._holdDuration = 1.0; // hold at kraken
    this._returnDuration = 1.5; // fly-back duration
    this._elapsed = 0;

    this._phase = 'idle'; // 'fly_to' | 'hold' | 'fly_back' | 'idle'

    /** @type {THREE.Camera|null} */
    this._camera = null;
    this._krakenPos = null;
    this._krakenMesh = null;

    this._savedCamPos = new THREE.Vector3();
    this._savedCamTarget = new THREE.Vector3();

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
   * @param {Function} onComplete          Called when the cinematic finishes
   */
  play(camera, fromPos, krakenPos, krakenMesh, onComplete) {
    this._camera = camera;
    this._krakenPos = krakenPos.clone();
    this._krakenMesh = krakenMesh;
    this._onComplete = onComplete;
    this._elapsed = 0;
    this._active = true;
    this._phase = 'fly_to';

    // Save current camera state for restoration
    this._savedCamPos.copy(camera.position);
    // Approximate current look target from camera direction
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    this._savedCamTarget.copy(camera.position).addScaledVector(dir, 30);

    if (krakenMesh) {
      this._originalKrakenPos.copy(krakenMesh.position);
    }

    // Dynamic flight calculation:
    // Relative vector and distance between player camera and Kraken
    const toKraken = new THREE.Vector3().subVectors(krakenPos, fromPos);
    const totalDist = toKraken.length();
    const travelDir = toKraken.clone().normalize();

    // Direction from Kraken back towards camera approach angle
    const fromKrakenDir = travelDir.clone().negate();
    fromKrakenDir.y = 0;
    if (fromKrakenDir.lengthSq() < 0.001) fromKrakenDir.set(0, 0, 1);
    else fromKrakenDir.normalize();

    // Framing close-up position in front of Kraken (elevated for good view)
    const P0 = fromPos.clone();
    const P3 = krakenPos.clone()
      .addScaledVector(fromKrakenDir, 22)
      .add(new THREE.Vector3(0, 7, 0));

    // Smooth tangent control points
    const liftY = Math.min(22, Math.max(10, totalDist * 0.15));
    const forwardStep = Math.min(totalDist * 0.35, 35);

    // P1: Smoothly carries camera forward and upward along initial trajectory
    const P1 = P0.clone()
      .addScaledVector(travelDir, forwardStep)
      .add(new THREE.Vector3(0, liftY, 0));

    // P2: Deceleration arc approaching framing position in front of Kraken
    const P2 = P3.clone()
      .addScaledVector(fromKrakenDir, Math.min(totalDist * 0.3, 25))
      .add(new THREE.Vector3(0, liftY * 0.75, 0));

    this._curve = new THREE.CubicBezierCurve3(P0, P1, P2, P3);

    // Return curve: mirror the smooth flight path back to player camera
    const R0 = P3.clone();
    const R1 = P3.clone()
      .addScaledVector(fromKrakenDir, 25)
      .add(new THREE.Vector3(0, liftY * 0.6, 0));
    const R2 = this._savedCamPos.clone()
      .addScaledVector(fromKrakenDir, -forwardStep * 0.6)
      .add(new THREE.Vector3(0, liftY * 0.5, 0));
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

    const pos = this._curve.getPoint(eased);
    this._camera.position.copy(pos);

    // Smoothly transition look-at target from player's view towards Kraken (no sudden snap!)
    const lookTarget = new THREE.Vector3().lerpVectors(
      this._savedCamTarget,
      this._krakenPos,
      eased
    );
    this._camera.lookAt(lookTarget);

    if (t >= 1.0) {
      this._phase = 'hold';
      this._elapsed = 0;
      this._flinchTime = 0;
    }
  }

  _updateHold(delta) {
    // Camera stays put, looking at the Kraken
    this._camera.lookAt(this._krakenPos);

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
      this._phase = 'fly_back';
      this._elapsed = 0;
    }
  }

  _updateFlyBack(delta) {
    const t = Math.min(this._elapsed / this._returnDuration, 1.0);
    const eased = this._easeInOut(t);

    const pos = this._returnCurve.getPoint(eased);
    this._camera.position.copy(pos);

    // Gradually transition look-at from kraken back to saved target
    const lookTarget = new THREE.Vector3().lerpVectors(
      this._krakenPos,
      this._savedCamTarget,
      eased
    );
    this._camera.lookAt(lookTarget);

    if (t >= 1.0) {
      this._finish();
    }
  }

  _finish() {
    this._active = false;
    this._phase = 'idle';

    // Restore camera exactly
    this._camera.position.copy(this._savedCamPos);
    this._camera.lookAt(this._savedCamTarget);

    if (this._onComplete) {
      this._onComplete();
      this._onComplete = null;
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

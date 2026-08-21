import * as THREE from 'three';

const _q  = new THREE.Quaternion();
const _UP = new THREE.Vector3(0, 1, 0);

/**
 * FishAnimator
 *
 * All 9780 mesh vertices are bound 100% to the single "Tail" bone (joint 8).
 * This means rotating tailBone rotates the ENTIRE shark mesh.
 *
 * Strategy:
 *   - The outer sharkScene wrapper counter-rotates so the shark appears to
 *     swim in a straight line with its body yawing side-to-side.
 *   - The tailBone produces the actual lateral undulation.
 *   - A gentle scale squash-stretch gives the "cartoony spring" feel.
 *
 * @param {THREE.Object3D}  mesh      - the shark scene root (sharkScene)
 * @param {THREE.Bone}      tailBone  - the repaired TailBone from SharkSkinRepair
 * @param {number}          [speed=1] - animation speed multiplier
 */
export class FishAnimator {
  constructor(mesh, tailBone, speed = 1.0) {
    this.mesh     = mesh;
    this.tailBone = tailBone;
    this.speed    = speed;
    this.time     = Math.random() * Math.PI * 2; // random phase per instance

    // Store the tail bone's rest quaternion
    this._tailRestQ = tailBone
      ? tailBone.quaternion.clone()
      : new THREE.Quaternion();

    // Base scale so squash-stretch is relative
    this._baseScale = mesh.scale.x;
    this._bobOffset = 0;
  }

  /**
   * @param {number} delta  seconds since last frame
   */
  update(delta) {
    this.time += delta * this.speed;
    const t = this.time;

    if (this.tailBone) {
      // ------------------------------------------------------------------
      // Tail bone yaw: ±25° lateral wag.
      // Because ALL vertices are bound to this bone, this rotates the
      // entire mesh geometry around the tail pivot point.
      // ------------------------------------------------------------------
      const tailWag = Math.sin(t * 4.5) * 0.44; // ±25°
      _q.setFromAxisAngle(_UP, tailWag);
      this.tailBone.quaternion.multiplyQuaternions(this._tailRestQ, _q);

      // ------------------------------------------------------------------
      // Counter-rotate the outer wrapper by ~70% of the tail angle so the
      // shark's nose traces a gentle S-curve instead of spinning in a
      // circle. The remaining 30% shows up as visible body sway.
      // ------------------------------------------------------------------
      this.mesh.rotation.y = -tailWag * 0.7;
    } else {
      // Fallback: whole-mesh yaw only (no skin repair)
      this.mesh.rotation.y = Math.sin(t * 4.5) * 0.18;
    }

    // ------------------------------------------------------------------
    // Vertical bobbing — different frequency so it doesn't lock-step
    // with the tail wag.
    // ------------------------------------------------------------------
    this._bobOffset = Math.sin(t * 1.6) * 0.35;

    // ------------------------------------------------------------------
    // Cartoony squash-and-stretch (uniform scale, no shear).
    // Stretch at tail-centre (max speed), squash at full deflection.
    // ------------------------------------------------------------------
    const stretch = 1.0 + Math.cos(t * 9.0) * 0.05; // ±5%
    const s = this._baseScale * stretch;
    this.mesh.scale.set(s, s, s);
  }

  /**
   * The vertical bob offset to apply on top of the shark's base Y position.
   * Expose this so EnvironmentManager can add it without fighting its own
   * baseY tracking.
   * @returns {number}
   */
  get bobOffset() {
    return this._bobOffset;
  }
}

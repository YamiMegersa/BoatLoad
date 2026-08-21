import * as THREE from 'three';

const _q  = new THREE.Quaternion();
const _UP = new THREE.Vector3(0, 1, 0);

/**
 * FishAnimator
 *
 * Articulates the shark's bones procedurally for a natural swimming motion.
 *
 * @param {THREE.Object3D}  mesh      - the shark scene root
 * @param {number}          [speed=1] - animation speed multiplier
 */
export class FishAnimator {
  constructor(mesh, speed = 1.0) {
    this.mesh  = mesh;
    this.speed = speed;
    this.time  = Math.random() * Math.PI * 2; // random phase per instance

    // Extract all bones
    this.bones = {};
    this.restQs = {};
    mesh.traverse(c => {
      if (c.isBone) {
        this.bones[c.name] = c;
        this.restQs[c.name] = c.quaternion.clone();
      }
    });

    // Base scale so squash-stretch is relative
    this._baseScale = mesh.scale.x;
    this._bobOffset = 0;
    this._yawOffset = 0;
  }

  /**
   * @param {number} delta  seconds since last frame
   */
  update(delta) {
    this.time += delta * this.speed;
    const t = this.time;

    // 1. S-curve Spine Animation (Spine1, Spine2, Spine3, Tail)
    const spineBones = ['Spine1', 'Spine2', 'Spine3', 'Tail'];
    let hasSpine = false;
    spineBones.forEach((name, i) => {
      const bone = this.bones[name];
      if (bone) {
        hasSpine = true;
        // phase shifts along the spine
        const phase = i * 0.8;
        // Exaggerated amplitude: originally 0.15 + i*0.1, doubled for effect
        const amplitude = 0.3 + i * 0.2;
        const wag = Math.sin(t * 4.5 - phase) * amplitude;
        _q.setFromAxisAngle(_UP, wag);
        bone.quaternion.multiplyQuaternions(this.restQs[name], _q);
      }
    });

    if (hasSpine) {
      // Counter-rotate slightly if needed, though spine animation
      // usually looks fine on its own. We'll do a small counter-rotation.
      const headWag = Math.sin(t * 4.5) * 0.15;
      this._yawOffset = -headWag;
    } else {
      // Fallback if bones aren't found
      this._yawOffset = Math.sin(t * 4.5) * 0.18;
    }

    // 2. Pectoral Fins (Bone, Bone.001)
    // Exaggerated fin flap: doubled from 0.15 to 0.3
    const finFlap = Math.sin(t * 4.5) * 0.3;
    const _FORWARD = new THREE.Vector3(0, 0, 1);
    
    if (this.bones['Bone']) {
      // Wag up and down (roll axis)
      _q.setFromAxisAngle(_FORWARD, finFlap);
      this.bones['Bone'].quaternion.multiplyQuaternions(this.restQs['Bone'], _q);
    }
    if (this.bones['Bone.001']) {
      // Opposite sign because the bones are likely mirrored
      _q.setFromAxisAngle(_FORWARD, -finFlap);
      this.bones['Bone.001'].quaternion.multiplyQuaternions(this.restQs['Bone.001'], _q);
    }

    // 3. Face/Jaw breathing
    if (this.bones['Face']) {
      // Exaggerated jaw movement: increased amplitude
      const jawOpen = (Math.sin(t * 2.0) + 1) * 0.15; // 0 to 0.3
      _q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), jawOpen);
      this.bones['Face'].quaternion.multiplyQuaternions(this.restQs['Face'], _q);
    }

    // Vertical bobbing (reduced by 50% from 0.35 to 0.175)
    this._bobOffset = Math.sin(t * 1.6) * 0.175;

    // Squash-and-stretch (reduced by 50% from 0.05 to 0.025)
    const stretch = 1.0 + Math.cos(t * 9.0) * 0.025; // ±2.5%
    const s = this._baseScale * stretch;
    this.mesh.scale.set(s, s, s);
  }

  get bobOffset() {
    return this._bobOffset;
  }

  get yawOffset() {
    return this._yawOffset;
  }
}

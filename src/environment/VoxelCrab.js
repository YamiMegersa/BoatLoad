import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Voxel Crab Palette & Materials
// ---------------------------------------------------------------------------
const CrabPalette = {
  shellRed: 0xc83e2b,
  shellBright: 0xe25638,
  shellDark: 0x8a2216,
  bellyCream: 0xe5cba6,
  eyeStalk: 0xb83423,
  eye: 0x141010,
  eyeShine: 0xffffff,
  brass: 0xd4af37,
  foam: 0xdff6ff
};

function createVoxelMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.72,
    metalness: opts.metalness ?? 0.08,
    flatShading: true,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1.0
  });
}

function createBox(w, h, d, material, castShadow = true, receiveShadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

// ---------------------------------------------------------------------------
// Voxel Crab Clerk Class (Barnaby Claw, Esq.)
// ---------------------------------------------------------------------------
export class VoxelCrab {
  /**
   * @param {THREE.Group} parentGroup - Island group to attach the crab to
   * @param {THREE.Vector3} initialPos - Starting local position in shallow water near beach
   */
  constructor(parentGroup, initialPos = new THREE.Vector3(9.5, 0.32, -19.2)) {
    this.parentGroup = parentGroup;
    this.group = new THREE.Group();
    this.initialPos = initialPos.clone();
    this.group.position.copy(initialPos);
    this.group.scale.setScalar(1.65);
    this.baseY = initialPos.y;

    this.mats = {
      shellRed: createVoxelMat(CrabPalette.shellRed),
      shellBright: createVoxelMat(CrabPalette.shellBright),
      shellDark: createVoxelMat(CrabPalette.shellDark),
      bellyCream: createVoxelMat(CrabPalette.bellyCream, { roughness: 0.85 }),
      eyeStalk: createVoxelMat(CrabPalette.eyeStalk),
      eye: createVoxelMat(CrabPalette.eye, { roughness: 0.15 }),
      eyeShine: createVoxelMat(CrabPalette.eyeShine, { roughness: 0.1 }),
      brass: createVoxelMat(CrabPalette.brass, { metalness: 0.65, roughness: 0.3 }),
      foam: createVoxelMat(CrabPalette.foam, { transparent: true, opacity: 0.45, roughness: 0.9 })
    };

    // State: 'idle' | 'talking' | 'scuttle'
    this.state = 'idle';
    this.scuttleTimer = 0;
    this.scuttleDir = 1;
    this.targetRotY = 0.25;
    this.group.rotation.y = this.targetRotY;

    this.legsL = [];
    this.legsR = [];
    this.interactables = [];

    this._buildMesh();
    parentGroup.add(this.group);
  }

  _buildMesh() {
    this.bodyGroup = new THREE.Group();
    this.bodyGroup.position.y = 0.14;
    this.group.add(this.bodyGroup);

    // 1. Wide Carapace Shell (Stepped voxel plates)
    const carapaceMain = createBox(0.46, 0.18, 0.34, this.mats.shellRed);
    this.bodyGroup.add(carapaceMain);

    const carapaceTop = createBox(0.38, 0.06, 0.26, this.mats.shellBright);
    carapaceTop.position.set(0, 0.11, -0.01);
    this.bodyGroup.add(carapaceTop);

    // Lateral shell spikes/edges
    const rimL = createBox(0.06, 0.10, 0.26, this.mats.shellDark);
    rimL.position.set(-0.25, 0.02, 0);
    this.bodyGroup.add(rimL);

    const rimR = createBox(0.06, 0.10, 0.26, this.mats.shellDark);
    rimR.position.set(0.25, 0.02, 0);
    this.bodyGroup.add(rimR);

    // Underbelly
    const belly = createBox(0.38, 0.06, 0.28, this.mats.bellyCream);
    belly.position.set(0, -0.10, 0);
    this.bodyGroup.add(belly);

    // Cute crab mouthparts / mandibles
    const mouthL = createBox(0.06, 0.05, 0.04, this.mats.bellyCream);
    mouthL.position.set(-0.05, -0.03, 0.18);
    this.bodyGroup.add(mouthL);

    const mouthR = createBox(0.06, 0.05, 0.04, this.mats.bellyCream);
    mouthR.position.set(0.05, -0.03, 0.18);
    this.bodyGroup.add(mouthR);

    // 2. Tall Articulated Eyestalks + Lawyer Monocle
    this.eyeLPivot = new THREE.Group();
    this.eyeLPivot.position.set(-0.11, 0.10, 0.14);
    this.bodyGroup.add(this.eyeLPivot);

    const stalkL = createBox(0.04, 0.12, 0.04, this.mats.eyeStalk);
    stalkL.position.set(0, 0.06, 0);
    this.eyeLPivot.add(stalkL);

    const eyeBallL = createBox(0.065, 0.065, 0.065, this.mats.eye);
    eyeBallL.position.set(0, 0.13, 0.01);
    this.eyeLPivot.add(eyeBallL);

    const shineL = createBox(0.022, 0.022, 0.015, this.mats.eyeShine);
    shineL.position.set(-0.012, 0.145, 0.045);
    this.eyeLPivot.add(shineL);

    this.eyeRPivot = new THREE.Group();
    this.eyeRPivot.position.set(0.11, 0.10, 0.14);
    this.bodyGroup.add(this.eyeRPivot);

    const stalkR = createBox(0.04, 0.12, 0.04, this.mats.eyeStalk);
    stalkR.position.set(0, 0.06, 0);
    this.eyeRPivot.add(stalkR);

    const eyeBallR = createBox(0.065, 0.065, 0.065, this.mats.eye);
    eyeBallR.position.set(0, 0.13, 0.01);
    this.eyeRPivot.add(eyeBallR);

    const shineR = createBox(0.022, 0.022, 0.015, this.mats.eyeShine);
    shineR.position.set(0.012, 0.145, 0.045);
    this.eyeRPivot.add(shineR);

    // Golden brass monocle frame around right eye (Clerk detail)
    const monocleRim = createBox(0.09, 0.09, 0.02, this.mats.brass);
    monocleRim.position.set(0, 0.13, 0.038);
    this.eyeRPivot.add(monocleRim);

    // 3. Articulated Pincer Claws (Left & Right)
    this.clawLPivot = new THREE.Group();
    this.clawLPivot.position.set(-0.24, 0.02, 0.14);
    this.clawLPivot.rotation.y = 0.35;
    this.bodyGroup.add(this.clawLPivot);

    const armL = createBox(0.14, 0.07, 0.08, this.mats.shellDark);
    armL.position.set(-0.06, 0, 0.06);
    armL.rotation.y = -0.4;
    this.clawLPivot.add(armL);

    const pincerBaseL = createBox(0.14, 0.11, 0.18, this.mats.shellBright);
    pincerBaseL.position.set(-0.10, 0.02, 0.18);
    this.clawLPivot.add(pincerBaseL);

    this.pincerTopL = createBox(0.08, 0.045, 0.14, this.mats.shellRed);
    this.pincerTopL.position.set(-0.10, 0.065, 0.25);
    this.clawLPivot.add(this.pincerTopL);

    const pincerBotL = createBox(0.08, 0.04, 0.13, this.mats.bellyCream);
    pincerBotL.position.set(-0.10, -0.02, 0.24);
    this.clawLPivot.add(pincerBotL);

    this.clawRPivot = new THREE.Group();
    this.clawRPivot.position.set(0.24, 0.02, 0.14);
    this.clawRPivot.rotation.y = -0.35;
    this.bodyGroup.add(this.clawRPivot);

    const armR = createBox(0.14, 0.07, 0.08, this.mats.shellDark);
    armR.position.set(0.06, 0, 0.06);
    armR.rotation.y = 0.4;
    this.clawRPivot.add(armR);

    const pincerBaseR = createBox(0.14, 0.11, 0.18, this.mats.shellBright);
    pincerBaseR.position.set(0.10, 0.02, 0.18);
    this.clawRPivot.add(pincerBaseR);

    this.pincerTopR = createBox(0.08, 0.045, 0.14, this.mats.shellRed);
    this.pincerTopR.position.set(0.10, 0.065, 0.25);
    this.clawRPivot.add(this.pincerTopR);

    const pincerBotR = createBox(0.08, 0.04, 0.13, this.mats.bellyCream);
    pincerBotR.position.set(0.10, -0.02, 0.24);
    this.clawRPivot.add(pincerBotR);

    // 4. Six Scuttling Legs (3 per side)
    const legZOffsets = [0.09, -0.01, -0.11];
    legZOffsets.forEach((zOff, idx) => {
      const legLPivot = new THREE.Group();
      legLPivot.position.set(-0.22, -0.04, zOff);
      const legL = createBox(0.18, 0.045, 0.045, this.mats.shellDark);
      legL.position.set(-0.08, -0.04, 0);
      legL.rotation.z = 0.45;
      legLPivot.add(legL);
      this.bodyGroup.add(legLPivot);
      this.legsL.push({ pivot: legLPivot, phase: idx * 1.1 });

      const legRPivot = new THREE.Group();
      legRPivot.position.set(0.22, -0.04, zOff);
      const legR = createBox(0.18, 0.045, 0.045, this.mats.shellDark);
      legR.position.set(0.08, -0.04, 0);
      legR.rotation.z = -0.45;
      legRPivot.add(legR);
      this.bodyGroup.add(legRPivot);
      this.legsR.push({ pivot: legRPivot, phase: idx * 1.1 + Math.PI });
    });

    // 5. Shallow water foam ring around crab
    this.foamRing = createBox(0.72, 0.02, 0.56, this.mats.foam, false, false);
    this.foamRing.position.set(0, -0.08, 0.04);
    this.group.add(this.foamRing);

    // 6. Generous Raycast Interaction Hitbox
    const hitBoxMat = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      colorWrite: false
    });
    this.hitBox = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.95, 1.15), hitBoxMat);
    this.hitBox.position.set(0, 0.25, 0.05);
    this.hitBox.userData.isCrab = true;
    this.group.add(this.hitBox);
    this.interactables.push(this.hitBox);

    this.group.traverse(child => {
      if (child.isMesh) {
        child.userData.isCrab = true;
      }
    });
  }

  /**
   * Triggered when the player interacts with the Crab Clerk.
   * @param {THREE.Vector3} [playerWorldPos]
   */
  interact(playerWorldPos) {
    this.state = 'talking';
    if (playerWorldPos && this.parentGroup) {
      const localTarget = this.parentGroup.worldToLocal(playerWorldPos.clone());
      const dx = localTarget.x - this.group.position.x;
      const dz = localTarget.z - this.group.position.z;
      this.targetRotY = Math.atan2(dx, dz);
    }
  }

  /**
   * Scuttle sideways along the shoreline after serving papers.
   */
  scuttleOff() {
    this.state = 'scuttle';
    this.scuttleTimer = 2.6;
  }

  reset() {
    this.state = 'idle';
    this.scuttleTimer = 0;
    this.group.position.copy(this.initialPos);
    this.targetRotY = 0.25;
    this.group.rotation.y = this.targetRotY;
  }

  update(delta, elapsedTime = 0) {
    // Smooth rotation toward target
    let angleDiff = this.targetRotY - this.group.rotation.y;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    this.group.rotation.y += angleDiff * Math.min(1.0, delta * 8.0);

    // Gentle wave bobbing
    const bob = Math.sin(elapsedTime * 3.2) * 0.025;
    this.bodyGroup.position.y = 0.14 + bob;

    if (this.foamRing) {
      const foamScale = 1.0 + Math.sin(elapsedTime * 3.2) * 0.08;
      this.foamRing.scale.set(foamScale, 1, foamScale);
    }

    if (this.state === 'talking') {
      // Energetic claw snapping and body rocking while speaking
      const snap = Math.abs(Math.sin(elapsedTime * 14.0));
      this.pincerTopL.position.y = 0.065 + snap * 0.035;
      this.pincerTopR.position.y = 0.065 + Math.abs(Math.cos(elapsedTime * 14.0)) * 0.035;
      this.clawLPivot.rotation.z = Math.sin(elapsedTime * 9.0) * 0.18;
      this.clawRPivot.rotation.z = -Math.cos(elapsedTime * 9.0) * 0.18;
      this.bodyGroup.rotation.z = Math.sin(elapsedTime * 7.0) * 0.06;
    } else if (this.state === 'scuttle') {
      this.scuttleTimer -= delta;
      // Scuttle sideways along the shallow shoreline
      this.group.position.x += delta * 1.4;
      this.group.position.z -= delta * 0.35;
      this.bodyGroup.rotation.z = Math.sin(elapsedTime * 18.0) * 0.09;

      // Rapid leg wave
      this.legsL.forEach(l => {
        l.pivot.rotation.z = Math.sin(elapsedTime * 22.0 + l.phase) * 0.35;
      });
      this.legsR.forEach(l => {
        l.pivot.rotation.z = Math.sin(elapsedTime * 22.0 + l.phase) * 0.35;
      });

      if (this.scuttleTimer <= 0) {
        this.state = 'idle';
      }
    } else {
      // Idle: occasional claw pinch and subtle leg/eyestalk twitch
      const idleSnap = Math.max(0, Math.sin(elapsedTime * 2.5) - 0.6) * 0.06;
      this.pincerTopL.position.y = 0.065 + idleSnap;
      this.pincerTopR.position.y = 0.065 + idleSnap;
      this.clawLPivot.rotation.z = Math.sin(elapsedTime * 1.8) * 0.05;
      this.clawRPivot.rotation.z = -Math.sin(elapsedTime * 1.8) * 0.05;
      this.bodyGroup.rotation.z = Math.sin(elapsedTime * 1.6) * 0.03;

      this.legsL.forEach(l => {
        l.pivot.rotation.z = Math.sin(elapsedTime * 2.5 + l.phase) * 0.06;
      });
      this.legsR.forEach(l => {
        l.pivot.rotation.z = Math.sin(elapsedTime * 2.5 + l.phase) * 0.06;
      });
    }
  }

  dispose() {
    if (this.group && this.group.parent) {
      this.group.parent.remove(this.group);
    }
    Object.values(this.mats).forEach(m => m.dispose());
  }
}

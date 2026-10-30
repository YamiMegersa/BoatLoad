import * as THREE from 'three';
import { emit } from '../core/EventBus.js';

// ---------------------------------------------------------------------------
// Voxel Crab Lawyer Palette & Materials
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
  suitBlack: 0x181b22,
  suitLapel: 0x282e3b,
  shirtWhite: 0xf4f6fb,
  tieRed: 0xc92222,
  briefcaseBrown: 0x4a2c18
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
// Voxel Crab Clerk Class (Barnaby Claw, Esq. — Attorney-at-Law)
// ---------------------------------------------------------------------------
export class VoxelCrab {
  /**
   * @param {THREE.Group} parentGroup - Island group to attach the crab to
   * @param {THREE.Vector3} initialPos - Starting local position on the shoreline sand (y = 1.15)
   */
  constructor(parentGroup, initialPos = new THREE.Vector3(8.5, 1.15, -19.8)) {
    this.parentGroup = parentGroup;
    this.group = new THREE.Group();
    this.initialPos = initialPos.clone();
    this.group.position.copy(initialPos);
    // Larger scale so his formal suit, tie, monocle, and top hat are crisp and prominent
    this.group.scale.setScalar(2.55);
    this.baseY = initialPos.y;

    this.mats = {
      shellRed: createVoxelMat(CrabPalette.shellRed),
      shellBright: createVoxelMat(CrabPalette.shellBright),
      shellDark: createVoxelMat(CrabPalette.shellDark),
      bellyCream: createVoxelMat(CrabPalette.bellyCream, { roughness: 0.85 }),
      eyeStalk: createVoxelMat(CrabPalette.eyeStalk),
      eye: createVoxelMat(CrabPalette.eye, { roughness: 0.15 }),
      eyeShine: createVoxelMat(CrabPalette.eyeShine, { roughness: 0.1 }),
      brass: createVoxelMat(CrabPalette.brass, { metalness: 0.68, roughness: 0.28 }),
      suitBlack: createVoxelMat(CrabPalette.suitBlack, { roughness: 0.82 }),
      suitLapel: createVoxelMat(CrabPalette.suitLapel, { roughness: 0.78 }),
      shirtWhite: createVoxelMat(CrabPalette.shirtWhite, { roughness: 0.75 }),
      tieRed: createVoxelMat(CrabPalette.tieRed, { roughness: 0.55 }),
      briefcaseBrown: createVoxelMat(CrabPalette.briefcaseBrown, { roughness: 0.8 })
    };

    // State: 'idle' | 'talking' | 'jumping' | 'hidden'
    this.state = 'idle';
    this.jumpTimer = 0;
    this.jumpDuration = 1.25;
    this.jumpStartPos = new THREE.Vector3();
    this.jumpEndPos = new THREE.Vector3();
    this._splashPlayed = false;

    this.targetRotY = -0.15;
    this.group.rotation.y = this.targetRotY;

    this.legsL = [];
    this.legsR = [];
    this.interactables = [];

    this._buildMesh();
    parentGroup.add(this.group);
  }

  _buildMesh() {
    this.bodyGroup = new THREE.Group();
    this.bodyGroup.position.y = 0.16;
    this.group.add(this.bodyGroup);

    // 1. Wide Carapace Shell & Tailored Formal Suit Jacket
    // Upper red carapace rim peeking out above suit collar
    const carapaceMain = createBox(0.48, 0.20, 0.36, this.mats.shellRed);
    this.bodyGroup.add(carapaceMain);

    // Tailored Charcoal Suit Jacket wrapping torso
    const suitCoat = createBox(0.50, 0.19, 0.37, this.mats.suitBlack);
    suitCoat.position.set(0, -0.01, -0.005);
    this.bodyGroup.add(suitCoat);

    // Suit shoulders / structured pads
    const shoulderL = createBox(0.08, 0.12, 0.30, this.mats.suitBlack);
    shoulderL.position.set(-0.27, 0.01, 0);
    this.bodyGroup.add(shoulderL);

    const shoulderR = createBox(0.08, 0.12, 0.30, this.mats.suitBlack);
    shoulderR.position.set(0.27, 0.01, 0);
    this.bodyGroup.add(shoulderR);

    // Rear Formal Coat Tails
    const tailCoatL = createBox(0.18, 0.12, 0.06, this.mats.suitBlack);
    tailCoatL.position.set(-0.11, -0.07, -0.20);
    tailCoatL.rotation.x = 0.25;
    this.bodyGroup.add(tailCoatL);

    const tailCoatR = createBox(0.18, 0.12, 0.06, this.mats.suitBlack);
    tailCoatR.position.set(0.11, -0.07, -0.20);
    tailCoatR.rotation.x = 0.25;
    this.bodyGroup.add(tailCoatR);

    // Crisp White Dress Shirt Front (V-plastron)
    const shirtFront = createBox(0.22, 0.18, 0.03, this.mats.shirtWhite);
    shirtFront.position.set(0, -0.005, 0.18);
    this.bodyGroup.add(shirtFront);

    // Stiff White Shirt Wing Collars
    const collarL = createBox(0.08, 0.05, 0.04, this.mats.shirtWhite);
    collarL.position.set(-0.055, 0.08, 0.188);
    collarL.rotation.z = -0.3;
    this.bodyGroup.add(collarL);

    const collarR = createBox(0.08, 0.05, 0.04, this.mats.shirtWhite);
    collarR.position.set(0.055, 0.08, 0.188);
    collarR.rotation.z = 0.3;
    this.bodyGroup.add(collarR);

    // Notched Suit Lapels framing the shirt & tie
    const lapelL = createBox(0.065, 0.17, 0.035, this.mats.suitLapel);
    lapelL.position.set(-0.11, -0.005, 0.188);
    lapelL.rotation.z = 0.22;
    this.bodyGroup.add(lapelL);

    const lapelR = createBox(0.065, 0.17, 0.035, this.mats.suitLapel);
    lapelR.position.set(0.11, -0.005, 0.188);
    lapelR.rotation.z = -0.22;
    this.bodyGroup.add(lapelR);

    // Crimson Silk Lawyer Necktie (Knot + Blade + Point)
    const tieKnot = createBox(0.048, 0.042, 0.035, this.mats.tieRed);
    tieKnot.position.set(0, 0.062, 0.198);
    this.bodyGroup.add(tieKnot);

    const tieBlade = createBox(0.042, 0.12, 0.032, this.mats.tieRed);
    tieBlade.position.set(0, -0.015, 0.198);
    this.bodyGroup.add(tieBlade);

    // Gold tie clip & jacket brass buttons
    const tieClip = createBox(0.046, 0.014, 0.036, this.mats.brass);
    tieClip.position.set(0, -0.01, 0.201);
    this.bodyGroup.add(tieClip);

    const btnL = createBox(0.025, 0.025, 0.02, this.mats.brass);
    btnL.position.set(-0.15, -0.04, 0.19);
    this.bodyGroup.add(btnL);

    const btnR = createBox(0.025, 0.025, 0.02, this.mats.brass);
    btnR.position.set(0.15, -0.04, 0.19);
    this.bodyGroup.add(btnR);

    // Pocket square (crimson silk fold in left breast pocket)
    const pocketSquare = createBox(0.045, 0.025, 0.02, this.mats.tieRed);
    pocketSquare.position.set(-0.17, 0.045, 0.19);
    this.bodyGroup.add(pocketSquare);

    // 2. Formal Lawyer Top Hat / Bowler Hat perched on carapace crown
    const hatGroup = new THREE.Group();
    hatGroup.position.set(0, 0.105, -0.01);
    hatGroup.rotation.x = -0.08;
    this.bodyGroup.add(hatGroup);

    const hatBrim = createBox(0.32, 0.03, 0.28, this.mats.suitBlack);
    hatGroup.add(hatBrim);

    const hatCrown = createBox(0.22, 0.15, 0.20, this.mats.suitBlack);
    hatCrown.position.y = 0.085;
    hatGroup.add(hatCrown);

    const hatBand = createBox(0.23, 0.032, 0.21, this.mats.tieRed);
    hatBand.position.y = 0.03;
    hatGroup.add(hatBand);

    const hatBuckle = createBox(0.045, 0.038, 0.015, this.mats.brass);
    hatBuckle.position.set(0, 0.03, 0.108);
    hatGroup.add(hatBuckle);

    // 3. Tall Articulated Eyestalks + Lawyer Monocle & Chain
    this.eyeLPivot = new THREE.Group();
    this.eyeLPivot.position.set(-0.14, 0.09, 0.14);
    this.bodyGroup.add(this.eyeLPivot);

    const stalkL = createBox(0.042, 0.13, 0.042, this.mats.eyeStalk);
    stalkL.position.set(0, 0.06, 0);
    this.eyeLPivot.add(stalkL);

    const eyeBallL = createBox(0.07, 0.07, 0.07, this.mats.eye);
    eyeBallL.position.set(0, 0.135, 0.01);
    this.eyeLPivot.add(eyeBallL);

    const shineL = createBox(0.024, 0.024, 0.015, this.mats.eyeShine);
    shineL.position.set(-0.012, 0.15, 0.048);
    this.eyeLPivot.add(shineL);

    this.eyeRPivot = new THREE.Group();
    this.eyeRPivot.position.set(0.14, 0.09, 0.14);
    this.bodyGroup.add(this.eyeRPivot);

    const stalkR = createBox(0.042, 0.13, 0.042, this.mats.eyeStalk);
    stalkR.position.set(0, 0.06, 0);
    this.eyeRPivot.add(stalkR);

    const eyeBallR = createBox(0.07, 0.07, 0.07, this.mats.eye);
    eyeBallR.position.set(0, 0.135, 0.01);
    this.eyeRPivot.add(eyeBallR);

    const shineR = createBox(0.024, 0.024, 0.015, this.mats.eyeShine);
    shineR.position.set(0.012, 0.15, 0.048);
    this.eyeRPivot.add(shineR);

    // Golden brass monocle frame around right eye
    const monocleRim = createBox(0.098, 0.098, 0.022, this.mats.brass);
    monocleRim.position.set(0, 0.135, 0.04);
    this.eyeRPivot.add(monocleRim);

    // 4. Articulated Pincer Claws in Suit Sleeves & White Cuffs
    this.clawLPivot = new THREE.Group();
    this.clawLPivot.position.set(-0.26, 0.02, 0.14);
    this.clawLPivot.rotation.y = 0.35;
    this.bodyGroup.add(this.clawLPivot);

    // Black suit sleeve on upper arm
    const sleeveL = createBox(0.15, 0.085, 0.095, this.mats.suitBlack);
    sleeveL.position.set(-0.06, 0, 0.06);
    sleeveL.rotation.y = -0.4;
    this.clawLPivot.add(sleeveL);

    // White shirt cuff at wrist
    const cuffL = createBox(0.095, 0.075, 0.05, this.mats.shirtWhite);
    cuffL.position.set(-0.09, 0.005, 0.11);
    this.clawLPivot.add(cuffL);

    const pincerBaseL = createBox(0.15, 0.115, 0.19, this.mats.shellBright);
    pincerBaseL.position.set(-0.10, 0.02, 0.19);
    this.clawLPivot.add(pincerBaseL);

    this.pincerTopL = createBox(0.085, 0.048, 0.15, this.mats.shellRed);
    this.pincerTopL.position.set(-0.10, 0.068, 0.26);
    this.clawLPivot.add(this.pincerTopL);

    const pincerBotL = createBox(0.085, 0.042, 0.14, this.mats.bellyCream);
    pincerBotL.position.set(-0.10, -0.02, 0.25);
    this.clawLPivot.add(pincerBotL);

    this.clawRPivot = new THREE.Group();
    this.clawRPivot.position.set(0.26, 0.02, 0.14);
    this.clawRPivot.rotation.y = -0.35;
    this.bodyGroup.add(this.clawRPivot);

    // Black suit sleeve on right arm
    const sleeveR = createBox(0.15, 0.085, 0.095, this.mats.suitBlack);
    sleeveR.position.set(0.06, 0, 0.06);
    sleeveR.rotation.y = 0.4;
    this.clawRPivot.add(sleeveR);

    // White shirt cuff at right wrist
    const cuffR = createBox(0.095, 0.075, 0.05, this.mats.shirtWhite);
    cuffR.position.set(0.09, 0.005, 0.11);
    this.clawRPivot.add(cuffR);

    const pincerBaseR = createBox(0.15, 0.115, 0.19, this.mats.shellBright);
    pincerBaseR.position.set(0.10, 0.02, 0.19);
    this.clawRPivot.add(pincerBaseR);

    this.pincerTopR = createBox(0.085, 0.048, 0.15, this.mats.shellRed);
    this.pincerTopR.position.set(0.10, 0.068, 0.26);
    this.clawRPivot.add(this.pincerTopR);

    const pincerBotR = createBox(0.085, 0.042, 0.14, this.mats.bellyCream);
    pincerBotR.position.set(0.10, -0.02, 0.25);
    this.clawRPivot.add(pincerBotR);

    // 5. Six Scuttling Legs (3 per side)
    const legZOffsets = [0.09, -0.01, -0.11];
    legZOffsets.forEach((zOff, idx) => {
      const legLPivot = new THREE.Group();
      legLPivot.position.set(-0.23, -0.05, zOff);
      const legL = createBox(0.19, 0.048, 0.048, this.mats.shellDark);
      legL.position.set(-0.08, -0.04, 0);
      legL.rotation.z = 0.45;
      legLPivot.add(legL);
      this.bodyGroup.add(legLPivot);
      this.legsL.push({ pivot: legLPivot, phase: idx * 1.1 });

      const legRPivot = new THREE.Group();
      legRPivot.position.set(0.23, -0.05, zOff);
      const legR = createBox(0.19, 0.048, 0.048, this.mats.shellDark);
      legR.position.set(0.08, -0.04, 0);
      legR.rotation.z = -0.45;
      legRPivot.add(legR);
      this.bodyGroup.add(legRPivot);
      this.legsR.push({ pivot: legRPivot, phase: idx * 1.1 + Math.PI });
    });

    // 6. Generous Raycast Interaction Hitbox
    const hitBoxMat = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      colorWrite: false
    });
    this.hitBox = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.95, 1.1), hitBoxMat);
    this.hitBox.position.set(0, 0.25, 0.05);
    this.hitBox.userData.isCrab = true;
    this.group.add(this.hitBox);
    this.interactables.push(this.hitBox);

    this.group.traverse(child => {
      if (child.isMesh) {
        child.userData.isCrab = true;
        child.userData.noWalk = true;
      }
    });
  }

  /**
   * Triggered when the player interacts with the Crab Clerk.
   * @param {THREE.Vector3} [playerWorldPos]
   */
  interact(playerWorldPos) {
    if (this.state === 'jumping' || this.state === 'hidden') return;
    this.state = 'talking';
    if (playerWorldPos && this.parentGroup) {
      const localTarget = this.parentGroup.worldToLocal(playerWorldPos.clone());
      const dx = localTarget.x - this.group.position.x;
      const dz = localTarget.z - this.group.position.z;
      this.targetRotY = Math.atan2(dx, dz);
    }
  }

  /**
   * Jump in a high parabolic arc straight into the ocean and disappear after dialogue finishes.
   */
  scuttleOff() {
    this.state = 'jumping';
    this.jumpTimer = 0;
    this._splashPlayed = false;
    this.jumpStartPos.copy(this.group.position);
    // Target deep ocean water off the northern beach edge (-Z)
    this.jumpEndPos.set(this.group.position.x + 0.6, -1.6, this.group.position.z - 6.8);
    // Face toward the ocean (-Z) for the dive
    this.targetRotY = Math.PI;
    emit('playSound', { sound: 'crab_snap' });
  }

  reset() {
    this.state = 'idle';
    this.jumpTimer = 0;
    this._splashPlayed = false;
    this.group.visible = true;
    this.group.position.copy(this.initialPos);
    this.bodyGroup.position.set(0, 0.16, 0);
    this.bodyGroup.rotation.set(0, 0, 0);
    this.targetRotY = -0.15;
    this.group.rotation.y = this.targetRotY;
  }

  update(delta, elapsedTime = 0) {
    if (this.state === 'hidden') return;

    // Smooth rotation toward target
    let angleDiff = this.targetRotY - this.group.rotation.y;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    this.group.rotation.y += angleDiff * Math.min(1.0, delta * 9.0);

    if (this.state === 'jumping') {
      this.jumpTimer += delta;
      const u = Math.min(1.0, this.jumpTimer / this.jumpDuration);

      // Parabolic jump arc into the ocean
      this.group.position.x = this.jumpStartPos.x + (this.jumpEndPos.x - this.jumpStartPos.x) * u;
      this.group.position.z = this.jumpStartPos.z + (this.jumpEndPos.z - this.jumpStartPos.z) * u;
      const linearY = this.jumpStartPos.y + (this.jumpEndPos.y - this.jumpStartPos.y) * u;
      const arcHeight = 4.2 * u * (1 - u) * 2.4; // High 2.5m leap
      this.group.position.y = linearY + arcHeight;

      // Joyful mid-air dive somersault & claw wave
      this.bodyGroup.rotation.x = u * Math.PI * 1.65;
      this.clawLPivot.rotation.z = 0.55;
      this.clawRPivot.rotation.z = -0.55;

      if (!this._splashPlayed && u >= 0.78) {
        this._splashPlayed = true;
        emit('playSound', { sound: 'bail' });
      }

      if (u >= 1.0) {
        this.state = 'hidden';
        this.group.visible = false;
      }
      return;
    }

    // Gentle idle breathing
    const bob = Math.sin(elapsedTime * 3.0) * 0.018;
    this.bodyGroup.position.y = 0.16 + bob;
    this.bodyGroup.rotation.x = 0;

    if (this.state === 'talking') {
      // Energetic claw snapping and lawyerly gesturing while speaking
      const snap = Math.abs(Math.sin(elapsedTime * 14.0));
      this.pincerTopL.position.y = 0.068 + snap * 0.038;
      this.pincerTopR.position.y = 0.068 + Math.abs(Math.cos(elapsedTime * 14.0)) * 0.038;
      this.clawLPivot.rotation.z = Math.sin(elapsedTime * 9.0) * 0.20;
      this.clawRPivot.rotation.z = -Math.cos(elapsedTime * 9.0) * 0.20;
      this.bodyGroup.rotation.z = Math.sin(elapsedTime * 7.0) * 0.05;
    } else {
      // Idle: occasional claw pinch and subtle leg/eyestalk twitch
      const idleSnap = Math.max(0, Math.sin(elapsedTime * 2.5) - 0.6) * 0.055;
      this.pincerTopL.position.y = 0.068 + idleSnap;
      this.pincerTopR.position.y = 0.068 + idleSnap;
      this.clawLPivot.rotation.z = Math.sin(elapsedTime * 1.8) * 0.05;
      this.clawRPivot.rotation.z = -Math.sin(elapsedTime * 1.8) * 0.05;
      this.bodyGroup.rotation.z = Math.sin(elapsedTime * 1.6) * 0.025;

      this.legsL.forEach(l => {
        l.pivot.rotation.z = Math.sin(elapsedTime * 2.5 + l.phase) * 0.05;
      });
      this.legsR.forEach(l => {
        l.pivot.rotation.z = Math.sin(elapsedTime * 2.5 + l.phase) * 0.05;
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

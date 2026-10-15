import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Voxel Bunny Palette & Materials
// ---------------------------------------------------------------------------
const BunnyPalette = {
  furCream: 0xe0c8a2,
  furLight: 0xf5eee1,
  furDark: 0xad916a,
  earPink: 0xefa8a8,
  eye: 0x1a1512,
  eyeShine: 0xffffff,
  nose: 0xf29d9d,
  tail: 0xffffff
};

function createVoxelMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.85,
    metalness: opts.metalness ?? 0.05,
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
// Synthesized Web Audio Effects for Easter Egg Bunny
// ---------------------------------------------------------------------------
class BunnyAudio {
  constructor() {
    this._ctx = null;
  }

  _getCtx() {
    if (!this._ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this._ctx = new AudioContextClass();
      }
    }
    if (this._ctx && this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }
    return this._ctx;
  }

  playSqueak() {
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Sweet two-tone curious chirp
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(620, now);
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.08);
    gain1.gain.setValueAtTime(0.08, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.13);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.09);
    osc2.frequency.exponentialRampToValueAtTime(1150, now + 0.18);
    gain2.gain.setValueAtTime(0.09, now + 0.09);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.09);
    osc2.stop(now + 0.23);
  }

  playBoing() {
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.14);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.28);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.33);
  }

  playLanding() {
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.08);
    gain.gain.setValueAtTime(0.10, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.10);
  }
}

// ---------------------------------------------------------------------------
// Voxel Lop-Eared Bunny Class
// ---------------------------------------------------------------------------
export class VoxelLopBunny {
  /**
   * @param {THREE.Group} parentGroup - Island group to attach the bunny to
   * @param {THREE.Vector3} initialPos - Starting local position on island
   * @param {THREE.Object3D} [terrainRoot] - Environment root to raycast ground terrain against
   */
  constructor(parentGroup, initialPos = new THREE.Vector3(0, 2.0, 2.5), terrainRoot = null) {
    this.parentGroup = parentGroup;
    this.terrainRoot = terrainRoot || parentGroup;
    this.group = new THREE.Group();
    this.group.position.copy(initialPos);
    this.group.scale.setScalar(1.45); // Scale bunny up ~45% larger
    this.baseY = initialPos.y;

    this.downRaycaster = new THREE.Raycaster();
    this.downRaycaster.far = 15.0;

    this.audio = new BunnyAudio();

    // Materials
    this.mats = {
      furCream: createVoxelMat(BunnyPalette.furCream),
      furLight: createVoxelMat(BunnyPalette.furLight),
      furDark: createVoxelMat(BunnyPalette.furDark),
      earPink: createVoxelMat(BunnyPalette.earPink),
      eye: createVoxelMat(BunnyPalette.eye, { roughness: 0.2 }),
      eyeShine: createVoxelMat(BunnyPalette.eyeShine, { roughness: 0.1 }),
      nose: createVoxelMat(BunnyPalette.nose, { roughness: 0.4 }),
      tail: createVoxelMat(BunnyPalette.tail, { roughness: 0.95 })
    };

    // State Machine: 'idle', 'hop', 'backflip'
    this.state = 'idle';
    this.stateTimer = 1.5;

    // Movement & AI Bounds across the island landmass
    this.minX = -9.5;
    this.maxX = 8.5;
    this.minZ = -8.0;
    this.maxZ = 7.5;

    this.targetPos = new THREE.Vector3(initialPos.x, initialPos.y, initialPos.z);
    this.moveVelocity = new THREE.Vector3();
    this.hopTimer = 0;
    this.hopDuration = 0.44;
    this.hopsRemaining = 0;

    // Backflip animation state
    this.flipTimer = 0;
    this.flipDuration = 1.95;
    this.playerLookTarget = new THREE.Vector3();
    this._flipSoundPlayed = false;
    this._landSoundPlayed = false;

    // Interactable mesh list for raycasting
    this.interactables = [];

    this._buildMesh();
    parentGroup.add(this.group);
  }

  // -------------------------------------------------------------------------
  // Model Construction
  // -------------------------------------------------------------------------
  _buildMesh() {
    // Body Rig wrapper (for flips and bounces)
    this.bodyGroup = new THREE.Group();
    this.bodyGroup.position.y = 0.16; // Rest above ground
    this.group.add(this.bodyGroup);

    // 1. Plump Voxel Torso
    this.bodyMesh = createBox(0.34, 0.26, 0.42, this.mats.furCream);
    this.bodyGroup.add(this.bodyMesh);

    // Light cream chest & belly
    const belly = createBox(0.30, 0.08, 0.38, this.mats.furLight);
    belly.position.set(0, -0.10, 0.02);
    this.bodyGroup.add(belly);

    // Fluffy Cotton Ball Tail
    this.tailMesh = createBox(0.12, 0.12, 0.12, this.mats.tail);
    this.tailMesh.position.set(0, 0.06, -0.25);
    this.bodyGroup.add(this.tailMesh);

    // 2. Head Pivot & Facial Features
    this.headPivot = new THREE.Group();
    this.headPivot.position.set(0, 0.16, 0.20);
    this.bodyGroup.add(this.headPivot);

    this.headMesh = createBox(0.26, 0.24, 0.26, this.mats.furCream);
    this.headMesh.position.set(0, 0.08, 0.10);
    this.headPivot.add(this.headMesh);

    // Chubby Cheeks
    const cheeks = createBox(0.31, 0.12, 0.20, this.mats.furLight);
    cheeks.position.set(0, 0.03, 0.12);
    this.headPivot.add(cheeks);

    // Cute Pink Snout & Nose
    const muzzle = createBox(0.14, 0.09, 0.07, this.mats.furLight);
    muzzle.position.set(0, 0.04, 0.24);
    this.headPivot.add(muzzle);

    this.noseMesh = createBox(0.045, 0.035, 0.04, this.mats.nose);
    this.noseMesh.position.set(0, 0.065, 0.275);
    this.headPivot.add(this.noseMesh);

    // Eyes with white specular glints
    const eyeL = createBox(0.038, 0.038, 0.02, this.mats.eye);
    eyeL.position.set(-0.132, 0.11, 0.17);
    this.headPivot.add(eyeL);

    const shineL = createBox(0.015, 0.015, 0.01, this.mats.eyeShine);
    shineL.position.set(-0.134, 0.12, 0.18);
    this.headPivot.add(shineL);

    const eyeR = createBox(0.038, 0.038, 0.02, this.mats.eye);
    eyeR.position.set(0.132, 0.11, 0.17);
    this.headPivot.add(eyeR);

    const shineR = createBox(0.015, 0.015, 0.01, this.mats.eyeShine);
    shineR.position.set(0.134, 0.12, 0.18);
    this.headPivot.add(shineR);

    // 3. Signature Lop Ears (Drooping downwards past cheeks)
    // Left Lop Ear Pivot
    this.earLPivot = new THREE.Group();
    this.earLPivot.position.set(-0.13, 0.17, 0.08);
    this.earLPivot.rotation.z = -0.32; // Droop down
    this.earLPivot.rotation.x = 0.08;
    this.headPivot.add(this.earLPivot);

    const earLMesh = createBox(0.075, 0.32, 0.10, this.mats.furCream);
    earLMesh.position.set(0, -0.15, 0);
    this.earLPivot.add(earLMesh);

    const earLInner = createBox(0.02, 0.24, 0.07, this.mats.earPink);
    earLInner.position.set(-0.032, -0.15, 0);
    this.earLPivot.add(earLInner);

    // Right Lop Ear Pivot
    this.earRPivot = new THREE.Group();
    this.earRPivot.position.set(0.13, 0.17, 0.08);
    this.earRPivot.rotation.z = 0.32; // Droop down
    this.earRPivot.rotation.x = 0.08;
    this.headPivot.add(this.earRPivot);

    const earRMesh = createBox(0.075, 0.32, 0.10, this.mats.furCream);
    earRMesh.position.set(0, -0.15, 0);
    this.earRPivot.add(earRMesh);

    const earRInner = createBox(0.02, 0.24, 0.07, this.mats.earPink);
    earRInner.position.set(0.032, -0.15, 0);
    this.earRPivot.add(earRInner);

    // 4. Little Paws & Legs
    this.legFL = createBox(0.07, 0.12, 0.09, this.mats.furDark);
    this.legFL.position.set(-0.11, -0.09, 0.13);
    this.bodyGroup.add(this.legFL);

    this.legFR = createBox(0.07, 0.12, 0.09, this.mats.furDark);
    this.legFR.position.set(0.11, -0.09, 0.13);
    this.bodyGroup.add(this.legFR);

    this.legBL = createBox(0.10, 0.15, 0.20, this.mats.furCream);
    this.legBL.position.set(-0.14, -0.07, -0.12);
    this.bodyGroup.add(this.legBL);

    this.legBR = createBox(0.10, 0.15, 0.20, this.mats.furCream);
    this.legBR.position.set(0.14, -0.07, -0.12);
    this.bodyGroup.add(this.legBR);

    // 5. Generous Raycast Interaction Collider (Transparent/invisible so raycasts succeed reliably)
    const hitBox = createBox(0.65, 0.65, 0.75, new THREE.MeshBasicMaterial({ visible: false, colorWrite: false, depthWrite: false }), false, false);
    hitBox.position.set(0, 0.2, 0);
    hitBox.userData = { isBunny: true, name: 'lopEaredBunnyHitbox' };
    this.group.add(hitBox);

    // Register all meshes for interaction raycasting
    this.group.traverse(child => {
      if (child.isMesh) {
        child.userData.isBunny = true;
        this.interactables.push(child);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Interaction Trigger (Backflip)
  // -------------------------------------------------------------------------
  interact(playerWorldPos) {
    if (this.state === 'backflip') return;

    this.state = 'backflip';
    this.flipTimer = 0;
    this.hopsRemaining = 0;
    this.hopTimer = 0;
    this.bodyGroup.rotation.x = 0;
    this.group.position.y = this.baseY;
    this._flipSoundPlayed = false;
    this._landSoundPlayed = false;

    // Play cute curious chirp on interaction
    this.audio.playSqueak();

    // Convert player world pos to island local pos
    this.playerLookTarget.copy(playerWorldPos);
    this.parentGroup.worldToLocal(this.playerLookTarget);
  }

  // -------------------------------------------------------------------------
  // AI Wandering & Animation Loop
  // -------------------------------------------------------------------------
  update(delta, time) {
    switch (this.state) {
      case 'idle':
        this._updateIdle(delta, time);
        break;
      case 'hop':
        this._updateHop(delta, time);
        break;
      case 'backflip':
        this._updateBackflip(delta, time);
        break;
    }
  }

  _updateIdle(delta, time) {
    this.stateTimer -= delta;

    // Cute Idle Animations: Twitching nose and ears
    this.noseMesh.position.y = 0.065 + Math.sin(time * 14.0) * 0.007;
    this.earLPivot.rotation.z = -0.32 + Math.sin(time * 3.5) * 0.04;
    this.earRPivot.rotation.z = 0.32 - Math.sin(time * 3.5 + 0.4) * 0.04;
    this.headPivot.rotation.y = Math.sin(time * 1.2) * 0.12;
    this.headPivot.rotation.x = Math.max(0, Math.sin(time * 1.8) * 0.08);

    // Subtle breathing bounce
    this.bodyGroup.scale.set(
      1.0 + Math.sin(time * 4) * 0.015,
      1.0 - Math.sin(time * 4) * 0.015,
      1.0 + Math.sin(time * 4) * 0.015
    );

    // Keep grounded in idle (track tiered ground beneath feet)
    const groundY = this._getGroundHeightAt(this.group.position.x, this.group.position.z);
    if (groundY !== null) {
      this.baseY += (groundY - this.baseY) * Math.min(1.0, delta * 10.0);
      this.group.position.y = this.baseY;
    }

    // Time to pick a new spot and hop!
    if (this.stateTimer <= 0) {
      this._pickNewHopTarget();
    }
  }

  _getGroundHeightAt(localX, localZ) {
    if (!this.terrainRoot || !this.parentGroup) return 2.0;

    // Convert local position to world coordinates for raycasting
    const worldOrigin = new THREE.Vector3(localX, 12.0, localZ);
    this.parentGroup.localToWorld(worldOrigin);

    this.downRaycaster.set(worldOrigin, new THREE.Vector3(0, -1, 0));
    const hits = this.downRaycaster.intersectObject(this.terrainRoot, true);

    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i];
      // Ignore bunny's own meshes or hitboxes
      if (hit.object && hit.object.userData && hit.object.userData.isBunny) continue;
      // Ignore high elements (roofs, sign, high trees above 5.0m)
      if (hit.point.y > 5.0) continue;
      // Ignore below water level
      if (hit.point.y < 0.5) continue;

      // Convert world hit point back to island local coordinates
      const localHit = this.parentGroup.worldToLocal(hit.point.clone());
      return localHit.y;
    }

    return null;
  }

  _pickNewHopTarget() {
    let bestTarget = null;
    for (let attempts = 0; attempts < 6; attempts++) {
      const tx = this.minX + Math.random() * (this.maxX - this.minX);
      const tz = this.minZ + Math.random() * (this.maxZ - this.minZ);
      const ty = this._getGroundHeightAt(tx, tz);
      if (ty !== null) {
        bestTarget = new THREE.Vector3(tx, ty, tz);
        break;
      }
    }

    if (!bestTarget) {
      this.stateTimer = 1.5;
      return;
    }

    this.targetPos.copy(bestTarget);
    const diff = new THREE.Vector3().subVectors(this.targetPos, this.group.position);
    diff.y = 0;
    const dist = diff.length();

    if (dist < 0.6) {
      this.stateTimer = 1.5 + Math.random() * 2.0;
      return;
    }

    this.hopsRemaining = Math.min(6, Math.max(2, Math.floor(dist / 0.55)));
    this.state = 'hop';
    this.hopTimer = 0;

    // Desired facing direction
    this.targetAngle = Math.atan2(diff.x, diff.z);
  }

  _updateHop(delta, time) {
    // Rotate smoothly towards target direction
    const currentAngle = this.group.rotation.y;
    let diffAngle = this.targetAngle - currentAngle;
    while (diffAngle < -Math.PI) diffAngle += Math.PI * 2;
    while (diffAngle > Math.PI) diffAngle -= Math.PI * 2;
    this.group.rotation.y += diffAngle * Math.min(1.0, delta * 9.0);

    this.hopTimer += delta;
    const progress = (this.hopTimer % this.hopDuration) / this.hopDuration;

    // Move forward in facing direction during middle of hop
    if (progress > 0.15 && progress < 0.85) {
      const hopSpeed = 1.45;
      const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.group.rotation.y);
      const nextX = this.group.position.x + forward.x * hopSpeed * delta;
      const nextZ = this.group.position.z + forward.z * hopSpeed * delta;

      const groundY = this._getGroundHeightAt(nextX, nextZ);
      if (groundY !== null) {
        // Can climb up or descend tiers (up to 1.35m step, covering all island hill tiers)
        if (Math.abs(groundY - this.baseY) <= 1.35) {
          this.group.position.x = nextX;
          this.group.position.z = nextZ;
          // Smoothly climb or descend to new tier elevation
          this.baseY += (groundY - this.baseY) * Math.min(1.0, delta * 12.0);
        }
      }
    }

    // Parabolic vertical hop arc
    const hopHeight = Math.sin(progress * Math.PI) * 0.22;
    this.group.position.y = this.baseY + hopHeight;

    // Body pitch tilt forward during leap
    this.bodyGroup.rotation.x = -Math.sin(progress * Math.PI) * 0.22;

    // Ears bounce with inertia
    this.earLPivot.rotation.x = 0.08 + Math.sin(progress * Math.PI * 2) * 0.22;
    this.earRPivot.rotation.x = 0.08 + Math.sin(progress * Math.PI * 2) * 0.22;

    // Legs push during launch and tuck in air
    this.legFL.position.y = -0.09 + Math.sin(progress * Math.PI) * 0.06;
    this.legFR.position.y = -0.09 + Math.sin(progress * Math.PI) * 0.06;
    this.legBL.position.y = -0.07 - Math.sin(progress * Math.PI) * 0.05;
    this.legBR.position.y = -0.07 - Math.sin(progress * Math.PI) * 0.05;

    // Completed one hop
    if (this.hopTimer >= this.hopDuration) {
      this.hopTimer = 0;
      this.hopsRemaining--;

      const groundAtLand = this._getGroundHeightAt(this.group.position.x, this.group.position.z);
      if (groundAtLand !== null) {
        this.baseY = groundAtLand;
      }
      this.group.position.y = this.baseY;

      if (this.hopsRemaining <= 0) {
        this.bodyGroup.rotation.x = 0;
        this.state = 'idle';
        this.stateTimer = 1.2 + Math.random() * 2.5;
      }
    }
  }

  _updateBackflip(delta, time) {
    this.flipTimer += delta;
    const t = this.flipTimer;

    // Phase 1: Look up at player (0.0s - 0.45s)
    if (t < 0.45) {
      // Rotate body to face player
      const toPlayer = new THREE.Vector3().subVectors(this.playerLookTarget, this.group.position);
      toPlayer.y = 0;
      if (toPlayer.lengthSq() > 0.001) {
        const targetYaw = Math.atan2(toPlayer.x, toPlayer.z);
        let diffYaw = targetYaw - this.group.rotation.y;
        while (diffYaw < -Math.PI) diffYaw += Math.PI * 2;
        while (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
        this.group.rotation.y += diffYaw * Math.min(1.0, delta * 12.0);
      }

      // Head tilts up cutely to make eye contact with player
      const lookProgress = t / 0.45;
      this.headPivot.rotation.x = lookProgress * 0.52;
      this.earLPivot.rotation.z = -0.32 - lookProgress * 0.12;
      this.earRPivot.rotation.z = 0.32 + lookProgress * 0.12;
      this.bodyGroup.scale.set(1.0, 1.0, 1.0);
      return;
    }

    // Phase 2: Crouch preparation (0.45s - 0.65s)
    if (t < 0.65) {
      const prepProgress = (t - 0.45) / 0.20;
      this.bodyGroup.scale.set(1.15, 0.75 + (1 - prepProgress) * 0.25, 1.15);
      this.group.position.y = this.baseY - 0.04 * prepProgress;
      this.headPivot.rotation.x = 0.52 * (1.0 - prepProgress);
      return;
    }

    // Phase 3: THE GLORIOUS BACKFLIP! (0.65s - 1.55s, duration 0.90s)
    if (t < 1.55) {
      if (!this._flipSoundPlayed) {
        this.audio.playBoing();
        this._flipSoundPlayed = true;
      }

      const flipProgress = (t - 0.65) / 0.90;

      // High parabolic leap (jumps 1.15m into the air!)
      const jumpY = Math.sin(flipProgress * Math.PI) * 1.15;
      this.group.position.y = this.baseY + jumpY;

      // Full 360-degree backward rotation around local X axis
      this.bodyGroup.rotation.x = -flipProgress * Math.PI * 2;

      // Ears flop dynamically with the rotational force
      this.earLPivot.rotation.x = Math.sin(flipProgress * Math.PI * 3) * 0.45;
      this.earRPivot.rotation.x = Math.sin(flipProgress * Math.PI * 3) * 0.45;
      this.bodyGroup.scale.set(1.0, 1.0, 1.0);
      return;
    }

    // Phase 4: Soft landing & happy ear wiggle (1.55s - 1.95s)
    if (t <= this.flipDuration) {
      if (!this._landSoundPlayed) {
        this.audio.playLanding();
        this._landSoundPlayed = true;
      }

      this.group.position.y = this.baseY;
      this.bodyGroup.rotation.x = 0;

      const landProgress = (t - 1.55) / 0.40;
      // Soft landing squash and recovery
      const bounce = Math.sin(landProgress * Math.PI) * 0.14;
      this.bodyGroup.scale.set(1.0 + bounce, 1.0 - bounce, 1.0 + bounce);

      // Happy ear celebration wiggle
      this.earLPivot.rotation.z = -0.32 + Math.sin(landProgress * Math.PI * 8) * 0.14;
      this.earRPivot.rotation.z = 0.32 - Math.sin(landProgress * Math.PI * 8) * 0.14;
      this.headPivot.rotation.x = 0;
      return;
    }

    // Backflip complete! Resume peaceful idle
    this.group.position.y = this.baseY;
    this.bodyGroup.rotation.x = 0;
    this.bodyGroup.scale.set(1, 1, 1);
    this.headPivot.rotation.x = 0;
    this.earLPivot.rotation.set(0.08, 0, -0.32);
    this.earRPivot.rotation.set(0.08, 0, 0.32);
    this.state = 'idle';
    this.stateTimer = 1.8 + Math.random() * 2.0;
  }

  dispose() {
    this.group.traverse(child => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
    if (this.parentGroup) {
      this.parentGroup.remove(this.group);
    }
  }
}

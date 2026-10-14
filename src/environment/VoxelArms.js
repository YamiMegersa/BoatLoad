import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Synthesized Web Audio Effects for Emotes
// ---------------------------------------------------------------------------
class EmoteAudio {
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

  playClap() {
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Flesh thud (sine oscillator drop)
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.06);
    oscGain.gain.setValueAtTime(0.4, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);

    // Sharp slap noise burst
    const bufferSize = ctx.sampleRate * 0.08;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.015));
    }
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1100, now);
    filter.Q.setValueAtTime(2.2, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.55, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    noiseSource.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noiseSource.start(now);
  }

  playLighterFlick() {
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Flint scrape noise
    const bufferSize = ctx.sampleRate * 0.04;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.008));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(3200, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);

    // Metallic ping
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2600, now);
    osc.frequency.exponentialRampToValueAtTime(1800, now + 0.07);
    oscGain.gain.setValueAtTime(0.2, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  playLighterSnap() {
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(500, now + 0.04);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  playInhale() {
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const dur = 0.9;
    const bufferSize = ctx.sampleRate * dur;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(500, now);
    filter.frequency.linearRampToValueAtTime(950, now + dur);
    filter.Q.setValueAtTime(2.5, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.18, now + dur * 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }

  playExhale() {
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const dur = 1.3;
    const bufferSize = ctx.sampleRate * dur;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(280, now + dur);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }

  playFlickGesture() {
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.12);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }
}

// ---------------------------------------------------------------------------
// Voxel Scale and Palette Constants
// ---------------------------------------------------------------------------
const VOXEL = 0.022; // Base voxel unit (2.2 cm)

const PALETTE = {
  skin: 0xd69974,
  skinShade: 0xc48460,
  sleeve: 0x1c2b3c, // Dark sailor navy
  sleeveStripe: 0xded8c8, // Cream stripe
  brass: 0xc8a44b,
  brassDark: 0x8a6e2e,
  steel: 0x767d87,
  cork: 0xb56c36,
  cigarettePaper: 0xf2ede2,
  ash: 0x2e2c2a,
  ember: 0xff3b00,
  flameYellow: 0xffea00,
  flameOrange: 0xff5500
};

/**
 * Creates a single voxel box with stylized lighting.
 */
function createVoxelBox(w, h, d, color, emissive = 0x000000) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive,
    roughness: 0.85,
    metalness: 0.12,
    flatShading: true
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------------------
// VoxelArms System
// ---------------------------------------------------------------------------
export class VoxelArms {
  /**
   * @param {THREE.Camera} camera - Parent camera to which arms are attached
   */
  constructor(camera) {
    this.camera = camera;
    this.audio = new EmoteAudio();

    // Root container parented directly to the camera so arms track viewpoint
    this.group = new THREE.Group();
    this.group.name = 'VoxelArmsRig';
    this.group.visible = false;
    this.camera.add(this.group);

    // Emote playback state
    this.currentEmote = null;
    this.emoteTime = 0;
    this.emoteDuration = 0;
    this.isEmoting = false;

    // Sound trigger flags per animation
    this._soundFlags = {};

    // Smoke particles pool
    this.smokeParticles = [];

    // Build 3D voxel models
    this._buildVoxelArms();
    this._buildProps();
    this._initSmokeParticles();

    // Default rest pose (retracted off-screen)
    this._resetPose();
  }

  // ---------------------------------------------------------------------------
  // Model Construction
  // ---------------------------------------------------------------------------

  _buildVoxelArms() {
    // ----------------------------------------------------
    // LEFT ARM RIG
    // ----------------------------------------------------
    this.leftArm = new THREE.Group();
    this.leftArm.name = 'LeftArm';
    this.group.add(this.leftArm);

    this.leftElbow = new THREE.Group();
    this.leftElbow.name = 'LeftElbow';
    this.leftArm.add(this.leftElbow);

    // Left Forearm Sleeve (Navy blocks + Cream stripe)
    const leftSleeve = createVoxelBox(3.4 * VOXEL, 3.0 * VOXEL, 5.0 * VOXEL, PALETTE.sleeve);
    leftSleeve.position.set(0, 0, -2.5 * VOXEL);
    this.leftElbow.add(leftSleeve);

    const leftStripe = createVoxelBox(3.5 * VOXEL, 3.1 * VOXEL, 0.9 * VOXEL, PALETTE.sleeveStripe);
    leftStripe.position.set(0, 0, -4.5 * VOXEL);
    this.leftElbow.add(leftStripe);

    // Left Forearm Skin
    const leftForeSkin = createVoxelBox(2.8 * VOXEL, 2.3 * VOXEL, 2.4 * VOXEL, PALETTE.skin);
    leftForeSkin.position.set(0, 0, -6.0 * VOXEL);
    this.leftElbow.add(leftForeSkin);

    // Left Wrist
    this.leftWrist = new THREE.Group();
    this.leftWrist.position.set(0, 0, -7.2 * VOXEL);
    this.leftElbow.add(this.leftWrist);

    // Left Palm
    const leftPalm = createVoxelBox(3.0 * VOXEL, 1.2 * VOXEL, 3.0 * VOXEL, PALETTE.skin);
    leftPalm.position.set(0, 0, -1.5 * VOXEL);
    this.leftWrist.add(leftPalm);

    // Left Fingers (articulated for fist & clapping)
    this.leftThumb = this._createFinger(1.2, 1.1, 1.3, PALETTE.skin, true);
    this.leftThumb.position.set(1.5 * VOXEL, 0, -1.0 * VOXEL);
    this.leftThumb.rotation.y = Math.PI / 4;
    this.leftWrist.add(this.leftThumb);

    this.leftIndex = this._createFinger(0.9, 1.0, 1.4, PALETTE.skin);
    this.leftIndex.position.set(0.9 * VOXEL, 0, -3.0 * VOXEL);
    this.leftWrist.add(this.leftIndex);

    this.leftMiddle = this._createFinger(0.95, 1.0, 1.7, PALETTE.skin);
    this.leftMiddle.position.set(0.0 * VOXEL, 0, -3.0 * VOXEL);
    this.leftWrist.add(this.leftMiddle);

    this.leftRing = this._createFinger(0.9, 1.0, 1.4, PALETTE.skin);
    this.leftRing.position.set(-0.9 * VOXEL, 0, -3.0 * VOXEL);
    this.leftWrist.add(this.leftRing);

    this.leftPinky = this._createFinger(0.8, 0.9, 1.1, PALETTE.skin);
    this.leftPinky.position.set(-1.8 * VOXEL, 0, -2.8 * VOXEL);
    this.leftWrist.add(this.leftPinky);

    // ----------------------------------------------------
    // RIGHT ARM RIG
    // ----------------------------------------------------
    this.rightArm = new THREE.Group();
    this.rightArm.name = 'RightArm';
    this.group.add(this.rightArm);

    this.rightElbow = new THREE.Group();
    this.rightElbow.name = 'RightElbow';
    this.rightArm.add(this.rightElbow);

    // Right Forearm Sleeve
    const rightSleeve = createVoxelBox(3.4 * VOXEL, 3.0 * VOXEL, 5.0 * VOXEL, PALETTE.sleeve);
    rightSleeve.position.set(0, 0, -2.5 * VOXEL);
    this.rightElbow.add(rightSleeve);

    const rightStripe = createVoxelBox(3.5 * VOXEL, 3.1 * VOXEL, 0.9 * VOXEL, PALETTE.sleeveStripe);
    rightStripe.position.set(0, 0, -4.5 * VOXEL);
    this.rightElbow.add(rightStripe);

    // Right Forearm Skin
    const rightForeSkin = createVoxelBox(2.8 * VOXEL, 2.3 * VOXEL, 2.4 * VOXEL, PALETTE.skin);
    rightForeSkin.position.set(0, 0, -6.0 * VOXEL);
    this.rightElbow.add(rightForeSkin);

    // Right Wrist
    this.rightWrist = new THREE.Group();
    this.rightWrist.position.set(0, 0, -7.2 * VOXEL);
    this.rightElbow.add(this.rightWrist);

    // Right Palm
    const rightPalm = createVoxelBox(3.0 * VOXEL, 1.2 * VOXEL, 3.0 * VOXEL, PALETTE.skin);
    rightPalm.position.set(0, 0, -1.5 * VOXEL);
    this.rightWrist.add(rightPalm);

    // Right Fingers (Thumb, Index, Middle, Ring, Pinky)
    this.rightThumb = this._createFinger(1.2, 1.1, 1.3, PALETTE.skin, true);
    this.rightThumb.position.set(-1.5 * VOXEL, 0, -1.0 * VOXEL);
    this.rightThumb.rotation.y = -Math.PI / 4;
    this.rightWrist.add(this.rightThumb);

    this.rightIndex = this._createFinger(0.9, 1.0, 1.4, PALETTE.skin);
    this.rightIndex.position.set(-0.9 * VOXEL, 0, -3.0 * VOXEL);
    this.rightWrist.add(this.rightIndex);

    // Middle finger (3-segment voxel articulation for maximum expression)
    this.rightMiddle = this._createMiddleFinger();
    this.rightMiddle.position.set(0.0 * VOXEL, 0, -3.0 * VOXEL);
    this.rightWrist.add(this.rightMiddle);

    this.rightRing = this._createFinger(0.9, 1.0, 1.4, PALETTE.skin);
    this.rightRing.position.set(0.9 * VOXEL, 0, -3.0 * VOXEL);
    this.rightWrist.add(this.rightRing);

    this.rightPinky = this._createFinger(0.8, 0.9, 1.1, PALETTE.skin);
    this.rightPinky.position.set(1.8 * VOXEL, 0, -2.8 * VOXEL);
    this.rightWrist.add(this.rightPinky);
  }

  _createFinger(w, h, len, color, isThumb = false) {
    const fingerPivot = new THREE.Group();

    // Proximal joint
    const prox = createVoxelBox(w * VOXEL, h * VOXEL, len * 0.55 * VOXEL, color);
    prox.position.set(0, 0, -len * 0.275 * VOXEL);
    fingerPivot.add(prox);

    // Distal joint with secondary pivot
    const distalPivot = new THREE.Group();
    distalPivot.position.set(0, 0, -len * 0.55 * VOXEL);
    fingerPivot.add(distalPivot);
    fingerPivot.distal = distalPivot;

    const dist = createVoxelBox(w * 0.9 * VOXEL, h * 0.9 * VOXEL, len * 0.45 * VOXEL, color);
    dist.position.set(0, 0, -len * 0.225 * VOXEL);
    distalPivot.add(dist);

    return fingerPivot;
  }

  _createMiddleFinger() {
    const pivot = new THREE.Group();

    // Proximal segment
    const seg1 = createVoxelBox(0.95 * VOXEL, 1.05 * VOXEL, 1.0 * VOXEL, PALETTE.skin);
    seg1.position.set(0, 0, -0.5 * VOXEL);
    pivot.add(seg1);

    // Mid segment
    const midPivot = new THREE.Group();
    midPivot.position.set(0, 0, -1.0 * VOXEL);
    pivot.add(midPivot);
    pivot.mid = midPivot;

    const seg2 = createVoxelBox(0.9 * VOXEL, 1.0 * VOXEL, 1.0 * VOXEL, PALETTE.skin);
    seg2.position.set(0, 0, -0.5 * VOXEL);
    midPivot.add(seg2);

    // Distal segment
    const tipPivot = new THREE.Group();
    tipPivot.position.set(0, 0, -1.0 * VOXEL);
    midPivot.add(tipPivot);
    pivot.tip = tipPivot;

    const seg3 = createVoxelBox(0.85 * VOXEL, 0.95 * VOXEL, 1.0 * VOXEL, PALETTE.skin);
    seg3.position.set(0, 0, -0.5 * VOXEL);
    tipPivot.add(seg3);

    return pivot;
  }

  // ---------------------------------------------------------------------------
  // Props Construction (Lighter & Cigarette)
  // ---------------------------------------------------------------------------

  _buildProps() {
    // ----------------------------------------------------
    // BRASS FLIP-TOP LIGHTER (Attached to Left Hand)
    // ----------------------------------------------------
    this.lighter = new THREE.Group();
    this.lighter.name = 'VoxelLighter';
    this.lighter.visible = false;
    this.leftWrist.add(this.lighter);

    this.lighter.position.set(0, 1.4 * VOXEL, -1.8 * VOXEL);
    this.lighter.rotation.set(Math.PI / 2, 0, 0);

    // Lighter body
    const lighterBody = createVoxelBox(2.2 * VOXEL, 3.2 * VOXEL, 1.2 * VOXEL, PALETTE.brass);
    lighterBody.position.set(0, -1.6 * VOXEL, 0);
    this.lighter.add(lighterBody);

    // Windscreen / chimney
    const chimney = createVoxelBox(1.5 * VOXEL, 1.1 * VOXEL, 1.0 * VOXEL, PALETTE.steel);
    chimney.position.set(0, 0.55 * VOXEL, 0);
    this.lighter.add(chimney);

    // Flint wheel
    const wheel = createVoxelBox(0.8 * VOXEL, 0.8 * VOXEL, 0.8 * VOXEL, PALETTE.ash);
    wheel.position.set(0.8 * VOXEL, 0.55 * VOXEL, 0);
    this.lighter.add(wheel);

    // Hinged Lid Pivot
    this.lighterLidPivot = new THREE.Group();
    this.lighterLidPivot.position.set(-1.1 * VOXEL, 0, -0.6 * VOXEL);
    this.lighter.add(this.lighterLidPivot);

    const lid = createVoxelBox(2.2 * VOXEL, 1.6 * VOXEL, 1.2 * VOXEL, PALETTE.brass);
    lid.position.set(1.1 * VOXEL, 0.8 * VOXEL, 0.6 * VOXEL);
    this.lighterLidPivot.add(lid);

    // Voxel Flame (flickers when lit)
    this.lighterFlame = new THREE.Group();
    this.lighterFlame.position.set(0, 1.1 * VOXEL, 0);
    this.lighterFlame.visible = false;
    this.lighter.add(this.lighterFlame);

    const outerFlame = createVoxelBox(0.7 * VOXEL, 1.3 * VOXEL, 0.7 * VOXEL, PALETTE.flameOrange, PALETTE.flameOrange);
    outerFlame.position.set(0, 0.65 * VOXEL, 0);
    this.lighterFlame.add(outerFlame);

    const innerFlame = createVoxelBox(0.45 * VOXEL, 0.9 * VOXEL, 0.45 * VOXEL, PALETTE.flameYellow, PALETTE.flameYellow);
    innerFlame.position.set(0, 0.45 * VOXEL, 0);
    this.lighterFlame.add(innerFlame);

    // ----------------------------------------------------
    // VOXEL CIGARETTE (Attached to Right Hand between fingers)
    // ----------------------------------------------------
    this.cigarette = new THREE.Group();
    this.cigarette.name = 'VoxelCigarette';
    this.cigarette.visible = false;
    this.rightWrist.add(this.cigarette);

    // Placed between right index and middle fingers
    this.cigarette.position.set(-0.5 * VOXEL, 0.8 * VOXEL, -2.8 * VOXEL);
    this.cigarette.rotation.set(-0.15, 0.1, -0.2);

    // Filter tip
    const filter = createVoxelBox(0.55 * VOXEL, 0.55 * VOXEL, 1.2 * VOXEL, PALETTE.cork);
    filter.position.set(0, 0, 0.6 * VOXEL);
    this.cigarette.add(filter);

    // Paper tube
    const paper = createVoxelBox(0.55 * VOXEL, 0.55 * VOXEL, 3.2 * VOXEL, PALETTE.cigarettePaper);
    paper.position.set(0, 0, -1.6 * VOXEL);
    this.cigarette.add(paper);

    // Dark Ash Zone
    const ash = createVoxelBox(0.54 * VOXEL, 0.54 * VOXEL, 0.5 * VOXEL, PALETTE.ash);
    ash.position.set(0, 0, -3.45 * VOXEL);
    this.cigarette.add(ash);

    // Glowing Ember tip
    this.emberMesh = createVoxelBox(0.5 * VOXEL, 0.5 * VOXEL, 0.3 * VOXEL, PALETTE.ember, PALETTE.ember);
    this.emberMesh.position.set(0, 0, -3.85 * VOXEL);
    this.cigarette.add(this.emberMesh);
  }

  // ---------------------------------------------------------------------------
  // Smoke Particle System
  // ---------------------------------------------------------------------------

  _initSmokeParticles() {
    this.smokePool = [];
    const count = 35;
    const geo = new THREE.BoxGeometry(VOXEL * 0.45, VOXEL * 0.45, VOXEL * 0.45);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xebf0f5,
      transparent: true,
      opacity: 0.65,
      depthWrite: false
    });

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, mat.clone());
      mesh.visible = false;
      this.group.add(mesh);

      this.smokePool.push({
        mesh,
        active: false,
        life: 0,
        maxLife: 1.0,
        vel: new THREE.Vector3(),
        rotVel: new THREE.Vector3(),
        baseScale: 1.0
      });
    }
  }

  _spawnSmokeParticle(origin, velocity, maxLife = 1.6, scale = 1.0) {
    const p = this.smokePool.find(item => !item.active);
    if (!p) return;

    p.active = true;
    p.life = 0;
    p.maxLife = maxLife;
    p.baseScale = scale;
    p.mesh.position.copy(origin);
    p.mesh.scale.setScalar(scale);
    p.mesh.material.opacity = 0.65;
    p.mesh.visible = true;

    p.vel.copy(velocity);
    p.rotVel.set(
      (Math.random() - 0.5) * 4.0,
      (Math.random() - 0.5) * 4.0,
      (Math.random() - 0.5) * 4.0
    );
  }

  _updateSmokeParticles(delta) {
    for (let i = 0; i < this.smokePool.length; i++) {
      const p = this.smokePool[i];
      if (!p.active) continue;

      p.life += delta;
      const progress = p.life / p.maxLife;

      if (progress >= 1.0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }

      // Physics drift & gentle upward buoyant force
      p.mesh.position.addScaledVector(p.vel, delta);
      p.vel.y += delta * 0.15; // float upwards
      p.vel.x += (Math.sin(p.life * 4.0 + i) * 0.04) * delta;

      // Rotation
      p.mesh.rotation.x += p.rotVel.x * delta;
      p.mesh.rotation.y += p.rotVel.y * delta;
      p.mesh.rotation.z += p.rotVel.z * delta;

      // Expansion and opacity dissipation
      const s = p.baseScale * (1.0 + progress * 2.8);
      p.mesh.scale.setScalar(s);
      p.mesh.material.opacity = Math.max(0, 0.65 * (1.0 - progress));
    }
  }

  // ---------------------------------------------------------------------------
  // Emote Playback API
  // ---------------------------------------------------------------------------

  /**
   * Start an emote animation.
   * @param {'smoke' | 'middle_finger' | 'clap'} name
   */
  playEmote(name) {
    this.currentEmote = name;
    this.emoteTime = 0;
    this.isEmoting = true;
    this.group.visible = true;
    this._soundFlags = {};

    switch (name) {
      case 'clap':
        this.emoteDuration = 2.4;
        this.lighter.visible = false;
        this.cigarette.visible = false;
        break;

      case 'middle_finger':
        this.emoteDuration = 2.8;
        this.lighter.visible = false;
        this.cigarette.visible = false;
        break;

      case 'smoke':
        this.emoteDuration = 6.2;
        this.lighter.visible = true;
        this.cigarette.visible = true;
        this.lighterFlame.visible = false;
        this.lighterLidPivot.rotation.x = 0;
        this.emberMesh.material.emissiveIntensity = 0.3;
        break;

      default:
        console.warn(`VoxelArms: Unknown emote "${name}"`);
        this.stopEmote();
        return;
    }
  }

  stopEmote() {
    this.currentEmote = null;
    this.isEmoting = false;
    this.group.visible = false;
    this._resetPose();

    // Deactivate active smoke particles
    for (let i = 0; i < this.smokePool.length; i++) {
      this.smokePool[i].active = false;
      this.smokePool[i].mesh.visible = false;
    }
  }

  _resetPose() {
    // Rest positions (held below view frustum)
    this.leftArm.position.set(-0.25, -0.65, -0.4);
    this.leftArm.rotation.set(0.3, 0.2, 0);
    this.leftElbow.rotation.set(0, 0, 0);
    this.leftWrist.rotation.set(0, 0, 0);

    this.rightArm.position.set(0.25, -0.65, -0.4);
    this.rightArm.rotation.set(0.3, -0.2, 0);
    this.rightElbow.rotation.set(0, 0, 0);
    this.rightWrist.rotation.set(0, 0, 0);

    this._setFingerCurl(this.leftThumb, 0);
    this._setFingerCurl(this.leftIndex, 0);
    this._setFingerCurl(this.leftMiddle, 0);
    this._setFingerCurl(this.leftRing, 0);
    this._setFingerCurl(this.leftPinky, 0);

    this._setFingerCurl(this.rightThumb, 0);
    this._setFingerCurl(this.rightIndex, 0);
    this._setMiddleFingerCurl(0);
    this._setFingerCurl(this.rightRing, 0);
    this._setFingerCurl(this.rightPinky, 0);

    if (this.lighter) this.lighter.visible = false;
    if (this.cigarette) this.cigarette.visible = false;
    if (this.lighterFlame) this.lighterFlame.visible = false;
  }

  _setFingerCurl(finger, curlRad) {
    if (!finger) return;
    finger.rotation.x = curlRad;
    if (finger.distal) {
      finger.distal.rotation.x = curlRad * 0.85;
    }
  }

  _setMiddleFingerCurl(curlRad) {
    if (!this.rightMiddle) return;
    this.rightMiddle.rotation.x = curlRad;
    if (this.rightMiddle.mid) {
      this.rightMiddle.mid.rotation.x = curlRad * 0.85;
    }
    if (this.rightMiddle.tip) {
      this.rightMiddle.tip.rotation.x = curlRad * 0.7;
    }
  }

  // ---------------------------------------------------------------------------
  // Frame Update Loop
  // ---------------------------------------------------------------------------

  update(delta) {
    this._updateSmokeParticles(delta);

    if (!this.isEmoting) return;

    this.emoteTime += delta;

    if (this.emoteTime >= this.emoteDuration) {
      this.stopEmote();
      return;
    }

    switch (this.currentEmote) {
      case 'clap':
        this._animateClap(this.emoteTime);
        break;

      case 'middle_finger':
        this._animateMiddleFinger(this.emoteTime);
        break;

      case 'smoke':
        this._animateSmoke(this.emoteTime, delta);
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // 1. CLAP ANIMATION
  // ---------------------------------------------------------------------------

  _animateClap(t) {
    // Both arms visible; hands start relaxed, palms inward
    this.leftArm.visible = true;
    this.rightArm.visible = true;

    // Open flat palms
    this._setFingerCurl(this.leftThumb, 0.1);
    this._setFingerCurl(this.leftIndex, 0.1);
    this._setFingerCurl(this.leftMiddle, 0.1);
    this._setFingerCurl(this.leftRing, 0.1);
    this._setFingerCurl(this.leftPinky, 0.1);

    this._setFingerCurl(this.rightThumb, 0.1);
    this._setFingerCurl(this.rightIndex, 0.1);
    this._setMiddleFingerCurl(0.1);
    this._setFingerCurl(this.rightRing, 0.1);
    this._setFingerCurl(this.rightPinky, 0.1);

    const raiseDur = 0.45;
    const lowerStart = 1.95;

    // Height & Z positions
    let y = -0.20;
    let z = -0.42;

    if (t < raiseDur) {
      // Ease in from bottom
      const prog = t / raiseDur;
      const ease = 1 - Math.pow(1 - prog, 3);
      y = -0.65 + ease * 0.45;
      z = -0.48 + ease * 0.06;
    } else if (t > lowerStart) {
      // Ease out downwards
      const prog = (t - lowerStart) / (this.emoteDuration - lowerStart);
      const ease = prog * prog;
      y = -0.20 - ease * 0.45;
      z = -0.42 - ease * 0.06;
    }

    // Clapping rhythm (3 slaps)
    let clapOffset = 0.12; // distance between hands
    if (t >= raiseDur && t <= lowerStart) {
      const clapTime = t - raiseDur;
      const cycle = 0.45; // 0.45s per clap cycle
      const phase = (clapTime % cycle) / cycle;

      // Slap together sharply then bounce out
      if (phase < 0.25) {
        // Fast strike inwards
        const strikeProg = phase / 0.25;
        clapOffset = THREE.MathUtils.lerp(0.12, 0.038, strikeProg);
      } else if (phase < 0.5) {
        // Impact recoil
        const recoilProg = (phase - 0.25) / 0.25;
        clapOffset = THREE.MathUtils.lerp(0.038, 0.14, recoilProg);
      } else {
        // Hold outward preparing for next strike
        clapOffset = 0.12;
      }

      // Trigger audio clap on contact
      const clapIndex = Math.floor(clapTime / cycle);
      if (phase < 0.28 && !this._soundFlags[`clap_${clapIndex}`]) {
        this._soundFlags[`clap_${clapIndex}`] = true;
        this.audio.playClap();
      }
    }

    // Apply positions
    this.leftArm.position.set(-clapOffset, y, z);
    this.leftArm.rotation.set(0.1, 0.45, 0.7); // palm facing right
    this.leftWrist.rotation.set(0, 0.2, 0);

    this.rightArm.position.set(clapOffset, y, z);
    this.rightArm.rotation.set(0.1, -0.45, -0.7); // palm facing left
    this.rightWrist.rotation.set(0, -0.2, 0);
  }

  // ---------------------------------------------------------------------------
  // 2. MIDDLE FINGER ANIMATION
  // ---------------------------------------------------------------------------

  _animateMiddleFinger(t) {
    // Only right arm visible
    this.leftArm.visible = false;
    this.rightArm.visible = true;

    // Curl thumb, index, ring, pinky into a tight solid fist
    const fistCurl = 1.65; // ~95 deg
    this._setFingerCurl(this.rightThumb, 1.4);
    this._setFingerCurl(this.rightIndex, fistCurl);
    this._setFingerCurl(this.rightRing, fistCurl);
    this._setFingerCurl(this.rightPinky, fistCurl);

    const raiseEnd = 0.5;
    const flickStart = 0.5;
    const flickEnd = 0.75;
    const lowerStart = 2.2;

    let posX = 0.06;
    let posY = -0.22;
    let posZ = -0.42;
    let rotX = 0.15;
    let middleCurl = fistCurl; // middle finger starts curled in fist

    if (t < raiseEnd) {
      // Raising fist from bottom right
      const p = t / raiseEnd;
      const ease = 1 - Math.pow(1 - p, 2);
      posY = -0.65 + ease * 0.43;
      posZ = -0.48 + ease * 0.06;
      middleCurl = fistCurl;
    } else if (t >= flickStart && t < flickEnd) {
      // Middle finger springs upright with recoil punch!
      const p = (t - flickStart) / (flickEnd - flickStart);
      const snap = 1 - Math.pow(1 - p, 3);

      middleCurl = THREE.MathUtils.lerp(fistCurl, -0.15, snap); // extended proudly upright!

      // Upward punch bounce
      posY = -0.22 + Math.sin(p * Math.PI) * 0.06;
      rotX = 0.15 - Math.sin(p * Math.PI) * 0.2;

      if (!this._soundFlags['finger_flick']) {
        this._soundFlags['finger_flick'] = true;
        this.audio.playFlickGesture();
      }
    } else if (t >= flickEnd && t <= lowerStart) {
      // Hold extended with a subtle, defiant breathing bob
      middleCurl = -0.15;
      const holdTime = t - flickEnd;
      posY = -0.22 + Math.sin(holdTime * 5.0) * 0.008;
      rotX = 0.15 + Math.sin(holdTime * 4.0) * 0.03;
    } else if (t > lowerStart) {
      // Retract down off screen
      const p = (t - lowerStart) / (this.emoteDuration - lowerStart);
      const ease = p * p;
      middleCurl = THREE.MathUtils.lerp(-0.15, 0.4, ease);
      posY = -0.22 - ease * 0.43;
      posZ = -0.42 - ease * 0.06;
    }

    this._setMiddleFingerCurl(middleCurl);

    this.rightArm.position.set(posX, posY, posZ);
    this.rightArm.rotation.set(rotX, -0.12, 0.08);
    this.rightWrist.rotation.set(-0.1, 0, 0);
  }

  // ---------------------------------------------------------------------------
  // 3. SMOKE CIGARETTE ANIMATION
  // ---------------------------------------------------------------------------

  _animateSmoke(t, delta) {
    this.leftArm.visible = true;
    this.rightArm.visible = true;

    // Timeline stages:
    // 0.0 - 0.7s: Raise arms (cigarette in right hand, lighter in left)
    // 0.7 - 1.2s: Lighter flicks open, flame ignites
    // 1.2 - 2.1s: Left hand touches flame to cigarette tip (ember glows!)
    // 2.1 - 2.8s: Lighter closes & lowers, right hand brings cigarette to lips
    // 2.8 - 3.6s: Take a deep drag (ember burns hot, inhale sound)
    // 3.6 - 4.5s: Lower cigarette, exhale thick voxel smoke clouds
    // 4.5 - 5.3s: Casual hold, gentle smoke wisp
    // 5.3 - 6.2s: Right arm retracts down

    // Fingers curled around lighter in left hand
    this._setFingerCurl(this.leftThumb, 0.8);
    this._setFingerCurl(this.leftIndex, 1.4);
    this._setFingerCurl(this.leftMiddle, 1.5);
    this._setFingerCurl(this.leftRing, 1.5);
    this._setFingerCurl(this.leftPinky, 1.5);

    // Right fingers holding cigarette between index & middle
    this._setFingerCurl(this.rightThumb, 1.1);
    this._setFingerCurl(this.rightIndex, 0.35); // pinching cigarette
    this._setMiddleFingerCurl(0.35);
    this._setFingerCurl(this.rightRing, 1.4);
    this._setFingerCurl(this.rightPinky, 1.5);

    // ----------------- LEFT ARM & LIGHTER -----------------
    if (t < 0.7) {
      // Raise lighter
      const p = t / 0.7;
      const ease = 1 - Math.pow(1 - p, 2);
      this.leftArm.position.set(-0.25 + ease * 0.16, -0.65 + ease * 0.44, -0.45 + ease * 0.05);
      this.leftArm.rotation.set(0.2, 0.3, 0.1);
    } else if (t < 1.2) {
      // Flick lighter open & ignite flame
      this.leftArm.position.set(-0.09, -0.21, -0.40);
      this.leftArm.rotation.set(0.2, 0.25, 0.15);

      const flickProg = (t - 0.7) / 0.5;
      if (flickProg > 0.4) {
        this.lighterLidPivot.rotation.x = -1.9; // lid flipped open
        this.lighterFlame.visible = true;

        if (!this._soundFlags['lighter_flick']) {
          this._soundFlags['lighter_flick'] = true;
          this.audio.playLighterFlick();
        }
      }
    } else if (t < 2.1) {
      // Hold flame right at cigarette tip
      this.leftArm.position.set(-0.045, -0.19, -0.38);
      this.leftArm.rotation.set(0.2, 0.18, 0.12);
      this.lighterFlame.visible = true;
      this.lighterFlame.scale.setScalar(0.9 + Math.sin(t * 35.0) * 0.2); // flicker
    } else if (t < 2.8) {
      // Snap lighter shut & lower left arm
      if (!this._soundFlags['lighter_snap']) {
        this._soundFlags['lighter_snap'] = true;
        this.lighterFlame.visible = false;
        this.lighterLidPivot.rotation.x = 0;
        this.audio.playLighterSnap();
      }
      const p = (t - 2.1) / 0.7;
      const ease = p * p;
      this.leftArm.position.set(-0.09 - ease * 0.15, -0.21 - ease * 0.44, -0.40 - ease * 0.05);
      this.leftArm.rotation.set(0.2, 0.3, 0.1);
    } else {
      // Left arm away
      this.leftArm.visible = false;
    }

    // ----------------- RIGHT ARM & CIGARETTE -----------------
    if (t < 0.7) {
      // Raise cigarette towards center
      const p = t / 0.7;
      const ease = 1 - Math.pow(1 - p, 2);
      this.rightArm.position.set(0.25 - ease * 0.18, -0.65 + ease * 0.48, -0.45 + ease * 0.08);
      this.rightArm.rotation.set(0.25, -0.35, -0.15);
      this.emberMesh.material.emissiveIntensity = 0.2;
    } else if (t < 2.1) {
      // Hold cigarette steady while being lit
      this.rightArm.position.set(0.065, -0.17, -0.37);
      this.rightArm.rotation.set(0.25, -0.28, -0.12);

      if (t > 1.2) {
        // Ember catching fire
        const catchProg = (t - 1.2) / 0.9;
        this.emberMesh.material.emissiveIntensity = 0.3 + catchProg * 1.5;

        // Occasional tiny spark
        if (Math.random() < 0.2) {
          const tipPos = new THREE.Vector3(0.01, -0.16, -0.36);
          const sparkVel = new THREE.Vector3((Math.random() - 0.5) * 0.06, 0.05 + Math.random() * 0.05, 0.02);
          this._spawnSmokeParticle(tipPos, sparkVel, 0.6, 0.45);
        }
      }
    } else if (t < 2.8) {
      // Move cigarette right to the mouth
      const p = (t - 2.1) / 0.7;
      const ease = 1 - Math.pow(1 - p, 2);
      this.rightArm.position.set(0.065 - ease * 0.035, -0.17 + ease * 0.04, -0.37 + ease * 0.08); // closer to camera!
      this.rightArm.rotation.set(0.35, -0.22, -0.08);
    } else if (t < 3.6) {
      // INHALE / DRAG
      this.rightArm.position.set(0.03, -0.13, -0.29); // at lips!
      this.rightArm.rotation.set(0.38, -0.20, -0.06);

      // Ember burns intense orange-red!
      const inhaleP = (t - 2.8) / 0.8;
      this.emberMesh.material.emissiveIntensity = 1.8 + Math.sin(inhaleP * Math.PI) * 1.5;

      if (!this._soundFlags['inhale']) {
        this._soundFlags['inhale'] = true;
        this.audio.playInhale();
      }
    } else if (t < 4.6) {
      // Move cigarette away & EXHALE SMOKE CLOUD!
      const p = (t - 3.6) / 1.0;
      const ease = 1 - Math.pow(1 - p, 2);
      this.rightArm.position.set(0.03 + ease * 0.12, -0.13 - ease * 0.12, -0.29 - ease * 0.12);
      this.rightArm.rotation.set(0.25, -0.4, -0.18);
      this.emberMesh.material.emissiveIntensity = 0.6;

      if (!this._soundFlags['exhale']) {
        this._soundFlags['exhale'] = true;
        this.audio.playExhale();
      }

      // Spawn dense puffs of blocky voxel smoke from camera mouth level
      if (t >= 3.7 && t <= 4.4 && Math.random() < 0.8) {
        const mouthPos = new THREE.Vector3(
          (Math.random() - 0.5) * 0.03,
          -0.08 + (Math.random() - 0.5) * 0.02,
          -0.22
        );
        const smokeVel = new THREE.Vector3(
          (Math.random() - 0.45) * 0.12,
          0.08 + Math.random() * 0.14,
          -0.25 - Math.random() * 0.2
        );
        this._spawnSmokeParticle(mouthPos, smokeVel, 1.8, 0.85);
      }
    } else if (t < 5.4) {
      // Holding cigarette casually, ember still smoking gently
      this.rightArm.position.set(0.15, -0.25, -0.41);
      this.rightArm.rotation.set(0.22, -0.4, -0.18);

      if (Math.random() < 0.25) {
        const ashPos = new THREE.Vector3(0.11, -0.23, -0.44);
        const wispVel = new THREE.Vector3((Math.random() - 0.5) * 0.03, 0.08, 0.01);
        this._spawnSmokeParticle(ashPos, wispVel, 1.2, 0.5);
      }
    } else {
      // Retracting right arm down
      const p = (t - 5.4) / (this.emoteDuration - 5.4);
      const ease = p * p;
      this.rightArm.position.set(0.15 + ease * 0.10, -0.25 - ease * 0.40, -0.41 - ease * 0.04);
      this.rightArm.rotation.set(0.22, -0.4, -0.18);
    }
  }

  // ---------------------------------------------------------------------------
  // Teardown
  // ---------------------------------------------------------------------------

  dispose() {
    this.stopEmote();
    if (this.group && this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}

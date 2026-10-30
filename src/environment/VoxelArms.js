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

  playFistBump() {
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Deep chest punch thud
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.12);
    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);

    // Punchy noise impact
    const bufferSize = ctx.sampleRate * 0.05;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.01));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, now);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
  }

  playJazzHands() {
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const freqs = [523.25, 659.25, 783.99, 1046.50, 1318.51];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + idx * 0.06);
      gain.gain.setValueAtTime(0.12, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.18);
    });
  }

  playGlassTink() {
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(3200, now);
    osc.frequency.exponentialRampToValueAtTime(2800, now + 0.08);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  playSyringeInject() {
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const dur = 0.5;
    const bufferSize = ctx.sampleRate * dur;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin(i / 15);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(400, now + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }

  playHookGleam() {
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.exponentialRampToValueAtTime(4200, now + 0.15);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.46);
  }

  playCardSnap() {
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

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
    filter.frequency.setValueAtTime(2400, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }

  playCorkPop() {
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.06);
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);

    // Suction air pop
    const bufferSize = ctx.sampleRate * 0.03;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin(i / 10);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, now);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.3, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
  }

  playSwigGlug() {
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    [0, 0.22].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(240, now + offset);
      osc.frequency.exponentialRampToValueAtTime(360, now + offset + 0.04);
      osc.frequency.exponentialRampToValueAtTime(180, now + offset + 0.12);
      gain.gain.setValueAtTime(0.35, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.15);
    });
  }

  playSailorSigh() {
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const dur = 0.6;
    const bufferSize = ctx.sampleRate * dur;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / bufferSize);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(500, now);
    filter.frequency.exponentialRampToValueAtTime(180, now + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }

  playCoinToss() {
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Resonant metallic chime
    [2600, 5200].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.98, now + 0.55);
      gain.gain.setValueAtTime(idx === 0 ? 0.35 : 0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.56);
    });
  }

  playCoinCatch() {
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(3200, now);
    osc.frequency.exponentialRampToValueAtTime(1800, now + 0.05);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  playSpyglassExtend() {
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    [0, 0.08, 0.16].forEach((offset, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1800 + idx * 300, now + offset);
      gain.gain.setValueAtTime(0.25, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.05);
    });
  }

  playSpyglassCollapse() {
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.08);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  playFacepalm() {
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Fleshy slap impact
    const bufferSize = ctx.sampleRate * 0.08;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.015));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(750, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);

    // Followed by low sigh
    const sighDur = 0.5;
    const sighBuffer = ctx.createBuffer(1, ctx.sampleRate * sighDur, ctx.sampleRate);
    const sData = sighBuffer.getChannelData(0);
    for (let i = 0; i < sData.length; i++) {
      sData[i] = (Math.random() * 2 - 1) * (1 - i / sData.length);
    }
    const sigh = ctx.createBufferSource();
    sigh.buffer = sighBuffer;
    const sFilter = ctx.createBiquadFilter();
    sFilter.type = 'bandpass';
    sFilter.frequency.setValueAtTime(420, now + 0.08);
    sFilter.frequency.exponentialRampToValueAtTime(220, now + 0.08 + sighDur);
    const sGain = ctx.createGain();
    sGain.gain.setValueAtTime(0.25, now + 0.08);
    sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08 + sighDur);
    sigh.connect(sFilter);
    sFilter.connect(sGain);
    sGain.connect(ctx.destination);
    sigh.start(now + 0.08);
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
  flameOrange: 0xff5500,
  cardWhite: 0xfaf5eb,
  cardBackRed: 0x991b1b,
  cardSpadeBlack: 0x18181b,
  syringeFluid: 0x22c55e,
  syringeGlass: 0xbae6fd,
  hookSteel: 0xe2e8f0,
  hookDarkSteel: 0x475569,
  rumGlass: 0x1f3b25,
  rumLiquid: 0x612c0e,
  bottleLabel: 0xded1b1,
  goldCoin: 0xf59e0b,
  goldCoinEdge: 0xb45309,
  lensGlass: 0x38bdf8
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

    // Right Fingers Group (contains palm & fingers; can be hidden when Hook Hand is active)
    this.rightFingersGroup = new THREE.Group();
    this.rightWrist.add(this.rightFingersGroup);

    // Right Palm
    const rightPalm = createVoxelBox(3.0 * VOXEL, 1.2 * VOXEL, 3.0 * VOXEL, PALETTE.skin);
    rightPalm.position.set(0, 0, -1.5 * VOXEL);
    this.rightFingersGroup.add(rightPalm);

    // Right Fingers (Thumb, Index, Middle, Ring, Pinky)
    this.rightThumb = this._createFinger(1.2, 1.1, 1.3, PALETTE.skin, true);
    this.rightThumb.position.set(-1.5 * VOXEL, 0, -1.0 * VOXEL);
    this.rightThumb.rotation.y = -Math.PI / 4;
    this.rightFingersGroup.add(this.rightThumb);

    this.rightIndex = this._createFinger(0.9, 1.0, 1.4, PALETTE.skin);
    this.rightIndex.position.set(-0.9 * VOXEL, 0, -3.0 * VOXEL);
    this.rightFingersGroup.add(this.rightIndex);

    // Middle finger (3-segment voxel articulation for maximum expression)
    this.rightMiddle = this._createMiddleFinger();
    this.rightMiddle.position.set(0.0 * VOXEL, 0, -3.0 * VOXEL);
    this.rightFingersGroup.add(this.rightMiddle);

    this.rightRing = this._createFinger(0.9, 1.0, 1.4, PALETTE.skin);
    this.rightRing.position.set(0.9 * VOXEL, 0, -3.0 * VOXEL);
    this.rightFingersGroup.add(this.rightRing);

    this.rightPinky = this._createFinger(0.8, 0.9, 1.1, PALETTE.skin);
    this.rightPinky.position.set(1.8 * VOXEL, 0, -2.8 * VOXEL);
    this.rightFingersGroup.add(this.rightPinky);
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

    // ----------------------------------------------------
    // PIRATE HOOK HAND (Attached to Right Wrist)
    // ----------------------------------------------------
    this.rightHook = new THREE.Group();
    this.rightHook.name = 'PirateHook';
    this.rightHook.visible = false;
    this.rightWrist.add(this.rightHook);

    // Brass wrist cuff / socket
    const hookCuff = createVoxelBox(3.4 * VOXEL, 3.2 * VOXEL, 2.0 * VOXEL, PALETTE.brass);
    hookCuff.position.set(0, 0, -1.0 * VOXEL);
    this.rightHook.add(hookCuff);

    const hookBand = createVoxelBox(3.6 * VOXEL, 3.4 * VOXEL, 0.6 * VOXEL, PALETTE.brassDark);
    hookBand.position.set(0, 0, -1.8 * VOXEL);
    this.rightHook.add(hookBand);

    // Steel base socket
    const hookSocket = createVoxelBox(1.8 * VOXEL, 1.8 * VOXEL, 1.2 * VOXEL, PALETTE.hookDarkSteel);
    hookSocket.position.set(0, 0, -2.5 * VOXEL);
    this.rightHook.add(hookSocket);

    // Curved steel hook segments
    const hookStem = createVoxelBox(1.2 * VOXEL, 1.2 * VOXEL, 2.2 * VOXEL, PALETTE.hookSteel);
    hookStem.position.set(0, 0, -3.8 * VOXEL);
    this.rightHook.add(hookStem);

    const hookCurve1 = createVoxelBox(1.1 * VOXEL, 1.6 * VOXEL, 1.2 * VOXEL, PALETTE.hookSteel);
    hookCurve1.position.set(0, 1.2 * VOXEL, -4.5 * VOXEL);
    this.rightHook.add(hookCurve1);

    const hookCurve2 = createVoxelBox(1.0 * VOXEL, 2.4 * VOXEL, 1.1 * VOXEL, PALETTE.hookSteel);
    hookCurve2.position.set(0, 2.6 * VOXEL, -4.0 * VOXEL);
    this.rightHook.add(hookCurve2);

    const hookTip = createVoxelBox(0.8 * VOXEL, 1.6 * VOXEL, 0.8 * VOXEL, PALETTE.hookSteel);
    hookTip.position.set(0, 3.8 * VOXEL, -3.0 * VOXEL);
    this.rightHook.add(hookTip);

    // Gleam sparkle on hook tip
    this.hookGlint = createVoxelBox(0.9 * VOXEL, 0.9 * VOXEL, 0.9 * VOXEL, 0xffffff, 0xffffff);
    this.hookGlint.position.set(0, 4.2 * VOXEL, -2.6 * VOXEL);
    this.hookGlint.visible = false;
    this.rightHook.add(this.hookGlint);

    // ----------------------------------------------------
    // MEDICAL SYRINGE (Attached to Right Wrist)
    // ----------------------------------------------------
    this.syringe = new THREE.Group();
    this.syringe.name = 'VoxelSyringe';
    this.syringe.visible = false;
    this.rightWrist.add(this.syringe);
    this.syringe.position.set(-0.6 * VOXEL, 1.2 * VOXEL, -2.5 * VOXEL);
    this.syringe.rotation.set(-0.2, 0.1, 0);

    // Glass barrel
    const barrel = createVoxelBox(1.2 * VOXEL, 1.2 * VOXEL, 3.5 * VOXEL, PALETTE.syringeGlass);
    barrel.position.set(0, 0, -1.75 * VOXEL);
    this.syringe.add(barrel);

    // Green medicine inside barrel
    this.syringeFluidMesh = createVoxelBox(0.9 * VOXEL, 0.9 * VOXEL, 2.4 * VOXEL, PALETTE.syringeFluid);
    this.syringeFluidMesh.position.set(0, 0, -2.0 * VOXEL);
    this.syringe.add(this.syringeFluidMesh);

    // Needle collar & steel needle tip
    const needleHub = createVoxelBox(0.8 * VOXEL, 0.8 * VOXEL, 0.6 * VOXEL, PALETTE.steel);
    needleHub.position.set(0, 0, -3.8 * VOXEL);
    this.syringe.add(needleHub);

    const needleTip = createVoxelBox(0.2 * VOXEL, 0.2 * VOXEL, 2.6 * VOXEL, PALETTE.hookSteel);
    needleTip.position.set(0, 0, -5.2 * VOXEL);
    this.syringe.add(needleTip);

    // Syringe Plunger (slides in during injection)
    this.syringePlunger = new THREE.Group();
    this.syringe.add(this.syringePlunger);

    const plungerRod = createVoxelBox(0.4 * VOXEL, 0.4 * VOXEL, 3.2 * VOXEL, PALETTE.steel);
    plungerRod.position.set(0, 0, 1.2 * VOXEL);
    this.syringePlunger.add(plungerRod);

    const plungerFlange = createVoxelBox(1.4 * VOXEL, 1.4 * VOXEL, 0.3 * VOXEL, PALETTE.steel);
    plungerFlange.position.set(0, 0, 2.8 * VOXEL);
    this.syringePlunger.add(plungerFlange);

    // ----------------------------------------------------
    // PLAYING CARD (Attached to Right Hand)
    // ----------------------------------------------------
    this.playingCard = new THREE.Group();
    this.playingCard.name = 'PlayingCard';
    this.playingCard.visible = false;
    this.rightWrist.add(this.playingCard);
    this.playingCard.position.set(-0.3 * VOXEL, 0.6 * VOXEL, -3.6 * VOXEL);

    // Card white face
    const cardFace = createVoxelBox(2.2 * VOXEL, 0.08 * VOXEL, 3.2 * VOXEL, PALETTE.cardWhite);
    this.playingCard.add(cardFace);

    // Card red border backing
    const cardBack = createVoxelBox(2.22 * VOXEL, 0.04 * VOXEL, 3.22 * VOXEL, PALETTE.cardBackRed);
    cardBack.position.set(0, -0.05 * VOXEL, 0);
    this.playingCard.add(cardBack);

    // Black spade center mark
    const cardMark = createVoxelBox(0.7 * VOXEL, 0.1 * VOXEL, 0.9 * VOXEL, PALETTE.cardSpadeBlack);
    cardMark.position.set(0, 0.04 * VOXEL, 0);
    this.playingCard.add(cardMark);

    // ----------------------------------------------------
    // RUM BOTTLE (Attached to Right Wrist)
    // ----------------------------------------------------
    this.rumBottle = new THREE.Group();
    this.rumBottle.name = 'RumBottle';
    this.rumBottle.visible = false;
    this.rightWrist.add(this.rumBottle);
    this.rumBottle.position.set(-0.2 * VOXEL, 0.8 * VOXEL, -2.6 * VOXEL);

    // Green glass body
    const bottleBody = createVoxelBox(2.2 * VOXEL, 4.2 * VOXEL, 2.2 * VOXEL, PALETTE.rumGlass);
    bottleBody.position.set(0, 0, -2.1 * VOXEL);
    this.rumBottle.add(bottleBody);

    // Parchment label on front
    const bottleLabel = createVoxelBox(2.22 * VOXEL, 2.0 * VOXEL, 2.22 * VOXEL, PALETTE.bottleLabel);
    bottleLabel.position.set(0, 0, -2.1 * VOXEL);
    this.rumBottle.add(bottleLabel);

    // Tapered neck
    const bottleNeck = createVoxelBox(1.1 * VOXEL, 1.8 * VOXEL, 1.1 * VOXEL, PALETTE.rumGlass);
    bottleNeck.position.set(0, 0, -4.6 * VOXEL);
    this.rumBottle.add(bottleNeck);

    // Cork Stopper (can pop off during uncorking)
    this.bottleCork = createVoxelBox(0.95 * VOXEL, 1.0 * VOXEL, 0.95 * VOXEL, PALETTE.cork);
    this.bottleCork.position.set(0, 0, -5.6 * VOXEL);
    this.rumBottle.add(this.bottleCork);

    // ----------------------------------------------------
    // GOLD DOUBLOON (Attached to Right Wrist)
    // ----------------------------------------------------
    this.goldCoin = new THREE.Group();
    this.goldCoin.name = 'GoldDoubloon';
    this.goldCoin.visible = false;
    this.rightWrist.add(this.goldCoin);
    this.goldCoin.position.set(0, 0.7 * VOXEL, -3.2 * VOXEL);

    // Coin face
    const coinFace = createVoxelBox(1.8 * VOXEL, 0.22 * VOXEL, 1.8 * VOXEL, PALETTE.goldCoin);
    this.goldCoin.add(coinFace);

    // Coin outer rim
    const coinRim = createVoxelBox(1.85 * VOXEL, 0.16 * VOXEL, 1.85 * VOXEL, PALETTE.goldCoinEdge);
    this.goldCoin.add(coinRim);

    // Anchor emblem on coin
    const coinEmblem = createVoxelBox(0.6 * VOXEL, 0.28 * VOXEL, 0.6 * VOXEL, PALETTE.brassDark);
    this.goldCoin.add(coinEmblem);

    // ----------------------------------------------------
    // BRASS SPYGLASS (Attached to Right Wrist)
    // ----------------------------------------------------
    this.spyglass = new THREE.Group();
    this.spyglass.name = 'BrassSpyglass';
    this.spyglass.visible = false;
    this.rightWrist.add(this.spyglass);
    this.spyglass.position.set(-0.3 * VOXEL, 0.8 * VOXEL, -2.6 * VOXEL);

    // Base barrel (leather wrapped / dark brass)
    const spyMain = createVoxelBox(1.6 * VOXEL, 1.6 * VOXEL, 3.4 * VOXEL, PALETTE.brassDark);
    spyMain.position.set(0, 0, -1.7 * VOXEL);
    this.spyglass.add(spyMain);

    // Brass decorative rings
    const spyRing1 = createVoxelBox(1.7 * VOXEL, 1.7 * VOXEL, 0.4 * VOXEL, PALETTE.brass);
    spyRing1.position.set(0, 0, -0.4 * VOXEL);
    this.spyglass.add(spyRing1);

    const spyRing2 = createVoxelBox(1.7 * VOXEL, 1.7 * VOXEL, 0.4 * VOXEL, PALETTE.brass);
    spyRing2.position.set(0, 0, -3.2 * VOXEL);
    this.spyglass.add(spyRing2);

    // Middle extending brass tube
    this.spyglassTube1 = new THREE.Group();
    this.spyglass.add(this.spyglassTube1);
    const tube1 = createVoxelBox(1.2 * VOXEL, 1.2 * VOXEL, 3.2 * VOXEL, PALETTE.brass);
    tube1.position.set(0, 0, -1.6 * VOXEL);
    this.spyglassTube1.add(tube1);

    // Front extending brass tube & glass lens
    this.spyglassTube2 = new THREE.Group();
    this.spyglass.add(this.spyglassTube2);
    const tube2 = createVoxelBox(0.9 * VOXEL, 0.9 * VOXEL, 3.0 * VOXEL, PALETTE.brass);
    tube2.position.set(0, 0, -1.5 * VOXEL);
    this.spyglassTube2.add(tube2);

    const spyLens = createVoxelBox(0.8 * VOXEL, 0.8 * VOXEL, 0.25 * VOXEL, PALETTE.lensGlass, 0x103040);
    spyLens.position.set(0, 0, -3.1 * VOXEL);
    this.spyglassTube2.add(spyLens);
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

  _hideAllProps() {
    if (this.lighter) this.lighter.visible = false;
    if (this.cigarette) this.cigarette.visible = false;
    if (this.lighterFlame) this.lighterFlame.visible = false;
    if (this.rightHook) this.rightHook.visible = false;
    if (this.hookGlint) this.hookGlint.visible = false;
    if (this.syringe) this.syringe.visible = false;
    if (this.playingCard) this.playingCard.visible = false;
    if (this.rumBottle) this.rumBottle.visible = false;
    if (this.goldCoin) this.goldCoin.visible = false;
    if (this.spyglass) this.spyglass.visible = false;
  }

  /**
   * Start an emote animation.
   * @param {'smoke' | 'middle_finger' | 'clap' | 'fist_bump' | 'jazz_hands' | 'needle' | 'hook_hand' | 'card_trick' | 'rum_swig' | 'coin_flip' | 'spyglass' | 'facepalm'} name
   */
  playEmote(name) {
    this.currentEmote = name;
    this.emoteTime = 0;
    this.isEmoting = true;
    this.group.visible = true;
    this._soundFlags = {};
    this._hideAllProps();

    switch (name) {
      case 'clap':
        this.emoteDuration = 2.4;
        if (this.rightFingersGroup) this.rightFingersGroup.visible = true;
        break;

      case 'middle_finger':
        this.emoteDuration = 2.8;
        if (this.rightFingersGroup) this.rightFingersGroup.visible = true;
        break;

      case 'smoke':
        this.emoteDuration = 6.2;
        if (this.rightFingersGroup) this.rightFingersGroup.visible = true;
        if (this.lighter) this.lighter.visible = true;
        if (this.cigarette) this.cigarette.visible = true;
        if (this.lighterFlame) this.lighterFlame.visible = false;
        if (this.lighterLidPivot) this.lighterLidPivot.rotation.x = 0;
        if (this.emberMesh) this.emberMesh.material.emissiveIntensity = 0.3;
        break;

      case 'fist_bump':
        this.emoteDuration = 2.6;
        if (this.rightFingersGroup) this.rightFingersGroup.visible = true;
        break;

      case 'jazz_hands':
        this.emoteDuration = 3.0;
        if (this.rightFingersGroup) this.rightFingersGroup.visible = true;
        break;

      case 'needle':
        this.emoteDuration = 4.2;
        if (this.rightFingersGroup) this.rightFingersGroup.visible = true;
        if (this.syringe) {
          this.syringe.visible = true;
          if (this.syringePlunger) this.syringePlunger.position.set(0, 0, 0);
          if (this.syringeFluidMesh) this.syringeFluidMesh.scale.set(1, 1, 1);
        }
        break;

      case 'hook_hand':
        this.emoteDuration = 3.6;
        if (this.rightFingersGroup) this.rightFingersGroup.visible = false;
        if (this.rightHook) this.rightHook.visible = true;
        if (this.hookGlint) this.hookGlint.visible = false;
        break;

      case 'card_trick':
        this.emoteDuration = 3.6;
        if (this.rightFingersGroup) this.rightFingersGroup.visible = true;
        if (this.playingCard) {
          this.playingCard.visible = true;
          this.playingCard.scale.set(1, 1, 1);
        }
        break;

      case 'rum_swig':
        this.emoteDuration = 4.8;
        if (this.rightFingersGroup) this.rightFingersGroup.visible = true;
        if (this.rumBottle) {
          this.rumBottle.visible = true;
          if (this.bottleCork) this.bottleCork.position.set(0, 0, -5.6 * VOXEL);
        }
        break;

      case 'coin_flip':
        this.emoteDuration = 3.5;
        if (this.rightFingersGroup) this.rightFingersGroup.visible = true;
        if (this.goldCoin) {
          this.goldCoin.visible = true;
          this.goldCoin.position.set(0, 0.7 * VOXEL, -3.2 * VOXEL);
          this.goldCoin.rotation.set(0, 0, 0);
        }
        break;

      case 'spyglass':
        this.emoteDuration = 4.4;
        if (this.rightFingersGroup) this.rightFingersGroup.visible = true;
        if (this.spyglass) {
          this.spyglass.visible = true;
          if (this.spyglassTube1) this.spyglassTube1.position.set(0, 0, 0);
          if (this.spyglassTube2) this.spyglassTube2.position.set(0, 0, 0);
        }
        break;

      case 'facepalm':
        this.emoteDuration = 3.0;
        if (this.rightFingersGroup) this.rightFingersGroup.visible = true;
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

    this._hideAllProps();
    if (this.rightFingersGroup) this.rightFingersGroup.visible = true;
    if (this.bottleCork) this.bottleCork.position.set(0, 0, -5.6 * VOXEL);
    if (this.goldCoin) {
      this.goldCoin.position.set(0, 0.7 * VOXEL, -3.2 * VOXEL);
      this.goldCoin.rotation.set(0, 0, 0);
    }
    if (this.spyglassTube1) this.spyglassTube1.position.set(0, 0, 0);
    if (this.spyglassTube2) this.spyglassTube2.position.set(0, 0, 0);
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

      case 'fist_bump':
        this._animateFistBump(this.emoteTime);
        break;

      case 'jazz_hands':
        this._animateJazzHands(this.emoteTime);
        break;

      case 'needle':
        this._animateNeedle(this.emoteTime);
        break;

      case 'hook_hand':
        this._animateHookHand(this.emoteTime);
        break;

      case 'card_trick':
        this._animateCardTrick(this.emoteTime);
        break;

      case 'rum_swig':
        this._animateRumSwig(this.emoteTime);
        break;

      case 'coin_flip':
        this._animateCoinFlip(this.emoteTime);
        break;

      case 'spyglass':
        this._animateSpyglass(this.emoteTime);
        break;

      case 'facepalm':
        this._animateFacepalm(this.emoteTime);
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
    this._setFingerCurl(this.leftThumb, 0.05);
    this._setFingerCurl(this.leftIndex, 0.05);
    this._setFingerCurl(this.leftMiddle, 0.05);
    this._setFingerCurl(this.leftRing, 0.05);
    this._setFingerCurl(this.leftPinky, 0.05);

    this._setFingerCurl(this.rightThumb, 0.05);
    this._setFingerCurl(this.rightIndex, 0.05);
    this._setMiddleFingerCurl(0.05);
    this._setFingerCurl(this.rightRing, 0.05);
    this._setFingerCurl(this.rightPinky, 0.05);

    const raiseDur = 0.4;
    const lowerStart = 2.0;

    // Height & Z positions
    let y = -0.16;
    let z = -0.38;

    if (t < raiseDur) {
      // Ease in from bottom
      const prog = t / raiseDur;
      const ease = 1 - Math.pow(1 - prog, 3);
      y = -0.65 + ease * 0.49;
      z = -0.45 + ease * 0.07;
    } else if (t > lowerStart) {
      // Ease out downwards
      const prog = (t - lowerStart) / (this.emoteDuration - lowerStart);
      const ease = prog * prog;
      y = -0.16 - ease * 0.49;
      z = -0.38 - ease * 0.07;
    }

    // Clapping rhythm (3 slaps)
    // Keep shoulders anchored at leftX = -0.15, rightX = 0.15.
    // Forearms angle and meet at the hands (x = 0) rather than elbows colliding!
    let strike = 0; // 0 = open, 1 = strike contact
    if (t >= raiseDur && t <= lowerStart) {
      const clapTime = t - raiseDur;
      const cycle = 0.5; // 0.5s per clap cycle (3 claps total)
      const phase = (clapTime % cycle) / cycle;

      if (phase < 0.28) {
        // Fast snap inward to clap hands
        const p = phase / 0.28;
        strike = 1 - Math.pow(1 - p, 3);
      } else if (phase < 0.55) {
        // Elastic rebound outward
        const p = (phase - 0.28) / 0.27;
        strike = (1 - p);
      } else {
        strike = 0;
      }

      // Audio trigger on contact
      const clapIndex = Math.floor(clapTime / cycle);
      if (phase >= 0.25 && phase <= 0.35 && !this._soundFlags[`clap_${clapIndex}`]) {
        this._soundFlags[`clap_${clapIndex}`] = true;
        this.audio.playClap();
      }
    }

    // Hand positioning:
    // Shoulders stay anchored at ±0.15; rotations and wrists bring the palms together at center!
    const leftX = THREE.MathUtils.lerp(-0.16, -0.13, strike);
    const rightX = THREE.MathUtils.lerp(0.16, 0.13, strike);
    const rotYLeft = THREE.MathUtils.lerp(0.42, 0.68, strike);
    const rotYRight = THREE.MathUtils.lerp(-0.42, -0.68, strike);
    const rotZLeft = THREE.MathUtils.lerp(0.50, 0.72, strike);
    const rotZRight = THREE.MathUtils.lerp(-0.50, -0.72, strike);

    this.leftArm.position.set(leftX, y, z);
    this.leftArm.rotation.set(0.22, rotYLeft, rotZLeft);
    this.leftWrist.rotation.set(0, THREE.MathUtils.lerp(0.15, 0.3, strike), 0);

    this.rightArm.position.set(rightX, y, z);
    this.rightArm.rotation.set(0.22, rotYRight, rotZRight);
    this.rightWrist.rotation.set(0, THREE.MathUtils.lerp(-0.15, -0.3, strike), 0);
  }

  // ---------------------------------------------------------------------------
  // 2. MIDDLE FINGER ANIMATION
  // ---------------------------------------------------------------------------

  _animateMiddleFinger(t) {
    // Only right arm visible
    this.leftArm.visible = false;
    this.rightArm.visible = true;

    // Curl thumb, index, ring, pinky into a tight solid fist
    const fistCurl = 1.65;
    this._setFingerCurl(this.rightThumb, 1.45);
    this._setFingerCurl(this.rightIndex, fistCurl);
    this._setFingerCurl(this.rightRing, fistCurl);
    this._setFingerCurl(this.rightPinky, fistCurl);

    const raiseEnd = 0.45;
    const flickStart = 0.45;
    const flickEnd = 0.70;
    const lowerStart = 2.2;

    let posX = 0.03;
    let posY = -0.13;
    let posZ = -0.33;
    let rotX = 1.25; // Arm tilted upright so hand/knuckles are directly visible facing player!
    let rotY = -0.15;
    let rotZ = 0.04;
    let middleCurl = fistCurl;

    if (t < raiseEnd) {
      // Raising fist from bottom into viewport
      const p = t / raiseEnd;
      const ease = 1 - Math.pow(1 - p, 2);
      posY = -0.60 + ease * 0.47;
      posZ = -0.42 + ease * 0.09;
      middleCurl = fistCurl;
    } else if (t >= flickStart && t < flickEnd) {
      // Middle finger springs upright with punch recoil!
      const p = (t - flickStart) / (flickEnd - flickStart);
      const snap = 1 - Math.pow(1 - p, 3);

      middleCurl = THREE.MathUtils.lerp(fistCurl, -0.35, snap); // Stands straight up vertically!

      // Upward punch bounce
      posY = -0.13 + Math.sin(p * Math.PI) * 0.05;
      rotX = 1.25 + Math.sin(p * Math.PI) * 0.15;

      if (!this._soundFlags['finger_flick']) {
        this._soundFlags['finger_flick'] = true;
        this.audio.playFlickGesture();
      }
    } else if (t >= flickEnd && t <= lowerStart) {
      // Hold extended proudly with defiant breathing bob
      middleCurl = -0.35;
      const holdTime = t - flickEnd;
      posY = -0.13 + Math.sin(holdTime * 5.0) * 0.006;
      rotX = 1.25 + Math.sin(holdTime * 4.0) * 0.02;
    } else if (t > lowerStart) {
      // Lower hand back down
      const p = (t - lowerStart) / (this.emoteDuration - lowerStart);
      const ease = p * p;
      middleCurl = THREE.MathUtils.lerp(-0.35, 0.4, ease);
      posY = -0.13 - ease * 0.47;
      posZ = -0.33 - ease * 0.09;
    }

    this._setMiddleFingerCurl(middleCurl);

    this.rightArm.position.set(posX, posY, posZ);
    this.rightArm.rotation.set(rotX, rotY, rotZ);
    this.rightWrist.rotation.set(0, 0, 0);
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
  // 4. FIST BUMP ANIMATION
  // ---------------------------------------------------------------------------

  _animateFistBump(t) {
    this.leftArm.visible = true;
    this.rightArm.visible = true;

    const fistCurl = 1.6;
    let fingerCurl = fistCurl;

    const raiseEnd = 0.4;
    const strikeTime = 0.85;
    const burstEnd = 1.4;
    const lowerStart = 2.1;

    let y = -0.15;
    let z = -0.35;
    let leftX = -0.18;
    let rightX = 0.18;

    if (t < raiseEnd) {
      const p = t / raiseEnd;
      const ease = 1 - Math.pow(1 - p, 2);
      y = -0.60 + ease * 0.45;
      z = -0.44 + ease * 0.09;
    } else if (t < strikeTime) {
      // Wind up slightly back, then thrust inward together!
      const p = (t - raiseEnd) / (strikeTime - raiseEnd);
      if (p < 0.4) {
        // Wind up outwards
        const wp = p / 0.4;
        leftX = THREE.MathUtils.lerp(-0.18, -0.22, wp);
        rightX = THREE.MathUtils.lerp(0.18, 0.22, wp);
      } else {
        // Slam fists inward
        const sp = (p - 0.4) / 0.6;
        const slam = 1 - Math.pow(1 - sp, 3);
        leftX = THREE.MathUtils.lerp(-0.22, -0.062, slam);
        rightX = THREE.MathUtils.lerp(0.22, 0.062, slam);
      }

      if (t >= strikeTime - 0.06 && !this._soundFlags['fist_bump']) {
        this._soundFlags['fist_bump'] = true;
        this.audio.playFistBump();
      }
    } else if (t < burstEnd) {
      // Fists recoil and EXPLODE open with splayed fingers!
      const p = (t - strikeTime) / (burstEnd - strikeTime);
      const ease = 1 - Math.pow(1 - p, 2);
      leftX = THREE.MathUtils.lerp(-0.062, -0.20, ease);
      rightX = THREE.MathUtils.lerp(0.062, 0.20, ease);
      fingerCurl = THREE.MathUtils.lerp(fistCurl, -0.2, ease); // Fingers pop wide open!
    } else if (t <= lowerStart) {
      // Hold open hand fireworks pose
      fingerCurl = -0.2;
      leftX = -0.20;
      rightX = 0.20;
      const bob = Math.sin((t - burstEnd) * 6.0) * 0.005;
      y = -0.15 + bob;
    } else {
      // Lower down
      const p = (t - lowerStart) / (this.emoteDuration - lowerStart);
      const ease = p * p;
      leftX = -0.20;
      rightX = 0.20;
      fingerCurl = THREE.MathUtils.lerp(-0.2, 0.3, ease);
      y = -0.15 - ease * 0.45;
      z = -0.35 - ease * 0.09;
    }

    this._setFingerCurl(this.leftThumb, fingerCurl);
    this._setFingerCurl(this.leftIndex, fingerCurl);
    this._setFingerCurl(this.leftMiddle, fingerCurl);
    this._setFingerCurl(this.leftRing, fingerCurl);
    this._setFingerCurl(this.leftPinky, fingerCurl);

    this._setFingerCurl(this.rightThumb, fingerCurl);
    this._setFingerCurl(this.rightIndex, fingerCurl);
    this._setMiddleFingerCurl(fingerCurl);
    this._setFingerCurl(this.rightRing, fingerCurl);
    this._setFingerCurl(this.rightPinky, fingerCurl);

    this.leftArm.position.set(leftX, y, z);
    this.leftArm.rotation.set(0.35, 0.48, 0.38);

    this.rightArm.position.set(rightX, y, z);
    this.rightArm.rotation.set(0.35, -0.48, -0.38);
  }

  // ---------------------------------------------------------------------------
  // 5. JAZZ HANDS ANIMATION
  // ---------------------------------------------------------------------------

  _animateJazzHands(t) {
    this.leftArm.visible = true;
    this.rightArm.visible = true;

    // Fingers spread straight and wide
    this._setFingerCurl(this.leftThumb, -0.15);
    this._setFingerCurl(this.rightThumb, -0.15);

    const raiseEnd = 0.5;
    const lowerStart = 2.4;

    let y = -0.11;
    let z = -0.32;
    let shimmy = 0;
    let fingerWave = 0;

    if (t < raiseEnd) {
      const p = t / raiseEnd;
      const ease = 1 - Math.pow(1 - p, 2);
      y = -0.60 + ease * 0.49;
      z = -0.42 + ease * 0.10;
    } else if (t <= lowerStart) {
      if (!this._soundFlags['jazz_hands']) {
        this._soundFlags['jazz_hands'] = true;
        this.audio.playJazzHands();
      }
      shimmy = Math.sin((t - raiseEnd) * 28.0) * 0.22;
      fingerWave = Math.sin((t - raiseEnd) * 32.0) * 0.15;
      y = -0.11 + Math.sin((t - raiseEnd) * 8.0) * 0.008;
    } else {
      const p = (t - lowerStart) / (this.emoteDuration - lowerStart);
      const ease = p * p;
      y = -0.11 - ease * 0.49;
      z = -0.32 - ease * 0.10;
    }

    const curl = -0.1 + fingerWave;
    this._setFingerCurl(this.leftIndex, curl);
    this._setFingerCurl(this.leftMiddle, curl);
    this._setFingerCurl(this.leftRing, curl);
    this._setFingerCurl(this.leftPinky, curl);

    this._setFingerCurl(this.rightIndex, curl);
    this._setMiddleFingerCurl(curl);
    this._setFingerCurl(this.rightRing, curl);
    this._setFingerCurl(this.rightPinky, curl);

    this.leftArm.position.set(-0.16, y, z);
    this.leftArm.rotation.set(1.18, 0.30, -0.20);
    this.leftWrist.rotation.set(0, 0, shimmy);

    this.rightArm.position.set(0.16, y, z);
    this.rightArm.rotation.set(1.18, -0.30, 0.20);
    this.rightWrist.rotation.set(0, 0, -shimmy);
  }

  // ---------------------------------------------------------------------------
  // 6. NEEDLE INJECTION ANIMATION
  // ---------------------------------------------------------------------------

  _animateNeedle(t) {
    this.leftArm.visible = true;
    this.rightArm.visible = true;
    if (this.syringe) this.syringe.visible = true;

    // Left hand relaxed
    this._setFingerCurl(this.leftThumb, 0.25);
    this._setFingerCurl(this.leftIndex, 0.3);
    this._setFingerCurl(this.leftMiddle, 0.3);
    this._setFingerCurl(this.leftRing, 0.3);
    this._setFingerCurl(this.leftPinky, 0.3);

    // Right hand gripping syringe
    this._setFingerCurl(this.rightThumb, 0.8);
    this._setFingerCurl(this.rightIndex, 1.0);
    this._setMiddleFingerCurl(1.2);
    this._setFingerCurl(this.rightRing, 1.3);
    this._setFingerCurl(this.rightPinky, 1.3);

    let leftY = -0.18;
    let rightY = -0.15;
    let rightX = 0.14;
    let rightZ = -0.36;
    let rightRotX = 0.4;
    let rightRotY = -0.3;
    let rightRotZ = 0.0;

    if (t < 0.7) {
      // Raise arms into view
      const p = t / 0.7;
      const ease = 1 - Math.pow(1 - p, 2);
      leftY = -0.60 + ease * 0.42;
      rightY = -0.60 + ease * 0.45;
    } else if (t < 1.3) {
      // Tap syringe glass twice (flick wrist)
      const tapTime = t - 0.7;
      if (tapTime >= 0.15 && !this._soundFlags['tink_1']) {
        this._soundFlags['tink_1'] = true;
        this.audio.playGlassTink();
      }
      if (tapTime >= 0.40 && !this._soundFlags['tink_2']) {
        this._soundFlags['tink_2'] = true;
        this.audio.playGlassTink();
      }
      const tapPulse = Math.sin(tapTime * Math.PI * 4.0) * 0.015;
      rightY = -0.15 + tapPulse;
    } else if (t < 1.7) {
      // Syringe needle moves to puncture forearm vein
      const p = (t - 1.3) / 0.4;
      const ease = 1 - Math.pow(1 - p, 2);
      rightX = THREE.MathUtils.lerp(0.14, 0.02, ease);
      rightY = THREE.MathUtils.lerp(-0.15, -0.17, ease);
      rightZ = THREE.MathUtils.lerp(-0.36, -0.33, ease);
      rightRotX = THREE.MathUtils.lerp(0.4, 0.65, ease);
      rightRotY = THREE.MathUtils.lerp(-0.3, -0.55, ease);
    } else if (t < 2.9) {
      // Injected into vein! Plunger pushes in, fluid drains, shudder
      rightX = 0.02;
      rightY = -0.17;
      rightZ = -0.33;
      rightRotX = 0.65;
      rightRotY = -0.55;

      const p = (t - 1.7) / 1.2;
      if (!this._soundFlags['inject']) {
        this._soundFlags['inject'] = true;
        this.audio.playSyringeInject();
      }

      // Plunger depresses
      if (this.syringePlunger) {
        this.syringePlunger.position.z = -1.8 * VOXEL * p;
      }
      // Fluid drains
      if (this.syringeFluidMesh) {
        this.syringeFluidMesh.scale.z = Math.max(0.04, 1.0 - p * 0.95);
      }

      // Subdued tense tremor
      leftY = -0.18 + Math.sin(t * 45.0) * 0.002;
    } else if (t < 3.4) {
      // Retract syringe away from arm with a soft sigh of relief
      const p = (t - 2.9) / 0.5;
      const ease = p * p;
      rightX = THREE.MathUtils.lerp(0.02, 0.12, ease);
      rightY = THREE.MathUtils.lerp(-0.17, -0.15, ease);
      rightZ = THREE.MathUtils.lerp(-0.33, -0.38, ease);
      rightRotX = THREE.MathUtils.lerp(0.65, 0.35, ease);
    } else {
      // Lower down
      const p = (t - 3.4) / (this.emoteDuration - 3.4);
      const ease = p * p;
      leftY = -0.18 - ease * 0.42;
      rightY = -0.15 - ease * 0.45;
      rightX = 0.12;
    }

    this.leftArm.position.set(-0.06, leftY, -0.34);
    this.leftArm.rotation.set(0.35, 0.55, -0.25);

    this.rightArm.position.set(rightX, rightY, rightZ);
    this.rightArm.rotation.set(rightRotX, rightRotY, rightRotZ);
  }

  // ---------------------------------------------------------------------------
  // 7. PIRATE HOOK HAND ANIMATION
  // ---------------------------------------------------------------------------

  _animateHookHand(t) {
    this.leftArm.visible = true;
    this.rightArm.visible = true;
    if (this.rightFingersGroup) this.rightFingersGroup.visible = false;
    if (this.rightHook) this.rightHook.visible = true;

    const raiseEnd = 0.6;
    const buffEnd = 1.8;
    const glintEnd = 2.8;
    const lowerStart = 3.0;

    let rightX = 0.08;
    let rightY = -0.13;
    let rightZ = -0.33;
    let rightRotX = 0.95;
    let rightRotY = -0.35;
    let rightRotZ = 0.08;

    let leftX = -0.14;
    let leftY = -0.16;
    let leftZ = -0.35;

    if (t < raiseEnd) {
      const p = t / raiseEnd;
      const ease = 1 - Math.pow(1 - p, 2);
      rightY = -0.60 + ease * 0.47;
      leftY = -0.60 + ease * 0.44;
    } else if (t < buffEnd) {
      // Left arm rubs/buffs the steel hook curve
      const rubProg = (t - raiseEnd) / (buffEnd - raiseEnd);
      const rub = Math.sin(rubProg * Math.PI * 6.0);
      leftX = -0.01 + rub * 0.04;
      leftY = -0.12 + Math.abs(rub) * 0.015;
      leftZ = -0.33;

      rightRotY = -0.35 + rub * 0.08;
    } else if (t < glintEnd) {
      // Left arm lowers; hook turns to catch the light and glints!
      const p = (t - buffEnd) / (glintEnd - buffEnd);
      leftY = -0.16 - p * 0.35;

      const turn = Math.sin(p * Math.PI);
      rightRotY = -0.35 + turn * 0.3;

      if (t >= buffEnd + 0.15 && !this._soundFlags['hook_gleam']) {
        this._soundFlags['hook_gleam'] = true;
        this.audio.playHookGleam();
      }

      if (this.hookGlint) {
        this.hookGlint.visible = true;
        const sparkle = Math.sin(p * Math.PI * 3.0);
        this.hookGlint.scale.setScalar(Math.max(0.1, 1.0 + sparkle * 0.8));
      }
    } else if (t >= lowerStart) {
      if (this.hookGlint) this.hookGlint.visible = false;
      const p = (t - lowerStart) / (this.emoteDuration - lowerStart);
      const ease = p * p;
      rightY = -0.13 - ease * 0.47;
      leftY = -0.51 - ease * 0.2;
    }

    this.leftArm.position.set(leftX, leftY, leftZ);
    this.leftArm.rotation.set(0.4, 0.5, 0.2);

    this.rightArm.position.set(rightX, rightY, rightZ);
    this.rightArm.rotation.set(rightRotX, rightRotY, rightRotZ);
  }

  // ---------------------------------------------------------------------------
  // 8. CARD TRICK ANIMATION
  // ---------------------------------------------------------------------------

  _animateCardTrick(t) {
    this.rightArm.visible = true;

    // Card pinch grip
    this._setFingerCurl(this.rightThumb, 0.4);
    this._setFingerCurl(this.rightIndex, 0.4);
    this._setMiddleFingerCurl(0.6);
    this._setFingerCurl(this.rightRing, 1.2);
    this._setFingerCurl(this.rightPinky, 1.2);

    const raiseEnd = 0.6;
    const flourishEnd = 1.2;
    const vanishTime = 1.35;
    const showHandsEnd = 2.4;
    const reappearTime = 2.55;
    const lowerStart = 3.1;

    let posX = 0.05;
    let posY = -0.14;
    let posZ = -0.33;
    let rotX = 0.85;
    let rotY = -0.25;
    let rotZ = 0.05;

    if (t < raiseEnd) {
      const p = t / raiseEnd;
      const ease = 1 - Math.pow(1 - p, 2);
      posY = -0.60 + ease * 0.46;
      if (this.playingCard) this.playingCard.visible = true;
      this.leftArm.visible = false;
    } else if (t < flourishEnd) {
      // Waving card to show face
      const p = (t - raiseEnd) / (flourishEnd - raiseEnd);
      rotZ = 0.05 + Math.sin(p * Math.PI * 4.0) * 0.15;
    } else if (t < showHandsEnd) {
      // Snap flick! Card vanishes!
      if (!this._soundFlags['snap_vanish']) {
        this._soundFlags['snap_vanish'] = true;
        this.audio.playCardSnap();
      }
      if (this.playingCard) this.playingCard.visible = false;

      // Both hands open, showing palms and backs (card is gone!)
      this.leftArm.visible = true;
      const p = (t - vanishTime) / (showHandsEnd - vanishTime);
      const turnWave = Math.sin(p * Math.PI * 3.0);

      // Open hands
      this._setFingerCurl(this.rightThumb, 0.1);
      this._setFingerCurl(this.rightIndex, 0.1);
      this._setMiddleFingerCurl(0.1);
      this._setFingerCurl(this.rightRing, 0.1);
      this._setFingerCurl(this.rightPinky, 0.1);

      this._setFingerCurl(this.leftThumb, 0.1);
      this._setFingerCurl(this.leftIndex, 0.1);
      this._setMiddleFingerCurl(0.1);
      this._setFingerCurl(this.leftRing, 0.1);
      this._setFingerCurl(this.leftPinky, 0.1);

      posX = 0.12;
      posY = -0.14;
      rotX = 0.95 + turnWave * 0.4;
      rotY = -0.2;

      this.leftArm.position.set(-0.12, -0.14, -0.33);
      this.leftArm.rotation.set(0.95 + turnWave * 0.4, 0.2, 0);
    } else if (t < lowerStart) {
      // Snap again! Card magically reappears in right hand!
      if (!this._soundFlags['snap_appear']) {
        this._soundFlags['snap_appear'] = true;
        this.audio.playCardSnap();
      }
      if (this.playingCard) this.playingCard.visible = true;

      // Left hand retreats down
      this.leftArm.position.set(-0.12, -0.35, -0.33);

      // Right hand holds card up proudly
      posX = 0.05;
      posY = -0.13;
      posZ = -0.32;
      rotX = 0.85;
      rotY = -0.25;
      rotZ = 0.05;

      this._setFingerCurl(this.rightThumb, 0.4);
      this._setFingerCurl(this.rightIndex, 0.4);
      this._setMiddleFingerCurl(0.6);
      this._setFingerCurl(this.rightRing, 1.2);
      this._setFingerCurl(this.rightPinky, 1.2);
    } else {
      // Lower down
      const p = (t - lowerStart) / (this.emoteDuration - lowerStart);
      const ease = p * p;
      posY = -0.13 - ease * 0.47;
      this.leftArm.visible = false;
    }

    this.rightArm.position.set(posX, posY, posZ);
    this.rightArm.rotation.set(rotX, rotY, rotZ);
  }

  // ---------------------------------------------------------------------------
  // 9. RUM SWIG ANIMATION
  // ---------------------------------------------------------------------------

  _animateRumSwig(t) {
    this.leftArm.visible = true;
    this.rightArm.visible = true;
    if (this.rumBottle) this.rumBottle.visible = true;

    // Right hand grips bottle
    this._setFingerCurl(this.rightThumb, 0.9);
    this._setFingerCurl(this.rightIndex, 1.2);
    this._setMiddleFingerCurl(1.3);
    this._setFingerCurl(this.rightRing, 1.3);
    this._setFingerCurl(this.rightPinky, 1.3);

    // Left hand pinches cork
    this._setFingerCurl(this.leftThumb, 0.6);
    this._setFingerCurl(this.leftIndex, 0.8);
    this._setMiddleFingerCurl(1.0);
    this._setFingerCurl(this.leftRing, 1.2);
    this._setFingerCurl(this.leftPinky, 1.2);

    let rightX = 0.08;
    let rightY = -0.16;
    let rightZ = -0.34;
    let rightRotX = 0.35;
    let rightRotY = -0.25;
    let rightRotZ = 0.05;

    let leftX = -0.12;
    let leftY = -0.18;
    let leftZ = -0.34;
    let leftRotX = 0.4;
    let leftRotY = 0.4;
    let leftRotZ = 0.0;

    if (t < 0.6) {
      // Raise bottle and left hand
      const p = t / 0.6;
      const ease = 1 - Math.pow(1 - p, 2);
      rightY = -0.60 + ease * 0.44;
      leftY = -0.60 + ease * 0.42;
    } else if (t < 1.0) {
      // Left hand grasps cork and POP!
      const p = (t - 0.6) / 0.4;
      leftX = THREE.MathUtils.lerp(-0.12, 0.06, p);
      leftY = THREE.MathUtils.lerp(-0.18, -0.06, p);
      leftZ = -0.32;

      if (t >= 0.82 && !this._soundFlags['cork_pop']) {
        this._soundFlags['cork_pop'] = true;
        this.audio.playCorkPop();
        if (this.bottleCork) {
          this.bottleCork.position.z = -7.5 * VOXEL; // cork pops free!
        }
      }
    } else if (t < 1.6) {
      // Cork removed; left hand retreats down, right arm tilts bottle towards mouth
      const p = (t - 1.0) / 0.6;
      const ease = 1 - Math.pow(1 - p, 2);
      leftY = -0.06 - ease * 0.45;
      rightX = THREE.MathUtils.lerp(0.08, 0.04, ease);
      rightY = THREE.MathUtils.lerp(-0.16, -0.11, ease);
      rightZ = THREE.MathUtils.lerp(-0.34, -0.28, ease);
      rightRotX = THREE.MathUtils.lerp(0.35, -0.65, ease);
    } else if (t < 3.2) {
      // DRINKING SWIG!
      const drinkProg = (t - 1.6) / 1.6;
      const gulpBob = Math.sin(drinkProg * Math.PI * 6.0) * 0.008;

      rightX = 0.04;
      rightY = -0.10 + gulpBob;
      rightZ = -0.27;
      rightRotX = -0.85 + Math.sin(drinkProg * Math.PI * 3.0) * 0.15; // tilting higher!
      rightRotY = -0.15;

      if (t >= 1.9 && !this._soundFlags['glug']) {
        this._soundFlags['glug'] = true;
        this.audio.playSwigGlug();
      }
    } else if (t < 4.0) {
      // Bottle lowers, left forearm comes across to wipe mouth with sleeve!
      const p = (t - 3.2) / 0.8;
      const ease = 1 - Math.pow(1 - p, 2);
      rightX = 0.10;
      rightY = THREE.MathUtils.lerp(-0.10, -0.22, ease);
      rightZ = -0.36;
      rightRotX = THREE.MathUtils.lerp(-0.85, 0.3, ease);

      // Left arm wipe
      leftX = THREE.MathUtils.lerp(-0.25, 0.02, Math.sin(p * Math.PI));
      leftY = THREE.MathUtils.lerp(-0.45, -0.11, Math.sin(p * Math.PI));
      leftZ = -0.28;
      leftRotX = 0.6;
      leftRotZ = -0.7;

      if (t >= 3.5 && !this._soundFlags['sigh']) {
        this._soundFlags['sigh'] = true;
        this.audio.playSailorSigh();
      }
    } else {
      // Lower down
      const p = (t - 4.0) / (this.emoteDuration - 4.0);
      const ease = p * p;
      rightY = -0.22 - ease * 0.42;
      leftY = -0.45 - ease * 0.2;
    }

    this.leftArm.position.set(leftX, leftY, leftZ);
    this.leftArm.rotation.set(leftRotX, leftRotY, leftRotZ);

    this.rightArm.position.set(rightX, rightY, rightZ);
    this.rightArm.rotation.set(rightRotX, rightRotY, rightRotZ);
  }

  // ---------------------------------------------------------------------------
  // 10. COIN FLIP ANIMATION
  // ---------------------------------------------------------------------------

  _animateCoinFlip(t) {
    this.rightArm.visible = true;
    this.leftArm.visible = true;
    if (this.goldCoin) this.goldCoin.visible = true;

    let posX = 0.05;
    let posY = -0.16;
    let posZ = -0.34;
    let rotX = 0.45;
    let rotY = -0.2;
    let rotZ = 0.05;

    let coinYOffset = 0;
    let coinSpin = 0;

    const raiseEnd = 0.5;
    const flipTime = 0.55;
    const catchTime = 1.7;
    const showTime = 2.7;
    const lowerStart = 2.9;

    if (t < raiseEnd) {
      const p = t / raiseEnd;
      const ease = 1 - Math.pow(1 - p, 2);
      posY = -0.60 + ease * 0.44;
      this.leftArm.visible = false;

      // Thumb cocked under index finger
      this._setFingerCurl(this.rightThumb, 0.9);
      this._setFingerCurl(this.rightIndex, 1.1);
      this._setMiddleFingerCurl(1.3);
      this._setFingerCurl(this.rightRing, 1.4);
      this._setFingerCurl(this.rightPinky, 1.4);
    } else if (t < catchTime) {
      // Thumb snaps up and launches the doubloon into the sky!
      if (!this._soundFlags['coin_toss']) {
        this._soundFlags['coin_toss'] = true;
        this.audio.playCoinToss();
      }
      this._setFingerCurl(this.rightThumb, -0.2); // thumb flicked up

      const flipProg = (t - flipTime) / (catchTime - flipTime);
      coinYOffset = Math.sin(flipProg * Math.PI) * 0.22; // flies up in air!
      coinSpin = flipProg * Math.PI * 14.0; // spinning rapidly!

      // Left hand rises in preparation to catch
      this.leftArm.visible = true;
      const p = Math.min(1.0, (t - 0.9) / 0.8);
      this.leftArm.position.set(-0.02, -0.60 + p * 0.44, -0.33);
      this.leftArm.rotation.set(0.4, 0.3, 0.2);
    } else if (t < showTime) {
      // Slapped and caught on left palm!
      if (!this._soundFlags['coin_catch']) {
        this._soundFlags['coin_catch'] = true;
        this.audio.playCoinCatch();
      }
      coinYOffset = 0;
      coinSpin = 0;

      // Both hands together presenting the coin
      this.leftArm.visible = true;
      this.leftArm.position.set(0.02, -0.14, -0.33);
      this.leftArm.rotation.set(0.45, 0.1, 0.0);

      // Open palms flat
      this._setFingerCurl(this.leftThumb, 0.05);
      this._setFingerCurl(this.leftIndex, 0.05);
      this._setFingerCurl(this.leftMiddle, 0.05);
      this._setFingerCurl(this.leftRing, 0.05);
      this._setFingerCurl(this.leftPinky, 0.05);

      this._setFingerCurl(this.rightThumb, 0.1);
      this._setFingerCurl(this.rightIndex, 0.1);
      this._setMiddleFingerCurl(0.1);
      this._setFingerCurl(this.rightRing, 0.1);
      this._setFingerCurl(this.rightPinky, 0.1);

      posX = 0.12;
      posY = -0.16;
      rotX = 0.45;
    } else {
      // Lower down
      const p = (t - lowerStart) / (this.emoteDuration - lowerStart);
      const ease = p * p;
      posY = -0.16 - ease * 0.44;
      this.leftArm.position.y = -0.14 - ease * 0.46;
    }

    if (this.goldCoin) {
      this.goldCoin.position.set(0, 0.7 * VOXEL + coinYOffset, -3.2 * VOXEL);
      this.goldCoin.rotation.set(coinSpin, 0, coinSpin * 0.5);
    }

    this.rightArm.position.set(posX, posY, posZ);
    this.rightArm.rotation.set(rotX, rotY, rotZ);
  }

  // ---------------------------------------------------------------------------
  // 11. SPYGLASS LOOKOUT ANIMATION
  // ---------------------------------------------------------------------------

  _animateSpyglass(t) {
    this.rightArm.visible = true;
    this.leftArm.visible = true;
    if (this.spyglass) this.spyglass.visible = true;

    // Right hand grips barrel
    this._setFingerCurl(this.rightThumb, 0.8);
    this._setFingerCurl(this.rightIndex, 1.1);
    this._setMiddleFingerCurl(1.2);
    this._setFingerCurl(this.rightRing, 1.2);
    this._setFingerCurl(this.rightPinky, 1.2);

    // Left hand supports front barrel
    this._setFingerCurl(this.leftThumb, 0.7);
    this._setFingerCurl(this.leftIndex, 1.0);
    this._setMiddleFingerCurl(1.1);
    this._setFingerCurl(this.leftRing, 1.1);
    this._setFingerCurl(this.leftPinky, 1.1);

    let rightX = 0.04;
    let rightY = -0.16;
    let rightZ = -0.34;
    let rightRotX = 0.2;
    let rightRotY = -0.1;
    let rightRotZ = 0.0;

    let leftX = -0.06;
    let leftY = -0.18;
    let leftZ = -0.34;

    let extendRatio = 0.0;

    if (t < 0.6) {
      // Raise spyglass
      const p = t / 0.6;
      const ease = 1 - Math.pow(1 - p, 2);
      rightY = -0.60 + ease * 0.44;
      leftY = -0.60 + ease * 0.42;
      extendRatio = 0.0;
    } else if (t < 1.1) {
      // Telescoping extension chk-chk-chk!
      const p = (t - 0.6) / 0.5;
      extendRatio = 1 - Math.pow(1 - p, 2);

      leftX = THREE.MathUtils.lerp(-0.06, -0.02, p);
      leftZ = THREE.MathUtils.lerp(-0.34, -0.38, p);

      if (t >= 0.75 && !this._soundFlags['spy_extend']) {
        this._soundFlags['spy_extend'] = true;
        this.audio.playSpyglassExtend();
      }
    } else if (t < 1.6) {
      // Bring up to eye level
      extendRatio = 1.0;
      const p = (t - 1.1) / 0.5;
      const ease = 1 - Math.pow(1 - p, 2);
      rightX = THREE.MathUtils.lerp(0.04, 0.015, ease);
      rightY = THREE.MathUtils.lerp(-0.16, -0.04, ease);
      rightZ = THREE.MathUtils.lerp(-0.34, -0.22, ease);
      leftY = THREE.MathUtils.lerp(-0.18, -0.07, ease);
      leftZ = THREE.MathUtils.lerp(-0.38, -0.28, ease);
    } else if (t < 3.2) {
      // Scanning the horizon: panning slowly left to right
      extendRatio = 1.0;
      const scanProg = (t - 1.6) / 1.6;
      const pan = Math.sin(scanProg * Math.PI * 2.0) * 0.22;

      rightX = 0.015;
      rightY = -0.04 + Math.sin(scanProg * Math.PI * 4.0) * 0.004;
      rightZ = -0.22;
      rightRotY = pan;

      leftX = -0.01 + pan * 0.05;
      leftY = -0.07;
      leftZ = -0.28;
    } else if (t < 3.8) {
      // Pull down and collapse sections!
      const p = (t - 3.2) / 0.6;
      extendRatio = Math.max(0, 1.0 - p * 1.5);

      rightY = THREE.MathUtils.lerp(-0.04, -0.18, p);
      rightZ = THREE.MathUtils.lerp(-0.22, -0.34, p);
      rightRotY = 0;

      leftY = THREE.MathUtils.lerp(-0.07, -0.18, p);
      leftZ = THREE.MathUtils.lerp(-0.28, -0.34, p);

      if (t >= 3.45 && !this._soundFlags['spy_collapse']) {
        this._soundFlags['spy_collapse'] = true;
        this.audio.playSpyglassCollapse();
      }
    } else {
      // Lower down
      extendRatio = 0.0;
      const p = (t - 3.8) / (this.emoteDuration - 3.8);
      const ease = p * p;
      rightY = -0.18 - ease * 0.42;
      leftY = -0.18 - ease * 0.42;
    }

    if (this.spyglassTube1) {
      this.spyglassTube1.position.z = -2.6 * VOXEL * extendRatio;
    }
    if (this.spyglassTube2) {
      this.spyglassTube2.position.z = -5.0 * VOXEL * extendRatio;
    }

    this.leftArm.position.set(leftX, leftY, leftZ);
    this.leftArm.rotation.set(0.3, 0.4, 0.1);

    this.rightArm.position.set(rightX, rightY, rightZ);
    this.rightArm.rotation.set(rightRotX, rightRotY, rightRotZ);
  }

  // ---------------------------------------------------------------------------
  // 12. FACEPALM ANIMATION
  // ---------------------------------------------------------------------------

  _animateFacepalm(t) {
    this.rightArm.visible = true;
    this.leftArm.visible = false;

    // Cup fingers slightly
    this._setFingerCurl(this.rightThumb, 0.3);
    this._setFingerCurl(this.rightIndex, 0.4);
    this._setMiddleFingerCurl(0.45);
    this._setFingerCurl(this.rightRing, 0.5);
    this._setFingerCurl(this.rightPinky, 0.5);

    let posX = 0.04;
    let posY = -0.14;
    let posZ = -0.32;
    let rotX = 1.35;
    let rotY = -0.15;
    let rotZ = 0.1;

    const raiseEnd = 0.5;
    const slapTime = 0.52;
    const dragEnd = 2.2;
    const lowerStart = 2.3;

    if (t < raiseEnd) {
      const p = t / raiseEnd;
      const ease = 1 - Math.pow(1 - p, 2);
      posY = -0.60 + ease * 0.54;
      posZ = -0.40 + ease * 0.16;
    } else if (t < dragEnd) {
      // SLAP on face!
      if (!this._soundFlags['facepalm_slap']) {
        this._soundFlags['facepalm_slap'] = true;
        this.audio.playFacepalm();
      }

      const dragP = (t - slapTime) / (dragEnd - slapTime);
      // Hand slowly drags down the face in defeat
      posY = -0.06 - dragP * 0.09;
      posZ = -0.24;

      // Slight head shake in disbelief
      rotZ = 0.1 + Math.sin(dragP * Math.PI * 4.0) * 0.04;

      // Fingers curl tighter as they drag down
      const curl = 0.45 + dragP * 0.5;
      this._setFingerCurl(this.rightIndex, curl);
      this._setMiddleFingerCurl(curl);
      this._setFingerCurl(this.rightRing, curl);
      this._setFingerCurl(this.rightPinky, curl);
    } else {
      // Lower down
      const p = (t - lowerStart) / (this.emoteDuration - lowerStart);
      const ease = p * p;
      posY = -0.15 - ease * 0.45;
      posZ = -0.24 - ease * 0.16;
    }

    this.rightArm.position.set(posX, posY, posZ);
    this.rightArm.rotation.set(rotX, rotY, rotZ);
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

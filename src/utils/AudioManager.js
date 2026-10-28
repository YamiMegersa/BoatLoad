import { on } from '../core/EventBus.js';
import { getAssetUrl } from './paths.js';

/**
 * Procedural synth voices, one per known sound id.
 *
 * Each entry schedules a short Web Audio graph on the shared context and
 * master gain — no asset files needed. Each voice takes (manager, t, params)
 * and must remain short, distinct, and quiet enough to layer.
 */
const SYNTH = Object.freeze({
  qte_success: (a, t) => {
    a._tone({ type: 'sine', from: 660, dur: 0.16, gain: 0.16, at: t });
    a._tone({ type: 'sine', from: 880, dur: 0.24, gain: 0.13, at: t + 0.07 });
  },
  qte_fail:    (a, t) => a._tone({ type: 'sawtooth', from: 220, to: 110, dur: 0.28, gain: 0.15 }),
  qte_tick:    (a, t, p) => a._tone({ type: 'triangle', from: p?.alt ? 540 : 440, dur: 0.06, gain: 0.11 }),
  success:     (a, t) => {
    a._tone({ type: 'triangle', from: 523, dur: 0.12, gain: 0.14, at: t });
    a._tone({ type: 'triangle', from: 659, dur: 0.12, gain: 0.14, at: t + 0.09 });
    a._tone({ type: 'triangle', from: 784, dur: 0.2, gain: 0.14, at: t + 0.18 });
  },
  harpoon:     (a, t) => {
    a._tone({ type: 'square', from: 900, to: 220, dur: 0.12, gain: 0.12 });
    a._noise({ from: 6000, to: 900, dur: 0.16, gain: 0.18 });
  },
  barrel_shot: (a, t) => {
    a._tone({ type: 'square', from: 160, to: 45, dur: 0.3, gain: 0.28 });
    a._noise({ from: 3000, to: 300, dur: 0.26, gain: 0.22 });
  },
  shark_hit:   (a, t) => {
    a._tone({ type: 'sawtooth', from: 300, to: 90, dur: 0.35, gain: 0.2 });
    a._noise({ from: 2000, to: 200, dur: 0.3, gain: 0.2 });
  },
  collision:   (a, t) => {
    a._tone({ type: 'sine', from: 90, to: 35, dur: 0.38, gain: 0.35 });
    a._noise({ from: 1200, to: 150, dur: 0.3, gain: 0.25 });
  },
  bail:        (a, t) => a._noise({ type: 'bandpass', from: 1500, to: 500, dur: 0.2, gain: 0.18 }),
  siren_resist:(a, t) => a._tone({ type: 'sine', from: 680, to: 920, dur: 0.14, gain: 0.1 }),
  anchor_reel: (a, t) => {
    a._tone({ type: 'triangle', from: 880, to: 1200, dur: 0.04, gain: 0.12, at: t });
    a._noise({ type: 'bandpass', from: 3500, to: 1200, dur: 0.05, gain: 0.12, at: t });
  },
  anchor_lock: (a, t) => {
    a._tone({ type: 'square', from: 440, to: 220, dur: 0.12, gain: 0.18, at: t });
    a._tone({ type: 'triangle', from: 1046, dur: 0.25, gain: 0.22, at: t + 0.02 });
    a._noise({ type: 'bandpass', from: 2400, to: 400, dur: 0.18, gain: 0.18, at: t });
  },
  metal_clank: (a, t) => {
    a._tone({ type: 'triangle', from: 1800, to: 1200, dur: 0.18, gain: 0.28, at: t });
    a._tone({ type: 'sine', from: 2400, to: 1600, dur: 0.25, gain: 0.22, at: t + 0.02 });
    a._noise({ type: 'bandpass', from: 4000, to: 1800, dur: 0.12, gain: 0.18, at: t });
  },
  wood_thud: (a, t) => {
    a._tone({ type: 'triangle', from: 140, to: 55, dur: 0.28, gain: 0.32, at: t });
    a._noise({ type: 'bandpass', from: 800, to: 120, dur: 0.22, gain: 0.25, at: t });
  },
  wood_crack: (a, t) => {
    a._noise({ type: 'bandpass', from: 4500, to: 600, dur: 0.16, gain: 0.32, at: t });
    a._tone({ type: 'sawtooth', from: 480, to: 160, dur: 0.18, gain: 0.22, at: t + 0.02 });
  },
  hull_groan: (a, t) => {
    a._tone({ type: 'sawtooth', from: 95, to: 70, dur: 0.75, gain: 0.20, at: t });
    a._tone({ type: 'triangle', from: 110, to: 85, dur: 0.85, gain: 0.18, at: t + 0.08 });
    a._noise({ type: 'bandpass', from: 600, to: 250, dur: 0.65, gain: 0.15, at: t });
  },
  sinking_bell: (a, t) => {
    a._tone({ type: 'sine', from: 587.33, dur: 1.4, gain: 0.30, at: t });
    a._tone({ type: 'sine', from: 1174.66, dur: 1.0, gain: 0.18, at: t });
    a._tone({ type: 'triangle', from: 440, dur: 1.6, gain: 0.22, at: t + 0.03 });
  },
});

/**
 * Compute dynamic acoustic parameters for the beckoning mermaid call based on
 * proximity to the siren and the physical movement of the player's boat.
 *
 * @param {object} params
 * @param {number} [params.intensity=0]      Pull intensity (0..1)
 * @param {number} [params.dist]             Current distance from boat to mermaid
 * @param {number} [params.radius]           Siren attraction/call radius
 * @param {number} [params.boatSpeed=15]     Current boat speed in world units/s
 * @param {number} [params.yawVelocity=0]    Current rotational turn speed (rad/s)
 * @param {number} [params.approachDot=0]    Dot product of boat heading and vector to siren (-1..1)
 * @param {number} [params.ambientVolume=0.8] Ambient audio volume setting (0..1)
 * @param {number} [params.time=0]           Current audio context time (s)
 * @returns {{ proximity: number, gain: number, playbackRate: number, filterFreq: number }}
 */
export function computeMermaidCallParams({
  intensity = 0,
  dist = null,
  radius = null,
  boatSpeed = 15,
  yawVelocity = 0,
  approachDot = 0,
  ambientVolume = 0.8,
  time = 0,
} = {}) {
  // 1. Proximity ratio (0 at outer boundary, 1 right at the mermaid)
  const k = (dist !== null && radius && radius > 0)
    ? Math.max(0, Math.min(1, 1 - dist / radius))
    : Math.max(0, Math.min(1, intensity));

  // 2. Distance-attenuated volume: soft whisper far away, swelling as approached,
  //    plus dynamic volume modulation based on boat movement speed.
  const distanceCurve = 0.04 + 0.96 * Math.pow(k, 1.35);
  const speedRatio = Math.max(0, Math.min(1.5, (boatSpeed ?? 15) / 15.0));
  const motionVolumeMod = 1.0 + (speedRatio - 0.5) * 0.14;
  const gain = Math.max(0, Math.min(1.2, distanceCurve * motionVolumeMod * ambientVolume));

  // 3. Dynamic pitch & speed (playbackRate) driven by boat movement:
  //    - Boat forward speed shifts speed/pitch up when surging, down when slowed
  //    - Approach vector (Doppler): moving toward mermaid raises pitch, fleeing lowers it
  //    - Helm turn rate (yawVelocity): fighting the steering adds hypnotic pitch warble
  //    - Proximity lift: subtle pitch intensification very close to the reef
  const speedDelta = (speedRatio - 0.5) * 0.08;
  const dopplerDelta = Math.max(-1, Math.min(1, approachDot ?? 0)) * 0.045;
  const yawStrain = Math.max(0, Math.min(1, Math.abs(yawVelocity ?? 0) / 2.0));
  const flutterDelta = yawStrain * 0.035 * Math.sin((time ?? 0) * 6.0 * Math.PI);
  const proximityDelta = (k - 0.3) * 0.03;

  const playbackRate = Math.max(
    0.75,
    Math.min(1.35, 1.0 + speedDelta + dopplerDelta + flutterDelta + proximityDelta)
  );

  // 4. Acoustic low-pass filter: muffled across distant water, crystal clear up close
  const filterFreq = 700 + 17300 * Math.pow(k, 1.2);

  return {
    proximity: k,
    gain,
    playbackRate,
    filterFreq,
  };
}

/**
 * AudioManager — Web Audio wrapper with a procedural synth fallback.
 *
 * Sound effects are triggered via EventBus 'playSound' events so callers
 * don't need to import AudioManager directly.
 *
 * Resolution order per sound id:
 *   1. A real file at /src/assets/audio/{id}.mp3 — fetched once and cached.
 *   2. A procedural synth voice from SYNTH — no assets needed.
 *
 * Also owns the dynamic beckoning mermaid call loop: a seamlessly looping
 * Web Audio buffer source ('mermaid_call.mp3') driven by 'sirenPulling'
 * telemetry events, with distance-attenuated volume and dynamic pitch/speed
 * modulation based on boat movement, stopping only when the player escapes.
 */
export class AudioManager {
  constructor() {
    this._ctx    = null;
    this._master = null;
    this._buffers = new Map();  // soundId → AudioBuffer (real files only)
    this._missing = new Set();  // ids whose mp3 fetch failed — go straight to synth
    this._noiseBuf = null;
    this._muted  = false;
    this._masterVolume = 0.8;
    this._sfxVolume = 0.8;
    this._ambientVolume = 0.8;

    // Siren / Mermaid call ambience state
    this._sirenBuffer = null;
    this._sirenBufferLoading = null;
    this._sirenSource = null;
    this._sirenFilter = null;
    this._sirenGain = null;
    this._sirenActive = false;
    this._lastSirenTelemetry = null;
    this._sirenWatchdog = null;
    this._lastSirenPull = 0;

    // Wire EventBus
    on('playSound', ({ sound, ...params }) => this.play(sound, params));
    on('sirenPulling', (d) => this._updateSiren(d));
    on('phaseChanged', () => this._stopSiren());
    on('setAudioVolume', ({ volume }) => this.setMasterVolume(volume));
    on('setAudioMute', ({ muted }) => this.setMuted(muted));
    on('setSfxVolume', ({ volume }) => this.setSfxVolume(volume));
    on('setAmbientVolume', ({ volume }) => this.setAmbientVolume(volume));
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Resume/create the AudioContext. Must be called from a user gesture
   * (pointerdown/keydown) to satisfy browser autoplay policies.
   */
  async unlock() {
    try {
      await this._ensureContext();
      this._preloadSirenBuffer();
    } catch {
      // Audio unsupported — the game must run on silently.
    }
  }

  /**
   * Set master output volume (0.0 to 1.0).
   */
  setMasterVolume(val) {
    this._masterVolume = Math.max(0, Math.min(1, Number(val) || 0));
    if (this._ctx && this._master) {
      this._master.gain.setTargetAtTime(this._muted ? 0 : this._masterVolume, this._ctx.currentTime, 0.02);
    }
  }

  /**
   * Set mute state explicitly.
   */
  setMuted(val) {
    this._muted = Boolean(val);
    if (this._ctx && this._master) {
      this._master.gain.setTargetAtTime(this._muted ? 0 : this._masterVolume, this._ctx.currentTime, 0.02);
    }
    return this._muted;
  }

  /**
   * Set SFX volume (0.0 to 1.0).
   */
  setSfxVolume(val) {
    this._sfxVolume = Math.max(0, Math.min(1, Number(val) || 0));
  }

  /**
   * Set ambient / siren volume (0.0 to 1.0).
   */
  setAmbientVolume(val) {
    this._ambientVolume = Math.max(0, Math.min(1, Number(val) || 0));
  }

  /**
   * Play a named sound effect.
   * @param {string} soundId  e.g. 'collision', 'qte_success', 'harpoon'
   * @param {object} [params] e.g. { alt: true } for alternate-mode ticks
   */
  async play(soundId, params = {}) {
    if (!soundId || this._muted || this._sfxVolume <= 0) return;
    try {
      await this._ensureContext();
      let buffer = this._buffers.get(soundId);
      if (!buffer && !this._missing.has(soundId)) {
        try {
          buffer = await this._loadFile(soundId);
        } catch {
          // Remember the miss so the mp3 is only ever requested once per id.
          this._missing.add(soundId);
        }
      }
      if (buffer) this._playBuffer(buffer);
      else this._playSynth(soundId, params);
    } catch (err) {
      // Audio failures are non-fatal.
      console.warn(`AudioManager: could not play "${soundId}":`, err?.message);
    }
  }

  /** Toggle mute state. Returns the new muted flag. */
  toggleMute() {
    return this.setMuted(!this._muted);
  }

  // -------------------------------------------------------------------------
  // Internal — context, files, playback
  // -------------------------------------------------------------------------

  async _ensureContext() {
    if (!this._ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) throw new Error('Web Audio not supported');
      this._ctx = new Ctx();
      this._master = this._ctx.createGain();
      this._master.gain.value = this._muted ? 0 : this._masterVolume;
      this._master.connect(this._ctx.destination);
    }
    // Resume if suspended (browser auto-suspend policy)
    if (this._ctx.state === 'suspended') {
      await this._ctx.resume();
    }
  }

  async _loadFile(soundId) {
    const url = getAssetUrl(`assets/audio/${soundId}.mp3`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const audioBuffer = await this._ctx.decodeAudioData(arrayBuffer);
    this._buffers.set(soundId, audioBuffer);
    return audioBuffer;
  }

  _playBuffer(buffer) {
    const source = this._ctx.createBufferSource();
    source.buffer = buffer;
    const gainNode = this._ctx.createGain();
    gainNode.gain.value = this._sfxVolume;
    source.connect(gainNode);
    gainNode.connect(this._master);
    source.start();
  }

  _playSynth(soundId, params = {}) {
    const voice = SYNTH[soundId];
    const t = this._ctx.currentTime;
    if (voice) {
      voice(this, t, params);
    } else {
      // Unknown id — a soft neutral blip beats dead air.
      this._tone({ type: 'sine', from: 440, dur: 0.08, gain: 0.08, at: t });
    }
  }

  // -------------------------------------------------------------------------
  // Internal — synth voice primitives
  // -------------------------------------------------------------------------

  /** Simple oscillator blip with exponential decay. */
  _tone({ type = 'sine', from = 440, to = null, dur = 0.2, gain = 0.2, at = 0 }) {
    const ctx = this._ctx;
    const t = at || ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    const effectiveGain = gain * this._sfxVolume;
    g.gain.setValueAtTime(effectiveGain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this._master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** Filtered white-noise burst (splashes, crashes, whooshes). */
  _noise({ type = 'lowpass', from = 4000, to = null, dur = 0.2, gain = 0.2, at = 0 }) {
    const ctx = this._ctx;
    const t = at || ctx.currentTime;
    if (!this._noiseBuf) {
      const len = ctx.sampleRate; // 1 s of white noise
      this._noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(from, t);
    if (to) filter.frequency.exponentialRampToValueAtTime(Math.max(10, to), t + dur);
    const g = ctx.createGain();
    const effectiveGain = gain * this._sfxVolume;
    g.gain.setValueAtTime(effectiveGain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this._master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // -------------------------------------------------------------------------
  // Beckoning Mermaid Call Ambience
  // -------------------------------------------------------------------------

  /**
   * Asynchronously fetch and decode 'mermaid_call.mp3' into this._sirenBuffer.
   */
  async _preloadSirenBuffer() {
    if (this._sirenBuffer) return this._sirenBuffer;
    if (this._buffers.has('mermaid_call')) {
      this._sirenBuffer = this._buffers.get('mermaid_call');
      return this._sirenBuffer;
    }
    if (this._sirenBufferLoading) return this._sirenBufferLoading;
    if (!this._ctx) return null;

    this._sirenBufferLoading = this._loadFile('mermaid_call')
      .then((buf) => {
        this._sirenBuffer = buf;
        this._sirenBufferLoading = null;
        // If the ship is actively inside a siren's call zone when loading finishes, start playback
        if (this._sirenActive && !this._sirenSource && this._lastSirenTelemetry) {
          this._updateSiren(this._lastSirenTelemetry);
        }
        return buf;
      })
      .catch(() => {
        this._sirenBufferLoading = null;
        return null;
      });

    return this._sirenBufferLoading;
  }

  /**
   * Dynamically modulate the looping beckoning mermaid call based on proximity
   * to the siren and the physical movement (speed, heading, turning) of the boat.
   * Continues looping indefinitely while inside the siren's call and stops only
   * when the player manages to escape.
   */
  _updateSiren(telemetry = {}) {
    const {
      intensity = 0,
      audibleIntensity = null,
      dist = null,
      radius = null,
      boatSpeed = 15,
      yawVelocity = 0,
      approachDot = 0,
      escaped = false,
    } = telemetry;

    const effectiveAudible = audibleIntensity !== null ? audibleIntensity : intensity;
    this._lastSirenPull = performance.now();

    if (escaped || effectiveAudible <= 0.005) {
      this._sirenActive = false;
      this._lastSirenTelemetry = null;
      this._stopSiren();
      return;
    }

    this._sirenActive = true;
    this._lastSirenTelemetry = telemetry;

    if (!this._ctx || !this._master) return; // Waiting for user gesture unlock

    if (!this._sirenBuffer) {
      this._preloadSirenBuffer();
      return;
    }

    if (!this._sirenSource) {
      this._startSirenLoop();
    }

    const t = this._ctx.currentTime;
    const params = computeMermaidCallParams({
      intensity: effectiveAudible,
      dist,
      radius,
      boatSpeed,
      yawVelocity,
      approachDot,
      ambientVolume: this._ambientVolume,
      time: t,
    });

    if (this._sirenGain?.gain) {
      this._sirenGain.gain.setTargetAtTime(params.gain, t, 0.12);
    }
    if (this._sirenSource?.playbackRate) {
      this._sirenSource.playbackRate.setTargetAtTime(params.playbackRate, t, 0.1);
    }
    if (this._sirenFilter?.frequency) {
      this._sirenFilter.frequency.setTargetAtTime(params.filterFreq, t, 0.15);
    }
  }

  _startSirenLoop() {
    if (!this._ctx || !this._master || !this._sirenBuffer) return;

    const ctx = this._ctx;
    const t = ctx.currentTime;

    this._sirenGain = ctx.createGain();
    this._sirenGain.gain.value = 0.0001;

    this._sirenFilter = ctx.createBiquadFilter();
    this._sirenFilter.type = 'lowpass';
    this._sirenFilter.frequency.value = 1200;

    this._sirenSource = ctx.createBufferSource();
    this._sirenSource.buffer = this._sirenBuffer;
    this._sirenSource.loop = true; // Never ends until the player escapes!
    this._sirenSource.playbackRate.value = 1.0;

    this._sirenSource.connect(this._sirenFilter);
    this._sirenFilter.connect(this._sirenGain);
    this._sirenGain.connect(this._master);

    this._sirenSource.start(t);

    // Watchdog: stop the call if no sirenPulling telemetry arrives for ~350 ms
    // (escape, sink, pause, or phase exit) — ensures it never gets stuck playing.
    if (this._sirenWatchdog) clearInterval(this._sirenWatchdog);
    this._sirenWatchdog = setInterval(() => {
      if (performance.now() - this._lastSirenPull > 350) this._stopSiren();
    }, 150);
  }

  _stopSiren() {
    this._sirenActive = false;
    this._lastSirenTelemetry = null;

    if (this._sirenWatchdog) {
      clearInterval(this._sirenWatchdog);
      this._sirenWatchdog = null;
    }

    if (!this._sirenSource) return;

    const source = this._sirenSource;
    const filter = this._sirenFilter;
    const gain = this._sirenGain;

    this._sirenSource = null;
    this._sirenFilter = null;
    this._sirenGain = null;

    if (this._ctx && gain?.gain) {
      const t = this._ctx.currentTime;
      gain.gain.setTargetAtTime(0, t, 0.15);
      const stopAt = t + 0.6;
      try { source.stop(stopAt); } catch { /* already stopped */ }
    } else {
      try { source.stop(); } catch { /* already stopped */ }
    }

    setTimeout(() => {
      try { source.disconnect(); } catch { /* noop */ }
      try { filter?.disconnect(); } catch { /* noop */ }
      try { gain?.disconnect(); } catch { /* noop */ }
    }, 800);
  }
}

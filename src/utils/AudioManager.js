import { on, emit } from '../core/EventBus.js';
import { getAssetUrl } from './paths.js';

/**
 * Mapping from logical sound IDs to physical audio asset filenames in
 * `assets/audio/`. Multiple sound IDs can share the same decoded AudioBuffer.
 */
export const SOUND_FILE_MAP = Object.freeze({
  collision:               'wood_knock.mp3',
  wood_knock:              'wood_knock.mp3',
  wood_thud:               'wood_knock.mp3',
  wood_breaking:           'wodden_breaking.mp3',
  wodden_breaking:         'wodden_breaking.mp3',
  wood_crack:              'wodden_breaking.mp3',
  sailing:                 'Sailing.mp3',
  Sailing:                 'Sailing.mp3',
  rough_ocean:             'rough_ocean.mp3',
  whirlpool:               'Sea-storm-wind-308764.mp3',
  sea_storm_wind:          'Sea-storm-wind-308764.mp3',
  'Sea-storm-wind-308764': 'Sea-storm-wind-308764.mp3',
  kraken:                  'kraken.mp3',
});

const PRELOAD_IDS = Object.freeze([
  'wood_knock',
  'wood_breaking',
  'sailing',
  'rough_ocean',
  'whirlpool',
  'kraken',
]);

const WOOD_IMPACT_IDS = new Set([
  'collision',
  'wood_knock',
  'wood_breaking',
  'wodden_breaking',
  'wood_crack',
  'wood_thud',
]);

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
  collision:   (a, t, p) => {
    const dmgNorm = Math.max(0.15, Math.min(1.0, (Number(p?.damage) || 20) / 50));
    const dur = 0.22 + dmgNorm * 0.35;
    a._tone({ type: 'sine', from: 95, to: 35, dur, gain: 0.15 + dmgNorm * 0.25, at: t });
    a._noise({ from: 1200, to: 150, dur: dur * 0.85, gain: 0.12 + dmgNorm * 0.20, at: t });
  },
  wood_knock:  (a, t, p) => {
    const dmgNorm = Math.max(0.15, Math.min(1.0, (Number(p?.damage) || 15) / 50));
    a._tone({ type: 'triangle', from: 150, to: 58, dur: 0.18 + dmgNorm * 0.25, gain: 0.14 + dmgNorm * 0.24, at: t });
    a._noise({ type: 'bandpass', from: 900, to: 160, dur: 0.15 + dmgNorm * 0.20, gain: 0.12 + dmgNorm * 0.20, at: t });
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
  kraken: (a, t) => {
    a._tone({ type: 'sawtooth', from: 115, to: 52, dur: 0.9, gain: 0.24, at: t });
    a._tone({ type: 'triangle', from: 172, to: 68, dur: 0.75, gain: 0.18, at: t + 0.06 });
    a._noise({ type: 'bandpass', from: 700, to: 180, dur: 0.8, gain: 0.18, at: t });
  },
});

/**
 * AudioManager — Level-aware Web Audio engine with real MP3 assets,
 * proportional damage-scaled wood knock/breaking collisions, distance-scaled
 * Kraken audio, and full compatibility with the dynamic MusicManager.
 */
export class AudioManager {
  constructor() {
    this._ctx    = null;
    this._master = null;
    this._buffers = new Map();         // soundId or filename → AudioBuffer
    this._loadingPromises = new Map(); // filename → Promise<AudioBuffer>
    this._missing = new Set();         // filenames/ids whose mp3 fetch failed
    this._noiseBuf = null;
    this._muted  = false;
    this._paused = false;
    this._masterVolume = 0.8;
    this._sfxVolume = 0.8;
    this._ambientVolume = 0.8;
    this._musicVolume = 0.7;

    // Analyzed knock timing metadata for wood_knock.mp3
    this._woodKnockProfile = null;

    // Siren ambience state
    this._sirenOsc = null;
    this._sirenOsc2 = null;
    this._sirenLfo = null;
    this._sirenLfoDepth = null;
    this._sirenGain = null;
    this._sirenWatchdog = null;
    this._lastSirenPull = 0;
    this._currentSirenIntensity = 0;

    // Dynamic sailing soundscape state
    /** @type {Map<string, { source: AudioBufferSourceNode, filter: BiquadFilterNode, gain: GainNode, starting?: boolean }>} */
    this._sailingLoops = new Map();
    this._sailingWatchdog = null;
    this._lastSailingUpdate = 0;
    this._sailingState = {
      active: false,
      isRoughOcean: false,
      hasRoughWinds: false,
      windIntensity: 0,
      speedRatio: 0,
      throttle: 0,
      maneuverIntensity: 0,
      steerInput: 0,
      yawVelocity: 0,
      waveRoughness: 0,
      hasWhirlpools: false,
      whirlpoolIntensity: 0,
      hasKraken: false,
      krakenIntensity: 0,
      krakenProximity: 0,
      krakenState: 'idle',
    };

    // Overlap & ducking coordination timestamps (performance.now() ms)
    this._lastWoodImpactTime = -1000;
    this._lastMetalClankTime = -1000;
    this._lastCollisionDamage = 15;
    this._duckEndTime = 0;
    this._krakenRoarEndTime = 0;
    this._nextAmbientKrakenGrowlTime = 0;

    // Wire EventBus
    on('playSound', ({ sound, ...params }) => this.play(sound, params));
    on('sirenPulling', (d) => this._updateSiren(d));
    on('sailingAudioUpdate', (d) => this._updateSailingAudio(d));
    on('phaseChanged', () => {
      this._stopSiren();
      this._stopAllSailingLoops();
    });
    on('playerSunk', () => {
      this._stopSiren();
      this._stopAllSailingLoops();
    });
    on('gamePaused', ({ paused }) => {
      this._paused = Boolean(paused);
      if (this._paused) {
        this._stopSiren();
        this._stopAllSailingLoops();
      }
    });
    on('krakenFightStarted', () => {
      if (this._sailingState.hasKraken) {
        this.play('kraken', { event: 'fight_start', rate: 0.94, gain: 0.88, filterFreq: 2200 });
      }
    });
    on('krakenRaceStarted', ({ tentacleIdx = 0 } = {}) => {
      if (tentacleIdx > 0 && this._sailingState.hasKraken) {
        this.play('kraken', { event: 'race_start', rate: 1.02 + tentacleIdx * 0.04, gain: 0.80, filterFreq: 2100 });
      }
    });
    on('krakenTentacleCaught', () => {
      if (this._sailingState.hasKraken) {
        this.play('kraken', { event: 'tentacle_caught', rate: 0.84, gain: 0.95, filterFreq: 2500 });
      }
    });
    on('setAudioVolume', ({ volume }) => this.setMasterVolume(volume));
    on('setAudioMute', ({ muted }) => this.setMuted(muted));
    on('setSfxVolume', ({ volume }) => this.setSfxVolume(volume));
    on('setAmbientVolume', ({ volume }) => this.setAmbientVolume(volume));
    on('setMusicVolume', ({ volume }) => this.setMusicVolume(volume));
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Resume/create the AudioContext and preload core sailing audio buffers.
   * Must be called from a user gesture (pointerdown/keydown) to satisfy
   * browser autoplay policies.
   */
  async unlock() {
    try {
      await this._ensureContext();
      this._preloadCoreSounds();
      if (this.music && typeof this.music.unlock === 'function') {
        this.music.unlock();
      }
    } catch {
      // Audio unsupported — the game must run on silently.
    }
  }

  /**
   * Set master output volume (0.0 to 1.0).
   */
  setMasterVolume(val) {
    this._masterVolume = Math.max(0, Math.min(1, Number(val) ?? 0.8));
    if (this._ctx && this._master) {
      this._master.gain.setTargetAtTime(this._muted ? 0 : this._masterVolume, this._ctx.currentTime, 0.02);
    }
    if (this.music && typeof this.music.setMasterVolume === 'function') {
      this.music.setMasterVolume(this._masterVolume);
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
    if (this.music && typeof this.music.setMuted === 'function') {
      this.music.setMuted(this._muted);
    }
    return this._muted;
  }

  /**
   * Set SFX volume (0.0 to 1.0).
   */
  setSfxVolume(val) {
    this._sfxVolume = Math.max(0, Math.min(1, Number(val) ?? 0.8));
  }

  /**
   * Set ambient / siren / sailing volume (0.0 to 1.0) and immediately refresh
   * any active ambient loops.
   */
  setAmbientVolume(val) {
    this._ambientVolume = Math.max(0, Math.min(1, Number(val) ?? 0.8));
    if (this._sailingState.active && this._ctx && this._master && !this._muted) {
      const targets = this.computeSailingLayerTargets(this._sailingState, performance.now());
      for (const [layerId, entry] of this._sailingLoops.entries()) {
        if (targets[layerId] && entry && !entry.starting && entry.gain) {
          entry.gain.gain.setTargetAtTime(Math.max(0, targets[layerId].gain), this._ctx.currentTime, 0.05);
        }
      }
    }
    if (this._sirenGain && this._ctx && this._currentSirenIntensity > 0.01) {
      const k = Math.min(1, this._currentSirenIntensity);
      this._sirenGain.gain.setTargetAtTime((0.02 + 0.09 * k) * this._ambientVolume, this._ctx.currentTime, 0.05);
    }
  }

  /**
   * Set dynamic/ambient music volume (0.0 to 1.0). Compatible with feet-/Music.
   */
  setMusicVolume(val) {
    this._musicVolume = Math.max(0, Math.min(1, Number(val) ?? 0.7));
    if (this.music && typeof this.music.setVolume === 'function') {
      this.music.setVolume(this._musicVolume);
    }
  }

  /**
   * Compute dynamic playbackRate (speed & pitch), proportional loudness (gain),
   * and slice duration (`maxDuration`) for a one-shot sound based on collision
   * damage, boat speed, and maneuvers.
   *
   * @param {string} soundId
   * @param {object} [params]
   */
  computeDynamicOneShotParams(soundId, params = {}) {
    const state = this._sailingState;
    const speedRatio = params.speedRatio ?? state.speedRatio ?? 0;
    const maneuver = params.maneuver ?? state.maneuverIntensity ?? 0;
    const now = performance.now();

    if (soundId === 'metal_clank') {
      this._lastMetalClankTime = now;
    }

    if (WOOD_IMPACT_IDS.has(soundId)) {
      const dtSinceLastWood = now - this._lastWoodImpactTime;
      const dtSinceMetal = now - this._lastMetalClankTime;

      // If copper plating just deflected this hit in the same frame, suppress wooden knock
      if (dtSinceMetal >= 0 && dtSinceMetal < 65 && !params.fromTakeDamage) {
        return { suppress: true, rate: 1, gain: 0, delay: 0, offset: 0, maxDuration: 0.1, filterFreq: null };
      }

      // If PlayerShip.takeDamage already triggered the damage-scaled wood_knock in this frame,
      // absorb the redundant same-frame `collision` event emitted by ObstacleManager/monsters.
      if (dtSinceLastWood >= 0 && dtSinceLastWood < 65 && !params.fromTakeDamage && !params.isSplinterLayer) {
        return { suppress: true, rate: 1, gain: 0, delay: 0, offset: 0, maxDuration: 0.1, filterFreq: null };
      }

      const sourceType = String(params.source || params.type || '').toLowerCase();
      let rawDamage = Number(params.damage);
      if (!Number.isFinite(rawDamage) || rawDamage <= 0) {
        if (sourceType === 'island') rawDamage = 50;
        else if (sourceType === 'kraken_tentacle' || sourceType === 'kraken') rawDamage = 40;
        else if (sourceType === 'barrel') rawDamage = 30;
        else if (sourceType === 'rock' || sourceType === 'siren') rawDamage = 20;
        else if (sourceType === 'shark') rawDamage = 15;
        else if (sourceType === 'wave_small') rawDamage = 5;
        else rawDamage = 15;
      }

      // Kraken tentacle slam or losing multiple hull chunks counts as a heavy blow
      let effectiveDamage = rawDamage;
      if (sourceType === 'kraken_tentacle' || sourceType === 'kraken') {
        effectiveDamage = Math.max(effectiveDamage, 42);
      }
      if ((params.voxelsLost || 0) >= 2) {
        effectiveDamage = Math.max(effectiveDamage, 36);
      }

      if (!params.isSplinterLayer) {
        this._lastWoodImpactTime = now;
        this._lastCollisionDamage = effectiveDamage;
      }

      // Normalized damage severity in [0.08, 1.0] (5 HP = 0.10, 20 HP = 0.40, 50 HP = 1.0)
      const damageNorm = Math.max(0.08, Math.min(1.0, effectiveDamage / 50));

      // 1. LOUDNESS (Gain): strictly proportional to damage taken during the collision
      //    - Gentle collision (5-10 dmg): 0.22 - 0.34
      //    - Medium collision (15-20 dmg): 0.48 - 0.62
      //    - Heavy collision / Kraken / large rock (30-50+ dmg): 0.82 - 1.18
      let gain;
      if (params.isSplinterLayer) {
        gain = 0.32 + Math.pow(damageNorm, 1.1) * 0.62;
      } else {
        gain = 0.14 + Math.pow(damageNorm, 0.92) * 1.02;
      }
      if (params.gain !== undefined) {
        gain = Number(params.gain);
      }
      gain = Math.max(0.10, Math.min(1.25, gain));

      // 2. DURATION (Amount of audio heard):
      //    - Small collision (damage <= 12): only 1 single knock heard (~0.34s - 0.44s)
      //    - Moderate collision (13 - 26): 2 knocks heard (~0.78s - 1.08s)
      //    - Heavy collision (27 - 50+): prolonged multi-knock sequence (~1.45s - 2.65s)
      const profile = this._woodKnockProfile;
      const offset = (!params.isSplinterLayer && profile) ? profile.firstOnsetSec : 0;

      let maxDuration;
      if (params.isSplinterLayer) {
        // Secondary wodden_breaking.mp3 splintering crunch scales from 0.65s to 2.15s
        maxDuration = 0.55 + damageNorm * 1.60;
      } else if (effectiveDamage <= 12) {
        const oneKnockBase = profile?.singleKnockDur ?? 0.36;
        maxDuration = oneKnockBase + (damageNorm * 0.18);
      } else if (effectiveDamage < 28) {
        const twoKnockBase = profile?.doubleKnockDur ?? 0.84;
        const tMid = (effectiveDamage - 12) / 16;
        maxDuration = twoKnockBase + tMid * 0.32;
      } else {
        const tHeavy = Math.min(1.0, (effectiveDamage - 28) / 22);
        maxDuration = 1.48 + tHeavy * 1.22;
      }

      // 3. PITCH & SPEED (`rate` & `filterFreq`):
      const jitter = (Math.random() - 0.5) * 0.08;
      let rate = 0.92 + speedRatio * 0.12 + maneuver * 0.10 + (1.0 - damageNorm) * 0.08 + jitter;
      if (params.isSplinterLayer) {
        rate = 0.88 + (1.0 - damageNorm) * 0.14 + speedRatio * 0.10 + jitter;
      }
      rate = Math.max(0.72, Math.min(1.38, params.rate ?? rate));

      const filterFreq = Math.round(1300 + damageNorm * 2400 + speedRatio * 700);
      const delay = params.delay || 0;

      // Duck ambient loops proportional to hit severity so heavy collisions punch through
      const duckMs = Math.round(180 + damageNorm * 420);
      this._duckEndTime = Math.max(this._duckEndTime, now + duckMs);

      // Should we also layer `wodden_breaking.mp3` splintering on top of `wood_knock.mp3`?
      // Trigger splinter layer when damage is significant (>= 22 HP or voxel chunk lost)
      const shouldLayerSplinter = !params.isSplinterLayer &&
        (effectiveDamage >= 22 || (params.voxelsLost || 0) >= 1 && effectiveDamage >= 18);

      return {
        suppress: false,
        rate,
        gain,
        delay,
        offset,
        maxDuration,
        filterFreq,
        damageNorm,
        effectiveDamage,
        shouldLayerSplinter,
      };
    }

    if (soundId === 'kraken') {
      // Do not play Kraken audio if Kraken is not present in the current level
      if (!state.hasKraken && !params.force) {
        return { suppress: true, rate: 1, gain: 0, delay: 0, offset: 0, maxDuration: 0.1, filterFreq: null };
      }
      const jitter = (Math.random() - 0.5) * 0.08;
      const baseRate = (params.rate ?? 0.94) + speedRatio * 0.06 + maneuver * 0.08 + jitter;
      const rate = Math.max(0.68, Math.min(1.35, baseRate));
      const gain = Math.max(0.08, Math.min(1.15, params.gain ?? 0.75));
      const delay = params.delay || 0;
      const filterFreq = params.filterFreq ?? Math.round(1200 + (state.krakenProximity || 0.5) * 1600 + maneuver * 500);
      this._krakenRoarEndTime = Math.max(this._krakenRoarEndTime, now + 2400);
      if (gain > 0.45) {
        this._duckEndTime = Math.max(this._duckEndTime, now + 450);
      }
      return { suppress: false, rate, gain, delay, offset: 0, maxDuration: params.maxDuration || null, filterFreq };
    }

    const rate = Math.max(0.5, Math.min(2.0, Number(params.rate) || 1.0));
    const gain = Math.max(0.05, Math.min(1.5, Number(params.gain) || 1.0));
    const delay = Math.max(0, Number(params.delay) || 0);
    return {
      suppress: false,
      rate,
      gain,
      delay,
      offset: Number(params.offset) || 0,
      maxDuration: params.maxDuration || null,
      filterFreq: params.filterFreq || null,
    };
  }

  /**
   * Play a named sound effect.
   * @param {string} soundId  e.g. 'collision', 'wood_knock', 'qte_success', 'harpoon', 'kraken'
   * @param {object} [params] e.g. { damage: 20, source: 'rock', speedRatio: 0.8 }
   */
  async play(soundId, params = {}) {
    if (!soundId || this._muted || this._sfxVolume <= 0) return;
    try {
      await this._ensureContext();

      // Primary wood impacts always use `wood_knock.mp3` first, then layer
      // `wodden_breaking.mp3` when a chunk of the ship is knocked off.
      const effectiveId = (WOOD_IMPACT_IDS.has(soundId) && !params.isSplinterLayer)
        ? 'wood_knock'
        : soundId;

      const buffer = await this._getOrLoadBuffer(effectiveId);
      if (buffer) {
        const dyn = this._playBuffer(buffer, effectiveId, params);
        if (dyn && dyn.shouldLayerSplinter) {
          const splinterBuf = await this._getOrLoadBuffer('wood_breaking');
          if (splinterBuf) {
            this._playBuffer(splinterBuf, 'wood_breaking', {
              ...params,
              isSplinterLayer: true,
              damage: dyn.effectiveDamage,
              delay: 0.065,
            });
          }
        }
      } else {
        const dyn = this.computeDynamicOneShotParams(effectiveId, params);
        if (!dyn.suppress) {
          this._playSynth(effectiveId, params);
        }
      }
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
      const Ctx = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
      if (!Ctx) throw new Error('Web Audio not supported');
      this._ctx = new Ctx();
      this._master = this._ctx.createGain();
      this._master.gain.value = this._muted ? 0 : this._masterVolume;
      this._master.connect(this._ctx.destination);
    }
    if (this._ctx.state === 'suspended') {
      await this._ctx.resume();
    }
  }

  _preloadCoreSounds() {
    if (!this._ctx) return;
    for (const id of PRELOAD_IDS) {
      this._getOrLoadBuffer(id).catch(() => {});
    }
  }

  _resolveFileName(soundId) {
    if (SOUND_FILE_MAP[soundId]) return SOUND_FILE_MAP[soundId];
    return soundId.endsWith('.mp3') ? soundId : `${soundId}.mp3`;
  }

  async _getOrLoadBuffer(soundId) {
    if (this._buffers.has(soundId)) return this._buffers.get(soundId);

    const fileName = this._resolveFileName(soundId);
    if (this._buffers.has(fileName)) {
      const buf = this._buffers.get(fileName);
      this._buffers.set(soundId, buf);
      return buf;
    }

    if (this._missing.has(fileName) || this._missing.has(soundId)) {
      return null;
    }

    try {
      const buf = await this._loadFile(soundId, fileName);
      return buf;
    } catch {
      this._missing.add(fileName);
      this._missing.add(soundId);
      return null;
    }
  }

  async _loadFile(soundId, fileName = this._resolveFileName(soundId)) {
    if (this._loadingPromises.has(fileName)) {
      const buf = await this._loadingPromises.get(fileName);
      this._buffers.set(soundId, buf);
      return buf;
    }

    const loadPromise = (async () => {
      const url = getAssetUrl(`assets/audio/${fileName}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await this._ctx.decodeAudioData(arrayBuffer);
      if (fileName === 'wood_knock.mp3' && !this._woodKnockProfile) {
        this._woodKnockProfile = this._analyzeWoodKnockBuffer(audioBuffer);
      }
      this._buffers.set(fileName, audioBuffer);
      this._buffers.set(soundId, audioBuffer);
      return audioBuffer;
    })();

    this._loadingPromises.set(fileName, loadPromise);
    try {
      return await loadPromise;
    } finally {
      this._loadingPromises.delete(fileName);
    }
  }

  /**
   * Scan decoded PCM data of `wood_knock.mp3` to locate the first knock onset
   * and natural inter-knock valleys so light collisions slice cleanly after 1 knock.
   */
  _analyzeWoodKnockBuffer(audioBuffer) {
    try {
      const data = audioBuffer.getChannelData(0);
      const sr = audioBuffer.sampleRate || 24000;
      const winSamples = Math.max(1, Math.floor(sr * 0.015)); // 15ms windows
      const rmsList = [];
      let peakRms = 0;

      for (let i = 0; i + winSamples <= data.length; i += winSamples) {
        let sumSq = 0;
        for (let j = 0; j < winSamples; j++) {
          const s = data[i + j];
          sumSq += s * s;
        }
        const rms = Math.sqrt(sumSq / winSamples);
        if (rms > peakRms) peakRms = rms;
        rmsList.push({ sec: i / sr, rms });
      }

      if (peakRms <= 0.001 || rmsList.length === 0) {
        return { firstOnsetSec: 0, singleKnockDur: 0.36, doubleKnockDur: 0.84 };
      }

      const onsetThreshold = peakRms * 0.14;
      const valleyThreshold = peakRms * 0.08;

      let firstOnsetIdx = 0;
      for (let i = 0; i < rmsList.length; i++) {
        if (rmsList[i].rms >= onsetThreshold) {
          firstOnsetIdx = Math.max(0, i - 1);
          break;
        }
      }
      const firstOnsetSec = rmsList[firstOnsetIdx].sec;

      // Find valleys after peaks to isolate 1st and 2nd knocks
      const valleys = [];
      let inKnock = true;
      for (let i = firstOnsetIdx + 4; i < rmsList.length; i++) {
        const dt = rmsList[i].sec - firstOnsetSec;
        if (inKnock && rmsList[i].rms < valleyThreshold && dt >= 0.22) {
          valleys.push(dt);
          inKnock = false;
        } else if (!inKnock && rmsList[i].rms >= onsetThreshold) {
          inKnock = true;
        }
      }

      const singleKnockDur = valleys[0]
        ? Math.max(0.28, Math.min(0.48, valleys[0] + 0.03))
        : 0.36;
      const doubleKnockDur = valleys[1]
        ? Math.max(0.68, Math.min(1.15, valleys[1] + 0.04))
        : 0.84;

      return { firstOnsetSec, singleKnockDur, doubleKnockDur };
    } catch {
      return { firstOnsetSec: 0, singleKnockDur: 0.36, doubleKnockDur: 0.84 };
    }
  }

  _playBuffer(buffer, soundId = '', params = {}) {
    const ctx = this._ctx;
    const t = ctx.currentTime;
    const dyn = this.computeDynamicOneShotParams(soundId, params);
    if (dyn.suppress) return dyn;

    const startAt = t + (dyn.delay || 0);
    const source = this.ctxSource(ctx, buffer, dyn.rate, startAt);

    const bufferDur = buffer.duration || 2.0;
    const offset = Math.max(0, Math.min(bufferDur * 0.5, dyn.offset || 0));
    const availableDur = Math.max(0.1, (bufferDur - offset) / Math.max(0.5, dyn.rate));
    const playDur = dyn.maxDuration
      ? Math.min(availableDur, dyn.maxDuration)
      : availableDur;

    // Subtle pitch envelope on collision or kraken sounds for organic weight
    if (WOOD_IMPACT_IDS.has(soundId)) {
      const endRate = Math.max(0.58, dyn.rate * 0.94);
      source.playbackRate.exponentialRampToValueAtTime(endRate, startAt + Math.min(playDur, 0.55));
    } else if (soundId === 'kraken') {
      const midRate = Math.min(1.45, dyn.rate * 1.07);
      const endRate = Math.max(0.65, dyn.rate * 0.88);
      const dur = Math.min(2.4, playDur);
      source.playbackRate.linearRampToValueAtTime(midRate, startAt + dur * 0.35);
      source.playbackRate.exponentialRampToValueAtTime(endRate, startAt + dur);
    }

    const gainNode = ctx.createGain();
    const volumeScale = (soundId === 'kraken' && params.event === 'ambient_growl')
      ? (this._ambientVolume * 0.65 + this._sfxVolume * 0.35)
      : this._sfxVolume;
    const effectiveGain = Math.max(0.0001, dyn.gain * volumeScale);
    gainNode.gain.setValueAtTime(effectiveGain, startAt);

    // Smoothly fade out the tail when slicing wood_knock.mp3 to a specific knock count
    if (dyn.maxDuration && playDur < availableDur - 0.02) {
      const fadeOutDur = Math.min(0.09, Math.max(0.035, playDur * 0.18));
      const fadeStart = Math.max(startAt + 0.01, startAt + playDur - fadeOutDur);
      gainNode.gain.setValueAtTime(effectiveGain, fadeStart);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + playDur);
    }

    if (dyn.filterFreq && typeof ctx.createBiquadFilter === 'function') {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(dyn.filterFreq, startAt);
      source.connect(filter);
      filter.connect(gainNode);
    } else {
      source.connect(gainNode);
    }

    gainNode.connect(this._master);

    if (dyn.maxDuration) {
      // source.start(when, offset, duration) takes duration in buffer-time seconds
      const bufferSliceDur = Math.min(bufferDur - offset, (playDur + 0.02) * dyn.rate);
      source.start(startAt, offset, bufferSliceDur);
    } else {
      source.start(startAt, offset);
    }

    // Layer a proportional low-end hull thump on heavier hits (damageNorm > 0.35)
    if (WOOD_IMPACT_IDS.has(soundId) && !params.isSplinterLayer && (dyn.damageNorm || 0) >= 0.35) {
      this._tone({
        type: 'sine',
        from: Math.round(78 * dyn.rate),
        to: 32,
        dur: 0.18 + (dyn.damageNorm || 0.4) * 0.22,
        gain: 0.14 * (dyn.damageNorm || 0.4),
        at: startAt,
      });
    }

    return dyn;
  }

  ctxSource(ctx, buffer, rate, startAt) {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    if (source.playbackRate?.setValueAtTime) {
      source.playbackRate.setValueAtTime(rate, startAt);
    } else if (source.playbackRate) {
      source.playbackRate.value = rate;
    }
    return source;
  }

  _playSynth(soundId, params = {}) {
    const voice = SYNTH[soundId];
    const t = this._ctx.currentTime;
    if (voice) {
      voice(this, t, params);
    } else {
      this._tone({ type: 'sine', from: 440, dur: 0.08, gain: 0.08, at: t });
    }
  }

  // -------------------------------------------------------------------------
  // Dynamic Sailing Soundscape (Level-Gated Tranquil vs Rough, Wind, Kraken)
  // -------------------------------------------------------------------------

  /**
   * Compute target gain, playbackRate (speed & pitch), and filter cutoff for
   * the sailing audio layers based strictly on what is configured in the level:
   *   - Tranquil waters (`!isRoughOcean`): ONLY `sailing` (`Sailing.mp3`) plays;
   *     `rough_ocean` is 0.
   *   - Rough oceans (`isRoughOcean`): ONLY `rough_ocean` (`rough_ocean.mp3`) plays;
   *     `sailing` is 0.
   *   - Rough wind / whirlpool (`Sea-storm-wind-308764.mp3`): ONLY plays when
   *     whirlpools or rough winds exist in the level; when the ocean is rough,
   *     the rough ocean sound slightly overtakes the howling wind sound.
   *   - Kraken (`kraken.mp3`): ONLY active when Kraken is in the level, acting as
   *     a subtle distant background rumble when far away and swelling as the ship
   *     gets closer.
   *
   * @param {object} state
   * @param {number} [nowMs]
   */
  computeSailingLayerTargets(state = this._sailingState, nowMs = performance.now()) {
    if (!state || state.active === false) {
      return {
        sailing:     { gain: 0, rate: 1.0, filterFreq: 1200 },
        rough_ocean: { gain: 0, rate: 1.0, filterFreq: 900 },
        whirlpool:   { gain: 0, rate: 1.0, filterFreq: 800 },
        kraken:      { gain: 0, rate: 1.0, filterFreq: 800 },
      };
    }

    const speedRatio = Math.max(0, Math.min(1.5, Number(state.speedRatio) || 0));
    const maneuver = Math.max(0, Math.min(1.0, Number(state.maneuverIntensity) || 0));
    const steerMag = Math.min(1.0, Math.abs(Number(state.steerInput) || 0));
    const yawRate = Math.min(2.5, Math.abs(Number(state.yawVelocity) || 0));
    const waveRoughness = Math.max(0, Math.min(1.0, Number(state.waveRoughness) || 0));

    // Determine whether this level is configured as Rough Ocean vs Tranquil Waters
    const isRoughOcean = (state.isRoughOcean !== undefined)
      ? Boolean(state.isRoughOcean)
      : (waveRoughness >= 0.55);

    const hasWhirlpools = Boolean(state.hasWhirlpools);
    const whirlpoolIntensity = hasWhirlpools
      ? Math.max(0, Math.min(1.0, Number(state.whirlpoolIntensity) || 0))
      : 0;
    const hasRoughWinds = Boolean(state.hasRoughWinds);
    const windIntensity = hasRoughWinds
      ? Math.max(0, Math.min(1.0, Number(state.windIntensity) || 0))
      : 0;

    const hasKraken = Boolean(state.hasKraken);
    const krakenIntensity = hasKraken
      ? Math.max(0, Math.min(1.0, Number(state.krakenIntensity) || 0))
      : 0;
    const krakenProximity = hasKraken
      ? Math.max(0, Math.min(1.0, Number(state.krakenProximity ?? state.krakenIntensity) || 0))
      : 0;

    // Overlap ducking: dip ambient water loops during collisions or Siren song,
    // and keep overall headroom balanced so ambient/dynamic music (`feet-/Music`) blends cleanly.
    const isCollisionDucking = nowMs < this._duckEndTime;
    const isKrakenRoaring = nowMs < this._krakenRoarEndTime;
    const sirenDuck = 1.0 - Math.min(0.35, this._currentSirenIntensity * 0.35);
    const impactDuck = isCollisionDucking ? 0.65 : 1.0;
    const globalDuck = sirenDuck * impactDuck * this._ambientVolume;

    const tSec = nowMs * 0.001;
    const swellWave = Math.sin(tSec * 1.25) * 0.025;
    const steerAggression = Math.min(1.0, maneuver * 0.75 + steerMag * 0.35 + (yawRate / 1.4) * 0.40);

    // 1. TRANQUIL WATERS vs ROUGH OCEAN (Mutually Exclusive by Level Configuration)
    let sailingGain = 0;
    let sailingRate = 1.0;
    let sailingFilterFreq = 1400;

    let roughGain = 0;
    let roughRate = 1.0;
    let roughFilterFreq = 1100;

    if (!isRoughOcean) {
      // Tranquil waters: ONLY calm sailing noises (`Sailing.mp3`) play; `rough_ocean` is 0.
      const sailingBase = 0.08 + Math.min(1.1, speedRatio) * 0.24 + steerAggression * 0.06;
      sailingGain = sailingBase * globalDuck;
      sailingRate = Math.max(0.80, Math.min(1.28,
        0.86 + speedRatio * 0.22 + steerAggression * 0.10 + swellWave
      ));
      sailingFilterFreq = Math.round(1050 + speedRatio * 1850 + steerAggression * 400);
    } else {
      // Rough ocean level: ONLY rough ocean sounds (`rough_ocean.mp3`) play; calm `sailing` is 0.
      const roughEnergy = Math.min(1.0, 0.45 + waveRoughness * 0.35 + steerAggression * 0.35 + speedRatio * 0.20);
      roughGain = (0.22 + roughEnergy * 0.24) * globalDuck;
      roughRate = Math.max(0.82, Math.min(1.34,
        0.88 + speedRatio * 0.18 + steerAggression * 0.18 + waveRoughness * 0.06 + swellWave
      ));
      roughFilterFreq = Math.round(850 + roughEnergy * 1950 + speedRatio * 450);
    }

    // 2. HOWLING WIND / WHIRLPOOL (`Sea-storm-wind-308764.mp3`)
    // Only audible when whirlpools or rough winds exist in the level.
    // When the ocean is rough, rough ocean sounds slightly overtake the howling wind sound.
    let whirlpoolGain = 0;
    let whirlpoolRate = 0.90;
    let whirlpoolFilterFreq = 700;
    const combinedWind = Math.max(whirlpoolIntensity, windIntensity);

    if ((hasWhirlpools || hasRoughWinds) && combinedWind > 0.01) {
      let rawWindGain = (0.05 + Math.pow(combinedWind, 1.05) * 0.28) * globalDuck;

      if (isRoughOcean) {
        // Ensure rough ocean slightly overtakes the howling wind sound
        if (roughGain < rawWindGain * 1.25) {
          roughGain = Math.min(0.52 * globalDuck, rawWindGain * 1.25);
        }
        rawWindGain = Math.min(rawWindGain, roughGain * 0.76);
      }

      whirlpoolGain = rawWindGain;
      whirlpoolRate = Math.max(0.80, Math.min(1.36,
        0.85 + combinedWind * 0.28 + speedRatio * 0.10 + steerAggression * 0.10 + swellWave
      ));
      whirlpoolFilterFreq = Math.round(550 + combinedWind * 1800 + steerAggression * 350);
    }

    // 3. ANGRY KRAKEN BACKGROUND PRESENCE (`kraken.mp3`)
    // Only active on levels containing a Kraken. Acts as a subtle background danger
    // signal when far away, while intermittent roars scale up as the ship gets closer.
    let krakenGain = 0;
    let krakenRate = 0.88;
    let krakenFilterFreq = 650;
    if (hasKraken && krakenIntensity > 0.005) {
      const roarDuck = isKrakenRoaring ? 0.30 : 1.0;
      const krakenPulse = 0.85 + 0.15 * Math.sin(tSec * 1.6);
      // Keep continuous bed low and atmospheric so intermittent roars stand out clearly
      krakenGain = (0.03 + krakenProximity * 0.13) * krakenPulse * roarDuck * globalDuck;
      krakenRate = Math.max(0.74, Math.min(1.26,
        0.78 + krakenProximity * 0.22 + speedRatio * 0.08 + steerAggression * 0.10
      ));
      krakenFilterFreq = Math.round(500 + krakenProximity * 1400 + steerAggression * 300);
    }

    return {
      sailing:     { gain: sailingGain,   rate: sailingRate,   filterFreq: sailingFilterFreq },
      rough_ocean: { gain: roughGain,     rate: roughRate,     filterFreq: roughFilterFreq },
      whirlpool:   { gain: whirlpoolGain, rate: whirlpoolRate, filterFreq: whirlpoolFilterFreq },
      kraken:      { gain: krakenGain,    rate: krakenRate,    filterFreq: krakenFilterFreq },
    };
  }

  _updateSailingAudio(data = {}) {
    if (data.active === false || this._paused) {
      this._sailingState.active = false;
      this._stopAllSailingLoops();
      return;
    }

    const now = performance.now();
    this._lastSailingUpdate = now;
    this._sailingState = {
      ...this._sailingState,
      ...data,
      active: true,
    };

    if (!this._ctx || !this._master || this._muted) return;

    const targets = this.computeSailingLayerTargets(this._sailingState, now);

    // 1. Calm Sailing vs 2. Rough Ocean (strictly stop the inactive one)
    if (targets.sailing.gain > 0.002) {
      this._applyLoopLayer('sailing', targets.sailing);
    } else {
      this._stopLoopLayer('sailing');
    }

    if (targets.rough_ocean.gain > 0.002) {
      this._applyLoopLayer('rough_ocean', targets.rough_ocean);
    } else {
      this._stopLoopLayer('rough_ocean');
    }

    // 3. Whirlpool / Howling Storm Wind
    if ((this._sailingState.hasWhirlpools || this._sailingState.hasRoughWinds) && targets.whirlpool.gain > 0.002) {
      this._applyLoopLayer('whirlpool', targets.whirlpool);
    } else {
      this._stopLoopLayer('whirlpool');
    }

    // 4. Kraken Background Danger + Distance-Scaled Intermittent Angry Kraken Sounds
    if (this._sailingState.hasKraken && targets.kraken.gain > 0.002) {
      this._applyLoopLayer('kraken', targets.kraken);

      const prox = Math.max(0, Math.min(1, Number(this._sailingState.krakenProximity ?? this._sailingState.krakenIntensity) || 0.2));
      const maneuver = Math.max(0, Math.min(1, Number(this._sailingState.maneuverIntensity) || 0));

      if (this._nextAmbientKrakenGrowlTime === 0) {
        this._nextAmbientKrakenGrowlTime = now + 3500 + Math.random() * 3000;
      } else if (now >= this._nextAmbientKrakenGrowlTime) {
        // Distant: every 9.5 - 13.5s. Close & maneuvering tentacles: every 3.8 - 6.2s.
        const baseInterval = 11000 - prox * 6500 - maneuver * 1200;
        const intervalMs = Math.max(3600, baseInterval) + Math.random() * 2500;
        this._nextAmbientKrakenGrowlTime = now + intervalMs;

        if (now >= this._krakenRoarEndTime) {
          // Distant calls are quiet background signals (0.14 - 0.24);
          // close tentacle maneuvers produce loud, aggressive roars (0.55 - 0.90).
          const growlGain = 0.14 + Math.pow(prox, 1.15) * 0.72 + maneuver * 0.08;
          const growlFilter = Math.round(650 + prox * 2100 + maneuver * 350);
          const growlRate = 0.78 + prox * 0.26 + maneuver * 0.10 + (Math.random() - 0.5) * 0.10;

          this.play('kraken', {
            event: 'ambient_growl',
            rate: growlRate,
            gain: growlGain,
            filterFreq: growlFilter,
          });
        }
      }
    } else {
      this._stopLoopLayer('kraken');
      this._nextAmbientKrakenGrowlTime = 0;
    }

    // Watchdog: cleanly stop sailing loops if sailingAudioUpdate stops arriving
    if (!this._sailingWatchdog) {
      this._sailingWatchdog = setInterval(() => {
        if (performance.now() - this._lastSailingUpdate > 400) {
          this._stopAllSailingLoops();
        }
      }, 200);
    }
  }

  _applyLoopLayer(layerId, { gain, rate, filterFreq }) {
    let entry = this._sailingLoops.get(layerId);
    if (!entry) {
      this._startLoopLayer(layerId, { gain, rate, filterFreq });
      return;
    }
    if (entry.starting || !entry.source) {
      entry.pendingTarget = { gain, rate, filterFreq };
      return;
    }

    const t = this._ctx.currentTime;
    entry.gain.gain.setTargetAtTime(Math.max(0, gain), t, 0.12);
    entry.source.playbackRate.setTargetAtTime(Math.max(0.5, Math.min(2.0, rate)), t, 0.15);
    if (entry.filter && filterFreq) {
      entry.filter.frequency.setTargetAtTime(Math.max(120, Math.min(12000, filterFreq)), t, 0.15);
    }
  }

  async _startLoopLayer(layerId, initialTarget) {
    if (this._sailingLoops.has(layerId)) return;
    const placeholder = { starting: true, pendingTarget: initialTarget };
    this._sailingLoops.set(layerId, placeholder);

    const buffer = await this._getOrLoadBuffer(layerId);
    if (this._sailingLoops.get(layerId) !== placeholder || !this._sailingState.active || !this._ctx || !this._master) {
      this._sailingLoops.delete(layerId);
      return;
    }

    if (!buffer) {
      this._sailingLoops.delete(layerId);
      return;
    }

    const ctx = this._ctx;
    const t = ctx.currentTime;
    const target = placeholder.pendingTarget || initialTarget;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.setValueAtTime(Math.max(0.5, Math.min(2.0, target.rate || 1.0)), t);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(target.filterFreq || 1400, t);

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.setTargetAtTime(Math.max(0, target.gain || 0), t, 0.18);

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this._master);

    const offset = buffer.duration > 1.0 ? (Math.random() * (buffer.duration * 0.7)) : 0;
    source.start(t, offset);

    this._sailingLoops.set(layerId, {
      source,
      filter,
      gain: gainNode,
      starting: false,
    });
  }

  _stopLoopLayer(layerId) {
    const entry = this._sailingLoops.get(layerId);
    if (!entry) return;
    this._sailingLoops.delete(layerId);

    if (!entry.source || !this._ctx) return;
    const t = this._ctx.currentTime;
    try {
      entry.gain.gain.setTargetAtTime(0, t, 0.12);
      entry.source.stop(t + 0.45);
    } catch { /* already stopped */ }
    setTimeout(() => {
      try { entry.gain.disconnect(); } catch { /* noop */ }
    }, 600);
  }

  _stopAllSailingLoops() {
    if (this._sailingWatchdog) {
      clearInterval(this._sailingWatchdog);
      this._sailingWatchdog = null;
    }
    this._sailingState.active = false;
    this._nextAmbientKrakenGrowlTime = 0;
    for (const layerId of Array.from(this._sailingLoops.keys())) {
      this._stopLoopLayer(layerId);
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
  // Siren ambience
  // -------------------------------------------------------------------------

  /**
   * Scale the siren drone with the pull intensity emitted every frame by
   * SirenManager while the song has a hold on the ship.
   */
  _updateSiren({ intensity = 0 } = {}) {
    this._lastSirenPull = performance.now();
    this._currentSirenIntensity = Math.max(0, Math.min(1, Number(intensity) || 0));
    if (intensity <= 0.01) {
      this._stopSiren();
      return;
    }
    if (!this._ctx || !this._master) return; // no gesture yet — stays silent
    if (!this._sirenOsc) this._startSirenLoop();

    const t = this._ctx.currentTime;
    const k = Math.min(1, intensity);
    this._sirenGain.gain.setTargetAtTime((0.02 + 0.09 * k) * this._ambientVolume, t, 0.15);
    this._sirenLfo.frequency.setTargetAtTime(0.7 + 1.8 * k, t, 0.2);
    this._sirenLfoDepth.gain.setTargetAtTime(15 + 45 * k, t, 0.2);
  }

  _startSirenLoop() {
    const ctx = this._ctx;
    const t = ctx.currentTime;

    this._sirenGain = ctx.createGain();
    this._sirenGain.gain.value = 0;
    this._sirenGain.connect(this._master);

    // Detuned saw pair through a vibrato LFO — a haunting two-voice drone.
    this._sirenOsc = ctx.createOscillator();
    this._sirenOsc.type = 'sawtooth';
    this._sirenOsc.frequency.value = 392; // G4
    this._sirenOsc2 = ctx.createOscillator();
    this._sirenOsc2.type = 'sawtooth';
    this._sirenOsc2.frequency.value = 399;

    this._sirenLfo = ctx.createOscillator();
    this._sirenLfo.frequency.value = 1;
    this._sirenLfoDepth = ctx.createGain();
    this._sirenLfoDepth.gain.value = 25;
    this._sirenLfo.connect(this._sirenLfoDepth);
    this._sirenLfoDepth.connect(this._sirenOsc.frequency);
    this._sirenLfoDepth.connect(this._sirenOsc2.frequency);

    this._sirenOsc.connect(this._sirenGain);
    this._sirenOsc2.connect(this._sirenGain);
    this._sirenOsc.start(t);
    this._sirenOsc2.start(t);
    this._sirenLfo.start(t);

    // Watchdog: stop the wail if no sirenPulling arrives for ~300 ms
    // (release, sink, pause, or phase exit) — it can never be left wailing.
    this._sirenWatchdog = setInterval(() => {
      if (performance.now() - this._lastSirenPull > 300) this._stopSiren();
    }, 150);
  }

  _stopSiren() {
    this._currentSirenIntensity = 0;
    if (!this._sirenOsc) return;
    clearInterval(this._sirenWatchdog);
    this._sirenWatchdog = null;

    const gain = this._sirenGain;
    const t = this._ctx.currentTime;
    gain.gain.setTargetAtTime(0, t, 0.12);
    const stopAt = t + 0.5;
    for (const o of [this._sirenOsc, this._sirenOsc2, this._sirenLfo]) {
      try { o.stop(stopAt); } catch { /* already stopped */ }
    }
    setTimeout(() => { try { gain.disconnect(); } catch { /* noop */ } }, 800);

    this._sirenOsc = null;
    this._sirenOsc2 = null;
    this._sirenLfo = null;
    this._sirenLfoDepth = null;
    this._sirenGain = null;
  }
}

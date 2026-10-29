import { on, emit } from '../core/EventBus.js';
import { getAssetUrl } from './paths.js';
import { MusicManager } from './MusicManager.js';
import { VOICE_CLIP_POOLS } from '../config/CustomerScript.js';

/**
 * Auto-discover any syllable/babble .mp3 files placed in `src/assets/audio/voices/`.
 * Files can be placed directly in `src/assets/audio/voices/*.mp3` or inside subfolders.
 * Maps relative key (e.g. "blip1" or "walt/blip1") -> resolved Vite asset URL.
 */
const BUNDLED_VOICE_URLS = (() => {
  try {
    const raw = import.meta.glob('../assets/audio/voices/**/*.mp3', {
      eager: true,
      query: '?url',
      import: 'default'
    });
    const map = new Map();
    for (const [path, url] of Object.entries(raw)) {
      const rel = path
        .replace(/^.*\/assets\/audio\/voices\//, '')
        .replace(/\.mp3$/i, '');
      map.set(rel, url);
    }
    return map;
  } catch {
    return new Map();
  }
})();

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
  crab_snap: (a, t) => {
    a._tone({ type: 'triangle', from: 1750, to: 620, dur: 0.045, gain: 0.22, at: t });
    a._noise({ type: 'bandpass', from: 3600, to: 1400, dur: 0.04, gain: 0.18, at: t });
    a._tone({ type: 'triangle', from: 2100, to: 780, dur: 0.04, gain: 0.20, at: t + 0.055 });
    a._noise({ type: 'bandpass', from: 4200, to: 1600, dur: 0.035, gain: 0.16, at: t + 0.055 });
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

    // Music Manager (dual-channel crossfader)
    this._musicManager = new MusicManager({
      volume: this._musicVolume,
      masterVolume: this._masterVolume,
      muted: this._muted
    });

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

    // NPC Voice / Animalese playback state (Web Audio DSP FX chain + HTML5 Audio fallback)
    this._voiceBuffers = new Map();      // clipKey -> AudioBuffer (with _trimStart, _trimEnd)
    this._voiceLoading = new Map();      // clipKey -> Promise<AudioBuffer|null>
    this._distortionCurves = new Map();  // key -> Float32Array WaveShaper curve
    this._activeVoiceNodes = [];         // active Web Audio source/osc nodes for current syllable
    this._activeVoiceGain = null;        // envelope gain node for current Web Audio syllable
    this._voicePreloaded = false;

    this._voiceDeck = new Audio();
    this._voiceDeck.preload = 'auto';
    this._voicePlaying = false;
    this._voiceClipStartTime = 0;
    this._voiceCurrentSliceMs = 400;
    this._voiceMaxTimer = null;
    this._lastVoiceClipKey = null;
    this._voiceMissing = new Set();

    this._voiceDeck.addEventListener('ended', () => {
      this._clearVoiceTimer();
      this._voicePlaying = false;
    });
    this._voiceDeck.addEventListener('error', () => {
      if (this._lastVoiceClipKey) {
        this._voiceMissing.add(this._lastVoiceClipKey);
      }
      this._clearVoiceTimer();
      this._voicePlaying = false;
    });

    // Wire EventBus
    on('playSound', ({ sound, ...params }) => this.play(sound, params));
    on('playVoiceBlip', (params) => this.playVoiceBlip(params));
    on('stopVoice', () => this.stopVoice());
    on('finishVoiceLine', () => this.finishVoiceLine());
    on('sirenPulling', (d) => this._updateSiren(d));
    on('sailingAudioUpdate', (d) => this._updateSailingAudio(d));
    on('phaseChanged', () => {
      this._stopSiren();
      this._stopAllSailingLoops();
      this.stopVoice();
    });
    on('playerSunk', () => {
      this._stopSiren();
      this._stopAllSailingLoops();
      this.stopVoice();
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
   * Must be called from a user gesture (click/pointerdown/keydown) to satisfy
   * browser autoplay policies.
   */
  async unlock() {
    try {
      await this._ensureContext();
      this._preloadCoreSounds();
      this._musicManager?.unlock();
      if (this.music && typeof this.music.unlock === 'function') {
        this.music.unlock();
      }
      if (this._voicePlaying && this._voiceDeck && this._voiceDeck.paused && this._voiceDeck.src) {
        this._voiceDeck.play().catch(() => {});
      }
    } catch {
      // Audio unsupported — the game must run on silently.
    }
  }

  /**
   * Returns true once the Web Audio context is actively running.
   */
  isUnlocked() {
    return Boolean(this._ctx && this._ctx.state === 'running');
  }

  /**
   * Set master output volume (0.0 to 1.0).
   */
  setMasterVolume(val) {
    this._masterVolume = Math.max(0, Math.min(1, Number(val) ?? 0.8));
    if (this._ctx && this._master) {
      this._master.gain.setTargetAtTime(this._muted ? 0 : this._masterVolume, this._ctx.currentTime, 0.02);
    }
    this._musicManager?.setMasterVolume(this._masterVolume);
    if (this.music && typeof this.music.setMasterVolume === 'function') {
      this.music.setMasterVolume(this._masterVolume);
    }
    this._applyVoiceVolume();
  }

  /**
   * Set mute state explicitly.
   */
  setMuted(val) {
    this._muted = Boolean(val);
    if (this._ctx && this._master) {
      this._master.gain.setTargetAtTime(this._muted ? 0 : this._masterVolume, this._ctx.currentTime, 0.02);
    }
    this._musicManager?.setMuted(this._muted);
    if (this.music && typeof this.music.setMuted === 'function') {
      this.music.setMuted(this._muted);
    }
    this._applyVoiceVolume();
    return this._muted;
  }

  /**
   * Set SFX volume (0.0 to 1.0).
   */
  setSfxVolume(val) {
    this._sfxVolume = Math.max(0, Math.min(1, Number(val) ?? 0.8));
    this._applyVoiceVolume();
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
   * Set music volume (0.0 to 1.0).
   */
  setMusicVolume(val) {
    this._musicVolume = Math.max(0, Math.min(1, Number(val) || 0));
    this._musicManager?.setVolume(this._musicVolume);
  }

  get musicManager() {
    return this._musicManager;
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

  /**
   * Play or chain an Animal Crossing-style voice clip with per-character pitch
   * shifting, random syllable slicing, and a custom Web Audio DSP distortion/FX chain.
   *
   * @param {object} [params]
   * @param {object} [params.voice=null]         Full character voice profile from CustomerScript.js
   * @param {number} [params.pitch=1.0]          Base playbackRate / pitch multiplier for the character
   * @param {number} [params.pitchVariance=0.08] Random +/- pitch jitter
   * @param {number} [params.inflection=0]       Extra pitch offset (e.g. +0.08 on questions/exclamations)
   * @param {number} [params.charCode=0]         Character code of the letter being typed
   * @param {string} [params.category='mumble']  Clip pool category: 'mumble' | 'swear' | 'grunt'
   * @param {boolean} [params.interrupt=false]   If true, allow switching to a reaction clip
   * @param {string[]} [params.clips=null]       Optional explicit list of mumble clip keys
   */
  playVoiceBlip({
    voice = null,
    pitch = 1.0,
    pitchVariance = 0.08,
    inflection = 0,
    charCode = 0,
    category = 'mumble',
    interrupt = false,
    clips = null
  } = {}) {
    if (this._muted || this._sfxVolume <= 0) return;

    // Synthesized Crab Clerk noises (rhythmic pincer clacks + bubbly crustacean chitters)
    if (voice?.synthType === 'crab' || category === 'crab') {
      const basePitch = voice?.pitch ?? pitch;
      const variance = voice?.pitchVariance ?? pitchVariance;
      const randomJitter = (Math.random() * 2 - 1) * variance;
      const rate = Math.max(0.6, Math.min(2.2, basePitch + inflection + randomJitter));
      this._ensureContext().then(() => {
        this._playCrabVoiceBlip(rate, charCode, inflection);
      }).catch(() => {});
      return;
    }

    const now = performance.now();
    const minInterruptMs = Math.min(450, this._voiceCurrentSliceMs * 0.75);
    if (this._voicePlaying) {
      if (!interrupt || (now - this._voiceClipStartTime) < minInterruptMs) {
        return;
      }
    }

    // Select candidate clip keys:
    // - 'swear' and 'grunt' always pull from VOICE_CLIP_POOLS.swear / grunt
    // - 'mumble' uses character-specific `clips` if provided, else VOICE_CLIP_POOLS.mumble
    let candidateKeys;
    if (category === 'swear' && VOICE_CLIP_POOLS.swear?.length) {
      candidateKeys = VOICE_CLIP_POOLS.swear;
    } else if (category === 'grunt' && VOICE_CLIP_POOLS.grunt?.length) {
      candidateKeys = VOICE_CLIP_POOLS.grunt;
    } else if (Array.isArray(clips) && clips.length > 0) {
      candidateKeys = clips.map(c => c.replace(/\.mp3$/i, ''));
    } else if (Array.isArray(voice?.clips) && voice.clips.length > 0) {
      candidateKeys = voice.clips.map(c => c.replace(/\.mp3$/i, ''));
    } else {
      candidateKeys = VOICE_CLIP_POOLS.mumble;
    }

    const basePitch = voice?.pitch ?? pitch;
    const variance = voice?.pitchVariance ?? pitchVariance;
    const randomJitter = (Math.random() * 2 - 1) * variance;
    const playbackRate = Math.max(0.42, Math.min(2.15, basePitch + inflection + randomJitter));

    let pool = candidateKeys.filter(k => !this._voiceMissing.has(k));
    if (pool.length > 1 && this._lastVoiceClipKey) {
      pool = pool.filter(k => k !== this._lastVoiceClipKey);
    }

    if (pool.length > 0) {
      const chosenKey = pool[Math.floor(Math.random() * pool.length)];
      this._lastVoiceClipKey = chosenKey;

      this._ensureContext().catch(() => {});

      const cachedBuffer = this._voiceBuffers.get(chosenKey);
      if (cachedBuffer && this._ctx) {
        this._playVoiceBufferWithFX(cachedBuffer, playbackRate, voice, category);
        return;
      }

      // Decode on first use and immediately play through the Web Audio DSP FX chain
      this._voicePlaying = true;
      this._voiceClipStartTime = performance.now();
      this._loadVoiceClip(chosenKey).then((decodedBuf) => {
        if (decodedBuf && this._ctx) {
          this._playVoiceBufferWithFX(decodedBuf, playbackRate, voice, category);
        } else {
          const url = BUNDLED_VOICE_URLS.get(chosenKey) || encodeURI(getAssetUrl(`assets/audio/voices/${chosenKey}.mp3`));
          this._playVoiceDeck(url, playbackRate, voice, category, charCode);
        }
      }).catch(() => {
        const url = BUNDLED_VOICE_URLS.get(chosenKey) || encodeURI(getAssetUrl(`assets/audio/voices/${chosenKey}.mp3`));
        this._playVoiceDeck(url, playbackRate, voice, category, charCode);
      });
      return;
    }

    // Fallback if all mp3 files were missing
    this._ensureContext().then(() => {
      this._playAnimaleseSynthBlip(playbackRate, charCode);
    }).catch(() => {});
  }

  /**
   * Stop any active voice clip immediately (e.g. when Next is clicked or dialogue closes).
   */
  stopVoice() {
    this._clearVoiceTimer();
    this._voicePlaying = false;

    if (this._ctx && this._activeVoiceGain) {
      const t = this._ctx.currentTime;
      try {
        this._activeVoiceGain.gain.cancelScheduledValues(t);
        this._activeVoiceGain.gain.setTargetAtTime(0.0001, t, 0.015);
      } catch { /* noop */ }
      this._activeVoiceGain = null;
    }
    if (this._activeVoiceNodes.length > 0) {
      const stopAt = this._ctx ? this._ctx.currentTime + 0.05 : 0;
      for (const node of this._activeVoiceNodes) {
        try { node.stop(stopAt); } catch { /* noop */ }
      }
      this._activeVoiceNodes = [];
    }

    if (this._voiceDeck) {
      try {
        this._voiceDeck.pause();
        this._voiceDeck.currentTime = 0;
      } catch { /* noop */ }
    }
  }

  /**
   * Called when typewriter finishes revealing a line: stops the active clip if it
   * has already played for >= minPlayMs, or lets a freshly started clip finish.
   */
  finishVoiceLine() {
    if (!this._voicePlaying) {
      this.stopVoice();
      return;
    }
    const elapsed = performance.now() - this._voiceClipStartTime;
    const minPlayMs = Math.max(420, Math.min(850, this._voiceCurrentSliceMs));
    if (elapsed >= minPlayMs) {
      this.stopVoice();
    } else {
      this._clearVoiceTimer();
      this._voiceMaxTimer = setTimeout(() => {
        this.stopVoice();
      }, minPlayMs - elapsed);
    }
  }

  _clearVoiceTimer() {
    if (this._voiceMaxTimer) {
      clearTimeout(this._voiceMaxTimer);
      this._voiceMaxTimer = null;
    }
  }

  _applyVoiceVolume() {
    if (!this._voiceDeck) return;
    const masterMult = this._muted ? 0 : this._masterVolume;
    this._voiceDeck.volume = Math.max(0, Math.min(1, masterMult * this._sfxVolume));
  }

  /**
   * Build or retrieve a cached WaveShaper distortion curve.
   * Supports smooth overdrive saturation and crunchy staircase quantization ('twitch_wobble').
   */
  _getDistortionCurve(drive = 15, effect = '') {
    const key = `${effect}:${drive}`;
    if (this._distortionCurves.has(key)) {
      return this._distortionCurves.get(key);
    }
    const samples = 8192;
    const curve = new Float32Array(samples);
    const k = Math.max(1, drive);
    const quantSteps = effect === 'twitch_wobble' ? 14 : 0;

    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      // Asymmetrical tube/throat saturation for rich vocal grit
      let y = ((1 + k) * x) / (1 + k * Math.abs(x));
      if (x < 0) y *= 0.88;
      if (quantSteps > 0) {
        y = Math.round(y * quantSteps) / quantSteps;
      }
      curve[i] = Math.max(-1, Math.min(1, y));
    }
    this._distortionCurves.set(key, curve);
    return curve;
  }

  /**
   * Play a decoded voice AudioBuffer through a character-specific Web Audio DSP chain:
   * - Syllable slicing from random active vocal offsets (`sliceDuration`)
   * - Pitch slides (`pitchSlide`) & LFO pitch vibrato/warble (`vibratoHz`, `vibratoCents`)
   * - Dual/Triple Siren voice harmonizer (`sirenHarmonyRatio`, `sirenShimmerRatio`)
   * - WaveShaper vocal distortion/gravel (`drive`, `effect`)
   * - Formant/tone BiquadFilter (`filterType`, `filterFreq`, `filterQ`) & chest bass EQ (`bassBoostDb`)
   * - AM throat growl / purr tremolo (`tremoloHz`, `tremoloDepth`)
   * - Cathedral / Siren slapback echo (`echoDelay`, `echoFeedback`)
   */
  _playVoiceBufferWithFX(buffer, playbackRate = 1.0, voice = null, category = 'mumble') {
    this.stopVoice();

    const ctx = this._ctx;
    const t = ctx.currentTime;
    const trimStart = buffer._trimStart ?? 0;
    const trimEnd = buffer._trimEnd ?? buffer.duration;
    const availSpan = Math.max(0.12, trimEnd - trimStart);

    // Play from `trimStart` so the human vocal articulation is always clean and natural;
    // cap very long recordings (e.g. 5s–16s) at `sliceDuration` so clips still chain nicely.
    const offset = trimStart;
    let realSliceDur;
    if (category === 'swear') {
      realSliceDur = Math.min(1.6, availSpan / playbackRate);
    } else if (category === 'grunt') {
      realSliceDur = Math.min(1.1, availSpan / playbackRate);
    } else {
      const maxPhraseDur = (voice?.sliceDuration ?? 1.2) * (0.9 + Math.random() * 0.25);
      realSliceDur = Math.max(0.25, Math.min(maxPhraseDur, availSpan / playbackRate));
    }

    const bufPlayDur = Math.min(buffer.duration - offset, realSliceDur * playbackRate);
    const activeNodes = [];

    // Mix bus for primary + optional Siren harmony voices
    const voiceBus = ctx.createGain();
    voiceBus.gain.setValueAtTime(1.0, t);

    const createSource = (rateMult = 1.0, gainVal = 1.0) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const rate = Math.max(0.3, Math.min(2.8, playbackRate * rateMult));
      src.playbackRate.setValueAtTime(rate, t);

      if (voice?.pitchSlide && voice.pitchSlide !== 1.0) {
        src.playbackRate.exponentialRampToValueAtTime(
          Math.max(0.3, Math.min(2.8, rate * voice.pitchSlide)),
          t + realSliceDur
        );
      }

      if (voice?.vibratoHz > 0 && voice?.vibratoCents > 0) {
        const vibOsc = ctx.createOscillator();
        const vibGain = ctx.createGain();
        vibOsc.type = voice.effect === 'twitch_wobble' ? 'sawtooth' : 'sine';
        vibOsc.frequency.setValueAtTime(voice.vibratoHz, t);
        vibGain.gain.setValueAtTime(voice.vibratoCents, t);
        vibOsc.connect(vibGain);
        vibGain.connect(src.detune);
        vibOsc.start(t);
        vibOsc.stop(t + realSliceDur + 0.08);
        activeNodes.push(vibOsc);
      }

      const g = ctx.createGain();
      g.gain.setValueAtTime(gainVal, t);
      src.connect(g);
      g.connect(voiceBus);

      src.start(t, offset, bufPlayDur);
      activeNodes.push(src);
      return src;
    };

    const mainSource = createSource(1.0, 1.0);

    // Subtle Siren chorus shimmer (Day 7 Marguerite) — kept gentle so the human voice stays clear
    if (voice?.sirenHarmonyRatio) {
      createSource(voice.sirenHarmonyRatio, 0.22);
    }
    if (voice?.sirenShimmerRatio) {
      createSource(voice.sirenShimmerRatio, 0.25);
    }

    let currentNode = voiceBus;

    // 1. WaveShaper distortion / overdrive
    if (voice?.drive > 0) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = this._getDistortionCurve(voice.drive, voice.effect || '');
      shaper.oversample = '2x';
      currentNode.connect(shaper);
      currentNode = shaper;
    }

    // 2. Primary tone / formant BiquadFilter
    if (voice?.filterType && voice?.filterFreq) {
      const filter = ctx.createBiquadFilter();
      filter.type = voice.filterType;
      filter.frequency.setValueAtTime(voice.filterFreq, t);
      filter.Q.setValueAtTime(voice.filterQ ?? 1.2, t);
      currentNode.connect(filter);
      currentNode = filter;
    }

    // 3. Chest bass boost / cut EQ
    if (voice?.bassBoostDb) {
      const bass = ctx.createBiquadFilter();
      bass.type = 'lowshelf';
      bass.frequency.setValueAtTime(210, t);
      bass.gain.setValueAtTime(voice.bassBoostDb, t);
      currentNode.connect(bass);
      currentNode = bass;
    }

    // 4. Throat growl / sultry purr AM tremolo
    if (voice?.tremoloHz > 0 && voice?.tremoloDepth > 0) {
      const tremNode = ctx.createGain();
      const depth = Math.min(0.85, voice.tremoloDepth);
      tremNode.gain.setValueAtTime(1.0 - depth * 0.5, t);

      const tremOsc = ctx.createOscillator();
      const tremDepthGain = ctx.createGain();
      tremOsc.type = 'sine';
      tremOsc.frequency.setValueAtTime(voice.tremoloHz, t);
      tremDepthGain.gain.setValueAtTime(depth * 0.5, t);

      tremOsc.connect(tremDepthGain);
      tremDepthGain.connect(tremNode.gain);
      tremOsc.start(t);
      tremOsc.stop(t + realSliceDur + 0.08);
      activeNodes.push(tremOsc);

      currentNode.connect(tremNode);
      currentNode = tremNode;
    }

    // 5. Output envelope gain (smooth attack & release so sliced chunks never click)
    const envGain = ctx.createGain();
    const driveComp = voice?.drive > 25 ? 0.68 : (voice?.drive > 10 ? 0.82 : 1.0);
    const peakGain = Math.min(1.2, 0.95 * driveComp * this._sfxVolume);
    const attack = 0.012;
    const release = Math.min(0.045, realSliceDur * 0.28);

    envGain.gain.setValueAtTime(0.001, t);
    envGain.gain.linearRampToValueAtTime(peakGain, t + attack);
    envGain.gain.setValueAtTime(peakGain, Math.max(t + attack, t + realSliceDur - release));
    envGain.gain.exponentialRampToValueAtTime(0.0001, t + realSliceDur + 0.015);

    currentNode.connect(envGain);
    envGain.connect(this._master);

    // 6. Optional subtle room/siren slapback echo
    if (voice?.echoDelay > 0 && voice?.echoFeedback > 0) {
      const delay = ctx.createDelay(0.5);
      delay.delayTime.setValueAtTime(voice.echoDelay, t);
      const fb = ctx.createGain();
      fb.gain.setValueAtTime(Math.min(0.45, voice.echoFeedback), t);
      const wet = ctx.createGain();
      wet.gain.setValueAtTime(voice.echoWet ?? 0.2, t);

      envGain.connect(delay);
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(wet);
      wet.connect(this._master);
    }

    this._activeVoiceNodes = activeNodes;
    this._activeVoiceGain = envGain;
    this._voicePlaying = true;
    this._voiceClipStartTime = performance.now();
    this._voiceCurrentSliceMs = Math.round(realSliceDur * 1000);

    this._voiceMaxTimer = setTimeout(() => {
      if (this._activeVoiceGain === envGain) {
        this._voicePlaying = false;
        this._activeVoiceGain = null;
        this._activeVoiceNodes = [];
      }
    }, this._voiceCurrentSliceMs + 15);

    mainSource.onended = () => {
      if (this._activeVoiceGain === envGain) {
        this._clearVoiceTimer();
        this._voicePlaying = false;
        this._activeVoiceGain = null;
        this._activeVoiceNodes = [];
      }
    };
  }

  _playVoiceDeck(url, playbackRate = 1.0, voice = null, category = 'mumble', charCode = 65) {
    this._clearVoiceTimer();
    const deck = this._voiceDeck;
    if (!deck) return;

    try {
      deck.pause();
    } catch { /* noop */ }

    deck.src = url;
    deck.currentTime = 0;

    // Disable pitch preservation so playbackRate shifts vocal pitch (Animal Crossing style)
    if ('preservesPitch' in deck) deck.preservesPitch = false;
    if ('mozPreservesPitch' in deck) deck.mozPreservesPitch = false;
    if ('webkitPreservesPitch' in deck) deck.webkitPreservesPitch = false;
    deck.playbackRate = Math.max(0.45, Math.min(2.15, playbackRate));

    this._applyVoiceVolume();
    this._voicePlaying = true;
    this._voiceClipStartTime = performance.now();

    const sliceSec = category === 'swear'
      ? 1.25
      : (category === 'grunt' ? 0.8 : (voice?.sliceDuration ?? 0.4) * (0.85 + Math.random() * 0.3));
    this._voiceCurrentSliceMs = Math.round(sliceSec * 1000);

    this._voiceMaxTimer = setTimeout(() => {
      if (this._voicePlaying) {
        try { deck.pause(); } catch { /* noop */ }
        this._voicePlaying = false;
      }
    }, this._voiceCurrentSliceMs);

    const playPromise = deck.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        this._clearVoiceTimer();
        this._voicePlaying = false;
        this._ensureContext().then(() => {
          this._playAnimaleseSynthBlip(playbackRate, charCode);
        }).catch(() => {});
      });
    }
  }

  async _loadVoiceClip(clipKey) {
    if (this._voiceBuffers.has(clipKey)) {
      return this._voiceBuffers.get(clipKey);
    }
    if (this._voiceMissing.has(clipKey)) {
      return null;
    }
    if (this._voiceLoading.has(clipKey)) {
      return this._voiceLoading.get(clipKey);
    }

    const promise = (async () => {
      try {
        await this._ensureContext();
        const url = BUNDLED_VOICE_URLS.get(clipKey) || encodeURI(getAssetUrl(`assets/audio/voices/${clipKey}.mp3`));
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        const audioBuffer = await this._ctx.decodeAudioData(arrayBuffer);

        // Scan PCM samples to trim leading/trailing dead air
        const ch0 = audioBuffer.getChannelData(0);
        const sr = audioBuffer.sampleRate;
        const threshold = 0.015;
        let firstIdx = 0;
        let lastIdx = ch0.length - 1;
        while (firstIdx < ch0.length && Math.abs(ch0[firstIdx]) < threshold) firstIdx++;
        while (lastIdx > firstIdx && Math.abs(ch0[lastIdx]) < threshold) lastIdx--;
        audioBuffer._trimStart = Math.max(0, (firstIdx / sr) - 0.008);
        audioBuffer._trimEnd = Math.min(audioBuffer.duration, (lastIdx / sr) + 0.015);

        this._voiceBuffers.set(clipKey, audioBuffer);
        return audioBuffer;
      } catch {
        this._voiceMissing.add(clipKey);
        return null;
      } finally {
        this._voiceLoading.delete(clipKey);
      }
    })();

    this._voiceLoading.set(clipKey, promise);
    return promise;
  }

  _preloadVoiceBuffers() {
    if (this._voicePreloaded) return;
    this._voicePreloaded = true;
    const allKeys = new Set([
      ...(VOICE_CLIP_POOLS.mumble || []),
      ...(VOICE_CLIP_POOLS.swear || []),
      ...(VOICE_CLIP_POOLS.grunt || []),
      ...BUNDLED_VOICE_URLS.keys()
    ]);
    for (const key of allKeys) {
      this._loadVoiceClip(key).catch(() => {});
    }
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
      this._musicManager?.setContext(this._ctx, this._master);
    }
    // Resume if suspended without blocking indefinitely if called outside a user gesture
    if (this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }
    this._musicManager?.unlock();
    this._preloadVoiceBuffers();
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

  _playAnimaleseSynthBlip(playbackRate = 1.0, charCode = 65) {
    const ctx = this._ctx;
    const t = ctx.currentTime;
    const baseFreq = 210 * playbackRate;
    const dur = 0.068;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(baseFreq * 0.94, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.06, t + dur * 0.65);

    // Bandpass formant filter that shifts vowel color based on the letter
    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    const vowelFreq = 750 + ((charCode * 53) % 950);
    formant.frequency.setValueAtTime(vowelFreq * Math.sqrt(playbackRate), t);
    formant.Q.setValueAtTime(3.2, t);

    const g = ctx.createGain();
    const peak = 0.16 * this._sfxVolume;
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(formant);
    formant.connect(g);
    g.connect(this._master);

    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /**
   * Synthesized Crab Clerk typewriter voice:
   * Combines chitinous pincer clicks/clacks with rapid underwater bubble chitters.
   */
  _playCrabVoiceBlip(playbackRate = 1.15, charCode = 65, inflection = 0) {
    const ctx = this._ctx;
    if (!ctx || !this._master) return;
    const t = ctx.currentTime;

    // 1. Bubbly crustacean chirp (ascending water-bubble pop modulated by letter code)
    const bubbleStart = (440 + ((charCode * 37) % 260)) * playbackRate;
    const bubbleEnd = bubbleStart * (1.75 + inflection * 2.0);
    const bubbleDur = 0.052;

    const bubbleOsc = ctx.createOscillator();
    bubbleOsc.type = 'sine';
    bubbleOsc.frequency.setValueAtTime(bubbleStart, t);
    bubbleOsc.frequency.exponentialRampToValueAtTime(Math.min(3200, bubbleEnd), t + bubbleDur);

    const bubbleGain = ctx.createGain();
    const peak = 0.17 * this._sfxVolume;
    bubbleGain.gain.setValueAtTime(0.001, t);
    bubbleGain.gain.linearRampToValueAtTime(peak, t + 0.008);
    bubbleGain.gain.exponentialRampToValueAtTime(0.0001, t + bubbleDur);

    bubbleOsc.connect(bubbleGain);
    bubbleGain.connect(this._master);
    bubbleOsc.start(t);
    bubbleOsc.stop(t + bubbleDur + 0.01);

    // 2. Crisp chitinous pincer click/clack
    const clackFreq = (1450 + ((charCode * 71) % 650)) * playbackRate;
    this._tone({
      type: 'triangle',
      from: clackFreq,
      to: clackFreq * 0.38,
      dur: 0.028,
      gain: 0.16,
      at: t
    });
    this._noise({
      type: 'bandpass',
      from: 3400,
      to: 1300,
      dur: 0.024,
      gain: 0.13,
      at: t
    });

    // Occasional double-pinch snap on vowels/even letters
    if (charCode % 2 === 0) {
      this._tone({
        type: 'triangle',
        from: clackFreq * 1.18,
        to: clackFreq * 0.45,
        dur: 0.022,
        gain: 0.11,
        at: t + 0.032
      });
    }
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

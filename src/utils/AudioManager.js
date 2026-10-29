import { on } from '../core/EventBus.js';
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
  crab_snap: (a, t) => {
    a._tone({ type: 'triangle', from: 1750, to: 620, dur: 0.045, gain: 0.22, at: t });
    a._noise({ type: 'bandpass', from: 3600, to: 1400, dur: 0.04, gain: 0.18, at: t });
    a._tone({ type: 'triangle', from: 2100, to: 780, dur: 0.04, gain: 0.20, at: t + 0.055 });
    a._noise({ type: 'bandpass', from: 4200, to: 1600, dur: 0.035, gain: 0.16, at: t + 0.055 });
  },
});

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
 * A missing mp3 is remembered in a negative cache and never requested again,
 * so the synth path runs instantly with no request spam and no console noise.
 * Real files dropped into /src/assets/audio/ later automatically win over the
 * synth on the next page load.
 *
 * The AudioContext starts suspended (browser autoplay policy); main.js calls
 * unlock() on the first user gesture. Everything routes through one master
 * GainNode so mute is a single setTargetAtTime.
 *
 * Also owns the siren ambience: a detuned-saw drone driven by the
 * 'sirenPulling { intensity }' events, with a watchdog that stops the wail if
 * updates stop arriving (siren released, phase change, sink, pause).
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
    this._musicVolume = 0.7;

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
    on('phaseChanged', () => {
      this._stopSiren();
      this.stopVoice();
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
   * Resume/create the AudioContext. Must be called from a user gesture
   * (click/pointerup/keydown) to satisfy browser autoplay policies.
   */
  async unlock() {
    try {
      await this._ensureContext();
      this._musicManager?.unlock();
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
    this._masterVolume = Math.max(0, Math.min(1, Number(val) || 0));
    if (this._ctx && this._master) {
      this._master.gain.setTargetAtTime(this._muted ? 0 : this._masterVolume, this._ctx.currentTime, 0.02);
    }
    this._musicManager?.setMasterVolume(this._masterVolume);
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
    this._applyVoiceVolume();
    return this._muted;
  }

  /**
   * Set SFX volume (0.0 to 1.0).
   */
  setSfxVolume(val) {
    this._sfxVolume = Math.max(0, Math.min(1, Number(val) || 0));
    this._applyVoiceVolume();
  }

  /**
   * Set ambient / siren volume (0.0 to 1.0).
   */
  setAmbientVolume(val) {
    this._ambientVolume = Math.max(0, Math.min(1, Number(val) || 0));
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
      const Ctx = window.AudioContext || window.webkitAudioContext;
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
  // Siren ambience
  // -------------------------------------------------------------------------

  /**
   * Scale the siren drone with the pull intensity emitted every frame by
   * SirenManager while the song has a hold on the ship.
   */
  _updateSiren({ intensity = 0 } = {}) {
    this._lastSirenPull = performance.now();
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

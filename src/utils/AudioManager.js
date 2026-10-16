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

    // Siren ambience state
    this._sirenOsc = null;
    this._sirenOsc2 = null;
    this._sirenLfo = null;
    this._sirenLfoDepth = null;
    this._sirenGain = null;
    this._sirenWatchdog = null;
    this._lastSirenPull = 0;

    // Wire EventBus
    on('playSound', ({ sound, ...params }) => this.play(sound, params));
    on('sirenPulling', (d) => this._updateSiren(d));
    on('phaseChanged', () => this._stopSiren());
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
    } catch {
      // Audio unsupported — the game must run on silently.
    }
  }

  /**
   * Play a named sound effect.
   * @param {string} soundId  e.g. 'collision', 'qte_success', 'harpoon'
   * @param {object} [params] e.g. { alt: true } for alternate-mode ticks
   */
  async play(soundId, params = {}) {
    if (!soundId || this._muted) return;
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
    this._muted = !this._muted;
    if (this._ctx && this._master) {
      this._master.gain.setTargetAtTime(this._muted ? 0 : 1, this._ctx.currentTime, 0.02);
    }
    return this._muted;
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
      this._master.gain.value = this._muted ? 0 : 1;
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
    source.connect(this._master);
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
    g.gain.setValueAtTime(gain, t);
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
    g.gain.setValueAtTime(gain, t);
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
    this._sirenGain.gain.setTargetAtTime(0.02 + 0.09 * k, t, 0.15);
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

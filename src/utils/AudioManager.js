import { on } from '../core/EventBus.js';

/**
 * AudioManager — thin Web Audio API wrapper.
 *
 * Sound effects are triggered via EventBus 'playSound' events so callers
 * don't need to import AudioManager directly.
 *
 * Sounds are lazily fetched from /src/assets/audio/*.mp3 on first play.
 * (Audio assets are placeholders — replace paths as files are created.)
 */
export class AudioManager {
  constructor() {
    this._ctx    = null;
    this._buffers = new Map(); // soundId → AudioBuffer
    this._muted  = false;

    // Wire EventBus
    on('playSound', ({ sound }) => this.play(sound));
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Play a named sound effect.
   * @param {string} soundId  e.g. 'collision', 'qte_success', 'repair_hammer'
   */
  async play(soundId) {
    if (this._muted) return;
    try {
      await this._ensureContext();
      const buffer = await this._getBuffer(soundId);
      const source = this._ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this._ctx.destination);
      source.start();
    } catch (err) {
      // Audio failures are non-fatal — silently swallow
      console.warn(`AudioManager: could not play "${soundId}":`, err.message);
    }
  }

  /**
   * Toggle mute state.
   */
  toggleMute() {
    this._muted = !this._muted;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  async _ensureContext() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume if suspended (browser auto-suspend policy)
    if (this._ctx.state === 'suspended') {
      await this._ctx.resume();
    }
  }

  async _getBuffer(soundId) {
    if (this._buffers.has(soundId)) return this._buffers.get(soundId);

    const url = `/src/assets/audio/${soundId}.mp3`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const arrayBuffer = await res.arrayBuffer();
    const audioBuffer = await this._ctx.decodeAudioData(arrayBuffer);
    this._buffers.set(soundId, audioBuffer);
    return audioBuffer;
  }
}

import { getAssetUrl } from './paths.js';
import { on } from '../core/EventBus.js';

/**
 * Curated playlist of looped music tracks.
 * Calm: played in Harbor, Shipyard, Menus, Results, Editor, and peaceful sailing.
 * Sailing: played in intense sailing scenes (Kraken encounters, Storms, Gale winds).
 */
export const MUSIC_TRACKS = Object.freeze({
  calm: [
    'assets/audio/music/calm/1. Silent Harbor (Loop).mp3',
    'assets/audio/music/calm/10. Foggy Shores (Loop).mp3',
    'assets/audio/music/calm/3. Ocean’s Grasp (Loop).mp3',
    'assets/audio/music/calm/4. Drunken Sailors (Loop).mp3',
    'assets/audio/music/calm/5. Blackened Tide (Loop).mp3'
  ],
  sailing: [
    'assets/audio/music/sailing/6. Windward Chase (Loop).mp3',
    'assets/audio/music/sailing/7. Sea Wolves (Loop).mp3',
    'assets/audio/music/sailing/8. Black Flag Rise (Loop).mp3'
  ]
});

/**
 * MusicManager — Resilient Dual-Channel Streaming Music Crossfader.
 *
 * Channel A = Calm
 * Channel B = Sailing (Intense)
 *
 * Uses direct HTML5 Audio volume crossfading with high-frequency interpolation,
 * completely immune to Web Audio MediaElementSource CORS/silencing bugs while
 * perfectly respecting master volume, mute, ducking, and browser autoplay policies.
 */
export class MusicManager {
  /**
   * @param {object} [options]
   * @param {number} [options.volume=0.7] - Initial music volume (0.0 to 1.0)
   * @param {number} [options.masterVolume=0.8] - Master volume (0.0 to 1.0)
   * @param {boolean} [options.muted=false] - Initial mute flag
   */
  constructor(options = {}) {
    this._volume = options.volume !== undefined ? options.volume : 0.7;
    this._masterVolume = options.masterVolume !== undefined ? options.masterVolume : 0.8;
    this._muted = Boolean(options.muted);
    this._isDucked = false;
    this._duckFactor = 0.4;

    // Track playlists
    this._calmIndex = 0;
    this._sailingIndex = 0;
    this._targetState = 'silent'; // 'silent' | 'calm' | 'sailing'

    // Gains (0.0 to 1.0)
    this._calmGain = 0;
    this._sailingGain = 0;

    // Crossfade animation
    this._fadeInterval = null;

    // Channel A: Calm
    this._audioCalm = new Audio();
    this._audioCalm.loop = true;
    this._audioCalm.preload = 'auto';
    this._loadTrack(this._audioCalm, 'calm', this._calmIndex);

    // Channel B: Sailing
    this._audioSailing = new Audio();
    this._audioSailing.loop = true;
    this._audioSailing.preload = 'auto';
    this._loadTrack(this._audioSailing, 'sailing', this._sailingIndex);

    // Apply initial silent volume
    this._applyVolumes();

    // Loop fallback in case loop property is interrupted
    this._audioCalm.addEventListener('ended', () => this._onTrackEnded('calm'));
    this._audioSailing.addEventListener('ended', () => this._onTrackEnded('sailing'));

    // EventBus bindings
    on('setMusicState', ({ state, fade, nextTrack }) => {
      this.setState(state, { fade, nextTrack });
    });

    on('setMusicVolume', ({ volume }) => {
      this.setVolume(volume);
    });

    on('setAudioVolume', ({ volume }) => {
      this.setMasterVolume(volume);
    });

    on('setAudioMute', ({ muted }) => {
      this.setMuted(muted);
    });

    on('uiMount', (d) => {
      if (d?.screen === 'pause') this.duck(true);
    });

    on('uiUnmount', (d) => {
      if (d?.screen === 'pause') this.duck(false);
    });

    on('voyageLost', () => {
      this.setState('silent', { fade: 2.5 });
    });

    on('krakenFightStarted', () => {
      this.setState('sailing', { fade: 1.5 });
    });

    on('krakenDefeated', () => {
      this.setState('calm', { fade: 3.0 });
    });

    on('editorSetStormy', ({ isStormy }) => {
      this.setState(isStormy ? 'sailing' : 'calm', { fade: 2.0 });
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Called by AudioManager during audio unlock (on first user gesture).
   */
  unlock() {
    if (this._targetState === 'calm') {
      this._safePlay(this._audioCalm);
    } else if (this._targetState === 'sailing') {
      this._safePlay(this._audioSailing);
    }
  }

  /**
   * Compatibility method for AudioManager context initialization.
   */
  setContext(ctx, masterNode) {
    // Retained for API compatibility; volume is applied via HTMLAudioElement directly
    this.unlock();
  }

  /**
   * Transition to a new music state ('calm' | 'sailing' | 'silent').
   * @param {'calm'|'sailing'|'silent'} targetState
   * @param {object} [opts]
   * @param {number} [opts.fade=2.0] - Fade duration in seconds
   * @param {boolean} [opts.nextTrack=false] - Force advancing to the next track
   */
  setState(targetState, opts = {}) {
    const fadeDuration = opts.fade !== undefined ? opts.fade : 2.0;
    const forceNext = Boolean(opts.nextTrack);

    // If already in target state and not forcing next track, ensure audio is playing and return
    if (this._targetState === targetState && !forceNext) {
      if (targetState === 'calm' && this._audioCalm.paused) {
        this._safePlay(this._audioCalm);
      } else if (targetState === 'sailing' && this._audioSailing.paused) {
        this._safePlay(this._audioSailing);
      }
      return;
    }

    this._targetState = targetState;

    if (targetState === 'calm') {
      if (forceNext) {
        this._calmIndex = (this._calmIndex + 1) % MUSIC_TRACKS.calm.length;
        this._loadTrack(this._audioCalm, 'calm', this._calmIndex);
      }
      this._safePlay(this._audioCalm);
      this._startCrossfade(1.0, 0.0, fadeDuration, () => {
        if (this._targetState === 'calm') {
          this._audioSailing.pause();
        }
      });
    } else if (targetState === 'sailing') {
      if (forceNext) {
        this._sailingIndex = (this._sailingIndex + 1) % MUSIC_TRACKS.sailing.length;
        this._loadTrack(this._audioSailing, 'sailing', this._sailingIndex);
      }
      this._safePlay(this._audioSailing);
      this._startCrossfade(0.0, 1.0, fadeDuration, () => {
        if (this._targetState === 'sailing') {
          this._audioCalm.pause();
        }
      });
    } else {
      // Silent
      this._startCrossfade(0.0, 0.0, fadeDuration, () => {
        if (this._targetState === 'silent') {
          this._audioCalm.pause();
          this._audioSailing.pause();
        }
      });
    }
  }

  /**
   * Set music channel volume (0.0 to 1.0).
   */
  setVolume(val) {
    this._volume = Math.max(0, Math.min(1, Number(val) || 0));
    this._applyVolumes();
  }

  /**
   * Set master volume (0.0 to 1.0).
   */
  setMasterVolume(val) {
    this._masterVolume = Math.max(0, Math.min(1, Number(val) || 0));
    this._applyVolumes();
  }

  /**
   * Set mute state.
   */
  setMuted(val) {
    this._muted = Boolean(val);
    this._applyVolumes();
  }

  /**
   * Duck music volume (e.g. while Pause Menu is active).
   */
  duck(ducked, factor = 0.4) {
    this._isDucked = Boolean(ducked);
    this._duckFactor = factor;
    this._applyVolumes();
  }

  /**
   * Resume playback of current target channel.
   */
  resume() {
    if (this._targetState === 'calm') {
      this._safePlay(this._audioCalm);
    } else if (this._targetState === 'sailing') {
      this._safePlay(this._audioSailing);
    }
  }

  /**
   * Pause all playback.
   */
  pause() {
    this._audioCalm.pause();
    this._audioSailing.pause();
  }

  // ---------------------------------------------------------------------------
  // Crossfader Animation & Volume Application
  // ---------------------------------------------------------------------------

  _startCrossfade(targetCalm, targetSailing, durationSec, onComplete) {
    if (this._fadeInterval) {
      clearInterval(this._fadeInterval);
      this._fadeInterval = null;
    }

    const startCalm = this._calmGain;
    const startSailing = this._sailingGain;
    const durationMs = Math.max(100, durationSec * 1000);
    const startTime = performance.now();

    this._fadeInterval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(1.0, elapsed / durationMs);

      // Smooth cubic ease in-out curve
      const ease = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      this._calmGain = startCalm + (targetCalm - startCalm) * ease;
      this._sailingGain = startSailing + (targetSailing - startSailing) * ease;
      this._applyVolumes();

      if (progress >= 1.0) {
        clearInterval(this._fadeInterval);
        this._fadeInterval = null;
        this._calmGain = targetCalm;
        this._sailingGain = targetSailing;
        this._applyVolumes();
        if (typeof onComplete === 'function') onComplete();
      }
    }, 25); // 40 updates per second for perfectly smooth crossfading
  }

  _applyVolumes() {
    const masterMult = this._muted ? 0 : this._masterVolume;
    const duckMult = this._isDucked ? this._duckFactor : 1.0;
    const effectiveBase = masterMult * this._volume * duckMult;

    const calmVol = Math.max(0, Math.min(1, effectiveBase * this._calmGain));
    const sailingVol = Math.max(0, Math.min(1, effectiveBase * this._sailingGain));

    this._audioCalm.volume = calmVol;
    this._audioSailing.volume = sailingVol;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  _loadTrack(audioEl, category, index) {
    const list = MUSIC_TRACKS[category] || [];
    if (!list.length) return;

    const trackPath = list[index % list.length];
    if (audioEl._currentTrackPath === trackPath && audioEl.src) {
      return;
    }

    audioEl._currentTrackPath = trackPath;
    const resolvedUrl = encodeURI(getAssetUrl(trackPath));
    audioEl.src = resolvedUrl;
    audioEl.load();
  }

  _safePlay(audioEl) {
    if (!audioEl.src) return;
    const playPromise = audioEl.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Autoplay policy prevented playback; will automatically start on user interaction
      });
    }
  }

  _onTrackEnded(category) {
    if (category === 'calm') {
      this._calmIndex = (this._calmIndex + 1) % MUSIC_TRACKS.calm.length;
      this._loadTrack(this._audioCalm, 'calm', this._calmIndex);
      this._safePlay(this._audioCalm);
    } else {
      this._sailingIndex = (this._sailingIndex + 1) % MUSIC_TRACKS.sailing.length;
      this._loadTrack(this._audioSailing, 'sailing', this._sailingIndex);
      this._safePlay(this._audioSailing);
    }
  }
}

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
 * MusicManager — Dual-Deck Streaming Crossfader with Auto-Fadeout and Auto-Fadein.
 *
 * Utilizes two alternating audio decks (Deck A & Deck B) to achieve:
 * - Equal-power crossfading between Calm and Sailing music states.
 * - Automatic 4-second fadeout/fadein transitions when songs reach their end.
 * - Smooth fade-in on initial startup / un-mute / phase transitions.
 * - Completely immune to Web Audio CORS/silencing bugs while respecting
 *   master volume, mute, ducking, and browser autoplay policies.
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

    // Track playlists - randomize initial track selection on startup
    const calmTracks = MUSIC_TRACKS.calm || [];
    const sailingTracks = MUSIC_TRACKS.sailing || [];
    this._calmIndex = calmTracks.length ? Math.floor(Math.random() * calmTracks.length) : 0;
    this._sailingIndex = sailingTracks.length ? Math.floor(Math.random() * sailingTracks.length) : 0;

    this._targetState = 'silent'; // 'silent' | 'calm' | 'sailing'
    this._currentCategory = 'calm';

    // Dual-deck system: Deck A and Deck B
    this._deckA = new Audio();
    this._deckB = new Audio();
    this._deckA.preload = 'auto';
    this._deckB.preload = 'auto';

    // Deck references
    this._activeDeck = this._deckA;
    this._idleDeck = this._deckB;

    // Gains (0.0 to 1.0)
    this._activeGain = 0;
    this._idleGain = 0;

    // Crossfade state
    this._fadeInterval = null;
    this._isTransitioning = false;

    // Setup track end & progress monitoring for seamless crossfading
    this._setupDeckListeners(this._deckA);
    this._setupDeckListeners(this._deckB);

    // Initial load on active deck
    this._loadTrack(this._activeDeck, 'calm', this._calmIndex);
    this._applyVolumes();

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

    on('nextMusicTrack', () => {
      this.nextTrack();
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
      this.setState('sailing', { fade: 2.0 });
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
    if (this._targetState === 'silent') return;
    if (this._activeDeck && this._activeDeck.paused && this._activeDeck.src) {
      this._safePlay(this._activeDeck);
    }
  }

  /**
   * Compatibility method for AudioManager context initialization.
   */
  setContext(ctx, masterNode) {
    this.unlock();
  }

  /**
   * Transition to a new music state ('calm' | 'sailing' | 'silent').
   * @param {'calm'|'sailing'|'silent'} targetState
   * @param {object} [opts]
   * @param {number} [opts.fade=2.5] - Fade duration in seconds
   * @param {boolean} [opts.nextTrack=false] - Force advancing to the next track
   */
  setState(targetState, opts = {}) {
    const fadeDuration = opts.fade !== undefined ? opts.fade : 2.5;
    const forceNext = Boolean(opts.nextTrack);

    // If requesting silence:
    if (targetState === 'silent') {
      this._targetState = 'silent';
      this._fadeOutAll(fadeDuration);
      return;
    }

    const isStateChange = (this._targetState !== targetState);
    const wasSilent = (this._targetState === 'silent');
    this._targetState = targetState;

    // If already in this state and not forcing next track:
    if (!isStateChange && !forceNext && !wasSilent) {
      if (this._activeDeck.paused) {
        this._safePlay(this._activeDeck);
      }
      if (this._activeGain < 1.0 && !this._isTransitioning) {
        this._fadeInActive(fadeDuration);
      }
      return;
    }

    // Determine target track index
    let trackIndex;
    if (targetState === 'sailing') {
      if (forceNext || isStateChange) {
        const len = MUSIC_TRACKS.sailing.length;
        if (len > 1) {
          let next = Math.floor(Math.random() * (len - 1));
          if (next >= this._sailingIndex) next += 1;
          this._sailingIndex = next;
        }
      }
      trackIndex = this._sailingIndex;
    } else {
      if (forceNext) {
        const len = MUSIC_TRACKS.calm.length;
        if (len > 1) {
          let next = Math.floor(Math.random() * (len - 1));
          if (next >= this._calmIndex) next += 1;
          this._calmIndex = next;
        }
      }
      trackIndex = this._calmIndex;
    }

    // If starting from silence or no active track yet:
    if (wasSilent || !this._activeDeck.src) {
      this._currentCategory = targetState;
      this._loadTrack(this._activeDeck, targetState, trackIndex);
      this._activeGain = 0;
      this._idleGain = 0;
      this._applyVolumes();
      this._safePlay(this._activeDeck);
      this._fadeInActive(fadeDuration);
      return;
    }

    // Transitioning from active track to a new track via equal-power crossfade
    this._transitionToTrack(targetState, trackIndex, fadeDuration);
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
   * Resume playback of current active deck.
   */
  resume() {
    if (this._targetState === 'silent') return;
    if (this._activeDeck.paused && this._activeDeck.src) {
      this._safePlay(this._activeDeck);
    }
  }

  /**
   * Pause all playback.
   */
  pause() {
    this._activeDeck.pause();
    this._idleDeck.pause();
  }

  /**
   * Advance to the next random track in the current playlist with a smooth crossfade.
   */
  nextTrack() {
    this._advanceToNextTrack(this._targetState, 3.0);
  }

  // ---------------------------------------------------------------------------
  // Deck Crossfading & Volume Management
  // ---------------------------------------------------------------------------

  _setupDeckListeners(deck) {
    // Check when song is within 4 seconds of end to begin smooth crossfade to next song
    deck.addEventListener('timeupdate', () => {
      if (deck !== this._activeDeck || this._isTransitioning) return;
      if (this._targetState === 'silent') return;

      const dur = deck.duration;
      const cur = deck.currentTime;
      if (!dur || isNaN(dur) || !isFinite(dur)) return;

      const remaining = dur - cur;
      const FADE_WINDOW = 4.0; // 4 seconds smooth crossfade before song ends

      if (remaining > 0 && remaining <= FADE_WINDOW && cur > 10) {
        this._advanceToNextTrack(this._targetState, FADE_WINDOW);
      }
    });

    // Fallback if track reaches end before timeupdate triggered
    deck.addEventListener('ended', () => {
      if (deck !== this._activeDeck || this._isTransitioning) return;
      if (this._targetState === 'silent') return;
      this._advanceToNextTrack(this._targetState, 2.5);
    });

    deck.addEventListener('error', (e) => {
      console.warn('MusicManager: Deck playback error:', deck._currentTrackPath, e);
      if (deck === this._activeDeck && !this._isTransitioning) {
        setTimeout(() => this._advanceToNextTrack(this._targetState, 1.5), 1000);
      }
    });
  }

  _advanceToNextTrack(category, fadeDuration = 3.5) {
    if (this._isTransitioning) return;
    const cat = (category === 'sailing') ? 'sailing' : 'calm';
    const list = MUSIC_TRACKS[cat] || [];
    if (!list.length) return;

    // Pick a random track different from current
    let nextIndex = 0;
    const currentIndex = (cat === 'sailing') ? this._sailingIndex : this._calmIndex;
    if (list.length > 1) {
      let r = Math.floor(Math.random() * (list.length - 1));
      if (r >= currentIndex) r += 1;
      nextIndex = r;
    }

    if (cat === 'sailing') {
      this._sailingIndex = nextIndex;
    } else {
      this._calmIndex = nextIndex;
    }

    this._transitionToTrack(cat, nextIndex, fadeDuration);
  }

  _transitionToTrack(category, index, fadeDuration = 2.5, onComplete) {
    this._currentCategory = category;

    // 1. Prepare incoming deck (the idle deck)
    this._loadTrack(this._idleDeck, category, index);
    this._idleDeck.currentTime = 0;
    this._idleGain = 0;
    this._applyVolumes();
    this._safePlay(this._idleDeck);

    // 2. Perform equal-power crossfade from active to idle
    this._crossfadeActiveToIdle(fadeDuration, onComplete);
  }

  _crossfadeActiveToIdle(durationSec = 2.5, onComplete) {
    if (this._fadeInterval) {
      clearInterval(this._fadeInterval);
      this._fadeInterval = null;
    }

    const startActive = this._activeGain;
    const startIdle = this._idleGain;
    const durationMs = Math.max(200, durationSec * 1000);
    const startTime = performance.now();
    this._isTransitioning = true;

    this._fadeInterval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(1.0, elapsed / durationMs);

      // Equal-power crossfade curve: cos(t * PI/2) and sin(t * PI/2)
      // Eliminates perceived acoustic volume drops during transitions
      const fadeOut = Math.cos(progress * Math.PI * 0.5);
      const fadeIn = Math.sin(progress * Math.PI * 0.5);

      this._activeGain = startActive * fadeOut;
      this._idleGain = startIdle + (1.0 - startIdle) * fadeIn;
      this._applyVolumes();

      if (progress >= 1.0) {
        clearInterval(this._fadeInterval);
        this._fadeInterval = null;
        this._isTransitioning = false;

        this._activeGain = 0;
        this._idleGain = 1.0;
        this._applyVolumes();

        // Pause the old deck and clean up
        this._activeDeck.pause();
        this._activeDeck.currentTime = 0;

        // Swap decks!
        const prevActive = this._activeDeck;
        this._activeDeck = this._idleDeck;
        this._idleDeck = prevActive;

        // Reset gains for swapped roles
        this._activeGain = 1.0;
        this._idleGain = 0.0;
        this._applyVolumes();

        if (typeof onComplete === 'function') onComplete();
      }
    }, 25);
  }

  _fadeInActive(durationSec = 2.0, onComplete) {
    if (this._fadeInterval) {
      clearInterval(this._fadeInterval);
      this._fadeInterval = null;
    }

    const startGain = this._activeGain;
    const durationMs = Math.max(200, durationSec * 1000);
    const startTime = performance.now();
    this._isTransitioning = true;

    this._fadeInterval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(1.0, elapsed / durationMs);

      const fadeIn = Math.sin(progress * Math.PI * 0.5);

      this._activeGain = startGain + (1.0 - startGain) * fadeIn;
      this._idleGain = 0;
      this._applyVolumes();

      if (progress >= 1.0) {
        clearInterval(this._fadeInterval);
        this._fadeInterval = null;
        this._isTransitioning = false;
        this._activeGain = 1.0;
        this._applyVolumes();
        if (typeof onComplete === 'function') onComplete();
      }
    }, 25);
  }

  _fadeOutAll(durationSec = 2.0, onComplete) {
    if (this._fadeInterval) {
      clearInterval(this._fadeInterval);
      this._fadeInterval = null;
    }

    const startActive = this._activeGain;
    const startIdle = this._idleGain;
    const durationMs = Math.max(200, durationSec * 1000);
    const startTime = performance.now();
    this._isTransitioning = true;

    this._fadeInterval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(1.0, elapsed / durationMs);

      const fadeOut = Math.cos(progress * Math.PI * 0.5);

      this._activeGain = startActive * fadeOut;
      this._idleGain = startIdle * fadeOut;
      this._applyVolumes();

      if (progress >= 1.0) {
        clearInterval(this._fadeInterval);
        this._fadeInterval = null;
        this._isTransitioning = false;
        this._activeGain = 0;
        this._idleGain = 0;
        this._applyVolumes();
        this._activeDeck.pause();
        this._idleDeck.pause();
        if (typeof onComplete === 'function') onComplete();
      }
    }, 25);
  }

  _applyVolumes() {
    const masterMult = this._muted ? 0 : this._masterVolume;
    const duckMult = this._isDucked ? this._duckFactor : 1.0;
    const effectiveBase = masterMult * this._volume * duckMult;

    const activeVol = Math.max(0, Math.min(1, effectiveBase * this._activeGain));
    const idleVol = Math.max(0, Math.min(1, effectiveBase * this._idleGain));

    this._activeDeck.volume = activeVol;
    this._idleDeck.volume = idleVol;
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
}

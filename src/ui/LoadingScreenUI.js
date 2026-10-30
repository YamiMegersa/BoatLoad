import { on, off, emit } from '../core/EventBus.js';

/**
 * LoadingScreenUI — Nautical pixel-art ship loading screen.
 * Displays a detailed pixel-art sailing ship sailing smoothly across an animated
 * strip of water during scene transitions, asset loading, or lengthy processes.
 */
export class LoadingScreenUI {
  constructor() {
    this._el = null;
    this._shipWrapper = null;
    this._progressFill = null;
    this._titleEl = null;
    this._messageEl = null;
    this._pctEl = null;

    this._progress = 0;
    this._visible = false;
    this._showStartTime = 0;
    this._minDisplayMs = 420;
    this._hideTimeout = null;

    this._initDOM();

    // EventBus bindings
    this._onShow = (data) => this.show(data);
    this._onUpdate = (data) => this.update(data);
    this._onHide = (data) => this.hide(data);

    on('showLoading', this._onShow);
    on('updateLoading', this._onUpdate);
    on('hideLoading', this._onHide);
  }

  _initDOM() {
    if (this._el) return;

    this._el = document.createElement('div');
    this._el.id = 'nautical-loading-screen';
    this._el.className = 'nautical-loading-overlay';
    this._el.style.display = 'none';

    this._el.innerHTML = `
      <div class="nautical-loading-card">
        <div class="nautical-compass-icon"><span class="pixel-icon icon-compass size-40"></span></div>
        <div class="nautical-loading-title" id="loading-card-title">Navigating Seas</div>

        <div class="nautical-water-strip-container">
          <div class="nautical-water-strip">
            <div class="nautical-wave-layer wave-layer-deep"></div>
            <div class="nautical-progress-wake" id="loading-progress-fill"></div>
            <div class="nautical-wave-layer wave-layer-crest"></div>
          </div>

          <div class="nautical-ship-channel">
            <div class="nautical-ship-wrapper" id="loading-ship-wrapper">
              <!-- Pixel Art Sailing Sloop (64x48) -->
              <svg class="pixel-ship-svg" viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
                <!-- Mast & Spars -->
                <rect x="30" y="8" width="3" height="28" fill="#3e2312" />
                <rect x="31" y="8" width="1" height="28" fill="#5a341a" />
                <!-- Bowsprit -->
                <polygon points="46,30 58,26 46,28" fill="#5a341a" />

                <!-- Masthead Crimson Pennant Flag -->
                <polygon points="33,8 45,11 33,14" fill="#d92525" />
                <polygon points="33,8 39,11 33,14" fill="#9e1313" />
                <circle cx="33" cy="8" r="1.5" fill="#f5c542" />

                <!-- Yardarms -->
                <rect x="18" y="14" width="26" height="2" fill="#2a160a" />
                <rect x="22" y="24" width="20" height="2" fill="#2a160a" />

                <!-- Rigging Ropes -->
                <line x1="18" y1="15" x2="31" y2="8" stroke="#8c6f50" stroke-width="1" opacity="0.6" />
                <line x1="44" y1="15" x2="31" y2="8" stroke="#8c6f50" stroke-width="1" opacity="0.6" />

                <!-- Billowing Mainsail (Parchment Cream Canvas) -->
                <path d="M19 16 C22 23, 24 24, 24 24 L39 24 C39 24, 41 23, 43 16 Z" fill="#ede0cb" />
                <path d="M21 17 C23 22, 25 23, 25 23 L37 23 C37 23, 39 22, 41 17 Z" fill="#fcf6ea" />
                <!-- Mainsail Seam & Emblem -->
                <line x1="31" y1="16" x2="31" y2="24" stroke="#d5c3a5" stroke-width="1" />
                <!-- Pirate Jolly Roger / Anchor Emblem -->
                <circle cx="31" cy="20" r="2.2" fill="#3a2516" />
                <rect x="30" y="22.2" width="2" height="1.6" fill="#3a2516" />
                <line x1="28.5" y1="21" x2="33.5" y2="21" stroke="#3a2516" stroke-width="1" />

                <!-- Topsail -->
                <path d="M24 9 C26 13, 27 14, 27 14 L36 14 C36 14, 37 13, 38 9 Z" fill="#ede0cb" />
                <path d="M25 10 C27 13, 28 13.5, 28 13.5 L35 13.5 C35 13.5, 36 13, 37 10 Z" fill="#fcf6ea" />

                <!-- Jib / Staysail (Triangular Head Sail) -->
                <polygon points="33,12 48,27 33,27" fill="#ede0cb" />
                <polygon points="34,14 45,26 34,26" fill="#fcf6ea" />

                <!-- Ship Hull (Carved Oak & Pine) -->
                <!-- Quarterdeck Cabin -->
                <rect x="16" y="28" width="10" height="4" fill="#5a341a" />
                <rect x="26" y="30" width="18" height="2" fill="#78471f" />
                <!-- Golden Gunwale & Railing -->
                <path d="M12 30 L48 30 L52 32 L10 32 Z" fill="#a86a32" />
                <rect x="12" y="30" width="38" height="1" fill="#dfaf5b" />
                <!-- Hull Mid Planks -->
                <path d="M10 32 L52 32 L48 38 L16 38 Z" fill="#5c3516" />
                <path d="M12 34 L50 34 L47 37 L17 37 Z" fill="#44260f" />
                <!-- Bottom Keel / Waterline Strip -->
                <path d="M16 38 L48 38 L44 41 L20 41 Z" fill="#2b1708" />

                <!-- Brass Portholes -->
                <circle cx="22" cy="35" r="1.6" fill="#f5c542" />
                <circle cx="22" cy="35" r="0.8" fill="#1a0f07" />
                <circle cx="32" cy="35" r="1.6" fill="#f5c542" />
                <circle cx="32" cy="35" r="0.8" fill="#1a0f07" />
                <circle cx="42" cy="35" r="1.6" fill="#f5c542" />
                <circle cx="42" cy="35" r="0.8" fill="#1a0f07" />

                <!-- Water Splashes & Bow Wave Foam -->
                <rect x="13" y="39" width="4" height="1.5" fill="#ffffff" opacity="0.85" />
                <rect x="25" y="40" width="6" height="1.5" fill="#88dcf0" opacity="0.9" />
                <rect x="40" y="39" width="8" height="2" fill="#ffffff" opacity="0.9" />
                <rect x="48" y="37" width="5" height="2" fill="#e0f7fc" />
              </svg>
              <div class="pixel-bow-foam"></div>
            </div>
          </div>
        </div>

        <div class="nautical-loading-status-row">
          <span class="nautical-status-msg" id="loading-status-msg">Plotting maritime course...</span>
          <span class="nautical-status-pct" id="loading-status-pct">0%</span>
        </div>
      </div>
    `;

    const parent = document.getElementById('ui-root') || document.body;
    parent.appendChild(this._el);

    this._shipWrapper = this._el.querySelector('#loading-ship-wrapper');
    this._progressFill = this._el.querySelector('#loading-progress-fill');
    this._titleEl = this._el.querySelector('#loading-card-title');
    this._messageEl = this._el.querySelector('#loading-status-msg');
    this._pctEl = this._el.querySelector('#loading-status-pct');
  }

  /**
   * Display the loading screen.
   * @param {object} [opts]
   * @param {string} [opts.title]       Header text (e.g. 'Entering Shipyard')
   * @param {string} [opts.message]     Status text (e.g. 'Mooring vessel...')
   * @param {number} [opts.progress=0]  Initial progress (0.0 to 1.0)
   */
  show(opts = {}) {
    this._initDOM();
    if (this._hideTimeout) {
      clearTimeout(this._hideTimeout);
      this._hideTimeout = null;
    }
    this._pendingDismissCallbacks = [];

    const title = opts.title || 'Navigating Seas';
    const message = opts.message || 'Plotting course...';
    const initialProgress = opts.progress !== undefined ? Math.max(0, Math.min(1, opts.progress)) : 0.08;

    if (this._titleEl) this._titleEl.innerText = title;
    if (this._messageEl) this._messageEl.innerText = message;

    if (!this._visible) {
      this._setProgress(initialProgress);
      this._showStartTime = performance.now();
      this._visible = true;

      this._el.style.display = 'flex';
      // Force browser reflow so transition plays cleanly
      void this._el.offsetWidth;
      this._el.classList.add('active');
    } else {
      if (opts.progress !== undefined) {
        this._setProgress(opts.progress);
      }
    }
  }

  /**
   * Update the progress and message of the loading screen.
   * @param {object} opts
   * @param {number} [opts.progress] Progress value between 0.0 and 1.0
   * @param {string} [opts.message]  Updated status message
   * @param {string} [opts.title]    Updated header title
   */
  update(opts = {}) {
    if (!this._visible) {
      this.show(opts);
      return;
    }

    if (opts.title && this._titleEl) {
      this._titleEl.innerText = opts.title;
    }
    if (opts.message && this._messageEl) {
      this._messageEl.innerText = opts.message;
    }
    if (opts.progress !== undefined) {
      this._setProgress(opts.progress);
    }
  }

  /**
   * Dismiss the loading screen with a smooth nautical fade-out.
   * Ensures a minimum display duration to prevent visual strobing.
   * @param {object} [opts]
   * @param {boolean} [opts.immediate=false] Skip delay and minimum duration
   * @param {Function} [opts.onDismissed] Callback fired when loading screen is fully hidden
   */
  hide(opts = {}) {
    const onDismissed = typeof opts === 'function' ? opts : opts?.onDismissed;
    if (typeof onDismissed === 'function') {
      if (!this._pendingDismissCallbacks) this._pendingDismissCallbacks = [];
      this._pendingDismissCallbacks.push(onDismissed);
    }

    const triggerDismissed = () => {
      const cbs = this._pendingDismissCallbacks ? [...this._pendingDismissCallbacks] : [];
      this._pendingDismissCallbacks = [];
      for (const cb of cbs) {
        try { cb(); } catch (err) { console.error('Error in onDismissed callback:', err); }
      }
      emit('loadingScreenDismissed');
    };

    if (!this._visible) {
      triggerDismissed();
      return;
    }

    const immediate = !!opts?.immediate;
    this._setProgress(1.0);

    const elapsed = performance.now() - this._showStartTime;
    const remainingMin = immediate ? 0 : Math.max(0, this._minDisplayMs - elapsed);
    const finishDelay = immediate ? 0 : 200; // Brief delay for the ship to reach 100%

    if (this._hideTimeout) clearTimeout(this._hideTimeout);

    this._hideTimeout = setTimeout(() => {
      if (this._el) {
        this._el.classList.remove('active');
      }
      this._hideTimeout = setTimeout(() => {
        if (this._el) {
          this._el.style.display = 'none';
        }
        this._visible = false;
        this._hideTimeout = null;
        triggerDismissed();
      }, immediate ? 0 : 350); // Matches CSS transition duration
    }, remainingMin + finishDelay);
  }

  _setProgress(value) {
    const clamped = Math.max(0, Math.min(1, value));
    this._progress = clamped;
    const pct = Math.round(clamped * 100);

    if (this._progressFill) {
      this._progressFill.style.width = `${pct}%`;
    }
    if (this._shipWrapper) {
      this._shipWrapper.style.left = `${pct}%`;
    }
    if (this._pctEl) {
      this._pctEl.innerText = `${pct}%`;
    }
  }

  dispose() {
    if (this._hideTimeout) {
      clearTimeout(this._hideTimeout);
      this._hideTimeout = null;
    }
    this._pendingDismissCallbacks = [];
    off('showLoading', this._onShow);
    off('updateLoading', this._onUpdate);
    off('hideLoading', this._onHide);

    if (this._el && this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
    this._el = null;
  }
}

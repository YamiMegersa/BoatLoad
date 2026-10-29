import { emit, on, off } from '../core/EventBus.js';
import { CREDITS_LIST, parseCredits, loadCreditsBlocks } from '../config/CreditsConfig.js';

/**
 * CreditsUI — Nautical Pixel-Art Rolling Credits Screen.
 *
 * Rolls once the game is completed (or when opened from Main Menu / Results / Dev Suite).
 * Accepts an editable list of strings/objects or loads directly from `CREDITS.md` / `CreditsConfig.js`.
 */
export class CreditsUI {
  /**
   * @param {import('../core/GameState.js').GameState} [gameState]
   * @param {string | Array<string|object>} [creditsList] Optional custom list to display
   */
  constructor(gameState = null, creditsList = null) {
    this.gameState = gameState;
    this._customCredits = creditsList;
    this.root = null;

    // Roll animation state
    this._rafId = null;
    this._lastTime = 0;
    this._scrollY = 0;
    this._maxScrollY = 0;
    this._baseSpeed = 48; // pixels per second at 1x
    this._speedMultiplier = 1;
    this._isPaused = false;
    this._isFastForwardKey = false;
    this._isFinished = false;

    this._onMount = (d) => {
      if (d?.screen === 'credits') {
        this.mount(d.data || {});
      }
    };
    this._onUnmount = (d) => {
      if (d?.screen === 'credits') {
        this.unmount();
      }
    };
    this._onUpdateCredits = (d) => {
      if (d?.credits) {
        this.setCredits(d.credits);
      }
    };

    on('uiMount', this._onMount);
    on('uiUnmount', this._onUnmount);
    on('updateCreditsList', this._onUpdateCredits);

    this._boundKeyDown = this._onKeyDown.bind(this);
    this._boundKeyUp = this._onKeyUp.bind(this);
    this._boundWheel = this._onWheel.bind(this);
  }

  /**
   * Update the credits list at runtime and re-render if currently mounted.
   * @param {string | Array<string|object>} creditsList
   */
  setCredits(creditsList) {
    this._customCredits = creditsList;
    if (this.root) {
      const blocks = parseCredits(this._customCredits);
      this._renderRollBlocks(blocks);
      this.restartRoll();
    }
  }

  /**
   * Escape HTML special characters so plain text in credits.md is always safe.
   * @param {string} str
   * @returns {string}
   */
  _escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Convert parsed credit block objects into pixel-art nautical HTML markup.
   * @param {Array<object>} blocks
   * @returns {string}
   */
  _buildBlocksHtml(blocks) {
    return blocks.map((block, index) => {
      switch (block.type) {
        case 'title': {
          const isOpening = index === 0;
          return `
            <div class="credits-block credits-block-title ${isOpening ? 'opening-title' : 'closing-title'}">
              ${isOpening ? this._buildCrestSvg() : '<div class="credits-closing-emblem"><span class="pixel-icon icon-helm-wheel size-32"></span></div>'}
              <h1 class="credits-grand-title">${this._escapeHtml(block.text)}</h1>
            </div>
          `;
        }

        case 'subtitle':
          return `
            <div class="credits-block credits-block-subtitle">
              <div class="credits-ribbon">
                <span class="pixel-icon icon-anchor size-16"></span>
                <span class="credits-ribbon-text">${this._escapeHtml(block.text)}</span>
                <span class="pixel-icon icon-anchor size-16"></span>
              </div>
            </div>
          `;

        case 'quote':
          return `
            <div class="credits-block credits-block-quote">
              <p class="credits-quote-text">&ldquo;${this._escapeHtml(block.text)}&rdquo;</p>
            </div>
          `;

        case 'divider':
          return `
            <div class="credits-block credits-block-divider" aria-hidden="true">
              <span class="credits-divider-line"></span>
              <span class="pixel-icon icon-nautical-star size-16"></span>
              <span class="credits-divider-line"></span>
            </div>
          `;

        case 'section': {
          const iconClass = block.icon || 'icon-nautical-star';
          return `
            <div class="credits-block credits-block-section">
              <div class="credits-section-header">
                <span class="pixel-icon ${this._escapeHtml(iconClass)} size-22"></span>
                <h2 class="credits-section-title">${this._escapeHtml(block.text)}</h2>
                <span class="pixel-icon ${this._escapeHtml(iconClass)} size-22"></span>
              </div>
            </div>
          `;
        }

        case 'role':
          return `
            <div class="credits-block credits-block-role">
              <h3 class="credits-role-title">${this._escapeHtml(block.text)}</h3>
            </div>
          `;

        case 'pair':
          return `
            <div class="credits-block credits-block-pair">
              <span class="credits-pair-label">${this._escapeHtml(block.label)}</span>
              <span class="credits-pair-dots"></span>
              <span class="credits-pair-value">${this._escapeHtml(block.value)}</span>
            </div>
          `;

        case 'item':
        default:
          return `
            <div class="credits-block credits-block-item">
              <span class="pixel-icon icon-nautical-star size-14 credits-item-star"></span>
              <span class="credits-item-text">${this._escapeHtml(block.text)}</span>
              <span class="pixel-icon icon-nautical-star size-14 credits-item-star"></span>
            </div>
          `;
      }
    }).join('');
  }

  _buildCrestSvg() {
    return `
      <div class="credits-crest">
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="creditsGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#fff5cc" />
              <stop offset="40%" stop-color="#f5c242" />
              <stop offset="75%" stop-color="#bd8218" />
              <stop offset="100%" stop-color="#694005" />
            </linearGradient>
            <radialGradient id="creditsBrassHub" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#ffeaa7" />
              <stop offset="60%" stop-color="#d49b29" />
              <stop offset="100%" stop-color="#422502" />
            </radialGradient>
          </defs>
          <path d="M18 82 C35 65 65 35 82 18 C83 17 85 19 83 22 C67 38 38 67 22 83 Z" fill="url(#creditsGoldGrad)" opacity="0.85" />
          <path d="M82 82 C65 65 35 35 18 18 C17 17 19 15 22 17 C38 33 67 62 83 78 Z" fill="url(#creditsGoldGrad)" opacity="0.85" />
          <circle cx="18" cy="82" r="5" fill="#ffd700" />
          <circle cx="82" cy="82" r="5" fill="#ffd700" />
          <circle cx="50" cy="50" r="32" stroke="url(#creditsGoldGrad)" stroke-width="4.5" fill="none" />
          <circle cx="50" cy="50" r="23" stroke="url(#creditsGoldGrad)" stroke-width="2.5" fill="none" opacity="0.9" />
          <line x1="50" y1="18" x2="50" y2="7" stroke="url(#creditsGoldGrad)" stroke-width="3.5" stroke-linecap="round" />
          <line x1="50" y1="82" x2="50" y2="93" stroke="url(#creditsGoldGrad)" stroke-width="3.5" stroke-linecap="round" />
          <line x1="18" y1="50" x2="7" y2="50" stroke="url(#creditsGoldGrad)" stroke-width="3.5" stroke-linecap="round" />
          <line x1="82" y1="50" x2="93" y2="50" stroke="url(#creditsGoldGrad)" stroke-width="3.5" stroke-linecap="round" />
          <line x1="27" y1="27" x2="19" y2="19" stroke="url(#creditsGoldGrad)" stroke-width="3.5" stroke-linecap="round" />
          <line x1="73" y1="73" x2="81" y2="81" stroke="url(#creditsGoldGrad)" stroke-width="3.5" stroke-linecap="round" />
          <line x1="73" y1="27" x2="81" y2="19" stroke="url(#creditsGoldGrad)" stroke-width="3.5" stroke-linecap="round" />
          <line x1="27" y1="73" x2="19" y2="81" stroke="url(#creditsGoldGrad)" stroke-width="3.5" stroke-linecap="round" />
          <line x1="50" y1="27" x2="50" y2="73" stroke="url(#creditsGoldGrad)" stroke-width="2.5" />
          <line x1="27" y1="50" x2="73" y2="50" stroke="url(#creditsGoldGrad)" stroke-width="2.5" />
          <circle cx="50" cy="50" r="14" fill="url(#creditsBrassHub)" stroke="#ffe680" stroke-width="1.5" />
        </svg>
      </div>
    `;
  }

  _renderRollBlocks(blocks) {
    if (!this.root) return;
    const track = this.root.querySelector('#credits-roll-track');
    if (!track) return;

    track.innerHTML = `
      <div class="credits-roll-spacer-top"></div>
      ${this._buildBlocksHtml(blocks)}
      <div class="credits-final-seal">
        <div class="credits-seal-icons">
          <span class="pixel-icon icon-doubloon size-20"></span>
          <span class="pixel-icon icon-sloop size-28"></span>
          <span class="pixel-icon icon-doubloon size-20"></span>
        </div>
        <div class="credits-seal-caption">PORT ROTGUT HARBOR AUTHORITY • ANNO DOMINI</div>
      </div>
      <div class="credits-roll-spacer-bottom"></div>
    `;
  }

  async mount(data = {}) {
    if (this.root) this.unmount();

    const customInput = data.credits || this._customCredits || null;
    const initialBlocks = parseCredits(customInput || CREDITS_LIST);

    const coins = data.coins ?? this.gameState?.coins ?? 0;
    const bonusCoins = data.bonusCoins ?? 0;
    const gameCompleted = Boolean(data.gameCompleted || (this.gameState && this.gameState.day >= 7));

    this.root = document.createElement('div');
    this.root.id = 'credits-screen-modal';
    this.root.className = 'credits-screen-overlay';

    this.root.innerHTML = `
      <div class="credits-plaque-frame">
        <!-- Brass corner decorations -->
        <div class="plaque-corner top-left"></div>
        <div class="plaque-corner top-right"></div>
        <div class="plaque-corner bottom-left"></div>
        <div class="plaque-corner bottom-right"></div>

        <!-- Brass Rivets -->
        <div class="rivet tl"></div>
        <div class="rivet tr"></div>
        <div class="rivet bl"></div>
        <div class="rivet br"></div>

        <!-- Top Header Banner -->
        <div class="credits-top-header">
          <div class="credits-header-left">
            <span class="pixel-icon icon-closed-logbook size-22"></span>
            <div>
              <div class="credits-header-title">GRAND HONOUR ROLL &amp; CREDITS</div>
              <div class="credits-header-sub">${gameCompleted ? 'All Seven Days Conquered • Safe Harbor Reached' : 'Shipwrights, Mariners &amp; Artisans of BoatLoad'}</div>
            </div>
          </div>

          <div class="credits-header-right">
            ${bonusCoins > 0 ? `
              <div class="credits-bounty-pill" title="Final Voyage Bounty Awarded">
                <span>+${bonusCoins}</span>
                <span class="pixel-icon icon-doubloon size-16"></span>
              </div>
            ` : ''}
            <div class="credits-wallet-pill" title="Total Doubloons in Purse">
              <span class="pixel-icon icon-doubloon size-16"></span>
              <span class="credits-wallet-amount">${coins}</span>
            </div>
          </div>
        </div>

        <!-- Scrolling Viewport -->
        <div class="credits-viewport" id="credits-viewport">
          <div class="credits-roll-track" id="credits-roll-track"></div>
        </div>

        <!-- Bottom Controls & Navigation Footer -->
        <div class="credits-footer-bar">
          <div class="credits-playback-controls">
            <button class="credits-ctrl-btn" id="credits-btn-pause" title="Pause or Resume Roll (P)">
              <span class="pixel-icon icon-play-step size-14"></span>
              <span id="credits-pause-label">Pause</span>
            </button>
            <button class="credits-ctrl-btn" id="credits-btn-speed" title="Cycle Roll Speed (or hold Space)">
              <span class="pixel-icon icon-wind-gust size-14"></span>
              <span id="credits-speed-label">Speed: 1x</span>
            </button>
            <button class="credits-ctrl-btn" id="credits-btn-replay" title="Restart Credits Roll from Top">
              <span class="pixel-icon icon-rotate-arrow size-14"></span>
              <span>Replay</span>
            </button>
          </div>

          <div class="credits-nav-actions">
            ${gameCompleted ? `
              <button class="credits-nav-btn ledger-btn" id="credits-btn-ledger">
                <span class="pixel-icon icon-map-maker-scroll size-16"></span>
                <span>Voyage Ledger</span>
              </button>
            ` : ''}
            <button class="credits-nav-btn dock-btn" id="credits-btn-dock">
              <span class="pixel-icon icon-harbor-flag size-16"></span>
              <span>Return to Dock</span>
            </button>
            <button class="credits-nav-btn menu-btn" id="credits-btn-menu">
              <span class="pixel-icon icon-helm-wheel size-16"></span>
              <span>Main Menu</span>
            </button>
          </div>
        </div>
      </div>
    `;

    const uiRoot = (typeof document !== 'undefined' && document.getElementById('ui-root')) ||
                   (typeof document !== 'undefined' ? document.body : null);
    if (uiRoot) {
      uiRoot.appendChild(this.root);
    }

    // Render initial blocks immediately so DOM is populated synchronously
    this._renderRollBlocks(initialBlocks);

    // Wire interactive buttons
    this._bindControls(data);

    // Reset and start rolling animation
    this.restartRoll();

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this._boundKeyDown);
      window.addEventListener('keyup', this._boundKeyUp);
    }
    const viewport = this.root.querySelector('#credits-viewport');
    if (viewport && viewport.addEventListener) {
      viewport.addEventListener('wheel', this._boundWheel, { passive: false });
    }

    // Also asynchronously check if `CREDITS.md` / `public/credits.md` has updated text
    if (!customInput) {
      loadCreditsBlocks().then((loadedBlocks) => {
        if (this.root && Array.isArray(loadedBlocks) && loadedBlocks.length > 0) {
          this._renderRollBlocks(loadedBlocks);
          this._recalculateBounds();
        }
      }).catch(() => {});
    }
  }

  _bindControls(data = {}) {
    if (!this.root) return;

    const pauseBtn = this.root.querySelector('#credits-btn-pause');
    if (pauseBtn) {
      pauseBtn.onclick = () => this.togglePause();
    }

    const speedBtn = this.root.querySelector('#credits-btn-speed');
    if (speedBtn) {
      speedBtn.onclick = () => this.cycleSpeed();
    }

    const replayBtn = this.root.querySelector('#credits-btn-replay');
    if (replayBtn) {
      replayBtn.onclick = () => {
        emit('playSound', { sound: 'qte_success' });
        this.restartRoll();
      };
    }

    const ledgerBtn = this.root.querySelector('#credits-btn-ledger');
    if (ledgerBtn) {
      ledgerBtn.onclick = () => {
        emit('playSound', { sound: 'qte_success' });
        this.unmount();
        if (this.gameState) {
          this.gameState.currentPhase = 'RESULTS';
        }
        emit('uiMount', {
          screen: 'results',
          data: {
            day: data.day || this.gameState?.day || 7,
            baseReward: data.baseReward,
            multiplier: data.multiplier,
            bonusCoins: data.bonusCoins
          }
        });
      };
    }

    const dockBtn = this.root.querySelector('#credits-btn-dock');
    if (dockBtn) {
      dockBtn.onclick = () => {
        emit('playSound', { sound: 'qte_success' });
        this.unmount();
        emit('requestPhaseChange', { phase: 'DOCK' });
      };
    }

    const menuBtn = this.root.querySelector('#credits-btn-menu');
    if (menuBtn) {
      menuBtn.onclick = () => {
        emit('playSound', { sound: 'qte_success' });
        this.unmount();
        emit('requestPhaseChange', { phase: 'MAIN_MENU' });
      };
    }
  }

  togglePause() {
    this._isPaused = !this._isPaused;
    if (this._isPaused && this._isFinished) {
      this._isFinished = false;
    }
    const label = this.root?.querySelector('#credits-pause-label');
    if (label) {
      label.textContent = this._isPaused ? 'Resume' : 'Pause';
    }
  }

  cycleSpeed() {
    if (this._speedMultiplier === 1) {
      this._speedMultiplier = 2;
    } else if (this._speedMultiplier === 2) {
      this._speedMultiplier = 4;
    } else {
      this._speedMultiplier = 1;
    }
    const label = this.root?.querySelector('#credits-speed-label');
    if (label) {
      label.textContent = `Speed: ${this._speedMultiplier}x`;
    }
  }

  restartRoll() {
    this._scrollY = 0;
    this._isPaused = false;
    this._isFinished = false;
    const pauseLabel = this.root?.querySelector('#credits-pause-label');
    if (pauseLabel) pauseLabel.textContent = 'Pause';
    this._recalculateBounds();
    this._applyScrollTransform();
    this._startLoop();
  }

  _recalculateBounds() {
    if (!this.root) return;
    const viewport = this.root.querySelector('#credits-viewport');
    const track = this.root.querySelector('#credits-roll-track');
    if (!viewport || !track) return;

    const viewportH = viewport.clientHeight || 420;
    const trackH = track.scrollHeight || 1200;
    this._maxScrollY = Math.max(0, trackH - viewportH);
  }

  _applyScrollTransform() {
    if (!this.root) return;
    const track = this.root.querySelector('#credits-roll-track');
    if (track && track.style) {
      track.style.transform = `translate3d(0, ${-Math.round(this._scrollY)}px, 0)`;
    }
  }

  _startLoop() {
    this._stopLoop();
    if (typeof requestAnimationFrame !== 'function') return;

    this._lastTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const step = (now) => {
      if (!this.root) return;
      const dt = Math.min(0.1, Math.max(0, (now - this._lastTime) / 1000));
      this._lastTime = now;

      this._recalculateBounds();

      if (!this._isPaused && !this._isFinished) {
        const activeMult = this._isFastForwardKey ? Math.max(4, this._speedMultiplier * 2) : this._speedMultiplier;
        this._scrollY += this._baseSpeed * activeMult * dt;

        if (this._maxScrollY > 0 && this._scrollY >= this._maxScrollY) {
          this._scrollY = this._maxScrollY;
          this._isFinished = true;
          const pauseLabel = this.root?.querySelector('#credits-pause-label');
          if (pauseLabel) pauseLabel.textContent = 'Finished';
          emit('creditsCompleted');
        }
        this._applyScrollTransform();
      }

      this._rafId = requestAnimationFrame(step);
    };

    this._rafId = requestAnimationFrame(step);
  }

  _stopLoop() {
    if (this._rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  _onKeyDown(e) {
    if (!this.root) return;
    if (e.code === 'Space' || e.code === 'ArrowDown') {
      this._isFastForwardKey = true;
    } else if (e.code === 'ArrowUp') {
      this._isFinished = false;
      this._scrollY = Math.max(0, this._scrollY - 40);
      this._applyScrollTransform();
    } else if (e.code === 'KeyP') {
      this.togglePause();
    }
  }

  _onKeyUp(e) {
    if (e.code === 'Space' || e.code === 'ArrowDown') {
      this._isFastForwardKey = false;
    }
  }

  _onWheel(e) {
    if (!this.root) return;
    e.preventDefault();
    this._recalculateBounds();
    this._isFinished = false;
    this._scrollY = Math.max(0, Math.min(this._maxScrollY, this._scrollY + e.deltaY * 0.65));
    this._applyScrollTransform();
  }

  unmount() {
    this._stopLoop();
    this._isFastForwardKey = false;
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this._boundKeyDown);
      window.removeEventListener('keyup', this._boundKeyUp);
    }
    if (this.root && this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
    this.root = null;
  }

  dispose() {
    this.unmount();
    off('uiMount', this._onMount);
    off('uiUnmount', this._onUnmount);
    off('updateCreditsList', this._onUpdateCredits);
  }
}

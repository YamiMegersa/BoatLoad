import { emit, on, off } from '../core/EventBus.js';
import { DEBUG } from '../utils/debug.js';
import wheelImage from '../assets/wheels/wheel_threshold.png';

/**
 * HUD — obstacle phase HUD overlay.
 *
 * Displays:
 *  - Hull HP bar (top-left)
 *  - Water level bar (top-left)
 *  - Day indicator (top-right)
 *  - Score / Bounty counter (top-right)
 *  - Interactive QTE prompt with countdown ring (centre)
 *  - Mobile Harpoon Quick Action Button (bottom-left)
 *  - Cannon ammo (bottom)
 *  - On-screen Steering wheel (bottom-right)
 */
export class HUD {
  constructor() {
    this._el          = null;
    this._hpBar       = null;
    this._waterBar    = null;
    this._qteEl       = null;
    this._qteMeter    = null;
    this._qteIndicator = null;
    this._mobileBtnEl = null;
    this._scoreEl     = null;
    this._bonusBoxEl  = null;
    this._score       = 0;
    this._qteHideTimer = null;
    this._bannerTimer = null;

    this._onScore = d => this._onScoreAdded(d);

    on('uiMount',          d => { if (d.screen === 'obstacle') this.mount(d); });
    on('uiUnmount',        d => { if (d.screen === 'obstacle') this.unmount(); });
    on('playerHealth',     d => this._updateHP(d.hp, d.max));
    on('playerWaterLevel', d => this._updateWater(d.level, d.max));
    on('qteStart',          d => this._showQTE(d));
    on('qteUpdate',         d => this._updateQTE(d));
    on('qteSuccess',        () => this._hideQTE());
    on('qteFail',           () => this._hideQTE());
    on('scoreAdded',       this._onScore);
    on('sharkHitConfirmed', d => this._showSharkConfirm(d));
    on('sirenWarning',      d => this._showBanner(d));
    on('sirenPulling',      d => this._updateSirenPull(d));
  }

  mount({ day } = {}) {
    if (this._el) this.unmount();

    this._score = 0;

    this._el = document.createElement('div');
    this._el.id = 'hud';
    this._el.innerHTML = `
      <div id="hud-hp">
        <span>Hull HP</span>
        <div id="hud-hp-bar-track"><div id="hud-hp-bar"></div></div>
        <span id="hud-hp-val">100%</span>
      </div>
      <div id="hud-water">
        <span>Water</span>
        <div id="hud-water-bar-track"><div id="hud-water-bar"></div></div>
        <span id="hud-water-val">0%</span>
      </div>
      
      <!-- Score Display -->
      <div id="hud-score">
        <span class="hud-score-coin">🪙</span>
        <span id="hud-score-val">0</span> pts
      </div>

      <div id="hud-day">Day ${day ?? 1}</div>

      <div id="hud-godmode" style="margin-top: 10px; pointer-events: auto;">
        <label style="color: white; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 5px;">
          <input type="checkbox" id="chk-godmode"> God Mode (No Damage)
        </label>
      </div>
      <div id="hud-densefog" style="margin-top: 10px; pointer-events: auto;">
        <label style="color: white; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 5px;">
          <input type="checkbox" id="chk-densefog"> Dense Fog (F)
        </label>
      </div>
      ${DEBUG ? `
      <div id="hud-qte-debug" style="margin-top: 10px; pointer-events: auto;">
        <span>QTE Debug:</span>
        <button type="button" data-qte-source="barrel">Shoot</button>
        <button type="button" data-qte-source="shark">Harpoon</button>
        <button type="button" data-qte-source="bail">Bail</button>
        <button type="button" data-qte-source="siren">Siren</button>
      </div>` : ''}

      <!-- Interactive QTE Reticle Prompt -->
      <div id="hud-qte" style="display:none">
        <div id="hud-qte-action">HARPOON!</div>
        <div id="hud-qte-key">Press [ H ] or TAP</div>
        <svg id="hud-qte-ring" viewBox="0 0 36 36">
          <circle class="track" cx="18" cy="18" r="16"/>
          <circle class="fill"  cx="18" cy="18" r="16" stroke-dasharray="100 100"/>
        </svg>
        <div id="hud-qte-meter" class="timing">
          <div class="qte-sweet-spot"></div>
          <div class="qte-indicator"></div>
        </div>
        <div id="hud-qte-progress"></div>
        <div id="hud-qte-alternate" style="display:none">
          <button type="button" data-qte-input="left">◀ LEFT</button>
          <button type="button" data-qte-input="right">RIGHT ▶</button>
        </div>
      </div>

      <!-- Dedicated Mobile Harpoon Button for left thumb -->
      <div id="hud-mobile-harpoon" style="display: none;">
        <button id="btn-mobile-harpoon" type="button" aria-label="Harpoon Action">
          <span class="harpoon-icon">🔱</span>
          <span class="harpoon-text">HARPOON</span>
        </button>
      </div>

      <!-- Pause button (same action as Esc) -->
      <button id="hud-pause-btn" type="button" aria-label="Pause">⏸</button>

      <!-- Non-blocking warning banner (e.g. first siren encounter) -->
      <div id="hud-banner"></div>

      <!-- Siren pull edge cues -->
      <div class="hud-siren-edge left"></div>
      <div class="hud-siren-edge right"></div>

      <!-- Floating Points Notification Container -->
      <div id="hud-bonus-container"></div>

      <div id="hud-ammo">🔫 ∞</div>
      
      <!-- Steering Wheel -->
      <div id="hud-wheel-container">
        <img id="hud-wheel" src="${wheelImage}">
      </div>
    `;

    this._hpBar = this._el.querySelector('#hud-hp-bar');
    this._waterBar = this._el.querySelector('#hud-water-bar');
    this._qteEl = this._el.querySelector('#hud-qte');
    this._qteMeter = this._el.querySelector('#hud-qte-meter');
    this._qteIndicator = this._el.querySelector('.qte-indicator');
    this._wheel = this._el.querySelector('#hud-wheel');
    this._mobileBtnEl = this._el.querySelector('#hud-mobile-harpoon');
    this._scoreEl = this._el.querySelector('#hud-score-val');
    this._bonusBoxEl = this._el.querySelector('#hud-bonus-container');

    // Click/Tap on QTE reticle
    this._qteEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      emit('qteInput', { kind: 'tap' });
    });

    // Tap on dedicated mobile Harpoon button
    const mobileBtn = this._el.querySelector('#btn-mobile-harpoon');
    if (mobileBtn) {
      mobileBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        emit('qteInput', { kind: 'tap' });
      });
    }

    // Pause button — same action as Esc
    this._el.querySelector('#hud-pause-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      emit('pauseRequest');
    });
    
    // Steering Wheel Interaction
    this._wheelAngle = 0;
    this._isDraggingWheel = false;

    const getAngle = (e) => {
      const rect = this._wheel.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      return Math.atan2(e.clientY - centerY, e.clientX - centerX);
    };

    this._wheel.addEventListener('pointerdown', (e) => {
      this._isDraggingWheel = true;
      this._lastAngle = getAngle(e);
      this._wheel.style.cursor = 'grabbing';
      e.target.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    this._wheel.addEventListener('pointermove', (e) => {
      if (!this._isDraggingWheel) return;
      const currentAngle = getAngle(e);
      let diff = currentAngle - this._lastAngle;
      if (diff > Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;
      
      this._wheelAngle += (diff * 180 / Math.PI);
      const maxRotation = 180;
      this._wheelAngle = Math.max(-maxRotation, Math.min(maxRotation, this._wheelAngle));
      this._lastAngle = currentAngle;
    });

    const stopDragging = (e) => {
      if (!this._isDraggingWheel) return;
      this._isDraggingWheel = false;
      this._wheel.style.cursor = 'grab';
      e.target.releasePointerCapture(e.pointerId);
    };

    this._wheel.addEventListener('pointerup', stopDragging);
    this._wheel.addEventListener('pointercancel', stopDragging);

    // Auto-centering & emit loop
    const autoCenter = () => {
      if (!this._el) return; // Stop loop if unmounted
      
      if (!this._isDraggingWheel) {
        this._wheelAngle *= 0.85; // Spring back
        if (Math.abs(this._wheelAngle) < 0.1) this._wheelAngle = 0;
      }
      
      this._wheel.style.transform = `rotate(${this._wheelAngle}deg)`;
      const maxRotation = 180;
      emit('steer', { value: this._wheelAngle / maxRotation });
      
      requestAnimationFrame(autoCenter);
    };
    requestAnimationFrame(autoCenter);

    const godChk = this._el.querySelector('#chk-godmode');
    if (godChk) {
      godChk.checked = window.godModeEnabled || false;
      godChk.onchange = (e) => {
        window.godModeEnabled = e.target.checked;
        emit('toggleGodMode', { enabled: e.target.checked });
      };
    }

    const fogChk = this._el.querySelector('#chk-densefog');
    if (fogChk) {
      fogChk.checked = window.denseFogEnabled || false;
      fogChk.onchange = (e) => {
        window.denseFogEnabled = e.target.checked;
        emit('toggleDenseFogUI', { enabled: e.target.checked });
      };
      
      this._onDenseFogChanged = (d) => {
        fogChk.checked = d.enabled;
      };
      on('denseFogChanged', this._onDenseFogChanged);
    }

    this._el.querySelectorAll('[data-qte-input]').forEach(button => {
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        emit('qteInput', { kind: button.dataset.qteInput });
      });
    });

    this._el.querySelectorAll('[data-qte-source]').forEach(button => {
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        emit('qteDebugTrigger', { source: button.dataset.qteSource });
      });
    });

    document.getElementById('ui-root')?.appendChild(this._el);
  }

  unmount() {
    if (this._onDenseFogChanged) {
      off('denseFogChanged', this._onDenseFogChanged);
      this._onDenseFogChanged = null;
    }
    clearTimeout(this._qteHideTimer);
    clearTimeout(this._bannerTimer);
    this._el?.remove();
    this._el          = null;
    this._hpBar       = null;
    this._waterBar    = null;
    this._qteEl       = null;
    this._qteMeter    = null;
    this._qteIndicator = null;
    this._mobileBtnEl = null;
    this._scoreEl     = null;
    this._bonusBoxEl  = null;
  }

  _onScoreAdded({ points = 0, label = '', isPerfect = false }) {
    this._score += points;
    if (this._scoreEl) {
      this._scoreEl.textContent = this._score;
    }

    // Spawn floating bonus text banner
    if (this._bonusBoxEl) {
      const floatEl = document.createElement('div');
      floatEl.className = 'floating-bonus-text' + (isPerfect ? ' perfect' : '');
      floatEl.textContent = `+${points} ${label}`;
      this._bonusBoxEl.appendChild(floatEl);
      setTimeout(() => floatEl.remove(), 1200);
    }
  }

  _updateHP(hp, maxHP) {
    if (!this._hpBar) return;
    const pct = Math.max(0, Math.min(100, (hp / maxHP) * 100));
    this._hpBar.style.width = `${pct}%`;
    this._hpBar.style.background = pct < 25 ? '#f44336' : pct < 50 ? '#ff9800' : '#4caf50';
    const valEl = this._el?.querySelector('#hud-hp-val');
    if (valEl) valEl.textContent = `${Math.floor(pct)}%`;
  }

  _updateWater(level, maxLevel) {
    if (!this._waterBar) return;
    const pct = Math.max(0, Math.min(100, (level / maxLevel) * 100));
    this._waterBar.style.width = `${pct}%`;
    this._waterBar.style.background = pct > 75 ? '#f44336' : pct > 50 ? '#ff9800' : '#2196f3';
    const valEl = this._el?.querySelector('#hud-water-val');
    if (valEl) valEl.textContent = `${Math.floor(pct)}%`;
  }

  _showQTE({ input, keys, label, prompt, sweetSpot, theme }) {
    if (!this._qteEl) return;
    clearTimeout(this._qteHideTimer);
    this._qteEl.classList.remove('qte-hiding');
    this._qteEl.style.display = 'flex';

    const actionEl = this._qteEl.querySelector('#hud-qte-action');
    const keyEl    = this._qteEl.querySelector('#hud-qte-key');
    const keyLabel = Object.values(keys ?? {}).map(key => key.replace(/^Key/, '').replace(/^Digit/, '')).join(' / ');
    const sweetSpotEl = this._qteEl.querySelector('.qte-sweet-spot');
    const progressEl = this._qteEl.querySelector('#hud-qte-progress');
    const mobileLabel = this._el?.querySelector('.harpoon-text');
    const alternateEl = this._qteEl.querySelector('#hud-qte-alternate');

    if (actionEl) actionEl.textContent = `${theme?.icon ?? ''} ${label}`;
    if (keyEl) keyEl.textContent = input === 'alternate' ? `${prompt} [ ${keyLabel} ]` : `${prompt} [ ${keyLabel} ] or TAP`;
    if (mobileLabel) mobileLabel.textContent = input === 'mash' ? 'TAP!' : 'ACTION';
    if (this._mobileBtnEl) this._mobileBtnEl.style.display = input === 'alternate' ? 'none' : 'block';
    if (alternateEl) alternateEl.style.display = input === 'alternate' ? 'flex' : 'none';
    this._qteEl.style.setProperty('--qte-theme', theme?.color ?? '#ff9800');
    if (this._qteMeter) this._qteMeter.className = input;
    // Reset the indicator so a fresh QTE never inherits stale inline styles
    // from a previous timing QTE (left offset) or mash QTE (width).
    if (this._qteIndicator) {
      this._qteIndicator.style.left = '0%';
      this._qteIndicator.style.width = '0%';
    }
    if (sweetSpotEl && sweetSpot) {
      sweetSpotEl.style.left = `${sweetSpot[0] * 100}%`;
      sweetSpotEl.style.width = `${(sweetSpot[1] - sweetSpot[0]) * 100}%`;
    }
    if (progressEl) progressEl.textContent = '';
  }

  _updateQTE({ input, windowMs, remainingMs, progress, mashTarget, sweetSpot }) {
    if (!this._qteEl) return;
    const ring = this._qteEl.querySelector('.fill');
    const remainingPct = Math.max(0, (remainingMs / windowMs) * 100);
    ring?.setAttribute('stroke-dasharray', `${remainingPct} 100`);

    const progressEl = this._qteEl.querySelector('#hud-qte-progress');
    if (input === 'mash' || input === 'alternate') {
      if (this._qteIndicator) {
        this._qteIndicator.style.left = '0%'; // clear any offset left by a timing QTE
        this._qteIndicator.style.width = `${(progress / mashTarget) * 100}%`;
      }
      if (progressEl) progressEl.textContent = `${progress} / ${mashTarget}`;
    } else {
      const elapsedPct = 100 - remainingPct;
      if (this._qteIndicator) {
        this._qteIndicator.style.width = '3px';
        this._qteIndicator.style.left = `${elapsedPct}%`;
      }
      if (progressEl && sweetSpot) progressEl.textContent = 'Hit the green zone';
    }
  }

  _hideQTE() {
    if (!this._qteEl) return;
    const el = this._qteEl;
    if (el.style.display !== 'none' && !el.classList.contains('qte-hiding')) {
      // Rapid fade (120 ms) so the prompt never obscures the hit reaction
      el.classList.add('qte-hiding');
      clearTimeout(this._qteHideTimer);
      this._qteHideTimer = setTimeout(() => {
        el.style.display = 'none';
        el.classList.remove('qte-hiding');
      }, 130);
    }
    if (this._mobileBtnEl) this._mobileBtnEl.style.display = 'none';
    const alternateEl = el.querySelector('#hud-qte-alternate');
    if (alternateEl) alternateEl.style.display = 'none';
  }

  /** Short "SHARK HARPOONED +points" confirmation at the top of the screen. */
  _showSharkConfirm({ points = 0 } = {}) {
    if (!this._bonusBoxEl) return;
    const el = document.createElement('div');
    el.className = 'shark-confirm-text';
    el.textContent = `SHARK HARPOONED +${points}`;
    this._bonusBoxEl.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  /** Non-blocking banner around the top of the screen (auto-hides after ~2 s). */
  _showBanner({ label = '' } = {}) {
    const banner = this._el?.querySelector('#hud-banner');
    if (!banner || !label) return;
    clearTimeout(this._bannerTimer);
    banner.textContent = label;
    banner.style.display = 'block';
    banner.classList.toggle('hidden', false);
    this._bannerTimer = setTimeout(() => {
      banner.classList.add('hidden');
      this._bannerTimer = setTimeout(() => { banner.style.display = 'none'; }, 260);
    }, 2000);
  }

  /** Siren pull: tint the wheel and glow the screen edge the ship is dragged toward. */
  _updateSirenPull({ intensity = 0, steerPull = 0 } = {}) {
    if (!this._el) return;
    const container = this._el.querySelector('#hud-wheel-container');
    if (container) {
      container.classList.toggle('siren-pull', intensity > 0.01);
      container.style.setProperty('--siren-pull', String(Math.min(1, intensity)));
    }
    // steerPull < 0 drags the nose screen-left; > 0 drags it screen-right.
    const side = steerPull < -0.01 ? 'left' : steerPull > 0.01 ? 'right' : null;
    this._el.querySelectorAll('.hud-siren-edge').forEach(edgeEl => {
      const active = side !== null && edgeEl.classList.contains(side) && intensity > 0.01;
      edgeEl.style.opacity = active ? String(Math.min(1, 0.35 + intensity)) : '0';
    });
  }

  teardown() {
    this.unmount();
    off('uiMount'); off('uiUnmount');
    off('playerHealth');
    off('playerWaterLevel');
    off('qteStart'); off('qteUpdate'); off('qteSuccess'); off('qteFail');
    off('scoreAdded', this._onScore);
  }
}

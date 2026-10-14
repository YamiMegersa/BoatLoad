import { emit, on, off } from '../core/EventBus.js';
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
    this._qteTimer    = null;
    this._mobileBtnEl = null;
    this._scoreEl     = null;
    this._bonusBoxEl  = null;
    this._score       = 0;

    this._onScore = d => this._onScoreAdded(d);

    on('uiMount',          d => { if (d.screen === 'obstacle') this.mount(d); });
    on('uiUnmount',        d => { if (d.screen === 'obstacle') this.unmount(); });
    on('playerHealth',     d => this._updateHP(d.hp, d.max));
    on('playerWaterLevel', d => this._updateWater(d.level, d.max));
    on('qteStart',          d => this._showQTE(d));
    on('qteSuccess',        () => this._hideQTE());
    on('qteFail',           () => this._hideQTE());
    on('scoreAdded',       this._onScore);
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

      <!-- Interactive QTE Reticle Prompt -->
      <div id="hud-qte" style="display:none">
        <div id="hud-qte-action">HARPOON!</div>
        <div id="hud-qte-key">Press [ H ] or TAP</div>
        <svg id="hud-qte-ring" viewBox="0 0 36 36">
          <circle class="track" cx="18" cy="18" r="16"/>
          <circle class="fill"  cx="18" cy="18" r="16" stroke-dasharray="100 100"/>
        </svg>
      </div>

      <!-- Dedicated Mobile Harpoon Button for left thumb -->
      <div id="hud-mobile-harpoon" style="display: none;">
        <button id="btn-mobile-harpoon" type="button" aria-label="Harpoon Action">
          <span class="harpoon-icon">🔱</span>
          <span class="harpoon-text">HARPOON</span>
        </button>
      </div>

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
    this._wheel = this._el.querySelector('#hud-wheel');
    this._mobileBtnEl = this._el.querySelector('#hud-mobile-harpoon');
    this._scoreEl = this._el.querySelector('#hud-score-val');
    this._bonusBoxEl = this._el.querySelector('#hud-bonus-container');

    // Click/Tap on QTE reticle
    this._qteEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      emit('qteTap');
    });

    // Tap on dedicated mobile Harpoon button
    const mobileBtn = this._el.querySelector('#btn-mobile-harpoon');
    if (mobileBtn) {
      mobileBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        emit('qteTap');
      });
    }
    
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

    document.getElementById('ui-root')?.appendChild(this._el);
  }

  unmount() {
    if (this._onDenseFogChanged) {
      off('denseFogChanged', this._onDenseFogChanged);
      this._onDenseFogChanged = null;
    }
    clearInterval(this._qteTimer);
    this._el?.remove();
    this._el          = null;
    this._hpBar       = null;
    this._waterBar    = null;
    this._qteEl       = null;
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

  _showQTE({ type, windowMs, key }) {
    if (!this._qteEl) return;
    this._qteEl.style.display = 'flex';

    const actionEl = this._qteEl.querySelector('#hud-qte-action');
    const keyEl    = this._qteEl.querySelector('#hud-qte-key');
    const keyLabel = (key || '').replace(/^Key/, '').replace(/^Digit/, '');

    if (type === 'HARPOON') {
      if (actionEl) actionEl.textContent = '🎯 HARPOON!';
      if (keyEl) keyEl.textContent = `Press [ ${keyLabel || 'H'} ] or TAP`;
      if (this._mobileBtnEl) this._mobileBtnEl.style.display = 'block';
    } else if (type === 'RESIST') {
      if (actionEl) actionEl.textContent = '⚠️ BAIL WATER!';
      if (keyEl) keyEl.textContent = `Press [ ${keyLabel || 'Shift'} ] or TAP`;
      if (this._mobileBtnEl) this._mobileBtnEl.style.display = 'none';
    } else {
      if (actionEl) actionEl.textContent = `${type}!`;
      if (keyEl) keyEl.textContent = `Press [ ${keyLabel} ] or TAP`;
      if (this._mobileBtnEl) this._mobileBtnEl.style.display = 'none';
    }

    const ring = this._qteEl.querySelector('.fill');
    const start = Date.now();
    clearInterval(this._qteTimer);
    this._qteTimer = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct     = Math.max(0, 100 - (elapsed / windowMs) * 100);
      ring.setAttribute('stroke-dasharray', `${pct} 100`);
      if (elapsed >= windowMs) clearInterval(this._qteTimer);
    }, 33);
  }

  _hideQTE() {
    clearInterval(this._qteTimer);
    if (this._qteEl) this._qteEl.style.display = 'none';
    if (this._mobileBtnEl) this._mobileBtnEl.style.display = 'none';
  }

  teardown() {
    this.unmount();
    off('uiMount'); off('uiUnmount');
    off('playerHealth');
    off('playerWaterLevel');
    off('qteStart'); off('qteSuccess'); off('qteFail');
    off('scoreAdded', this._onScore);
  }
}

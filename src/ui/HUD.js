import { emit, on, off } from '../core/EventBus.js';
import wheelImage from '../assets/wheels/wheel_threshold.png';

/**
 * HUD — obstacle phase HUD overlay.
 *
 * Displays:
 *  - Hull HP bar (top-left)
 *  - Day indicator (top-right)
 *  - QTE prompt (centre — shown only when active)
 *  - Cannon ammo (bottom)
 */
export class HUD {
  constructor() {
    this._el     = null;
    this._hpBar  = null;
    this._waterBar = null;
    this._qteEl  = null;
    this._qteTimer = null;

    // Kraken boss HUD state
    this._bossHPBar = null;
    this._bossTimerEl = null;
    this._bossWaypointEl = null;
    this._bossBannerEl = null;
    this._bossBannerTimeout = null;

    on('uiMount',      d => { if (d.screen === 'obstacle') this.mount(d); });
    on('uiUnmount',    d => { if (d.screen === 'obstacle') this.unmount(); });
    on('playerHealth', d => this._updateHP(d.hp, d.max));
    on('playerWaterLevel', d => this._updateWater(d.level, d.max));
    on('qteStart',      d => this._showQTE(d));
    on('qteSuccess',    () => this._hideQTE());
    on('qteFail',       () => this._hideQTE());

    // Kraken boss events
    on('krakenFightStarted',    d => this._showBossHUD(d));
    on('krakenHealthChanged',   d => this._updateBossHP(d.hp, d.maxHP));
    on('krakenRaceTimerUpdate', d => this._updateBossTimer(d.timeRemaining));
    on('krakenWaypointProgress',d => this._updateBossWaypoints(d.current, d.total));
    on('krakenRaceStarted',     d => this._onRaceStarted(d));
    on('krakenTentacleCaught',  () => this._showBossBanner('🐙 TENTACLE CAUGHT!', '#00cc44'));
    on('krakenDefeated',        () => this._showBossBanner('⚔️ KRAKEN DEFEATED!', '#ffaa00', 5000));
    on('krakenCinematicStart',  () => this._setBossTimerVisible(false));
    on('krakenCinematicEnd',    () => this._setBossTimerVisible(true));
  }

  mount({ day } = {}) {
    if (this._el) this.unmount();

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
      <div id="hud-qte" style="display:none">
        <div id="hud-qte-key"></div>
        <svg id="hud-qte-ring" viewBox="0 0 36 36">
          <circle class="track" cx="18" cy="18" r="16"/>
          <circle class="fill"  cx="18" cy="18" r="16" stroke-dasharray="100 100"/>
        </svg>
      </div>
      <div id="hud-ammo">🔫 ∞</div>

      <!-- Kraken Boss HUD (hidden until fight starts) -->
      <div id="hud-boss" style="display:none; position:fixed; top:15px; left:50%; transform:translateX(-50%); text-align:center; z-index:100; pointer-events:none;">
        <div style="color:#ff6644; font-weight:bold; font-size:14px; text-transform:uppercase; letter-spacing:2px; margin-bottom:4px; text-shadow:0 0 8px rgba(255,60,30,0.6);">🐙 KRAKEN</div>
        <div id="hud-boss-hp-track" style="width:300px; height:14px; background:rgba(0,0,0,0.6); border:1px solid #ff4422; border-radius:7px; overflow:hidden;">
          <div id="hud-boss-hp-bar" style="width:100%; height:100%; background:linear-gradient(90deg, #ff2200, #ff6644); transition:width 0.4s ease;"></div>
        </div>
        <div id="hud-boss-timer" style="display:none; color:#ffcc00; font-size:28px; font-weight:bold; margin-top:8px; text-shadow:0 0 10px rgba(255,200,0,0.5); font-family:monospace;"></div>
        <div id="hud-boss-waypoints" style="display:none; color:#ffffff; font-size:14px; margin-top:4px;"></div>
      </div>

      <!-- Kraken Banner (flash messages) -->
      <div id="hud-boss-banner" style="display:none; position:fixed; top:40%; left:50%; transform:translate(-50%,-50%); font-size:48px; font-weight:bold; color:#00cc44; text-shadow:0 0 20px rgba(0,200,60,0.6), 0 4px 12px rgba(0,0,0,0.8); pointer-events:none; z-index:200; animation:bossBannerPop 0.4s ease-out;"></div>
      
      <!-- Steering Wheel -->
      <div id="hud-wheel-container" style="position: fixed; bottom: 30px; right: 30px; pointer-events: auto;">
        <img id="hud-wheel" src="${wheelImage}" style="width: 350px; height: 350px; transform-origin: center; touch-action: none; user-select: none; cursor: grab; filter: drop-shadow(0 10px 20px rgba(0,0,0,0.5));">
      </div>
    `;

    // Inject banner animation keyframes if not already present
    if (!document.getElementById('boss-banner-style')) {
      const style = document.createElement('style');
      style.id = 'boss-banner-style';
      style.textContent = `
        @keyframes bossBannerPop {
          0% { transform: translate(-50%,-50%) scale(0.3); opacity: 0; }
          60% { transform: translate(-50%,-50%) scale(1.1); opacity: 1; }
          100% { transform: translate(-50%,-50%) scale(1.0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    this._hpBar = this._el.querySelector('#hud-hp-bar');
    this._waterBar = this._el.querySelector('#hud-water-bar');
    this._qteEl = this._el.querySelector('#hud-qte');
    this._wheel = this._el.querySelector('#hud-wheel');
    
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
    this._el    = null;
    this._hpBar = null;
    this._waterBar = null;
    this._qteEl = null;
  }

  _updateHP(hp, maxHP) {
    if (!this._hpBar) return;
    const pct = Math.max(0, Math.min(100, (hp / maxHP) * 100));
    this._hpBar.style.width = `${pct}%`;
    this._hpBar.style.background = pct < 25 ? '#f44336' : pct < 50 ? '#ff9800' : '#4caf50';
    const valEl = this._el.querySelector('#hud-hp-val');
    if (valEl) valEl.textContent = `${Math.floor(pct)}%`;
  }

  _updateWater(level, maxLevel) {
    if (!this._waterBar) return;
    const pct = Math.max(0, Math.min(100, (level / maxLevel) * 100));
    this._waterBar.style.width = `${pct}%`;
    this._waterBar.style.background = pct > 75 ? '#f44336' : pct > 50 ? '#ff9800' : '#2196f3';
    const valEl = this._el.querySelector('#hud-water-val');
    if (valEl) valEl.textContent = `${Math.floor(pct)}%`;
  }

  _showQTE({ type, windowMs, key }) {
    if (!this._qteEl) return;
    this._qteEl.style.display = 'flex';
    this._qteEl.querySelector('#hud-qte-key').textContent = `Press ${key}`;

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
  }

  // -----------------------------------------------------------------------
  // Kraken Boss HUD methods
  // -----------------------------------------------------------------------

  _showBossHUD({ totalHP, tentacleCount }) {
    if (!this._el) return;
    const bossEl = this._el.querySelector('#hud-boss');
    if (bossEl) bossEl.style.display = 'block';
    this._bossHPBar = this._el.querySelector('#hud-boss-hp-bar');
    this._bossTimerEl = this._el.querySelector('#hud-boss-timer');
    this._bossWaypointEl = this._el.querySelector('#hud-boss-waypoints');
    this._bossBannerEl = this._el.querySelector('#hud-boss-banner');
  }

  _updateBossHP(hp, maxHP) {
    if (!this._bossHPBar) return;
    const pct = Math.max(0, Math.min(100, (hp / maxHP) * 100));
    this._bossHPBar.style.width = `${pct}%`;
  }

  _updateBossTimer(timeRemaining) {
    if (!this._bossTimerEl) return;
    const t = Math.max(0, timeRemaining);
    this._bossTimerEl.textContent = t.toFixed(1) + 's';
    // Flash red when time is low
    this._bossTimerEl.style.color = t < 5 ? '#ff2200' : '#ffcc00';
    if (t < 5) {
      this._bossTimerEl.style.textShadow = '0 0 15px rgba(255,30,0,0.8)';
    } else {
      this._bossTimerEl.style.textShadow = '0 0 10px rgba(255,200,0,0.5)';
    }
  }

  _updateBossWaypoints(current, total) {
    if (!this._bossWaypointEl) return;
    this._bossWaypointEl.textContent = `Checkpoint ${current} / ${total}`;
  }

  _onRaceStarted({ tentacleIdx, waypoints, timeLimit }) {
    if (!this._bossTimerEl || !this._bossWaypointEl) return;
    this._bossTimerEl.style.display = 'block';
    this._bossWaypointEl.style.display = 'block';
    this._bossWaypointEl.textContent = `Checkpoint 0 / ${waypoints}`;
  }

  _setBossTimerVisible(visible) {
    if (this._bossTimerEl) this._bossTimerEl.style.display = visible ? 'block' : 'none';
    if (this._bossWaypointEl) this._bossWaypointEl.style.display = visible ? 'block' : 'none';
  }

  _showBossBanner(text, color = '#00cc44', durationMs = 2000) {
    if (!this._el) return;
    const banner = this._el.querySelector('#hud-boss-banner') || this._bossBannerEl;
    if (!banner) return;

    clearTimeout(this._bossBannerTimeout);
    banner.textContent = text;
    banner.style.color = color;
    banner.style.textShadow = `0 0 20px ${color}88, 0 4px 12px rgba(0,0,0,0.8)`;
    banner.style.display = 'block';
    banner.style.animation = 'none';
    // Force reflow to restart animation
    void banner.offsetWidth;
    banner.style.animation = 'bossBannerPop 0.4s ease-out';

    this._bossBannerTimeout = setTimeout(() => {
      banner.style.display = 'none';
    }, durationMs);
  }

  teardown() {
    this.unmount();
    off('uiMount'); off('uiUnmount');
    off('playerWaterLevel');
    off('qteStart'); off('qteSuccess'); off('qteFail');
    off('krakenFightStarted'); off('krakenHealthChanged');
    off('krakenRaceTimerUpdate'); off('krakenWaypointProgress');
    off('krakenRaceStarted'); off('krakenTentacleCaught');
    off('krakenDefeated');
    off('krakenCinematicStart'); off('krakenCinematicEnd');
    clearTimeout(this._bossBannerTimeout);
  }
}

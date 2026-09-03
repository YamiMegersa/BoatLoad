import { on, off } from '../core/EventBus.js';

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

    on('uiMount',      d => { if (d.screen === 'obstacle') this.mount(d); });
    on('uiUnmount',    d => { if (d.screen === 'obstacle') this.unmount(); });
    on('playerHealth', d => this._updateHP(d.hp, d.max));
    on('playerWaterLevel', d => this._updateWater(d.level, d.max));
    on('qteStart',      d => this._showQTE(d));
    on('qteSuccess',    () => this._hideQTE());
    on('qteFail',       () => this._hideQTE());
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
      <div id="hud-qte" style="display:none">
        <div id="hud-qte-key"></div>
        <svg id="hud-qte-ring" viewBox="0 0 36 36">
          <circle class="track" cx="18" cy="18" r="16"/>
          <circle class="fill"  cx="18" cy="18" r="16" stroke-dasharray="100 100"/>
        </svg>
      </div>
      <div id="hud-ammo">🔫 ∞</div>
    `;

    this._hpBar = this._el.querySelector('#hud-hp-bar');
    this._waterBar = this._el.querySelector('#hud-water-bar');
    this._qteEl = this._el.querySelector('#hud-qte');

    document.getElementById('ui-root')?.appendChild(this._el);
  }

  unmount() {
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

  teardown() {
    this.unmount();
    off('uiMount'); off('uiUnmount');
    off('playerWaterLevel');
    off('qteStart'); off('qteSuccess'); off('qteFail');
  }
}

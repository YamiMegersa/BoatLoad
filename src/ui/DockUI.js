import { on } from '../core/EventBus.js';

export class DockUI {
  constructor() {
    this._el = null;
    on('uiMount', d => { if (d.screen === 'dock') this.mount(); });
    on('uiUnmount', d => { if (d.screen === 'dock') this.unmount(); });
  }

  mount() {
    if (this._el) this.unmount();
    this._el = document.createElement('div');
    this._el.id = 'dock-ui';
    this._el.style.cssText = `
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(10, 15, 25, 0.9);
      color: white;
      padding: 20px;
      border-radius: 8px;
      border: 2px solid #9A5B2E;
      text-align: center;
      z-index: 100;
      font-family: sans-serif;
    `;
    this._el.innerHTML = `
      <h2 style="margin: 0 0 10px 0; color: #e6d3a3;">Dock</h2>
      <p style="margin: 0; font-size: 14px; opacity: 0.8;">Select a destination to continue.</p>
    `;
    document.getElementById('ui-root')?.appendChild(this._el);
  }

  unmount() {
    this._el?.remove();
    this._el = null;
  }
}

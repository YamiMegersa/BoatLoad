import { on, off } from '../core/EventBus.js';

export class MainMenuUI {
  constructor() {
    this._el = document.createElement('div');
    
    // Using inline styles to guarantee it appears on top of everything
    this._el.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 9999;
      background: rgba(0, 0, 0, 0.7);
      padding: 40px 80px;
      border: 4px solid white;
      border-radius: 12px;
      color: white;
      font-family: sans-serif;
      text-align: center;
      display: none;
      pointer-events: none;
    `;

    this._el.innerHTML = `
      <h1 style="font-size: 64px; margin: 0; text-transform: uppercase; letter-spacing: 2px;">Boat Load</h1>
    `;

    on('uiMount', (d) => {
      if (d.screen === 'main-menu') {
        this.mount();
      }
    });

    on('uiUnmount', (d) => {
      if (d.screen === 'main-menu') {
        this.unmount();
      }
    });
  }

  mount() {
    this._el.style.display = 'block';
    if (!this._el.parentNode) {
      document.body.appendChild(this._el);
    }
  }

  unmount() {
    this._el.style.display = 'none';
  }
}

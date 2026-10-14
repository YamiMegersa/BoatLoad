import { emit, on, off } from '../core/EventBus.js';

export class PauseMenu {
  constructor() {
    this._el = null;
    on('uiMount', d => { if (d.screen === 'pause') this.mount(); });
    on('uiUnmount', d => { if (d.screen === 'pause') this.unmount(); });
  }

  mount() {
    if (this._el) this.unmount();

    this._el = document.createElement('div');
    this._el.id = 'pause-screen';
    this._el.style.cssText = `
      position: absolute; inset: 0; z-index: 200;
      background: rgba(0, 0, 0, 0.7); color: white;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      font-family: sans-serif;
    `;
    this._el.innerHTML = `
      <h1 style="font-family: serif; color: #f3e3b4; font-size: 3rem; margin-bottom: 2rem;">Paused</h1>
      <div style="display: flex; flex-direction: column; gap: 1rem; width: 250px;">
        <button id="btn-resume" class="pause-btn">Resume</button>
        <button id="btn-restart" class="pause-btn">Restart Phase</button>
        <button id="btn-shipyard" class="pause-btn">Back to Shipyard</button>
        <button id="btn-title" class="pause-btn" style="background: #a33; border-color: #f55;">Quit to Title</button>
      </div>
    `;

    this._el.querySelector('#btn-resume').addEventListener('click', () => {
      emit('resumeGame');
    });
    this._el.querySelector('#btn-restart').addEventListener('click', () => {
      emit('resumeGame');
      emit('restartPhase');
    });
    this._el.querySelector('#btn-shipyard').addEventListener('click', () => {
      emit('resumeGame');
      emit('gotoShipyard');
    });
    this._el.querySelector('#btn-title').addEventListener('click', () => {
      emit('resumeGame');
      emit('gotoTitle');
    });

    document.getElementById('ui-root')?.appendChild(this._el);
  }

  unmount() {
    this._el?.remove();
    this._el = null;
  }
}

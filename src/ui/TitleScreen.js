import { emit, on, off } from '../core/EventBus.js';

/**
 * TitleScreen — Main menu overlay
 */
export class TitleScreen {
  constructor() {
    this._el = null;

    on('uiMount', d => { if (d.screen === 'title') this.mount(); });
    on('uiUnmount', d => { if (d.screen === 'title') this.unmount(); });
  }

  mount() {
    if (this._el) this.unmount();

    this._el = document.createElement('div');
    this._el.id = 'title-screen';
    this._el.style.cssText = `
      position: absolute; inset: 0; z-index: 100;
      background: #222233; color: white;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      font-family: sans-serif;
    `;
    this._el.innerHTML = `
      <h1 style="font-family: serif; color: #f3e3b4; font-size: 4rem; margin-bottom: 0.5rem;">BoatLoad</h1>
      <h2 style="font-size: 1.5rem; margin-bottom: 2rem; font-weight: 300;">Shipwreck & Sail</h2>
      <button id="btn-start" style="
        background: #3a5a3a; color: white; border: none;
        padding: 1rem 2rem; font-size: 1.25rem; border-radius: 8px;
        cursor: pointer; text-transform: uppercase; font-weight: bold;
      ">Start Game</button>
    `;

    this._el.querySelector('#btn-start').addEventListener('click', () => {
      emit('startGame');
    });

    document.getElementById('ui-root')?.appendChild(this._el);
  }

  unmount() {
    this._el?.remove();
    this._el = null;
  }

  teardown() {
    this.unmount();
    off('uiMount');
    off('uiUnmount');
  }
}

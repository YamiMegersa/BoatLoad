import { emit, on } from '../core/EventBus.js';

export class ResultsUI {
  constructor() {
    this._el = null;
    on('uiMount', d => {
      if (d.screen === 'results') this.mount(d);
    });
    on('uiUnmount', d => {
      if (d.screen === 'results') this.unmount();
    });
  }

  mount({ passed, day }) {
    this.unmount();

    const title = passed ? `DAY ${day} COMPLETE` : 'VOYAGE LOST';
    const message = passed
      ? 'You made it safely to harbor. Your voyage is complete!'
      : 'Your ship needs repairs before you can sail again.';
    const buttonLabel = passed ? 'Return to Port' : 'Return to Shipyard';
    const phase = passed ? 'DOCK' : 'SHIPYARD';

    this._el = document.createElement('div');
    this._el.id = 'results-screen';
    this._el.setAttribute('role', 'dialog');
    this._el.setAttribute('aria-modal', 'true');
    this._el.style.cssText = `
      position: absolute; inset: 0; z-index: 250;
      display: flex; align-items: center; justify-content: center;
      padding: 24px; background: rgba(8, 20, 25, 0.78);
      color: #f3e3b4; font-family: 'IM Fell English', Georgia, serif;
    `;
    this._el.innerHTML = `
      <section style="
        width: min(520px, 100%); padding: 36px;
        text-align: center; background: #e6d2aa;
        border: 3px solid #9c6b3c; border-radius: 12px;
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
        color: #4a1f0a;
      ">
        <div aria-hidden="true" style="font-size: 42px; margin-bottom: 8px;">⚓</div>
        <h1 style="font-family: 'Cinzel', Georgia, serif; font-size: clamp(26px, 6vw, 38px); margin: 0 0 14px;">${title}</h1>
        <p style="font-size: 18px; line-height: 1.5; margin: 0 0 26px;">${message}</p>
        <button id="results-return" type="button" style="
          min-height: 48px; padding: 12px 24px; cursor: pointer;
          color: #f3e3b4; background: #321b10; border: 2px solid #d4af37;
          border-radius: 8px; font: 700 16px 'Cinzel', Georgia, serif;
        ">${buttonLabel}</button>
      </section>
    `;

    this._el.querySelector('#results-return').addEventListener('click', () => {
      emit('requestPhaseChange', { phase });
    });
    document.getElementById('ui-root')?.appendChild(this._el);
    this._el.querySelector('#results-return').focus();
  }

  unmount() {
    this._el?.remove();
    this._el = null;
  }
}

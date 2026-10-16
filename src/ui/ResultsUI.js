import { emit, on, off } from '../core/EventBus.js';

export class ResultsUI {
  constructor() {
    this._el = null;
    this._onMount = data => {
      if (data.screen === 'results') this.mount(data);
    };
    this._onUnmount = data => {
      if (data.screen === 'results') this.unmount();
    };
    on('uiMount', this._onMount);
    on('uiUnmount', this._onUnmount);
  }

  mount({ passed, day = 1, score = 0, qteStats }) {
    this.unmount();
    const stats = Object.entries(qteStats?.byType ?? {})
      .map(([type, values]) => `<li><strong>${type}</strong> — Perfect ${values.perfect}, Good ${values.good}, Miss ${values.miss}</li>`)
      .join('') || '<li>No QTEs encountered this voyage.</li>';

    const nextDay = Math.min(7, (day || 1) + 1);

    this._el = document.createElement('section');
    this._el.id = 'results-ui';
    this._el.innerHTML = `
      <div style="background: rgba(18, 24, 38, 0.95); border: 2px solid #d4af37; border-radius: 12px; padding: 32px 40px; max-width: 520px; margin: 0 auto; box-shadow: 0 12px 40px rgba(0,0,0,0.8);">
        <h1 style="color: ${passed ? '#4ade80' : '#f87171'}; font-size: 28px; margin-bottom: 8px;">
          ${passed ? '🏁 SAFE HARBOR REACHED!' : '⚠️ SHIP LOST AT SEA'}
        </h1>
        <p style="font-size: 15px; opacity: 0.9; margin-bottom: 16px;">
          ${passed ? `Splendid sailing! Day ${day} voyage completed successfully.` : `The vessel took critical hull damage and sank.`}
        </p>
        <p style="font-size: 14px; margin-bottom: 20px;">Day ${day} Score: <strong style="color: #ffd700;">${score}</strong></p>
        
        <h2 style="font-size: 18px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 6px; margin-bottom: 12px;">Seamanship &amp; QTEs</h2>
        <ul style="text-align: left; margin-bottom: 24px; font-size: 13px;">${stats}</ul>

        <div class="results-actions" style="display: flex; flex-direction: column; gap: 10px;">
          ${passed ? `
            ${day < 7 ? `<button type="button" data-results-action="next-day" style="background: linear-gradient(135deg, #10b981, #059669); font-weight: bold; font-size: 15px;">⚓ Proceed to Day ${nextDay}</button>` : ''}
            <button type="button" data-results-action="dock" style="background: #2563eb;">🚪 Return to Dock</button>
            <button type="button" data-results-action="title" style="background: #475569;">📜 Select Level / Main Menu</button>
          ` : `
            <button type="button" data-results-action="retry" style="background: linear-gradient(135deg, #e11d48, #be123c); font-weight: bold; font-size: 15px;">🔄 Retry Day ${day}</button>
            <button type="button" data-results-action="shipyard" style="background: #2563eb;">🔨 Dry Dock / Alter Ship</button>
            <button type="button" data-results-action="title" style="background: #475569;">📜 Select Level / Main Menu</button>
          `}
        </div>
      </div>
    `;

    this._el.querySelector('[data-results-action="next-day"]')?.addEventListener('click', () => {
      emit('requestPhaseChange', { phase: 'DOCK', day: nextDay });
    });
    this._el.querySelector('[data-results-action="retry"]')?.addEventListener('click', () => {
      emit('requestPhaseChange', { phase: 'DOCK', day });
    });
    this._el.querySelector('[data-results-action="dock"]')?.addEventListener('click', () => {
      emit('requestPhaseChange', { phase: 'DOCK', day });
    });
    this._el.querySelector('[data-results-action="shipyard"]')?.addEventListener('click', () => emit('gotoShipyard'));
    this._el.querySelector('[data-results-action="title"]')?.addEventListener('click', () => emit('gotoTitle'));
    document.getElementById('ui-root')?.appendChild(this._el);
  }

  unmount() {
    this._el?.remove();
    this._el = null;
  }

  teardown() {
    this.unmount();
    off('uiMount', this._onMount);
    off('uiUnmount', this._onUnmount);
  }
}

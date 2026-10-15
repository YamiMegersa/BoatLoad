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

  mount({ passed, day, score, qteStats }) {
    this.unmount();
    const stats = Object.entries(qteStats?.byType ?? {})
      .map(([type, values]) => `<li><strong>${type}</strong> — Perfect ${values.perfect}, Good ${values.good}, Miss ${values.miss}</li>`)
      .join('') || '<li>No QTEs resolved this run.</li>';

    this._el = document.createElement('section');
    this._el.id = 'results-ui';
    this._el.innerHTML = `
      <h1>${passed ? 'VOYAGE COMPLETE' : 'SHIP LOST'}</h1>
      <p>Day ${day} score: <strong>${score}</strong></p>
      ${passed ? `
      <h2>QTE Report</h2>
      <ul>${stats}</ul>` : ''}
      <div class="results-actions">
        <button type="button" data-results-action="shipyard">Return to Shipyard</button>
        <button type="button" data-results-action="title">Main Menu</button>
      </div>
    `;
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

import { on, off } from '../core/EventBus.js';

/**
 * DocketSheet — DOM overlay showing the customer's repair checklist.
 *
 * Mounts/unmounts itself in response to 'uiMount' / 'uiUnmount' EventBus events.
 * Individual items check off when 'docketItemCompleted' fires.
 * The "Set Sail" button activates only when 'allRepairsDone' fires.
 */
export class DocketSheet {
  constructor() {
    this._el         = null;
    this._items      = [];
    this._onAllDone  = null;

    on('uiMount',            d => { if (d.screen === 'shipyard' && d.docket) this.mount(d.docket); });
    on('uiUnmount',          d => { if (d.screen === 'shipyard') this.unmount(); });
    on('docketItemCompleted', d => this._checkOff(d.itemId));
    on('allRepairsDone',      () => this._enableSailButton());
  }

  // -------------------------------------------------------------------------

  mount(docket) {
    if (this._el) this.unmount();

    this._items = docket;
    this._el = document.createElement('div');
    this._el.id = 'docket-sheet';
    this._el.innerHTML = this._buildHTML(docket);

    document.getElementById('ui-root')?.appendChild(this._el);
  }

  unmount() {
    this._el?.remove();
    this._el = null;
  }

  // -------------------------------------------------------------------------

  _checkOff(itemId) {
    const row = this._el?.querySelector(`[data-item="${itemId}"]`);
    if (row) row.classList.add('completed');
  }

  _enableSailButton() {
    const btn = this._el?.querySelector('#sail-btn');
    if (btn) {
      btn.disabled = false;
      btn.textContent = '⛵ Set Sail!';
    }
  }

  _buildHTML(docket) {
    const rows = docket.map(item => `
      <li class="docket-item ${item.mandatory ? '' : 'optional'}" data-item="${item.id}">
        <span class="check">☐</span>
        <span class="label">${item.label}</span>
        ${item.mandatory ? '' : '<span class="tag">optional</span>'}
      </li>
    `).join('');

    return `
      <div class="docket-inner">
        <h2>Repair Docket</h2>
        <ul class="docket-list">${rows}</ul>
        <button id="sail-btn" disabled>Complete all repairs first</button>
      </div>
    `;
  }

  teardown() {
    this.unmount();
    off('uiMount');
    off('uiUnmount');
    off('docketItemCompleted');
    off('allRepairsDone');
  }
}

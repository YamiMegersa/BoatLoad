import { emit, on, off } from '../core/EventBus.js';
import { DEBUG } from '../utils/debug.js';

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
    on('docketProgress',       d => this._updateProgress(d));
    on('allRepairsDone',      () => this._enableSailButton());
  }

  // -------------------------------------------------------------------------

  mount(docket) {
    if (this._el) this.unmount();

    this._items = docket;
    this._el = document.createElement('div');
    this._el.id = 'docket-sheet';
    this._el.innerHTML = this._buildHTML();
    const list = this._el.querySelector('.docket-list');
    for (const item of docket) list.appendChild(this._buildItem(item));
    if (DEBUG && docket.length) this._appendDebugMap(docket);

    this._el.querySelector('#sail-btn').addEventListener('click', () => {
      emit('startSailing');
    });

    document.getElementById('ui-root')?.appendChild(this._el);
  }

  unmount() {
    this._el?.remove();
    this._el = null;
  }

  // -------------------------------------------------------------------------

  _checkOff(itemId) {
    const row = this._findRow(itemId);
    if (!row) return;
    row.classList.add('completed');
    const check = row.querySelector('.check');
    if (check) check.textContent = '✓';
  }

  _updateProgress({ itemId, remaining, total, completed }) {
    const row = this._findRow(itemId);
    if (!row) return;
    const progress = row.querySelector('.docket-progress');
    if (progress) progress.textContent = `${total - remaining}/${total} repaired`;
    if (completed) this._checkOff(itemId);
  }

  _findRow(itemId) {
    return this._items.find(item => item.id === itemId)
      ? [...(this._el?.querySelectorAll('.docket-item') ?? [])].find(row => row.dataset.item === itemId)
      : null;
  }

  _buildItem(item) {
    const row = document.createElement('li');
    row.className = `docket-item ${item.mandatory ? '' : 'optional'}${item.completed ? ' completed' : ''}`;
    row.dataset.item = item.id;

    const check = document.createElement('span');
    check.className = 'check';
    check.textContent = item.completed ? '✓' : '☐';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = item.label;
    const progress = document.createElement('span');
    progress.className = 'docket-progress';
    progress.textContent = `${item.total - item.remaining}/${item.total} repaired`;
    row.append(check, label, progress);
    if (!item.mandatory) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'optional';
      row.appendChild(tag);
    }
    if (item.tool) {
      const tool = document.createElement('span');
      tool.className = 'docket-tool';
      tool.textContent = item.tool;
      row.appendChild(tool);
    }
    return row;
  }

  _appendDebugMap(docket) {
    const panel = document.createElement('details');
    panel.className = 'docket-debug-map';
    const summary = document.createElement('summary');
    summary.textContent = 'Debug: damaged cells → tasks';
    panel.appendChild(summary);
    for (const task of docket) {
      const mapping = document.createElement('div');
      mapping.textContent = `${task.label}: ${task.targetCells.map(({ x, y, z }) => `(${x}, ${y}, ${z})`).join(', ')}`;
      panel.appendChild(mapping);
    }
    this._el.querySelector('.docket-inner').appendChild(panel);
  }

  _enableSailButton() {
    const btn = this._el?.querySelector('#sail-btn');
    if (btn) {
      btn.disabled = false;
      btn.textContent = '⛵ Set Sail!';
    }
  }

  _buildHTML() {
    return `
      <div class="docket-inner">
        <h2>Repair Docket</h2>
        <ul class="docket-list"></ul>
        <button id="sail-btn" disabled>Complete all repairs first</button>
      </div>
    `;
  }

  teardown() {
    this.unmount();
    off('uiMount');
    off('uiUnmount');
    off('docketItemCompleted');
    off('docketProgress');
    off('allRepairsDone');
  }
}

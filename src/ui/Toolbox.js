import { emit, on, off } from '../core/EventBus.js';

/**
 * Toolbox — right-panel tool selection HUD for the Shipyard phase.
 *
 * Emits 'toolSelected' when the player clicks a tool icon.
 * Listens to 'uiMount'/'uiUnmount' for lifecycle.
 */

const TOOLS = [
  { id: 'hammer',      label: 'Repair Wood',     emoji: '🔨', day: 1 },
  { id: 'wood_block',  label: 'Wood Block',      emoji: '🪵', day: 1 },
  { id: 'needle',      label: 'Repair Sail',     emoji: '🧵', day: 1 },
  { id: 'sail_cloth',  label: 'Sail Cloth',      emoji: '⛵', day: 1 },
  { id: 'bucket',      label: 'Water Bucket',    emoji: '🪣', day: 1 },
  { id: 'metal_plate', label: 'Metal Plate',     emoji: '🛡️', day: 2 },
];

export class Toolbox {
  constructor() {
    this._el = null;
    this._day = 1;

    on('uiMount',   d => { if (d.screen === 'shipyard') this.mount(d.day ?? 1); });
    on('uiUnmount', d => { if (d.screen === 'shipyard') this.unmount(); });
  }

  mount(day = 1) {
    this._day = day;
    if (this._el) this.unmount();

    this._el = document.createElement('div');
    this._el.id = 'toolbox';

    const tools = TOOLS.filter(t => t.day <= day);
    this._el.innerHTML = `
      <h3>Toolbox</h3>
      <div class="tool-grid">
        ${tools.map(t => `
          <button class="tool-btn" data-tool="${t.id}" title="${t.label}">
            <span class="tool-icon">${t.emoji}</span>
            <span class="tool-label">${t.label}</span>
          </button>
        `).join('')}
      </div>
    `;

    this._el.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._el.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        emit('toolSelected', { toolId: btn.dataset.tool });
      });
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

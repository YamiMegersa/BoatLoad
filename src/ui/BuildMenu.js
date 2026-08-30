import { emit, on } from '../core/EventBus.js';

export const BLUEPRINTS = {
  wood_block: { id: 'wood_block', label: 'Wood Block', icon: '🪵', size: [1, 1, 1], color: 0x8b5a2b },
  wood_plank: { id: 'wood_plank', label: 'Wood Plank', icon: '📏', size: [1, 1, 3], color: 0x9c6b3c },
  wood_panel: { id: 'wood_panel', label: 'Wood Panel', icon: '🚪', size: [3, 3, 1], color: 0xa0522d }
};

export class BuildMenu {
  constructor() {
    this._el = document.createElement('div');
    this._el.id = 'toolbox'; // Keep the ID for styling purposes
    this._el.innerHTML = `
      <h3>Build Menu</h3>
      <div class="tool-grid" id="blueprint-list"></div>
    `;

    this._activeBlueprint = 'wood_block';
    
    // We emit an event to notify the BuildSystem of the initial tool
    setTimeout(() => {
      emit('blueprintSelected', { blueprintId: this._activeBlueprint });
    }, 0);

    on('uiMount', d => { if (d.screen === 'shipyard') this.mount(document.getElementById('ui-root')); });
    on('uiUnmount', d => { if (d.screen === 'shipyard') this.unmount(); });
  }

  mount(parent) {
    parent.appendChild(this._el);
    this._renderItems();
  }

  unmount() {
    this._el.remove();
  }

  _renderItems() {
    const list = this._el.querySelector('#blueprint-list');
    list.innerHTML = '';

    for (const [id, bp] of Object.entries(BLUEPRINTS)) {
      const btn = document.createElement('button');
      btn.className = `tool-btn ${this._activeBlueprint === id ? 'active' : ''}`;
      
      const sizeStr = `${bp.size[0]}x${bp.size[1]}x${bp.size[2]}`;
      btn.innerHTML = `
        <span class="tool-icon">${bp.icon}</span>
        <div style="display:flex; flex-direction:column; align-items:flex-start;">
          <span>${bp.label}</span>
          <span style="font-size:11px; opacity:0.7;">Size: ${sizeStr}</span>
        </div>
      `;
      
      btn.addEventListener('click', () => {
        this._activeBlueprint = id;
        emit('blueprintSelected', { blueprintId: id });
        this._renderItems(); // Re-render to update active state
      });
      
      list.appendChild(btn);
    }
  }
}

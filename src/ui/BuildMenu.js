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
      
      <div style="margin-top: 20px; border-top: 1px solid #444; padding-top: 10px;">
        <h4>Paper Shader Tweaks</h4>
        <div style="margin-bottom: 10px; color: white; font-size: 14px;">
          <label style="display:flex; align-items:center;">
            <input type="checkbox" id="shipyard-paper-shader-check" checked style="margin-right: 8px;">
            Enable Paper Shader
          </label>
        </div>
        <div style="margin-bottom: 10px; color: white; font-size: 14px;">
          <label style="display:flex; justify-content:space-between;">
            Shading Style: 
            <select id="shipyard-paper-style-select" style="background:#222; color:white; border:1px solid #555;">
              <option value="0">Hatching</option>
              <option value="1">Kuwahara (Painterly)</option>
            </select>
          </label>
        </div>
        <div style="margin-bottom: 10px; color: white; font-size: 14px;">
          <label style="display:flex; justify-content:space-between;">
            Hatch Scale: <span id="shipyard-paper-hatch-val">10.0</span>
          </label>
          <input type="range" id="shipyard-paper-hatch-slider" min="1" max="50" step="0.5" value="10.0" style="width:100%; margin-top: 5px;">
        </div>
        <div style="margin-bottom: 10px; color: white; font-size: 14px;">
          <label style="display:flex; justify-content:space-between;">
            Kuwahara Radius: <span id="shipyard-paper-kuwahara-val">3</span>
          </label>
          <input type="range" id="shipyard-paper-kuwahara-slider" min="1" max="5" step="1" value="3" style="width:100%; margin-top: 5px;">
        </div>
        <div style="margin-bottom: 10px; color: white; font-size: 14px;">
          <label style="display:flex; justify-content:space-between;">
            Color Preservation: <span id="shipyard-paper-color-val">0.40</span>
          </label>
          <input type="range" id="shipyard-paper-color-slider" min="0" max="1" step="0.01" value="0.40" style="width:100%; margin-top: 5px;">
        </div>
        <div style="margin-bottom: 10px; color: white; font-size: 14px;">
          <label style="display:flex; justify-content:space-between;">
            Edge Threshold: <span id="shipyard-paper-edge-val">0.30</span>
          </label>
          <input type="range" id="shipyard-paper-edge-slider" min="0" max="1" step="0.01" value="0.30" style="width:100%; margin-top: 5px;">
        </div>
        <div style="margin-bottom: 10px; color: white; font-size: 14px;">
          <label style="display:flex; justify-content:space-between;">
            Wobble Intensity: <span id="shipyard-paper-wobble-val">0.0005</span>
          </label>
          <input type="range" id="shipyard-paper-wobble-slider" min="0" max="0.01" step="0.0001" value="0.0005" style="width:100%; margin-top: 5px;">
        </div>
      </div>
    `;

    this._activeBlueprint = 'wood_block';
    
    // We emit an event to notify the BuildSystem of the initial tool
    setTimeout(() => {
      emit('blueprintSelected', { blueprintId: this._activeBlueprint });
    }, 0);

    on('uiMount', d => { if (d.screen === 'shipyard') this.mount(document.getElementById('ui-root')); });
    on('uiUnmount', d => { if (d.screen === 'shipyard') this.unmount(); });

    this._bindEvents();
  }

  _bindEvents() {
    // Handle Paper Shader Tweaks
    const paperCheck = this._el.querySelector('#shipyard-paper-shader-check');
    if (paperCheck) {
      paperCheck.onchange = (e) => {
        emit('editorTogglePaperShader', { enabled: e.target.checked });
      };
    }

    const styleSelect = this._el.querySelector('#shipyard-paper-style-select');
    if (styleSelect) {
      styleSelect.onchange = (e) => {
        emit('editorSetPaperStyle', { style: parseInt(e.target.value, 10) });
      };
    }

    const hatchSlider = this._el.querySelector('#shipyard-paper-hatch-slider');
    const hatchVal = this._el.querySelector('#shipyard-paper-hatch-val');
    if (hatchSlider) {
      hatchSlider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        hatchVal.innerText = val.toFixed(1);
        emit('editorSetHatchScale', { scale: val });
      };
    }

    const kuwaharaSlider = this._el.querySelector('#shipyard-paper-kuwahara-slider');
    const kuwaharaVal = this._el.querySelector('#shipyard-paper-kuwahara-val');
    if (kuwaharaSlider) {
      kuwaharaSlider.oninput = (e) => {
        const val = parseInt(e.target.value, 10);
        kuwaharaVal.innerText = val;
        emit('editorSetKuwaharaRadius', { radius: val });
      };
    }

    const colorSlider = this._el.querySelector('#shipyard-paper-color-slider');
    const colorVal = this._el.querySelector('#shipyard-paper-color-val');
    if (colorSlider) {
      colorSlider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        colorVal.innerText = val.toFixed(2);
        emit('editorSetPaperColor', { amount: val });
      };
    }

    const edgeSlider = this._el.querySelector('#shipyard-paper-edge-slider');
    const edgeVal = this._el.querySelector('#shipyard-paper-edge-val');
    if (edgeSlider) {
      edgeSlider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        edgeVal.innerText = val.toFixed(2);
        emit('editorSetPaperEdge', { threshold: val });
      };
    }

    const wobbleSlider = this._el.querySelector('#shipyard-paper-wobble-slider');
    const wobbleVal = this._el.querySelector('#shipyard-paper-wobble-val');
    if (wobbleSlider) {
      wobbleSlider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        wobbleVal.innerText = val.toFixed(4);
        emit('editorSetPaperWobble', { intensity: val });
      };
    }
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

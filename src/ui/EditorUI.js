import { emit, on } from '../core/EventBus.js';
import { LevelConfig } from '../core/LevelConfig.js';

export class EditorUI {
  constructor() {
    this._el = null;
    
    // Bind to the mount/unmount events for the EDITOR phase
    on('uiMount', d => { if (d.screen === 'editor') this.mount(d); });
    on('uiUnmount', d => { if (d.screen === 'editor') this.unmount(); });
  }

  mount(d) {
    if (this._el) this.unmount();
    
    const levelCfg = d?.levelCfg || {};
    const worldSize = levelCfg.worldSize || 200;

    this._el = document.createElement('div');
    this._el.id = 'editor-ui';
    
    // Helper to extract nice name
    const getBaseName = (url) => {
      const parts = url.split('/');
      const file = parts[parts.length - 1];
      return file.replace('.glb', '');
    };

    // Helper to generate submenu HTML
    const buildSubmenu = (title, icon, type, urls) => `
      <details class="editor-submenu">
        <summary>${icon} ${title}</summary>
        <div class="submenu-content">
          ${urls.map(url => `
            <button class="editor-btn asset-btn" data-type="${type}" data-url="${url}">
              ${getBaseName(url)}
            </button>
          `).join('')}
        </div>
      </details>
    `;

    // Static barrel (no URL because it's procedural)
    const barrelHtml = `
      <button class="editor-btn asset-btn" data-type="barrel" data-url="">
        🛢️ Barrel (Procedural)
      </button>
    `;
    
    // Static whirlpool (procedural)
    const whirlpoolHtml = `
      <button class="editor-btn asset-btn" data-type="whirlpool" data-url="">
        🌀 Whirlpool (Procedural)
      </button>
    `;

    this._el.innerHTML = `
      <div class="editor-header">
        <h3>Level Editor</h3>
      </div>
      
      <div class="editor-tools">
        <h4>Assets</h4>
        ${buildSubmenu('Rocks', '🪨', 'rock', LevelConfig.rockUrls)}
        ${barrelHtml}
        ${buildSubmenu('Seaweed', '🌿', 'seaweed', LevelConfig.seaweedUrls)}
        ${buildSubmenu('Waves', '🌊', 'wave_small', LevelConfig.waveUrls)}
        ${whirlpoolHtml}
        ${buildSubmenu('Pickups', '📦', 'pickup', LevelConfig.pickupUrls)}
        ${buildSubmenu('Islands', '🏝️', 'island', LevelConfig.islandUrls)}
        
        <h4>Tools</h4>
        <button class="editor-btn tool-btn tool-active" data-tool="select">Cursor / Move</button>
        <button class="editor-btn tool-btn" data-tool="delete">🗑️ Delete (Click)</button>
        
        <h4>World Settings</h4>
        <div style="margin-bottom: 10px; color: white; font-size: 14px;">
          <label style="display:flex; justify-content:space-between;">
            World Radius: <span id="world-size-val">${worldSize}</span>
          </label>
          <input type="range" id="world-size-slider" min="50" max="1000" step="10" value="${worldSize}" style="width:100%; margin-top: 5px;">
        </div>
      </div>

      <div class="editor-footer">
        <button id="btn-editor-export">💾 Export JSON</button>
      </div>
    `;

    // Handle Asset clicking
    const assetBtns = this._el.querySelectorAll('.asset-btn');
    assetBtns.forEach(btn => {
      btn.onclick = () => {
        this._clearActiveTool();
        btn.classList.add('tool-active');
        emit('editorSelectType', { 
          type: btn.dataset.type,
          url: btn.dataset.url || null
        });
      };
    });

    // Handle Tool clicking (select/delete)
    const toolBtns = this._el.querySelectorAll('.tool-btn');
    toolBtns.forEach(btn => {
      btn.onclick = () => {
        this._clearActiveTool();
        btn.classList.add('tool-active');
        emit('editorSelectTool', { tool: btn.dataset.tool });
      };
    });

    // Handle Export
    this._el.querySelector('#btn-editor-export').onclick = () => {
      emit('editorExport');
    };

    // Handle World Size
    const sizeSlider = this._el.querySelector('#world-size-slider');
    const sizeVal = this._el.querySelector('#world-size-val');
    if (sizeSlider) {
      sizeSlider.oninput = (e) => {
        const val = parseInt(e.target.value, 10);
        sizeVal.innerText = val;
        emit('editorSetWorldSize', { size: val });
      };
    }

    document.getElementById('ui-root')?.appendChild(this._el);
  }

  _clearActiveTool() {
    const btns = this._el.querySelectorAll('.editor-btn');
    btns.forEach(b => b.classList.remove('tool-active'));
  }

  unmount() {
    this._el?.remove();
    this._el = null;
  }
}

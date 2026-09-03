import { emit, on } from '../core/EventBus.js';
import { LevelConfig } from '../core/LevelConfig.js';

export class EditorUI {
  constructor() {
    this._el = null;
    
    // Bind to the mount/unmount events for the EDITOR phase
    on('uiMount', d => { if (d.screen === 'editor') this.mount(d); });
    on('uiUnmount', d => { if (d.screen === 'editor') this.unmount(); });
  }

  mount() {
    if (this._el) this.unmount();

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

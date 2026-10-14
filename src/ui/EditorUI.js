import { emit, on, off } from '../core/EventBus.js';
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

    // Wind Zone (procedural)
    const windZoneHtml = `
      <button class="editor-btn asset-btn" data-type="wind_zone" data-url="">
        💨 Wind Zone (Procedural)
      </button>
    `;

    // Siren (Hazard)
    const sirenHtml = `
      <button class="editor-btn asset-btn" data-type="siren" data-url="">
        🧜 Siren (Hazard)
      </button>
    `;

    this._el.innerHTML = `
      <div class="editor-header" style="display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0;">Level Editor</h3>
        <button id="btn-editor-toggle" style="background: none; border: none; color: white; cursor: pointer; font-size: 16px;">◀</button>
      </div>
      
      <div class="editor-tools">
        <h4>Assets</h4>
        ${buildSubmenu('Rocks', '🪨', 'rock', LevelConfig.rockUrls)}
        ${barrelHtml}
        ${buildSubmenu('Seaweed', '🌿', 'seaweed', LevelConfig.seaweedUrls)}
        ${buildSubmenu('Waves', '🌊', 'wave_small', LevelConfig.waveUrls)}
        ${whirlpoolHtml}
        ${windZoneHtml}
        ${sirenHtml}
        ${buildSubmenu('Pickups', '📦', 'pickup', LevelConfig.pickupUrls)}
        ${buildSubmenu('Islands', '🏝️', 'island', LevelConfig.islandUrls)}
      </div>

      <div class="editor-help">
        <p><strong>Controls:</strong></p>
        <p>Mouse Wheel: Adjust Height</p>
        <p>O/P: Adjust Scale (Radius for Wind/Siren)</p>
        <p>[/]: Rotate Object (Direction for Wind)</p>
        <p>Click: Place</p>
      </div>

        <h4>Tools</h4>
        <button class="editor-btn tool-btn tool-active" data-tool="select">Cursor / Move</button>
        <button class="editor-btn tool-btn" data-tool="delete">🗑️ Delete (Click)</button>
        
        <h4>Terraforming (Voxels)</h4>
        <button class="editor-btn tool-btn" data-tool="terrain_raise">⛰️ Raise Terrain</button>
        <button class="editor-btn tool-btn" data-tool="terrain_lower">⛏️ Lower Terrain</button>

        <h4>🐙 Boss Encounter (Kraken)</h4>
        <button class="editor-btn tool-btn" data-tool="place_kraken">🐙 Place Kraken</button>
        <button class="editor-btn tool-btn" data-tool="place_race_start">🏁 Place Race Start</button>

        <div style="margin: 8px 0; color: white; font-size: 13px;">
          <label style="display:flex; justify-content:space-between; align-items:center;">
            Tentacle:
            <select id="editor-tentacle-select" style="background:#222; color:white; border:1px solid #555; padding:2px 6px; border-radius:3px; max-width:140px;">
              <option value="0">Tentacle 1 (0 pts)</option>
            </select>
          </label>
        </div>
        <div style="display:flex; gap:4px; margin-bottom:8px;">
          <button class="editor-btn" id="btn-add-tentacle" style="flex:1; font-size:12px; padding:6px; text-align:center;">➕ Add</button>
          <button class="editor-btn" id="btn-remove-tentacle" style="flex:1; font-size:12px; padding:6px; text-align:center; background:#552222;">❌ Del</button>
        </div>

        <div style="margin-bottom: 6px; color: white; font-size: 13px;">
          <label style="display:flex; justify-content:space-between;">
            Speed: <span id="tentacle-speed-val">12</span>
          </label>
          <input type="range" id="tentacle-speed-slider" min="6" max="25" step="1" value="12" style="width:100%; margin-top: 3px;">
        </div>

        <div style="margin-bottom: 8px; color: white; font-size: 13px;">
          <label style="display:flex; justify-content:space-between;">
            Duration: <span id="tentacle-duration-val">25s</span>
          </label>
          <input type="range" id="tentacle-duration-slider" min="10" max="60" step="1" value="25" style="width:100%; margin-top: 3px;">
        </div>

        <button class="editor-btn tool-btn" data-tool="place_waypoint">🏳️ Place Waypoint</button>
        <div style="display:flex; gap:4px; margin-top:4px;">
          <button class="editor-btn" id="btn-clear-waypoints" style="flex:1; font-size:11px; padding:6px; text-align:center;">🧹 Clear WPs</button>
          <button class="editor-btn" id="btn-remove-boss" style="flex:1; font-size:11px; padding:6px; text-align:center; background:#553333;">🗑️ Clear Boss</button>
        </div>
        
        <h4>World Settings</h4>
        <div style="margin-bottom: 10px; color: white; font-size: 14px;">
          <label style="display:flex; justify-content:space-between;">
            World Radius: <span id="world-size-val">${worldSize}</span>
          </label>
          <input type="range" id="world-size-slider" min="50" max="1000" step="10" value="${worldSize}" style="width:100%; margin-top: 5px;">
        </div>
        
        <div style="margin-bottom: 10px; color: white; font-size: 14px;">
          <label style="display:flex; justify-content:space-between; align-items:center;">
            Global Wind Dir: 
            <div style="display:flex; align-items:center;">
              <span id="wind-dir-val" style="margin-right: 8px;">${levelCfg.globalWindDir || 0}°</span>
              <svg id="wind-dir-arrow" width="16" height="16" viewBox="0 0 24 24" style="transform: rotate(${levelCfg.globalWindDir || 0}deg); transition: transform 0.1s;">
                <path fill="currentColor" d="M12 2L15 8H13V22H11V8H9L12 2Z"/>
              </svg>
            </div>
          </label>
          <input type="range" id="wind-dir-slider" min="0" max="360" step="1" value="${levelCfg.globalWindDir || 0}" style="width:100%; margin-top: 5px;">
        </div>

        <div style="margin-bottom: 10px; color: white; font-size: 14px;">
          <label style="display:flex; justify-content:space-between;">
            Fog Density: <span id="fog-density-val">${levelCfg.fogDensity !== undefined ? levelCfg.fogDensity : 0.006}</span>
          </label>
          <input type="range" id="fog-density-slider" min="0" max="0.1" step="0.001" value="${levelCfg.fogDensity !== undefined ? levelCfg.fogDensity : 0.006}" style="width:100%; margin-top: 5px;">
        </div>
        
        <div style="margin-bottom: 10px; color: white; font-size: 14px;">
          <label style="display:flex; justify-content:space-between;">
            Time of Day: <span id="time-val">${levelCfg.timeOfDay !== undefined ? levelCfg.timeOfDay.toFixed(1) : "8.0"}</span>
          </label>
          <input type="range" id="time-slider" min="0" max="24" step="0.1" value="${levelCfg.timeOfDay !== undefined ? levelCfg.timeOfDay : 8.0}" style="width:100%; margin-top: 5px;">
        </div>

        <div style="margin-bottom: 10px; color: white; font-size: 14px;">
          <label style="display:flex; align-items:center;">
            <input type="checkbox" id="storm-check" ${levelCfg.isStormy ? 'checked' : ''} style="margin-right: 8px;">
            Stormy Weather
          </label>
        </div>

        <h4>Paper Shader Tweaks</h4>
        <div style="margin-bottom: 10px; color: white; font-size: 14px;">
          <label style="display:flex; align-items:center;">
            <input type="checkbox" id="paper-shader-check" style="margin-right: 8px;">
            Enable Paper Shader
          </label>
        </div>
        <div style="margin-bottom: 10px; color: white; font-size: 14px;">
          <label style="display:flex; justify-content:space-between;">
            Shading Style: 
            <select id="paper-style-select" style="background:#222; color:white; border:1px solid #555;">
              <option value="0">Hatching</option>
              <option value="1">Kuwahara (Painterly)</option>
            </select>
          </label>
        </div>
        <div style="margin-bottom: 10px; color: white; font-size: 14px;">
          <label style="display:flex; justify-content:space-between;">
            Hatch Scale: <span id="paper-hatch-val">10.0</span>
          </label>
          <input type="range" id="paper-hatch-slider" min="1" max="50" step="0.5" value="10.0" style="width:100%; margin-top: 5px;">
        </div>
        <div style="margin-bottom: 10px; color: white; font-size: 14px;">
          <label style="display:flex; justify-content:space-between;">
            Kuwahara Radius: <span id="paper-kuwahara-val">3</span>
          </label>
          <input type="range" id="paper-kuwahara-slider" min="1" max="5" step="1" value="3" style="width:100%; margin-top: 5px;">
        </div>
        <div style="margin-bottom: 10px; color: white; font-size: 14px;">
          <label style="display:flex; justify-content:space-between;">
            Color Preservation: <span id="paper-color-val">0.40</span>
          </label>
          <input type="range" id="paper-color-slider" min="0" max="1" step="0.01" value="0.40" style="width:100%; margin-top: 5px;">
        </div>
        <div style="margin-bottom: 10px; color: white; font-size: 14px;">
          <label style="display:flex; justify-content:space-between;">
            Edge Threshold: <span id="paper-edge-val">0.30</span>
          </label>
          <input type="range" id="paper-edge-slider" min="0" max="1" step="0.01" value="0.30" style="width:100%; margin-top: 5px;">
        </div>
        <div style="margin-bottom: 10px; color: white; font-size: 14px;">
          <label style="display:flex; justify-content:space-between;">
            Wobble Intensity: <span id="paper-wobble-val">0.0005</span>
          </label>
          <input type="range" id="paper-wobble-slider" min="0" max="0.01" step="0.0001" value="0.0005" style="width:100%; margin-top: 5px;">
        </div>
      </div>

      <div class="editor-footer">
        <button id="btn-editor-play" style="background-color: #2e6b3e; margin-bottom: 5px;">▶️ Play Level</button>
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

    // Handle Play
    this._el.querySelector('#btn-editor-play').onclick = () => {
      emit('editorRequestPlay');
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

    // Handle Wind Dir
    const windSlider = this._el.querySelector('#wind-dir-slider');
    const windVal = this._el.querySelector('#wind-dir-val');
    const windArrow = this._el.querySelector('#wind-dir-arrow');
    if (windSlider) {
      windSlider.oninput = (e) => {
        const val = parseInt(e.target.value, 10);
        windVal.innerText = val + '°';
        if (windArrow) {
          windArrow.style.transform = `rotate(${val}deg)`;
        }
        emit('editorSetWindDir', { dir: val });
      };
    }

    // Handle Fog Density
    const fogSlider = this._el.querySelector('#fog-density-slider');
    const fogVal = this._el.querySelector('#fog-density-val');
    if (fogSlider) {
      fogSlider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        fogVal.innerText = val.toFixed(3);
        emit('editorSetFogDensity', { density: val });
      };
    }

    // Handle Time of Day
    const timeSlider = this._el.querySelector('#time-slider');
    const timeVal = this._el.querySelector('#time-val');
    if (timeSlider) {
      timeSlider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        timeVal.innerText = val.toFixed(1);
        emit('editorSetTimeOfDay', { time: val });
      };
    }

    // Handle Storm Checkbox
    const stormCheck = this._el.querySelector('#storm-check');
    if (stormCheck) {
      stormCheck.onchange = (e) => {
        emit('editorSetStormy', { isStormy: e.target.checked });
      };
    }

    // Handle Paper Shader Tweaks
    const paperCheck = this._el.querySelector('#paper-shader-check');
    if (paperCheck) {
      paperCheck.onchange = (e) => {
        emit('editorTogglePaperShader', { enabled: e.target.checked });
      };
    }

    const styleSelect = this._el.querySelector('#paper-style-select');
    if (styleSelect) {
      styleSelect.onchange = (e) => {
        emit('editorSetPaperStyle', { style: parseInt(e.target.value, 10) });
      };
    }

    const hatchSlider = this._el.querySelector('#paper-hatch-slider');
    const hatchVal = this._el.querySelector('#paper-hatch-val');
    if (hatchSlider) {
      hatchSlider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        hatchVal.innerText = val.toFixed(1);
        emit('editorSetHatchScale', { scale: val });
      };
    }

    const kuwaharaSlider = this._el.querySelector('#paper-kuwahara-slider');
    const kuwaharaVal = this._el.querySelector('#paper-kuwahara-val');
    if (kuwaharaSlider) {
      kuwaharaSlider.oninput = (e) => {
        const val = parseInt(e.target.value, 10);
        kuwaharaVal.innerText = val;
        emit('editorSetKuwaharaRadius', { radius: val });
      };
    }

    const colorSlider = this._el.querySelector('#paper-color-slider');
    const colorVal = this._el.querySelector('#paper-color-val');
    if (colorSlider) {
      colorSlider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        colorVal.innerText = val.toFixed(2);
        emit('editorSetPaperColor', { amount: val });
      };
    }

    const edgeSlider = this._el.querySelector('#paper-edge-slider');
    const edgeVal = this._el.querySelector('#paper-edge-val');
    if (edgeSlider) {
      edgeSlider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        edgeVal.innerText = val.toFixed(2);
        emit('editorSetPaperEdge', { threshold: val });
      };
    }

    const wobbleSlider = this._el.querySelector('#paper-wobble-slider');
    const wobbleVal = this._el.querySelector('#paper-wobble-val');
    if (wobbleSlider) {
      wobbleSlider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        wobbleVal.innerText = val.toFixed(4);
        emit('editorSetPaperWobble', { intensity: val });
      };
    }

    // Boss controls
    const tentacleSelect = this._el.querySelector('#editor-tentacle-select');
    if (tentacleSelect) {
      tentacleSelect.onchange = (e) => {
        emit('editorSelectTentacle', { index: parseInt(e.target.value, 10) });
      };
    }

    const btnAddTentacle = this._el.querySelector('#btn-add-tentacle');
    if (btnAddTentacle) {
      btnAddTentacle.onclick = () => emit('editorAddTentacle');
    }

    const btnRemoveTentacle = this._el.querySelector('#btn-remove-tentacle');
    if (btnRemoveTentacle) {
      btnRemoveTentacle.onclick = () => emit('editorRemoveTentacle');
    }

    const tentacleSpeedSlider = this._el.querySelector('#tentacle-speed-slider');
    const tentacleSpeedVal = this._el.querySelector('#tentacle-speed-val');
    if (tentacleSpeedSlider) {
      tentacleSpeedSlider.oninput = (e) => {
        const val = parseInt(e.target.value, 10);
        if (tentacleSpeedVal) tentacleSpeedVal.textContent = val;
        emit('editorSetTentacleSpeed', { speed: val });
      };
    }

    const tentacleDurationSlider = this._el.querySelector('#tentacle-duration-slider');
    const tentacleDurationVal = this._el.querySelector('#tentacle-duration-val');
    if (tentacleDurationSlider) {
      tentacleDurationSlider.oninput = (e) => {
        const val = parseInt(e.target.value, 10);
        if (tentacleDurationVal) tentacleDurationVal.textContent = val + 's';
        emit('editorSetTentacleDuration', { duration: val });
      };
    }

    const btnClearWaypoints = this._el.querySelector('#btn-clear-waypoints');
    if (btnClearWaypoints) {
      btnClearWaypoints.onclick = () => emit('editorClearWaypoints');
    }

    const btnRemoveBoss = this._el.querySelector('#btn-remove-boss');
    if (btnRemoveBoss) {
      btnRemoveBoss.onclick = () => emit('editorRemoveBoss');
    }

    // Sync UI from EditorSystem boss updates
    this._onBossConfigUpdated = (d) => {
      if (!this._el) return;
      const tSelect = this._el.querySelector('#editor-tentacle-select');
      const sSlider = this._el.querySelector('#tentacle-speed-slider');
      const sVal = this._el.querySelector('#tentacle-speed-val');
      const dSlider = this._el.querySelector('#tentacle-duration-slider');
      const dVal = this._el.querySelector('#tentacle-duration-val');

      if (tSelect && d.tentacles) {
        tSelect.innerHTML = d.tentacles.map((t, idx) => `
          <option value="${idx}">Tentacle ${idx + 1} (${t.waypoints?.length || 0} pts)</option>
        `).join('');
        tSelect.value = String(d.activeIdx ?? 0);
      }

      if (d.currentTentacle) {
        if (sSlider) {
          sSlider.value = d.currentTentacle.speed ?? 12;
          if (sVal) sVal.textContent = d.currentTentacle.speed ?? 12;
        }
        if (dSlider) {
          dSlider.value = d.currentTentacle.raceDuration ?? 25;
          if (dVal) dVal.textContent = (d.currentTentacle.raceDuration ?? 25) + 's';
        }
      }
    };
    on('editorBossConfigUpdated', this._onBossConfigUpdated);

    const toggleBtn = this._el.querySelector('#btn-editor-toggle');
    if (toggleBtn) {
      toggleBtn.onclick = () => {
        const isCollapsed = this._el.style.width === '40px';
        if (!isCollapsed) {
          this._el.style.width = '40px';
          toggleBtn.innerText = '▶';
          this._el.querySelectorAll('.editor-tools, .editor-footer, .editor-header h3').forEach(el => el.style.display = 'none');
        } else {
          this._el.style.width = '250px';
          toggleBtn.innerText = '◀';
          this._el.querySelectorAll('.editor-tools, .editor-footer, .editor-header h3').forEach(el => el.style.display = '');
        }
      };
    }

    document.getElementById('ui-root')?.appendChild(this._el);
  }

  _clearActiveTool() {
    const btns = this._el.querySelectorAll('.editor-btn');
    btns.forEach(b => b.classList.remove('tool-active'));
  }

  unmount() {
    if (this._onBossConfigUpdated) {
      off('editorBossConfigUpdated', this._onBossConfigUpdated);
      this._onBossConfigUpdated = null;
    }
    this._el?.remove();
    this._el = null;
  }
}

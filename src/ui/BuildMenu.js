import { emit, on, off } from '../core/EventBus.js';
import { GameEnv } from '../core/GameEnv.js';
import {
  MATERIAL_REGISTRY,
  DEFAULT_MATERIAL_ID,
  BRUSHES,
  DEFAULT_BRUSH_ID
} from '../config/MaterialRegistry.js';

/**
 * BuildMenu — Modern shipyard engineering UI.
 *
 * Provides:
 *  - Real-time Shipyard HUD: Repair budget ($remaining / $total), hull integrity gauge, breach/leak monitor.
 *  - Repair Material Palette with costs, HP, weight stats, and hotkeys (1-5).
 *  - Brush shapes: Voxel (1x1), Plank (1x3), Long Beam (1x5), Deck Plate (2x2), Bulkhead (3x3), Eraser.
 *  - Shipyard controls: Rotate (R), Upright/Pitch (T), Symmetry/Mirror (M), Undo/Redo.
 *  - Set Sail When Ready and Return to Dock actions.
 */
export class BuildMenu {
  constructor() {
    this._el = document.createElement('div');
    this._el.id = 'shipyard-workspace-root';

    this._activeMaterialId = DEFAULT_MATERIAL_ID;
    this._activeBrushId = DEFAULT_BRUSH_ID;
    this._mirrorMode = false;

    // HUD Data Cache
    this._budgetData = { total: 300, spent: 0, remaining: 300 };
    this._summaryData = { integrityPct: 100, leaks: 0, intact: 0, missing: 0, damaged: 0, flooded: 0, shipName: 'Sloop', shipIcon: '⛵' };

    this._buildHTML();

    // Event bindings
    this._onBudgetChanged = (data) => {
      this._budgetData = data;
      this._updateHUD();
    };

    this._onSummaryUpdated = (data) => {
      this._summaryData = { ...this._summaryData, ...data };
      this._updateHUD();
    };

    this._onMirrorChanged = ({ enabled }) => {
      this._mirrorMode = !!enabled;
      this._updateToolButtons();
    };

    this._onEnvModeChanged = ({ isDev }) => {
      const tweaks = this._el.querySelector('#shipyard-shader-tweaks');
      if (tweaks) tweaks.style.display = isDev ? 'block' : 'none';
    };

    on('budgetChanged', this._onBudgetChanged);
    on('shipyardSummaryUpdated', this._onSummaryUpdated);
    on('mirrorModeChanged', this._onMirrorChanged);
    on('envModeChanged', this._onEnvModeChanged);

    on('uiMount', d => {
      if (d.screen === 'shipyard') {
        this.mount(document.getElementById('ui-root') || document.body);
      }
    });

    on('uiUnmount', d => {
      if (d.screen === 'shipyard') this.unmount();
    });

    // Notify BuildSystem of default selections
    setTimeout(() => {
      emit('materialSelected', { materialId: this._activeMaterialId });
      emit('brushSelected', { brushId: this._activeBrushId });
    }, 0);
  }

  _buildHTML() {
    this._el.innerHTML = `
      <!-- TOP HUD: Shipyard Status & Budget Bar -->
      <div id="shipyard-top-hud" class="shipyard-hud-bar">
        <div class="hud-ship-info">
          <span class="hud-ship-icon" id="hud-ship-icon">${this._summaryData.shipIcon}</span>
          <div class="hud-ship-titles">
            <span class="hud-ship-name" id="hud-ship-name">${this._summaryData.shipName}</span>
            <span class="hud-ship-subtitle">Drydock Repair Bay</span>
          </div>
        </div>

        <div class="hud-stats-group">
          <!-- Hull Integrity -->
          <div class="hud-stat-box" title="Overall hull structural health">
            <span class="hud-stat-label">HULL INTEGRITY</span>
            <div class="hud-stat-value-row">
              <div class="hud-meter-wrap">
                <div class="hud-meter-fill" id="hud-integrity-meter" style="width: 100%; background: #10b981;"></div>
              </div>
              <span class="hud-stat-number" id="hud-integrity-val">100%</span>
            </div>
          </div>

          <!-- Waterline Leaks -->
          <div class="hud-stat-box" id="hud-leaks-box" title="Holes below the waterline that will flood the ship while sailing">
            <span class="hud-stat-label">WATERLINE LEAKS</span>
            <div class="hud-stat-value-row">
              <span class="hud-leak-icon">💧</span>
              <span class="hud-stat-number" id="hud-leaks-val">0 Leaks</span>
            </div>
          </div>

          <!-- Repair Budget -->
          <div class="hud-stat-box hud-budget-box" title="Level funds available for timber and plates">
            <div class="hud-budget-top">
              <span class="hud-stat-label">REPAIR FUNDS</span>
              <span class="hud-budget-spent" id="hud-spent-val">Spent: $0</span>
            </div>
            <div class="hud-stat-value-row">
              <span class="hud-stat-number gold-text" id="hud-remaining-val">$300</span>
              <span class="hud-budget-total" id="hud-total-val">/ $300</span>
            </div>
          </div>
        </div>
      </div>

      <!-- MAIN LEFT FLOATING PALETTE -->
      <div id="shipyard-palette-panel" class="shipyard-glass-panel">
        <div class="palette-header">
          <h3>Shipwright Workshop</h3>
          <span class="palette-subtitle">Select materials &amp; brush shapes</span>
        </div>

        <!-- 1. MATERIAL TILES -->
        <div class="palette-section">
          <div class="section-label-row">
            <span class="palette-section-title">1. Repair Timber &amp; Materials</span>
            <span class="hotkey-hint">Keys [1-5]</span>
          </div>
          <div class="material-tiles-grid" id="material-tiles-list">
            <!-- Dynamically populated -->
          </div>
        </div>

        <!-- 2. BRUSH SHAPES -->
        <div class="palette-section">
          <div class="section-label-row">
            <span class="palette-section-title">2. Brush Geometry</span>
          </div>
          <div class="brush-tiles-grid" id="brush-tiles-list">
            <!-- Dynamically populated -->
          </div>
        </div>

        <!-- 3. SHIPYARD CONTROLS -->
        <div class="palette-section">
          <div class="section-label-row">
            <span class="palette-section-title">3. Placement Controls</span>
          </div>
          <div class="controls-action-grid">
            <button class="ctrl-action-btn" id="btn-ctrl-rotate" title="Rotate brush 90° around Y (Hotkey: R)">
              <span class="ctrl-icon">🔄</span>
              <span class="ctrl-text">Rotate [R]</span>
            </button>
            <button class="ctrl-action-btn" id="btn-ctrl-pitch" title="Toggle horizontal or upright orientation (Hotkey: T)">
              <span class="ctrl-icon">📐</span>
              <span class="ctrl-text">Pitch [T]</span>
            </button>
            <button class="ctrl-action-btn ${this._mirrorMode ? 'active-glow' : ''}" id="btn-ctrl-mirror" title="Toggle symmetrical port/starboard placement (Hotkey: M)">
              <span class="ctrl-icon">🪞</span>
              <span class="ctrl-text" id="btn-mirror-text">Symmetry [M]</span>
            </button>
            <button class="ctrl-action-btn" id="btn-ctrl-undo" title="Undo last placement and refund funds (Hotkey: Ctrl+Z)">
              <span class="ctrl-icon">↩️</span>
              <span class="ctrl-text">Undo [Ctrl+Z]</span>
            </button>
          </div>
        </div>

        <!-- DEV PAPER SHADER TWEAKS -->
        <div id="shipyard-shader-tweaks" style="margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px; display: ${GameEnv.isDev() ? 'block' : 'none'};">
          <h4 style="margin: 0 0 8px 0; font-size: 12px; color: #94a3b8; text-transform: uppercase;">Paper Shader Tweaks (Dev)</h4>
          <div style="margin-bottom: 8px; color: white; font-size: 13px;">
            <label style="display:flex; align-items:center; cursor: pointer;">
              <input type="checkbox" id="shipyard-paper-shader-check" style="margin-right: 8px;">
              Enable Paper Shader
            </label>
          </div>
          <div style="margin-bottom: 8px; color: white; font-size: 12px;">
            <label style="display:flex; justify-content:space-between; align-items: center;">
              Style:
              <select id="shipyard-paper-style-select" style="background:#1e293b; color:white; border:1px solid #475569; border-radius: 4px; padding: 2px 6px;">
                <option value="0">Hatching</option>
                <option value="1">Kuwahara (Painterly)</option>
              </select>
            </label>
          </div>
        </div>

        <!-- BOTTOM ACTION ROW -->
        <div class="shipyard-actions-footer">
          <button id="btn-shipyard-sail" class="btn-primary-sail" title="Depart the dock and begin your voyage">
            <span class="sail-icon">⛵</span>
            <div class="sail-text-group">
              <span class="sail-title">Set Sail When Ready!</span>
              <span class="sail-subtitle">Depart drydock to open sea</span>
            </div>
          </button>
          <button id="btn-shipyard-dock" class="btn-secondary-dock" title="Return to island dock promenade">
            <span>⚓</span> <span>Return to Island Dock</span>
          </button>
        </div>
      </div>
    `;

    this._bindEvents();
    this._renderMaterialTiles();
    this._renderBrushTiles();
  }

  _bindEvents() {
    // Top actions
    this._el.querySelector('#btn-shipyard-sail')?.addEventListener('click', () => {
      emit('startSailing');
    });

    this._el.querySelector('#btn-shipyard-dock')?.addEventListener('click', () => {
      emit('requestPhaseChange', { phase: 'DOCK' });
    });

    // Control buttons
    this._el.querySelector('#btn-ctrl-rotate')?.addEventListener('click', () => {
      emit('rotateBrush');
    });

    this._el.querySelector('#btn-ctrl-pitch')?.addEventListener('click', () => {
      emit('togglePitch');
    });

    this._el.querySelector('#btn-ctrl-mirror')?.addEventListener('click', () => {
      emit('toggleMirror');
    });

    this._el.querySelector('#btn-ctrl-undo')?.addEventListener('click', () => {
      emit('undoBuild');
    });

    // Paper shader controls
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
  }

  mount(parent) {
    parent.appendChild(this._el);
    this._updateHUD();
    this._renderMaterialTiles();
    this._renderBrushTiles();
    this._updateToolButtons();
  }

  unmount() {
    this._el.remove();
  }

  _renderMaterialTiles() {
    const list = this._el.querySelector('#material-tiles-list');
    if (!list) return;
    list.innerHTML = '';

    let index = 1;
    for (const [id, mat] of Object.entries(MATERIAL_REGISTRY)) {
      const isSelected = this._activeMaterialId === id;
      const tile = document.createElement('div');
      tile.className = `material-tile ${isSelected ? 'active' : ''}`;
      tile.dataset.materialId = id;

      const hexStr = '#' + mat.color.toString(16).padStart(6, '0');
      const wtStr = mat.weightMultiplier < 1.0 ? `${Math.round(mat.weightMultiplier * 100)}% wt (Agile)` :
                    mat.weightMultiplier > 1.0 ? `${Math.round(mat.weightMultiplier * 100)}% wt (Heavy)` : `100% wt`;

      tile.innerHTML = `
        <div class="tile-swatch" style="background: ${hexStr};">
          <span class="tile-key-badge">${index}</span>
        </div>
        <div class="tile-info">
          <div class="tile-title-row">
            <span class="tile-name">${mat.name}</span>
            <span class="tile-cost">$${mat.unitCost}</span>
          </div>
          <div class="tile-stats-row">
            <span class="tile-hp">🛡️ ${mat.durabilityHP} HP</span>
            <span class="tile-weight">⚖️ ${wtStr}</span>
          </div>
          <div class="tile-desc">${mat.description}</div>
        </div>
      `;

      tile.addEventListener('click', () => {
        this._activeMaterialId = id;
        emit('materialSelected', { materialId: id });
        this._renderMaterialTiles();
      });

      list.appendChild(tile);
      index++;
    }
  }

  _renderBrushTiles() {
    const list = this._el.querySelector('#brush-tiles-list');
    if (!list) return;
    list.innerHTML = '';

    for (const [id, brush] of Object.entries(BRUSHES)) {
      const isSelected = this._activeBrushId === id;
      const tile = document.createElement('button');
      tile.className = `brush-tile ${isSelected ? 'active' : ''} ${brush.isEraser ? 'eraser-tile' : ''}`;
      tile.dataset.brushId = id;

      const sizeStr = brush.isEraser ? 'Demolish / Refund' : `${brush.size[0]}×${brush.size[1]}×${brush.size[2]}`;

      tile.innerHTML = `
        <span class="brush-icon">${brush.icon}</span>
        <div class="brush-text">
          <span class="brush-name">${brush.label}</span>
          <span class="brush-dim">${sizeStr}</span>
        </div>
      `;

      tile.addEventListener('click', () => {
        this._activeBrushId = id;
        emit('brushSelected', { brushId: id });
        this._renderBrushTiles();
      });

      list.appendChild(tile);
    }
  }

  _updateToolButtons() {
    const mirrorBtn = this._el.querySelector('#btn-ctrl-mirror');
    if (mirrorBtn) {
      if (this._mirrorMode) {
        mirrorBtn.classList.add('active-glow');
        mirrorBtn.querySelector('#btn-mirror-text').textContent = 'Symmetry: ON [M]';
      } else {
        mirrorBtn.classList.remove('active-glow');
        mirrorBtn.querySelector('#btn-mirror-text').textContent = 'Symmetry: OFF [M]';
      }
    }
  }

  _updateHUD() {
    // 1. Vessel Info
    const iconEl = this._el.querySelector('#hud-ship-icon');
    const nameEl = this._el.querySelector('#hud-ship-name');
    if (iconEl) iconEl.textContent = this._summaryData.shipIcon || '⛵';
    if (nameEl) nameEl.textContent = this._summaryData.shipName || 'Vessel';

    // 2. Hull Integrity
    const pct = Math.max(0, Math.min(100, this._summaryData.integrityPct ?? 100));
    const integrityVal = this._el.querySelector('#hud-integrity-val');
    const integrityMeter = this._el.querySelector('#hud-integrity-meter');
    if (integrityVal) integrityVal.textContent = `${pct}%`;
    if (integrityMeter) {
      integrityMeter.style.width = `${pct}%`;
      if (pct >= 80) integrityMeter.style.background = '#10b981';
      else if (pct >= 50) integrityMeter.style.background = '#f59e0b';
      else integrityMeter.style.background = '#ef4444';
    }

    // 3. Waterline Leaks
    const leaks = this._summaryData.leaks ?? 0;
    const leaksVal = this._el.querySelector('#hud-leaks-val');
    const leaksBox = this._el.querySelector('#hud-leaks-box');
    if (leaksVal) {
      leaksVal.textContent = leaks === 0 ? '0 Leaks (Sealed)' : `${leaks} Breach${leaks > 1 ? 'es' : ''}!`;
    }
    if (leaksBox) {
      if (leaks > 0) {
        leaksBox.classList.add('warning-pulse');
      } else {
        leaksBox.classList.remove('warning-pulse');
      }
    }

    // 4. Budget
    const remaining = this._budgetData.remaining ?? 300;
    const total = this._budgetData.total ?? 300;
    const spent = this._budgetData.spent ?? 0;

    const remainingVal = this._el.querySelector('#hud-remaining-val');
    const totalVal = this._el.querySelector('#hud-total-val');
    const spentVal = this._el.querySelector('#hud-spent-val');

    if (remainingVal) {
      remainingVal.textContent = total === Infinity ? 'Unlimited' : `$${remaining}`;
      if (remaining <= 20) remainingVal.style.color = '#ef4444';
      else if (remaining <= 60) remainingVal.style.color = '#f59e0b';
      else remainingVal.style.color = '#fbbf24';
    }
    if (totalVal) {
      totalVal.textContent = total === Infinity ? '' : `/ $${total}`;
    }
    if (spentVal) {
      spentVal.textContent = `Spent: $${spent}`;
    }
  }
}

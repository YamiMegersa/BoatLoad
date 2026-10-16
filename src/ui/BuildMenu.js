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
      <!-- TOP BAR: Shipyard Brand, Vessel Stats & Actions -->
      <header class="shipyard-top-bar">
        <div class="shipyard-brand">
          <span class="shipyard-brand-icon">🔨</span>
          <div class="shipyard-brand-text">
            <span class="shipyard-brand-title">DRYDOCK SHIPWRIGHT</span>
            <span class="shipyard-brand-sub">Ship Repair &amp; Engineering</span>
          </div>
        </div>

        <div class="shipyard-vessel-stats">
          <div class="hud-ship-info">
            <span class="hud-ship-icon" id="hud-ship-icon">${this._summaryData.shipIcon}</span>
            <div class="hud-ship-titles">
              <span class="hud-ship-name" id="hud-ship-name">${this._summaryData.shipName}</span>
              <span class="hud-ship-subtitle">Active Vessel</span>
            </div>
          </div>

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
          <div class="hud-stat-box" id="hud-leaks-box" title="Holes below the waterline">
            <span class="hud-stat-label">WATERLINE LEAKS</span>
            <div class="hud-stat-value-row">
              <span class="hud-leak-icon">💧</span>
              <span class="hud-stat-number" id="hud-leaks-val">0 Leaks</span>
            </div>
          </div>

          <!-- Repair Funds -->
          <div class="hud-stat-box hud-budget-box" title="Funds available for hull timber and plates">
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

        <!-- Top Right Actions -->
        <div class="shipyard-top-actions">
          <button id="btn-shipyard-dock" class="action-btn-sm" title="Return to island dock promenade">
            <span>⚓ Island Dock</span>
          </button>
          <button id="btn-shipyard-sail" class="action-btn-primary" title="Depart drydock and begin sailing!">
            <span>⛵ Set Sail When Ready!</span>
          </button>
        </div>
      </header>

      <!-- RIBBON SHELF: Materials, Brushes & Placement Tools -->
      <section class="shipyard-ribbon-shelf" id="shipyard-ribbon-shelf">
        <!-- 1. MATERIAL SELECTION GROUP -->
        <div class="ribbon-group">
          <span class="ribbon-group-label">1. Materials <strong class="hotkey-hint">[1-5]</strong></span>
          <div class="ribbon-group-row" id="material-tiles-list">
            <!-- Dynamically populated shelf-buttons -->
          </div>
        </div>

        <div class="ribbon-divider"></div>

        <!-- 2. BRUSH GEOMETRY GROUP -->
        <div class="ribbon-group">
          <span class="ribbon-group-label">2. Brush Geometry</span>
          <div class="ribbon-group-row" id="brush-tiles-list">
            <!-- Dynamically populated shelf-buttons -->
          </div>
        </div>

        <div class="ribbon-divider"></div>

        <!-- 3. PLACEMENT & TOOLS GROUP -->
        <div class="ribbon-group">
          <span class="ribbon-group-label">3. Placement Tools</span>
          <div class="ribbon-group-row">
            <button class="shelf-btn tool-mode-btn" id="btn-ctrl-rotate" title="Rotate brush 90° (Hotkey: R)">
              <span class="shelf-btn-icon">🔄</span>
              <span class="shelf-btn-text">Rotate [R]</span>
            </button>
            <button class="shelf-btn tool-mode-btn" id="btn-ctrl-pitch" title="Toggle horizontal or upright orientation (Hotkey: T)">
              <span class="shelf-btn-icon">📐</span>
              <span class="shelf-btn-text">Pitch [T]</span>
            </button>
            <button class="shelf-btn tool-mode-btn ${this._mirrorMode ? 'tool-active' : ''}" id="btn-ctrl-mirror" title="Toggle port/starboard symmetry (Hotkey: M)">
              <span class="shelf-btn-icon">🪞</span>
              <span class="shelf-btn-text" id="btn-mirror-text">Symmetry [M]</span>
            </button>
            <button class="shelf-btn tool-mode-btn" id="btn-ctrl-undo" title="Undo placement &amp; refund funds (Hotkey: Ctrl+Z)">
              <span class="shelf-btn-icon">↩️</span>
              <span class="shelf-btn-text">Undo [Ctrl+Z]</span>
            </button>
          </div>
        </div>

        <!-- Dev Controls Divider & Group -->
        <div class="ribbon-divider" style="display: ${GameEnv.isDev() ? 'block' : 'none'};"></div>
        <div class="ribbon-group" id="shipyard-shader-tweaks" style="display: ${GameEnv.isDev() ? 'flex' : 'none'};">
          <span class="ribbon-group-label">Shaders (Dev)</span>
          <div class="ribbon-group-row" style="gap: 8px;">
            <label style="display:flex; align-items:center; gap:4px; font-size:11px; color:#cbd5e1; cursor:pointer;">
              <input type="checkbox" id="shipyard-paper-shader-check"> Paper
            </label>
            <select id="shipyard-paper-style-select" style="background:#1e293b; color:white; border:1px solid #475569; border-radius:4px; padding:2px 4px; font-size:10px;">
              <option value="0">Hatching</option>
              <option value="1">Kuwahara</option>
            </select>
          </div>
        </div>
      </section>
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
      const tile = document.createElement('button');
      tile.className = `shelf-btn material-shelf-btn ${isSelected ? 'tool-active' : ''}`;
      tile.dataset.materialId = id;
      tile.title = `${mat.name} ($${mat.unitCost})\n${mat.durabilityHP} HP • ${mat.description}`;

      const hexStr = '#' + mat.color.toString(16).padStart(6, '0');

      tile.innerHTML = `
        <div class="material-swatch-badge" style="background: ${hexStr};">
          <span class="swatch-key">${index}</span>
        </div>
        <span class="shelf-btn-text">${mat.name}</span>
        <span class="material-cost-tag">$${mat.unitCost}</span>
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
      tile.className = `shelf-btn brush-shelf-btn ${isSelected ? 'tool-active' : ''} ${brush.isEraser ? 'btn-danger-hover' : ''}`;
      tile.dataset.brushId = id;
      const sizeStr = brush.isEraser ? 'Demolish' : `${brush.size[0]}×${brush.size[1]}×${brush.size[2]}`;
      tile.title = `${brush.label} (${sizeStr})`;

      tile.innerHTML = `
        <span class="shelf-btn-icon">${brush.icon}</span>
        <span class="shelf-btn-text">${brush.label}</span>
        <span class="brush-dim-badge">${sizeStr}</span>
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
        mirrorBtn.classList.add('tool-active');
        mirrorBtn.querySelector('#btn-mirror-text').textContent = 'Symmetry: ON [M]';
      } else {
        mirrorBtn.classList.remove('tool-active');
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

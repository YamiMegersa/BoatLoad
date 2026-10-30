import { emit, on, off } from '../core/EventBus.js';
import { GameEnv } from '../core/GameEnv.js';
import { ClearCheckManager } from '../community/ClearCheckManager.js';
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

    // Day 0 Tutorial State
    this._day0TutorialPopupEl = null;
    this._cleanupTutorialPopupInput = null;
    this._hasShownDay0Tutorial = false;

    // HUD Data Cache
    this._budgetData = { total: 300, spent: 0, remaining: 300 };
    this._summaryData = { integrityPct: 100, leaks: 0, intact: 0, missing: 0, damaged: 0, flooded: 0, shipName: 'Sloop', shipIcon: '<span class="pixel-icon icon-sloop size-20"></span>' };

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
        this.mount(document.getElementById('ui-root') || document.body, d);
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
          <span class="shipyard-brand-icon"><span class="pixel-icon icon-hammer size-18"></span></span>
          <div class="shipyard-brand-text">
            <span class="shipyard-brand-title" id="shipyard-brand-title">DRYDOCK SHIPWRIGHT</span>
            <span class="shipyard-brand-sub" id="shipyard-brand-sub">Ship Repair &amp; Engineering</span>
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
              <span class="hud-leak-icon"><span class="pixel-icon hud-leak-drop size-16"></span></span>
              <span class="hud-stat-number" id="hud-leaks-val">0 Leaks</span>
            </div>
          </div>

          <!-- Repair Funds & Customer Contract -->
          <div class="hud-stat-box hud-budget-box" title="Customer repair contract funds & est. profit margin">
            <div class="hud-budget-top">
              <span class="hud-stat-label">REPAIR CONTRACT</span>
              <span class="hud-budget-spent" id="hud-spent-val">Spent: 0 <span class="pixel-icon icon-doubloon size-12"></span></span>
            </div>
            <div class="hud-stat-value-row">
              <span class="hud-stat-number gold-text" id="hud-remaining-val">+300 <span class="pixel-icon icon-doubloon size-14"></span></span>
              <span class="hud-budget-total" id="hud-total-val">Profit (Budget: 300)</span>
            </div>
          </div>
        </div>

        <!-- Top Right Actions -->
        <div class="shipyard-top-actions">
          <button id="btn-shipyard-help" class="action-btn-sm" title="Review repair instructions & tutorial" style="display: none; border-color: #d4af37; color: #ffd700;">
            <span><span class="pixel-icon icon-scroll size-16"></span> Tutorial Guide</span>
          </button>
          <button id="btn-shipyard-dock" class="action-btn-sm" title="Return to island dock promenade">
            <span><span class="pixel-icon icon-anchor size-16"></span> Island Dock</span>
          </button>
          <button id="btn-shipyard-abort" class="action-btn-sm" title="Cancel clear check and return to Level Editor" style="display: none; background: #261616; border-color: #8c3b3b; color: #ff9b9b;">
            <span><span class="pixel-icon icon-close-cross size-16"></span> Back to Editor</span>
          </button>
          <button id="btn-shipyard-sail" class="action-btn-primary" title="Depart drydock and begin sailing!">
            <span id="btn-shipyard-sail-text"><span class="pixel-icon icon-sloop size-16"></span> Set Sail When Ready!</span>
          </button>
        </div>
      </header>

      <!-- Shipyard Directive Banner -->
      <div id="shipyard-directive-bar" class="shipyard-directive-bar">
        <span class="pixel-icon icon-compass size-16"></span>
        <span id="shipyard-directive-text">Directive: Seal all leaks below the waterline, then click <strong>Set Sail When Ready!</strong> in the top right.</span>
      </div>

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
              <span class="shelf-btn-icon"><span class="pixel-icon icon-rotate-arrow size-18"></span></span>
              <span class="shelf-btn-text">Rotate [R]</span>
            </button>
            <button class="shelf-btn tool-mode-btn" id="btn-ctrl-pitch" title="Toggle horizontal or upright orientation (Hotkey: T)">
              <span class="shelf-btn-icon"><span class="pixel-icon icon-calipers size-18"></span></span>
              <span class="shelf-btn-text">Pitch [T]</span>
            </button>
            <button class="shelf-btn tool-mode-btn ${this._mirrorMode ? 'tool-active' : ''}" id="btn-ctrl-mirror" title="Toggle port/starboard symmetry (Hotkey: M)">
              <span class="shelf-btn-icon"><span class="pixel-icon icon-mirror size-18"></span></span>
              <span class="shelf-btn-text" id="btn-mirror-text">Symmetry [M]</span>
            </button>
            <button class="shelf-btn tool-mode-btn" id="btn-ctrl-undo" title="Undo placement &amp; refund funds (Hotkey: Ctrl+Z)">
              <span class="shelf-btn-icon"><span class="pixel-icon icon-arrow-right size-18" style="transform: scaleX(-1);"></span></span>
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
    this._el.querySelector('#btn-shipyard-help')?.addEventListener('click', () => {
      this._showDay0TutorialPopup();
    });

    this._el.querySelector('#btn-shipyard-sail')?.addEventListener('click', () => {
      emit('startSailing');
    });

    this._el.querySelector('#btn-shipyard-dock')?.addEventListener('click', () => {
      if (window.gameState?._isClearCheckRepair) {
        console.warn('[ClearCheck] Cannot navigate to dock during clear check repair.');
        return;
      }
      if (window.gameState?._isCommunityCourse || window.gameState?._activeCommunityCourseCode) {
        emit('returnToCommunityMenu');
        return;
      }
      emit('requestPhaseChange', { phase: 'DOCK' });
    });

    this._el.querySelector('#btn-shipyard-abort')?.addEventListener('click', () => {
      if (window.gameState) {
        window.gameState._isClearCheckRepair = false;
        window.gameState._isEditorPlay = false;
      }
      ClearCheckManager.completeActiveCheck(false, 'Verification cancelled in shipyard.');
      emit('requestPhaseChange', { phase: 'EDITOR' });
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

  mount(parent, opts = {}) {
    parent.appendChild(this._el);
    this._applyModeLayout(opts);
    this._updateHUD();
    this._renderMaterialTiles();
    this._renderBrushTiles();
    this._updateToolButtons();

    const isDay0 = (opts?.day === 0) || (window.gameState?.day === 0);
    const isSpecialMode = Boolean(window.gameState?._isClearCheckRepair || window.gameState?._isEditorPlay);

    const helpBtn = this._el.querySelector('#btn-shipyard-help');
    if (helpBtn) {
      helpBtn.style.display = isDay0 && !isSpecialMode ? 'inline-flex' : 'none';
    }

    if (isDay0 && !isSpecialMode && !this._hasShownDay0Tutorial) {
      this._hasShownDay0Tutorial = true;
      setTimeout(() => {
        this._showDay0TutorialPopup();
      }, 150);
    }
  }

  _applyModeLayout() {
    const isClearCheck = Boolean(window.gameState?._isClearCheckRepair);
    const isCommunity = Boolean(window.gameState?._isCommunityCourse || window.gameState?._activeCommunityCourseCode);
    const dockBtn = this._el.querySelector('#btn-shipyard-dock');
    const abortBtn = this._el.querySelector('#btn-shipyard-abort');
    const brandTitle = this._el.querySelector('#shipyard-brand-title');
    const brandSub = this._el.querySelector('#shipyard-brand-sub');
    const sailText = this._el.querySelector('#btn-shipyard-sail-text');
    const sailBtn = this._el.querySelector('#btn-shipyard-sail');

    if (isClearCheck) {
      if (dockBtn) dockBtn.style.display = 'none';
      if (abortBtn) abortBtn.style.display = 'inline-flex';
      if (brandTitle) brandTitle.textContent = 'CLEAR CHECK: HULL REPAIR';
      if (brandSub) brandSub.textContent = 'Repair Vessel Within Budget Before Sail Verification';
      if (sailText) sailText.innerHTML = '<span class="pixel-icon icon-sloop size-16"></span> Verify Voyage (Set Sail)';
      if (sailBtn) sailBtn.title = 'Test-sail this repaired vessel through the course to prove beatability!';
    } else if (isCommunity) {
      if (dockBtn) {
        dockBtn.style.display = 'inline-flex';
        dockBtn.innerHTML = '<span><span class="pixel-icon icon-anchor size-16"></span> Community Harbor</span>';
        dockBtn.title = 'Cancel and return to Community Harbor';
      }
      if (abortBtn) abortBtn.style.display = 'none';
      if (brandTitle) brandTitle.textContent = 'COMMUNITY VOYAGE: SHIPYARD';
      const courseTitle = window.gameState?._activeCommunityCourse?.title;
      if (brandSub) brandSub.textContent = courseTitle ? `Outfitting Vessel for "${courseTitle}"` : 'Prepare & Outfit Vessel Before Setting Sail';
      if (sailText) sailText.innerHTML = '<span class="pixel-icon icon-sloop size-16"></span> Set Sail on Voyage!';
      if (sailBtn) sailBtn.title = 'Depart drydock and begin the community voyage!';
    } else {
      if (dockBtn) {
        dockBtn.style.display = 'inline-flex';
        dockBtn.innerHTML = '<span><span class="pixel-icon icon-anchor size-16"></span> Island Dock</span>';
        dockBtn.title = 'Return to island dock promenade';
      }
      if (abortBtn) abortBtn.style.display = 'none';
      if (brandTitle) brandTitle.textContent = 'DRYDOCK SHIPWRIGHT';
      if (brandSub) brandSub.textContent = 'Ship Repair & Engineering';
      if (sailText) sailText.innerHTML = '<span class="pixel-icon icon-sloop size-16"></span> Set Sail When Ready!';
      if (sailBtn) sailBtn.title = 'Depart drydock and begin sailing!';
    }
  }

  unmount() {
    this._closeDay0TutorialPopup();
    this._el.remove();
  }

  _showDay0TutorialPopup() {
    this._closeDay0TutorialPopup();

    const popup = document.createElement('div');
    popup.id = 'day0-shipyard-tutorial-popup';
    popup.style.cssText = `
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(6, 8, 12, 0.76); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      padding: 20px; pointer-events: auto; user-select: none;
    `;

    popup.innerHTML = `
      <div style="
        max-width: 620px; width: 100%;
        background: linear-gradient(180deg, #241911 0%, #160f0a 100%);
        border: 2.5px solid #d4af37; border-radius: 10px;
        box-shadow: 0 20px 50px rgba(0,0,0,0.85), inset 0 0 24px rgba(212,175,55,0.12);
        padding: 24px 28px; color: #f5ebd6;
        font-family: Georgia, 'Times New Roman', serif;
      ">
        <div style="display:flex; align-items:center; gap:14px; margin-bottom:14px; border-bottom:1px solid rgba(212,175,55,0.35); padding-bottom:12px;">
          <div style="
            width: 46px; height: 46px; border-radius: 8px;
            background: rgba(212, 175, 55, 0.16); border: 1.5px solid #d4af37;
            display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0;
          ">🛠️</div>
          <div>
            <div style="font-family: monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #d4af37; margin-bottom: 3px;">
              Drydock Tutorial • Shipwright Workshop
            </div>
            <div style="font-size: 22px; font-weight: bold; color: #fff8e7; line-height: 1.2;">
              The Ship Repair System
            </div>
          </div>
        </div>

        <div style="margin-bottom: 12px;">
          <div style="font-family: monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #eab308; margin-bottom: 4px;">
            ⚓ Aim &amp; Seaworthiness
          </div>
          <div style="font-size: 14px; line-height: 1.5; color: #e8dcc4;">
            This abandoned scrap frigate has breaches along its starboard hull. Breaches at or below the waterline count as <b>Waterline Leaks</b>. If you set sail with active leaks, ocean water will flood and sink the ship! Your primary goal is to seal breaches until <b>Waterline Leaks reaches 0</b>.
          </div>
        </div>

        <div style="
          background: rgba(212, 175, 55, 0.08); border-left: 3px solid #ffd700;
          padding: 10px 14px; border-radius: 0 6px 6px 0; margin-bottom: 12px;
        ">
          <div style="font-family: monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #ffd700; margin-bottom: 4px;">
            💰 Repair Budget &amp; Profit
          </div>
          <div style="font-size: 13.5px; line-height: 1.45; color: #fffdf7;">
            You have a repair allowance of <b>300 doubloons</b>. Each block of wood you place costs money. Any unspent funds become your <b>Construction Profit</b> when completing the voyage, so repair efficiently!
          </div>
        </div>

        <div style="margin-bottom: 16px;">
          <div style="font-family: monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #38bdf8; margin-bottom: 6px;">
            🎮 Workshop Controls &amp; Tools
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px; color: #d5cbba;">
            <div style="background: rgba(0,0,0,0.3); padding: 8px 10px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.08);">
              <b style="color:#ffd700;">🎥 Camera:</b> Hold <b>Right-Click + Drag</b> to orbit &amp; look. Use <b>WASD</b> to fly around the hull.
            </div>
            <div style="background: rgba(0,0,0,0.3); padding: 8px 10px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.08);">
              <b style="color:#ffd700;">🔨 Patching:</b> Select <b>Wood Planks</b> below (or key <b>1</b>). <b>Left-Click</b> damaged blocks to reconstruct them.
            </div>
            <div style="background: rgba(0,0,0,0.3); padding: 8px 10px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.08);">
              <b style="color:#ffd700;">📐 Brushes:</b> Pick <b>Plank (1×3)</b> or <b>Bulkhead (3×3)</b> from the shelf to patch larger breaches in one click.
            </div>
            <div style="background: rgba(0,0,0,0.3); padding: 8px 10px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.08);">
              <b style="color:#ffd700;">⛵ Departure:</b> When leaks reach 0, click <b>"Set Sail When Ready!"</b> in the top-right to begin the sea trial!
            </div>
          </div>
        </div>

        <button id="day0-shipyard-tutorial-btn" style="
          width: 100%; padding: 11px 18px; cursor: pointer;
          background: linear-gradient(180deg, #d4af37 0%, #9a7418 100%);
          color: #1a1108; font-family: Georgia, serif; font-size: 15px; font-weight: bold;
          border: 1px solid #ffe57f; border-radius: 6px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5); letter-spacing: 0.4px;
        ">Understood, Let's Repair! [Space or Enter]</button>
      </div>
    `;

    const uiRoot = document.getElementById('ui-root') || document.body;
    uiRoot.appendChild(popup);
    this._day0TutorialPopupEl = popup;

    const dismiss = (e) => {
      if (e) {
        if (e.type === 'keydown' && e.code !== 'Space' && e.code !== 'Enter' && e.code !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
      }
      emit('playSound', { sound: 'qte_success' });
      this._closeDay0TutorialPopup();
    };

    const btn = popup.querySelector('#day0-shipyard-tutorial-btn');
    if (btn) btn.addEventListener('click', dismiss);
    popup.addEventListener('pointerdown', (e) => {
      if (e.target === popup) dismiss(e);
    });
    window.addEventListener('keydown', dismiss);
    this._cleanupTutorialPopupInput = () => {
      window.removeEventListener('keydown', dismiss);
    };
  }

  _closeDay0TutorialPopup() {
    if (this._cleanupTutorialPopupInput) {
      this._cleanupTutorialPopupInput();
      this._cleanupTutorialPopupInput = null;
    }
    if (this._day0TutorialPopupEl) {
      this._day0TutorialPopupEl.remove();
      this._day0TutorialPopupEl = null;
    }
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
      tile.title = `${mat.name} (${mat.unitCost} Doubloons)\n${mat.durabilityHP} HP • ${mat.description}`;

      const hexStr = '#' + mat.color.toString(16).padStart(6, '0');

      tile.innerHTML = `
        <div class="material-swatch-badge" style="background: ${hexStr};">
          <span class="swatch-key">${index}</span>
        </div>
        <span class="shelf-btn-text">${mat.name}</span>
        <span class="material-cost-tag"><span class="pixel-icon icon-doubloon size-10"></span> ${mat.unitCost}</span>
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
    if (iconEl) iconEl.innerHTML = this._summaryData.shipIcon || '<span class="pixel-icon icon-sloop size-20"></span>';
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

    // Update Directive Banner & Sail Button Pulse
    const directiveText = this._el.querySelector('#shipyard-directive-text');
    const sailBtn = this._el.querySelector('#btn-shipyard-sail');
    if (directiveText) {
      if (leaks > 0) {
        directiveText.innerHTML = `⚠️ <strong style="color:#ffd700;">Directive:</strong> Seal ${leaks} waterline breach${leaks > 1 ? 'es' : ''}! Once watertight, click <strong>"Set Sail When Ready!"</strong> in the top right.`;
      } else {
        directiveText.innerHTML = `✅ <strong style="color:#4ade80;">Watertight &amp; Seaworthy!</strong> All leaks sealed. Click <strong>"Set Sail When Ready!"</strong> in the top right to embark on your voyage!`;
      }
    }
    if (sailBtn) {
      if (leaks === 0) {
        sailBtn.classList.add('sail-btn-pulse');
      } else {
        sailBtn.classList.remove('sail-btn-pulse');
      }
    }

    // 4. Budget & Profit Margin
    const remaining = this._budgetData.remaining ?? 300;
    const total = this._budgetData.total ?? 300;
    const spent = this._budgetData.spent ?? 0;
    const profit = this._budgetData.leftoverProfit ?? (total - spent);

    const remainingVal = this._el.querySelector('#hud-remaining-val');
    const totalVal = this._el.querySelector('#hud-total-val');
    const spentVal = this._el.querySelector('#hud-spent-val');
    const budgetBox = this._el.querySelector('.hud-budget-box');

    if (budgetBox) {
      if (profit < 0) {
        budgetBox.classList.add('over-budget');
      } else {
        budgetBox.classList.remove('over-budget');
      }
    }

    if (remainingVal) {
      if (total === Infinity) {
        remainingVal.textContent = 'Unlimited';
        remainingVal.style.color = '#fbbf24';
      } else {
        const sign = profit >= 0 ? '+' : '';
        remainingVal.innerHTML = `${sign}${profit} <span class="pixel-icon icon-doubloon size-14"></span>`;
        if (profit < 0) remainingVal.style.color = '#ef4444';
        else if (profit <= 25) remainingVal.style.color = '#f59e0b';
        else remainingVal.style.color = '#fbbf24';
      }
    }
    if (totalVal) {
      if (total === Infinity) {
        totalVal.textContent = '';
      } else if (profit < 0) {
        totalVal.textContent = `DEFICIT (From Purse)`;
      } else {
        totalVal.textContent = `Profit (Budget: ${total})`;
      }
    }
    if (spentVal) {
      spentVal.innerHTML = `Spent: ${spent} <span class="pixel-icon icon-doubloon size-12"></span>`;
    }
  }
}

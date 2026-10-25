import { emit, on, off } from '../core/EventBus.js';
import { DamageBrushType, BrushSize } from '../editor/BoatDestructionWorkshop.js';

/**
 * EditorDamageUI — The HUD & Ribbon interface for the Boat Destruction Workshop.
 *
 * Provides real-time metrics on hull integrity, total breaches, waterline leaks,
 * and repair cost vs. budget, along with brush controls, mirror mode, undo/redo,
 * and file import for boats from other levels.
 */
export class EditorDamageUI {
  constructor() {
    this._el = document.createElement('div');
    this._el.id = 'editor-damage-ui-root';

    this._activeBrush = DamageBrushType.CANNONBALL;
    this._activeSize = BrushSize.MEDIUM;
    this._mirrorMode = false;

    this._stats = {
      integrityPct: 100,
      intact: 0,
      missing: 0,
      leaks: 0,
      repairCost: 0,
      levelBudget: 300,
      shipName: 'Sloop',
      shipIcon: '<span class="pixel-icon icon-sloop size-20"></span>'
    };

    this._boundOnStatsUpdated = (stats) => {
      this._stats = { ...this._stats, ...stats };
      this._updateHUD();
    };

    this._boundOnBrushChanged = ({ brush }) => {
      this._activeBrush = brush;
      this._updateBrushButtons();
    };

    this._boundOnSizeChanged = ({ size }) => {
      this._activeSize = size;
      this._updateSizeButtons();
    };

    this._boundOnMirrorChanged = ({ enabled }) => {
      this._mirrorMode = !!enabled;
      this._updateMirrorButton();
    };

    this._outlinesEnabled = false;
    this._boundOnOutlinesChanged = ({ enabled }) => {
      this._outlinesEnabled = Boolean(enabled);
      const btn = this._el.querySelector('#btn-damage-outlines');
      const label = this._el.querySelector('#label-damage-outlines');
      if (btn) btn.classList.toggle('active', this._outlinesEnabled);
      if (label) label.textContent = this._outlinesEnabled ? 'Outlines: On' : 'Outlines: Off';
    };

    on('workshopStatsUpdated', this._boundOnStatsUpdated);
    on('workshopBrushChanged', this._boundOnBrushChanged);
    on('workshopBrushSizeChanged', this._boundOnSizeChanged);
    on('workshopMirrorChanged', this._boundOnMirrorChanged);
    on('workshopOutlinesChanged', this._boundOnOutlinesChanged);

    this._buildHTML();
  }

  mount(parent = document.body) {
    if (this._el.parentNode) this._el.parentNode.removeChild(this._el);
    parent.appendChild(this._el);
    this._updateHUD();
    this._updateBrushButtons();
    this._updateSizeButtons();
    this._updateMirrorButton();
  }

  unmount() {
    if (this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
  }

  dispose() {
    this.unmount();
    off('workshopStatsUpdated', this._boundOnStatsUpdated);
    off('workshopBrushChanged', this._boundOnBrushChanged);
    off('workshopBrushSizeChanged', this._boundOnSizeChanged);
    off('workshopMirrorChanged', this._boundOnMirrorChanged);
    off('workshopOutlinesChanged', this._boundOnOutlinesChanged);
  }

  _buildHTML() {
    this._el.innerHTML = `
      <style>
        #editor-damage-ui-root {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 1000;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          font-family: var(--font-pixel, monospace, sans-serif);
          user-select: none;
        }

        #editor-damage-ui-root * {
          box-sizing: border-box;
        }

        .damage-top-bar {
          pointer-events: auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 16px;
          background: rgba(15, 23, 42, 0.92);
          backdrop-filter: blur(12px);
          border-bottom: 2px solid rgba(239, 68, 68, 0.4);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
          gap: 16px;
        }

        .damage-brand {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .damage-brand-icon {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: linear-gradient(135deg, #ef4444, #991b1b);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 12px rgba(239, 68, 68, 0.4);
        }

        .damage-brand-text {
          display: flex;
          flex-direction: column;
        }

        .damage-brand-title {
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 1px;
          color: #fca5a5;
          text-shadow: 0 1px 2px rgba(0,0,0,0.8);
        }

        .damage-brand-sub {
          font-size: 10px;
          color: #94a3b8;
        }

        /* Vessel & Stats */
        .damage-vessel-stats {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .hud-stat-box {
          background: rgba(30, 41, 59, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 6px 12px;
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 140px;
        }

        .hud-stat-label {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.5px;
          color: #94a3b8;
          text-transform: uppercase;
        }

        .hud-stat-value-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .hud-meter-wrap {
          flex: 1;
          height: 8px;
          background: rgba(0, 0, 0, 0.4);
          border-radius: 4px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .hud-meter-fill {
          height: 100%;
          transition: width 0.3s ease, background 0.3s ease;
        }

        .hud-stat-number {
          font-size: 12px;
          font-weight: 800;
          color: #f8fafc;
        }

        .leak-hazard {
          animation: pulseLeak 1.2s infinite alternate;
          color: #ef4444 !important;
        }

        @keyframes pulseLeak {
          0% { text-shadow: 0 0 4px rgba(239, 68, 68, 0.4); }
          100% { text-shadow: 0 0 12px rgba(239, 68, 68, 0.9); }
        }

        .gold-text {
          color: #fbbf24;
        }

        /* Top Actions */
        .damage-top-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .action-btn {
          cursor: pointer;
          border: none;
          border-radius: 6px;
          padding: 7px 13px;
          font-size: 11px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s ease;
        }

        .action-btn:hover {
          transform: translateY(-1px);
        }

        .action-btn:active {
          transform: translateY(1px);
        }

        .action-btn-import {
          background: rgba(30, 41, 59, 0.9);
          color: #38bdf8;
          border: 1px solid rgba(56, 189, 248, 0.3);
        }
        .action-btn-import:hover {
          background: rgba(56, 189, 248, 0.15);
          border-color: #38bdf8;
        }

        .action-btn-reset {
          background: rgba(30, 41, 59, 0.9);
          color: #94a3b8;
          border: 1px solid rgba(148, 163, 184, 0.2);
        }
        .action-btn-reset:hover {
          color: #f8fafc;
          border-color: #f8fafc;
        }

        .action-btn-done {
          background: linear-gradient(135deg, #10b981, #059669);
          color: #ffffff;
          box-shadow: 0 0 12px rgba(16, 185, 129, 0.4);
        }
        .action-btn-done:hover {
          box-shadow: 0 0 16px rgba(16, 185, 129, 0.7);
        }

        /* Ribbon Shelf Bottom */
        .damage-ribbon-shelf {
          pointer-events: auto;
          background: rgba(15, 23, 42, 0.94);
          backdrop-filter: blur(12px);
          border-top: 2px solid rgba(239, 68, 68, 0.3);
          box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.5);
          padding: 10px 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
        }

        .damage-ribbon-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .damage-ribbon-label {
          font-size: 9px;
          font-weight: 700;
          color: #94a3b8;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        .damage-ribbon-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .damage-tool-btn {
          cursor: pointer;
          background: rgba(30, 41, 59, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #cbd5e1;
          border-radius: 6px;
          padding: 6px 10px;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 600;
          transition: all 0.12s ease;
        }

        .damage-tool-btn:hover {
          background: rgba(51, 65, 85, 0.9);
          color: #f8fafc;
          border-color: rgba(255, 255, 255, 0.25);
        }

        .damage-tool-btn.active {
          background: linear-gradient(135deg, rgba(239, 68, 68, 0.3), rgba(185, 28, 28, 0.4));
          border-color: #ef4444;
          color: #fecaca;
          box-shadow: 0 0 10px rgba(239, 68, 68, 0.35);
        }

        .damage-tool-btn.patch-active {
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(5, 150, 105, 0.4));
          border-color: #10b981;
          color: #a7f3d0;
          box-shadow: 0 0 10px rgba(16, 185, 129, 0.35);
        }

        .damage-ribbon-divider {
          width: 1px;
          height: 38px;
          background: rgba(255, 255, 255, 0.1);
          margin: 0 4px;
        }

        /* Toast Notifications */
        .damage-toast {
          position: absolute;
          top: 65px;
          left: 50%;
          transform: translateX(-50%) translateY(-10px);
          background: rgba(15, 23, 42, 0.96);
          border: 1px solid #38bdf8;
          color: #f8fafc;
          padding: 8px 18px;
          border-radius: 8px;
          box-shadow: 0 4px 18px rgba(0, 0, 0, 0.6);
          font-size: 11px;
          font-weight: 700;
          pointer-events: none;
          opacity: 0;
          transition: all 0.25s ease;
          display: flex;
          align-items: center;
          gap: 8px;
          z-index: 2000;
        }

        .damage-toast.visible {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }

        /* Pristine Reset Custom Modal (Pixel-Art Board Frame) */
        .damage-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(4, 8, 14, 0.82);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          pointer-events: auto;
          animation: modalFade 0.2s ease-out;
        }

        .damage-modal-card {
          background: #101722;
          border-style: solid !important;
          border-width: 28px !important;
          border-image: url('/assets/ui/frames/frame_chalkboard_slate_256.png') 30 fill stretch !important;
          image-rendering: pixelated;
          image-rendering: crisp-edges;
          border-radius: 0;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.95);
          width: 90%;
          max-width: 480px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          font-family: 'Cinzel', serif;
        }

        .damage-modal-header {
          padding: 12px 18px;
          background: #141c26;
          border-bottom: 2px solid #3b2816;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .damage-modal-header h3 {
          margin: 0;
          font-family: 'Cinzel', serif;
          font-size: 15px;
          color: #fca5a5;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .damage-modal-close-btn {
          background: transparent;
          border: none;
          color: #ffd700;
          font-size: 16px;
          cursor: pointer;
          transition: color 0.15s ease;
        }
        .damage-modal-close-btn:hover {
          color: #ffffff;
        }

        .damage-modal-body {
          padding: 18px 22px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: #0f1520;
          color: #f1f5f9;
          font-size: 13px;
          line-height: 1.5;
        }

        .damage-modal-warning-callout {
          background: rgba(239, 68, 68, 0.15);
          border-left: 3px solid #ef4444;
          padding: 10px 14px;
          font-size: 12px;
          color: #fecaca;
        }

        .damage-modal-footer {
          padding: 12px 18px;
          background: #141c26;
          border-top: 2px solid #3b2816;
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        }

        .damage-modal-btn {
          font-family: 'Cinzel', serif;
          font-size: 12px;
          font-weight: 700;
          padding: 7px 18px;
          border-radius: 0;
          cursor: pointer;
          transition: all 0.15s ease;
          border-style: solid;
        }

        .damage-modal-btn-cancel {
          background: #1e293b;
          color: #cbd5e1;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .damage-modal-btn-cancel:hover {
          background: #334155;
          color: #ffffff;
        }

        .damage-modal-btn-confirm {
          background: linear-gradient(135deg, #b91c1c, #991b1b);
          color: #ffffff;
          border: 2px solid #ef4444;
          box-shadow: 0 0 12px rgba(239, 68, 68, 0.4);
        }
        .damage-modal-btn-confirm:hover {
          background: linear-gradient(135deg, #dc2626, #b91c1c);
          box-shadow: 0 0 18px rgba(239, 68, 68, 0.6);
        }
      </style>

      <!-- TOP BAR -->
      <header class="damage-top-bar">
        <div class="damage-brand">
          <div class="damage-brand-icon">
            <span class="pixel-icon icon-delete-basket size-20"></span>
          </div>
          <div class="damage-brand-text">
            <span class="damage-brand-title">VESSEL DESTRUCTION WORKSHOP</span>
            <span class="damage-brand-sub">Level Editor Battle Damage Studio</span>
          </div>
        </div>

        <div class="damage-vessel-stats">
          <!-- Active Vessel -->
          <div class="hud-stat-box" style="min-width: 130px;">
            <span class="hud-stat-label">Active Vessel</span>
            <div class="hud-stat-value-row">
              <span id="stat-ship-icon" style="display:flex; align-items:center;">${this._stats.shipIcon}</span>
              <span class="hud-stat-number" id="stat-ship-name">${this._stats.shipName}</span>
            </div>
          </div>

          <!-- Hull Integrity Gauge -->
          <div class="hud-stat-box" style="min-width: 170px;" title="Overall structural health remaining">
            <span class="hud-stat-label">HULL INTEGRITY</span>
            <div class="hud-stat-value-row">
              <div class="hud-meter-wrap">
                <div class="hud-meter-fill" id="stat-integrity-fill" style="width: 100%; background: #10b981;"></div>
              </div>
              <span class="hud-stat-number" id="stat-integrity-val">100%</span>
            </div>
          </div>

          <!-- Breaches & Leaks -->
          <div class="hud-stat-box" style="min-width: 160px;" title="Total missing voxels and critical waterline leaks">
            <span class="hud-stat-label" id="stat-breach-label">BREACHES &amp; LEAKS</span>
            <div class="hud-stat-value-row">
              <span class="hud-stat-number" id="stat-missing-val">0 Holes</span>
              <span class="hud-stat-number" id="stat-leaks-val" style="font-size: 11px; color: #94a3b8;">0 Leaks</span>
            </div>
          </div>

          <!-- Repair Cost Estimate -->
          <div class="hud-stat-box" style="min-width: 180px;" title="Estimated cost to repair these breaches in the shipyard">
            <span class="hud-stat-label">REPAIR COST ESTIMATE</span>
            <div class="hud-stat-value-row">
              <span class="hud-stat-number gold-text" id="stat-cost-val">$0</span>
              <span id="stat-budget-val" style="font-size: 10px; color: #94a3b8;">/ $300 Budget</span>
            </div>
          </div>
        </div>

        <!-- Top Right Actions -->
        <div class="damage-top-actions">
          <input type="file" id="file-import-boat" accept=".json" style="display: none;">
          <button class="action-btn action-btn-import" id="btn-import-boat" title="Import boat model & damage from an existing level JSON file">
            <span class="pixel-icon icon-cargo-crate size-16"></span>
            <span>Import Boat</span>
          </button>
          <button class="action-btn action-btn-reset" id="btn-reset-pristine" title="Restore vessel to pristine 100% condition">
            <span class="pixel-icon icon-rotate-arrow size-16"></span>
            <span>Reset Pristine</span>
          </button>
          <button class="action-btn action-btn-done" id="btn-done-workshop" title="Save vessel damage and return to level editor">
            <span class="pixel-icon icon-anchor size-16"></span>
            <span>Done / Back to Editor</span>
          </button>
        </div>
      </header>

      <!-- TOAST NOTIFICATION -->
      <div class="damage-toast" id="damage-toast">
        <span class="pixel-icon icon-check size-16"></span>
        <span id="damage-toast-msg">Boat imported successfully!</span>
      </div>

      <!-- RIBBON SHELF -->
      <footer class="damage-ribbon-shelf">
        <!-- 1. DAMAGE BRUSHES -->
        <div class="damage-ribbon-group">
          <span class="damage-ribbon-label">1. Damage Presets &amp; Brushes <strong style="color: #cbd5e1;">[1-6]</strong></span>
          <div class="damage-ribbon-row">
            <button class="damage-tool-btn" data-brush="${DamageBrushType.SINGLE}" title="Single Voxel: Pinpoint surgical breach (Hotkey: 1)">
              <span class="pixel-icon icon-hammer size-16"></span>
              <span>Single Voxel [1]</span>
            </button>
            <button class="damage-tool-btn active" data-brush="${DamageBrushType.CANNONBALL}" title="Cannonball: Spherical explosive blast crater (Hotkey: 2)">
              <span class="pixel-icon icon-barrel size-16"></span>
              <span>Cannonball Blast [2]</span>
            </button>
            <button class="damage-tool-btn" data-brush="${DamageBrushType.COLLISION}" title="Collision: Elongated scrape/gouge from crashing into rocks or reef (Hotkey: 3)">
              <span class="pixel-icon icon-reef-rock size-16"></span>
              <span>Collision Gouge [3]</span>
            </button>
            <button class="damage-tool-btn" data-brush="${DamageBrushType.SHRAPNEL}" title="Shrapnel: Splintered explosive perforation with irregular ragged edges (Hotkey: 4)">
              <span class="pixel-icon icon-calipers size-16"></span>
              <span>Shrapnel Splinter [4]</span>
            </button>
            <button class="damage-tool-btn" data-brush="${DamageBrushType.WATERLINE}" title="Waterline Breach: Carves holes directly at or below the waterline causing leaks (Hotkey: 5)">
              <span class="pixel-icon hud-leak-drop size-16"></span>
              <span>Waterline Breach [5]</span>
            </button>
            <button class="damage-tool-btn" data-brush="${DamageBrushType.PATCH}" title="Restore Patch: Heals missing voxels back to intact hull (Hotkey: 6)">
              <span class="pixel-icon icon-needle size-16"></span>
              <span>Restore Patch [6]</span>
            </button>
          </div>
        </div>

        <div class="damage-ribbon-divider"></div>

        <!-- 2. BRUSH SIZE -->
        <div class="damage-ribbon-group">
          <span class="damage-ribbon-label">2. Blast Radius</span>
          <div class="damage-ribbon-row">
            <button class="damage-tool-btn" data-size="${BrushSize.SMALL}" title="Small radius (Light blast)">Small</button>
            <button class="damage-tool-btn active" data-size="${BrushSize.MEDIUM}" title="Medium radius (Standard cannonball)">Medium</button>
            <button class="damage-tool-btn" data-size="${BrushSize.LARGE}" title="Large radius (Heavy bombard)">Heavy</button>
          </div>
        </div>

        <div class="damage-ribbon-divider"></div>

        <!-- 3. SYMMETRY & HISTORY -->
        <div class="damage-ribbon-group">
          <span class="damage-ribbon-label">3. Symmetry &amp; Controls</span>
          <div class="damage-ribbon-row">
            <button class="damage-tool-btn" id="btn-damage-mirror" title="Toggle port/starboard symmetry (Hotkey: M)">
              <span class="pixel-icon icon-mirror size-16"></span>
              <span>Symmetry [M]</span>
            </button>
            <button class="damage-tool-btn" id="btn-damage-outlines" title="Toggle red wireframe breach outlines">
              <span class="pixel-icon icon-calipers size-16"></span>
              <span id="label-damage-outlines">Outlines: Off</span>
            </button>
            <button class="damage-tool-btn" id="btn-damage-undo" title="Undo previous stroke (Ctrl+Z)">
              <span class="pixel-icon icon-undo size-16"></span>
              <span>Undo [Z]</span>
            </button>
            <button class="damage-tool-btn" id="btn-damage-redo" title="Redo previous stroke (Ctrl+Y)">
              <span class="pixel-icon icon-redo size-16"></span>
              <span>Redo [Y]</span>
            </button>
          </div>
        </div>
      </footer>

      <!-- Custom Pristine Reset Modal derived from PNG pixel-art chalkboard/panel board frame -->
      <div class="damage-modal-backdrop" id="modal-pristine-reset" style="display: none;">
        <div class="damage-modal-card">
          <div class="damage-modal-header">
            <h3>
              <span class="pixel-icon icon-anchor size-18"></span>
              Restore Vessel to Pristine
            </h3>
            <button class="damage-modal-close-btn" id="btn-cancel-pristine-x" title="Close"><span class="pixel-icon icon-close size-14"></span></button>
          </div>
          <div class="damage-modal-body">
            <p style="margin: 0; color: #f1f5f9;">
              Are you sure you want to restore the vessel to <strong style="color: #4ade80;">100% pristine condition</strong>?
            </p>
            <div class="damage-modal-warning-callout">
              All carved breaches, structural gouges, cannonball craters, and battle damage will be wiped clean.
            </div>
          </div>
          <div class="damage-modal-footer">
            <button class="damage-modal-btn damage-modal-btn-cancel" id="btn-cancel-pristine">Cancel</button>
            <button class="damage-modal-btn damage-modal-btn-confirm" id="btn-confirm-pristine">Confirm Reset</button>
          </div>
        </div>
      </div>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    // Brush Selection
    this._el.querySelectorAll('[data-brush]').forEach(btn => {
      btn.onclick = () => {
        const brush = btn.dataset.brush;
        emit('workshopSelectBrush', { brush });
      };
    });

    // Brush Size Selection
    this._el.querySelectorAll('[data-size]').forEach(btn => {
      btn.onclick = () => {
        const size = btn.dataset.size;
        emit('workshopSelectSize', { size });
      };
    });

    // Mirror Mode
    const mirrorBtn = this._el.querySelector('#btn-damage-mirror');
    if (mirrorBtn) {
      mirrorBtn.onclick = () => emit('workshopToggleMirror');
    }

    // Outlines Toggle
    const outlinesBtn = this._el.querySelector('#btn-damage-outlines');
    if (outlinesBtn) {
      outlinesBtn.onclick = () => emit('workshopToggleOutlines');
    }

    // Undo / Redo
    const undoBtn = this._el.querySelector('#btn-damage-undo');
    if (undoBtn) {
      undoBtn.onclick = () => emit('workshopUndo');
    }

    const redoBtn = this._el.querySelector('#btn-damage-redo');
    if (redoBtn) {
      redoBtn.onclick = () => emit('workshopRedo');
    }

    // Reset Pristine Modal Handling
    const resetBtn = this._el.querySelector('#btn-reset-pristine');
    const modal = this._el.querySelector('#modal-pristine-reset');
    const cancelBtn = this._el.querySelector('#btn-cancel-pristine');
    const cancelXBtn = this._el.querySelector('#btn-cancel-pristine-x');
    const confirmBtn = this._el.querySelector('#btn-confirm-pristine');

    const closeModal = () => {
      if (modal) modal.style.display = 'none';
    };

    if (resetBtn && modal) {
      resetBtn.onclick = () => {
        modal.style.display = 'flex';
      };
    }
    if (cancelBtn) cancelBtn.onclick = closeModal;
    if (cancelXBtn) cancelXBtn.onclick = closeModal;
    if (modal) {
      modal.onclick = (e) => {
        if (e.target === modal) closeModal();
      };
    }

    if (confirmBtn) {
      confirmBtn.onclick = () => {
        closeModal();
        emit('workshopResetPristine');
        this.showToast('Vessel restored to pristine condition!');
      };
    }

    // Done / Back to Level Editor
    const doneBtn = this._el.querySelector('#btn-done-workshop');
    if (doneBtn) {
      doneBtn.onclick = () => {
        emit('editorCloseDamageWorkshop');
      };
    }

    // Import Boat From Level File
    const importBtn = this._el.querySelector('#btn-import-boat');
    const fileInput = this._el.querySelector('#file-import-boat');

    if (importBtn && fileInput) {
      importBtn.onclick = () => {
        fileInput.value = '';
        fileInput.click();
      };

      fileInput.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (readEvent) => {
          try {
            const json = JSON.parse(readEvent.target.result);
            emit('workshopImportBoat', { levelJson: json });
            this.showToast(`Imported boat from ${file.name}!`);
          } catch (err) {
            this.showToast(`Import failed: ${err.message}`);
          }
        };
        reader.readAsText(file);
      };
    }
  }

  _updateHUD() {
    if (!this._el) return;

    // Ship Info
    const iconEl = this._el.querySelector('#stat-ship-icon');
    const nameEl = this._el.querySelector('#stat-ship-name');
    if (iconEl) iconEl.innerHTML = this._stats.shipIcon;
    if (nameEl) nameEl.textContent = this._stats.shipName;

    // Integrity
    const pct = this._stats.integrityPct;
    const fillEl = this._el.querySelector('#stat-integrity-fill');
    const valEl = this._el.querySelector('#stat-integrity-val');
    if (fillEl) {
      fillEl.style.width = `${pct}%`;
      if (pct > 75) fillEl.style.background = '#10b981'; // Green
      else if (pct > 40) fillEl.style.background = '#f59e0b'; // Amber
      else fillEl.style.background = '#ef4444'; // Red
    }
    if (valEl) {
      valEl.textContent = `${pct}%`;
      if (pct <= 40) valEl.style.color = '#ef4444';
      else if (pct <= 75) valEl.style.color = '#f59e0b';
      else valEl.style.color = '#f8fafc';
    }

    // Breaches & Leaks
    const missingEl = this._el.querySelector('#stat-missing-val');
    const leaksEl = this._el.querySelector('#stat-leaks-val');
    if (missingEl) {
      missingEl.textContent = `${this._stats.missing} ${this._stats.missing === 1 ? 'Hole' : 'Holes'}`;
    }
    if (leaksEl) {
      const leaks = this._stats.leaks;
      leaksEl.textContent = `${leaks} ${leaks === 1 ? 'Waterline Leak' : 'Waterline Leaks'}`;
      if (leaks > 0) {
        leaksEl.classList.add('leak-hazard');
      } else {
        leaksEl.classList.remove('leak-hazard');
        leaksEl.style.color = '#94a3b8';
      }
    }

    // Repair Cost & Budget
    const costEl = this._el.querySelector('#stat-cost-val');
    const budgetEl = this._el.querySelector('#stat-budget-val');
    if (costEl) costEl.textContent = `$${this._stats.repairCost}`;
    if (budgetEl) {
      const budget = this._stats.levelBudget;
      const cost = this._stats.repairCost;
      if (cost > budget) {
        budgetEl.innerHTML = `/ $${budget} (<strong style="color: #ef4444;">+$${cost - budget} Over!</strong>)`;
      } else {
        budgetEl.innerHTML = `/ $${budget} (<span style="color: #10b981;">$${budget - cost} spare</span>)`;
      }
    }
  }

  _updateBrushButtons() {
    this._el.querySelectorAll('[data-brush]').forEach(b => {
      const isTarget = b.dataset.brush === this._activeBrush;
      b.classList.remove('active', 'patch-active');
      if (isTarget) {
        if (this._activeBrush === DamageBrushType.PATCH) {
          b.classList.add('patch-active');
        } else {
          b.classList.add('active');
        }
      }
    });
  }

  _updateSizeButtons() {
    this._el.querySelectorAll('[data-size]').forEach(b => {
      b.classList.toggle('active', b.dataset.size === this._activeSize);
    });
  }

  _updateMirrorButton() {
    const btn = this._el.querySelector('#btn-damage-mirror');
    if (btn) {
      btn.classList.toggle('active', this._mirrorMode);
    }
  }

  showToast(message) {
    const toast = this._el.querySelector('#damage-toast');
    const msg = this._el.querySelector('#damage-toast-msg');
    if (!toast || !msg) return;

    msg.textContent = message;
    toast.classList.add('visible');

    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.remove('visible');
    }, 2800);
  }
}

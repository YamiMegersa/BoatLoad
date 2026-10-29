import { emit, on, off } from '../core/EventBus.js';
import { NauticalChartRenderer } from './NauticalChartRenderer.js';

/**
 * PreSailChartModal — Full Tactical Nautical Paper Chart Briefing.
 *
 * Replaces the timed anchor countdown with an authentic captain's sea chart modal
 * showing the entire voyage course, terrain, hazards, goal harbor, and player vessel.
 * Remains open until the player presses [Space] or clicks [Set Sail].
 */
export class PreSailChartModal {
  constructor() {
    this._renderer = new NauticalChartRenderer();
    this._root = null;
    this._canvas = null;
    this._onComplete = null;
    this._isOpen = false;
    this._levelCfg = null;
    this._resizeHandler = null;

    this._onOpenModal = (opts) => this.open(opts);
    this._onCloseModal = () => this.close();
    this._onKeyDown = (e) => {
      if ((e.code === 'Space' || e.code === 'Enter') && this._isOpen) {
        e.preventDefault();
        this.setSail();
      }
    };

    on('openPreSailChart', this._onOpenModal);
    // Backwards compatibility with any legacy triggers
    on('startAnchorCountdown', this._onOpenModal);
    on('cancelAnchorCountdown', this._onCloseModal);
    window.addEventListener('keydown', this._onKeyDown);
  }

  /**
   * Opens the full tactical sea chart.
   * @param {object} opts
   * @param {object} [opts.levelCfg]
   * @param {import('../editor/VoxelTerrain.js').VoxelTerrain} [opts.voxelTerrain]
   * @param {Array} [opts.obstacles]
   * @param {Array} [opts.sirens]
   * @param {{ x: number, z: number }} [opts.playerPos]
   * @param {number} [opts.playerYaw]
   * @param {object} [opts.endLocation]
   * @param {Function} [opts.onComplete]
   */
  open(opts = {}) {
    this.close();

    this._onComplete = opts.onComplete || null;
    this._levelCfg = opts.levelCfg || (window.gameState?._levelCfg) || {};
    this._isOpen = true;

    this._buildDOM(opts);
    this._renderMap(opts);

    emit('playSound', { sound: 'paper_rustle' });
  }

  close() {
    if (!this._isOpen && !this._root) return;
    this._isOpen = false;
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    if (this._root) {
      this._root.remove();
      this._root = null;
    }
  }

  setSail() {
    if (!this._isOpen) return;
    this._isOpen = false;

    emit('playSound', { sound: 'anchor_lock' });

    if (this._root) {
      this._root.classList.add('chart-unroll-exit');
      setTimeout(() => {
        this.close();
        if (this._onComplete) {
          const cb = this._onComplete;
          this._onComplete = null;
          cb();
        }
      }, 400);
    } else {
      if (this._onComplete) {
        const cb = this._onComplete;
        this._onComplete = null;
        cb();
      }
    }
  }

  _buildDOM(opts) {
    const uiRoot = document.getElementById('ui-root') || document.body;

    const overlay = document.createElement('div');
    overlay.className = 'nautical-chart-backdrop';
    overlay.id = 'presail-chart-modal';

    const dayNum = this._levelCfg.day || (window.gameState?.currentDay) || 1;
    const isCommunity = Boolean(window.gameState?._isCommunityCourse || window.gameState?._activeCommunityCourseCode);
    const title = isCommunity 
      ? (window.gameState?._activeCommunityCourse?.title || 'COMMUNITY VOYAGE')
      : `DAY ${dayNum} — NAVIGATION BRIEFING`;

    const weather = this._levelCfg.weather || 'fair';
    const endLoc = opts.endLocation || window.gameState?._endLocation || { position: { x: 0, z: -220 } };
    const pPos = opts.playerPos || { x: 0, z: 0 };
    const distanceFathoms = Math.round(Math.hypot(endLoc.position.x - pPos.x, endLoc.position.z - pPos.z));

    overlay.innerHTML = `
      <div class="nautical-chart-table">
        <div class="nautical-chart-frame">
          <div class="nautical-chart-header">
            <div class="nautical-header-left">
              <span class="pixel-icon icon-sloop size-20"></span>
              <div class="nautical-title-group">
                <h2 class="nautical-chart-title">${title}</h2>
                <div class="nautical-chart-subtitle">MARITIME ADMIRALTY NAVIGATION CHART • SCALE 1:500</div>
              </div>
            </div>
            <div class="nautical-header-stats">
              <div class="nautical-stat-pill">
                <span class="stat-label">WEATHER</span>
                <span class="stat-val">${weather.toUpperCase()}</span>
              </div>
              <div class="nautical-stat-pill">
                <span class="stat-label">EST. VOYAGE</span>
                <span class="stat-val">${distanceFathoms} FATHOMS</span>
              </div>
            </div>
          </div>

          <div class="nautical-canvas-wrapper">
            <canvas id="presail-chart-canvas" width="860" height="520"></canvas>
          </div>

          <div class="nautical-chart-footer">
            <div class="nautical-chart-legend">
              <span class="legend-item"><span class="legend-swatch rock"></span> Submerged Reef</span>
              <span class="legend-item"><span class="legend-swatch siren"></span> Siren Shoals</span>
              <span class="legend-item"><span class="legend-swatch goal"></span> Safe Anchorage</span>
              <span class="legend-item"><span class="legend-swatch ship"></span> Vessel Berth</span>
            </div>

            <div class="nautical-action-group">
              <button id="btn-chart-set-sail" class="action-btn-primary nautical-sail-btn" title="Cast off mooring lines and set sail (Spacebar)">
                <span class="btn-icon">⚓</span>
                <span>SET SAIL</span>
                <span class="btn-hotkey">[SPACE]</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    uiRoot.appendChild(overlay);
    this._root = overlay;
    this._canvas = overlay.querySelector('#presail-chart-canvas');

    overlay.querySelector('#btn-chart-set-sail')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setSail();
    });

    this._resizeHandler = () => this._handleResize(opts);
    window.addEventListener('resize', this._resizeHandler);
  }

  _handleResize(opts) {
    if (!this._canvas || !this._root) return;
    const wrapper = this._root.querySelector('.nautical-canvas-wrapper');
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    if (rect.width > 200 && rect.height > 200) {
      this._canvas.width = Math.min(1200, Math.round(rect.width * window.devicePixelRatio));
      this._canvas.height = Math.min(800, Math.round(rect.height * window.devicePixelRatio));
      this._renderMap(opts);
    }
  }

  _renderMap(opts) {
    if (!this._canvas) return;

    const gs = window.gameState;
    const playerShip = gs?._playerShip;
    const pPos = opts.playerPos || (playerShip ? { x: playerShip.mesh.position.x, z: playerShip.mesh.position.z } : { x: 0, z: 0 });
    const pYaw = opts.playerYaw ?? (playerShip ? playerShip.yaw : 0);
    const endLoc = opts.endLocation || gs?._endLocation || { position: { x: 0, z: -220 }, radius: 16 };
    const obstacles = opts.obstacles || gs?._obstacleManager?._obstacles || [];
    const sirens = opts.sirens || gs?._sirenManager?._sirens || this._levelCfg.sirens || [];
    const voxelTerrain = opts.voxelTerrain || gs?._voxelTerrain || null;

    const renderer = opts.renderer || gs?._renderer || null;
    const scene = opts.scene || gs?._scene || null;
    const dockStall = gs?._dockStall || null;
    const hasDock = gs?._hasDock ?? true;

    this._renderer.renderFullCourse({
      canvas: this._canvas,
      levelCfg: this._levelCfg,
      voxelTerrain,
      obstacles,
      sirens,
      playerPos: pPos,
      playerYaw: pYaw,
      endLocation: endLoc,
      renderer,
      scene,
      dockStall,
      hasDock
    });
  }
}

import { on } from '../core/EventBus.js';
import { NauticalChartRenderer } from './NauticalChartRenderer.js';

/**
 * Minimap — In-Game Local Tactical Nautical Chart.
 *
 * Encased in a weathered brass chronometer compass housing, this minimap renders
 * an authentic top-down parchment sea chart of the player's immediate surroundings (75m radius).
 * Features rotating ship-heading projection, local hazard symbols, terrain slices,
 * a golden harbor bearing needle on the rim, and a wind direction indicator.
 */
export class Minimap {
  constructor() {
    this._renderer = new NauticalChartRenderer();
    this._el = document.createElement('div');
    this._el.id = 'minimap';
    this._el.className = 'nautical-minimap-compass';
    this._el.innerHTML = `
      <div class="minimap-brass-bezel">
        <div class="minimap-cardinal-n">N</div>
        <div class="minimap-cardinal-s">S</div>
        <div class="minimap-cardinal-e">E</div>
        <div class="minimap-cardinal-w">W</div>
      </div>
      <div id="minimap-content">
        <canvas id="minimap-canvas" width="220" height="220"></canvas>
      </div>
    `;

    this._canvas = this._el.querySelector('#minimap-canvas');

    on('uiMount', d => { if (d.screen === 'obstacle') this.mount(document.getElementById('ui-root')); });
    on('uiUnmount', d => { if (d.screen === 'obstacle') this.unmount(); });
  }

  mount(parent) {
    if (parent && !this._el.parentNode) {
      parent.appendChild(this._el);
      const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
      if (this._canvas) {
        this._canvas.width = Math.round(220 * dpr);
        this._canvas.height = Math.round(220 * dpr);
      }
    }
  }

  unmount() {
    if (this._el.parentNode) this._el.remove();
  }

  /**
   * Update the local nautical chart.
   * @param {THREE.Vector3|{x:number, z:number}} playerPos
   * @param {number} playerYaw
   * @param {Array} obstacles
   * @param {THREE.Vector3|{x:number, z:number}} windDir
   */
  update(playerPos, playerYaw, obstacles, windDir) {
    if (!this._el.parentNode || !this._canvas) return;

    const gs = window.gameState;
    const sirens = gs?._sirenManager?._sirens || gs?._levelCfg?.sirens || [];
    const endLocation = gs?._endLocation || null;
    const voxelTerrain = gs?._voxelTerrain || null;
    const renderer = gs?._renderer || null;
    const scene = gs?._scene || null;
    const dockStall = gs?._dockStall || null;
    const hasDock = gs?._hasDock ?? true;

    this._renderer.renderLocalView({
      canvas: this._canvas,
      playerPos,
      playerYaw,
      obstacles,
      sirens,
      windDir,
      endLocation,
      voxelTerrain,
      renderer,
      scene,
      dockStall,
      hasDock,
      viewRadius: 75
    });
  }
}

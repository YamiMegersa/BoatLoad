import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ShipBuilder }    from '../shipyard/ShipBuilder.js';
import { ChunkRenderer }  from '../shipyard/ChunkRenderer.js';
import { ShipRaycaster }  from '../shipyard/ShipRaycaster.js';
import { RepairSystem }   from '../shipyard/RepairSystem.js';
import { DamageSystem }   from '../shipyard/DamageSystem.js';
import { PlayerShip }     from '../obstacle/PlayerShip.js';
import { ObstacleManager } from '../obstacle/ObstacleManager.js';
import { QTESystem }      from '../obstacle/QTESystem.js';
import { emit, on, off, clear } from './EventBus.js';

// ---------------------------------------------------------------------------
// Phase enum
// ---------------------------------------------------------------------------

export const GamePhase = Object.freeze({
  DOCK:     'DOCK',
  SHIPYARD: 'SHIPYARD',
  OBSTACLE: 'OBSTACLE',
  RESULTS:  'RESULTS',
});

// ---------------------------------------------------------------------------
// GameState — finite state machine
// ---------------------------------------------------------------------------

/**
 * GameState — central phase manager and memory controller.
 *
 * Owns all phase-specific resources and tears them down cleanly on transition.
 * All game logic flows through events emitted to EventBus.
 */
export class GameState {
  /**
   * @param {THREE.Scene}    scene
   * @param {THREE.Camera}   camera
   * @param {THREE.WebGLRenderer} renderer
   */
  constructor(scene, camera, renderer) {
    this._scene    = scene;
    this._camera   = camera;
    this._renderer = renderer;

    this.currentPhase = null;

    // Day / session data
    this.day           = 1;
    this.shipId        = 'sloop';
    this.abilityInventory = [];

    // Phase-specific instances (null when not active)
    this._grid          = null;
    this._zones         = null;
    this._levelCfg      = null;

    this._chunkRenderer = null;
    this._raycaster     = null;
    this._repairSystem  = null;
    this._orbitControls = null;
    this._mouseNDC      = new THREE.Vector2();

    this._playerShip      = null;
    this._obstacleManager = null;
    this._qteSystem       = null;

    // Pointer event for shipyard raycasting
    this._boundPointerDown = this._onPointerDown.bind(this);
  }

  // -------------------------------------------------------------------------
  // Transition
  // -------------------------------------------------------------------------

  /**
   * Switch to a new phase, tearing down the old one first.
   * @param {string} newPhase   GamePhase.*
   * @param {object} [opts]     Optional data passed to the entering phase
   */
  async transition(newPhase, opts = {}) {
    if (this.currentPhase === newPhase) return;

    await this._onExit(this.currentPhase);
    this.currentPhase = newPhase;
    await this._onEnter(newPhase, opts);

    emit('phaseChanged', { phase: newPhase });
  }

  // -------------------------------------------------------------------------
  // Frame update — delegated from main.js tick()
  // -------------------------------------------------------------------------

  /**
   * @param {number} delta  Seconds since last frame
   */
  update(delta) {
    switch (this.currentPhase) {
      case GamePhase.SHIPYARD:
        this._updateShipyard(delta);
        break;

      case GamePhase.OBSTACLE:
        this._updateObstacle(delta);
        break;

      default:
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Phase entry handlers
  // -------------------------------------------------------------------------

  async _onEnter(phase, opts) {
    switch (phase) {
      case GamePhase.DOCK:
        this._enterDock(opts);
        break;

      case GamePhase.SHIPYARD:
        await this._enterShipyard(opts);
        break;

      case GamePhase.OBSTACLE:
        this._enterObstacle(opts);
        break;

      case GamePhase.RESULTS:
        this._enterResults(opts);
        break;

      default:
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Phase exit handlers
  // -------------------------------------------------------------------------

  async _onExit(phase) {
    switch (phase) {
      case GamePhase.SHIPYARD:
        this._exitShipyard();
        break;

      case GamePhase.OBSTACLE:
        this._exitObstacle();
        break;

      default:
        break;
    }
  }

  // =========================================================================
  // DOCK
  // =========================================================================

  _enterDock(opts) {
    // Set up fixed cinematic camera
    this._camera.position.set(0, 5, 20);
    this._camera.lookAt(0, 0, 0);
    emit('uiMount', { screen: 'dock' });
  }

  // =========================================================================
  // SHIPYARD
  // =========================================================================

  async _enterShipyard({ shipDef, levelCfg }) {
    this._levelCfg = levelCfg;

    // Build the voxel data
    const { grid, zones, def } = ShipBuilder.build(shipDef, levelCfg);
    this._grid  = grid;
    this._zones = zones;

    // Chunk renderer
    this._chunkRenderer = new ChunkRenderer();
    this._chunkRenderer.init(grid, this._scene);

    // BVH raycaster
    this._raycaster = new ShipRaycaster();
    this._raycaster.build(grid, this._scene);

    // Repair system
    this._repairSystem = new RepairSystem();
    this._repairSystem.init(grid, zones, levelCfg.docket);

    // Orbit controls
    this._orbitControls = new OrbitControls(this._camera, this._renderer.domElement);
    this._orbitControls.target.set(
      (def.grid.x * 0.5),
      (def.grid.y * 0.5),
      (def.grid.z * 0.5),
    );
    this._orbitControls.update();

    // Pointer event for clicking cells
    this._renderer.domElement.addEventListener('pointerdown', this._boundPointerDown);

    // Rebuild BVH when topology changes (repair fills a MISSING cell)
    on('cellRepaired', () => {
      if (this._grid?.consumeTopologyDirty()) {
        this._raycaster.rebuild(this._grid);
      }
    });

    // Sync renderer on dirty events
    on('gridDirty', () => {
      if (this._grid && this._chunkRenderer) {
        this._chunkRenderer.sync(this._grid);
      }
    });

    emit('uiMount', { screen: 'shipyard', docket: levelCfg.docket });
  }

  _updateShipyard(_delta) {
    this._orbitControls?.update();
  }

  _exitShipyard() {
    // Remove event listeners
    this._renderer.domElement.removeEventListener('pointerdown', this._boundPointerDown);
    off('cellRepaired');
    off('gridDirty');

    // Dispose all Three.js objects
    this._raycaster?.dispose(this._scene);
    this._chunkRenderer?.dispose(this._scene);
    this._repairSystem?.reset();
    this._orbitControls?.dispose();

    this._grid          = null;
    this._zones         = null;
    this._raycaster     = null;
    this._chunkRenderer = null;
    this._repairSystem  = null;
    this._orbitControls = null;

    emit('uiUnmount', { screen: 'shipyard' });
  }

  // Pointer handler — Shipyard phase only
  _onPointerDown(event) {
    if (this.currentPhase !== GamePhase.SHIPYARD) return;

    const rect = this._renderer.domElement.getBoundingClientRect();
    this._mouseNDC.set(
      ((event.clientX - rect.left) / rect.width)  *  2 - 1,
      -((event.clientY - rect.top)  / rect.height) *  2 + 1,
    );

    const cell = this._raycaster.cast(this._mouseNDC, this._camera);
    if (cell) {
      this._repairSystem.applyTool(cell.x, cell.y, cell.z);
    }
  }

  // =========================================================================
  // OBSTACLE
  // =========================================================================

  _enterObstacle({ levelCfg, shipStats }) {
    // Semi top-down camera
    this._camera.position.set(0, 14, 10);
    this._camera.lookAt(0, 0, -5);

    this._playerShip = new PlayerShip(shipStats ?? { hullHP: 100 }, this._scene);
    this._obstacleManager = new ObstacleManager();
    this._obstacleManager.init(levelCfg.obstacles, this._scene);
    this._qteSystem = new QTESystem();

    // Keyboard steering
    this._boundKeyDown = e => {
      if (e.code === 'ArrowLeft'  || e.code === 'KeyA') this._playerShip.steerInput = -1;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this._playerShip.steerInput =  1;
    };
    this._boundKeyUp = e => {
      if (['ArrowLeft','KeyA','ArrowRight','KeyD'].includes(e.code)) {
        this._playerShip.steerInput = 0;
      }
    };
    window.addEventListener('keydown', this._boundKeyDown);
    window.addEventListener('keyup',   this._boundKeyUp);

    // When player sinks, transition to results
    on('playerSunk', () => {
      this.transition(GamePhase.RESULTS, { passed: false });
    });

    emit('uiMount', { screen: 'obstacle' });
  }

  _updateObstacle(delta) {
    this._playerShip?.update(delta);
    this._obstacleManager?.update(delta, this._playerShip);
  }

  _exitObstacle() {
    window.removeEventListener('keydown', this._boundKeyDown);
    window.removeEventListener('keyup',   this._boundKeyUp);
    off('playerSunk');

    this._playerShip?.dispose(this._scene);
    this._obstacleManager?.dispose();
    this._qteSystem?.dispose();

    this._playerShip      = null;
    this._obstacleManager = null;
    this._qteSystem       = null;

    emit('uiUnmount', { screen: 'obstacle' });
  }

  // =========================================================================
  // RESULTS
  // =========================================================================

  _enterResults({ passed }) {
    emit('uiMount', { screen: 'results', passed, day: this.day });
    if (passed) this.day++;
  }
}

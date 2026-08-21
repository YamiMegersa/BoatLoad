import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ShipBuilder }    from '../shipyard/ShipBuilder.js';
import { ChunkRenderer }  from '../shipyard/ChunkRenderer.js';
import { ShipRaycaster }  from '../shipyard/ShipRaycaster.js';
import { BuildSystem }    from '../shipyard/BuildSystem.js';
import { DamageSystem }   from '../shipyard/DamageSystem.js';
import { PlayerShip }     from '../obstacle/PlayerShip.js';
import { ObstacleManager } from '../obstacle/ObstacleManager.js';
import { EnvironmentManager } from '../environment/EnvironmentManager.js';
import { SharkSkinRepair }    from '../environment/SharkSkinRepair.js';
import { FishAnimator }       from '../environment/FishAnimator.js';
import { Ocean }              from '../environment/Ocean.js';
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

    // Global ocean instance (persists across phases)
    this._ocean = new Ocean();
    this._ocean.init(this._scene);

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
    this._buildSystem   = null;
    this._orbitControls = null;
    this._mouseNDC      = new THREE.Vector2();

    // Debug prototyping
    this._debugShark      = null;
    this._debugSharkAnim  = null;
    this._debugSharkBaseY = 0;

    this._playerShip      = null;
    this._obstacleManager = null;
    this._environmentManager = null;
    this._qteSystem       = null;

    // Input tracking
    this._keys = {};
    this._boundKeyDown = (e) => { this._keys[e.code] = true; };
    this._boundKeyUp   = (e) => { this._keys[e.code] = false; };
    window.addEventListener('keydown', this._boundKeyDown);
    window.addEventListener('keyup', this._boundKeyUp);

    this._boundPointerDown = this._onPointerDown.bind(this);
    this._boundPointerMove = this._onPointerMove.bind(this);

    // Patch keydown to handle single-press R
    const oldKeyDown = this._boundKeyDown;
    this._boundKeyDown = (e) => {
      oldKeyDown(e);
      if (e.code === 'KeyR' && this.currentPhase === GamePhase.SHIPYARD) {
        emit('rotateBlueprint');
      }
    };
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
    this._ocean.update(delta);

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

  async _enterShipyard({ shipDef, levelCfg, fishModels }) {
    this._levelCfg = levelCfg;

    // Build the voxel data
    const { grid, zones, def, gltfScene } = await ShipBuilder.build(shipDef, levelCfg);
    this._grid  = grid;
    this._zones = zones;

    // Chunk renderer
    this._chunkRenderer = new ChunkRenderer();
    this._chunkRenderer.init(grid, this._scene, gltfScene);

    // BVH raycaster
    this._raycaster = new ShipRaycaster();
    this._raycaster.build(grid, this._scene);

    // Build system
    this._buildSystem = new BuildSystem();
    this._buildSystem.init(grid, this._scene);

    // Orbit controls
    this._orbitControls = new OrbitControls(this._camera, this._renderer.domElement);
    const cx = def.grid.x * 0.5;
    const cy = def.grid.y * 0.5;
    const cz = def.grid.z * 0.5;
    
    // Frame the camera nicely relative to the ship size
    this._camera.position.set(cx + def.grid.x, cy + def.grid.y + 5, cz + def.grid.z + 15);
    this._orbitControls.target.set(cx, cy, cz);
    this._orbitControls.update();

    // PROTOTYPE DEBUG: Render a random fish directly next to the boat
    if (fishModels && fishModels.length > 0) {
      const fishModel = fishModels[Math.floor(Math.random() * fishModels.length)];
      this._debugShark = fishModel.scene;
      const normScale = fishModel.normSharkScale ?? 1;
      this._debugShark.scale.setScalar(normScale);
      this._debugShark.position.set(cx + 8, cy, cz);
      this._scene.add(this._debugShark);
      
      // Repair the missing skin so the Tail bone can deform the mesh
      const repair = SharkSkinRepair.repair(this._debugShark);
      
      // Turn off frustum culling so the shark stays visible while animated
      this._debugShark.traverse(c => {
        if (c.isMesh || c.isSkinnedMesh) c.frustumCulled = false;
      });

      this._debugSharkBaseY = cy;
      this._debugSharkAnim  = new FishAnimator(
        this._debugShark,
        repair?.tailBone ?? null,
        1.0
      );
    }

    // Pointer event for clicking cells
    this._renderer.domElement.addEventListener('pointerdown', this._boundPointerDown);
    this._renderer.domElement.addEventListener('pointermove', this._boundPointerMove);

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

    emit('uiMount', { screen: 'shipyard' });
  }

  _updateShipyard(delta) {
    if (this._debugSharkAnim) {
      this._debugSharkAnim.update(delta);
      this._debugShark.position.y = this._debugSharkBaseY + this._debugSharkAnim.bobOffset;
    }

    if (this._orbitControls) {
      // WASD panning
      const speed = 20 * delta;
      
      // Get camera's local forward/right vectors (ignoring Y to pan along the flat plane)
      const forward = new THREE.Vector3();
      this._camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      
      const right = new THREE.Vector3();
      right.crossVectors(forward, this._camera.up).normalize();

      const move = new THREE.Vector3();
      if (this._keys['KeyW']) move.add(forward);
      if (this._keys['KeyS']) move.sub(forward);
      if (this._keys['KeyA']) move.sub(right);
      if (this._keys['KeyD']) move.add(right);
      
      if (this._keys['KeyE'] || this._keys['Space']) move.y += 1;
      if (this._keys['KeyQ'] || this._keys['ShiftLeft']) move.y -= 1;

      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(speed);
        this._camera.position.add(move);
        this._orbitControls.target.add(move);
      }

      this._orbitControls.update();
    }
  }

  _exitShipyard() {
    // Remove event listeners
    this._renderer.domElement.removeEventListener('pointerdown', this._boundPointerDown);
    this._renderer.domElement.removeEventListener('pointermove', this._boundPointerMove);
    off('cellRepaired');
    off('gridDirty');

    // Dispose all Three.js objects except the ChunkRenderer and VoxelGrid
    this._raycaster?.dispose(this._scene);
    this._buildSystem?.reset();
    this._orbitControls?.dispose();
    
    if (this._debugShark) {
      this._scene.remove(this._debugShark);
      this._debugShark     = null;
      this._debugSharkAnim = null;
    }

    this._zones         = null;
    this._raycaster     = null;
    this._buildSystem   = null;
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

    const result = this._raycaster.cast(this._mouseNDC, this._camera);
    if (result) {
      this._buildSystem.placeObject(result.cell.x, result.cell.y, result.cell.z, result.normal);
    }
  }

  _onPointerMove(event) {
    if (this.currentPhase !== GamePhase.SHIPYARD) return;

    const rect = this._renderer.domElement.getBoundingClientRect();
    this._mouseNDC.set(
      ((event.clientX - rect.left) / rect.width)  *  2 - 1,
      -((event.clientY - rect.top)  / rect.height) *  2 + 1,
    );

    const result = this._raycaster.cast(this._mouseNDC, this._camera);
    if (result) {
      this._buildSystem.updatePreview(result.cell.x, result.cell.y, result.cell.z, result.normal);
    } else {
      this._buildSystem.clearPreview();
    }
  }

  // =========================================================================
  // OBSTACLE
  // =========================================================================

  _enterObstacle({ levelCfg, shipStats, rockModels, fishModels, pickupModels, seaweedModels, waveModels }) {
    // Semi top-down camera
    this._camera.position.set(0, 14, 10);
    this._camera.lookAt(0, 0, -5);

    this._playerShip = new PlayerShip(shipStats ?? {}, this._scene, this._chunkRenderer, this._grid);
    this._obstacleManager = new ObstacleManager();
    this._obstacleManager.init(levelCfg.obstacles, this._scene, rockModels, pickupModels, seaweedModels, waveModels);
    
    this._environmentManager = new EnvironmentManager();
    this._environmentManager.init(this._scene, fishModels);
    
    this._qteSystem = new QTESystem();

    // Keyboard steering
    this._obstacleKeyDown = e => {
      if (e.code === 'ArrowLeft'  || e.code === 'KeyA') this._playerShip.steerInput = -1;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this._playerShip.steerInput =  1;
    };
    this._obstacleKeyUp = e => {
      if (['ArrowLeft','KeyA','ArrowRight','KeyD'].includes(e.code)) {
        this._playerShip.steerInput = 0;
      }
    };
    window.addEventListener('keydown', this._obstacleKeyDown);
    window.addEventListener('keyup',   this._obstacleKeyUp);

    // When player sinks, transition to results
    on('playerSunk', () => {
      this.transition(GamePhase.RESULTS, { passed: false });
    });

    emit('uiMount', { screen: 'obstacle' });
  }

  _updateObstacle(delta) {
    this._playerShip?.update(delta, this._ocean);
    this._obstacleManager?.update(delta, this._playerShip);
    this._environmentManager?.update(delta);
  }

  _exitObstacle() {
    window.removeEventListener('keydown', this._obstacleKeyDown);
    window.removeEventListener('keyup',   this._obstacleKeyUp);
    off('playerSunk');

    this._playerShip?.dispose(this._scene);
    this._obstacleManager?.dispose();
    this._environmentManager?.dispose();
    this._qteSystem?.dispose();
    this._chunkRenderer?.dispose(this._scene);

    this._playerShip      = null;
    this._obstacleManager = null;
    this._environmentManager = null;
    this._qteSystem       = null;
    this._chunkRenderer   = null;
    this._grid            = null;

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

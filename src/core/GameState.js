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
import { Minimap }        from '../ui/Minimap.js';
import { EditorUI }       from '../ui/EditorUI.js';
import { EditorSystem }   from '../editor/EditorSystem.js';
import { VoxelTerrain }   from '../editor/VoxelTerrain.js';
import { WindManager }        from '../environment/WindManager.js';
import { SirenManager }       from '../monsters/SirenManager.js';
import { KrakenBoss }         from '../monsters/KrakenBoss.js';
import { Sky }                from '../environment/Sky.js';
import { DockStall, DOCK_SCALE } from '../environment/DockStall.js';
import { DockPlayerController } from '../environment/DockPlayerController.js';
import { WeatherSystem }      from '../environment/WeatherSystem.js';
import { LevelConfig }        from './LevelConfig.js';
import { ShipRegistry, DEFAULT_SHIP_ID } from '../config/ShipRegistry.js';
import { emit, on, off, clear } from './EventBus.js';

// ---------------------------------------------------------------------------
// Phase enum
// ---------------------------------------------------------------------------

export const GamePhase = Object.freeze({
  MAIN_MENU:'MAIN_MENU',
  DOCK:     'DOCK',
  SHIPYARD: 'SHIPYARD',
  OBSTACLE: 'OBSTACLE',
  RESULTS:  'RESULTS',
  EDITOR:   'EDITOR',
});

// Mooring position & orientation at the West yard dock (T-head perpendicular berth across west pier terminus)
// Y = -1.4 places the keel submerged while raising the interior floor above water level to keep the deck dry
export const SHIP_MOORED_POS = new THREE.Vector3(-115.0, -1.4, -9.5);
export const SHIP_MOORED_ROT = new THREE.Euler(0, 0, 0);

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
    this._shipDef       = null;

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
    this._minimap         = new Minimap();
    this.score            = 0;
    this._onScoreAdded    = (d) => { this.score += (d.points || 0); };
    on('scoreAdded', this._onScoreAdded);
    this._editorUI        = new EditorUI();
    this._editorSystem    = null;
    this._windManager     = null;
    this._sirenManager    = null;
    this._krakenBoss      = null;
    this._time            = 0;
    this._sky             = new Sky();
    this._sky.init(this._scene);
    this._weather         = new WeatherSystem();
    this._dockStall       = new DockStall();
    
    // Ship arrival cutscene state
    this._shipDocked = true;
    this._shipArriving = false;
    this._shipArrivalTimer = 0;
    this._shipArrivalDuration = 5.5;
    this._dockShipArrived = false;
    this._lastDockLevel = null;
    this._lastDockDay = null;
    this._onDockPlayerEnteredShop = null;

    // End Location (Harbor Goal) state
    this._endLocation = null;
    this._endLocationVisual = null;

    // Global wind direction (e.g., blowing towards North-East)
    this.windDir = new THREE.Vector3(1, 0, -1).normalize();

    // Input tracking
    this._keys = {};
    this._boundKeyDown = (e) => { this._keys[e.code] = true; };
    this._boundKeyUp   = (e) => { this._keys[e.code] = false; };
    window.addEventListener('keydown', this._boundKeyDown);
    window.addEventListener('keyup', this._boundKeyUp);

    this._boundPointerDown = this._onPointerDown.bind(this);
    this._boundPointerMove = this._onPointerMove.bind(this);

    // Patch keydown to handle single-press R and F
    const oldKeyDown = this._boundKeyDown;
    this._boundKeyDown = (e) => {
      oldKeyDown(e);
      if (e.code === 'KeyR' && this.currentPhase === GamePhase.SHIPYARD) {
        emit('rotateBlueprint');
      }
      if (e.code === 'KeyF') {
        if (this._environmentManager) {
          const isDense = this._environmentManager.toggleDenseFog();
          window.denseFogEnabled = isDense;
          emit('denseFogChanged', { enabled: isDense });
        }
      }
    };

    on('toggleDenseFogUI', (d) => {
      if (this._environmentManager) {
        this._environmentManager.toggleDenseFog(d.enabled);
        window.denseFogEnabled = d.enabled;
      }
    });

    on('oceanSetWorldSize', (d) => {
      if (this._ocean) {
        this._ocean.setWorldSize(d.size);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Transition
  // -------------------------------------------------------------------------

  /**
   * Switch to a new phase, tearing down the old one first.
   * @param {string} newPhase   GamePhase.*
   * @param {object} [opts]     Optional data passed to the entering phase
   * @param {boolean} [force]   Force transition even if newPhase === currentPhase
   */
  async transition(newPhase, opts = {}, force = false) {
    if (this.currentPhase === newPhase && !force) return;

    this.nextPhase = newPhase;
    await this._onExit(this.currentPhase);
    this.currentPhase = newPhase;
    this.nextPhase = null;
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
    this._time += delta;
    this._ocean.update(delta);
    if (this._weather) this._weather.update(delta);

    switch (this.currentPhase) {
      case GamePhase.DOCK:
        if (this._dockStall) this._dockStall.update(delta, this._time);
        if (this._dockPlayerController) this._dockPlayerController.update(delta);
        if (this._dockOrbitControls && this._dockOrbitControls.enabled) this._dockOrbitControls.update();
        if (this._dockMooredGroup && this._dockMooredGroup.visible) {
          const isTruck = this._mooredShipProfile?.isGagTruck;
          const s = this._mooredShipProfile?.scale || 0.12;
          const draft = (this._mooredShipProfile?.waterlineY || 4) * s;
          const bob = Math.sin(this._time * 1.6) * 0.05;
          const roll = Math.sin(this._time * 1.1) * 0.03;

          if (this._shipArriving) {
            this._shipArrivalTimer += delta;
            const t = Math.min(1.0, this._shipArrivalTimer / this._shipArrivalDuration);
            // Smoothstep curve for seamless acceleration and gentle docking
            const ease = t * t * (3 - 2 * t);
            const u = 1 - ease;
            const tt = ease;

            // Cubic Bezier interpolation: P = u^3*P0 + 3*u^2*tt*P1 + 3*u*tt^2*P2 + tt^3*P3
            const bx = u * u * u * this._dockMooredP0.x +
                       3 * u * u * tt * this._dockMooredP1.x +
                       3 * u * tt * tt * this._dockMooredP2.x +
                       tt * tt * tt * this._dockMooredTargetPos.x;

            const bz = u * u * u * this._dockMooredP0.z +
                       3 * u * u * tt * this._dockMooredP1.z +
                       3 * u * tt * tt * this._dockMooredP2.z +
                       tt * tt * tt * this._dockMooredTargetPos.z;

            // Analytical tangent derivative dP/d(ease) for realistic boat heading
            const tx = 3 * u * u * (this._dockMooredP1.x - this._dockMooredP0.x) +
                       6 * u * tt * (this._dockMooredP2.x - this._dockMooredP1.x) +
                       3 * tt * tt * (this._dockMooredTargetPos.x - this._dockMooredP2.x);

            const tz = 3 * u * u * (this._dockMooredP1.z - this._dockMooredP0.z) +
                       6 * u * tt * (this._dockMooredP2.z - this._dockMooredP1.z) +
                       3 * tt * tt * (this._dockMooredTargetPos.z - this._dockMooredP2.z);

            const tangentYaw = Math.atan2(tx, tz);
            // Smoothly align parallel to the pier (yaw = 0) in the final docking stretch
            const blendT = THREE.MathUtils.clamp((ease - 0.7) / 0.3, 0, 1);
            const rotY = THREE.MathUtils.lerp(tangentYaw, 0, blendT);

            // Subtle inward banking roll during turn, plus wave motion
            const turnRoll = -0.05 * Math.sin(t * Math.PI);

            this._dockMooredGroup.position.set(bx, -draft + bob, bz);
            this._dockMooredGroup.rotation.set(
              Math.sin(this._time * 2.0) * 0.02,
              rotY,
              roll * 1.2 + turnRoll
            );

            if (t >= 1.0) {
              this._shipArriving = false;
              this._shipDocked = true;
              this._dockMooredGroup.position.copy(this._dockMooredTargetPos);
              this._dockMooredGroup.position.y = -draft;
              this._dockMooredGroup.rotation.set(0, 0, 0);
              emit('playSound', { sound: 'qte_success' });
              if (this._dockStall) {
                this._dockStall.shipInteractables = [this._dockMooredGroup];
              }
            }
          } else if (this._shipDocked) {
            this._dockMooredGroup.position.y = -draft + bob;
            this._dockMooredGroup.rotation.z = roll;
            if (isTruck) {
              this._dockMooredGroup.rotation.x = -0.45 + Math.sin(this._time * 2.5) * 0.04;
            } else {
              this._dockMooredGroup.rotation.x = Math.sin(this._time * 1.3) * 0.02;
            }
          }
        }
        break;

      case GamePhase.SHIPYARD:
        if (this._dockStall) this._dockStall.update(delta, this._time);
        this._updateShipyard(delta);
        break;

      case GamePhase.OBSTACLE:
        this._updateObstacle(delta);
        break;

      case GamePhase.EDITOR:
        this._updateEditor(delta);
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
      case GamePhase.MAIN_MENU:
        await this._enterMainMenu(opts);
        break;

      case GamePhase.DOCK:
        await this._enterDock(opts);
        break;

      case GamePhase.SHIPYARD:
        await this._enterShipyard(opts);
        break;

      case GamePhase.OBSTACLE:
        await this._enterObstacle(opts);
        break;

      case GamePhase.RESULTS:
        this._enterResults(opts);
        break;

      case GamePhase.EDITOR:
        this._enterEditor(opts);
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
      case GamePhase.DOCK:
        this._exitDock();
        break;
      case GamePhase.MAIN_MENU:
        this._exitMainMenu();
        break;

      case GamePhase.SHIPYARD:
        this._exitShipyard();
        break;

      case GamePhase.OBSTACLE:
        this._exitObstacle();
        break;

      case GamePhase.EDITOR:
        this._exitEditor();
        break;

      case GamePhase.RESULTS:
        emit('uiUnmount', { screen: 'results' });
        break;

      default:
        break;
    }
  }

  // =========================================================================
  // DOCK
  // =========================================================================

  async _enterDock(opts) {
    if (opts?.shipDef) this._shipDef = opts.shipDef;
    if (opts?.levelCfg) this._levelCfg = opts.levelCfg;
    if (opts?.day !== undefined) this.day = opts.day;

    // Clean up any lingering editor system, editor environment group, or voxel terrain
    if (this._editorSystem) {
      this._editorSystem.dispose();
      this._editorSystem = null;
    }
    const lingeringEditorGroup = this._scene.getObjectByName('EditorEnvironmentGroup');
    if (lingeringEditorGroup) {
      this._scene.remove(lingeringEditorGroup);
    }
    if (this._voxelTerrain) {
      this._voxelTerrain.dispose();
      this._voxelTerrain = null;
    }

    const activeShipId = opts?.shipDef?.id || opts?.levelCfg?.ship || this._levelCfg?.ship || this.shipId || DEFAULT_SHIP_ID;
    const activeShipDef = opts?.shipDef || LevelConfig.getShipDef(activeShipId);
    const shipProfile = ShipRegistry.get(activeShipId);
    this._mooredShipProfile = shipProfile;

    // Re-trigger ship arrival if level or day changed
    if (this._lastDockLevel !== activeShipId || this._lastDockDay !== this.day) {
      this._dockShipArrived = false;
      this._lastDockLevel = activeShipId;
      this._lastDockDay = this.day;
    }

    // Build or update ship model if needed so it displays moored in the dock
    if (!this._grid || this._currentShipId !== activeShipId) {
      this._currentShipId = activeShipId;
      const { grid, zones, def, gltfScene } = await ShipBuilder.build(activeShipDef, this._levelCfg);
      this._grid  = grid;
      this._zones = zones;
      if (this._chunkRenderer) {
        this._chunkRenderer.dispose(this._scene);
        this._chunkRenderer = null;
      }
      this._chunkRenderer = new ChunkRenderer();
      this._chunkRenderer.init(grid, this._scene, gltfScene);
    }

    if (!this._dockMooredGroup) {
      this._dockMooredGroup = new THREE.Group();
      this._dockMooredGroup.name = 'dockMooredGroup';
      this._scene.add(this._dockMooredGroup);
    }

    if (this._chunkRenderer && this._chunkRenderer.container) {
      this._dockMooredGroup.add(this._chunkRenderer.container);
      this._chunkRenderer.container.visible = true;

      // Center the voxel grid horizontally inside the moored group
      const cx = (this._grid?.width || 24) * 0.5;
      const cz = (this._grid?.depth || 48) * 0.5;
      this._chunkRenderer.container.position.set(-cx, 0, -cz);
      this._chunkRenderer.container.rotation.set(0, 0, 0);
      this._chunkRenderer.container.scale.set(1, 1, 1);

      // Scale moored group in world coordinates to match ship profile
      const s = shipProfile.scale || 0.12;
      this._dockMooredGroup.scale.setScalar(s);

      // Wharf edge runs along Z at X = 9.0 * DOCK_SCALE
      const pierEdgeX = 9.0 * DOCK_SCALE;
      const pierCenterZ = 1.8 * DOCK_SCALE;
      const halfBeam = (this._grid?.width || 24) * s * 0.5;
      const draft = (shipProfile.waterlineY || 4) * s;
      
      this._dockMooredTargetPos = new THREE.Vector3(pierEdgeX + halfBeam + (0.4 * DOCK_SCALE), -draft, pierCenterZ);
      // Cubic Bezier curve control points:
      // P0: Off-screen to the far left, well seaward of the island
      // P1: Gliding seaward past the island landmass and pine trees
      // P2: Crossing the bay channel directly in front of the stall window
      this._dockMooredP0 = new THREE.Vector3(-52.0, -draft, -27.0);
      this._dockMooredP1 = new THREE.Vector3(-20.0, -draft, -20.0);
      this._dockMooredP2 = new THREE.Vector3(2.0, -draft, -20.0);

      this._dockMooredGroup.userData.isMooredShip = true;
      this._chunkRenderer.container.userData.isMooredShip = true;
      this._chunkRenderer.container.traverse(c => {
        c.userData.isMooredShip = true;
      });

      if (this._dockShipArrived) {
        this._dockMooredGroup.position.copy(this._dockMooredTargetPos);
        this._dockMooredGroup.rotation.set(0, 0, 0);
        this._dockMooredGroup.visible = true;
        this._shipDocked = true;
        this._shipArriving = false;
        if (this._dockStall) {
          this._dockStall.shipInteractables = [this._dockMooredGroup];
        }
      } else {
        this._dockMooredGroup.position.copy(this._dockMooredP0);
        this._dockMooredGroup.rotation.set(0, Math.atan2(this._dockMooredP1.x - this._dockMooredP0.x, this._dockMooredP1.z - this._dockMooredP0.z), 0);
        this._dockMooredGroup.visible = false;
        this._shipDocked = false;
        this._shipArriving = false;
        if (this._dockStall) {
          this._dockStall.shipInteractables = [];
        }
      }
    }

    // Check if repairs are required
    const integrity = this._grid ? DamageSystem.getSummary(this._grid).integrityPct : 100;
    if (this._dockStall) {
      this._dockStall.shipNeedsRepair = integrity < 100;
      this._dockStall.activeShipProfile = shipProfile;
    }
    // Set up fixed cinematic camera
    this._camera.position.set(0, 5, 20);
    this._camera.lookAt(0, 2, 0);
    
    // Setup environment
    const stallGroup = this._dockStall.build();
    if (stallGroup.parent !== this._scene) {
      this._scene.add(stallGroup);
    }
    this._ocean.breakwaterEnabled = true;

    // Load and apply weather
    await this._weather.loadLevel(this.day, {
      ambient: this._ambient,
      sun: this._sun,
      ocean: this._ocean,
      sky: this._sky,
      lanternLight: this._dockStall.lanternLight,
      scene: this._scene
    });

    // Moveable Player Camera
    this._dockPlayerController = new DockPlayerController(this._scene, this._camera, this._renderer.domElement, this._dockStall);
    this.activeCamera = this._dockPlayerController.camera;

    // Dev orbit controls (kept available for development purposes)
    this._dockOrbitControls = new OrbitControls(this._camera, this._renderer.domElement);
    this._dockOrbitControls.enableDamping = true;
    this._dockOrbitControls.target.set(0, 2, 0);
    this._dockOrbitControls.enabled = false;

    // Listen for player entering stall to trigger cutscene & dialogue
    this._onDockPlayerEnteredShop = () => {
      if (!this._shipDocked && !this._shipArriving) {
        this._shipArriving = true;
        this._shipArrivalTimer = 0;
        this._shipArrivalDuration = 20;
        this._dockShipArrived = true;

        if (this._dockMooredGroup) {
          this._dockMooredGroup.visible = true;
          this._dockMooredGroup.position.copy(this._dockMooredP0);
        }

        if (this._dockStall && this._dockMooredGroup) {
          this._dockStall.shipInteractables = [this._dockMooredGroup];
        }

        const shipName = shipProfile?.name || 'Vessel';
        emit('showDialogue', {
          dialogue: {
            portrait: '🧑‍✈️',
            name: 'Captain Barlow',
            lines: [
              `Ahoy there shipwright! We ran into treacherous hazards offshore!`,
              `Look out your shop window—my crew is navigating the ${shipName} to the pier now!`,
              `Head out and board her at the dock to repair her hull before we set sail again!`
            ]
          }
        });
      }
    };
    on('dockPlayerEnteredShop', this._onDockPlayerEnteredShop);

    emit('uiMount', { screen: 'dock', dockStall: this._dockStall, gameState: this, dockPlayerController: this._dockPlayerController });
  }

  _exitDock() {
    if (this._onDockPlayerEnteredShop) {
      off('dockPlayerEnteredShop', this._onDockPlayerEnteredShop);
      this._onDockPlayerEnteredShop = null;
    }
    emit('hideDialogue');

    if (this.nextPhase !== GamePhase.SHIPYARD) {
      this._scene.remove(this._dockStall.group);
      this._ocean.breakwaterEnabled = false;
    }

    if (this._dockMooredGroup) {
      if (this._chunkRenderer && this._chunkRenderer.container) {
        this._dockMooredGroup.remove(this._chunkRenderer.container);
        this._scene.add(this._chunkRenderer.container);
        this._chunkRenderer.container.position.set(0, 0, 0);
        this._chunkRenderer.container.rotation.set(0, 0, 0);
        this._chunkRenderer.container.scale.set(1, 1, 1);
        this._chunkRenderer.container.visible = false;
      }
      this._scene.remove(this._dockMooredGroup);
      this._dockMooredGroup = null;
    } else if (this._chunkRenderer && this._chunkRenderer.container) {
      this._chunkRenderer.container.visible = false;
      this._chunkRenderer.container.position.set(0, -999, 0);
      this._chunkRenderer.container.rotation.set(0, 0, 0);
      this._chunkRenderer.container.scale.set(1, 1, 1);
    }

    if (this._dockPlayerController) {
      this._dockPlayerController.dispose();
      this._dockPlayerController = null;
    }

    if (this._dockOrbitControls) {
      this._dockOrbitControls.dispose();
      this._dockOrbitControls = null;
    }
    this.activeCamera = null;
    emit('uiUnmount', { screen: 'dock' });
  }

  // =========================================================================
  // MAIN MENU
  // =========================================================================

  async _enterMainMenu(opts) {
    this.activeCamera = null;
    if (opts?.shipDef) this._shipDef = opts.shipDef;
    if (opts?.levelCfg) this._levelCfg = opts.levelCfg;

    // Ensure any loaded boat/vessel meshes are hidden and positioned well out of the camera's sightline
    if (this._chunkRenderer && this._chunkRenderer.container) {
      this._chunkRenderer.container.visible = false;
      this._chunkRenderer.container.position.set(0, -999, 0);
    }
    if (this._playerShip && this._playerShip.mesh) {
      this._playerShip.mesh.visible = false;
      this._playerShip.mesh.position.set(0, -999, 0);
    }
    
    // Set an unobstructed panoramic view of the open ocean and horizon
    this._camera.position.set(0, 5, 20);
    this._camera.lookAt(0, 5, -120);

    // Ensure the ocean is active and visible with natural open waves
    this._ocean.breakwaterEnabled = false;

    // Use day 1 weather for the main menu by default
    await this._weather.loadLevel(1, {
      ambient: this._ambient,
      sun: this._sun,
      ocean: this._ocean,
      sky: this._sky,
      lanternLight: this._dockStall.lanternLight,
      scene: this._scene
    });

    emit('uiMount', { screen: 'main-menu' });
  }

  _exitMainMenu() {
    // Restore vessel visibility when transitioning out of the main menu into gameplay
    if (this._chunkRenderer && this._chunkRenderer.container) {
      this._chunkRenderer.container.visible = true;
    }
    if (this._playerShip && this._playerShip.mesh) {
      this._playerShip.mesh.visible = true;
    }
    emit('uiUnmount', { screen: 'main-menu' });
  }


  // =========================================================================
  // SHIPYARD
  // =========================================================================

  async _enterShipyard({ shipDef, levelCfg, fishModels, forceNew = false } = {}) {
    this._levelCfg = levelCfg || this._levelCfg;
    if (this._ocean) {
      this._ocean.setWorldSize(this._levelCfg?.worldSize || 200);
    }

    // Clean up any lingering editor system, editor environment group, or voxel terrain
    if (this._editorSystem) {
      this._editorSystem.dispose();
      this._editorSystem = null;
    }
    const lingeringEditorGroup = this._scene.getObjectByName('EditorEnvironmentGroup');
    if (lingeringEditorGroup) {
      this._scene.remove(lingeringEditorGroup);
    }
    if (this._voxelTerrain) {
      this._voxelTerrain.dispose();
      this._voxelTerrain = null;
    }

    const activeShipId = shipDef?.id || levelCfg?.ship || this._levelCfg?.ship || DEFAULT_SHIP_ID;
    const activeShipDef = shipDef || LevelConfig.getShipDef(activeShipId);
    let def = activeShipDef;

    // Setup island environment and breakwater
    const stallGroup = this._dockStall.build();
    if (stallGroup.parent !== this._scene) {
      this._scene.add(stallGroup);
    }
    this._ocean.breakwaterEnabled = true;

    // Load and apply weather / island lighting
    await this._weather.loadLevel(this.day, {
      ambient: this._ambient,
      sun: this._sun,
      ocean: this._ocean,
      sky: this._sky,
      lanternLight: this._dockStall.lanternLight,
      scene: this._scene
    });

    // Single boat guarantee:
    // If a boat already exists and we are not forcing a fresh reset, reuse the existing boat!
    if (this._grid && this._chunkRenderer && !forceNew && this._currentShipId === activeShipId) {
      // Reposition existing boat to the West yard dock mooring position
      if (this._chunkRenderer.container) {
        this._chunkRenderer.container.position.copy(SHIP_MOORED_POS);
        this._chunkRenderer.container.rotation.copy(SHIP_MOORED_ROT);
        this._chunkRenderer.container.scale.set(1, 1, 1);
        this._chunkRenderer.container.visible = true;
        if (this._chunkRenderer.container.parent !== this._scene) {
          this._scene.add(this._chunkRenderer.container);
        }
      }
      this._chunkRenderer.sync(this._grid);
    } else {
      // Cleanly dispose any existing chunk renderer first so no duplicate/ghost boat remains
      if (this._chunkRenderer) {
        this._chunkRenderer.dispose(this._scene);
        this._chunkRenderer = null;
      }
      this._currentShipId = activeShipId;
      const { grid, zones, def: builtDef, gltfScene } = await ShipBuilder.build(activeShipDef, this._levelCfg);
      this._grid  = grid;
      this._zones = zones;
      def = builtDef;

      // Chunk renderer
      this._chunkRenderer = new ChunkRenderer();
      this._chunkRenderer.init(grid, this._scene, gltfScene);
      this._chunkRenderer.container.position.copy(SHIP_MOORED_POS);
      this._chunkRenderer.container.rotation.copy(SHIP_MOORED_ROT);
      this._chunkRenderer.container.scale.set(1, 1, 1);
    }

    // BVH raycaster - pass container for world space transforms
    this._raycaster = new ShipRaycaster();
    this._raycaster.build(this._grid, this._scene, this._chunkRenderer.container);

    // Build system - attach ghost meshes to container
    this._buildSystem = new BuildSystem();
    this._buildSystem.init(this._grid, this._scene, this._chunkRenderer.container);

    // Orbit controls
    this._orbitControls = new OrbitControls(this._camera, this._renderer.domElement);
    this._orbitControls.enableDamping = true;

    // Calculate boat center in world coordinates (with rotation = 0, local axes match world axes)
    const gx = def?.grid?.x ?? this._grid.width;
    const gy = def?.grid?.y ?? this._grid.height;
    const gz = def?.grid?.z ?? this._grid.depth;
    const shipWorldCenter = new THREE.Vector3(
      SHIP_MOORED_POS.x + gx * 0.5,
      SHIP_MOORED_POS.y + gy * 0.5,
      SHIP_MOORED_POS.z + gz * 0.5
    );

    // Target the center of the ship and position camera nicely for viewing and repairing
    this._orbitControls.target.copy(shipWorldCenter);
    this._camera.position.set(
      shipWorldCenter.x + 32.0,
      shipWorldCenter.y + 18.0,
      shipWorldCenter.z + 30.0
    );
    this._orbitControls.update();

    // PROTOTYPE DEBUG: Render a random fish directly next to the boat
    if (this._debugShark) {
      this._scene.remove(this._debugShark);
      this._debugShark = null;
    }
    if (fishModels && fishModels.length > 0) {
      const fishModel = fishModels[Math.floor(Math.random() * fishModels.length)];
      this._debugShark = fishModel.scene;
      const normScale = fishModel.normSharkScale ?? 1;
      this._debugShark.scale.setScalar(normScale);
      this._debugShark.position.set(shipWorldCenter.x - 8, shipWorldCenter.y - 3, shipWorldCenter.z + 6);
      this._scene.add(this._debugShark);
      
      // Repair the missing skin so the Tail bone can deform the mesh
      const repair = SharkSkinRepair.repair(this._debugShark);
      
      // Turn off frustum culling so the shark stays visible while animated
      this._debugShark.traverse(c => {
        if (c.isMesh || c.isSkinnedMesh) c.frustumCulled = false;
      });

      this._debugSharkBaseY = shipWorldCenter.y - 3;
      this._debugSharkAnim  = new FishAnimator(
        this._debugShark,
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

    emit('uiMount', { screen: 'shipyard', docket: this._levelCfg?.docket || [] });
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
    if (this.nextPhase !== GamePhase.DOCK) {
      this._scene.remove(this._dockStall.group);
      this._ocean.breakwaterEnabled = false;
    }

    // Remove event listeners
    this._renderer.domElement.removeEventListener('pointerdown', this._boundPointerDown);
    this._renderer.domElement.removeEventListener('pointermove', this._boundPointerMove);
    off('cellRepaired');
    off('gridDirty');

    // Dispose all Three.js objects except the ChunkRenderer and VoxelGrid
    this._raycaster?.dispose(this._scene);
    this._buildSystem?.reset();
    this._orbitControls?.dispose();
    
    if (this._chunkRenderer && this._chunkRenderer.container) {
      this._chunkRenderer.container.scale.set(1, 1, 1);
    }
    
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

  async _enterObstacle({ shipDef, levelCfg, shipStats, rockModels, fishModels, pickupModels, seaweedModels, waveModels, islandModels, sirenModel, krakenModel }) {
    this._levelCfg = levelCfg;

    if (this._dockMooredGroup) {
      if (this._chunkRenderer && this._chunkRenderer.container) {
        this._dockMooredGroup.remove(this._chunkRenderer.container);
      }
      this._scene.remove(this._dockMooredGroup);
      this._dockMooredGroup = null;
    }

    const activeShipId = shipDef?.id || levelCfg?.ship || this._levelCfg?.ship || DEFAULT_SHIP_ID;
    const activeShipDef = shipDef || LevelConfig.getShipDef(activeShipId);
    const profile = ShipRegistry.get(activeShipId);

    // Build or update ship model if needed so it displays the correct vessel (e.g. from editor)
    if (!this._grid || !this._chunkRenderer || this._currentShipId !== activeShipId) {
      this._currentShipId = activeShipId;
      if (this._chunkRenderer) {
        this._chunkRenderer.dispose(this._scene);
        this._chunkRenderer = null;
      }
      const { grid, zones, def, gltfScene } = await ShipBuilder.build(activeShipDef, this._levelCfg);
      this._grid  = grid;
      this._zones = zones;
      this._chunkRenderer = new ChunkRenderer();
      this._chunkRenderer.init(grid, this._scene, gltfScene);
    }

    // Reset container transform before handing off to PlayerShip wrapper
    if (this._chunkRenderer && this._chunkRenderer.container) {
      if (this._chunkRenderer.container.parent !== this._scene) {
        this._scene.add(this._chunkRenderer.container);
      }
      this._chunkRenderer.container.position.set(0, 0, 0);
      this._chunkRenderer.container.rotation.set(0, 0, 0);
      this._chunkRenderer.container.scale.set(1, 1, 1);
      this._chunkRenderer.container.visible = true;
    }

    const camDist = profile.cameraDist ?? 16;
    const camHeight = profile.cameraHeight ?? 5;

    // Chase camera initial position
    this._camera.position.set(0, camHeight, camDist);
    this._camera.lookAt(0, 0, -5);

    if (this._ocean) {
      this._ocean.setWorldSize(levelCfg?.worldSize || 200);
    }

    if (levelCfg && levelCfg.voxels) {
      this._voxelTerrain = new VoxelTerrain(this._scene);
      this._voxelTerrain.deserialize(levelCfg.voxels);
    }

    const qteTuning = { ...(levelCfg?.qte ?? {}) };
    if (levelCfg?.tutorialPrompts) qteTuning.windowScale = (qteTuning.windowScale ?? 1) * 1.25;
    this._qteSystem = new QTESystem(qteTuning, levelCfg?.rewardAbilities);

    const effectiveShipStats = {
      ...(shipStats || {}),
      profile,
      scale: profile.scale,
      speedMultiplier: profile.speedMultiplier,
      turnAccel: profile.turnAccel,
      turnDamping: profile.turnDamping,
      isGagTruck: profile.isGagTruck,
      waterCapacity: profile.waterCapacity,
      waterlineY: profile.waterlineY,
      hullHP: shipStats?.hullHP ?? profile.health ?? 100,
      maxHullHP: profile.health ?? 100
    };

    this._playerShip = new PlayerShip(effectiveShipStats, this._scene, this._chunkRenderer, this._grid, this._qteSystem);
    this._obstacleManager = new ObstacleManager();
    this._obstacleManager.init(levelCfg, this._scene, rockModels, pickupModels, seaweedModels, waveModels, islandModels, sirenModel, this._qteSystem);
    this._environmentManager = new EnvironmentManager();
    this._environmentManager.init(this._scene, fishModels, levelCfg, this._qteSystem, this._ocean);
    this._sirenManager = new SirenManager();
    this._sirenManager.init(levelCfg, this._scene, sirenModel, rockModels, this._qteSystem);
    
    this._windManager = new WindManager(levelCfg);

    // Kraken Boss (only if level defines one)
    if (levelCfg.kraken) {
      this._krakenBoss = new KrakenBoss();
      this._krakenBoss.init(
        levelCfg.kraken,
        this._scene, this._camera,
        this._playerShip, this._ocean,
        krakenModel
      );
    }

    // End Location (Harbor Goal) Waypoint
    this._endLocation = levelCfg?.endLocation || this._levelCfg?.endLocation || { position: { x: 0, y: 0, z: -220 }, radius: 16 };
    this._buildEndLocationVisual(this._endLocation);

    this._onSteer = (d) => {
      if (this._playerShip) {
        this._playerShip.steerInput = d.value;
      }
    };
    on('steer', this._onSteer);
    this._onDebugQTE = ({ type }) => this._qteSystem?.trigger({ type, metadata: { source: 'debug' } });
    on('qteDebugTrigger', this._onDebugQTE);

    // When player sinks, transition to results
    on('playerSunk', () => {
      this.transition(GamePhase.RESULTS, { passed: false });
    });

    this._wasCinematicActive = false;
    this.score = 0;
    emit('uiMount', { screen: 'obstacle' });
  }

  _updateObstacle(delta) {
    this._qteSystem?.update(delta);
    // Pass WindManager instead of static windDir
    this._playerShip?.update(delta, this._ocean, this._windManager);
    this._obstacleManager?.update(delta, this._playerShip, this._windManager, this._voxelTerrain);
    this._environmentManager?.update(delta, this._windManager, this._playerShip);
    this._sirenManager?.update(delta, this._playerShip);

    // Kraken boss — FSM + tentacles + cinematics
    if (this._krakenBoss) {
      this._krakenBoss.update(delta);
      // During cinematic, skip normal camera updates and keep chase targets synchronized
      if (this._krakenBoss.isCinematicActive()) {
        this._wasCinematicActive = true;
        if (this._playerShip) {
          const p = this._playerShip.mesh.position;
          if (this._camLookTarget) this._camLookTarget.copy(p);
          this._camOvershoot = 0;
          this._camOvershootVel = 0;
        }
        return;
      }
    }

    if (this._playerShip) {
      const p = this._playerShip.mesh.position;
      const shipYaw = this._playerShip.yaw;
      const shipYawVel = this._playerShip.yawVelocity;
      
      const shipDir = new THREE.Vector3(-Math.sin(shipYaw), 0, -Math.cos(shipYaw));
      const rightDir = new THREE.Vector3(Math.cos(shipYaw), 0, -Math.sin(shipYaw));

      const camDist = this._playerShip.shipProfile?.cameraDist ?? 16;
      const camHeight = this._playerShip.shipProfile?.cameraHeight ?? 5;

      // 1. Base Target
      const baseTarget = p.clone().add(shipDir.clone().multiplyScalar(-camDist));
      baseTarget.y += camHeight;

      // 2. Overshoot Spring
      if (this._camOvershoot === undefined) {
        this._camOvershoot = 0;
        this._camOvershootVel = 0;
        this._camVelocity = new THREE.Vector3();
        this._camLookTarget = p.clone();
      }

      // Seamless handover on the exact frame the cinematic finishes
      if (this._wasCinematicActive) {
        this._wasCinematicActive = false;
        this._camOvershoot = 0;
        this._camOvershootVel = 0;
        this._camera.position.copy(baseTarget);
        if (!this._camLookTarget) this._camLookTarget = new THREE.Vector3();
        this._camLookTarget.copy(p);
        this._camera.lookAt(this._camLookTarget);

        // Update Minimap
        this._minimap?.update(
          p,
          this._playerShip.yaw,
          this._obstacleManager?._obstacles || [],
          this.windDir
        );
        return;
      }
      
      // Push camera outward relative to turn speed. 
      // If turning right (negative yawVel), targetOvershoot becomes negative.
      // rightDir is positive X (when facing -Z), so negative rightDir pushes left (outside the turn).
      const targetOvershoot = shipYawVel * 15.0; // scale factor
      
      // Spring physics for the overshoot
      const springK = 25.0;
      const springDamp = 6.0;
      const force = (targetOvershoot - this._camOvershoot) * springK - this._camOvershootVel * springDamp;
      this._camOvershootVel += force * delta;
      this._camOvershoot += this._camOvershootVel * delta;

      // 3. Final Target P3
      const P3 = baseTarget.clone().add(rightDir.clone().multiplyScalar(this._camOvershoot));

      // 4. Move camera smoothly towards the spring-loaded target
      // The spring logic in P3 provides the curved sweep and overshoot.
      if (!this.directorModeActive) {
        this._camera.position.lerp(P3, 5.0 * delta);

        // 6. Look Target (delayed)
        // Lerp look target so it sweeps across the hull slightly
        this._camLookTarget.lerp(p, 8.0 * delta);
        this._camera.lookAt(this._camLookTarget);
      }
      
      // Update Minimap
      this._minimap?.update(
        p,
        this._playerShip.yaw,
        this._obstacleManager?._obstacles || [],
        this.windDir
      );
    }

    // Update End Location (Harbor Goal) & Win condition
    if (this._endLocationVisual) {
      this._endLocationVisual.rotation.y += delta * 0.4;
      const pulse = 1.0 + Math.sin(this._time * 3.5) * 0.04;
      this._endLocationVisual.scale.set(pulse, 1.0, pulse);
    }

    if (this._endLocation && this._playerShip && this._playerShip.mesh) {
      const shipPos = this._playerShip.mesh.position;
      const dx = shipPos.x - this._endLocation.position.x;
      const dz = shipPos.z - this._endLocation.position.z;
      const dist = Math.hypot(dx, dz);
      
      emit('goalDistanceUpdate', {
        distance: Math.round(dist),
        targetRadius: this._endLocation.radius || 16
      });

      if (dist <= (this._endLocation.radius || 16)) {
        emit('playSound', { sound: 'qte_success' });
        this.transition(GamePhase.RESULTS, { passed: true });
        return;
      }
    }
  }

  _buildEndLocationVisual(endLoc) {
    if (this._endLocationVisual) {
      this._scene.remove(this._endLocationVisual);
      this._endLocationVisual = null;
    }

    const group = new THREE.Group();
    group.position.set(endLoc.position.x, endLoc.position.y ?? 0, endLoc.position.z);
    const radius = endLoc.radius || 16;
    const height = 32;

    // 1. Tall glowing translucent emerald cylinder
    const cylGeo = new THREE.CylinderGeometry(radius * 0.95, radius * 0.95, height, 32, 1, true);
    const cylMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const cylinder = new THREE.Mesh(cylGeo, cylMat);
    cylinder.position.y = height / 2;
    group.add(cylinder);

    // 2. Inner wireframe cylinder for tech/holographic GTA:SA feel
    const wireGeo = new THREE.CylinderGeometry(radius * 0.95, radius * 0.95, height, 16, 4, true);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x66ffbb,
      wireframe: true,
      transparent: true,
      opacity: 0.6,
      depthWrite: false
    });
    const wire = new THREE.Mesh(wireGeo, wireMat);
    wire.position.y = height / 2;
    group.add(wire);

    // 3. Base corona ring floating right on the water surface
    const ringGeo = new THREE.RingGeometry(radius * 0.85, radius * 1.05, 36);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.25;
    group.add(ring);

    // 4. Billboard Sprite Marker
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(10, 25, 20, 0.85)';
    if (ctx.roundRect) ctx.roundRect(4, 4, 248, 56, 12);
    else ctx.rect(4, 4, 248, 56);
    ctx.fill();
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏁 SAFE HARBOR', 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.set(0, height + 4, 0);
    sprite.scale.set(18, 4.5, 1);
    group.add(sprite);

    group.userData.noGodRays = true;
    group.userData.isRaceMarker = true;
    group.traverse(c => {
      c.userData.noGodRays = true;
      c.userData.isRaceMarker = true;
    });

    this._scene.add(group);
    this._endLocationVisual = group;
  }

  _exitObstacle() {
    off('steer', this._onSteer);
    off('qteDebugTrigger', this._onDebugQTE);
    off('playerSunk');

    if (this._endLocationVisual) {
      this._scene.remove(this._endLocationVisual);
      this._endLocationVisual.traverse(c => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
          else c.material.dispose();
        }
      });
      this._endLocationVisual = null;
    }

    this._sirenManager?.dispose();
    this._sirenManager = null;
    this._krakenBoss?.dispose();
    this._krakenBoss = null;

    this._playerShip?.dispose(this._scene);
    this._obstacleManager?.dispose();
    this._environmentManager?.dispose();
    this._sirenManager?.dispose();
    this._qteStats = this._qteSystem?.getStats() ?? null;
    this._qteSystem?.dispose();
    this._chunkRenderer?.dispose(this._scene);

    this._playerShip      = null;
    this._obstacleManager = null;
    this._environmentManager = null;
    this._sirenManager       = null;
    this._qteSystem       = null;
    this._chunkRenderer   = null;
    this._grid            = null;
    this._windManager     = null;

    if (this._voxelTerrain) {
      this._voxelTerrain.dispose();
      this._voxelTerrain = null;
    }

    emit('uiUnmount', { screen: 'obstacle' });
  }

  // =========================================================================
  // RESULTS
  // =========================================================================

  _enterResults({ passed }) {
    emit('uiMount', { screen: 'results', passed, day: this.day, score: this.score, qteStats: this._qteStats });
    if (passed) this.day++;
  }

  // =========================================================================
  // EDITOR
  // =========================================================================

  _enterEditor({ levelCfg, rockModels, pickupModels, seaweedModels, waveModels, islandModels, sirenModel, krakenModel }) {
    this._levelCfg = levelCfg;

    // Ensure the dock/shipyard island environment and breakwater are not active in the editor
    if (this._dockStall?.group && this._dockStall.group.parent === this._scene) {
      this._scene.remove(this._dockStall.group);
    }
    if (this._ocean) {
      this._ocean.breakwaterEnabled = false;
    }

    if (this._chunkRenderer && this._chunkRenderer.container) {
      this._chunkRenderer.container.visible = false;
      this._chunkRenderer.container.position.set(0, -999, 0);
    }

    this._camera.position.set(0, 30, 0);
    this._camera.lookAt(0, 0, -5);
    
    if (this._ocean) {
      this._ocean.setWorldSize(levelCfg?.worldSize || 200);
    }
    
    this._orbitControls = new OrbitControls(this._camera, this._renderer.domElement);
    this._orbitControls.mouseButtons = {
      LEFT: THREE.MOUSE.NONE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE
    };
    this._orbitControls.target.set(0, 0, -5);
    this._orbitControls.update();

    this._editorSystem = new EditorSystem();
    this._editorSystem.init(
      this._scene, this._camera, this._renderer, 
      levelCfg, rockModels, pickupModels, seaweedModels, waveModels, islandModels, sirenModel, krakenModel
    );

    this._onEditorCameraPreset = (d) => {
      if (!this._camera || !this._orbitControls) return;
      if (d?.preset === 'top') {
        this._camera.position.set(0, 100, 0.01);
        this._orbitControls.target.set(0, 0, 0);
      } else if (d?.preset === 'horizon') {
        this._camera.position.set(0, 8, 30);
        this._orbitControls.target.set(0, 4, -40);
      } else if (d?.preset === 'isometric') {
        this._camera.position.set(50, 60, 50);
        this._orbitControls.target.set(0, 0, 0);
      } else { // default
        this._camera.position.set(0, 30, 20);
        this._orbitControls.target.set(0, 0, -5);
      }
      this._orbitControls.update();
    };
    on('editorCameraPreset', this._onEditorCameraPreset);

    emit('uiMount', { screen: 'editor', levelCfg });
  }

  _updateEditor(delta) {
    if (this._editorSystem) {
      this._editorSystem.update(delta);
    }

    if (this._orbitControls) {
      // WASD panning for editor
      const speed = 40 * delta;
      
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

  _exitEditor() {
    if (this._onEditorCameraPreset) {
      off('editorCameraPreset', this._onEditorCameraPreset);
      this._onEditorCameraPreset = null;
    }

    this._editorSystem?.dispose();
    this._editorSystem = null;
    
    this._orbitControls?.dispose();
    this._orbitControls = null;

    if (this._chunkRenderer && this._chunkRenderer.container) {
      this._chunkRenderer.container.visible = true;
    }

    emit('uiUnmount', { screen: 'editor' });
  }
}

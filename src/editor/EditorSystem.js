import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { emit, on, off } from '../core/EventBus.js';
import { buildObstacle } from '../obstacle/ObstacleManager.js';
import { EnvironmentManager } from '../environment/EnvironmentManager.js';
import { VoxelTerrain } from './VoxelTerrain.js';
import { getShipProfile, DEFAULT_SHIP_ID } from '../config/ShipRegistry.js';
import { getAssetUrl } from '../utils/paths.js';

export class EditorSystem {
  constructor() {
    this._scene = null;
    this._camera = null;
    this._renderer = null;
    this._editorGroup = null; // Isolated root group for all editor-specific entities
    this._rockModels = [];
    this._pickupModels = [];
    this._seaweedModels = [];
    this._waveModels = [];
    this._islandModels = [];
    this._sirenModel = null;
    this._krakenModel = null;
    // Ship selection & ghost preview state
    this._selectedShipId = DEFAULT_SHIP_ID;
    this._shipGhostGroup = null;
    this._shipGhostVisible = true;
    // State
    this._activeType = null; // 'rock', 'barrel', etc. or null
    this._activeUrl = null;
    this._activeTool = 'select'; // 'select', 'delete'
    this._previewMesh = null;
    this._currentScale = 1.0;
    this._currentY = 0.5;
    this._currentRotation = 0;
    
    // Config
    this._levelCfg = null;
    
    // Track explicit placed instances
    this._placedObstacles = [];

    // Raycasting
    this._raycaster = new THREE.Raycaster();
    this._mouse = new THREE.Vector2();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._intersection = new THREE.Vector3();

    // World Boundary Visualization
    this._boundaryVisual = null;

    // Bindings
    this._isPointerDown = false;
    this._lastTerraformPoint = null;
    this._strokeTargetY = null;
    this._strokeHoldTimer = 0;
    this._strokeAnchor = new THREE.Vector2();
    this._brushShape = 'circle';
    this._boundPointerDown = this._onPointerDown.bind(this);
    this._boundPointerMove = this._onPointerMove.bind(this);
    this._boundPointerUp = this._onPointerUp.bind(this);
    this._boundWheel = this._onWheel.bind(this);
    this._boundKeyDown = this._onKeyDown.bind(this);

    // Boss Encounter State
    this._krakenConfig = null;
    this._activeTentacleIdx = 0;
    this._krakenVisualGroup = null;

    // End Location (Harbor Goal) State
    this._endLocation = null;
    this._endLocationVisualGroup = null;

    // Ship Spawn State
    this._shipSpawn = null;
    this._hasDock = true;
    
    on('editorSelectType', d => {
      this._activeType = d.type;
      this._activeUrl = d.url;
      this._activeTool = 'place';
      this._currentScale = 1.0; // reset scale on new tool
      this._currentY = 0.5;     // reset height on new tool
      this._currentRotation = 0; // reset rotation
      this._updatePreview();
      this._emitState();
    });
    
    on('editorSelectTool', d => {
      this._activeType = null;
      this._activeUrl = null;
      this._activeTool = d.tool;
      this._updatePreview();
      this._emitState();
    });

    on('editorSetBrushShape', d => {
      if (d && d.shape) {
        this._brushShape = d.shape;
        const isTerrainTool = this._activeTool === 'terrain_raise' || this._activeTool === 'terrain_lower';
        if (isTerrainTool && this._voxelTerrain) {
          const type = this._activeTool === 'terrain_raise' ? 'raise' : 'lower';
          const radius = Math.max(1, Math.floor(this._currentScale * 2));
          const previewTargetY = (this._isPointerDown && this._strokeTargetY !== null)
            ? this._strokeTargetY
            : (type === 'raise' ? this._intersection.y : Math.max(0, this._intersection.y - 1));
          this._voxelTerrain.updatePreview(this._intersection.x, this._intersection.z, radius, type, previewTargetY, this._brushShape);
        }
      }
    });

    on('editorSetBudget', d => {
      if (d && d.budget !== undefined) {
        this._budget = Math.max(0, parseInt(d.budget, 10));
        this._emitState();
      }
    });

    on('editorSetBiome', d => {
      if (d && d.biome && this._voxelTerrain) {
        this._voxelTerrain.setBiome(d.biome);
        this._emitState();
      }
    });

    on('editorSetTransform', d => {
      if (d.scale !== undefined) this._currentScale = Math.max(0.1, Math.min(20.0, d.scale));
      if (d.y !== undefined) this._currentY = d.y;
      if (d.rotation !== undefined) this._currentRotation = d.rotation;
      if (this._activeTool === 'place' && this._previewMesh) {
        this._updatePreview();
        this._previewMesh.mesh.position.set(this._intersection.x, this._intersection.y + this._currentY, this._intersection.z);
      }
      this._emitState();
    });

    on('editorClearAll', () => {
      for (const obs of this._placedObstacles) {
        if (obs.mesh?.parent) obs.mesh.parent.remove(obs.mesh);
        else if (this._editorGroup) this._editorGroup.remove(obs.mesh);
        else if (this._scene) this._scene.remove(obs.mesh);
      }
      this._placedObstacles = [];
      if (this._voxelTerrain) {
        this._voxelTerrain.dispose();
        this._voxelTerrain = new VoxelTerrain(this._editorGroup || this._scene);
      }
      this._emitState();
    });

    on('editorImportLevel', d => {
      if (!d || !d.config) return;
      const cfg = d.config;
      this._levelCfg = cfg;
      this._budget = cfg.budget !== undefined ? cfg.budget : 300;

      // Clear existing placed obstacles
      for (const obs of this._placedObstacles) {
        if (obs.mesh?.parent) obs.mesh.parent.remove(obs.mesh);
        else if (this._editorGroup) this._editorGroup.remove(obs.mesh);
        else if (this._scene) this._scene.remove(obs.mesh);
      }
      this._placedObstacles = [];

      // Respawn obstacles from config
      if (cfg.obstacles) {
        for (const o of cfg.obstacles) {
          if (o.position) {
            this._spawnObstacle(
              o.type, 
              o.assetUrl, 
              o.position.x, 
              o.position.y !== undefined ? o.position.y : 0.5, 
              o.position.z, 
              o.scale || 1.0, 
              o.rotation || 0
            );
          }
        }
      }

      // Re-create & deserialize voxels cleanly
      if (this._voxelTerrain) {
        this._voxelTerrain.dispose();
      }
      this._voxelTerrain = new VoxelTerrain(this._editorGroup || this._scene);
      if (cfg.voxels) {
        this._voxelTerrain.deserialize(cfg.voxels);
      }

      // World size
      if (cfg.worldSize) {
        this._updateBoundaryVisual();
        emit('oceanSetWorldSize', { size: cfg.worldSize });
      }

      // Wind
      if (cfg.globalWindDir !== undefined && this._windArrowHelper) {
        const newDir = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(cfg.globalWindDir)).normalize();
        this._windArrowHelper.setDirection(newDir);
      }

      // Fog
      if (cfg.fogDensity !== undefined && this._envManager) {
        if (cfg.fogDensity >= 0.05) {
          this._envManager.toggleDenseFog(true);
        } else {
          this._envManager.toggleDenseFog(false);
          if (this._scene && this._scene.fog) {
            this._scene.fog.density = cfg.fogDensity;
          }
        }
      }

      // Time
      if (cfg.timeOfDay !== undefined && this._envManager) {
        this._envManager._timeOfDay = cfg.timeOfDay;
        this._envManager._updateTimeAndLighting(0);
      }

      // Storm
      if (cfg.isStormy !== undefined && this._envManager) {
        this._envManager.toggleStorm(cfg.isStormy);
        this._envManager._updateTimeAndLighting(0);
      }

      // Ship assignment
      if (cfg.ship) {
        this._selectedShipId = cfg.ship;
        this._updateShipGhost();
      }

      // End location harbor goal
      if (cfg.endLocation) {
        this._endLocation = {
          position: { ...cfg.endLocation.position },
          radius: cfg.endLocation.radius || 16
        };
      } else {
        this._endLocation = { position: { x: 0, y: 0, z: -220 }, radius: 16 };
      }
      this._updateEndLocationVisual();

      // Ship spawn location
      if (cfg.shipSpawn) {
        const sp = cfg.shipSpawn.position || cfg.shipSpawn;
        this._shipSpawn = {
          position: { x: sp.x ?? 0, y: sp.y ?? 0, z: sp.z ?? 0 },
          rotation: cfg.shipSpawn.rotation || 0
        };
      } else {
        this._shipSpawn = { position: { x: 0, y: 0, z: 0 }, rotation: 0 };
      }
      this._updateShipGhost();

      emit('editorConfigLoaded', { config: cfg });
      this._emitState();
    });
    
    on('editorSetWorldSize', d => {
      if (this._levelCfg) {
        this._levelCfg.worldSize = d.size;
        this._updateBoundaryVisual();
      }
      emit('oceanSetWorldSize', d);
    });

    on('editorSetWindDir', d => {
      if (this._levelCfg) {
        this._levelCfg.globalWindDir = d.dir;
      }
      if (this._windArrowHelper) {
        const newDir = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(d.dir)).normalize();
        this._windArrowHelper.setDirection(newDir);
      }
    });

    on('editorSetFogDensity', d => {
      if (this._levelCfg) {
        this._levelCfg.fogDensity = d.density;
      }
      if (this._envManager) {
        if (d.density >= 0.05) {
          this._envManager.toggleDenseFog(true);
        } else {
          this._envManager.toggleDenseFog(false);
          if (this._scene && this._scene.fog) {
            this._scene.fog.density = d.density;
          }
        }
      }
    });

    on('editorSetTimeOfDay', d => {
      if (this._levelCfg) this._levelCfg.timeOfDay = d.time;
      if (this._envManager) {
        this._envManager._timeOfDay = d.time;
        this._envManager._updateTimeAndLighting(0);
      }
    });

    on('editorSetStormy', d => {
      if (this._levelCfg) this._levelCfg.isStormy = d.isStormy;
      if (this._envManager) {
        this._envManager.toggleStorm(d.isStormy);
        this._envManager._updateTimeAndLighting(0);
      }
    });

    on('editorToggleGodRays', d => {
      if (this._levelCfg) this._levelCfg.godRays = d.enabled;
      if (this._envManager) {
        this._envManager._godRaysEnabled = d.enabled;
      }
    });

    on('editorToggleDock', d => {
      this._hasDock = Boolean(d.hasDock);
      if (this._levelCfg) this._levelCfg.hasDock = this._hasDock;
      emit('editorHasDockChanged', { hasDock: this._hasDock });
    });

    on('editorExport', () => this.exportLevel());

    // Boss Encounter Events
    on('editorSelectTentacle', d => {
      this._activeTentacleIdx = Math.max(0, d.index || 0);
      this._updateBossVisuals();
      this._emitBossConfig();
    });

    on('editorAddTentacle', () => {
      if (!this._krakenConfig) {
        this._krakenConfig = {
          krakenPosition: { x: 0, y: -5, z: -150 },
          raceStartPosition: { x: 0, y: 0, z: -40 },
          raceStartRadius: 15,
          totalHP: 100,
          tentacles: []
        };
      }
      if (!this._krakenConfig.tentacles) this._krakenConfig.tentacles = [];
      const newIdx = this._krakenConfig.tentacles.length;
      this._krakenConfig.tentacles.push({
        spawnOffset: { x: (newIdx % 2 === 0 ? -20 : 20), y: 0, z: 0 },
        speed: 12 + newIdx * 2,
        raceDuration: Math.max(15, 25 - newIdx * 3),
        damagePerTentacle: 34,
        waypoints: []
      });
      this._activeTentacleIdx = newIdx;
      this._updateBossVisuals();
      this._emitBossConfig();
    });

    on('editorRemoveTentacle', () => {
      if (this._krakenConfig && this._krakenConfig.tentacles && this._krakenConfig.tentacles.length > 1) {
        this._krakenConfig.tentacles.splice(this._activeTentacleIdx, 1);
        this._activeTentacleIdx = Math.max(0, this._activeTentacleIdx - 1);
        this._updateBossVisuals();
        this._emitBossConfig();
      }
    });

    on('editorSetTentacleSpeed', d => {
      if (this._krakenConfig?.tentacles?.[this._activeTentacleIdx]) {
        this._krakenConfig.tentacles[this._activeTentacleIdx].speed = d.speed;
      }
    });

    on('editorSetTentacleDuration', d => {
      if (this._krakenConfig?.tentacles?.[this._activeTentacleIdx]) {
        this._krakenConfig.tentacles[this._activeTentacleIdx].raceDuration = d.duration;
      }
    });

    on('editorClearWaypoints', () => {
      if (this._krakenConfig?.tentacles?.[this._activeTentacleIdx]) {
        this._krakenConfig.tentacles[this._activeTentacleIdx].waypoints = [];
        this._updateBossVisuals();
        this._emitBossConfig();
      }
    });

    on('editorRemoveBoss', () => {
      this._krakenConfig = null;
      this._activeTentacleIdx = 0;
      this._updateBossVisuals();
      this._emitBossConfig();
    });

    on('editorSelectShip', d => {
      if (!d || !d.shipId) return;
      this._selectedShipId = d.shipId;
      if (this._levelCfg) this._levelCfg.ship = d.shipId;
      this._updateShipGhost();
      this._emitState();
    });

    on('editorToggleShipGhost', d => {
      this._shipGhostVisible = !!d.enabled;
      if (this._shipGhostGroup) {
        this._shipGhostGroup.visible = this._shipGhostVisible;
      }
    });
  }

  _emitState() {
    emit('editorStateUpdated', {
      obstacleCount: this._placedObstacles.length,
      activeTool: this._activeTool,
      activeType: this._activeType,
      activeUrl: this._activeUrl,
      scale: this._currentScale,
      y: this._currentY,
      rotation: this._currentRotation,
      selectedShipId: this._selectedShipId,
      budget: this._budget,
      biome: this._voxelTerrain ? this._voxelTerrain.biome : 'tropical'
    });
  }

  init(scene, camera, renderer, levelCfg, rockModels, pickupModels, seaweedModels, waveModels, islandModels, sirenModel, krakenModel) {
    this._scene = scene;
    this._camera = camera;
    this._renderer = renderer;
    this._levelCfg = levelCfg;
    this._hasDock = this._levelCfg?.hasDock !== false;
    this._budget = levelCfg?.budget !== undefined ? levelCfg.budget : 300;
    this._rockModels = rockModels;
    this._pickupModels = pickupModels;
    this._seaweedModels = seaweedModels;
    this._waveModels = waveModels;
    this._islandModels = islandModels;
    this._sirenModel = sirenModel;
    this._krakenModel = krakenModel;

    // Dedicated isolated root group for all editor-specific entities
    this._editorGroup = new THREE.Group();
    this._editorGroup.name = 'EditorEnvironmentGroup';
    this._scene.add(this._editorGroup);

    this._voxelTerrain = new VoxelTerrain(this._editorGroup);
    if (this._levelCfg && this._levelCfg.voxels) {
      this._voxelTerrain.deserialize(this._levelCfg.voxels);
    }

    this._envManager = new EnvironmentManager();
    this._envManager.init(this._scene, [], this._levelCfg);

    // Initialize 3D Wind Arrow
    const windDirAngle = this._levelCfg?.globalWindDir || 0;
    const initialWindDir = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(windDirAngle)).normalize();
    this._windArrowHelper = new THREE.ArrowHelper(initialWindDir, new THREE.Vector3(0, 10, 0), 30, 0x00ffff, 8, 4);
    this._editorGroup.add(this._windArrowHelper);

    // Initialize Ship Spawn Ghost Preview
    this._selectedShipId = this._levelCfg?.ship || DEFAULT_SHIP_ID;
    if (this._levelCfg && this._levelCfg.shipSpawn) {
      const sp = this._levelCfg.shipSpawn.position || this._levelCfg.shipSpawn;
      this._shipSpawn = {
        position: { x: sp.x ?? 0, y: sp.y ?? 0, z: sp.z ?? 0 },
        rotation: this._levelCfg.shipSpawn.rotation || 0
      };
    } else {
      this._shipSpawn = {
        position: { x: 0, y: 0, z: 0 },
        rotation: 0
      };
    }
    this._updateShipGhost();

    // Initialize End Location Goal Preview
    if (this._levelCfg && this._levelCfg.endLocation) {
      this._endLocation = {
        position: { ...this._levelCfg.endLocation.position },
        radius: this._levelCfg.endLocation.radius || 16
      };
    } else {
      this._endLocation = {
        position: { x: 0, y: 0, z: -220 },
        radius: 16
      };
    }
    this._updateEndLocationVisual();

    this._renderer.domElement.addEventListener('pointerdown', this._boundPointerDown);
    this._renderer.domElement.addEventListener('pointermove', this._boundPointerMove);
    window.addEventListener('pointerup', this._boundPointerUp);
    this._renderer.domElement.addEventListener('wheel', this._boundWheel, { passive: false });
    window.addEventListener('keydown', this._boundKeyDown);
    
    // Clear and respawn any existing explicit obstacles in the config
    this._placedObstacles = [];
    if (this._levelCfg && this._levelCfg.obstacles) {
      for (const cfg of this._levelCfg.obstacles) {
        if (cfg.position) {
          this._spawnObstacle(cfg.type, cfg.assetUrl, cfg.position.x, cfg.position.y !== undefined ? cfg.position.y : 0.5, cfg.position.z, cfg.scale || 1.0, cfg.rotation || 0);
        }
      }
    }

    // Sirens Init (spawn as editable obstacles)
    if (this._levelCfg && this._levelCfg.sirens) {
      for (const s of this._levelCfg.sirens) {
        if (s.position) {
          const scale = (s.attractRadius || 40) / 20;
          this._spawnObstacle('siren', null, s.position.x, s.position.y !== undefined ? s.position.y : 0.5, s.position.z, scale, 0);
        }
      }
    }

    // Boss Encounter Init
    if (this._levelCfg && this._levelCfg.kraken) {
      this._krakenConfig = JSON.parse(JSON.stringify(this._levelCfg.kraken));
    } else {
      this._krakenConfig = null;
    }
    this._activeTentacleIdx = 0;
    this._updateBossVisuals();
    this._emitBossConfig();
    
    this._updateBoundaryVisual();
    this._emitState();
  }

  _updateBoundaryVisual() {
    if (this._boundaryVisual) {
      if (this._boundaryVisual.parent) this._boundaryVisual.parent.remove(this._boundaryVisual);
      else if (this._editorGroup) this._editorGroup.remove(this._boundaryVisual);
      else if (this._scene) this._scene.remove(this._boundaryVisual);
      this._boundaryVisual.geometry.dispose();
      this._boundaryVisual.material.dispose();
      this._boundaryVisual = null;
    }
    
    const radius = (this._levelCfg && this._levelCfg.worldSize) ? this._levelCfg.worldSize : 200;
    
    const geo = new THREE.RingGeometry(radius - 1, radius, 64);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
    this._boundaryVisual = new THREE.Mesh(geo, mat);
    this._boundaryVisual.rotation.x = -Math.PI / 2;
    this._boundaryVisual.position.y = 0.1;
    if (this._editorGroup) this._editorGroup.add(this._boundaryVisual);
    else if (this._scene) this._scene.add(this._boundaryVisual);
  }

  dispose() {
    this._renderer.domElement.removeEventListener('pointerdown', this._boundPointerDown);
    this._renderer.domElement.removeEventListener('pointermove', this._boundPointerMove);
    window.removeEventListener('pointerup', this._boundPointerUp);
    this._renderer.domElement.removeEventListener('wheel', this._boundWheel);
    window.removeEventListener('keydown', this._boundKeyDown);
    
    if (this._previewMesh) {
      if (this._previewMesh.mesh?.parent) this._previewMesh.mesh.parent.remove(this._previewMesh.mesh);
      else if (this._editorGroup) this._editorGroup.remove(this._previewMesh.mesh);
      else if (this._scene) this._scene.remove(this._previewMesh.mesh);
      this._previewMesh = null;
    }

    if (this._voxelTerrain) {
      this._voxelTerrain.dispose();
      this._voxelTerrain = null;
    }
    
    for (const obs of this._placedObstacles) {
      if (obs.mesh?.parent) obs.mesh.parent.remove(obs.mesh);
      else if (this._editorGroup) this._editorGroup.remove(obs.mesh);
      else if (this._scene) this._scene.remove(obs.mesh);
    }
    this._placedObstacles = [];
    
    if (this._boundaryVisual) {
      if (this._boundaryVisual.parent) this._boundaryVisual.parent.remove(this._boundaryVisual);
      else if (this._editorGroup) this._editorGroup.remove(this._boundaryVisual);
      else if (this._scene) this._scene.remove(this._boundaryVisual);
      this._boundaryVisual.geometry?.dispose();
      this._boundaryVisual.material?.dispose();
      this._boundaryVisual = null;
    }
    
    if (this._windArrowHelper) {
      if (this._windArrowHelper.parent) this._windArrowHelper.parent.remove(this._windArrowHelper);
      else if (this._editorGroup) this._editorGroup.remove(this._windArrowHelper);
      else if (this._scene) this._scene.remove(this._windArrowHelper);
      this._windArrowHelper.line?.geometry?.dispose();
      this._windArrowHelper.line?.material?.dispose();
      this._windArrowHelper.cone?.geometry?.dispose();
      this._windArrowHelper.cone?.material?.dispose();
      this._windArrowHelper = null;
    }

    if (this._krakenVisualGroup) {
      if (this._krakenVisualGroup.parent) this._krakenVisualGroup.parent.remove(this._krakenVisualGroup);
      else if (this._editorGroup) this._editorGroup.remove(this._krakenVisualGroup);
      else if (this._scene) this._scene.remove(this._krakenVisualGroup);
      this._krakenVisualGroup.traverse(child => {
        if (child.isMesh || child.isLine || child.isSprite) {
          child.geometry?.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
          }
        }
      });
      this._krakenVisualGroup = null;
    }

    if (this._editorGroup) {
      if (this._scene) this._scene.remove(this._editorGroup);
      while (this._editorGroup.children.length > 0) {
        this._editorGroup.remove(this._editorGroup.children[0]);
      }
      this._editorGroup = null;
    }

    off('editorSelectType');
    off('editorSelectTool');
    off('editorSetTransform');
    off('editorClearAll');
    off('editorImportLevel');
    off('editorSetWorldSize');
    off('editorSetWindDir');
    off('editorSetFogDensity');
    off('editorSetTimeOfDay');
    off('editorSetStormy');
    off('editorToggleGodRays');
    off('editorToggleDock');
    off('editorExport');
    off('editorSelectTentacle');
    off('editorAddTentacle');
    off('editorRemoveTentacle');
    off('editorSetTentacleSpeed');
    off('editorSetTentacleDuration');
    off('editorClearWaypoints');
    off('editorRemoveBoss');
    
    if (this._envManager) {
      this._envManager.dispose();
      this._envManager = null;
    }
    
    if (this._scene) {
      this._scene.fog = null;
      this._scene.background = new THREE.Color(0x222233);
    }
  }

  _updatePreview() {
    if (this._previewMesh) {
      if (this._previewMesh.mesh?.parent) this._previewMesh.mesh.parent.remove(this._previewMesh.mesh);
      else if (this._editorGroup) this._editorGroup.remove(this._previewMesh.mesh);
      else if (this._scene) this._scene.remove(this._previewMesh.mesh);
      this._previewMesh = null;
    }

    if (this._activeTool === 'place' && this._activeType) {
      this._previewMesh = buildObstacle(
        this._activeType, 
        { x: 0, z: 0 }, 
        this._activeUrl,
        this._currentScale,
        this._rockModels, this._pickupModels, this._seaweedModels, this._waveModels, this._islandModels,
        this._sirenModel
      );
      
      // Make it slightly transparent
      this._previewMesh.mesh.traverse(child => {
        if (child.isMesh) {
          child.material = child.material.clone();
          child.material.transparent = true;
          child.material.opacity = 0.5;
        }
      });
      
      this._previewMesh.mesh.rotation.y = this._currentRotation;
      if (this._editorGroup) this._editorGroup.add(this._previewMesh.mesh);
      else if (this._scene) this._scene.add(this._previewMesh.mesh);
    } else if (this._activeTool === 'place_kraken') {
      const geo = new THREE.SphereGeometry(8, 16, 12);
      const mat = new THREE.MeshBasicMaterial({ color: 0xaa2266, wireframe: true });
      const mesh = new THREE.Mesh(geo, mat);
      this._previewMesh = { mesh };
      if (this._editorGroup) this._editorGroup.add(mesh);
      else if (this._scene) this._scene.add(mesh);
    } else if (this._activeTool === 'place_race_start') {
      const geo = new THREE.RingGeometry(14, 15, 32);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ color: 0x00ff88, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.noGodRays = true;
      mesh.userData.isRaceMarker = true;
      this._previewMesh = { mesh };
      if (this._editorGroup) this._editorGroup.add(mesh);
      else if (this._scene) this._scene.add(mesh);
    } else if (this._activeTool === 'place_waypoint') {
      const group = new THREE.Group();
      group.userData.noGodRays = true;
      group.userData.isRaceMarker = true;
      const cylGeo = new THREE.CylinderGeometry(7.2, 7.2, 20, 16, 1, true);
      const cylMat = new THREE.MeshBasicMaterial({ color: 0xffea00, wireframe: true, transparent: true, opacity: 0.6 });
      const cylMesh = new THREE.Mesh(cylGeo, cylMat);
      cylMesh.position.y = 10;
      cylMesh.userData.noGodRays = true;
      cylMesh.userData.isRaceMarker = true;
      group.add(cylMesh);

      const ringGeo = new THREE.RingGeometry(6.8, 7.6, 24);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffea00, side: THREE.DoubleSide });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.y = 0.2;
      ringMesh.userData.noGodRays = true;
      ringMesh.userData.isRaceMarker = true;
      group.add(ringMesh);

      this._previewMesh = { mesh: group };
      if (this._editorGroup) this._editorGroup.add(group);
      else if (this._scene) this._scene.add(group);
    } else if (this._activeTool === 'place_end_location') {
      const group = new THREE.Group();
      group.userData.noGodRays = true;
      group.userData.isRaceMarker = true;
      const r = Math.max(10, Math.floor(this._currentScale * 15));
      const cylGeo = new THREE.CylinderGeometry(r * 0.9, r * 0.9, 24, 24, 1, true);
      const cylMat = new THREE.MeshBasicMaterial({ color: 0x00ffaa, wireframe: true, transparent: true, opacity: 0.65 });
      const cylMesh = new THREE.Mesh(cylGeo, cylMat);
      cylMesh.position.y = 12;
      cylMesh.userData.noGodRays = true;
      cylMesh.userData.isRaceMarker = true;
      group.add(cylMesh);

      const ringGeo = new THREE.RingGeometry(r * 0.85, r * 1.05, 32);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffaa, side: THREE.DoubleSide });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.y = 0.2;
      ringMesh.userData.noGodRays = true;
      ringMesh.userData.isRaceMarker = true;
      group.add(ringMesh);

      this._previewMesh = { mesh: group };
      if (this._editorGroup) this._editorGroup.add(group);
      else if (this._scene) this._scene.add(group);
    } else if (this._activeTool === 'place_ship_spawn') {
      const group = new THREE.Group();
      group.userData.noGodRays = true;
      group.userData.isRaceMarker = true;

      const profile = getShipProfile(this._selectedShipId);
      const targetWorldLength = (profile.grid?.z || 48) * (profile.scale || 0.10);
      const r = Math.max(profile.collisionRadius || 2.5, targetWorldLength * 0.45);

      const ringGeo = new THREE.RingGeometry(r * 0.88, r * 1.05, 32);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.y = 0.2;
      group.add(ringMesh);

      const discGeo = new THREE.CircleGeometry(r * 0.85, 32);
      discGeo.rotateX(-Math.PI / 2);
      const discMat = new THREE.MeshBasicMaterial({ color: 0x0099bb, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
      const discMesh = new THREE.Mesh(discGeo, discMat);
      discMesh.position.y = 0.18;
      group.add(discMesh);

      const arrowHelper = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0.25, 0), r * 1.5, 0x00e5ff, 2.5, 1.2);
      group.add(arrowHelper);

      const label = this._createLabelSprite('⛵ SHIP SPAWN', '#00e5ff');
      label.position.set(0, 7.5, 0);
      label.scale.set(16, 4, 1);
      group.add(label);

      group.rotation.y = this._currentRotation;
      this._previewMesh = { mesh: group };
      if (this._editorGroup) this._editorGroup.add(group);
      else if (this._scene) this._scene.add(group);
    }
  }

  _onWheel(event) {
    if (this._activeTool === 'place' && this._activeType) {
      event.preventDefault();
      
      // Adjust vertical height (Y)
      const delta = event.deltaY > 0 ? -0.5 : 0.5;
      this._currentY += delta;
      
      // Update position immediately using last known mouse intersection
      if (this._previewMesh) {
        this._previewMesh.mesh.position.set(this._intersection.x, this._intersection.y + this._currentY, this._intersection.z);
      }
      this._emitState();
    }
  }

  _onKeyDown(event) {
    const isPlaceTool = this._activeTool === 'place' && this._activeType;
    const isTerrainTool = this._activeTool === 'terrain_raise' || this._activeTool === 'terrain_lower';

    if (isPlaceTool || isTerrainTool) {
      if (event.code === 'KeyO' || event.code === 'KeyP') {
        const delta = event.code === 'KeyO' ? 0.5 : -0.5; // Faster scaling for terrain
        this._currentScale = Math.max(0.1, Math.min(20.0, this._currentScale + delta));
        
        if (isPlaceTool) {
          this._updatePreview();
          if (this._previewMesh) {
            this._previewMesh.mesh.position.set(this._intersection.x, this._intersection.y + this._currentY, this._intersection.z);
          }
        }
        this._emitState();
      } else if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
        if (isPlaceTool || this._activeTool === 'place_ship_spawn') {
          const deltaRot = event.code === 'BracketLeft' ? Math.PI / 8 : -Math.PI / 8;
          this._currentRotation += deltaRot;
          if (this._previewMesh) {
            this._previewMesh.mesh.rotation.y = this._currentRotation;
          }
          this._emitState();
        }
      }
    }
  }

  _onPointerMove(event) {
    const rect = this._renderer.domElement.getBoundingClientRect();
    this._mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this._raycaster.setFromCamera(this._mouse, this._camera);
    this._raycaster.ray.intersectPlane(this._plane, this._intersection);

    const isTerrainTool = this._activeTool === 'terrain_raise' || this._activeTool === 'terrain_lower';

    if (!isTerrainTool) {
      const checkObjects = [];
      if (this._voxelTerrain) checkObjects.push(this._voxelTerrain.meshGroup);
      if (this._placedObstacles.length > 0) {
        checkObjects.push(...this._placedObstacles.map(o => o.mesh));
      }
      if (checkObjects.length > 0) {
        const intersects = this._raycaster.intersectObjects(checkObjects, true);
        if (intersects.length > 0) {
          this._intersection.copy(intersects[0].point);
        }
      }
    } else {
      // Anchored to the horizontal sea plane to eliminate camera-ray drift
      const topY = this._voxelTerrain ? this._voxelTerrain.getTopY(this._intersection.x, this._intersection.z) : -1;
      this._intersection.y = Math.max(0, topY + 1);
    }

    if (this._previewMesh) {
      if (this._activeTool === 'place_kraken') {
        this._previewMesh.mesh.position.set(this._intersection.x, -5, this._intersection.z);
      } else if (this._activeTool === 'place_race_start' || this._activeTool === 'place_waypoint' || this._activeTool === 'place_end_location' || this._activeTool === 'place_ship_spawn') {
        this._previewMesh.mesh.position.set(this._intersection.x, 0.5, this._intersection.z);
      } else {
        this._previewMesh.mesh.position.set(this._intersection.x, this._intersection.y + this._currentY, this._intersection.z);
      }
    }

    if (isTerrainTool) {
      if (this._voxelTerrain) {
        const type = this._activeTool === 'terrain_raise' ? 'raise' : 'lower';
        const radius = Math.max(1, Math.floor(this._currentScale * 2));
        const previewTargetY = (this._isPointerDown && this._strokeTargetY !== null)
          ? this._strokeTargetY
          : (type === 'raise' ? this._intersection.y : Math.max(0, this._intersection.y - 1));
        this._voxelTerrain.updatePreview(this._intersection.x, this._intersection.z, radius, type, previewTargetY, this._brushShape);
      }
      
      if (this._isPointerDown) {
        if (this._strokeAnchor) {
          const curDist = this._strokeAnchor.distanceTo(new THREE.Vector2(this._intersection.x, this._intersection.z));
          if (curDist > 1.0) {
            // Actively dragging across map: reset stationary pulse timer
            this._strokeHoldTimer = 0;
            this._strokeAnchor.set(this._intersection.x, this._intersection.z);
          }
        }
        this._applyTerraform(this._intersection);
      }
    } else {
      if (this._voxelTerrain) this._voxelTerrain.hidePreview();
    }
  }

  _onPointerUp(event) {
    if (event.button === 0) {
      this._isPointerDown = false;
      this._lastTerraformPoint = null;
      this._strokeTargetY = null;
      this._strokeHoldTimer = 0;
    }
  }

  _applyTerraform(hitPoint) {
    if (this._voxelTerrain) {
      const type = this._activeTool === 'terrain_raise' ? 'raise' : 'lower';
      const radius = Math.max(1, Math.floor(this._currentScale * 2));
      const targetY = this._strokeTargetY !== null 
        ? this._strokeTargetY 
        : (type === 'raise' ? Math.floor(hitPoint.y) : Math.floor(hitPoint.y) - 1);
      
      const currentPt = new THREE.Vector2(hitPoint.x, hitPoint.z);

      if (this._lastTerraformPoint) {
        const dist = this._lastTerraformPoint.distanceTo(currentPt);
        const stepDist = Math.max(0.8, radius / 2);
        
        if (dist > stepDist) {
          const steps = Math.ceil(dist / stepDist);
          for (let i = 1; i <= steps; i++) {
            const lerped = this._lastTerraformPoint.clone().lerp(currentPt, i / steps);
            this._voxelTerrain.applyBrush(lerped.x, lerped.y, radius, type, targetY, this._brushShape);
          }
        } else {
          this._voxelTerrain.applyBrush(currentPt.x, currentPt.y, radius, type, targetY, this._brushShape);
        }
      } else {
        this._voxelTerrain.applyBrush(currentPt.x, currentPt.y, radius, type, targetY, this._brushShape);
      }
      
      this._lastTerraformPoint = currentPt;
      this._voxelTerrain.updateDirtyMeshes();
    }
  }

  _onPointerDown(event) {
    // Left click only
    if (event.button !== 0) return;
    
    this._isPointerDown = true;
    this._lastTerraformPoint = null;
    this._strokeHoldTimer = 0;
    this._onPointerMove(event);

    const isTerrainTool = this._activeTool === 'terrain_raise' || this._activeTool === 'terrain_lower';
    if (isTerrainTool && this._voxelTerrain) {
      const topY = this._voxelTerrain.getTopY(this._intersection.x, this._intersection.z);
      if (this._activeTool === 'terrain_raise') {
        this._strokeTargetY = Math.max(1, topY + 1);
      } else {
        this._strokeTargetY = Math.max(-1, topY - 1);
      }
      if (!this._strokeAnchor) this._strokeAnchor = new THREE.Vector2();
      this._strokeAnchor.set(this._intersection.x, this._intersection.z);
      this._applyTerraform(this._intersection);
      return;
    }

    if (this._activeTool === 'place' && this._activeType) {
      this._spawnObstacle(this._activeType, this._activeUrl, this._intersection.x, this._intersection.y + this._currentY, this._intersection.z, this._currentScale, this._currentRotation);
    } else if (this._activeTool === 'place_kraken') {
      if (!this._krakenConfig) {
        this._krakenConfig = {
          krakenPosition: { x: Math.round(this._intersection.x * 10) / 10, y: -5, z: Math.round(this._intersection.z * 10) / 10 },
          raceStartPosition: { x: Math.round(this._intersection.x * 10) / 10, y: 0, z: Math.round((this._intersection.z + 80) * 10) / 10 },
          raceStartRadius: 15,
          totalHP: 100,
          tentacles: [{ spawnOffset: { x: -20, y: 0, z: 0 }, speed: 12, raceDuration: 25, damagePerTentacle: 34, waypoints: [] }]
        };
      } else {
        this._krakenConfig.krakenPosition = {
          x: Math.round(this._intersection.x * 10) / 10,
          y: -5,
          z: Math.round(this._intersection.z * 10) / 10
        };
      }
      this._updateBossVisuals();
      this._emitBossConfig();
    } else if (this._activeTool === 'place_race_start') {
      if (!this._krakenConfig) {
        this._krakenConfig = {
          krakenPosition: { x: Math.round(this._intersection.x * 10) / 10, y: -5, z: Math.round((this._intersection.z - 80) * 10) / 10 },
          raceStartPosition: { x: Math.round(this._intersection.x * 10) / 10, y: 0, z: Math.round(this._intersection.z * 10) / 10 },
          raceStartRadius: 15,
          totalHP: 100,
          tentacles: [{ spawnOffset: { x: -20, y: 0, z: 0 }, speed: 12, raceDuration: 25, damagePerTentacle: 34, waypoints: [] }]
        };
      } else {
        this._krakenConfig.raceStartPosition = {
          x: Math.round(this._intersection.x * 10) / 10,
          y: 0,
          z: Math.round(this._intersection.z * 10) / 10
        };
      }
      this._updateBossVisuals();
      this._emitBossConfig();
    } else if (this._activeTool === 'place_waypoint') {
      if (!this._krakenConfig) {
        this._krakenConfig = {
          krakenPosition: { x: 0, y: -5, z: -150 },
          raceStartPosition: { x: 0, y: 0, z: -40 },
          raceStartRadius: 15,
          totalHP: 100,
          tentacles: [{ spawnOffset: { x: -20, y: 0, z: 0 }, speed: 12, raceDuration: 25, damagePerTentacle: 34, waypoints: [] }]
        };
      }
      if (!this._krakenConfig.tentacles || this._krakenConfig.tentacles.length === 0) {
        this._krakenConfig.tentacles = [{ spawnOffset: { x: -20, y: 0, z: 0 }, speed: 12, raceDuration: 25, damagePerTentacle: 34, waypoints: [] }];
        this._activeTentacleIdx = 0;
      }
      const tent = this._krakenConfig.tentacles[this._activeTentacleIdx];
      if (!tent.waypoints) tent.waypoints = [];
      tent.waypoints.push({
        position: {
          x: Math.round(this._intersection.x * 10) / 10,
          y: 0,
          z: Math.round(this._intersection.z * 10) / 10
        },
        radius: 8
      });
      this._updateBossVisuals();
      this._emitBossConfig();
    } else if (this._activeTool === 'place_end_location') {
      const radius = Math.max(10, Math.floor(this._currentScale * 15));
      this._endLocation = {
        position: {
          x: Math.round(this._intersection.x * 10) / 10,
          y: 0,
          z: Math.round(this._intersection.z * 10) / 10
        },
        radius
      };
      if (this._levelCfg) {
        this._levelCfg.endLocation = this._endLocation;
      }
      this._updateEndLocationVisual();
      this._emitState();
    } else if (this._activeTool === 'place_ship_spawn') {
      this._shipSpawn = {
        position: {
          x: Math.round(this._intersection.x * 10) / 10,
          y: 0,
          z: Math.round(this._intersection.z * 10) / 10
        },
        rotation: Math.round(this._currentRotation * 100) / 100
      };
      if (this._levelCfg) {
        this._levelCfg.shipSpawn = this._shipSpawn;
      }
      this._shipGhostVisible = true;
      this._updateShipGhost();
      this._emitState();
      emit('editorShipSpawnPlaced', { shipSpawn: this._shipSpawn });
    } else if (this._activeTool === 'delete') {
      // Use raycasting to find the exactly clicked mesh
      const meshes = this._placedObstacles.map(o => o.mesh);
      const intersects = this._raycaster.intersectObjects(meshes, true);
      
      if (intersects.length > 0) {
        const hitObject = intersects[0].object;
        
        // Find which obstacle this object belongs to
        const closestIdx = this._placedObstacles.findIndex(o => {
          let isMatch = false;
          o.mesh.traverse(child => {
            if (child === hitObject) isMatch = true;
          });
          return isMatch;
        });

        if (closestIdx !== -1) {
          const closest = this._placedObstacles[closestIdx];
          if (closest.mesh?.parent) closest.mesh.parent.remove(closest.mesh);
          else if (this._editorGroup) this._editorGroup.remove(closest.mesh);
          else if (this._scene) this._scene.remove(closest.mesh);
          this._placedObstacles.splice(closestIdx, 1);
          this._emitState();
        }
      }
    }
  }

  _spawnObstacle(type, url, x, y, z, scale, rotation = 0) {
    const obs = buildObstacle(
      type, 
      { x, y, z }, 
      url,
      scale,
      this._rockModels, this._pickupModels, this._seaweedModels, this._waveModels, this._islandModels,
      this._sirenModel
    );
    obs.mesh.rotation.y = rotation;
    obs.rotation = rotation;
    if (this._editorGroup) this._editorGroup.add(obs.mesh);
    else if (this._scene) this._scene.add(obs.mesh);
    this._placedObstacles.push(obs);
    this._emitState();
  }

  getPlayableConfig() {
    const sirens = this._placedObstacles
      .filter(obs => obs.type === 'siren')
      .map(obs => ({
        type: 'siren',
        position: {
          x: Math.round(obs.mesh.position.x * 100) / 100,
          y: Math.round(obs.mesh.position.y * 100) / 100,
          z: Math.round(obs.mesh.position.z * 100) / 100
        },
        intensity: 0.7,
        attractRadius: Math.round((obs.scale || 1.0) * 20 * 10) / 10
      }));

    return {
      ...this._levelCfg,
      ship: this._selectedShipId || this._levelCfg?.ship || DEFAULT_SHIP_ID,
      budget: this._budget !== undefined ? this._budget : (this._levelCfg?.budget !== undefined ? this._levelCfg.budget : 300),
      worldSize: this._levelCfg?.worldSize || 200,
      globalWindDir: this._levelCfg?.globalWindDir || 0,
      fogDensity: this._levelCfg?.fogDensity !== undefined ? this._levelCfg.fogDensity : 0.006,
      timeOfDay: this._levelCfg?.timeOfDay !== undefined ? this._levelCfg.timeOfDay : 8.0,
      isStormy: this._levelCfg?.isStormy || false,
      godRays: this._levelCfg?.godRays !== undefined ? this._levelCfg.godRays : true,
      voxels: this._voxelTerrain ? this._voxelTerrain.serialize() : null,
      obstacles: this._placedObstacles
        .filter(obs => obs.type !== 'siren')
        .map(obs => ({
          type: obs.type,
          assetUrl: obs.assetUrl,
          scale: obs.scale,
          rotation: obs.rotation,
          position: {
            x: Math.round(obs.mesh.position.x * 100) / 100,
            y: Math.round(obs.mesh.position.y * 100) / 100,
            z: Math.round(obs.mesh.position.z * 100) / 100
          }
        })),
      sirens: sirens.length > 0 ? sirens : (this._levelCfg?.sirens || []),
      kraken: this._krakenConfig ? this._krakenConfig : null,
      endLocation: this._endLocation || this._levelCfg?.endLocation || { position: { x: 0, y: 0, z: -220 }, radius: 16 },
      shipSpawn: this._shipSpawn || this._levelCfg?.shipSpawn || { position: { x: 0, y: 0, z: 0 }, rotation: 0 },
      hasDock: this._hasDock !== undefined ? this._hasDock : (this._levelCfg?.hasDock !== false)
    };
  }

  // -------------------------------------------------------------------------
  // Boss Visuals & Helpers
  // -------------------------------------------------------------------------

  _updateBossVisuals() {
    if (this._krakenVisualGroup) {
      if (this._krakenVisualGroup.parent) this._krakenVisualGroup.parent.remove(this._krakenVisualGroup);
      else if (this._editorGroup) this._editorGroup.remove(this._krakenVisualGroup);
      else if (this._scene) this._scene.remove(this._krakenVisualGroup);
      this._krakenVisualGroup.traverse(child => {
        if (child.isMesh || child.isLine || child.isSprite) {
          child.geometry?.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
          }
        }
      });
      this._krakenVisualGroup = null;
    }

    if (!this._krakenConfig) return;

    this._krakenVisualGroup = new THREE.Group();

    // 1. Kraken Body Marker
    const kPos = this._krakenConfig.krakenPosition;
    if (kPos) {
      const krakenMarker = new THREE.Group();
      krakenMarker.position.set(kPos.x, kPos.y ?? -5, kPos.z);

      // Body representation — Octopus 3D model
      const kModel = this._krakenModel || (typeof LevelConfig !== 'undefined' ? LevelConfig._cache?.get('krakenModel') : null);
      if (kModel && kModel.scene) {
        const clone = kModel.scene.clone(true);
        const box = new THREE.Box3().setFromObject(clone);
        const center = new THREE.Vector3();
        box.getCenter(center);
        clone.position.set(-center.x, -box.min.y, -center.z);

        const wrapper = new THREE.Group();
        wrapper.scale.setScalar(1.3);
        wrapper.add(clone);
        krakenMarker.add(wrapper);
      } else {
        // Fallback procedural dome
        const bodyMesh = new THREE.Mesh(
          new THREE.SphereGeometry(8, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.7),
          new THREE.MeshPhongMaterial({ color: 0x331033, emissive: 0x220522, shininess: 30 })
        );
        bodyMesh.position.y = 4;
        krakenMarker.add(bodyMesh);

        // Glowing eyes
        const eyeGeo = new THREE.SphereGeometry(0.8, 8, 8);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-3, 6, 7);
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(3, 6, 7);
        krakenMarker.add(leftEye, rightEye);
      }

      // Sea level boundary ring
      const seaRing = new THREE.Mesh(
        new THREE.RingGeometry(18, 19, 32),
        new THREE.MeshBasicMaterial({ color: 0xaa2266, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
      );
      seaRing.rotation.x = -Math.PI / 2;
      seaRing.position.y = 5.1;
      krakenMarker.add(seaRing);

      // Label sprite
      const kLabel = this._createLabelSprite('🐙 KRAKEN', '#ff44aa');
      kLabel.position.set(0, 14, 0);
      kLabel.scale.set(16, 4, 1);
      krakenMarker.add(kLabel);

      this._krakenVisualGroup.add(krakenMarker);
    }

    // 2. Race Start Marker
    const rPos = this._krakenConfig.raceStartPosition;
    if (rPos) {
      const startMarker = new THREE.Group();
      startMarker.position.set(rPos.x, rPos.y ?? 0, rPos.z);

      // Start radius ring
      const radius = this._krakenConfig.raceStartRadius || 15;
      const startRing = new THREE.Mesh(
        new THREE.RingGeometry(radius - 0.5, radius, 32),
        new THREE.MeshBasicMaterial({ color: 0x00ff88, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
      );
      startRing.rotation.x = -Math.PI / 2;
      startRing.position.y = 0.2;
      startMarker.add(startRing);

      // Flag pole
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 8, 8),
        new THREE.MeshPhongMaterial({ color: 0xffffff })
      );
      pole.position.y = 4;
      startMarker.add(pole);

      // Flag banner
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(3, 2),
        new THREE.MeshBasicMaterial({ color: 0x00ff88, side: THREE.DoubleSide })
      );
      flag.position.set(1.5, 7, 0);
      startMarker.add(flag);

      // Label sprite
      const sLabel = this._createLabelSprite('🏁 RACE START', '#00ff88');
      sLabel.position.set(0, 10, 0);
      sLabel.scale.set(14, 3.5, 1);
      startMarker.add(sLabel);

      startMarker.userData.noGodRays = true;
      startMarker.userData.isRaceMarker = true;
      startMarker.traverse(c => {
        c.userData.noGodRays = true;
        c.userData.isRaceMarker = true;
      });

      this._krakenVisualGroup.add(startMarker);
    }

    // 3. Tentacle Waypoints
    const tentacles = this._krakenConfig.tentacles || [];
    const colorPalette = [0x00ffff, 0xff9900, 0xff00cc, 0x33ff33, 0xffcc00];

    tentacles.forEach((tent, tIdx) => {
      const isActive = tIdx === this._activeTentacleIdx;
      const colHex = colorPalette[tIdx % colorPalette.length];
      const waypoints = tent.waypoints || [];

      if (waypoints.length > 0) {
        // Waypoint gates — GTA:SA style transparent vertical yellow cylinders
        waypoints.forEach((wp, wIdx) => {
          const wpGroup = new THREE.Group();
          wpGroup.position.set(wp.position.x, wp.position.y ?? 0, wp.position.z);

          const r = (wp.radius || 8) * 0.9;
          const cylinderHeight = 20;
          const wpColor = isActive ? 0xffea00 : colHex;

          // 1. Tall transparent cylinder
          const cylGeo = new THREE.CylinderGeometry(r, r, cylinderHeight, 24, 1, true);
          const cylMat = new THREE.MeshPhongMaterial({
            color: wpColor,
            emissive: isActive ? 0x886600 : 0x000000,
            emissiveIntensity: isActive ? 0.4 : 0,
            transparent: true,
            opacity: isActive ? 0.45 : 0.18,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          const cylinder = new THREE.Mesh(cylGeo, cylMat);
          cylinder.position.y = cylinderHeight / 2;
          wpGroup.add(cylinder);

          // 2. Base ground ring
          const ringGeo = new THREE.RingGeometry(r * 0.88, r * 1.02, 24);
          const ringMat = new THREE.MeshBasicMaterial({
            color: wpColor,
            transparent: true,
            opacity: isActive ? 0.75 : 0.25,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          const baseRing = new THREE.Mesh(ringGeo, ringMat);
          baseRing.rotation.x = -Math.PI / 2;
          baseRing.position.y = 0.2;
          wpGroup.add(baseRing);

          // 3. Number label sprite
          const badge = this._createNumberSprite(`${wIdx + 1}`, isActive ? '#111111' : '#ffffff', wpColor);
          badge.position.y = 6.0;
          badge.scale.set(4, 4, 1);
          wpGroup.add(badge);

          wpGroup.userData.noGodRays = true;
          wpGroup.userData.isRaceMarker = true;
          wpGroup.traverse(c => {
            c.userData.noGodRays = true;
            c.userData.isRaceMarker = true;
          });

          this._krakenVisualGroup.add(wpGroup);
        });

        // Connecting trail line
        const points = waypoints.map(wp => new THREE.Vector3(wp.position.x, (wp.position.y ?? 0) + 1.5, wp.position.z));
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineDashedMaterial({
          color: colHex,
          dashSize: 2,
          gapSize: 1,
          transparent: true,
          opacity: isActive ? 0.9 : 0.3
        });
        const line = new THREE.Line(lineGeo, lineMat);
        line.computeLineDistances();
        line.userData.noGodRays = true;
        line.userData.isRaceMarker = true;
        this._krakenVisualGroup.add(line);
      }
    });

    this._krakenVisualGroup.userData.noGodRays = true;
    this._krakenVisualGroup.userData.isRaceMarker = true;
    if (this._editorGroup) this._editorGroup.add(this._krakenVisualGroup);
    else if (this._scene) this._scene.add(this._krakenVisualGroup);
  }

  _createLabelSprite(text, color = '#ffffff') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    if (ctx.roundRect) ctx.roundRect(4, 4, 248, 56, 12);
    else ctx.rect(4, 4, 248, 56);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  }

  _createNumberSprite(numStr, textColor = '#ffffff', bgColor = '#00ffff') {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = typeof bgColor === 'number' ? '#' + bgColor.toString(16).padStart(6, '0') : bgColor;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = textColor;
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(numStr, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  }

  _emitBossConfig() {
    if (!this._krakenConfig) {
      emit('editorBossConfigUpdated', { tentacles: [], activeIdx: 0, currentTentacle: null });
      return;
    }
    const tentacles = this._krakenConfig.tentacles || [];
    const currentTentacle = tentacles[this._activeTentacleIdx] || null;
    emit('editorBossConfigUpdated', {
      tentacles,
      activeIdx: this._activeTentacleIdx,
      currentTentacle,
      krakenPos: this._krakenConfig.krakenPosition,
      raceStartPos: this._krakenConfig.raceStartPosition,
    });
  }

  _updateEndLocationVisual() {
    if (this._endLocationVisualGroup) {
      this._scene?.remove(this._endLocationVisualGroup);
      this._endLocationVisualGroup.traverse(child => {
        if (child.isMesh || child.isLine || child.isSprite) {
          child.geometry?.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
          }
        }
      });
      this._endLocationVisualGroup = null;
    }

    if (!this._endLocation) return;

    this._endLocationVisualGroup = new THREE.Group();
    this._endLocationVisualGroup.position.set(
      this._endLocation.position.x,
      this._endLocation.position.y || 0,
      this._endLocation.position.z
    );

    const radius = this._endLocation.radius || 16;
    const height = 30;

    // Outer translucent cylinder
    const cylGeo = new THREE.CylinderGeometry(radius * 0.95, radius * 0.95, height, 32, 1, true);
    const cylMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      wireframe: false,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const cylMesh = new THREE.Mesh(cylGeo, cylMat);
    cylMesh.position.y = height / 2;
    this._endLocationVisualGroup.add(cylMesh);

    // Inner wireframe cylinder
    const wireGeo = new THREE.CylinderGeometry(radius * 0.95, radius * 0.95, height, 16, 4, true);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x66ffbb,
      wireframe: true,
      transparent: true,
      opacity: 0.6,
      depthWrite: false
    });
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    wireMesh.position.y = height / 2;
    this._endLocationVisualGroup.add(wireMesh);

    // Sea-level base ring
    const ringGeo = new THREE.RingGeometry(radius * 0.85, radius * 1.05, 36);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.y = 0.25;
    this._endLocationVisualGroup.add(ringMesh);

    // Label sprite
    const label = this._createLabelSprite('🏁 HARBOR GOAL', '#00ff88');
    label.position.set(0, height + 4, 0);
    label.scale.set(18, 4.5, 1);
    this._endLocationVisualGroup.add(label);

    this._endLocationVisualGroup.userData.noGodRays = true;
    this._endLocationVisualGroup.userData.isRaceMarker = true;
    this._endLocationVisualGroup.traverse(c => {
      c.userData.noGodRays = true;
      c.userData.isRaceMarker = true;
    });

    this._scene?.add(this._endLocationVisualGroup);
  }

  exportLevel() {
    const exportData = this.getPlayableConfig();
    
    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `level_export_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    
    console.log("Level Exported", exportData);
  }

  _updateShipGhost() {
    if (!this._scene) return;

    const disposeGroup = (grp) => {
      if (!grp) return;
      if (grp.parent) grp.parent.remove(grp);
      grp.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
    };

    if (this._shipGhostGroup) {
      disposeGroup(this._shipGhostGroup);
      this._shipGhostGroup = null;
    }

    // Safety sweep: remove any previous or duplicate spawn circle groups from editorGroup and scene
    const sweep = (parent) => {
      if (!parent) return;
      for (let i = parent.children.length - 1; i >= 0; i--) {
        const c = parent.children[i];
        if (c.name === 'editorShipGhost' || c.userData?.isShipSpawn) {
          disposeGroup(c);
        }
      }
    };
    sweep(this._editorGroup);
    sweep(this._scene);

    const profile = getShipProfile(this._selectedShipId);
    this._shipGhostGroup = new THREE.Group();
    this._shipGhostGroup.name = 'editorShipGhost';
    this._shipGhostGroup.userData.isShipSpawn = true;
    this._shipGhostGroup.visible = this._shipGhostVisible;

    const spawnPos = this._shipSpawn?.position || (this._shipSpawn?.x !== undefined ? this._shipSpawn : null);
    const spawnX = spawnPos?.x ?? 0;
    const spawnY = spawnPos?.y ?? 0;
    const spawnZ = spawnPos?.z ?? 0;
    const spawnRot = this._shipSpawn?.rotation ?? 0;

    this._shipGhostGroup.position.set(spawnX, spawnY, spawnZ);
    this._shipGhostGroup.rotation.y = spawnRot;

    // Target world length matches the voxel ship (grid.z * profile.scale)
    const targetWorldLength = (profile.grid?.z || 48) * (profile.scale || 0.10);

    // Floating marker ring on water at spawn location
    const ringRadius = Math.max(profile.collisionRadius || 2.5, targetWorldLength * 0.45);
    const ringGeo = new THREE.RingGeometry(ringRadius * 0.9, ringRadius * 1.05, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: profile.isGagTruck ? 0xff3300 : 0x00e5ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.15;
    this._shipGhostGroup.add(ring);

    // Forward heading arrow helper
    const arrowHelper = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0.2, 0), ringRadius * 1.5, profile.isGagTruck ? 0xff3300 : 0x00e5ff, 2.5, 1.2);
    this._shipGhostGroup.add(arrowHelper);

    // Label sprite
    const label = this._createLabelSprite('⛵ SHIP SPAWN', profile.isGagTruck ? '#ff4422' : '#00e5ff');
    label.position.set(0, 7.5, 0);
    label.scale.set(16, 4, 1);
    this._shipGhostGroup.add(label);

    // Load ship model with translucent wireframe / ghost holographic material
    const loader = new GLTFLoader();
    const modelUrl = getAssetUrl(profile.modelUrl || `assets/ships/${profile.id}.glb`);
    const targetGroup = this._shipGhostGroup;
    loader.load(modelUrl, (gltf) => {
      // If a new spawn or ship was chosen before load completed, discard stale model
      if (!this._shipGhostGroup || this._shipGhostGroup !== targetGroup) {
        gltf.scene.traverse(c => {
          if (c.geometry) c.geometry.dispose();
          if (c.material) {
            if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
            else c.material.dispose();
          }
        });
        return;
      }
      const model = gltf.scene;

      // Apply profile rotation to align model along Z axis
      if (profile.modelRotationY !== undefined) {
        model.rotation.y = profile.modelRotationY;
      }
      model.updateMatrixWorld(true);

      // Scale model based on ship profile
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);

      // Centered and resting on water
      model.position.set(-center.x, -box.min.y, -center.z);

      const modelLength = Math.max(size.z, 0.001);
      const modelScale = targetWorldLength / modelLength;

      const wrapper = new THREE.Group();
      wrapper.add(model);
      wrapper.scale.setScalar(modelScale);

      // Apply holographic cyan / red tint
      model.traverse((child) => {
        if (child.isMesh) {
          child.material = new THREE.MeshStandardMaterial({
            color: profile.isGagTruck ? 0xff4422 : 0x00e5ff,
            emissive: profile.isGagTruck ? 0xaa2200 : 0x006688,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.6,
            depthWrite: false
          });
        }
      });

      // Facing -Z (default sailing direction)
      wrapper.rotation.y = Math.PI;
      this._shipGhostGroup.add(wrapper);
    });

    if (this._editorGroup) this._editorGroup.add(this._shipGhostGroup);
    else if (this._scene) this._scene.add(this._shipGhostGroup);
  }

  dispose() {
    if (this._shipGhostGroup) {
      if (this._shipGhostGroup.parent) this._shipGhostGroup.parent.remove(this._shipGhostGroup);
      this._editorGroup?.remove(this._shipGhostGroup);
      this._scene?.remove(this._shipGhostGroup);
      this._shipGhostGroup.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
      this._shipGhostGroup = null;
    }

    if (this._windArrowHelper) {
      this._scene?.remove(this._windArrowHelper);
      this._windArrowHelper = null;
    }

    if (this._krakenVisualGroup) {
      this._scene?.remove(this._krakenVisualGroup);
      this._krakenVisualGroup = null;
    }

    if (this._endLocationVisualGroup) {
      this._scene?.remove(this._endLocationVisualGroup);
      this._endLocationVisualGroup = null;
    }

    if (this._previewMesh) {
      this._scene?.remove(this._previewMesh.mesh);
      this._previewMesh = null;
    }

    this._renderer?.domElement.removeEventListener('pointerdown', this._boundPointerDown);
    this._renderer?.domElement.removeEventListener('pointermove', this._boundPointerMove);
    window.removeEventListener('pointerup', this._boundPointerUp);
    this._renderer?.domElement.removeEventListener('wheel', this._boundWheel);
    window.removeEventListener('keydown', this._boundKeyDown);
  }

  update(delta) {
    if (this._previewMesh && this._previewMesh.particles) {
      this._previewMesh.particles.update(delta);
    }
    
    for (const obs of this._placedObstacles) {
      if (obs.particles) {
        obs.particles.update(delta);
      }
    }
    
    if (this._envManager) {
      this._envManager.update(delta, { getWindAt: () => new THREE.Vector3(0, 0, -1) }, this._camera.position);
    }

    if (this._endLocationVisualGroup) {
      this._endLocationVisualGroup.rotation.y += delta * 0.4;
    }

    // Hybrid Stroke-Leveling: Pulse height when holding stationary in place
    const isTerrainTool = this._activeTool === 'terrain_raise' || this._activeTool === 'terrain_lower';
    if (this._isPointerDown && isTerrainTool && this._voxelTerrain && this._strokeTargetY !== null) {
      this._strokeHoldTimer += delta;
      // Pulse cadence: every 0.28 seconds of holding stationary in one spot
      if (this._strokeHoldTimer >= 0.28) {
        this._strokeHoldTimer = 0;
        const type = this._activeTool === 'terrain_raise' ? 'raise' : 'lower';
        if (type === 'raise') {
          if (this._strokeTargetY < 63) {
            this._strokeTargetY++;
          }
        } else {
          if (this._strokeTargetY > -1) {
            this._strokeTargetY--;
          }
        }
        this._applyTerraform(this._intersection);
        const radius = Math.max(1, Math.floor(this._currentScale * 2));
        this._voxelTerrain.updatePreview(this._intersection.x, this._intersection.z, radius, type, this._strokeTargetY, this._brushShape);
      }
    }
  }
}

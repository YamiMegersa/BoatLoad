import * as THREE from 'three';
import { emit, on, off } from '../core/EventBus.js';
import { buildObstacle } from '../obstacle/ObstacleManager.js';
import { EnvironmentManager } from '../environment/EnvironmentManager.js';
import { VoxelTerrain } from './VoxelTerrain.js';

export class EditorSystem {
  constructor() {
    this._scene = null;
    this._camera = null;
    this._renderer = null;
    this._rockModels = [];
    this._pickupModels = [];
    this._seaweedModels = [];
    this._waveModels = [];

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
    this._boundPointerDown = this._onPointerDown.bind(this);
    this._boundPointerMove = this._onPointerMove.bind(this);
    this._boundPointerUp = this._onPointerUp.bind(this);
    this._boundWheel = this._onWheel.bind(this);
    this._boundKeyDown = this._onKeyDown.bind(this);

    // Boss Encounter State
    this._krakenConfig = null;
    this._activeTentacleIdx = 0;
    this._krakenVisualGroup = null;
    
    on('editorSelectType', d => {
      this._activeType = d.type;
      this._activeUrl = d.url;
      this._activeTool = 'place';
      this._currentScale = 1.0; // reset scale on new tool
      this._currentY = 0.5;     // reset height on new tool
      this._currentRotation = 0; // reset rotation
      this._updatePreview();
    });
    
    on('editorSelectTool', d => {
      this._activeType = null;
      this._activeUrl = null;
      this._activeTool = d.tool;
      this._updatePreview();
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
  }

  init(scene, camera, renderer, levelCfg, rockModels, pickupModels, seaweedModels, waveModels, islandModels) {
    this._scene = scene;
    this._camera = camera;
    this._renderer = renderer;
    this._levelCfg = levelCfg;
    this._rockModels = rockModels;
    this._pickupModels = pickupModels;
    this._seaweedModels = seaweedModels;
    this._waveModels = waveModels;
    this._islandModels = islandModels;

    this._voxelTerrain = new VoxelTerrain(this._scene);
    if (this._levelCfg && this._levelCfg.voxels) {
      this._voxelTerrain.deserialize(this._levelCfg.voxels);
    }

    this._envManager = new EnvironmentManager();
    this._envManager.init(this._scene, [], this._levelCfg);

    // Initialize 3D Wind Arrow
    const windDirAngle = this._levelCfg?.globalWindDir || 0;
    const initialWindDir = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(windDirAngle)).normalize();
    this._windArrowHelper = new THREE.ArrowHelper(initialWindDir, new THREE.Vector3(0, 10, 0), 30, 0x00ffff, 8, 4);
    this._scene.add(this._windArrowHelper);

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
  }

  _updateBoundaryVisual() {
    if (this._boundaryVisual) {
      this._scene.remove(this._boundaryVisual);
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
    this._scene.add(this._boundaryVisual);
  }

  dispose() {
    this._renderer.domElement.removeEventListener('pointerdown', this._boundPointerDown);
    this._renderer.domElement.removeEventListener('pointermove', this._boundPointerMove);
    window.removeEventListener('pointerup', this._boundPointerUp);
    this._renderer.domElement.removeEventListener('wheel', this._boundWheel);
    window.removeEventListener('keydown', this._boundKeyDown);
    
    if (this._previewMesh) {
      this._scene.remove(this._previewMesh.mesh);
      this._previewMesh = null;
    }
    
    for (const obs of this._placedObstacles) {
      this._scene.remove(obs.mesh);
    }
    this._placedObstacles = [];
    
    if (this._boundaryVisual) {
      this._scene.remove(this._boundaryVisual);
      this._boundaryVisual.geometry.dispose();
      this._boundaryVisual.material.dispose();
      this._boundaryVisual = null;
    }
    
    if (this._windArrowHelper) {
      this._scene.remove(this._windArrowHelper);
      this._windArrowHelper.line.geometry.dispose();
      this._windArrowHelper.line.material.dispose();
      this._windArrowHelper.cone.geometry.dispose();
      this._windArrowHelper.cone.material.dispose();
      this._windArrowHelper = null;
    }

    if (this._krakenVisualGroup) {
      this._scene.remove(this._krakenVisualGroup);
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

    off('editorSelectType');
    off('editorSelectTool');
    off('editorSetWorldSize');
    off('editorSetWindDir');
    off('editorSetFogDensity');
    off('editorSetTimeOfDay');
    off('editorSetStormy');
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
      this._scene.remove(this._previewMesh.mesh);
      this._previewMesh = null;
    }

    if (this._activeTool === 'place' && this._activeType) {
      this._previewMesh = buildObstacle(
        this._activeType, 
        { x: 0, z: 0 }, 
        this._activeUrl,
        this._currentScale,
        this._rockModels, this._pickupModels, this._seaweedModels, this._waveModels, this._islandModels
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
      this._scene.add(this._previewMesh.mesh);
    } else if (this._activeTool === 'place_kraken') {
      const geo = new THREE.SphereGeometry(8, 16, 12);
      const mat = new THREE.MeshBasicMaterial({ color: 0xaa2266, wireframe: true });
      const mesh = new THREE.Mesh(geo, mat);
      this._previewMesh = { mesh };
      this._scene.add(mesh);
    } else if (this._activeTool === 'place_race_start') {
      const geo = new THREE.RingGeometry(14, 15, 32);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ color: 0x00ff88, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
      const mesh = new THREE.Mesh(geo, mat);
      this._previewMesh = { mesh };
      this._scene.add(mesh);
    } else if (this._activeTool === 'place_waypoint') {
      const group = new THREE.Group();
      const cylGeo = new THREE.CylinderGeometry(7.2, 7.2, 20, 16, 1, true);
      const cylMat = new THREE.MeshBasicMaterial({ color: 0xffea00, wireframe: true, transparent: true, opacity: 0.6 });
      const cylMesh = new THREE.Mesh(cylGeo, cylMat);
      cylMesh.position.y = 10;
      group.add(cylMesh);

      const ringGeo = new THREE.RingGeometry(6.8, 7.6, 24);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffea00, side: THREE.DoubleSide });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.y = 0.2;
      group.add(ringMesh);

      this._previewMesh = { mesh: group };
      this._scene.add(group);
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
      } else if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
        if (isPlaceTool) {
          const deltaRot = event.code === 'BracketLeft' ? Math.PI / 8 : -Math.PI / 8;
          this._currentRotation += deltaRot;
          if (this._previewMesh) {
            this._previewMesh.mesh.rotation.y = this._currentRotation;
          }
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

    if (this._previewMesh) {
      if (this._activeTool === 'place_kraken') {
        this._previewMesh.mesh.position.set(this._intersection.x, -5, this._intersection.z);
      } else if (this._activeTool === 'place_race_start' || this._activeTool === 'place_waypoint') {
        this._previewMesh.mesh.position.set(this._intersection.x, 0.5, this._intersection.z);
      } else {
        this._previewMesh.mesh.position.set(this._intersection.x, this._intersection.y + this._currentY, this._intersection.z);
      }
    }

    const isTerrainTool = this._activeTool === 'terrain_raise' || this._activeTool === 'terrain_lower';
    if (isTerrainTool) {
      if (this._voxelTerrain) {
        const type = this._activeTool === 'terrain_raise' ? 'raise' : 'lower';
        const radius = Math.max(1, Math.floor(this._currentScale * 2));
        this._voxelTerrain.updatePreview(this._intersection.x, this._intersection.z, radius, type, this._intersection.y);
      }
      
      if (this._isPointerDown) {
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
    }
  }

  _applyTerraform(hitPoint) {
    if (this._voxelTerrain) {
      const type = this._activeTool === 'terrain_raise' ? 'raise' : 'lower';
      const radius = Math.max(1, Math.floor(this._currentScale * 2));

      
      const currentPt = new THREE.Vector2(hitPoint.x, hitPoint.z);

      if (this._lastTerraformPoint) {
        const dist = this._lastTerraformPoint.distanceTo(currentPt);
        const stepDist = Math.max(1, radius / 2);
        
        if (dist > stepDist) {
            const steps = Math.ceil(dist / stepDist);
            for (let i = 1; i <= steps; i++) {
                const lerped = this._lastTerraformPoint.clone().lerp(currentPt, i / steps);
                this._voxelTerrain.applyBrush(lerped.x, lerped.y, radius, type, hitPoint.y);
            }
        } else {
            this._voxelTerrain.applyBrush(currentPt.x, currentPt.y, radius, type, hitPoint.y);
        }
      } else {
        this._voxelTerrain.applyBrush(currentPt.x, currentPt.y, radius, type, hitPoint.y);
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
    this._onPointerMove(event);

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
          this._scene.remove(closest.mesh);
          this._placedObstacles.splice(closestIdx, 1);
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
      this._rockModels, this._pickupModels, this._seaweedModels, this._waveModels, this._islandModels
    );
    obs.mesh.rotation.y = rotation;
    obs.rotation = rotation;
    this._scene.add(obs.mesh);
    this._placedObstacles.push(obs);
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
      worldSize: this._levelCfg?.worldSize || 200,
      globalWindDir: this._levelCfg?.globalWindDir || 0,
      fogDensity: this._levelCfg?.fogDensity !== undefined ? this._levelCfg.fogDensity : 0.006,
      timeOfDay: this._levelCfg?.timeOfDay !== undefined ? this._levelCfg.timeOfDay : 8.0,
      isStormy: this._levelCfg?.isStormy || false,
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
      kraken: this._krakenConfig ? this._krakenConfig : null
    };
  }

  // -------------------------------------------------------------------------
  // Boss Visuals & Helpers
  // -------------------------------------------------------------------------

  _updateBossVisuals() {
    if (this._krakenVisualGroup) {
      this._scene.remove(this._krakenVisualGroup);
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

      // Body dome
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
        this._krakenVisualGroup.add(line);
      }
    });

    this._scene.add(this._krakenVisualGroup);
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

  exportLevel() {
    const exportData = this.getPlayableConfig();
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `level_export_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    console.log("Level Exported", exportData);
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
      this._envManager.update(delta, { getWindAt: () => new THREE.Vector3(0, 0, -1) }, new THREE.Vector3());
    }
  }
}

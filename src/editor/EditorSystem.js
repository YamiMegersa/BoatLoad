import * as THREE from 'three';
import { emit, on, off } from '../core/EventBus.js';
import { buildObstacle } from '../obstacle/ObstacleManager.js';

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
    
    // Config
    this._levelCfg = null;
    
    // Track explicit placed instances
    this._placedObstacles = [];

    // Raycasting
    this._raycaster = new THREE.Raycaster();
    this._mouse = new THREE.Vector2();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._intersection = new THREE.Vector3();

    // Bindings
    this._boundPointerDown = this._onPointerDown.bind(this);
    this._boundPointerMove = this._onPointerMove.bind(this);
    
    on('editorSelectType', d => {
      this._activeType = d.type;
      this._activeUrl = d.url;
      this._activeTool = 'place';
      this._updatePreview();
    });
    
    on('editorSelectTool', d => {
      this._activeType = null;
      this._activeUrl = null;
      this._activeTool = d.tool;
      this._updatePreview();
    });

    on('editorExport', () => this.exportLevel());
  }

  init(scene, camera, renderer, levelCfg, rockModels, pickupModels, seaweedModels, waveModels) {
    this._scene = scene;
    this._camera = camera;
    this._renderer = renderer;
    this._levelCfg = levelCfg;
    this._rockModels = rockModels;
    this._pickupModels = pickupModels;
    this._seaweedModels = seaweedModels;
    this._waveModels = waveModels;

    this._renderer.domElement.addEventListener('pointerdown', this._boundPointerDown);
    this._renderer.domElement.addEventListener('pointermove', this._boundPointerMove);
    
    // Clear and respawn any existing explicit obstacles in the config
    this._placedObstacles = [];
    if (this._levelCfg && this._levelCfg.obstacles) {
      for (const cfg of this._levelCfg.obstacles) {
        if (cfg.position) {
          this._spawnObstacle(cfg.type, cfg.assetUrl, cfg.position.x, cfg.position.z);
        }
      }
    }
  }

  dispose() {
    this._renderer.domElement.removeEventListener('pointerdown', this._boundPointerDown);
    this._renderer.domElement.removeEventListener('pointermove', this._boundPointerMove);
    
    if (this._previewMesh) {
      this._scene.remove(this._previewMesh.mesh);
      this._previewMesh = null;
    }
    
    for (const obs of this._placedObstacles) {
      this._scene.remove(obs.mesh);
    }
    this._placedObstacles = [];
    
    off('editorSelectType');
    off('editorSelectTool');
    off('editorExport');
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
        this._rockModels, this._pickupModels, this._seaweedModels, this._waveModels
      );
      
      // Make it slightly transparent
      this._previewMesh.mesh.traverse(child => {
        if (child.isMesh) {
          child.material = child.material.clone();
          child.material.transparent = true;
          child.material.opacity = 0.5;
        }
      });
      
      this._scene.add(this._previewMesh.mesh);
    }
  }

  _onPointerMove(event) {
    const rect = this._renderer.domElement.getBoundingClientRect();
    this._mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this._raycaster.setFromCamera(this._mouse, this._camera);
    this._raycaster.ray.intersectPlane(this._plane, this._intersection);

    if (this._previewMesh) {
      this._previewMesh.mesh.position.set(this._intersection.x, 0.5, this._intersection.z);
    }
  }

  _onPointerDown(event) {
    // Left click only
    if (event.button !== 0) return;
    
    this._onPointerMove(event);

    if (this._activeTool === 'place' && this._activeType) {
      this._spawnObstacle(this._activeType, this._activeUrl, this._intersection.x, this._intersection.z);
    } else if (this._activeTool === 'delete') {
      // Find closest obstacle to intersection
      let closest = null;
      let minDist = 3.0; // Click radius
      let closestIdx = -1;
      
      for (let i = 0; i < this._placedObstacles.length; i++) {
        const obs = this._placedObstacles[i];
        const dist = Math.hypot(obs.mesh.position.x - this._intersection.x, obs.mesh.position.z - this._intersection.z);
        if (dist < minDist) {
          minDist = dist;
          closest = obs;
          closestIdx = i;
        }
      }
      
      if (closest) {
        this._scene.remove(closest.mesh);
        this._placedObstacles.splice(closestIdx, 1);
      }
    }
  }

  _spawnObstacle(type, url, x, z) {
    const obs = buildObstacle(
      type, 
      { x, z }, 
      url,
      this._rockModels, this._pickupModels, this._seaweedModels, this._waveModels
    );
    this._scene.add(obs.mesh);
    this._placedObstacles.push(obs);
  }

  exportLevel() {
    // Only output explicitly placed obstacles per user request
    const exportData = {
      ...this._levelCfg,
      obstacles: this._placedObstacles.map(obs => ({
        type: obs.type,
        assetUrl: obs.assetUrl,
        position: {
          x: Math.round(obs.mesh.position.x * 100) / 100,
          z: Math.round(obs.mesh.position.z * 100) / 100
        }
      }))
    };
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `level_export_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    console.log("Level Exported", exportData);
  }
}

import * as THREE from 'three';
import { CellState, CELL_SIZE } from './VoxelGrid.js';

// ---------------------------------------------------------------------------
// Material palette for individual damage/flood meshes
// ---------------------------------------------------------------------------

/** Voxel material — white base so instance colors show through */
const intactMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
const damagedMaterial = new THREE.MeshLambertMaterial({ color: 0x5c3317 });

/** Flooded bilge — translucent ocean blue */
const floodedMaterial = new THREE.MeshPhongMaterial({
  color: 0x474b6b,
  transparent: true,
  opacity: 0.62,
});

/** Missing/Broken cell — red highlight */
const missingMaterial = new THREE.MeshPhongMaterial({
  color: 0xff0000,
  emissive: 0x660000,
  transparent: true,
  opacity: 0.5,
});

/**
 * Maximum number of simultaneously active individual (DAMAGED/FLOODED) meshes.
 * When the cap is reached, the oldest mesh is recycled.
 */
const MAX_INDIVIDUAL_MESHES = 256;
const BOX_GEO = new THREE.BoxGeometry(CELL_SIZE, CELL_SIZE, CELL_SIZE);

// ---------------------------------------------------------------------------
// ChunkRenderer
// ---------------------------------------------------------------------------

/**
 * ChunkRenderer — owns all Three.js visual objects for a ship's VoxelGrid.
 *
 * Rendering strategy:
 *  - INTACT cells   → InstancedMesh (colored via grid.getColor).
 *  - MISSING cells  → Instance hidden (scale 0).
 *  - DAMAGED cells  → Instance hidden + individual THREE.Mesh spawned.
 *  - FLOODED cells  → Instance hidden + individual THREE.Mesh spawned.
 */
export class ChunkRenderer {
  constructor() {
    this.container = new THREE.Group();
    
    this._instancedMesh = null;
    this._instanceIdxMap = new Map(); // grid flatIdx -> instance ID
    this._nextInstanceId = 0;

    /** Maps flat grid index → individual THREE.Mesh for DAMAGED/FLOODED cells. */
    this._individualMeshes = new Map();
    /** FIFO queue to enforce MAX_INDIVIDUAL_MESHES. */
    this._individualQueue = [];

    this._scene = null;
  }

  /**
   * Initialise from a freshly-built VoxelGrid.
   * Must be called once before any sync().
   *
   * @param {import('./VoxelGrid.js').VoxelGrid} grid
   * @param {THREE.Scene} scene
   */
  init(grid, scene) {
    this._scene = scene;
    this._scene.add(this.container);

    const maxIntact = grid.width * grid.height * grid.depth;
    this._instancedMesh = new THREE.InstancedMesh(BOX_GEO, intactMaterial, maxIntact);
    this._instancedMesh.count = 0;
    
    // We must manually inform Three.js that we intend to update colors dynamically
    this._instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (this._instancedMesh.instanceColor) {
      this._instancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    
    this.container.add(this._instancedMesh);

    // Perform a full pass to spawn initial meshes
    this._fullRebuild(grid);
  }

  /**
   * Synchronise renderer state with any dirty cells in the grid.
   * Call this once per frame (or whenever EventBus fires 'gridDirty').
   *
   * @param {import('./VoxelGrid.js').VoxelGrid} grid
   */
  sync(grid) {
    const dirty = grid.consumeDirty();
    if (dirty.size === 0) return;

    let instanceMatrixDirty = false;
    let instanceColorDirty = false;

    // Update individual meshes for damaged/flooded cells
    for (const flatIdx of dirty) {
      const z = Math.floor(flatIdx / (grid.width * grid.height));
      const rem = flatIdx % (grid.width * grid.height);
      const y = Math.floor(rem / grid.width);
      const x = rem % grid.width;
      const state = grid.getState(x, y, z);

      if (this._syncCell(grid, x, y, z, flatIdx, state)) {
        instanceMatrixDirty = true;
        instanceColorDirty = true;
      }
    }

    if (instanceMatrixDirty && this._instancedMesh) {
      this._instancedMesh.instanceMatrix.needsUpdate = true;
      if (this._instancedMesh.instanceColor) {
        this._instancedMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  /**
   * Tear down all Three.js objects and free GPU memory.
   * @param {THREE.Scene} scene
   */
  dispose(scene) {
    if (this.container) {
      scene.remove(this.container);
    }
    
    if (this._instancedMesh) {
      this._instancedMesh.dispose();
      this._instancedMesh = null;
    }

    for (const mesh of this._individualMeshes.values()) {
      this.container.remove(mesh);
      mesh.geometry.dispose();
    }
    this._individualMeshes.clear();
    this._individualQueue.length = 0;
    this._scene = null;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  _fullRebuild(grid) {
    for (const mesh of this._individualMeshes.values()) {
      this.container.remove(mesh);
      mesh.geometry.dispose();
    }
    this._individualMeshes.clear();
    this._individualQueue.length = 0;
    
    if (this._instancedMesh) {
      this._instancedMesh.count = 0;
    }
    this._instanceIdxMap.clear();
    this._nextInstanceId = 0;

    grid.forEach((x, y, z, state, flatIdx) => {
      this._syncCell(grid, x, y, z, flatIdx, state);
    });

    if (this._instancedMesh) {
      this._instancedMesh.instanceMatrix.needsUpdate = true;
      if (this._instancedMesh.instanceColor) {
        this._instancedMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  /** Returns true if fallback InstancedMesh was modified */
  _syncCell(grid, x, y, z, flatIdx, state) {
    let instanceDirty = false;

    // 1. Manage Fallback InstancedMesh
    if (this._instancedMesh) {
      if (state === CellState.INTACT || state === CellState.REPAIRED) {
        const color = new THREE.Color(grid.getColor(x, y, z));
        
        if (!this._instanceIdxMap.has(flatIdx)) {
          // Allocate new instance ID
          const iid = this._nextInstanceId++;
          this._instanceIdxMap.set(flatIdx, iid);
          this._instancedMesh.count = this._nextInstanceId;
          
          const matrix = new THREE.Matrix4().setPosition(grid.toWorldPos(x, y, z));
          this._instancedMesh.setMatrixAt(iid, matrix);
          this._instancedMesh.setColorAt(iid, color);
          instanceDirty = true;
        } else {
          // Ensure it's scaled up if it was previously hidden
          const iid = this._instanceIdxMap.get(flatIdx);
          const matrix = new THREE.Matrix4().setPosition(grid.toWorldPos(x, y, z));
          this._instancedMesh.setMatrixAt(iid, matrix);
          this._instancedMesh.setColorAt(iid, color);
          instanceDirty = true;
        }
      } else {
        if (this._instanceIdxMap.has(flatIdx)) {
          // Hide it by scaling to 0
          const iid = this._instanceIdxMap.get(flatIdx);
          const matrix = new THREE.Matrix4().makeScale(0, 0, 0);
          this._instancedMesh.setMatrixAt(iid, matrix);
          instanceDirty = true;
        }
      }
    }

    // 2. Manage Individual Overlays
    switch (state) {
      case CellState.INTACT:
      case CellState.REPAIRED:
      case CellState.EMPTY:
        this._removeIndividual(flatIdx);
        break;

      case CellState.MISSING:
        this._spawnIndividual(grid, x, y, z, flatIdx, missingMaterial);
        break;

      case CellState.DAMAGED:
        this._spawnIndividual(grid, x, y, z, flatIdx, damagedMaterial);
        break;

      case CellState.FLOODED:
        this._spawnIndividual(grid, x, y, z, flatIdx, floodedMaterial);
        break;
    }

    return instanceDirty;
  }

  _spawnIndividual(grid, x, y, z, flatIdx, material) {
    if (this._individualMeshes.has(flatIdx)) {
      this._individualMeshes.get(flatIdx).material = material;
      return;
    }

    if (this._individualMeshes.size >= MAX_INDIVIDUAL_MESHES) {
      const evictIdx = this._individualQueue.shift();
      if (evictIdx !== undefined) this._removeIndividual(evictIdx);
    }

    const mesh = new THREE.Mesh(BOX_GEO, material);
    mesh.position.copy(grid.toWorldPos(x, y, z));
    this.container.add(mesh);

    this._individualMeshes.set(flatIdx, mesh);
    this._individualQueue.push(flatIdx);
  }

  _removeIndividual(flatIdx) {
    const mesh = this._individualMeshes.get(flatIdx);
    if (!mesh) return;

    this.container.remove(mesh);
    this._individualMeshes.delete(flatIdx);

    const qIdx = this._individualQueue.indexOf(flatIdx);
    if (qIdx !== -1) this._individualQueue.splice(qIdx, 1);
  }
}

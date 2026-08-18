import * as THREE from 'three';
import { CellState, CELL_SIZE } from './VoxelGrid.js';
import { emit } from '../core/EventBus.js';

// ---------------------------------------------------------------------------
// Material palette (shared across all chunk renderers)
// ---------------------------------------------------------------------------

/** Intact wood — warm #9A5B2E */
const woodMaterial = new THREE.MeshLambertMaterial({ color: 0x9A5B2E });

/** Cracked / damaged wood — darker, desaturated */
const damagedMaterial = new THREE.MeshLambertMaterial({ color: 0x5c3317 });

/** Flooded bilge — translucent ocean blue */
const floodedMaterial = new THREE.MeshPhongMaterial({
  color: 0x474b6b,
  transparent: true,
  opacity: 0.62,
});

/**
 * Maximum number of simultaneously active individual (DAMAGED/FLOODED) meshes.
 * When the cap is reached, the oldest mesh is recycled.
 */
const MAX_INDIVIDUAL_MESHES = 256;

// Shared geometry for both the InstancedMesh and individual cells
const BOX_GEO = new THREE.BoxGeometry(CELL_SIZE, CELL_SIZE, CELL_SIZE);

// ---------------------------------------------------------------------------
// ChunkRenderer
// ---------------------------------------------------------------------------

/**
 * ChunkRenderer — owns all Three.js visual objects for a ship's VoxelGrid.
 *
 * Rendering strategy:
 *  - INTACT cells   → one shared THREE.InstancedMesh  (≤1 draw call)
 *  - DAMAGED cells  → individual THREE.Mesh with cracked material
 *  - FLOODED cells  → individual THREE.Mesh with water material
 *  - MISSING/EMPTY  → nothing rendered
 *
 * Call `init(grid, scene)` once after ShipBuilder.build().
 * Call `sync(grid)`        every time cells have changed (driven by dirty set).
 * Call `dispose(scene)`    on phase teardown.
 */
export class ChunkRenderer {
  constructor() {
    /** @type {THREE.InstancedMesh|null} */
    this._instancedMesh = null;

    /**
     * Maps flat grid index → individual THREE.Mesh for DAMAGED/FLOODED cells.
     * @type {Map<number, THREE.Mesh>}
     */
    this._individualMeshes = new Map();

    /**
     * FIFO queue of grid indices with individual meshes, used to enforce the
     * MAX_INDIVIDUAL_MESHES cap by evicting the oldest entry first.
     * @type {number[]}
     */
    this._individualQueue = [];

    /** Total number of INTACT instances (tracks how many slots are live). */
    this._instanceCount = 0;

    /**
     * Maps flat grid index → instance slot index in the InstancedMesh.
     * @type {Map<number, number>}
     */
    this._indexToSlot = new Map();

    /**
     * Stack of freed instance slots available for re-use.
     * @type {number[]}
     */
    this._freeSlots = [];

    /** Parent scene reference (needed for add/remove). */
    this._scene = null;

    /** Reusable Object3D for computing matrices. */
    this._dummy = new THREE.Object3D();
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Initialise from a freshly-built VoxelGrid.
   * Must be called once before any sync().
   *
   * @param {import('./VoxelGrid.js').VoxelGrid} grid
   * @param {THREE.Scene} scene
   */
  init(grid, scene) {
    this._scene = scene;

    const maxCells = grid.cellCount;

    // Allocate InstancedMesh with maximum possible slot count.
    this._instancedMesh = new THREE.InstancedMesh(BOX_GEO, woodMaterial, maxCells);
    this._instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._instancedMesh.count = 0; // will grow as we fill slots
    scene.add(this._instancedMesh);

    // Pre-fill free slot stack (descending so we pop the lowest index first)
    this._freeSlots = Array.from({ length: maxCells }, (_, i) => maxCells - 1 - i);

    // Perform a full initial pass — as if all cells are dirty
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

    let matrixDirty = false;

    for (const flatIdx of dirty) {
      const z = Math.floor(flatIdx / (grid.width * grid.height));
      const rem = flatIdx % (grid.width * grid.height);
      const y = Math.floor(rem / grid.width);
      const x = rem % grid.width;
      const state = grid.getState(x, y, z);

      this._syncCell(grid, x, y, z, flatIdx, state);
      matrixDirty = true;
    }

    if (matrixDirty) {
      this._instancedMesh.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * Tear down all Three.js objects and free GPU memory.
   * @param {THREE.Scene} scene
   */
  dispose(scene) {
    if (this._instancedMesh) {
      scene.remove(this._instancedMesh);
      this._instancedMesh.dispose();
      this._instancedMesh = null;
    }

    for (const mesh of this._individualMeshes.values()) {
      scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this._individualMeshes.clear();
    this._individualQueue.length = 0;
    this._indexToSlot.clear();
    this._freeSlots.length = 0;
    this._scene = null;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Full grid rebuild — used on init or after a topology change.
   * @param {import('./VoxelGrid.js').VoxelGrid} grid
   */
  _fullRebuild(grid) {
    // Reset instance tracking
    this._indexToSlot.clear();
    this._freeSlots.length = 0;
    const maxCells = grid.cellCount;
    for (let i = maxCells - 1; i >= 0; i--) this._freeSlots.push(i);
    this._instancedMesh.count = 0;

    // Remove existing individual meshes
    for (const mesh of this._individualMeshes.values()) {
      this._scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this._individualMeshes.clear();
    this._individualQueue.length = 0;

    // Walk the grid
    grid.forEach((x, y, z, state, flatIdx) => {
      this._syncCell(grid, x, y, z, flatIdx, state);
    });

    this._instancedMesh.instanceMatrix.needsUpdate = true;
    this._instancedMesh.count = Math.max(this._instancedMesh.count, this._indexToSlot.size);
  }

  /**
   * Sync a single cell to the correct render representation.
   * @param {import('./VoxelGrid.js').VoxelGrid} grid
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} flatIdx
   * @param {number} state
   */
  _syncCell(grid, x, y, z, flatIdx, state) {
    switch (state) {
      case CellState.INTACT:
      case CellState.REPAIRED:
        this._removeIndividual(flatIdx);
        this._setInstance(grid, x, y, z, flatIdx);
        break;

      case CellState.DAMAGED:
        this._removeInstance(flatIdx);
        this._spawnIndividual(grid, x, y, z, flatIdx, damagedMaterial);
        break;

      case CellState.FLOODED:
        this._removeInstance(flatIdx);
        this._spawnIndividual(grid, x, y, z, flatIdx, floodedMaterial);
        break;

      case CellState.MISSING:
      case CellState.EMPTY:
        this._removeInstance(flatIdx);
        this._removeIndividual(flatIdx);
        break;

      default:
        break;
    }
  }

  // --- InstancedMesh helpers ---

  _setInstance(grid, x, y, z, flatIdx) {
    let slot = this._indexToSlot.get(flatIdx);
    if (slot === undefined) {
      slot = this._freeSlots.pop();
      if (slot === undefined) {
        console.warn('ChunkRenderer: no free instance slots!');
        return;
      }
      this._indexToSlot.set(flatIdx, slot);
      // Extend the active count if this slot is beyond the current count
      if (slot >= this._instancedMesh.count) {
        this._instancedMesh.count = slot + 1;
      }
    }

    const pos = grid.toWorldPos(x, y, z);
    this._dummy.position.copy(pos);
    this._dummy.scale.set(1, 1, 1);
    this._dummy.updateMatrix();
    this._instancedMesh.setMatrixAt(slot, this._dummy.matrix);
  }

  _removeInstance(flatIdx) {
    const slot = this._indexToSlot.get(flatIdx);
    if (slot === undefined) return;

    // Hide by zero-scaling the matrix
    this._dummy.position.set(0, 0, 0);
    this._dummy.scale.set(0, 0, 0);
    this._dummy.updateMatrix();
    this._instancedMesh.setMatrixAt(slot, this._dummy.matrix);

    this._indexToSlot.delete(flatIdx);
    this._freeSlots.push(slot);
  }

  // --- Individual mesh helpers ---

  _spawnIndividual(grid, x, y, z, flatIdx, material) {
    if (this._individualMeshes.has(flatIdx)) {
      // Already exists — just update material if needed
      this._individualMeshes.get(flatIdx).material = material;
      return;
    }

    // Enforce cap — evict oldest if necessary
    if (this._individualMeshes.size >= MAX_INDIVIDUAL_MESHES) {
      const evictIdx = this._individualQueue.shift();
      if (evictIdx !== undefined) this._removeIndividual(evictIdx);
    }

    const mesh = new THREE.Mesh(BOX_GEO, material);
    mesh.position.copy(grid.toWorldPos(x, y, z));
    this._scene.add(mesh);

    this._individualMeshes.set(flatIdx, mesh);
    this._individualQueue.push(flatIdx);
  }

  _removeIndividual(flatIdx) {
    const mesh = this._individualMeshes.get(flatIdx);
    if (!mesh) return;

    this._scene.remove(mesh);
    // Note: BOX_GEO is shared — do NOT dispose it here
    this._individualMeshes.delete(flatIdx);

    const qIdx = this._individualQueue.indexOf(flatIdx);
    if (qIdx !== -1) this._individualQueue.splice(qIdx, 1);
  }
}

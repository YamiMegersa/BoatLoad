import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Cell state constants
// ---------------------------------------------------------------------------

/**
 * Enum of all valid cell states.
 * Stored as Uint8 values in the VoxelGrid's flat array.
 */
export const CellState = Object.freeze({
  EMPTY:    0, // Air / out-of-hull
  INTACT:   1, // Healthy, part of the InstancedMesh
  DAMAGED:  2, // Cracked — individual Mesh with cracked material
  MISSING:  3, // Hole in hull — no mesh rendered
  FLOODED:  4, // Waterlogged bilge — individual Mesh with water material
  REPAIRED: 5, // Transient state while repair animation plays
});

// ---------------------------------------------------------------------------
// World-space cell size (agreed: 1.0 world unit per voxel side)
// ---------------------------------------------------------------------------
export const CELL_SIZE = 1.0;

// Half-cell offset so cell (0,0,0) is centred at (0.5, 0.5, 0.5) rather than
// at the origin corner — this makes the grid symmetrical when centred.
const HALF = CELL_SIZE * 0.5;

// ---------------------------------------------------------------------------
// VoxelGrid
// ---------------------------------------------------------------------------

export class VoxelGrid {
  /**
   * @param {number} width   X dimension (bow → stern)
   * @param {number} height  Y dimension (keel → mast)
   * @param {number} depth   Z dimension (port → starboard)
   */
  constructor(width, height, depth) {
    this.width  = width;
    this.height = height;
    this.depth  = depth;

    /** @type {Uint8Array} Row-major flat array: index = z*W*H + y*W + x */
    this.data = new Uint8Array(width * height * depth);

    /** Cells modified since the last ChunkRenderer sync. */
    this.dirtySet = new Set();

    /** Set to true when the hull topology changed (cells added/removed from hull). */
    this.topologyDirty = false;
  }

  // -------------------------------------------------------------------------
  // Index mapping
  // -------------------------------------------------------------------------

  /**
   * Convert 3D grid coordinates to a 1D flat array index.
   * Layout: Z outermost, then Y, then X (row-major).
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {number}
   */
  index(x, y, z) {
    return z * this.width * this.height + y * this.width + x;
  }

  /**
   * Returns true if coordinates are within bounds.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {boolean}
   */
  inBounds(x, y, z) {
    return x >= 0 && x < this.width
        && y >= 0 && y < this.height
        && z >= 0 && z < this.depth;
  }

  // -------------------------------------------------------------------------
  // State accessors
  // -------------------------------------------------------------------------

  /**
   * Get the state of a cell.
   * Returns CellState.EMPTY if out of bounds (treats exterior as empty).
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {number} CellState value
   */
  getState(x, y, z) {
    if (!this.inBounds(x, y, z)) return CellState.EMPTY;
    return this.data[this.index(x, y, z)];
  }

  /**
   * Set the state of a cell and mark it dirty.
   * Throws RangeError if coordinates are out of bounds.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} state  One of CellState.*
   */
  setState(x, y, z, state) {
    if (!this.inBounds(x, y, z)) {
      throw new RangeError(`VoxelGrid.setState: (${x},${y},${z}) out of bounds [${this.width},${this.height},${this.depth}]`);
    }

    const idx = this.index(x, y, z);
    const prev = this.data[idx];
    this.data[idx] = state;
    this.dirtySet.add(idx);

    // Mark topology dirty when a cell transitions between hull-present and hull-absent.
    const wasHull = prev === CellState.INTACT || prev === CellState.DAMAGED || prev === CellState.REPAIRED;
    const isHull  = state === CellState.INTACT || state === CellState.DAMAGED || state === CellState.REPAIRED;
    if (wasHull !== isHull) this.topologyDirty = true;
  }

  /**
   * Consume (clear) the dirty set and return the indices that were dirty.
   * Called by ChunkRenderer after a sync pass.
   * @returns {Set<number>}
   */
  consumeDirty() {
    const snapshot = new Set(this.dirtySet);
    this.dirtySet.clear();
    return snapshot;
  }

  /**
   * Consume (clear) the topology dirty flag.
   * Called by ShipRaycaster after rebuilding the BVH hull.
   * @returns {boolean}
   */
  consumeTopologyDirty() {
    const was = this.topologyDirty;
    this.topologyDirty = false;
    return was;
  }

  // -------------------------------------------------------------------------
  // Coordinate conversion helpers
  // -------------------------------------------------------------------------

  /**
   * Convert grid (x,y,z) to a world-space THREE.Vector3.
   * The grid origin aligns with the centre of cell (0,0,0).
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {THREE.Vector3}
   */
  toWorldPos(x, y, z) {
    return new THREE.Vector3(
      x * CELL_SIZE + HALF,
      y * CELL_SIZE + HALF,
      z * CELL_SIZE + HALF,
    );
  }

  /**
   * Convert a world-space Vector3 back to integer grid coordinates.
   * Returns null if the position is outside the grid.
   * @param {THREE.Vector3} vec
   * @returns {{ x: number, y: number, z: number } | null}
   */
  fromWorldPos(vec) {
    const gx = Math.floor(vec.x / CELL_SIZE);
    const gy = Math.floor(vec.y / CELL_SIZE);
    const gz = Math.floor(vec.z / CELL_SIZE);
    if (!this.inBounds(gx, gy, gz)) return null;
    return { x: gx, y: gy, z: gz };
  }

  // -------------------------------------------------------------------------
  // Utility iteration
  // -------------------------------------------------------------------------

  /**
   * Iterate every cell. Callback receives (x, y, z, state, index).
   * @param {(x:number, y:number, z:number, state:number, index:number) => void} fn
   */
  forEach(fn) {
    for (let z = 0; z < this.depth; z++) {
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          const idx = this.index(x, y, z);
          fn(x, y, z, this.data[idx], idx);
        }
      }
    }
  }

  /**
   * Returns true if the cell at (x,y,z) has at least one face exposed to
   * an empty/missing neighbour — i.e., it is on the outer hull surface.
   * Used by ShipRaycaster to build the hitbox geometry.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {boolean}
   */
  isExposed(x, y, z) {
    const neighbours = [
      [x-1, y,   z  ],
      [x+1, y,   z  ],
      [x,   y-1, z  ],
      [x,   y+1, z  ],
      [x,   y,   z-1],
      [x,   y,   z+1],
    ];
    return neighbours.some(([nx, ny, nz]) => {
      const s = this.getState(nx, ny, nz);
      return s === CellState.EMPTY || s === CellState.MISSING;
    });
  }

  /**
   * Total number of cells in the grid.
   * @returns {number}
   */
  get cellCount() {
    return this.width * this.height * this.depth;
  }
}

import * as THREE from 'three';
import {
  computeBoundsTree,
  disposeBoundsTree,
  acceleratedRaycast,
} from 'three-mesh-bvh';
import { CellState, CELL_SIZE } from './VoxelGrid.js';

// Patch Three.js prototypes once, globally.
THREE.BufferGeometry.prototype.computeBoundsTree  = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree  = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// Neighbour offsets for face-exposure check (±X, ±Y, ±Z)
const NEIGHBOURS = [
  [-1, 0, 0], [1, 0, 0],
  [0, -1, 0], [0, 1, 0],
  [0, 0, -1], [0, 0, 1],
];

// 6 face normals matching the NEIGHBOURS order
const FACE_NORMALS = [
  new THREE.Vector3(-1,  0,  0),
  new THREE.Vector3( 1,  0,  0),
  new THREE.Vector3( 0, -1,  0),
  new THREE.Vector3( 0,  1,  0),
  new THREE.Vector3( 0,  0, -1),
  new THREE.Vector3( 0,  0,  1),
];

// Half cell size shorthand
const H = CELL_SIZE * 0.5;

// Quad corners for each face (in local cell space, centred at origin)
// Order: 2 CCW triangles per face → 6 vertices per face
const FACE_QUADS = [
  // -X face
  [[-H,-H,-H],[-H,-H, H],[-H, H, H],  [-H,-H,-H],[-H, H, H],[-H, H,-H]],
  // +X face
  [[ H,-H, H],[ H,-H,-H],[ H, H,-H],  [ H,-H, H],[ H, H,-H],[ H, H, H]],
  // -Y face
  [[-H,-H,-H],[ H,-H,-H],[ H,-H, H],  [-H,-H,-H],[ H,-H, H],[-H,-H, H]],
  // +Y face
  [[-H, H, H],[ H, H, H],[ H, H,-H],  [-H, H, H],[ H, H,-H],[-H, H,-H]],
  // -Z face
  [[ H,-H,-H],[-H,-H,-H],[-H, H,-H],  [ H,-H,-H],[-H, H,-H],[ H, H,-H]],
  // +Z face
  [[-H,-H, H],[ H,-H, H],[ H, H, H],  [-H,-H, H],[ H, H, H],[-H, H, H]],
];

// ---------------------------------------------------------------------------
// ShipRaycaster
// ---------------------------------------------------------------------------

/**
 * ShipRaycaster — builds a merged hull-surface BufferGeometry, accelerates it
 * with a BVH, and maps pointer ray intersections back to VoxelGrid coordinates.
 *
 * Only the OUTER hull surface is included (faces exposed to EMPTY / MISSING).
 *
 * Usage:
 *   const raycaster = new ShipRaycaster();
 *   raycaster.build(grid, scene);
 *
 *   // On pointer click:
 *   const cell = raycaster.cast(mouseNDC, camera);
 *   if (cell) { ... } // cell = { x, y, z }
 *
 *   // On topology change:
 *   raycaster.rebuild(grid);
 *
 *   // On phase exit:
 *   raycaster.dispose(scene);
 */
export class ShipRaycaster {
  constructor() {
    /** @type {THREE.Mesh|null} Invisible BVH mesh */
    this._hullMesh = null;
    this._raycaster = new THREE.Raycaster();
    this._scene = null;
    /** Reference to grid for fromWorldPos conversion */
    this._grid = null;
  }

  // -------------------------------------------------------------------------
  // Build / Rebuild
  // -------------------------------------------------------------------------

  /**
   * Build the BVH hull from scratch and add the invisible mesh to the scene.
   * @param {import('./VoxelGrid.js').VoxelGrid} grid
   * @param {THREE.Scene} scene
   */
  build(grid, scene) {
    this._scene = scene;
    this._grid  = grid;

    if (this._hullMesh) this._teardownMesh();

    const geo = this._buildHullGeometry(grid);
    geo.computeBoundsTree();

    this._hullMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false }));
    this._hullMesh.visible = false; // raycasting still works on invisible meshes
    scene.add(this._hullMesh);
  }

  /**
   * Rebuild the BVH after hull topology has changed.
   * @param {import('./VoxelGrid.js').VoxelGrid} grid
   */
  rebuild(grid) {
    if (!this._scene) return;
    this.build(grid, this._scene);
  }

  // -------------------------------------------------------------------------
  // Casting
  // -------------------------------------------------------------------------

  /**
   * Cast a ray from NDC mouse coordinates and return the VoxelGrid cell hit.
   *
   * @param {{ x: number, y: number }} mouseNDC  Normalised Device Coordinates (-1…+1)
   * @param {THREE.Camera} camera
   * @returns {{ x: number, y: number, z: number } | null}
   */
  cast(mouseNDC, camera) {
    if (!this._hullMesh || !this._grid) return null;

    this._raycaster.setFromCamera(mouseNDC, camera);
    const hits = this._raycaster.intersectObject(this._hullMesh);
    if (hits.length === 0) return null;

    const hit = hits[0];
    // hit.point is world-space; fromWorldPos converts to grid coordinates
    return this._grid.fromWorldPos(hit.point);
  }

  // -------------------------------------------------------------------------
  // Teardown
  // -------------------------------------------------------------------------

  /**
   * Free all GPU and BVH memory. Call when leaving the Shipyard phase.
   * @param {THREE.Scene} scene
   */
  dispose(scene) {
    this._teardownMesh();
    this._scene = null;
    this._grid  = null;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  _teardownMesh() {
    if (!this._hullMesh) return;
    this._scene?.remove(this._hullMesh);
    this._hullMesh.geometry.disposeBoundsTree();
    this._hullMesh.geometry.dispose();
    this._hullMesh.material.dispose();
    this._hullMesh = null;
  }

  /**
   * Construct a merged BufferGeometry containing only the exposed hull faces.
   * Each exposed face of a hull cell contributes 6 vertices (2 triangles).
   *
   * @param {import('./VoxelGrid.js').VoxelGrid} grid
   * @returns {THREE.BufferGeometry}
   */
  _buildHullGeometry(grid) {
    const positions = [];

    const isHullCell = s =>
      s === CellState.INTACT ||
      s === CellState.DAMAGED ||
      s === CellState.REPAIRED;

    const isVoid = s =>
      s === CellState.EMPTY || s === CellState.MISSING;

    grid.forEach((x, y, z, state) => {
      if (!isHullCell(state)) return;

      const worldPos = grid.toWorldPos(x, y, z);

      for (let f = 0; f < 6; f++) {
        const [dx, dy, dz] = NEIGHBOURS[f];
        const neighbourState = grid.getState(x + dx, y + dy, z + dz);

        if (!isVoid(neighbourState)) continue; // face is interior — skip

        // Emit 6 vertices (2 triangles) for this exposed face
        for (const [vx, vy, vz] of FACE_QUADS[f]) {
          positions.push(
            worldPos.x + vx,
            worldPos.y + vy,
            worldPos.z + vz,
          );
        }
      }
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.computeVertexNormals();
    return geo;
  }
}

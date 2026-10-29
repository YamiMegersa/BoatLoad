import * as THREE from 'three';
import { emit, on, off } from '../core/EventBus.js';
import { CellState } from './VoxelGrid.js';
import {
  MATERIAL_REGISTRY,
  DEFAULT_MATERIAL_ID,
  BRUSHES,
  DEFAULT_BRUSH_ID,
  getMaterial,
  getBrush
} from '../config/MaterialRegistry.js';

/**
 * BuildSystem — Manages interactive voxel ship repairs and construction in the shipyard.
 *
 * Features:
 *  - High-visibility 3D skeleton hologram showing outer boundaries and inner voxel lattices.
 *  - 1:1 unscaled alignment in ship local container space.
 *  - Material registry selection with distinct costs and visual feedback.
 *  - Brush shapes: Voxel Block (1x1x1), Plank (1x1x3), Beam (1x5), Deck Plate (2x2), Bulkhead (3x3), Eraser.
 *  - Dynamic rotation around Y (R key) and pitch flip (T key).
 *  - Symmetrical mirror mode (M key) across port/starboard centerline.
 *  - Integrated budget check (prevents placement if funds are insufficient).
 *  - Session undo/redo stack with full refunds for newly placed blocks and zero refund for original hull.
 */
export class BuildSystem {
  constructor() {
    this._grid = null;
    this._scene = null;
    this._container = null;
    this._budgetManager = null;

    this._activeMaterial = getMaterial(DEFAULT_MATERIAL_ID);
    this._activeBrush = getBrush(DEFAULT_BRUSH_ID);
    this._rotation = 0; // 0, 1, 2, 3 (multiples of 90 degrees around Y)
    this._pitch = 0;    // 0 = horizontal, 1 = upright (swaps Y and Z)
    this._mirrorMode = false;

    // Current hovered placement target
    this._currentPlacement = null;

    // Undo / Redo history
    this._undoStack = [];
    this._redoStack = [];

    // Ghost groups for primary and mirror preview
    this._ghostGroup = new THREE.Group();
    this._ghostGroup.visible = false;

    this._mirrorGhostGroup = new THREE.Group();
    this._mirrorGhostGroup.visible = false;

    // Cached preview state to avoid rebuilding geometry every frame
    this._lastPreviewKey = '';

    // Bound event handlers
    this._onMaterialSelected = (e) => {
      if (e.materialId) {
        this._activeMaterial = getMaterial(e.materialId);
        this._refreshGhostMesh();
      }
    };

    this._onBrushSelected = (e) => {
      if (e.brushId) {
        this._activeBrush = getBrush(e.brushId);
        this._refreshGhostMesh();
      }
    };

    this._onRotate = () => {
      this._rotation = (this._rotation + 1) % 4;
      this._refreshGhostMesh();
      this._retriggerPreview();
    };

    this._onTogglePitch = () => {
      this._pitch = (this._pitch + 1) % 2;
      this._refreshGhostMesh();
      this._retriggerPreview();
    };

    this._onToggleMirror = (e) => {
      if (e && e.enabled !== undefined) {
        this._mirrorMode = !!e.enabled;
      } else {
        this._mirrorMode = !this._mirrorMode;
      }
      this._refreshGhostMesh();
      this._retriggerPreview();
      emit('mirrorModeChanged', { enabled: this._mirrorMode });
    };

    this._onUndo = () => this.undo();
    this._onRedo = () => this.redo();

    this._onKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

      if (e.code === 'KeyR') {
        e.preventDefault();
        this._onRotate();
      } else if (e.code === 'KeyT') {
        e.preventDefault();
        this._onTogglePitch();
      } else if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        this._onToggleMirror();
      } else if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
      } else if (e.code === 'KeyY' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.redo();
      } else if (e.code === 'Digit1') {
        this._selectMaterialByIndex(0);
      } else if (e.code === 'Digit2') {
        this._selectMaterialByIndex(1);
      } else if (e.code === 'Digit3') {
        this._selectMaterialByIndex(2);
      } else if (e.code === 'Digit4') {
        this._selectMaterialByIndex(3);
      } else if (e.code === 'Digit5') {
        this._selectMaterialByIndex(4);
      }
    };
  }

  /**
   * Initialise the build system with grid, scene, and optional parent container & budget manager.
   * @param {import('./VoxelGrid.js').VoxelGrid} grid
   * @param {THREE.Scene} scene
   * @param {THREE.Object3D|null} [container=null]
   * @param {import('./BudgetManager.js').BudgetManager|null} [budgetManager=null]
   */
  init(grid, scene, container = null, budgetManager = null) {
    this._grid = grid;
    this._scene = scene;
    this._container = container;
    this._budgetManager = budgetManager;

    const parent = container || scene;
    parent.add(this._ghostGroup);
    parent.add(this._mirrorGhostGroup);

    on('materialSelected', this._onMaterialSelected);
    on('brushSelected',    this._onBrushSelected);
    on('rotateBrush',      this._onRotate);
    on('togglePitch',      this._onTogglePitch);
    on('toggleMirror',     this._onToggleMirror);
    on('undoBuild',        this._onUndo);
    on('redoBuild',        this._onRedo);

    window.addEventListener('keydown', this._onKeyDown);

    this._refreshGhostMesh();
  }

  /**
   * Reset and tear down event listeners and meshes.
   */
  reset() {
    off('materialSelected', this._onMaterialSelected);
    off('brushSelected',    this._onBrushSelected);
    off('rotateBrush',      this._onRotate);
    off('togglePitch',      this._onTogglePitch);
    off('toggleMirror',     this._onToggleMirror);
    off('undoBuild',        this._onUndo);
    off('redoBuild',        this._onRedo);

    window.removeEventListener('keydown', this._onKeyDown);

    if (this._ghostGroup.parent) {
      this._ghostGroup.parent.remove(this._ghostGroup);
    }
    if (this._mirrorGhostGroup.parent) {
      this._mirrorGhostGroup.parent.remove(this._mirrorGhostGroup);
    }

    this._disposeGroupChildren(this._ghostGroup);
    this._disposeGroupChildren(this._mirrorGhostGroup);

    this._grid = null;
    this._scene = null;
    this._container = null;
    this._budgetManager = null;
    this._undoStack.length = 0;
    this._redoStack.length = 0;
    this._lastPreviewKey = '';
  }

  setBudgetManager(budgetManager) {
    this._budgetManager = budgetManager;
  }

  get activeMaterial() {
    return this._activeMaterial;
  }

  get activeBrush() {
    return this._activeBrush;
  }

  get mirrorMode() {
    return this._mirrorMode;
  }

  // ---------------------------------------------------------------------------
  // Geometry & Skeleton Construction
  // ---------------------------------------------------------------------------

  /**
   * Get the active brush dimensions after applying Y rotation and pitch.
   * @returns {[number, number, number]} [sx, sy, sz]
   */
  getBrushDimensions() {
    if (this._activeBrush.isEraser) return [1, 1, 1];

    let [bx, by, bz] = this._activeBrush.size || [1, 1, 1];

    // Y-axis rotation (swaps X and Z)
    if (this._rotation % 2 === 1) {
      const tmp = bx;
      bx = bz;
      bz = tmp;
    }

    // Pitch flip (swaps Y and Z)
    if (this._pitch % 2 === 1) {
      const tmp = by;
      by = bz;
      bz = tmp;
    }

    return [bx, by, bz];
  }

  /**
   * Builds the holographic 3D skeleton group (outer wireframe + inner cell partition lines + translucent core).
   * @param {number} sx
   * @param {number} sy
   * @param {number} sz
   * @param {number} colorHex
   * @param {boolean} isError
   * @returns {THREE.Group}
   */
  _buildSkeletonGroup(sx, sy, sz, colorHex, isError = false) {
    const group = new THREE.Group();

    const edgeColor = isError ? 0xff2222 : (this._activeBrush.isEraser ? 0xff5533 : colorHex);
    const fillColor = isError ? 0xff0000 : (this._activeBrush.isEraser ? 0xcc3322 : colorHex);
    const fillOpacity = isError ? 0.45 : (this._activeBrush.isEraser ? 0.38 : 0.28);

    // 1. Outer Box and Wireframe Edges
    const boxGeo = new THREE.BoxGeometry(sx, sy, sz);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);
    const lineMat = new THREE.LineBasicMaterial({
      color: edgeColor,
      linewidth: 2,
      depthTest: false,
      transparent: true,
      opacity: 0.95
    });
    const outerEdges = new THREE.LineSegments(edgesGeo, lineMat);
    outerEdges.renderOrder = 999;
    group.add(outerEdges);

    // 2. Inner Voxel Lattice Subdivision Lines (shows each 1x1x1 unit cell slot)
    const innerLinesPositions = [];
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;

    // Slices along X
    for (let x = 1; x < sx; x++) {
      const px = -hx + x;
      innerLinesPositions.push(px, -hy, -hz,  px,  hy, -hz);
      innerLinesPositions.push(px,  hy, -hz,  px,  hy,  hz);
      innerLinesPositions.push(px,  hy,  hz,  px, -hy,  hz);
      innerLinesPositions.push(px, -hy,  hz,  px, -hy, -hz);
    }
    // Slices along Y
    for (let y = 1; y < sy; y++) {
      const py = -hy + y;
      innerLinesPositions.push(-hx, py, -hz,   hx, py, -hz);
      innerLinesPositions.push( hx, py, -hz,   hx, py,  hz);
      innerLinesPositions.push( hx, py,  hz,  -hx, py,  hz);
      innerLinesPositions.push(-hx, py,  hz,  -hx, py, -hz);
    }
    // Slices along Z
    for (let z = 1; z < sz; z++) {
      const pz = -hz + z;
      innerLinesPositions.push(-hx, -hy, pz,   hx, -hy, pz);
      innerLinesPositions.push( hx, -hy, pz,   hx,  hy, pz);
      innerLinesPositions.push( hx,  hy, pz,  -hx,  hy, pz);
      innerLinesPositions.push(-hx,  hy, pz,  -hx, -hy, pz);
    }

    if (innerLinesPositions.length > 0) {
      const innerGeo = new THREE.BufferGeometry();
      innerGeo.setAttribute('position', new THREE.Float32BufferAttribute(innerLinesPositions, 3));
      const innerMat = new THREE.LineBasicMaterial({
        color: edgeColor,
        transparent: true,
        opacity: 0.55,
        depthTest: false
      });
      const innerLines = new THREE.LineSegments(innerGeo, innerMat);
      innerLines.renderOrder = 998;
      group.add(innerLines);
    }

    // 3. Translucent Hologram Fill
    const fillMat = new THREE.MeshBasicMaterial({
      color: fillColor,
      transparent: true,
      opacity: fillOpacity,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const fillMesh = new THREE.Mesh(boxGeo, fillMat);
    fillMesh.renderOrder = 997;
    group.add(fillMesh);

    return group;
  }

  _refreshGhostMesh(isError = false) {
    const [sx, sy, sz] = this.getBrushDimensions();
    const colorHex = this._activeMaterial.color;
    const key = `${sx},${sy},${sz},${colorHex},${isError ? 'err' : 'ok'},${this._activeBrush.id}`;

    if (key === this._lastPreviewKey) return;
    this._lastPreviewKey = key;

    // Dispose old children
    this._disposeGroupChildren(this._ghostGroup);
    this._disposeGroupChildren(this._mirrorGhostGroup);

    // Primary ghost
    const primaryMesh = this._buildSkeletonGroup(sx, sy, sz, colorHex, isError);
    this._ghostGroup.add(primaryMesh);

    // Mirror ghost (using a slightly distinct soft cyan/white accent if desired, or same color)
    if (this._mirrorMode) {
      const mirrorMesh = this._buildSkeletonGroup(sx, sy, sz, colorHex, isError);
      this._mirrorGhostGroup.add(mirrorMesh);
    }
  }

  _disposeGroupChildren(group) {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if (child.isGroup) {
        this._disposeGroupChildren(child);
      } else {
        child.geometry?.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      }
    }
  }

  _retriggerPreview() {
    if (this._currentPlacement) {
      this.updatePreview(
        this._currentPlacement.cellX,
        this._currentPlacement.cellY,
        this._currentPlacement.cellZ,
        this._currentPlacement.normal
      );
    }
  }

  _selectMaterialByIndex(idx) {
    const keys = Object.keys(MATERIAL_REGISTRY);
    if (idx >= 0 && idx < keys.length) {
      const id = keys[idx];
      this._activeMaterial = getMaterial(id);
      this._refreshGhostMesh();
      this._retriggerPreview();
      emit('materialSelected', { materialId: id });
    }
  }

  // ---------------------------------------------------------------------------
  // Preview Loop
  // ---------------------------------------------------------------------------

  /**
   * Called on pointer move to position the holographic preview.
   * @param {number} cellX
   * @param {number} cellY
   * @param {number} cellZ
   * @param {THREE.Vector3|null} normal
   */
  updatePreview(cellX, cellY, cellZ, normal) {
    if (!this._grid) {
      this.clearPreview();
      return;
    }

    const [sx, sy, sz] = this.getBrushDimensions();
    const isEraser = this._activeBrush.isEraser;

    let targetX = cellX;
    let targetY = cellY;
    let targetZ = cellZ;

    const state = this._grid.getState(cellX, cellY, cellZ);
    const isHole = (state === CellState.MISSING || state === CellState.DAMAGED || state === CellState.FLOODED);

    // If eraser or targeting a hole, snap directly onto the cell.
    // If placing a new block on intact/repaired hull, snap adjacent to the clicked face.
    if (!isEraser && normal && !isHole) {
      targetX += normal.x;
      targetY += normal.y;
      targetZ += normal.z;
    }

    this._currentPlacement = { cellX, cellY, cellZ, normal };

    // Voxel local center offset
    const offsetX = (sx - 1) / 2;
    const offsetY = (sy - 1) / 2;
    const offsetZ = (sz - 1) / 2;

    const finalX = targetX + offsetX;
    const finalY = targetY + offsetY;
    const finalZ = targetZ + offsetZ;

    // Position primary ghost in local container space (1:1 with voxel grid)
    const worldPos = this._grid.toWorldPos(finalX, finalY, finalZ);
    this._ghostGroup.position.copy(worldPos);
    this._ghostGroup.visible = true;

    // Check affordability and boundaries for visual feedback
    const cellsToPlace = this._collectPlacementCells(targetX, targetY, targetZ, sx, sy, sz);
    const totalCost = isEraser ? 0 : cellsToPlace.length * this._activeMaterial.unitCost;
    const canAfford = this._budgetManager ? this._budgetManager.canAfford(totalCost) : true;
    const hasValidCells = cellsToPlace.length > 0;

    const isError = !hasValidCells || (!isEraser && !canAfford);
    this._refreshGhostMesh(isError);

    // Symmetrical mirror ghost positioning
    if (this._mirrorMode) {
      const mirTargetZ = (this._grid.depth - 1) - (targetZ + sz - 1);
      const mirFinalZ = mirTargetZ + offsetZ;
      const mirWorldPos = this._grid.toWorldPos(finalX, finalY, mirFinalZ);
      this._mirrorGhostGroup.position.copy(mirWorldPos);
      this._mirrorGhostGroup.visible = true;
    } else {
      this._mirrorGhostGroup.visible = false;
    }
  }

  clearPreview() {
    this._ghostGroup.visible = false;
    this._mirrorGhostGroup.visible = false;
    this._currentPlacement = null;
  }

  // ---------------------------------------------------------------------------
  // Placement & Erasure Execution
  // ---------------------------------------------------------------------------

  /**
   * Helper to collect all valid (x,y,z) coordinates affected by the placement.
   */
  _collectPlacementCells(minX, minY, minZ, sx, sy, sz) {
    const cells = [];
    const seen = new Set();

    for (let x = 0; x < sx; x++) {
      for (let y = 0; y < sy; y++) {
        for (let z = 0; z < sz; z++) {
          const cx = minX + x;
          const cy = minY + y;
          const cz = minZ + z;

          if (this._grid.inBounds(cx, cy, cz)) {
            const key = `${cx},${cy},${cz}`;
            if (!seen.has(key)) {
              seen.add(key);
              cells.push({ x: cx, y: cy, z: cz });
            }
          }

          // Mirror cell
          if (this._mirrorMode) {
            const mz = (this._grid.depth - 1) - cz;
            if (this._grid.inBounds(cx, cy, mz)) {
              const mKey = `${cx},${cy},${mz}`;
              if (!seen.has(mKey)) {
                seen.add(mKey);
                cells.push({ x: cx, y: cy, z: mz });
              }
            }
          }
        }
      }
    }

    return cells;
  }

  /**
   * Called on pointer click to commit block placement or eraser action.
   * @param {number} cellX
   * @param {number} cellY
   * @param {number} cellZ
   * @param {THREE.Vector3|null} normal
   * @returns {boolean} Success
   */
  placeObject(cellX, cellY, cellZ, normal) {
    if (!this._grid) return false;

    const isEraser = this._activeBrush.isEraser;
    const [sx, sy, sz] = this.getBrushDimensions();

    let targetX = cellX;
    let targetY = cellY;
    let targetZ = cellZ;

    const state = this._grid.getState(cellX, cellY, cellZ);
    const isHole = (state === CellState.MISSING || state === CellState.DAMAGED || state === CellState.FLOODED);

    if (!isEraser && normal && !isHole) {
      targetX += normal.x;
      targetY += normal.y;
      targetZ += normal.z;
    }

    // --- CASE 1: ERASER MODE ---
    if (isEraser) {
      return this._executeEraser(targetX, targetY, targetZ);
    }

    // --- CASE 2: MATERIAL BLOCK PLACEMENT ---
    const cells = this._collectPlacementCells(targetX, targetY, targetZ, sx, sy, sz);
    if (cells.length === 0) return false;

    const totalCost = cells.length * this._activeMaterial.unitCost;

    // Budget enforcement
    if (this._budgetManager && !this._budgetManager.canAfford(totalCost)) {
      emit('budgetInsufficient', { required: totalCost, remaining: this._budgetManager.remaining });
      emit('notification', {
        type: 'warning',
        text: `Cannot afford repair! Cost: ${totalCost} Doubloons (Remaining: ${this._budgetManager.remaining} Doubloons)`
      });
      return false;
    }

    // Save previous state for undo
    const previousRecords = cells.map(({ x, y, z }) => ({
      x, y, z,
      previousState: this._grid.getState(x, y, z),
      previousColor: this._grid.getColor(x, y, z)
    }));

    // Spend funds
    if (this._budgetManager) {
      this._budgetManager.spend(totalCost, cells, this._activeMaterial.id);
    }

    // Commit changes to VoxelGrid
    for (const { x, y, z } of cells) {
      this._grid.setState(x, y, z, CellState.REPAIRED);
      this._grid.setColor(x, y, z, this._activeMaterial.color);
    }

    // Record undo action
    this._undoStack.push({
      type: 'place',
      cells: previousRecords,
      cost: totalCost,
      materialId: this._activeMaterial.id
    });
    const repairedCells = previousRecords
      .filter(r => r.previousState === CellState.MISSING || r.previousState === CellState.DAMAGED || r.previousState === CellState.FLOODED)
      .map(r => ({ x: r.x, y: r.y, z: r.z, before: r.previousState, after: CellState.REPAIRED }));

    emit('cellRepaired', { cells: repairedCells });
    emit('gridDirty');
    emit('buildPlaced', {
      cost: totalCost,
      count: cells.length,
      material: this._activeMaterial
    });

    return true;
  }

  /**
   * Demolish or undo placed repair blocks.
   * STRICT CONSTRAINT: Only player-placed repair blocks from this session are refunded 100%.
   * Original hull blocks grant ZERO refund.
   */
  _executeEraser(targetX, targetY, targetZ) {
    const targets = [{ x: targetX, y: targetY, z: targetZ }];
    if (this._mirrorMode) {
      const mz = (this._grid.depth - 1) - targetZ;
      if (mz !== targetZ) targets.push({ x: targetX, y: targetY, z: mz });
    }

    let changed = false;
    let totalRefunded = 0;
    const previousRecords = [];

    for (const { x, y, z } of targets) {
      if (!this._grid.inBounds(x, y, z)) continue;
      const curState = this._grid.getState(x, y, z);
      if (curState === CellState.EMPTY || curState === CellState.MISSING) continue;

      const curColor = this._grid.getColor(x, y, z);
      const isSession = this._budgetManager ? this._budgetManager.isSessionRepair(x, y, z) : false;

      // Refund via budget manager (returns 0 if not placed in session)
      let refund = 0;
      if (this._budgetManager) {
        refund = this._budgetManager.refundCell(x, y, z);
        totalRefunded += refund;
      }

      previousRecords.push({
        x, y, z,
        previousState: curState,
        previousColor: curColor,
        wasSessionRepair: isSession,
        refundedAmount: refund
      });

      this._grid.setState(x, y, z, CellState.MISSING);
      changed = true;
    }

    if (changed) {
      this._undoStack.push({
        type: 'erase',
        cells: previousRecords,
        totalRefunded
      });
      this._redoStack.length = 0;

      emit('cellRepaired');
      emit('gridDirty');
      emit('buildErased', { refunded: totalRefunded });
    }

    return changed;
  }

  // ---------------------------------------------------------------------------
  // Undo / Redo
  // ---------------------------------------------------------------------------

  undo() {
    if (this._undoStack.length === 0) return false;

    const action = this._undoStack.pop();

    if (action.type === 'place') {
      // Revert placed cells to their previous state and color
      for (const rec of action.cells) {
        this._grid.setState(rec.x, rec.y, rec.z, rec.previousState);
        this._grid.setColor(rec.x, rec.y, rec.z, rec.previousColor);
        if (this._budgetManager) {
          this._budgetManager.refundCell(rec.x, rec.y, rec.z);
        }
      }
      this._redoStack.push(action);
    } else if (action.type === 'erase') {
      // Restore erased cells
      for (const rec of action.cells) {
        this._grid.setState(rec.x, rec.y, rec.z, rec.previousState);
        this._grid.setColor(rec.x, rec.y, rec.z, rec.previousColor);
        // If it was a session repair that was refunded, re-deduct
        if (rec.refundedAmount > 0 && this._budgetManager) {
          this._budgetManager.spend(rec.refundedAmount, [{ x: rec.x, y: rec.y, z: rec.z }]);
        }
      }
      this._redoStack.push(action);
    }

    emit('cellRepaired');
    emit('gridDirty');
    emit('buildUndone');
    this._retriggerPreview();
    return true;
  }

  redo() {
    if (this._redoStack.length === 0) return false;

    const action = this._redoStack.pop();

    if (action.type === 'place') {
      // Re-place cells
      if (this._budgetManager) {
        this._budgetManager.spend(action.cost, action.cells, action.materialId);
      }
      const mat = getMaterial(action.materialId);
      for (const rec of action.cells) {
        this._grid.setState(rec.x, rec.y, rec.z, CellState.REPAIRED);
        this._grid.setColor(rec.x, rec.y, rec.z, mat.color);
      }
      this._undoStack.push(action);
    } else if (action.type === 'erase') {
      // Re-erase cells
      for (const rec of action.cells) {
        if (this._budgetManager) {
          this._budgetManager.refundCell(rec.x, rec.y, rec.z);
        }
        this._grid.setState(rec.x, rec.y, rec.z, CellState.MISSING);
      }
      this._undoStack.push(action);
    }

    emit('cellRepaired');
    emit('gridDirty');
    emit('buildRedone');
    this._retriggerPreview();
    return true;
  }
}

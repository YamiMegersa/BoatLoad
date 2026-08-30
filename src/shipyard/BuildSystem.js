import * as THREE from 'three';
import { emit, on, off } from '../core/EventBus.js';
import { CellState } from './VoxelGrid.js';
import { BLUEPRINTS } from '../ui/BuildMenu.js';

export class BuildSystem {
  constructor() {
    this._grid = null;
    this._scene = null;
    this._activeBlueprint = null;
    this._rotation = 0; // 0, 1, 2, 3 (multiples of 90 degrees around Y axis)
    
    // Ghost mesh representation
    this._ghostMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.5,
        depthTest: false,
        wireframe: true
      })
    );
    this._ghostMesh.visible = false;
    this._ghostBox = new THREE.BoxHelper(this._ghostMesh, 0x00ff00);
    this._ghostBox.material.depthTest = false;
    this._ghostBox.visible = false;
    
    // Keep track of current hovered placement
    this._currentPlacement = null;

    this._onBlueprintSelected = (e) => {
      this._activeBlueprint = BLUEPRINTS[e.blueprintId];
      this._updateGhostMesh();
    };

    this._onRotate = () => {
      this._rotation = (this._rotation + 1) % 4;
      this._updateGhostMesh();
      // If we are currently hovering, update the placement immediately
      if (this._currentPlacement) {
        this.updatePreview(
          this._currentPlacement.cellX, 
          this._currentPlacement.cellY, 
          this._currentPlacement.cellZ, 
          this._currentPlacement.normal
        );
      }
    };
  }

  init(grid, scene) {
    this._grid = grid;
    this._scene = scene;
    
    // Add ghost preview to scene
    this._scene.add(this._ghostMesh);
    this._scene.add(this._ghostBox);

    on('blueprintSelected', this._onBlueprintSelected);
    on('rotateBlueprint', this._onRotate);
  }

  reset() {
    off('blueprintSelected', this._onBlueprintSelected);
    off('rotateBlueprint', this._onRotate);
    
    if (this._scene) {
      this._scene.remove(this._ghostMesh);
      this._scene.remove(this._ghostBox);
    }
    
    this._grid = null;
    this._scene = null;
  }

  _updateGhostMesh() {
    if (!this._activeBlueprint) return;
    
    const [sx, sy, sz] = this._getRotatedSize();
    this._ghostMesh.geometry.dispose();
    this._ghostMesh.geometry = new THREE.BoxGeometry(sx, sy, sz);
    this._ghostMesh.material.color.setHex(this._activeBlueprint.color);
    
    this._ghostBox.update();
  }

  _getRotatedSize() {
    const bp = this._activeBlueprint;
    if (!bp) return [1, 1, 1];
    
    // Rotation is around Y axis
    if (this._rotation % 2 === 1) {
      return [bp.size[2], bp.size[1], bp.size[0]];
    }
    return bp.size;
  }

  /**
   * Called every frame to update the preview ghost mesh
   */
  updatePreview(cellX, cellY, cellZ, normal) {
    if (!this._activeBlueprint || !this._grid) {
      this._ghostMesh.visible = false;
      this._ghostBox.visible = false;
      this._currentPlacement = null;
      return;
    }

    // Default snap point if not hovering a specific face
    let targetX = cellX;
    let targetY = cellY;
    let targetZ = cellZ;

    if (normal) {
      // Snap to the adjacent cell based on the normal
      targetX += normal.x;
      targetY += normal.y;
      targetZ += normal.z;
    }

    this._currentPlacement = { cellX, cellY, cellZ, normal };

    // We align the bottom-center of the object to the target cell
    const [sx, sy, sz] = this._getRotatedSize();
    
    // Offset is half the size minus 0.5 (since cell center is +0.5 from min edge)
    // Actually, size is in voxels (e.g. 1, 3, 3). 
    // If size is 3, offset is 1. If 1, offset is 0.
    const offsetX = (sx - 1) / 2;
    const offsetY = (sy - 1) / 2;
    const offsetZ = (sz - 1) / 2;

    const finalX = targetX + offsetX;
    const finalY = targetY + offsetY;
    const finalZ = targetZ + offsetZ;

    const worldPos = this._grid.toWorldPos(finalX, finalY, finalZ);
    this._ghostMesh.position.copy(worldPos);
    this._ghostMesh.visible = true;
    
    this._ghostBox.update();
    this._ghostBox.visible = true;
  }

  clearPreview() {
    this._ghostMesh.visible = false;
    this._ghostBox.visible = false;
    this._currentPlacement = null;
  }

  /**
   * Called on click to actually place the object
   */
  placeObject(cellX, cellY, cellZ, normal) {
    if (!this._activeBlueprint || !this._grid) return;

    let targetX = cellX;
    let targetY = cellY;
    let targetZ = cellZ;

    if (normal) {
      targetX += normal.x;
      targetY += normal.y;
      targetZ += normal.z;
    }

    const [sx, sy, sz] = this._getRotatedSize();
    
    // Place block starting from the target cell
    // The ghost mesh is offset by (sx - 1)/2 and has size sx, meaning its lowest cell is always exactly target.
    const minX = targetX;
    const minY = targetY;
    const minZ = targetZ;

    let changed = false;

    for (let x = 0; x < sx; x++) {
      for (let y = 0; y < sy; y++) {
        for (let z = 0; z < sz; z++) {
          const cx = minX + x;
          const cy = minY + y;
          const cz = minZ + z;

          if (this._grid.inBounds(cx, cy, cz)) {
            // Overwrite existing or fill empty
            this._grid.setState(cx, cy, cz, CellState.INTACT);
            this._grid.setColor(cx, cy, cz, this._activeBlueprint.color);
            changed = true;
          }
        }
      }
    }

    if (changed) {
      emit('gridDirty');
    }
  }
}

import * as THREE from 'three';
import { StudioFlyControls } from '../core/StudioFlyControls.js';
import { ShipBuilder } from '../shipyard/ShipBuilder.js';
import { ChunkRenderer } from '../shipyard/ChunkRenderer.js';
import { ShipRaycaster } from '../shipyard/ShipRaycaster.js';
import { VoxelGrid, CellState, WATERLINE_Y } from '../shipyard/VoxelGrid.js';
import { emit, on, off } from '../core/EventBus.js';
import { ShipRegistry, getShipProfile, DEFAULT_SHIP_ID } from '../config/ShipRegistry.js';
import { LevelConfig } from '../core/LevelConfig.js';

export const DamageBrushType = Object.freeze({
  SINGLE: 'single',
  CANNONBALL: 'cannonball',
  COLLISION: 'collision',
  SHRAPNEL: 'shrapnel',
  WATERLINE: 'waterline',
  PATCH: 'patch'
});

export const BrushSize = Object.freeze({
  SMALL: 'small',
  MEDIUM: 'medium',
  LARGE: 'large'
});

/**
 * BoatDestructionWorkshop — 3D interactive vessel destruction studio.
 *
 * Allows level designers to carve damage, holes, and breaches onto any ship in 3D
 * using functional damage brushes (single voxel, cannonball craters, collision gouges,
 * shrapnel splinters, and waterline breaches).
 */
export class BoatDestructionWorkshop {
  constructor() {
    this._scene = null;
    this._camera = null;
    this._renderer = null;
    this._flyControls = null;

    this._workshopGroup = new THREE.Group();
    this._workshopGroup.name = 'BoatDestructionWorkshopGroup';

    this._grid = null;
    this._chunkRenderer = null;
    this._raycaster = null;

    this._shipId = DEFAULT_SHIP_ID;
    this._shipDef = null;
    this._zones = null;
    this._levelCfg = null;

    this._activeBrush = DamageBrushType.CANNONBALL;
    this._brushSize = BrushSize.MEDIUM;
    this._mirrorMode = false;
    this._rotation = 0; // 0, 1, 2, 3 (multiples of 90 degrees around Y)
    this._pitch = 0;    // 0 = horizontal, 1 = upright/vertical (swaps Y and Z)

    // Baseline stats
    this._pristineHullCount = 0;

    // Undo / Redo history
    this._undoStack = [];
    this._redoStack = [];

    // Raycast & Hover preview
    this._mouseNDC = new THREE.Vector2();
    this._hoveredCell = null;
    this._hoveredNormal = null;
    this._ghostGroup = new THREE.Group();
    this._ghostGroup.name = 'DestructionGhostGroup';
    this._workshopGroup.add(this._ghostGroup);

    // Bound listeners
    this._boundPointerMove = this._onPointerMove.bind(this);
    this._boundPointerDown = this._onPointerDown.bind(this);
    this._boundPointerUp   = this._onPointerUp.bind(this);
    this._boundKeyDown     = this._onKeyDown.bind(this);
    this._pointerDownPos   = null;

    this._isOpen = false;
    this._showOutlines = false;
    this._mooredPos = null;
  }

  get isOpen() {
    return this._isOpen;
  }

  toggleOutlines(enabled = null) {
    this._showOutlines = enabled !== null ? Boolean(enabled) : !this._showOutlines;
    if (this._chunkRenderer) {
      this._chunkRenderer.setShowMissingOutlines(this._showOutlines, false);
    }
    emit('workshopOutlinesChanged', { enabled: this._showOutlines });
    return this._showOutlines;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Initialize and enter the destruction workshop.
   *
   * @param {object} params
   * @param {THREE.Scene} params.scene
   * @param {THREE.Camera} params.camera
   * @param {THREE.WebGLRenderer} params.renderer
   * @param {string} params.shipId
   * @param {Array} [params.initialDamage]
   * @param {object} [params.levelCfg]
   */
  async open({ scene, camera, renderer, shipId, initialDamage = null, levelCfg = {} }) {
    this._scene = scene;
    this._camera = camera;
    this._renderer = renderer;
    this._shipId = shipId || DEFAULT_SHIP_ID;
    this._levelCfg = levelCfg || {};
    this._isOpen = true;

    // Reset stacks
    this._undoStack = [];
    this._redoStack = [];

    // Add workshop container to scene
    if (this._workshopGroup.parent !== this._scene) {
      this._scene.add(this._workshopGroup);
    }
    this._workshopGroup.visible = true;

    // Setup Studio Lights
    if (!this._studioLightGroup) {
      this._studioLightGroup = new THREE.Group();
      const keyLight = new THREE.DirectionalLight(0xfff8f0, 1.2);
      keyLight.position.set(30, 40, 30);
      const fillLight = new THREE.DirectionalLight(0x88bbff, 0.7);
      fillLight.position.set(-30, 20, -30);
      const underLight = new THREE.DirectionalLight(0x446688, 0.4);
      underLight.position.set(0, -20, 0);
      const ambLight = new THREE.AmbientLight(0xffffff, 0.6);
      this._studioLightGroup.add(keyLight, fillLight, underLight, ambLight);
      this._workshopGroup.add(this._studioLightGroup);
    }

    // Setup StudioFlyControls (WASD flight + right-drag freelook, matching repair phase)
    if (window.gameState?._orbitControls) {
      window.gameState._orbitControls.enabled = false;
    }
    this._setupControls();

    // Build the ship grid & renderer
    await this._loadShip(this._shipId, initialDamage);

    // Attach interaction events
    const dom = this._renderer.domElement;
    dom.addEventListener('pointermove', this._boundPointerMove);
    dom.addEventListener('pointerdown', this._boundPointerDown);
    dom.addEventListener('pointerup', this._boundPointerUp);
    window.addEventListener('keydown', this._boundKeyDown);

    // Initial stats emit
    this.emitStats();
  }

  /**
   * Close the workshop and free temporary resources.
   * Returns the serialized damage array.
   *
   * @returns {Array} Serialized damage entries
   */
  close() {
    this._isOpen = false;

    const damageData = this.serializeDamage();

    const dom = this._renderer?.domElement;
    if (dom) {
      dom.removeEventListener('pointermove', this._boundPointerMove);
      dom.removeEventListener('pointerdown', this._boundPointerDown);
      dom.removeEventListener('pointerup', this._boundPointerUp);
    }
    window.removeEventListener('keydown', this._boundKeyDown);

    if (this._flyControls) {
      this._flyControls.dispose();
      this._flyControls = null;
    }

    if (this._raycaster) {
      this._raycaster.dispose(this._workshopGroup);
      this._raycaster = null;
    }

    if (this._chunkRenderer) {
      this._chunkRenderer.dispose(this._workshopGroup);
      this._chunkRenderer = null;
    }

    this._clearGhostMesh();

    if (this._workshopGroup.parent) {
      this._workshopGroup.parent.remove(this._workshopGroup);
    }

    return damageData;
  }

  // ---------------------------------------------------------------------------
  // Ship Loading & Grid Management
  // ---------------------------------------------------------------------------

  async _loadShip(shipId, damageEntries = null) {
    this._shipId = shipId;
    this._shipDef = LevelConfig.getShipDef(shipId);

    // Clean up existing renderer & raycaster if switching ships
    if (this._chunkRenderer) {
      this._chunkRenderer.dispose(this._workshopGroup);
      this._chunkRenderer = null;
    }
    if (this._raycaster) {
      this._raycaster.dispose(this._workshopGroup);
      this._raycaster = null;
    }

    // 1. Build pristine ship to count baseline hull voxels
    const pristineResult = await ShipBuilder.build(this._shipDef, null);
    let pristineCount = 0;
    pristineResult.grid.forEach((_x, _y, _z, state) => {
      if (state === CellState.INTACT || state === CellState.DAMAGED || state === CellState.REPAIRED) {
        pristineCount++;
      }
    });
    this._pristineHullCount = Math.max(1, pristineCount);

    // 2. Build working ship with damage applied if available
    const effectiveDamage = damageEntries || this._levelCfg?.damage || null;
    const { grid, zones, gltfScene } = await ShipBuilder.build(this._shipDef, { damage: effectiveDamage });
    this._grid = grid;
    this._zones = zones;

    // 3. Initialize chunk renderer positioned at West dock berth, utilizing authentic voxel mesh from gltfScene
    this._chunkRenderer = new ChunkRenderer();
    this._chunkRenderer.init(grid, this._workshopGroup, gltfScene, { showMissingOutlines: this._showOutlines, filterMissingByLevelDamage: false });

    const profile = getShipProfile(this._shipId) || {};
    const s = this._shipDef.scale || profile.scale || 0.12;
    const gx = grid.width;
    const gy = grid.height;
    const gz = grid.depth;
    const halfBeam = (gx * 0.5) * s;
    const draft = (this._shipDef.waterlineY || profile.waterlineY || 4) * s;

    // West Shipyard Outfitting Dock berth mapping from fixing scene (_enterShipyard in GameState.js)
    // Compute dynamic moored position for this vessel so waterline is exactly at Y = 0.0 and never submerged
    const pierX = -50.9;
    const pierZ = 10.5;
    const margin = Math.max(0.6, 0.1 * halfBeam);
    const mooredPos = new THREE.Vector3(pierX - halfBeam - margin, -draft, pierZ);

    this._mooredPos = mooredPos;

    // Center boat at mooredPos in world coordinates
    const containerPos = new THREE.Vector3(
      mooredPos.x - gx * 0.5 * s,
      mooredPos.y,
      mooredPos.z - gz * 0.5 * s
    );

    this._chunkRenderer.container.position.copy(containerPos);
    this._chunkRenderer.container.rotation.set(0, 0, 0);
    this._chunkRenderer.container.scale.set(s, s, s);
    this._chunkRenderer.updateTransform();

    // Position studio lights directly adjacent to boat at dock
    if (this._studioLightGroup) {
      this._studioLightGroup.position.copy(mooredPos);
    }

    // 4. Initialize BVH Raycaster attached to chunk container
    this._raycaster = new ShipRaycaster();
    this._raycaster.build(this._grid, this._workshopGroup, this._chunkRenderer.container);

    // 5. Position camera & controls matching fixing scene
    this._positionCameraAroundShip(gx, gy, gz, s, mooredPos);
  }

  _setupControls() {
    this._flyControls = new StudioFlyControls(this._camera, this._renderer.domElement, {
      moveSpeed: 10.0,
      lookSpeed: 0.003
    });
  }

  _positionCameraAroundShip(gx, gy, gz, s, mooredPos) {
    if (!this._camera || !this._flyControls) return;

    // Calculate boat center in world coordinates matching fixing scene
    const targetMoored = mooredPos || this._mooredPos || new THREE.Vector3(0, 0, 0);
    const shipWorldCenter = new THREE.Vector3(
      targetMoored.x,
      targetMoored.y + gy * 0.5 * s,
      targetMoored.z
    );

    const scaleFactor = Math.max(1, s / 0.12);
    this._camera.position.set(
      shipWorldCenter.x + 4.2 * scaleFactor,
      shipWorldCenter.y + 2.4 * scaleFactor,
      shipWorldCenter.z + 4.2 * scaleFactor
    );
    this._flyControls.lookAt(shipWorldCenter);
  }

  update(delta) {
    if (this._flyControls) {
      this._flyControls.update(delta);
    }
  }

  // ---------------------------------------------------------------------------
  // Brush Calculations & Presets
  // ---------------------------------------------------------------------------

  setBrush(brushType) {
    if (Object.values(DamageBrushType).includes(brushType)) {
      this._activeBrush = brushType;
      this._updateHoverPreview();
      emit('workshopBrushChanged', { brush: this._activeBrush });
    }
  }

  setBrushSize(size) {
    if (Object.values(BrushSize).includes(size)) {
      this._brushSize = size;
      this._updateHoverPreview();
      emit('workshopBrushSizeChanged', { size: this._brushSize });
    }
  }

  toggleMirror(enabled = null) {
    this._mirrorMode = enabled !== null ? Boolean(enabled) : !this._mirrorMode;
    this._updateHoverPreview();
    emit('workshopMirrorChanged', { enabled: this._mirrorMode });
  }

  rotate() {
    this._rotation = (this._rotation + 1) % 4;
    this._updateHoverPreview();
    emit('workshopRotationChanged', { rotation: this._rotation });
  }

  togglePitch() {
    this._pitch = (this._pitch + 1) % 2;
    this._updateHoverPreview();
    emit('workshopPitchChanged', { pitch: this._pitch });
  }

  /**
   * Compute affected cells for the given brush and seed coordinate.
   *
   * @param {number} cx Seed X
   * @param {number} cy Seed Y
   * @param {number} cz Seed Z
   * @param {THREE.Vector3|null} normal Surface normal
   * @returns {Array<{ x: number, y: number, z: number }>}
   */
  _computeBrushCells(cx, cy, cz, normal = null) {
    if (!this._grid) return [];

    const cells = [];
    const seen = new Set();
    const addCell = (x, y, z) => {
      if (!this._grid.inBounds(x, y, z)) return;
      const key = `${x},${y},${z}`;
      if (!seen.has(key)) {
        seen.add(key);
        cells.push({ x, y, z });
      }
      if (this._mirrorMode) {
        const mz = (this._grid.depth - 1) - z;
        if (this._grid.inBounds(x, y, mz)) {
          const mKey = `${x},${y},${mz}`;
          if (!seen.has(mKey)) {
            seen.add(mKey);
            cells.push({ x, y, z: mz });
          }
        }
      }
    };

    switch (this._activeBrush) {
      case DamageBrushType.SINGLE: {
        addCell(cx, cy, cz);
        break;
      }

      case DamageBrushType.CANNONBALL: {
        const radiusMap = {
          [BrushSize.SMALL]: 1.5,
          [BrushSize.MEDIUM]: 2.3,
          [BrushSize.LARGE]: 3.3
        };
        const r = radiusMap[this._brushSize] || 2.3;
        const rSq = r * r;
        const minX = Math.max(0, Math.floor(cx - r));
        const maxX = Math.min(this._grid.width - 1, Math.ceil(cx + r));
        const minY = Math.max(0, Math.floor(cy - r));
        const maxY = Math.min(this._grid.height - 1, Math.ceil(cy + r));
        const minZ = Math.max(0, Math.floor(cz - r));
        const maxZ = Math.min(this._grid.depth - 1, Math.ceil(cz + r));

        for (let x = minX; x <= maxX; x++) {
          for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
              const dx = x - cx;
              const dy = y - cy;
              const dz = z - cz;
              if (dx * dx + dy * dy + dz * dz <= rSq) {
                addCell(x, y, z);
              }
            }
          }
        }
        break;
      }

      case DamageBrushType.COLLISION: {
        // Linear gouge/scrape along hull with full rotation (R) and upright pitch (T) support
        const lengthMap = {
          [BrushSize.SMALL]: 3,
          [BrushSize.MEDIUM]: 5,
          [BrushSize.LARGE]: 8
        };
        const halfLen = Math.floor(lengthMap[this._brushSize] / 2);
        const radius = 1.3;
        const rSq = radius * radius;

        for (let l = -halfLen; l <= halfLen; l++) {
          for (let u = -1; u <= 1; u++) {
            for (let v = -1; v <= 1; v++) {
              if (u * u + v * v <= rSq) {
                let dx = u;
                let dy = v;
                let dz = l;

                // Pitch flip (T key): swap Y and Z for vertical gashes
                if (this._pitch === 1) {
                  const tmp = dy;
                  dy = dz;
                  dz = tmp;
                }

                // Rotation around Y (R key): 90-degree increments
                if (this._rotation === 1) {
                  const tmp = dx;
                  dx = -dz;
                  dz = tmp;
                } else if (this._rotation === 2) {
                  dx = -dx;
                  dz = -dz;
                } else if (this._rotation === 3) {
                  const tmp = dx;
                  dx = dz;
                  dz = -tmp;
                }

                addCell(cx + dx, cy + dy, cz + dz);
              }
            }
          }
        }
        break;
      }

      case DamageBrushType.SHRAPNEL: {
        // Jagged blast crater with irregular splintered edges
        const coreR = this._brushSize === BrushSize.LARGE ? 2.2 : (this._brushSize === BrushSize.SMALL ? 1.2 : 1.7);
        const outerR = coreR + 1.2;
        const outerRSq = outerR * outerR;
        const coreRSq = coreR * coreR;

        const minX = Math.max(0, Math.floor(cx - outerR));
        const maxX = Math.min(this._grid.width - 1, Math.ceil(cx + outerR));
        const minY = Math.max(0, Math.floor(cy - outerR));
        const maxY = Math.min(this._grid.height - 1, Math.ceil(cy + outerR));
        const minZ = Math.max(0, Math.floor(cz - outerR));
        const maxZ = Math.min(this._grid.depth - 1, Math.ceil(cz + outerR));

        for (let x = minX; x <= maxX; x++) {
          for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
              const dSq = (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2;
              if (dSq <= coreRSq) {
                addCell(x, y, z);
              } else if (dSq <= outerRSq) {
                // Pseudo-random deterministic hash based on coordinates to keep preview stable
                const hash = Math.sin(x * 12.9898 + y * 78.233 + z * 45.164) * 43758.5453;
                const frac = hash - Math.floor(hash);
                if (frac > 0.45) {
                  addCell(x, y, z);
                }
              }
            }
          }
        }
        break;
      }

      case DamageBrushType.WATERLINE: {
        // Breaches clamped right at the waterline (y <= WATERLINE_Y)
        const targetY = Math.min(cy, WATERLINE_Y);
        const r = this._brushSize === BrushSize.LARGE ? 2.5 : (this._brushSize === BrushSize.SMALL ? 1.2 : 1.8);
        const rSq = r * r;

        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          for (let y = Math.floor(targetY - r); y <= Math.ceil(targetY + r); y++) {
            for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
              if (y <= WATERLINE_Y + 1) { // ensure it breaches into the bilge
                const dSq = (x - cx) ** 2 + (y - targetY) ** 2 + (z - cz) ** 2;
                if (dSq <= rSq) {
                  addCell(x, y, z);
                }
              }
            }
          }
        }
        break;
      }

      case DamageBrushType.PATCH: {
        // Restores missing cells
        const r = this._brushSize === BrushSize.LARGE ? 2.5 : (this._brushSize === BrushSize.SMALL ? 1.0 : 1.8);
        const rSq = r * r;
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
            for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
              if ((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2 <= rSq) {
                addCell(x, y, z);
              }
            }
          }
        }
        break;
      }
    }

    // Filter according to operation:
    if (this._activeBrush === DamageBrushType.PATCH) {
      // Only patch cells that are actually damaged or missing
      return cells.filter(({ x, y, z }) => {
        const s = this._grid.getState(x, y, z);
        return s === CellState.MISSING || s === CellState.DAMAGED || s === CellState.FLOODED;
      });
    } else {
      // Destruction brushes only target non-empty cells
      return cells.filter(({ x, y, z }) => {
        const s = this._grid.getState(x, y, z);
        return s === CellState.INTACT || s === CellState.REPAIRED || s === CellState.DAMAGED || s === CellState.FLOODED;
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Holographic Ghost Preview
  // ---------------------------------------------------------------------------

  _clearGhostMesh() {
    while (this._ghostGroup.children.length > 0) {
      const c = this._ghostGroup.children[0];
      this._ghostGroup.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
        else c.material.dispose();
      }
    }
  }

  _updateHoverPreview() {
    this._clearGhostMesh();
    if (!this._hoveredCell || !this._grid || !this._chunkRenderer) return;

    const cells = this._computeBrushCells(
      this._hoveredCell.x,
      this._hoveredCell.y,
      this._hoveredCell.z,
      this._hoveredNormal
    );

    if (cells.length === 0) return;

    const isPatch = this._activeBrush === DamageBrushType.PATCH;
    const ghostColor = isPatch ? 0x22c55e : 0xef4444; // Green for patch, vivid red/crimson for destruction
    const wireColor = isPatch ? 0x86efac : 0xfca5a5;

    const boxGeo = new THREE.BoxGeometry(1.02, 1.02, 1.02);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);

    const fillMat = new THREE.MeshBasicMaterial({
      color: ghostColor,
      transparent: true,
      opacity: 0.5,
      depthTest: false,
      depthWrite: false
    });

    const lineMat = new THREE.LineBasicMaterial({
      color: wireColor,
      transparent: true,
      opacity: 0.9,
      depthTest: false
    });

    // Create an instanced or batched representation attached directly inside the chunk container
    // so it perfectly tracks the vessel's coordinate transform
    const ghostSubGroup = new THREE.Group();

    for (const cell of cells) {
      const mesh = new THREE.Mesh(boxGeo, fillMat);
      const wire = new THREE.LineSegments(edgesGeo, lineMat);
      const pos = this._grid.toWorldPos(cell.x, cell.y, cell.z);
      mesh.position.copy(pos);
      wire.position.copy(pos);
      ghostSubGroup.add(mesh);
      ghostSubGroup.add(wire);
    }

    // Attach to chunk container space
    ghostSubGroup.position.copy(this._chunkRenderer.container.position);
    ghostSubGroup.scale.copy(this._chunkRenderer.container.scale);
    ghostSubGroup.rotation.copy(this._chunkRenderer.container.rotation);

    this._ghostGroup.add(ghostSubGroup);
  }

  // ---------------------------------------------------------------------------
  // Destruction Execution & History
  // ---------------------------------------------------------------------------

  applyStroke() {
    if (!this._hoveredCell || !this._grid) return;

    const cells = this._computeBrushCells(
      this._hoveredCell.x,
      this._hoveredCell.y,
      this._hoveredCell.z,
      this._hoveredNormal
    );

    if (cells.length === 0) return;

    const targetState = this._activeBrush === DamageBrushType.PATCH ? CellState.INTACT : CellState.MISSING;
    const strokeChanges = [];

    for (const { x, y, z } of cells) {
      const prev = this._grid.getState(x, y, z);
      if (prev !== targetState) {
        strokeChanges.push({ x, y, z, prevState: prev, nextState: targetState });
        this._grid.setState(x, y, z, targetState);
      }
    }

    if (strokeChanges.length === 0) return;

    // Push onto undo stack and clear redo
    this._undoStack.push(strokeChanges);
    this._redoStack = [];

    // Sync mesh & rebuild raycaster
    this._chunkRenderer?.sync(this._grid);
    if (this._grid.consumeTopologyDirty()) {
      this._raycaster?.rebuild(this._grid);
    }

    // Refresh ghost preview and emit live stats
    this._updateHoverPreview();
    this.emitStats();

    emit('workshopStrokeApplied', {
      count: strokeChanges.length,
      brush: this._activeBrush
    });
  }

  undo() {
    if (this._undoStack.length === 0 || !this._grid) return;
    const stroke = this._undoStack.pop();

    for (const change of stroke) {
      this._grid.setState(change.x, change.y, change.z, change.prevState);
    }

    this._redoStack.push(stroke);

    this._chunkRenderer?.sync(this._grid);
    if (this._grid.consumeTopologyDirty()) {
      this._raycaster?.rebuild(this._grid);
    }

    this._updateHoverPreview();
    this.emitStats();
  }

  redo() {
    if (this._redoStack.length === 0 || !this._grid) return;
    const stroke = this._redoStack.pop();

    for (const change of stroke) {
      this._grid.setState(change.x, change.y, change.z, change.nextState);
    }

    this._undoStack.push(stroke);

    this._chunkRenderer?.sync(this._grid);
    if (this._grid.consumeTopologyDirty()) {
      this._raycaster?.rebuild(this._grid);
    }

    this._updateHoverPreview();
    this.emitStats();
  }

  resetPristine() {
    if (!this._grid) return;

    const changes = [];
    this._grid.forEach((x, y, z, state) => {
      if (state === CellState.MISSING || state === CellState.DAMAGED || state === CellState.FLOODED) {
        changes.push({ x, y, z, prevState: state, nextState: CellState.INTACT });
        this._grid.setState(x, y, z, CellState.INTACT);
      }
    });

    if (changes.length > 0) {
      this._undoStack.push(changes);
      this._redoStack = [];
      this._chunkRenderer?.sync(this._grid);
      this._raycaster?.rebuild(this._grid);
      this._updateHoverPreview();
      this.emitStats();
    }
  }

  // ---------------------------------------------------------------------------
  // Statistics & Calculation
  // ---------------------------------------------------------------------------

  getStats() {
    if (!this._grid) {
      return {
        integrityPct: 100,
        intact: 0,
        missing: 0,
        leaks: 0,
        repairCost: 0,
        levelBudget: this._levelCfg?.budget ?? 300,
        shipName: 'Vessel',
        shipIcon: '<span class="pixel-icon icon-sloop size-20"></span>'
      };
    }

    let intact = 0;
    let missing = 0;
    let leaks = 0;

    this._grid.forEach((_x, y, _z, state) => {
      if (state === CellState.INTACT || state === CellState.REPAIRED) {
        intact++;
      } else if (state === CellState.MISSING || state === CellState.DAMAGED || state === CellState.FLOODED) {
        missing++;
        if (y <= WATERLINE_Y) {
          leaks++;
        }
      }
    });

    const total = this._pristineHullCount || Math.max(1, intact + missing);
    const integrityPct = Math.max(0, Math.min(100, Math.round((intact / total) * 100)));
    const oakUnitCost = 5; // standard Oak Plank unit cost from MaterialRegistry
    const repairCost = missing * oakUnitCost;
    const levelBudget = this._levelCfg?.budget !== undefined ? this._levelCfg.budget : 300;
    const profile = getShipProfile(this._shipId) || {};

    return {
      integrityPct,
      intact,
      missing,
      leaks,
      repairCost,
      levelBudget,
      shipId: this._shipId,
      shipName: profile.name || this._shipDef?.name || 'Vessel',
      shipIcon: profile.icon || '<span class="pixel-icon icon-sloop size-20"></span>'
    };
  }

  emitStats() {
    const stats = this.getStats();
    emit('workshopStatsUpdated', stats);
  }

  // ---------------------------------------------------------------------------
  // Serialization & Level Import
  // ---------------------------------------------------------------------------

  /**
   * Serialize damaged cells into standard level config format:
   * [ { zone: 'hull', state: 'MISSING', cells: [[x, y, z], ...] }, ... ]
   */
  serializeDamage() {
    if (!this._grid || !this._zones) return [];

    const damagedByZone = new Map();

    this._grid.forEach((x, y, z, state) => {
      if (state === CellState.MISSING || state === CellState.DAMAGED) {
        const zone = ShipBuilder.zoneOf({ x, y, z }, this._zones) || 'hull';
        if (!damagedByZone.has(zone)) {
          damagedByZone.set(zone, []);
        }
        damagedByZone.get(zone).push([x, y, z]);
      }
    });

    const entries = [];
    for (const [zone, cells] of damagedByZone.entries()) {
      entries.push({
        zone,
        state: 'MISSING',
        cells
      });
    }

    return entries;
  }

  /**
   * Import boat and damage from an external parsed level configuration.
   *
   * @param {object} levelJson
   * @returns {Promise<{ success: boolean, shipId: string, breachesCount: number }>}
   */
  async importBoatFromLevel(levelJson) {
    if (!levelJson) return { success: false, reason: 'Invalid JSON' };

    const targetShipId = levelJson.ship || this._shipId || DEFAULT_SHIP_ID;
    const damageEntries = levelJson.damage || [];

    // Reload with imported ship and damage
    await this._loadShip(targetShipId, damageEntries);

    this._undoStack = [];
    this._redoStack = [];

    this._updateHoverPreview();
    this.emitStats();

    const stats = this.getStats();
    return {
      success: true,
      shipId: targetShipId,
      breachesCount: stats.missing,
      shipName: stats.shipName
    };
  }

  // ---------------------------------------------------------------------------
  // Pointer & Keyboard Event Handlers
  // ---------------------------------------------------------------------------

  _onPointerMove(event) {
    if (!this._isOpen || !this._raycaster || !this._camera) return;

    const rect = this._renderer.domElement.getBoundingClientRect();
    this._mouseNDC.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const hit = this._raycaster.cast(this._mouseNDC, this._camera);
    if (hit) {
      this._hoveredCell = hit.cell;
      this._hoveredNormal = hit.normal;
    } else {
      this._hoveredCell = null;
      this._hoveredNormal = null;
    }

    this._updateHoverPreview();
  }

  _onPointerDown(event) {
    if (!this._isOpen) return;
    if (event.button === 0) {
      this._pointerDownPos = { x: event.clientX, y: event.clientY };
    }
  }

  _onPointerUp(event) {
    if (!this._isOpen) return;
    if (event.button !== 0) return;
    if (!this._pointerDownPos) return;

    const dx = event.clientX - this._pointerDownPos.x;
    const dy = event.clientY - this._pointerDownPos.y;
    this._pointerDownPos = null;

    // Distinguish quick click (< 5px) from camera drag/pan (>= 5px)
    if (Math.hypot(dx, dy) >= 5) return;

    if (this._hoveredCell) {
      this.applyStroke();
    }
  }

  _onKeyDown(e) {
    if (!this._isOpen) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

    if (e.code === 'KeyR') {
      e.preventDefault();
      this.rotate();
    } else if (e.code === 'KeyT') {
      e.preventDefault();
      this.togglePitch();
    } else if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      this.toggleMirror();
    } else if (e.code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
    } else if (e.code === 'KeyY') {
      e.preventDefault();
      this.redo();
    } else if (e.code === 'Digit1') {
      this.setBrush(DamageBrushType.SINGLE);
    } else if (e.code === 'Digit2') {
      this.setBrush(DamageBrushType.CANNONBALL);
    } else if (e.code === 'Digit3') {
      this.setBrush(DamageBrushType.COLLISION);
    } else if (e.code === 'Digit4') {
      this.setBrush(DamageBrushType.SHRAPNEL);
    } else if (e.code === 'Digit5') {
      this.setBrush(DamageBrushType.WATERLINE);
    } else if (e.code === 'Digit6') {
      this.setBrush(DamageBrushType.PATCH);
    }
  }
}

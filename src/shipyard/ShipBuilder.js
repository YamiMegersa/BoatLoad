import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VoxelGrid, CellState } from './VoxelGrid.js';
import { emit } from '../core/EventBus.js';

/**
 * Pristine voxelised ships, keyed by ship id: shipId -> VoxelGrid.snapshot()
 * taken BEFORE authored damage is applied. Later builds restore from the cache
 * instead of re-fetching, re-parsing and re-voxelising the GLB.
 */
const _pristineCache = new Map();

/**
 * ShipBuilder — instantiates a VoxelGrid from a ship definition JSON,
 * loads the GLB visual representation, and applies damage.
 *
 * Usage:
 *   const { grid, zones, def } = await ShipBuilder.build(shipDef, levelConfig);
 */
export class ShipBuilder {
  /**
   * Build a fully-initialised VoxelGrid for a given ship and level.
   *
   * @param {object} shipDef   Parsed ship definition JSON (e.g. sloop.json)
   * @param {object} levelCfg  Parsed level config JSON (e.g. day1.json) — may be null for a pristine ship
   * @returns {Promise<{ grid: VoxelGrid, zones: object, def: object }>}
   */
  static async build(shipDef, levelCfg = null) {
    const { x: W, y: H, z: D } = shipDef.grid;
    const grid = new VoxelGrid(W, H, D);

    const cached = _pristineCache.get(shipDef.id);
    if (cached) {
      // Fast path: restore the cached pristine voxelisation — no fetch, no
      // parse, no re-voxelise. This also removes the post-sink GLB failure
      // class that used to leave a blocky zone-fill "ship" behind.
      grid.restore(cached);
    } else {
      let gltf;
      try {
        gltf = await ShipBuilder._loadGLB(shipDef.id);
      } catch (e) {
        // Last-resort only: loud, visible blocky fallback. Never silent.
        console.error(`[ShipBuilder] ${shipDef.id}.glb unavailable after retry — using blocky zone fallback`, e);
        emit('buildError', {
          shipId: shipDef.id,
          message: `Could not load ${shipDef.id}.glb — showing a blocky placeholder.`,
        });
        // Fallback: fill all cells that fall inside any zone as INTACT.
        for (const [, zoneDefs] of Object.entries(shipDef.zones)) {
          for (const region of zoneDefs) {
            ShipBuilder._fillRegion(grid, region, CellState.INTACT);
          }
        }
        this._applyDamage(grid, levelCfg);
        grid.dirtySet.clear();
        grid.topologyDirty = false;
        return { grid, zones: shipDef.zones, def: shipDef };
      }

      ShipBuilder._voxelise(gltf, grid, W, H, D);
      // Cache the pristine ship BEFORE any authored damage is applied.
      _pristineCache.set(shipDef.id, grid.snapshot());
    }

    // Apply the level's authored damage on top of the pristine ship
    this._applyDamage(grid, levelCfg);

    // Reset tracking flags for the initial render pass
    grid.dirtySet.clear();
    grid.topologyDirty = false;

    return { grid, zones: shipDef.zones, def: shipDef };
  }

  /**
   * Voxelize a loaded GLB into the grid: scale it to the grid bounds, then
   * mark a cell INTACT for every triangle centroid landing inside it, sampling
   * the material/texture colour for the cell.
   */
  static _voxelise(gltf, grid, W, H, D) {
    // Get initial bounding box to determine scale factors
    const initialBox = new THREE.Box3().setFromObject(gltf.scene);
    const size = new THREE.Vector3();
    initialBox.getSize(size);
    
    // Scale the GLTF scene to precisely fit the VoxelGrid bounds
    const scaleX = (W * 1.0) / size.x; // CELL_SIZE = 1.0
    const scaleY = (H * 1.0) / size.y;
    const scaleZ = (D * 1.0) / size.z;
    gltf.scene.scale.set(scaleX, scaleY, scaleZ);
    gltf.scene.updateMatrixWorld(true);

    // Align the scaled GLB's bounding box to (0, 0, 0) to ensure it fits perfectly into the VoxelGrid space
    const box = new THREE.Box3().setFromObject(gltf.scene);
    gltf.scene.position.sub(box.min);
    gltf.scene.updateMatrixWorld(true);

    const voxelSet = new Set();
    const position = new THREE.Vector3();

    gltf.scene.traverse((child) => {
      if (child.isLight || child.isCamera) {
        child.visible = false; // Disable imported Blender lights/cameras
        return;
      }
      
      if (child.isMesh && child.geometry) {
        const geom = child.geometry;
        const posAttr = geom.attributes.position;
        const uvAttr = geom.attributes.uv;
        const indexAttr = geom.index;
        if (!posAttr) return;

        // Set up texture canvas if material has a map
        let textureCtx = null;
        let imgWidth = 1;
        let imgHeight = 1;
        if (child.material && child.material.map && child.material.map.image) {
          const img = child.material.map.image;
          imgWidth = img.width || img.videoWidth;
          imgHeight = img.height || img.videoHeight;
          if (imgWidth && imgHeight) {
            const canvas = document.createElement('canvas');
            canvas.width = imgWidth;
            canvas.height = imgHeight;
            textureCtx = canvas.getContext('2d', { willReadFrequently: true });
            textureCtx.drawImage(img, 0, 0, imgWidth, imgHeight);
          }
        }
        const fallbackColor = child.material?.color ? child.material.color.getHex() : 0xffffff;

        const numTriangles = indexAttr ? indexAttr.count / 3 : posAttr.count / 3;
        const vA = new THREE.Vector3();
        const vB = new THREE.Vector3();
        const vC = new THREE.Vector3();
        const centroid = new THREE.Vector3();

        for (let i = 0; i < numTriangles; i++) {
          let iA, iB, iC;
          if (indexAttr) {
            iA = indexAttr.getX(i * 3);
            iB = indexAttr.getX(i * 3 + 1);
            iC = indexAttr.getX(i * 3 + 2);
          } else {
            iA = i * 3;
            iB = i * 3 + 1;
            iC = i * 3 + 2;
          }

          vA.fromBufferAttribute(posAttr, iA);
          vB.fromBufferAttribute(posAttr, iB);
          vC.fromBufferAttribute(posAttr, iC);

          // Calculate face centroid
          centroid.copy(vA).add(vB).add(vC).divideScalar(3);
          centroid.applyMatrix4(child.matrixWorld);

          const cell = grid.fromWorldPos(centroid);
          if (cell) {
            const idx = grid.index(cell.x, cell.y, cell.z);
            if (!voxelSet.has(idx)) {
              voxelSet.add(idx);
              grid.data[idx] = CellState.INTACT;

              // Sample color
              let hexColor = fallbackColor;
              if (textureCtx && uvAttr) {
                const u = uvAttr.getX(iA);
                const v = uvAttr.getY(iA); // In Three.js, V is usually 0 at bottom, 1 at top. But canvas is 0 at top.
                // Depending on the loader, the texture might be flipped. GLTFLoader typically sets flipY = false.
                // Let's assume standard GLTF UV mapping (v=0 is top left of image for GLTF, wait no, GLTF defines (0,0) as top-left!)
                const px = Math.floor(Math.max(0, Math.min(1, u)) * (imgWidth - 1));
                const py = Math.floor(Math.max(0, Math.min(1, v)) * (imgHeight - 1));
                
                const pixel = textureCtx.getImageData(px, py, 1, 1).data;
                hexColor = (pixel[0] << 16) | (pixel[1] << 8) | pixel[2];
              }
              grid.setColor(cell.x, cell.y, cell.z, hexColor);
            }
          }
        }
      }
    });

  }

  /**
   * Load a ship GLB, retrying once. A transient dev-server or network hiccup
   * (e.g. immediately after a heavy sinking run) should not degrade the whole
   * ship; a second failure propagates to build().
   */
  static async _loadGLB(id) {
    const loader = new GLTFLoader();
    const url = `/src/assets/ships/${id}.glb`;
    try {
      return await loader.loadAsync(url);
    } catch (e) {
      console.error(`[ShipBuilder] GLB load failed, retrying once: ${url}`, e);
      await new Promise(resolve => setTimeout(resolve, 250));
      return loader.loadAsync(url);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  static _applyDamage(grid, levelCfg) {
    if (!levelCfg?.damage) return;
    
    const stateMap = {
      MISSING:  CellState.MISSING,
      DAMAGED:  CellState.DAMAGED,
      FLOODED:  CellState.FLOODED,
    };

    for (const entry of levelCfg.damage) {
      const targetState = stateMap[entry.state] ?? CellState.DAMAGED;
      for (const [cx, cy, cz] of entry.cells) {
        if (grid.inBounds(cx, cy, cz)) {
          grid.setState(cx, cy, cz, targetState);
        }
      }
    }
  }

  /**
   * Fill all cells within a zone region with the given state.
   * @param {VoxelGrid} grid
   * @param {{ xRange, yRange, zRange }} region
   * @param {number} state
   */
  static _fillRegion(grid, region, state) {
    const [x0, x1] = region.xRange;
    const [y0, y1] = region.yRange;
    const [z0, z1] = region.zRange;

    for (let z = z0; z <= z1; z++) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (grid.getState(x, y, z) === CellState.EMPTY) {
            grid.data[grid.index(x, y, z)] = state;
          }
        }
      }
    }
  }

  /**
   * Check whether a given world-space grid coordinate belongs to a named zone.
   * Used by RepairSystem to validate tool application.
   *
   * @param {{ x:number, y:number, z:number }} cell
   * @param {string} zoneName   e.g. 'hull'
   * @param {object} zones      From shipDef.zones
   * @returns {boolean}
   */
  static cellInZone(cell, zoneName, zones) {
    const defs = zones[zoneName];
    if (!defs) return false;
    return defs.some(region => {
      const [x0, x1] = region.xRange;
      const [y0, y1] = region.yRange;
      const [z0, z1] = region.zRange;
      return cell.x >= x0 && cell.x <= x1
          && cell.y >= y0 && cell.y <= y1
          && cell.z >= z0 && cell.z <= z1;
    });
  }

  /**
   * Determine which zone name a cell coordinate belongs to.
   * Returns the first matching zone name, or null.
   *
   * @param {{ x:number, y:number, z:number }} cell
   * @param {object} zones
   * @returns {string|null}
   */
  static zoneOf(cell, zones) {
    for (const [name, defs] of Object.entries(zones)) {
      for (const region of defs) {
        const [x0, x1] = region.xRange;
        const [y0, y1] = region.yRange;
        const [z0, z1] = region.zRange;
        if (cell.x >= x0 && cell.x <= x1
         && cell.y >= y0 && cell.y <= y1
         && cell.z >= z0 && cell.z <= z1) {
          return name;
        }
      }
    }
    return null;
  }
}

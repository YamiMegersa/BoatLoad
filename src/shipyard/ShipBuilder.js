import { VoxelGrid, CellState } from './VoxelGrid.js';

/**
 * ShipBuilder — instantiates a VoxelGrid from a ship definition JSON
 * and applies damage from a level config JSON.
 *
 * Usage:
 *   const { grid, zones, def } = ShipBuilder.build(shipDef, levelConfig);
 */
export class ShipBuilder {
  /**
   * Build a fully-initialised VoxelGrid for a given ship and level.
   *
   * @param {object} shipDef   Parsed ship definition JSON (e.g. sloop.json)
   * @param {object} levelCfg  Parsed level config JSON (e.g. day1.json) — may be null for a pristine ship
   * @returns {{ grid: VoxelGrid, zones: object, def: object }}
   */
  static build(shipDef, levelCfg = null) {
    const { x: W, y: H, z: D } = shipDef.grid;
    const grid = new VoxelGrid(W, H, D);

    // 1. Fill all cells that fall inside any zone as INTACT.
    //    Cells outside every zone remain EMPTY.
    for (const [, zoneDefs] of Object.entries(shipDef.zones)) {
      for (const region of zoneDefs) {
        ShipBuilder._fillRegion(grid, region, CellState.INTACT);
      }
    }

    // 2. Apply damage from the level config.
    if (levelCfg?.damage) {
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

    // 3. After initial construction, clear the dirty set so ChunkRenderer
    //    can treat the first sync as a full rebuild without leftover marks.
    grid.dirtySet.clear();
    grid.topologyDirty = false;

    return { grid, zones: shipDef.zones, def: shipDef };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

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
          // Only overwrite EMPTY cells so later zone fills don't clobber earlier ones
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

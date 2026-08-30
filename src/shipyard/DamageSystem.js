import { CellState } from './VoxelGrid.js';
import { emit } from '../core/EventBus.js';

/**
 * DamageSystem — applies and queries damage patterns on a VoxelGrid.
 *
 * Responsibilities:
 *  - Apply a list of damaged cells from a level config entry.
 *  - Provide flood-fill for spreading FLOODED state to adjacent bilge cells.
 *  - Compute a "damage summary" (HP percentage) based on cell states.
 */
export class DamageSystem {
  /**
   * Apply all damage entries from a level config to a grid.
   * Typically called by ShipBuilder, but exposed here for runtime damage
   * (e.g., impact during Obstacle phase feedback loop).
   *
   * @param {import('./VoxelGrid.js').VoxelGrid} grid
   * @param {Array<{zone:string, cells:number[][], state:string}>} damageEntries
   */
  static applyDamageList(grid, damageEntries) {
    const stateMap = {
      MISSING: CellState.MISSING,
      DAMAGED: CellState.DAMAGED,
      FLOODED: CellState.FLOODED,
    };

    for (const entry of damageEntries) {
      const targetState = stateMap[entry.state] ?? CellState.DAMAGED;
      for (const [cx, cy, cz] of entry.cells) {
        if (grid.inBounds(cx, cy, cz)) {
          grid.setState(cx, cy, cz, targetState);
        }
      }
    }

    emit('gridDirty');
  }

  /**
   * Flood-fill FLOODED state from a seed cell to all connected INTACT cells
   * within the same bounding region (bilge zone bounds).
   *
   * Uses iterative BFS to avoid call-stack overflow on large bilge zones.
   *
   * @param {import('./VoxelGrid.js').VoxelGrid} grid
   * @param {number} seedX
   * @param {number} seedY
   * @param {number} seedZ
   * @param {{ xRange, yRange, zRange }} bounds  Region to confine the fill.
   */
  static floodFill(grid, seedX, seedY, seedZ, bounds) {
    if (!grid.inBounds(seedX, seedY, seedZ)) return;

    const [bx0, bx1] = bounds.xRange;
    const [by0, by1] = bounds.yRange;
    const [bz0, bz1] = bounds.zRange;

    const inBounds = (x, y, z) =>
      x >= bx0 && x <= bx1 &&
      y >= by0 && y <= by1 &&
      z >= bz0 && z <= bz1;

    const queue = [[seedX, seedY, seedZ]];
    const visited = new Set();

    while (queue.length > 0) {
      const [x, y, z] = queue.shift();
      const key = grid.index(x, y, z);
      if (visited.has(key)) continue;
      visited.add(key);

      const state = grid.getState(x, y, z);
      if (state !== CellState.INTACT && state !== CellState.DAMAGED) continue;

      grid.setState(x, y, z, CellState.FLOODED);

      const neighbours = [
        [x-1, y, z], [x+1, y, z],
        [x, y-1, z], [x, y+1, z],
        [x, y, z-1], [x, y, z+1],
      ];

      for (const [nx, ny, nz] of neighbours) {
        if (inBounds(nx, ny, nz) && !visited.has(grid.index(nx, ny, nz))) {
          queue.push([nx, ny, nz]);
        }
      }
    }

    emit('gridDirty');
  }

  /**
   * Compute a damage summary for the grid.
   *
   * @param {import('./VoxelGrid.js').VoxelGrid} grid
   * @returns {{ total: number, intact: number, damaged: number, missing: number, flooded: number, integrityPct: number }}
   */
  static getSummary(grid) {
    let intact = 0, damaged = 0, missing = 0, flooded = 0;

    grid.forEach((_x, _y, _z, state) => {
      if (state === CellState.INTACT || state === CellState.REPAIRED) intact++;
      else if (state === CellState.DAMAGED) damaged++;
      else if (state === CellState.MISSING) missing++;
      else if (state === CellState.FLOODED) flooded++;
    });

    const total = intact + damaged + missing + flooded;
    const integrityPct = total > 0 ? Math.round((intact / total) * 100) : 0;

    return { total, intact, damaged, missing, flooded, integrityPct };
  }
}

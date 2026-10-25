import { CellState, WATERLINE_Y } from './VoxelGrid.js';
import { emit } from '../core/EventBus.js';
import { ShipBuilder } from './ShipBuilder.js';

/** Tool implied by each ship zone — mirrors the docket UI's toolkit. */
const TOOL_BY_ZONE = { hull: 'hammer', deck: 'hammer', sail: 'needle', mast: 'rope' };

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
   * Derive a repair docket from actual grid damage, grouped by zone.
   *
   * One item per zone containing damaged cells, with the tool implied by the
   * zone and a count of the remaining cells. An item is mandatory when it
   * includes hull cells at or below the waterline — those leak and can sink
   * the ship, so they gate Set Sail.
   *
   * Used for BOTH the level's authored damage and a restored sunk-run wreck,
   * so persistence needs no separate docket path.
   *
   * @param {import('./VoxelGrid.js').VoxelGrid} grid
   * @param {object} zones  shipDef.zones (name → [{ xRange, yRange, zRange }])
  /**
   * Check whether a damaged or missing cell is sealed against water and structural void.
   * A breach is sealed if:
   *  1. It is directly filled with an INTACT or REPAIRED block.
   *  2. It is sealed by a backing patch from the interior (e.g. inner plank/plate/bulkhead).
   *  3. It is sealed by an outer cladding plate from the exterior.
   *  4. For keel holes, sealed by a floor plate above it.
   *
   * This removes the naive "block-for-block" requirement, allowing creative player patching.
   */
  static isBreachSealed(grid, cx, cy, cz, waterlineY = WATERLINE_Y) {
    if (!grid.inBounds(cx, cy, cz)) return true;
    const state = grid.getState(cx, cy, cz);
    if (state === CellState.INTACT || state === CellState.REPAIRED) return true;
    if (state === CellState.DAMAGED) return false;

    // For MISSING cells, check if player patched it with a REPAIRED block
    const isPlayerPatch = (x, y, z) => {
      if (!grid.inBounds(x, y, z)) return false;
      return grid.getState(x, y, z) === CellState.REPAIRED;
    };

    const midX = (grid.width - 1) * 0.5;
    const midZ = (grid.depth - 1) * 0.5;

    // Interior vs exterior neighbor directions
    const inZ = cz + (cz < midZ ? 1 : (cz > midZ ? -1 : 0));
    const outZ = cz + (cz < midZ ? -1 : (cz > midZ ? 1 : 0));
    const inX = cx + (cx < midX ? 1 : (cx > midX ? -1 : 0));
    const outX = cx + (cx < midX ? -1 : (cx > midX ? 1 : 0));

    // Sealed if patched from inside (backing plate / bulkhead)
    if (cz !== Math.round(midZ) && isPlayerPatch(cx, cy, inZ)) return true;
    if (cx !== Math.round(midX) && isPlayerPatch(inX, cy, cz)) return true;

    // Sealed if plated from outside (cladding)
    if (cz !== Math.round(midZ) && isPlayerPatch(cx, cy, outZ)) return true;
    if (cx !== Math.round(midX) && isPlayerPatch(outX, cy, cz)) return true;

    // Keel / bottom seal: floor plate placed above keel cell
    if (cy <= 1 && isPlayerPatch(cx, cy + 1, cz)) return true;

    return false;
  }

  /**
   * Scan the grid for all unsealed hull breaches at or below the waterline.
   * Classifies each breach by sector (bow, stern, port, starboard, keel) and tier.
   *
   * @param {import('./VoxelGrid.js').VoxelGrid} grid
   * @param {number} [waterlineY=WATERLINE_Y]
   * @returns {Array<{ x:number, y:number, z:number, state:number, tier:number, sector:string, witcherSector:string }>}
   */
  static getActiveLeaks(grid, waterlineY = WATERLINE_Y) {
    if (!grid) return [];
    const leaks = [];
    const midX = (grid.width - 1) * 0.5;
    const midZ = (grid.depth - 1) * 0.5;

    for (let z = 0; z < grid.depth; z++) {
      for (let y = 0; y <= waterlineY; y++) {
        for (let x = 0; x < grid.width; x++) {
          const state = grid.getState(x, y, z);
          if (state === CellState.MISSING || state === CellState.DAMAGED || state === CellState.FLOODED) {
            if (!DamageSystem.isBreachSealed(grid, x, y, z, waterlineY)) {
              let sector = 'keel';
              const dz = z - midZ;
              const dx = x - midX;
              // Model space: rotated by 180° around Y (facing -Z in world)
              // dx >= 0 corresponds to world -X (port)
              // dx < 0 corresponds to world +X (starboard)
              // dz > 0 corresponds to world -Z (bow)
              // dz < 0 corresponds to world +Z (stern)
              const isPort = dx >= 0;
              let witcherSector = isPort ? 'mid_port' : 'mid_starboard';

              if (y <= 1) {
                sector = 'keel';
                witcherSector = isPort ? 'mid_port' : 'mid_starboard';
              } else {
                if (Math.abs(dz) > Math.abs(dx) * 1.2) {
                  sector = dz > 0 ? 'bow' : 'stern';
                } else {
                  sector = isPort ? 'port' : 'starboard';
                }

                if (dz > midZ * 0.2) {
                  witcherSector = isPort ? 'bow_port' : 'bow_starboard';
                } else if (dz < -midZ * 0.2) {
                  witcherSector = isPort ? 'stern_port' : 'stern_starboard';
                } else {
                  witcherSector = isPort ? 'mid_port' : 'mid_starboard';
                }
              }

              let adjacentMissing = 0;
              const nbrs = [[x-1,y,z], [x+1,y,z], [x,y-1,z], [x,y+1,z], [x,y,z-1], [x,y,z+1]];
              for (const [nx, ny, nz] of nbrs) {
                if (grid.inBounds(nx, ny, nz) && grid.getState(nx, ny, nz) === CellState.MISSING) {
                  adjacentMissing++;
                }
              }

              let tier = 2;
              if (state === CellState.DAMAGED) tier = 1;
              else if (adjacentMissing >= 2) tier = 3;

              leaks.push({ x, y, z, state, tier, sector, witcherSector });
            }
          }
        }
      }
    }

    return leaks;
  }

  /**
   * Scan the grid for all unsealed hull breaches across the entire hull.
   * @param {import('./VoxelGrid.js').VoxelGrid} grid
   * @returns {Array<{ x:number, y:number, z:number, state:number, sector:string, witcherSector:string }>}
   */
  static getAllBreaches(grid) {
    if (!grid) return [];
    const breaches = [];
    const midX = (grid.width - 1) * 0.5;
    const midZ = (grid.depth - 1) * 0.5;

    for (let z = 0; z < grid.depth; z++) {
      for (let y = 0; y < grid.height; y++) {
        for (let x = 0; x < grid.width; x++) {
          const state = grid.getState(x, y, z);
          if (state === CellState.MISSING || state === CellState.DAMAGED || state === CellState.FLOODED) {
            if (!DamageSystem.isBreachSealed(grid, x, y, z)) {
              const dz = z - midZ;
              const dx = x - midX;
              const isPort = dx >= 0;
              let sector = 'keel';
              let witcherSector = isPort ? 'mid_port' : 'mid_starboard';

              if (y <= 1) {
                sector = 'keel';
                witcherSector = isPort ? 'mid_port' : 'mid_starboard';
              } else {
                if (Math.abs(dz) > Math.abs(dx) * 1.2) {
                  sector = dz > 0 ? 'bow' : 'stern';
                } else {
                  sector = isPort ? 'port' : 'starboard';
                }

                if (dz > midZ * 0.2) {
                  witcherSector = isPort ? 'bow_port' : 'bow_starboard';
                } else if (dz < -midZ * 0.2) {
                  witcherSector = isPort ? 'stern_port' : 'stern_starboard';
                } else {
                  witcherSector = isPort ? 'mid_port' : 'mid_starboard';
                }
              }

              breaches.push({ x, y, z, state, sector, witcherSector });
            }
          }
        }
      }
    }
    return breaches;
  }

  /**
   * Derive a repair docket from actual grid damage, grouped by zone.
   *
   * One item per zone containing damaged cells, with the tool implied by the
   * zone and a count of the remaining cells. An item is mandatory when it
   * includes hull cells at or below the waterline — those leak and can sink
   * the ship, so they gate Set Sail.
   *
   * Used for BOTH the level's authored damage and a restored sunk-run wreck,
   * so persistence needs no separate docket path.
   *
   * @param {import('./VoxelGrid.js').VoxelGrid} grid
   * @param {object} zones  shipDef.zones (name → [{ xRange, yRange, zRange }])
   * @returns {Array<{ id: string, label: string, mandatory: boolean, zone: string,
   *                    tool: string, remaining: number, leaks: number }>}
   */
  static buildDocket(grid, zones, authoredTasks = []) {
    const damagedCells = new Map();

    for (let z = 0; z < grid.depth; z++) {
      for (let y = 0; y < grid.height; y++) {
        for (let x = 0; x < grid.width; x++) {
          const state = grid.getState(x, y, z);
          if (state !== CellState.MISSING && state !== CellState.DAMAGED && state !== CellState.FLOODED) continue;
          const zone = ShipBuilder.zoneOf({ x, y, z }, zones) ?? 'superstructure';
          if (!damagedCells.has(zone)) damagedCells.set(zone, []);
          damagedCells.get(zone).push({ x, y, z });
        }
      }
    }

    const tasks = [];
    for (const [zone, cells] of damagedCells) {
      const authored = authoredTasks.find(task => task.zone === zone);
      const leaks = zone === 'hull' 
        ? cells.filter(cell => cell.y <= WATERLINE_Y && !DamageSystem.isBreachSealed(grid, cell.x, cell.y, cell.z)).length 
        : 0;
      const count = cells.length;
      const fallbackLabel = `Repair ${zone} (${count} ${count === 1 ? 'damaged cell' : 'damaged cells'}${leaks ? `, ${leaks} leaking` : ''})`;
      tasks.push({
        id: authored?.id ?? `repair-${zone}`,
        label: authored?.label ?? fallbackLabel,
        mandatory: authored?.mandatory ?? leaks > 0,
        zone,
        tool: authored?.tool ?? TOOL_BY_ZONE[zone] ?? 'hammer',
        targetCells: cells,
        total: count,
        remaining: count,
        leaks,
        completed: false,
      });
    }

    return tasks;
  }

  /**
   * Refresh progress for stable docket tasks using nuanced watertight sealing checks.
   * @param {import('./VoxelGrid.js').VoxelGrid} grid
   * @param {Array<object>} tasks
   * @returns {Array<object>}
   */
  static getDocketProgress(grid, tasks) {
    return tasks.map(task => {
      const remaining = task.targetCells.filter(({ x, y, z }) => {
        return !DamageSystem.isBreachSealed(grid, x, y, z);
      }).length;
      return { ...task, remaining, completed: remaining === 0 };
    });
  }

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
        if (grid.inBounds(cx, cy, cz) && grid.getState(cx, cy, cz) !== CellState.EMPTY) {
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

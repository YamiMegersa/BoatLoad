import { CellState } from './VoxelGrid.js';
import { ShipBuilder } from './ShipBuilder.js';
import { emit } from '../core/EventBus.js';

// ---------------------------------------------------------------------------
// Tool → Zone validation table
// Maps tool ID → array of zones that tool is allowed to repair.
// ---------------------------------------------------------------------------
const TOOL_ZONE_MAP = {
  hammer:     ['hull', 'deck', 'mast'],
  needle:     ['sail'],
  bucket:     ['bilge'],
  rope:       ['mast', 'anchor', 'rudder'],
  metalwork:  ['cannon', 'window', 'anchor'],
  munitions:  ['cannon'],
};

// ---------------------------------------------------------------------------
// RepairSystem
// ---------------------------------------------------------------------------

/**
 * RepairSystem — validates and applies tool interactions to VoxelGrid cells.
 *
 * Dependencies (set via init):
 *   - grid:    VoxelGrid instance from ShipBuilder
 *   - zones:   zones object from shipDef
 *   - docket:  docket array from levelConfig
 *   - onCellRepaired(x,y,z): callback to notify ChunkRenderer / ShipRaycaster
 */
export class RepairSystem {
  constructor() {
    this._grid   = null;
    this._zones  = null;
    this._docket = null;

    /** Currently selected tool ID (e.g. 'hammer'). */
    this.activeTool = null;

    /** Set of docket item IDs that have been completed. */
    this._completedItems = new Set();
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * @param {import('./VoxelGrid.js').VoxelGrid} grid
   * @param {object} zones
   * @param {Array}  docket   From levelConfig.docket
   */
  init(grid, zones, docket) {
    this._grid   = grid;
    this._zones  = zones;
    this._docket = docket;
    this._completedItems.clear();
    this.activeTool = null;
  }

  reset() {
    this._grid   = null;
    this._zones  = null;
    this._docket = null;
    this._completedItems.clear();
    this.activeTool = null;
  }

  // -------------------------------------------------------------------------
  // Tool selection
  // -------------------------------------------------------------------------

  /**
   * Select a tool from the toolbox.
   * @param {string} toolId
   */
  selectTool(toolId) {
    if (!TOOL_ZONE_MAP[toolId]) {
      console.warn(`RepairSystem.selectTool: unknown tool "${toolId}"`);
      return;
    }
    this.activeTool = toolId;
    emit('toolSelected', { toolId });
  }

  // -------------------------------------------------------------------------
  // Apply repair
  // -------------------------------------------------------------------------

  /**
   * Attempt to apply the active tool to a cell.
   * Emits events for UI binding and BVH rebuild triggers.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {{ success: boolean, reason?: string }}
   */
  applyTool(x, y, z) {
    if (!this.activeTool) {
      return { success: false, reason: 'no_tool_selected' };
    }

    const state = this._grid.getState(x, y, z);

    // Only act on cells that are actually damaged
    if (state === CellState.INTACT || state === CellState.EMPTY) {
      return { success: false, reason: 'cell_not_damaged' };
    }

    // Determine which zone this cell belongs to
    const zoneName = ShipBuilder.zoneOf({ x, y, z }, this._zones);
    if (!zoneName) {
      return { success: false, reason: 'cell_not_in_zone' };
    }

    // Validate tool is valid for the zone
    const allowedZones = TOOL_ZONE_MAP[this.activeTool] ?? [];
    if (!allowedZones.includes(zoneName)) {
      emit('repairFailed', { x, y, z, reason: 'wrong_tool', zone: zoneName, tool: this.activeTool });
      return { success: false, reason: 'wrong_tool' };
    }

    // Apply repair — transition to REPAIRED (animation) then INTACT
    this._grid.setState(x, y, z, CellState.REPAIRED);

    // After a short delay, settle to INTACT (ChunkRenderer handles the visual switch)
    // Using setTimeout keeps the animation frame unblocked.
    setTimeout(() => {
      if (this._grid?.inBounds(x, y, z)) {
        this._grid.setState(x, y, z, CellState.INTACT);
        emit('gridDirty');
      }
    }, 300);

    emit('cellRepaired', { x, y, z, zone: zoneName });
    emit('gridDirty');

    // Check if this repair satisfies any open docket items
    this._checkDocket(zoneName);

    return { success: true };
  }

  // -------------------------------------------------------------------------
  // Docket checking
  // -------------------------------------------------------------------------

  /**
   * After a repair, check whether any mandatory docket items are now satisfied.
   * A docket item is satisfied when all its cells in the zone are no longer damaged.
   * @param {string} zoneName
   */
  _checkDocket(zoneName) {
    if (!this._docket) return;

    for (const item of this._docket) {
      if (this._completedItems.has(item.id)) continue;
      if (item.zone !== zoneName) continue;

      // Check if all remaining cells in this zone are INTACT
      const allHealed = this._allZoneCellsIntact(zoneName);
      if (allHealed) {
        this._completedItems.add(item.id);
        emit('docketItemCompleted', { itemId: item.id, label: item.label });

        // If all mandatory items are done, emit a ready-to-sail event
        const mandatory = this._docket.filter(d => d.mandatory);
        if (mandatory.every(d => this._completedItems.has(d.id))) {
          emit('allRepairsDone');
        }
      }
    }
  }

  /**
   * Returns true if every cell in a named zone is INTACT or EMPTY.
   * @param {string} zoneName
   * @returns {boolean}
   */
  _allZoneCellsIntact(zoneName) {
    const zoneDefs = this._zones[zoneName];
    if (!zoneDefs) return true;

    for (const region of zoneDefs) {
      const [x0, x1] = region.xRange;
      const [y0, y1] = region.yRange;
      const [z0, z1] = region.zRange;
      for (let z = z0; z <= z1; z++) {
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const s = this._grid.getState(x, y, z);
            if (s === CellState.DAMAGED || s === CellState.MISSING || s === CellState.FLOODED) {
              return false;
            }
          }
        }
      }
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  /** Returns true if all mandatory docket items are complete. */
  get isReadyToSail() {
    if (!this._docket) return false;
    return this._docket
      .filter(d => d.mandatory)
      .every(d => this._completedItems.has(d.id));
  }

  /** Returns the Set of completed docket item IDs. */
  get completedItems() {
    return this._completedItems;
  }
}

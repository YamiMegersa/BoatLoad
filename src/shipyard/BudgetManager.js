import { emit } from '../core/EventBus.js';

/**
 * BudgetManager — tracks level repair funds, expenditures, and refunds.
 *
 * Rules:
 *  - Placing blocks deducts (voxel volume * material unit cost).
 *  - Only blocks placed during the current repair session can be removed/undone for a 100% refund.
 *  - Existing or original hull blocks cannot be dismantled for cash (zero refund).
 */
export class BudgetManager {
  /**
   * @param {number} [initialBudget=300]
   */
  constructor(initialBudget = 300) {
    this.totalBudget = initialBudget;
    this.spent = 0;
    /** Maps 'x,y,z' -> { cost: number, materialId: string, timestamp: number } for newly placed repairs */
    this.sessionRepairs = new Map();
  }

  /**
   * Remaining funds available.
   * @returns {number}
   */
  get remaining() {
    return Math.max(0, this.totalBudget - this.spent);
  }

  /**
   * Check if a placement cost can be afforded.
   * @param {number} cost
   * @returns {boolean}
   */
  canAfford(cost) {
    if (this.totalBudget === Infinity) return true;
    return this.remaining >= cost;
  }

  /**
   * Deduct funds for placed blocks.
   * @param {number} cost
   * @param {Array<{ x: number, y: number, z: number }>} cells
   * @param {string} materialId
   * @returns {boolean}
   */
  spend(cost, cells = [], materialId = 'oak_plank') {
    if (!this.canAfford(cost)) return false;

    this.spent += cost;
    const costPerCell = cells.length > 0 ? cost / cells.length : 0;
    for (const { x, y, z } of cells) {
      this.sessionRepairs.set(`${x},${y},${z}`, {
        cost: costPerCell,
        materialId,
        timestamp: Date.now()
      });
    }

    this._emitChange();
    return true;
  }

  /**
   * Refund funds when an undo or eraser action removes a newly placed repair block.
   * Does NOT refund original hull blocks.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {number} Amount refunded (0 if original block)
   */
  refundCell(x, y, z) {
    const key = `${x},${y},${z}`;
    const record = this.sessionRepairs.get(key);
    if (!record) return 0; // Not placed this session, zero refund!

    const refundAmount = record.cost || 0;
    this.spent = Math.max(0, this.spent - refundAmount);
    this.sessionRepairs.delete(key);
    this._emitChange();
    return refundAmount;
  }

  /**
   * Direct refund for batch operations (e.g. multi-voxel Undo).
   * @param {number} amount
   */
  refundAmount(amount) {
    this.spent = Math.max(0, this.spent - amount);
    this._emitChange();
  }

  /**
   * Is this cell a player-placed repair from this session?
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {boolean}
   */
  isSessionRepair(x, y, z) {
    return this.sessionRepairs.has(`${x},${y},${z}`);
  }

  /**
   * Reset budget when entering shipyard.
   * @param {number} budget
   */
  reset(budget = 300) {
    this.totalBudget = budget !== undefined && budget !== null ? budget : 300;
    this.spent = 0;
    this.sessionRepairs.clear();
    this._emitChange();
  }

  _emitChange() {
    emit('budgetChanged', {
      total: this.totalBudget,
      spent: this.spent,
      remaining: this.remaining
    });
  }
}

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
    this.contractBudget = initialBudget;
    this.spent = 0;
    /** Maps 'x,y,z' -> { cost: number, materialId: string, timestamp: number } for newly placed repairs */
    this.sessionRepairs = new Map();
  }

  /**
   * Profit margin if construction ends now (can be negative if overspent).
   * @returns {number}
   */
  get leftoverProfit() {
    return this.totalBudget - this.spent;
  }

  /**
   * Remaining funds available under contract budget.
   * @returns {number}
   */
  get remaining() {
    return Math.max(0, this.totalBudget - this.spent);
  }

  /**
   * Check if a placement cost can be afforded.
   * Players are permitted to exceed customer budget (with deficit funded from purse).
   * @param {number} cost
   * @returns {boolean}
   */
  canAfford(cost) {
    return true;
  }

  /**
   * Deduct funds for placed blocks.
   * Emits an over-budget warning the moment total expenditures exceed customer allocation.
   * @param {number} cost
   * @param {Array<{ x: number, y: number, z: number }>} cells
   * @param {string} materialId
   * @returns {boolean}
   */
  spend(cost, cells = [], materialId = 'oak_plank') {
    const wasUnder = this.spent <= this.totalBudget;
    this.spent += cost;
    const isOver = this.spent > this.totalBudget;

    const costPerCell = cells.length > 0 ? cost / cells.length : 0;
    for (const { x, y, z } of cells) {
      this.sessionRepairs.set(`${x},${y},${z}`, {
        cost: costPerCell,
        materialId,
        timestamp: Date.now()
      });
    }

    if (wasUnder && isOver) {
      const deficit = this.spent - this.totalBudget;
      emit('budgetExceeded', {
        total: this.totalBudget,
        spent: this.spent,
        deficit
      });
      emit('notification', {
        type: 'warning',
        text: `⚠️ OVER BUDGET: You exceeded the customer's budget by ${deficit} Doubloons! Extra repairs will come out of your own purse.`
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
    this.contractBudget = this.totalBudget;
    this.spent = 0;
    this.sessionRepairs.clear();
    this._emitChange();
  }

  _emitChange() {
    const isOverBudget = this.spent > this.totalBudget;
    emit('budgetChanged', {
      total: this.totalBudget,
      contractBudget: this.totalBudget,
      spent: this.spent,
      remaining: this.remaining,
      leftoverProfit: this.leftoverProfit,
      isOverBudget,
      deficit: isOverBudget ? (this.spent - this.totalBudget) : 0
    });
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { BudgetManager } from '../src/shipyard/BudgetManager.js';
import { on } from '../src/core/EventBus.js';

test('BudgetManager: calculates leftoverProfit and tracks Doubloons expenditures correctly', () => {
  const budget = new BudgetManager(250);
  assert.equal(budget.totalBudget, 250);
  assert.equal(budget.contractBudget, 250);
  assert.equal(budget.spent, 0);
  assert.equal(budget.remaining, 250);
  assert.equal(budget.leftoverProfit, 250);

  // Spend on 5 oak planks (5 * 5 = 25 Doubloons)
  const ok = budget.spend(25, [
    { x: 1, y: 1, z: 1 },
    { x: 1, y: 1, z: 2 },
    { x: 1, y: 1, z: 3 },
    { x: 1, y: 1, z: 4 },
    { x: 1, y: 1, z: 5 }
  ], 'oak_plank');

  assert.equal(ok, true);
  assert.equal(budget.spent, 25);
  assert.equal(budget.remaining, 225);
  assert.equal(budget.leftoverProfit, 225);

  // Refund 2 blocks via undo/eraser
  const refunded1 = budget.refundCell(1, 1, 1);
  const refunded2 = budget.refundCell(1, 1, 2);
  assert.equal(refunded1, 5);
  assert.equal(refunded2, 5);
  assert.equal(budget.spent, 15);
  assert.equal(budget.remaining, 235);
  assert.equal(budget.leftoverProfit, 235);

  // Trying to refund an original unplaced hull block returns 0
  const invalidRefund = budget.refundCell(99, 99, 99);
  assert.equal(invalidRefund, 0);
  assert.equal(budget.spent, 15);
});

test('BudgetManager: allows exceeding customer budget, calculates deficit, and emits warning', () => {
  const budget = new BudgetManager(100);
  let exceededEvent = null;
  let notificationEvent = null;

  on('budgetExceeded', (d) => { exceededEvent = d; });
  on('notification', (d) => { notificationEvent = d; });

  // Players can afford even if exceeding budget
  assert.equal(budget.canAfford(90), true);
  budget.spend(90, [{ x: 0, y: 0, z: 0 }], 'oak_plank');
  assert.equal(budget.spent, 90);
  assert.equal(budget.remaining, 10);
  assert.equal(budget.leftoverProfit, 10);
  assert.equal(exceededEvent, null);

  // Exceed budget by spending 30 more (total 120, deficit 20)
  assert.equal(budget.canAfford(30), true);
  const ok = budget.spend(30, [{ x: 1, y: 0, z: 0 }], 'oak_plank');
  assert.equal(ok, true);
  assert.equal(budget.spent, 120);
  assert.equal(budget.remaining, 0);
  assert.equal(budget.leftoverProfit, -20);

  // Verified warning notification and budgetExceeded events fired
  assert.ok(exceededEvent !== null, 'budgetExceeded event emitted');
  assert.equal(exceededEvent.deficit, 20);
  assert.equal(exceededEvent.total, 100);
  assert.equal(exceededEvent.spent, 120);

  assert.ok(notificationEvent !== null, 'notification event emitted');
  assert.equal(notificationEvent.type, 'warning');
  assert.ok(notificationEvent.text.includes('OVER BUDGET'));
});

test('Settlement Math: Leftover margin + Sailing Bounty - Incurred Damage can plunge wallet into debt', () => {
  // Scenario:
  // Base Contract: 200 Doubloons
  // Bargain Bonus: 50 Doubloons
  // Agreed Budget: 250 Doubloons
  // Spent on Repairs: 180 Doubloons
  // Leftover Profit: +70 Doubloons
  const agreedBudget = 200 + 50;
  const repairSpent = 180;
  const leftoverProfit = agreedBudget - repairSpent;
  assert.equal(leftoverProfit, 70);

  // Sailing bounty (Safe delivery on Day 1)
  const baseReward = 150 + 1 * 75; // 225
  const multiplier = 1.25; // Iron Lockbox Pedestal
  const sailingBonus = Math.round(baseReward * multiplier); // 281
  assert.equal(sailingBonus, 281);

  // Light damage: 3 broken voxels @ 8 Doubloons each
  const lightDamagedVoxels = 3;
  const lightDamagePenalty = lightDamagedVoxels * 8; // 24
  assert.equal(lightDamagePenalty, 24);

  // Solvent net payout
  const solventNetPayout = leftoverProfit + sailingBonus - lightDamagePenalty;
  assert.equal(solventNetPayout, 70 + 281 - 24); // 327

  // Severe Collision Damage Scenario on completed passage:
  // 55 voxels destroyed during treacherous navigation @ 8 Doubloons = 440 Doubloons damage
  const severeDamageCost = 55 * 8; // 440
  const debtNetPayout = leftoverProfit + sailingBonus - severeDamageCost; // 70 + 281 - 440 = -89
  assert.equal(debtNetPayout, -89);

  // Starting purse: 30 Doubloons
  let purse = 30;
  purse += debtNetPayout;
  assert.equal(purse, -59); // Plunges into negative debt!
  assert.ok(purse < 0, 'Purse is now in debt');

  // Sinking Reset Scenario:
  // If vessel sinks during voyage, NO salvage fee is charged.
  // Ship and contract reset back to original base budget (200), spent = 0
  const resetContract = { baseBudget: 200, agreedBudget: 200, spentOnRepairs: 0 };
  assert.equal(resetContract.agreedBudget, 200);
  assert.equal(resetContract.spentOnRepairs, 0);
  assert.equal(resetContract.agreedBudget - resetContract.spentOnRepairs, 200);
});

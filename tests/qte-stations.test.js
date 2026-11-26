import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HelmConsoleController,
  modeFor,
  gestureFor,
  ratioToDialAngle,
  polarOnDial,
  describeSweetSpotArcs,
} from '../src/ui/QTEStations.js';

test('routes every QTE type to its console screen mode and action gesture', () => {
  assert.equal(modeFor('HARPOON'), 'tap');
  assert.equal(modeFor('SIREN'), 'brace');
  assert.equal(modeFor('BAIL'), 'pump');
  assert.equal(modeFor('UNKNOWN'), null);

  assert.equal(gestureFor('tap'), 'tap');
  assert.equal(gestureFor('brace'), 'hold');
  assert.equal(gestureFor('pump'), 'hold');
  assert.equal(gestureFor(null), null);
});

test('queued expiry does not clear an active console task', () => {
  const controller = new HelmConsoleController();
  controller.start({ type: 'HARPOON', label: 'HARPOON!' });
  controller.queue({ type: 'BAIL', label: 'BAIL WATER!' });
  assert.equal(controller.state, 'active');
  assert.equal(controller.mode, 'tap');
  assert.equal(controller.queued.length, 1);

  // Expiring the queued task removes it from the queue without disturbing active harpoon
  controller.resolve({ type: 'BAIL', queued: true }, 'MISS');
  assert.equal(controller.state, 'active');
  assert.equal(controller.mode, 'tap');
  assert.equal(controller.queued.length, 0);
});

test('back-to-back QTEs on the unified console transition cleanly', () => {
  const controller = new HelmConsoleController();
  controller.start({ type: 'HARPOON', label: 'HARPOON!' });
  assert.equal(controller.state, 'active');
  assert.equal(controller.mode, 'tap');

  controller.resolve({ type: 'HARPOON' }, 'GOOD');
  assert.equal(controller.state, 'resolving');
  assert.equal(controller.result, 'GOOD');

  controller.start({ type: 'BAIL', label: 'BAIL WATER!' });
  assert.equal(controller.state, 'active');
  assert.equal(controller.mode, 'pump');
});

test('finishResolve with stale sequence token never clobbers a newly started QTE', () => {
  const controller = new HelmConsoleController();
  controller.start({ type: 'HARPOON', label: 'HARPOON!', sweetSpot: [0.4, 0.6] });
  controller.resolve({ type: 'HARPOON' }, 'PERFECT');
  const firstResolveSeq = controller.seq;
  assert.equal(controller.state, 'resolving');

  // Before the 520ms resolve timer finishes, a new QTE starts on the console
  controller.start({ type: 'SIREN', label: 'BRACE!' });
  assert.equal(controller.state, 'active');
  assert.equal(controller.mode, 'brace');

  // The stale resolve callback fires and must be ignored
  assert.equal(controller.finishResolve(firstResolveSeq), false);
  assert.equal(controller.state, 'active');
  assert.equal(controller.mode, 'brace');
});

test('chronometer dial math maps ratios and sweet-spot arcs accurately', () => {
  assert.equal(ratioToDialAngle(0), -90);
  assert.equal(ratioToDialAngle(0.5), 0);
  assert.equal(ratioToDialAngle(1), 90);

  const left = polarOnDial(60, 60, 46, -90);
  const top = polarOnDial(60, 60, 46, 0);
  const right = polarOnDial(60, 60, 46, 90);
  assert.deepEqual(left, { x: 14, y: 60 });
  assert.deepEqual(top, { x: 60, y: 14 });
  assert.deepEqual(right, { x: 106, y: 60 });

  const arcs = describeSweetSpotArcs([0.4, 0.6], 60, 60, 46);
  assert.equal(arcs.startAngle, -18);
  assert.equal(arcs.endAngle, 18);
  assert.equal(arcs.centerAngle, 0);
  assert.match(arcs.sweetPath, /^M .* A 46 46 0 0 1 /);
  assert.match(arcs.perfectPath, /^M .* A 46 46 0 0 1 /);
});

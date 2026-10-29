import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QTEStationController,
  stationFor,
  ratioToDialAngle,
  polarOnDial,
  describeSweetSpotArcs,
} from '../src/ui/QTEStations.js';

test('routes every QTE type to its fixed station', () => {
  assert.equal(stationFor('HARPOON'), 'timing');
  assert.equal(stationFor('BAIL'), 'bail');
  assert.equal(stationFor('SIREN'), 'siren');
  assert.equal(stationFor('UNKNOWN'), null);
});

test('queued expiry does not clear an active station', () => {
  const controller = new QTEStationController();
  controller.start({ type: 'HARPOON', label: 'HARPOON!' });
  controller.queue({ type: 'BAIL', label: 'BAIL WATER!' });
  controller.resolve({ type: 'BAIL', queued: true }, 'MISS');
  assert.equal(controller.stations.timing.state, 'active');
  assert.equal(controller.stations.bail.state, 'idle');
});

test('siren side is latched from metadata or recent pull and uses a right fallback', () => {
  let now = 1000;
  const controller = new QTEStationController(() => now);
  assert.equal(controller.start({ type: 'SIREN' }), 'siren');
  assert.equal(controller.stations.siren.side, 'right');
  controller.clear('siren');

  // Latches from recent sirenPulling event
  controller.noteSirenPull({ steerPull: -1 });
  now += 100;
  controller.start({ type: 'SIREN' });
  controller.noteSirenPull({ steerPull: 1 });
  assert.equal(controller.stations.siren.side, 'left');
  controller.clear('siren');

  // Latches deterministically from metadata.side even after pull expires
  now += 2000;
  controller.start({ type: 'SIREN', metadata: { side: 'left' } });
  assert.equal(controller.stations.siren.side, 'left');
});

test('back-to-back QTEs across different stations leave the next station active', () => {
  const controller = new QTEStationController();
  controller.start({ type: 'HARPOON' });
  controller.resolve({ type: 'HARPOON' }, 'GOOD');
  controller.start({ type: 'BAIL' });
  assert.equal(controller.stations.timing.state, 'resolving');
  assert.equal(controller.stations.bail.state, 'active');
});

test('finishResolve with stale sequence token never clobbers a newly started QTE on the same station', () => {
  const controller = new QTEStationController();
  controller.start({ type: 'HARPOON', label: 'HARPOON!', sweetSpot: [0.4, 0.6] });
  controller.resolve({ type: 'HARPOON' }, 'PERFECT');
  const firstResolveSeq = controller.stations.timing.seq;
  assert.equal(controller.stations.timing.state, 'resolving');

  // Before the 520ms resolve timer finishes, a new HARPOON QTE starts on the same timing station
  controller.start({ type: 'HARPOON', label: 'SECOND HARPOON!', sweetSpot: [0.35, 0.65] });
  assert.equal(controller.stations.timing.state, 'active');
  assert.equal(controller.stations.timing.type, 'HARPOON');

  // The stale timer fires and must be ignored
  assert.equal(controller.finishResolve('timing', firstResolveSeq), false);
  assert.equal(controller.stations.timing.state, 'active');
  assert.equal(controller.stations.timing.type, 'HARPOON');
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

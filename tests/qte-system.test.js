import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window ??= {
  addEventListener() { },
  removeEventListener() { },
};

const { QTESystem, QTE_SOURCES, computePoints, holdAccuracyFromElapsed } = await import('../src/obstacle/QTESystem.js');
const { clear, emit, on, off } = await import('../src/core/EventBus.js');

test('QTE deduplication is per instance when an instance ID is provided', () => {
  const system = new QTESystem();
  const events = [];
  const onStart = event => events.push(event);
  on('qteStart', onStart);

  assert.equal(system.trigger({ source: 'siren', metadata: { instanceId: 'reef-a' } }), true);
  assert.equal(system.trigger({ source: 'siren', metadata: { instanceId: 'reef-a' } }), false);
  assert.equal(system.trigger({ source: 'siren', metadata: { instanceId: 'reef-b' } }), true);
  assert.equal(system.trigger({ source: 'siren', metadata: { instanceId: 'reef-b' } }), false);
  assert.equal(system._queue.length, 1);
  assert.equal(events[0].metadata.instanceId, 'reef-a');
  assert.equal(events[0].dedupeKey, 'reef-a');

  for (let index = 0; index < 8; index++) {
    emit('qteInput', { kind: 'tap' });
  }
  assert.equal(system._active.metadata.instanceId, 'reef-b');

  off('qteStart', onStart);
  system.dispose();
  clear();
});

test('QTEs without an instance ID retain source-level duplicate protection', () => {
  const system = new QTESystem();

  assert.equal(system.trigger({ source: 'siren' }), true);
  assert.equal(system.trigger({ source: 'siren' }), false);

  system.dispose();
  clear();
});

test('shark QTE awards extra doubloons capped at 25', () => {
  const good = computePoints(QTE_SOURCES.shark, false, 1);
  const perfect = computePoints(QTE_SOURCES.shark, true, 5);
  assert.equal(good.points, 25);
  assert.equal(perfect.points, 25);
});

test('higher priority QTE preempts lower priority active QTE (Bail 100 > Siren 70 > Harpoon 30)', () => {
  const system = new QTESystem();
  const preemptedEvents = [];
  on('qtePreempted', e => preemptedEvents.push(e));

  // 1. Shark harpoon starts (priority 30)
  assert.equal(system.trigger({ source: 'shark', metadata: { instanceId: 'shark-1' } }), true);
  assert.equal(system._active.type, 'HARPOON');

  // 2. Siren triggers (priority 70) -> PREEMPTS harpoon!
  assert.equal(system.trigger({ source: 'siren', urgent: true, metadata: { instanceId: 'siren-1' } }), true);
  assert.equal(system._active.type, 'SIREN');
  assert.equal(system._queue.length, 1);
  assert.equal(system._queue[0].type, 'HARPOON');
  assert.equal(preemptedEvents.length, 1);
  assert.equal(preemptedEvents[0].preemptedType, 'HARPOON');
  assert.equal(preemptedEvents[0].newType, 'SIREN');

  // 3. Water bailing triggers (priority 100) -> PREEMPTS siren!
  assert.equal(system.trigger({ source: 'bail', metadata: { instanceId: 'bail-1' } }), true);
  assert.equal(system._active.type, 'BAIL');
  assert.equal(system._queue.length, 2);
  assert.equal(system._queue[0].type, 'SIREN');
  assert.equal(system._queue[1].type, 'HARPOON');

  // 4. Resolve bailing -> SIREN starts next!
  system._succeed();
  assert.equal(system._active.type, 'SIREN');
  assert.equal(system._queue.length, 1);
  assert.equal(system._queue[0].type, 'HARPOON');

  // 5. Resolve siren -> HARPOON resumes next!
  system._succeed();
  assert.equal(system._active.type, 'HARPOON');
  assert.equal(system._queue.length, 0);

  system.dispose();
  clear();
});

test('hold QTE input charges resolve over time, decays on release, and succeeds at full resolve', () => {
  const system = new QTESystem();
  let succeeded = false;

  system.trigger({
    source: 'siren',
    onSuccess: () => {
      succeeded = true;
    },
  });

  assert.equal(system._active?.definition.input, 'hold');
  assert.equal(system.getActiveResolve('siren'), 0);

  // Press down hold
  emit('qteInput', { kind: 'holdStart' });
  assert.equal(system._active.isHolding, true);

  // Update 0.9s (half of 1.8s holdDurationSec)
  system.update(0.9);
  const resolveMid = system.getActiveResolve('siren');
  assert.ok(resolveMid >= 0.49 && resolveMid <= 0.51, `resolveMid was ${resolveMid}`);

  // Release hold -> should decay at 15%/s
  emit('qteInput', { kind: 'holdEnd' });
  assert.equal(system._active.isHolding, false);
  system.update(1.0);
  const resolveAfterDecay = system.getActiveResolve('siren');
  assert.ok(resolveAfterDecay < resolveMid);
  assert.ok(Math.abs(resolveAfterDecay - (resolveMid - 0.15)) < 0.01);

  // Hold again until full completion (remaining ~0.65 resolve at 1/1.8 ≈ 0.555/s -> ~1.2s)
  emit('qteInput', { kind: 'holdStart' });
  system.update(1.5);
  assert.equal(succeeded, true);
  assert.equal(system._active, null);

  system.dispose();
  clear();
});

test('tapToLatch toggle allows latching hold state on tap', () => {
  const system = new QTESystem();
  system.setTapToLatch(true);

  system.trigger({ source: 'siren' });
  assert.equal(system._active.isHolding, false);

  // Tap once -> latches holding ON
  emit('qteInput', { kind: 'tap' });
  assert.equal(system._active.isHolding, true);

  // Update without any active hold input -> resolve still charges!
  system.update(0.5);
  assert.ok(system.getActiveResolve('siren') > 0.2);

  // Tap again -> unlatches holding OFF
  emit('qteInput', { kind: 'tap' });
  assert.equal(system._active.isHolding, false);

  system.dispose();
  clear();
});

test('hazard lookahead gates QTE triggers when hazard ahead is not clear', () => {
  const system = new QTESystem();
  let hazardClear = true;
  system.setHazardCheck(() => hazardClear);

  // When clear, triggers normally
  assert.equal(system.trigger({ source: 'siren' }), true);
  system._succeed();

  // When hazard is ahead, ordinary trigger is blocked
  hazardClear = false;
  assert.equal(system.trigger({ source: 'siren' }), false);

  // Urgent triggers bypass the hazard gate
  assert.equal(system.trigger({ source: 'siren', urgent: true }), true);
  system._succeed();

  // Debug triggers bypass the hazard gate
  assert.equal(system.trigger({ source: 'siren', debug: true }), true);
  system._succeed();

  system.dispose();
  clear();
});

test('missed shark retry flow: allows re-triggering after timeout if shark is not too far away', () => {
  const system = new QTESystem();
  let failCount = 0;
  let successCount = 0;

  const shark = {
    id: 'shark_1',
    distance: 18,
    qteTriggered: false,
    qteActive: false,
    qteRetryCooldown: 0,
  };

  const attemptTrigger = () => {
    if (shark.distance < 22 && !shark.qteTriggered) {
      const ok = system.trigger({
        source: 'shark',
        metadata: { instanceId: shark.id },
        onSuccess: () => {
          successCount++;
          shark.qteActive = false;
        },
        onFail: () => {
          failCount++;
          shark.qteActive = false;
          shark.qteRetryCooldown = 3.0;
          shark.qteTriggered = true;
        },
      });
      if (ok) {
        shark.qteTriggered = true;
        shark.qteActive = true;
        return true;
      }
    }
    return false;
  };

  const updateShark = (delta) => {
    if (shark.qteRetryCooldown > 0) {
      shark.qteRetryCooldown -= delta;
      if (shark.qteRetryCooldown <= 0) {
        shark.qteRetryCooldown = 0;
        shark.qteTriggered = false;
      }
    }
    attemptTrigger();
  };

  // 1. Initial encounter within range triggers QTE
  assert.equal(attemptTrigger(), true);
  assert.equal(shark.qteActive, true);

  // 2. Player misses the shark
  system._fail('mistimed');
  assert.equal(failCount, 1);
  assert.equal(shark.qteActive, false);
  assert.equal(shark.qteTriggered, true);
  assert.equal(shark.qteRetryCooldown, 3.0);

  // 3. During cooldown (1.5s elapsed), shark cannot re-trigger even though still at distance 18
  updateShark(1.5);
  assert.equal(shark.qteActive, false);
  assert.equal(shark.qteRetryCooldown, 1.5);

  // 4. Cooldown finishes (remaining 1.5s elapsed): shark is still close (distance 18) -> re-triggers!
  updateShark(1.5);
  assert.equal(shark.qteRetryCooldown, 0);
  assert.equal(shark.qteTriggered, true);
  assert.equal(shark.qteActive, true);
  assert.equal(system._active?.dedupeKey, 'shark_1');

  // 5. This second attempt succeeds
  system._succeed();
  assert.equal(successCount, 1);

  system.dispose();
  clear();
});

test('holdAccuracyFromElapsed maps elapsed ratio to [0.6, 1.0] accuracy curve', () => {
  assert.equal(holdAccuracyFromElapsed(0), 1.0);
  assert.equal(holdAccuracyFromElapsed(0.5), 0.8);
  assert.equal(holdAccuracyFromElapsed(1.0), 0.6);
  assert.equal(holdAccuracyFromElapsed(1.5), 0.6);
});

test('bail QTE uses hold-to-pump: holding charges resolve and computes accuracy from elapsed time', () => {
  const system = new QTESystem();
  let result = null;

  system.trigger({
    source: 'bail',
    onSuccess: (res) => {
      result = res;
    },
  });

  assert.equal(system._active?.definition.input, 'hold');
  assert.equal(system._active.type, 'BAIL');

  // Hold starts
  emit('qteInput', { kind: 'holdStart' });
  assert.equal(system._active.isHolding, true);

  // Hold for 2.4s (holdDurationSec for bail is 2.4s) -> completes
  system.update(2.4);

  assert.ok(result !== null);
  assert.equal(system._active, null);
  assert.ok(result.accuracy >= 0.6 && result.accuracy <= 1.0);

  system.dispose();
  clear();
});

test('QTESystem cancels active/queued QTEs and rejects new triggers when ship begins sinking or has sunk', () => {
  const system = new QTESystem();
  let failReason = null;

  system.trigger({
    source: 'shark',
    onFail: ({ reason }) => {
      failReason = reason;
    },
  });

  system.trigger({ source: 'siren' });
  assert.equal(system.hasActive(), true);
  assert.equal(system._queue.length, 1);

  // Ship begins terminal sink plunge
  emit('playerSinkingStart');

  assert.equal(system.hasActive(), false);
  assert.equal(system._queue.length, 0);
  assert.equal(failReason, 'ship-sunk');

  // Any subsequent triggers are immediately rejected
  const triggered = system.trigger({ source: 'shark' });
  assert.equal(triggered, false);

  system.dispose();
  clear();
});

import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window ??= {
  addEventListener() { },
  removeEventListener() { },
};

const { QTESystem } = await import('../src/obstacle/QTESystem.js');
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { QTEInputRouter } from '../src/obstacle/QTEInputRouter.js';
import { QTESystem } from '../src/obstacle/QTESystem.js';
import { clear, emit, on, off } from '../src/core/EventBus.js';

class MockEventTarget {
  constructor() {
    this.listeners = new Map();
  }
  addEventListener(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
  }
  removeEventListener(event, fn) {
    const list = this.listeners.get(event);
    if (!list) return;
    const idx = list.indexOf(fn);
    if (idx >= 0) list.splice(idx, 1);
  }
  dispatch(event, data = {}) {
    for (const fn of this.listeners.get(event) ?? []) {
      fn({ code: event, preventDefault() {}, ...data });
    }
  }
}

test('QTEInputRouter routes Space keydown to holdStart and keyup to holdEnd for hold QTEs', () => {
  const windowTarget = new MockEventTarget();
  const docRef = { activeElement: null, hidden: false, addEventListener() {}, removeEventListener() {} };
  const qteSystem = new QTESystem();
  const router = new QTEInputRouter({ target: windowTarget, documentRef: docRef, qteSystem });

  const inputs = [];
  const onInput = e => inputs.push(e);
  on('qteInput', onInput);

  // Trigger hold QTE (SIREN)
  qteSystem.trigger({ source: 'siren' });
  assert.equal(qteSystem.hasActive(), true);

  // Press Space down
  windowTarget.dispatch('keydown', { code: 'Space' });
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].kind, 'holdStart');
  assert.equal(qteSystem._active.isHolding, true);

  // Release Space up
  windowTarget.dispatch('keyup', { code: 'Space' });
  assert.equal(inputs.length, 2);
  assert.equal(inputs[1].kind, 'holdEnd');
  assert.equal(qteSystem._active.isHolding, false);

  off('qteInput', onInput);
  router.dispose();
  qteSystem.dispose();
  clear();
});

test('QTEInputRouter clears held state and emits holdEnd on window blur', () => {
  const windowTarget = new MockEventTarget();
  const docRef = { activeElement: null, hidden: false, addEventListener() {}, removeEventListener() {} };
  const qteSystem = new QTESystem();
  const router = new QTEInputRouter({ target: windowTarget, documentRef: docRef, qteSystem });

  const inputs = [];
  const onInput = e => inputs.push(e);
  on('qteInput', onInput);

  qteSystem.trigger({ source: 'bail' });
  windowTarget.dispatch('keydown', { code: 'Space' });
  assert.equal(inputs[0].kind, 'holdStart');

  // Window loses focus (blur)
  windowTarget.dispatch('blur');
  assert.equal(inputs.length, 2);
  assert.equal(inputs[1].kind, 'holdEnd');

  off('qteInput', onInput);
  router.dispose();
  qteSystem.dispose();
  clear();
});

test('QTEInputRouter ignores keydown inputs once playerSinkingStart is emitted', () => {
  const windowTarget = new MockEventTarget();
  const docRef = { activeElement: null, hidden: false, addEventListener() {}, removeEventListener() {} };
  const qteSystem = new QTESystem();
  const router = new QTEInputRouter({ target: windowTarget, documentRef: docRef, qteSystem });

  const inputs = [];
  const onInput = e => inputs.push(e);
  on('qteInput', onInput);

  emit('playerSinkingStart');

  // Space keydown must be ignored
  windowTarget.dispatch('keydown', { code: 'Space' });
  assert.equal(inputs.length, 0);

  off('qteInput', onInput);
  router.dispose();
  qteSystem.dispose();
  clear();
});


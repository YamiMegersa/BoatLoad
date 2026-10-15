import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { clear } from '../src/core/EventBus.js';
import { SirenManager } from '../src/monsters/SirenManager.js';

function createSirenHarness(definitions) {
  const scene = new THREE.Scene();
  const triggered = [];
  const effects = new Set();
  const qteSystem = {
    trigger(options) {
      triggered.push(options);
      return true;
    },
  };
  const ship = {
    mesh: new THREE.Group(),
    yaw: 0,
    yawVelocity: 0,
    rollVelocity: 0,
    sunk: false,
    setSirenDisorientation(sourceId, active) {
      if (active) effects.add(sourceId);
      else effects.delete(sourceId);
    },
    isImmune: () => true,
    takeDamage() {},
    setImmune() {},
    bounceBack() {},
    applyKnockback() {},
  };
  const manager = new SirenManager();
  manager.init({ sirens: definitions }, scene, null, [], qteSystem);
  return { manager, ship, triggered, effects };
}

test('separate Siren instances can queue distinct QTEs', () => {
  const { manager, ship, triggered } = createSirenHarness([
    { position: { x: 0, y: 0, z: -10 }, attractRadius: 30 },
    { position: { x: 5, y: 0, z: -10 }, attractRadius: 30 },
  ]);

  manager.update(0, ship);
  assert.equal(triggered.length, 2);
  assert.notEqual(triggered[0].metadata.instanceId, triggered[1].metadata.instanceId);

  manager.dispose();
  clear();
});

test('Siren resistance blocks its pull cycle and reopens QTE after simulation time expires', () => {
  const { manager, ship, triggered } = createSirenHarness([
    { position: { x: 0, y: 0, z: -10 }, attractRadius: 30, resistanceDuration: 2 },
  ]);
  manager.update(0, ship);
  triggered[0].onSuccess({ metadata: triggered[0].metadata });

  manager.update(0.5, ship);
  assert.equal(manager._sirens[0].resistanceRemaining, 1.5);
  assert.equal(triggered.length, 1);

  manager.update(1.5, ship);
  assert.equal(manager._sirens[0].resistanceRemaining, 0);
  assert.equal(triggered.length, 2);

  manager.dispose();
  clear();
});

test('Siren failure temporarily disorients then permits another QTE', () => {
  const { manager, ship, triggered, effects } = createSirenHarness([
    { position: { x: 0, y: 0, z: -10 }, attractRadius: 30, disorientationDuration: 2 },
  ]);
  manager.update(0, ship);
  triggered[0].onFail({ queued: false, metadata: triggered[0].metadata });

  assert.equal(effects.size, 1);
  manager.update(1, ship);
  assert.equal(manager._sirens[0].disorientationRemaining, 1);
  assert.equal(triggered.length, 1);

  manager.update(1, ship);
  assert.equal(effects.size, 0);
  assert.equal(triggered.length, 2);

  manager.dispose();
  clear();
});

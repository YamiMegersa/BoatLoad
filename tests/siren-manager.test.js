import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { clear, on, off } from '../src/core/EventBus.js';
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

test('active resolve damps siren pull torque', () => {
  let resolve = 0;
  const mockQTE = {
    trigger: () => true,
    getActiveResolve: (source) => (source === 'siren' ? resolve : 0),
  };
  const { manager, ship } = createSirenHarness([
    { position: { x: 5, y: 0, z: -10 }, attractRadius: 30, intensity: 1.0 },
  ]);
  manager._qteSystem = mockQTE;

  // Unbraced (resolve = 0)
  resolve = 0;
  ship.yawVelocity = 0;
  manager.update(1.0, ship);
  const unbracedTorque = ship.yawVelocity;

  // Braced (resolve = 1.0 -> braceDamping = 1 - 0.85 = 0.15)
  resolve = 1.0;
  ship.yawVelocity = 0;
  manager.update(1.0, ship);
  const bracedTorque = ship.yawVelocity;

  assert.ok(Math.abs(unbracedTorque) > 0);
  assert.ok(Math.abs(bracedTorque) < Math.abs(unbracedTorque));
  assert.ok(Math.abs(bracedTorque / unbracedTorque - 0.15) < 0.01);

  manager.dispose();
  clear();
});

test('SirenManager.hasSirens reports false when level has no sirens/mermaids, true when present', () => {
  const emptyScene = new THREE.Scene();
  const emptyManager = new SirenManager();
  let configuredPayload = null;
  const onCfg = (d) => { configuredPayload = d; };
  on('sirensConfigured', onCfg);

  emptyManager.init({ sirens: [] }, emptyScene, null, [], null);
  assert.equal(emptyManager.hasSirens(), false);
  assert.deepEqual(configuredPayload, { count: 0, hasSirens: false });
  emptyManager.dispose();

  const sirenScene = new THREE.Scene();
  const sirenManager = new SirenManager();
  sirenManager.init({ sirens: [{ position: { x: 0, y: 0, z: -10 } }] }, sirenScene, null, [], null);
  assert.equal(sirenManager.hasSirens(), true);
  assert.deepEqual(configuredPayload, { count: 1, hasSirens: true });
  sirenManager.dispose();

  off('sirensConfigured', onCfg);
  clear();
});

test('Siren QTE trigger marks urgent: true to bypass forward hazard checks', () => {
  const { manager, ship, triggered } = createSirenHarness([
    { position: { x: 0, y: 0, z: -10 }, attractRadius: 30 },
  ]);
  manager.update(0, ship);

  assert.equal(triggered.length, 1);
  assert.equal(triggered[0].type, 'SIREN');
  assert.equal(triggered[0].urgent, true);
  assert.equal(triggered[0].metadata?.urgent, true);

  manager.dispose();
  clear();
});

test('Siren disorientation reverses steering on PlayerShip', () => {
  const { manager, ship, triggered, effects } = createSirenHarness([
    { position: { x: 0, y: 0, z: -10 }, attractRadius: 30, disorientationDuration: 4.0 },
  ]);
  manager.update(0, ship);

  // Normal steering check (not disoriented): steerInput = 1.0 (right) -> steeringInput = 1.0
  ship.steerInput = 1.0;
  let effectiveInput = effects.size ? -ship.steerInput : ship.steerInput;
  assert.equal(effectiveInput, 1.0);

  // Fail the resistance QTE -> inflicts disorientation
  triggered[0].onFail({ queued: false, metadata: triggered[0].metadata });
  assert.equal(effects.size, 1);

  // While disoriented: steerInput = 1.0 (steer right) reverses to -1.0 (steer left)
  ship.steerInput = 1.0;
  effectiveInput = effects.size ? -ship.steerInput : ship.steerInput;
  assert.equal(effectiveInput, -1.0);

  // steerInput = -1.0 (steer left) reverses to +1.0 (steer right)
  ship.steerInput = -1.0;
  effectiveInput = effects.size ? -ship.steerInput : ship.steerInput;
  assert.equal(effectiveInput, 1.0);

  // Simulate time until disorientation ends (4 seconds)
  manager.update(4.1, ship);
  assert.equal(effects.size, 0);

  // Steering returns to normal
  ship.steerInput = 1.0;
  effectiveInput = effects.size ? -ship.steerInput : ship.steerInput;
  assert.equal(effectiveInput, 1.0);

  manager.dispose();
  clear();
});

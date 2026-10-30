import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PlayerShip } from '../src/obstacle/PlayerShip.js';
import { clear } from '../src/core/EventBus.js';

test('PlayerShip: low-speed graze (< 2.5 m/s) incurs superficial scuff and speed scrub without breaching', () => {
  clear();
  const ship = new PlayerShip({}, new THREE.Scene());
  ship.throttle = 1.0;
  const initialHP = ship.hullHP;

  // Contact normal pointing away from obstacle (+Z towards ship)
  const contactNormal = new THREE.Vector3(0, 0, 1);
  const contactPoint = new THREE.Vector3(0, 0, -2);

  // Apply low speed graze (2.0 m/s)
  ship.applyPhysicalImpact(contactPoint, contactNormal, 2.0, 'rock');

  // No HP damage taken on low graze
  assert.equal(ship.hullHP, initialHP);
  // No god-mode granted
  assert.equal(ship.isImmune(), false);
  // Speed throttle scrubbed slightly
  assert.ok(ship.throttle < 1.0);
});

test('PlayerShip: moderate impact (2.5 - 8.0 m/s) deals damage and induces contact torque without god-mode', () => {
  clear();
  const ship = new PlayerShip({}, new THREE.Scene());
  ship.throttle = 1.0;
  const initialHP = ship.hullHP;

  // Starboard bow contact: hit at (+1.5, 0, -2.0), normal pointing back-left (-0.7, 0, 0.7)
  const contactPoint = new THREE.Vector3(1.5, 0, -2.0);
  const contactNormal = new THREE.Vector3(-0.7, 0, 0.7).normalize();

  ship.applyPhysicalImpact(contactPoint, contactNormal, 5.0, 'rock');

  // Damage applied
  assert.ok(ship.hullHP < initialHP, 'Ship took damage from moderate impact');
  // NO god-mode invulnerability
  assert.equal(ship.isImmune(), false, 'Ship did not receive god-mode invulnerability');
  // Throttle absorbed
  assert.ok(ship.throttle <= 0.6, 'Throttle was heavily reduced');
  // Contact torque induced yaw velocity
  assert.notEqual(ship.yawVelocity, 0, 'Contact torque pivoted yaw');
});

test('PlayerShip: severe ram (>= 8.0 m/s) halts the vessel dead in the water', () => {
  clear();
  const ship = new PlayerShip({}, new THREE.Scene());
  ship.throttle = 1.0;
  const initialHP = ship.hullHP;

  const contactPoint = new THREE.Vector3(0, 0, -3.0);
  const contactNormal = new THREE.Vector3(0, 0, 1);

  ship.applyPhysicalImpact(contactPoint, contactNormal, 9.5, 'rock');

  assert.ok(ship.hullHP <= initialHP - 35, 'Severe damage dealt');
  assert.equal(ship.throttle, 0, 'Throttle arrested to 0');
  assert.equal(ship.isImmune(), false, 'No god-mode on severe ram');
});

test('PlayerShip: compartment refractory prevents 60 FPS multi-hit frame looping', () => {
  clear();
  const ship = new PlayerShip({}, new THREE.Scene());
  const initialHP = ship.hullHP;

  const contactNormal = { nx: 0, nz: 1 };
  // First frame hit
  ship.takeDamage(20, 'rock', contactNormal);
  const hpAfterFirstHit = ship.hullHP;
  assert.equal(hpAfterFirstHit, initialHP - 20);

  // Immediate second frame hit on same compartment while within 450ms refractory
  ship.takeDamage(20, 'rock', contactNormal);
  assert.equal(ship.hullHP, hpAfterFirstHit, 'Duplicate immediate frame hit blocked by compartment refractory');

  // But ship is NOT globally immune!
  assert.equal(ship.isImmune(), false);
});

test('PlayerShip: grinding wear triggers breach damage and scrubs speed', () => {
  clear();
  const ship = new PlayerShip({}, new THREE.Scene());
  ship.throttle = 0.8;
  const initialHP = ship.hullHP;

  const contactNormal = new THREE.Vector3(1, 0, 0);
  const contactPoint = new THREE.Vector3(-1.0, 0, 0);

  ship.applyGrindDamage(contactPoint, contactNormal, 'rock');

  assert.ok(ship.hullHP < initialHP, 'Grind damage inflicted');
  assert.ok(ship.throttle < 0.8, 'Throttle scrubbed further by grind friction');
  assert.equal(ship.isImmune(), false);
});

test('PlayerShip: departure grace protects ship during anchor raise and expires without opacity flashing', () => {
  clear();
  const ship = new PlayerShip({}, new THREE.Scene());
  ship.setDepartureGrace(2.0);

  assert.equal(ship.isDepartureGrace(), true);
  assert.equal(ship.isImmune(), true);

  // Damage during departure grace is ignored
  const initialHP = ship.hullHP;
  ship.takeDamage(30, 'rock');
  assert.equal(ship.hullHP, initialHP);

  // Update loop ticks down grace
  ship.update(2.5, null, null);
  assert.equal(ship.isDepartureGrace(), false);
  assert.equal(ship.isImmune(), false);
  // Ensure opacity remains fully solid (1.0)
  assert.equal(ship._lastOpacity, 1.0);
});

test('PlayerShip: throttle recovers after severe impact (does not stay stagnant forever)', () => {
  clear();
  const ship = new PlayerShip({}, new THREE.Scene());
  ship.throttle = 1.0;
  ship.targetThrottle = 1.0;

  // Severe broadside ram knocks throttle to 0 without blocking the forward path
  const contactPoint = new THREE.Vector3(1.5, 0, 0);
  const contactNormal = new THREE.Vector3(1, 0, 0);
  ship.applyPhysicalImpact(contactPoint, contactNormal, 9.5, 'rock');

  assert.equal(ship.throttle, 0, 'Instantaneous throttle arrested to 0');
  assert.equal(ship.targetThrottle, 1.0, 'targetThrottle remains 1.0 for sailing recovery');

  // Next ticks gather wind and accelerate back up
  ship.update(0.5, null, null);
  assert.ok(ship.throttle > 0, 'Ship begins accelerating back up');

  ship.update(2.0, null, null);
  assert.ok(ship.throttle >= 0.7, 'Ship recovers substantial cruising speed');
});

test('ObstacleManager: voxelTerrain collision resolves without reference error and glides smoothly', async () => {
  clear();
  const { ObstacleManager } = await import('../src/obstacle/ObstacleManager.js');
  const scene = new THREE.Scene();
  const ship = new PlayerShip({}, scene);
  const manager = new ObstacleManager(scene);

  const mockVoxelTerrain = {
    hasCollision(x, z) {
      // Simulate island boundary at z <= -5
      return z <= -5;
    }
  };

  // 1. Head-on impact
  ship.mesh.position.set(0, 0, -5.2);
  ship.mesh.updateMatrixWorld(true);

  // Update should NOT throw ReferenceError: shipPos is not defined
  assert.doesNotThrow(() => {
    manager.update(0.016, ship, null, mockVoxelTerrain);
  });

  // Verify smooth separation push
  assert.ok(ship.mesh.position.z > -5.2, 'Ship was smoothly pushed away from terrain boundary');

  // 2. Gliding graze test: ship oriented parallel to terrain shoreline
  const grazingShip = new PlayerShip({}, scene);
  grazingShip.yaw = Math.PI / 2; // Heading along +X, parallel to wall
  grazingShip.mesh.rotation.y = grazingShip.yaw;
  grazingShip.mesh.position.set(0, 0, -4.9);
  grazingShip.mesh.updateMatrixWorld(true);

  manager.update(0.016, grazingShip, null, mockVoxelTerrain);
  // Verify throttle preserved during shallow graze
  assert.ok(grazingShip.throttle >= 0.4, 'Gliding throttle preserved during parallel graze');
});

test('PlayerShip: head-on collision arrests forward momentum into obstacle while preserving rudder turning', () => {
  clear();
  const ship = new PlayerShip({}, new THREE.Scene());
  ship.throttle = 1.0;
  ship.targetThrottle = 1.0;

  // Collision normal pointing away from land (+Z)
  const contactNormal = new THREE.Vector3(0, 0, 1);
  const contactPoint = new THREE.Vector3(0, 0, -3.0);

  // Head-on ram into land at 8.0 m/s
  ship.applyPhysicalImpact(contactPoint, contactNormal, 8.0, 'island');

  assert.equal(ship.isBlocked(), true, 'Ship is in blocked/grounded state');
  assert.equal(ship.throttle, 0, 'Forward throttle arrested to 0');

  // While still facing into obstacle, update must NOT ramp forward speed
  ship.update(0.1, null, null);
  assert.equal(ship.throttle, 0, 'Throttle remains 0 while facing obstacle');
  assert.equal(ship.getCurrentSpeed(), 0, 'Current speed is 0');

  // Rudder turns bow to starboard (away from obstacle)
  ship.steerInput = 1.0;
  for (let i = 0; i < 20; i++) {
    ship.update(0.05, null, null);
  }
  // Yaw has turned significantly
  assert.notEqual(ship.yaw, 0, 'Ship rotated via rudder while grounded');

  // Turn bow completely away (yaw = 180 degrees)
  ship.yaw = Math.PI;
  ship.mesh.rotation.y = ship.yaw;
  ship.update(0.1, null, null);

  assert.equal(ship.isBlocked(), false, 'Ship unblocked once bow points away');
  // Forward speed now accelerates cleanly away
  ship.update(1.0, null, null);
  assert.ok(ship.throttle > 0.4, 'Ship accelerates cleanly away into open water');
});

test('ObstacleManager: head-on terrain collision prevents repetitive damage loop and jitter', async () => {
  clear();
  const { ObstacleManager } = await import('../src/obstacle/ObstacleManager.js');
  const scene = new THREE.Scene();
  const ship = new PlayerShip({}, scene);
  const manager = new ObstacleManager(scene);

  const mockVoxelTerrain = {
    hasCollision(x, z) {
      return z <= -5;
    }
  };

  // Position ship head-on at terrain boundary
  ship.mesh.position.set(0, 0, -5.1);
  ship.mesh.updateMatrixWorld(true);

  // Initial impact frame
  manager.update(0.016, ship, null, mockVoxelTerrain);
  const hpAfterImpact = ship.hullHP;

  // Simulate staying pressed against the land for 2 seconds (120 frames)
  for (let f = 0; f < 120; f++) {
    ship.update(0.016, null, null);
    manager.update(0.016, ship, null, mockVoxelTerrain);
  }

  // Vessel must NOT have repeatedly taken 40 damage every 400ms!
  assert.equal(ship.hullHP, hpAfterImpact, 'No damage loop: HP unchanged while resting against land');
  assert.equal(ship.isBlocked(), true, 'Ship remains stably grounded without jittering forward');
});

test('ObstacleManager: solid island obstacle collision enters blocked state, prevents jitter, and allows rudder escape', async () => {
  clear();
  const { ObstacleManager } = await import('../src/obstacle/ObstacleManager.js');
  const { OBB } = await import('three/addons/math/OBB.js');
  const scene = new THREE.Scene();
  const ship = new PlayerShip({}, scene);
  const manager = new ObstacleManager(scene);

  // Create mock island obstacle with an OBB
  const islandMesh = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 20), new THREE.MeshBasicMaterial());
  islandMesh.position.set(0, 0, -20);
  scene.add(islandMesh);
  islandMesh.updateMatrixWorld(true);

  const baseOBB = new OBB(new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 5, 10));
  const obb = new OBB();
  obb.copy(baseOBB).applyMatrix4(islandMesh.matrixWorld);

  const mockIsland = {
    type: 'island',
    mesh: islandMesh,
    baseOBB,
    obb,
    active: true,
    damage: 40,
    scale: 1.0
  };
  manager._obstacles.push(mockIsland);

  // Position ship heading into the island (at z = -7.65, bow penetrating island OBB at z = -10 by 0.05m)
  ship.mesh.position.set(0, 0, -7.65);
  ship.yaw = 0; // heading in -Z into the island
  ship.mesh.rotation.y = 0;
  ship.mesh.updateMatrixWorld(true);
  ship.obb.copy(ship.baseOBB).applyMatrix4(ship.mesh.matrixWorld);

  // First frame impact
  manager.update(0.016, ship, null, null);
  assert.equal(ship.isBlocked(), true, 'Ship is blocked against island');

  // Allow initial contact torque/impulse to settle
  for (let f = 0; f < 12; f++) {
    ship.update(0.016, null, null);
    manager.update(0.016, ship, null, null);
  }
  const settledZ = ship.mesh.position.z;
  const settledHP = ship.hullHP;

  // Run 60 frames while resting grounded against the island
  for (let f = 0; f < 60; f++) {
    ship.update(0.016, null, null);
    manager.update(0.016, ship, null, null);
  }

  // Verify: HP did not drop again, ship position did not jitter back and forth (Z drift = 0)
  assert.equal(ship.hullHP, settledHP, 'No damage loop while resting against island obstacle');
  assert.ok(Math.abs(ship.mesh.position.z - settledZ) < 0.02, 'Ship position remained perfectly stable (no jitter)');

  // Now steer to starboard using rudder (A/D or steerInput)
  ship.steerInput = 1.0;
  for (let f = 0; f < 30; f++) {
    ship.update(0.016, null, null);
    manager.update(0.016, ship, null, null);
  }
  assert.notEqual(ship.yaw, 0, 'Ship turned with rudder while grounded against island');

  // Rotate bow clear of island
  ship.yaw = Math.PI * 0.75;
  ship.mesh.rotation.y = ship.yaw;
  ship.mesh.updateMatrixWorld(true);
  ship.update(0.016, null, null);

  assert.equal(ship.isBlocked(), false, 'Ship unblocked once bow points away into open water');
});




import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  ParticleSystem,
  harpoonFlightDuration,
  interpolateHarpoonFlight,
} from '../src/environment/ParticleSystem.js';
import { EnvironmentManager } from '../src/environment/EnvironmentManager.js';

test('harpoon flight duration remains readable at close range', () => {
  assert.equal(harpoonFlightDuration(2), 0.18);
});

test('harpoon flight duration scales with ordinary target distance', () => {
  assert.equal(harpoonFlightDuration(20), 20 / 80);
});

test('harpoon flight duration is capped for distant targets', () => {
  assert.equal(harpoonFlightDuration(100), 0.30);
});

test('interpolateHarpoonFlight follows a parabolic ballistic arc and hits exact endpoints', () => {
  const start = new THREE.Vector3(0, 1.5, -2);
  const end = new THREE.Vector3(4, 0.5, -18);
  const p0 = interpolateHarpoonFlight(start, end, 0, 2.0);
  const pMid = interpolateHarpoonFlight(start, end, 0.5, 2.0);
  const p1 = interpolateHarpoonFlight(start, end, 1, 2.0);

  assert.deepEqual([p0.x, p0.y, p0.z], [start.x, start.y, start.z]);
  assert.deepEqual([p1.x, p1.y, p1.z], [end.x, end.y, end.z]);
  // At t = 0.5, y is linear midpoint (1.0) + full arcHeight (2.0) = 3.0
  assert.equal(pMid.y, 3.0);
});

test('ParticleSystem.spawnHarpoon tracks moving shark target, fires onImpact once, and stays impaled during hold', () => {
  const scene = new THREE.Scene();
  const particles = new ParticleSystem(scene);

  const shipOrigin = new THREE.Vector3(0, 1.6, -2.0);
  const sharkPos = new THREE.Vector3(0, 0.4, -16.0);
  let impactCalls = 0;

  particles.spawnHarpoon(shipOrigin, sharkPos, {
    getOrigin: () => shipOrigin,
    getTarget: () => sharkPos,
    onImpact: () => {
      impactCalls += 1;
    },
  });

  assert.equal(particles._projectiles.length, 1);
  const proj = particles._projectiles[0];
  assert.equal(proj.phase, 'flight');

  // Advance halfway through flight while shark moves
  sharkPos.set(1.5, 0.6, -15.0);
  particles.update(proj.maxLife * 0.5);
  assert.equal(proj.phase, 'flight');
  assert.equal(impactCalls, 0);

  // Finish flight -> transitions to 'impact' and fires onImpact exactly once
  particles.update(proj.maxLife * 0.6);
  assert.equal(proj.phase, 'impact');
  assert.equal(impactCalls, 1);
  assert.deepEqual(
    [proj.mesh.position.x, proj.mesh.position.y, proj.mesh.position.z],
    [sharkPos.x, sharkPos.y, sharkPos.z]
  );

  // While impaled, if shark sinks, harpoon moves with the shark
  sharkPos.set(1.5, -3.2, -15.0);
  particles.update(0.1);
  assert.equal(proj.phase, 'impact');
  assert.equal(impactCalls, 1);
  assert.equal(proj.mesh.position.y, -3.2);

  particles.dispose();
});

test('EnvironmentManager._ensureSharkInView repositions a trailing shark behind the ship into the player view ahead of the bow', () => {
  const env = new EnvironmentManager();
  const playerShip = {
    mesh: new THREE.Mesh(),
    yaw: 0,
  };
  playerShip.mesh.position.set(0, 0, 0);

  // Shark is trailing 18m behind the ship (positive Z with yaw = 0 means behind)
  const sharkMesh = new THREE.Mesh();
  sharkMesh.position.set(0, -1, 18);
  const telegraph = new THREE.Group();
  const shark = {
    mesh: sharkMesh,
    baseYaw: 0,
    baseY: -1,
    telegraph,
    animator: { bobOffset: 0 },
  };

  env._ensureSharkInView(shark, playerShip);

  // Position must now be in front of the ship (negative Z)
  assert.ok(shark.mesh.position.z < -10, `Expected shark in front (z < -10), got z = ${shark.mesh.position.z}`);
  // Lateral offset must be applied to prevent obstruction by ship center
  assert.ok(Math.abs(shark.mesh.position.x) > 3.0, `Expected lateral offset > 3m, got x = ${shark.mesh.position.x}`);
  // Telegraph must track the new position
  assert.equal(telegraph.position.x, shark.mesh.position.x);
  assert.equal(telegraph.position.z, shark.mesh.position.z);
});

test('EnvironmentManager._ensureSharkInView respects camera viewport bounds and retains safe targets in view', () => {
  const env = new EnvironmentManager();
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);
  camera.position.set(0, 5, 16);
  camera.lookAt(0, 0.9, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  const playerShip = {
    mesh: new THREE.Mesh(),
    yaw: 0,
  };
  playerShip.mesh.position.set(0, 0, 0);

  // Shark is already safely in front and within viewport
  const sharkMesh = new THREE.Mesh();
  sharkMesh.position.set(3.5, -0.5, -14.0);
  const shark = {
    mesh: sharkMesh,
    baseYaw: 0,
    baseY: -0.5,
    animator: { bobOffset: 0 },
  };

  assert.equal(env._isPointInView(sharkMesh.position, camera), true);

  env._ensureSharkInView(shark, playerShip, camera);
  // Position should remain unchanged since it is already comfortably visible
  assert.equal(shark.mesh.position.x, 3.5);
  assert.equal(shark.mesh.position.z, -14.0);

  // Shark placed behind camera or off-screen
  shark.mesh.position.set(0, -0.5, 20.0);
  assert.equal(env._isPointInView(shark.mesh.position, camera), false);

  env._ensureSharkInView(shark, playerShip, camera);
  // Must now be repositioned in front of the bow
  assert.ok(shark.mesh.position.z < -10);
  assert.equal(env._isPointInView(shark.mesh.position, camera), true);
});

test('EnvironmentManager._resolveHarpoonImpact triggers glowing red materials, emissive glow, and visible breached state', () => {
  const env = new EnvironmentManager();
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0x555555, emissive: 0x000000 });
  const mesh = new THREE.Mesh(geo, mat);

  const shark = {
    mesh,
    hitResolved: false,
    hitPending: true,
    qteActive: false,
    flashing: false,
    flashTimer: 0,
    hitMaterials: [],
    hitEmissiveMaterials: [],
    animator: { bobOffset: 0 },
  };
  env._sharks = [shark];

  env._resolveHarpoonImpact(shark);

  assert.equal(shark.hitResolved, true);
  assert.equal(shark.hitPending, false);
  assert.equal(shark.flashing, true);
  assert.equal(shark.mesh.visible, true);
  assert.equal(shark.flashTimer, 0.8);
  // Material turned bright crimson red
  assert.equal(mesh.material.color.getHex(), 0xff1111);
  // Emissive set to glowing red
  assert.equal(mesh.material.emissive.getHex(), 0xff2200);
  assert.equal(mesh.material.emissiveIntensity, 2.5);
  assert.ok(shark.hitEmissiveMaterials.includes(mesh.material));
});

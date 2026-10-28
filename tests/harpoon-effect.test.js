import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  ParticleSystem,
  harpoonFlightDuration,
  interpolateHarpoonFlight,
} from '../src/environment/ParticleSystem.js';

test('harpoon flight duration remains readable at close range', () => {
  assert.equal(harpoonFlightDuration(2), 0.16);
});

test('harpoon flight duration scales with ordinary target distance', () => {
  assert.equal(harpoonFlightDuration(18), 18 / 85);
});

test('harpoon flight duration is capped for distant targets', () => {
  assert.equal(harpoonFlightDuration(100), 0.32);
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

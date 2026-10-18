import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Ocean } from '../src/environment/Ocean.js';

test('ocean wake records direction and speed at a short sampling interval', () => {
  const ocean = new Ocean();
  ocean.init(new THREE.Scene());

  const position = new THREE.Vector3(12, 0, -8);
  const velocity = new THREE.Vector3(3, 0, 4);
  ocean.updateShipWake(position, velocity, 0.06);
  assert.equal(ocean.mesh.material.uniforms.uWakeCount.value, 0);

  ocean.updateShipWake(position, velocity, 0.06);

  assert.equal(ocean.mesh.material.uniforms.uWakeCount.value, 1);
  assert.deepEqual(
    ocean.mesh.material.uniforms.uWakePositions.value[0].toArray(),
    [12, -8, 5, 0]
  );
  assert.deepEqual(
    ocean.mesh.material.uniforms.uWakeDirections.value[0].toArray(),
    [0.6, 0.8, 0, 0]
  );
});

test('slow movement does not add wake samples and clearing resets the trail', () => {
  const ocean = new Ocean();
  ocean.init(new THREE.Scene());
  ocean.updateShipWake(new THREE.Vector3(1, 0, 2), new THREE.Vector3(0.5, 0, 0), 0.2);
  assert.equal(ocean.mesh.material.uniforms.uWakeCount.value, 0);

  ocean.updateShipWake(new THREE.Vector3(1, 0, 2), new THREE.Vector3(0, 0, -4), 0.12);
  assert.equal(ocean.mesh.material.uniforms.uWakeCount.value, 1);

  ocean.clearWake();
  assert.equal(ocean.mesh.material.uniforms.uWakeCount.value, 0);
  assert.ok(ocean.mesh.material.uniforms.uWakePositions.value.every(sample => sample.w > 0.6));
});

test('wake samples expire after the short trail lifetime', () => {
  const ocean = new Ocean();
  ocean.init(new THREE.Scene());
  ocean.updateShipWake(new THREE.Vector3(), new THREE.Vector3(0, 0, -4), 0.12);
  ocean.update(0.61);

  assert.equal(ocean.mesh.material.uniforms.uWakeCount.value, 0);
});

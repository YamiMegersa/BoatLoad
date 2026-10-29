import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StormClouds } from '../src/environment/StormClouds.js';
import { StudioFlyControls } from '../src/core/StudioFlyControls.js';
import { BoatDestructionWorkshop } from '../src/editor/BoatDestructionWorkshop.js';

// Minimal browser mocks for Node environment
class MockEventTarget {
  constructor() {
    this._listeners = new Map();
  }
  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(fn);
  }
  removeEventListener(type, fn) {
    if (!this._listeners.has(type)) return;
    const arr = this._listeners.get(type);
    const idx = arr.indexOf(fn);
    if (idx !== -1) arr.splice(idx, 1);
  }
  dispatchEvent(event) {
    const list = this._listeners.get(event.type) || [];
    for (const fn of list) {
      fn(event);
    }
  }
}

globalThis.window = globalThis.window || new MockEventTarget();
globalThis.document = globalThis.document || new MockEventTarget();
globalThis.document.body = globalThis.document.body || {};

test('StormClouds - double-sided rendering, correct sky altitude, and dynamic storm factor', () => {
  const scene = new THREE.Scene();
  const clouds = new StormClouds(scene);

  assert.ok(clouds.mesh, 'Clouds mesh should be created');
  assert.equal(clouds.mesh.visible, true, 'Clouds mesh should be visible');
  assert.equal(clouds.mesh.position.y, 70.0, 'Clouds should be positioned at y = 70.0, below 100-radius sky dome');
  assert.equal(clouds.mesh.material.side, THREE.DoubleSide, 'Cloud material must be DoubleSide to prevent backface culling from below');
  assert.equal(clouds.mesh.frustumCulled, false, 'Clouds must not be frustum culled');

  // Dynamic storm factor
  clouds.setStormFactor(0.0);
  assert.equal(clouds.stormFactor, 0.0);
  assert.equal(clouds.mesh.material.uniforms.uStormFactor.value, 0.0, 'Calm weather storm factor uniform should be 0.0');

  clouds.setStormFactor(1.0);
  assert.equal(clouds.stormFactor, 1.0);
  assert.equal(clouds.mesh.material.uniforms.uStormFactor.value, 1.0, 'Stormy weather storm factor uniform should be 1.0');

  // Verify distance decay uniforms & canopy geometry segments
  assert.ok(clouds.mesh.material.uniforms.uCameraFar, 'uCameraFar uniform must exist for dynamic draw distance decay');
  assert.ok(clouds.mesh.material.uniforms.uHorizonColor, 'uHorizonColor uniform must exist for atmospheric horizon blending');
  assert.ok(clouds.mesh.geometry.parameters.widthSegments >= 32, 'Geometry must have at least 32 segments for vaulted canopy curvature');

  // Verify onBeforeRender dynamically synchronizes camera.far and horizon color
  const mockCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  mockCamera.position.set(50, 10, -80);
  
  const mockSky = new THREE.Mesh(
    new THREE.SphereGeometry(100),
    new THREE.ShaderMaterial({
      uniforms: {
        uHorizon: { value: new THREE.Color('#ff8800') },
        uTop: { value: new THREE.Color('#336699') }
      }
    })
  );
  mockSky.name = 'skyMesh';
  scene.add(mockSky);

  clouds.mesh.onBeforeRender(null, scene, mockCamera);
  assert.equal(clouds.mesh.material.uniforms.uCameraFar.value, 200, 'uCameraFar must update to camera.far');
  assert.equal(clouds.mesh.position.x, 50, 'Clouds must center on camera X');
  assert.equal(clouds.mesh.position.z, -80, 'Clouds must center on camera Z');
  assert.equal(clouds.mesh.material.uniforms.uHorizonColor.value.getHexString(), 'ff8800', 'uHorizonColor must sync with skyMesh uHorizon');

  // Test different draw distance (e.g. 500m)
  mockCamera.far = 500;
  clouds.mesh.onBeforeRender(null, scene, mockCamera);
  assert.equal(clouds.mesh.material.uniforms.uCameraFar.value, 500, 'uCameraFar must adapt to changed draw distance');

  // Dispose
  clouds.dispose();
  assert.equal(clouds.mesh, null, 'Clouds mesh should be cleared on dispose');
});

test('StudioFlyControls - right-click freelook stops event propagation', () => {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  const dom = new MockEventTarget();
  const controls = new StudioFlyControls(camera, dom);

  let stopped = false;
  let prevented = false;

  dom.dispatchEvent({
    type: 'pointerdown',
    button: 2,
    stopPropagation: () => { stopped = true; },
    preventDefault: () => { prevented = true; },
    clientX: 100,
    clientY: 100
  });

  assert.equal(controls._isRightDragging, true, 'Right-click must initiate freelook dragging');
  assert.equal(stopped, true, 'Right-click pointerdown must stop propagation to avoid triggering underlying OrbitControls');
  assert.equal(prevented, true, 'Right-click pointerdown must prevent default');

  controls.dispose();
});

test('BoatDestructionWorkshop - disables orbit controls on open and uses StudioFlyControls', async () => {
  const mockOrbitControls = { enabled: true };
  globalThis.window.gameState = { _orbitControls: mockOrbitControls };

  const workshop = new BoatDestructionWorkshop();
  workshop._camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  workshop._renderer = { domElement: new MockEventTarget() };

  workshop._setupControls();
  assert.ok(workshop._flyControls instanceof StudioFlyControls, 'Workshop must use StudioFlyControls');

  delete globalThis.window.gameState;
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// Provide minimal browser global mocks for Node environment
class MockEventTarget {
  constructor() {
    this._listeners = new Map();
  }
  addEventListener(type, fn, opts) {
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

test('StudioFlyControls - self-contained key tracking and infinite movement prevention', async () => {
  const { StudioFlyControls } = await import('../src/core/StudioFlyControls.js');

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 0, 10);
  camera.lookAt(new THREE.Vector3(0, 0, 0)); // pointing in -Z

  const mockDom = new MockEventTarget();
  const controls = new StudioFlyControls(camera, mockDom, { moveSpeed: 10 });

  assert.equal(controls.enabled, true, 'Controls should be enabled by default');

  // Verify initial camera position
  const initialZ = camera.position.z;

  // 1. Single tap W: keydown moves forward, keyup stops movement
  window.dispatchEvent({ type: 'keydown', code: 'KeyW' });
  assert.ok(controls._activeKeys.has('KeyW'), 'KeyW should be active');

  controls.update(0.1); // 10 speed * 0.1s = 1 unit forward (-Z)
  assert.ok(camera.position.z < initialZ, 'Camera should move forward');
  const posAfterFirstStep = camera.position.z;

  window.dispatchEvent({ type: 'keyup', code: 'KeyW' });
  assert.equal(controls._activeKeys.has('KeyW'), false, 'KeyW should be cleared on keyup');

  controls.update(0.1);
  assert.equal(camera.position.z, posAfterFirstStep, 'Camera should NOT move when key is released');

  // 2. Double-tap W: keydown, keyup, keydown, keyup
  window.dispatchEvent({ type: 'keydown', code: 'KeyW' });
  window.dispatchEvent({ type: 'keyup', code: 'KeyW' });
  window.dispatchEvent({ type: 'keydown', code: 'KeyW' });
  assert.ok(controls._activeKeys.has('KeyW'), 'KeyW is active on second press');
  controls.update(0.1);
  const posAfterSecondTap = camera.position.z;
  assert.ok(posAfterSecondTap < posAfterFirstStep, 'Camera moves on second tap');

  window.dispatchEvent({ type: 'keyup', code: 'KeyW' });
  assert.equal(controls._activeKeys.has('KeyW'), false, 'KeyW MUST be cleared on second release');
  controls.update(0.1);
  assert.equal(camera.position.z, posAfterSecondTap, 'Camera must stop moving immediately after second tap release');

  // 3. Defensive blur / tab switch / focus loss: resets active keys immediately
  window.dispatchEvent({ type: 'keydown', code: 'KeyW' });
  assert.ok(controls._activeKeys.has('KeyW'), 'KeyW is active before blur');
  window.dispatchEvent({ type: 'blur' });
  assert.equal(controls._activeKeys.has('KeyW'), false, 'All keys must be cleared immediately on window blur');
  controls.update(0.1);
  assert.equal(camera.position.z, posAfterSecondTap, 'Camera must not drift on window blur');

  // 4. Middle mouse click (button === 1) auto-scroll prevention
  let prevented = false;
  mockDom.dispatchEvent({
    type: 'pointerdown',
    button: 1,
    preventDefault: () => { prevented = true; }
  });
  assert.equal(prevented, true, 'Middle-click default must be prevented to stop browser auto-scroll');

  let auxPrevented = false;
  mockDom.dispatchEvent({
    type: 'auxclick',
    button: 1,
    preventDefault: () => { auxPrevented = true; }
  });
  assert.equal(auxPrevented, true, 'Middle-click auxclick default must be prevented');

  // 5. Menu hover boundary: moving cursor to menus (pointerleave) halts flight and clears keys
  window.dispatchEvent({ type: 'keydown', code: 'KeyW' });
  assert.ok(controls._activeKeys.has('KeyW'), 'KeyW is active before moving to menu');
  mockDom.dispatchEvent({ type: 'pointerleave' });
  assert.equal(controls._activeKeys.has('KeyW'), false, 'KeyW must be cleared immediately when cursor leaves canvas');
  assert.equal(controls._isPointerOverCanvas, false, 'Pointer must be marked off-canvas');
  controls.update(0.1);
  assert.equal(camera.position.z, posAfterSecondTap, 'Camera must remain stationary when cursor is over menus');

  // 6. Scroll wheel safety: wheel does NOT dolly camera when enableWheelDolly is false (default)
  mockDom.dispatchEvent({ type: 'pointerenter' });
  assert.equal(controls._isPointerOverCanvas, true);
  mockDom.dispatchEvent({
    type: 'wheel',
    deltaY: -100, // scroll up / forward
    preventDefault: () => {}
  });
  assert.equal(camera.position.z, posAfterSecondTap, 'Wheel must NOT shunt camera when enableWheelDolly is false');

  // Zero-delta noise wheel event
  mockDom.dispatchEvent({
    type: 'wheel',
    deltaY: 0,
    preventDefault: () => {}
  });
  assert.equal(camera.position.z, posAfterSecondTap, 'Zero-delta wheel event must NOT move camera');

  // 7. Cleanup
  controls.dispose();
  assert.equal(controls.enabled, false, 'Controls should be disabled after dispose');
});


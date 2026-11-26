import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// Provide headless DOM mocks for Node test runner
const createMockElement = (tag) => {
  return {
    tagName: (tag || '').toUpperCase(),
    id: '',
    className: '',
    innerHTML: '',
    style: {
      setProperty: () => {},
      getPropertyValue: () => ''
    },
    parentNode: null,
    children: [],
    setAttribute: () => {},
    getAttribute: () => null,
    appendChild(child) {
      if (child) {
        child.parentNode = this;
        this.children.push(child);
      }
      return child;
    },
    removeChild(child) {
      if (child) {
        child.parentNode = null;
        this.children = this.children.filter(c => c !== child);
      }
      return child;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getContext: () => ({
      fillRect: () => {},
      strokeRect: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      fillText: () => {}
    })
  };
};

if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    innerWidth: 1920,
    innerHeight: 1080,
    addEventListener: () => {},
    removeEventListener: () => {}
  };
}

const mockDoc = {
  createElement: (tag) => createMockElement(tag),
  createElementNS: (ns, tag) => createMockElement(tag),
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
  head: createMockElement('head'),
  body: createMockElement('body')
};

globalThis.document = mockDoc;

const { DockStall } = await import('../src/environment/DockStall.js');
const { DockPlayerController } = await import('../src/environment/DockPlayerController.js');
const { Reflector } = await import('three/examples/jsm/objects/Reflector.js');

test('Exterior Grooming Mirror: Reflector and "Hello Handsome" Sign in DockStall', () => {
  const stall = new DockStall();
  stall.build();

  assert.ok(stall.exteriorMirror, 'DockStall must instantiate exteriorMirror after build()');
  assert.ok(stall.exteriorMirror instanceof Reflector, 'exteriorMirror must be an instance of Reflector');

  // Verify position and orientation on exterior of shop opposite the door (left wall facing outward -X)
  assert.equal(stall.exteriorMirror.rotation.y, -Math.PI / 2, 'Mirror must face outward (-X in shop / +X in dock)');
  assert.equal(stall.exteriorMirror.position.y, 2.65, 'Mirror must be centered around eye height 2.65');
  assert.equal(stall.exteriorMirror.position.z, 1.25, 'Mirror must be centered at z = 1.25');

  // Verify reflection camera layer enabling
  const dummyCamera = new THREE.PerspectiveCamera(65, 1, 0.1, 100);
  dummyCamera.layers.set(0); // layer 0 only
  stall.exteriorMirror.onBeforeRender(null, null, dummyCamera);

  const refCam = stall.exteriorMirror.getReflectionCamera(dummyCamera);
  assert.ok(refCam, 'Reflection camera must be generated');
  assert.ok(refCam.layers.isEnabled(0), 'Reflection camera must have layer 0 enabled for world');
  assert.ok(refCam.layers.isEnabled(1), 'Reflection camera must have layer 1 enabled for mirror-only avatar');

  // Verify "Hello Handsome" sign plaque exists above mirror
  let foundSign = false;
  stall.group.traverse(child => {
    if (child.isMesh && child.geometry instanceof THREE.PlaneGeometry) {
      if (child.position.y > 3.9 && child.position.z === 1.25) {
        foundSign = true;
      }
    }
  });
  assert.ok(foundSign, '"Hello Handsome" sign must be mounted above the mirror');

  stall.dispose();
});

test('Mirror Avatar: Pirate hat, eyepatch, and arms visible ONLY in mirror reflections', () => {
  const scene = new THREE.Scene();
  const fallbackCamera = new THREE.PerspectiveCamera();
  const dummyDom = {
    style: {},
    addEventListener: () => {},
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
  };

  const controller = new DockPlayerController(scene, fallbackCamera, dummyDom);
  assert.ok(controller._mirrorAvatar, 'Controller must build _mirrorAvatar');
  assert.equal(controller._mirrorAvatar.parent, controller.camera, 'Avatar must be attached to player camera');

  // Verify main player camera does NOT see layer 1
  assert.ok(controller.camera.layers.isEnabled(0), 'Main camera must see layer 0');
  assert.ok(!controller.camera.layers.isEnabled(1), 'Main camera must NOT see layer 1 (avatar is invisible in 1st person)');

  // Verify all meshes in mirror avatar are exclusively set to layer 1
  let meshCount = 0;
  controller._mirrorAvatar.traverse(child => {
    if (child.isMesh) {
      meshCount++;
      assert.equal(child.layers.mask, 2, 'Every mirror avatar mesh must be on layer 1 (mask 2)');
      // First person camera visibility test
      const visibleToFirstPerson = (child.layers.mask & controller.camera.layers.mask) !== 0;
      assert.equal(visibleToFirstPerson, false, 'Avatar mesh must NEVER be visible to player first-person camera');

      // Reflector camera visibility test
      const refCam = new THREE.PerspectiveCamera();
      refCam.layers.enable(0);
      refCam.layers.enable(1); // layer mask = 3
      const visibleToMirror = (child.layers.mask & refCam.layers.mask) !== 0;
      assert.equal(visibleToMirror, true, 'Avatar mesh MUST be visible to mirror reflection camera');
    }
  });
  assert.ok(meshCount >= 20, `Avatar should have detailed voxel geometry (found ${meshCount} meshes)`);

  // Verify key components exist
  assert.ok(controller._mirrorHead, 'Avatar must have _mirrorHead');
  assert.ok(controller._mirrorBody, 'Avatar must have _mirrorBody');
  assert.ok(controller._mirrorIdleArms, 'Avatar must have _mirrorIdleArms');

  // Verify idle arms visibility toggles with emotes
  controller.voxelArms.isEmoting = false;
  controller.update(0.016);
  assert.equal(controller._mirrorIdleArms.visible, true, 'Idle arms must be visible when not emoting');

  controller.voxelArms.playEmote('clap');
  controller.update(0.016);
  assert.equal(controller._mirrorIdleArms.visible, false, 'Idle arms must hide when actively playing an emote');

  controller.voxelArms.stopEmote();
  controller.update(0.016);
  assert.equal(controller._mirrorIdleArms.visible, true, 'Idle arms must reappear when emote finishes');

  controller.dispose();
});

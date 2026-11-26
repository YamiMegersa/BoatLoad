import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

class MockEventTarget {
  constructor() {
    this._listeners = new Map();
  }
  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(fn);
  }
  removeEventListener(type, fn) {
    const arr = this._listeners.get(type);
    if (!arr) return;
    const idx = arr.indexOf(fn);
    if (idx !== -1) arr.splice(idx, 1);
  }
  dispatchEvent(event) {
    const list = this._listeners.get(event.type) || [];
    for (const fn of [...list]) fn(event);
  }
}

function makeFakeGamepad(overrides = {}) {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  const axes = [0, 0, 0, 0];
  return {
    index: 0,
    id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
    connected: true,
    mapping: 'standard',
    buttons,
    axes,
    vibrationActuator: {
      calls: [],
      playEffect(type, params) {
        this.calls.push({ type, params });
        return Promise.resolve('complete');
      },
    },
    ...overrides,
  };
}

function setBtn(pad, idx, valueOrPressed) {
  if (typeof valueOrPressed === 'number') {
    pad.buttons[idx] = { pressed: valueOrPressed >= 0.5, value: valueOrPressed };
  } else {
    pad.buttons[idx] = { pressed: Boolean(valueOrPressed), value: valueOrPressed ? 1 : 0 };
  }
}

globalThis.window = globalThis.window || new MockEventTarget();
globalThis.document = globalThis.document || new MockEventTarget();
globalThis.document.body = globalThis.document.body || {
  classList: {
    _set: new Set(),
    toggle(name, force) {
      if (force === undefined) {
        if (this._set.has(name)) this._set.delete(name);
        else this._set.add(name);
      } else if (force) {
        this._set.add(name);
      } else {
        this._set.delete(name);
      }
    },
    contains(name) {
      return this._set.has(name);
    },
  },
};

const {
  XBOX_BUTTON,
  CONTROL_SCHEMES,
  applyRadialDeadzone,
  applyAxisDeadzone,
  GamepadManager,
} = await import('../src/core/GamepadManager.js');
const { GamepadNavigator } = await import('../src/core/GamepadNavigator.js');
const { GamepadRouter } = await import('../src/core/GamepadRouter.js');
const { StudioFlyControls } = await import('../src/core/StudioFlyControls.js');
const { QTESystem } = await import('../src/obstacle/QTESystem.js');
const { BuildSystem } = await import('../src/shipyard/BuildSystem.js');
const { VoxelGrid, CellState } = await import('../src/shipyard/VoxelGrid.js');
const { emit, on, off, clear } = await import('../src/core/EventBus.js');

test('Deadzone math: radial & axial deadzones, monotonicity, and diagonal preservation', () => {
  assert.deepEqual(applyRadialDeadzone(0.05, 0.05, 0.15), { x: 0, y: 0, magnitude: 0 });
  assert.equal(applyAxisDeadzone(0.1, 0.15), 0);

  const diag = applyRadialDeadzone(0.5, 0.5, 0.15, 0.95, 1.6);
  assert.ok(diag.magnitude > 0 && diag.magnitude < 1);
  assert.ok(Math.abs(diag.x - diag.y) < 1e-9, 'Diagonal direction vector must be preserved');

  const small = applyAxisDeadzone(0.35, 0.15, 0.95, 1.4);
  const large = applyAxisDeadzone(0.85, 0.15, 0.95, 1.4);
  assert.ok(large > small && small > 0, 'Response curve must be strictly monotonic');
  assert.equal(applyAxisDeadzone(-1.0, 0.15, 0.95, 1.4), -1);
});

test('GamepadManager: trigger hysteresis, edge detection, nav auto-repeat, mode switch & haptics gating', () => {
  let activePad = makeFakeGamepad();
  const settingsMap = {
    gamepadDeadzone: 0.15,
    gamepadSensitivity: 1.0,
    gamepadInvertY: false,
    gamepadVibration: true,
    gamepadShowHints: true,
  };
  const mockSettings = { get: (k) => settingsMap[k] };

  const gm = new GamepadManager({
    getGamepads: () => (activePad ? [activePad] : []),
    settingsManager: mockSettings,
  });

  // Connect & edge detect A
  setBtn(activePad, XBOX_BUTTON.A, true);
  gm.poll(100);
  assert.equal(gm.connected, true);
  assert.equal(gm.isGamepadActive(), true);
  assert.equal(gm.isJustPressed(XBOX_BUTTON.A), true);
  assert.equal(gm.isPressed(XBOX_BUTTON.A), true);

  gm.poll(116);
  assert.equal(gm.isJustPressed(XBOX_BUTTON.A), false);
  setBtn(activePad, XBOX_BUTTON.A, false);
  gm.poll(132);
  assert.equal(gm.isJustReleased(XBOX_BUTTON.A), true);

  // Trigger hysteresis (press at 0.45+, stay pressed at 0.30, release below 0.25)
  setBtn(activePad, XBOX_BUTTON.RT, 0.50);
  gm.poll(200);
  assert.equal(gm.isJustPressed(XBOX_BUTTON.RT), true);
  setBtn(activePad, XBOX_BUTTON.RT, 0.30);
  gm.poll(216);
  assert.equal(gm.isPressed(XBOX_BUTTON.RT), true, 'Trigger should remain pressed above release threshold');
  setBtn(activePad, XBOX_BUTTON.RT, 0.20);
  gm.poll(232);
  assert.equal(gm.isJustReleased(XBOX_BUTTON.RT), true);

  // Nav auto-repeat: initial fire at t=300, blocked at 500, repeats at 620+, then at 730+
  setBtn(activePad, XBOX_BUTTON.DPAD_DOWN, true);
  gm.poll(300);
  assert.equal(gm.nav.down, true);
  gm.poll(500);
  assert.equal(gm.nav.down, false);
  gm.poll(625);
  assert.equal(gm.nav.down, true);
  setBtn(activePad, XBOX_BUTTON.DPAD_DOWN, false);
  gm.poll(640);
  assert.equal(gm.nav.down, false);

  // Haptics respect setting
  assert.equal(gm.rumble({ duration: 100, strong: 0.8, weak: 0.4, minIntervalMs: 0 }), true);
  assert.equal(activePad.vibrationActuator.calls.length, 1);
  settingsMap.gamepadVibration = false;
  assert.equal(gm.rumble({ duration: 100, strong: 0.8, weak: 0.4, minIntervalMs: 0 }), false);
  assert.equal(activePad.vibrationActuator.calls.length, 1);

  // Input mode switches back to kbm on keydown
  window.dispatchEvent({ type: 'keydown', code: 'KeyW' });
  assert.equal(gm.activeInputMode, 'kbm');

  gm.dispose();
  clear();
});

test('StudioFlyControls.applyGamepadInput: 6-DOF fly + freelook works independent of pointer hover', () => {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
  camera.position.set(0, 5, 10);
  camera.lookAt(0, 5, 0);

  const mockDom = new MockEventTarget();
  const fly = new StudioFlyControls(camera, mockDom, { moveSpeed: 10 });
  // Simulate cursor off-canvas (over UI menus)
  mockDom.dispatchEvent({ type: 'pointerleave' });

  const startZ = camera.position.z;
  const startY = camera.position.y;
  const startYaw = fly.yaw;

  fly.applyGamepadInput({ moveX: 0, moveY: -1, flyY: 1, lookX: 0.5, lookY: 0, lookSpeedRad: 2.0 }, 0.1);
  assert.ok(camera.position.z < startZ, 'LS Up should fly forward even if cursor is off-canvas');
  assert.ok(camera.position.y > startY, 'RT should ascend camera');
  assert.ok(fly.yaw < startYaw, 'RS Right should rotate yaw right');

  fly.dispose();
});

test('BuildSystem: cycleMaterial and cycleBrush wrap through registries and emit events', () => {
  const bs = new BuildSystem();
  const grid = new VoxelGrid(6, 6, 6);
  const scene = new THREE.Scene();
  bs.init(grid, scene);

  const matEvents = [];
  const brushEvents = [];
  const onMat = (e) => matEvents.push(e.materialId);
  const onBrush = (e) => brushEvents.push(e.brushId);
  on('materialSelected', onMat);
  on('brushSelected', onBrush);

  const initialMat = bs.activeMaterial.id;
  bs.cycleMaterial(1);
  assert.notEqual(bs.activeMaterial.id, initialMat);
  assert.equal(matEvents.length, 1);

  const initialBrush = bs.activeBrush.id;
  bs.cycleBrush(1);
  assert.notEqual(bs.activeBrush.id, initialBrush);
  assert.equal(brushEvents.length, 1);

  off('materialSelected', onMat);
  off('brushSelected', onBrush);
  bs.reset();
  clear();
});

test('GamepadRouter OBSTACLE phase: analog steering, Harpoon RT, Siren LT hold, Bail RS 360° circle, Fog Y, disconnect pause', () => {
  const pad = makeFakeGamepad();
  let connected = true;
  const settingsMap = {
    gamepadDeadzone: 0.15,
    gamepadSensitivity: 1.0,
    gamepadInvertY: false,
    gamepadVibration: true,
    gamepadShowHints: true,
  };
  const gm = new GamepadManager({
    getGamepads: () => (connected ? [pad] : []),
    settingsManager: { get: (k) => settingsMap[k] },
  });
  const nav = new GamepadNavigator({ documentRef: null, windowRef: null, settingsManager: { get: (k) => settingsMap[k] } });
  const qteSystem = new QTESystem();

  let steeredVal = 0;
  let fogToggled = false;
  let pauseRequested = 0;
  const hudMock = {
    setGamepadSteer: (v) => { steeredVal = v; },
    drawGamepadBailTrace: () => {},
    clearGamepadBailTrace: () => {},
  };
  const gsMock = {
    currentPhase: 'OBSTACLE',
    _isCountdownActive: false,
    _qteSystem: qteSystem,
    _environmentManager: { toggleDenseFog: () => { fogToggled = !fogToggled; return fogToggled; } },
    setSailingLookOffset: () => {},
  };

  on('requestPause', () => { pauseRequested++; });

  const router = new GamepadRouter({
    gamepadManager: gm,
    navigator: nav,
    gameState: gsMock,
    hud: hudMock,
  });

  // 1. Analog steering
  pad.axes[0] = -0.8;
  router.update(0.016, 100);
  assert.ok(steeredVal < -0.5 && steeredVal > -1, `Expected analog port steer, got ${steeredVal}`);

  // 2. Harpoon Timing QTE via RT (windowMs=1600, sweetSpot=[0.24, 0.58])
  let harpoonWon = false;
  qteSystem.trigger({ source: 'shark', debug: true, onSuccess: () => { harpoonWon = true; } });
  // Advance into sweetSpot [0.24, 0.58] -> 0.65s / 1.6s = 0.40625
  qteSystem.update(0.65);
  setBtn(pad, XBOX_BUTTON.RT, 0.9);
  router.update(0.016, 150);
  assert.equal(harpoonWon, true, 'RT should strike Harpoon timing QTE');
  setBtn(pad, XBOX_BUTTON.RT, 0);
  router.update(0.016, 170);

  // 3. Siren Hold QTE via LT
  let sirenWon = false;
  qteSystem.trigger({ source: 'siren', debug: true, onSuccess: () => { sirenWon = true; } });
  setBtn(pad, XBOX_BUTTON.LT, 0.9);
  router.update(0.016, 200);
  assert.equal(qteSystem._active?.isHolding, true, 'LT hold should engage Siren brace');
  qteSystem.update(2.0);
  assert.equal(sirenWon, true, 'Holding LT should complete Siren QTE');
  setBtn(pad, XBOX_BUTTON.LT, 0);
  router.update(0.016, 220);

  // 4. Bail Hold QTE via RT (holdDurationSec=2.4)
  let bailWon = false;
  qteSystem.trigger({
    source: 'bail',
    debug: true,
    onSuccess: () => { bailWon = true; },
  });
  setBtn(pad, XBOX_BUTTON.RT, 0.9);
  router.update(0.016, 300);
  assert.equal(qteSystem._active?.isHolding, true, 'RT hold should engage Bail pump');
  qteSystem.update(2.6);
  assert.equal(bailWon, true, 'Holding RT should complete hold-based Bail QTE');
  setBtn(pad, XBOX_BUTTON.RT, 0);
  router.update(0.016, 320);

  // 5. Fog toggle via Y
  setBtn(pad, XBOX_BUTTON.Y, true);
  router.update(0.016, 800);
  assert.equal(fogToggled, true);
  setBtn(pad, XBOX_BUTTON.Y, false);

  // 6. Controller disconnect during active sailing auto-pauses
  connected = false;
  router.update(0.016, 850);
  assert.equal(pauseRequested, 1, 'Controller disconnect during active sailing should request pause');

  router.dispose();
  nav.dispose();
  gm.dispose();
  qteSystem.dispose();
  clear();
});

test('GamepadRouter SHIPYARD & EDITOR & DOCK routing dispatches all expected actions', () => {
  const pad = makeFakeGamepad();
  const settingsMap = { gamepadDeadzone: 0.15, gamepadSensitivity: 1.0, gamepadInvertY: false, gamepadVibration: true, gamepadShowHints: true };
  const gm = new GamepadManager({ getGamepads: () => [pad], settingsManager: { get: (k) => settingsMap[k] } });
  const nav = new GamepadNavigator({ documentRef: null, windowRef: null, settingsManager: { get: (k) => settingsMap[k] } });

  const calls = [];
  const eventsFired = [];
  for (const evt of ['undoBuild', 'redoBuild', 'rotateBrush', 'togglePitch', 'toggleMirror', 'startSailing', 'editorRequestPlay', 'editorCameraPreset', 'editorSelectTool']) {
    on(evt, (d) => eventsFired.push({ evt, d }));
  }

  const gsMock = {
    currentPhase: 'SHIPYARD',
    _shipyardFlyControls: { applyGamepadInput: (inObj) => calls.push({ fn: 'fly', inObj }) },
    _buildSystem: {
      cycleBrush: (d) => calls.push({ fn: 'cycleBrush', d }),
      cycleMaterial: (d) => calls.push({ fn: 'cycleMaterial', d }),
    },
    shipyardRaycastCenter: (place) => calls.push({ fn: 'shipyardRaycastCenter', place }),
    shipyardRecenterCamera: () => calls.push({ fn: 'shipyardRecenterCamera' }),
    _dockPlayerController: { applyGamepadInput: () => calls.push({ fn: 'dockGP' }) },
    editorGamepadCamera: (...args) => calls.push({ fn: 'editorCam', args }),
    _editorSystem: {
      _destructionWorkshop: { isOpen: false },
      updateGamepadReticle: () => calls.push({ fn: 'edReticle' }),
      gamepadActionDown: () => calls.push({ fn: 'edDown' }),
      gamepadActionUp: () => calls.push({ fn: 'edUp' }),
      toggleDeleteTool: () => calls.push({ fn: 'edDel' }),
      cycleCameraPreset: () => calls.push({ fn: 'edPreset' }),
      gamepadAdjustRotation: (r) => calls.push({ fn: 'edRot', r }),
      gamepadAdjustY: (y) => calls.push({ fn: 'edY', y }),
      gamepadAdjustScale: (s) => calls.push({ fn: 'edScale', s }),
    },
  };

  const router = new GamepadRouter({ gamepadManager: gm, navigator: nav, gameState: gsMock });

  // Shipyard buttons
  setBtn(pad, XBOX_BUTTON.A, true);
  setBtn(pad, XBOX_BUTTON.X, true);
  setBtn(pad, XBOX_BUTTON.Y, true);
  setBtn(pad, XBOX_BUTTON.RB, true);
  setBtn(pad, XBOX_BUTTON.DPAD_RIGHT, true);
  setBtn(pad, XBOX_BUTTON.DPAD_UP, true);
  setBtn(pad, XBOX_BUTTON.R3, true);
  setBtn(pad, XBOX_BUTTON.VIEW, true);
  router.update(0.016, 100);

  assert.ok(calls.some((c) => c.fn === 'shipyardRaycastCenter' && c.place === true));
  assert.ok(calls.some((c) => c.fn === 'cycleBrush' && c.d === 1));
  assert.ok(calls.some((c) => c.fn === 'cycleMaterial' && c.d === 1));
  assert.ok(calls.some((c) => c.fn === 'shipyardRecenterCamera'));
  assert.ok(eventsFired.some((e) => e.evt === 'rotateBrush'));
  assert.ok(eventsFired.some((e) => e.evt === 'togglePitch'));
  assert.ok(eventsFired.some((e) => e.evt === 'toggleMirror'));
  assert.ok(eventsFired.some((e) => e.evt === 'startSailing'));

  // Release buttons, switch to EDITOR
  for (let i = 0; i < 17; i++) setBtn(pad, i, false);
  gsMock.currentPhase = 'EDITOR';
  router.update(0.016, 120);

  setBtn(pad, XBOX_BUTTON.A, true);
  setBtn(pad, XBOX_BUTTON.X, true);
  setBtn(pad, XBOX_BUTTON.Y, true);
  setBtn(pad, XBOX_BUTTON.DPAD_UP, true);
  setBtn(pad, XBOX_BUTTON.DPAD_RIGHT, true);
  setBtn(pad, XBOX_BUTTON.RB, true);
  router.update(0.016, 140);

  assert.ok(calls.some((c) => c.fn === 'edDown'));
  assert.ok(calls.some((c) => c.fn === 'edDel'));
  assert.ok(calls.some((c) => c.fn === 'edPreset'));
  assert.ok(calls.some((c) => c.fn === 'edY' && c.y === 0.5));
  assert.ok(calls.some((c) => c.fn === 'edScale' && c.s === 0.5));
  assert.ok(calls.some((c) => c.fn === 'edRot'));

  // Switch to DOCK
  for (let i = 0; i < 17; i++) setBtn(pad, i, false);
  gsMock.currentPhase = 'DOCK';
  router.update(0.016, 160);
  assert.ok(calls.some((c) => c.fn === 'dockGP'));

  // Verify CONTROL_SCHEMES covers all primary sections
  assert.ok(CONTROL_SCHEMES.MENU && CONTROL_SCHEMES.DOCK && CONTROL_SCHEMES.SHIPYARD && CONTROL_SCHEMES.OBSTACLE && CONTROL_SCHEMES.EDITOR && CONTROL_SCHEMES.CREDITS);

  router.dispose();
  nav.dispose();
  gm.dispose();
  clear();
});

test('GamepadRouter L3 toggles Virtual UI Cursor without same-frame double-toggle in SHIPYARD & EDITOR', () => {
  const pad = makeFakeGamepad();
  const settingsMap = { gamepadDeadzone: 0.15, gamepadSensitivity: 1.0, gamepadInvertY: false, gamepadVibration: true, gamepadShowHints: true };
  const gm = new GamepadManager({ getGamepads: () => [pad], settingsManager: { get: (k) => settingsMap[k] } });
  const nav = new GamepadNavigator({ documentRef: null, windowRef: null, settingsManager: { get: (k) => settingsMap[k] } });
  // Provide minimal window/document stubs so updateVirtualCursor exercises its B-exit branch
  const makeStubEl = () => ({ style: {}, classList: { toggle: () => {}, add: () => {}, remove: () => {}, contains: () => false }, appendChild: () => {}, querySelector: () => null, querySelectorAll: () => [], remove: () => {} });
  nav._win = { innerWidth: 1280, innerHeight: 720 };
  nav._doc = {
    body: makeStubEl(),
    documentElement: makeStubEl(),
    createElement: () => makeStubEl(),
    elementFromPoint: () => null,
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };

  const gsMock = {
    currentPhase: 'SHIPYARD',
    _shipyardFlyControls: { applyGamepadInput: () => {} },
    _buildSystem: {},
    shipyardRaycastCenter: () => {},
    _editorSystem: {
      _destructionWorkshop: { isOpen: false },
      updateGamepadReticle: () => {},
    },
    editorGamepadCamera: () => {},
  };

  const router = new GamepadRouter({ gamepadManager: gm, navigator: nav, gameState: gsMock });

  // 1. SHIPYARD: L3 turns cursor ON on press frame and stays ON across subsequent frames
  setBtn(pad, XBOX_BUTTON.L3, true);
  router.update(0.016, 100);
  assert.equal(nav.virtualCursorActive, true, 'L3 should activate virtual cursor on first press');

  // Still holding L3 on next frame -> remains ON
  router.update(0.016, 116);
  assert.equal(nav.virtualCursorActive, true, 'Holding L3 should not turn off virtual cursor');

  // Release L3 -> remains ON
  setBtn(pad, XBOX_BUTTON.L3, false);
  router.update(0.016, 132);
  assert.equal(nav.virtualCursorActive, true, 'Releasing L3 should keep virtual cursor active');

  // Second L3 press toggles cursor OFF
  setBtn(pad, XBOX_BUTTON.L3, true);
  router.update(0.016, 160);
  assert.equal(nav.virtualCursorActive, false, 'Second L3 press should deactivate virtual cursor');
  setBtn(pad, XBOX_BUTTON.L3, false);
  router.update(0.016, 180);

  // 2. EDITOR: L3 turns cursor ON, B turns cursor OFF
  gsMock.currentPhase = 'EDITOR';
  router.update(0.016, 200);
  setBtn(pad, XBOX_BUTTON.L3, true);
  router.update(0.016, 220);
  assert.equal(nav.virtualCursorActive, true, 'L3 should activate virtual cursor in EDITOR');
  setBtn(pad, XBOX_BUTTON.L3, false);
  router.update(0.016, 240);

  setBtn(pad, XBOX_BUTTON.B, true);
  router.update(0.016, 260);
  assert.equal(nav.virtualCursorActive, false, 'B should exit virtual cursor mode');

  router.dispose();
  nav.dispose();
  gm.dispose();
  clear();
});

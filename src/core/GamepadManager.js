import { emit } from './EventBus.js';
import { settingsManager as defaultSettingsManager } from './SettingsManager.js';

/**
 * Standard W3C Gamepad API button indices for Xbox Wireless / Series / 360 controllers.
 */
export const XBOX_BUTTON = Object.freeze({
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  VIEW: 8,
  MENU: 9,
  L3: 10,
  R3: 11,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
  GUIDE: 16,
});

/**
 * Standard W3C Gamepad API axis indices.
 */
export const XBOX_AXIS = Object.freeze({
  LEFT_X: 0,
  LEFT_Y: 1,
  RIGHT_X: 2,
  RIGHT_Y: 3,
});

/**
 * Single-source-of-truth Xbox control scheme metadata used by:
 *  - Dynamic contextual HUD hint bar (GamepadNavigator)
 *  - Pause Menu -> Xbox Controller reference tab (PauseMenu)
 */
export const CONTROL_SCHEMES = Object.freeze({
  MENU: {
    title: 'Menus & Dialogs',
    subtitle: 'Logbook, Shop, Pause & Modals',
    bindings: [
      { btn: 'D-Pad / LS', kind: 'stick', action: 'Navigate focus' },
      { btn: 'A', kind: 'a', action: 'Confirm / Select / Advance' },
      { btn: 'B', kind: 'b', action: 'Back / Close Modal' },
      { btn: 'LB / RB', kind: 'bump', action: 'Switch Tabs' },
      { btn: 'RS Y', kind: 'stick', action: 'Scroll Page / List' },
      { btn: 'L / R', kind: 'stick', action: 'Adjust Sliders (RB = 5x)' },
    ],
  },
  DOCK: {
    title: 'Dock & Island (Sea of Thieves Style)',
    subtitle: 'First-Person Exploration & Shop',
    bindings: [
      { btn: 'LS', kind: 'stick', action: 'Walk / Strafe (Analog)' },
      { btn: 'RS', kind: 'stick', action: 'Look Around' },
      { btn: 'L3', kind: 'stick', action: 'Toggle Sprint' },
      { btn: 'A', kind: 'a', action: 'Jump / Advance Cutscene' },
      { btn: 'X', kind: 'x', action: 'Interact (NPC / Door / Logbook)' },
      { btn: 'LB', kind: 'bump', action: 'Emote Wheel (Hold + RS)' },
      { btn: 'B', kind: 'b', action: 'Exit Shop' },
      { btn: 'Menu', kind: 'bump', action: 'Pause' },
    ],
  },
  SHIPYARD: {
    title: 'Drydock Shipyard (KSP Enhanced VAB Style)',
    subtitle: 'Free-Fly Camera & Voxel Hull Repair',
    bindings: [
      { btn: 'LS', kind: 'stick', action: 'Fly Horizontal' },
      { btn: 'RS', kind: 'stick', action: 'Freelook Aim' },
      { btn: 'RT / LT', kind: 'bump', action: 'Ascend / Descend' },
      { btn: 'A', kind: 'a', action: 'Place / Erase at Reticle' },
      { btn: 'B', kind: 'b', action: 'Undo' },
      { btn: 'D-Down', kind: 'stick', action: 'Redo' },
      { btn: 'X / Y', kind: 'x', action: 'Rotate 90° / Flip Pitch' },
      { btn: 'LB / RB', kind: 'bump', action: 'Cycle Brush Shape' },
      { btn: 'D-Left / Right', kind: 'stick', action: 'Cycle Timber Material' },
      { btn: 'D-Up', kind: 'stick', action: 'Toggle Symmetry' },
      { btn: 'L3', kind: 'stick', action: 'Toggle Virtual UI Cursor' },
      { btn: 'R3', kind: 'stick', action: 'Recenter Camera on Ship' },
      { btn: 'View', kind: 'bump', action: 'Set Sail When Ready' },
    ],
  },
  OBSTACLE: {
    title: 'High Seas Sailing & QTEs (Sea of Thieves Helm)',
    subtitle: 'Helm Steering, Harpoon, Bail & Siren Ward',
    bindings: [
      { btn: 'LS X / D-Pad', kind: 'stick', action: 'Steer Ship Wheel (Analog)' },
      { btn: 'RS', kind: 'stick', action: 'Look Around / Spin to Bail Water' },
      { btn: 'RT / A', kind: 'a', action: 'Harpoon Strike / Brace / Quick Bail' },
      { btn: 'LT', kind: 'bump', action: 'Hold to Brace vs Siren' },
      { btn: 'X', kind: 'x', action: 'Quick 50% Bail Assist' },
      { btn: 'Y', kind: 'y', action: 'Toggle Bow Lantern / Fog' },
      { btn: 'Menu', kind: 'bump', action: 'Pause' },
    ],
  },
  EDITOR: {
    title: 'Level Editor & Destruction Workshop (KSP Mode)',
    subtitle: 'Orbit / Fly Camera, Terrain & Battle Damage',
    bindings: [
      { btn: 'LS / RS', kind: 'stick', action: 'Pan / Orbit (Fly in Workshop)' },
      { btn: 'RT / LT', kind: 'bump', action: 'Zoom (Ascend / Descend in Workshop)' },
      { btn: 'A', kind: 'a', action: 'Apply Tool / Carve Damage' },
      { btn: 'B', kind: 'b', action: 'Select Tool / Undo in Workshop' },
      { btn: 'X', kind: 'x', action: 'Delete Tool / Rotate in Workshop' },
      { btn: 'Y', kind: 'y', action: 'Camera Presets / Pitch in Workshop' },
      { btn: 'LB / RB', kind: 'bump', action: 'Rotate Object / Cycle Workshop Brush' },
      { btn: 'D-Pad', kind: 'stick', action: 'Height & Scale / Size & Mirror' },
      { btn: 'L3', kind: 'stick', action: 'Toggle Virtual UI Cursor' },
      { btn: 'R3', kind: 'stick', action: 'Reset Camera' },
      { btn: 'View', kind: 'bump', action: 'Test Course / Done Workshop' },
    ],
  },
  CREDITS: {
    title: 'Credits & Director Mode',
    subtitle: 'Roll Playback & Free Camera Rig',
    bindings: [
      { btn: 'A / RT', kind: 'a', action: 'Fast-Forward Credits / Halt Sim' },
      { btn: 'X / Y', kind: 'x', action: 'Pause / Cycle Speed (Hide UI in Dir)' },
      { btn: 'LB / RB', kind: 'bump', action: 'Replay / Step Frame' },
      { btn: 'B', kind: 'b', action: 'Exit to Main Menu' },
    ],
  },
});

/**
 * Scaled radial deadzone with outer saturation clamp and exponential response curve.
 * Preserves smooth diagonal direction vectors without axial snapping.
 *
 * @param {number} rawX
 * @param {number} rawY
 * @param {number} [inner=0.15]
 * @param {number} [outer=0.95]
 * @param {number} [exponent=1.6]
 * @returns {{ x: number, y: number, magnitude: number }}
 */
export function applyRadialDeadzone(rawX, rawY, inner = 0.15, outer = 0.95, exponent = 1.6) {
  const x = Number.isFinite(rawX) ? rawX : 0;
  const y = Number.isFinite(rawY) ? rawY : 0;
  const mag = Math.hypot(x, y);
  if (mag <= inner || outer <= inner) {
    return { x: 0, y: 0, magnitude: 0 };
  }
  const normalized = Math.min(1, (mag - inner) / (outer - inner));
  const curved = Math.pow(normalized, exponent);
  const scale = curved / mag;
  return {
    x: x * scale,
    y: y * scale,
    magnitude: curved,
  };
}

/**
 * 1D scaled deadzone with exponential response curve (ideal for helm steering & triggers).
 *
 * @param {number} raw
 * @param {number} [inner=0.15]
 * @param {number} [outer=0.95]
 * @param {number} [exponent=1.4]
 * @returns {number}
 */
export function applyAxisDeadzone(raw, inner = 0.15, outer = 0.95, exponent = 1.4) {
  const val = Number.isFinite(raw) ? raw : 0;
  const abs = Math.abs(val);
  if (abs <= inner || outer <= inner) return 0;
  const normalized = Math.min(1, (abs - inner) / (outer - inner));
  return Math.sign(val) * Math.pow(normalized, exponent);
}

const TRIGGER_PRESS_THRESHOLD = 0.45;
const TRIGGER_RELEASE_THRESHOLD = 0.25;
const TRIGGER_ANALOG_DEADZONE = 0.08;
const NAV_INITIAL_DELAY_MS = 320;
const NAV_REPEAT_MS = 110;
const NAV_STICK_THRESHOLD = 0.55;
const BUTTON_COUNT = 17;

/**
 * GamepadManager — Low-level W3C Standard Gamepad poller with deadzones,
 * trigger hysteresis, edge detection, menu auto-repeat, input-mode switching,
 * and dual-rumble haptic feedback.
 */
export class GamepadManager {
  /**
   * @param {object} [opts]
   * @param {Function} [opts.getGamepads] Optional provider for testing
   * @param {object} [opts.settingsManager] Optional SettingsManager override
   */
  constructor(opts = {}) {
    this._getGamepads = opts.getGamepads || (() => {
      if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
        return navigator.getGamepads();
      }
      return [];
    });
    this._settings = opts.settingsManager || defaultSettingsManager;

    this.connected = false;
    this.activeIndex = null;
    this.gamepadId = '';
    this.activeInputMode = 'kbm';

    this.pressed = new Array(BUTTON_COUNT).fill(false);
    this.prevPressed = new Array(BUTTON_COUNT).fill(false);
    this.justPressed = new Array(BUTTON_COUNT).fill(false);
    this.justReleased = new Array(BUTTON_COUNT).fill(false);
    this.values = new Array(BUTTON_COUNT).fill(0);

    this.leftStick = { x: 0, y: 0, magnitude: 0 };
    this.rightStick = { x: 0, y: 0, magnitude: 0 };
    this.rawLeftStick = { x: 0, y: 0 };
    this.rawRightStick = { x: 0, y: 0 };
    this.leftTrigger = 0;
    this.rightTrigger = 0;

    this.nav = { up: false, down: false, left: false, right: false };
    this._navHold = {
      up: { held: false, nextAt: 0 },
      down: { held: false, nextAt: 0 },
      left: { held: false, nextAt: 0 },
      right: { held: false, nextAt: 0 },
    };

    this._lastRumbleAt = 0;
    this._activePadRef = null;
    this._disposed = false;

    this._onGamepadConnected = (e) => {
      const pad = e?.gamepad;
      if (!pad) return;
      this.connected = true;
      this.activeIndex = pad.index;
      this.gamepadId = pad.id || 'Xbox Controller';
      this._activePadRef = pad;
      this._setInputMode('gamepad');
      emit('gamepadConnected', { index: pad.index, id: this.gamepadId });
    };

    this._onGamepadDisconnected = (e) => {
      const pad = e?.gamepad;
      if (pad && this.activeIndex !== null && pad.index !== this.activeIndex) return;
      const prevId = this.gamepadId;
      this.connected = false;
      this.activeIndex = null;
      this.gamepadId = '';
      this._activePadRef = null;
      this._clearState();
      emit('gamepadDisconnected', { id: prevId });
    };

    this._onKeyboardActivity = () => {
      this._setInputMode('kbm');
    };

    this._onPointerActivity = (e) => {
      // Ignore synthetic events dispatched by GamepadNavigator / virtual cursor
      if (e && e.isTrusted === false) return;
      this._setInputMode('kbm');
    };

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('gamepadconnected', this._onGamepadConnected);
      window.addEventListener('gamepaddisconnected', this._onGamepadDisconnected);
      window.addEventListener('keydown', this._onKeyboardActivity, true);
      window.addEventListener('pointerdown', this._onPointerActivity, true);
      window.addEventListener('pointermove', this._onPointerActivity, true);
    }
  }

  _setInputMode(mode) {
    if (this.activeInputMode === mode) return;
    this.activeInputMode = mode;
    if (typeof document !== 'undefined' && document.body?.classList) {
      document.body.classList.toggle('input-mode-gamepad', mode === 'gamepad');
    }
    emit('inputModeChanged', { mode });
  }

  _clearState() {
    this.pressed.fill(false);
    this.prevPressed.fill(false);
    this.justPressed.fill(false);
    this.justReleased.fill(false);
    this.values.fill(0);
    this.leftStick = { x: 0, y: 0, magnitude: 0 };
    this.rightStick = { x: 0, y: 0, magnitude: 0 };
    this.rawLeftStick = { x: 0, y: 0 };
    this.rawRightStick = { x: 0, y: 0 };
    this.leftTrigger = 0;
    this.rightTrigger = 0;
    this.nav.up = false;
    this.nav.down = false;
    this.nav.left = false;
    this.nav.right = false;
    for (const dir of Object.keys(this._navHold)) {
      this._navHold[dir].held = false;
      this._navHold[dir].nextAt = 0;
    }
  }

  _findActivePad() {
    let pads;
    try {
      pads = this._getGamepads();
    } catch (_) {
      return null;
    }
    if (!pads) return null;

    if (this.activeIndex !== null && pads[this.activeIndex]?.connected) {
      return pads[this.activeIndex];
    }

    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (p && p.connected) {
        return p;
      }
    }
    return null;
  }

  /**
   * Poll gamepad hardware state once per animation frame.
   * @param {number} [nowMs] Timestamp in ms (defaults to performance.now())
   * @returns {boolean} True if a controller is connected
   */
  poll(nowMs = (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
    if (this._disposed) return false;

    const pad = this._findActivePad();
    if (!pad) {
      if (this.connected) {
        const prevId = this.gamepadId;
        this.connected = false;
        this.activeIndex = null;
        this.gamepadId = '';
        this._activePadRef = null;
        this._clearState();
        emit('gamepadDisconnected', { id: prevId });
      }
      return false;
    }

    if (!this.connected || this.activeIndex !== pad.index) {
      this.connected = true;
      this.activeIndex = pad.index;
      this.gamepadId = pad.id || 'Xbox Controller';
      this._activePadRef = pad;
      emit('gamepadConnected', { index: pad.index, id: this.gamepadId });
    } else {
      this._activePadRef = pad;
    }

    const deadzone = this._getDeadzone();
    const invertY = Boolean(this._settings?.get?.('gamepadInvertY'));

    const buttons = pad.buttons || [];
    let anyButtonActivity = false;

    for (let i = 0; i < BUTTON_COUNT; i++) {
      this.prevPressed[i] = this.pressed[i];
      const btn = buttons[i];
      const rawVal = typeof btn === 'number' ? btn : (btn?.value ?? (btn?.pressed ? 1 : 0));
      this.values[i] = rawVal;

      let isDown;
      if (i === XBOX_BUTTON.LT || i === XBOX_BUTTON.RT) {
        // Trigger hysteresis prevents chatter near threshold
        isDown = this.prevPressed[i]
          ? rawVal >= TRIGGER_RELEASE_THRESHOLD
          : rawVal >= TRIGGER_PRESS_THRESHOLD;
      } else {
        isDown = Boolean(btn?.pressed) || rawVal >= 0.5;
      }

      this.pressed[i] = isDown;
      this.justPressed[i] = isDown && !this.prevPressed[i];
      this.justReleased[i] = !isDown && this.prevPressed[i];

      if (this.justPressed[i] || isDown) {
        anyButtonActivity = true;
      }
    }

    const axes = pad.axes || [];
    const lxRaw = axes[XBOX_AXIS.LEFT_X] ?? 0;
    const lyRaw = axes[XBOX_AXIS.LEFT_Y] ?? 0;
    const rxRaw = axes[XBOX_AXIS.RIGHT_X] ?? 0;
    const ryRaw = axes[XBOX_AXIS.RIGHT_Y] ?? 0;

    this.rawLeftStick.x = lxRaw;
    this.rawLeftStick.y = lyRaw;
    this.rawRightStick.x = rxRaw;
    this.rawRightStick.y = ryRaw;

    this.leftStick = applyRadialDeadzone(lxRaw, lyRaw, deadzone, 0.95, 1.6);
    const rs = applyRadialDeadzone(rxRaw, ryRaw, deadzone, 0.95, 1.6);
    if (invertY && rs.y !== 0) {
      rs.y = -rs.y;
    }
    this.rightStick = rs;

    // Analog triggers [0..1] after small deadzone
    const ltRaw = this.values[XBOX_BUTTON.LT] ?? 0;
    const rtRaw = this.values[XBOX_BUTTON.RT] ?? 0;
    this.leftTrigger = ltRaw <= TRIGGER_ANALOG_DEADZONE
      ? 0
      : Math.min(1, (ltRaw - TRIGGER_ANALOG_DEADZONE) / (1 - TRIGGER_ANALOG_DEADZONE));
    this.rightTrigger = rtRaw <= TRIGGER_ANALOG_DEADZONE
      ? 0
      : Math.min(1, (rtRaw - TRIGGER_ANALOG_DEADZONE) / (1 - TRIGGER_ANALOG_DEADZONE));

    if (
      anyButtonActivity ||
      this.leftStick.magnitude > 0.1 ||
      this.rightStick.magnitude > 0.1 ||
      this.leftTrigger > 0.1 ||
      this.rightTrigger > 0.1
    ) {
      this._setInputMode('gamepad');
    }

    // Update Menu Navigation with auto-repeat (D-Pad + Left Stick)
    this._updateNavDirection('up', this.pressed[XBOX_BUTTON.DPAD_UP] || this.leftStick.y < -NAV_STICK_THRESHOLD, nowMs);
    this._updateNavDirection('down', this.pressed[XBOX_BUTTON.DPAD_DOWN] || this.leftStick.y > NAV_STICK_THRESHOLD, nowMs);
    this._updateNavDirection('left', this.pressed[XBOX_BUTTON.DPAD_LEFT] || this.leftStick.x < -NAV_STICK_THRESHOLD, nowMs);
    this._updateNavDirection('right', this.pressed[XBOX_BUTTON.DPAD_RIGHT] || this.leftStick.x > NAV_STICK_THRESHOLD, nowMs);

    return true;
  }

  _updateNavDirection(dir, active, nowMs) {
    const state = this._navHold[dir];
    if (!active) {
      state.held = false;
      state.nextAt = 0;
      this.nav[dir] = false;
      return;
    }

    if (!state.held) {
      state.held = true;
      state.nextAt = nowMs + NAV_INITIAL_DELAY_MS;
      this.nav[dir] = true;
      return;
    }

    if (nowMs >= state.nextAt) {
      state.nextAt = nowMs + NAV_REPEAT_MS;
      this.nav[dir] = true;
      return;
    }

    this.nav[dir] = false;
  }

  _getDeadzone() {
    const val = Number(this._settings?.get?.('gamepadDeadzone'));
    if (!Number.isFinite(val)) return 0.15;
    return Math.max(0.05, Math.min(0.4, val));
  }

  getSensitivity() {
    const val = Number(this._settings?.get?.('gamepadSensitivity'));
    if (!Number.isFinite(val)) return 1.0;
    return Math.max(0.2, Math.min(3.0, val));
  }

  isPressed(btnIndex) {
    return Boolean(this.pressed[btnIndex]);
  }

  isJustPressed(btnIndex) {
    return Boolean(this.justPressed[btnIndex]);
  }

  isJustReleased(btnIndex) {
    return Boolean(this.justReleased[btnIndex]);
  }

  getButtonValue(btnIndex) {
    return this.values[btnIndex] ?? 0;
  }

  isGamepadActive() {
    return this.connected && this.activeInputMode === 'gamepad';
  }

  hasAnyInput() {
    if (!this.connected) return false;
    if (this.leftStick.magnitude > 0 || this.rightStick.magnitude > 0) return true;
    if (this.leftTrigger > 0 || this.rightTrigger > 0) return true;
    for (let i = 0; i < BUTTON_COUNT; i++) {
      if (this.pressed[i]) return true;
    }
    return false;
  }

  /**
   * Trigger dual-rumble haptic pulse if supported & enabled in settings.
   * @param {object} [opts]
   * @param {number} [opts.duration=150]
   * @param {number} [opts.strong=0.5]
   * @param {number} [opts.weak=0.5]
   * @param {number} [opts.minIntervalMs=40]
   */
  rumble({ duration = 150, strong = 0.5, weak = 0.5, minIntervalMs = 40 } = {}) {
    if (!this.connected || !this._activePadRef) return false;
    if (this._settings?.get?.('gamepadVibration') === false) return false;

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this._lastRumbleAt < minIntervalMs) return false;
    this._lastRumbleAt = now;

    const actuator = this._activePadRef.vibrationActuator;
    if (!actuator || typeof actuator.playEffect !== 'function') return false;

    try {
      const p = actuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration: Math.max(10, Math.min(2000, duration)),
        weakMagnitude: Math.max(0, Math.min(1, weak)),
        strongMagnitude: Math.max(0, Math.min(1, strong)),
      });
      if (p && typeof p.catch === 'function') p.catch(() => {});
      return true;
    } catch (_) {
      return false;
    }
  }

  dispose() {
    this._disposed = true;
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('gamepadconnected', this._onGamepadConnected);
      window.removeEventListener('gamepaddisconnected', this._onGamepadDisconnected);
      window.removeEventListener('keydown', this._onKeyboardActivity, true);
      window.removeEventListener('pointerdown', this._onPointerActivity, true);
      window.removeEventListener('pointermove', this._onPointerActivity, true);
    }
    this._clearState();
  }
}

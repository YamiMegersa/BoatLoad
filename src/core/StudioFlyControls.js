import * as THREE from 'three';

const FLIGHT_KEYS = new Set([
  'KeyW', 'KeyS', 'KeyA', 'KeyD',
  'KeyE', 'KeyQ', 'Space', 'ShiftLeft', 'ShiftRight'
]);

/**
 * StudioFlyControls — First-Person Flycam controller for the drydock shipyard
 * repair phase and 3D boat destruction workshop.
 *
 * Controls:
 *   - WASD: Fly in camera space (W forward, S backward, A strafe left, D strafe right)
 *   - Space / E: Fly up (+Y)
 *   - Shift / Q: Fly down (-Y)
 *   - Right-Click Drag: Freelook / Turn (yaw and pitch)
 *   - Scroll Wheel: Dolly / Zoom forward and backward
 *   - Left-Click Drag: Intentionally does nothing at all (clicks under 5px place/carve voxels)
 */
export class StudioFlyControls {
  constructor(camera, domElement, options = {}) {
    this.camera = camera;
    this.domElement = domElement || document.body;
    this.enabled = true;

    this.moveSpeed = options.moveSpeed ?? 12.0;
    this.lookSpeed = options.lookSpeed ?? 0.003;
    this.wheelSpeed = options.wheelSpeed ?? 1.5;
    // Disabled by default: prevents erratic mousewheel / touchpad camera shunting
    this.enableWheelDolly = options.enableWheelDolly ?? false;

    this.yaw = 0;
    this.pitch = 0;

    this._isRightDragging = false;
    this._lastMousePos = { x: 0, y: 0 };
    this._activeKeys = new Set();
    this._isPointerOverCanvas = true; // Initialized true for active viewport

    this._boundKeyDown = this._onKeyDown.bind(this);
    this._boundKeyUp = this._onKeyUp.bind(this);
    this._boundMouseDown = this._onMouseDown.bind(this);
    this._boundMouseMove = this._onMouseMove.bind(this);
    this._boundMouseUp = this._onMouseUp.bind(this);
    this._boundWheel = this._onWheel.bind(this);
    this._boundContextMenu = (e) => e.preventDefault();
    this._boundReset = () => this.clearKeys();
    this._boundDblClick = (e) => e.preventDefault();

    this._boundAuxClick = (e) => {
      if (e.button === 1) e.preventDefault();
    };

    this._boundPointerEnter = () => {
      this._isPointerOverCanvas = true;
      if (document.activeElement && document.activeElement !== document.body && document.activeElement.tagName === 'BUTTON') {
        document.activeElement.blur();
      }
    };

    this._boundPointerLeave = () => {
      this._isPointerOverCanvas = false;
      this.clearKeys();
    };

    this._boundPointerMoveOverCanvas = () => {
      this._isPointerOverCanvas = true;
    };

    this._attach();
    this.syncFromCamera();
  }

  _attach() {
    this.domElement.addEventListener('pointerdown', this._boundMouseDown);
    this.domElement.addEventListener('mousedown', this._boundAuxClick);
    this.domElement.addEventListener('auxclick', this._boundAuxClick);
    this.domElement.addEventListener('pointerenter', this._boundPointerEnter);
    this.domElement.addEventListener('pointerleave', this._boundPointerLeave);
    this.domElement.addEventListener('pointermove', this._boundPointerMoveOverCanvas);

    window.addEventListener('pointermove', this._boundMouseMove);
    window.addEventListener('pointerup', this._boundMouseUp);
    window.addEventListener('pointercancel', this._boundMouseUp);
    window.addEventListener('mouseup', this._boundMouseUp);
    window.addEventListener('auxclick', this._boundAuxClick);

    this.domElement.addEventListener('wheel', this._boundWheel, { passive: false });
    this.domElement.addEventListener('dblclick', this._boundDblClick);

    // Prevent context menu globally while fly controls are alive
    window.addEventListener('contextmenu', this._boundContextMenu);

    // Self-contained keyboard tracking on window
    window.addEventListener('keydown', this._boundKeyDown);
    window.addEventListener('keyup', this._boundKeyUp);

    // Defensive resets on window blur, focus, or tab switch
    window.addEventListener('blur', this._boundReset);
    window.addEventListener('focus', this._boundReset);
    document.addEventListener('visibilitychange', this._boundReset);
  }

  _detach() {
    this.domElement.removeEventListener('pointerdown', this._boundMouseDown);
    this.domElement.removeEventListener('mousedown', this._boundAuxClick);
    this.domElement.removeEventListener('auxclick', this._boundAuxClick);
    this.domElement.removeEventListener('pointerenter', this._boundPointerEnter);
    this.domElement.removeEventListener('pointerleave', this._boundPointerLeave);
    this.domElement.removeEventListener('pointermove', this._boundPointerMoveOverCanvas);

    window.removeEventListener('pointermove', this._boundMouseMove);
    window.removeEventListener('pointerup', this._boundMouseUp);
    window.removeEventListener('pointercancel', this._boundMouseUp);
    window.removeEventListener('mouseup', this._boundMouseUp);
    window.removeEventListener('auxclick', this._boundAuxClick);

    this.domElement.removeEventListener('wheel', this._boundWheel);
    this.domElement.removeEventListener('dblclick', this._boundDblClick);

    window.removeEventListener('contextmenu', this._boundContextMenu);

    window.removeEventListener('keydown', this._boundKeyDown);
    window.removeEventListener('keyup', this._boundKeyUp);

    window.removeEventListener('blur', this._boundReset);
    window.removeEventListener('focus', this._boundReset);
    document.removeEventListener('visibilitychange', this._boundReset);

    this.clearKeys();
  }

  syncFromCamera() {
    if (!this.camera) return;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);

    // Yaw: angle in horizontal XZ plane
    this.yaw = Math.atan2(-dir.x, -dir.z);

    // Pitch: elevation angle from horizontal plane
    this.pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -0.999, 0.999));

    this._updateCameraRotation();
  }

  lookAt(target) {
    if (!this.camera) return;
    this.camera.lookAt(target);
    this.syncFromCamera();
  }

  _updateCameraRotation() {
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = 0;
  }

  _onKeyDown(e) {
    if (!this.enabled) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) {
      this.clearKeys();
      return;
    }
    if (FLIGHT_KEYS.has(e.code)) {
      this._activeKeys.add(e.code);
    }
  }

  _onKeyUp(e) {
    if (e.code) {
      this._activeKeys.delete(e.code);
    }
  }

  clearKeys() {
    this._activeKeys.clear();
    this._isRightDragging = false;
  }

  _onMouseDown(e) {
    if (!this.enabled) return;
    if (e.button === 2) {
      // Right-click initiates freelook drag
      this._isRightDragging = true;
      this._lastMousePos = { x: e.clientX, y: e.clientY };
    } else if (e.button === 1) {
      // Middle-click (wheel click) — prevent browser auto-scroll!
      e.preventDefault();
    }

    // If an active UI button is focused, release focus back to body
    if (document.activeElement && document.activeElement !== document.body && document.activeElement.tagName === 'BUTTON') {
      document.activeElement.blur();
    }
    // Left-click (button === 0) intentionally does NOT touch the camera
  }

  _onMouseMove(e) {
    if (!this.enabled || !this._isRightDragging) return;

    // Extra safety: if no mouse buttons are pressed, stop dragging immediately
    if (e.buttons !== undefined && (e.buttons & 2) === 0) {
      this._isRightDragging = false;
      return;
    }

    const dx = e.clientX - this._lastMousePos.x;
    const dy = e.clientY - this._lastMousePos.y;
    this._lastMousePos = { x: e.clientX, y: e.clientY };

    this.yaw -= dx * this.lookSpeed;
    this.pitch -= dy * this.lookSpeed;

    // Clamp pitch to prevent flipping upside down
    const maxPitch = Math.PI * 0.49;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));

    this._updateCameraRotation();
  }

  _onMouseUp(e) {
    if (!e || e.button === 2 || (e.buttons !== undefined && (e.buttons & 2) === 0)) {
      this._isRightDragging = false;
    }
  }

  _onWheel(e) {
    if (!this.enabled || !this.enableWheelDolly) return;
    e.preventDefault();

    // Guard against 0 or micro-jitter scroll noise
    if (!e.deltaY || Math.abs(e.deltaY) < 5.0) return;

    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);

    // Smooth proportional zoom clamped safely
    const sign = Math.sign(e.deltaY);
    const distance = THREE.MathUtils.clamp(-sign * this.wheelSpeed * Math.min(Math.abs(e.deltaY) / 100, 1.0), -1.5, 1.5);
    this.camera.position.addScaledVector(forward, distance);
  }

  update(delta) {
    if (!this.enabled) return;

    // Flycam translation only occurs when cursor is actively over the 3D canvas
    // Moving the cursor to HTML menus halts movement immediately
    if (!this._isPointerOverCanvas) {
      if (this._activeKeys.size > 0) this.clearKeys();
      return;
    }

    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);

    const right = new THREE.Vector3();
    right.crossVectors(forward, this.camera.up).normalize();

    const move = new THREE.Vector3();
    if (this._activeKeys.has('KeyW')) move.add(forward);
    if (this._activeKeys.has('KeyS')) move.sub(forward);
    if (this._activeKeys.has('KeyA')) move.sub(right);
    if (this._activeKeys.has('KeyD')) move.add(right);

    if (this._activeKeys.has('KeyE') || this._activeKeys.has('Space')) move.y += 1;
    if (this._activeKeys.has('KeyQ') || this._activeKeys.has('ShiftLeft') || this._activeKeys.has('ShiftRight')) move.y -= 1;

    if (move.lengthSq() > 0) {
      move.normalize();
      this.camera.position.addScaledVector(move, this.moveSpeed * delta);
    }
  }

  dispose() {
    this._detach();
    this.enabled = false;
  }
}


import * as THREE from 'three';
import { on, emit } from '../core/EventBus.js';
import { settingsManager } from '../core/SettingsManager.js';
import { getAssetUrl } from '../utils/paths.js';
import './director.css';

/**
 * DirectorMode — Comprehensive Cinema & Trailer Recording Suite for BoatLoad.
 *
 * Features:
 *  - Time Halting / Slo-Mo / Frame-Stepping
 *  - 6-DOF Free-Fly Camera with weighted inertial damping
 *  - Film Rig Buttons: Pan, Tilt, Dolly, Truck, Pedestal, Roll (Dutch angle)
 *  - Smooth 360° Orbit & Follow-Ship drone tracking
 *  - Spline Keyframe Path Recorder & Playback (Catmull-Rom curves)
 *  - Cinematic Optics: Focal Length / FOV, Anamorphic 2.39:1 Bars, Rule of Thirds
 *  - Procedural Handheld Camera Shake
 *  - Live Atmosphere Deck: Time of Day, Weather, God Rays, Water Wave scale
 *  - Clean Capture Mode (H key) to hide all UI for OBS / screen recordings
 */
export class DirectorMode {
  constructor({ scene, camera, renderer, gameState, godRays, paperFilter }) {
    this._scene = scene;
    this._baseCamera = camera;
    this._renderer = renderer;
    this._gameState = gameState;
    this._godRays = godRays;
    this._paperFilter = paperFilter;

    // Eagerly prefetch weather configs so Director Mode can apply atmospheric presets instantly
    if (this._gameState?._weather && !this._gameState._weather.weatherConfigs) {
      fetch(getAssetUrl('assets/levels/weather.json'))
        .then(res => res.json())
        .then(data => { if (this._gameState?._weather) this._gameState._weather.weatherConfigs = data; })
        .catch(() => {});
    }

    // Director Camera
    this.camera = new THREE.PerspectiveCamera(
      camera.fov || 60,
      window.innerWidth / window.innerHeight,
      0.1,
      600
    );
    this.camera.name = 'directorCamera';

    // State
    this.isActive = false;
    this.isHalted = false;
    this.timeScale = 1.0;
    this.stepFrameRequested = false;
    this.keepWavesMoving = true;
    this.uiHidden = false;

    // 6-DOF Movement & Dynamics
    this.moveSpeed = 22.0; // units/sec
    this.sprintMultiplier = 3.0;
    this.crawlMultiplier = 0.2;
    this.smoothness = 0.90; // Inertia damping (0 = instant, 0.95 = very cinematic/heavy)
    this.mouseSensitivity = 0.0022;

    this._velocity = new THREE.Vector3();
    this._angularVelocity = new THREE.Vector2(); // yaw, pitch
    this._roll = 0.0;
    this._targetRoll = 0.0;

    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._keysDown = new Set();
    this._isRightMouseDown = false;
    this._activeButtonAction = null;
    this._activeButtonEl = null;
    this.dpadSpeedMultiplier = 1.0;

    // Tracking Modes
    this.trackingMode = 'free'; // 'free' | 'follow' | 'orbit' | 'lookat'
    this.orbitRadius = 25.0;
    this.orbitSpeed = 15.0; // deg/sec
    this.orbitAngle = 0.0;
    this.orbitHeight = 7.0;

    // Camera Shake
    this.shakeIntensity = 0.0; // 0 = none, 1 = swell, 2 = heavy storm
    this._shakeTime = 0.0;

    // Keyframing & Splines
    this.keyframes = [];
    this.pathDuration = 8.0; // seconds
    this.isPlayingPath = false;
    this.pathLoop = true;
    this.pathTime = 0.0;
    this.pathCurve = null;
    this._pathSplineMesh = null;
    this.showPathMesh = true;

    // Optics & Framing
    this.aspectRatio = 'none'; // 'none' | 'cinemascope' | '4:3'
    this.gridOverlay = 'none'; // 'none' | 'thirds'

    // DOM Elements
    this._dom = {};

    this._initDOM();
    this._initEvents();
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  toggle() {
    if (this.isActive) {
      this.deactivate();
    } else {
      this.activate();
    }
  }

  activate() {
    if (this.isActive) return;
    this.isActive = true;

    // Inherit the exact current position and rotation of the active game camera
    const currentCam = this._gameState.activeCamera || this._baseCamera;
    this.camera.position.copy(currentCam.position);
    this.camera.quaternion.copy(currentCam.quaternion);
    this.camera.fov = currentCam.fov || 60;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();

    this._euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    this._targetRoll = 0.0;
    this._roll = 0.0;
    this._velocity.set(0, 0, 0);
    this._angularVelocity.set(0, 0);

    // Tell GameState Director Mode is active so chase cameras yield
    this._gameState.directorModeActive = true;
    this._gameState.activeCamera = this.camera;

    if (this._godRays) {
      this._godRays._camera = this.camera;
    }

    // Default to halted on entry for perfect shot alignment
    this.isHalted = true;

    this._updateUIState();
    this._showContainer();

    emit('directorModeChanged', { active: true });
  }

  deactivate() {
    if (!this.isActive) return;
    this.isActive = false;
    this.isPlayingPath = false;
    this.isHalted = false;
    this.timeScale = 1.0;

    this._hideContainer();

    // Release camera control back to game
    this._gameState.directorModeActive = false;
    this._gameState.activeCamera = null;

    if (this._godRays) {
      this._godRays._camera = this._gameState.activeCamera || this._baseCamera;
    }

    if (this._pathSplineMesh) {
      this._scene.remove(this._pathSplineMesh);
    }

    emit('directorModeChanged', { active: false });
  }

  // ---------------------------------------------------------------------------
  // Frame Update (runs every tick)
  // ---------------------------------------------------------------------------

  update(delta) {
    if (!this.isActive) return;

    // 1. Keyframe Path Playback
    if (this.isPlayingPath && this.keyframes.length >= 2) {
      this._updatePathPlayback(delta);
    } else {
      // 2. Interactive 6-DOF Rig and Flying
      this._updateInteractiveCamera(delta);
    }

    // 3. Procedural Handheld Camera Shake
    if (this.shakeIntensity > 0) {
      this._applyCameraShake(delta);
    }

    // 4. Single-frame step consumption
    if (this.stepFrameRequested) {
      this.stepFrameRequested = false;
    }

    // 5. Update FOV readout in UI
    if (this._dom.fovReadout) {
      this._dom.fovReadout.innerText = `${Math.round(this.camera.fov)}°`;
    }
  }

  _updateInteractiveCamera(delta) {
    // Determine Target Entity (Player Ship if in obstacle mode, otherwise origin)
    const targetPos = this._getTargetPosition();

    // Orbit Mode
    if (this.trackingMode === 'orbit') {
      this.orbitAngle += THREE.MathUtils.degToRad(this.orbitSpeed) * delta;
      const x = targetPos.x + Math.sin(this.orbitAngle) * this.orbitRadius;
      const z = targetPos.z + Math.cos(this.orbitAngle) * this.orbitRadius;
      const y = targetPos.y + this.orbitHeight;
      this.camera.position.lerp(new THREE.Vector3(x, y, z), 6.0 * delta);
      this.camera.lookAt(targetPos);
      return;
    }

    // Look-At Target Mode
    if (this.trackingMode === 'lookat') {
      this.camera.lookAt(targetPos);
    }

    // Button actions hold logic (holding continuous rig buttons)
    if (this._activeButtonAction) {
      this._executeRigAction(this._activeButtonAction, delta);
    }

    // Flight translation inputs
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const worldUp = new THREE.Vector3(0, 1, 0);

    const inputDir = new THREE.Vector3();

    if (this._keysDown.has('KeyW')) inputDir.add(forward);
    if (this._keysDown.has('KeyS')) inputDir.sub(forward);
    if (this._keysDown.has('KeyD')) inputDir.add(right);
    if (this._keysDown.has('KeyA')) inputDir.sub(right);
    if (this._keysDown.has('KeyE') || this._keysDown.has('Space')) inputDir.add(worldUp);
    if (this._keysDown.has('KeyQ') || this._keysDown.has('KeyC')) inputDir.sub(worldUp);

    let speed = this.moveSpeed;
    if (this._keysDown.has('ShiftLeft') || this._keysDown.has('ShiftRight')) {
      speed *= this.sprintMultiplier;
    }
    if (this._keysDown.has('AltLeft') || this._keysDown.has('ControlLeft')) {
      speed *= this.crawlMultiplier;
    }

    if (inputDir.lengthSq() > 0.001) {
      inputDir.normalize();
      this._velocity.lerp(inputDir.multiplyScalar(speed), 1.0 - this.smoothness);
    } else {
      this._velocity.multiplyScalar(Math.pow(this.smoothness, delta * 60));
    }

    this.camera.position.addScaledVector(this._velocity, delta);

    // Apply smooth rotation damping
    this._euler.y += this._angularVelocity.x;
    this._euler.x = Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, this._euler.x + this._angularVelocity.y));
    this._angularVelocity.multiplyScalar(Math.pow(this.smoothness, delta * 60));

    // Roll / Dutch Angle
    this._roll = THREE.MathUtils.lerp(this._roll, this._targetRoll, 8.0 * delta);

    if (this.trackingMode !== 'lookat') {
      const qYawPitch = new THREE.Quaternion().setFromEuler(this._euler);
      const qRoll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, -1), this._roll);
      this.camera.quaternion.copy(qYawPitch).multiply(qRoll);
    }

    // Follow Ship Mode: maintain relative offset as ship moves
    if (this.trackingMode === 'follow' && this._lastShipPos) {
      const deltaShip = targetPos.clone().sub(this._lastShipPos);
      this.camera.position.add(deltaShip);
    }
    this._lastShipPos = targetPos.clone();
  }

  _stopRigButtonAction() {
    if (this._activeButtonEl) {
      this._activeButtonEl.classList.remove('pressed');
      this._activeButtonEl = null;
    }
    this._activeButtonAction = null;
  }

  _stepRigAction(action) {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const worldUp = new THREE.Vector3(0, 1, 0);
    const mult = this.dpadSpeedMultiplier || 1.0;
    const stepDist = 0.65 * mult;
    const stepAngle = THREE.MathUtils.degToRad(3.2 * mult);

    switch (action) {
      case 'dollyIn':
        this.camera.position.addScaledVector(forward, stepDist);
        break;
      case 'dollyOut':
        this.camera.position.addScaledVector(forward, -stepDist);
        break;
      case 'truckLeft':
        this.camera.position.addScaledVector(right, -stepDist);
        break;
      case 'truckRight':
        this.camera.position.addScaledVector(right, stepDist);
        break;
      case 'pedestalUp':
        this.camera.position.addScaledVector(worldUp, stepDist);
        break;
      case 'pedestalDown':
        this.camera.position.addScaledVector(worldUp, -stepDist);
        break;
      case 'panLeft':
        this._euler.y += stepAngle;
        break;
      case 'panRight':
        this._euler.y -= stepAngle;
        break;
      case 'tiltUp':
        this._euler.x = Math.min(Math.PI * 0.48, this._euler.x + stepAngle);
        break;
      case 'tiltDown':
        this._euler.x = Math.max(-Math.PI * 0.48, this._euler.x - stepAngle);
        break;
      case 'rollLeft':
        this._targetRoll += stepAngle;
        break;
      case 'rollRight':
        this._targetRoll -= stepAngle;
        break;
    }
  }

  _executeRigAction(action, delta) {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const worldUp = new THREE.Vector3(0, 1, 0);
    const mult = this.dpadSpeedMultiplier || 1.0;
    const panSpeed = 1.4 * mult * delta;
    const transSpeed = this.moveSpeed * 0.75 * mult * delta;

    switch (action) {
      case 'dollyIn':
        this.camera.position.addScaledVector(forward, transSpeed);
        break;
      case 'dollyOut':
        this.camera.position.addScaledVector(forward, -transSpeed);
        break;
      case 'truckLeft':
        this.camera.position.addScaledVector(right, -transSpeed);
        break;
      case 'truckRight':
        this.camera.position.addScaledVector(right, transSpeed);
        break;
      case 'pedestalUp':
        this.camera.position.addScaledVector(worldUp, transSpeed);
        break;
      case 'pedestalDown':
        this.camera.position.addScaledVector(worldUp, -transSpeed);
        break;
      case 'panLeft':
        this._euler.y += panSpeed;
        break;
      case 'panRight':
        this._euler.y -= panSpeed;
        break;
      case 'tiltUp':
        this._euler.x = Math.min(Math.PI * 0.48, this._euler.x + panSpeed);
        break;
      case 'tiltDown':
        this._euler.x = Math.max(-Math.PI * 0.48, this._euler.x - panSpeed);
        break;
      case 'rollLeft':
        this._targetRoll += 1.2 * mult * delta;
        break;
      case 'rollRight':
        this._targetRoll -= 1.2 * mult * delta;
        break;
    }
  }

  _applyCameraShake(delta) {
    this._shakeTime += delta * 4.5;
    const s = this.shakeIntensity * 0.008;
    const shakeYaw = Math.sin(this._shakeTime * 1.7) * s;
    const shakePitch = Math.cos(this._shakeTime * 2.3) * s;
    const shakeRoll = Math.sin(this._shakeTime * 1.1) * s * 1.5;

    const qShake = new THREE.Quaternion().setFromEuler(new THREE.Euler(shakePitch, shakeYaw, shakeRoll, 'YXZ'));
    this.camera.quaternion.multiply(qShake);
  }

  _getTargetPosition() {
    if (this._gameState._playerShip && this._gameState._playerShip.mesh) {
      return this._gameState._playerShip.mesh.position.clone();
    }
    return new THREE.Vector3(0, 2, 0);
  }

  // ---------------------------------------------------------------------------
  // Keyframe Spline Path System
  // ---------------------------------------------------------------------------

  addKeyframe() {
    const kf = {
      id: Date.now(),
      position: this.camera.position.clone(),
      quaternion: this.camera.quaternion.clone(),
      fov: this.camera.fov,
      roll: this._roll
    };
    this.keyframes.push(kf);
    this._rebuildPathSpline();
    this._renderKeyframeChips();
    this._showToast(`Keyframe #${this.keyframes.length} Captured`);
  }

  deleteKeyframe(index) {
    if (index >= 0 && index < this.keyframes.length) {
      this.keyframes.splice(index, 1);
      this._rebuildPathSpline();
      this._renderKeyframeChips();
    }
  }

  jumpToKeyframe(index) {
    const kf = this.keyframes[index];
    if (!kf) return;
    this.camera.position.copy(kf.position);
    this.camera.quaternion.copy(kf.quaternion);
    this.camera.fov = kf.fov;
    this.camera.updateProjectionMatrix();
    this._euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    this._roll = kf.roll;
    this._targetRoll = kf.roll;
  }

  playPath() {
    if (this.keyframes.length < 2) {
      this._showToast("Add at least 2 keyframes to play path!");
      return;
    }
    this.isPlayingPath = true;
    this.pathTime = 0.0;
    this._rebuildPathSpline();
    this._updateUIState();
    this._showToast("Playing Cinematic Camera Track...");
  }

  stopPath() {
    this.isPlayingPath = false;
    this._updateUIState();
  }

  _updatePathPlayback(delta) {
    this.pathTime += delta;
    const progress = this.pathTime / Math.max(0.1, this.pathDuration);

    if (progress >= 1.0) {
      if (this.pathLoop) {
        this.pathTime = this.pathTime % this.pathDuration;
      } else {
        this.isPlayingPath = false;
        this.pathTime = this.pathDuration;
        this._updateUIState();
        return;
      }
    }

    const t = Math.min(Math.max(this.pathTime / this.pathDuration, 0), 1);
    this._samplePath(t);
  }

  _samplePath(t) {
    if (!this.pathCurve) return;

    // 1. Spline position
    const pos = this.pathCurve.getPoint(t);
    this.camera.position.copy(pos);

    // 2. Quaternion & FOV interpolation
    const totalSegments = this.keyframes.length - 1;
    const currentSegment = Math.min(Math.floor(t * totalSegments), totalSegments - 1);
    const segT = (t * totalSegments) - currentSegment;

    const kfA = this.keyframes[currentSegment];
    const kfB = this.keyframes[currentSegment + 1];

    if (kfA && kfB) {
      this.camera.quaternion.copy(kfA.quaternion).slerp(kfB.quaternion, segT);
      this.camera.fov = THREE.MathUtils.lerp(kfA.fov, kfB.fov, segT);
      this.camera.updateProjectionMatrix();
      this._euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    }
  }

  _rebuildPathSpline() {
    if (this.keyframes.length < 2) {
      this.pathCurve = null;
      if (this._pathSplineMesh) {
        this._scene.remove(this._pathSplineMesh);
        this._pathSplineMesh = null;
      }
      return;
    }

    const points = this.keyframes.map(k => k.position.clone());
    this.pathCurve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);

    // Visual trajectory line
    if (this._pathSplineMesh) {
      this._scene.remove(this._pathSplineMesh);
    }

    if (this.showPathMesh) {
      const curvePoints = this.pathCurve.getPoints(points.length * 20);
      const geo = new THREE.BufferGeometry().setFromPoints(curvePoints);
      const mat = new THREE.LineBasicMaterial({
        color: 0xffd700,
        linewidth: 2,
        transparent: true,
        opacity: 0.8
      });
      this._pathSplineMesh = new THREE.Line(geo, mat);
      this._pathSplineMesh.name = 'directorSpline';
      this._scene.add(this._pathSplineMesh);
    }
  }

  // ---------------------------------------------------------------------------
  // 1-Click Shot Presets
  // ---------------------------------------------------------------------------

  applyShotPreset(preset) {
    const target = this._getTargetPosition();
    this.trackingMode = 'free';

    switch (preset) {
      case 'bowHero':
        // Low angle in front of ship bow looking up at sails
        this.camera.position.copy(target).add(new THREE.Vector3(0, 1.2, -18));
        this.camera.lookAt(target.clone().add(new THREE.Vector3(0, 4.5, 0)));
        this.camera.fov = 38;
        this._targetRoll = -0.06;
        break;

      case 'masthead':
        // Overhead masthead angle looking down at churning sea & deck
        this.camera.position.copy(target).add(new THREE.Vector3(4, 16, 2));
        this.camera.lookAt(target.clone().add(new THREE.Vector3(0, 0, -4)));
        this.camera.fov = 55;
        this._targetRoll = 0.0;
        break;

      case 'broadside':
        // Side waterline view across gun deck
        this.camera.position.copy(target).add(new THREE.Vector3(15, 1.5, 0));
        this.camera.lookAt(target.clone().add(new THREE.Vector3(0, 2, 0)));
        this.camera.fov = 42;
        this._targetRoll = 0.04;
        break;

      case 'waveSkimmer':
        // Ultra-low water level looking through swells
        this.camera.position.copy(target).add(new THREE.Vector3(-12, 0.4, -14));
        this.camera.lookAt(target.clone().add(new THREE.Vector3(0, 2.5, 2)));
        this.camera.fov = 28;
        this._targetRoll = 0.08;
        break;

      case 'dutchAction':
        // Dynamic Dutch angle action framing
        this.camera.position.copy(target).add(new THREE.Vector3(-14, 4, -10));
        this.camera.lookAt(target.clone().add(new THREE.Vector3(0, 1.5, 0)));
        this.camera.fov = 45;
        this._targetRoll = 0.28; // ~16 deg Dutch tilt
        break;

      case 'birdsEye':
        // High tactical overhead
        this.camera.position.copy(target).add(new THREE.Vector3(0, 38, 2));
        this.camera.lookAt(target);
        this.camera.fov = 65;
        this._targetRoll = 0.0;
        break;
    }

    this.camera.updateProjectionMatrix();
    this._euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    this._showToast(`Preset: ${preset}`);
  }

  // ---------------------------------------------------------------------------
  // Optics & Composition Controls
  // ---------------------------------------------------------------------------

  setFOV(fovVal) {
    this.camera.fov = Math.max(12, Math.min(115, fovVal));
    this.camera.updateProjectionMatrix();
    if (this._dom.fovSlider) this._dom.fovSlider.value = this.camera.fov;
    if (this._dom.fovReadout) this._dom.fovReadout.innerText = `${Math.round(this.camera.fov)}°`;
  }

  setLensPreset(lens) {
    const map = { '18mm': 100, '24mm': 84, '35mm': 63, '50mm': 46, '85mm': 28, '135mm': 18 };
    if (map[lens]) {
      this.setFOV(map[lens]);
      this._showToast(`Lens: ${lens} (${map[lens]}° FOV)`);
    }
  }

  setAspectRatio(ratio) {
    this.aspectRatio = ratio;
    const topBar = this._dom.letterboxTop;
    const botBar = this._dom.letterboxBottom;
    if (!topBar || !botBar) return;

    topBar.className = '';
    botBar.className = '';

    if (ratio === 'cinemascope') {
      topBar.classList.add('active-cinemascope');
      botBar.classList.add('active-cinemascope');
      this._showToast("2.39:1 Anamorphic Cinemascope Bars Enabled");
    } else if (ratio === '4:3') {
      topBar.classList.add('active-academy');
      botBar.classList.add('active-academy');
      this._showToast("4:3 Academy Mask Enabled");
    } else {
      this._showToast("Standard Fullscreen (No Matte)");
    }
  }

  setGridOverlay(grid) {
    this.gridOverlay = grid;
    if (this._dom.gridOverlay) {
      if (grid === 'thirds') {
        this._dom.gridOverlay.classList.add('active');
        this._showToast("Rule of Thirds Grid: ON");
      } else {
        this._dom.gridOverlay.classList.remove('active');
        this._showToast("Grid: OFF");
      }
    }
  }

  toggleUIHide() {
    this.uiHidden = !this.uiHidden;
    const container = this._dom.container;
    const launchBtn = this._dom.launchBtn;
    const fps = document.getElementById('fps-counter');

    if (this.uiHidden) {
      container?.classList.add('ui-hidden');
      if (launchBtn) launchBtn.style.display = 'none';
      if (fps) fps.style.display = 'none';
      this._showToast("UI Hidden for Recording — Press [H] or [Esc] to restore", 3500);
    } else {
      container?.classList.remove('ui-hidden');
      if (launchBtn) launchBtn.style.display = 'flex';
      if (fps) fps.style.display = 'block';
    }
  }

  // ---------------------------------------------------------------------------
  // Environment & Atmosphere Hooks
  // ---------------------------------------------------------------------------

  setTimeOfDay(tod) {
    if (this._gameState?._environmentManager) {
      this._gameState._environmentManager.setTimeOfDay(tod);
    } else {
      this._applyDirectTimeOfDay(tod);
    }
    this._showToast(`Time of Day: ${tod.toFixed(1)}h`);
  }

  _applyDirectTimeOfDay(tod) {
    const sun = this._gameState?._sun || this._scene?.getObjectByName('sunLight');
    const moon = this._gameState?._moon || this._scene?.getObjectByName('moonLight');
    const ambient = this._gameState?._ambient || this._scene?.children?.find(c => c.isAmbientLight || c.isHemisphereLight);
    const skyMesh = this._gameState?._sky?.mesh || this._scene?.getObjectByName('skyMesh');
    const oceanMesh = this._gameState?._ocean?.mesh;

    const sunRadius = 60;
    const sunTheta = ((tod - 6) / 12) * Math.PI;
    const sunX = Math.cos(sunTheta) * sunRadius;
    const sunY = Math.sin(sunTheta) * sunRadius;
    const sunZ = Math.sin(sunTheta) * 20;

    const moonTheta = sunTheta + Math.PI;
    const moonX = Math.cos(moonTheta) * sunRadius;
    const moonY = Math.sin(moonTheta) * sunRadius;
    const moonZ = Math.sin(moonTheta) * 20;

    const nightFactor = THREE.MathUtils.clamp((sunRadius * 0.1 - sunY) / (sunRadius * 0.7), 0.0, 1.0);
    const sunAlt = THREE.MathUtils.clamp((sunY + 5) / (sunRadius + 5), 0.0, 1.0);

    if (sun) {
      sun.position.set(sunX, sunY, sunZ);
      sun.intensity = Math.max(0.05, sunAlt * 1.5);
      sun.castShadow = (sunY > 0);
    }
    if (moon) {
      moon.position.set(moonX, moonY, moonZ);
      moon.intensity = (1.0 - sunAlt) * 0.4;
      moon.castShadow = (moonY > 0 && sunY <= 0);
    }
    if (ambient) {
      ambient.intensity = THREE.MathUtils.lerp(0.3, 0.9, sunAlt);
    }
    if (skyMesh?.material?.uniforms) {
      const u = skyMesh.material.uniforms;
      if (u.uSunDir) u.uSunDir.value.set(sunX, sunY, sunZ).normalize();
      if (u.uMoonDir) u.uMoonDir.value.set(moonX, moonY, moonZ).normalize();
      if (u.uNightFactor) u.uNightFactor.value = nightFactor;
    }
    if (oceanMesh?.material?.uniforms?.uSunDir) {
      oceanMesh.material.uniforms.uSunDir.value.set(sunX, sunY, sunZ).normalize();
    }
  }

  setWeather(wType) {
    if (this._gameState?._environmentManager) {
      if (wType === 'storm') {
        this._gameState._environmentManager.toggleStorm(true);
        this._gameState._environmentManager.toggleDenseFog(false);
      } else if (wType === 'fog') {
        this._gameState._environmentManager.toggleStorm(false);
        this._gameState._environmentManager.toggleDenseFog(true);
      } else {
        this._gameState._environmentManager.toggleStorm(false);
        this._gameState._environmentManager.toggleDenseFog(false);
        if (wType === 'night') {
          this.setTimeOfDay(0.0);
        } else if (wType === 'sunset') {
          this.setTimeOfDay(17.5);
        } else if (wType === 'clear') {
          this.setTimeOfDay(12.0);
        }
      }
    } else {
      if (wType === 'night') {
        this.setTimeOfDay(0.0);
      } else if (wType === 'sunset') {
        this.setTimeOfDay(17.5);
      } else if (wType === 'clear') {
        this.setTimeOfDay(12.0);
      }
      if (wType === 'fog') {
        if (this._scene) this._scene.fog = new THREE.FogExp2(0x9bb0b5, 0.04);
      } else {
        if (this._scene && this._scene.fog) {
          this._scene.fog.density = 0.005;
        }
      }
    }

    const weatherKeyMap = {
      clear: 'sunny',
      sunset: 'sunset',
      storm: 'stormy',
      night: 'night',
      fog: 'foggy'
    };
    const key = weatherKeyMap[wType] || wType;
    if (this._gameState?._weather?.weatherConfigs?.[key]) {
      this._gameState._weather.applyWeather(
        this._gameState._weather.weatherConfigs[key],
        {
          ambient: this._gameState._ambient,
          sun: this._gameState._sun,
          ocean: this._gameState._ocean,
          sky: this._gameState._sky,
          lanternLight: this._gameState._dockStall?.lanternLight,
          scene: this._scene
        },
        key
      );
    }
    this._showToast(`Atmosphere: ${wType.toUpperCase()}`);
  }

  setWaveScale(scale) {
    if (this._gameState?._ocean) {
      this._gameState._ocean.setWaveScale?.(scale);
      if (this._gameState._ocean.mesh?.material?.uniforms?.uWaveScale) {
        this._gameState._ocean.mesh.material.uniforms.uWaveScale.value = scale;
      }
      this._showToast(`Wave Amplitude: ${scale.toFixed(1)}m`);
    }
  }

  setPaperShaderStyle(style) {
    const styleMap = { 0: 'off', 1: 'painterly', 2: 'hatching' };
    const val = styleMap[style] || 'off';
    settingsManager.set('paperShader', val);
    if (this._paperFilter) {
      if (style === 1) this._paperFilter.setStyle(1);
      if (style === 2) this._paperFilter.setStyle(0);
    }
    this._showToast(`Art Style: ${style === 0 ? 'Clean 3D' : style === 1 ? 'Kuwahara Painterly' : 'Crosshatch'}`);
  }

  // ---------------------------------------------------------------------------
  // DOM Setup & UI Construction
  // ---------------------------------------------------------------------------

  _initDOM() {
    // 1. Floating Launch Button
    const launchBtn = document.createElement('button');
    launchBtn.id = 'director-launch-btn';
    launchBtn.innerHTML = `
      <span class="icon"><span class="pixel-icon icon-director-clapper size-18"></span></span>
      <span>Director Mode</span>
      <span class="key-badge">F8</span>
    `;
    launchBtn.addEventListener('click', () => this.toggle());
    document.body.appendChild(launchBtn);
    this._dom.launchBtn = launchBtn;

    // 2. Cinematic Letterbox Bars
    const topBar = document.createElement('div');
    topBar.id = 'director-letterbox-top';
    const botBar = document.createElement('div');
    botBar.id = 'director-letterbox-bottom';
    document.body.appendChild(topBar);
    document.body.appendChild(botBar);
    this._dom.letterboxTop = topBar;
    this._dom.letterboxBottom = botBar;

    // 3. Rule of Thirds Grid Overlay
    const gridOverlay = document.createElement('div');
    gridOverlay.id = 'director-grid-overlay';
    gridOverlay.innerHTML = `
      <div class="grid-line h-1"></div>
      <div class="grid-line h-2"></div>
      <div class="grid-line v-1"></div>
      <div class="grid-line v-2"></div>
      <div class="grid-center-cross"></div>
    `;
    document.body.appendChild(gridOverlay);
    this._dom.gridOverlay = gridOverlay;

    // 4. Toast Notification
    const toast = document.createElement('div');
    toast.id = 'director-toast';
    document.body.appendChild(toast);
    this._dom.toast = toast;

    // 5. Master Director Container
    const container = document.createElement('div');
    container.id = 'director-container';
    container.style.display = 'none';

    container.innerHTML = `
      <!-- Top Director Bar -->
      <div class="director-top-bar">
        <div class="director-title-badge">
          <div class="rec-dot"></div>
          <span>DIRECTOR DECK</span>
        </div>
        <div id="director-state-badge" class="director-state-tag halted">HALTED</div>

        <!-- Time Manipulation -->
        <div class="director-time-group">
          <button id="btn-director-halt" class="director-btn btn-halt active" title="Freeze simulation (Space)"><span class="pixel-icon icon-director-clapper size-14"></span> Freeze</button>
          <button id="btn-director-step" class="director-btn" title="Advance 1 frame (.)"><span class="pixel-icon icon-play-step size-14"></span> Step 1F</button>
          
          <button class="director-btn btn-speed" data-speed="0.1">0.1x</button>
          <button class="director-btn btn-speed" data-speed="0.25">0.25x</button>
          <button class="director-btn btn-speed" data-speed="0.5">0.5x</button>
          <button class="director-btn btn-speed" data-speed="1.0">1.0x</button>
          <button class="director-btn btn-speed" data-speed="2.0">2.0x</button>

          <div class="director-speed-slider-wrap">
            <span id="director-speed-label">1.0x</span>
            <input type="range" id="director-speed-scrub" min="0" max="3" step="0.05" value="1.0" />
          </div>
        </div>

        <!-- Top Right Actions -->
        <div class="director-actions-group">
          <button id="btn-director-hide-ui" class="director-btn" title="Hide UI for recording (H)"><span class="pixel-icon icon-hide-ui-eye size-14"></span> Hide UI (H)</button>
          <button id="btn-director-exit" class="director-btn" style="background:#552222; border-color:#ff6666;" title="Exit (F8)"><span class="pixel-icon icon-close-cross size-14"></span> Exit</button>
        </div>
      </div>

      <!-- Bottom Cinematic Deck -->
      <div class="director-deck" id="director-main-deck">
        <div class="director-deck-header">
          <div class="director-tabs">
            <button class="director-tab-btn active" data-tab="tab-rig"><span class="pixel-icon icon-cinema-camera size-16"></span> Rig & Controls</button>
            <button class="director-tab-btn" data-tab="tab-keyframe"><span class="pixel-icon icon-film-reel size-16"></span> Keyframe Studio</button>
            <button class="director-tab-btn" data-tab="tab-lens"><span class="pixel-icon icon-optics-lens size-16"></span> Optics & Framing</button>
            <button class="director-tab-btn" data-tab="tab-env"><span class="pixel-icon icon-sunset size-16"></span> Atmosphere & World</button>
          </div>
          <div class="director-deck-controls">
            <button id="btn-deck-minimize" class="director-btn" style="padding:2px 8px; font-size:10px;">_ Minimize</button>
          </div>
        </div>

        <div class="director-deck-body">
          <!-- Tab 1: Rig & Controls -->
          <div class="director-tab-panel active" id="tab-rig">
            <div class="rig-layout-grid">
              <!-- Movement Parameters -->
              <div class="rig-col-card">
                <div class="rig-col-title">Dynamics & Flight</div>
                <div class="deck-field-row">
                  <label>Fly Speed</label>
                  <input type="range" id="slider-fly-speed" min="5" max="60" step="1" value="22" />
                  <span class="deck-val-readout" id="val-fly-speed">22</span>
                </div>
                <div class="deck-field-row">
                  <label>Smoothing</label>
                  <input type="range" id="slider-fly-smooth" min="0.5" max="0.98" step="0.02" value="0.90" />
                  <span class="deck-val-readout" id="val-fly-smooth">0.90</span>
                </div>
                <div class="deck-field-row">
                  <label>Mode</label>
                  <select id="select-track-mode" style="background:#111824; color:#ffd700; border:2px solid #3b4e68; border-radius:0; font-family:'Cinzel', serif; font-size:10px; padding:3px 6px; outline:none;">
                    <option value="free">Free 6-DOF Flight</option>
                    <option value="follow">Follow Ship Drone</option>
                    <option value="orbit">Continuous Orbit</option>
                    <option value="lookat">Lock Look-At</option>
                  </select>
                </div>
                <div class="deck-field-row">
                  <label>Waves in Freeze</label>
                  <input type="checkbox" id="chk-keep-waves" checked style="accent-color:#d4af37;" />
                </div>
              </div>

              <!-- Virtual Rig D-Pad Controls -->
              <div class="rig-col-card" style="min-width: 320px;">
                <div class="rig-col-title">
                  <span>Camera Rig Console</span>
                  <div style="display:flex; align-items:center; gap:4px;">
                    <span style="font-size:9px; color:#94a3b8;">Speed:</span>
                    <button class="director-btn btn-dpad-speed" data-mult="0.5" style="padding:1px 5px; font-size:9px;">0.5x</button>
                    <button class="director-btn btn-dpad-speed active" data-mult="1.0" style="padding:1px 5px; font-size:9px;">1x</button>
                    <button class="director-btn btn-dpad-speed" data-mult="2.0" style="padding:1px 5px; font-size:9px;">2x</button>
                  </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                  <!-- Translation (Move) -->
                  <div class="rig-sub-cluster">
                    <div style="font-size: 9px; font-weight: 700; color: #7dd3fc; margin-bottom: 5px; text-transform: uppercase;">
                      Move (Dolly / Truck / Crane)
                    </div>
                    <div class="camera-dpad-cross">
                      <div></div>
                      <button class="camera-dpad-btn" data-action="dollyIn" title="Dolly Forward (hold)">▲ In</button>
                      <button class="camera-dpad-btn" data-action="pedestalUp" title="Crane / Pedestal Up (hold)">⤊ Up</button>

                      <button class="camera-dpad-btn" data-action="truckLeft" title="Truck Left (hold)">◀ L</button>
                      <button class="camera-dpad-btn btn-stop-move" title="Instant Stop / Reset Velocity">■</button>
                      <button class="camera-dpad-btn" data-action="truckRight" title="Truck Right (hold)">R ▶</button>

                      <div></div>
                      <button class="camera-dpad-btn" data-action="dollyOut" title="Dolly Backward (hold)">▼ Out</button>
                      <button class="camera-dpad-btn" data-action="pedestalDown" title="Crane / Pedestal Down (hold)">⤋ Dn</button>
                    </div>
                  </div>

                  <!-- Rotation (Aim) -->
                  <div class="rig-sub-cluster">
                    <div style="font-size: 9px; font-weight: 700; color: #f3e3b4; margin-bottom: 5px; text-transform: uppercase;">
                      Aim (Pan / Tilt / Roll)
                    </div>
                    <div class="camera-dpad-cross">
                      <button class="camera-dpad-btn" data-action="rollLeft" title="Dutch Tilt Left (hold)">↶</button>
                      <button class="camera-dpad-btn" data-action="tiltUp" title="Tilt Up (hold)">▲ Tilt</button>
                      <button class="camera-dpad-btn" data-action="rollRight" title="Dutch Tilt Right (hold)">↷</button>

                      <button class="camera-dpad-btn" data-action="panLeft" title="Pan Left (hold)">◀ Pan</button>
                      <button class="camera-dpad-btn" data-action="levelHorizon" title="Level Horizon to 0°"><span class="pixel-icon icon-anchor size-14"></span></button>
                      <button class="camera-dpad-btn" data-action="panRight" title="Pan Right (hold)">Pan ▶</button>

                      <div></div>
                      <button class="camera-dpad-btn" data-action="tiltDown" title="Tilt Down (hold)">▼ Tilt</button>
                      <div></div>
                    </div>
                  </div>
                </div>
                <div style="font-size: 8.5px; color: #64748b; margin-top: 6px; text-align: center;">
                  Click to jog 1 step · Hold down to move continuously · Release to stop
                </div>
              </div>

              <!-- Shot Presets -->
              <div class="rig-col-card">
                <div class="rig-col-title">1-Click Trailer Shots</div>
                <div class="shot-preset-grid">
                  <button class="shot-preset-btn" data-preset="bowHero"><span class="pixel-icon icon-harpoon size-14"></span> Bow Hero</button>
                  <button class="shot-preset-btn" data-preset="masthead"><span class="pixel-icon icon-compass size-14"></span> Masthead</button>
                  <button class="shot-preset-btn" data-preset="broadside"><span class="pixel-icon icon-cannon-flash size-14"></span> Broadside</button>
                  <button class="shot-preset-btn" data-preset="waveSkimmer"><span class="pixel-icon icon-ocean-wave size-14"></span> Wave Skim</button>
                  <button class="shot-preset-btn" data-preset="dutchAction"><span class="pixel-icon icon-cutlasses size-14"></span> Dutch Action</button>
                  <button class="shot-preset-btn" data-preset="birdsEye"><span class="pixel-icon icon-treasure-map size-14"></span> Bird's Eye</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Tab 2: Keyframe Studio -->
          <div class="director-tab-panel" id="tab-keyframe">
            <div class="keyframe-studio-wrap">
              <div class="keyframe-controls-row">
                <div style="display:flex; gap:8px; align-items:center;">
                  <button id="btn-add-kf" class="director-btn" style="background:#225533; border-color:#44cc66;">+ Add Keyframe (K)</button>
                  <button id="btn-play-path" class="director-btn" style="background:#224466; border-color:#38bdf8;"><span class="pixel-icon icon-play size-14"></span> Play Path</button>
                  <button id="btn-stop-path" class="director-btn"><span class="pixel-icon icon-cancel-cross size-14"></span> Stop</button>
                  <label style="font-size:11px; display:flex; align-items:center; gap:4px; margin-left:8px;">
                    <input type="checkbox" id="chk-loop-path" checked style="accent-color:#d4af37;" /> Loop
                  </label>
                  <label style="font-size:11px; display:flex; align-items:center; gap:4px;">
                    <input type="checkbox" id="chk-show-spline" checked style="accent-color:#d4af37;" /> 3D Curve
                  </label>
                </div>
                <div style="display:flex; gap:10px; align-items:center; font-size:11px;">
                  <label>Duration:</label>
                  <input type="range" id="slider-path-duration" min="2" max="25" step="0.5" value="8" style="width:80px; accent-color:#d4af37;" />
                  <span id="val-path-duration" style="font-family:monospace; color:#ffe082;">8.0s</span>
                </div>
              </div>

              <!-- Timeline Chips Bar -->
              <div class="keyframe-timeline-bar" id="keyframe-chips-bar">
                <span style="font-size:11px; color:#64748b; font-style:italic;">No keyframes captured. Position camera and click [+ Add Keyframe]</span>
              </div>
            </div>
          </div>

          <!-- Tab 3: Optics & Framing -->
          <div class="director-tab-panel" id="tab-lens">
            <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:16px;">
              <!-- Focal Length / FOV -->
              <div class="rig-col-card">
                <div class="rig-col-title">Lenses & FOV</div>
                <div class="deck-field-row">
                  <label>Field of View</label>
                  <input type="range" id="slider-fov" min="15" max="110" step="1" value="60" />
                  <span class="deck-val-readout" id="val-fov">60°</span>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:8px;">
                  <button class="director-btn btn-lens" data-lens="18mm">18mm</button>
                  <button class="director-btn btn-lens" data-lens="24mm">24mm</button>
                  <button class="director-btn btn-lens" data-lens="35mm">35mm</button>
                  <button class="director-btn btn-lens" data-lens="50mm">50mm</button>
                  <button class="director-btn btn-lens" data-lens="85mm">85mm</button>
                  <button class="director-btn btn-lens" data-lens="135mm">135mm</button>
                </div>
              </div>

              <!-- Framing & Aspect Ratio -->
              <div class="rig-col-card">
                <div class="rig-col-title">Cinematic Framing</div>
                <div class="deck-field-row">
                  <label>Matte Bars</label>
                  <select id="select-aspect-ratio" style="background:#1e2d44; color:#fff; border:1px solid #d4af37; border-radius:4px; font-size:10px; padding:2px 6px;">
                    <option value="none">Fullscreen (16:9)</option>
                    <option value="cinemascope">2.39:1 Cinemascope</option>
                    <option value="4:3">4:3 Academy</option>
                  </select>
                </div>
                <div class="deck-field-row">
                  <label>Composition Grid</label>
                  <select id="select-grid-overlay" style="background:#1e2d44; color:#fff; border:1px solid #d4af37; border-radius:4px; font-size:10px; padding:2px 6px;">
                    <option value="none">Off</option>
                    <option value="thirds">Rule of Thirds</option>
                  </select>
                </div>
              </div>

              <!-- Camera Shake -->
              <div class="rig-col-card">
                <div class="rig-col-title">Camera Motion Texture</div>
                <div class="deck-field-row">
                  <label>Handheld Sway</label>
                  <input type="range" id="slider-shake" min="0" max="2.5" step="0.1" value="0" />
                  <span class="deck-val-readout" id="val-shake">Off</span>
                </div>
                <div style="font-size:10px; color:#94a3b8; line-height:1.4; margin-top:6px;">
                  Adds organic nautical sway & vibration for handheld trailer grit.
                </div>
              </div>
            </div>
          </div>

          <!-- Tab 4: Atmosphere & World -->
          <div class="director-tab-panel" id="tab-env">
            <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:16px;">
              <!-- Time of Day -->
              <div class="rig-col-card">
                <div class="rig-col-title">Time of Day (Sun & Moon)</div>
                <div class="deck-field-row">
                  <label>Hour</label>
                  <input type="range" id="slider-tod" min="0" max="24" step="0.1" value="12" />
                  <span class="deck-val-readout" id="val-tod">12.0h</span>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:8px;">
                  <button class="director-btn btn-tod-preset" data-tod="6.5">Dawn</button>
                  <button class="director-btn btn-tod-preset" data-tod="12.0">Noon</button>
                  <button class="director-btn btn-tod-preset" data-tod="17.5">Golden</button>
                  <button class="director-btn btn-tod-preset" data-tod="19.5">Dusk</button>
                  <button class="director-btn btn-tod-preset" data-tod="0.0">Midnight</button>
                </div>
              </div>

              <!-- Atmosphere & Weather -->
              <div class="rig-col-card">
                <div class="rig-col-title">Atmosphere Presets</div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                  <button class="director-btn btn-weather-preset" data-weather="clear"><span class="pixel-icon icon-sun size-14"></span> Clear</button>
                  <button class="director-btn btn-weather-preset" data-weather="sunset"><span class="pixel-icon icon-sunset size-14"></span> Sunset</button>
                  <button class="director-btn btn-weather-preset" data-weather="storm"><span class="pixel-icon icon-storm size-14"></span> Storm</button>
                  <button class="director-btn btn-weather-preset" data-weather="night"><span class="pixel-icon icon-moon size-14"></span> Night</button>
                  <button class="director-btn btn-weather-preset" data-weather="fog"><span class="pixel-icon icon-sea-fog size-14"></span> Dense Fog</button>
                </div>
              </div>

              <!-- Water & Shaders -->
              <div class="rig-col-card">
                <div class="rig-col-title">Ocean & Art Style</div>
                <div class="deck-field-row">
                  <label>Wave Height</label>
                  <input type="range" id="slider-waves" min="0.2" max="3.5" step="0.1" value="1.0" />
                  <span class="deck-val-readout" id="val-waves">1.0m</span>
                </div>
                <div class="deck-field-row">
                  <label>Art Shader</label>
                  <select id="select-shader-style" style="background:#111824; color:#ffd700; border:2px solid #3b4e68; border-radius:0; font-family:'Cinzel', serif; font-size:10px; padding:3px 6px; outline:none;">
                    <option value="0">Clean 3D</option>
                    <option value="1">Kuwahara Painterly</option>
                    <option value="2">Crosshatch Sketch</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(container);
    this._dom.container = container;
    this._dom.stateBadge = container.querySelector('#director-state-badge');
    this._dom.fovReadout = container.querySelector('#val-fov');
    this._dom.fovSlider = container.querySelector('#slider-fov');
    this._dom.chipsBar = container.querySelector('#keyframe-chips-bar');
    this._dom.speedLabel = container.querySelector('#director-speed-label');
    this._dom.speedScrub = container.querySelector('#director-speed-scrub');
    this._dom.haltBtn = container.querySelector('#btn-director-halt');
  }

  // ---------------------------------------------------------------------------
  // Event Binding
  // ---------------------------------------------------------------------------

  _initEvents() {
    // Global Keyboard listener
    window.addEventListener('keydown', (e) => {
      // Toggle Director Mode with F8 or tilde
      if (e.code === 'F8' || (e.code === 'Backquote' && !e.ctrlKey && !e.altKey)) {
        e.preventDefault();
        this.toggle();
        return;
      }

      if (!this.isActive) return;

      // Clean Capture / Hide UI toggle
      if (e.code === 'KeyH') {
        e.preventDefault();
        this.toggleUIHide();
        return;
      }

      // Restore UI on Escape if hidden
      if (e.code === 'Escape' && this.uiHidden) {
        e.preventDefault();
        this.toggleUIHide();
        return;
      }

      // Add keyframe shortcut K
      if (e.code === 'KeyK') {
        e.preventDefault();
        this.addKeyframe();
        return;
      }

      // Freeze / Halt toggle with Space
      if (e.code === 'Space') {
        // Only if not focusing an input
        if (document.activeElement.tagName !== 'INPUT') {
          e.preventDefault();
          this.toggleHalt();
          return;
        }
      }

      // Step 1 frame forward with Period (.)
      if (e.code === 'Period') {
        e.preventDefault();
        this.stepFrame();
        return;
      }

      this._keysDown.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this._keysDown.delete(e.code);
    });

    // Mouse Look (Right Mouse Button Drag)
    window.addEventListener('mousedown', (e) => {
      if (!this.isActive) return;
      if (e.button === 2) {
        this._isRightMouseDown = true;
      }
    });

    // Global release hooks for mouse & pointer
    const stopButtonRig = () => {
      this._stopRigButtonAction();
    };

    window.addEventListener('pointerup', stopButtonRig);
    window.addEventListener('pointercancel', stopButtonRig);
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) {
        this._isRightMouseDown = false;
      }
      stopButtonRig();
    });
    window.addEventListener('blur', stopButtonRig);

    window.addEventListener('mousemove', (e) => {
      if (!this.isActive) return;
      if (this._isRightMouseDown) {
        this._angularVelocity.x -= e.movementX * this.mouseSensitivity;
        this._angularVelocity.y -= e.movementY * this.mouseSensitivity;
      }
    });

    // Prevent default context menu on right click in Director Mode
    window.addEventListener('contextmenu', (e) => {
      if (this.isActive) {
        e.preventDefault();
      }
    });

    // Resize
    window.addEventListener('resize', () => {
      if (this.camera) {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
      }
    });

    this._bindDeckEvents();
  }

  _bindDeckEvents() {
    const c = this._dom.container;

    // Top Bar Buttons
    c.querySelector('#btn-director-halt')?.addEventListener('click', () => this.toggleHalt());
    c.querySelector('#btn-director-step')?.addEventListener('click', () => this.stepFrame());
    c.querySelector('#btn-director-hide-ui')?.addEventListener('click', () => this.toggleUIHide());
    c.querySelector('#btn-director-exit')?.addEventListener('click', () => this.deactivate());

    // Speed Preset Buttons
    c.querySelectorAll('.btn-speed').forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = parseFloat(btn.dataset.speed);
        this.setTimeScale(speed);
      });
    });

    // Speed Slider Scrub
    const speedScrub = c.querySelector('#director-speed-scrub');
    speedScrub?.addEventListener('input', (e) => {
      const speed = parseFloat(e.target.value);
      this.setTimeScale(speed);
    });

    // Tab Switching
    c.querySelectorAll('.director-tab-btn').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        c.querySelectorAll('.director-tab-btn').forEach(b => b.classList.remove('active'));
        c.querySelectorAll('.director-tab-panel').forEach(p => p.classList.remove('active'));
        tabBtn.classList.add('active');
        const targetPanel = c.querySelector(`#${tabBtn.dataset.tab}`);
        if (targetPanel) targetPanel.classList.add('active');
      });
    });

    // Minimize / Expand Deck
    const minBtn = c.querySelector('#btn-deck-minimize');
    const deck = c.querySelector('#director-main-deck');
    minBtn?.addEventListener('click', () => {
      deck.classList.toggle('minimized');
      minBtn.innerText = deck.classList.contains('minimized') ? '▲ Expand' : '_ Minimize';
    });

    // D-Pad Speed Multipliers
    c.querySelectorAll('.btn-dpad-speed').forEach(btn => {
      btn.addEventListener('click', () => {
        c.querySelectorAll('.btn-dpad-speed').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.dpadSpeedMultiplier = parseFloat(btn.dataset.mult);
        this._showToast(`Rig Speed: ${this.dpadSpeedMultiplier}x`);
      });
    });

    // Virtual Rig D-Pad Buttons (Click to jog 1 step, Hold to move continuously)
    c.querySelectorAll('.camera-dpad-btn').forEach(btn => {
      const action = btn.dataset.action;
      if (!action) {
        if (btn.classList.contains('btn-stop-move')) {
          btn.addEventListener('click', () => {
            this._velocity.set(0, 0, 0);
            this._angularVelocity.set(0, 0);
            this._stopRigButtonAction();
            this._showToast("Rig Velocity Stopped");
          });
        }
        return;
      }

      if (action === 'levelHorizon') {
        btn.addEventListener('click', () => {
          this._targetRoll = 0.0;
          this._showToast("Horizon Leveled");
        });
        return;
      }

      btn.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return; // Only primary mouse button
        e.preventDefault();
        e.stopPropagation();

        this._stopRigButtonAction();

        this._activeButtonAction = action;
        this._activeButtonEl = btn;
        btn.classList.add('pressed');

        // Immediate single jog step on click
        this._stepRigAction(action);

        try {
          btn.setPointerCapture(e.pointerId);
        } catch (_) {}
      });

      const onEnd = (e) => {
        if (this._activeButtonEl === btn) {
          try {
            btn.releasePointerCapture(e.pointerId);
          } catch (_) {}
          this._stopRigButtonAction();
        }
      };

      btn.addEventListener('pointerup', onEnd);
      btn.addEventListener('pointercancel', onEnd);
      btn.addEventListener('lostpointercapture', onEnd);
      btn.addEventListener('pointerleave', (e) => {
        try {
          if (!btn.hasPointerCapture || !btn.hasPointerCapture(e.pointerId)) {
            onEnd(e);
          }
        } catch (_) {
          onEnd(e);
        }
      });
    });

    // Shot Presets
    c.querySelectorAll('.shot-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => this.applyShotPreset(btn.dataset.preset));
    });

    // Dynamics Sliders
    c.querySelector('#slider-fly-speed')?.addEventListener('input', (e) => {
      this.moveSpeed = parseFloat(e.target.value);
      c.querySelector('#val-fly-speed').innerText = `${this.moveSpeed}`;
    });

    c.querySelector('#slider-fly-smooth')?.addEventListener('input', (e) => {
      this.smoothness = parseFloat(e.target.value);
      c.querySelector('#val-fly-smooth').innerText = `${this.smoothness.toFixed(2)}`;
    });

    c.querySelector('#select-track-mode')?.addEventListener('change', (e) => {
      this.trackingMode = e.target.value;
      this._showToast(`Mode: ${this.trackingMode.toUpperCase()}`);
    });

    c.querySelector('#chk-keep-waves')?.addEventListener('change', (e) => {
      this.keepWavesMoving = e.target.checked;
    });

    // Keyframe Studio Buttons
    c.querySelector('#btn-add-kf')?.addEventListener('click', () => this.addKeyframe());
    c.querySelector('#btn-play-path')?.addEventListener('click', () => this.playPath());
    c.querySelector('#btn-stop-path')?.addEventListener('click', () => this.stopPath());
    c.querySelector('#chk-loop-path')?.addEventListener('change', (e) => {
      this.pathLoop = e.target.checked;
    });
    c.querySelector('#chk-show-spline')?.addEventListener('change', (e) => {
      this.showPathMesh = e.target.checked;
      this._rebuildPathSpline();
    });
    c.querySelector('#slider-path-duration')?.addEventListener('input', (e) => {
      this.pathDuration = parseFloat(e.target.value);
      c.querySelector('#val-path-duration').innerText = `${this.pathDuration.toFixed(1)}s`;
    });

    // Optics & Lens
    c.querySelector('#slider-fov')?.addEventListener('input', (e) => {
      this.setFOV(parseFloat(e.target.value));
    });

    c.querySelectorAll('.btn-lens').forEach(btn => {
      btn.addEventListener('click', () => this.setLensPreset(btn.dataset.lens));
    });

    c.querySelector('#select-aspect-ratio')?.addEventListener('change', (e) => {
      this.setAspectRatio(e.target.value);
    });

    c.querySelector('#select-grid-overlay')?.addEventListener('change', (e) => {
      this.setGridOverlay(e.target.value);
    });

    c.querySelector('#slider-shake')?.addEventListener('input', (e) => {
      this.shakeIntensity = parseFloat(e.target.value);
      c.querySelector('#val-shake').innerText = this.shakeIntensity === 0 ? 'Off' : `${this.shakeIntensity.toFixed(1)}`;
    });

    // Atmosphere Deck
    c.querySelector('#slider-tod')?.addEventListener('input', (e) => {
      const tod = parseFloat(e.target.value);
      this.setTimeOfDay(tod);
      c.querySelector('#val-tod').innerText = `${tod.toFixed(1)}h`;
    });

    c.querySelectorAll('.btn-tod-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const tod = parseFloat(btn.dataset.tod);
        this.setTimeOfDay(tod);
        c.querySelector('#slider-tod').value = tod;
        c.querySelector('#val-tod').innerText = `${tod.toFixed(1)}h`;
      });
    });

    c.querySelectorAll('.btn-weather-preset').forEach(btn => {
      btn.addEventListener('click', () => this.setWeather(btn.dataset.weather));
    });

    c.querySelector('#slider-waves')?.addEventListener('input', (e) => {
      const w = parseFloat(e.target.value);
      this.setWaveScale(w);
      c.querySelector('#val-waves').innerText = `${w.toFixed(1)}m`;
    });

    c.querySelector('#select-shader-style')?.addEventListener('change', (e) => {
      this.setPaperShaderStyle(parseInt(e.target.value, 10));
    });
  }

  // ---------------------------------------------------------------------------
  // Time & Simulation Control
  // ---------------------------------------------------------------------------

  toggleHalt() {
    this.isHalted = !this.isHalted;
    this._updateUIState();
    this._showToast(this.isHalted ? "Simulation FROZEN" : "Simulation RESUMED");
  }

  stepFrame() {
    this.isHalted = true;
    this.stepFrameRequested = true;
    this._updateUIState();
    this._showToast("Stepped 1 Frame Forward (+1/60s)");
  }

  setTimeScale(scale) {
    this.timeScale = scale;
    if (scale > 0 && this.isHalted) {
      this.isHalted = false;
    }
    this._updateUIState();
    this._showToast(`Speed: ${scale.toFixed(2)}x`);
  }

  // ---------------------------------------------------------------------------
  // UI Helpers
  // ---------------------------------------------------------------------------

  _updateUIState() {
    if (!this._dom.stateBadge) return;

    if (this.isPlayingPath) {
      this._dom.stateBadge.innerText = 'PLAYING TRACK';
      this._dom.stateBadge.className = 'director-state-tag';
      this._dom.stateBadge.style.color = '#38bdf8';
    } else if (this.isHalted) {
      this._dom.stateBadge.innerText = 'HALTED / FROZEN';
      this._dom.stateBadge.className = 'director-state-tag halted';
    } else if (this.timeScale !== 1.0) {
      this._dom.stateBadge.innerText = `SLO-MO ${this.timeScale.toFixed(2)}x`;
      this._dom.stateBadge.className = 'director-state-tag';
      this._dom.stateBadge.style.color = '#ffe082';
    } else {
      this._dom.stateBadge.innerText = 'REALTIME 1.0x';
      this._dom.stateBadge.className = 'director-state-tag';
      this._dom.stateBadge.style.color = '#86efac';
    }

    if (this._dom.haltBtn) {
      if (this.isHalted) {
        this._dom.haltBtn.classList.add('active');
        this._dom.haltBtn.innerHTML = '<span class="pixel-icon icon-play size-14"></span> Resume';
      } else {
        this._dom.haltBtn.classList.remove('active');
        this._dom.haltBtn.innerHTML = '<span class="pixel-icon icon-director-clapper size-14"></span> Freeze';
      }
    }

    if (this._dom.speedLabel) {
      this._dom.speedLabel.innerText = `${this.timeScale.toFixed(2)}x`;
    }
    if (this._dom.speedScrub) {
      this._dom.speedScrub.value = this.timeScale;
    }

    // Active speed buttons
    this._dom.container?.querySelectorAll('.btn-speed').forEach(btn => {
      const s = parseFloat(btn.dataset.speed);
      if (Math.abs(s - this.timeScale) < 0.01 && !this.isHalted) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  _renderKeyframeChips() {
    const bar = this._dom.chipsBar;
    if (!bar) return;

    if (this.keyframes.length === 0) {
      bar.innerHTML = `<span style="font-size:11px; color:#64748b; font-style:italic;">No keyframes captured. Position camera and click [+ Add Keyframe]</span>`;
      return;
    }

    bar.innerHTML = '';
    this.keyframes.forEach((kf, idx) => {
      const chip = document.createElement('div');
      chip.className = 'keyframe-chip';
      chip.innerHTML = `
        <span>#${idx + 1} (${Math.round(kf.fov)}°)</span>
        <span class="del-kf" title="Delete keyframe">×</span>
      `;

      chip.addEventListener('click', (e) => {
        if (e.target.classList.contains('del-kf')) {
          this.deleteKeyframe(idx);
        } else {
          this.jumpToKeyframe(idx);
        }
      });

      bar.appendChild(chip);
    });
  }

  _showContainer() {
    if (this._dom.container) {
      this._dom.container.style.display = 'block';
    }
    if (this._dom.launchBtn) {
      this._dom.launchBtn.style.borderColor = '#d4af37';
      this._dom.launchBtn.style.color = '#fff';
    }
  }

  _hideContainer() {
    if (this._dom.container) {
      this._dom.container.style.display = 'none';
    }
    if (this._dom.launchBtn) {
      this._dom.launchBtn.style.borderColor = 'rgba(212, 175, 55, 0.45)';
      this._dom.launchBtn.style.color = '#f3e3b4';
      this._dom.launchBtn.style.display = 'flex';
    }
    this.uiHidden = false;
    this.setAspectRatio('none');
    this.setGridOverlay('none');
  }

  _showToast(msg, duration = 2200) {
    const toast = this._dom.toast;
    if (!toast) return;
    toast.innerText = msg;
    toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }
}

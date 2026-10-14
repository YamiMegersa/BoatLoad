import * as THREE from 'three';
import { emit, on, off } from '../core/EventBus.js';

export class DockPlayerController {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} fallbackCamera
   * @param {HTMLElement} domElement
   * @param {import('./DockStall.js').DockStall} dockStall
   */
  constructor(scene, fallbackCamera, domElement, dockStall) {
    this.scene = scene;
    this.fallbackCamera = fallbackCamera;
    this.domElement = domElement;
    this.dockStall = dockStall;

    // Modes: 'player' (FPS moveable on dock/island), 'shop' (static shopkeeper station)
    this.mode = 'player';

    // Camera setup
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 500);
    this.eyeHeight = 2.85; // Proportional to dock and shop scale

    // Camera Rig (Yaw -> Pitch -> Camera)
    this.pitchObject = new THREE.Object3D();
    this.pitchObject.add(this.camera);

    this.yawObject = new THREE.Object3D();
    this.yawObject.position.set(-3.5, 2.15 + this.eyeHeight, 0.5); // Initial spawn on dock
    this.yawObject.rotation.y = -Math.PI / 2; // Face towards island ramp
    this.yawObject.add(this.pitchObject);
    this.scene.add(this.yawObject);

    this.playerRadius = 0.45;

    // Movement state
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false
    };
    this.walkSpeed = 6.0;
    this.sprintSpeed = 10.5;
    this.velocity = new THREE.Vector3();

    // Raycasters for terrain following & interaction
    this.downRaycaster = new THREE.Raycaster();
    this.downRaycaster.far = 10.0;
    this.interactRaycaster = new THREE.Raycaster();
    this.interactRaycaster.far = 5.2;

    // Mouse & Pointer Lock
    this.isLocked = false;
    this.mouseCoords = new THREE.Vector2(-999, -999);
    this.hoveredDoor = null;

    // UI elements
    this._createUI();

    // Event listeners
    this._bindEvents();
  }

  // ---------------------------------------------------------------------------
  // UI Overlay
  // ---------------------------------------------------------------------------

  _createUI() {
    this.uiContainer = document.createElement('div');
    this.uiContainer.id = 'dock-player-ui';
    this.uiContainer.style.cssText = 'position:absolute; inset:0; pointer-events:none; z-index:85; overflow:hidden;';

    // Crosshair dot
    this.crosshair = document.createElement('div');
    this.crosshair.id = 'dock-crosshair';
    this.crosshair.style.cssText = `
      position: absolute; top: 50%; left: 50%; width: 6px; height: 6px;
      background: rgba(255, 255, 255, 0.85); border: 1.5px solid rgba(0, 0, 0, 0.6);
      border-radius: 50%; transform: translate(-50%, -50%);
      transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;
    `;
    this.uiContainer.appendChild(this.crosshair);

    // Interaction prompt tooltip
    this.prompt = document.createElement('div');
    this.prompt.id = 'dock-interaction-prompt';
    this.prompt.style.cssText = `
      position: absolute; top: calc(50% + 24px); left: 50%; transform: translateX(-50%);
      background: rgba(18, 14, 10, 0.88); color: #fff; padding: 7px 14px;
      border: 1px solid rgba(212, 175, 55, 0.7); border-radius: 6px;
      font-family: 'Segoe UI', system-ui, sans-serif; font-size: 13px; font-weight: 500;
      letter-spacing: 0.3px; display: none; align-items: center; gap: 6px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4); text-shadow: 0 1px 2px rgba(0,0,0,0.8);
      user-select: none;
    `;
    this.uiContainer.appendChild(this.prompt);

    // Controls instruction banner (bottom center)
    this.instructions = document.createElement('div');
    this.instructions.id = 'dock-controls-hint';
    this.instructions.style.cssText = `
      position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
      background: rgba(15, 20, 25, 0.75); color: #e2e8f0; padding: 8px 18px;
      border-radius: 20px; font-family: monospace; font-size: 12px;
      display: flex; align-items: center; gap: 12px; border: 1px solid rgba(255,255,255,0.15);
      backdrop-filter: blur(4px); transition: opacity 0.4s ease;
    `;
    this.instructions.innerHTML = `
      <span>🖱️ <b>Click Canvas</b> to look</span>
      <span>|</span>
      <span><b>WASD</b> Walk</span>
      <span>|</span>
      <span><b>Shift</b> Sprint</span>
      <span>|</span>
      <span><b>Esc</b> Unlock Mouse</span>
    `;
    this.uiContainer.appendChild(this.instructions);

    const uiRoot = document.getElementById('ui-root') || document.body;
    uiRoot.appendChild(this.uiContainer);
  }

  // ---------------------------------------------------------------------------
  // Event Bindings
  // ---------------------------------------------------------------------------

  _bindEvents() {
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);
    this._onWindowResize = this._onWindowResize.bind(this);

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('resize', this._onWindowResize);

    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    this.domElement.addEventListener('pointerdown', this._onPointerDown);
  }

  _unbindEvents() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('resize', this._onWindowResize);

    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
  }

  _onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  _onPointerLockChange() {
    this.isLocked = document.pointerLockElement === this.domElement;
    if (this.isLocked) {
      if (this.instructions) this.instructions.style.opacity = '0.35';
    } else {
      if (this.instructions) this.instructions.style.opacity = '1.0';
    }
  }

  _onKeyDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.backward = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = true;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.sprint = true;
        break;
      case 'KeyE':
        // Interaction key
        if (this.hoveredDoor) {
          this.toggleShop();
        }
        break;
    }
  }

  _onKeyUp(e) {
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.backward = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.sprint = false;
        break;
    }
  }

  _onMouseMove(e) {
    if (this.isLocked) {
      const movementX = e.movementX || 0;
      const movementY = e.movementY || 0;

      const sensitivity = 0.0022;

      // Allow full 360-degree rotation both outside and inside the shop!
      this.yawObject.rotation.y -= movementX * sensitivity;
      this.pitchObject.rotation.x -= movementY * sensitivity;
      this.pitchObject.rotation.x = Math.max(-1.45, Math.min(1.45, this.pitchObject.rotation.x));
    } else {
      // Track mouse NDC coordinates for unlocked clicking
      const rect = this.domElement.getBoundingClientRect();
      this.mouseCoords.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouseCoords.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }
  }

  _onPointerDown(e) {
    // Left click
    if (e.button !== 0) return;

    if (this.hoveredDoor) {
      this.toggleShop();
      return;
    }

    // Otherwise lock pointer for smooth navigation
    if (!this.isLocked) {
      this.domElement.requestPointerLock();
    }
  }

  // ---------------------------------------------------------------------------
  // Shop Transition (Enter / Exit)
  // ---------------------------------------------------------------------------

  toggleShop() {
    if (this.mode === 'player') {
      this.enterShop();
    } else {
      this.exitShop();
    }
  }

  enterShop() {
    this.mode = 'shop';

    // Store outside exit position just outside the enlarged door on the dock
    // Shop local (x = 3.0 + 1.2, y = 0, z = -0.35)
    const exitPos = new THREE.Vector3(4.2, 0, -0.35);
    if (this.dockStall && this.dockStall.shopGroup) {
      this.dockStall.shopGroup.localToWorld(exitPos);
    } else {
      exitPos.set(-2.1, 2.15, 4.35);
    }
    this.savedExitPosition = exitPos;

    // Position player camera at the shopkeeper station inside the stall
    const shopCamWorldPos = new THREE.Vector3();
    if (this.dockStall && this.dockStall.shopCam) {
      this.dockStall.shopCam.getWorldPosition(shopCamWorldPos);
    } else {
      shopCamWorldPos.set(2.1, 2.15 + this.eyeHeight, 4.6);
    }

    this.yawObject.position.copy(shopCamWorldPos);
    // Face forward through the counter out toward the dock (world -Z)
    this.yawObject.rotation.y = 0;
    this.pitchObject.rotation.x = -0.05;

    this.velocity.set(0, 0, 0);

    emit('playSound', { sound: 'qte_success' });
    emit('dockPlayerModeChanged', { mode: 'shop' });
  }

  exitShop() {
    this.mode = 'player';

    // Place player just outside the door facing outward onto the dock / island ramp
    if (this.savedExitPosition) {
      this.yawObject.position.set(this.savedExitPosition.x, this.savedExitPosition.y + this.eyeHeight, this.savedExitPosition.z);
    } else {
      this.yawObject.position.set(-2.1, 2.15 + this.eyeHeight, 4.35);
    }

    // Face towards the island ramp (world -X)
    this.yawObject.rotation.y = -Math.PI / 2;
    this.pitchObject.rotation.x = 0;
    this.velocity.set(0, 0, 0);

    emit('playSound', { sound: 'qte_success' });
    emit('dockPlayerModeChanged', { mode: 'player' });
  }

  // ---------------------------------------------------------------------------
  // Frame Update
  // ---------------------------------------------------------------------------

  update(delta) {
    if (this.mode === 'player') {
      this._updatePlayerMovement(delta);
    }

    this._updateInteractionRaycast();
  }

  _resolveObstacleCollisions(pos) {
    const r = this.playerRadius;
    const obstacles = [
      // Main shop building and front counter
      { minX: -1.05, maxX: 5.25, minZ: 1.10, maxZ: 6.65 },
      // Crates stacked beside shop on the dock
      { minX: -2.1, maxX: -1.2, minZ: 2.1, maxZ: 3.1 }
    ];

    for (let i = 0; i < obstacles.length; i++) {
      const box = obstacles[i];
      if (
        pos.x > box.minX - r &&
        pos.x < box.maxX + r &&
        pos.z > box.minZ - r &&
        pos.z < box.maxZ + r
      ) {
        const dLeft   = pos.x - (box.minX - r);
        const dRight  = (box.maxX + r) - pos.x;
        const dFront  = pos.z - (box.minZ - r);
        const dBack   = (box.maxZ + r) - pos.z;

        const minD = Math.min(dLeft, dRight, dFront, dBack);

        if (minD === dLeft) {
          pos.x = box.minX - r;
        } else if (minD === dRight) {
          pos.x = box.maxX + r;
        } else if (minD === dFront) {
          pos.z = box.minZ - r;
        } else {
          pos.z = box.maxZ + r;
        }
      }
    }
  }

  _updatePlayerMovement(delta) {
    const moveDir = new THREE.Vector3();

    if (this.keys.forward)  moveDir.z -= 1;
    if (this.keys.backward) moveDir.z += 1;
    if (this.keys.left)     moveDir.x -= 1;
    if (this.keys.right)    moveDir.x += 1;

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
      const currentSpeed = this.keys.sprint ? this.sprintSpeed : this.walkSpeed;
      moveDir.multiplyScalar(currentSpeed * delta);

      // Rotate move vector by player yaw
      moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yawObject.rotation.y);

      // Candidate position
      const candidate = new THREE.Vector3(
        this.yawObject.position.x + moveDir.x,
        this.yawObject.position.y,
        this.yawObject.position.z + moveDir.z
      );

      // Resolve obstacle collisions against shop walls, door, and counter
      this._resolveObstacleCollisions(candidate);

      // Ground raycast check to ensure player stays on solid land / dock
      const groundHit = this._getGroundHeightAt(candidate.x, candidate.z);
      if (groundHit !== null) {
        this.yawObject.position.x = candidate.x;
        this.yawObject.position.z = candidate.z;
        // Smooth vertical ground alignment
        const targetY = groundHit + this.eyeHeight;
        this.yawObject.position.y += (targetY - this.yawObject.position.y) * Math.min(1.0, delta * 14.0);
      } else {
        // Fallback: test sliding along X
        const candX = new THREE.Vector3(candidate.x, this.yawObject.position.y, this.yawObject.position.z);
        this._resolveObstacleCollisions(candX);
        const slideXHit = this._getGroundHeightAt(candX.x, this.yawObject.position.z);
        if (slideXHit !== null) {
          this.yawObject.position.x = candX.x;
          this.yawObject.position.y += (slideXHit + this.eyeHeight - this.yawObject.position.y) * Math.min(1.0, delta * 14.0);
        } else {
          // Slide along Z
          const candZ = new THREE.Vector3(this.yawObject.position.x, this.yawObject.position.y, candidate.z);
          this._resolveObstacleCollisions(candZ);
          const slideZHit = this._getGroundHeightAt(this.yawObject.position.x, candZ.z);
          if (slideZHit !== null) {
            this.yawObject.position.z = candZ.z;
            this.yawObject.position.y += (slideZHit + this.eyeHeight - this.yawObject.position.y) * Math.min(1.0, delta * 14.0);
          }
        }
      }
    } else {
      // Idle terrain height tracking
      const groundHit = this._getGroundHeightAt(this.yawObject.position.x, this.yawObject.position.z);
      if (groundHit !== null) {
        const targetY = groundHit + this.eyeHeight;
        this.yawObject.position.y += (targetY - this.yawObject.position.y) * Math.min(1.0, delta * 14.0);
      }
    }
  }

  _getGroundHeightAt(x, z) {
    if (!this.dockStall || !this.dockStall.group) {
      return 2.15; // default dock level
    }

    const rayOrigin = new THREE.Vector3(x, 10.0, z);
    this.downRaycaster.set(rayOrigin, new THREE.Vector3(0, -1, 0));

    // Intersect terrain and dock objects
    const hits = this.downRaycaster.intersectObject(this.dockStall.group, true);
    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i];
      // Exclude roofs, sign, gulls, or high props
      if (hit.point.y > 4.5) continue;
      // Exclude water/below water level
      if (hit.point.y < 0.2) continue;

      // Make sure the hit object isn't the door or ceiling
      if (hit.object && hit.object.userData && hit.object.userData.isShopDoor) continue;

      // Exclude any part of the shop stall (counter, floor, desk, apron, roof)
      let parent = hit.object;
      let isShopPart = false;
      while (parent) {
        if (parent === this.dockStall.shopGroup) {
          isShopPart = true;
          break;
        }
        parent = parent.parent;
      }
      if (isShopPart) continue;

      return hit.point.y;
    }

    return null; // Off edge / into water
  }

  _updateInteractionRaycast() {
    if (!this.dockStall || !this.dockStall.doorInteractables || this.dockStall.doorInteractables.length === 0) {
      this._setHoverState(null);
      return;
    }

    if (this.isLocked) {
      // Raycast from camera center (crosshair)
      this.interactRaycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
    } else {
      // Raycast from cursor NDC
      if (this.mouseCoords.x < -1 || this.mouseCoords.x > 1) {
        this._setHoverState(null);
        return;
      }
      this.interactRaycaster.setFromCamera(this.mouseCoords, this.camera);
    }

    const hits = this.interactRaycaster.intersectObjects(this.dockStall.doorInteractables, true);
    if (hits.length > 0) {
      const hit = hits[0];
      // In shop mode, distance can be slightly further (looking from behind counter)
      const maxDist = this.mode === 'shop' ? 5.5 : 4.0;
      if (hit.distance <= maxDist) {
        this._setHoverState(hit.object);
        return;
      }
    }

    this._setHoverState(null);
  }

  _setHoverState(obj) {
    this.hoveredDoor = obj;

    if (obj) {
      this.domElement.style.cursor = 'pointer';
      this.crosshair.style.transform = 'translate(-50%, -50%) scale(1.6)';
      this.crosshair.style.background = '#ffd700';
      this.crosshair.style.borderColor = '#ffffff';

      this.prompt.style.display = 'flex';
      if (this.mode === 'player') {
        this.prompt.innerHTML = `🚪 <span style="background:#4a3520; padding:2px 6px; border-radius:3px; border:1px solid #c89d55; font-size:11px; margin-right:4px;">E</span> or Click to Enter Shop`;
      } else {
        this.prompt.innerHTML = `🚪 <span style="background:#4a3520; padding:2px 6px; border-radius:3px; border:1px solid #c89d55; font-size:11px; margin-right:4px;">E</span> or Click to Exit Shop`;
      }
    } else {
      this.domElement.style.cursor = 'default';
      this.crosshair.style.transform = 'translate(-50%, -50%) scale(1.0)';
      this.crosshair.style.background = 'rgba(255, 255, 255, 0.85)';
      this.crosshair.style.borderColor = 'rgba(0, 0, 0, 0.6)';
      this.prompt.style.display = 'none';
    }
  }

  // ---------------------------------------------------------------------------
  // Disposal & Teardown
  // ---------------------------------------------------------------------------

  dispose() {
    this._unbindEvents();

    if (document.pointerLockElement === this.domElement) {
      document.exitPointerLock();
    }

    if (this.yawObject && this.yawObject.parent) {
      this.yawObject.parent.remove(this.yawObject);
    }

    if (this.uiContainer && this.uiContainer.parentNode) {
      this.uiContainer.parentNode.removeChild(this.uiContainer);
    }
  }
}

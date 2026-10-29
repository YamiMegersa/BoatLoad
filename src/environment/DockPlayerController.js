import * as THREE from 'three';
import { emit, on, off } from '../core/EventBus.js';
import { VoxelArms } from './VoxelArms.js';
import { EmoteWheelUI } from '../ui/EmoteWheelUI.js';
import { DOCK_SCALE } from './DockStall.js';

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
    this.scale = DOCK_SCALE;

    // Camera setup
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 500);
    this.eyeHeight = 2.85 * this.scale; // Proportional to scaled dock and shop

    // Camera Rig (Yaw -> Pitch -> Camera)
    this.pitchObject = new THREE.Object3D();
    this.pitchObject.add(this.camera);

    this.yawObject = new THREE.Object3D();
    this.yawObject.position.set(-3.5 * this.scale, 2.15 * this.scale + this.eyeHeight, 0.5 * this.scale); // Initial spawn on dock
    this.yawObject.rotation.y = Math.PI / 2; // Face towards island ramp (world -X)
    this.yawObject.add(this.pitchObject);
    this.scene.add(this.yawObject);

    this.playerRadius = 0.45 * this.scale;

    // Movement state
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false,
      jump: false
    };
    this.walkSpeed = 6.0 * this.scale;
    this.sprintSpeed = 10.5 * this.scale;
    this.velocity = new THREE.Vector3();
    this.verticalVelocity = 0;
    this.isGrounded = true;
    this.gravity = 22.0 * this.scale;
    this.jumpSpeed = 8.2 * this.scale;

    // Raycasters for terrain following & interaction
    this.downRaycaster = new THREE.Raycaster();
    this.downRaycaster.far = 10.0;
    this.interactRaycaster = new THREE.Raycaster();
    this.interactRaycaster.far = 6.5;

    // Mouse & Pointer Lock
    this.isLocked = false;
    this.mouseCoords = new THREE.Vector2(-999, -999);
    this.hoveredDoor = null;
    this.hoveredBunny = null;
    this.hoveredCrab = null;
    this.hoveredDivorcePost = null;
    this.hoveredShip = null;
    this.hoveredLedger = null;
    this.hoveredShipyard = null;
    this.hoveredGhost = null;

    // Cutscene state
    this._cutsceneActive = false;
    this._cutsceneTimer = 0;
    this._cutsceneKeyframes = null;
    this._cutsceneOnComplete = null;
    this._cutsceneOverlay = null;
    this._cutsceneTimeouts = [];

    // Day 0 Tutorial state
    this.tutorialActive = false;
    this.tutorialStep = null; // 'TALK_CRAB' | 'READ_NOTICE' | 'VISIT_SHIPYARD' | 'ENTER_SHOP' | 'OPEN_LOGBOOK'
    this._tutorialPopupEl = null;
    this._cleanupTutorialPopupInput = null;
    this._lockedToastTimer = null;

    // UI elements
    this._createUI();

    // Voxel first-person arms & props
    this.voxelArms = new VoxelArms(this.camera);

    // Emote Wheel UI
    this.emoteWheel = new EmoteWheelUI({
      onSelect: (emoteId) => this.playEmote(emoteId)
    });

    // Event listeners
    this._bindEvents();
  }

  // ---------------------------------------------------------------------------
  // UI Overlay
  // ---------------------------------------------------------------------------

  _createUI() {
    this.uiContainer = document.createElement('div');
    this.uiContainer.id = 'dock-player-ui';
    this.uiContainer.style.cssText = 'position:absolute; inset:0; pointer-events:none !important; z-index:85; overflow:hidden;';

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
      <span><span class="pixel-icon icon-hand-select size-14"></span> <b>Click Canvas</b> to look</span>
      <span>|</span>
      <span><b>WASD</b> Walk</span>
      <span>|</span>
      <span><b>Space</b> Jump</span>
      <span>|</span>
      <span><b>Shift</b> Sprint</span>
      <span>|</span>
      <span><b>Q</b> Emotes</span>
      <span>|</span>
      <span><b>Esc</b> Unlock Mouse</span>
    `;
    this.uiContainer.appendChild(this.instructions);

    // Day 0 / Quest Objective Banner (top center)
    this.objectiveBanner = document.createElement('div');
    this.objectiveBanner.id = 'dock-objective-banner';
    this.objectiveBanner.style.cssText = `
      position: absolute; top: 22px; left: 50%; transform: translateX(-50%);
      background: linear-gradient(180deg, rgba(32, 22, 14, 0.94) 0%, rgba(18, 12, 8, 0.94) 100%);
      color: #f8ecd1; padding: 10px 22px;
      border: 2px solid #d4af37; border-radius: 8px;
      font-family: Georgia, 'Times New Roman', serif; font-size: 15px; font-weight: bold;
      letter-spacing: 0.4px; display: none; align-items: center; gap: 10px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65); text-shadow: 0 1px 3px rgba(0,0,0,0.9);
      user-select: none; z-index: 90; max-width: 86vw; text-align: center;
    `;
    this.uiContainer.appendChild(this.objectiveBanner);

    // Soft-lock warning toast right below the objective banner
    this.lockedToast = document.createElement('div');
    this.lockedToast.id = 'dock-locked-toast';
    this.lockedToast.style.cssText = `
      position: absolute; top: 76px; left: 50%; transform: translateX(-50%);
      background: linear-gradient(180deg, rgba(110, 22, 18, 0.95) 0%, rgba(72, 12, 10, 0.95) 100%);
      color: #ffe4e1; padding: 8px 18px;
      border: 1.5px solid #ff7b72; border-radius: 6px;
      font-family: 'Segoe UI', system-ui, sans-serif; font-size: 13px; font-weight: 600;
      letter-spacing: 0.3px; display: none; align-items: center; gap: 8px;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.6); text-shadow: 0 1px 2px rgba(0,0,0,0.85);
      user-select: none; z-index: 91;
    `;
    this.uiContainer.appendChild(this.lockedToast);

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
    if (this.mode === 'cutscene') return;
    if (this._tutorialPopupEl) return;

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
      case 'Space':
        if (this.mode === 'player') {
          e.preventDefault();
          this.keys.jump = true;
        }
        break;
      case 'KeyE':
        // Interaction key
        if (this.hoveredCrab) {
          this._interactWithCrab();
        } else if (this.hoveredDivorcePost) {
          this._interactWithDivorcePost();
        } else if (this.hoveredGhost) {
          this._interactWithGhost();
        } else if (this.hoveredBunny) {
          this._interactWithBunny();
        } else if (this.hoveredDoor) {
          this.toggleShop();
        } else if (this.hoveredLedger) {
          this._interactWithLedger();
        } else if (this.hoveredShip) {
          this._interactWithShip();
        } else if (this.hoveredShipyard) {
          this._interactWithShipyard();
        }
        break;
      case 'KeyQ':
        this.toggleEmoteWheel();
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
      case 'Space':
        this.keys.jump = false;
        break;
    }
  }

  _onMouseMove(e) {
    if (this.mode === 'cutscene') return;
    if (this._tutorialPopupEl) return;
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
    if (this.mode === 'cutscene') return;
    if (this._tutorialPopupEl) return;
    if (this.emoteWheel && this.emoteWheel.isOpen) return;

    if (this.hoveredCrab) {
      this._interactWithCrab();
      return;
    }

    if (this.hoveredDivorcePost) {
      this._interactWithDivorcePost();
      return;
    }

    if (this.hoveredGhost) {
      this._interactWithGhost();
      return;
    }

    if (this.hoveredBunny) {
      this._interactWithBunny();
      return;
    }

    if (this.hoveredDoor) {
      this.toggleShop();
      return;
    }

    if (this.hoveredLedger) {
      this._interactWithLedger();
      return;
    }

    if (this.hoveredShip) {
      this._interactWithShip();
      return;
    }

    if (this.hoveredShipyard) {
      this._interactWithShipyard();
      return;
    }

    // Otherwise lock pointer for smooth navigation
    if (!this.isLocked) {
      this.domElement.requestPointerLock();
    }
  }

  // ---------------------------------------------------------------------------
  // Emotes & Wheel
  // ---------------------------------------------------------------------------

  toggleEmoteWheel() {
    if (!this.emoteWheel) return;
    if (!this.emoteWheel.isOpen && this.isLocked) {
      document.exitPointerLock();
    }
    this.emoteWheel.toggle();
  }

  playEmote(emoteId) {
    if (this.voxelArms) {
      this.voxelArms.playEmote(emoteId);
    }
  }

  // ---------------------------------------------------------------------------
  // Shop Transition (Enter / Exit)
  // ---------------------------------------------------------------------------

  toggleShop() {
    if (this.mode === 'player') {
      // Enforce Day 0 tutorial soft-lock before entering the shop
      if (this.tutorialActive) {
        if (this.tutorialStep === 'TALK_CRAB') {
          emit('playSound', { sound: 'qte_fail' });
          this.showLockedHint('🔒 <b>Shop Locked:</b> Speak with <b>Clawdius Pinch, Esq.</b> on the beach first!');
          return;
        }
        if (this.tutorialStep === 'READ_NOTICE') {
          emit('playSound', { sound: 'qte_fail' });
          this.showLockedHint('🔒 <b>Shop Locked:</b> Read the <b>Divorce Notice</b> nailed to the post where the dock meets land first!');
          return;
        }
      }
      this.enterShop();
    } else {
      this.exitShop();
    }
  }

  _interactWithBunny() {
    if (this.dockStall && this.dockStall.bunny) {
      const playerPos = new THREE.Vector3();
      this.camera.getWorldPosition(playerPos);
      this.dockStall.bunny.interact(playerPos);
    }
  }

  _interactWithCrab() {
    emit('playSound', { sound: 'crab_snap' });
    if (this.isLocked && document.exitPointerLock) {
      document.exitPointerLock();
    }
    if (this.dockStall && this.dockStall.crab) {
      const playerPos = new THREE.Vector3();
      this.camera.getWorldPosition(playerPos);
      this.dockStall.crab.interact(playerPos);
    }
    emit('interactWithCrab');
  }

  _interactWithDivorcePost() {
    if (this.tutorialActive && this.tutorialStep === 'TALK_CRAB') {
      emit('playSound', { sound: 'qte_fail' });
      this.showLockedHint('🔒 <b>Notice Locked:</b> Speak with <b>Clawdius Pinch, Esq.</b> on the beach first!');
      return;
    }
    if (this.isLocked && document.exitPointerLock) {
      document.exitPointerLock();
    }
    emit('openDivorcePapers');
  }

  showLockedHint(html, ms = 3800) {
    if (!this.lockedToast) return;
    this.lockedToast.innerHTML = html;
    this.lockedToast.style.display = 'flex';
    if (this._lockedToastTimer) clearTimeout(this._lockedToastTimer);
    this._lockedToastTimer = setTimeout(() => {
      if (this.lockedToast) this.lockedToast.style.display = 'none';
    }, ms);
  }

  showAreaPopup({ icon = '🧭', title, areaName, purposeText, actionText, buttonText = 'Got It — Continue [Space / Click]', onClose = null }) {
    this.closeAreaPopup();

    // Reset held movement keys and exit pointer lock so cursor can click button
    this.keys.forward = false;
    this.keys.backward = false;
    this.keys.left = false;
    this.keys.right = false;
    this.keys.sprint = false;
    this.keys.jump = false;
    if (this.isLocked && document.exitPointerLock) {
      document.exitPointerLock();
    }

    const popup = document.createElement('div');
    popup.id = 'day0-tutorial-area-popup';
    popup.style.cssText = `
      position: fixed; inset: 0; z-index: 260;
      background: rgba(6, 8, 12, 0.72); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      padding: 20px; pointer-events: auto; user-select: none;
    `;
    popup.innerHTML = `
      <div style="
        max-width: 540px; width: 100%;
        background: linear-gradient(180deg, #241911 0%, #160f0a 100%);
        border: 2.5px solid #d4af37; border-radius: 10px;
        box-shadow: 0 20px 50px rgba(0,0,0,0.85), inset 0 0 24px rgba(212,175,55,0.12);
        padding: 26px 30px; color: #f5ebd6;
        font-family: Georgia, 'Times New Roman', serif;
      ">
        <div style="display:flex; align-items:center; gap:14px; margin-bottom:14px; border-bottom:1px solid rgba(212,175,55,0.35); padding-bottom:12px;">
          <div style="
            width: 48px; height: 48px; border-radius: 8px;
            background: rgba(212, 175, 55, 0.16); border: 1.5px solid #d4af37;
            display: flex; align-items: center; justify-content: center; font-size: 26px; flex-shrink: 0;
          ">${icon}</div>
          <div>
            <div style="font-family: monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #d4af37; margin-bottom: 3px;">
              ${areaName || 'Harbor Guide'}
            </div>
            <div style="font-size: 22px; font-weight: bold; color: #fff8e7; line-height: 1.2;">
              ${title}
            </div>
          </div>
        </div>

        <div style="margin-bottom: 14px;">
          <div style="font-family: monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #eab308; margin-bottom: 5px;">
            ⚓ Purpose of This Area
          </div>
          <div style="font-size: 15px; line-height: 1.55; color: #e8dcc4;">
            ${purposeText}
          </div>
        </div>

        <div style="
          background: rgba(212, 175, 55, 0.10); border-left: 3px solid #ffd700;
          padding: 11px 14px; border-radius: 0 6px 6px 0; margin-bottom: 20px;
        ">
          <div style="font-family: monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #ffd700; margin-bottom: 4px;">
            🧭 What To Do Next
          </div>
          <div style="font-size: 14.5px; line-height: 1.5; color: #fffdf7;">
            ${actionText}
          </div>
        </div>

        <button id="day0-area-popup-btn" style="
          width: 100%; padding: 11px 18px; cursor: pointer;
          background: linear-gradient(180deg, #d4af37 0%, #9a7418 100%);
          color: #1a1108; font-family: Georgia, serif; font-size: 15px; font-weight: bold;
          border: 1px solid #ffe57f; border-radius: 6px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5); letter-spacing: 0.4px;
        ">${buttonText}</button>
      </div>
    `;

    const uiRoot = document.getElementById('ui-root') || document.body;
    uiRoot.appendChild(popup);
    this._tutorialPopupEl = popup;

    const dismiss = (e) => {
      if (e) {
        if (e.type === 'keydown' && e.code !== 'Space' && e.code !== 'Enter') return;
        e.preventDefault();
        e.stopPropagation();
      }
      emit('playSound', { sound: 'qte_success' });
      this.closeAreaPopup();
      if (onClose) onClose();
    };

    const btn = popup.querySelector('#day0-area-popup-btn');
    if (btn) btn.addEventListener('click', dismiss);
    popup.addEventListener('pointerdown', (e) => {
      if (e.target === popup) dismiss(e);
    });
    window.addEventListener('keydown', dismiss);
    this._cleanupTutorialPopupInput = () => {
      window.removeEventListener('keydown', dismiss);
    };
  }

  closeAreaPopup() {
    if (this._cleanupTutorialPopupInput) {
      this._cleanupTutorialPopupInput();
      this._cleanupTutorialPopupInput = null;
    }
    if (this._tutorialPopupEl && this._tutorialPopupEl.parentNode) {
      this._tutorialPopupEl.parentNode.removeChild(this._tutorialPopupEl);
    }
    this._tutorialPopupEl = null;
  }

  advanceTutorialStep(step) {
    this.tutorialActive = true;
    this.tutorialStep = step;

    if (step === 'TALK_CRAB') {
      if (this.dockStall) {
        this.dockStall.setDivorcePostRingVisible(false);
        this.dockStall.setShipyardTutorialCircleVisible(false);
        this.dockStall.setShopDoorGlowVisible(false);
      }
      this.setObjective(
        `🦀 <span style="color:#ffd700;">Step 1/4:</span> Approach and speak with <strong>Clawdius Pinch, Esq.</strong> on the beach <span style="color:#ffd700;">[E or Click]</span>`
      );
    } else if (step === 'READ_NOTICE') {
      if (this.dockStall) {
        this.dockStall.setDivorcePostRingVisible(true);
        this.dockStall.setShipyardTutorialCircleVisible(false);
        this.dockStall.setShopDoorGlowVisible(false);
      }
      this.setObjective(
        `📜 <span style="color:#ffd700;">Step 2/4:</span> Walk up the beach trail to where the dock meets land and read the <strong>Divorce Notice</strong> on the post <span style="color:#ffd700;">[E or Click]</span>`
      );
    } else if (step === 'ENTER_SHOP') {
      if (this.dockStall) {
        this.dockStall.setDivorcePostRingVisible(false);
        this.dockStall.setShipyardTutorialCircleVisible(false);
        this.dockStall.setShopDoorGlowVisible(true);
      }
      this.setObjective(
        `🏠 <span style="color:#ffd700;">Step 3/4:</span> Walk <strong>East</strong> onto the harbor pier and enter your glowing <strong>Shipwright Shop</strong> <span style="color:#ffd700;">[E or Click Door]</span>`
      );
      this.showAreaPopup({
        icon: '📜',
        areaName: 'Area 2 of 4 • Harbor Crossroads',
        title: 'Notice Post & East Harbor Pier',
        purposeText: 'The Notice Post sits at the crossroads where the East Harbor Pier meets Dock Island. Straight ahead along the timber pier stands your <b>Shipwright Shop</b>, while the stone lantern trail winds West across the ridge to your <b>Drydock Shipyard</b>.',
        actionText: 'Walk <b>East</b> onto the harbor pier and enter your glowing <b>Shipwright Shop Door</b> (<b>[E]</b> or <b>Click</b>) to see how your business works.'
      });
    } else if (step === 'VISIT_SHIPYARD') {
      if (this.dockStall) {
        this.dockStall.setDivorcePostRingVisible(false);
        this.dockStall.setShipyardTutorialCircleVisible(true);
        this.dockStall.setShopDoorGlowVisible(false);
      }
      this.setObjective(
        `⚓ <span style="color:#ffd700;">Step 4/4:</span> Exit the shop, follow the stone trail <strong>West</strong> to the <strong>Shipyard</strong>, and step into the glowing circle`
      );
      this.showAreaPopup({
        icon: '🏠',
        areaName: 'Area 3 of 4 • Shipwright Stall',
        title: 'The Shipwright Shop & Daily Game Loop',
        purposeText: 'Here is how you\'ll earn the <b>7,000 doubloons</b> for Marguerite\'s divorce settlement by Sunday:<br/>• <b>1. Morning Contract (Shop):</b> Each morning, a captain arrives at your counter to explain how they wrecked their ship and haggle over a repair budget.<br/>• <b>2. Hull Repair (Shipyard):</b> Their vessel is moored at the West Shipyard, where you patch broken timbers within budget.<br/>• <b>3. Sea Trial (Ocean):</b> You sail the repaired ship through Port Rotgut\'s hazards to earn your daily payout and keep any unspent budget!',
        actionText: 'Before taking on paying captains, <b>an old customer left a battered ship at the West Shipyard for scrap</b> — and you can practice on it! Exit the shop door (<b>[E]</b> or <b>Click</b>), follow the stone trail <b>West</b> across the island to the <b>Shipyard</b>, and step into the glowing <b>Location Circle</b>.'
      });
    } else if (step === 'PRACTICE_SHIP') {
      if (this.dockStall) {
        this.dockStall.setDivorcePostRingVisible(false);
        this.dockStall.setShipyardTutorialCircleVisible(false);
        this.dockStall.setShopDoorGlowVisible(false);
      }
      this.setObjective(
        `🛠️ <span style="color:#00ffaa;">Harbor Tour Complete!</span> Interact with the glowing <strong>Shipyard Workbench</strong> or the <strong>Abandoned Scrap Sloop</strong> to practice <span style="color:#ffd700;">[E or Click]</span>`
      );
      this.showAreaPopup({
        icon: '⚓',
        areaName: 'Area 4 of 4 • West Drydock',
        title: 'The Shipyard & Abandoned Scrap Ship',
        purposeText: 'Welcome to your <b>West Drydock & Shipyard</b>! That battered vessel moored at the pier is the ship <b>an old customer abandoned here for scrap</b>. Since nobody is coming back for it, you can use it to practice your hull repairs and sea trials risk-free.',
        actionText: 'Approach the glowing <b>Shipyard Workbench</b> or the moored <b>Abandoned Scrap Sloop</b> and press <b>[E]</b> or <b>Click</b> to practice on it (or return to the Shop <b>Logbook</b> whenever you\'re ready).'
      });
    }
  }

  _completeShipyardTutorialStep() {
    if (!this.tutorialActive || this.tutorialStep !== 'VISIT_SHIPYARD') return;
    emit('playSound', { sound: 'qte_success' });
    this.advanceTutorialStep('PRACTICE_SHIP');
  }

  setObjective(html) {
    if (!this.objectiveBanner) return;
    if (!html) {
      this.objectiveBanner.style.display = 'none';
      return;
    }
    this.objectiveBanner.innerHTML = html;
    this.objectiveBanner.style.display = 'flex';
  }

  hideObjective() {
    if (this.objectiveBanner) {
      this.objectiveBanner.style.display = 'none';
    }
  }

  // ---------------------------------------------------------------------------
  // Day 0 Opening Cutscene (Premise Cards -> Eyelid Blink -> Beach Wakeup -> Crab)
  // ---------------------------------------------------------------------------

  startDay0OpeningCutscene(onComplete) {
    this._clearCutsceneTimers();
    if (this.isLocked && document.exitPointerLock) {
      document.exitPointerLock();
    }

    this.mode = 'cutscene';
    this._cutsceneActive = false;
    this._cutsceneOnComplete = onComplete || null;
    this._setHoverState(null);
    if (this.crosshair) this.crosshair.style.display = 'none';
    if (this.instructions) this.instructions.style.display = 'none';
    this.hideObjective();

    // Ensure calm harbor background music is playing during the premise fade-in
    emit('setMusicState', { state: 'calm', fade: 1.2 });

    // Place player on the northeast sandy beach surrounded by empty bottles
    // islandGroup is at (-22, 0, 0) inside dockStall.group (scaled by DOCK_SCALE)
    const s = this.scale;
    const beachX = (-22 + 7.8) * s;
    const beachGroundY = 1.15 * s;
    const beachZ = -15.2 * s;

    // Initial lying-down pose on the sand
    const lowEyeY = beachGroundY + 0.48 * s;
    const standEyeY = beachGroundY + this.eyeHeight;
    this.yawObject.position.set(beachX, lowEyeY, beachZ);
    this.yawObject.rotation.y = 0.55; // Facing left bottles
    this.pitchObject.rotation.x = -0.32;
    this.camera.rotation.z = 0.36; // Head tilted on sand

    // Create full-screen black premise & eyelid blink overlay
    if (this._cutsceneOverlay && this._cutsceneOverlay.parentNode) {
      this._cutsceneOverlay.parentNode.removeChild(this._cutsceneOverlay);
    }
    const overlay = document.createElement('div');
    overlay.id = 'day0-cutscene-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 250;
      pointer-events: auto; user-select: none; overflow: hidden;
      display: flex; align-items: center; justify-content: center;
    `;
    overlay.innerHTML = `
      <div id="cutscene-black-bg" style="
        position: absolute; inset: 0; background: #050507;
        opacity: 1; transition: opacity 1.4s ease;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        padding: 36px;
      ">
        <div id="cutscene-premise-text" style="
          max-width: 720px; text-align: center;
          color: #f3e5c8; font-family: Georgia, 'Times New Roman', serif;
          font-size: 26px; line-height: 1.55; letter-spacing: 0.4px;
          text-shadow: 0 2px 16px rgba(0, 0, 0, 0.95);
          opacity: 0; transition: opacity 1.05s ease;
        "></div>
        <div id="cutscene-skip-hint" style="
          position: absolute; bottom: 28px; right: 36px;
          color: rgba(243, 229, 200, 0.45); font-family: monospace; font-size: 12px;
          letter-spacing: 0.5px;
        ">Click or Press Space to Continue</div>
      </div>
      <div id="cutscene-eyelid-top" style="
        position: absolute; top: 0; left: 0; right: 0; height: 55%;
        background: linear-gradient(180deg, #040406 80%, rgba(4,4,6,0.0) 100%);
        transform: translateY(-100%); transition: transform 0.65s cubic-bezier(0.4, 0, 0.2, 1);
        pointer-events: none;
      "></div>
      <div id="cutscene-eyelid-bot" style="
        position: absolute; bottom: 0; left: 0; right: 0; height: 55%;
        background: linear-gradient(0deg, #040406 80%, rgba(4,4,6,0.0) 100%);
        transform: translateY(100%); transition: transform 0.65s cubic-bezier(0.4, 0, 0.2, 1);
        pointer-events: none;
      "></div>
    `;
    const uiRoot = document.getElementById('ui-root') || document.body;
    uiRoot.appendChild(overlay);
    this._cutsceneOverlay = overlay;

    const premiseCards = [
      `Port Rotgut is a shithole of a harbour, and you're the only shipwright in it who isn't a thief.`,
      `Last Friday you got blackout drunk and woke up married to Marguerite, a siren, with a ring on your finger and no memory of the vows.`,
      `Her lawyer (a crab) wants <span style="color:#ffd700; font-weight:bold;">7,000 doubloons</span> by Sunday for the divorce.<br/><span style="font-size:22px; opacity:0.9;">If you can't pay, she takes your shop, your bunny and the better half of your liver.</span>`,
      `<span style="color:#ffd700; font-size:30px; letter-spacing:1px;">One customer a day. One ship a day.<br/>One repair per level.</span>`
    ];

    const textEl = overlay.querySelector('#cutscene-premise-text');
    const blackBg = overlay.querySelector('#cutscene-black-bg');
    const eyelidTop = overlay.querySelector('#cutscene-eyelid-top');
    const eyelidBot = overlay.querySelector('#cutscene-eyelid-bot');

    let cardIndex = 0;
    let inWakeupPhase = false;
    let isFadingOut = false;

    const clearCardTimers = () => {
      if (this._cutsceneTimeouts) {
        this._cutsceneTimeouts.forEach(t => clearTimeout(t));
        this._cutsceneTimeouts = [];
      }
    };

    const showCurrentCard = (initialDelayMs = 200) => {
      if (inWakeupPhase) return;
      clearCardTimers();

      if (cardIndex >= premiseCards.length) {
        beginWakeupBlink();
        return;
      }

      isFadingOut = false;
      const html = premiseCards[cardIndex];
      cardIndex++;

      textEl.style.transition = 'opacity 0.65s ease';
      textEl.style.opacity = '0';
      const tIn = setTimeout(() => {
        textEl.innerHTML = html;
        textEl.style.opacity = '1';
      }, initialDelayMs);

      this._cutsceneTimeouts.push(tIn);
    };

    const advanceCard = () => {
      if (inWakeupPhase) return;
      clearCardTimers();

      // If already fading out to the next card, jump immediately to the next card
      if (isFadingOut) {
        isFadingOut = false;
        if (cardIndex >= premiseCards.length) {
          beginWakeupBlink();
        } else {
          showCurrentCard(30);
        }
        return;
      }

      isFadingOut = true;
      textEl.style.transition = 'opacity 0.35s ease';
      textEl.style.opacity = '0';

      const tNext = setTimeout(() => {
        isFadingOut = false;
        if (cardIndex >= premiseCards.length) {
          beginWakeupBlink();
        } else {
          showCurrentCard(50);
        }
      }, 360);
      this._cutsceneTimeouts.push(tNext);
    };

    const onAdvanceInput = (e) => {
      if (inWakeupPhase) return;
      if (e.type === 'keydown' && e.code !== 'Space' && e.code !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      advanceCard();
    };

    overlay.addEventListener('pointerdown', onAdvanceInput);
    window.addEventListener('keydown', onAdvanceInput);
    this._cleanupPremiseInput = () => {
      overlay.removeEventListener('pointerdown', onAdvanceInput);
      window.removeEventListener('keydown', onAdvanceInput);
    };

const beginWakeupBlink = () => {
  if (inWakeupPhase) return;
  inWakeupPhase = true;
  if (this._cleanupPremiseInput) {
    this._cleanupPremiseInput();
    this._cleanupPremiseInput = null;
  }

  textEl.style.opacity = '0';
  const skipHint = overlay.querySelector('#cutscene-skip-hint');
  if (skipHint) skipHint.style.display = 'none';
  overlay.style.pointerEvents = 'none';

  // Close eyelids fully before lifting black background
  eyelidTop.style.transition = 'none';
  eyelidBot.style.transition = 'none';
  eyelidTop.style.transform = 'translateY(0%)';
  eyelidBot.style.transform = 'translateY(0%)';

  // Crab position in world space: islandGroup (-22 + 8.5, 1.15, -19.6) * s
  const crabWorldX = (-22 + 8.5) * s;
  const crabWorldY = 1.85 * s;
  const crabWorldZ = -19.6 * s;
  const dxCrab = crabWorldX - beachX;
  const dzCrab = crabWorldZ - beachZ;
  const crabYaw = Math.atan2(-dxCrab, -dzCrab);
  const crabHorizDist = Math.hypot(dxCrab, dzCrab);
  const crabPitch = Math.atan2(crabWorldY - standEyeY, crabHorizDist);

  // Start camera keyframe animation (looking around at bottles on beach -> standing up -> focusing on Crab)
  this._cutsceneTimer = 0;
  this._cutsceneActive = true;
  this._cutsceneKeyframes = [
    // t=0.0s: Lying on sand, looking left at fallen green/amber bottles
    { t: 0.0, x: beachX, y: lowEyeY, z: beachZ, yaw: 0.62, pitch: -0.34, roll: 0.38 },
    // t=1.8s: Blink half-open, groggily looking across nearby bottles
    { t: 1.8, x: beachX, y: lowEyeY + 0.12 * s, z: beachZ, yaw: 0.45, pitch: -0.28, roll: 0.26 },
    // t=3.6s: Panning right across the wine bottles and half-buried barrel on the sand
    { t: 3.6, x: beachX, y: lowEyeY + 0.85 * s, z: beachZ, yaw: -0.68, pitch: -0.26, roll: -0.16 },
    // t=5.2s: Pushing up to standing height on the beach
    { t: 5.2, x: beachX, y: standEyeY, z: beachZ, yaw: -0.35, pitch: -0.12, roll: 0.04 },
    // t=6.8s: Turning toward the water and locking eyes on the Crab Clerk in the shallows
    { t: 6.8, x: beachX, y: standEyeY, z: beachZ, yaw: crabYaw, pitch: crabPitch, roll: 0.0 }
  ];

  // Sequence the eyelid blinks
  const t1 = setTimeout(() => {
    blackBg.style.opacity = '0';
    eyelidTop.style.transition = 'transform 0.75s cubic-bezier(0.4, 0, 0.2, 1)';
    eyelidBot.style.transition = 'transform 0.75s cubic-bezier(0.4, 0, 0.2, 1)';
    // First groggy half-blink open
    eyelidTop.style.transform = 'translateY(-48%)';
    eyelidBot.style.transform = 'translateY(48%)';
  }, 300);

  const t2 = setTimeout(() => {
    // Blink shut briefly
    eyelidTop.style.transition = 'transform 0.35s ease-in';
    eyelidBot.style.transition = 'transform 0.35s ease-in';
    eyelidTop.style.transform = 'translateY(-8%)';
    eyelidBot.style.transform = 'translateY(8%)';
  }, 1350);

  const t3 = setTimeout(() => {
    // Blink wide open!
    eyelidTop.style.transition = 'transform 0.95s cubic-bezier(0.22, 1, 0.36, 1)';
    eyelidBot.style.transition = 'transform 0.95s cubic-bezier(0.22, 1, 0.36, 1)';
    eyelidTop.style.transform = 'translateY(-100%)';
    eyelidBot.style.transform = 'translateY(100%)';
  }, 1850);

  const t4 = setTimeout(() => {
    // Play crab claw snap when camera turns to look at the crab in the water
    emit('playSound', { sound: 'crab_snap' });
  }, 5400);

  this._cutsceneTimeouts.push(t1, t2, t3, t4);
};

showCurrentCard(300);
  }

_clearCutsceneTimers() {
  if (this._cutsceneTimeouts) {
    this._cutsceneTimeouts.forEach(t => clearTimeout(t));
    this._cutsceneTimeouts = [];
  }
  if (this._cleanupPremiseInput) {
    this._cleanupPremiseInput();
    this._cleanupPremiseInput = null;
  }
}

_updateCutscene(delta) {
  if (!this._cutsceneActive || !this._cutsceneKeyframes || this._cutsceneKeyframes.length < 2) return;

  this._cutsceneTimer += delta;
  const frames = this._cutsceneKeyframes;
  const lastFrame = frames[frames.length - 1];

  if (this._cutsceneTimer >= lastFrame.t) {
    // Cutscene complete — set final pose and restore player control
    this.yawObject.position.set(lastFrame.x, lastFrame.y, lastFrame.z);
    this.yawObject.rotation.y = lastFrame.yaw;
    this.pitchObject.rotation.x = lastFrame.pitch;
    this.camera.rotation.z = 0;

    this._cutsceneActive = false;
    this.mode = 'player';
    if (this.crosshair) this.crosshair.style.display = 'block';
    if (this.instructions) this.instructions.style.display = 'flex';

    if (this._cutsceneOverlay && this._cutsceneOverlay.parentNode) {
      this._cutsceneOverlay.parentNode.removeChild(this._cutsceneOverlay);
      this._cutsceneOverlay = null;
    }

    // Begin Step 1/4 of the Day 0 tutorial & show Area 1 popup for the Beach
    this.advanceTutorialStep('TALK_CRAB');
    this.showAreaPopup({
      icon: '🏖️',
      areaName: 'Area 1 of 4 • Northeast Beach',
      title: 'Port Rotgut Island Beach',
      purposeText: 'You washed up on the sandy north shore of Dock Island after Friday night\'s bender. This beach connects up the sandy slope to the Main Harbor Pier on the East and across the island trail to your Shipyard on the West.',
      actionText: 'Use <b>WASD</b> to walk, <b>Shift</b> to sprint, and <b>Space</b> to jump. Approach <b>Clawdius Pinch, Esq.</b> (the crab lawyer in the suit ahead) and press <b>E</b> or <b>Click</b> to speak with him.'
    });

    if (this._cutsceneOnComplete) {
      const cb = this._cutsceneOnComplete;
      this._cutsceneOnComplete = null;
      cb();
    }
    return;
  }

  // Find active segment
  let k0 = frames[0];
  let k1 = frames[1];
  for (let i = 0; i < frames.length - 1; i++) {
    if (this._cutsceneTimer >= frames[i].t && this._cutsceneTimer <= frames[i + 1].t) {
      k0 = frames[i];
      k1 = frames[i + 1];
      break;
    }
  }

  const span = Math.max(0.001, k1.t - k0.t);
  const rawU = Math.max(0, Math.min(1, (this._cutsceneTimer - k0.t) / span));
  // Smoothstep easing for natural head/body movement
  const u = rawU * rawU * (3 - 2 * rawU);

  this.yawObject.position.set(
    k0.x + (k1.x - k0.x) * u,
    k0.y + (k1.y - k0.y) * u,
    k0.z + (k1.z - k0.z) * u
  );
  this.yawObject.rotation.y = k0.yaw + (k1.yaw - k0.yaw) * u;
  this.pitchObject.rotation.x = k0.pitch + (k1.pitch - k0.pitch) * u;
  this.camera.rotation.z = k0.roll + (k1.roll - k0.roll) * u;
}

_interactWithShip() {
  if (this.tutorialActive && this.tutorialStep !== 'PRACTICE_SHIP') {
    if (this.tutorialStep === 'VISIT_SHIPYARD') {
      this._completeShipyardTutorialStep();
      return;
    }
    emit('playSound', { sound: 'qte_fail' });
    const msg = this.tutorialStep === 'TALK_CRAB'
      ? '🔒 <b>Shipyard Locked:</b> Speak with <b>Clawdius Pinch, Esq.</b> on the beach first!'
      : (this.tutorialStep === 'READ_NOTICE'
        ? '🔒 <b>Shipyard Locked:</b> Read the <b>Divorce Notice</b> nailed to the post where the dock meets land first!'
        : '🔒 <b>Shipyard Locked:</b> Head East to your <b>Shipwright Shop</b> on the pier first to learn how the business works!');
    this.showLockedHint(msg);
    return;
  }
  emit('playSound', { sound: 'qte_success' });
  emit('requestPhaseChange', { phase: 'SHIPYARD' });
}

_interactWithLedger() {
  if (this.tutorialActive && this.tutorialStep !== 'PRACTICE_SHIP') {
    emit('playSound', { sound: 'qte_fail' });
    this.showLockedHint('🔒 <b>Logbook Locked:</b> Exit the shop and head <b>West to the Shipyard</b> to inspect the abandoned scrap ship first!');
    return;
  }
  emit('playSound', { sound: 'qte_success' });
  if (this.isLocked) {
    document.exitPointerLock();
  }
  emit('openLevelSelector');
}

_interactWithShipyard() {
  if (this.tutorialActive && this.tutorialStep !== 'PRACTICE_SHIP') {
    if (this.tutorialStep === 'VISIT_SHIPYARD') {
      this._completeShipyardTutorialStep();
      return;
    }
    emit('playSound', { sound: 'qte_fail' });
    const msg = this.tutorialStep === 'TALK_CRAB'
      ? '🔒 <b>Shipyard Locked:</b> Speak with <b>Clawdius Pinch, Esq.</b> on the beach first!'
      : (this.tutorialStep === 'READ_NOTICE'
        ? '🔒 <b>Shipyard Locked:</b> Read the <b>Divorce Notice</b> nailed to the post where the dock meets land first!'
        : '🔒 <b>Shipyard Locked:</b> Head East to your <b>Shipwright Shop</b> on the pier first to learn how the business works!');
    this.showLockedHint(msg);
    return;
  }
  emit('playSound', { sound: 'qte_success' });
  emit('gotoShipyard');
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
  this.verticalVelocity = 0;
  this.isGrounded = true;
  this.keys.jump = false;

  emit('playSound', { sound: 'qte_success' });
  emit('dockPlayerModeChanged', { mode: 'shop' });
  emit('dockPlayerEnteredShop');

  if (this.tutorialActive && this.tutorialStep === 'ENTER_SHOP') {
    this.advanceTutorialStep('VISIT_SHIPYARD');
  }
}

exitShop() {
  this.mode = 'player';

  // Place player just outside the door facing outward onto the dock / island ramp
  if (this.savedExitPosition) {
    this.yawObject.position.set(this.savedExitPosition.x, this.savedExitPosition.y + this.eyeHeight, this.savedExitPosition.z);
  } else {
    this.yawObject.position.set(-2.1, 2.15 + this.eyeHeight, 4.35);
  }

  // Face outward toward the island ramp (world -X, door is behind them)
  this.yawObject.rotation.y = Math.PI / 2;
  this.pitchObject.rotation.x = 0;
  this.velocity.set(0, 0, 0);
  this.verticalVelocity = 0;
  this.isGrounded = true;
  this.keys.jump = false;

  emit('playSound', { sound: 'qte_success' });
  emit('dockPlayerModeChanged', { mode: 'player' });
}

// ---------------------------------------------------------------------------
// Frame Update
// ---------------------------------------------------------------------------

update(delta) {
  if (this.mode === 'cutscene') {
    this._updateCutscene(delta);
    if (this.voxelArms) {
      this.voxelArms.update(delta);
    }
    return;
  }

  if (this.mode === 'player') {
    if (!this._tutorialPopupEl) {
      this._updatePlayerMovement(delta);
    }

    // Check if player stepped into the Day 0 Shipyard Location Circle
    if (this.tutorialActive && this.tutorialStep === 'VISIT_SHIPYARD') {
      const circleWorldX = (-22.0 - 31.0) * this.scale;
      const circleWorldZ = 0.0;
      const dx = this.yawObject.position.x - circleWorldX;
      const dz = this.yawObject.position.z - circleWorldZ;
      if (Math.hypot(dx, dz) <= 3.1 * this.scale) {
        this._completeShipyardTutorialStep();
      }
    }
  }

  this._updateInteractionRaycast();

  if (this.voxelArms) {
    this.voxelArms.update(delta);
  }
}

_resolveObstacleCollisions(pos) {
  const r = this.playerRadius;
  const s = this.scale;
  const obstacles = [
    // Main shop building and front counter
    { minX: -1.05 * s, maxX: 5.25 * s, minZ: 1.10 * s, maxZ: 6.65 * s },
    // Crates stacked beside shop on the dock
    { minX: -2.1 * s, maxX: -1.2 * s, minZ: 2.1 * s, maxZ: 3.1 * s }
  ];

  for (let i = 0; i < obstacles.length; i++) {
    const box = obstacles[i];
    if (
      pos.x > box.minX - r &&
      pos.x < box.maxX + r &&
      pos.z > box.minZ - r &&
      pos.z < box.maxZ + r
    ) {
      const dLeft = pos.x - (box.minX - r);
      const dRight = (box.maxX + r) - pos.x;
      const dFront = pos.z - (box.minZ - r);
      const dBack = (box.maxZ + r) - pos.z;

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
  if (this.keys.jump && this.isGrounded) {
    this.verticalVelocity = this.jumpSpeed;
    this.isGrounded = false;
  }

  const moveDir = new THREE.Vector3();

  if (this.keys.forward) moveDir.z -= 1;
  if (this.keys.backward) moveDir.z += 1;
  if (this.keys.left) moveDir.x -= 1;
  if (this.keys.right) moveDir.x += 1;

  const currentGround = this.yawObject.position.y - this.eyeHeight;
  const maxStepUp = 0.65; // Max vertical step height (allows ramps, steps, decks; blocks steep cliff drops)

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
    if (groundHit !== null && (groundHit - currentGround <= maxStepUp)) {
      this.yawObject.position.x = candidate.x;
      this.yawObject.position.z = candidate.z;
      if (this.isGrounded) {
        const targetY = groundHit + this.eyeHeight;
        this.yawObject.position.y += (targetY - this.yawObject.position.y) * Math.min(1.0, delta * 14.0);
      }
    } else {
      // Fallback: test sliding along X
      const candX = new THREE.Vector3(candidate.x, this.yawObject.position.y, this.yawObject.position.z);
      this._resolveObstacleCollisions(candX);
      const slideXHit = this._getGroundHeightAt(candX.x, this.yawObject.position.z);
      if (slideXHit !== null && (slideXHit - currentGround <= maxStepUp)) {
        this.yawObject.position.x = candX.x;
        if (this.isGrounded) {
          this.yawObject.position.y += (slideXHit + this.eyeHeight - this.yawObject.position.y) * Math.min(1.0, delta * 14.0);
        }
      } else {
        // Slide along Z
        const candZ = new THREE.Vector3(this.yawObject.position.x, this.yawObject.position.y, candidate.z);
        this._resolveObstacleCollisions(candZ);
        const slideZHit = this._getGroundHeightAt(this.yawObject.position.x, candZ.z);
        if (slideZHit !== null && (slideZHit - currentGround <= maxStepUp)) {
          this.yawObject.position.z = candZ.z;
          if (this.isGrounded) {
            this.yawObject.position.y += (slideZHit + this.eyeHeight - this.yawObject.position.y) * Math.min(1.0, delta * 14.0);
          }
        }
      }
    }
  } else if (this.isGrounded) {
    // Idle terrain height tracking
    const groundHit = this._getGroundHeightAt(this.yawObject.position.x, this.yawObject.position.z);
    if (groundHit !== null) {
      const targetY = groundHit + this.eyeHeight;
      this.yawObject.position.y += (targetY - this.yawObject.position.y) * Math.min(1.0, delta * 14.0);
    }
  }

  // Airborne jump & gravity integration
  if (!this.isGrounded) {
    this.yawObject.position.y += this.verticalVelocity * delta;
    this.verticalVelocity -= this.gravity * delta;

    const groundBelow = this._getGroundHeightAt(this.yawObject.position.x, this.yawObject.position.z);
    if (groundBelow !== null) {
      const minCamY = groundBelow + this.eyeHeight;
      if (this.yawObject.position.y <= minCamY) {
        this.yawObject.position.y = minCamY;
        if (this.verticalVelocity <= 0) {
          this.verticalVelocity = 0;
          this.isGrounded = true;
        }
      }
    }
  }
}

_getGroundHeightAt(x, z) {
  if (!this.dockStall || !this.dockStall.group) {
    return 2.15 * this.scale; // default dock level
  }

  const rayOrigin = new THREE.Vector3(x, 16.0 * this.scale, z);
  this.downRaycaster.set(rayOrigin, new THREE.Vector3(0, -1, 0));
  this.downRaycaster.far = 20.0;

  // Intersect terrain and dock objects
  const hits = this.downRaycaster.intersectObject(this.dockStall.group, true);
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    // Exclude roofs, overhead tie beams, high cranes, gulls, or high props (> 5.1 * scale)
    if (hit.point.y > 5.1 * this.scale) continue;
    // Exclude water/below water level
    if (hit.point.y < 0.1 * this.scale) continue;

    // Make sure the hit object isn't the door, bunny, or marked noWalk
    if (hit.object && hit.object.userData && (hit.object.userData.isShopDoor || hit.object.userData.isBunny || hit.object.userData.noWalk)) continue;

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
  if (!this.dockStall) {
    this._setHoverState(null);
    return;
  }

  const interactables = [];
  if (this.dockStall.doorInteractables) {
    interactables.push(...this.dockStall.doorInteractables);
  }
  if (this.dockStall.bunnyInteractables) {
    interactables.push(...this.dockStall.bunnyInteractables);
  }
  if (this.dockStall.crabInteractables) {
    interactables.push(...this.dockStall.crabInteractables);
  }
  if (this.dockStall.divorcePostInteractables) {
    interactables.push(...this.dockStall.divorcePostInteractables);
  }
  if (this.dockStall.shipInteractables) {
    interactables.push(...this.dockStall.shipInteractables);
  }
  if (this.dockStall.ledgerInteractables) {
    interactables.push(...this.dockStall.ledgerInteractables);
  }
  if (this.dockStall.shipyardInteractables) {
    interactables.push(...this.dockStall.shipyardInteractables);
  }
  if (this.dockStall.ghostMerchantInteractables) {
    interactables.push(...this.dockStall.ghostMerchantInteractables);
  }

  if (interactables.length === 0) {
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

  const hits = this.interactRaycaster.intersectObjects(interactables, true);
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    if (hit.object) {
      let cur = hit.object;
      let isShip = false;
      let isLedger = false;
      while (cur) {
        if (cur.userData && (cur.userData.isMooredShip || cur.userData.isShip)) {
          isShip = true;
          break;
        }
        if (cur.userData && cur.userData.isLedger) {
          isLedger = true;
          break;
        }
        cur = cur.parent;
      }

      if (isShip) {
        if (hit.distance <= 14.0 * this.scale) {
          this._setHoverState(hit.object, 'ship');
          return;
        }
      } else if (isLedger) {
        if (hit.distance <= 8.5 * this.scale) {
          this._setHoverState(hit.object, 'ledger');
          return;
        }
      } else if (hit.object.userData) {
        if (hit.object.userData.isCrab) {
          if (hit.distance <= 8.5 * this.scale) {
            this._setHoverState(hit.object, 'crab');
            return;
          }
        } else if (hit.object.userData.isDivorcePost) {
          if (hit.distance <= 8.0 * this.scale) {
            this._setHoverState(hit.object, 'divorcePost');
            return;
          }
        } else if (hit.object.userData.isGhostMerchant) {
          if (hit.distance <= 7.5 * this.scale) {
            this._setHoverState(hit.object, 'ghost');
            return;
          }
        } else if (hit.object.userData.isBunny) {
          if (hit.distance <= 6.5 * this.scale) {
            this._setHoverState(hit.object, 'bunny');
            return;
          }
        } else if (hit.object.userData.isShopDoor) {
          const maxDist = (this.mode === 'shop' ? 5.5 : 4.0) * this.scale;
          if (hit.distance <= maxDist) {
            this._setHoverState(hit.object, 'door');
            return;
          }
        } else if (hit.object.userData.isShipyardBench) {
          if (hit.distance <= 6.5 * this.scale) {
            this._setHoverState(hit.object, 'shipyard');
            return;
          }
        }
      }
    }
  }

  this._setHoverState(null);
}

_setHoverState(obj, type = null) {
  this.hoveredDoor = type === 'door' ? obj : null;
  this.hoveredBunny = type === 'bunny' ? obj : null;
  this.hoveredCrab = type === 'crab' ? obj : null;
  this.hoveredDivorcePost = type === 'divorcePost' ? obj : null;
  this.hoveredShip = type === 'ship' ? obj : null;
  this.hoveredLedger = type === 'ledger' ? obj : null;
  this.hoveredShipyard = type === 'shipyard' ? obj : null;
  this.hoveredGhost = type === 'ghost' ? obj : null;

  if (type) {
    this.domElement.style.cursor = 'pointer';
    this.crosshair.style.transform = 'translate(-50%, -50%) scale(1.6)';
    this.crosshair.style.background = '#ffd700';
    this.crosshair.style.borderColor = '#ffffff';

    this.prompt.style.display = 'flex';
    if (type === 'crab') {
      this.prompt.innerHTML = `🦀 <span style="background:#4a3520; padding:2px 6px; border-radius:0; border:1px solid #c89d55; font-size:11px; margin-right:4px;">E</span> or Click Crab Clerk to Speak`;
    } else if (type === 'divorcePost') {
      if (this.tutorialActive && this.tutorialStep === 'TALK_CRAB') {
        this.prompt.innerHTML = `🔒 <span style="color:#ff9b94;">Speak with Crab Lawyer on Beach First</span>`;
      } else {
        this.prompt.innerHTML = `<span class="pixel-icon icon-map-maker-scroll size-16"></span> <span style="background:#4a3520; padding:2px 6px; border-radius:0; border:1px solid #c89d55; font-size:11px; margin-right:4px;">E</span> or Click to Read Divorce Papers`;
      }
    } else if (type === 'ghost') {
      if (this.tutorialActive && this.tutorialStep !== 'PRACTICE_SHIP') {
        this.prompt.innerHTML = `🔒 <span style="color:#ff9b94;">Complete Harbor Tour First</span>`;
      } else {
        this.prompt.innerHTML = `<span class="pixel-icon icon-phantom-ghost size-16"></span> <span style="background:#4a3520; padding:2px 6px; border-radius:0; border:1px solid #c89d55; font-size:11px; margin-right:4px;">E</span> or Click Ghost to Barter Wares`;
      }
    } else if (type === 'bunny') {
      this.prompt.innerHTML = `<span class="pixel-icon icon-easter-bunny size-16"></span> <span style="background:#4a3520; padding:2px 6px; border-radius:0; border:1px solid #c89d55; font-size:11px; margin-right:4px;">E</span> or Click to Pet Bunny`;
    } else if (type === 'ledger') {
      if (this.tutorialActive && this.tutorialStep !== 'PRACTICE_SHIP') {
        this.prompt.innerHTML = `🔒 <span style="color:#ff9b94;">Visit West Shipyard &amp; Scrap Ship First</span>`;
      } else {
        this.prompt.innerHTML = `<span class="pixel-icon icon-closed-logbook size-16"></span> <span style="background:#4a3520; padding:2px 6px; border-radius:0; border:1px solid #c89d55; font-size:11px; margin-right:4px;">E</span> or Click Logbook to Select Voyage`;
      }
    } else if (type === 'ship') {
      if (this.tutorialActive && (this.tutorialStep === 'TALK_CRAB' || this.tutorialStep === 'READ_NOTICE' || this.tutorialStep === 'ENTER_SHOP')) {
        const reason = this.tutorialStep === 'TALK_CRAB'
          ? 'Speak with Crab Lawyer First'
          : (this.tutorialStep === 'READ_NOTICE' ? 'Read Notice Post First' : 'Visit Shipwright Shop First');
        this.prompt.innerHTML = `🔒 <span style="color:#ff9b94;">Shipyard Locked — ${reason}</span>`;
      } else {
        const shipName = this.dockStall?.activeShipProfile?.name || 'Vessel';
        this.prompt.innerHTML = `<span class="pixel-icon icon-hammer size-16"></span> <span style="background:#4a3520; padding:2px 6px; border-radius:0; border:1px solid #c89d55; font-size:11px; margin-right:4px;">E</span> or Click to Enter Shipyard &amp; Alter ${shipName}`;
      }
    } else if (type === 'shipyard') {
      if (this.tutorialActive && (this.tutorialStep === 'TALK_CRAB' || this.tutorialStep === 'READ_NOTICE' || this.tutorialStep === 'ENTER_SHOP')) {
        const reason = this.tutorialStep === 'TALK_CRAB'
          ? 'Speak with Crab Lawyer First'
          : (this.tutorialStep === 'READ_NOTICE' ? 'Read Notice Post First' : 'Visit Shipwright Shop First');
        this.prompt.innerHTML = `🔒 <span style="color:#ff9b94;">Shipyard Locked — ${reason}</span>`;
      } else {
        this.prompt.innerHTML = `<span class="pixel-icon icon-hammer size-16"></span> <span style="background:#4a3520; padding:2px 6px; border-radius:0; border:1px solid #c89d55; font-size:11px; margin-right:4px;">E</span> or Click to Enter Shipyard`;
      }
    } else if (this.mode === 'player') {
      if (this.tutorialActive && (this.tutorialStep === 'TALK_CRAB' || this.tutorialStep === 'READ_NOTICE')) {
        const reason = this.tutorialStep === 'TALK_CRAB'
          ? 'Speak with Crab Lawyer First'
          : 'Read Notice Post First';
        this.prompt.innerHTML = `🔒 <span style="color:#ff9b94;">Shop Locked — ${reason}</span>`;
      } else {
        this.prompt.innerHTML = `<span class="pixel-icon icon-cabin-door-exit size-16"></span> <span style="background:#4a3520; padding:2px 6px; border-radius:0; border:1px solid #c89d55; font-size:11px; margin-right:4px;">E</span> or Click to Enter Shop`;
      }
    } else {
      this.prompt.innerHTML = `<span class="pixel-icon icon-cabin-door-exit size-16"></span> <span style="background:#4a3520; padding:2px 6px; border-radius:0; border:1px solid #c89d55; font-size:11px; margin-right:4px;">E</span> or Click to Exit Shop`;
    }
  } else {
    this.domElement.style.cursor = 'default';
    this.crosshair.style.transform = 'translate(-50%, -50%) scale(1.0)';
    this.crosshair.style.background = 'rgba(255, 255, 255, 0.85)';
    this.crosshair.style.borderColor = 'rgba(0, 0, 0, 0.6)';
    this.prompt.style.display = 'none';
  }
}

_interactWithGhost() {
  if (this.tutorialActive && this.tutorialStep !== 'PRACTICE_SHIP') {
    emit('playSound', { sound: 'qte_fail' });
    this.showLockedHint('🔒 <b>Ghost Merchant Locked:</b> Complete your harbor tour first! Check the instruction at the top.');
    return;
  }
  emit('playSound', { sound: 'qte_success' });
  if (this.isLocked && document.exitPointerLock) {
    document.exitPointerLock();
  }
  emit('openShopUI');
}

// ---------------------------------------------------------------------------
// Disposal & Teardown
// ---------------------------------------------------------------------------

dispose() {
  this._clearCutsceneTimers();
  this.closeAreaPopup();
  if (this._lockedToastTimer) {
    clearTimeout(this._lockedToastTimer);
    this._lockedToastTimer = null;
  }
  if (this.dockStall) {
    this.dockStall.setDivorcePostRingVisible(false);
    this.dockStall.setShipyardTutorialCircleVisible(false);
    this.dockStall.setShopDoorGlowVisible(false);
  }
  if (this._cutsceneOverlay && this._cutsceneOverlay.parentNode) {
    this._cutsceneOverlay.parentNode.removeChild(this._cutsceneOverlay);
    this._cutsceneOverlay = null;
  }
  this._unbindEvents();

  if (this.voxelArms) {
    this.voxelArms.dispose();
    this.voxelArms = null;
  }

  if (this.emoteWheel) {
    this.emoteWheel.dispose();
    this.emoteWheel = null;
  }

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

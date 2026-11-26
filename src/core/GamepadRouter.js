import { emit, on, off } from './EventBus.js';
import { GamePhase } from './GameState.js';
import { XBOX_BUTTON, applyAxisDeadzone } from './GamepadManager.js';

/**
 * GamepadRouter — Central per-frame Xbox controller dispatcher across all
 * BoatLoad game phases, modals, QTEs, Director Mode, and haptic events.
 */
export class GamepadRouter {
  /**
   * @param {object} deps
   * @param {import('./GamepadManager.js').GamepadManager} deps.gamepadManager
   * @param {import('./GamepadNavigator.js').GamepadNavigator} deps.navigator
   * @param {import('./GameState.js').GameState} deps.gameState
   * @param {import('../ui/HUD.js').HUD} [deps.hud]
   * @param {import('../ui/CreditsUI.js').CreditsUI} [deps.creditsUI]
   * @param {import('../director/DirectorMode.js').DirectorMode} [deps.directorMode]
   * @param {import('../ui/PauseMenu.js').PauseMenu} [deps.pauseMenu]
   * @param {object} [deps.audio]
   * @param {Function} [deps.isPaused]
   */
  constructor({
    gamepadManager,
    navigator,
    gameState,
    hud = null,
    creditsUI = null,
    directorMode = null,
    pauseMenu = null,
    audio = null,
    isPaused = () => false,
  }) {
    this._gp = gamepadManager;
    this._nav = navigator;
    this._gs = gameState;
    this._hud = hud;
    this._creditsUI = creditsUI;
    this._director = directorMode;
    this._pauseMenu = pauseMenu;
    this._audio = audio;
    this._isPaused = isPaused;

    this._lastPhase = null;
    this._holdingQTESiren = false;
    this._bailDrawingActive = false;
    this._lastBailPoint = null;
    this._editorActionDown = false;

    this._bindHaptics();
  }

  _bindHaptics() {
    this._hapticHandlers = [];
    const listen = (evt, fn) => {
      on(evt, fn);
      this._hapticHandlers.push(() => off(evt, fn));
    };

    listen('obstacleHit', (d = {}) => {
      const dmg = d.damage ?? 15;
      const intensity = Math.min(1, 0.35 + dmg / 50);
      this._gp.rumble({ duration: 240, strong: intensity, weak: intensity * 0.65 });
    });

    listen('playerDamaged', () => {
      this._gp.rumble({ duration: 200, strong: 0.75, weak: 0.5 });
    });

    listen('sharkHitConfirmed', () => {
      this._gp.rumble({ duration: 130, strong: 0.6, weak: 0.85 });
    });

    listen('qteSuccess', ({ isPerfect } = {}) => {
      this._gp.rumble({ duration: isPerfect ? 140 : 90, strong: isPerfect ? 0.45 : 0.25, weak: 0.7 });
    });

    listen('qteFail', () => {
      this._gp.rumble({ duration: 180, strong: 0.55, weak: 0.2 });
    });

    listen('sirenPulling', ({ intensity = 0 } = {}) => {
      if (intensity > 0.25) {
        this._gp.rumble({ duration: 70, strong: 0.08, weak: Math.min(0.45, intensity * 0.4), minIntervalMs: 120 });
      }
    });

    listen('buildPlaced', () => {
      this._gp.rumble({ duration: 45, strong: 0.15, weak: 0.35, minIntervalMs: 60 });
    });

    listen('buildErased', () => {
      this._gp.rumble({ duration: 55, strong: 0.3, weak: 0.2, minIntervalMs: 60 });
    });

    listen('playerSinkingStart', () => {
      this._gp.rumble({ duration: 600, strong: 0.9, weak: 0.7 });
    });

    listen('gamepadDisconnected', () => {
      this._clearActiveQTEHolds();
      if (this._gs?.currentPhase === GamePhase.OBSTACLE && !this._isPaused() && !this._gs._isCountdownActive) {
        emit('requestPause');
      }
    });
  }

  _clearActiveQTEHolds() {
    if (this._holdingQTESiren) {
      this._holdingQTESiren = false;
      emit('qteInput', { kind: 'holdEnd' });
    }
    if (this._bailDrawingActive) {
      this._bailDrawingActive = false;
      this._lastBailPoint = null;
      emit('qteInput', { kind: 'drawCancel' });
      this._hud?.clearGamepadBailTrace?.();
    }
  }

  /**
   * Main per-frame update called from main.js tick() before pause gating.
   * @param {number} delta Frame delta in seconds
   * @param {number} [nowMs] Timestamp in ms
   */
  update(delta, nowMs) {
    const connected = this._gp.poll(nowMs);
    const phase = this._gs?.currentPhase;

    if (phase !== this._lastPhase) {
      this._lastPhase = phase;
      this._nav.setVirtualCursor(false);
      this._clearActiveQTEHolds();
      this._hud?.setGamepadSteer?.(0);
      this._gs?.setSailingLookOffset?.(0, 0);
      if (this._editorActionDown) {
        this._editorActionDown = false;
        this._gs?._editorSystem?.gamepadActionUp?.();
      }
    }

    if (!connected || !this._gp.isGamepadActive()) {
      this._nav.updateReticle(false);
      this._nav.updateHints({ phase, isModal: false });
      this._hud?.setGamepadSteer?.(0);
      if (this._gs?._dockPlayerController) {
        this._gs._dockPlayerController.applyGamepadInput(this._gp, delta);
      }
      return;
    }

    // Unlock WebAudio on first controller button press
    if (this._audio && !this._audio.isUnlocked?.() && this._gp.hasAnyInput()) {
      this._audio.unlock?.();
    }

    // 1. Director Mode takes precedence when active
    if (this._director?.isActive) {
      this._nav.updateReticle(false);
      this._nav.updateHints({ phase, isDirector: true });
      this._director.applyGamepadInput(this._gp, delta);
      return;
    }

    // 2. Global Menu / Start Pause Toggle (when not on Main Menu, Credits, or PreSail)
    const topModal = this._nav.getTopModal(this._gs, this._pauseMenu);
    if (
      this._gp.isJustPressed(XBOX_BUTTON.MENU) &&
      phase !== GamePhase.MAIN_MENU &&
      phase !== GamePhase.CREDITS &&
      (!topModal || topModal.key === 'pause' || topModal.key === 'settings')
    ) {
      this._clearActiveQTEHolds();
      emit('requestPause');
      return;
    }

    // 3. Modals / Menus take priority over 3D world input
    if (topModal) {
      this._nav.setVirtualCursor(false);
      this._nav.updateReticle(false);
      this._hud?.setGamepadSteer?.(0);
      this._clearActiveQTEHolds();
      this._nav.updateHints({ phase, isModal: true });
      this._nav.handleModal(this._gp, delta, this._gs, this._pauseMenu);
      return;
    }

    if (this._isPaused()) {
      this._nav.updateReticle(false);
      this._hud?.setGamepadSteer?.(0);
      this._nav.updateHints({ phase, isModal: true });
      return;
    }

    // 4. Phase-specific gameplay handlers
    switch (phase) {
      case GamePhase.DOCK:
        this._nav.updateReticle(false);
        this._gs?._dockPlayerController?.applyGamepadInput?.(this._gp, delta);
        this._nav.updateHints({ phase: GamePhase.DOCK });
        break;

      case GamePhase.SHIPYARD:
        this._updateShipyard(delta);
        break;

      case GamePhase.OBSTACLE:
        this._nav.updateReticle(false);
        this._updateObstacle(delta);
        break;

      case GamePhase.EDITOR:
        this._updateEditor(delta);
        break;

      case GamePhase.CREDITS:
        this._nav.updateReticle(false);
        this._creditsUI?.applyGamepadInput?.(this._gp, delta);
        this._nav.updateHints({ phase: GamePhase.CREDITS });
        break;

      default:
        this._nav.updateReticle(false);
        this._nav.updateHints({ phase });
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // SHIPYARD (KSP Enhanced VAB/SPH Scheme)
  // ---------------------------------------------------------------------------

  _updateShipyard(delta) {
    if (this._gp.isJustPressed(XBOX_BUTTON.L3)) {
      this._nav.toggleVirtualCursor();
    }

    if (this._nav.virtualCursorActive) {
      this._nav.updateReticle(false);
      this._nav.updateVirtualCursor(this._gp, delta, GamePhase.SHIPYARD);
      this._nav.updateHints({ phase: GamePhase.SHIPYARD, isCursorMode: true });
      return;
    }

    this._nav.updateReticle(true);
    this._nav.updateHints({ phase: GamePhase.SHIPYARD });

    const sens = this._gp.getSensitivity();
    const flyY = this._gp.rightTrigger - this._gp.leftTrigger;
    this._gs?._shipyardFlyControls?.applyGamepadInput?.(
      {
        moveX: this._gp.leftStick.x,
        moveY: this._gp.leftStick.y,
        flyY,
        lookX: this._gp.rightStick.x,
        lookY: this._gp.rightStick.y,
        lookSpeedRad: 2.3 * sens,
      },
      delta
    );

    // Aim center reticle and place on A
    const placePressed = this._gp.isJustPressed(XBOX_BUTTON.A);
    this._gs?.shipyardRaycastCenter?.(placePressed);

    if (this._gp.isJustPressed(XBOX_BUTTON.B)) emit('undoBuild');
    if (this._gp.isJustPressed(XBOX_BUTTON.DPAD_DOWN)) emit('redoBuild');
    if (this._gp.isJustPressed(XBOX_BUTTON.X)) emit('rotateBrush');
    if (this._gp.isJustPressed(XBOX_BUTTON.Y)) emit('togglePitch');
    if (this._gp.isJustPressed(XBOX_BUTTON.DPAD_UP)) emit('toggleMirror');

    if (this._gp.isJustPressed(XBOX_BUTTON.LB)) this._gs?._buildSystem?.cycleBrush?.(-1);
    if (this._gp.isJustPressed(XBOX_BUTTON.RB)) this._gs?._buildSystem?.cycleBrush?.(1);
    if (this._gp.isJustPressed(XBOX_BUTTON.DPAD_LEFT)) this._gs?._buildSystem?.cycleMaterial?.(-1);
    if (this._gp.isJustPressed(XBOX_BUTTON.DPAD_RIGHT)) this._gs?._buildSystem?.cycleMaterial?.(1);

    if (this._gp.isJustPressed(XBOX_BUTTON.R3)) this._gs?.shipyardRecenterCamera?.();
    if (this._gp.isJustPressed(XBOX_BUTTON.VIEW)) emit('startSailing');
  }

  // ---------------------------------------------------------------------------
  // OBSTACLE / HIGH SEAS SAILING (Sea of Thieves Helm + QTE Scheme)
  // ---------------------------------------------------------------------------

  _updateObstacle(delta) {
    // 1. Analog Steering (Left Stick X + D-Pad Left/Right fallback)
    const dz = this._gp._getDeadzone?.() ?? 0.15;
    let steerVal = applyAxisDeadzone(this._gp.rawLeftStick.x, dz, 0.95, 1.4);
    if (steerVal === 0) {
      if (this._gp.isPressed(XBOX_BUTTON.DPAD_LEFT)) steerVal = -1;
      else if (this._gp.isPressed(XBOX_BUTTON.DPAD_RIGHT)) steerVal = 1;
    }
    this._hud?.setGamepadSteer?.(steerVal);

    // 2. QTE Routing (Timing Harpoon / Hold Siren / Draw Bail)
    const qte = this._gs?._qteSystem;
    const activeQTE = qte?._active || null;
    const qteInputType = activeQTE?.definition?.input || null;

    if (qteInputType === 'timing') {
      if (this._gp.isJustPressed(XBOX_BUTTON.RT) || this._gp.isJustPressed(XBOX_BUTTON.A)) {
        emit('qteInput', { kind: 'tap' });
      }
    } else if (qteInputType === 'hold') {
      const holdNow = this._gp.isPressed(XBOX_BUTTON.LT) || this._gp.isPressed(XBOX_BUTTON.RT) || this._gp.isPressed(XBOX_BUTTON.A);
      if (holdNow && !this._holdingQTESiren) {
        this._holdingQTESiren = true;
        emit('qteInput', { kind: 'holdStart' });
      } else if (!holdNow && this._holdingQTESiren) {
        this._holdingQTESiren = false;
        emit('qteInput', { kind: 'holdEnd' });
      }
    } else if (qteInputType === 'mash') {
      if (this._gp.isJustPressed(XBOX_BUTTON.RT) || this._gp.isJustPressed(XBOX_BUTTON.A)) {
        emit('qteInput', { kind: 'tap' });
      }
    } else if (qteInputType === 'draw') {
      this._updateBailStickQTE(activeQTE);
    } else {
      this._clearActiveQTEHolds();
    }

    // 3. Chase camera look-around when Right Stick isn't busy drawing a Bail circle
    if (qteInputType !== 'draw') {
      const sens = this._gp.getSensitivity();
      this._gs?.setSailingLookOffset?.(
        -this._gp.rightStick.x * 0.75 * Math.min(1.3, sens),
        this._gp.rightStick.y * 0.25 * Math.min(1.3, sens)
      );
    } else {
      this._gs?.setSailingLookOffset?.(0, 0);
    }

    // 4. Dense Fog / Bow Lantern toggle (Y)
    if (this._gp.isJustPressed(XBOX_BUTTON.Y) && this._gs?._environmentManager) {
      const isDense = this._gs._environmentManager.toggleDenseFog();
      if (typeof window !== 'undefined') window.denseFogEnabled = isDense;
      emit('denseFogChanged', { enabled: isDense });
    }

    this._nav.updateHints({ phase: GamePhase.OBSTACLE, activeQTE: qteInputType });
  }

  /**
   * Right Stick 360-degree circular trace for Bail Water QTE (up to 100% accuracy),
   * plus X / A / RT 50% quick bail assist fallback.
   */
  _updateBailStickQTE(activeQTE) {
    if (this._gp.isJustPressed(XBOX_BUTTON.X) || this._gp.isJustPressed(XBOX_BUTTON.A) || this._gp.isJustPressed(XBOX_BUTTON.RT)) {
      if (this._bailDrawingActive) {
        this._bailDrawingActive = false;
        this._lastBailPoint = null;
        this._hud?.clearGamepadBailTrace?.();
      }
      emit('qteInput', { kind: 'bailAssist' });
      return;
    }

    const rs = this._gp.rightStick;
    if (rs.magnitude >= 0.45) {
      const angle = Math.atan2(rs.y, rs.x);
      const pt = {
        x: 0.5 + Math.cos(angle) * 0.4,
        y: 0.5 + Math.sin(angle) * 0.4,
      };
      if (!this._bailDrawingActive) {
        this._bailDrawingActive = true;
        this._lastBailPoint = pt;
        this._hud?.clearGamepadBailTrace?.();
        this._hud?.drawGamepadBailTrace?.(pt, pt);
        emit('qteInput', { kind: 'drawStart', point: pt });
      } else {
        this._hud?.drawGamepadBailTrace?.(this._lastBailPoint || pt, pt);
        this._lastBailPoint = pt;
        emit('qteInput', { kind: 'drawMove', point: pt });
        // Auto-complete cleanly once a full crisp circle (>= 92% coverage & >= 14 points) is traced
        if ((activeQTE?.progress ?? 0) >= 0.92 && (activeQTE?.points?.length ?? 0) >= 14) {
          this._bailDrawingActive = false;
          this._lastBailPoint = null;
          emit('qteInput', { kind: 'drawEnd' });
        }
      }
    } else if (this._bailDrawingActive) {
      this._bailDrawingActive = false;
      this._lastBailPoint = null;
      emit('qteInput', { kind: 'drawEnd' });
    }
  }

  // ---------------------------------------------------------------------------
  // EDITOR & BOAT DESTRUCTION WORKSHOP (KSP Mode)
  // ---------------------------------------------------------------------------

  _updateEditor(delta) {
    const ed = this._gs?._editorSystem;
    const workshop = ed?._destructionWorkshop;
    const isWorkshop = Boolean(workshop?.isOpen);

    if (this._gp.isJustPressed(XBOX_BUTTON.L3)) {
      this._nav.toggleVirtualCursor();
    }

    if (this._nav.virtualCursorActive) {
      this._nav.updateReticle(false);
      this._nav.updateVirtualCursor(this._gp, delta, GamePhase.EDITOR);
      this._nav.updateHints({ phase: GamePhase.EDITOR, isWorkshop, isCursorMode: true });
      return;
    }

    this._nav.updateReticle(true);
    this._nav.updateHints({ phase: GamePhase.EDITOR, isWorkshop });

    const sens = this._gp.getSensitivity();

    if (isWorkshop) {
      const flyY = this._gp.rightTrigger - this._gp.leftTrigger;
      workshop._flyControls?.applyGamepadInput?.(
        {
          moveX: this._gp.leftStick.x,
          moveY: this._gp.leftStick.y,
          flyY,
          lookX: this._gp.rightStick.x,
          lookY: this._gp.rightStick.y,
          lookSpeedRad: 2.3 * sens,
        },
        delta
      );

      const applyNow = this._gp.isJustPressed(XBOX_BUTTON.A);
      workshop.updateGamepadReticle(applyNow);

      if (this._gp.isJustPressed(XBOX_BUTTON.B)) workshop.undo();
      if (this._gp.isJustPressed(XBOX_BUTTON.DPAD_DOWN)) workshop.redo();
      if (this._gp.isJustPressed(XBOX_BUTTON.X)) workshop.rotate();
      if (this._gp.isJustPressed(XBOX_BUTTON.Y)) workshop.togglePitch();
      if (this._gp.isJustPressed(XBOX_BUTTON.DPAD_UP)) workshop.toggleMirror();
      if (this._gp.isJustPressed(XBOX_BUTTON.LB)) workshop.cycleBrush(-1);
      if (this._gp.isJustPressed(XBOX_BUTTON.RB)) workshop.cycleBrush(1);
      if (this._gp.isJustPressed(XBOX_BUTTON.DPAD_LEFT)) workshop.cycleBrushSize(-1);
      if (this._gp.isJustPressed(XBOX_BUTTON.DPAD_RIGHT)) workshop.cycleBrushSize(1);
      if (this._gp.isJustPressed(XBOX_BUTTON.R3)) workshop.recenterCamera();
      if (this._gp.isJustPressed(XBOX_BUTTON.VIEW)) emit('editorCloseDamageWorkshop');
      return;
    }

    // Main Level Editor
    const zoomDelta = this._gp.rightTrigger - this._gp.leftTrigger;
    this._gs?.editorGamepadCamera?.(
      this._gp.leftStick.x,
      this._gp.leftStick.y,
      this._gp.rightStick.x * sens,
      this._gp.rightStick.y * sens,
      zoomDelta,
      delta
    );

    if (ed) {
      ed.updateGamepadReticle();

      if (this._gp.isJustPressed(XBOX_BUTTON.A)) {
        this._editorActionDown = true;
        ed.gamepadActionDown();
      } else if (this._editorActionDown && this._gp.isJustReleased(XBOX_BUTTON.A)) {
        this._editorActionDown = false;
        ed.gamepadActionUp();
      }

      if (this._gp.isJustPressed(XBOX_BUTTON.B)) {
        emit('editorSelectTool', { tool: 'select' });
      }
      if (this._gp.isJustPressed(XBOX_BUTTON.X)) ed.toggleDeleteTool();
      if (this._gp.isJustPressed(XBOX_BUTTON.Y)) ed.cycleCameraPreset();
      if (this._gp.isJustPressed(XBOX_BUTTON.LB)) ed.gamepadAdjustRotation(Math.PI / 8);
      if (this._gp.isJustPressed(XBOX_BUTTON.RB)) ed.gamepadAdjustRotation(-Math.PI / 8);
      if (this._gp.isJustPressed(XBOX_BUTTON.DPAD_UP)) ed.gamepadAdjustY(0.5);
      if (this._gp.isJustPressed(XBOX_BUTTON.DPAD_DOWN)) ed.gamepadAdjustY(-0.5);
      if (this._gp.isJustPressed(XBOX_BUTTON.DPAD_LEFT)) ed.gamepadAdjustScale(-0.5);
      if (this._gp.isJustPressed(XBOX_BUTTON.DPAD_RIGHT)) ed.gamepadAdjustScale(0.5);
      if (this._gp.isJustPressed(XBOX_BUTTON.R3)) emit('editorCameraPreset', { preset: 'default' });
      if (this._gp.isJustPressed(XBOX_BUTTON.VIEW)) emit('editorRequestPlay');
    }
  }

  dispose() {
    for (const cleanup of this._hapticHandlers) {
      try { cleanup(); } catch (_) {}
    }
    this._hapticHandlers.length = 0;
    this._clearActiveQTEHolds();
  }
}

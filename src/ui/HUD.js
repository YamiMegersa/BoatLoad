import { emit, on, off } from '../core/EventBus.js';
import { GameEnv } from '../core/GameEnv.js';
import { DEBUG } from '../utils/debug.js';
import { getAssetUrl } from '../utils/paths.js';
import { ShopRegistry } from '../config/ShopRegistry.js';
import { HelmConsole } from './HelmConsole.js';

const wheelImage = getAssetUrl('assets/wheels/wheel_threshold.png');

/**
 * HUD — obstacle phase HUD overlay.
 *
 * Displays:
 *  - Hull HP & Water Ingress widget (top-left)
 *  - Day & Doubloon counter pill (top-left)
 *  - Unified Helm Console (#helm-console), docked beside the wheel: one screen,
 *    TAP/HOLD lamps and one ACT button (or SPACE) answer every QTE
 *    (harpoon = tap in the arc, siren = hold to brace, bail = hold to pump)
 *  - On-screen Steering wheel (bottom-right)
 */
export class HUD {
  constructor() {
    this._el = null;
    this._hpBar = null;
    this._waterBar = null;
    this._helm = new HelmConsole();
    this._scoreEl = null;
    this._bonusBoxEl = null;
    this._score = 0;
    this._bannerTimer = null;

    // Kraken boss HUD state
    this._bossHPBar = null;
    this._bossTimerEl = null;
    this._bossWaypointEl = null;
    this._bossBannerEl = null;
    this._bossBannerTimeout = null;
    this._onScore = d => this._onScoreAdded(d);
    this._onPause = ({ paused }) => { if (paused) this._helm?.releaseHolds(); };
    this._onShipSunk = () => {
      this._helm?.disable();
      this._handleStrikeWindow({ open: false });
    };
    on('playerSinkingStart', this._onShipSunk);
    on('playerSunk', this._onShipSunk);

    on('uiMount', d => { if (d.screen === 'obstacle') this.mount(d); });
    on('uiUnmount', d => { if (d.screen === 'obstacle') this.unmount(); });
    on('playerHealth', d => this._updateHP(d.hp, d.max));
    on('playerWaterLevel', d => this._updateWater(d.level, d.max, d));
    this._onPlayerDamaged = d => this._handlePlayerDamaged(d);
    on('playerDamaged', this._onPlayerDamaged);
    this._onQTEStart = d => this._showQTE(d);
    this._onQTEUpdate = d => this._updateQTE(d);
    this._onQTEQueued = d => this._queueQTE(d);
    this._onQTESuccess = d => this._resolveQTE(d, d.isPerfect ? 'PERFECT' : 'GOOD');
    this._onQTEFail = d => this._resolveQTE(d, 'MISS');
    this._onQTEStrikeWindow = d => this._handleStrikeWindow(d);
    on('qteStart', this._onQTEStart);
    on('qteUpdate', this._onQTEUpdate);
    on('qteQueued', this._onQTEQueued);
    on('qteSuccess', this._onQTESuccess);
    on('qteFail', this._onQTEFail);
    on('qteStrikeWindow', this._onQTEStrikeWindow);
    on('scoreAdded', this._onScore);
    on('sharkHitConfirmed', d => this._showSharkConfirm(d));
    on('sirenWarning', d => this._showBanner(d));
    this._hasSirens = false;
    this._onSirensConfigured = ({ hasSirens }) => {
      this.setSirenStationVisible(hasSirens);
    };
    on('sirensConfigured', this._onSirensConfigured);
    this._onSirenPull = d => {
      if (d?.intensity > 0.01) {
        this.setSirenStationVisible(true);
      }
      this._updateSirenPull(d);
    };
    on('sirenPulling', this._onSirenPull);
    on('waterBailed', d => this._showBanner({ label: `BAILED ${d.removed}% WATER · BILGE SECURED` }));
    on('waterBailFailed', () => this._showBanner({ label: 'BAILING INTERRUPTED · TRY AGAIN' }));
    on('qteDebugResult', d => this._showDebugQTEResult(d));
    this._onSirenEffect = ({ state }) => {
      const container = this._el?.querySelector('#hud-wheel-container');
      const badge = this._el?.querySelector('#hud-disoriented-badge');
      if (container) {
        container.classList.toggle('is-disoriented', state === 'disoriented');
        container.classList.toggle('is-resistant', state === 'resistant');
      }
      if (badge) {
        badge.style.display = state === 'disoriented' ? 'block' : 'none';
      }
      if (state === 'resistant') {
        this._showBanner({ label: 'SONG RESISTED — ESCAPE NOW' });
      } else if (state === 'disoriented') {
        this._showBanner({ label: 'DISORIENTED — STEERING REVERSED' });
      }
    };
    on('sirenEffect', this._onSirenEffect);
    on('gamePaused', this._onPause);

    // Kraken boss events
    on('krakenFightStarted', d => this._showBossHUD(d));
    on('krakenHealthChanged', d => this._updateBossHP(d.hp, d.maxHP));
    on('krakenRaceTimerUpdate', d => this._updateBossTimer(d.timeRemaining));
    on('krakenWaypointProgress', d => this._updateBossWaypoints(d.current, d.total));
    on('krakenRaceStarted', d => this._onRaceStarted(d));
    on('krakenTentacleCaught', () => this._showBossBanner('TENTACLE CAUGHT!', '#00cc44'));
    on('krakenDefeated', () => this._showBossBanner('KRAKEN DEFEATED!', '#ffaa00', 5000));
    on('krakenCinematicStart', () => this._setBossTimerVisible(false));
    on('krakenCinematicEnd', () => this._setBossTimerVisible(true));
    on('goalDistanceUpdate', d => this._updateGoalDistance(d));
  }

  _updateGoalDistance(d) {
    if (!this._el) return;
    const badge = this._el.querySelector('#hud-goal-distance');
    const val = this._el.querySelector('#hud-goal-val');
    if (!badge || !val) return;
    if (d && d.distance !== undefined && d.distance > 0) {
      badge.style.display = 'block';
      val.innerText = `${Math.round(d.distance)}`;
    } else {
      badge.style.display = 'none';
    }
  }

  mount({ day, hasSirens = false, levelCfg = null } = {}) {
    if (this._el) this.unmount();

    this._hasSirens = Boolean(
      hasSirens ||
      (levelCfg?.sirens && levelCfg.sirens.length > 0)
    );
    this._score = 0;

    this._el = document.createElement('div');
    this._el.id = 'hud';
    this._el.innerHTML = `
      <!-- Floating Top-Left Nautical Status Cluster -->
      <div id="hud-status-cluster">
        <!-- Witcher 3 Style Boat Damage & Water Ingress Widget -->
        <div id="witcher-boat-widget" class="witcher-boat-widget" title="Boat Hull Damage & Water Ingress">
          <div class="witcher-boat-header">
            <div class="witcher-boat-title">Boat</div>
            <div class="witcher-boat-divider">
              <div class="witcher-divider-line">
                <div class="witcher-water-fill-bar" id="witcher-water-bar"></div>
              </div>
              <div class="witcher-divider-flame" id="witcher-divider-flame">▲</div>
            </div>
          </div>

          <div class="witcher-boat-body">
            <svg class="witcher-boat-svg" viewBox="0 0 60 120">
              <defs>
                <clipPath id="witcher-hull-clip">
                  <path d="M 30 8 C 12 25, 6 44, 6 61 C 6 78, 12 95, 30 112 C 48 95, 54 78, 54 61 C 54 44, 48 25, 30 8 Z" />
                </clipPath>
              </defs>

              <!-- 6 Segmented Compartments -->
              <!-- Bow Port (Front Left) -->
              <path id="w-seg-bow-port" class="witcher-seg" d="M 30 8 C 20 22, 16 34, 14.5 44 L 30 44 Z" />
              
              <!-- Bow Starboard (Front Right - orange in Witcher 3!) -->
              <path id="w-seg-bow-stbd" class="witcher-seg" d="M 30 8 L 30 44 L 45.5 44 C 44 34, 40 22, 30 8 Z" />
              
              <!-- Mid Port (Mid Left) -->
              <path id="w-seg-mid-port" class="witcher-seg" d="M 30 44 L 14.5 44 C 7 51, 6 61, 7 70 C 8 74, 11 77, 14.5 78 L 30 78 Z" />
              
              <!-- Mid Starboard (Mid Right) -->
              <path id="w-seg-mid-stbd" class="witcher-seg" d="M 30 44 L 30 78 L 45.5 78 C 49 77, 52 74, 53 70 C 54 61, 53 51, 45.5 44 Z" />
              
              <!-- Stern Port (Rear Left) -->
              <path id="w-seg-stern-port" class="witcher-seg" d="M 30 78 L 14.5 78 C 16 88, 20 100, 30 112 Z" />
              
              <!-- Stern Starboard (Rear Right) -->
              <path id="w-seg-stern-stbd" class="witcher-seg" d="M 30 78 L 30 112 C 40 100, 44 88, 45.5 78 Z" />

              <!-- Rising Water Overlay (clipped to interior of hull) -->
              <g clip-path="url(#witcher-hull-clip)">
                <rect id="witcher-water-fill-rect" x="0" y="112" width="60" height="0" fill="rgba(56, 189, 248, 0.45)" />
                <line id="witcher-water-line" x1="0" y1="112" x2="60" y2="112" stroke="#38bdf8" stroke-width="1.2" opacity="0" />
              </g>

              <!-- Inner Compartment Dividers -->
              <line x1="30" y1="8" x2="30" y2="112" stroke="#121418" stroke-width="1.8" />
              <line x1="14.5" y1="44" x2="45.5" y2="44" stroke="#121418" stroke-width="1.8" />
              <line x1="14.5" y1="78" x2="45.5" y2="78" stroke="#121418" stroke-width="1.8" />

              <!-- Outer Silver Hull Rim -->
              <path d="M 30 8 C 12 25, 6 44, 6 61 C 6 78, 12 95, 30 112 C 48 95, 54 78, 54 61 C 54 44, 48 25, 30 8 Z" fill="none" stroke="#cfd0d8" stroke-width="2.4" stroke-linejoin="round" />
              
              <!-- Prow & Sternpost Extensions -->
              <line x1="30" y1="3.5" x2="30" y2="8" stroke="#cfd0d8" stroke-width="2.4" stroke-linecap="round" />
              <line x1="30" y1="112" x2="30" y2="116.5" stroke="#cfd0d8" stroke-width="2.4" stroke-linecap="round" />
            </svg>
          </div>

          <!-- Subtle Status Readout (Inflow or Water %) -->
          <div id="witcher-boat-status" class="witcher-boat-status"></div>
        </div>

        <!-- Clean floating info pill: Score & Day -->
        <div class="hud-info-pill">
          <span class="hud-pill-day">Day ${day ?? 1}</span>
          <span class="hud-pill-dot"><span class="pixel-icon hud-day-pill-dot size-14"></span></span>
          <span class="hud-score-coin"><span class="pixel-icon icon-doubloon size-16"></span></span>
          <span id="hud-score-val">0</span>
        </div>
      </div>

      <!-- Dedicated Settings & Pause Trigger Button -->
      <button id="hud-btn-pause" class="hud-pause-btn" style="position: fixed; top: 14px; left: 180px; z-index: 130;" title="Game Settings & Pause (Esc)" aria-label="Game Settings and Pause">
        <span class="pixel-icon icon-settings-cog size-18"></span>
      </button>

      <!-- Safe Harbor Goal Distance -->
      <div id="hud-goal-distance" style="position:fixed; top:20px; left:50%; transform:translateX(-50%); color:#ffd700; font-family:'Trebuchet MS',sans-serif; font-weight:bold; font-size:15px; text-shadow:0 0 8px rgba(0,0,0,0.8); background:rgba(20,15,10,0.7); padding:6px 16px; border-radius:20px; border:1px solid rgba(255,215,0,0.5); display:none; pointer-events:none; z-index:90;">
        <span class="pixel-icon icon-anchor size-16"></span> Safe Harbor: <span id="hud-goal-val" style="color:#ffffff;">--</span>m
      </div>
      <div id="hud-dev-controls" style="display: ${(DEBUG || GameEnv.isDev()) ? 'block' : 'none'};">
        <div id="hud-godmode" style="margin-top: 10px; pointer-events: auto;">
          <label style="color: white; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 5px;">
            <input type="checkbox" id="chk-godmode"> God Mode (No Damage)
          </label>
        </div>
        <div id="hud-densefog" style="margin-top: 10px; pointer-events: auto;">
          <label style="color: white; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 5px;">
            <input type="checkbox" id="chk-densefog"> Dense Fog (F)
          </label>
        </div>
        <div id="hud-qte-debug" style="margin-top: 10px; pointer-events: auto;">
          <span>QTE Debug:</span>
          <button type="button" data-qte-source="shark">Harpoon</button>
          <button type="button" data-qte-source="bail">Bail</button>
          <button type="button" data-qte-source="siren">Siren</button>
          <span id="hud-qte-debug-status" aria-live="polite"></span>
        </div>
      </div>

      <!-- Non-blocking warning banner (e.g. first siren encounter) -->
      <div id="hud-banner"></div>

      <!-- Siren pull edge cues -->
      <div class="hud-siren-edge left"></div>
      <div class="hud-siren-edge right"></div>

      <!-- Floating Points Notification Container -->
      <div id="hud-bonus-container"></div>

      <!-- Dark Souls-inspired Kraken Boss HUD (slimmer, smaller, bottom of screen) -->
      <div id="hud-boss" class="dark-souls-boss-bar" style="display:none;">
        <div class="boss-decorations">
          <span class="boss-bracket left">‹</span>
          <span class="boss-title">THE ABYSSAL KRAKEN</span>
          <span class="boss-bracket right">›</span>
        </div>
        <div id="hud-boss-hp-track" class="dark-souls-hp-track">
          <div id="hud-boss-hp-bar" class="dark-souls-hp-fill"></div>
        </div>
        <div class="boss-meta-row">
          <span id="hud-boss-waypoints" style="display:none;">CHECKPOINT 0 / 3</span>
          <span id="hud-boss-timer" style="display:none;"><span class="pixel-icon icon-compass size-16"></span> 25.0s</span>
        </div>
      </div>

      <!-- Kraken Banner (flash messages) -->
      <div id="hud-boss-banner" style="display:none; position:fixed; top:40%; left:50%; transform:translate(-50%,-50%); font-size:48px; font-weight:bold; color:#00cc44; text-shadow:0 0 20px rgba(0,200,60,0.6), 0 4px 12px rgba(0,0,0,0.8); pointer-events:none; z-index:200; animation:bossBannerPop 0.4s ease-out;"></div>
      
      <!-- Steering Wheel & Pedestal -->
      <div id="hud-wheel-container">
        <img id="hud-pedestal" src="" style="display:none;" />
        <img id="hud-wheel" src="${wheelImage}">
        <div id="hud-disoriented-badge" class="hud-disoriented-badge" style="display:none;">⚠ REVERSED ⚠</div>
      </div>
    `;

    // Inject banner animation keyframes if not already present
    if (!document.getElementById('boss-banner-style')) {
      const style = document.createElement('style');
      style.id = 'boss-banner-style';
      style.textContent = `
        @keyframes bossBannerPop {
          0% { transform: translate(-50%,-50%) scale(0.3); opacity: 0; }
          60% { transform: translate(-50%,-50%) scale(1.1); opacity: 1; }
          100% { transform: translate(-50%,-50%) scale(1.0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    this._witcherWaterBar = this._el.querySelector('#witcher-water-bar');
    this._witcherWaterFill = this._el.querySelector('#witcher-water-fill-rect');
    this._witcherWaterLine = this._el.querySelector('#witcher-water-line');
    this._witcherStatus = this._el.querySelector('#witcher-boat-status');
    this._witcherFlame = this._el.querySelector('#witcher-divider-flame');
    this._hpVal = this._el.querySelector('#hud-hp-val');
    this._waterVal = this._el.querySelector('#hud-water-val');

    this._wheel = this._el.querySelector('#hud-wheel');
    this._pedestal = this._el.querySelector('#hud-pedestal');
    this._scoreEl = this._el.querySelector('#hud-score-val');
    this._bonusBoxEl = this._el.querySelector('#hud-bonus-container');

    // Unified Helm Console: docked to the wheel so steering and every QTE share one spot.
    this._helm.mount(this._el.querySelector('#hud-wheel-container'));

    this._updateEquippedAssets = () => {
      if (!window.gameState) return;
      const isCommunity = Boolean(window.gameState._isCommunityCourse || window.gameState._activeCommunityCourseCode);
      const wheelId = isCommunity ? 'wheel_default' : (window.gameState.equippedItems?.wheel || 'wheel_default');
      const pedestalId = isCommunity ? 'pedestal_lvl0' : (window.gameState.equippedItems?.pedestal || 'pedestal_lvl0');
      const wheelItem = ShopRegistry.getItem(wheelId);
      if (wheelItem && this._wheel) {
        this._wheel.src = wheelItem.icon;
      }
      const pedestalItem = ShopRegistry.getItem(pedestalId);
      if (pedestalItem && this._pedestal) {
        this._pedestal.src = pedestalItem.icon;
        this._pedestal.style.display = 'block';
      }
    };
    this._updateEquippedAssets();
    this._onEconomyUpdated = () => this._updateEquippedAssets();
    on('economyUpdated', this._onEconomyUpdated);
    on('itemsEquipped', this._onEconomyUpdated);

    // Pause / Settings trigger button
    this._el.querySelector('#hud-btn-pause')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      emit('requestPause');
    });

    // Steering Wheel Interaction
    this._wheelAngle = 0;
    this._isDraggingWheel = false;

    const getAngle = (e) => {
      const rect = this._wheel.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      return Math.atan2(e.clientY - centerY, e.clientX - centerX);
    };

    this._wheel.addEventListener('pointerdown', (e) => {
      this._isDraggingWheel = true;
      this._lastAngle = getAngle(e);
      this._wheel.style.cursor = 'grabbing';
      e.target.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    this._wheel.addEventListener('pointermove', (e) => {
      if (!this._isDraggingWheel) return;
      const currentAngle = getAngle(e);
      let diff = currentAngle - this._lastAngle;
      if (diff > Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;

      this._wheelAngle += (diff * 180 / Math.PI);
      const maxRotation = 180;
      this._wheelAngle = Math.max(-maxRotation, Math.min(maxRotation, this._wheelAngle));
      this._lastAngle = currentAngle;
    });

    const stopDragging = (e) => {
      if (!this._isDraggingWheel) return;
      this._isDraggingWheel = false;
      this._wheel.style.cursor = 'grab';
      e.target.releasePointerCapture(e.pointerId);
    };

    this._wheel.addEventListener('pointerup', stopDragging);
    this._wheel.addEventListener('pointercancel', stopDragging);

    // Siren steering pull feedback
    this._sirenSteerPull = 0;
    this._sirenIntensity = 0;
    this._sirenPullTimer = 0;

    this._onSirenPulling = (d) => {
      this._sirenSteerPull = d.steerPull ?? 0;
      this._sirenIntensity = d.intensity ?? 0;
      this._sirenPullTimer = 0.15; // decays quickly if no event this frame
    };
    on('sirenPulling', this._onSirenPulling);

    // Keyboard steering support (A / D, Left / Right)
    this._steerKeys = { left: false, right: false };
    this._onSteerKeyDown = (e) => {
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') this._steerKeys.left = true;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') this._steerKeys.right = true;
    };
    this._onSteerKeyUp = (e) => {
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') this._steerKeys.left = false;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') this._steerKeys.right = false;
    };
    window.addEventListener('keydown', this._onSteerKeyDown);
    window.addEventListener('keyup', this._onSteerKeyUp);

    // Auto-centering & emit loop
    const autoCenter = () => {
      if (!this._el) return; // Stop loop if unmounted
      if (this._steerKeys?.left) {
        this._wheelAngle = Math.max(-180, this._wheelAngle - 450 * 0.016);
      } else if (this._steerKeys?.right) {
        this._wheelAngle = Math.min(180, this._wheelAngle + 450 * 0.016);
      } else if (!this._isDraggingWheel) {
        this._wheelAngle *= 0.85; // Spring back
        if (Math.abs(this._wheelAngle) < 0.1) this._wheelAngle = 0;
      }

      // Siren hypnotic steering pull: turns the wheel or resists player drag
      if (this._sirenPullTimer > 0) {
        this._sirenPullTimer -= 0.016;
        const sirenResistance = window.gameState?.getWheelStats?.()?.sirenResistance || 0;
        const pullSpeed = (this._isDraggingWheel ? 25 : 65) * Math.max(0.1, 1 - sirenResistance);
        this._wheelAngle += this._sirenSteerPull * pullSpeed * 0.016;
        const glowAlpha = Math.min(0.9, this._sirenIntensity * 1.3).toFixed(2);
        this._wheel.style.filter = `drop-shadow(0 0 16px rgba(255, 102, 204, ${glowAlpha}))`;
      } else {
        this._sirenSteerPull = 0;
        this._sirenIntensity = 0;
        this._wheel.style.filter = '';
      }

      const maxRotation = 180;
      this._wheelAngle = Math.max(-maxRotation, Math.min(maxRotation, this._wheelAngle));
      this._wheel.style.transform = `rotate(${this._wheelAngle}deg)`;
      emit('steer', { value: this._wheelAngle / maxRotation });

      requestAnimationFrame(autoCenter);
    };
    requestAnimationFrame(autoCenter);

    const godChk = this._el.querySelector('#chk-godmode');
    if (godChk) {
      godChk.checked = window.godModeEnabled || false;
      godChk.onchange = (e) => {
        window.godModeEnabled = e.target.checked;
        emit('toggleGodMode', { enabled: e.target.checked });
      };
    }

    const fogChk = this._el.querySelector('#chk-densefog');
    if (fogChk) {
      fogChk.checked = window.denseFogEnabled || false;
      fogChk.onchange = (e) => {
        window.denseFogEnabled = e.target.checked;
        emit('toggleDenseFogUI', { enabled: e.target.checked });
      };

      this._onDenseFogChanged = (d) => {
        fogChk.checked = d.enabled;
      };
      on('denseFogChanged', this._onDenseFogChanged);
    }

    this._el.querySelectorAll('[data-qte-source]').forEach(button => {
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        emit('qteDebugTrigger', { source: button.dataset.qteSource });
      });
    });

    this._onEnvChange = ({ isDev }) => {
      const devControls = this._el?.querySelector('#hud-dev-controls');
      if (devControls) devControls.style.display = isDev ? 'block' : 'none';
    };
    on('envModeChanged', this._onEnvChange);

    document.getElementById('ui-root')?.appendChild(this._el);
  }

  unmount() {
    if (this._onEnvChange) {
      off('envModeChanged', this._onEnvChange);
      this._onEnvChange = null;
    }
    if (this._onDenseFogChanged) {
      off('denseFogChanged', this._onDenseFogChanged);
      this._onDenseFogChanged = null;
    }
    if (this._onSirenPulling) {
      off('sirenPulling', this._onSirenPulling);
      this._onSirenPulling = null;
    }
    if (this._onEconomyUpdated) {
      off('economyUpdated', this._onEconomyUpdated);
      off('itemsEquipped', this._onEconomyUpdated);
      this._onEconomyUpdated = null;
    }
    if (this._onSteerKeyDown) {
      window.removeEventListener('keydown', this._onSteerKeyDown);
      window.removeEventListener('keyup', this._onSteerKeyUp);
      this._onSteerKeyDown = null;
      this._onSteerKeyUp = null;
    }
    this._pedestal = null;
    clearInterval(this._qteTimer);
    this._helm.dispose();
    clearTimeout(this._bannerTimer);
    this._el?.remove();
    this._el = null;
    this._hpRing = null;
    this._hpBoat = null;
    this._hpVal = null;
    this._hpGauge = null;
    this._waterRing = null;
    this._waterFill = null;
    this._waterBoat = null;
    this._waterVal = null;
    this._waterGauge = null;
    this._scoreEl = null;
    this._bonusBoxEl = null;
  }

  /** Sirens no longer have their own station (they use the Helm Console); kept as level bookkeeping. */
  setSirenStationVisible(visible) {
    this._hasSirens = Boolean(visible);
  }

  _onScoreAdded({ points = 0, isPerfect = false }) {
    this._score += points;
    if (this._scoreEl) {
      this._scoreEl.textContent = this._score;
    }

    // Spawn floating "+[Number]" bonus text banner
    if (this._bonusBoxEl && points > 0) {
      const floatEl = document.createElement('div');
      floatEl.className = 'floating-bonus-text' + (isPerfect ? ' perfect' : '');
      floatEl.textContent = `+${points}`;
      this._bonusBoxEl.appendChild(floatEl);
      setTimeout(() => floatEl.remove(), 1200);
    }
  }

  _updateHP(hp, maxHP) {
    const pct = Math.max(0, Math.min(100, (hp / maxHP) * 100));
    const circ = 169.65;
    if (this._hpRing) {
      const offset = circ * (1 - pct / 100);
      this._hpRing.style.strokeDashoffset = `${offset}`;
      this._hpRing.style.stroke = pct < 25 ? '#ef4444' : pct < 50 ? '#f97316' : '#22c55e';
    }
    if (this._hpBoat) {
      // Boat tilts/capsizes up to 55 degrees as HP depletes
      const capsizeAngle = (1 - pct / 100) * 55;
      const capsizeSink = (1 - pct / 100) * 4;
      this._hpBoat.style.transform = `rotate(${capsizeAngle}deg) translateY(${capsizeSink}px)`;
    }
    if (this._hpVal) {
      this._hpVal.textContent = `${Math.floor(pct)}%`;
    }
    if (this._hpGauge) {
      this._hpGauge.classList.toggle('critical-hp', pct < 25);
    }
  }

  _updateWater(level, maxLevel, d = null) {
    const max = maxLevel || 100;
    const current = Math.max(0, Math.min(max, level || 0));
    const pct = Math.min(100, (current / max) * 100);

    // 1. Rising Water inside Witcher 3 Boat Silhouette
    if (this._witcherWaterFill) {
      // SVG hull height extends from y=8 (bow) to y=112 (stern), total height = 104
      const hVal = (pct / 100) * 104;
      const yVal = 112 - hVal;
      this._witcherWaterFill.setAttribute('y', `${yVal}`);
      this._witcherWaterFill.setAttribute('height', `${hVal}`);
    }
    if (this._witcherWaterLine) {
      const yVal = 112 - (pct / 100) * 104;
      this._witcherWaterLine.setAttribute('y1', `${yVal}`);
      this._witcherWaterLine.setAttribute('y2', `${yVal}`);
      this._witcherWaterLine.style.opacity = pct > 1.5 ? '1' : '0';
    }

    // 2. Horizontal Water Bar under "Boat"
    if (this._witcherWaterBar) {
      this._witcherWaterBar.style.width = `${pct}%`;
      this._witcherWaterBar.style.background = pct > 75 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#38bdf8';
    }

    // 3. Flame Pip & Status Readout
    if (this._witcherFlame) {
      this._witcherFlame.style.color = pct > 75 ? '#ef4444' : pct > 50 ? '#f97316' : '#eab308';
    }
    if (this._witcherStatus) {
      const flowRate = d?.flowRate || 0;
      if (pct >= 85) {
        this._witcherStatus.textContent = 'SINKING!';
        this._witcherStatus.className = 'witcher-boat-status status-critical';
      } else if (flowRate > 0) {
        this._witcherStatus.textContent = `+${flowRate.toFixed(1)} L/s`;
        this._witcherStatus.className = 'witcher-boat-status status-flooding';
      } else if (pct > 0) {
        this._witcherStatus.textContent = `${Math.floor(pct)}% Water`;
        this._witcherStatus.className = 'witcher-boat-status';
      } else {
        this._witcherStatus.textContent = '';
        this._witcherStatus.className = 'witcher-boat-status';
      }
    }

    // 4. Update the 6 Witcher 3 Segmented Compartments
    if (d) {
      this._updateWitcherSegments(d);
    }
  }

  _updateWitcherSegments(d = {}) {
    const submerged = d.compartmentFlooding || d.sectors || {};
    const total = d.compartmentDamage || d.allSectors || {};

    const segMap = {
      'bow-port': (submerged.bow_port || submerged['bow-port'] || 0),
      'bow-stbd': (submerged.bow_starboard || submerged['bow-stbd'] || 0),
      'mid-port': (submerged.mid_port || submerged['mid-port'] || submerged.port || 0),
      'mid-stbd': (submerged.mid_starboard || submerged['mid-stbd'] || submerged.starboard || 0),
      'stern-port': (submerged.stern_port || submerged['stern-port'] || 0),
      'stern-stbd': (submerged.stern_starboard || submerged['stern-stbd'] || 0),
    };

    const totalMap = {
      'bow-port': (total.bow_port || total['bow-port'] || 0),
      'bow-stbd': (total.bow_starboard || total['bow-stbd'] || 0),
      'mid-port': (total.mid_port || total['mid-port'] || total.port || (total.keel ? 1 : 0)),
      'mid-stbd': (total.mid_starboard || total['mid-stbd'] || total.starboard || (total.keel ? 1 : 0)),
      'stern-port': (total.stern_port || total['stern-port'] || 0),
      'stern-stbd': (total.stern_starboard || total['stern-stbd'] || 0),
    };

    // Generic fallback if legacy single-key 'bow' was hit
    if (total.bow && !totalMap['bow-port'] && !totalMap['bow-stbd']) {
      totalMap['bow-stbd'] = total.bow;
      if (submerged.bow) segMap['bow-stbd'] = submerged.bow;
    }
    // Generic fallback if legacy single-key 'stern' was hit
    if (total.stern && !totalMap['stern-port'] && !totalMap['stern-stbd']) {
      totalMap['stern-port'] = total.stern;
      if (submerged.stern) segMap['stern-port'] = submerged.stern;
    }

    if (d.witcherSector) {
      const wKey = d.witcherSector.replace('_', '-').replace('starboard', 'stbd');
      if (totalMap[wKey] !== undefined) {
        totalMap[wKey] = Math.max(1, totalMap[wKey] || 0);
      }
    }

    const segIds = ['bow-port', 'bow-stbd', 'mid-port', 'mid-stbd', 'stern-port', 'stern-stbd'];
    for (const key of segIds) {
      const el = this._el?.querySelector(`#w-seg-${key}`);
      if (!el) continue;
      const isSubmerged = (segMap[key] || 0) > 0;
      const isDamaged = (totalMap[key] || 0) > 0 || (this._persistedDamagedSectors?.has(key));

      el.classList.remove('seg-damaged', 'seg-flooding');
      if (isSubmerged) {
        el.classList.add('seg-flooding');
      } else if (isDamaged) {
        el.classList.add('seg-damaged');
      }
    }
  }

  _handlePlayerDamaged(d = {}) {
    if (d.witcherSector) {
      if (!this._persistedDamagedSectors) this._persistedDamagedSectors = new Set();
      const wKey = d.witcherSector.replace('_', '-').replace('starboard', 'stbd');
      this._persistedDamagedSectors.add(wKey);
    }
    this._updateWitcherSegments(d);
  }

  // -----------------------------------------------------------------------
  // Unified Helm Console (every QTE shares one unit beside the wheel)
  // -----------------------------------------------------------------------

  _showQTE(event) {
    if (!this._el) return;
    this._helm.start(event);
  }

  _queueQTE(event) {
    if (!this._el) return;
    this._helm.queue(event);
  }

  _updateQTE(event) {
    if (!this._el) return;
    this._helm.update(event);
  }

  _resolveQTE(event, result) {
    if (!this._el) return;
    if (!event?.queued) this._handleStrikeWindow({ open: false });
    this._helm.resolve(event, result);
  }

  _handleStrikeWindow({ open = false } = {}) {
    if (!this._el) return;
    const isOpen = Boolean(open);
    this._el.classList.toggle('hud-strike-open', isOpen);
    this._helm.setStrikeOpen(isOpen);
  }

  /** No duplicate text banner needed since _onScoreAdded already shows "+[Number]". */
  _showSharkConfirm() {}

  /** Non-blocking banner around the top of the screen (auto-hides after ~2 s). */
  _showBanner({ label = '' } = {}) {
    const banner = this._el?.querySelector('#hud-banner');
    if (!banner || !label) return;
    clearTimeout(this._bannerTimer);
    banner.textContent = label;
    banner.style.display = 'block';
    banner.classList.toggle('hidden', false);
    this._bannerTimer = setTimeout(() => {
      banner.classList.add('hidden');
      this._bannerTimer = setTimeout(() => { banner.style.display = 'none'; }, 260);
    }, 2000);
  }

  _showDebugQTEResult({ source, accepted }) {
    const status = this._el?.querySelector('#hud-qte-debug-status');
    if (status) status.textContent = accepted ? `${source} test accepted` : `${source} test unavailable (active/queued)`;
  }

  /** Siren pull: tint the wheel and glow the screen edge the ship is dragged toward. */
  _updateSirenPull({ intensity = 0, steerPull = 0 } = {}) {
    if (!this._el) return;
    const container = this._el.querySelector('#hud-wheel-container');
    if (container) {
      container.classList.toggle('siren-pull', intensity > 0.01);
      container.style.setProperty('--siren-pull', String(Math.min(1, intensity)));
    }
    // steerPull < 0 drags the nose screen-left; > 0 drags it screen-right.
    const side = steerPull < -0.01 ? 'left' : steerPull > 0.01 ? 'right' : null;
    this._el.querySelectorAll('.hud-siren-edge').forEach(edgeEl => {
      const active = side !== null && edgeEl.classList.contains(side) && intensity > 0.01;
      edgeEl.style.opacity = active ? String(Math.min(1, 0.35 + intensity)) : '0';
    });
  }

  // -----------------------------------------------------------------------
  // Kraken Boss HUD methods
  // -----------------------------------------------------------------------

  _showBossHUD({ totalHP, tentacleCount }) {
    if (!this._el) return;
    const bossEl = this._el.querySelector('#hud-boss');
    if (bossEl) bossEl.style.display = 'flex';
    this._bossHPBar = this._el.querySelector('#hud-boss-hp-bar');
    this._bossTimerEl = this._el.querySelector('#hud-boss-timer');
    this._bossWaypointEl = this._el.querySelector('#hud-boss-waypoints');
    this._bossBannerEl = this._el.querySelector('#hud-boss-banner');
  }

  _updateBossHP(hp, maxHP) {
    if (!this._bossHPBar) return;
    const pct = Math.max(0, Math.min(100, (hp / maxHP) * 100));
    this._bossHPBar.style.width = `${pct}%`;
  }

  _updateBossTimer(timeRemaining) {
    if (!this._bossTimerEl) return;
    const t = Math.max(0, timeRemaining);
    this._bossTimerEl.innerHTML = `<span class="pixel-icon icon-compass size-16"></span> ${t.toFixed(1)}s`;
    this._bossTimerEl.style.color = t < 5 ? '#f87171' : '#94a3b8';
    this._bossTimerEl.style.textShadow = t < 5 ? '0 0 8px rgba(248,113,113,0.5)' : 'none';
  }

  _updateBossWaypoints(current, total) {
    if (!this._bossWaypointEl) return;
    this._bossWaypointEl.textContent = `CHECKPOINT ${current} / ${total}`;
  }

  _onRaceStarted({ tentacleIdx, waypoints, timeLimit }) {
    if (!this._bossTimerEl || !this._bossWaypointEl) return;
    this._bossTimerEl.style.display = 'inline-block';
    this._bossWaypointEl.style.display = 'inline-block';
    this._bossWaypointEl.textContent = `CHECKPOINT 0 / ${waypoints}`;
  }

  _setBossTimerVisible(visible) {
    if (this._bossTimerEl) this._bossTimerEl.style.display = visible ? 'inline-block' : 'none';
    if (this._bossWaypointEl) this._bossWaypointEl.style.display = visible ? 'inline-block' : 'none';
  }

  _showBossBanner(text, color = '#00cc44', durationMs = 2000) {
    if (!this._el) return;
    const banner = this._el.querySelector('#hud-boss-banner') || this._bossBannerEl;
    if (!banner) return;

    clearTimeout(this._bossBannerTimeout);
    banner.textContent = text;
    banner.style.color = color;
    banner.style.textShadow = `0 0 20px ${color}88, 0 4px 12px rgba(0,0,0,0.8)`;
    banner.style.display = 'block';
    banner.style.animation = 'none';
    // Force reflow to restart animation
    void banner.offsetWidth;
    banner.style.animation = 'bossBannerPop 0.4s ease-out';

    this._bossBannerTimeout = setTimeout(() => {
      banner.style.display = 'none';
    }, durationMs);
  }

  teardown() {
    this.unmount();
    off('uiMount'); off('uiUnmount');
    off('playerHealth');
    off('playerWaterLevel');
    off('playerDamaged', this._onPlayerDamaged);
    off('qteStart', this._onQTEStart); off('qteUpdate', this._onQTEUpdate); off('qteQueued', this._onQTEQueued);
    off('qteSuccess', this._onQTESuccess); off('qteFail', this._onQTEFail);
    off('qteStrikeWindow', this._onQTEStrikeWindow);
    off('sirensConfigured', this._onSirensConfigured);
    off('sirenPulling', this._onSirenPull);
    off('scoreAdded', this._onScore);
    off('waterBailed');
    off('waterBailFailed');
    off('qteDebugResult');
    off('sirenEffect', this._onSirenEffect);
    off('gamePaused', this._onPause);
    off('krakenFightStarted'); off('krakenHealthChanged');
    off('krakenRaceTimerUpdate'); off('krakenWaypointProgress');
    off('krakenRaceStarted'); off('krakenTentacleCaught');
    off('krakenDefeated');
    off('krakenCinematicStart'); off('krakenCinematicEnd');
    off('playerSinkingStart', this._onShipSunk);
    off('playerSunk', this._onShipSunk);
    clearTimeout(this._bossBannerTimeout);
  }
}

import { emit, on, off } from '../core/EventBus.js';
import { GameEnv } from '../core/GameEnv.js';
import { DEBUG } from '../utils/debug.js';
import { getAssetUrl } from '../utils/paths.js';
import { ShopRegistry } from '../config/ShopRegistry.js';
import {
  QTEStationController,
  describeSweetSpotArcs,
  ratioToDialAngle,
} from './QTEStations.js';

const wheelImage = getAssetUrl('assets/wheels/wheel_threshold.png');

const DEFAULT_TIMING_ICON = '<span class="pixel-icon icon-harpoon size-16"></span>';
const CANNON_TIMING_ICON = '<span class="pixel-icon icon-swivel-cannon size-16"></span>';

/**
 * HUD — obstacle phase HUD overlay.
 *
 * Displays:
 *  - Hull HP & Water Ingress widget (top-left)
 *  - Day & Doubloon counter pill (top-left)
 *  - Three permanent, screen-anchored Nautical QTE Instrument Stations:
 *      1. Starboard Chronometer (#qte-station-timing) — HARPOON / SHOOT
 *      2. Port Bilge Pump Well (#qte-station-bail)    — BAIL
 *      3. Gunwale Siren Ward Rail (#qte-station-siren) — SIREN
 *  - Mobile Harpoon Quick Action Button (bottom-left on coarse pointers)
 *  - Cannon ammo & FIRE prompt (bottom)
 *  - On-screen Steering wheel (bottom-right)
 */
export class HUD {
  constructor() {
    this._el = null;
    this._hpBar = null;
    this._waterBar = null;
    this._stations = null;
    this._stationController = new QTEStationController();
    this._pendingQTEUpdate = null;
    this._qteFrame = null;
    this._bailCanvas = null;
    this._activeQTEInput = null;
    this._bailDrawing = false;
    this._bailPointerId = null;
    this._lastBailPoint = null;
    this._mobileBtnEl = null;
    this._scoreEl = null;
    this._bonusBoxEl = null;
    this._score = 0;
    this._qteResolveTimers = new Map();
    this._bannerTimer = null;
    this._ammoState = { ammo: 0, cannon: false };
    this._canFire = false;
    this._fireBtnEl = null;

    // Kraken boss HUD state
    this._bossHPBar = null;
    this._bossTimerEl = null;
    this._bossWaypointEl = null;
    this._bossBannerEl = null;
    this._bossBannerTimeout = null;
    this._onScore = d => this._onScoreAdded(d);
    this._onPause = ({ paused }) => { if (paused) this._cancelBailDrawing(true); };

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
    on('qteStart', this._onQTEStart);
    on('qteUpdate', this._onQTEUpdate);
    on('qteQueued', this._onQTEQueued);
    on('qteSuccess', this._onQTESuccess);
    on('qteFail', this._onQTEFail);
    on('scoreAdded', this._onScore);
    on('sharkHitConfirmed', d => this._showSharkConfirm(d));
    on('sirenWarning', d => this._showBanner(d));
    this._onSirenPull = d => { this._stationController.noteSirenPull(d); this._updateSirenPull(d); };
    on('sirenPulling', this._onSirenPull);
    on('ammoChanged', d => this._updateAmmo(d));
    on('cannonPrompt', d => this._updateCannonPrompt(d));
    on('cannonResult', d => this._showBanner({ label: d.result === 'hit' ? 'DIRECT HIT — BARREL CLEARED' : 'SHOT MISSED' }));
    on('waterBailed', d => this._showBanner({ label: `BAILED ${d.removed}% WATER — CIRCLE ${d.accuracy}%` }));
    on('waterBailFailed', () => this._showBanner({ label: 'INCOMPLETE LOOP — TRY AGAIN' }));
    on('qteDebugResult', d => this._showDebugQTEResult(d));
    this._onSirenEffect = ({ state }) => {
      if (state === 'resistant') this._showBanner({ label: 'SONG RESISTED — ESCAPE NOW' });
      else if (state === 'disoriented') this._showBanner({ label: 'DISORIENTED — STEERING REVERSED' });
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

  _cancelBailDrawing(notifyInput = false) {
    const wasDrawing = this._bailDrawing;
    const pointerId = this._bailPointerId;
    this._bailDrawing = false;
    this._bailPointerId = null;
    this._lastBailPoint = null;
    if (pointerId !== null && this._bailCanvas?.hasPointerCapture?.(pointerId)) {
      try {
        this._bailCanvas.releasePointerCapture(pointerId);
      } catch (_) {
        // Ignore if pointer capture was already released by browser
      }
    }
    if (wasDrawing && notifyInput) {
      emit('qteInput', { kind: 'drawCancel' });
    }
    this._clearBailCanvas();
  }

  mount({ day } = {}) {
    if (this._el) this.unmount();

    this._score = 0;
    const defaultArcs = describeSweetSpotArcs([0.4, 0.6]);

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
          <button type="button" data-qte-source="barrel">Shoot</button>
          <button type="button" data-qte-source="shark">Harpoon</button>
          <button type="button" data-qte-source="bail">Bail</button>
          <button type="button" data-qte-source="siren">Siren</button>
          <span id="hud-qte-debug-status" aria-live="polite"></span>
        </div>
      </div>

      <!-- Permanent Static QTE Nautical HUD Instruments -->
      <!-- 1. Starboard Chronometer Gauge (HARPOON & SHOOT) -->
      <section id="qte-station-timing" class="qte-station qte-timing-station is-idle" aria-hidden="false">
        <div class="qte-station-header">
          <span class="qte-icon">${DEFAULT_TIMING_ICON}</span>
          <span class="qte-label">DECK ORDNANCE</span>
          <span class="qte-state-pill">READY</span>
        </div>
        <div class="qte-dial" aria-label="Timing chronometer gauge">
          <svg class="qte-dial-svg" viewBox="0 0 120 68" aria-hidden="true">
            <path class="qte-dial-track-bg" d="M 14 60 A 46 46 0 0 1 106 60" />
            <line class="qte-dial-tick" x1="60" y1="9" x2="60" y2="16" />
            <line class="qte-dial-tick" x1="26" y1="26" x2="31" y2="31" />
            <line class="qte-dial-tick" x1="94" y1="26" x2="89" y2="31" />
            <line class="qte-dial-tick" x1="15" y1="45" x2="21" y2="47" />
            <line class="qte-dial-tick" x1="105" y1="45" x2="99" y2="47" />
            <path class="qte-sweet-arc" d="${defaultArcs.sweetPath}" />
            <path class="qte-perfect-arc" d="${defaultArcs.perfectPath}" />
            <circle class="qte-dial-hub" cx="60" cy="60" r="5.5" />
          </svg>
          <span class="qte-needle"></span>
        </div>
        <div class="qte-timer-track"><div class="qte-timer-fill"></div></div>
        <div class="qte-station-footer">
          <span class="qte-station-hint">STANDBY · [SPACE]</span>
          <span class="qte-result" aria-live="polite"></span>
        </div>
      </section>

      <!-- 2. Port Bilge Pump Well (BAIL) -->
      <section id="qte-station-bail" class="qte-station qte-bail-station is-idle" aria-hidden="false">
        <div class="qte-station-header">
          <span class="qte-icon"><span class="pixel-icon icon-bailer-bucket size-16"></span></span>
          <span class="qte-label">BILGE PUMP</span>
          <span class="qte-progress">DRY</span>
        </div>
        <div class="qte-bail-well">
          <canvas id="hud-qte-draw" width="220" height="220" aria-label="Draw a circle to bail water"></canvas>
          <div class="qte-bail-center-icon" aria-hidden="true">
            <span class="pixel-icon icon-bailer-bucket size-18"></span>
          </div>
        </div>
        <div class="qte-timer-track"><div class="qte-timer-fill"></div></div>
        <div class="qte-station-footer">
          <span class="qte-station-hint">STANDBY · [SPACE] 50%</span>
          <span class="qte-result" aria-live="polite"></span>
        </div>
      </section>

      <!-- 3. Gunwale Siren Ward Rail (SIREN) -->
      <section id="qte-station-siren" class="qte-station qte-siren-station is-idle side-right" aria-hidden="false">
        <div class="qte-siren-header">
          <span class="qte-siren-icon"><span class="pixel-icon icon-siren-note size-16"></span></span>
          <span class="qte-siren-title">WARD</span>
        </div>
        <div class="qte-pips" aria-label="Siren resistance progress">${'<i class="qte-pip"></i>'.repeat(8)}</div>
        <div class="qte-timer-track"><div class="qte-timer-fill"></div></div>
        <div class="qte-siren-footer">
          <span class="qte-siren-hint">CALM</span>
          <span class="qte-result" aria-live="polite"></span>
        </div>
      </section>
      <div id="qte-station-live" class="sr-only" aria-live="polite"></div>

      <!-- Dedicated Mobile Harpoon Button for left thumb -->
      <div id="hud-mobile-harpoon" style="display: none;">
        <button id="btn-mobile-harpoon" type="button" aria-label="Harpoon Action">
          <span class="harpoon-icon"><span class="pixel-icon icon-harpoon size-20"></span></span>
          <span class="harpoon-text">HARPOON</span>
        </button>
      </div>

      <!-- Non-blocking warning banner (e.g. first siren encounter) -->
      <div id="hud-banner"></div>

      <!-- Siren pull edge cues -->
      <div class="hud-siren-edge left"></div>
      <div class="hud-siren-edge right"></div>

      <!-- Floating Points Notification Container -->
      <div id="hud-bonus-container"></div>

      <div id="hud-ammo"><span class="pixel-icon icon-swivel-cannon size-18"></span> ∞</div>

      <!-- Cannon FIRE prompt (edge-triggered while a barrel is in range) -->
      <button id="hud-fire-btn" type="button" style="display: none;"><span class="pixel-icon icon-cannon-flash size-18"></span> FIRE (Space)</button>

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

    this._stations = {
      timing: this._el.querySelector('#qte-station-timing'),
      bail: this._el.querySelector('#qte-station-bail'),
      siren: this._el.querySelector('#qte-station-siren'),
      live: this._el.querySelector('#qte-station-live'),
    };
    this._bailCanvas = this._el.querySelector('#hud-qte-draw');
    this._wheel = this._el.querySelector('#hud-wheel');
    this._pedestal = this._el.querySelector('#hud-pedestal');
    this._mobileBtnEl = this._el.querySelector('#hud-mobile-harpoon');
    this._scoreEl = this._el.querySelector('#hud-score-val');
    this._bonusBoxEl = this._el.querySelector('#hud-bonus-container');

    this._clearBailCanvas();
    this._syncStationDOM('timing');
    this._syncStationDOM('bail');
    this._syncStationDOM('siren');

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

    // Direct station taps are a touch fallback; keyboard remains with QTEInputRouter.
    this._stations.timing.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this._activeQTEInput === 'timing') emit('qteInput', { kind: 'tap' });
    });
    this._stations.siren.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this._activeQTEInput === 'mash') emit('qteInput', { kind: 'tap' });
    });
    // Allow tapping the Bilge station header/footer on mobile/touch as the 50% bail assist equivalent of [SPACE]
    this._stations.bail.addEventListener('pointerdown', (e) => {
      if (this._activeQTEInput !== 'draw') return;
      if (e.target === this._bailCanvas) return;
      e.preventDefault();
      e.stopPropagation();
      emit('qteInput', { kind: 'bailAssist' });
    });

    this._bailCanvas?.addEventListener('pointerdown', event => {
      if (this._activeQTEInput !== 'draw') return;
      event.preventDefault();
      event.stopPropagation();
      const point = this._bailPoint(event);
      if (!point) return;
      this._bailDrawing = true;
      this._bailCanvas.setPointerCapture?.(event.pointerId);
      this._bailPointerId = event.pointerId;
      this._clearBailCanvas();
      this._lastBailPoint = point;
      this._drawBailTrace(point, point);
      emit('qteInput', { kind: 'drawStart', point });
    });
    this._bailCanvas?.addEventListener('pointermove', event => {
      if (!this._bailDrawing) return;
      event.preventDefault();
      const point = this._bailPoint(event);
      if (!point) return;
      const previous = this._lastBailPoint ?? point;
      this._drawBailTrace(previous, point);
      this._lastBailPoint = point;
      emit('qteInput', { kind: 'drawMove', point });
    });
    const finishBailDraw = event => {
      if (!this._bailDrawing) return;
      this._bailDrawing = false;
      this._lastBailPoint = null;
      if (this._bailCanvas.hasPointerCapture?.(event.pointerId)) {
        try {
          this._bailCanvas.releasePointerCapture(event.pointerId);
        } catch (_) {
          // Ignore if already released
        }
      }
      this._bailPointerId = null;
      if (event.type === 'pointerup') emit('qteInput', { kind: 'drawEnd' });
      else emit('qteInput', { kind: 'drawCancel' });
    };
    this._bailCanvas?.addEventListener('pointerup', finishBailDraw);
    this._bailCanvas?.addEventListener('pointercancel', finishBailDraw);

    // Tap on dedicated mobile Harpoon button
    const mobileBtn = this._el.querySelector('#btn-mobile-harpoon');
    if (mobileBtn) {
      mobileBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        emit('qteInput', { kind: 'tap' });
      });
    }

    // Cannon: the touch button starts a shot; keyboard Space is routed centrally.
    this._fireBtnEl = this._el.querySelector('#hud-fire-btn');
    this._fireBtnEl?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      emit('cannonFire');
    });

    // Pause / Settings trigger button
    this._el.querySelector('#hud-btn-pause')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      emit('requestPause');
    });

    // ammoChanged fires in _enterObstacle before uiMount — replay stored state
    this._applyAmmo();

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
    this._fireBtnEl = null;
    this._canFire = false;
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
    if (this._qteFrame) cancelAnimationFrame(this._qteFrame);
    this._qteFrame = null;
    this._pendingQTEUpdate = null;
    for (const timer of this._qteResolveTimers.values()) clearTimeout(timer);
    this._qteResolveTimers.clear();
    this._stationController = new QTEStationController();
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
    this._stations = null;
    this._bailCanvas = null;
    this._activeQTEInput = null;
    this._bailDrawing = false;
    this._bailPointerId = null;
    this._lastBailPoint = null;
    this._mobileBtnEl = null;
    this._scoreEl = null;
    this._bonusBoxEl = null;
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
  // Static QTE Nautical Instrument Stations
  // -----------------------------------------------------------------------

  _syncStationDOM(station, theme = null) {
    const el = this._stations?.[station];
    const entry = this._stationController.stations[station];
    if (!el || !entry) return;

    const classes = ['qte-station', `qte-${station}-station`, `is-${entry.state}`];
    if (station === 'siren') {
      classes.push(`side-${entry.side || 'right'}`);
    }
    if (entry.state === 'resolving' && entry.result) {
      classes.push(`result-${entry.result.toLowerCase()}`);
    }
    if (entry.queuedType && entry.state === 'active') {
      classes.push('has-queued');
    }
    el.className = classes.join(' ');
    el.setAttribute('aria-hidden', 'false');

    const resultEl = el.querySelector('.qte-result');
    const timerFill = el.querySelector('.qte-timer-fill');

    if (station === 'timing') {
      const iconEl = el.querySelector('.qte-icon');
      const labelEl = el.querySelector('.qte-label');
      const pillEl = el.querySelector('.qte-state-pill');
      const hintEl = el.querySelector('.qte-station-hint');
      const sweetArcEl = el.querySelector('.qte-sweet-arc');
      const perfectArcEl = el.querySelector('.qte-perfect-arc');

      const arcs = describeSweetSpotArcs(entry.sweetSpot ?? [0.4, 0.6]);
      if (sweetArcEl) sweetArcEl.setAttribute('d', arcs.sweetPath);
      if (perfectArcEl) perfectArcEl.setAttribute('d', arcs.perfectPath);

      if (entry.state === 'active') {
        const defaultIcon = entry.type === 'SHOOT' ? CANNON_TIMING_ICON : DEFAULT_TIMING_ICON;
        const defaultColor = entry.type === 'SHOOT' ? '#ff9800' : '#00bcd4';
        el.style.setProperty('--qte-theme', theme?.color ?? defaultColor);
        if (iconEl) iconEl.innerHTML = theme?.icon ?? defaultIcon;
        if (labelEl) labelEl.textContent = entry.label || (entry.type === 'SHOOT' ? 'CANNON' : 'HARPOON');
        if (pillEl) pillEl.textContent = entry.queuedType ? 'LOCK+1' : 'LOCKED';
        if (hintEl) hintEl.textContent = 'TAP / [SPACE] IN ZONE';
        if (resultEl) resultEl.textContent = '';
      } else if (entry.state === 'queued') {
        const queuedIcon = entry.type === 'SHOOT' ? CANNON_TIMING_ICON : DEFAULT_TIMING_ICON;
        if (iconEl) iconEl.innerHTML = theme?.icon ?? queuedIcon;
        if (labelEl) labelEl.textContent = entry.label || 'INCOMING';
        if (pillEl) pillEl.textContent = 'QUEUED';
        if (hintEl) hintEl.textContent = 'LOCKING TARGET...';
        if (resultEl) resultEl.textContent = '';
        el.style.setProperty('--qte-needle', '-90deg');
      } else if (entry.state === 'resolving') {
        if (pillEl) pillEl.textContent = entry.result || '';
        if (resultEl) {
          resultEl.textContent = entry.points > 0
            ? `+${entry.points}`
            : (entry.result ? `${entry.result}!` : '');
        }
      } else {
        el.style.setProperty('--qte-theme', '#d7b35a');
        el.style.setProperty('--qte-needle', '-90deg');
        if (iconEl) iconEl.innerHTML = DEFAULT_TIMING_ICON;
        if (labelEl) labelEl.textContent = 'ORDNANCE';
        if (pillEl) pillEl.textContent = 'READY';
        if (hintEl) hintEl.textContent = 'STANDBY · TAP / [SPACE]';
        if (resultEl) resultEl.textContent = '';
        if (timerFill) timerFill.style.width = '100%';
      }
    } else if (station === 'bail') {
      const labelEl = el.querySelector('.qte-label');
      const progressEl = el.querySelector('.qte-progress');
      const hintEl = el.querySelector('.qte-station-hint');

      if (entry.state === 'active') {
        if (labelEl) labelEl.textContent = entry.label || 'BAIL!';
        if (progressEl) progressEl.textContent = '0%';
        if (hintEl) hintEl.textContent = 'TRACE RING · TAP BAR 50%';
        if (resultEl) resultEl.textContent = '';
      } else if (entry.state === 'queued') {
        if (labelEl) labelEl.textContent = 'BILGE PUMP';
        if (progressEl) progressEl.textContent = 'QUEUED';
        if (hintEl) hintEl.textContent = 'PUMP PRIMING...';
        if (resultEl) resultEl.textContent = '';
      } else if (entry.state === 'resolving') {
        if (progressEl) progressEl.textContent = entry.result || '';
        if (resultEl) resultEl.textContent = entry.result ? `${entry.result}!` : '';
      } else {
        if (labelEl) labelEl.textContent = 'BILGE PUMP';
        if (progressEl) progressEl.textContent = 'DRY';
        if (hintEl) hintEl.textContent = 'STANDBY · TRACE / [SPACE]';
        if (resultEl) resultEl.textContent = '';
        if (timerFill) timerFill.style.width = '100%';
      }
    } else if (station === 'siren') {
      const titleEl = el.querySelector('.qte-siren-title');
      const hintEl = el.querySelector('.qte-siren-hint');

      if (entry.state === 'active') {
        if (titleEl) titleEl.textContent = 'RESIST!';
        if (hintEl) hintEl.textContent = 'TAP / [SPACE]';
        if (resultEl) resultEl.textContent = '';
      } else if (entry.state === 'queued') {
        if (titleEl) titleEl.textContent = 'SIREN';
        if (hintEl) hintEl.textContent = 'QUEUED';
        if (resultEl) resultEl.textContent = '';
      } else if (entry.state === 'resolving') {
        if (hintEl) hintEl.textContent = entry.result || '';
        if (resultEl) resultEl.textContent = entry.result ? `${entry.result}!` : '';
      } else {
        if (titleEl) titleEl.textContent = 'WARD';
        if (hintEl) hintEl.textContent = 'CALM';
        if (resultEl) resultEl.textContent = '';
        if (timerFill) timerFill.style.width = '100%';
        el.querySelectorAll('.qte-pips i').forEach(pip => pip.classList.remove('filled'));
      }
    }
  }

  _showQTE(event) {
    if (!this._stations) return;
    const prevActive = this._stationController._active;
    const station = this._stationController.start(event);
    if (!station) return;

    if (prevActive && prevActive !== station) {
      clearTimeout(this._qteResolveTimers.get(prevActive));
      this._syncStationDOM(prevActive);
    }

    clearTimeout(this._qteResolveTimers.get(station));
    this._activeQTEInput = event.input;
    this._syncStationDOM(station, event.theme);

    if (station === 'bail') {
      this._clearBailCanvas();
    }
    if (station === 'siren') {
      this._stations.siren.querySelectorAll('.qte-pips i').forEach(pip => pip.classList.remove('filled'));
    }
    if (this._stations.live) {
      this._stations.live.textContent = event.prompt ?? event.label ?? '';
    }

    const mobileLabel = this._el?.querySelector('.harpoon-text');
    if (mobileLabel) mobileLabel.textContent = event.input === 'mash' ? 'TAP!' : 'STRIKE';
    const isCoarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const showMobileBtn = event.input !== 'draw' && isCoarsePointer;
    if (this._mobileBtnEl) {
      this._mobileBtnEl.style.display = showMobileBtn ? 'block' : 'none';
    }
    if (this._stations.bail) {
      this._stations.bail.classList.toggle('touch-subdued', showMobileBtn);
    }
  }

  _queueQTE(event) {
    if (!this._stations) return;
    const station = this._stationController.queue(event);
    const targetStation = station ?? (event?.type === 'SHOOT' || event?.type === 'HARPOON' ? 'timing' : null);
    if (targetStation) {
      this._syncStationDOM(targetStation, event?.theme);
    }
  }

  _updateQTE(event) {
    this._pendingQTEUpdate = event;
    if (this._qteFrame) return;
    this._qteFrame = requestAnimationFrame(() => {
      this._qteFrame = null;
      if (this._pendingQTEUpdate) {
        this._renderQTEUpdate(this._pendingQTEUpdate);
      }
    });
  }

  _renderQTEUpdate({ input, windowMs, remainingMs, progress, drawProgress }) {
    const station = input === 'draw' ? 'bail' : input === 'mash' ? 'siren' : 'timing';
    const el = this._stations?.[station];
    const entry = this._stationController.stations[station];
    if (!el || entry?.state !== 'active') return;

    const safeWindow = Math.max(1, windowMs || 1);
    const remRatio = Math.max(0, Math.min(1, (remainingMs ?? 0) / safeWindow));
    const elapsedRatio = 1 - remRatio;

    const timerFill = el.querySelector('.qte-timer-fill');
    if (timerFill) {
      timerFill.style.width = `${(remRatio * 100).toFixed(1)}%`;
    }

    if (input === 'timing') {
      const angle = ratioToDialAngle(elapsedRatio);
      el.style.setProperty('--qte-needle', `${angle.toFixed(2)}deg`);
      const [start, end] = entry.sweetSpot ?? [0.4, 0.6];
      const inSweetSpot = elapsedRatio >= start && elapsedRatio <= end;
      el.classList.toggle('in-sweet-spot', inSweetSpot);
    } else if (input === 'mash') {
      el.querySelectorAll('.qte-pips i').forEach((pip, index) => {
        pip.classList.toggle('filled', index < (progress ?? 0));
      });
    } else if (input === 'draw') {
      const pct = Math.round((drawProgress ?? 0) * 100);
      const progressEl = el.querySelector('.qte-progress');
      if (progressEl) progressEl.textContent = `${pct}%`;
    }
  }

  _resolveQTE(event, result) {
    if (!this._stations) return;
    const station = this._stationController.resolve(event, result);
    if (!station) return;

    if (event?.queued) {
      this._syncStationDOM(station);
      return;
    }

    if (station === 'bail') {
      this._cancelBailDrawing(false);
    }

    if (!this._stationController._active) {
      if (this._qteFrame) {
        cancelAnimationFrame(this._qteFrame);
        this._qteFrame = null;
      }
      this._pendingQTEUpdate = null;
      this._activeQTEInput = null;
      if (this._mobileBtnEl) this._mobileBtnEl.style.display = 'none';
      if (this._stations.bail) this._stations.bail.classList.remove('touch-subdued');
    }

    this._syncStationDOM(station);
    const resolveSeq = this._stationController.stations[station].seq;
    clearTimeout(this._qteResolveTimers.get(station));
    this._qteResolveTimers.set(station, setTimeout(() => {
      if (this._stationController.finishResolve(station, resolveSeq)) {
        this._syncStationDOM(station);
      }
    }, 520));
  }

  _bailPoint(event) {
    const rect = this._bailCanvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    return x < 0 || x > 1 || y < 0 || y > 1 ? null : { x, y };
  }

  _clearBailCanvas() {
    if (!this._bailCanvas) return;
    const context = this._bailCanvas.getContext('2d');
    if (!context) return;
    const { width, height } = this._bailCanvas;
    const cx = width / 2;
    const cy = height / 2;
    const r = width * 0.38;

    context.clearRect(0, 0, width, height);

    // Subtle dark-water well ring
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.strokeStyle = 'rgba(117, 217, 236, 0.18)';
    context.lineWidth = 14;
    context.stroke();

    // Dashed brass guide circle
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.strokeStyle = 'rgba(243, 227, 180, 0.72)';
    context.lineWidth = 2.5;
    context.setLineDash([7, 7]);
    context.stroke();
    context.setLineDash([]);
  }

  _drawBailTrace(from, to) {
    if (!this._bailCanvas) return;
    const context = this._bailCanvas.getContext('2d');
    if (!context) return;
    context.beginPath();
    context.moveTo(from.x * this._bailCanvas.width, from.y * this._bailCanvas.height);
    context.lineTo(to.x * this._bailCanvas.width, to.y * this._bailCanvas.height);
    context.strokeStyle = '#75d9ec';
    context.lineWidth = 6;
    context.lineCap = 'round';
    context.stroke();
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

  /** Cannon ammo pill: real count on cannon days, ∞ placeholder on day 1. */
  _updateAmmo({ ammo = 0, cannon = false } = {}) {
    const spentLastShell = this._ammoState.cannon && this._ammoState.ammo > 0 && cannon && ammo === 0;
    this._ammoState = { ammo, cannon };
    this._applyAmmo();
    if (spentLastShell) this._showBanner({ label: 'LAST SHELL FIRED — CANNON EMPTY' });
  }

  _applyAmmo() {
    const el = this._el?.querySelector('#hud-ammo');
    if (el) el.innerHTML = this._ammoState.cannon ? `<span class="pixel-icon icon-swivel-cannon size-18"></span> ${this._ammoState.ammo}` : '<span class="pixel-icon icon-swivel-cannon size-18"></span> ∞';
  }

  /** Toggle the FIRE prompt; Space fires only while it is visible. */
  _updateCannonPrompt({ canFire = false } = {}) {
    this._canFire = canFire;
    if (this._fireBtnEl) this._fireBtnEl.style.display = canFire ? 'block' : 'none';
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
    off('sirenPulling', this._onSirenPull);
    off('scoreAdded', this._onScore);
    off('ammoChanged');
    off('cannonPrompt');
    off('cannonResult');
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
    clearTimeout(this._bossBannerTimeout);
  }
}

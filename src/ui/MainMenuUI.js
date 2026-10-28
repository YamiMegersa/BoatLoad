import { on, emit } from '../core/EventBus.js';
import { GameEnv } from '../core/GameEnv.js';
import { LevelConfig } from '../core/LevelConfig.js';

/**
 * Procedural Web Audio synthesizer for nautical & pirate UI sound effects.
 * Requires no external audio files.
 */
class PirateAudio {
  constructor() {
    this._ctx = null;
    this._ambienceNode = null;
    this._ambienceGain = null;
    this.isAmbienceOn = false;

    // Safely resume AudioContext on user interaction to comply with autoplay policy
    const unlock = () => {
      if (this._ctx && this._ctx.state === 'suspended') {
        this._ctx.resume().catch(() => {});
      }
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  _initContext() {
    if (!this._ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this._ctx = new AudioCtx();
    }
    if (this._ctx && this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }
  }

  /**
   * Short wooden plank tap / coin click
   */
  playClick() {
    try {
      this._initContext();
      if (!this._ctx || this._ctx.state !== 'running') return;
      const osc = this._ctx.createOscillator();
      const gain = this._ctx.createGain();
      const filter = this._ctx.createBiquadFilter();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, this._ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, this._ctx.currentTime + 0.08);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, this._ctx.currentTime);

      gain.gain.setValueAtTime(0.25, this._ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + 0.08);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this._ctx.destination);

      osc.start();
      osc.stop(this._ctx.currentTime + 0.08);
    } catch (_) {}
  }

  /**
   * Resonant ship bell / triumphant gong for Setting Sail
   */
  playSetSail() {
    try {
      this._initContext();
      if (!this._ctx) return;
      const now = this._ctx.currentTime;
      
      // Dual-tone harmonic bell
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = this._ctx.createOscillator();
        const gain = this._ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.2 / (idx + 1), now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

        osc.connect(gain);
        gain.connect(this._ctx.destination);

        osc.start(now);
        osc.stop(now + 1.8);
      });
    } catch (_) {}
  }

  /**
   * Toggle procedural ocean waves & wind wash
   */
  toggleAmbience() {
    this._initContext();
    if (!this._ctx) return false;

    if (this.isAmbienceOn) {
      if (this._ambienceGain) {
        this._ambienceGain.gain.linearRampToValueAtTime(0.001, this._ctx.currentTime + 0.5);
        setTimeout(() => {
          this._ambienceNode?.stop();
          this._ambienceNode?.disconnect();
          this._ambienceNode = null;
        }, 500);
      }
      this.isAmbienceOn = false;
      return false;
    }

    try {
      // 3-second noise buffer
      const bufferSize = this._ctx.sampleRate * 3;
      const noiseBuffer = this._ctx.createBuffer(1, bufferSize, this._ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = this._ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      // Lowpass filter oscillating to mimic waves rolling in and out
      const filter = this._ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(260, this._ctx.currentTime);

      const lfo = this._ctx.createOscillator();
      lfo.frequency.setValueAtTime(0.18, this._ctx.currentTime); // ~5.5s wave period
      const lfoGain = this._ctx.createGain();
      lfoGain.gain.setValueAtTime(140, this._ctx.currentTime);
      lfo.connect(filter.frequency);

      const gain = this._ctx.createGain();
      gain.gain.setValueAtTime(0.001, this._ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.18, this._ctx.currentTime + 1.0);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(this._ctx.destination);

      whiteNoise.start();
      lfo.start();

      this._ambienceNode = whiteNoise;
      this._ambienceGain = gain;
      this.isAmbienceOn = true;
      return true;
    } catch (_) {
      return false;
    }
  }
}

export class MainMenuUI {
  constructor() {
    this._audio = new PirateAudio();
    this._el = document.createElement('div');
    this._el.className = 'main-menu-overlay';
    this._el.style.display = 'none';

    this._el.innerHTML = `
      <div class="main-menu-plaque">
        <!-- Brass corner decorations -->
        <div class="plaque-corner top-left"></div>
        <div class="plaque-corner top-right"></div>
        <div class="plaque-corner bottom-left"></div>
        <div class="plaque-corner bottom-right"></div>

        <!-- Brass Rivets -->
        <div class="rivet tl"></div>
        <div class="rivet tr"></div>
        <div class="rivet bl"></div>
        <div class="rivet br"></div>

        <!-- Pirate Crest: Ship's Wheel, Skull & Cutlasses -->
        <div class="main-menu-crest">
          <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#fff5cc" />
                <stop offset="40%" stop-color="#f5c242" />
                <stop offset="75%" stop-color="#bd8218" />
                <stop offset="100%" stop-color="#694005" />
              </linearGradient>
              <radialGradient id="brassHub" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#ffeaa7" />
                <stop offset="60%" stop-color="#d49b29" />
                <stop offset="100%" stop-color="#422502" />
              </radialGradient>
            </defs>

            <!-- Crossed Cutlasses Background -->
            <path d="M18 82 C35 65 65 35 82 18 C83 17 85 19 83 22 C67 38 38 67 22 83 Z" fill="url(#goldGrad)" opacity="0.85" />
            <path d="M82 82 C65 65 35 35 18 18 C17 17 19 15 22 17 C38 33 67 62 83 78 Z" fill="url(#goldGrad)" opacity="0.85" />
            <!-- Cutlass Hilts & Guards -->
            <circle cx="18" cy="82" r="5" fill="#ffd700" />
            <circle cx="82" cy="82" r="5" fill="#ffd700" />
            <rect x="20" y="74" width="8" height="3" transform="rotate(-45 20 74)" fill="#ffd700" />
            <rect x="76" y="78" width="8" height="3" transform="rotate(45 76 78)" fill="#ffd700" />

            <!-- Ship's Helm Wheel -->
            <!-- Outer Ring -->
            <circle cx="50" cy="50" r="32" stroke="url(#goldGrad)" stroke-width="4.5" fill="none" />
            <circle cx="50" cy="50" r="23" stroke="url(#goldGrad)" stroke-width="2.5" fill="none" opacity="0.9" />

            <!-- 8 Wheel Handles (Spokes extending outward) -->
            <line x1="50" y1="18" x2="50" y2="7" stroke="url(#goldGrad)" stroke-width="3.5" stroke-linecap="round" />
            <line x1="50" y1="82" x2="50" y2="93" stroke="url(#goldGrad)" stroke-width="3.5" stroke-linecap="round" />
            <line x1="18" y1="50" x2="7" y2="50" stroke="url(#goldGrad)" stroke-width="3.5" stroke-linecap="round" />
            <line x1="82" y1="50" x2="93" y2="50" stroke="url(#goldGrad)" stroke-width="3.5" stroke-linecap="round" />
            <line x1="27" y1="27" x2="19" y2="19" stroke="url(#goldGrad)" stroke-width="3.5" stroke-linecap="round" />
            <line x1="73" y1="73" x2="81" y2="81" stroke="url(#goldGrad)" stroke-width="3.5" stroke-linecap="round" />
            <line x1="73" y1="27" x2="81" y2="19" stroke="url(#goldGrad)" stroke-width="3.5" stroke-linecap="round" />
            <line x1="27" y1="73" x2="19" y2="81" stroke="url(#goldGrad)" stroke-width="3.5" stroke-linecap="round" />

            <!-- Internal Wheel Spokes -->
            <line x1="50" y1="27" x2="50" y2="73" stroke="url(#goldGrad)" stroke-width="2.5" />
            <line x1="27" y1="50" x2="73" y2="50" stroke="url(#goldGrad)" stroke-width="2.5" />
            <line x1="34" y1="34" x2="66" y2="66" stroke="url(#goldGrad)" stroke-width="2" />
            <line x1="66" y1="34" x2="34" y2="66" stroke="url(#goldGrad)" stroke-width="2" />

            <!-- Center Brass Hub -->
            <circle cx="50" cy="50" r="14" fill="url(#brassHub)" stroke="#ffe680" stroke-width="1.5" />

            <!-- Pirate Skull / Anchor Medallion in Center -->
            <path d="M46 44 C46 41 54 41 54 44 C55 47 54 49 53 50 L53 53 L47 53 L47 50 C46 49 45 47 46 44 Z" fill="#201108" />
            <circle cx="48" cy="45" r="1.2" fill="#ffe680" />
            <circle cx="52" cy="45" r="1.2" fill="#ffe680" />
            <line x1="48" y1="52" x2="52" y2="52" stroke="#ffe680" stroke-width="0.8" />
            <path d="M44 54 C48 57 52 57 56 54" stroke="#ffe680" stroke-width="1.2" stroke-linecap="round" fill="none" />
          </svg>
        </div>

        <!-- Game Title -->
        <h1 class="main-menu-title">BoatLoad</h1>

        <!-- Subtitle Ribbon -->
        <div class="main-menu-ribbon">
          <span class="pixel-icon icon-anchor size-18"></span>
          <span class="main-menu-subtitle">Shipwreck &amp; Sail</span>
          <span class="pixel-icon icon-anchor size-18"></span>
        </div>

        <!-- Interactive Navigation Buttons -->
        <div class="main-menu-actions">
          <button class="pirate-btn primary" id="btn-menu-sail">
            <span class="pixel-icon icon-helm-wheel size-20"></span> Play / Select Level
          </button>

          <button class="pirate-btn" id="btn-menu-community" style="border-color: #ffd700; color: #ffd700;">
            <span class="pixel-icon icon-anchor size-18"></span> Community Courses (Course World)
          </button>

          <button class="pirate-btn" id="btn-menu-codex">
            <span class="pixel-icon icon-closed-logbook size-20"></span> Captain's Codex
          </button>

          <div id="menu-dev-shortcuts" style="display: ${GameEnv.isDev() ? 'flex' : 'none'}; flex-direction: column; gap: 8px; margin-top: 6px; border-top: 1px dashed rgba(212, 175, 55, 0.4); padding-top: 8px;">
            <div style="font-size: 11px; color: #ffd700; text-transform: uppercase; letter-spacing: 1px; font-weight: bold; text-align: center;">Dev Fast-Travel (mode=dev)</div>
            <div class="menu-btn-grid">
              <button class="pirate-btn" id="btn-menu-shipyard">
                <span class="pixel-icon icon-hammer size-18"></span> Dry Dock
              </button>
              <button class="pirate-btn" id="btn-menu-sailing">
                <span class="pixel-icon icon-ocean-wave size-18"></span> High Seas
              </button>
            </div>
            <button class="pirate-btn" id="btn-menu-editor" style="width: 100%;">
              <span class="pixel-icon icon-map-maker-scroll size-18"></span> Map Maker / Level Editor
            </button>
          </div>
        </div>

        <!-- Footer Utilities -->
        <div class="main-menu-footer">
          <button class="menu-util-btn" id="btn-menu-audio">
            <span class="pixel-icon icon-ocean-wave size-16"></span> Ocean Audio: OFF
          </button>
          <button class="menu-util-btn" id="btn-menu-settings">
            <span class="pixel-icon icon-settings-cog size-16"></span> Settings
          </button>
          <span class="menu-version">v1.0 • ${GameEnv.isDev() ? 'DEV SUITE' : 'DEMO EDITION'}</span>
          <button class="menu-util-btn" id="btn-menu-fullscreen">
            <span class="pixel-icon icon-fullscreen-expand size-16"></span> Fullscreen
          </button>
        </div>
      </div>

      <!-- Level Selector Parchment Modal -->
      <div class="codex-modal-overlay" id="level-modal" style="display: none;">
        <div class="codex-scroll" style="width: 700px; max-width: 92vw;">
          <div class="codex-header">
            <h2>Chart Your Course</h2>
            <p>~ Select a Maritime Voyage &amp; Report to the Dock ~</p>
          </div>

          <div class="level-cards-list" style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
            <div class="level-card" data-day="1" style="padding: 12px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s;">
              <div>
                <h3 style="margin: 0 0 4px; font-size: 19px;">Day 1: Calm Shallows</h3>
                <div style="font-size: 13px;">Vessel: <strong><span class="pixel-icon icon-sloop size-16"></span> Standard Sloop</strong> • Weather: Sunny &amp; Mild</div>
                <div style="font-size: 12px; margin-top: 3px; opacity: 0.85;">First port of call. Patch hull breach and set sail across gentle swells.</div>
              </div>
              <button class="pirate-btn" style="padding: 8px 14px; font-size: 14px; pointer-events: none;">Embark <span class="pixel-icon icon-arrow-right size-14"></span></button>
            </div>

            <div class="level-card" data-day="2" style="padding: 12px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s;">
              <div>
                <h3 style="margin: 0 0 4px; font-size: 19px;">Day 2: Siren's Whisper</h3>
                <div style="font-size: 13px;">Vessel: <strong><span class="pixel-icon icon-sloop size-16"></span> Standard Sloop</strong> • Weather: Overcast &amp; Swell</div>
                <div style="font-size: 12px; margin-top: 3px; opacity: 0.85;">Enchanting sirens dwell along the jagged reefs. Steer clear of hypnotic waters!</div>
              </div>
              <button class="pirate-btn" style="padding: 8px 14px; font-size: 14px; pointer-events: none;">Embark <span class="pixel-icon icon-arrow-right size-14"></span></button>
            </div>

            <div class="level-card" data-day="3" style="padding: 12px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s;">
              <div>
                <h3 style="margin: 0 0 4px; font-size: 19px;">Day 3: Sunset Passage</h3>
                <div style="font-size: 13px;">Vessel: <strong><span class="pixel-icon icon-sloop size-16"></span> Standard Sloop</strong> • Weather: Golden Hour Twilight</div>
                <div style="font-size: 12px; margin-top: 3px; opacity: 0.85;">Narrow coral channels under blinding amber rays. Navigate with vigilance.</div>
              </div>
              <button class="pirate-btn" style="padding: 8px 14px; font-size: 14px; pointer-events: none;">Embark <span class="pixel-icon icon-arrow-right size-14"></span></button>
            </div>

            <div class="level-card" data-day="4" style="padding: 12px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s;">
              <div>
                <h3 style="margin: 0 0 4px; font-size: 19px;">Day 4: Rolling Tempest</h3>
                <div style="font-size: 13px;">Vessel: <strong><span class="pixel-icon icon-sloop size-16"></span> Standard Sloop</strong> • Weather: Squalls &amp; Heavy Rain</div>
                <div style="font-size: 12px; margin-top: 3px; opacity: 0.85;">High rolling waves and crosswinds challenge your ship's structural balance.</div>
              </div>
              <button class="pirate-btn" style="padding: 8px 14px; font-size: 14px; pointer-events: none;">Embark <span class="pixel-icon icon-arrow-right size-14"></span></button>
            </div>

            <div class="level-card" data-day="5" style="padding: 12px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s;">
              <div>
                <h3 style="margin: 0 0 4px; font-size: 19px;">Day 5: The Kraken's Maw</h3>
                <div style="font-size: 13px;">Vessel: <strong><span class="pixel-icon icon-sloop size-16"></span> Standard Sloop</strong> • Weather: Boss Encounter</div>
                <div style="font-size: 12px; margin-top: 3px; opacity: 0.85;">The ancient sea monster awakens. Lure its deadly tentacles through the waypoint gates!</div>
              </div>
              <button class="pirate-btn" style="padding: 8px 14px; font-size: 14px; pointer-events: none;">Embark <span class="pixel-icon icon-arrow-right size-14"></span></button>
            </div>

            <div class="level-card" data-day="6" style="padding: 12px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s;">
              <div>
                <h3 style="margin: 0 0 4px; font-size: 19px;">Day 6: Ironclad Minefield</h3>
                <div style="font-size: 13px;">Vessel: <strong><span class="pixel-icon icon-sloop size-16"></span> Standard Sloop</strong> • Weather: Dense Marine Fog</div>
                <div style="font-size: 12px; margin-top: 3px; opacity: 0.85;">Explosive barrels adrift in the shoals. Use bow lanterns to spot detonators in time.</div>
              </div>
              <button class="pirate-btn" style="padding: 8px 14px; font-size: 14px; pointer-events: none;">Embark <span class="pixel-icon icon-arrow-right size-14"></span></button>
            </div>

            <div class="level-card" data-day="7" style="padding: 12px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s;">
              <div>
                <h3 style="margin: 0 0 4px; font-size: 19px;">Day 7: The Final Gauntlet</h3>
                <div style="font-size: 13px;">Vessel: <strong><span class="pixel-icon icon-sloop size-16"></span> Standard Sloop</strong> • Weather: Full Hurricane Gale</div>
                <div style="font-size: 12px; margin-top: 3px; opacity: 0.85;">Every maritime peril combined. Only the finest shipwright and helmsman survives.</div>
              </div>
              <button class="pirate-btn" style="padding: 8px 14px; font-size: 14px; pointer-events: none;">Embark <span class="pixel-icon icon-arrow-right size-14"></span></button>
            </div>
          </div>

          <button class="codex-close-btn" id="btn-close-level-modal">Return to Port</button>
        </div>
      </div>

      <!-- Captain's Codex Parchment Modal -->
      <div class="codex-modal-overlay" id="codex-modal" style="display: none;">
        <div class="codex-scroll">
          <div class="codex-header">
            <h2>The Shipwright's Codex</h2>
            <p>~ Essential Guidance for Maritime Survival ~</p>
          </div>

          <div class="codex-section">
            <h3><span class="pixel-icon icon-hammer size-20"></span> Phase I: Dry Dock &amp; Repairs</h3>
            <p>Every battered vessel arrives with breached oak planks and fractured hulls. Consult the docket to determine essential repairs:</p>
            <ul>
              <li><strong>Place Blocks:</strong> <span class="codex-key">Left Click</span> with selected voxel material.</li>
              <li><strong>Remove Debris:</strong> <span class="codex-key">Right Click</span> to strip away rotted or surplus wood.</li>
              <li><strong>Rotate Blueprints:</strong> Press <span class="codex-key">R</span> to align multi-voxel structures.</li>
            </ul>
          </div>

          <div class="codex-section">
            <h3><span class="pixel-icon icon-helm-wheel size-20"></span> Phase II: High Seas Gauntlet</h3>
            <p>Once seaworthy, guide your vessel safely through hazardous waters toward safe harbor:</p>
            <ul>
              <li><strong>Helm Steering:</strong> Use <span class="codex-key">A</span> / <span class="codex-key">D</span> or <span class="codex-key">←</span> / <span class="codex-key">→</span> to tack against wind and waves.</li>
              <li><strong>Dense Sea Fog:</strong> Press <span class="codex-key">F</span> to light your bow lanterns and pierce blinding mists.</li>
              <li><strong>Hazard Avoidance:</strong> Steer clear of jagged coral reefs, explosive mines, and prowling predators!</li>
              <li><strong>Floating Cargo:</strong> Sail directly through floating treasure barrels to recover lost plunder.</li>
            </ul>
          </div>

          <div class="codex-section">
            <h3><span class="pixel-icon icon-map-maker-scroll size-20"></span> Phase III: Map Maker</h3>
            <p>Design custom maritime obstacle routes, place coral archipelagos, drop cargo, and test your own challenges directly in the level editor.</p>
          </div>

          <button class="codex-close-btn" id="btn-close-codex">Aye, Captain! Return to Menu</button>
        </div>
      </div>
    `;

    this._bindEvents();

    on('uiMount', (d) => {
      if (d.screen === 'main-menu') {
        this.mount();
      }
    });

    on('uiUnmount', (d) => {
      if (d.screen === 'main-menu') {
        this.unmount();
      }
    });
  }

  _bindEvents() {
    // Button click sounds & routing
    const bindBtn = (id, action) => {
      const btn = this._el.querySelector(id);
      if (!btn) return;
      btn.addEventListener('mouseenter', () => this._audio.playClick());
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._audio.playClick();
        action();
      });
    };

    // Level Selector Modal & Primary CTA
    const levelModal = this._el.querySelector('#level-modal');
    const sailBtn = this._el.querySelector('#btn-menu-sail');
    if (sailBtn) {
      sailBtn.addEventListener('mouseenter', () => this._audio.playClick());
      sailBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._audio.playClick();
        if (levelModal) levelModal.style.display = 'flex';
      });
    }

    bindBtn('#btn-close-level-modal', () => {
      if (levelModal) levelModal.style.display = 'none';
    });

    if (levelModal) {
      levelModal.addEventListener('click', (e) => {
        if (e.target === levelModal) {
          levelModal.style.display = 'none';
        }
      });
    }

    // Level card selection
    this._el.querySelectorAll('.level-card').forEach(card => {
      card.addEventListener('mouseenter', () => {
        card.style.background = 'rgba(140, 95, 45, 0.35)';
        card.style.borderColor = '#ffd700';
        this._audio.playClick();
      });
      card.addEventListener('mouseleave', () => {
        card.style.background = 'rgba(80, 50, 20, 0.15)';
        card.style.borderColor = '#9c6b3c';
      });
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        const day = parseInt(card.dataset.day, 10) || 1;
        this._audio.playSetSail();
        if (levelModal) levelModal.style.display = 'none';
        emit('requestPhaseChange', { phase: 'DOCK', day });
      });
    });

    bindBtn('#btn-menu-shipyard', () => {
      emit('requestPhaseChange', { phase: 'SHIPYARD' });
    });

    bindBtn('#btn-menu-sailing', () => {
      emit('requestPhaseChange', { phase: 'OBSTACLE' });
    });

    bindBtn('#btn-menu-editor', () => {
      emit('requestPhaseChange', { phase: 'EDITOR' });
    });

    bindBtn('#btn-menu-community', () => {
      emit('uiMount', { screen: 'community' });
    });

    // Env mode changed handler
    on('envModeChanged', ({ isDev }) => {
      const devShortcuts = this._el.querySelector('#menu-dev-shortcuts');
      if (devShortcuts) devShortcuts.style.display = isDev ? 'flex' : 'none';
      const versionBadge = this._el.querySelector('.menu-version');
      if (versionBadge) versionBadge.innerText = `v1.0 • ${isDev ? 'DEV SUITE' : 'DEMO EDITION'}`;
    });

    // Codex Modal
    const codexModal = this._el.querySelector('#codex-modal');
    bindBtn('#btn-menu-codex', () => {
      if (codexModal) codexModal.style.display = 'flex';
    });

    bindBtn('#btn-close-codex', () => {
      if (codexModal) codexModal.style.display = 'none';
    });

    if (codexModal) {
      codexModal.addEventListener('click', (e) => {
        if (e.target === codexModal) {
          codexModal.style.display = 'none';
        }
      });
    }

    // Audio toggle
    const audioBtn = this._el.querySelector('#btn-menu-audio');
    if (audioBtn) {
      audioBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const active = this._audio.toggleAmbience();
        audioBtn.innerHTML = active
          ? '<span class="pixel-icon icon-ocean-wave size-16"></span> Ocean Audio: ON'
          : '<span class="pixel-icon icon-ocean-wave size-16"></span> Ocean Audio: OFF';
        audioBtn.style.color = active ? '#ffd700' : '#d1b88e';
      });
    }

    // Settings modal toggle
    bindBtn('#btn-menu-settings', () => {
      emit('uiMount', { screen: 'pause', view: 'settings' });
    });

    // Fullscreen toggle
    const fsBtn = this._el.querySelector('#btn-menu-fullscreen');
    if (fsBtn) {
      fsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
          fsBtn.innerHTML = '<span class="pixel-icon icon-fullscreen-expand size-16"></span> Exit Fullscreen';
        } else {
          document.exitFullscreen().catch(() => {});
          fsBtn.innerHTML = '<span class="pixel-icon icon-fullscreen-expand size-16"></span> Fullscreen';
        }
      });
    }
  }

  mount() {
    this._el.style.display = 'flex';
    const root = document.getElementById('ui-root') || document.body;
    if (!this._el.parentNode) {
      root.appendChild(this._el);
    }
  }

  unmount() {
    this._el.style.display = 'none';
    const codex = this._el.querySelector('#codex-modal');
    if (codex) codex.style.display = 'none';
    const levelModal = this._el.querySelector('#level-modal');
    if (levelModal) levelModal.style.display = 'none';
  }
}

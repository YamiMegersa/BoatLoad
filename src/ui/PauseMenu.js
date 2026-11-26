import { emit, on, off } from '../core/EventBus.js';
import { settingsManager } from '../core/SettingsManager.js';
import { autoPerformanceController } from '../core/AutoPerformance.js';
import { CONTROL_SCHEMES } from '../core/GamepadManager.js';

export class PauseMenu {
  constructor() {
    this._el = null;
    this._activeTab = 'tab-graphics';
    this._onGamepadChange = () => this._updateGamepadBadge();

    on('uiMount', d => { if (d.screen === 'pause') this.mount(d); });
    on('uiUnmount', d => { if (d.screen === 'pause') this.unmount(); });
    on('gamepadConnected', this._onGamepadChange);
    on('gamepadDisconnected', this._onGamepadChange);

    on('autoPerformanceAdjusted', (data) => {
      this._onAutoPerformanceAdjusted(data);
    });

    on('autoPerformanceLightingAdjusted', (data) => {
      this._onAutoPerformanceLightingAdjusted(data);
    });

    on('autoPerformanceStatus', (status) => {
      this._onAutoPerformanceStatus(status);
    });

    on('settingChanged', ({ key, value }) => {
      if (key === 'showFps' && this._el) {
        const showFpsToggle = this._el.querySelector('#set-show-fps');
        const showFpsBadge = this._el.querySelector('#val-show-fps');
        if (showFpsToggle) showFpsToggle.checked = Boolean(value);
        if (showFpsBadge) showFpsBadge.innerText = value ? 'Show' : 'Hide';
      }
      if (key === 'paperShader' && this._el) {
        const paperToggle = this._el.querySelector('#set-paper-shader');
        const paperBadge = this._el.querySelector('#val-paper-shader');
        const isEnabled = Boolean(value && value !== 'off');
        if (paperToggle) paperToggle.checked = isEnabled;
        if (paperBadge) paperBadge.innerText = isEnabled ? 'On' : 'Off';
      }
      if (key === 'ditherShader' && this._el) {
        const ditherToggle = this._el.querySelector('#set-dither-shader');
        const ditherBadge = this._el.querySelector('#val-dither-shader');
        const isEnabled = Boolean(value && value !== 'off');
        if (ditherToggle) ditherToggle.checked = isEnabled;
        if (ditherBadge) ditherBadge.innerText = isEnabled ? 'On' : 'Off';
      }
    });
  }

  mount(opts = {}) {
    if (this._el) this.unmount();

    this._el = document.createElement('div');
    this._el.id = 'pause-screen';
    this._el.className = 'pause-screen-backdrop';

    this._el.innerHTML = `
      <div class="pause-modal-card">
        
        <!-- MAIN PAUSE VIEW -->
        <div id="pause-main-view" class="pause-subview">
          <div class="pause-header">
            <div class="pause-crest-icon"><span class="pixel-icon icon-anchor size-32"></span></div>
            <h1 class="pause-title">Paused</h1>
            <div class="pause-subtitle">Voyage Temporarily Anchored</div>
          </div>

          <div class="pause-actions-list">
            <button id="btn-resume" class="pause-btn primary"><span class="pixel-icon icon-play size-18"></span> Resume Game</button>
            <button id="btn-settings" class="pause-btn settings-btn"><span class="pixel-icon icon-settings-cog size-18"></span> Settings &amp; Performance</button>
            <button id="btn-director" class="pause-btn director-btn"><span class="pixel-icon icon-director-clapper size-18"></span> Director Mode (F8)</button>
            <button id="btn-restart" class="pause-btn"><span class="pixel-icon icon-rotate-arrow size-18"></span> Restart Phase</button>
            <button id="btn-shipyard" class="pause-btn"><span class="pixel-icon icon-hammer size-18"></span> Back to Shipyard</button>
            <button id="btn-title" class="pause-btn danger"><span class="pixel-icon icon-cabin-door-exit size-18"></span> Quit to Title</button>
          </div>
        </div>

        <!-- SETTINGS VIEW -->
        <div id="pause-settings-view" class="pause-subview" style="display: none;">
          <div class="settings-header">
            <button id="btn-settings-back-top" class="settings-back-btn" title="Back to Pause Menu"><span class="pixel-icon icon-arrow-right size-14" style="transform: scaleX(-1);"></span> Back</button>
            <div class="settings-title-wrap">
              <h2 class="settings-title"><span class="pixel-icon icon-settings-cog size-20"></span> Game Settings</h2>
              <span class="settings-subtitle">Optimize Draw Distance, FOV, Fog &amp; Audio</span>
            </div>
          </div>

          <!-- Settings Navigation Tabs -->
          <div class="settings-tabs">
            <button class="settings-tab-btn active" data-tab="tab-graphics"><span class="pixel-icon icon-display-monitor size-18"></span> Graphics &amp; Performance</button>
            <button class="settings-tab-btn" data-tab="tab-audio"><span class="pixel-icon icon-audio-horn size-18"></span> Audio Controls</button>
            <button class="settings-tab-btn" data-tab="tab-controls">🎮 Xbox Controller</button>
          </div>

          <!-- Tab Content: Graphics & Draw Distance -->
          <div id="tab-graphics" class="settings-tab-pane active">
            
            <!-- Dynamic Auto Performance Mode -->
            <div class="setting-item auto-perf-card" id="card-auto-perf">
              <div class="setting-info">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <label class="setting-label" for="set-auto-perf" style="color:#7dd3fc; font-weight:700; display:flex; align-items:center; gap:8px;">
                    ⚡ Auto Performance Mode
                  </label>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span class="setting-val-badge highlight" id="val-auto-perf">Disabled</span>
                    <label class="switch-wrap">
                      <input type="checkbox" id="set-auto-perf">
                      <span class="switch-slider"></span>
                    </label>
                  </div>
                </div>
                <span class="setting-desc">
                  Dynamically scales render resolution, draw distance, shadows, and effects on the fly to continuously lock your target frame rate.
                </span>
              </div>

              <!-- Target FPS Controls -->
              <div id="auto-perf-target-section" style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed rgba(56, 189, 248, 0.25);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                  <span class="setting-label" style="font-size:0.85rem; color:#bae6fd;">Target Frame Rate (FPS)</span>
                  <span class="setting-val-badge highlight" id="val-target-fps">20 FPS</span>
                </div>
                <div class="setting-ctrl-row">
                  <input type="range" id="set-target-fps" class="setting-slider" min="15" max="60" step="1" value="20">
                </div>
                <div class="setting-presets-row" id="group-target-fps-presets" style="margin-top: 6px;">
                  <span class="presets-label">Target Presets:</span>
                  <button class="preset-chip" data-fps="15">15 FPS</button>
                  <button class="preset-chip active" data-fps="20">20 FPS (Default)</button>
                  <button class="preset-chip" data-fps="30">30 FPS</button>
                  <button class="preset-chip" data-fps="45">45 FPS</button>
                  <button class="preset-chip" data-fps="60">60 FPS</button>
                </div>
              </div>

              <!-- Real-time Live Status Display -->
              <div class="auto-perf-status-bar" id="auto-perf-live-status" style="margin-top: 10px;">
                <span class="auto-perf-indicator-dot"></span>
                <span id="auto-perf-status-text">Manual Control • Standby</span>
              </div>
            </div>

            <!-- Field of View (FOV) -->
            <div class="setting-item">
              <div class="setting-info">
                <label for="set-fov" class="setting-label">Field of View (FOV)</label>
                <span class="setting-desc">Viewing angle. Higher FOV provides wider peripheral vision.</span>
              </div>
              <div class="setting-ctrl-row">
                <input type="range" id="set-fov" class="setting-slider" min="45" max="95" step="1">
                <span class="setting-val-badge" id="val-fov">60°</span>
              </div>
            </div>

            <!-- Draw Distance (with Fog Cutoff explanation) -->
            <div class="setting-item highlight">
              <div class="setting-info">
                <label for="set-draw-dist" class="setting-label">Draw Distance (Polygons &amp; Depth Cutoff)</label>
                <span class="setting-desc">Culls distant geometry past this range to dramatically reduce triangle count and boost FPS.</span>
              </div>
              <div class="setting-ctrl-row">
                <input type="range" id="set-draw-dist" class="setting-slider" min="100" max="650" step="25">
                <span class="setting-val-badge highlight" id="val-draw-dist">350m</span>
              </div>
              <div class="setting-presets-row" id="group-draw-dist-presets">
                <span class="presets-label">Presets:</span>
                <button class="preset-chip" data-dist="150">Low (150m)</button>
                <button class="preset-chip" data-dist="250">Medium (250m)</button>
                <button class="preset-chip" data-dist="350">High (350m)</button>
                <button class="preset-chip" data-dist="500">Max (500m)</button>
              </div>
            </div>

            <!-- Cut Draw Distance with Fog -->
            <div class="setting-item">
              <div class="setting-info">
                <label class="setting-label" for="set-cut-fog">Cut Draw Distance with Fog</label>
                <span class="setting-desc">Smoothly blends distant ocean and terrain into horizon mist before the clipping plane to prevent harsh pop-in.</span>
              </div>
              <div class="setting-ctrl-row">
                <label class="switch-wrap">
                  <input type="checkbox" id="set-cut-fog">
                  <span class="switch-slider"></span>
                </label>
                <span class="setting-val-badge" id="val-cut-fog">Enabled</span>
              </div>
            </div>

            <!-- Render Resolution Scale -->
            <div class="setting-item">
              <div class="setting-info">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <label class="setting-label">Render Resolution Scale</label>
                  <span class="setting-val-badge highlight" id="val-render-scale">100%</span>
                </div>
                <span class="setting-desc">Adjusts 3D pixel fill-rate density. Lower scale provides huge performance boosts on laptops.</span>
              </div>
              <div class="setting-pill-group" id="group-render-scale">
                <button class="pill-btn" data-val="0.5">50%</button>
                <button class="pill-btn" data-val="0.75">75%</button>
                <button class="pill-btn" data-val="1.0">100%</button>
                <button class="pill-btn" data-val="1.25">125%</button>
              </div>
            </div>

            <!-- Shadow Quality -->
            <div class="setting-item">
              <div class="setting-info">
                <label class="setting-label">Shadow Quality</label>
                <span class="setting-desc">Directional sunlight shadows. Off completely removes shadow map overhead.</span>
              </div>
              <div class="setting-pill-group" id="group-shadows">
                <button class="pill-btn" data-val="off">Off</button>
                <button class="pill-btn" data-val="low">Low</button>
                <button class="pill-btn active" data-val="high">High (Soft)</button>
              </div>
            </div>

            <!-- Art Filter Shader (Kuwahara) -->
            <div class="setting-item">
              <div class="setting-info">
                <label class="setting-label" for="set-paper-shader">Painterly Filter (Kuwahara)</label>
                <span class="setting-desc">Artistic oil-painting and parchment post-processing filter.</span>
              </div>
              <div class="setting-ctrl-row">
                <label class="switch-wrap">
                  <input type="checkbox" id="set-paper-shader">
                  <span class="switch-slider"></span>
                </label>
                <span class="setting-val-badge" id="val-paper-shader">Off</span>
              </div>
            </div>

            <!-- Dithering Map Shader -->
            <div class="setting-item">
              <div class="setting-info">
                <label class="setting-label" for="set-dither-shader">Dithering Map Shader</label>
                <span class="setting-desc">Retro ordered Bayer dithering and color map quantization filter.</span>
              </div>
              <div class="setting-ctrl-row">
                <label class="switch-wrap">
                  <input type="checkbox" id="set-dither-shader">
                  <span class="switch-slider"></span>
                </label>
                <span class="setting-val-badge" id="val-dither-shader">Off</span>
              </div>
            </div>

            <!-- Volumetric God Rays -->
            <div class="setting-item">
              <div class="setting-info">
                <label class="setting-label" for="set-god-rays">Volumetric God Rays</label>
                <span class="setting-desc">Atmospheric radial sunlight scatter.</span>
              </div>
              <div class="setting-ctrl-row">
                <label class="switch-wrap">
                  <input type="checkbox" id="set-god-rays">
                  <span class="switch-slider"></span>
                </label>
                <span class="setting-val-badge" id="val-god-rays">On</span>
              </div>
            </div>

            <!-- Performance Metrics Overlay -->
            <div class="setting-item">
              <div class="setting-info">
                <label class="setting-label" for="set-show-fps">Performance HUD (FPS / Calls / Tris)</label>
                <span class="setting-desc">Live on-screen performance diagnostics. (Shortcut: Ctrl+Shift+F)</span>
              </div>
              <div class="setting-ctrl-row">
                <label class="switch-wrap">
                  <input type="checkbox" id="set-show-fps">
                  <span class="switch-slider"></span>
                </label>
                <span class="setting-val-badge" id="val-show-fps">Show</span>
              </div>
            </div>

          </div>

          <!-- Tab Content: Audio Controls -->
          <div id="tab-audio" class="settings-tab-pane" style="display: none;">
            
            <!-- Master Volume -->
            <div class="setting-item">
              <div class="setting-info">
                <label for="set-vol-master" class="setting-label">Master Volume</label>
                <span class="setting-desc">Overall game audio volume.</span>
              </div>
              <div class="setting-ctrl-row">
                <input type="range" id="set-vol-master" class="setting-slider" min="0" max="100" step="1">
                <span class="setting-val-badge" id="val-vol-master">80%</span>
              </div>
            </div>

            <!-- Mute Audio -->
            <div class="setting-item">
              <div class="setting-info">
                <label class="setting-label" for="set-audio-mute">Mute Audio</label>
                <span class="setting-desc">Quickly mute all sound output (Keyboard shortcut: M).</span>
              </div>
              <div class="setting-ctrl-row">
                <label class="switch-wrap">
                  <input type="checkbox" id="set-audio-mute">
                  <span class="switch-slider"></span>
                </label>
                <span class="setting-val-badge" id="val-audio-mute">Unmuted</span>
              </div>
            </div>

            <!-- SFX Volume -->
            <div class="setting-item">
              <div class="setting-info">
                <label for="set-vol-sfx" class="setting-label">Sound Effects (SFX)</label>
                <span class="setting-desc">Wooden hull knocks &amp; breaking, Kraken roars, cannons, harpoons, and QTEs.</span>
              </div>
              <div class="setting-ctrl-row">
                <input type="range" id="set-vol-sfx" class="setting-slider" min="0" max="100" step="1">
                <span class="setting-val-badge" id="val-vol-sfx">80%</span>
              </div>
            </div>

            <!-- Maritime Ambience & Sirens -->
            <div class="setting-item">
              <div class="setting-info">
                <label for="set-vol-amb" class="setting-label">Maritime Ambience &amp; Sirens</label>
                <span class="setting-desc">Calm sailing, rough ocean waves, howling storm wind, distant Kraken &amp; sirens.</span>
              </div>
              <div class="setting-ctrl-row">
                <input type="range" id="set-vol-amb" class="setting-slider" min="0" max="100" step="1">
                <span class="setting-val-badge" id="val-vol-amb">80%</span>
              </div>
            </div>

            <!-- Music Volume -->
            <div class="setting-item">
              <div class="setting-info">
                <label for="set-vol-music" class="setting-label">Music Volume</label>

              </div>
              <div class="setting-ctrl-row">
                <input type="range" id="set-vol-music" class="setting-slider" min="0" max="100" step="1">
                <span class="setting-val-badge" id="val-vol-music">70%</span>
              </div>
            </div>

          </div>

          <!-- Tab Content: Xbox Controller -->
          <div id="tab-controls" class="settings-tab-pane" style="display: none;">

            <!-- Connection Status Card -->
            <div class="setting-item highlight">
              <div class="setting-info">
                <div style="display:flex; justify-content:space-between; align-items:center; gap: 10px;">
                  <span class="setting-label" style="color:#ffd700;">Xbox Controller Status</span>
                  <span class="setting-val-badge highlight" id="val-gamepad-status">No Controller Detected</span>
                </div>
                <span class="setting-desc">
                  Plug in via USB or pair via Bluetooth, then press any button or move a stick to switch automatically between Keyboard/Mouse and Xbox controls.
                </span>
              </div>
            </div>

            <!-- Look Sensitivity -->
            <div class="setting-item">
              <div class="setting-info">
                <label for="set-gp-sens" class="setting-label">Right Stick Look Sensitivity</label>
                <span class="setting-desc">Camera turn speed on Dock, Shipyard, Editor, and Sailing look-around.</span>
              </div>
              <div class="setting-ctrl-row">
                <input type="range" id="set-gp-sens" class="setting-slider" min="0.3" max="2.5" step="0.1">
                <span class="setting-val-badge" id="val-gp-sens">1.0x</span>
              </div>
            </div>

            <!-- Stick Deadzone -->
            <div class="setting-item">
              <div class="setting-info">
                <label for="set-gp-deadzone" class="setting-label">Analog Stick Deadzone</label>
                <span class="setting-desc">Scaled radial inner deadzone to eliminate stick drift.</span>
              </div>
              <div class="setting-ctrl-row">
                <input type="range" id="set-gp-deadzone" class="setting-slider" min="5" max="35" step="1">
                <span class="setting-val-badge" id="val-gp-deadzone">15%</span>
              </div>
            </div>

            <!-- Invert Look Y -->
            <div class="setting-item">
              <div class="setting-info">
                <label class="setting-label" for="set-gp-invert-y">Invert Look Y-Axis</label>
                <span class="setting-desc">Reverses vertical camera pitch on Right Stick.</span>
              </div>
              <div class="setting-ctrl-row">
                <label class="switch-wrap">
                  <input type="checkbox" id="set-gp-invert-y">
                  <span class="switch-slider"></span>
                </label>
                <span class="setting-val-badge" id="val-gp-invert-y">Off</span>
              </div>
            </div>

            <!-- Vibration / Rumble -->
            <div class="setting-item">
              <div class="setting-info">
                <label class="setting-label" for="set-gp-vibration">Controller Vibration (Rumble)</label>
                <span class="setting-desc">Haptic feedback for hull impacts, harpoons, QTEs, and siren pulls.</span>
              </div>
              <div class="setting-ctrl-row">
                <label class="switch-wrap">
                  <input type="checkbox" id="set-gp-vibration">
                  <span class="switch-slider"></span>
                </label>
                <span class="setting-val-badge" id="val-gp-vibration">On</span>
              </div>
            </div>

            <!-- On-Screen Xbox Prompts -->
            <div class="setting-item">
              <div class="setting-info">
                <label class="setting-label" for="set-gp-hints">On-Screen Xbox Button Prompts</label>
                <span class="setting-desc">Displays contextual Xbox control hints while a controller is active.</span>
              </div>
              <div class="setting-ctrl-row">
                <label class="switch-wrap">
                  <input type="checkbox" id="set-gp-hints">
                  <span class="switch-slider"></span>
                </label>
                <span class="setting-val-badge" id="val-gp-hints">On</span>
              </div>
            </div>

            <!-- Complete Per-Phase Reference Chart -->
            <div class="gp-reference-section">
              <div class="gp-reference-header">Xbox Control Reference (Sea of Thieves &amp; KSP Layout)</div>
              <div class="gp-reference-grid">
                ${this._renderControlSchemesHtml()}
              </div>
            </div>

          </div>

          <!-- Settings Action Bar -->
          <div class="settings-footer-row">
            <button id="btn-settings-reset" class="settings-action-btn secondary"><span class="pixel-icon icon-rotate-arrow size-16"></span> Reset Defaults</button>
            <button id="btn-settings-done" class="settings-action-btn primary"><span class="pixel-icon icon-confirm-check size-16"></span> Done / Back to Pause</button>
          </div>

        </div>

      </div>
    `;

    this._bindEvents(opts);
    this._populateSettings();

    if (opts.view === 'settings') {
      this._showSettings(true);
    }

    document.getElementById('ui-root')?.appendChild(this._el);
  }

  unmount() {
    this._el?.remove();
    this._el = null;
  }

  _bindEvents(opts = {}) {
    if (!this._el) return;

    // --- Main Pause Navigation ---
    this._el.querySelector('#btn-resume')?.addEventListener('click', () => {
      emit('resumeGame');
    });

    this._el.querySelector('#btn-settings')?.addEventListener('click', () => {
      this._showSettings(true);
    });

    this._el.querySelector('#btn-director')?.addEventListener('click', () => {
      emit('resumeGame');
      if (window.directorMode) {
        window.directorMode.activate();
      }
    });

    this._el.querySelector('#btn-restart')?.addEventListener('click', () => {
      emit('resumeGame');
      emit('restartPhase');
    });

    const shipyardBtn = this._el.querySelector('#btn-shipyard');
    if (shipyardBtn) {
      if (window.gameState?._isEditorPlay) {
        shipyardBtn.innerHTML = '<span class="pixel-icon icon-map-maker-scroll size-18"></span> Return to Editor';
      } else if (window.gameState?._isCommunityCourse || window.gameState?._activeCommunityCourseCode) {
        shipyardBtn.innerHTML = '<span class="pixel-icon icon-anchor size-18"></span> Return to Community Menu';
      }
      shipyardBtn.addEventListener('click', () => {
        emit('resumeGame');
        emit('gotoShipyard');
      });
    }

    this._el.querySelector('#btn-title')?.addEventListener('click', () => {
      emit('resumeGame');
      emit('gotoTitle');
    });

    // --- Settings View Navigation ---
    const closeSettings = () => {
      if (opts.view === 'settings' && window.gameState?.currentPhase === 'MAIN_MENU') {
        this.unmount();
      } else {
        this._showSettings(false);
      }
    };
    this._el.querySelector('#btn-settings-back-top')?.addEventListener('click', closeSettings);
    this._el.querySelector('#btn-settings-done')?.addEventListener('click', closeSettings);

    // Tab switching
    this._el.querySelectorAll('.settings-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tabId = e.currentTarget.dataset.tab;
        this._switchTab(tabId);
      });
    });

    // --- Interactive Controls ---

    // Auto Performance Mode Toggle & Target FPS
    const autoPerfCard       = this._el.querySelector('#card-auto-perf');
    const autoPerfToggle     = this._el.querySelector('#set-auto-perf');
    const autoPerfBadge      = this._el.querySelector('#val-auto-perf');
    const targetFpsSlider    = this._el.querySelector('#set-target-fps');
    const targetFpsBadge     = this._el.querySelector('#val-target-fps');
    const autoPerfStatusText = this._el.querySelector('#auto-perf-status-text');

    autoPerfToggle?.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      settingsManager.set('autoPerformance', enabled);
      if (autoPerfBadge) {
        autoPerfBadge.innerText = enabled ? 'Active' : 'Disabled';
        autoPerfBadge.style.color = enabled ? '#38bdf8' : '#94a3b8';
      }
      if (autoPerfCard) {
        autoPerfCard.classList.toggle('active', enabled);
      }
      if (!enabled) {
        this._populateSettings();
      } else {
        const summary = autoPerformanceController.getStatusSummary();
        if (autoPerfStatusText) autoPerfStatusText.innerText = summary.text;
      }
    });

    targetFpsSlider?.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (targetFpsBadge) targetFpsBadge.innerText = `${val} FPS`;
      this._el.querySelectorAll('#group-target-fps-presets .preset-chip').forEach(chip => {
        const chipFps = Number(chip.dataset.fps);
        chip.classList.toggle('active', chipFps === val);
      });
      settingsManager.set('targetFps', val);
    });

    this._el.querySelectorAll('#group-target-fps-presets .preset-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const fps = Number(e.currentTarget.dataset.fps);
        if (targetFpsSlider) targetFpsSlider.value = fps;
        if (targetFpsBadge) targetFpsBadge.innerText = `${fps} FPS`;
        this._el.querySelectorAll('#group-target-fps-presets .preset-chip').forEach(c => {
          c.classList.toggle('active', Number(c.dataset.fps) === fps);
        });
        settingsManager.set('targetFps', fps);
      });
    });

    // FOV Slider
    const fovSlider = this._el.querySelector('#set-fov');
    const fovBadge  = this._el.querySelector('#val-fov');
    fovSlider?.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (fovBadge) fovBadge.innerText = `${val}°`;
      settingsManager.set('fov', val);
    });

    // Draw Distance Slider
    const drawDistSlider = this._el.querySelector('#set-draw-dist');
    const drawDistBadge  = this._el.querySelector('#val-draw-dist');
    drawDistSlider?.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (drawDistBadge) drawDistBadge.innerText = `${val}m`;
      settingsManager.set('drawDistance', val);
    });

    // Presets chips for Draw Distance
    this._el.querySelectorAll('#group-draw-dist-presets .preset-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const dist = Number(e.currentTarget.dataset.dist);
        if (drawDistSlider) drawDistSlider.value = dist;
        if (drawDistBadge) drawDistBadge.innerText = `${dist}m`;
        settingsManager.set('drawDistance', dist);
      });
    });

    // Cut Draw Distance with Fog Toggle
    const cutFogToggle = this._el.querySelector('#set-cut-fog');
    const cutFogBadge  = this._el.querySelector('#val-cut-fog');
    cutFogToggle?.addEventListener('change', (e) => {
      const checked = e.target.checked;
      if (cutFogBadge) cutFogBadge.innerText = checked ? 'Enabled' : 'Disabled';
      settingsManager.set('cutWithFog', checked);
    });

    // Render Scale Pill Group
    const updateResolutionBadge = (scale) => {
      const scaleBadge = this._el?.querySelector('#val-render-scale');
      if (scaleBadge) {
        const s = Number(scale) || 1.0;
        const w = Math.round(window.innerWidth * s);
        const h = Math.round(window.innerHeight * s);
        scaleBadge.innerText = `${w} × ${h} (${Math.round(s * 100)}%)`;
      }
    };
    this._setupPillGroup('#group-render-scale', 'renderScale', Number, updateResolutionBadge);

    // Shadow Quality Pill Group
    this._setupPillGroup('#group-shadows', 'shadowQuality', String);

    // Paper Shader (Kuwahara) Toggle
    const paperShaderToggle = this._el.querySelector('#set-paper-shader');
    const paperShaderBadge  = this._el.querySelector('#val-paper-shader');
    paperShaderToggle?.addEventListener('change', (e) => {
      const checked = e.target.checked;
      if (paperShaderBadge) paperShaderBadge.innerText = checked ? 'On' : 'Off';
      settingsManager.set('paperShader', checked);
      if (checked && settingsManager.get('ditherShader')) {
        settingsManager.set('ditherShader', false);
      }
    });

    // Dithering Map Shader Toggle
    const ditherShaderToggle = this._el.querySelector('#set-dither-shader');
    const ditherShaderBadge  = this._el.querySelector('#val-dither-shader');
    ditherShaderToggle?.addEventListener('change', (e) => {
      const checked = e.target.checked;
      if (ditherShaderBadge) ditherShaderBadge.innerText = checked ? 'On' : 'Off';
      settingsManager.set('ditherShader', checked);
      if (checked && settingsManager.get('paperShader')) {
        settingsManager.set('paperShader', false);
      }
    });

    // God Rays Toggle
    const godRaysToggle = this._el.querySelector('#set-god-rays');
    const godRaysBadge  = this._el.querySelector('#val-god-rays');
    godRaysToggle?.addEventListener('change', (e) => {
      const checked = e.target.checked;
      if (godRaysBadge) godRaysBadge.innerText = checked ? 'On' : 'Off';
      settingsManager.set('godRays', checked);
    });

    // Show FPS Toggle
    const showFpsToggle = this._el.querySelector('#set-show-fps');
    const showFpsBadge  = this._el.querySelector('#val-show-fps');
    showFpsToggle?.addEventListener('change', (e) => {
      const checked = e.target.checked;
      if (showFpsBadge) showFpsBadge.innerText = checked ? 'Show' : 'Hide';
      settingsManager.set('showFps', checked);
    });

    // Master Volume Slider
    const volMasterSlider = this._el.querySelector('#set-vol-master');
    const volMasterBadge  = this._el.querySelector('#val-vol-master');
    volMasterSlider?.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (volMasterBadge) volMasterBadge.innerText = `${val}%`;
      settingsManager.set('masterVolume', val / 100);
    });

    // Audio Mute Toggle
    const muteToggle = this._el.querySelector('#set-audio-mute');
    const muteBadge  = this._el.querySelector('#val-audio-mute');
    muteToggle?.addEventListener('change', (e) => {
      const checked = e.target.checked;
      if (muteBadge) muteBadge.innerText = checked ? 'Muted' : 'Unmuted';
      settingsManager.set('muted', checked);
    });

    // SFX Volume Slider
    const volSfxSlider = this._el.querySelector('#set-vol-sfx');
    const volSfxBadge  = this._el.querySelector('#val-vol-sfx');
    volSfxSlider?.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (volSfxBadge) volSfxBadge.innerText = `${val}%`;
      settingsManager.set('sfxVolume', val / 100);
    });

    // Ambient Volume Slider
    const volAmbSlider = this._el.querySelector('#set-vol-amb');
    const volAmbBadge  = this._el.querySelector('#val-vol-amb');
    volAmbSlider?.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (volAmbBadge) volAmbBadge.innerText = `${val}%`;
      settingsManager.set('ambientVolume', val / 100);
    });

    // Music Volume Slider
    const volMusicSlider = this._el.querySelector('#set-vol-music');
    const volMusicBadge  = this._el.querySelector('#val-vol-music');
    volMusicSlider?.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (volMusicBadge) volMusicBadge.innerText = `${val}%`;
      settingsManager.set('musicVolume', val / 100);
    });

    // Xbox Controller Controls
    const gpSensSlider = this._el.querySelector('#set-gp-sens');
    const gpSensBadge  = this._el.querySelector('#val-gp-sens');
    gpSensSlider?.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (gpSensBadge) gpSensBadge.innerText = `${val.toFixed(1)}x`;
      settingsManager.set('gamepadSensitivity', val);
    });

    const gpDzSlider = this._el.querySelector('#set-gp-deadzone');
    const gpDzBadge  = this._el.querySelector('#val-gp-deadzone');
    gpDzSlider?.addEventListener('input', (e) => {
      const pct = Number(e.target.value);
      if (gpDzBadge) gpDzBadge.innerText = `${pct}%`;
      settingsManager.set('gamepadDeadzone', pct / 100);
    });

    const gpInvertToggle = this._el.querySelector('#set-gp-invert-y');
    const gpInvertBadge  = this._el.querySelector('#val-gp-invert-y');
    gpInvertToggle?.addEventListener('change', (e) => {
      const checked = e.target.checked;
      if (gpInvertBadge) gpInvertBadge.innerText = checked ? 'On' : 'Off';
      settingsManager.set('gamepadInvertY', checked);
    });

    const gpVibToggle = this._el.querySelector('#set-gp-vibration');
    const gpVibBadge  = this._el.querySelector('#val-gp-vibration');
    gpVibToggle?.addEventListener('change', (e) => {
      const checked = e.target.checked;
      if (gpVibBadge) gpVibBadge.innerText = checked ? 'On' : 'Off';
      settingsManager.set('gamepadVibration', checked);
    });

    const gpHintsToggle = this._el.querySelector('#set-gp-hints');
    const gpHintsBadge  = this._el.querySelector('#val-gp-hints');
    gpHintsToggle?.addEventListener('change', (e) => {
      const checked = e.target.checked;
      if (gpHintsBadge) gpHintsBadge.innerText = checked ? 'On' : 'Off';
      settingsManager.set('gamepadShowHints', checked);
    });

    // Reset Defaults Button
    this._el.querySelector('#btn-settings-reset')?.addEventListener('click', () => {
      settingsManager.resetToDefaults();
      this._populateSettings();
    });
  }

  _renderControlSchemesHtml() {
    return Object.values(CONTROL_SCHEMES).map((scheme) => `
      <div class="gp-scheme-card">
        <div class="gp-scheme-title">${scheme.title}</div>
        <div class="gp-scheme-sub">${scheme.subtitle}</div>
        <div class="gp-scheme-list">
          ${scheme.bindings.map((b) => `
            <div class="gp-scheme-row">
              <span class="xb-btn xb-${b.kind}">${b.btn}</span>
              <span class="gp-scheme-action">${b.action}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  _updateGamepadBadge() {
    if (!this._el) return;
    const badge = this._el.querySelector('#val-gamepad-status');
    if (!badge) return;
    const gm = typeof window !== 'undefined' ? window.gamepadManager : null;
    if (gm?.connected) {
      const shortName = (gm.gamepadId || 'Xbox Controller').replace(/\s*\([^)]*\)/g, '').slice(0, 32);
      badge.innerText = `Connected • ${shortName}`;
      badge.style.color = '#4ade80';
    } else {
      badge.innerText = 'No Controller Detected';
      badge.style.color = '#94a3b8';
    }
  }

  isSettingsOpen() {
    if (!this._el) return false;
    const settingsView = this._el.querySelector('#pause-settings-view');
    return Boolean(settingsView && settingsView.style.display !== 'none');
  }

  closeSettingsView() {
    if (!this._el) return;
    if (window.gameState?.currentPhase === 'MAIN_MENU') {
      this.unmount();
    } else {
      this._showSettings(false);
    }
  }

  _setupPillGroup(groupId, settingKey, transformFn = String, onChange = null) {
    const group = this._el?.querySelector(groupId);
    if (!group) return;

    group.querySelectorAll('.pill-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const val = transformFn(e.currentTarget.dataset.val);
        group.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        settingsManager.set(settingKey, val);
        if (onChange) onChange(val);
      });
    });
  }

  _showSettings(show) {
    if (!this._el) return;
    const mainView = this._el.querySelector('#pause-main-view');
    const settingsView = this._el.querySelector('#pause-settings-view');

    if (show) {
      this._populateSettings();
      if (mainView) mainView.style.display = 'none';
      if (settingsView) settingsView.style.display = 'flex';
    } else {
      if (settingsView) settingsView.style.display = 'none';
      if (mainView) mainView.style.display = 'flex';
    }
  }

  _switchTab(tabId) {
    if (!this._el) return;
    this._activeTab = tabId;

    this._el.querySelectorAll('.settings-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    this._el.querySelectorAll('.settings-tab-pane').forEach(pane => {
      pane.style.display = pane.id === tabId ? 'flex' : 'none';
    });
  }

  _populateSettings() {
    if (!this._el) return;

    // Auto Performance Mode
    const autoPerf = Boolean(settingsManager.get('autoPerformance'));
    const targetFps = Number(settingsManager.get('targetFps')) || 20;
    const autoPerfToggle = this._el.querySelector('#set-auto-perf');
    const autoPerfBadge  = this._el.querySelector('#val-auto-perf');
    const autoPerfCard   = this._el.querySelector('#card-auto-perf');
    const targetFpsSlider = this._el.querySelector('#set-target-fps');
    const targetFpsBadge  = this._el.querySelector('#val-target-fps');
    const autoPerfStatusText = this._el.querySelector('#auto-perf-status-text');

    if (autoPerfToggle) autoPerfToggle.checked = autoPerf;
    if (autoPerfBadge) {
      autoPerfBadge.innerText = autoPerf ? 'Active' : 'Disabled';
      autoPerfBadge.style.color = autoPerf ? '#38bdf8' : '#94a3b8';
    }
    if (autoPerfCard) {
      autoPerfCard.classList.toggle('active', autoPerf);
    }
    if (targetFpsSlider) targetFpsSlider.value = targetFps;
    if (targetFpsBadge) targetFpsBadge.innerText = `${targetFps} FPS`;
    this._el.querySelectorAll('#group-target-fps-presets .preset-chip').forEach(chip => {
      const chipFps = Number(chip.dataset.fps);
      chip.classList.toggle('active', chipFps === targetFps);
    });
    if (autoPerfStatusText) {
      const summary = autoPerformanceController.getStatusSummary();
      autoPerfStatusText.innerText = summary.text;
    }

    // FOV
    const fov = settingsManager.get('fov');
    const fovSlider = this._el.querySelector('#set-fov');
    const fovBadge  = this._el.querySelector('#val-fov');
    if (fovSlider) fovSlider.value = fov;
    if (fovBadge) fovBadge.innerText = `${fov}°`;

    // Draw Distance
    const dist = settingsManager.get('drawDistance');
    const distSlider = this._el.querySelector('#set-draw-dist');
    const distBadge  = this._el.querySelector('#val-draw-dist');
    if (distSlider) distSlider.value = dist;
    if (distBadge) distBadge.innerText = `${dist}m`;

    // Cut with Fog
    const cutFog = settingsManager.get('cutWithFog');
    const cutFogToggle = this._el.querySelector('#set-cut-fog');
    const cutFogBadge  = this._el.querySelector('#val-cut-fog');
    if (cutFogToggle) cutFogToggle.checked = cutFog;
    if (cutFogBadge) cutFogBadge.innerText = cutFog ? 'Enabled' : 'Disabled';

    // Render Scale
    const scaleVal = Number(settingsManager.get('renderScale')) || 1.0;
    const scaleBadge = this._el.querySelector('#val-render-scale');
    if (scaleBadge) {
      const w = Math.round(window.innerWidth * scaleVal);
      const h = Math.round(window.innerHeight * scaleVal);
      scaleBadge.innerText = `${w} × ${h} (${Math.round(scaleVal * 100)}%)`;
    }
    this._el.querySelectorAll('#group-render-scale .pill-btn').forEach(btn => {
      const btnVal = Number(btn.dataset.val);
      btn.classList.toggle('active', Math.abs(btnVal - scaleVal) < 0.01);
    });

    // Shadow Quality
    const shadows = settingsManager.get('shadowQuality');
    this._el.querySelectorAll('#group-shadows .pill-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.val === shadows);
    });

    // Paper Shader (Kuwahara)
    const paper = Boolean(settingsManager.get('paperShader') && settingsManager.get('paperShader') !== 'off');
    const paperToggle = this._el.querySelector('#set-paper-shader');
    const paperBadge  = this._el.querySelector('#val-paper-shader');
    if (paperToggle) paperToggle.checked = paper;
    if (paperBadge) paperBadge.innerText = paper ? 'On' : 'Off';

    // Dithering Map Shader
    const dither = Boolean(settingsManager.get('ditherShader') && settingsManager.get('ditherShader') !== 'off');
    const ditherToggle = this._el.querySelector('#set-dither-shader');
    const ditherBadge  = this._el.querySelector('#val-dither-shader');
    if (ditherToggle) ditherToggle.checked = dither;
    if (ditherBadge) ditherBadge.innerText = dither ? 'On' : 'Off';

    // God Rays
    const godRays = settingsManager.get('godRays');
    const godRaysToggle = this._el.querySelector('#set-god-rays');
    const godRaysBadge  = this._el.querySelector('#val-god-rays');
    if (godRaysToggle) godRaysToggle.checked = godRays;
    if (godRaysBadge) godRaysBadge.innerText = godRays ? 'On' : 'Off';

    // Show FPS
    const showFps = settingsManager.get('showFps');
    const showFpsToggle = this._el.querySelector('#set-show-fps');
    const showFpsBadge  = this._el.querySelector('#val-show-fps');
    if (showFpsToggle) showFpsToggle.checked = showFps;
    if (showFpsBadge) showFpsBadge.innerText = showFps ? 'Show' : 'Hide';

    // Master Volume
    const masterVol = Math.round(settingsManager.get('masterVolume') * 100);
    const masterSlider = this._el.querySelector('#set-vol-master');
    const masterBadge  = this._el.querySelector('#val-vol-master');
    if (masterSlider) masterSlider.value = masterVol;
    if (masterBadge) masterBadge.innerText = `${masterVol}%`;

    // Muted
    const muted = settingsManager.get('muted');
    const muteToggle = this._el.querySelector('#set-audio-mute');
    const muteBadge  = this._el.querySelector('#val-audio-mute');
    if (muteToggle) muteToggle.checked = muted;
    if (muteBadge) muteBadge.innerText = muted ? 'Muted' : 'Unmuted';

    // SFX Volume
    const sfxVol = Math.round(settingsManager.get('sfxVolume') * 100);
    const sfxSlider = this._el.querySelector('#set-vol-sfx');
    const sfxBadge  = this._el.querySelector('#val-vol-sfx');
    if (sfxSlider) sfxSlider.value = sfxVol;
    if (sfxBadge) sfxBadge.innerText = `${sfxVol}%`;

    // Ambient Volume
    const ambVol = Math.round(settingsManager.get('ambientVolume') * 100);
    const ambSlider = this._el.querySelector('#set-vol-amb');
    const ambBadge  = this._el.querySelector('#val-vol-amb');
    if (ambSlider) ambSlider.value = ambVol;
    if (ambBadge) ambBadge.innerText = `${ambVol}%`;

    // Music Volume
    const musicVol = Math.round((settingsManager.get('musicVolume') ?? 0.7) * 100);
    const musicSlider = this._el.querySelector('#set-vol-music');
    const musicBadge  = this._el.querySelector('#val-vol-music');
    if (musicSlider) musicSlider.value = musicVol;
    if (musicBadge) musicBadge.innerText = `${musicVol}%`;

    // Xbox Controller Settings
    const gpSens = Number(settingsManager.get('gamepadSensitivity') ?? 1.0);
    const gpSensSlider = this._el.querySelector('#set-gp-sens');
    const gpSensBadge  = this._el.querySelector('#val-gp-sens');
    if (gpSensSlider) gpSensSlider.value = gpSens;
    if (gpSensBadge) gpSensBadge.innerText = `${gpSens.toFixed(1)}x`;

    const gpDz = Math.round((settingsManager.get('gamepadDeadzone') ?? 0.15) * 100);
    const gpDzSlider = this._el.querySelector('#set-gp-deadzone');
    const gpDzBadge  = this._el.querySelector('#val-gp-deadzone');
    if (gpDzSlider) gpDzSlider.value = gpDz;
    if (gpDzBadge) gpDzBadge.innerText = `${gpDz}%`;

    const gpInvert = Boolean(settingsManager.get('gamepadInvertY'));
    const gpInvertToggle = this._el.querySelector('#set-gp-invert-y');
    const gpInvertBadge  = this._el.querySelector('#val-gp-invert-y');
    if (gpInvertToggle) gpInvertToggle.checked = gpInvert;
    if (gpInvertBadge) gpInvertBadge.innerText = gpInvert ? 'On' : 'Off';

    const gpVib = settingsManager.get('gamepadVibration') !== false;
    const gpVibToggle = this._el.querySelector('#set-gp-vibration');
    const gpVibBadge  = this._el.querySelector('#val-gp-vibration');
    if (gpVibToggle) gpVibToggle.checked = gpVib;
    if (gpVibBadge) gpVibBadge.innerText = gpVib ? 'On' : 'Off';

    const gpHints = settingsManager.get('gamepadShowHints') !== false;
    const gpHintsToggle = this._el.querySelector('#set-gp-hints');
    const gpHintsBadge  = this._el.querySelector('#val-gp-hints');
    if (gpHintsToggle) gpHintsToggle.checked = gpHints;
    if (gpHintsBadge) gpHintsBadge.innerText = gpHints ? 'On' : 'Off';

    this._updateGamepadBadge();
  }

  _onAutoPerformanceAdjusted({ drawDistance, renderScale, currentFps, targetFps, reason }) {
    if (!this._el) return;

    // Live update draw distance and resolution in PauseMenu if open
    const drawDistSlider = this._el.querySelector('#set-draw-dist');
    const drawDistBadge  = this._el.querySelector('#val-draw-dist');
    if (drawDistSlider && drawDistance !== undefined) drawDistSlider.value = drawDistance;
    if (drawDistBadge && drawDistance !== undefined) drawDistBadge.innerText = `${drawDistance}m`;

    const scaleBadge = this._el.querySelector('#val-render-scale');
    if (scaleBadge && renderScale !== undefined) {
      const w = Math.round(window.innerWidth * renderScale);
      const h = Math.round(window.innerHeight * renderScale);
      scaleBadge.innerText = `${w} × ${h} (${Math.round(renderScale * 100)}%)`;
    }
    if (renderScale !== undefined) {
      this._el.querySelectorAll('#group-render-scale .pill-btn').forEach(btn => {
        btn.classList.toggle('active', Math.abs(Number(btn.dataset.val) - renderScale) < 0.01);
      });
    }

    const statusText = this._el.querySelector('#auto-perf-status-text');
    if (statusText) {
      const summary = autoPerformanceController.getStatusSummary();
      statusText.innerText = summary.text;
    }
  }

  _onAutoPerformanceLightingAdjusted({ tier, shadowQuality, godRays, reason }) {
    if (!this._el) return;

    // Updated once per level during transition
    if (shadowQuality) {
      this._el.querySelectorAll('#group-shadows .pill-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.val === shadowQuality);
      });
    }

    if (godRays !== undefined) {
      const godRaysToggle = this._el.querySelector('#set-god-rays');
      const godRaysBadge  = this._el.querySelector('#val-god-rays');
      if (godRaysToggle) godRaysToggle.checked = godRays;
      if (godRaysBadge) godRaysBadge.innerText = godRays ? 'On' : 'Off';
    }

    const statusText = this._el.querySelector('#auto-perf-status-text');
    if (statusText) {
      const summary = autoPerformanceController.getStatusSummary();
      statusText.innerText = summary.text;
    }
  }

  _onAutoPerformanceStatus(summary) {
    if (!this._el) return;
    const statusText = this._el.querySelector('#auto-perf-status-text');
    if (statusText) {
      statusText.innerText = summary.text;
    }
  }
}

import { emit, on, off } from '../core/EventBus.js';
import { LevelConfig } from '../core/LevelConfig.js';

export class EditorUI {
  constructor() {
    this._el = null;
    this._activeTab = 'assets'; // 'assets', 'terrain', 'world', 'paper'
    this._activeCategory = 'rocks'; // 'rocks', 'islands', 'seaweed', 'waves', 'pickups', 'hazards'
    this._activeTool = 'select'; // 'select', 'delete', 'place', 'terrain_raise', 'terrain_lower'
    this._activeType = null;
    this._activeUrl = null;
    this._activeItemName = 'None';
    this._ribbonCollapsed = false;

    // Transform cache
    this._scale = 1.0;
    this._heightY = 0.5;
    this._rotation = 0; // in radians
    this._obstacleCount = 0;

    // Bound handlers
    this._onStateUpdated = this._handleStateUpdated.bind(this);
    this._onConfigLoaded = this._handleConfigLoaded.bind(this);
    
    // Bind to the mount/unmount events for the EDITOR phase
    on('uiMount', d => { if (d.screen === 'editor') this.mount(d); });
    on('uiUnmount', d => { if (d.screen === 'editor') this.unmount(); });
  }

  mount(d) {
    if (this._el) this.unmount();
    
    const levelCfg = d?.levelCfg || {};
    const worldSize = levelCfg.worldSize || 200;
    const globalWindDir = levelCfg.globalWindDir || 0;
    const fogDensity = levelCfg.fogDensity !== undefined ? levelCfg.fogDensity : 0.006;
    const timeOfDay = levelCfg.timeOfDay !== undefined ? levelCfg.timeOfDay : 8.0;
    const isStormy = !!levelCfg.isStormy;

    this._el = document.createElement('div');
    this._el.id = 'editor-ui-container';

    // Stop 3D canvas interaction when clicking anywhere in UI
    this._el.addEventListener('pointerdown', e => e.stopPropagation());
    this._el.addEventListener('click', e => e.stopPropagation());
    this._el.addEventListener('wheel', e => e.stopPropagation());

    // Curated display names
    const getFriendlyName = (url, type) => {
      if (type === 'barrel') return 'Explosive Barrel';
      if (type === 'whirlpool') return 'Vortex Whirlpool';
      if (type === 'wind_zone') return 'Wind Gust Zone';
      if (!url) return type;
      const parts = url.split('/');
      const filename = decodeURIComponent(parts[parts.length - 1].replace('.glb', ''));
      if (filename.includes('basic stone')) return 'Basic Stone 3';
      if (filename.includes('Cliff')) return 'High Sea Cliff';
      if (filename.includes('Desert Pillar')) return 'Desert Pillar';
      if (filename.includes('Little Desert Town')) return 'Desert Outpost';
      if (filename.includes('d2VWOdthtR')) return 'Towering Spire';
      if (filename.includes('OQvi8PIZ40')) return 'Reef Crags';
      if (filename.includes('Large')) return 'Grand Boulder';
      if (filename.includes('sirkitree')) return 'Coral Archipelago';
      if (filename.includes('Mountain by Poly')) return 'Twin Peaks Island';
      if (filename.includes('Mountaintop')) return 'Volcano Peak';
      if (filename.includes('Wood Planks')) return 'Drifting Planks';
      if (filename.includes('Kelp')) return 'Giant Kelp Bed';
      if (filename.includes('Wave')) return 'Riptide Crest';
      return filename.replace('voxel_', '').replace(/ by .*/, '').substring(0, 18);
    };

    // Category data definitions
    this._categories = {
      rocks: {
        label: 'Rocks & Reefs',
        icon: '🪨',
        type: 'rock',
        items: LevelConfig.rockUrls.map(url => ({
          type: 'rock',
          url,
          name: getFriendlyName(url, 'rock'),
          icon: '🪨'
        }))
      },
      islands: {
        label: 'Islands',
        icon: '🏝️',
        type: 'island',
        items: LevelConfig.islandUrls.map(url => ({
          type: 'island',
          url,
          name: getFriendlyName(url, 'island'),
          icon: '🏝️'
        }))
      },
      seaweed: {
        label: 'Flora & Kelp',
        icon: '🌿',
        type: 'seaweed',
        items: LevelConfig.seaweedUrls.map(url => ({
          type: 'seaweed',
          url,
          name: getFriendlyName(url, 'seaweed'),
          icon: '🌿'
        }))
      },
      waves: {
        label: 'Waves & Ocean',
        icon: '🌊',
        type: 'wave_small',
        items: LevelConfig.waveUrls.map(url => ({
          type: 'wave_small',
          url,
          name: getFriendlyName(url, 'wave_small'),
          icon: '🌊'
        }))
      },
      pickups: {
        label: 'Plunder & Cargo',
        icon: '📦',
        type: 'pickup',
        items: LevelConfig.pickupUrls.map(url => ({
          type: 'pickup',
          url,
          name: getFriendlyName(url, 'pickup'),
          icon: '📦'
        }))
      },
      hazards: {
        label: 'Naval Hazards',
        icon: '⚠️',
        items: [
          { type: 'barrel', url: '', name: 'Explosive Barrel', icon: '🛢️' },
          { type: 'whirlpool', url: '', name: 'Maelstrom Whirlpool', icon: '🌀' },
          { type: 'wind_zone', url: '', name: 'Squall / Wind Zone', icon: '💨' }
        ]
      }
    };

    this._el.innerHTML = `
      <!-- Top Application Bar (Word / Blender Style) -->
      <header class="editor-top-bar">
        <!-- Brand / Identity -->
        <div class="editor-brand">
          <span class="editor-brand-icon">⚓</span>
          <div class="editor-brand-text">
            <span class="brand-title">BoatLoad</span>
            <span class="brand-badge">STUDIO</span>
          </div>
        </div>

        <!-- Menu Dropdowns Bar -->
        <nav class="editor-menu-bar">
          <div class="menu-dropdown-wrapper">
            <button class="menu-dropdown-btn" data-menu="file">File <span class="arrow-down">▾</span></button>
            <div class="menu-dropdown-content" id="menu-file">
              <button class="dropdown-item" id="btn-menu-play">
                <span class="dropdown-item-icon">▶️</span>
                <span class="dropdown-item-text">Play Level</span>
                <span class="dropdown-item-hotkey">F5</span>
              </button>
              <button class="dropdown-item" id="btn-menu-export">
                <span class="dropdown-item-icon">💾</span>
                <span class="dropdown-item-text">Export Level JSON</span>
                <span class="dropdown-item-hotkey">Ctrl+S</span>
              </button>
              <button class="dropdown-item" id="btn-menu-import">
                <span class="dropdown-item-icon">📥</span>
                <span class="dropdown-item-text">Import Level JSON...</span>
                <span class="dropdown-item-hotkey">Ctrl+O</span>
              </button>
              <div class="dropdown-divider"></div>
              <button class="dropdown-item text-danger" id="btn-menu-clear">
                <span class="dropdown-item-icon">🧹</span>
                <span class="dropdown-item-text">Clear All Placed Objects</span>
              </button>
              <div class="dropdown-divider"></div>
              <button class="dropdown-item" id="btn-menu-exit">
                <span class="dropdown-item-icon">🚪</span>
                <span class="dropdown-item-text">Exit to Main Menu</span>
                <span class="dropdown-item-hotkey">Esc</span>
              </button>
            </div>
          </div>

          <div class="menu-dropdown-wrapper">
            <button class="menu-dropdown-btn" data-menu="edit">Edit <span class="arrow-down">▾</span></button>
            <div class="menu-dropdown-content" id="menu-edit">
              <button class="dropdown-item" id="btn-menu-tool-select">
                <span class="dropdown-item-icon">✋</span>
                <span class="dropdown-item-text">Cursor / Selection Tool</span>
                <span class="dropdown-item-hotkey">V</span>
              </button>
              <button class="dropdown-item" id="btn-menu-tool-delete">
                <span class="dropdown-item-icon">🗑️</span>
                <span class="dropdown-item-text">Delete Object Tool</span>
                <span class="dropdown-item-hotkey">Del</span>
              </button>
              <div class="dropdown-divider"></div>
              <button class="dropdown-item" id="btn-menu-reset-transform">
                <span class="dropdown-item-icon">↺</span>
                <span class="dropdown-item-text">Reset Placement Transforms</span>
                <span class="dropdown-item-hotkey">R</span>
              </button>
            </div>
          </div>

          <div class="menu-dropdown-wrapper">
            <button class="menu-dropdown-btn" data-menu="view">View <span class="arrow-down">▾</span></button>
            <div class="menu-dropdown-content" id="menu-view">
              <button class="dropdown-item" data-cam="default">
                <span class="dropdown-item-icon">🎥</span>
                <span class="dropdown-item-text">Default Perspective</span>
                <span class="dropdown-item-hotkey">1</span>
              </button>
              <button class="dropdown-item" data-cam="top">
                <span class="dropdown-item-icon">🧭</span>
                <span class="dropdown-item-text">Top-Down (Map View)</span>
                <span class="dropdown-item-hotkey">7</span>
              </button>
              <button class="dropdown-item" data-cam="isometric">
                <span class="dropdown-item-icon">📐</span>
                <span class="dropdown-item-text">Isometric Angle</span>
                <span class="dropdown-item-hotkey">3</span>
              </button>
              <button class="dropdown-item" data-cam="horizon">
                <span class="dropdown-item-icon">⛵</span>
                <span class="dropdown-item-text">Sea Level View</span>
                <span class="dropdown-item-hotkey">0</span>
              </button>
            </div>
          </div>

          <div class="menu-dropdown-wrapper">
            <button class="menu-dropdown-btn" data-menu="help">Help <span class="arrow-down">▾</span></button>
            <div class="menu-dropdown-content" id="menu-help">
              <button class="dropdown-item" id="btn-menu-open-help">
                <span class="dropdown-item-icon">📖</span>
                <span class="dropdown-item-text">Keyboard &amp; Mouse Guide</span>
                <span class="dropdown-item-hotkey">?</span>
              </button>
            </div>
          </div>
        </nav>

        <!-- Ribbon Workspace Tabs (Word / Blender Tabs) -->
        <div class="editor-workspace-tabs">
          <button class="ribbon-tab-btn active" data-tab="assets">
            <span class="tab-icon">📦</span> Assets &amp; Objects
          </button>
          <button class="ribbon-tab-btn" data-tab="terrain">
            <span class="tab-icon">⛰️</span> Terraforming
          </button>
          <button class="ribbon-tab-btn" data-tab="world">
            <span class="tab-icon">🌍</span> Environment &amp; World
          </button>
          <button class="ribbon-tab-btn" data-tab="paper">
            <span class="tab-icon">🎨</span> Paper &amp; Shaders
          </button>
        </div>

        <!-- Top Right Actions -->
        <div class="editor-top-actions">
          <button class="action-btn-sm" id="btn-toggle-ribbon" title="Collapse / Expand Ribbon (Ctrl+F1)">
            <span id="ribbon-toggle-icon">▲</span>
          </button>
          <button class="action-btn-sm" id="btn-quick-export" title="Export Level JSON">
            <span>💾 Export</span>
          </button>
          <button class="action-btn-primary" id="btn-quick-play" title="Test &amp; Play Current Map">
            <span>▶️ Test Sail</span>
          </button>
          <button class="action-btn-exit" id="btn-quick-exit" title="Exit to Main Menu">
            <span>✕</span>
          </button>
        </div>
      </header>

      <!-- The Ribbon Shelf (Horizontal Workspaces) -->
      <section class="editor-ribbon-shelf" id="editor-ribbon-shelf">
        
        <!-- ==================== TAB 1: ASSETS ==================== -->
        <div class="ribbon-pane active" id="pane-assets">
          <!-- Tool selection group -->
          <div class="ribbon-group">
            <span class="ribbon-group-label">Modes</span>
            <div class="ribbon-group-row">
              <button class="shelf-btn tool-mode-btn tool-active" data-tool="select" id="tool-btn-select" title="Selection &amp; Free Navigation (V)">
                <span class="shelf-btn-icon">✋</span>
                <span class="shelf-btn-text">Cursor</span>
              </button>
              <button class="shelf-btn tool-mode-btn btn-danger-hover" data-tool="delete" id="tool-btn-delete" title="Click any object to remove it (Del)">
                <span class="shelf-btn-icon">🗑️</span>
                <span class="shelf-btn-text">Delete</span>
              </button>
            </div>
          </div>

          <div class="ribbon-divider"></div>

          <!-- Categories selector -->
          <div class="ribbon-group">
            <span class="ribbon-group-label">Asset Categories</span>
            <div class="ribbon-category-chips" id="category-chips">
              <button class="cat-chip active" data-cat="rocks">🪨 Rocks</button>
              <button class="cat-chip" data-cat="islands">🏝️ Islands</button>
              <button class="cat-chip" data-cat="hazards">⚠️ Hazards</button>
              <button class="cat-chip" data-cat="pickups">📦 Cargo</button>
              <button class="cat-chip" data-cat="seaweed">🌿 Kelp</button>
              <button class="cat-chip" data-cat="waves">🌊 Waves</button>
            </div>
          </div>

          <div class="ribbon-divider"></div>

          <!-- Items Palette Strip -->
          <div class="ribbon-group ribbon-palette-group">
            <span class="ribbon-group-label" id="palette-label">Select Model to Place</span>
            <div class="palette-scroll-container" id="palette-items-list">
              <!-- Dynamically populated -->
            </div>
          </div>

          <div class="ribbon-divider"></div>

          <!-- Transform & Placement Tweaks Group -->
          <div class="ribbon-group ribbon-transform-group">
            <span class="ribbon-group-label">Placement Properties</span>
            <div class="transform-controls-grid">
              <!-- Height (Y) -->
              <div class="transform-control-row">
                <span class="tf-label">Height (Y):</span>
                <button class="tf-step-btn" id="btn-height-dec" title="Lower height (-0.5m)">−</button>
                <span class="tf-val-badge" id="val-badge-y">0.5m</span>
                <button class="tf-step-btn" id="btn-height-inc" title="Raise height (+0.5m)">+</button>
              </div>

              <!-- Scale -->
              <div class="transform-control-row">
                <span class="tf-label">Scale:</span>
                <button class="tf-step-btn" id="btn-scale-dec" title="Decrease scale (-0.2x)">−</button>
                <span class="tf-val-badge" id="val-badge-scale">1.0x</span>
                <button class="tf-step-btn" id="btn-scale-inc" title="Increase scale (+0.2x)">+</button>
              </div>

              <!-- Rotation -->
              <div class="transform-control-row">
                <span class="tf-label">Rotation:</span>
                <button class="tf-step-btn" id="btn-rot-ccw" title="Rotate counter-clockwise 45°">↺</button>
                <span class="tf-val-badge" id="val-badge-rot">0°</span>
                <button class="tf-step-btn" id="btn-rot-cw" title="Rotate clockwise 45°">↻</button>
              </div>
            </div>
          </div>
        </div>

        <!-- ==================== TAB 2: TERRAFORMING ==================== -->
        <div class="ribbon-pane" id="pane-terrain">
          <div class="ribbon-group">
            <span class="ribbon-group-label">Voxel Sculpting</span>
            <div class="ribbon-group-row">
              <button class="shelf-btn tool-mode-btn" data-tool="terrain_raise" id="tool-btn-raise" title="Click &amp; drag on water to raise islands">
                <span class="shelf-btn-icon">⛰️</span>
                <span class="shelf-btn-text">Raise Land</span>
              </button>
              <button class="shelf-btn tool-mode-btn" data-tool="terrain_lower" id="tool-btn-lower" title="Click &amp; drag on terrain to carve valleys">
                <span class="shelf-btn-icon">⛏️</span>
                <span class="shelf-btn-text">Carve Land</span>
              </button>
            </div>
          </div>

          <div class="ribbon-divider"></div>

          <div class="ribbon-group" style="min-width: 220px;">
            <span class="ribbon-group-label">Brush Radius: <strong id="brush-radius-val">2</strong></span>
            <div class="slider-with-presets">
              <input type="range" id="brush-radius-slider" min="1" max="10" step="1" value="2" class="editor-slider">
              <div class="quick-chips-row">
                <button class="mini-chip" data-brush="1">Fine (1)</button>
                <button class="mini-chip active" data-brush="2">Small (2)</button>
                <button class="mini-chip" data-brush="4">Med (4)</button>
                <button class="mini-chip" data-brush="8">Large (8)</button>
              </div>
            </div>
          </div>

          <div class="ribbon-divider"></div>

          <div class="ribbon-group ribbon-info-group">
            <span class="ribbon-group-label">Sculpting Tips</span>
            <div class="ribbon-tip-box">
              <span class="tip-icon">💡</span>
              <span class="tip-text">Left Click &amp; Drag across ocean water or existing voxel blocks to dynamically sculpt islands and underwater reefs.</span>
            </div>
          </div>
        </div>

        <!-- ==================== TAB 3: WORLD & ENVIRONMENT ==================== -->
        <div class="ribbon-pane" id="pane-world">
          <!-- World Size -->
          <div class="ribbon-group" style="min-width: 200px;">
            <span class="ribbon-group-label">World Radius: <strong id="world-size-val">${worldSize}m</strong></span>
            <div class="slider-with-presets">
              <input type="range" id="world-size-slider" min="50" max="1000" step="10" value="${worldSize}" class="editor-slider">
              <div class="quick-chips-row">
                <button class="mini-chip" data-size="100">100m</button>
                <button class="mini-chip" data-size="200">200m</button>
                <button class="mini-chip" data-size="400">400m</button>
                <button class="mini-chip" data-size="800">800m</button>
              </div>
            </div>
          </div>

          <div class="ribbon-divider"></div>

          <!-- Wind Direction -->
          <div class="ribbon-group" style="min-width: 210px;">
            <span class="ribbon-group-label">
              Global Wind: <strong id="wind-dir-val">${globalWindDir}°</strong>
              <svg id="wind-dir-arrow" width="14" height="14" viewBox="0 0 24 24" style="transform: rotate(${globalWindDir}deg); margin-left: 4px; vertical-align: middle;">
                <path fill="#ffd700" d="M12 2L15 8H13V22H11V8H9L12 2Z"/>
              </svg>
            </span>
            <div class="slider-with-presets">
              <input type="range" id="wind-dir-slider" min="0" max="360" step="1" value="${globalWindDir}" class="editor-slider">
              <div class="quick-chips-row">
                <button class="mini-chip" data-wind="0">N 0°</button>
                <button class="mini-chip" data-wind="90">E 90°</button>
                <button class="mini-chip" data-wind="180">S 180°</button>
                <button class="mini-chip" data-wind="270">W 270°</button>
              </div>
            </div>
          </div>

          <div class="ribbon-divider"></div>

          <!-- Fog Density -->
          <div class="ribbon-group" style="min-width: 190px;">
            <span class="ribbon-group-label">Fog Density: <strong id="fog-density-val">${fogDensity.toFixed(3)}</strong></span>
            <div class="slider-with-presets">
              <input type="range" id="fog-density-slider" min="0" max="0.1" step="0.001" value="${fogDensity}" class="editor-slider">
              <div class="quick-chips-row">
                <button class="mini-chip" data-fog="0.001">Clear</button>
                <button class="mini-chip" data-fog="0.006">Mist</button>
                <button class="mini-chip" data-fog="0.050">Thick</button>
              </div>
            </div>
          </div>

          <div class="ribbon-divider"></div>

          <!-- Time of Day & Weather -->
          <div class="ribbon-group" style="min-width: 220px;">
            <span class="ribbon-group-label">Time of Day: <strong id="time-val">${Number(timeOfDay).toFixed(1)}h</strong></span>
            <div class="slider-with-presets">
              <input type="range" id="time-slider" min="0" max="24" step="0.5" value="${timeOfDay}" class="editor-slider">
              <div class="quick-chips-row">
                <button class="mini-chip" data-time="6">🌅 Dawn</button>
                <button class="mini-chip" data-time="12">☀️ Noon</button>
                <button class="mini-chip" data-time="18">🌇 Dusk</button>
                <button class="mini-chip" data-time="24">🌙 Night</button>
              </div>
            </div>
          </div>

          <div class="ribbon-divider"></div>

          <div class="ribbon-group">
            <span class="ribbon-group-label">Weather Conditions</span>
            <label class="editor-toggle-switch">
              <input type="checkbox" id="storm-check" ${isStormy ? 'checked' : ''}>
              <span class="toggle-slider"></span>
              <span class="toggle-label">⛈️ Stormy Weather</span>
            </label>
          </div>
        </div>

        <!-- ==================== TAB 4: PAPER SHADER & POST-FX ==================== -->
        <div class="ribbon-pane" id="pane-paper">
          <div class="ribbon-group">
            <span class="ribbon-group-label">Paper Effect</span>
            <label class="editor-toggle-switch">
              <input type="checkbox" id="paper-shader-check">
              <span class="toggle-slider"></span>
              <span class="toggle-label">Enable Paper FX</span>
            </label>
            <div style="margin-top: 6px;">
              <select id="paper-style-select" class="editor-select">
                <option value="0">🖋️ Hatching Style</option>
                <option value="1">🎨 Kuwahara (Painterly)</option>
              </select>
            </div>
          </div>

          <div class="ribbon-divider"></div>

          <div class="ribbon-group" style="min-width: 180px;">
            <span class="ribbon-group-label">Hatch Scale: <strong id="paper-hatch-val">10.0</strong></span>
            <input type="range" id="paper-hatch-slider" min="1" max="50" step="0.5" value="10.0" class="editor-slider">
            
            <span class="ribbon-group-label" style="margin-top: 4px;">Radius: <strong id="paper-kuwahara-val">3</strong></span>
            <input type="range" id="paper-kuwahara-slider" min="1" max="5" step="1" value="3" class="editor-slider">
          </div>

          <div class="ribbon-divider"></div>

          <div class="ribbon-group" style="min-width: 180px;">
            <span class="ribbon-group-label">Color Retention: <strong id="paper-color-val">0.40</strong></span>
            <input type="range" id="paper-color-slider" min="0" max="1" step="0.01" value="0.40" class="editor-slider">

            <span class="ribbon-group-label" style="margin-top: 4px;">Edge Threshold: <strong id="paper-edge-val">0.30</strong></span>
            <input type="range" id="paper-edge-slider" min="0" max="1" step="0.01" value="0.30" class="editor-slider">
          </div>

          <div class="ribbon-divider"></div>

          <div class="ribbon-group" style="min-width: 160px;">
            <span class="ribbon-group-label">Wobble: <strong id="paper-wobble-val">0.0005</strong></span>
            <input type="range" id="paper-wobble-slider" min="0" max="0.005" step="0.0001" value="0.0005" class="editor-slider">
            <div class="quick-chips-row" style="margin-top: 4px;">
              <button class="mini-chip" id="preset-vintage">Vintage</button>
              <button class="mini-chip" id="preset-painterly">Paint</button>
              <button class="mini-chip" id="preset-comic">Ink</button>
            </div>
          </div>
        </div>

      </section>

      <!-- Bottom Floating Status Bar -->
      <footer class="editor-status-bar" id="editor-status-bar">
        <div class="status-left">
          <span class="status-badge" id="status-tool-badge">
            <span class="status-icon">✋</span>
            <span class="status-text" id="status-tool-text">Mode: Cursor</span>
          </span>
          <span class="status-badge" id="status-item-badge" style="display:none;">
            <span class="status-text" id="status-item-text"></span>
          </span>
          <span class="status-pill" id="status-count-pill">⚓ 0 Placed Objects</span>
        </div>

        <div class="status-center">
          <span class="status-hint">
            <kbd>LMB</kbd> Place/Action &bull; <kbd>RMB Drag</kbd> Orbit View &bull; <kbd>WASD</kbd> Pan &bull; <kbd>Wheel</kbd> Height &bull; <kbd>O/P</kbd> Scale &bull; <kbd>[ / ]</kbd> Rotate
          </span>
        </div>

        <div class="status-right">
          <button class="status-btn-link" id="btn-status-help">⌨️ Shortcuts</button>
        </div>
      </footer>

      <!-- Hidden File Input for Importing Level JSON -->
      <input type="file" id="editor-file-input" accept=".json" style="display: none;">

      <!-- Keybindings / Help Modal Dialog -->
      <div class="editor-modal-backdrop" id="editor-help-modal" style="display: none;">
        <div class="editor-modal-card">
          <div class="modal-card-header">
            <h3>⚓ Map Maker — Navigation &amp; Hotkeys</h3>
            <button class="modal-close-btn" id="btn-close-help">✕</button>
          </div>
          <div class="modal-card-body">
            <div class="shortcut-group">
              <h4>Camera Navigation</h4>
              <div class="shortcut-row"><span class="shortcut-key">Right Mouse Button + Drag</span><span class="shortcut-desc">Orbit and rotate camera angle</span></div>
              <div class="shortcut-row"><span class="shortcut-key">W / A / S / D</span><span class="shortcut-desc">Pan camera forward / left / back / right</span></div>
              <div class="shortcut-row"><span class="shortcut-key">Q / E (or Shift / Space)</span><span class="shortcut-desc">Descend / Ascend camera height</span></div>
              <div class="shortcut-row"><span class="shortcut-key">1 / 7 / 3 / 0</span><span class="shortcut-desc">Snap camera to Default, Top-Down, Isometric, Horizon</span></div>
            </div>

            <div class="shortcut-group">
              <h4>Object Placement &amp; Tweaks</h4>
              <div class="shortcut-row"><span class="shortcut-key">Left Click</span><span class="shortcut-desc">Place active obstacle at cursor</span></div>
              <div class="shortcut-row"><span class="shortcut-key">Mouse Wheel</span><span class="shortcut-desc">Adjust vertical height (Y) before placing</span></div>
              <div class="shortcut-row"><span class="shortcut-key">O / P</span><span class="shortcut-desc">Scale object larger or smaller</span></div>
              <div class="shortcut-row"><span class="shortcut-key">[ / ]</span><span class="shortcut-desc">Rotate object clockwise or counter-clockwise</span></div>
              <div class="shortcut-row"><span class="shortcut-key">Delete Mode</span><span class="shortcut-desc">Click any placed obstacle to remove it</span></div>
            </div>

            <div class="shortcut-group">
              <h4>Terraforming (Voxel Land)</h4>
              <div class="shortcut-row"><span class="shortcut-key">LMB Drag (Raise Mode)</span><span class="shortcut-desc">Erect islands and reef walls from the water</span></div>
              <div class="shortcut-row"><span class="shortcut-key">LMB Drag (Lower Mode)</span><span class="shortcut-desc">Carve waterways, valleys, and craters</span></div>
            </div>
          </div>
          <div class="modal-card-footer">
            <button class="modal-action-btn" id="btn-modal-dismiss">Aye, Got It!</button>
          </div>
        </div>
      </div>

      <!-- Toast Notification Container -->
      <div id="editor-toast-container"></div>
    `;

    document.getElementById('ui-root')?.appendChild(this._el);

    // Initialize UI interactions
    this._initPalette(this._activeCategory);
    this._bindTopMenu();
    this._bindRibbonTabs();
    this._bindTransformControls();
    this._bindWorldSliders(levelCfg);
    this._bindPaperSliders();
    this._bindFileOperations();

    // Listen to EditorSystem events
    on('editorStateUpdated', this._onStateUpdated);
    on('editorConfigLoaded', this._onConfigLoaded);
  }

  // -------------------------------------------------------------------------
  // Palette Populator
  // -------------------------------------------------------------------------
  _initPalette(categoryKey) {
    const paletteContainer = this._el.querySelector('#palette-items-list');
    const paletteLabel = this._el.querySelector('#palette-label');
    if (!paletteContainer) return;

    const catData = this._categories[categoryKey];
    if (!catData) return;

    if (paletteLabel) {
      paletteLabel.innerText = `${catData.label} (${catData.items.length} items)`;
    }

    paletteContainer.innerHTML = catData.items.map(item => `
      <button class="palette-card" data-type="${item.type}" data-url="${item.url}" data-name="${item.name}" title="${item.name}">
        <span class="card-icon">${item.icon}</span>
        <span class="card-name">${item.name}</span>
      </button>
    `).join('');

    // Attach click events
    const cards = paletteContainer.querySelectorAll('.palette-card');
    cards.forEach(card => {
      card.onclick = () => {
        // Clear active classes
        this._el.querySelectorAll('.shelf-btn, .palette-card').forEach(b => b.classList.remove('tool-active'));
        card.classList.add('tool-active');

        this._activeTool = 'place';
        this._activeType = card.dataset.type;
        this._activeUrl = card.dataset.url || null;
        this._activeItemName = card.dataset.name;

        emit('editorSelectType', {
          type: this._activeType,
          url: this._activeUrl
        });

        this._updateStatusBadges();
      };
    });
  }

  // -------------------------------------------------------------------------
  // Top Menu Bar and Dropdowns
  // -------------------------------------------------------------------------
  _bindTopMenu() {
    // Menu Dropdown Toggles
    const dropdownBtns = this._el.querySelectorAll('.menu-dropdown-btn');
    const dropdowns = this._el.querySelectorAll('.menu-dropdown-content');

    const closeAllDropdowns = () => {
      dropdowns.forEach(d => d.classList.remove('open'));
      dropdownBtns.forEach(b => b.classList.remove('active'));
    };

    dropdownBtns.forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const menuId = `menu-${btn.dataset.menu}`;
        const targetMenu = this._el.querySelector(`#${menuId}`);
        const wasOpen = targetMenu?.classList.contains('open');

        closeAllDropdowns();
        if (!wasOpen && targetMenu) {
          targetMenu.classList.add('open');
          btn.classList.add('active');
        }
      };
    });

    // Close on outside click
    window.addEventListener('click', closeAllDropdowns);

    // Camera preset buttons
    const camBtns = this._el.querySelectorAll('[data-cam]');
    camBtns.forEach(btn => {
      btn.onclick = () => {
        emit('editorCameraPreset', { preset: btn.dataset.cam });
        closeAllDropdowns();
        this._showToast(`Switched Camera View: ${btn.querySelector('.dropdown-item-text')?.innerText || btn.dataset.cam}`);
      };
    });

    // File Menu items
    this._el.querySelector('#btn-menu-play')?.addEventListener('click', () => {
      closeAllDropdowns();
      emit('editorRequestPlay');
    });

    this._el.querySelector('#btn-menu-export')?.addEventListener('click', () => {
      closeAllDropdowns();
      emit('editorExport');
      this._showToast('Level exported as JSON file!');
    });

    this._el.querySelector('#btn-menu-clear')?.addEventListener('click', () => {
      closeAllDropdowns();
      if (confirm('Clear all placed obstacles and hazards from the current map?')) {
        emit('editorClearAll');
        this._showToast('Cleared all placed obstacles.');
      }
    });

    this._el.querySelector('#btn-menu-exit')?.addEventListener('click', () => {
      closeAllDropdowns();
      emit('requestPhaseChange', { phase: 'MAIN_MENU' });
    });

    // Top Right Quick Actions
    this._el.querySelector('#btn-quick-play')?.addEventListener('click', () => {
      emit('editorRequestPlay');
    });

    this._el.querySelector('#btn-quick-export')?.addEventListener('click', () => {
      emit('editorExport');
      this._showToast('Level exported as JSON file!');
    });

    this._el.querySelector('#btn-quick-exit')?.addEventListener('click', () => {
      emit('requestPhaseChange', { phase: 'MAIN_MENU' });
    });

    // Ribbon Collapse / Expand Toggle
    const toggleRibbonBtn = this._el.querySelector('#btn-toggle-ribbon');
    const ribbonShelf = this._el.querySelector('#editor-ribbon-shelf');
    const toggleIcon = this._el.querySelector('#ribbon-toggle-icon');

    const toggleRibbon = () => {
      this._ribbonCollapsed = !this._ribbonCollapsed;
      if (this._ribbonCollapsed) {
        ribbonShelf?.classList.add('collapsed');
        if (toggleIcon) toggleIcon.innerText = '▼';
        toggleRibbonBtn?.classList.add('ribbon-is-collapsed');
      } else {
        ribbonShelf?.classList.remove('collapsed');
        if (toggleIcon) toggleIcon.innerText = '▲';
        toggleRibbonBtn?.classList.remove('ribbon-is-collapsed');
      }
    };

    toggleRibbonBtn?.addEventListener('click', toggleRibbon);

    // Edit Menu Tools
    this._el.querySelector('#btn-menu-tool-select')?.addEventListener('click', () => {
      this._setTool('select');
      closeAllDropdowns();
    });

    this._el.querySelector('#btn-menu-tool-delete')?.addEventListener('click', () => {
      this._setTool('delete');
      closeAllDropdowns();
    });

    this._el.querySelector('#btn-menu-reset-transform')?.addEventListener('click', () => {
      this._resetTransform();
      closeAllDropdowns();
    });

    // Help Modal
    const helpModal = this._el.querySelector('#editor-help-modal');
    const openHelp = () => {
      closeAllDropdowns();
      if (helpModal) helpModal.style.display = 'flex';
    };
    const closeHelp = () => {
      if (helpModal) helpModal.style.display = 'none';
    };

    this._el.querySelector('#btn-menu-open-help')?.addEventListener('click', openHelp);
    this._el.querySelector('#btn-status-help')?.addEventListener('click', openHelp);
    this._el.querySelector('#btn-close-help')?.addEventListener('click', closeHelp);
    this._el.querySelector('#btn-modal-dismiss')?.addEventListener('click', closeHelp);

    if (helpModal) {
      helpModal.addEventListener('click', (e) => {
        if (e.target === helpModal) closeHelp();
      });
    }
  }

  // -------------------------------------------------------------------------
  // Ribbon Workspace Tabs
  // -------------------------------------------------------------------------
  _bindRibbonTabs() {
    const tabs = this._el.querySelectorAll('.ribbon-tab-btn');
    const panes = this._el.querySelectorAll('.ribbon-pane');

    tabs.forEach(tab => {
      tab.onclick = () => {
        tabs.forEach(t => t.classList.remove('active'));
        panes.forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        const tabKey = tab.dataset.tab;
        this._activeTab = tabKey;
        const targetPane = this._el.querySelector(`#pane-${tabKey}`);
        if (targetPane) targetPane.classList.add('active');

        // If ribbon was collapsed, uncollapse when clicking a tab
        if (this._ribbonCollapsed) {
          const toggleRibbonBtn = this._el.querySelector('#btn-toggle-ribbon');
          toggleRibbonBtn?.click();
        }
      };
    });

    // Tool Mode Buttons in Ribbon
    const toolBtns = this._el.querySelectorAll('.tool-mode-btn');
    toolBtns.forEach(btn => {
      btn.onclick = () => {
        this._setTool(btn.dataset.tool);
      };
    });

    // Category chips in Assets Ribbon
    const catChips = this._el.querySelectorAll('.cat-chip');
    catChips.forEach(chip => {
      chip.onclick = () => {
        catChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this._activeCategory = chip.dataset.cat;
        this._initPalette(this._activeCategory);
      };
    });
  }

  _setTool(tool) {
    this._el.querySelectorAll('.shelf-btn, .palette-card').forEach(b => b.classList.remove('tool-active'));
    this._activeTool = tool;
    this._activeType = null;
    this._activeUrl = null;
    this._activeItemName = 'None';

    const activeBtn = this._el.querySelector(`[data-tool="${tool}"]`);
    if (activeBtn) activeBtn.classList.add('tool-active');

    emit('editorSelectTool', { tool });
    this._updateStatusBadges();
  }

  // -------------------------------------------------------------------------
  // Transform Controls (Height, Scale, Rotation)
  // -------------------------------------------------------------------------
  _bindTransformControls() {
    const updateTransforms = () => {
      const badgeY = this._el.querySelector('#val-badge-y');
      const badgeScale = this._el.querySelector('#val-badge-scale');
      const badgeRot = this._el.querySelector('#val-badge-rot');

      if (badgeY) badgeY.innerText = `${this._heightY >= 0 ? '+' : ''}${this._heightY.toFixed(1)}m`;
      if (badgeScale) badgeScale.innerText = `${this._scale.toFixed(1)}x`;
      const deg = Math.round((THREE_DEG(this._rotation)) % 360);
      if (badgeRot) badgeRot.innerText = `${deg < 0 ? deg + 360 : deg}°`;

      this._updateStatusBadges();
    };

    const THREE_DEG = rad => rad * (180 / Math.PI);
    const THREE_RAD = deg => deg * (Math.PI / 180);

    // Height +/-
    this._el.querySelector('#btn-height-inc')?.addEventListener('click', () => {
      this._heightY = Math.round((this._heightY + 0.5) * 10) / 10;
      emit('editorSetTransform', { y: this._heightY });
      updateTransforms();
    });

    this._el.querySelector('#btn-height-dec')?.addEventListener('click', () => {
      this._heightY = Math.round((this._heightY - 0.5) * 10) / 10;
      emit('editorSetTransform', { y: this._heightY });
      updateTransforms();
    });

    // Scale +/-
    this._el.querySelector('#btn-scale-inc')?.addEventListener('click', () => {
      this._scale = Math.min(20.0, Math.round((this._scale + 0.2) * 10) / 10);
      emit('editorSetTransform', { scale: this._scale });
      updateTransforms();
    });

    this._el.querySelector('#btn-scale-dec')?.addEventListener('click', () => {
      this._scale = Math.max(0.1, Math.round((this._scale - 0.2) * 10) / 10);
      emit('editorSetTransform', { scale: this._scale });
      updateTransforms();
    });

    // Rotation ↺ / ↻
    this._el.querySelector('#btn-rot-cw')?.addEventListener('click', () => {
      this._rotation -= Math.PI / 4;
      emit('editorSetTransform', { rotation: this._rotation });
      updateTransforms();
    });

    this._el.querySelector('#btn-rot-ccw')?.addEventListener('click', () => {
      this._rotation += Math.PI / 4;
      emit('editorSetTransform', { rotation: this._rotation });
      updateTransforms();
    });

    // Brush Radius Slider in Terraforming
    const brushSlider = this._el.querySelector('#brush-radius-slider');
    const brushVal = this._el.querySelector('#brush-radius-val');
    const brushChips = this._el.querySelectorAll('[data-brush]');

    if (brushSlider) {
      brushSlider.oninput = (e) => {
        const val = parseInt(e.target.value, 10);
        if (brushVal) brushVal.innerText = val;
        this._scale = val / 2; // EditorSystem uses this._currentScale for brush radius
        emit('editorSetTransform', { scale: this._scale });
        brushChips.forEach(c => c.classList.toggle('active', parseInt(c.dataset.brush, 10) === val));
      };
    }

    brushChips.forEach(chip => {
      chip.onclick = () => {
        const val = parseInt(chip.dataset.brush, 10);
        if (brushSlider) brushSlider.value = val;
        if (brushVal) brushVal.innerText = val;
        this._scale = val / 2;
        emit('editorSetTransform', { scale: this._scale });
        brushChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      };
    });
  }

  _resetTransform() {
    this._heightY = 0.5;
    this._scale = 1.0;
    this._rotation = 0;
    emit('editorSetTransform', { y: 0.5, scale: 1.0, rotation: 0 });
    
    const badgeY = this._el.querySelector('#val-badge-y');
    const badgeScale = this._el.querySelector('#val-badge-scale');
    const badgeRot = this._el.querySelector('#val-badge-rot');
    if (badgeY) badgeY.innerText = '+0.5m';
    if (badgeScale) badgeScale.innerText = '1.0x';
    if (badgeRot) badgeRot.innerText = '0°';
    this._updateStatusBadges();
    this._showToast('Placement transform reset to defaults.');
  }

  // -------------------------------------------------------------------------
  // World & Atmosphere Controls
  // -------------------------------------------------------------------------
  _bindWorldSliders(levelCfg) {
    // World Radius
    const sizeSlider = this._el.querySelector('#world-size-slider');
    const sizeVal = this._el.querySelector('#world-size-val');
    if (sizeSlider) {
      sizeSlider.oninput = (e) => {
        const val = parseInt(e.target.value, 10);
        if (sizeVal) sizeVal.innerText = `${val}m`;
        emit('editorSetWorldSize', { size: val });
      };
    }
    this._el.querySelectorAll('[data-size]').forEach(btn => {
      btn.onclick = () => {
        const val = parseInt(btn.dataset.size, 10);
        if (sizeSlider) sizeSlider.value = val;
        if (sizeVal) sizeVal.innerText = `${val}m`;
        emit('editorSetWorldSize', { size: val });
      };
    });

    // Wind Direction
    const windSlider = this._el.querySelector('#wind-dir-slider');
    const windVal = this._el.querySelector('#wind-dir-val');
    const windArrow = this._el.querySelector('#wind-dir-arrow');
    if (windSlider) {
      windSlider.oninput = (e) => {
        const val = parseInt(e.target.value, 10);
        if (windVal) windVal.innerText = `${val}°`;
        if (windArrow) windArrow.style.transform = `rotate(${val}deg)`;
        emit('editorSetWindDir', { dir: val });
      };
    }
    this._el.querySelectorAll('[data-wind]').forEach(btn => {
      btn.onclick = () => {
        const val = parseInt(btn.dataset.wind, 10);
        if (windSlider) windSlider.value = val;
        if (windVal) windVal.innerText = `${val}°`;
        if (windArrow) windArrow.style.transform = `rotate(${val}deg)`;
        emit('editorSetWindDir', { dir: val });
      };
    });

    // Fog Density
    const fogSlider = this._el.querySelector('#fog-density-slider');
    const fogVal = this._el.querySelector('#fog-density-val');
    if (fogSlider) {
      fogSlider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        if (fogVal) fogVal.innerText = val.toFixed(3);
        emit('editorSetFogDensity', { density: val });
      };
    }
    this._el.querySelectorAll('[data-fog]').forEach(btn => {
      btn.onclick = () => {
        const val = parseFloat(btn.dataset.fog);
        if (fogSlider) fogSlider.value = val;
        if (fogVal) fogVal.innerText = val.toFixed(3);
        emit('editorSetFogDensity', { density: val });
      };
    });

    // Time of Day
    const timeSlider = this._el.querySelector('#time-slider');
    const timeVal = this._el.querySelector('#time-val');
    if (timeSlider) {
      timeSlider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        if (timeVal) timeVal.innerText = `${val.toFixed(1)}h`;
        emit('editorSetTimeOfDay', { time: val });
      };
    }
    this._el.querySelectorAll('[data-time]').forEach(btn => {
      btn.onclick = () => {
        const val = parseFloat(btn.dataset.time);
        if (timeSlider) timeSlider.value = val;
        if (timeVal) timeVal.innerText = `${val.toFixed(1)}h`;
        emit('editorSetTimeOfDay', { time: val });
      };
    });

    // Storm Checkbox
    const stormCheck = this._el.querySelector('#storm-check');
    if (stormCheck) {
      stormCheck.onchange = (e) => {
        emit('editorSetStormy', { isStormy: e.target.checked });
      };
    }
  }

  // -------------------------------------------------------------------------
  // Paper Shader Controls
  // -------------------------------------------------------------------------
  _bindPaperSliders() {
    const paperCheck = this._el.querySelector('#paper-shader-check');
    if (paperCheck) {
      paperCheck.onchange = (e) => {
        emit('editorTogglePaperShader', { enabled: e.target.checked });
      };
    }

    const styleSelect = this._el.querySelector('#paper-style-select');
    if (styleSelect) {
      styleSelect.onchange = (e) => {
        emit('editorSetPaperStyle', { style: parseInt(e.target.value, 10) });
      };
    }

    const hatchSlider = this._el.querySelector('#paper-hatch-slider');
    const hatchVal = this._el.querySelector('#paper-hatch-val');
    if (hatchSlider) {
      hatchSlider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        if (hatchVal) hatchVal.innerText = val.toFixed(1);
        emit('editorSetHatchScale', { scale: val });
      };
    }

    const kuwaharaSlider = this._el.querySelector('#paper-kuwahara-slider');
    const kuwaharaVal = this._el.querySelector('#paper-kuwahara-val');
    if (kuwaharaSlider) {
      kuwaharaSlider.oninput = (e) => {
        const val = parseInt(e.target.value, 10);
        if (kuwaharaVal) kuwaharaVal.innerText = val;
        emit('editorSetKuwaharaRadius', { radius: val });
      };
    }

    const colorSlider = this._el.querySelector('#paper-color-slider');
    const colorVal = this._el.querySelector('#paper-color-val');
    if (colorSlider) {
      colorSlider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        if (colorVal) colorVal.innerText = val.toFixed(2);
        emit('editorSetPaperColor', { amount: val });
      };
    }

    const edgeSlider = this._el.querySelector('#paper-edge-slider');
    const edgeVal = this._el.querySelector('#paper-edge-val');
    if (edgeSlider) {
      edgeSlider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        if (edgeVal) edgeVal.innerText = val.toFixed(2);
        emit('editorSetPaperEdge', { threshold: val });
      };
    }

    const wobbleSlider = this._el.querySelector('#paper-wobble-slider');
    const wobbleVal = this._el.querySelector('#paper-wobble-val');
    if (wobbleSlider) {
      wobbleSlider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        if (wobbleVal) wobbleVal.innerText = val.toFixed(4);
        emit('editorSetPaperWobble', { intensity: val });
      };
    }

    // Aesthetic Presets
    const applyShaderPreset = (hatch, kuwahara, color, edge, wobble, style = 0) => {
      if (paperCheck && !paperCheck.checked) {
        paperCheck.checked = true;
        emit('editorTogglePaperShader', { enabled: true });
      }
      if (styleSelect) {
        styleSelect.value = style;
        emit('editorSetPaperStyle', { style });
      }
      if (hatchSlider) {
        hatchSlider.value = hatch;
        if (hatchVal) hatchVal.innerText = hatch.toFixed(1);
        emit('editorSetHatchScale', { scale: hatch });
      }
      if (kuwaharaSlider) {
        kuwaharaSlider.value = kuwahara;
        if (kuwaharaVal) kuwaharaVal.innerText = kuwahara;
        emit('editorSetKuwaharaRadius', { radius: kuwahara });
      }
      if (colorSlider) {
        colorSlider.value = color;
        if (colorVal) colorVal.innerText = color.toFixed(2);
        emit('editorSetPaperColor', { amount: color });
      }
      if (edgeSlider) {
        edgeSlider.value = edge;
        if (edgeVal) edgeVal.innerText = edge.toFixed(2);
        emit('editorSetPaperEdge', { threshold: edge });
      }
      if (wobbleSlider) {
        wobbleSlider.value = wobble;
        if (wobbleVal) wobbleVal.innerText = wobble.toFixed(4);
        emit('editorSetPaperWobble', { intensity: wobble });
      }
    };

    this._el.querySelector('#preset-vintage')?.addEventListener('click', () => {
      applyShaderPreset(12.0, 3, 0.35, 0.40, 0.0008, 0);
      this._showToast('Applied "Vintage Map" shader preset.');
    });

    this._el.querySelector('#preset-painterly')?.addEventListener('click', () => {
      applyShaderPreset(10.0, 4, 0.65, 0.20, 0.0003, 1);
      this._showToast('Applied "Painterly" shader preset.');
    });

    this._el.querySelector('#preset-comic')?.addEventListener('click', () => {
      applyShaderPreset(7.0, 2, 0.20, 0.50, 0.0010, 0);
      this._showToast('Applied "Comic Ink" shader preset.');
    });
  }

  // -------------------------------------------------------------------------
  // File Import Operations
  // -------------------------------------------------------------------------
  _bindFileOperations() {
    const fileInput = this._el.querySelector('#editor-file-input');
    const importBtn = this._el.querySelector('#btn-menu-import');

    if (importBtn && fileInput) {
      importBtn.onclick = () => {
        fileInput.click();
      };

      fileInput.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const config = JSON.parse(event.target.result);
            emit('editorImportLevel', { config });
            this._showToast(`Loaded map from "${file.name}"!`);
          } catch (err) {
            console.error('Error parsing level JSON:', err);
            alert('Failed to load level JSON: invalid file structure.');
          }
          fileInput.value = '';
        };
        reader.readAsText(file);
      };
    }
  }

  // -------------------------------------------------------------------------
  // State Sync & Toast Notifications
  // -------------------------------------------------------------------------
  _handleStateUpdated(d) {
    if (!d) return;
    if (d.obstacleCount !== undefined) {
      this._obstacleCount = d.obstacleCount;
      const countPill = this._el?.querySelector('#status-count-pill');
      if (countPill) countPill.innerText = `⚓ ${this._obstacleCount} Placed Objects`;
    }

    if (d.scale !== undefined) {
      this._scale = d.scale;
      const badgeScale = this._el?.querySelector('#val-badge-scale');
      if (badgeScale) badgeScale.innerText = `${this._scale.toFixed(1)}x`;
    }

    if (d.y !== undefined) {
      this._heightY = d.y;
      const badgeY = this._el?.querySelector('#val-badge-y');
      if (badgeY) badgeY.innerText = `${this._heightY >= 0 ? '+' : ''}${this._heightY.toFixed(1)}m`;
    }

    if (d.rotation !== undefined) {
      this._rotation = d.rotation;
      const deg = Math.round((this._rotation * (180 / Math.PI)) % 360);
      const badgeRot = this._el?.querySelector('#val-badge-rot');
      if (badgeRot) badgeRot.innerText = `${deg < 0 ? deg + 360 : deg}°`;
    }

    this._updateStatusBadges();
  }

  _handleConfigLoaded(d) {
    if (!d || !d.config) return;
    const cfg = d.config;

    // Update World inputs
    if (cfg.worldSize !== undefined) {
      const sizeSlider = this._el?.querySelector('#world-size-slider');
      const sizeVal = this._el?.querySelector('#world-size-val');
      if (sizeSlider) sizeSlider.value = cfg.worldSize;
      if (sizeVal) sizeVal.innerText = `${cfg.worldSize}m`;
    }

    if (cfg.globalWindDir !== undefined) {
      const windSlider = this._el?.querySelector('#wind-dir-slider');
      const windVal = this._el?.querySelector('#wind-dir-val');
      const windArrow = this._el?.querySelector('#wind-dir-arrow');
      if (windSlider) windSlider.value = cfg.globalWindDir;
      if (windVal) windVal.innerText = `${cfg.globalWindDir}°`;
      if (windArrow) windArrow.style.transform = `rotate(${cfg.globalWindDir}deg)`;
    }

    if (cfg.fogDensity !== undefined) {
      const fogSlider = this._el?.querySelector('#fog-density-slider');
      const fogVal = this._el?.querySelector('#fog-density-val');
      if (fogSlider) fogSlider.value = cfg.fogDensity;
      if (fogVal) fogVal.innerText = cfg.fogDensity.toFixed(3);
    }

    if (cfg.timeOfDay !== undefined) {
      const timeSlider = this._el?.querySelector('#time-slider');
      const timeVal = this._el?.querySelector('#time-val');
      if (timeSlider) timeSlider.value = cfg.timeOfDay;
      if (timeVal) timeVal.innerText = `${Number(cfg.timeOfDay).toFixed(1)}h`;
    }

    if (cfg.isStormy !== undefined) {
      const stormCheck = this._el?.querySelector('#storm-check');
      if (stormCheck) stormCheck.checked = !!cfg.isStormy;
    }
  }

  _updateStatusBadges() {
    if (!this._el) return;
    const toolBadge = this._el.querySelector('#status-tool-badge');
    const toolText = this._el.querySelector('#status-tool-text');
    const itemBadge = this._el.querySelector('#status-item-badge');
    const itemText = this._el.querySelector('#status-item-text');

    if (this._activeTool === 'select') {
      if (toolText) toolText.innerText = 'Mode: Cursor & Move (V)';
      if (toolBadge) toolBadge.className = 'status-badge';
      if (itemBadge) itemBadge.style.display = 'none';
    } else if (this._activeTool === 'delete') {
      if (toolText) toolText.innerText = 'Mode: Delete (Click object to remove)';
      if (toolBadge) toolBadge.className = 'status-badge status-danger';
      if (itemBadge) itemBadge.style.display = 'none';
    } else if (this._activeTool === 'terrain_raise') {
      if (toolText) toolText.innerText = 'Sculpting: Raise Voxel Land';
      if (toolBadge) toolBadge.className = 'status-badge status-primary';
      if (itemBadge) itemBadge.style.display = 'none';
    } else if (this._activeTool === 'terrain_lower') {
      if (toolText) toolText.innerText = 'Sculpting: Carve Voxel Land';
      if (toolBadge) toolBadge.className = 'status-badge status-warning';
      if (itemBadge) itemBadge.style.display = 'none';
    } else if (this._activeTool === 'place') {
      if (toolText) toolText.innerText = 'Placing Object';
      if (toolBadge) toolBadge.className = 'status-badge status-success';
      if (itemBadge && itemText) {
        itemBadge.style.display = 'inline-flex';
        itemText.innerText = `${this._activeItemName} • H: ${this._heightY >= 0 ? '+' : ''}${this._heightY.toFixed(1)}m • Scale: ${this._scale.toFixed(1)}x`;
      }
    }
  }

  _showToast(msg) {
    const container = this._el?.querySelector('#editor-toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'editor-toast';
    toast.innerHTML = `<span class="toast-icon">⚓</span> <span>${msg}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 400);
    }, 2800);
  }

  unmount() {
    off('editorStateUpdated', this._onStateUpdated);
    off('editorConfigLoaded', this._onConfigLoaded);
    this._el?.remove();
    this._el = null;
  }
}

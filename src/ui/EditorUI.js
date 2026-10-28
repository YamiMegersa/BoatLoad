import { emit, on, off } from '../core/EventBus.js';
import { LevelConfig } from '../core/LevelConfig.js';
import { ShipRegistry, DEFAULT_SHIP_ID } from '../config/ShipRegistry.js';
import { CoursePublishModal } from './CoursePublishModal.js';

export class EditorUI {
  constructor() {
    this._el = null;
    this._publishModal = new CoursePublishModal();
    this._activeTab = 'assets'; // 'assets', 'terrain', 'boss', 'ship', 'world', 'paper'
    this._activeCategory = 'rocks'; // 'rocks', 'islands', 'seaweed', 'waves', 'pickups', 'hazards'
    this._activeTool = 'select'; // 'select', 'delete', 'place', 'terrain_raise', 'terrain_lower'
    this._activeType = null;
    this._activeUrl = null;
    this._activeItemName = 'None';
    this._ribbonCollapsed = false;
    this._selectedShipId = DEFAULT_SHIP_ID;
    this._showShipGhost = true;

    // Transform cache
    this._scale = 1.0;
    this._heightY = 0.5;
    this._rotation = 0; // in radians
    this._obstacleCount = 0;
    this._shipDamageCount = 0;

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
    this._selectedShipId = levelCfg.ship || DEFAULT_SHIP_ID;
    this._budget = levelCfg.budget !== undefined ? levelCfg.budget : 300;
    this._shipDamageCount = (levelCfg.damage || []).reduce((acc, curr) => acc + (curr.cells ? curr.cells.length : 0), 0);
    const worldSize = levelCfg.worldSize || 200;
    const globalWindDir = levelCfg.globalWindDir || 0;
    const fogDensity = levelCfg.fogDensity !== undefined ? levelCfg.fogDensity : 0.006;
    const timeOfDay = levelCfg.timeOfDay !== undefined ? levelCfg.timeOfDay : 8.0;
    const isStormy = !!levelCfg.isStormy;
    this._godRaysEnabled = levelCfg.godRays !== undefined ? !!levelCfg.godRays : (window.godRays ? window.godRays.enabled : true);
    const hasDock = levelCfg.hasDock !== false;
    this._hasDock = hasDock;

    this._el = document.createElement('div');
    this._el.id = 'editor-ui-container';

    // Stop 3D canvas interaction when clicking anywhere in UI
    this._el.addEventListener('pointerdown', e => e.stopPropagation());
    this._el.addEventListener('click', e => e.stopPropagation());
    this._el.addEventListener('wheel', e => e.stopPropagation());

    this._onKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'KeyG') {
        this._setGodRays(!this._godRaysEnabled);
      } else if (e.code === 'Digit1' || e.code === 'Numpad1') {
        emit('editorCameraPreset', { preset: 'default' });
      } else if (e.code === 'Digit7' || e.code === 'Numpad7') {
        emit('editorCameraPreset', { preset: 'top' });
      } else if (e.code === 'Digit3' || e.code === 'Numpad3') {
        emit('editorCameraPreset', { preset: 'isometric' });
      } else if (e.code === 'Digit0' || e.code === 'Numpad0') {
        emit('editorCameraPreset', { preset: 'horizon' });
      } else if (e.code === 'Digit4' || e.code === 'Numpad4') {
        emit('editorCameraPreset', { preset: 'harbor' });
      }
    };
    window.addEventListener('keydown', this._onKeyDown);

    // Curated display names
    const getFriendlyName = (url, type) => {
      if (type === 'barrel') return 'Explosive Barrel';
      if (type === 'whirlpool') return 'Vortex Whirlpool';
      if (type === 'wind_zone') return 'Wind Gust Zone';
      if (type === 'siren') return 'Siren Reef';
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
        icon: '<span class="pixel-icon icon-reef-rock size-24"></span>',
        type: 'rock',
        items: LevelConfig.rockUrls.map(url => ({
          type: 'rock',
          url,
          name: getFriendlyName(url, 'rock'),
          icon: '<span class="pixel-icon icon-reef-rock size-24"></span>'
        }))
      },
      islands: {
        label: 'Islands',
        icon: '<span class="pixel-icon icon-island size-24"></span>',
        type: 'island',
        items: LevelConfig.islandUrls.map(url => ({
          type: 'island',
          url,
          name: getFriendlyName(url, 'island'),
          icon: '<span class="pixel-icon icon-island size-24"></span>'
        }))
      },
      seaweed: {
        label: 'Flora & Kelp',
        icon: '<span class="pixel-icon icon-seaweed-kelp size-24"></span>',
        type: 'seaweed',
        items: LevelConfig.seaweedUrls.map(url => ({
          type: 'seaweed',
          url,
          name: getFriendlyName(url, 'seaweed'),
          icon: '<span class="pixel-icon icon-seaweed-kelp size-24"></span>'
        }))
      },
      waves: {
        label: 'Waves & Ocean',
        icon: '<span class="pixel-icon icon-ocean-wave size-24"></span>',
        type: 'wave_small',
        items: LevelConfig.waveUrls.map(url => ({
          type: 'wave_small',
          url,
          name: getFriendlyName(url, 'wave_small'),
          icon: '<span class="pixel-icon icon-ocean-wave size-24"></span>'
        }))
      },
      pickups: {
        label: 'Plunder & Cargo',
        icon: '<span class="pixel-icon icon-cargo-crate size-24"></span>',
        type: 'pickup',
        items: LevelConfig.pickupUrls.map(url => ({
          type: 'pickup',
          url,
          name: getFriendlyName(url, 'pickup'),
          icon: '<span class="pixel-icon icon-cargo-crate size-24"></span>'
        }))
      },
      hazards: {
        label: 'Naval Hazards',
        icon: '<span class="pixel-icon icon-powder-keg size-24"></span>',
        items: [
          { type: 'barrel', url: '', name: 'Explosive Barrel', icon: '<span class="pixel-icon icon-powder-keg size-24"></span>' },
          { type: 'whirlpool', url: '', name: 'Maelstrom Whirlpool', icon: '<span class="pixel-icon icon-maelstrom size-24"></span>' },
          { type: 'wind_zone', url: '', name: 'Squall / Wind Zone', icon: '<span class="pixel-icon icon-wind-gust size-24"></span>' },
          { type: 'siren', url: '', name: 'Siren (Hypnotic)', icon: '<span class="pixel-icon icon-siren size-24"></span>' }
        ]
      }
    };

    this._el.innerHTML = `
      <!-- Top Application Bar (Word / Blender Style) -->
      <header class="editor-top-bar">
        <!-- Brand / Identity -->
        <div class="editor-brand">
          <span class="editor-brand-icon"><span class="pixel-icon icon-anchor size-18"></span></span>
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
                <span class="dropdown-item-icon"><span class="pixel-icon icon-play size-16"></span></span>
                <span class="dropdown-item-text">Play Level</span>
                <span class="dropdown-item-hotkey">F5</span>
              </button>
              <button class="dropdown-item" id="btn-menu-export">
                <span class="dropdown-item-icon"><span class="pixel-icon icon-save-floppy size-16"></span></span>
                <span class="dropdown-item-text">Export Level JSON</span>
                <span class="dropdown-item-hotkey">Ctrl+S</span>
              </button>
              <button class="dropdown-item" id="btn-menu-import">
                <span class="dropdown-item-icon"><span class="pixel-icon icon-import-intray size-16"></span></span>
                <span class="dropdown-item-text">Import Level JSON...</span>
                <span class="dropdown-item-hotkey">Ctrl+O</span>
              </button>
              <button class="dropdown-item" id="btn-menu-import-boat">
                <span class="dropdown-item-icon"><span class="pixel-icon icon-cargo-crate size-16"></span></span>
                <span class="dropdown-item-text">Import Boat from Level...</span>
              </button>
              <div class="dropdown-divider"></div>
              <button class="dropdown-item text-danger" id="btn-menu-clear">
                <span class="dropdown-item-icon"><span class="pixel-icon icon-chisel-eraser size-16"></span></span>
                <span class="dropdown-item-text">Clear All Placed Objects</span>
              </button>
              <div class="dropdown-divider"></div>
              <button class="dropdown-item" id="btn-menu-exit">
                <span class="dropdown-item-icon"><span class="pixel-icon icon-cabin-door-exit size-16"></span></span>
                <span class="dropdown-item-text">Exit to Main Menu</span>
                <span class="dropdown-item-hotkey">Esc</span>
              </button>
            </div>
          </div>

          <div class="menu-dropdown-wrapper">
            <button class="menu-dropdown-btn" data-menu="edit">Edit <span class="arrow-down">▾</span></button>
            <div class="menu-dropdown-content" id="menu-edit">
              <button class="dropdown-item" id="btn-menu-tool-select">
                <span class="dropdown-item-icon"><span class="pixel-icon icon-hand-select size-16"></span></span>
                <span class="dropdown-item-text">Cursor / Selection Tool</span>
                <span class="dropdown-item-hotkey">V</span>
              </button>
              <button class="dropdown-item" id="btn-menu-tool-delete">
                <span class="dropdown-item-icon"><span class="pixel-icon icon-delete-basket size-16"></span></span>
                <span class="dropdown-item-text">Delete Object Tool</span>
                <span class="dropdown-item-hotkey">Del</span>
              </button>
              <div class="dropdown-divider"></div>
              <button class="dropdown-item" id="btn-menu-reset-transform">
                <span class="dropdown-item-icon"><span class="pixel-icon icon-rotate size-16"></span></span>
                <span class="dropdown-item-text">Reset Placement Transforms</span>
                <span class="dropdown-item-hotkey">R</span>
              </button>
            </div>
          </div>

          <div class="menu-dropdown-wrapper">
            <button class="menu-dropdown-btn" data-menu="view">View <span class="arrow-down">▾</span></button>
            <div class="menu-dropdown-content" id="menu-view">
              <button class="dropdown-item" data-cam="default">
                <span class="dropdown-item-icon"><span class="pixel-icon icon-cinema-camera size-16"></span></span>
                <span class="dropdown-item-text">Default Perspective</span>
                <span class="dropdown-item-hotkey">1</span>
              </button>
              <button class="dropdown-item" data-cam="top">
                <span class="dropdown-item-icon"><span class="pixel-icon icon-compass size-16"></span></span>
                <span class="dropdown-item-text">Top-Down (Map View)</span>
                <span class="dropdown-item-hotkey">7</span>
              </button>
              <button class="dropdown-item" data-cam="isometric">
                <span class="dropdown-item-icon"><span class="pixel-icon icon-calipers size-16"></span></span>
                <span class="dropdown-item-text">Isometric Angle</span>
                <span class="dropdown-item-hotkey">3</span>
              </button>
              <button class="dropdown-item" data-cam="horizon">
                <span class="dropdown-item-icon"><span class="pixel-icon icon-sloop size-16"></span></span>
                <span class="dropdown-item-text">Sea Level View</span>
                <span class="dropdown-item-hotkey">0</span>
              </button>
              <button class="dropdown-item" data-cam="harbor">
                <span class="dropdown-item-icon"><span class="pixel-icon icon-anchor size-16"></span></span>
                <span class="dropdown-item-text">Harbor Berth & Pier</span>
                <span class="dropdown-item-hotkey">4</span>
              </button>
              <div class="dropdown-divider"></div>
              <button class="dropdown-item" id="btn-menu-toggle-godrays">
                <span class="dropdown-item-icon"><span class="pixel-icon icon-god-rays size-16"></span></span>
                <span class="dropdown-item-text">God Rays</span>
                <span class="dropdown-item-hotkey" id="godrays-menu-badge">${this._godRaysEnabled !== false ? 'ON (G)' : 'OFF (G)'}</span>
              </button>
            </div>
          </div>

          <div class="menu-dropdown-wrapper">
            <button class="menu-dropdown-btn" data-menu="help">Help <span class="arrow-down">▾</span></button>
            <div class="menu-dropdown-content" id="menu-help">
              <button class="dropdown-item" id="btn-menu-open-help">
                <span class="dropdown-item-icon"><span class="pixel-icon icon-closed-logbook size-16"></span></span>
                <span class="dropdown-item-text">Keyboard &amp; Mouse Guide</span>
                <span class="dropdown-item-hotkey">?</span>
              </button>
            </div>
          </div>
        </nav>

        <!-- Ribbon Workspace Tabs (Word / Blender Tabs) -->
        <div class="editor-workspace-tabs">
          <button class="ribbon-tab-btn active" data-tab="assets">
            <span class="tab-icon"><span class="pixel-icon icon-cargo-crate size-16"></span></span> Assets &amp; Objects
          </button>
          <button class="ribbon-tab-btn" data-tab="terrain">
            <span class="tab-icon"><span class="pixel-icon icon-reef-rock size-16"></span></span> Terraforming
          </button>
          <button class="ribbon-tab-btn" data-tab="boss">
            <span class="tab-icon"><span class="pixel-icon icon-kraken size-16"></span></span> Boss (Kraken)
          </button>
          <button class="ribbon-tab-btn" data-tab="ship">
            <span class="tab-icon"><span class="pixel-icon icon-frigate size-16"></span></span> Flagship &amp; Fleet
          </button>
          <button class="ribbon-tab-btn" data-tab="world">
            <span class="tab-icon"><span class="pixel-icon icon-compass size-16"></span></span> Environment &amp; World
          </button>
          <button class="ribbon-tab-btn" data-tab="paper">
            <span class="tab-icon"><span class="pixel-icon icon-artist-palette size-16"></span></span> Paper &amp; Shaders
          </button>
        </div>

        <!-- Top Right Actions -->
        <div class="editor-top-actions">
          <button class="action-btn-sm" id="btn-toggle-ribbon" title="Collapse / Expand Ribbon (Ctrl+F1)">
            <span id="ribbon-toggle-icon">▲</span>
          </button>
          <button class="action-btn-sm" id="btn-quick-export" title="Export Level JSON">
            <span><span class="pixel-icon icon-save-floppy size-14"></span> Export</span>
          </button>
          <button class="action-btn-sm" id="btn-quick-publish" title="Publish Course to Community Harbor" style="border-color: #ffd700; color: #ffd700;">
            <span><span class="pixel-icon icon-anchor size-14"></span> Publish</span>
          </button>
          <button class="action-btn-primary" id="btn-quick-play" title="Test &amp; Play Current Map">
            <span><span class="pixel-icon icon-play size-14"></span> Test Sail</span>
          </button>
          <button class="action-btn-exit" id="btn-quick-exit" title="Exit to Main Menu">
            <span><span class="pixel-icon icon-close-cross size-14"></span></span>
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
                <span class="shelf-btn-icon"><span class="pixel-icon icon-hand-select size-18"></span></span>
                <span class="shelf-btn-text">Cursor</span>
              </button>
              <button class="shelf-btn tool-mode-btn btn-danger-hover" data-tool="delete" id="tool-btn-delete" title="Click any object to remove it (Del)">
                <span class="shelf-btn-icon"><span class="pixel-icon icon-delete-basket size-18"></span></span>
                <span class="shelf-btn-text">Delete</span>
              </button>
              <button class="shelf-btn tool-mode-btn" data-tool="place_end_location" id="tool-btn-end-location-assets" title="Click anywhere on the map to relocate the End Harbor / Destination Goal waypoint">
                <span class="shelf-btn-icon"><span class="pixel-icon icon-waypoint-flag size-18"></span></span>
                <span class="shelf-btn-text">Goal Waypoint</span>
              </button>
            </div>
          </div>

          <div class="ribbon-divider"></div>

          <!-- Categories selector -->
          <div class="ribbon-group">
            <span class="ribbon-group-label">Asset Categories</span>
            <div class="ribbon-category-chips" id="category-chips">
              <button class="cat-chip active" data-cat="rocks"><span class="pixel-icon icon-reef-rock size-16"></span> Rocks</button>
              <button class="cat-chip" data-cat="islands"><span class="pixel-icon icon-island size-16"></span> Islands</button>
              <button class="cat-chip" data-cat="hazards"><span class="pixel-icon icon-powder-keg size-16"></span> Hazards</button>
              <button class="cat-chip" data-cat="pickups"><span class="pixel-icon icon-cargo-crate size-16"></span> Cargo</button>
              <button class="cat-chip" data-cat="seaweed"><span class="pixel-icon icon-seaweed-kelp size-16"></span> Kelp</button>
              <button class="cat-chip" data-cat="waves"><span class="pixel-icon icon-ocean-wave size-16"></span> Waves</button>
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
                <span class="shelf-btn-icon"><span class="pixel-icon icon-reef-rock size-18"></span></span>
                <span class="shelf-btn-text">Raise Land</span>
              </button>
              <button class="shelf-btn tool-mode-btn" data-tool="terrain_lower" id="tool-btn-lower" title="Click &amp; drag on terrain to carve valleys">
                <span class="shelf-btn-icon"><span class="pixel-icon icon-pickaxe size-18"></span></span>
                <span class="shelf-btn-text">Carve Land</span>
              </button>
            </div>
          </div>

          <div class="ribbon-divider"></div>

          <div class="ribbon-group">
            <span class="ribbon-group-label">Brush Pattern &amp; Noise</span>
            <div class="ribbon-group-row brush-shapes-row">
              <button class="brush-shape-btn active" data-shape="circle" title="Standard circular brush">
                <span class="brush-shape-icon"><span class="pixel-icon icon-brush-circle size-16"></span></span>
                <span class="brush-shape-text">Circle</span>
              </button>
              <button class="brush-shape-btn" data-shape="organic" title="Organic coastlines and bays with fractal noise">
                <span class="brush-shape-icon"><span class="pixel-icon icon-ocean-wave size-16"></span></span>
                <span class="brush-shape-text">Organic</span>
              </button>
              <button class="brush-shape-btn" data-shape="crag" title="Jagged crags, sharp sea stacks and rocky cliffs">
                <span class="brush-shape-icon"><span class="pixel-icon icon-reef-rock size-16"></span></span>
                <span class="brush-shape-text">Crag</span>
              </button>
              <button class="brush-shape-btn" data-shape="scatter" title="Archipelago scatter, atolls and islet clusters">
                <span class="brush-shape-icon"><span class="pixel-icon icon-lightning-spark size-16"></span></span>
                <span class="brush-shape-text">Scatter</span>
              </button>
              <button class="brush-shape-btn" data-shape="square" title="Geometric square brush for quays, forts and docks">
                <span class="brush-shape-icon"><span class="pixel-icon icon-brush-square size-16"></span></span>
                <span class="brush-shape-text">Square</span>
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

          <div class="ribbon-group" style="min-width: 250px;">
            <span class="ribbon-group-label">Terrain Biome &amp; Palette</span>
            <div class="ribbon-group-row biome-chips-row">
              <button class="biome-chip active" data-biome="tropical" title="Tropical Archipelago: Emerald turf, golden sands, coral reefs, limestone cliffs">
                <span class="biome-chip-icon"><span class="pixel-icon chip-biome-tropical size-16"></span></span>
                <span class="biome-chip-text">Tropical</span>
              </button>
              <button class="biome-chip" data-biome="volcanic" title="Volcanic Outpost: Obsidian basalt, black ash sand, sulfur clay strata">
                <span class="biome-chip-icon"><span class="pixel-icon chip-biome-volcanic size-16"></span></span>
                <span class="biome-chip-text">Volcanic</span>
              </button>
              <button class="biome-chip" data-biome="autumn" title="Autumn Highlands: Amber &amp; russet turf, mountain slate, ironstone">
                <span class="biome-chip-icon"><span class="pixel-icon chip-biome-autumn size-16"></span></span>
                <span class="biome-chip-text">Autumn</span>
              </button>
              <button class="biome-chip" data-biome="desert" title="Desert Canyons: Terracotta sandstone, apricot dunes, dry sage scrub">
                <span class="biome-chip-icon"><span class="pixel-icon chip-biome-desert size-16"></span></span>
                <span class="biome-chip-text">Desert</span>
              </button>
              <button class="biome-chip" data-biome="nordic" title="Nordic Fjords: Deep spruce green, icy blue granite, glacial snow">
                <span class="biome-chip-icon"><span class="pixel-icon chip-biome-nordic size-16"></span></span>
                <span class="biome-chip-text">Nordic</span>
              </button>
            </div>
          </div>

          <div class="ribbon-divider"></div>

          <div class="ribbon-group ribbon-info-group">
            <span class="ribbon-group-label">Sculpting Tips</span>
            <div class="ribbon-tip-box">
              <span class="tip-icon"><span class="pixel-icon icon-idea-bulb size-16"></span></span>
              <span class="tip-text">Click &amp; Drag paints smooth, flat islands &amp; plateaus. Click &amp; Hold stationary pulses layers vertically to build hills without camera drift.</span>
            </div>
          </div>
        </div>

        <!-- ==================== TAB: BOSS (KRAKEN) ==================== -->
        <div class="ribbon-pane" id="pane-boss">
          <div class="ribbon-group">
            <span class="ribbon-group-label">Boss Placement</span>
            <div class="ribbon-group-row">
              <button class="shelf-btn tool-mode-btn" data-tool="place_kraken" id="tool-btn-kraken" title="Place Kraken encounter position">
                <span class="shelf-btn-icon"><span class="pixel-icon icon-kraken size-18"></span></span>
                <span class="shelf-btn-text">Place Kraken</span>
              </button>
              <button class="shelf-btn tool-mode-btn" data-tool="place_race_start" id="tool-btn-race-start" title="Place race trigger zone">
                <span class="shelf-btn-icon"><span class="pixel-icon icon-harbor-flag size-18"></span></span>
                <span class="shelf-btn-text">Race Start</span>
              </button>
              <button class="shelf-btn tool-mode-btn" data-tool="place_waypoint" id="tool-btn-waypoint" title="Place race waypoints">
                <span class="shelf-btn-icon"><span class="pixel-icon icon-waypoint-flag size-18"></span></span>
                <span class="shelf-btn-text">Add Waypoint</span>
              </button>
              <button class="shelf-btn tool-mode-btn" data-tool="place_end_location" id="tool-btn-end-location" title="Place End Harbor / Destination Goal zone">
                <span class="shelf-btn-icon"><span class="pixel-icon icon-harbor-flag size-18"></span></span>
                <span class="shelf-btn-text">Harbor Goal</span>
              </button>
              <button class="shelf-btn tool-mode-btn" data-tool="place_ship_spawn" id="tool-btn-ship-spawn" title="Place where the ship will start (Ship Spawn)">
                <span class="shelf-btn-icon"><span class="pixel-icon icon-sloop size-18"></span></span>
                <span class="shelf-btn-text">Ship Spawn</span>
              </button>
            </div>
          </div>

          <div class="ribbon-divider"></div>

          <div class="ribbon-group" style="min-width: 260px;">
            <span class="ribbon-group-label">Tentacle Configuration</span>
            <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 6px;">
              <select id="editor-tentacle-select" class="editor-select" style="flex: 1; padding: 4px 6px; background: rgba(0,0,0,0.5); color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; font-size: 12px;">
                <option value="0">Tentacle 1 (0 pts)</option>
              </select>
              <button class="mini-chip" id="btn-add-tentacle" title="Add Tentacle" style="padding: 4px 8px;"><span class="pixel-icon icon-plus size-14"></span> Add</button>
              <button class="mini-chip" id="btn-remove-tentacle" title="Delete Tentacle" style="padding: 4px 8px; background: rgba(200,40,40,0.4);"><span class="pixel-icon icon-cancel size-14"></span> Del</button>
            </div>
            <div style="display: flex; gap: 12px;">
              <div style="flex: 1;">
                <span style="font-size: 11px; opacity: 0.85;">Speed: <strong id="tentacle-speed-val">12</strong></span>
                <input type="range" id="tentacle-speed-slider" min="6" max="25" step="1" value="12" class="editor-slider">
              </div>
              <div style="flex: 1;">
                <span style="font-size: 11px; opacity: 0.85;">Duration: <strong id="tentacle-duration-val">25s</strong></span>
                <input type="range" id="tentacle-duration-slider" min="10" max="60" step="1" value="25" class="editor-slider">
              </div>
            </div>
          </div>

          <div class="ribbon-divider"></div>

          <div class="ribbon-group">
            <span class="ribbon-group-label">Encounter Actions</span>
            <div class="ribbon-group-row">
              <button class="shelf-btn" id="btn-clear-waypoints" title="Clear waypoints for active tentacle">
                <span class="shelf-btn-icon"><span class="pixel-icon icon-chisel-eraser size-18"></span></span>
                <span class="shelf-btn-text">Clear WPs</span>
              </button>
              <button class="shelf-btn btn-danger-hover" id="btn-remove-boss" title="Remove Boss encounter from level">
                <span class="shelf-btn-icon"><span class="pixel-icon icon-delete-basket size-18"></span></span>
                <span class="shelf-btn-text">Clear Boss</span>
              </button>
            </div>
          </div>
        </div>

        <!-- ==================== TAB 2.5: SHIP / FLEET ==================== -->
        <div class="ribbon-pane" id="pane-ship">
          <div class="ribbon-group" style="flex: 1; min-width: 320px;">
            <span class="ribbon-group-label">Level Flagship / Vessel (Select to Assign)</span>
            <div class="ship-cards-scroll" id="ship-cards-list">
              ${ShipRegistry.getAll().map(ship => `
                <button class="ship-card ${ship.id === this._selectedShipId ? 'active' : ''} ${ship.isGagTruck ? 'gag-ship' : ''}" data-ship-id="${ship.id}">
                  ${ship.isGagTruck ? '<span class="ship-card-gag-badge">GAG TRUCK</span>' : ''}
                  <span class="ship-card-icon">${ship.icon || '<span class="pixel-icon icon-sloop size-20"></span>'}</span>
                  <div class="ship-card-details">
                    <div class="ship-card-title">${ship.name}</div>
                    <div class="ship-card-meta">
                      <span>HP: <strong>${ship.hullHP}</strong></span>
                      <span>Speed: <strong>${ship.speedMultiplier.toFixed(2)}x</strong></span>
                      <span>Turn: <strong>${ship.turnAccel.toFixed(1)}</strong></span>
                    </div>
                  </div>
                </button>
              `).join('')}
            </div>
          </div>

          <div class="ribbon-divider"></div>

          <div class="ribbon-group" style="min-width: 175px;">
            <span class="ribbon-group-label">Vessel Assignment</span>
            <div class="ship-attached-indicator">
              <span>Attached: <strong id="ship-attached-name">${ShipRegistry.get(this._selectedShipId).name}</strong></span>
            </div>
            <label class="editor-toggle-switch" style="margin-top: 6px;">
              <input type="checkbox" id="ship-ghost-check" checked>
              <span class="toggle-slider"></span>
              <span class="toggle-label" style="font-size: 11px;"><span class="pixel-icon icon-ghost size-14"></span> 3D Ghost Preview</span>
            </label>
          </div>

          <div class="ribbon-divider"></div>

          <!-- Repair Budget Configuration -->
          <div class="ribbon-group" style="min-width: 220px;">
            <span class="ribbon-group-label">Shipyard Budget: <strong id="ship-budget-val">$${this._budget}</strong></span>
            <div class="slider-with-presets">
              <input type="range" id="ship-budget-slider" min="50" max="1500" step="25" value="${this._budget}" class="editor-slider">
              <div class="quick-chips-row">
                <button class="mini-chip budget-chip" data-budget="150">$150</button>
                <button class="mini-chip budget-chip" data-budget="300">$300</button>
                <button class="mini-chip budget-chip" data-budget="500">$500</button>
                <button class="mini-chip budget-chip" data-budget="1000">$1000</button>
              </div>
            </div>
          </div>

          <div class="ribbon-divider"></div>

          <!-- Vessel Damage / Destruction Workshop -->
          <div class="ribbon-group" style="min-width: 215px;">
            <span class="ribbon-group-label">Hull Damage &amp; Destruction</span>
            <div class="ribbon-group-row">
              <button class="shelf-btn ship-action-btn-damage" id="btn-open-damage-workshop" style="border-color: rgba(239, 68, 68, 0.4); background: linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(185, 28, 28, 0.3));" title="Open 3D Boat Destruction Workshop to carve holes, blast cannonball craters & add battle damage">
                <span class="shelf-btn-icon"><span class="pixel-icon icon-delete-basket size-18"></span></span>
                <span class="shelf-btn-text" style="color: #fca5a5;">Destruct Boat</span>
              </button>
              <button class="shelf-btn ship-action-btn-import" id="btn-ship-import-level-boat" style="border-color: rgba(56, 189, 248, 0.3);" title="Import boat & damage from an existing level JSON file">
                <span class="shelf-btn-icon"><span class="pixel-icon icon-cargo-crate size-18"></span></span>
                <span class="shelf-btn-text" style="color: #38bdf8;">Import Boat</span>
              </button>
              <input type="file" id="ship-pane-file-import" accept=".json" style="display: none;">
            </div>
            <div id="ship-damage-badge" style="font-size: 10px; color: #94a3b8; margin-top: 5px; display: flex; align-items: center; gap: 4px;">
              <span>Damage: <strong id="ship-damage-count-text" style="color: #fca5a5;">${this._shipDamageCount || 0} breaches</strong></span>
            </div>
          </div>

          <div class="ribbon-divider"></div>

          <div class="ribbon-group">
            <span class="ribbon-group-label">Test Sail Vessel</span>
            <div class="ribbon-group-row">
              <button class="shelf-btn ship-action-btn-sail" id="btn-ship-test-sail" title="Sail this vessel immediately on the map">
                <span class="shelf-btn-icon"><span class="pixel-icon icon-sloop size-18"></span></span>
                <span class="shelf-btn-text">Test Sail</span>
              </button>
              <button class="shelf-btn ship-action-btn-dock" id="btn-ship-test-dock" title="Test this vessel moored in the dock and shipyard">
                <span class="shelf-btn-icon"><span class="pixel-icon icon-anchor size-18"></span></span>
                <span class="shelf-btn-text">Test in Dock</span>
              </button>
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
                <button class="mini-chip" data-time="6"><span class="pixel-icon icon-sunrise size-14"></span> Dawn</button>
                <button class="mini-chip" data-time="12"><span class="pixel-icon icon-sun size-14"></span> Noon</button>
                <button class="mini-chip" data-time="18"><span class="pixel-icon icon-sunset size-14"></span> Dusk</button>
                <button class="mini-chip" data-time="24"><span class="pixel-icon icon-moon size-14"></span> Night</button>
              </div>
            </div>
          </div>

          <div class="ribbon-divider"></div>

          <div class="ribbon-group">
            <span class="ribbon-group-label">Weather Conditions</span>
            <label class="editor-toggle-switch">
              <input type="checkbox" id="storm-check" ${isStormy ? 'checked' : ''}>
              <span class="toggle-slider"></span>
              <span class="toggle-label"><span class="pixel-icon icon-storm size-14"></span> Stormy Weather</span>
            </label>
          </div>

          <div class="ribbon-divider"></div>

          <div class="ribbon-group">
            <span class="ribbon-group-label">Finish Destination</span>
            <button class="shelf-btn tool-mode-btn" data-tool="place_end_location" id="tool-btn-end-location-world" title="Click anywhere on the map to relocate the End Harbor / Destination Goal waypoint">
              <span class="shelf-btn-icon"><span class="pixel-icon icon-harbor-flag size-18"></span></span>
              <span class="shelf-btn-text">Move Harbor Goal</span>
            </button>
          </div>

          <div class="ribbon-divider"></div>

          <!-- Harbor Dock Toggle -->
          <div class="ribbon-group" style="min-width: 175px;">
            <span class="ribbon-group-label">Harbor Berth & Dock</span>
            <label class="editor-toggle-switch">
              <input type="checkbox" id="chk-editor-has-dock" ${hasDock ? 'checked' : ''}>
              <span class="toggle-slider"></span>
              <span class="toggle-label" id="lbl-editor-has-dock">${hasDock ? '<span class="pixel-icon icon-anchor size-14"></span> Dock Included' : '<span class="pixel-icon icon-cancel size-14"></span> Dock Removed'}</span>
            </label>
            <div style="font-size: 10px; color: #8a99a8; margin-top: 4px;">Sailing departs from dock</div>
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
                <option value="0">Hatching Style</option>
                <option value="1">Kuwahara (Painterly)</option>
              </select>
            </div>
          </div>

          <div class="ribbon-divider"></div>

          <div class="ribbon-group">
            <span class="ribbon-group-label">Atmosphere</span>
            <label class="editor-toggle-switch">
              <input type="checkbox" id="godrays-check-paper" ${this._godRaysEnabled !== false ? 'checked' : ''}>
              <span class="toggle-slider"></span>
              <span class="toggle-label"><span class="pixel-icon icon-god-rays size-14"></span> God Rays</span>
            </label>
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
            <span class="status-icon"><span class="pixel-icon icon-hand-select size-14"></span></span>
            <span class="status-text" id="status-tool-text">Mode: Cursor</span>
          </span>
          <span class="status-badge" id="status-item-badge" style="display:none;">
            <span class="status-text" id="status-item-text"></span>
          </span>
          <span class="status-pill" id="status-count-pill"><span class="pixel-icon icon-anchor size-14"></span> 0 Placed Objects</span>
        </div>

        <div class="status-center">
          <span class="status-hint">
            <kbd>LMB</kbd> Place/Action &bull; <kbd>RMB Drag</kbd> Orbit View &bull; <kbd>WASD</kbd> Pan &bull; <kbd>Wheel</kbd> Height &bull; <kbd>O/P</kbd> Scale &bull; <kbd>[ / ]</kbd> Rotate
          </span>
        </div>

        <div class="status-right">
          <button class="status-btn-link" id="btn-status-help"><span class="pixel-icon icon-closed-logbook size-14"></span> Shortcuts</button>
        </div>
      </footer>

      <!-- Hidden File Input for Importing Level JSON -->
      <input type="file" id="editor-file-input" accept=".json" style="display: none;">

      <!-- Keybindings / Help Modal Dialog -->
      <div class="editor-modal-backdrop" id="editor-help-modal" style="display: none;">
        <div class="editor-modal-card">
          <div class="modal-card-header">
            <h3><span class="pixel-icon icon-anchor size-18"></span> Map Maker — Navigation &amp; Hotkeys</h3>
            <button class="modal-close-btn" id="btn-close-help"><span class="pixel-icon icon-close size-14"></span></button>
          </div>
          <div class="modal-card-body">
            <div class="shortcut-group">
              <h4>Camera Navigation</h4>
              <div class="shortcut-row"><span class="shortcut-key">Right Mouse Button + Drag</span><span class="shortcut-desc">Orbit and rotate camera angle</span></div>
              <div class="shortcut-row"><span class="shortcut-key">W / A / S / D</span><span class="shortcut-desc">Pan camera forward / left / back / right</span></div>
              <div class="shortcut-row"><span class="shortcut-key">Q / E (or Shift / Space)</span><span class="shortcut-desc">Descend / Ascend camera height</span></div>
              <div class="shortcut-row"><span class="shortcut-key">1 / 7 / 3 / 0</span><span class="shortcut-desc">Snap camera to Default, Top-Down, Isometric, Horizon</span></div>
              <div class="shortcut-row"><span class="shortcut-key">G</span><span class="shortcut-desc">Toggle God Rays (crepuscular sun/moon rays)</span></div>
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
    this._bindBossControls();
    this._bindShipControls();
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

    // View Menu - God Rays Toggle
    this._el.querySelector('#btn-menu-toggle-godrays')?.addEventListener('click', () => {
      closeAllDropdowns();
      this._setGodRays(!this._godRaysEnabled);
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

    this._el.querySelector('#btn-quick-publish')?.addEventListener('click', () => {
      const cfg = window.gameState?._editorSystem?.getPlayableConfig?.() || this._levelCfg;
      this._publishModal?.open(cfg);
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

    // Brush Shape Buttons in Terraforming
    const shapeBtns = this._el.querySelectorAll('.brush-shape-btn');
    shapeBtns.forEach(btn => {
      btn.onclick = () => {
        shapeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const shape = btn.dataset.shape;
        emit('editorSetBrushShape', { shape });
        const name = btn.querySelector('.brush-shape-text')?.innerText || shape;
        this._showToast(`Brush pattern: ${name}`);
      };
    });

    // Terrain Biome & Palette Chips
    const biomeChips = this._el.querySelectorAll('.biome-chip');
    biomeChips.forEach(chip => {
      chip.onclick = () => {
        biomeChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const biome = chip.dataset.biome;
        emit('editorSetBiome', { biome });
        const name = chip.querySelector('.biome-chip-text')?.innerText || biome;
        this._showToast(`Active Biome: ${name} (applies to newly placed terrain)`);
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

    // God Rays Checkbox (World tab)
    const godraysCheck = this._el.querySelector('#godrays-check');
    if (godraysCheck) {
      godraysCheck.onchange = (e) => {
        this._setGodRays(e.target.checked);
      };
    }

    // Harbor Dock Checkbox
    const dockChk = this._el.querySelector('#chk-editor-has-dock');
    const dockLbl = this._el.querySelector('#lbl-editor-has-dock');
    if (dockChk) {
      dockChk.onchange = (e) => {
        const enabled = e.target.checked;
        this._hasDock = enabled;
        if (dockLbl) dockLbl.innerHTML = enabled ? '<span class="pixel-icon icon-anchor size-14"></span> Dock Included' : '<span class="pixel-icon icon-cancel size-14"></span> Dock Removed';
        emit('editorToggleDock', { hasDock: enabled });
        this._showToast(enabled ? 'Harbor dock included' : 'Harbor dock removed');
      };
    }

    this._onEditorHasDockChanged = ({ hasDock }) => {
      this._hasDock = hasDock;
      if (dockChk) dockChk.checked = hasDock;
      if (dockLbl) dockLbl.innerHTML = hasDock ? '<span class="pixel-icon icon-anchor size-14"></span> Dock Included' : '<span class="pixel-icon icon-cancel size-14"></span> Dock Removed';
    };
    on('editorHasDockChanged', this._onEditorHasDockChanged);
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

    // God Rays Checkbox (Paper tab)
    const godraysCheckPaper = this._el.querySelector('#godrays-check-paper');
    if (godraysCheckPaper) {
      godraysCheckPaper.onchange = (e) => {
        this._setGodRays(e.target.checked);
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

  _setGodRays(enabled) {
    this._godRaysEnabled = !!enabled;
    const badge = this._el?.querySelector('#godrays-menu-badge');
    if (badge) badge.innerText = this._godRaysEnabled ? 'ON (G)' : 'OFF (G)';

    const check1 = this._el?.querySelector('#godrays-check');
    if (check1) check1.checked = this._godRaysEnabled;

    const check2 = this._el?.querySelector('#godrays-check-paper');
    if (check2) check2.checked = this._godRaysEnabled;

    emit('editorToggleGodRays', { enabled: this._godRaysEnabled });
    this._showToast(`God Rays: ${this._godRaysEnabled ? 'Enabled' : 'Disabled'}`);
  }

  // -------------------------------------------------------------------------
  // Boss Encounter Controls
  // -------------------------------------------------------------------------
  _bindBossControls() {
    const tentacleSelect = this._el.querySelector('#editor-tentacle-select');
    if (tentacleSelect) {
      tentacleSelect.onchange = (e) => {
        emit('editorSelectTentacle', { index: parseInt(e.target.value, 10) });
      };
    }

    const btnAddTentacle = this._el.querySelector('#btn-add-tentacle');
    if (btnAddTentacle) {
      btnAddTentacle.onclick = () => emit('editorAddTentacle');
    }

    const btnRemoveTentacle = this._el.querySelector('#btn-remove-tentacle');
    if (btnRemoveTentacle) {
      btnRemoveTentacle.onclick = () => emit('editorRemoveTentacle');
    }

    const tentacleSpeedSlider = this._el.querySelector('#tentacle-speed-slider');
    const tentacleSpeedVal = this._el.querySelector('#tentacle-speed-val');
    if (tentacleSpeedSlider) {
      tentacleSpeedSlider.oninput = (e) => {
        const val = parseInt(e.target.value, 10);
        if (tentacleSpeedVal) tentacleSpeedVal.textContent = val;
        emit('editorSetTentacleSpeed', { speed: val });
      };
    }

    const tentacleDurationSlider = this._el.querySelector('#tentacle-duration-slider');
    const tentacleDurationVal = this._el.querySelector('#tentacle-duration-val');
    if (tentacleDurationSlider) {
      tentacleDurationSlider.oninput = (e) => {
        const val = parseInt(e.target.value, 10);
        if (tentacleDurationVal) tentacleDurationVal.textContent = val + 's';
        emit('editorSetTentacleDuration', { duration: val });
      };
    }

    const btnClearWaypoints = this._el.querySelector('#btn-clear-waypoints');
    if (btnClearWaypoints) {
      btnClearWaypoints.onclick = () => emit('editorClearWaypoints');
    }

    const btnRemoveBoss = this._el.querySelector('#btn-remove-boss');
    if (btnRemoveBoss) {
      btnRemoveBoss.onclick = () => emit('editorRemoveBoss');
    }

    // Sync UI from EditorSystem boss updates
    this._onBossConfigUpdated = (d) => {
      if (!this._el) return;
      const tSelect = this._el.querySelector('#editor-tentacle-select');
      const sSlider = this._el.querySelector('#tentacle-speed-slider');
      const sVal = this._el.querySelector('#tentacle-speed-val');
      const dSlider = this._el.querySelector('#tentacle-duration-slider');
      const dVal = this._el.querySelector('#tentacle-duration-val');

      if (tSelect && d.tentacles) {
        tSelect.innerHTML = d.tentacles.map((t, idx) => `
          <option value="${idx}">Tentacle ${idx + 1} (${t.waypoints?.length || 0} pts)</option>
        `).join('');
        tSelect.value = String(d.activeIdx ?? 0);
      }

      if (d.currentTentacle) {
        if (sSlider) {
          sSlider.value = d.currentTentacle.speed ?? 12;
          if (sVal) sVal.textContent = d.currentTentacle.speed ?? 12;
        }
        if (dSlider) {
          dSlider.value = d.currentTentacle.raceDuration ?? 25;
          if (dVal) dVal.textContent = (d.currentTentacle.raceDuration ?? 25) + 's';
        }
      }
    };
    on('editorBossConfigUpdated', this._onBossConfigUpdated);

    this._onShipSpawnPlaced = (d) => {
      if (d && d.shipSpawn) {
        const pos = d.shipSpawn.position || d.shipSpawn;
        this._showToast(`Ship Spawn set to (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)})`);
      }
    };
    on('editorShipSpawnPlaced', this._onShipSpawnPlaced);
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
  // Ship Selection & Fleet Controls
  // -------------------------------------------------------------------------
  _bindShipControls() {
    const list = this._el.querySelector('#ship-cards-list');
    if (list) {
      const cards = list.querySelectorAll('.ship-card');
      cards.forEach(card => {
        card.onclick = () => {
          const shipId = card.dataset.shipId;
          this._selectShip(shipId, true);
        };
      });
    }

    const ghostCheck = this._el.querySelector('#ship-ghost-check');
    if (ghostCheck) {
      ghostCheck.onchange = (e) => {
        this._showShipGhost = !!e.target.checked;
        emit('editorToggleShipGhost', { enabled: this._showShipGhost });
      };
    }

    const budgetSlider = this._el.querySelector('#ship-budget-slider');
    const budgetVal = this._el.querySelector('#ship-budget-val');
    if (budgetSlider) {
      budgetSlider.oninput = (e) => {
        const val = parseInt(e.target.value, 10);
        if (budgetVal) budgetVal.innerText = `$${val}`;
        this._budget = val;
        emit('editorSetBudget', { budget: val });
      };
    }
    this._el.querySelectorAll('.budget-chip').forEach(btn => {
      btn.onclick = () => {
        const val = parseInt(btn.dataset.budget, 10);
        if (budgetSlider) budgetSlider.value = val;
        if (budgetVal) budgetVal.innerText = `$${val}`;
        this._budget = val;
        emit('editorSetBudget', { budget: val });
      };
    });

    const testSailBtn = this._el.querySelector('#btn-ship-test-sail');
    if (testSailBtn) {
      testSailBtn.onclick = () => {
        emit('editorRequestPlay', { mode: 'sail' });
      };
    }

    const testDockBtn = this._el.querySelector('#btn-ship-test-dock');
    if (testDockBtn) {
      testDockBtn.onclick = () => {
        emit('editorRequestPlay', { mode: 'dock' });
      };
    }

    // Open Boat Destruction Workshop
    const openDamageBtn = this._el.querySelector('#btn-open-damage-workshop');
    if (openDamageBtn) {
      openDamageBtn.onclick = () => {
        emit('editorOpenDamageWorkshop');
      };
    }

    // Import Boat From Level File
    const shipImportBtn = this._el.querySelector('#btn-ship-import-level-boat');
    const menuImportBoatBtn = this._el.querySelector('#btn-menu-import-boat');
    const shipImportFile = this._el.querySelector('#ship-pane-file-import');

    const handleImportBoatFile = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = JSON.parse(event.target.result);
          emit('editorImportBoatFromLevel', { levelJson: json });
          this._showToast(`Imported boat from "${file.name}"!`);
        } catch (err) {
          console.error('Error importing boat from level JSON:', err);
          alert('Failed to import boat: invalid level JSON.');
        }
        shipImportFile.value = '';
      };
      reader.readAsText(file);
    };

    if (shipImportFile) {
      shipImportFile.onchange = handleImportBoatFile;
    }

    if (shipImportBtn && shipImportFile) {
      shipImportBtn.onclick = () => {
        shipImportFile.click();
      };
    }

    if (menuImportBoatBtn && shipImportFile) {
      menuImportBoatBtn.onclick = () => {
        shipImportFile.click();
      };
    }
  }

  _selectShip(shipId, emitEvent = true) {
    if (!shipId) return;
    this._selectedShipId = shipId;

    const cards = this._el.querySelectorAll('#ship-cards-list .ship-card');
    cards.forEach(c => {
      if (c.dataset.shipId === shipId) {
        c.classList.add('active');
      } else {
        c.classList.remove('active');
      }
    });

    const attachedName = this._el.querySelector('#ship-attached-name');
    const profile = ShipRegistry.get(shipId);
    if (attachedName && profile) {
      attachedName.innerText = profile.name;
    }

    if (emitEvent) {
      emit('editorSelectShip', { shipId });
      this._showToast(`Vessel attached to level: ${profile.name}`);
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
      if (countPill) countPill.innerHTML = `<span class="pixel-icon icon-anchor size-14"></span> ${this._obstacleCount} Placed Objects`;
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

    if (d.selectedShipId !== undefined && d.selectedShipId !== this._selectedShipId) {
      this._selectShip(d.selectedShipId, false);
    }

    if (d.budget !== undefined && d.budget !== this._budget) {
      this._budget = d.budget;
      const budgetSlider = this._el?.querySelector('#ship-budget-slider');
      const budgetVal = this._el?.querySelector('#ship-budget-val');
      if (budgetSlider) budgetSlider.value = this._budget;
      if (budgetVal) budgetVal.innerText = `$${this._budget}`;
    }

    if (d.damageCount !== undefined) {
      this._shipDamageCount = d.damageCount;
      const damageText = this._el?.querySelector('#ship-damage-count-text');
      if (damageText) {
        damageText.textContent = `${this._shipDamageCount} ${this._shipDamageCount === 1 ? 'breach' : 'breaches'}`;
      }
    }

    if (d.biome) {
      const biomeChips = this._el?.querySelectorAll('.biome-chip');
      biomeChips?.forEach(c => c.classList.toggle('active', c.dataset.biome === d.biome));
    }

    this._updateStatusBadges();
  }

  _handleConfigLoaded(d) {
    if (!d || !d.config) return;
    const cfg = d.config;

    if (cfg.budget !== undefined) {
      this._budget = cfg.budget;
      const budgetSlider = this._el?.querySelector('#ship-budget-slider');
      const budgetVal = this._el?.querySelector('#ship-budget-val');
      if (budgetSlider) budgetSlider.value = this._budget;
      if (budgetVal) budgetVal.innerText = `$${this._budget}`;
    }

    if (cfg.voxels && cfg.voxels.biome) {
      const biomeChips = this._el?.querySelectorAll('.biome-chip');
      biomeChips?.forEach(c => c.classList.toggle('active', c.dataset.biome === cfg.voxels.biome));
    }

    if (cfg.ship !== undefined) {
      this._selectShip(cfg.ship, false);
    }

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

    if (cfg.godRays !== undefined) {
      this._setGodRays(cfg.godRays);
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
    } else if (this._activeTool === 'place_kraken') {
      if (toolText) toolText.innerText = 'Mode: Place Kraken Boss';
      if (toolBadge) toolBadge.className = 'status-badge status-warning';
      if (itemBadge) itemBadge.style.display = 'none';
    } else if (this._activeTool === 'place_race_start') {
      if (toolText) toolText.innerText = 'Mode: Place Race Start Zone';
      if (toolBadge) toolBadge.className = 'status-badge status-primary';
      if (itemBadge) itemBadge.style.display = 'none';
    } else if (this._activeTool === 'place_waypoint') {
      if (toolText) toolText.innerText = 'Mode: Place Race Waypoint';
      if (toolBadge) toolBadge.className = 'status-badge status-success';
      if (itemBadge) itemBadge.style.display = 'none';
    } else if (this._activeTool === 'place_end_location') {
      if (toolText) toolText.innerText = 'Mode: Place Harbor Goal (Destination)';
      if (toolBadge) toolBadge.className = 'status-badge status-success';
      if (itemBadge) itemBadge.style.display = 'none';
    } else if (this._activeTool === 'place_ship_spawn') {
      if (toolText) toolText.innerText = 'Mode: Place Ship Spawn';
      if (toolBadge) toolBadge.className = 'status-badge status-primary';
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
    toast.innerHTML = `<span class="toast-icon"><span class="pixel-icon icon-anchor size-16"></span></span> <span>${msg}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 400);
    }, 2800);
  }

  unmount() {
    if (this._onKeyDown) {
      window.removeEventListener('keydown', this._onKeyDown);
      this._onKeyDown = null;
    }
    if (this._onBossConfigUpdated) {
      off('editorBossConfigUpdated', this._onBossConfigUpdated);
      this._onBossConfigUpdated = null;
    }
    if (this._onShipSpawnPlaced) {
      off('editorShipSpawnPlaced', this._onShipSpawnPlaced);
      this._onShipSpawnPlaced = null;
    }
    if (this._onEditorHasDockChanged) {
      off('editorHasDockChanged', this._onEditorHasDockChanged);
      this._onEditorHasDockChanged = null;
    }
    off('editorStateUpdated', this._onStateUpdated);
    off('editorConfigLoaded', this._onConfigLoaded);
    this._publishModal?.close();
    this._el?.remove();
    this._el = null;
  }
}

import * as THREE from 'three';

/**
 * Color coding for mesh borders based on optimization category.
 */
const BORDER_COLORS = {
  MERGED:    0x10b981, // Emerald Green: static merged meshes
  INSTANCED: 0x06b6d4, // Cyan: instanced meshes
  SHIP:      0xf59e0b, // Amber / Gold: player vessel
  ACTOR:     0xa855f7, // Purple: NPCs, monsters
  OBSTACLE:  0xec4899, // Pink: dynamic obstacles
  OCEAN:     0x3b82f6, // Blue: ocean water
  UNMERGED:  0xf43f5e, // Coral / Red: individual unmerged meshes
};

/**
 * Classifies a mesh to assign its border color.
 */
function classifyMesh(mesh) {
  if (mesh.name === 'MergedStatic') {
    return { type: 'Merged', color: BORDER_COLORS.MERGED };
  }
  if (mesh.isInstancedMesh) {
    return { type: 'Instanced', color: BORDER_COLORS.INSTANCED };
  }
  if (mesh.name === 'OceanMesh' || mesh.name?.includes('Ocean')) {
    return { type: 'Ocean', color: BORDER_COLORS.OCEAN };
  }
  if (
    mesh.userData?.isPlayerShip ||
    mesh.name?.includes('PlayerShip') ||
    mesh.parent?.name?.includes('PlayerShip') ||
    mesh.parent?.userData?.isPlayerShip
  ) {
    return { type: 'Ship', color: BORDER_COLORS.SHIP };
  }
  if (
    mesh.userData?.isNPC ||
    mesh.userData?.isGhostMerchant ||
    mesh.userData?.isBunny ||
    mesh.name?.includes('NPC') ||
    mesh.name?.includes('Monster') ||
    mesh.name?.includes('Tentacle') ||
    mesh.name?.includes('Kraken')
  ) {
    return { type: 'Actor', color: BORDER_COLORS.ACTOR };
  }
  if (
    mesh.userData?.isObstacle ||
    mesh.name?.includes('Obstacle') ||
    mesh.parent?.name?.includes('Obstacle')
  ) {
    return { type: 'Obstacle', color: BORDER_COLORS.OBSTACLE };
  }
  return { type: 'Unmerged', color: BORDER_COLORS.UNMERGED };
}

/**
 * MeshBorderOverlay
 *
 * Toggles an interactive 3D border and wireframe overlay across the scene.
 * Shortcut: Control + Shift + M
 *
 * Modes:
 *   0: OFF
 *   1: BOUNDS (3D Bounding Box Borders)
 *   2: WIREFRAME (Surface Wireframe Edges)
 *   3: BOTH (Bounding Boxes + Wireframes)
 */
export class MeshBorderOverlay {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    // Container for all 3D line box helpers
    this.group = new THREE.Group();
    this.group.name = 'MeshBorderOverlayGroup';
    this.group.userData = {
      noGodRays: true,
      noOcclusion: true,
      noWalk: true,
    };
    this.group.visible = false;
    this.scene.add(this.group);

    // Modes: 0 = OFF, 1 = BOUNDS, 2 = WIREFRAME, 3 = BOTH
    this.mode = 0;
    this.modeNames = ['OFF', 'BOUNDS', 'WIREFRAME', 'BOTH'];

    // Tracking
    this._helpers = new Map(); // mesh -> BoxHelper
    this._origWireframes = new Map(); // material -> boolean
    this._stats = { merged: 0, unmerged: 0, instanced: 0, actors: 0, total: 0 };
    this._lastScanTime = 0;
    this._toastElem = null;
    this._toastTimer = null;

    this._initToast();
    this._initKeyboard();
  }

  /**
   * Set up keyboard shortcut: Control + Shift + M
   */
  _initKeyboard() {
    window.addEventListener(
      'keydown',
      (e) => {
        const isCtrlOrMeta = e.ctrlKey || e.metaKey;
        const isShift = e.shiftKey;
        const isM = e.code === 'KeyM' || e.key === 'M' || e.key === 'm';

        if (isCtrlOrMeta && isShift && isM) {
          e.preventDefault();
          e.stopPropagation();
          this.toggle();
        }
      },
      true // capture phase to intercept before other handlers
    );
  }

  /**
   * HUD floating pill badge
   */
  _initToast() {
    this._toastElem = document.createElement('div');
    this._toastElem.id = 'mesh-border-toast';
    this._toastElem.style.cssText = `
      position: fixed;
      top: 18px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 99999;
      background: rgba(15, 23, 42, 0.88);
      border: 1px solid rgba(56, 189, 248, 0.5);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 0 15px rgba(56, 189, 248, 0.25);
      border-radius: 9999px;
      padding: 8px 18px;
      display: none;
      align-items: center;
      gap: 12px;
      font-family: 'JetBrains Mono', Consolas, Monaco, monospace;
      font-size: 13px;
      color: #f8fafc;
      pointer-events: auto;
      user-select: none;
      cursor: pointer;
      backdrop-filter: blur(8px);
      transition: opacity 0.25s ease, transform 0.25s ease;
    `;
    this._toastElem.title = 'Click to cycle mode (or press Ctrl+Shift+M)';
    this._toastElem.addEventListener('click', () => this.toggle());
    document.body.appendChild(this._toastElem);
  }

  /**
   * Cycle or set overlay mode.
   * @param {number|null} [targetMode]
   */
  toggle(targetMode = null) {
    if (targetMode !== null && typeof targetMode === 'number') {
      this.mode = targetMode % 4;
    } else {
      this.mode = (this.mode + 1) % 4;
    }

    this._applyMode();
    this._showToast();
  }

  _applyMode() {
    const showBounds = this.mode === 1 || this.mode === 3;
    const showWire = this.mode === 2 || this.mode === 3;

    // Toggle 3D Bounding Boxes
    this.group.visible = showBounds;
    if (showBounds) {
      this._scanAndRebuildBounds();
    } else {
      this._clearBounds();
    }

    // Toggle Surface Wireframes
    this._applyWireframe(showWire);
  }

  /**
   * Enable/disable wireframe mode on all scene meshes
   */
  _applyWireframe(enable) {
    this.scene.traverse((obj) => {
      if (!obj.isMesh || obj.parent === this.group) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        if (!mat) return;
        if (enable) {
          if (!this._origWireframes.has(mat)) {
            this._origWireframes.set(mat, Boolean(mat.wireframe));
          }
          mat.wireframe = true;
        } else {
          if (this._origWireframes.has(mat)) {
            mat.wireframe = this._origWireframes.get(mat);
          }
        }
      });
    });

    if (!enable) {
      this._origWireframes.clear();
    }
  }

  /**
   * Rebuild or update bounding box wireframe lines
   */
  _scanAndRebuildBounds() {
    this._stats = { merged: 0, unmerged: 0, instanced: 0, actors: 0, total: 0 };
    const seen = new Set();

    this.scene.traverse((obj) => {
      if (!obj.isMesh || obj.parent === this.group) return;
      if (!obj.visible || !obj.geometry) return;

      // Check hierarchy visibility
      for (let p = obj.parent; p; p = p.parent) {
        if (!p.visible) return;
      }

      seen.add(obj);
      this._stats.total++;

      const { type, color } = classifyMesh(obj);
      if (type === 'Merged') this._stats.merged++;
      else if (type === 'Instanced') this._stats.instanced++;
      else if (type === 'Actor' || type === 'Ship') this._stats.actors++;
      else if (type === 'Unmerged') this._stats.unmerged++;

      let helper = this._helpers.get(obj);
      if (!helper) {
        helper = new THREE.BoxHelper(obj, color);
        helper.name = `BoxHelper_${obj.name || 'Mesh'}`;
        helper.material.depthTest = true;
        helper.material.transparent = true;
        helper.material.opacity = 0.88;
        helper.material.linewidth = 1;
        helper.renderOrder = 9999;
        this.group.add(helper);
        this._helpers.set(obj, helper);
      } else {
        helper.visible = true;
        helper.update();
      }
    });

    // Remove helpers for objects no longer visible/rendered
    for (const [mesh, helper] of this._helpers.entries()) {
      if (!seen.has(mesh) || !mesh.parent) {
        helper.visible = false;
      }
    }
  }

  _clearBounds() {
    for (const helper of this._helpers.values()) {
      helper.visible = false;
    }
  }

  /**
   * Display HUD feedback toast
   */
  _showToast() {
    if (!this._toastElem) return;

    if (this._toastTimer) {
      clearTimeout(this._toastTimer);
      this._toastTimer = null;
    }

    const modeName = this.modeNames[this.mode];
    const isOff = this.mode === 0;

    if (isOff) {
      this._toastElem.innerHTML = `
        <span style="font-size: 16px;">🔲</span>
        <span style="font-weight: 700; color: #94a3b8;">MESH BORDERS: OFF</span>
        <span style="font-size: 11px; opacity: 0.6;">[Ctrl+Shift+M]</span>
      `;
    } else {
      this._toastElem.innerHTML = `
        <span style="font-size: 16px;">🔲</span>
        <span style="font-weight: 700; color: #38bdf8;">MESH BORDERS: ${modeName}</span>
        <span style="color: #64748b;">|</span>
        <span style="color: #10b981;">● Merged: ${this._stats.merged}</span>
        <span style="color: #f43f5e;">● Unmerged: ${this._stats.unmerged}</span>
        <span style="color: #06b6d4;">● Instanced: ${this._stats.instanced}</span>
        <span style="color: #f59e0b;">● Entities: ${this._stats.actors}</span>
        <span style="font-size: 11px; opacity: 0.6;">[Ctrl+Shift+M]</span>
      `;
    }

    this._toastElem.style.display = 'flex';
    this._toastElem.style.opacity = '1';

    // Auto-fade after 4 seconds
    this._toastTimer = setTimeout(() => {
      if (this._toastElem) {
        this._toastElem.style.opacity = '0';
        setTimeout(() => {
          if (this._toastElem && this._toastElem.style.opacity === '0') {
            this._toastElem.style.display = 'none';
          }
        }, 300);
      }
    }, 4000);
  }

  /**
   * Per-frame update: keeps bounds tightly attached to moving entities (e.g. ship)
   */
  update(delta, now = performance.now()) {
    if (this.mode === 0) return;

    // Rescan / update active helpers every 150ms to keep track of dynamic meshes
    if (now - this._lastScanTime >= 150) {
      this._lastScanTime = now;
      if (this.mode === 1 || this.mode === 3) {
        this._scanAndRebuildBounds();
      }
    }
  }

  dispose() {
    this._applyWireframe(false);
    this._clearBounds();
    for (const helper of this._helpers.values()) {
      helper.geometry?.dispose();
      helper.material?.dispose();
      this.group.remove(helper);
    }
    this._helpers.clear();
    this._toastElem?.remove();
  }
}

import { XBOX_BUTTON, CONTROL_SCHEMES } from './GamepadManager.js';
import { emit, on, off } from './EventBus.js';
import { settingsManager as defaultSettingsManager } from './SettingsManager.js';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[role="button"]:not([aria-disabled="true"])',
  '.level-card',
  '.shop-item-card button:not([disabled])',
].join(', ');

/**
 * GamepadNavigator — Handles:
 *  1. Topmost UI overlay/modal detection & 2D spatial focus navigation
 *  2. Slider / checkbox / tab controls and Right-Stick scrolling
 *  3. KSP-style Virtual UI Cursor Mode (L3 toggle) for dense engineering ribbons
 *  4. 3D Center Aim Reticle for Shipyard / Editor / Workshop
 *  5. Dynamic Contextual Xbox Hint Bar & Connect/Disconnect Toast
 */
export class GamepadNavigator {
  constructor({ documentRef = typeof document !== 'undefined' ? document : null, windowRef = typeof window !== 'undefined' ? window : null, settingsManager = defaultSettingsManager } = {}) {
    this._doc = documentRef;
    this._win = windowRef;
    this._settings = settingsManager;

    this._focusedEl = null;
    this._lastModalKey = null;

    // KSP Virtual Cursor state
    this.virtualCursorActive = false;
    this._cursorX = (this._win?.innerWidth || 1280) * 0.5;
    this._cursorY = (this._win?.innerHeight || 720) * 0.5;

    // DOM overlays
    this._cursorEl = null;
    this._reticleEl = null;
    this._hintBarEl = null;
    this._toastEl = null;
    this._toastTimer = null;
    this._lastHintKey = '';

    this._onConnected = ({ id }) => {
      const shortName = (id || 'Xbox Controller').replace(/\s*\([^)]*\)/g, '').slice(0, 34);
      this.showToast(`🎮 ${shortName} Connected`, 'connected');
    };
    this._onDisconnected = () => {
      this.setVirtualCursor(false);
      this.showToast('🎮 Controller Disconnected', 'disconnected');
    };
    this._onInputModeChanged = () => {
      this._syncHintVisibility();
    };
    this._onSettingChanged = ({ key }) => {
      if (key === 'gamepadShowHints') this._syncHintVisibility();
    };

    on('gamepadConnected', this._onConnected);
    on('gamepadDisconnected', this._onDisconnected);
    on('inputModeChanged', this._onInputModeChanged);
    on('settingChanged', this._onSettingChanged);
  }

  // ---------------------------------------------------------------------------
  // Visibility & Topmost Modal Detection
  // ---------------------------------------------------------------------------

  _isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (el.offsetParent === null) {
      // Allow fixed-position elements that are not display:none
      const style = this._win?.getComputedStyle?.(el);
      if (!style || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
      if (style.position !== 'fixed') return false;
    }
    const style = this._win?.getComputedStyle?.(el);
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    return true;
  }

  /**
   * Returns the highest-priority currently open UI overlay/modal, or null if
   * the player is in direct 3D gameplay.
   * @returns {{ key: string, root: HTMLElement, closeBtnSelector?: string, primarySelector?: string, backAction?: Function } | null}
   */
  getTopModal(gameState = null, pauseMenu = null) {
    const d = this._doc;
    if (!d) return null;

    // 1. AlertModal (highest z-index, outside #ui-root on document.body)
    const alertBackdrops = Array.from(d.querySelectorAll('.editor-modal-backdrop')).filter((el) => {
      if (el.id === 'community-hub-overlay' || el.id === 'course-publish-modal' || el.id === 'editor-help-modal') return false;
      return this._isVisible(el);
    });
    if (alertBackdrops.length > 0) {
      const root = alertBackdrops[alertBackdrops.length - 1];
      return {
        key: 'alert',
        root,
        primarySelector: '#alert-confirm-btn',
        closeBtnSelector: '#alert-cancel-btn, #alert-close-btn',
      };
    }

    // 2. Day 0 Shipyard Tutorial Popup
    const shipyardTut = d.getElementById('day0-shipyard-tutorial-popup');
    if (this._isVisible(shipyardTut)) {
      return {
        key: 'shipyard-tutorial',
        root: shipyardTut,
        primarySelector: '#day0-shipyard-tutorial-btn',
        closeBtnSelector: '#day0-shipyard-tutorial-btn',
      };
    }

    // 3. Day 0 Dock Tutorial Area Popup
    const dockTut = d.getElementById('day0-tutorial-area-popup');
    if (this._isVisible(dockTut)) {
      return {
        key: 'dock-tutorial',
        root: dockTut,
        primarySelector: '#day0-area-popup-btn',
        closeBtnSelector: '#day0-area-popup-btn',
      };
    }

    // 4. Pristine Reset Modal (Destruction Workshop)
    const pristineModal = d.getElementById('modal-pristine-reset');
    if (this._isVisible(pristineModal)) {
      return {
        key: 'pristine-modal',
        root: pristineModal,
        primarySelector: '#btn-confirm-pristine',
        closeBtnSelector: '#btn-cancel-pristine, #btn-cancel-pristine-x',
      };
    }

    // 5. Course Publish Modal
    const pubModal = d.getElementById('course-publish-modal');
    if (this._isVisible(pubModal)) {
      return {
        key: 'publish',
        root: pubModal,
        closeBtnSelector: '#btn-close-publish, #btn-cancel-publish',
      };
    }

    // 6. Editor Help Modal
    const editorHelp = d.getElementById('editor-help-modal');
    if (this._isVisible(editorHelp)) {
      return {
        key: 'editor-help',
        root: editorHelp,
        primarySelector: '#btn-modal-dismiss',
        closeBtnSelector: '#btn-close-help, #btn-modal-dismiss',
      };
    }

    // 7. Pause & Settings Screen
    const pauseEl = d.getElementById('pause-screen');
    if (this._isVisible(pauseEl)) {
      const settingsOpen = pauseMenu?.isSettingsOpen?.() ?? this._isVisible(pauseEl.querySelector('#pause-settings-view'));
      return {
        key: settingsOpen ? 'settings' : 'pause',
        root: settingsOpen ? (pauseEl.querySelector('#pause-settings-view') || pauseEl) : (pauseEl.querySelector('#pause-main-view') || pauseEl),
        primarySelector: settingsOpen ? '#btn-settings-done' : '#btn-resume',
        closeBtnSelector: settingsOpen ? '#btn-settings-back-top' : '#btn-resume',
        backAction: () => {
          if (settingsOpen && pauseMenu?.closeSettingsView) {
            pauseMenu.closeSettingsView();
          } else {
            emit('resumeGame');
          }
        },
      };
    }

    // 8. Community Hub
    const commEl = d.getElementById('community-hub-overlay');
    if (this._isVisible(commEl)) {
      return {
        key: 'community',
        root: commEl,
        closeBtnSelector: '#btn-close-community',
      };
    }

    // 9. Pre-Sail Nautical Chart Modal
    const preSailEl = d.getElementById('presail-chart-modal');
    if (this._isVisible(preSailEl)) {
      return {
        key: 'presail',
        root: preSailEl,
        primarySelector: '#btn-chart-set-sail',
      };
    }

    // 10. Divorce Papers Writ
    const divorceEl = d.getElementById('divorce-papers-overlay');
    if (this._isVisible(divorceEl)) {
      return {
        key: 'divorce',
        root: divorceEl,
        primarySelector: '#btn-ack-divorce-papers',
        closeBtnSelector: '#btn-ack-divorce-papers',
      };
    }

    // 11. Dialogue Box
    const dlgEl = d.getElementById('dialogue-box');
    if (this._isVisible(dlgEl)) {
      return {
        key: 'dialogue',
        root: dlgEl,
        primarySelector: '#dlg-next',
      };
    }

    // 12. Ghost Shop Modal
    const shopEl = d.getElementById('deadly-business-modal');
    if (this._isVisible(shopEl)) {
      return {
        key: 'shop',
        root: shopEl,
        closeBtnSelector: '#shop-btn-close',
      };
    }

    // 13. Captain's Logbook (Level Selector)
    const logbookEl = d.getElementById('level-selector-modal');
    if (this._isVisible(logbookEl)) {
      return {
        key: 'logbook',
        root: logbookEl,
        closeBtnSelector: '#book-close-btn',
      };
    }

    // 14. Main Menu Codex Modal
    const codexEl = d.getElementById('codex-modal');
    if (this._isVisible(codexEl)) {
      return {
        key: 'codex',
        root: codexEl,
        primarySelector: '#btn-close-codex',
        closeBtnSelector: '#btn-close-codex',
      };
    }

    // 15. Results Screen
    const resultsEl = d.getElementById('voyage-results-modal');
    if (this._isVisible(resultsEl)) {
      return {
        key: 'results',
        root: resultsEl,
        primarySelector: '#res-btn-dock, #res-btn-community',
      };
    }

    // 16. Main Menu
    if (gameState?.currentPhase === 'MAIN_MENU') {
      const menuEl = d.querySelector('.main-menu-overlay');
      if (this._isVisible(menuEl)) {
        return {
          key: 'main-menu',
          root: menuEl,
          primarySelector: '#btn-menu-sail',
        };
      }
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Modal Navigation & Focus Engine
  // ---------------------------------------------------------------------------

  _getFocusables(root) {
    if (!root) return [];
    const list = Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR));
    return list.filter((el) => {
      if (el.disabled) return false;
      if (!this._isVisible(el)) return false;
      const rect = el.getBoundingClientRect?.();
      if (rect && rect.width === 0 && rect.height === 0) return false;
      return true;
    });
  }

  _setFocus(el) {
    if (this._focusedEl && this._focusedEl !== el) {
      this._focusedEl.classList?.remove('gamepad-focused');
    }
    this._focusedEl = el || null;
    if (el) {
      el.classList?.add('gamepad-focused');
      try {
        el.focus?.({ preventScroll: true });
      } catch (_) {
        el.focus?.();
      }
      try {
        el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      } catch (_) {}
    }
  }

  clearFocus() {
    if (this._focusedEl) {
      this._focusedEl.classList?.remove('gamepad-focused');
      this._focusedEl = null;
    }
    this._lastModalKey = null;
  }

  /**
   * 2D Spatial Navigation inside `root` from current focus in `dir` ('up'|'down'|'left'|'right').
   */
  moveFocus(root, dir, preferredSelector = null) {
    const candidates = this._getFocusables(root);
    if (candidates.length === 0) return null;

    if (!this._focusedEl || !candidates.includes(this._focusedEl)) {
      const preferred = preferredSelector ? root.querySelector(preferredSelector) : null;
      const initial = (preferred && candidates.includes(preferred)) ? preferred : candidates[0];
      this._setFocus(initial);
      return initial;
    }

    const cur = this._focusedEl;
    const curRect = cur.getBoundingClientRect?.();
    if (!curRect || (curRect.width === 0 && curRect.height === 0)) {
      // Fallback DOM order when bounding boxes are mocked/unrendered
      const idx = candidates.indexOf(cur);
      const step = (dir === 'down' || dir === 'right') ? 1 : -1;
      const next = candidates[(idx + step + candidates.length) % candidates.length];
      this._setFocus(next);
      return next;
    }

    const cx = curRect.left + curRect.width * 0.5;
    const cy = curRect.top + curRect.height * 0.5;

    let best = null;
    let bestScore = Infinity;

    for (const cand of candidates) {
      if (cand === cur) continue;
      const r = cand.getBoundingClientRect();
      const tx = r.left + r.width * 0.5;
      const ty = r.top + r.height * 0.5;
      const dx = tx - cx;
      const dy = ty - cy;

      let primary = 0;
      let ortho = 0;
      if (dir === 'up') {
        if (dy >= -4) continue;
        primary = -dy;
        ortho = Math.abs(dx);
      } else if (dir === 'down') {
        if (dy <= 4) continue;
        primary = dy;
        ortho = Math.abs(dx);
      } else if (dir === 'left') {
        if (dx >= -4) continue;
        primary = -dx;
        ortho = Math.abs(dy);
      } else if (dir === 'right') {
        if (dx <= 4) continue;
        primary = dx;
        ortho = Math.abs(dy);
      }

      // Strongly favor elements aligned in the travel corridor
      const score = primary + ortho * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = cand;
      }
    }

    if (best) {
      this._setFocus(best);
      return best;
    }
    return cur;
  }

  _activateElement(el, modal) {
    if (!el) return;

    // LevelSelector smart embark: clicking an already-selected unlocked card embarks!
    if (modal?.key === 'logbook' && el.classList?.contains('level-card')) {
      const wasSelected = el.classList.contains('selected');
      el.click();
      if (wasSelected) {
        const embarkBtn = modal.root.querySelector('#btn-embark-voyage');
        if (embarkBtn && !embarkBtn.disabled) {
          embarkBtn.click();
        }
      }
      return;
    }

    if (el.tagName === 'INPUT' && el.type === 'checkbox') {
      el.checked = !el.checked;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'number')) {
      el.focus?.();
      return;
    }

    el.click?.();
  }

  _adjustSlider(slider, dir, fast = false) {
    if (!slider || slider.tagName !== 'INPUT' || slider.type !== 'range') return false;
    const min = Number(slider.min || 0);
    const max = Number(slider.max || 100);
    const step = Number(slider.step || 1);
    const cur = Number(slider.value || 0);
    const mult = fast ? 5 : 1;
    const next = Math.max(min, Math.min(max, cur + dir * step * mult));
    const rounded = step < 1 ? Number(next.toFixed(3)) : next;
    if (rounded === cur) return false;
    slider.value = String(rounded);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  _cycleTab(root, dir) {
    if (!root) return false;
    const tabs = Array.from(root.querySelectorAll('.settings-tab-btn, .shop-tab-btn, .community-tab-btn, .ribbon-tab-btn'))
      .filter((t) => this._isVisible(t));
    if (tabs.length < 2) return false;
    const activeIdx = Math.max(0, tabs.findIndex((t) => t.classList.contains('active')));
    const nextIdx = (activeIdx + dir + tabs.length) % tabs.length;
    tabs[nextIdx].click();
    return true;
  }

  _scrollContainer(target, dy, delta) {
    if (!this._doc || Math.abs(dy) < 0.05) return;
    let cur = target;
    while (cur && cur !== this._doc.body) {
      if (cur.scrollHeight > cur.clientHeight + 4) {
        const style = this._win?.getComputedStyle?.(cur);
        if (!style || style.overflowY === 'auto' || style.overflowY === 'scroll') {
          cur.scrollTop += dy * 520 * delta;
          return;
        }
      }
      cur = cur.parentElement;
    }
  }

  /**
   * Process gamepad input for the active modal. Returns true if a modal consumed input.
   */
  handleModal(gp, delta, gameState = null, pauseMenu = null) {
    const modal = this.getTopModal(gameState, pauseMenu);
    if (!modal) {
      if (this._lastModalKey) this.clearFocus();
      return false;
    }

    if (this._lastModalKey !== modal.key) {
      this._lastModalKey = modal.key;
      const candidates = this._getFocusables(modal.root);
      const preferred = modal.primarySelector ? modal.root.querySelector(modal.primarySelector) : null;
      const initial = (preferred && candidates.includes(preferred)) ? preferred : (candidates[0] || null);
      this._setFocus(initial);
    }

    // Ensure focused element is still valid
    const candidates = this._getFocusables(modal.root);
    if ((!this._focusedEl || !candidates.includes(this._focusedEl)) && candidates.length > 0) {
      const preferred = modal.primarySelector ? modal.root.querySelector(modal.primarySelector) : null;
      this._setFocus((preferred && candidates.includes(preferred)) ? preferred : candidates[0]);
    }

    // Slider Left/Right adjustment when focused on a range input
    const focused = this._focusedEl;
    if (focused && focused.tagName === 'INPUT' && focused.type === 'range') {
      const fast = gp.isPressed(XBOX_BUTTON.RB);
      if (gp.nav.left) {
        this._adjustSlider(focused, -1, fast);
      } else if (gp.nav.right) {
        this._adjustSlider(focused, 1, fast);
      }
    } else {
      if (gp.nav.left) this.moveFocus(modal.root, 'left', modal.primarySelector);
      if (gp.nav.right) this.moveFocus(modal.root, 'right', modal.primarySelector);
    }

    if (gp.nav.up) this.moveFocus(modal.root, 'up', modal.primarySelector);
    if (gp.nav.down) this.moveFocus(modal.root, 'down', modal.primarySelector);

    // Tab cycling via LB / RB
    if (gp.isJustPressed(XBOX_BUTTON.LB)) this._cycleTab(modal.root, -1);
    if (gp.isJustPressed(XBOX_BUTTON.RB)) this._cycleTab(modal.root, 1);

    // Right Stick Y scrolling inside scrollable modals (Codex, Divorce, Settings, Logbook, Community)
    if (Math.abs(gp.rightStick.y) > 0.05) {
      const scrollAnchor = this._focusedEl || modal.root.querySelector('.codex-scroll, .divorce-scroll-card, .settings-tab-pane.active, #community-course-grid, .level-entry-list') || modal.root;
      this._scrollContainer(scrollAnchor, gp.rightStick.y, delta);
    }

    // Confirm (A)
    if (gp.isJustPressed(XBOX_BUTTON.A)) {
      if (modal.key === 'dialogue' || modal.key === 'presail' || modal.key === 'dock-tutorial' || modal.key === 'shipyard-tutorial') {
        const primary = modal.root.querySelector(modal.primarySelector);
        if (primary) primary.click();
      } else if (this._focusedEl) {
        this._activateElement(this._focusedEl, modal);
      } else if (modal.primarySelector) {
        modal.root.querySelector(modal.primarySelector)?.click();
      }
    }

    // Start / Menu also sets sail on Pre-Sail Chart or unpauses Pause screen
    if (gp.isJustPressed(XBOX_BUTTON.MENU)) {
      if (modal.key === 'presail') {
        modal.root.querySelector(modal.primarySelector)?.click();
      } else if (modal.key === 'pause' || modal.key === 'settings') {
        emit('resumeGame');
      }
    }

    // Back / Close (B)
    if (gp.isJustPressed(XBOX_BUTTON.B)) {
      if (modal.backAction) {
        modal.backAction();
      } else if (modal.closeBtnSelector) {
        modal.root.querySelector(modal.closeBtnSelector)?.click();
      }
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // KSP-Style Virtual UI Cursor Mode (L3 Toggle in Shipyard / Editor / Workshop)
  // ---------------------------------------------------------------------------

  toggleVirtualCursor() {
    this.setVirtualCursor(!this.virtualCursorActive);
    return this.virtualCursorActive;
  }

  setVirtualCursor(enabled) {
    const next = Boolean(enabled);
    if (this.virtualCursorActive === next) return;
    this.virtualCursorActive = next;
    if (next && this._win) {
      this._cursorX = this._win.innerWidth * 0.5;
      this._cursorY = this._win.innerHeight * 0.5;
    }
    this._syncCursorEl();
  }

  _ensureCursorEl() {
    if (this._cursorEl || !this._doc) return;
    const el = this._doc.createElement('div');
    el.id = 'gamepad-virtual-cursor';
    el.innerHTML = `<div class="gp-cursor-ring"></div><div class="gp-cursor-dot"></div>`;
    el.style.display = 'none';
    (this._doc.body || this._doc.documentElement)?.appendChild(el);
    this._cursorEl = el;
  }

  _syncCursorEl() {
    if (!this._doc) return;
    if (!this._cursorEl && this.virtualCursorActive) this._ensureCursorEl();
    if (!this._cursorEl) return;
    if (this.virtualCursorActive) {
      this._cursorEl.style.display = 'block';
      this._cursorEl.style.transform = `translate3d(${Math.round(this._cursorX)}px, ${Math.round(this._cursorY)}px, 0)`;
    } else {
      this._cursorEl.style.display = 'none';
    }
  }

  updateVirtualCursor(gp, delta, phase) {
    if (!this.virtualCursorActive || !this._doc || !this._win) return;

    const precision = gp.isPressed(XBOX_BUTTON.LT) ? 0.35 : 1.0;
    const speed = 780 * precision * delta;
    this._cursorX = Math.max(4, Math.min(this._win.innerWidth - 4, this._cursorX + gp.leftStick.x * speed));
    this._cursorY = Math.max(4, Math.min(this._win.innerHeight - 4, this._cursorY + gp.leftStick.y * speed));

    // Also allow D-Pad micro-nudge
    if (gp.nav.left) this._cursorX = Math.max(4, this._cursorX - 18);
    if (gp.nav.right) this._cursorX = Math.min(this._win.innerWidth - 4, this._cursorX + 18);
    if (gp.nav.up) this._cursorY = Math.max(4, this._cursorY - 18);
    if (gp.nav.down) this._cursorY = Math.min(this._win.innerHeight - 4, this._cursorY + 18);

    this._syncCursorEl();

    const under = this._doc.elementFromPoint?.(this._cursorX, this._cursorY);

    // Highlight hoverable element under virtual cursor
    const hoverTarget = under?.closest?.('button, input, select, .shelf-btn, .damage-tool-btn, .ship-card, .dropdown-item') || under;
    if (hoverTarget && hoverTarget !== this._focusedEl) {
      this._setFocus(hoverTarget);
    }

    // Right Stick Y scrolls element under cursor
    if (Math.abs(gp.rightStick.y) > 0.05 && under) {
      this._scrollContainer(under, gp.rightStick.y, delta);
    }

    // Editor ribbon tab switch in cursor mode
    if (phase === 'EDITOR') {
      const editorRoot = this._doc.getElementById('editor-ui-container');
      if (editorRoot) {
        if (gp.isJustPressed(XBOX_BUTTON.LB)) this._cycleTab(editorRoot, -1);
        if (gp.isJustPressed(XBOX_BUTTON.RB)) this._cycleTab(editorRoot, 1);
      }
    }

    if (gp.isJustPressed(XBOX_BUTTON.A) && under) {
      const target = hoverTarget || under;
      if (target.tagName === 'INPUT' && target.type === 'range') {
        const rect = target.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (this._cursorX - rect.left) / Math.max(1, rect.width)));
        const min = Number(target.min || 0);
        const max = Number(target.max || 100);
        const step = Number(target.step || 1);
        const val = Math.round((min + ratio * (max - min)) / step) * step;
        target.value = String(val);
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: this._cursorX, clientY: this._cursorY }));
        target.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: this._cursorX, clientY: this._cursorY }));
        target.click?.();
      }
    }

    if (gp.isJustPressed(XBOX_BUTTON.B)) {
      this.setVirtualCursor(false);
    }
  }

  // ---------------------------------------------------------------------------
  // 3D Center Reticle (Shipyard / Editor / Destruction Workshop)
  // ---------------------------------------------------------------------------

  updateReticle(show) {
    if (!this._doc) return;
    if (show && !this._reticleEl) {
      const el = this._doc.createElement('div');
      el.id = 'gamepad-build-reticle';
      el.innerHTML = `<span class="reticle-h"></span><span class="reticle-v"></span><span class="reticle-dot"></span>`;
      (this._doc.getElementById('ui-root') || this._doc.body)?.appendChild(el);
      this._reticleEl = el;
    }
    if (this._reticleEl) {
      this._reticleEl.style.display = show ? 'block' : 'none';
    }
  }

  // ---------------------------------------------------------------------------
  // Dynamic Contextual Xbox Hint Bar & Connect/Disconnect Toast
  // ---------------------------------------------------------------------------

  _ensureHintBar() {
    if (this._hintBarEl || !this._doc) return;
    const el = this._doc.createElement('div');
    el.id = 'gamepad-hint-bar';
    el.style.display = 'none';
    (this._doc.getElementById('ui-root') || this._doc.body)?.appendChild(el);
    this._hintBarEl = el;
  }

  _syncHintVisibility() {
    if (!this._hintBarEl) return;
    const showHints = this._settings?.get?.('gamepadShowHints') !== false;
    const isGp = this._doc?.body?.classList?.contains('input-mode-gamepad');
    this._hintBarEl.style.display = (showHints && isGp && this._lastHintKey) ? 'flex' : 'none';
  }

  updateHints({ phase, isWorkshop = false, isModal = false, isCursorMode = false, activeQTE = null, activeQTEType = null, isDirector = false } = {}) {
    if (!this._doc) return;
    const showHints = this._settings?.get?.('gamepadShowHints') !== false;
    const isGp = this._doc.body?.classList?.contains('input-mode-gamepad');
    if (!showHints || !isGp) {
      if (this._hintBarEl) this._hintBarEl.style.display = 'none';
      return;
    }

    this._ensureHintBar();

    let key = 'MENU';
    let items = [];

    if (isCursorMode) {
      key = 'CURSOR';
      items = [
        { btn: 'LS', kind: 'stick', text: 'Move Cursor (LT Slow)' },
        { btn: 'A', kind: 'a', text: 'Click' },
        { btn: 'RS', kind: 'stick', text: 'Scroll' },
        { btn: 'B / L3', kind: 'b', text: 'Exit Cursor' },
      ];
    } else if (isDirector) {
      key = 'DIRECTOR';
      items = [
        { btn: 'LS / RS', kind: 'stick', text: 'Fly / Look' },
        { btn: 'RT / LT', kind: 'bump', text: 'Up / Down' },
        { btn: 'A', kind: 'a', text: 'Freeze' },
        { btn: 'X', kind: 'x', text: 'Keyframe' },
        { btn: 'Y', kind: 'y', text: 'Hide UI' },
        { btn: 'B', kind: 'b', text: 'Exit' },
      ];
    } else if (isModal) {
      key = 'MODAL';
      items = [
        { btn: 'D-Pad', kind: 'stick', text: 'Navigate' },
        { btn: 'A', kind: 'a', text: 'Select' },
        { btn: 'B', kind: 'b', text: 'Back' },
        { btn: 'LB / RB', kind: 'bump', text: 'Tabs' },
      ];
    } else if (isWorkshop) {
      key = 'WORKSHOP';
      items = [
        { btn: 'LS / RS', kind: 'stick', text: 'Fly / Look' },
        { btn: 'RT / LT', kind: 'bump', text: 'Up / Down' },
        { btn: 'A', kind: 'a', text: 'Carve' },
        { btn: 'B', kind: 'b', text: 'Undo' },
        { btn: 'LB / RB', kind: 'bump', text: 'Brush' },
        { btn: 'X / Y', kind: 'x', text: 'Rotate / Pitch' },
        { btn: 'L3', kind: 'stick', text: 'UI Cursor' },
      ];
    } else if (phase === 'OBSTACLE') {
      key = `SAIL_${activeQTE || 'NONE'}_${activeQTEType || 'ANY'}`;
      if (activeQTE === 'draw') {
        items = [
          { btn: 'LS', kind: 'stick', text: 'Steer' },
          { btn: 'Spin RS', kind: 'stick', text: 'Bail Circle (100%)' },
          { btn: 'X / A', kind: 'x', text: 'Quick Bail (50%)' },
          { btn: 'Menu', kind: 'bump', text: 'Pause' },
        ];
      } else if (activeQTE === 'hold') {
        items = [
          { btn: 'LS', kind: 'stick', text: 'Steer' },
          { btn: 'Hold LT / RT / A', kind: 'a', text: activeQTEType === 'BAIL' ? 'Bail Water' : 'Brace Against Siren' },
          { btn: 'Menu', kind: 'bump', text: 'Pause' },
        ];
      } else if (activeQTE === 'timing') {
        items = [
          { btn: 'LS', kind: 'stick', text: 'Steer' },
          { btn: 'RT / A', kind: 'a', text: 'Strike Harpoon!' },
          { btn: 'Y', kind: 'y', text: 'Lantern / Fog' },
        ];
      } else {
        items = [
          { btn: 'LS', kind: 'stick', text: 'Steer Wheel' },
          { btn: 'RS', kind: 'stick', text: 'Look' },
          { btn: 'RT / A', kind: 'a', text: 'Action' },
          { btn: 'Y', kind: 'y', text: 'Lantern / Fog' },
          { btn: 'Menu', kind: 'bump', text: 'Pause' },
        ];
      }
    } else if (phase === 'SHIPYARD') {
      key = 'SHIPYARD';
      items = [
        { btn: 'LS / RS', kind: 'stick', text: 'Fly / Look' },
        { btn: 'RT / LT', kind: 'bump', text: 'Up / Down' },
        { btn: 'A', kind: 'a', text: 'Place' },
        { btn: 'B', kind: 'b', text: 'Undo' },
        { btn: 'LB / RB', kind: 'bump', text: 'Brush' },
        { btn: 'X / Y', kind: 'x', text: 'Rotate / Pitch' },
        { btn: 'L3', kind: 'stick', text: 'UI Cursor' },
        { btn: 'View', kind: 'bump', text: 'Set Sail' },
      ];
    } else if (phase === 'DOCK') {
      key = 'DOCK';
      items = [
        { btn: 'LS / RS', kind: 'stick', text: 'Walk / Look' },
        { btn: 'A', kind: 'a', text: 'Jump' },
        { btn: 'X', kind: 'x', text: 'Interact' },
        { btn: 'LB', kind: 'bump', text: 'Emotes' },
        { btn: 'L3', kind: 'stick', text: 'Sprint' },
      ];
    } else if (phase === 'EDITOR') {
      key = 'EDITOR';
      items = [
        { btn: 'LS / RS', kind: 'stick', text: 'Pan / Orbit' },
        { btn: 'RT / LT', kind: 'bump', text: 'Zoom' },
        { btn: 'A', kind: 'a', text: 'Apply Tool' },
        { btn: 'X', kind: 'x', text: 'Delete' },
        { btn: 'Y', kind: 'y', text: 'Camera' },
        { btn: 'L3', kind: 'stick', text: 'UI Cursor' },
        { btn: 'View', kind: 'bump', text: 'Test Sail' },
      ];
    } else if (phase === 'CREDITS') {
      key = 'CREDITS';
      items = [
        { btn: 'Hold A / RT', kind: 'a', text: 'Fast-Forward' },
        { btn: 'X', kind: 'x', text: 'Pause' },
        { btn: 'Y', kind: 'y', text: 'Speed' },
        { btn: 'B', kind: 'b', text: 'Main Menu' },
      ];
    } else {
      key = 'DEFAULT';
      items = CONTROL_SCHEMES.MENU.bindings.slice(0, 4).map((b) => ({ btn: b.btn, kind: b.kind, text: b.action }));
    }

    if (this._lastHintKey !== key) {
      this._lastHintKey = key;
      this._hintBarEl.innerHTML = items.map((it) => `
        <span class="gp-hint-item">
          <span class="xb-btn xb-${it.kind}">${it.btn}</span>
          <span class="gp-hint-text">${it.text}</span>
        </span>
      `).join('');
    }
    this._hintBarEl.style.display = 'flex';
  }

  showToast(message, variant = 'connected', durationMs = 3000) {
    if (!this._doc) return;
    if (!this._toastEl) {
      const el = this._doc.createElement('div');
      el.id = 'gamepad-toast';
      (this._doc.getElementById('ui-root') || this._doc.body)?.appendChild(el);
      this._toastEl = el;
    }
    this._toastEl.textContent = message;
    this._toastEl.className = `gp-toast gp-toast-${variant} show`;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      if (this._toastEl) this._toastEl.classList.remove('show');
    }, durationMs);
  }

  dispose() {
    off('gamepadConnected', this._onConnected);
    off('gamepadDisconnected', this._onDisconnected);
    off('inputModeChanged', this._onInputModeChanged);
    off('settingChanged', this._onSettingChanged);
    clearTimeout(this._toastTimer);
    this.clearFocus();
    this._cursorEl?.remove();
    this._reticleEl?.remove();
    this._hintBarEl?.remove();
    this._toastEl?.remove();
  }
}

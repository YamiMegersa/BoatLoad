import { emit, on, off } from '../core/EventBus.js';
import {
  HelmConsoleController,
  describeSweetSpotArcs,
  ratioToDialAngle,
} from './QTEStations.js';

const PIP_COUNT = 8;
const RESOLVE_FLASH_MS = 520;

const MODE_COPY = Object.freeze({
  tap: {
    title: 'HARPOON',
    act: 'STRIKE',
    hint: 'TAP IN THE ARC',
    icon: '<span class="pixel-icon icon-harpoon size-16"></span>',
    theme: '#4fc3f7',
  },
  brace: {
    title: 'BRACE',
    act: 'BRACE',
    hint: 'HOLD TO BRACE',
    icon: '<span class="pixel-icon icon-siren-note size-16"></span>',
    theme: '#ff66cc',
  },
  pump: {
    title: 'BILGE',
    act: 'HOLD TO BAIL',
    hint: 'HOLD TO BAIL WATER',
    icon: '<span class="pixel-icon icon-bailer-bucket size-16"></span>',
    theme: '#38bdf8',
  },
});

const IDLE_THEME = '#d7b35a';

/**
 * HelmConsole — the single QTE unit docked beside the steering wheel.
 *
 * One screen shows whichever QTE is active (harpoon dial, siren brace meter or bilge
 * pump gauge), two lamps say TAP or HOLD, and one big ACT button answers every QTE.
 * SPACE does the same thing through QTEInputRouter, so the game is fully playable
 * one-handed: A/D to steer, SPACE to act.
 *
 * Input rules for ACT:
 *  - tap mode: pointerdown -> { kind: 'tap' }
 *  - hold modes, touch / pen: true hold (pointerdown -> holdStart, release -> holdEnd)
 *  - hold modes, mouse: click latches the hold, click again releases it, so a mouse-only
 *    player can go straight back to dragging the wheel while the hold continues.
 */
export class HelmConsole {
  constructor({ emitInput = input => emit('qteInput', input) } = {}) {
    this.controller = new HelmConsoleController();
    this._emitInput = emitInput;
    this._el = null;
    this._refs = null;
    this._holdPointerId = null;
    this._latched = false;
    this._resolveTimer = null;
    this._frame = null;
    this._pendingUpdate = null;
    this._mashTarget = PIP_COUNT;

    this._onActDown = event => this._handleActDown(event);
    this._onActUp = event => this._handleActUp(event);
    this._onContextMenu = event => event.preventDefault();

    this._disabled = false;
    this._onShipSunk = () => this.disable();
    on('playerSinkingStart', this._onShipSunk);
    on('playerSunk', this._onShipSunk);
  }

  get element() {
    return this._el;
  }

  mount(parent) {
    if (this._el) this.dispose();
    this._disabled = false;
    const arcs = describeSweetSpotArcs([0.4, 0.6]);
    const el = document.createElement('section');
    el.id = 'helm-console';
    el.className = 'helm-console is-idle mode-none gesture-none';
    el.setAttribute('aria-label', 'Helm console');
    el.innerHTML = `
      <div class="helm-head">
        <span class="helm-icon" aria-hidden="true"></span>
        <span class="helm-title">HELM</span>
        <span class="helm-queue" aria-hidden="true"></span>
        <span class="helm-clock" aria-hidden="true">--.-</span>
      </div>
      <div class="helm-screen">
        <div class="helm-label">ALL CLEAR</div>
        <div class="helm-view helm-view-tap">
          <div class="helm-dial">
            <svg class="helm-dial-svg" viewBox="0 0 120 68" aria-hidden="true">
              <path class="helm-dial-track" d="M 14 60 A 46 46 0 0 1 106 60" />
              <line class="helm-dial-tick" x1="60" y1="9" x2="60" y2="16" />
              <line class="helm-dial-tick" x1="26" y1="26" x2="31" y2="31" />
              <line class="helm-dial-tick" x1="94" y1="26" x2="89" y2="31" />
              <path class="helm-sweet-arc" d="${arcs.sweetPath}" />
              <path class="helm-perfect-arc" d="${arcs.perfectPath}" />
              <circle class="helm-dial-hub" cx="60" cy="60" r="5.5" />
            </svg>
            <span class="helm-needle"></span>
          </div>
        </div>
        <div class="helm-view helm-view-brace">
          <div class="helm-pips">${'<i></i>'.repeat(PIP_COUNT)}</div>
        </div>
        <div class="helm-view helm-view-pump">
          <div class="helm-well"><div class="helm-well-water"></div></div>
        </div>
        <div class="helm-readout"></div>
        <div class="helm-result" aria-hidden="true"></div>
      </div>
      <div class="helm-timer-track"><div class="helm-timer-fill"></div></div>
      <div class="helm-lamps" aria-hidden="true">
        <span class="helm-lamp lamp-tap">TAP</span>
        <span class="helm-lamp lamp-hold">HOLD</span>
      </div>
      <button id="helm-act" class="helm-act" type="button" tabindex="-1" aria-label="Console ready">
        <span class="helm-act-label">READY</span>
        <span class="helm-act-key">SPACE</span>
      </button>
      <div class="sr-only helm-live" aria-live="polite"></div>
    `;

    const q = selector => el.querySelector(selector);
    this._refs = {
      icon: q('.helm-icon'),
      title: q('.helm-title'),
      queue: q('.helm-queue'),
      clock: q('.helm-clock'),
      label: q('.helm-label'),
      sweetArc: q('.helm-sweet-arc'),
      perfectArc: q('.helm-perfect-arc'),
      pips: [...el.querySelectorAll('.helm-pips i')],
      readout: q('.helm-readout'),
      result: q('.helm-result'),
      timerFill: q('.helm-timer-fill'),
      act: q('.helm-act'),
      actLabel: q('.helm-act-label'),
      live: q('.helm-live'),
    };

    const act = this._refs.act;
    act.addEventListener('pointerdown', this._onActDown);
    act.addEventListener('pointerup', this._onActUp);
    act.addEventListener('pointercancel', this._onActUp);
    act.addEventListener('lostpointercapture', this._onActUp);
    act.addEventListener('contextmenu', this._onContextMenu);

    this._el = el;
    parent?.appendChild(el);
    this._render();
    return el;
  }

  disable() {
    this._disabled = true;
    this._resetHoldState();
    clearTimeout(this._resolveTimer);
    this._resolveTimer = null;
    if (this._frame) cancelAnimationFrame(this._frame);
    this._frame = null;
    this._pendingUpdate = null;
    this.controller.clear();
    this._setStrikeOpen(false);
    this._render();
    if (this._el) {
      this._el.classList.add('is-disabled');
    }
  }

  dispose() {
    off('playerSinkingStart', this._onShipSunk);
    off('playerSunk', this._onShipSunk);
    clearTimeout(this._resolveTimer);
    this._resolveTimer = null;
    if (this._frame) cancelAnimationFrame(this._frame);
    this._frame = null;
    this._pendingUpdate = null;
    const act = this._refs?.act;
    if (act) {
      act.removeEventListener('pointerdown', this._onActDown);
      act.removeEventListener('pointerup', this._onActUp);
      act.removeEventListener('pointercancel', this._onActUp);
      act.removeEventListener('lostpointercapture', this._onActUp);
      act.removeEventListener('contextmenu', this._onContextMenu);
    }
    this._el?.remove();
    this._el = null;
    this._refs = null;
    this._holdPointerId = null;
    this._latched = false;
    this.controller = new HelmConsoleController();
  }

  // -----------------------------------------------------------------------
  // QTE event forwarding (called by HUD)
  // -----------------------------------------------------------------------

  start(event) {
    if (this._disabled) return null;
    clearTimeout(this._resolveTimer);
    this._resolveTimer = null;
    // A QTE starting while a finger/click is still down must not inherit it.
    this._resetHoldState();
    const mode = this.controller.start(event);
    if (!mode) return null;
    this._mashTarget = Math.max(1, event?.mashTarget ?? PIP_COUNT);
    if (mode === 'tap' && this._refs) {
      const arcs = describeSweetSpotArcs(this.controller.sweetSpot);
      this._refs.sweetArc?.setAttribute('d', arcs.sweetPath);
      this._refs.perfectArc?.setAttribute('d', arcs.perfectPath);
    }
    this._render();
    this._renderProgress({ remainingMs: event?.windowMs, windowMs: event?.windowMs, progress: 0, isHolding: false });
    if (this._refs?.live) this._refs.live.textContent = event?.prompt ?? event?.label ?? '';
    return mode;
  }

  queue(event) {
    if (this._disabled) return null;
    const mode = this.controller.queue(event);
    if (mode) this._render();
    return mode;
  }

  resolve(event, result) {
    const mode = this.controller.resolve(event, result);
    if (!mode) return null;
    if (event?.queued) {
      // Queued expiry only clears the waiting badge, never the active task.
      this._render();
      return mode;
    }
    this._resetHoldState();
    if (this._frame) cancelAnimationFrame(this._frame);
    this._frame = null;
    this._pendingUpdate = null;
    this._setStrikeOpen(false);
    this._render();
    const seq = this.controller.seq;
    clearTimeout(this._resolveTimer);
    this._resolveTimer = setTimeout(() => {
      this._resolveTimer = null;
      if (this.controller.finishResolve(seq)) this._render();
    }, RESOLVE_FLASH_MS);
    return mode;
  }

  /** qteUpdate events are coalesced into one DOM write per animation frame. */
  update(event) {
    if (!this.controller.isActive) return;
    // Keep the mouse latch in sync if something else released the hold (Space keyup, pause, ...).
    if (this._latched && event && !event.isHolding) this._latched = false;
    this._pendingUpdate = event;
    if (this._frame) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = null;
      const pending = this._pendingUpdate;
      this._pendingUpdate = null;
      if (pending && this.controller.isActive) this._renderProgress(pending);
    });
  }

  setStrikeOpen(open) {
    this._setStrikeOpen(Boolean(open));
  }

  /** Called on pause / blur so a pointer hold can never get stuck. */
  releaseHolds() {
    const wasHolding = this._holdPointerId !== null || this._latched;
    this._resetHoldState();
    if (wasHolding && this.controller.isActive) this._emitInput({ kind: 'holdEnd', force: true });
  }

  // -----------------------------------------------------------------------
  // ACT button
  // -----------------------------------------------------------------------

  _handleActDown(event) {
    event.preventDefault();
    event.stopPropagation();
    this._refs?.act?.blur?.();
    if (this._disabled || !this.controller.isActive) return;
    this._el?.classList.add('is-pressed');
    const el = this._el;
    const releaseVisual = () => setTimeout(() => el?.classList.remove('is-pressed'), 120);

    if (this.controller.gesture === 'tap') {
      this._emitInput({ kind: 'tap' });
      releaseVisual();
      return;
    }

    if (event.pointerType === 'mouse') {
      this._latched = !this._latched;
      this._emitInput(this._latched ? { kind: 'holdStart' } : { kind: 'holdEnd', force: true });
      this._el?.classList.toggle('is-latched', this._latched);
      releaseVisual();
      return;
    }

    this._holdPointerId = event.pointerId;
    try {
      this._refs.act.setPointerCapture?.(event.pointerId);
    } catch (_) {
      // Pointer capture can fail if the pointer is already gone; the hold still works.
    }
    this._emitInput({ kind: 'holdStart' });
  }

  _handleActUp(event) {
    this._el?.classList.remove('is-pressed');
    if (this._holdPointerId === null || event.pointerId !== this._holdPointerId) return;
    this._holdPointerId = null;
    const act = this._refs?.act;
    if (act?.hasPointerCapture?.(event.pointerId)) {
      try {
        act.releasePointerCapture(event.pointerId);
      } catch (_) {
        // Already released by the browser.
      }
    }
    if (this.controller.isActive) this._emitInput({ kind: 'holdEnd' });
  }

  _resetHoldState() {
    const pointerId = this._holdPointerId;
    this._holdPointerId = null;
    this._latched = false;
    const act = this._refs?.act;
    if (pointerId !== null && act?.hasPointerCapture?.(pointerId)) {
      try {
        act.releasePointerCapture(pointerId);
      } catch (_) {
        // Already released by the browser.
      }
    }
    this._el?.classList.remove('is-pressed', 'is-latched', 'is-holding');
  }

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------

  _setStrikeOpen(open) {
    this._el?.classList.toggle('strike-open', open);
  }

  _render() {
    const el = this._el;
    const refs = this._refs;
    if (!el || !refs) return;
    const c = this.controller;
    const copy = c.mode ? MODE_COPY[c.mode] : null;

    const classes = [
      'helm-console',
      `is-${c.state}`,
      `mode-${c.mode ?? 'none'}`,
      `gesture-${c.gesture ?? 'none'}`,
    ];
    if (c.state === 'resolving' && c.result) classes.push(`result-${c.result.toLowerCase()}`);
    if (c.queued.length) classes.push('has-queue');
    if (el.classList.contains('strike-open') && c.isActive) classes.push('strike-open');
    if (this._latched) classes.push('is-latched');
    el.className = classes.join(' ');
    el.style.setProperty('--helm-theme', copy?.theme ?? IDLE_THEME);

    refs.icon.innerHTML = copy?.icon ?? '<span class="pixel-icon icon-helm-wheel size-16"></span>';
    refs.title.textContent = copy?.title ?? 'HELM';
    refs.queue.textContent = c.queued.length ? `+${c.queued.length}` : '';
    refs.actLabel.textContent = c.isActive ? copy.act : 'READY';
    refs.act.setAttribute('aria-label', c.isActive ? `${copy.act} (${copy.hint.toLowerCase()})` : 'Console ready');

    if (c.state === 'active') {
      refs.label.textContent = c.label ?? copy.title;
      refs.result.textContent = '';
    } else if (c.state === 'resolving') {
      refs.result.textContent = c.points > 0 ? `+${c.points}` : (c.result ? `${c.result}!` : '');
    } else if (c.state === 'queued') {
      refs.label.textContent = `INCOMING: ${c.queued[0]?.label ?? ''}`;
      refs.result.textContent = '';
      this._resetIdleReadouts();
    } else {
      refs.label.textContent = 'ALL CLEAR';
      refs.result.textContent = '';
      this._resetIdleReadouts();
    }
  }

  _resetIdleReadouts() {
    const refs = this._refs;
    refs.clock.textContent = '--.-';
    refs.readout.textContent = '';
    refs.timerFill.style.width = '100%';
    refs.pips.forEach(pip => pip.classList.remove('filled'));
    this._el.style.setProperty('--helm-needle', '-90deg');
    this._el.style.setProperty('--helm-water', '1');
    this._el.classList.remove('in-sweet-spot');
  }

  _renderProgress({ windowMs, remainingMs, progress = 0, isHolding = false }) {
    const el = this._el;
    const refs = this._refs;
    if (!el || !refs) return;
    const safeWindow = Math.max(1, windowMs || 1);
    const remaining = Math.max(0, remainingMs ?? safeWindow);
    const remRatio = Math.max(0, Math.min(1, remaining / safeWindow));
    refs.timerFill.style.width = `${(remRatio * 100).toFixed(1)}%`;
    refs.clock.textContent = (remaining / 1000).toFixed(1);

    const mode = this.controller.mode;
    if (mode === 'tap') {
      const elapsed = 1 - remRatio;
      el.style.setProperty('--helm-needle', `${ratioToDialAngle(elapsed).toFixed(2)}deg`);
      const [start, end] = this.controller.sweetSpot ?? [0.4, 0.6];
      el.classList.toggle('in-sweet-spot', elapsed >= start && elapsed <= end);
      refs.readout.textContent = '';
    } else {
      const ratio = Math.max(0, Math.min(1, (progress ?? 0) / this._mashTarget));
      const filled = Math.floor(ratio * PIP_COUNT + 1e-6);
      refs.pips.forEach((pip, index) => pip.classList.toggle('filled', index < filled));
      el.style.setProperty('--helm-water', (1 - ratio).toFixed(3));
      if (mode === 'pump') {
        const pct = Math.round(ratio * 100);
        refs.readout.textContent = isHolding ? `DRAINING ${pct}%` : 'HOLD TO BAIL';
      } else {
        refs.readout.textContent = `${Math.round(ratio * 100)}%`;
      }
      el.classList.toggle('is-holding', Boolean(isHolding));
    }
  }
}

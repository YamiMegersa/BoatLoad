import { emit, on, off } from '../core/EventBus.js';

// ---------------------------------------------------------------------------
// QTE types
// ---------------------------------------------------------------------------

export const QTEType = Object.freeze({
  SHOOT:   'SHOOT',   // Barrel — press Space
  RESIST:  'RESIST',  // Siren  — mash Shift
  HARPOON: 'HARPOON', // Whale  — press H
});

const QTE_KEY_MAP = {
  [QTEType.SHOOT]:   'Space',
  [QTEType.RESIST]:  'ShiftLeft',
  [QTEType.HARPOON]: 'KeyH',
};

// ---------------------------------------------------------------------------
// QTESystem
// ---------------------------------------------------------------------------

/**
 * QTESystem — generic Quick Time Event manager.
 *
 * Flow:
 *  1. External code calls `trigger({ type, windowMs, onSuccess, onFail })`.
 *  2. QTESystem emits 'qteStart' → HUD shows the prompt.
 *  3. Player presses the correct key within windowMs.
 *  4. Success → calls onSuccess, emits 'qteSuccess'.
 *     Failure (timeout) → calls onFail, emits 'qteFail'.
 *
 * Only one QTE can be active at a time.
 */
export class QTESystem {
  constructor() {
    this._active    = false;
    this._type      = null;
    this._timer     = null;
    this._startTime = 0;
    this._windowMs  = 0;
    this._onSuccess = null;
    this._onFail    = null;

    this._boundKey = this._onKeyDown.bind(this);
    this._onTap = () => this.resolveTap();
    on('qteTap', this._onTap);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Start a QTE event.
   * @param {{ type: string, windowMs: number, onSuccess?: Function, onFail?: Function }} opts
   * @returns {boolean} True if the QTE successfully started, false if another is already active.
   */
  trigger({ type, windowMs = 2000, onSuccess, onFail }) {
    if (this._active) return false; // ignore overlapping QTEs

    console.log(`[QTE] Triggered ${type}`);

    this._active    = true;
    this._type      = type;
    this._startTime = Date.now();
    this._windowMs  = windowMs;
    this._onSuccess = onSuccess ?? (() => {});
    this._onFail    = onFail    ?? (() => {});

    emit('qteStart', { type, windowMs, key: QTE_KEY_MAP[type] });

    window.addEventListener('keydown', this._boundKey);

    this._timer = setTimeout(() => this._fail(), windowMs);
    
    return true;
  }

  /**
   * Resolve active QTE via on-screen button tap or click.
   */
  resolveTap() {
    if (!this._active) return;
    this._succeed();
  }

  /**
   * Mark the active QTE as resolved by a successful external trigger
   * (e.g., cannon shot animation completes before QTE fires).
   */
  resolveExternal() {
    if (!this._active) return;
    this._succeed();
  }

  dispose() {
    clearTimeout(this._timer);
    window.removeEventListener('keydown', this._boundKey);
    off('qteTap', this._onTap);
    this._active = false;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  _onKeyDown(e) {
    if (!this._active) return;
    if (e.code === QTE_KEY_MAP[this._type]) {
      this._succeed();
    }
  }

  _succeed() {
    clearTimeout(this._timer);
    window.removeEventListener('keydown', this._boundKey);

    const type = this._type;
    const elapsed = Date.now() - this._startTime;
    const ratio = Math.min(1.0, elapsed / Math.max(1, this._windowMs));
    const isPerfect = ratio <= 0.45; // reacted within first 45% of time window
    const timing = { elapsed, ratio, isPerfect };

    this._active = false;
    this._type   = null;

    console.log(`[QTE] Success ${type} (${isPerfect ? 'PERFECT' : 'GOOD'}, ${elapsed}ms)`);

    emit('qteSuccess', { type, ...timing });
    emit('playSound', { sound: 'qte_success' });
    if (this._onSuccess) {
      this._onSuccess(timing);
    }
    this._onSuccess = null;
    this._onFail    = null;
  }

  _fail() {
    window.removeEventListener('keydown', this._boundKey);

    const type = this._type;
    this._active = false;
    this._type   = null;

    console.log(`[QTE] Failed ${type}`);

    emit('qteFail', { type });
    emit('playSound', { sound: 'qte_fail' });
    if (this._onFail) {
      this._onFail();
    }
    this._onSuccess = null;
    this._onFail    = null;
  }
}

/**
 * Pure routing, state machine, and SVG dial math for the unified Helm Console.
 *
 * Every QTE appears on ONE console docked beside the steering wheel and is answered
 * with ONE action (the ACT button or SPACE), either as a TAP or a HOLD.
 */

/** Console screen mode for each QTE type. */
export const modeFor = type => (
  { HARPOON: 'tap', SIREN: 'brace', BAIL: 'pump' }[type] ?? null
);

/** Which ACT gesture a mode needs: a single timed tap, or a sustained hold. */
export const gestureFor = mode => (mode === 'tap' ? 'tap' : mode ? 'hold' : null);

const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

/**
 * Maps a normalized progress ratio [0..1] to the chronometer needle angle [-90..+90] degrees.
 * -90deg is full port (left horizontal), 0deg is 12 o'clock apex, +90deg is full starboard (right horizontal).
 */
export function ratioToDialAngle(ratio) {
  return -90 + clamp01(ratio) * 180;
}

/**
 * Converts a dial angle [-90..+90] degrees into SVG coordinates on the upper semicircle.
 */
export function polarOnDial(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: Number((cx + r * Math.cos(rad)).toFixed(2)),
    y: Number((cy + r * Math.sin(rad)).toFixed(2)),
  };
}

/**
 * Builds an SVG arc path `M sx sy A r r 0 0 1 ex ey` for a ratio window [startRatio, endRatio].
 */
export function describeDialArc(startRatio, endRatio, cx = 60, cy = 60, r = 46) {
  const r0 = clamp01(Math.min(startRatio, endRatio));
  const r1 = clamp01(Math.max(startRatio, endRatio));
  const startAngle = ratioToDialAngle(r0);
  const endAngle = ratioToDialAngle(r1);
  const start = polarOnDial(cx, cy, r, startAngle);
  const end = polarOnDial(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/**
 * Computes both the full sweet-spot arc and the inner "Perfect" (+-22% width) arc for the timing dial.
 */
export function describeSweetSpotArcs(sweetSpot = [0.4, 0.6], cx = 60, cy = 60, r = 46) {
  const start = Array.isArray(sweetSpot) && Number.isFinite(sweetSpot[0]) ? sweetSpot[0] : 0.4;
  const end = Array.isArray(sweetSpot) && Number.isFinite(sweetSpot[1]) ? sweetSpot[1] : 0.6;
  const lo = clamp01(Math.min(start, end));
  const hi = clamp01(Math.max(start, end));
  const center = (lo + hi) * 0.5;
  const halfPerfect = (hi - lo) * 0.22;
  return {
    sweetPath: describeDialArc(lo, hi, cx, cy, r),
    perfectPath: describeDialArc(center - halfPerfect, center + halfPerfect, cx, cy, r),
    startAngle: ratioToDialAngle(lo),
    endAngle: ratioToDialAngle(hi),
    centerAngle: ratioToDialAngle(center),
  };
}

/**
 * Single-console state machine.
 *
 * States: 'idle' | 'queued' (nothing active, something waiting) | 'active' | 'resolving'.
 * Only one QTE is ever active (QTESystem guarantees this), so one screen is enough.
 */
export class HelmConsoleController {
  constructor() {
    this.state = 'idle';
    this.mode = null;
    this.type = null;
    this.input = null;
    this.source = null;
    this.label = null;
    this.prompt = null;
    this.sweetSpot = [0.4, 0.6];
    this.result = null;
    this.points = 0;
    this.queued = [];
    this.seq = 0;
  }

  get gesture() {
    return gestureFor(this.mode);
  }

  get isActive() {
    return this.state === 'active';
  }

  start(event) {
    const mode = modeFor(event?.type);
    if (!mode) return null;
    this.seq += 1;
    this.state = 'active';
    this.mode = mode;
    this.type = event.type;
    this.input = event.input ?? null;
    this.source = event.source ?? event?.metadata?.source ?? null;
    this.label = event.label ?? event.type;
    this.prompt = event.prompt ?? null;
    this.result = null;
    this.points = 0;
    if (mode === 'tap' && Array.isArray(event.sweetSpot)) this.sweetSpot = [...event.sweetSpot];
    this._removeQueued(event.type);
    return mode;
  }

  queue(event) {
    const mode = modeFor(event?.type);
    if (!mode) return null;
    this.queued.push({ type: event.type, label: event.label ?? event.type, mode });
    if (this.state === 'idle') {
      this.seq += 1;
      this.state = 'queued';
    }
    return mode;
  }

  /**
   * Resolve the active QTE (or drop a queued one when `event.queued` is set).
   * Returns the affected mode, or null if the event does not apply.
   */
  resolve(event, result) {
    const mode = modeFor(event?.type);
    if (!mode) return null;
    if (event?.queued) {
      // A queued expiry only clears the waiting badge; it never touches the active task.
      if (!this._removeQueued(event.type)) return null;
      if (this.state === 'queued' && this.queued.length === 0) this._toIdle();
      return mode;
    }
    if (this.state !== 'active' || this.type !== event.type) return null;
    this.seq += 1;
    this.state = 'resolving';
    this.result = result;
    this.points = Number.isFinite(event?.points) ? event.points : 0;
    return mode;
  }

  /** Ends the result flash. A stale token (a newer QTE already started) is ignored. */
  finishResolve(expectedSeq) {
    if (this.state !== 'resolving') return false;
    if (expectedSeq !== undefined && this.seq !== expectedSeq) return false;
    this._toIdle();
    return true;
  }

  clear() {
    this.queued.length = 0;
    this._toIdle();
  }

  _toIdle() {
    this.seq += 1;
    this.state = this.queued.length ? 'queued' : 'idle';
    this.mode = null;
    this.type = null;
    this.input = null;
    this.source = null;
    this.label = null;
    this.prompt = null;
    this.result = null;
    this.points = 0;
  }

  _removeQueued(type) {
    const index = this.queued.findIndex(item => item.type === type);
    if (index < 0) return false;
    this.queued.splice(index, 1);
    return true;
  }
}

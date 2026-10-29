/** Pure routing, state machine, and SVG dial math for the static QTE HUD instruments. */

export const stationFor = type => (
  { HARPOON: 'timing', BAIL: 'bail', SIREN: 'siren' }[type] ?? null
);

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

export class QTEStationController {
  constructor(now = () => Date.now()) {
    this._now = now;
    this._lastSirenPull = null;
    this._active = null;
    this.stations = {
      timing: {
        state: 'idle',
        type: null,
        source: null,
        label: null,
        sweetSpot: [0.4, 0.6],
        result: null,
        points: 0,
        queuedType: null,
        queuedLabel: null,
        seq: 0,
      },
      bail: {
        state: 'idle',
        type: null,
        source: null,
        label: null,
        result: null,
        queuedType: null,
        queuedLabel: null,
        seq: 0,
      },
      siren: {
        state: 'idle',
        type: null,
        source: null,
        label: null,
        side: 'right',
        result: null,
        queuedType: null,
        queuedLabel: null,
        seq: 0,
      },
    };
  }

  noteSirenPull({ steerPull = 0 } = {}) {
    if (steerPull) {
      this._lastSirenPull = {
        side: steerPull < 0 ? 'left' : 'right',
        at: this._now(),
      };
    }
  }

  _resolveSirenSide(event) {
    const metaSide = event?.metadata?.side;
    if (metaSide === 'left' || metaSide === 'right') return metaSide;
    if (this._lastSirenPull && this._now() - this._lastSirenPull.at <= 600) {
      return this._lastSirenPull.side;
    }
    return 'right';
  }

  start(event) {
    const station = stationFor(event?.type);
    if (!station) return null;
    if (this._active && this._active !== station) {
      this.clear(this._active);
    }
    const entry = this.stations[station];
    entry.seq += 1;
    entry.state = 'active';
    entry.type = event.type;
    entry.source = event.source ?? event?.metadata?.source ?? null;
    entry.label = event.label ?? event.type;
    entry.result = null;
    entry.points = 0;
    if (entry.queuedType === event.type) {
      entry.queuedType = null;
      entry.queuedLabel = null;
    }
    if (station === 'timing' && Array.isArray(event.sweetSpot)) {
      entry.sweetSpot = [...event.sweetSpot];
    }
    if (station === 'siren') {
      entry.side = this._resolveSirenSide(event);
    }
    this._active = station;
    return station;
  }

  queue(event) {
    const station = stationFor(event?.type);
    if (!station) return null;
    const entry = this.stations[station];
    entry.queuedType = event.type;
    entry.queuedLabel = event.label ?? event.type;
    if (station === 'timing' && Array.isArray(event.sweetSpot) && entry.state !== 'active') {
      entry.sweetSpot = [...event.sweetSpot];
    }
    if (station === 'siren' && entry.state !== 'active') {
      entry.side = this._resolveSirenSide(event);
    }
    if (station === this._active || entry.state === 'active') {
      return null;
    }
    entry.seq += 1;
    entry.state = 'queued';
    entry.type = event.type;
    entry.source = event.source ?? event?.metadata?.source ?? null;
    entry.label = event.label ?? event.type;
    entry.result = null;
    entry.points = 0;
    return station;
  }

  resolve(event, result) {
    const station = stationFor(event?.type);
    if (!station) return null;
    const entry = this.stations[station];
    if (event?.queued) {
      entry.queuedType = null;
      entry.queuedLabel = null;
      if (entry.state !== 'queued') return null;
      this.clear(station);
      return station;
    }
    if (entry.state !== 'active') return null;
    entry.seq += 1;
    entry.state = 'resolving';
    entry.result = result;
    entry.points = Number.isFinite(event?.points) ? event.points : 0;
    this._active = null;
    return station;
  }

  finishResolve(station, expectedSeq) {
    const entry = this.stations[station];
    if (!entry) return false;
    if (entry.state !== 'resolving') return false;
    if (expectedSeq !== undefined && entry.seq !== expectedSeq) return false;
    this.clear(station);
    return true;
  }

  clear(station) {
    const entry = this.stations[station];
    if (!entry) return;
    entry.seq += 1;
    if (entry.queuedType && this._active !== station) {
      entry.state = 'queued';
      entry.type = entry.queuedType;
      entry.label = entry.queuedLabel;
      entry.result = null;
    } else {
      entry.state = 'idle';
      entry.type = null;
      entry.source = null;
      entry.label = null;
      entry.result = null;
      entry.points = 0;
      entry.queuedType = null;
      entry.queuedLabel = null;
    }
    if (this._active === station) this._active = null;
  }
}

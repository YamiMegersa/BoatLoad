import { emit, on, off } from '../core/EventBus.js';

export const QTEType = Object.freeze({
  SHOOT: 'SHOOT',
  HARPOON: 'HARPOON',
  BAIL: 'BAIL',
  SIREN: 'SIREN',
});

export const QTE_SOURCES = Object.freeze({
  // Shark harpoon hits grant extra doubloons (up to 25);
  // every other source resolves gameplay but awards no points.
  shark: { type: QTEType.HARPOON, reward: 15, perfectReward: 25, streakBonus: false },
  barrel: { type: QTEType.SHOOT, reward: 0, perfectReward: 0, streakBonus: false },
  siren: { type: QTEType.SIREN, reward: 0, perfectReward: 0, streakBonus: false },
  bail: { type: QTEType.BAIL, reward: 0, perfectReward: 0, streakBonus: false },
  cannon: { type: QTEType.SHOOT, reward: 0, perfectReward: 0, streakBonus: false },
});

export function computePoints(source, isPerfect, streak) {
  const reward = isPerfect ? (source.perfectReward ?? source.reward * 1.5) : source.reward;
  const multiplier = source.streakBonus ? Math.min(2, 1 + Math.floor((streak - 1) / 3) * 0.25) : 1;
  return { points: Math.round(reward * multiplier), multiplier };
}

export const QTE_DEFINITIONS = Object.freeze({
  [QTEType.SHOOT]: {
    input: 'timing', keys: { tap: 'Space' }, windowMs: 1800, priority: 20,
    label: 'FIRE!', prompt: 'Tap in the green zone', sweetSpot: [0.42, 0.62],
    theme: { color: '#ff9800', icon: '<span class="pixel-icon icon-explosion-burst size-18"></span>', sound: 'barrel_shot' },
  },
  [QTEType.HARPOON]: {
    input: 'timing', keys: { tap: 'Space' }, windowMs: 2000, priority: 30,
    label: 'HARPOON!', prompt: 'Tap in the green zone', sweetSpot: [0.40, 0.60],
    theme: { color: '#4fc3f7', icon: '<span class="pixel-icon icon-target size-18"></span>', sound: 'harpoon' },
  },
  [QTEType.BAIL]: {
    input: 'draw', keys: { assist: 'Space' }, windowMs: 8000, priority: 100,
    label: 'BAIL WATER!', prompt: 'Draw one complete circle',
    theme: { color: '#2196f3', icon: '<span class="pixel-icon icon-bailer-bucket size-18"></span>', sound: 'bail' },
  },
  [QTEType.SIREN]: {
    input: 'mash', keys: { tap: 'Space' }, windowMs: 3000, priority: 70,
    label: 'RESIST THE SONG!', prompt: 'Press SPACE repeatedly', mashTarget: 8,
    theme: { color: '#ff66cc', icon: '<span class="pixel-icon icon-siren-note size-18"></span>', sound: 'siren_resist' },
  },
});

const INPUT_HANDLERS = {
  timing: {
    onInput(system, qte, input) {
      if (input.kind !== 'tap') return;
      emit('playSound', { sound: 'qte_tick' });
      const ratio = system._elapsedRatio(qte);
      const [start, end] = system._sweetSpot(qte);
      if (ratio >= start && ratio <= end) system._succeed();
      else system._fail('mistimed');
    },
  },
  mash: {
    onInput(system, qte, input) {
      if (input.kind !== 'tap') return;
      emit('playSound', { sound: 'qte_tick' });
      qte.progress = Math.min(qte.definition.mashTarget, qte.progress + 1);
      system._emitUpdate();
      if (qte.progress >= qte.definition.mashTarget) system._succeed();
    },
  },
  draw: {
    onInput(system, qte, input) {
      if (input.kind === 'drawCancel') {
        qte.points = [];
        qte.progress = 0;
        system._emitUpdate();
        return;
      }
      if (input.kind === 'assist') {
        qte.accuracy = 0.5;
        system._succeed();
        return;
      }
      if (input.kind === 'drawStart') {
        qte.points = [input.point];
        system._emitUpdate();
        return;
      }
      if (input.kind === 'drawMove' && qte.points?.length) {
        if (qte.points.length < 512) qte.points.push(input.point);
        qte.progress = scoreCircleTrace(qte.points).coverage;
        system._emitUpdate();
        return;
      }
      if (input.kind !== 'drawEnd' || !qte.points?.length) return;

      const score = scoreCircleTrace(qte.points);
      qte.accuracy = score.accuracy / 100;
      qte.progress = score.coverage;
      if (!score.valid) {
        system._fail('incomplete-circle');
        return;
      }
      system._succeed();
    },
  },
};

const CIRCLE_SECTORS = 24;
const CIRCLE_TARGET_RADIUS = 0.4;

export function scoreCircleTrace(points) {
  if (points.length < 12) return { valid: false, accuracy: 0, coverage: 0 };

  const occupiedSectors = new Set();
  let radialError = 0;
  let totalTurn = 0;
  let signedTurn = 0;
  let previousAngle = null;

  for (let index = 0; index < points.length; index++) {
    const dx = points[index].x - 0.5;
    const dy = points[index].y - 0.5;
    const radius = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    radialError += Math.abs(radius - CIRCLE_TARGET_RADIUS) / CIRCLE_TARGET_RADIUS;
    occupiedSectors.add(Math.floor(((angle + Math.PI) / (Math.PI * 2)) * CIRCLE_SECTORS) % CIRCLE_SECTORS);

    if (previousAngle !== null) {
      let turn = angle - previousAngle;
      if (turn > Math.PI) turn -= Math.PI * 2;
      if (turn < -Math.PI) turn += Math.PI * 2;
      signedTurn += turn;
      totalTurn += Math.abs(turn);
    }
    previousAngle = angle;
  }

  const first = points[0];
  const last = points[points.length - 1];
  const closureError = Math.hypot(first.x - last.x, first.y - last.y) / (CIRCLE_TARGET_RADIUS * 2);
  const coverage = occupiedSectors.size / CIRCLE_SECTORS;
  const radialScore = Math.max(0, 1 - radialError / points.length);
  const closureScore = Math.max(0, 1 - closureError);
  const extraTurnPenalty = Math.min(1, (Math.PI * 2 * 1.2) / Math.max(totalTurn, 0.001));
  const continuityScore = Math.min(1, Math.abs(signedTurn) / Math.max(totalTurn, 0.001)) * extraTurnPenalty;
  const accuracy = Math.round((coverage * 0.45 + radialScore * 0.35 + closureScore * 0.15 + continuityScore * 0.05) * 100);

  return { valid: coverage >= 20 / CIRCLE_SECTORS, accuracy, coverage };
}

export class QTESystem {
  constructor(tuning = {}, abilities = []) {
    this._active = null;
    this._queue = [];
    this._nextId = 1;
    this._streak = 0;
    this._stats = { byType: {}, bySource: {} };
    this._paused = false;
    this._tuning = this._createTuning(tuning, abilities);
    this._onInput = input => this._handleInput(input);
    this._onPaused = ({ paused }) => this.setPaused(paused);
    on('qteInput', this._onInput);
    on('gamePaused', this._onPaused);
  }

  trigger(options) {
    const sourceName = options.source ?? options.metadata?.source;
    const source = QTE_SOURCES[sourceName];
    const type = options.type ?? source?.type;
    const definition = QTE_DEFINITIONS[type];
    if (!definition || !source) {
      console.warn(`[QTE] Unknown type or source: ${type ?? sourceName}`);
      return false;
    }
    const dedupeKey = options.dedupeKey ?? options.metadata?.instanceId ?? sourceName;
    if (this._active?.dedupeKey === dedupeKey || this._queue.some(qte => qte.dedupeKey === dedupeKey)) return false;

    const windowMs = Math.round((options.windowMs ?? definition.windowMs) * this._tuning.windowScale);
    const qte = {
      id: this._nextId++, type, sourceName, dedupeKey, source, definition, windowMs, remainingMs: windowMs,
      queueRemainingMs: options.queueExpiryMs ?? Math.max(windowMs * 2, 4000), progress: 0,
      onSuccess: options.onSuccess ?? (() => {}), onFail: options.onFail ?? (() => {}),
      metadata: { ...options.metadata, source: sourceName },
    };
    if (!this._active) this._start(qte);
    else {
      this._queue.push(qte);
      this._queue.sort((left, right) => right.definition.priority - left.definition.priority);
      emit('qteQueued', { type, source: sourceName, priority: qte.definition.priority });
    }
    return true;
  }

  update(delta) {
    if (this._paused) return;
    this._updateQueue(delta);
    if (!this._active) return this._startNext();
    this._active.remainingMs -= delta * 1000;
    this._emitUpdate();
    if (this._active.remainingMs <= 0) this._fail('timeout');
  }

  setPaused(paused) {
    this._paused = Boolean(paused);
    if (this._paused && this._active?.definition.input === 'draw') {
      this._active.points = [];
      this._active.progress = 0;
    }
  }

  resolveTap() {
    this._handleInput({ kind: 'tap' });
  }

  hasActive() {
    return Boolean(this._active);
  }

  getInputKindForKey(code) {
    if (!this._active) return null;
    return Object.entries(this._active.definition.keys)
      .find(([, key]) => key === code)?.[0] ?? null;
  }

  getStats() {
    return { streak: this._streak, byType: structuredClone(this._stats.byType), bySource: structuredClone(this._stats.bySource) };
  }

  dispose() {
    this._active = null;
    this._queue.length = 0;
    off('qteInput', this._onInput);
    off('gamePaused', this._onPaused);
  }

  _handleInput(input) {
    if (this._paused || !this._active) return;
    INPUT_HANDLERS[this._active.definition.input]?.onInput(this, this._active, input);
  }

  _createTuning(tuning, abilities) {
    const normalized = new Set(abilities.map(ability => String(ability).toLowerCase().replace(/[_\s-]/g, '')));
    return { windowScale: (tuning.windowScale ?? 1) * (normalized.has('sharpeye') ? 1.2 : 1), perfectScale: tuning.perfectScale ?? 1 };
  }

  _start(qte) {
    this._active = qte;
    emit('qteStart', this._eventData(qte));
    this._emitUpdate();
  }

  _startNext() {
    if (!this._active && this._queue.length) this._start(this._queue.shift());
  }

  _updateQueue(delta) {
    const expired = [];
    this._queue = this._queue.filter(qte => {
      qte.queueRemainingMs -= delta * 1000;
      if (qte.queueRemainingMs > 0) return true;
      expired.push(qte);
      return false;
    });
    for (const qte of expired) {
      if (!qte.metadata.debug) {
        this._record(qte, 'miss');
        this._streak = 0;
      }
      qte.onFail({ reason: 'expired', queued: true, metadata: qte.metadata });
      emit('qteFail', { type: qte.type, source: qte.sourceName, reason: 'expired', queued: true, metadata: qte.metadata });
    }
  }

  _succeed() {
    const qte = this._active;
    if (!qte) return;
    const ratio = this._elapsedRatio(qte);
    const isPerfect = qte.definition.input === 'timing'
      ? this._isTimingPerfect(qte, ratio)
      : qte.definition.input === 'draw'
        ? qte.accuracy >= 0.9
        : ratio <= 0.65;
    const streak = qte.metadata.debug ? this._streak : ++this._streak;
    const { points: earnedPoints, multiplier } = computePoints(qte.source, isPerfect, streak);
    const points = qte.metadata.debug ? 0 : earnedPoints;
    const timing = { elapsed: qte.windowMs - qte.remainingMs, ratio, isPerfect, streak, multiplier, points, accuracy: qte.accuracy };
    this._active = null;
    if (!qte.metadata.debug) this._record(qte, isPerfect ? 'perfect' : 'good');
    emit('qteSuccess', { type: qte.type, source: qte.sourceName, dedupeKey: qte.dedupeKey, ...timing, metadata: qte.metadata });
    if (points > 0) emit('scoreAdded', { points, label: isPerfect ? 'PERFECT!' : 'GOOD!', isPerfect, streak, multiplier, source: qte.sourceName });
    emit('playSound', { sound: qte.definition.theme.sound || 'qte_success' });
    qte.onSuccess({ ...timing, metadata: qte.metadata });
    this._startNext();
  }

  _fail(reason) {
    const qte = this._active;
    if (!qte) return;
    this._active = null;
    if (!qte.metadata.debug) {
      this._record(qte, 'miss');
      this._streak = 0;
    }
    emit('qteFail', { type: qte.type, source: qte.sourceName, dedupeKey: qte.dedupeKey, reason, metadata: qte.metadata });
    emit('playSound', { sound: 'qte_fail' });
    qte.onFail({ reason, queued: false, metadata: qte.metadata });
    this._startNext();
  }

  _record(qte, result) {
    for (const bucket of [this._stats.byType, this._stats.bySource]) {
      const key = bucket === this._stats.byType ? qte.type : qte.sourceName;
      bucket[key] ??= { perfect: 0, good: 0, miss: 0 };
      bucket[key][result]++;
    }
  }

  _elapsedRatio(qte) {
    return Math.max(0, Math.min(1, (qte.windowMs - qte.remainingMs) / qte.windowMs));
  }

  _sweetSpot(qte) {
    const [start, end] = qte.definition.sweetSpot;
    const midpoint = (start + end) / 2;
    const halfWidth = ((end - start) / 2) * this._tuning.perfectScale;
    return [Math.max(0, midpoint - halfWidth), Math.min(1, midpoint + halfWidth)];
  }

  _isTimingPerfect(qte, ratio) {
    const [start, end] = this._sweetSpot(qte);
    return Math.abs(ratio - (start + end) / 2) <= (end - start) * 0.22;
  }

  _eventData(qte) {
    return {
      type: qte.type, source: qte.sourceName, dedupeKey: qte.dedupeKey, input: qte.definition.input, keys: qte.definition.keys,
      label: qte.definition.label, prompt: qte.definition.prompt, theme: qte.definition.theme, windowMs: qte.windowMs,
      mashTarget: qte.definition.mashTarget ?? 1,
      accuracy: qte.accuracy,
      drawProgress: qte.definition.input === 'draw' ? qte.progress : 0,
      sweetSpot: qte.definition.input === 'timing' ? this._sweetSpot(qte) : null, metadata: qte.metadata,
    };
  }

  _emitUpdate() {
    if (this._active) emit('qteUpdate', { ...this._eventData(this._active), remainingMs: Math.max(0, this._active.remainingMs), progress: this._active.progress });
  }
}

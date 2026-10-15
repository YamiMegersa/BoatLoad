import { emit, on, off } from '../core/EventBus.js';

export const QTEType = Object.freeze({
  SHOOT: 'SHOOT',
  HARPOON: 'HARPOON',
  BAIL: 'BAIL',
  SIREN: 'SIREN',
});

export const QTE_SOURCES = Object.freeze({
  // Shark harpoon hits are the only scored QTE (round-2 requirement);
  // every other source resolves gameplay but awards no points.
  shark: { type: QTEType.HARPOON, reward: 50, perfectReward: 75, streakBonus: false },
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
    theme: { color: '#ff9800', icon: '💥', sound: 'barrel_shot' },
  },
  [QTEType.HARPOON]: {
    input: 'timing', keys: { tap: 'KeyH' }, windowMs: 2000, priority: 30,
    label: 'HARPOON!', prompt: 'Tap in the green zone', sweetSpot: [0.40, 0.60],
    theme: { color: '#4fc3f7', icon: '🎯', sound: 'harpoon' },
  },
  [QTEType.BAIL]: {
    input: 'mash', keys: { tap: 'ShiftLeft' }, windowMs: 2800, priority: 100,
    label: 'BAIL WATER!', prompt: 'Tap rapidly to bail', mashTarget: 8,
    theme: { color: '#2196f3', icon: '🪣', sound: 'bail' },
  },
  [QTEType.SIREN]: {
    input: 'alternate', keys: { left: 'KeyA', right: 'KeyD' }, windowMs: 3000, priority: 70,
    label: 'RESIST THE SONG!', prompt: 'Alternate LEFT and RIGHT', chainTarget: 8,
    theme: { color: '#ff66cc', icon: '♫', sound: 'siren_resist' },
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
  alternate: {
    onInput(system, qte, input) {
      if (input.kind !== 'left' && input.kind !== 'right') return;
      emit('playSound', { sound: 'qte_tick', alt: input.kind === 'right' });
      if (input.kind === qte.lastSide) qte.progress = Math.max(0, qte.progress - 1);
      else {
        qte.lastSide = input.kind;
        qte.progress++;
      }
      system._emitUpdate();
      if (qte.progress >= qte.definition.chainTarget) system._succeed();
    },
  },
};

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
    this._boundKey = event => this._handleKeyDown(event);
    on('qteInput', this._onInput);
    on('gamePaused', this._onPaused);
    window.addEventListener('keydown', this._boundKey);
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
    if (this._active?.sourceName === sourceName || this._queue.some(qte => qte.sourceName === sourceName)) return false;

    const windowMs = Math.round((options.windowMs ?? definition.windowMs) * this._tuning.windowScale);
    const qte = {
      id: this._nextId++, type, sourceName, source, definition, windowMs, remainingMs: windowMs,
      queueRemainingMs: options.queueExpiryMs ?? Math.max(windowMs * 2, 4000), progress: 0, lastSide: null,
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
  }

  resolveTap() {
    this._handleInput({ kind: 'tap' });
  }

  getStats() {
    return { streak: this._streak, byType: structuredClone(this._stats.byType), bySource: structuredClone(this._stats.bySource) };
  }

  dispose() {
    this._active = null;
    this._queue.length = 0;
    off('qteInput', this._onInput);
    off('gamePaused', this._onPaused);
    window.removeEventListener('keydown', this._boundKey);
  }

  _handleInput(input) {
    if (this._paused || !this._active) return;
    INPUT_HANDLERS[this._active.definition.input]?.onInput(this, this._active, input);
  }

  _handleKeyDown(event) {
    if (this._paused || !this._active) return;
    const kind = Object.entries(this._active.definition.keys).find(([, key]) => key === event.code)?.[0];
    if (!kind) return;
    event.preventDefault();
    this._handleInput({ kind });
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
      this._record(qte, 'miss');
      this._streak = 0;
      qte.onFail({ reason: 'expired', queued: true });
      emit('qteFail', { type: qte.type, source: qte.sourceName, reason: 'expired', queued: true });
    }
  }

  _succeed() {
    const qte = this._active;
    if (!qte) return;
    const ratio = this._elapsedRatio(qte);
    const isPerfect = qte.definition.input === 'timing' ? this._isTimingPerfect(qte, ratio) : ratio <= 0.65;
    const streak = ++this._streak;
    const { points, multiplier } = computePoints(qte.source, isPerfect, streak);
    const timing = { elapsed: qte.windowMs - qte.remainingMs, ratio, isPerfect, streak, multiplier, points };
    this._active = null;
    this._record(qte, isPerfect ? 'perfect' : 'good');
    emit('qteSuccess', { type: qte.type, source: qte.sourceName, ...timing, metadata: qte.metadata });
    if (points > 0) emit('scoreAdded', { points, label: isPerfect ? 'PERFECT!' : 'GOOD!', isPerfect, streak, multiplier, source: qte.sourceName });
    emit('playSound', { sound: qte.definition.theme.sound || 'qte_success' });
    qte.onSuccess(timing);
    this._startNext();
  }

  _fail(reason) {
    const qte = this._active;
    if (!qte) return;
    this._active = null;
    this._record(qte, 'miss');
    this._streak = 0;
    emit('qteFail', { type: qte.type, source: qte.sourceName, reason, metadata: qte.metadata });
    emit('playSound', { sound: 'qte_fail' });
    qte.onFail({ reason, queued: false });
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
      type: qte.type, source: qte.sourceName, input: qte.definition.input, keys: qte.definition.keys,
      label: qte.definition.label, prompt: qte.definition.prompt, theme: qte.definition.theme, windowMs: qte.windowMs,
      mashTarget: qte.definition.mashTarget ?? qte.definition.chainTarget ?? 1,
      sweetSpot: qte.definition.input === 'timing' ? this._sweetSpot(qte) : null, metadata: qte.metadata,
    };
  }

  _emitUpdate() {
    if (this._active) emit('qteUpdate', { ...this._eventData(this._active), remainingMs: Math.max(0, this._active.remainingMs), progress: this._active.progress });
  }
}

import { emit, on, off } from '../core/EventBus.js';

export const QTEType = Object.freeze({
  SHOOT: 'SHOOT',
  HARPOON: 'HARPOON',
  BAIL: 'BAIL',
  RESIST: 'RESIST',
  SIREN: 'SIREN',
});

export const QTE_DEFINITIONS = Object.freeze({
  [QTEType.SHOOT]: {
    input: 'timing', key: 'Space', windowMs: 1800, priority: 20, reward: 75,
    label: 'FIRE!', prompt: 'Tap in the green zone', sweetSpot: [0.42, 0.62],
  },
  [QTEType.HARPOON]: {
    input: 'timing', key: 'KeyH', windowMs: 2000, priority: 30, reward: 100,
    label: 'HARPOON!', prompt: 'Tap in the green zone', sweetSpot: [0.40, 0.60],
  },
  [QTEType.BAIL]: {
    input: 'mash', key: 'ShiftLeft', windowMs: 2800, priority: 100, reward: 0,
    label: 'BAIL WATER!', prompt: 'Tap rapidly to bail', mashTarget: 8,
  },
  [QTEType.RESIST]: {
    input: 'mash', key: 'ShiftLeft', windowMs: 2600, priority: 60, reward: 50,
    label: 'RESIST!', prompt: 'Tap rapidly to resist', mashTarget: 7,
  },
  [QTEType.SIREN]: {
    input: 'mash', key: 'ShiftLeft', windowMs: 2600, priority: 70, reward: 75,
    label: 'BREAK THE SONG!', prompt: 'Tap rapidly to resist', mashTarget: 8,
  },
});

export class QTESystem {
  constructor(tuning = {}, abilities = []) {
    this._active = null;
    this._queue = [];
    this._nextId = 1;
    this._streak = 0;
    this._stats = {};
    this._tuning = this._createTuning(tuning, abilities);
    this._boundKey = this._onKeyDown.bind(this);
    this._onTap = () => this.resolveTap();
    on('qteTap', this._onTap);
  }

  trigger(options) {
    const definition = QTE_DEFINITIONS[options.type];
    if (!definition) {
      console.warn(`[QTE] Unknown type: ${options.type}`);
      return false;
    }

    if (this._active?.type === options.type || this._queue.some(qte => qte.type === options.type)) {
      return false;
    }

    const windowMs = Math.round((options.windowMs ?? definition.windowMs) * this._tuning.windowScale);
    const qte = {
      id: this._nextId++,
      type: options.type,
      definition,
      windowMs,
      remainingMs: windowMs,
      queueRemainingMs: options.queueExpiryMs ?? Math.max(windowMs * 2, 4000),
      progress: 0,
      onSuccess: options.onSuccess ?? (() => {}),
      onFail: options.onFail ?? (() => {}),
      metadata: options.metadata ?? {},
    };

    if (!this._active) {
      this._start(qte);
    } else {
      this._queue.push(qte);
      this._queue.sort((left, right) => right.definition.priority - left.definition.priority);
      emit('qteQueued', { type: qte.type, priority: qte.definition.priority });
    }
    return true;
  }

  update(delta) {
    this._updateQueue(delta);
    if (!this._active) {
      this._startNext();
      return;
    }

    this._active.remainingMs -= delta * 1000;
    this._emitUpdate();
    if (this._active.remainingMs <= 0) this._fail('timeout');
  }

  resolveTap() {
    const qte = this._active;
    if (!qte) return;

    if (qte.definition.input === 'mash') {
      qte.progress = Math.min(qte.definition.mashTarget, qte.progress + 1);
      this._emitUpdate();
      if (qte.progress >= qte.definition.mashTarget) this._succeed();
      return;
    }

    if (qte.definition.input === 'timing') {
      const ratio = this._elapsedRatio(qte);
      const [start, end] = this._sweetSpot(qte);
      if (ratio >= start && ratio <= end) this._succeed();
      else this._fail('mistimed');
      return;
    }

    this._succeed();
  }

  resolveExternal() {
    if (this._active) this._succeed();
  }

  getStats() {
    return {
      streak: this._streak,
      byType: structuredClone(this._stats),
    };
  }

  dispose() {
    this._active = null;
    this._queue.length = 0;
    window.removeEventListener('keydown', this._boundKey);
    off('qteTap', this._onTap);
  }

  _createTuning(tuning, abilities) {
    const normalized = new Set(abilities.map(ability => String(ability).toLowerCase().replace(/[_\s-]/g, '')));
    const sharpEye = normalized.has('sharpeye');
    return {
      windowScale: (tuning.windowScale ?? 1) * (sharpEye ? 1.2 : 1),
      perfectScale: tuning.perfectScale ?? 1,
    };
  }

  _start(qte) {
    this._active = qte;
    window.addEventListener('keydown', this._boundKey);
    emit('qteStart', this._eventData(qte));
    this._emitUpdate();
  }

  _startNext() {
    if (this._active || !this._queue.length) return;
    this._start(this._queue.shift());
  }

  _updateQueue(delta) {
    const elapsedMs = delta * 1000;
    const expired = [];
    this._queue = this._queue.filter(qte => {
      qte.queueRemainingMs -= elapsedMs;
      if (qte.queueRemainingMs > 0) return true;
      expired.push(qte);
      return false;
    });
    for (const qte of expired) {
      this._record(qte.type, 'miss');
      qte.onFail({ reason: 'expired', queued: true });
      emit('qteFail', { type: qte.type, reason: 'expired', queued: true });
    }
  }

  _onKeyDown(event) {
    if (this._active && event.code === this._active.definition.key) {
      event.preventDefault();
      this.resolveTap();
    }
  }

  _succeed() {
    const qte = this._active;
    if (!qte) return;
    const ratio = this._elapsedRatio(qte);
    const isPerfect = qte.definition.input === 'timing'
      ? this._isTimingPerfect(qte, ratio)
      : ratio <= Math.min(0.65, 0.45 * this._tuning.perfectScale + 0.2);
    const streak = ++this._streak;
    const multiplier = Math.min(2, 1 + Math.floor((streak - 1) / 3) * 0.25);
    const points = Math.round(qte.definition.reward * (isPerfect ? 2 : 1) * multiplier);
    const timing = { elapsed: qte.windowMs - qte.remainingMs, ratio, isPerfect, streak, multiplier, points };

    this._active = null;
    window.removeEventListener('keydown', this._boundKey);
    this._record(qte.type, isPerfect ? 'perfect' : 'good');
    emit('qteSuccess', { type: qte.type, ...timing, metadata: qte.metadata });
    if (points > 0) emit('scoreAdded', { points, label: isPerfect ? 'PERFECT!' : 'GOOD!', isPerfect, streak, multiplier });
    emit('playSound', { sound: 'qte_success' });
    qte.onSuccess(timing);
    this._startNext();
  }

  _fail(reason) {
    const qte = this._active;
    if (!qte) return;
    this._active = null;
    window.removeEventListener('keydown', this._boundKey);
    this._record(qte.type, 'miss');
    this._streak = 0;
    emit('qteFail', { type: qte.type, reason, metadata: qte.metadata });
    emit('playSound', { sound: 'qte_fail' });
    qte.onFail({ reason, queued: false });
    this._startNext();
  }

  _record(type, result) {
    this._stats[type] ??= { perfect: 0, good: 0, miss: 0 };
    this._stats[type][result]++;
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
    const centre = (start + end) / 2;
    return Math.abs(ratio - centre) <= (end - start) * 0.22;
  }

  _eventData(qte) {
    return {
      type: qte.type,
      key: qte.definition.key,
      input: qte.definition.input,
      label: qte.definition.label,
      prompt: qte.definition.prompt,
      windowMs: qte.windowMs,
      mashTarget: qte.definition.mashTarget ?? 1,
      sweetSpot: qte.definition.input === 'timing' ? this._sweetSpot(qte) : null,
      metadata: qte.metadata,
    };
  }

  _emitUpdate() {
    if (!this._active) return;
    emit('qteUpdate', {
      ...this._eventData(this._active),
      remainingMs: Math.max(0, this._active.remainingMs),
      progress: this._active.progress,
    });
  }
}

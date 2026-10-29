import { emit, on, off } from '../core/EventBus.js';

function isEditableTarget(target) {
  const tagName = target?.tagName?.toLowerCase();
  if (tagName === 'textarea' || tagName === 'select' || target?.isContentEditable) return true;
  if (tagName !== 'input') return false;
  return !['checkbox', 'radio', 'button'].includes(target.type?.toLowerCase());
}

function isCheckboxOrButton(element) {
  const tagName = element?.tagName?.toLowerCase();
  return tagName === 'button' ||
    (tagName === 'input' && element.type?.toLowerCase() === 'checkbox');
}

export class QTEInputRouter {
  constructor({
    target = globalThis.window,
    documentRef = globalThis.document,
    qteSystem,
    isDirectorActive = () => false,
  }) {
    this._target = target;
    this._document = documentRef;
    this._qteSystem = qteSystem;
    this._isDirectorActive = isDirectorActive;
    this._down = false;
    this._consumedDown = false;
    this._holdingQTE = false;
    this._paused = false;
    this._disposed = false;

    this._onKeyDown = event => this._handleKeyDown(event);
    this._onKeyUp = event => this._handleKeyUp(event);
    this._onBlur = () => this._clearHeldState();
    this._onVisibilityChange = () => {
      if (this._document?.hidden || this._document?.visibilityState === 'hidden') {
        this._clearHeldState();
      }
    };
    this._onPaused = ({ paused }) => {
      this._paused = Boolean(paused);
      if (this._paused) this._clearHeldState();
    };

    this._target?.addEventListener('keydown', this._onKeyDown);
    this._target?.addEventListener('keyup', this._onKeyUp);
    this._target?.addEventListener('blur', this._onBlur);
    this._document?.addEventListener('visibilitychange', this._onVisibilityChange);
    on('gamePaused', this._onPaused);
  }

  _handleKeyDown(event) {
    if (event.code !== 'Space') return;
    if (this._isIgnoredContext(event)) return;

    if (event.repeat || this._down) {
      if (this._consumedDown) event.preventDefault();
      return;
    }

    this._down = true;
    if (this._paused || this._isDirectorActive()) return;

    if (this._qteSystem?.hasActive()) {
      const kind = this._qteSystem.getInputKindForKey('Space');
      if (kind) {
        this._consume(event);
        if (kind === 'holdStart') this._holdingQTE = true;
        emit('qteInput', { kind });
      }
    }
  }

  _handleKeyUp(event) {
    if (event.code !== 'Space') return;
    this._down = false;
    if (this._holdingQTE) {
      this._holdingQTE = false;
      emit('qteInput', { kind: 'holdEnd' });
    }
    if (!this._consumedDown) return;
    event.preventDefault();
    this._consumedDown = false;
  }

  _isIgnoredContext(event) {
    return this._isDirectorActive() || this._paused ||
      event.ctrlKey || event.altKey || event.metaKey ||
      isEditableTarget(event.target);
  }

  _consume(event) {
    event.preventDefault();
    this._consumedDown = true;
    const activeElement = this._document?.activeElement;
    if (isCheckboxOrButton(activeElement)) activeElement.blur();
  }

  _clearHeldState() {
    this._down = false;
    this._consumedDown = false;
    if (this._holdingQTE) {
      this._holdingQTE = false;
      emit('qteInput', { kind: 'holdEnd' });
    }
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._target?.removeEventListener('keydown', this._onKeyDown);
    this._target?.removeEventListener('keyup', this._onKeyUp);
    this._target?.removeEventListener('blur', this._onBlur);
    this._document?.removeEventListener('visibilitychange', this._onVisibilityChange);
    off('gamePaused', this._onPaused);
    this._clearHeldState();
  }
}

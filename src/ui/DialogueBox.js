import { emit, on, off } from '../core/EventBus.js';

/**
 * DialogueBox — Papers Please-style dialogue panel for the Dock phase.
 *
 * Shows customer portrait + typewriter text with Animal Crossing-style
 * syllable voice playback, plus a "Next" button to complete/advance lines.
 * Emits 'dialogueDone' when all lines are consumed.
 */
export class DialogueBox {
  constructor() {
    this._el = null;
    this._lines = [];
    this._idx = 0;
    this._voice = null;
    this._typeTimer = null;
    this._isTyping = false;
    this._charIndex = 0;

    this._onShowDialogue = d => { if (d?.dialogue) this.mount(d.dialogue); };
    this._onHideDialogue = () => this.unmount();
    on('showDialogue', this._onShowDialogue);
    on('hideDialogue', this._onHideDialogue);
    on('uiMount', d => { if (d.screen === 'dock' && d.dialogue) this.mount(d.dialogue); });
    on('uiUnmount', d => { if (d.screen === 'dock') this.unmount(); });
  }

  /**
   * @param {{ id?: string, portrait: string, name: string, lines: Array<string|{text: string, name?: string, portrait?: string, voice?: object}>, voice?: object, onComplete?: Function }} dialogue
   */
  mount(dialogue) {
    if (this._el) this.unmount();

    // Release pointer lock immediately so the player has mouse cursor control to click Next
    if (document.exitPointerLock && (document.pointerLockElement || document.webkitPointerLockElement)) {
      try {
        document.exitPointerLock();
      } catch (_) {}
    }

    this._dialogueId = dialogue.id ?? null;
    this._onComplete = typeof dialogue.onComplete === 'function' ? dialogue.onComplete : null;
    this._defaultPortrait = dialogue.portrait ?? '<span class="pixel-icon icon-portrait-captain size-48"></span>';
    this._defaultName = dialogue.name ?? 'Customer';
    this._lines = dialogue.lines ?? [];
    this._idx = 0;
    this._defaultVoice = dialogue.voice ?? {
      pitch: 1.0,
      pitchVariance: 0.08,
      charIntervalMs: 30,
      syllableStep: 2,
      clips: null
    };
    this._voice = this._defaultVoice;

    this._el = document.createElement('div');
    this._el.id = 'dialogue-box';
    this._el.innerHTML = `
      <div id="dlg-portrait">${this._defaultPortrait}</div>
      <div id="dlg-content">
        <div id="dlg-name">${this._defaultName}</div>
        <div id="dlg-text"></div>
        <button id="dlg-next"><span class="dlg-space-badge">SPACE</span> Next <span class="pixel-icon icon-play-step size-14"></span></button>
      </div>
    `;

    this._el.querySelector('#dlg-next').addEventListener('click', (e) => {
      e.stopPropagation();
      this._advance();
    });

    // Also support advancing via keyboard (Space, Enter, or E)
    this._onKeyDown = (e) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') {
        e.preventDefault();
        e.stopPropagation();
        this._advance();
      }
    };
    window.addEventListener('keydown', this._onKeyDown, true);

    document.getElementById('ui-root')?.appendChild(this._el);
    this._showLine();
  }

  unmount() {
    this._stopTyping();
    emit('stopVoice');
    if (this._onKeyDown) {
      window.removeEventListener('keydown', this._onKeyDown, true);
      this._onKeyDown = null;
    }
    this._el?.remove();
    this._el = null;
  }

    _stopTyping() {
      if (this._typeTimer) {
        clearTimeout(this._typeTimer);
        this._typeTimer = null;
      }
      this._isTyping = false;
    }

    _getLineText(idx) {
      const entry = this._lines[idx];
      if (!entry) return '';
      return typeof entry === 'string' ? entry : (entry.text ?? '');
    }

    _advance() {
      const fullLine = this._getLineText(this._idx);
      // If typewriter is still revealing the current line, finish it immediately on first click
      if (this._isTyping) {
        this._stopTyping();
        emit('stopVoice');
        const textEl = this._el?.querySelector('#dlg-text');
        if (textEl) textEl.textContent = fullLine;
        return;
      }

      this._idx++;
      if (this._idx >= this._lines.length) {
        const doneId = this._dialogueId;
        const cb = this._onComplete;
        emit('stopVoice');
        this.unmount();
        emit('dialogueDone', { id: doneId });
        if (cb) cb();
      } else {
        this._showLine();
      }
    }

    _showLine() {
      this._stopTyping();
      emit('stopVoice');
      const textEl = this._el?.querySelector('#dlg-text');
      if (!textEl) return;

      const entry = this._lines[this._idx];
      const fullLine = this._getLineText(this._idx);
      const activeVoice = (entry && typeof entry === 'object' && entry.voice) ? entry.voice : this._defaultVoice;
      this._voice = activeVoice;

      // Update speaker name and portrait if overridden on this line
      const nameEl = this._el?.querySelector('#dlg-name');
      const portraitEl = this._el?.querySelector('#dlg-portrait');
      if (nameEl) {
        nameEl.textContent = (entry && typeof entry === 'object' && entry.name) ? entry.name : this._defaultName;
      }
      if (portraitEl) {
        portraitEl.innerHTML = (entry && typeof entry === 'object' && entry.portrait) ? entry.portrait : this._defaultPortrait;
      }

      const nextBtn = this._el?.querySelector('#dlg-next');
      if (nextBtn) {
        const isLastLine = this._idx >= this._lines.length - 1;
        if (isLastLine) {
          nextBtn.innerHTML = '<span class="dlg-space-badge">SPACE</span> Continue <span class="pixel-icon icon-confirm-check size-14"></span>';
        } else {
          nextBtn.innerHTML = '<span class="dlg-space-badge">SPACE</span> Next <span class="pixel-icon icon-play-step size-14"></span>';
        }
      }

      if (!fullLine) {
        textEl.textContent = '';
        return;
      }

      textEl.textContent = '';
      this._charIndex = 0;
      this._isTyping = true;

      const baseInterval = activeVoice?.charIntervalMs ?? 36;
      const syllableStep = Math.max(1, activeVoice?.syllableStep ?? 2);
      let inParentheses = false;
      let alphaCounter = 0;
      // Track whether the complaint line (index 1) has played its opening sigh/grunt
      let complaintGruntPlayed = false;

      const SWEAR_WORD_RE = /^(fuck(?:ed|ing)?|bloody|christ|hell|bastard|shit|damned)\b/i;
      const GRUNT_WORD_RE = /^(arrr+|oi|squawk|ahem|knackered|creaks|groans|wreck|trials)\b/i;

      const step = () => {
        if (!this._isTyping || !this._el) return;

        const prevChar = this._charIndex > 0 ? fullLine[this._charIndex - 1] : ' ';
        const ch = fullLine[this._charIndex] || '';
        this._charIndex++;

        const currentText = fullLine.slice(0, this._charIndex);
        textEl.textContent = currentText;

        if (ch === '(') {
          inParentheses = true;
        }

        const isAlphanumeric = /[a-zA-Z0-9]/.test(ch);
        const isWordStart = isAlphanumeric && !/[a-zA-Z0-9']/.test(prevChar);

        if (isAlphanumeric && !inParentheses) {
          alphaCounter++;
          const remainingFromChar = fullLine.slice(this._charIndex - 1);
          const lookahead = fullLine.slice(this._charIndex, this._charIndex + 8);
          let inflection = 0;
          if (lookahead.includes('?')) inflection = 0.08;
          else if (lookahead.includes('!')) inflection = 0.05;

            if (activeVoice?.synthType === 'crab') {
              if (alphaCounter % syllableStep === 1 || syllableStep === 1) {
                emit('playVoiceBlip', {
                  voice: activeVoice,
                  pitch: activeVoice?.pitch ?? 1.2,
                  pitchVariance: activeVoice?.pitchVariance ?? 0.12,
                  inflection,
                  charCode: ch.toUpperCase().charCodeAt(0),
                  category: 'crab',
                  interrupt: true
                });
              }
            } else if (isWordStart && SWEAR_WORD_RE.test(remainingFromChar)) {
              emit('playVoiceBlip', {
                voice: this._voice,
                pitch: this._voice?.pitch ?? 1.0,
                pitchVariance: this._voice?.pitchVariance ?? 0.08,
                inflection,
                charCode: ch.toUpperCase().charCodeAt(0),
                category: 'swear',
                interrupt: true,
                clips: this._voice?.clips ?? null
              });
            } else if (isWordStart && GRUNT_WORD_RE.test(remainingFromChar)) {
              emit('playVoiceBlip', {
                voice: this._voice,
                pitch: this._voice?.pitch ?? 1.0,
                pitchVariance: this._voice?.pitchVariance ?? 0.08,
                inflection,
                charCode: ch.toUpperCase().charCodeAt(0),
                category: 'grunt',
                interrupt: false,
                clips: this._voice?.clips ?? null
              });
            } else if (this._idx === 1 && !complaintGruntPlayed) {
              // Beat 2 is always the character's "Complaint" beat — open with a sigh/grunt clip
              complaintGruntPlayed = true;
              emit('playVoiceBlip', {
                voice: this._voice,
                pitch: this._voice?.pitch ?? 1.0,
                pitchVariance: this._voice?.pitchVariance ?? 0.08,
                inflection,
                charCode: ch.toUpperCase().charCodeAt(0),
                category: 'grunt',
                interrupt: false,
                clips: this._voice?.clips ?? null
              });
            } else {
              // Chain general mumble clip whenever the previous clip finishes playing
              emit('playVoiceBlip', {
                voice: this._voice,
                pitch: this._voice?.pitch ?? 1.0,
                pitchVariance: this._voice?.pitchVariance ?? 0.08,
                inflection,
                charCode: ch.toUpperCase().charCodeAt(0),
                category: 'mumble',
                interrupt: false,
                clips: this._voice?.clips ?? null
              });
            }
          }

          if (ch === ')') {
            inParentheses = false;
          }

          if (this._charIndex >= fullLine.length) {
            this._isTyping = false;
            this._typeTimer = null;
            emit('finishVoiceLine');
            return;
          }

          // Natural cadence pauses on punctuation
          let delay = baseInterval;
          if (ch === '.' || ch === '!' || ch === '?') {
            delay = baseInterval * 5.5;
          } else if (ch === ',' || ch === ';' || ch === ':' || ch === '—') {
            delay = baseInterval * 3.0;
          }

          this._typeTimer = setTimeout(step, delay);
        };

        step();
      }

      teardown() {
        this.unmount();
        off('showDialogue', this._onShowDialogue);
        off('hideDialogue', this._onHideDialogue);
        off('uiMount');
        off('uiUnmount');
      }
    }

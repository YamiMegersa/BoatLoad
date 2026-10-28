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
    this._el        = null;
    this._lines     = [];
    this._idx       = 0;
    this._voice     = null;
    this._typeTimer = null;
    this._isTyping  = false;
    this._charIndex = 0;

    this._onShowDialogue = d => { if (d?.dialogue) this.mount(d.dialogue); };
    this._onHideDialogue = () => this.unmount();
    on('showDialogue', this._onShowDialogue);
    on('hideDialogue', this._onHideDialogue);
    on('uiMount',   d => { if (d.screen === 'dock' && d.dialogue) this.mount(d.dialogue); });
    on('uiUnmount', d => { if (d.screen === 'dock') this.unmount(); });
  }

  /**
   * @param {{ portrait: string, name: string, lines: string[], voice?: object }} dialogue
   */
  mount(dialogue) {
    if (this._el) this.unmount();

    this._lines = dialogue.lines ?? [];
    this._idx   = 0;
    this._voice = dialogue.voice ?? {
      pitch: 1.0,
      pitchVariance: 0.08,
      charIntervalMs: 30,
      syllableStep: 2,
      clips: null
    };

    this._el = document.createElement('div');
    this._el.id = 'dialogue-box';
    this._el.innerHTML = `
      <div id="dlg-portrait">${dialogue.portrait ?? '<span class="pixel-icon icon-portrait-captain size-48"></span>'}</div>
      <div id="dlg-content">
        <div id="dlg-name">${dialogue.name ?? 'Customer'}</div>
        <div id="dlg-text"></div>
        <button id="dlg-next">Next <span class="pixel-icon icon-play-step size-14"></span></button>
      </div>
    `;

    this._el.querySelector('#dlg-next').addEventListener('click', () => this._advance());
    document.getElementById('ui-root')?.appendChild(this._el);
    this._showLine();
  }

  unmount() {
    this._stopTyping();
    emit('stopVoice');
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

  _advance() {
    const fullLine = this._lines[this._idx] ?? '';
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
      emit('stopVoice');
      emit('dialogueDone');
      this.unmount();
    } else {
      this._showLine();
    }
  }

  _showLine() {
    this._stopTyping();
    emit('stopVoice');
    const textEl = this._el?.querySelector('#dlg-text');
    if (!textEl) return;

    const fullLine = this._lines[this._idx] ?? '';
    if (!fullLine) {
      textEl.textContent = '';
      return;
    }

    textEl.textContent = '';
    this._charIndex = 0;
    this._isTyping = true;

    const baseInterval = this._voice?.charIntervalMs ?? 36;
    let inParentheses = false;
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
        const remainingFromChar = fullLine.slice(this._charIndex - 1);
        const lookahead = fullLine.slice(this._charIndex, this._charIndex + 8);
        let inflection = 0;
        if (lookahead.includes('?')) inflection = 0.08;
        else if (lookahead.includes('!')) inflection = 0.05;

        // Check if a swear word or grunt/exclamation word just started
        if (isWordStart && SWEAR_WORD_RE.test(remainingFromChar)) {
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

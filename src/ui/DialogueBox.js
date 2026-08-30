import { emit, on, off } from '../core/EventBus.js';

/**
 * DialogueBox — Papers Please-style dialogue panel for the Dock phase.
 *
 * Shows customer portrait + text, with a "Next" button to advance lines.
 * Emits 'dialogueDone' when all lines are consumed.
 */
export class DialogueBox {
  constructor() {
    this._el    = null;
    this._lines = [];
    this._idx   = 0;

    on('uiMount',   d => { if (d.screen === 'dock' && d.dialogue) this.mount(d.dialogue); });
    on('uiUnmount', d => { if (d.screen === 'dock') this.unmount(); });
  }

  /**
   * @param {{ portrait: string, name: string, lines: string[] }} dialogue
   */
  mount(dialogue) {
    if (this._el) this.unmount();

    this._lines = dialogue.lines ?? [];
    this._idx   = 0;

    this._el = document.createElement('div');
    this._el.id = 'dialogue-box';
    this._el.innerHTML = `
      <div id="dlg-portrait">${dialogue.portrait ?? '🧑‍✈️'}</div>
      <div id="dlg-content">
        <div id="dlg-name">${dialogue.name ?? 'Customer'}</div>
        <div id="dlg-text"></div>
        <button id="dlg-next">Next ▶</button>
      </div>
    `;

    this._el.querySelector('#dlg-next').addEventListener('click', () => this._advance());
    document.getElementById('ui-root')?.appendChild(this._el);
    this._showLine();
  }

  unmount() {
    this._el?.remove();
    this._el = null;
  }

  _advance() {
    this._idx++;
    if (this._idx >= this._lines.length) {
      emit('dialogueDone');
      this.unmount();
    } else {
      this._showLine();
    }
  }

  _showLine() {
    const textEl = this._el?.querySelector('#dlg-text');
    if (textEl) textEl.textContent = this._lines[this._idx] ?? '';
  }

  teardown() {
    this.unmount();
    off('uiMount');
    off('uiUnmount');
  }
}

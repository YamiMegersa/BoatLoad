import { on, off, emit } from '../core/EventBus.js';

/**
 * DivorcePapersUI — Interactive parchment legal scroll modal displayed when
 * the player inspects the Divorce Papers nailed to the island post.
 */
export class DivorcePapersUI {
  constructor() {
    this._el = null;
    this._isOpen = false;

    this._onOpen = () => this.open();
    this._onClose = () => this.close();
    this._onKeyDown = (e) => {
      if (this._isOpen && (e.code === 'Escape' || e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault();
        this.close();
      }
    };

    on('openDivorcePapers', this._onOpen);
    on('closeDivorcePapers', this._onClose);
    on('uiUnmount', (d) => {
      if (d?.screen === 'dock') this.close(false);
    });
  }

  open() {
    if (this._isOpen) return;
    this._isOpen = true;

    if (document.pointerLockElement) {
      document.exitPointerLock();
    }

    emit('playSound', { sound: 'qte_success' });

    if (!this._el) {
      this._buildDOM();
    }
    this._el.style.display = 'flex';
    window.addEventListener('keydown', this._onKeyDown);
  }

  close(emitEvent = true) {
    if (!this._isOpen) return;
    this._isOpen = false;
    if (this._el) {
      this._el.style.display = 'none';
    }
    window.removeEventListener('keydown', this._onKeyDown);
    if (emitEvent) {
      emit('playSound', { sound: 'qte_tick' });
      emit('divorcePapersRead');
    }
  }

  _buildDOM() {
    this._el = document.createElement('div');
    this._el.id = 'divorce-papers-overlay';
    this._el.style.cssText = `
      position: fixed; inset: 0; z-index: 260;
      background: rgba(8, 6, 4, 0.82);
      backdrop-filter: blur(5px);
      display: none; align-items: center; justify-content: center;
      padding: 20px; pointer-events: auto; user-select: none;
    `;

    this._el.innerHTML = `
      <div class="divorce-scroll-card" style="
        position: relative;
        width: 680px; max-width: 94vw; max-height: 88vh; overflow-y: auto;
        background: radial-gradient(circle at 50% 30%, #f5ebd1 0%, #e4d2a7 65%, #cbb07a 100%);
        color: #2b1d0f;
        border: 4px solid #5c3a1e;
        border-radius: 8px;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.85), inset 0 0 40px rgba(92, 58, 30, 0.35);
        padding: 32px 38px;
        font-family: Georgia, 'Times New Roman', serif;
      ">
        <!-- Iron Spike Header Pin -->
        <div style="
          width: 18px; height: 18px; border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, #7a8288, #22252a);
          border: 2px solid #15171a;
          box-shadow: 0 3px 6px rgba(0,0,0,0.6);
          margin: -18px auto 12px auto;
        "></div>

        <div style="text-align: center; border-bottom: 2px double #6e4726; padding-bottom: 14px; margin-bottom: 18px;">
          <div style="font-size: 11px; letter-spacing: 2.5px; text-transform: uppercase; color: #7a201c; font-weight: bold;">
            Admiralty Court of Port Rotgut • Barnaby Claw, Esq., Attorney-at-Law
          </div>
          <h2 style="margin: 6px 0 4px; font-size: 26px; letter-spacing: 1px; color: #231409; text-transform: uppercase;">
            Official Writ of Divorce &amp; Notice of Lien
          </h2>
          <div style="font-size: 13px; font-style: italic; color: #5a3e24;">
            In the Matter of <strong>Marguerite the Siren</strong> (Petitioner) v. <strong>The Shipwright</strong> (Respondent)
          </div>
        </div>

        <div style="font-size: 14.5px; line-height: 1.6; color: #2b1d0f; display: flex; flex-direction: column; gap: 12px;">
          <p style="margin: 0;">
            <strong>I. RECITALS OF MATRIMONY:</strong> Whereas last Friday at <em>The Drowned Rat</em> tavern, the Respondent did become blackout drunk, place a tarnished wedding ring upon his finger, and enter into binding maritime wedlock with <strong>Marguerite, a Siren</strong>, after delivering a weeping speech of forty-five (45) minutes of which he remembers nothing.
          </p>

          <p style="margin: 0;">
            <strong>II. SETTLEMENT DEMAND (7,000 DOUBLOONS):</strong> Petitioner’s legal counsel — <em>Barnaby Claw, Esq. (a Crab)</em> — hereby demands the sum of <strong>7,000 Doubloons</strong> in the shop till by <strong>Sunday at Sundown (End of Day 7)</strong> to dissolve the union.
          </p>

          <div style="
            background: rgba(122, 32, 28, 0.09);
            border-left: 4px solid #8f2824;
            padding: 10px 14px;
            border-radius: 0 4px 4px 0;
          ">
            <strong style="color: #7a201c;">III. FORFEITURE UPON DEFAULT:</strong> Failure to remit the full <strong>7,000 Doubloons</strong> by Sunday shall result in immediate seizure of:
            <ol style="margin: 6px 0 0 18px; padding: 0;">
              <li><strong>Your Shipwright Shop &amp; Drydock</strong> in Port Rotgut;</li>
              <li><strong>Your Lop-Eared Island Bunny</strong>; and</li>
              <li><strong>The Better Half of Your Liver</strong>.</li>
            </ol>
          </div>

          <p style="margin: 0;">
            <strong>IV. TERMS OF HARBOUR OPERATION:</strong> You have <strong>7 Days</strong> and <strong>7 Customers</strong>. One customer a day. One ship a day. One repair per level. Base contracts total <strong>6,000 Doubloons</strong> across the week — the final <strong>1,000 Doubloons</strong> must be wrung from clean repairs, tips, and hard bargaining.
          </p>
        </div>

        <div style="
          display: flex; align-items: center; justify-content: space-between;
          margin-top: 22px; padding-top: 16px; border-top: 1px solid rgba(110, 71, 38, 0.4);
        ">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="
              width: 48px; height: 48px; border-radius: 50%;
              background: radial-gradient(circle at 35% 35%, #b8322c, #6e1410);
              border: 2px dashed #4a0b08;
              box-shadow: 0 3px 8px rgba(0,0,0,0.45);
              display: flex; align-items: center; justify-content: center;
              color: #f7d794; font-weight: bold; font-size: 10px; text-align: center; line-height: 1.1;
            ">CLAW<br/>ESQ.</div>
            <div style="font-size: 12px; color: #4a331c; line-height: 1.35;">
              <div><strong>Served by:</strong> Barnaby Claw, Esq. (Clerk)</div>
              <div><em>"You wept. She didn't."</em></div>
            </div>
          </div>

          <button id="btn-ack-divorce-papers" style="
            background: linear-gradient(180deg, #7a201c 0%, #521310 100%);
            color: #f8ecd1;
            border: 2px solid #d4af37;
            border-radius: 6px;
            padding: 10px 20px;
            font-family: Georgia, serif;
            font-size: 14px;
            font-weight: bold;
            letter-spacing: 0.5px;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
          ">
            Accept Writ &amp; Return to Island
          </button>
        </div>
      </div>
    `;

    this._el.addEventListener('click', (e) => {
      if (e.target === this._el) this.close();
    });
    const btn = this._el.querySelector('#btn-ack-divorce-papers');
    if (btn) {
      btn.addEventListener('click', () => this.close());
    }

    const uiRoot = document.getElementById('ui-root') || document.body;
    uiRoot.appendChild(this._el);
  }

  dispose() {
    this.close(false);
    off('openDivorcePapers', this._onOpen);
    off('closeDivorcePapers', this._onClose);
    if (this._el && this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
    this._el = null;
  }
}


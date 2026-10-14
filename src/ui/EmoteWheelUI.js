/**
 * EmoteWheelUI — Radial/circular popup menu for selecting first-person emotes.
 * Triggered by pressing 'Q'.
 */
export class EmoteWheelUI {
  /**
   * @param {Object} options
   * @param {function(string): void} options.onSelect - Callback when an emote is chosen
   * @param {function(): void} [options.onClose] - Callback when wheel closes
   */
  constructor({ onSelect, onClose }) {
    this.onSelect = onSelect;
    this.onClose = onClose;
    this.isOpen = false;

    this.emotes = [
      {
        id: 'smoke',
        key: '1',
        title: 'Smoke',
        fullTitle: 'Light & Smoke',
        desc: 'A sailor’s tobacco break',
        icon: '🚬',
        angle: 270 // Top
      },
      {
        id: 'middle_finger',
        key: '2',
        title: 'Gesture',
        fullTitle: 'Middle Finger',
        desc: 'Defiant salute to the sea',
        icon: '🖕',
        angle: 30 // Bottom-Right
      },
      {
        id: 'clap',
        key: '3',
        title: 'Clap',
        fullTitle: 'Applause',
        desc: 'Cheer for the crew & voyage',
        icon: '👏',
        angle: 150 // Bottom-Left
      }
    ];

    this._createDOM();
    this._bindEvents();
  }

  _createDOM() {
    // Inject styles
    if (!document.getElementById('dock-emote-wheel-styles')) {
      const style = document.createElement('style');
      style.id = 'dock-emote-wheel-styles';
      style.textContent = `
        .emote-wheel-overlay {
          position: absolute;
          inset: 0;
          z-index: 99;
          display: none;
          align-items: center;
          justify-content: center;
          background: rgba(4, 8, 14, 0.45);
          backdrop-filter: blur(6px);
          opacity: 0;
          pointer-events: none !important;
          transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1);
          user-select: none;
        }
        .emote-wheel-overlay.open {
          display: flex !important;
          opacity: 1;
          pointer-events: auto !important;
        }
        .emote-wheel-container {
          position: relative;
          width: 340px;
          height: 340px;
          border-radius: 50%;
          transform: scale(0.88);
          transition: transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .emote-wheel-overlay.open .emote-wheel-container {
          transform: scale(1.0);
        }
        .emote-wheel-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(16, 24, 38, 0.94) 0%, rgba(8, 13, 22, 0.96) 100%);
          border: 2px solid rgba(212, 175, 55, 0.65);
          box-shadow: 0 0 30px rgba(0, 0, 0, 0.85), 0 0 20px rgba(212, 175, 55, 0.25), inset 0 0 15px rgba(0, 0, 0, 0.6);
        }
        .emote-wheel-hub {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 130px;
          height: 130px;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          background: radial-gradient(circle, #1a2536 0%, #0d1520 100%);
          border: 1.5px solid rgba(212, 175, 55, 0.5);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          box-shadow: 0 0 16px rgba(0, 0, 0, 0.7);
          pointer-events: none;
          z-index: 5;
          padding: 8px;
          box-sizing: border-box;
        }
        .emote-hub-title {
          font-family: 'Cinzel', Georgia, serif, system-ui;
          font-size: 13px;
          font-weight: 700;
          color: #f5d77f;
          letter-spacing: 1px;
          text-transform: uppercase;
          text-shadow: 0 1px 3px rgba(0,0,0,0.8);
          line-height: 1.2;
        }
        .emote-hub-desc {
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 10px;
          color: #a0aec0;
          margin-top: 4px;
          line-height: 1.2;
        }
        .emote-hub-hint {
          font-family: monospace;
          font-size: 9px;
          color: #718096;
          margin-top: 6px;
        }
        .emote-slice-btn {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 88px;
          height: 88px;
          border-radius: 50%;
          background: rgba(22, 33, 49, 0.88);
          border: 1.5px solid rgba(255, 255, 255, 0.2);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.18s ease, background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
          color: #fff;
          z-index: 4;
          outline: none;
        }
        .emote-slice-btn:hover, .emote-slice-btn.active {
          background: rgba(45, 62, 88, 0.95);
          border-color: #f5d77f;
          box-shadow: 0 0 18px rgba(245, 215, 127, 0.5), 0 4px 15px rgba(0, 0, 0, 0.7);
          transform: translate(-50%, -50%) scale(1.12) !important;
        }
        .emote-slice-icon {
          font-size: 26px;
          line-height: 1;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6));
        }
        .emote-slice-label {
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 11px;
          font-weight: 600;
          color: #e2e8f0;
          margin-top: 3px;
          letter-spacing: 0.3px;
        }
        .emote-slice-key {
          position: absolute;
          top: -4px;
          right: -4px;
          background: #4a3821;
          border: 1px solid #d4af37;
          border-radius: 4px;
          font-family: monospace;
          font-size: 10px;
          font-weight: bold;
          color: #fef3c7;
          padding: 1px 5px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.5);
        }
      `;
      document.head.appendChild(style);
    }

    // Outer Overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'emote-wheel-overlay';
    this.overlay.style.display = 'none';

    // Wheel Container
    this.container = document.createElement('div');
    this.container.className = 'emote-wheel-container';
    this.overlay.appendChild(this.container);

    // Decorative Ring
    const ring = document.createElement('div');
    ring.className = 'emote-wheel-ring';
    this.container.appendChild(ring);

    // Center Hub
    this.hub = document.createElement('div');
    this.hub.className = 'emote-wheel-hub';
    this.hub.innerHTML = `
      <div class="emote-hub-title" id="emote-hub-title">EMOTES</div>
      <div class="emote-hub-desc" id="emote-hub-desc">Press [Q] or [Esc] to exit</div>
      <div class="emote-hub-hint">Select an action</div>
    `;
    this.container.appendChild(this.hub);

    this.hubTitle = this.hub.querySelector('#emote-hub-title');
    this.hubDesc = this.hub.querySelector('#emote-hub-desc');

    // Slices
    const radius = 108; // Distance from center
    this.sliceButtons = [];

    this.emotes.forEach(emote => {
      const btn = document.createElement('button');
      btn.className = 'emote-slice-btn';
      btn.type = 'button';

      const rad = (emote.angle * Math.PI) / 180;
      const x = Math.cos(rad) * radius;
      const y = Math.sin(rad) * radius;

      btn.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;

      btn.innerHTML = `
        <span class="emote-slice-key">${emote.key}</span>
        <span class="emote-slice-icon">${emote.icon}</span>
        <span class="emote-slice-label">${emote.title}</span>
      `;

      btn.addEventListener('mouseenter', () => {
        this.hubTitle.textContent = emote.fullTitle;
        this.hubDesc.textContent = emote.desc;
        btn.classList.add('active');
      });

      btn.addEventListener('mouseleave', () => {
        this.hubTitle.textContent = 'EMOTES';
        this.hubDesc.textContent = 'Press [Q] or [Esc] to exit';
        btn.classList.remove('active');
      });

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._selectEmote(emote.id);
      });

      this.container.appendChild(btn);
      this.sliceButtons.push({ element: btn, emote });
    });

    // Close on overlay backdrop click
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    const uiRoot = document.getElementById('ui-root') || document.body;
    uiRoot.appendChild(this.overlay);
  }

  _bindEvents() {
    this._onKeyDown = (e) => {
      if (!this.isOpen) return;

      if (e.code === 'KeyQ' || e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
        return;
      }

      // Quick numbers 1, 2, 3
      if (e.code === 'Digit1' || e.code === 'Numpad1') {
        this._selectEmote('smoke');
      } else if (e.code === 'Digit2' || e.code === 'Numpad2') {
        this._selectEmote('middle_finger');
      } else if (e.code === 'Digit3' || e.code === 'Numpad3') {
        this._selectEmote('clap');
      }
    };

    window.addEventListener('keydown', this._onKeyDown, true);
  }

  _selectEmote(emoteId) {
    this.close();
    if (this.onSelect) {
      this.onSelect(emoteId);
    }
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.overlay.style.display = 'flex';
    this.overlay.offsetHeight; // force reflow for opacity transition
    this.overlay.classList.add('open');

    // Reset hub text
    this.hubTitle.textContent = 'EMOTES';
    this.hubDesc.textContent = 'Press [Q] or [Esc] to exit';
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.overlay.classList.remove('open');
    this.overlay.style.display = 'none';
    if (this.onClose) {
      this.onClose();
    }
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown, true);
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
  }
}

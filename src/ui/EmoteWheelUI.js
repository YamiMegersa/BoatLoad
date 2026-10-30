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
    this.hoveredIndex = -1;

    this.emotes = [
      {
        id: 'smoke',
        key: '1',
        title: 'Smoke',
        fullTitle: 'Light & Smoke',
        desc: 'A sailor’s quiet tobacco break',
        icon: '<span class="pixel-icon icon-smoke-pipe size-24"></span>',
        angle: 270 // 12 o'clock
      },
      {
        id: 'fist_bump',
        key: '2',
        title: 'Fist Bump',
        fullTitle: 'Self Fist Bump',
        desc: 'Knuckle bump yourself & boom!',
        icon: '<span style="font-size: 20px; line-height: 1;">👊</span>',
        angle: 300 // 1 o'clock
      },
      {
        id: 'middle_finger',
        key: '3',
        title: 'Gesture',
        fullTitle: 'Middle Finger',
        desc: 'Defiant salute to the high seas',
        icon: '<span class="pixel-icon icon-defiant-finger size-24"></span>',
        angle: 330 // 2 o'clock
      },
      {
        id: 'hook_hand',
        key: '4',
        title: 'Hook Hand',
        fullTitle: 'Pirate Hook Hand',
        desc: 'Buff the steel hook until it shines',
        icon: '<span style="font-size: 20px; line-height: 1;">🪝</span>',
        angle: 0 // 3 o'clock
      },
      {
        id: 'rum_swig',
        key: '5',
        title: 'Rum Swig',
        fullTitle: 'Swig of Grog',
        desc: 'Uncork the bottle & hearty swig',
        icon: '<span style="font-size: 20px; line-height: 1;">🍾</span>',
        angle: 30 // 4 o'clock
      },
      {
        id: 'clap',
        key: '6',
        title: 'Applause',
        fullTitle: 'Cheer & Clap',
        desc: 'Hearty applause for the crew',
        icon: '<span class="pixel-icon icon-clap-hands size-24"></span>',
        angle: 60 // 5 o'clock
      },
      {
        id: 'coin_flip',
        key: '7',
        title: 'Coin Flip',
        fullTitle: 'Gold Doubloon Flip',
        desc: 'Spin a gold coin high in the air',
        icon: '<span class="pixel-icon icon-doubloon size-20"></span>',
        angle: 90 // 6 o'clock
      },
      {
        id: 'card_trick',
        key: '8',
        title: 'Card Trick',
        fullTitle: 'Disappearing Card',
        desc: 'Sleight of hand card magic',
        icon: '<span style="font-size: 20px; line-height: 1;">🃏</span>',
        angle: 120 // 7 o'clock
      },
      {
        id: 'spyglass',
        key: '9',
        title: 'Spyglass',
        fullTitle: 'Brass Spyglass',
        desc: 'Extend telescope & scan horizon',
        icon: '<span class="pixel-icon icon-optics-lens size-20"></span>',
        angle: 150 // 8 o'clock
      },
      {
        id: 'jazz_hands',
        key: '0',
        title: 'Jazz Hands',
        fullTitle: 'Sparkle Jazz Hands',
        desc: 'Showtime shimmy with both palms',
        icon: '<span style="font-size: 20px; line-height: 1;">👐</span>',
        angle: 180 // 9 o'clock
      },
      {
        id: 'needle',
        key: '-',
        title: 'Syringe',
        fullTitle: 'Arm Injection',
        desc: 'Quick vitamin dose straight to vein',
        icon: '<span class="pixel-icon icon-sail-needle size-20"></span>',
        angle: 210 // 10 o'clock
      },
      {
        id: 'facepalm',
        key: '=',
        title: 'Facepalm',
        fullTitle: 'Captain’s Facepalm',
        desc: 'Slap forehead in exasperated defeat',
        icon: '<span style="font-size: 20px; line-height: 1;">🤦</span>',
        angle: 240 // 11 o'clock
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
          width: 440px;
          height: 440px;
          border-radius: 50%;
          transform: scale(0.9);
          transition: transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          cursor: pointer;
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
          box-shadow: 0 0 32px rgba(0, 0, 0, 0.85), 0 0 20px rgba(212, 175, 55, 0.25), inset 0 0 15px rgba(0, 0, 0, 0.6);
          pointer-events: none;
        }
        .emote-wheel-hub {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 136px;
          height: 136px;
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
          font-size: 12.5px;
          font-weight: 700;
          color: #f5d77f;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          text-shadow: 0 1px 3px rgba(0,0,0,0.8);
          line-height: 1.2;
        }
        .emote-hub-desc {
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 9.5px;
          color: #a0aec0;
          margin-top: 4px;
          line-height: 1.2;
        }
        .emote-hub-hint {
          font-family: monospace;
          font-size: 9px;
          color: #718096;
          margin-top: 5px;
        }
        .emote-slice-btn {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: rgba(22, 33, 49, 0.90);
          border: 1.5px solid rgba(255, 255, 255, 0.22);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transform: translate(calc(-50% + var(--btn-x, 0px)), calc(-50% + var(--btn-y, 0px)));
          transition: transform 0.15s ease-out, background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.55);
          color: #fff;
          z-index: 4;
          outline: none;
          box-sizing: border-box;
        }
        .emote-slice-btn:hover, .emote-slice-btn.active {
          background: rgba(45, 65, 95, 0.98);
          border-color: #f5d77f;
          box-shadow: 0 0 16px rgba(245, 215, 127, 0.6), 0 4px 15px rgba(0, 0, 0, 0.7);
          transform: translate(calc(-50% + var(--btn-x, 0px)), calc(-50% + var(--btn-y, 0px))) scale(1.14);
          z-index: 6;
        }
        .emote-slice-icon {
          font-size: 20px;
          line-height: 1;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6));
        }
        .emote-slice-label {
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 9px;
          font-weight: 600;
          color: #e2e8f0;
          margin-top: 2px;
          letter-spacing: 0.2px;
          white-space: nowrap;
        }
        .emote-slice-key {
          position: absolute;
          top: -3px;
          right: -3px;
          background: #4a3821;
          border: 1px solid #d4af37;
          border-radius: 4px;
          font-family: monospace;
          font-size: 8.5px;
          font-weight: bold;
          color: #fef3c7;
          padding: 1px 3.5px;
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

    // Slices (12 radial items around the circle)
    const radius = 152; // Distance from center
    this.sliceButtons = [];

    this.emotes.forEach((emote, idx) => {
      const btn = document.createElement('button');
      btn.className = 'emote-slice-btn';
      btn.type = 'button';

      const rad = (emote.angle * Math.PI) / 180;
      const x = Math.cos(rad) * radius;
      const y = Math.sin(rad) * radius;

      btn.style.setProperty('--btn-x', `${x.toFixed(1)}px`);
      btn.style.setProperty('--btn-y', `${y.toFixed(1)}px`);

      btn.innerHTML = `
        <span class="emote-slice-key">${emote.key}</span>
        <span class="emote-slice-icon">${emote.icon}</span>
        <span class="emote-slice-label">${emote.title}</span>
      `;

      btn.addEventListener('mouseenter', () => {
        this._highlightSlice(idx);
      });

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._selectEmote(emote.id);
      });

      this.container.appendChild(btn);
      this.sliceButtons.push({ element: btn, emote });
    });

    // Mouse movement inside container to smoothly track angular direction
    this.container.addEventListener('mousemove', (e) => {
      const rect = this.container.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      const dist = Math.hypot(dx, dy);

      if (dist >= 55 && dist <= 235) {
        let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (deg < 0) deg += 360;

        let closestIdx = 0;
        let minDiff = 360;

        this.emotes.forEach((emote, i) => {
          let diff = Math.abs(deg - emote.angle);
          if (diff > 180) diff = 360 - diff;
          if (diff < minDiff) {
            minDiff = diff;
            closestIdx = i;
          }
        });

        this._highlightSlice(closestIdx);
      } else if (dist < 55) {
        this._clearHighlight();
      }
    });

    this.container.addEventListener('mouseleave', () => {
      this._clearHighlight();
    });

    // Clicking anywhere in container selects the highlighted emote
    this.container.addEventListener('click', (e) => {
      if (this.hoveredIndex >= 0 && this.hoveredIndex < this.emotes.length) {
        e.stopPropagation();
        this._selectEmote(this.emotes[this.hoveredIndex].id);
      }
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

  _highlightSlice(index) {
    if (this.hoveredIndex === index) return;
    this.hoveredIndex = index;

    this.sliceButtons.forEach((item, i) => {
      if (i === index) {
        item.element.classList.add('active');
        this.hubTitle.textContent = item.emote.fullTitle;
        this.hubDesc.textContent = item.emote.desc;
      } else {
        item.element.classList.remove('active');
      }
    });
  }

  _clearHighlight() {
    this.hoveredIndex = -1;
    this.sliceButtons.forEach(item => {
      item.element.classList.remove('active');
    });
    this.hubTitle.textContent = 'EMOTES';
    this.hubDesc.textContent = 'Press [Q] or [Esc] to exit';
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

      // Quick numbers 1 through 12
      const digitMap = {
        Digit1: 0, Numpad1: 0,
        Digit2: 1, Numpad2: 1,
        Digit3: 2, Numpad3: 2,
        Digit4: 3, Numpad4: 3,
        Digit5: 4, Numpad5: 4,
        Digit6: 5, Numpad6: 5,
        Digit7: 6, Numpad7: 6,
        Digit8: 7, Numpad8: 7,
        Digit9: 8, Numpad9: 8,
        Digit0: 9, Numpad0: 9,
        Minus: 10, NumpadSubtract: 10,
        Equal: 11, NumpadAdd: 11
      };

      if (e.code in digitMap) {
        const idx = digitMap[e.code];
        if (this.emotes[idx]) {
          e.preventDefault();
          e.stopPropagation();
          this._selectEmote(this.emotes[idx].id);
        }
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

    // Reset hub text and highlights
    this._clearHighlight();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.overlay.classList.remove('open');
    this.overlay.style.display = 'none';
    this._clearHighlight();
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

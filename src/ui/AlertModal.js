/**
 * AlertModal.js — Pirate-themed modal dialog replacement for native alert() and confirm().
 */

export class AlertModal {
  /**
   * Shows a themed alert modal dialog.
   * @param {string|object} options
   * @returns {Promise<boolean>}
   */
  static show(options) {
    return new Promise((resolve) => {
      const opts = typeof options === 'string' ? { message: options } : (options || {});
      const title = opts.title || 'Attention, Captain!';
      const message = opts.message || '';
      const icon = opts.icon || 'icon-powder-keg';
      const confirmText = opts.confirmText || 'Understood';
      const isConfirm = Boolean(opts.isConfirm);
      const cancelText = opts.cancelText || 'Cancel';

      const backdrop = document.createElement('div');
      backdrop.className = 'editor-modal-backdrop';
      backdrop.style.zIndex = '999999';
      backdrop.style.display = 'flex';
      backdrop.style.alignItems = 'center';
      backdrop.style.justifyContent = 'center';
      backdrop.style.background = 'rgba(4, 8, 14, 0.88)';
      backdrop.style.backdropFilter = 'blur(8px)';
      backdrop.style.webkitBackdropFilter = 'blur(8px)';

      // Prevent pointer & keyboard events from leaking into 3D scene controls
      const stop = (e) => e.stopPropagation();
      backdrop.addEventListener('pointerdown', stop);
      backdrop.addEventListener('pointermove', stop);
      backdrop.addEventListener('pointerup', stop);
      backdrop.addEventListener('click', stop);
      backdrop.addEventListener('wheel', stop);
      backdrop.addEventListener('keydown', stop);
      backdrop.addEventListener('keyup', stop);

      const card = document.createElement('div');
      card.className = 'editor-modal-card';
      card.style.maxWidth = '460px';
      card.style.width = '88%';
      card.style.padding = '0';
      card.style.background = '#101722';
      card.style.boxShadow = '0 20px 60px rgba(0, 0, 0, 0.95)';

      card.innerHTML = `
        <header class="modal-card-header" style="padding: 12px 18px; background: #141c26; border-bottom: 2px solid #3b2816; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="pixel-icon ${icon} size-20"></span>
            <h3 style="margin: 0; font-family: 'Cinzel', serif; font-size: 15px; color: #ffd700; letter-spacing: 1px;">${title}</h3>
          </div>
          <button id="alert-close-btn" class="modal-close-btn" style="display: flex; align-items: center; justify-content: center; padding: 4px; cursor: pointer; background: transparent; border: none; color: #8fa0b5;">
            <span class="pixel-icon icon-close-cross size-16"></span>
          </button>
        </header>

        <div style="padding: 22px 20px; background: #0c121a; color: #d0d8e2; font-size: 13px; line-height: 1.5;">
          <div style="white-space: pre-wrap; word-break: break-word;">${message}</div>

          <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
            ${isConfirm ? `
              <button id="alert-cancel-btn" style="padding: 8px 16px; border: 1px solid #3c4f64; background: #141c26; color: #a0b2c6; cursor: pointer; font-size: 12px; border-radius: 2px;">
                ${cancelText}
              </button>
            ` : ''}
            <button id="alert-confirm-btn" class="pirate-btn" style="padding: 8px 22px; font-size: 13px; font-weight: bold; cursor: pointer;">
              ${confirmText}
            </button>
          </div>
        </div>
      `;

      backdrop.appendChild(card);
      document.body.appendChild(backdrop);

      const cleanup = (result) => {
        window.removeEventListener('keydown', onKeyDown);
        backdrop.remove();
        resolve(result);
      };

      const onKeyDown = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cleanup(isConfirm ? false : true);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          cleanup(true);
        }
      };
      window.addEventListener('keydown', onKeyDown);

      card.querySelector('#alert-close-btn')?.addEventListener('click', () => cleanup(isConfirm ? false : true));
      card.querySelector('#alert-cancel-btn')?.addEventListener('click', () => cleanup(false));
      card.querySelector('#alert-confirm-btn')?.addEventListener('click', () => cleanup(true));

      // Focus confirm button
      setTimeout(() => {
        card.querySelector('#alert-confirm-btn')?.focus();
      }, 50);
    });
  }

  /**
   * Shows a themed confirmation modal dialog with Cancel / OK buttons.
   * @param {string|object} options
   * @returns {Promise<boolean>}
   */
  static confirm(options) {
    const opts = typeof options === 'string' ? { message: options } : (options || {});
    return this.show({ ...opts, isConfirm: true });
  }
}

export function showAlert(message, title = 'Notice') {
  return AlertModal.show({ message, title });
}

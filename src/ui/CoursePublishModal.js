/**
 * CoursePublishModal.js — Mario Maker upload and proof-of-beatability modal.
 * Embedded into the Level Editor UI.
 */

import { emit, on, off } from '../core/EventBus.js';
import { ClearCheckManager } from '../community/ClearCheckManager.js';
import { CommunityClient } from '../community/CommunityClient.js';

export class CoursePublishModal {
  constructor() {
    this._el = null;
    this._levelCfg = null;
    this._isSubmitting = false;

    this._onVerified = (proof) => {
      if (this._el) this._renderVerificationState(true, proof);
    };
    this._onFailed = (d) => {
      if (this._el) this._renderVerificationState(false, null, d.reason);
    };

    on('clearCheckVerified', this._onVerified);
    on('clearCheckFailed', this._onFailed);
  }

  async open(levelCfg) {
    if (this._el) this.close();
    this._levelCfg = levelCfg;

    this._el = document.createElement('div');
    this._el.id = 'course-publish-modal';
    this._el.className = 'editor-modal-backdrop';
    this._el.style.zIndex = '99999';
    this._el.style.display = 'flex';
    this._el.style.alignItems = 'center';
    this._el.style.justifyContent = 'center';

    this._el.innerHTML = `
      <div class="editor-modal-card" style="max-width: 540px; width: 92%; padding: 0;">
        <header class="modal-card-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="pixel-icon icon-anchor size-18"></span>
            <h3 style="margin: 0; font-family: 'Cinzel', serif; color: #ffd700;">COMMUNITY COURSE DISPATCH</h3>
          </div>
          <button class="modal-close-btn" id="btn-close-publish" style="display: flex; align-items: center; justify-content: center; padding: 4px; cursor: pointer;">
            <span class="pixel-icon icon-close-cross size-16"></span>
          </button>
        </header>

        <div style="padding: 20px; display: flex; flex-direction: column; gap: 14px; background: #101722; color: #d0d8e2;">
          
          <!-- Title Input -->
          <div>
            <label style="display: block; font-size: 11px; text-transform: uppercase; color: #ffd700; margin-bottom: 4px; font-weight: bold;">
              Course Title
            </label>
            <input type="text" id="pub-course-title" placeholder="e.g. Kraken's Maw or Dead Man's Reef" maxlength="48" value="Custom Sea Passage" style="width: 100%; box-sizing: border-box; background: #0a0f16; border: 1px solid #36495d; color: #ffffff; padding: 8px 12px; font-family: 'Cinzel', serif; font-size: 14px;">
          </div>

          <!-- Description Input -->
          <div>
            <label style="display: block; font-size: 11px; text-transform: uppercase; color: #ffd700; margin-bottom: 4px; font-weight: bold;">
              Logbook Description / Hints
            </label>
            <textarea id="pub-course-desc" placeholder="Describe the navigation challenge, warnings about currents, or siren songs..." maxlength="280" rows="3" style="width: 100%; box-sizing: border-box; background: #0a0f16; border: 1px solid #36495d; color: #ffffff; padding: 8px 12px; font-size: 12px; resize: none;"></textarea>
          </div>

          <!-- Tags -->
          <div>
            <label style="display: block; font-size: 11px; text-transform: uppercase; color: #ffd700; margin-bottom: 4px; font-weight: bold;">
              Course Tags
            </label>
            <div id="pub-tags-row" style="display: flex; flex-wrap: wrap; gap: 6px;">
              <button class="pub-tag-chip active" data-tag="adventure" style="background: #2a1f14; border: 1px solid #ffd700; color: #ffd700; padding: 5px 12px; font-size: 11px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                <span class="pixel-icon icon-treasure-map size-14"></span> Adventure
              </button>
              <button class="pub-tag-chip" data-tag="speedrun" style="background: #16202c; border: 1px solid #34485e; color: #a4b3c6; padding: 5px 12px; font-size: 11px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                <span class="pixel-icon icon-wind-gust size-14"></span> Speedrun
              </button>
              <button class="pub-tag-chip" data-tag="puzzle" style="background: #16202c; border: 1px solid #34485e; color: #a4b3c6; padding: 5px 12px; font-size: 11px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                <span class="pixel-icon icon-rope-knot size-14"></span> Puzzle
              </button>
              <button class="pub-tag-chip" data-tag="boss" style="background: #16202c; border: 1px solid #34485e; color: #a4b3c6; padding: 5px 12px; font-size: 11px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                <span class="pixel-icon icon-kraken-head size-14"></span> Boss
              </button>
              <button class="pub-tag-chip" data-tag="scenic" style="background: #16202c; border: 1px solid #34485e; color: #a4b3c6; padding: 5px 12px; font-size: 11px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                <span class="pixel-icon icon-sun-fair size-14"></span> Scenic
              </button>
            </div>
          </div>

          <!-- Clear Check Status Container -->
          <div id="clear-check-status-container" style="background: #090e15; border: 1px solid #28374a; padding: 14px; border-radius: 4px;">
            Checking beatability proof...
          </div>

          <!-- Modal Action Buttons -->
          <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 6px;">
            <button class="modal-close-btn" id="btn-cancel-publish" style="padding: 8px 16px; border: 1px solid #3c4f64; background: #141c26; color: #a0b2c6; cursor: pointer; font-size: 12px;">
              Cancel
            </button>
            <button id="btn-submit-publish" class="pirate-btn" disabled style="padding: 8px 22px; font-size: 13px; opacity: 0.5; cursor: not-allowed;">
              <span class="pixel-icon icon-anchor size-14"></span> Publish to Harbor
            </button>
          </div>

        </div>
      </div>
    `;

    document.body.appendChild(this._el);

    this._bindEvents();

    // Check if this configuration already has a verified proof
    const { isVerified, proof } = await ClearCheckManager.hasValidClearProof(this._levelCfg);
    this._renderVerificationState(isVerified, proof);
  }

  _bindEvents() {
    this._el.querySelector('#btn-close-publish')?.addEventListener('click', () => this.close());
    this._el.querySelector('#btn-cancel-publish')?.addEventListener('click', () => this.close());

    // Tag toggles
    this._el.querySelectorAll('.pub-tag-chip').forEach(chip => {
      chip.onclick = () => {
        chip.classList.toggle('active');
        if (chip.classList.contains('active')) {
          chip.style.background = '#2a1f14';
          chip.style.borderColor = '#ffd700';
          chip.style.color = '#ffd700';
        } else {
          chip.style.background = '#16202c';
          chip.style.borderColor = '#34485e';
          chip.style.color = '#a4b3c6';
        }
      };
    });

    // Publish button
    const submitBtn = this._el.querySelector('#btn-submit-publish');
    submitBtn?.addEventListener('click', async () => {
      if (this._isSubmitting || submitBtn.disabled) return;
      this._isSubmitting = true;
      submitBtn.textContent = 'Publishing...';

      try {
        const title = this._el.querySelector('#pub-course-title')?.value || 'Custom Sea Passage';
        const description = this._el.querySelector('#pub-course-desc')?.value || '';
        const tags = Array.from(this._el.querySelectorAll('.pub-tag-chip.active')).map(c => c.dataset.tag);

        const published = await CommunityClient.publishCourse(this._levelCfg, {
          title,
          description,
          tags
        });

        this._showCelebrationSuccess(published);
      } catch (err) {
        alert(err.message || 'Failed to publish course.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Publish to Harbor';
        this._isSubmitting = false;
      }
    });
  }

  _renderVerificationState(isVerified, proof, failReason = '') {
    const container = this._el?.querySelector('#clear-check-status-container');
    const submitBtn = this._el?.querySelector('#btn-submit-publish');
    if (!container || !submitBtn) return;

    if (isVerified && proof) {
      container.style.borderColor = '#00ff88';
      container.style.background = '#0d2218';
      container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span class="pixel-icon icon-confirm-check size-24"></span>
            <div>
              <strong style="color: #00ff88; font-size: 13px;">Clear Check Verified</strong>
              <div style="font-size: 11px; color: #a0d4b8;">
                Cleared in ${(proof.clearTimeMs / 1000).toFixed(2)}s • Proof Validated
              </div>
            </div>
          </div>
          <button id="btn-retest-course" style="background: transparent; border: 1px solid #00ff88; color: #00ff88; padding: 4px 10px; font-size: 11px; cursor: pointer; border-radius: 3px; display: inline-flex; align-items: center; gap: 4px;">
            <span class="pixel-icon icon-rotate-arrow size-14"></span> Re-Test
          </button>
        </div>
      `;

      container.querySelector('#btn-retest-course')?.addEventListener('click', () => {
        this.close();
        ClearCheckManager.startClearCheck(this._levelCfg);
      });

      submitBtn.disabled = false;
      submitBtn.style.opacity = '1.0';
      submitBtn.style.cursor = 'pointer';

    } else {
      container.style.borderColor = '#e07a2f';
      container.style.background = '#22150a';
      container.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 12px;">
          <span class="pixel-icon icon-powder-keg size-24"></span>
          <div style="flex: 1;">
            <strong style="color: #ffd700; font-size: 13px;">Clear Check Required</strong>
            <p style="font-size: 11px; color: #c4b09c; margin: 4px 0 10px 0; line-height: 1.3;">
              Super Mario Maker Rule: To prevent unbeatable or troll courses, you must personally sail this route to the Safe Harbor before publishing.
              ${failReason ? `<br><span style="color: #ff6b6b; font-weight: bold;">Last attempt: ${failReason}</span>` : ''}
            </p>
            <button id="btn-start-clear-check" class="pirate-btn" style="padding: 7px 16px; font-size: 12px; font-weight: bold; display: inline-flex; align-items: center; gap: 6px;">
              <span class="pixel-icon icon-sloop size-16"></span> Start Clear Check Voyage
            </button>
          </div>
        </div>
      `;

      container.querySelector('#btn-start-clear-check')?.addEventListener('click', () => {
        this.close();
        ClearCheckManager.startClearCheck(this._levelCfg);
      });

      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.5';
      submitBtn.style.cursor = 'not-allowed';
    }
  }

  _showCelebrationSuccess(course) {
    if (!this._el) return;
    const card = this._el.querySelector('.editor-modal-card');
    if (!card) return;

    card.innerHTML = `
      <div style="padding: 36px 28px; text-align: center; background: #101722; color: #ffffff;">
        <div style="display: flex; justify-content: center; align-items: center; gap: 16px; margin-bottom: 16px;">
          <span class="pixel-icon icon-harbor-flag size-40"></span>
          <span class="pixel-icon icon-plunder-sack size-48"></span>
          <span class="pixel-icon icon-doubloon size-40"></span>
        </div>
        <h2 style="font-family: 'Cinzel', serif; color: #ffd700; margin: 0 0 8px 0; font-size: 24px;">
          COURSE OFFICIALLY PUBLISHED!
        </h2>
        <p style="color: #a4b3c6; font-size: 13px; margin: 0 0 20px 0;">
          Your sea passage has been registered in the Community Harbor chart archives.
        </p>

        <div style="background: #090e15; border: 2px dashed #ffd700; padding: 14px 20px; border-radius: 6px; display: inline-block; margin-bottom: 24px;">
          <div style="font-size: 11px; color: #7f92a8; text-transform: uppercase; margin-bottom: 4px;">Official Course Code</div>
          <div id="celebrate-code-text" style="font-family: monospace; font-size: 24px; color: #ffd700; letter-spacing: 2px; font-weight: bold;">
            ${course.courseCode}
          </div>
        </div>

        <div style="display: flex; justify-content: center; gap: 12px;">
          <button id="btn-copy-celebrate-code" class="pirate-btn" style="padding: 10px 20px; font-size: 13px; display: inline-flex; align-items: center; gap: 6px;">
            <span class="pixel-icon icon-closed-logbook size-16"></span> Copy Code
          </button>
          <button id="btn-visit-community" class="pirate-btn" style="padding: 10px 20px; font-size: 13px; background: #24415c; border-color: #4a759e; display: inline-flex; align-items: center; gap: 6px;">
            <span class="pixel-icon icon-compass size-16"></span> View in Course World
          </button>
          <button id="btn-dismiss-celebrate" class="modal-close-btn" style="padding: 10px 18px; border: 1px solid #3c4f64; background: #141c26; color: #a0b2c6; cursor: pointer; font-size: 13px; display: inline-flex; align-items: center; gap: 6px;">
            <span class="pixel-icon icon-confirm-check size-16"></span> Done
          </button>
        </div>
      </div>
    `;

    card.querySelector('#btn-copy-celebrate-code')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(course.courseCode);
      const b = card.querySelector('#btn-copy-celebrate-code');
      if (b) b.textContent = 'Copied to Clipboard!';
    });

    card.querySelector('#btn-visit-community')?.addEventListener('click', () => {
      this.close();
      emit('uiMount', { screen: 'community' });
    });

    card.querySelector('#btn-dismiss-celebrate')?.addEventListener('click', () => this.close());
  }

  close() {
    this._el?.remove();
    this._el = null;
  }
}

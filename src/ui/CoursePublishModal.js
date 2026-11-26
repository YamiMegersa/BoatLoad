/**
 * CoursePublishModal.js — Mario Maker upload and proof-of-beatability modal.
 * Embedded into the Level Editor UI.
 */

import { emit, on, off } from '../core/EventBus.js';
import { ClearCheckManager } from '../community/ClearCheckManager.js';
import { CommunityClient } from '../community/CommunityClient.js';
import { AlertModal } from './AlertModal.js';

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

    // Lock 3D camera controls and reset keys while the publish modal is active
    if (window.gameState?._orbitControls) {
      this._previousOrbitControlsEnabled = window.gameState._orbitControls.enabled;
      window.gameState._orbitControls.enabled = false;
    }
    if (window.gameState?._keys) {
      window.gameState._keys = {};
    }

    this._el = document.createElement('div');
    this._el.id = 'course-publish-modal';
    this._el.className = 'editor-modal-backdrop';
    this._el.style.zIndex = '99999';
    this._el.style.display = 'flex';
    this._el.style.alignItems = 'center';
    this._el.style.justifyContent = 'center';

    // Stop all input events from leaking into the 3D canvas and camera controller
    this._el.addEventListener('pointerdown', e => e.stopPropagation());
    this._el.addEventListener('pointermove', e => e.stopPropagation());
    this._el.addEventListener('pointerup', e => e.stopPropagation());
    this._el.addEventListener('click', e => e.stopPropagation());
    this._el.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
    this._el.addEventListener('keydown', e => e.stopPropagation());
    this._el.addEventListener('keyup', e => e.stopPropagation());

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

          <!-- Repair Budget Input -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <label for="pub-course-budget" style="font-size: 11px; text-transform: uppercase; color: #ffd700; font-weight: bold; display: flex; align-items: center; gap: 6px;">
                <span class="pixel-icon icon-doubloon size-14"></span> Repair Budget ($)
              </label>
              <span id="pub-course-budget-display" style="font-size: 12px; color: #ffd700; font-weight: bold; font-family: monospace;">$300</span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <input type="number" id="pub-course-budget" min="0" max="5000" step="25" value="300" style="width: 120px; box-sizing: border-box; background: #0a0f16; border: 1px solid #36495d; color: #ffd700; padding: 7px 10px; font-family: monospace; font-size: 14px; font-weight: bold;">
              <span style="font-size: 11px; color: #8899aa; line-height: 1.2;">
                Shipyard gold granted to repair hull damage before setting sail.
              </span>
            </div>
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

    // Initialize values from level config or persisted draft
    const notes = this._loadSavedNotes();
    const titleInput = this._el.querySelector('#pub-course-title');
    const descInput = this._el.querySelector('#pub-course-desc');
    const budgetInput = this._el.querySelector('#pub-course-budget');
    const budgetDisplay = this._el.querySelector('#pub-course-budget-display');

    if (titleInput) titleInput.value = notes.title;
    if (descInput) descInput.value = notes.description;
    if (budgetInput) budgetInput.value = notes.budget;
    if (budgetDisplay) budgetDisplay.textContent = `$${notes.budget}`;

    // Restore active tags
    this._el.querySelectorAll('.pub-tag-chip').forEach(chip => {
      const tag = chip.dataset.tag;
      const isActive = Array.isArray(notes.tags) && notes.tags.includes(tag);
      chip.classList.toggle('active', isActive);
      if (isActive) {
        chip.style.background = '#2a1f14';
        chip.style.borderColor = '#ffd700';
        chip.style.color = '#ffd700';
      } else {
        chip.style.background = '#16202c';
        chip.style.borderColor = '#34485e';
        chip.style.color = '#a4b3c6';
      }
    });

    this._bindEvents();

    // Check if this configuration already has a verified proof
    const { isVerified, proof } = await ClearCheckManager.hasValidClearProof(this._levelCfg);
    this._renderVerificationState(isVerified, proof);
  }

  _loadSavedNotes() {
    let draft = {};
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('boatload_course_publish_draft');
        if (raw) draft = JSON.parse(raw);
      }
    } catch {}

    const editorMeta = window.gameState?._editorSystem?._publishMetadata;
    const title = this._levelCfg?.metadata?.title || 
                  (this._levelCfg?.title && this._levelCfg.title !== 'Custom Sea Passage' ? this._levelCfg.title : null) ||
                  editorMeta?.title || 
                  draft.title || 
                  this._levelCfg?.title || 
                  'Custom Sea Passage';

    const description = this._levelCfg?.metadata?.description ?? 
                        editorMeta?.description ?? 
                        draft.description ?? 
                        this._levelCfg?.description ?? 
                        '';

    const tags = this._levelCfg?.metadata?.tags || 
                 editorMeta?.tags || 
                 draft.tags || 
                 this._levelCfg?.tags || 
                 ['adventure'];

    const budget = this._levelCfg?.budget !== undefined ? Math.max(0, Number(this._levelCfg.budget)) : 
                   (editorMeta?.budget !== undefined ? Math.max(0, Number(editorMeta.budget)) : 
                   (draft.budget !== undefined ? Math.max(0, Number(draft.budget)) : 300));

    return { title, description, tags, budget };
  }

  _persistNotes() {
    if (!this._el) return;
    const title = this._el.querySelector('#pub-course-title')?.value || 'Custom Sea Passage';
    const description = this._el.querySelector('#pub-course-desc')?.value || '';
    const budget = Math.max(0, parseInt(this._el.querySelector('#pub-course-budget')?.value, 10) || 0);
    const tags = Array.from(this._el.querySelectorAll('.pub-tag-chip.active')).map(c => c.dataset.tag);

    const data = { title, description, tags, budget };

    if (this._levelCfg) {
      this._levelCfg.title = title;
      this._levelCfg.description = description;
      this._levelCfg.tags = tags;
      this._levelCfg.budget = budget;
      this._levelCfg.metadata = { ...(this._levelCfg.metadata || {}), ...data };
    }

    if (window.gameState?._editorSystem) {
      window.gameState._editorSystem._publishMetadata = data;
      if (window.gameState._editorSystem._levelCfg) {
        window.gameState._editorSystem._levelCfg.title = title;
        window.gameState._editorSystem._levelCfg.description = description;
        window.gameState._editorSystem._levelCfg.tags = tags;
        window.gameState._editorSystem._levelCfg.budget = budget;
        window.gameState._editorSystem._levelCfg.metadata = { ...(window.gameState._editorSystem._levelCfg.metadata || {}), ...data };
      }
    }

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('boatload_course_publish_draft', JSON.stringify(data));
      }
    } catch {}
  }

  _bindEvents() {
    this._el.querySelector('#btn-close-publish')?.addEventListener('click', () => this.close());
    this._el.querySelector('#btn-cancel-publish')?.addEventListener('click', () => this.close());

    // Title and description input listeners
    this._el.querySelector('#pub-course-title')?.addEventListener('input', () => this._persistNotes());
    this._el.querySelector('#pub-course-title')?.addEventListener('change', () => this._persistNotes());
    this._el.querySelector('#pub-course-desc')?.addEventListener('input', () => this._persistNotes());
    this._el.querySelector('#pub-course-desc')?.addEventListener('change', () => this._persistNotes());

    // Repair budget changes
    const budgetInput = this._el.querySelector('#pub-course-budget');
    const budgetDisplay = this._el.querySelector('#pub-course-budget-display');
    const onBudgetChange = async () => {
      const val = Math.max(0, parseInt(budgetInput?.value, 10) || 0);
      if (budgetDisplay) budgetDisplay.textContent = `$${val}`;
      this._persistNotes();

      if (this._levelCfg && this._levelCfg.budget !== val) {
        this._levelCfg.budget = val;
        const { isVerified, proof } = await ClearCheckManager.hasValidClearProof(this._levelCfg);
        this._renderVerificationState(isVerified, proof);
      }
    };
    budgetInput?.addEventListener('input', onBudgetChange);
    budgetInput?.addEventListener('change', onBudgetChange);

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
        this._persistNotes();
      };
    });

    // Publish button
    const submitBtn = this._el.querySelector('#btn-submit-publish');
    submitBtn?.addEventListener('click', async () => {
      if (this._isSubmitting || submitBtn.disabled) return;
      this._isSubmitting = true;
      submitBtn.textContent = 'Publishing...';
      this._persistNotes();

      try {
        const title = this._el.querySelector('#pub-course-title')?.value || 'Custom Sea Passage';
        const description = this._el.querySelector('#pub-course-desc')?.value || '';
        const tags = Array.from(this._el.querySelectorAll('.pub-tag-chip.active')).map(c => c.dataset.tag);
        const budgetVal = Math.max(0, parseInt(this._el.querySelector('#pub-course-budget')?.value, 10) || 0);
        this._levelCfg.budget = budgetVal;

        const published = await CommunityClient.publishCourse(this._levelCfg, {
          title,
          description,
          tags
        });

        this._showCelebrationSuccess(published);
      } catch (err) {
        await AlertModal.show({
          title: 'Dispatch Notice',
          message: err.message || 'Failed to publish course.',
          icon: 'icon-powder-keg'
        });
        submitBtn.disabled = false;
        submitBtn.textContent = 'Publish to Harbor';
        this._isSubmitting = false;
      }
    });
  }

  _syncBudgetFromInput() {
    this._persistNotes();
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
        this._syncBudgetFromInput();
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
              Super Mario Maker Rule: To prevent unbeatable or troll courses, you must personally repair the vessel with the set budget and sail this route to the Safe Harbor before publishing.
              ${failReason ? `<br><span style="color: #ff6b6b; font-weight: bold;">Last attempt: ${failReason}</span>` : ''}
            </p>
            <button id="btn-start-clear-check" class="pirate-btn" style="padding: 7px 16px; font-size: 12px; font-weight: bold; display: inline-flex; align-items: center; gap: 6px;">
              <span class="pixel-icon icon-sloop size-16"></span> Start Clear Check (Repair &amp; Sail)
            </button>
          </div>
        </div>
      `;

      container.querySelector('#btn-start-clear-check')?.addEventListener('click', () => {
        this._syncBudgetFromInput();
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
    this._persistNotes();
    if (window.gameState?._orbitControls) {
      window.gameState._orbitControls.enabled = this._previousOrbitControlsEnabled !== false;
    }
    if (window.gameState?._keys) {
      window.gameState._keys = {};
    }
    this._el?.remove();
    this._el = null;
  }
}

/**
 * CommunityHubUI.js — Super Mario Maker style Course World for BoatLoad.
 * Allows players to browse, search, star, and launch user-generated courses.
 */

import { emit, on, off } from '../core/EventBus.js';
import { CommunityClient } from '../community/CommunityClient.js';
import { CrockfordBase32 } from '../community/CrockfordBase32.js';

export class CommunityHubUI {
  constructor() {
    this._el = null;
    this._activeTab = 'trending';
    this._searchQuery = '';
    this._courses = [];

    on('uiMount', d => { if (d?.screen === 'community') this.mount(); });
    on('uiUnmount', d => { if (d?.screen === 'community') this.unmount(); });
    on('communityCourseUpdated', () => { if (this._el) this._refreshCourseList(); });
    on('communityCoursePublished', () => { if (this._el) this._refreshCourseList(); });
  }

  async mount() {
    if (this._el) this.unmount();

    this._el = document.createElement('div');
    this._el.id = 'community-hub-overlay';
    this._el.className = 'editor-modal-backdrop';
    this._el.style.zIndex = '9999';
    this._el.style.display = 'flex';
    this._el.style.alignItems = 'center';
    this._el.style.justifyContent = 'center';

    const profile = CommunityClient.getProfile();

    this._el.innerHTML = `
      <div class="editor-modal-card community-hub-card" style="max-width: 960px; width: 95%; height: 88vh; display: flex; flex-direction: column;">
        
        <!-- Header Bar -->
        <header class="modal-card-header" style="background: #141c26; border-bottom: 2px solid #5a3e1b; padding: 14px 24px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span class="pixel-icon icon-anchor size-24"></span>
            <div>
              <h2 style="margin: 0; font-family: 'Cinzel', serif; font-size: 20px; color: #ffd700; letter-spacing: 1px;">
                COMMUNITY HARBOR • COURSE WORLD
              </h2>
              <span style="font-size: 11px; color: #a4b3c6;">Sail, discover, and conquer courses authored by fellow shipwrights</span>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 14px;">
            <!-- Profile Tag -->
            <div id="community-profile-pill" style="display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.5); padding: 6px 12px; border: 1px solid #3b2816; border-radius: 4px; font-size: 12px; color: #ffd700;">
              <span class="pixel-icon icon-sloop size-16"></span>
              <span id="community-profile-name" style="font-weight: bold;">${profile.username}</span>
              <span style="color: #6a7c92;">|</span>
              <span style="color: #66e2d5;">${profile.uploadedCourseCodes.length}/${profile.uploadQuota} Courses</span>
            </div>

            <button class="modal-close-btn" id="btn-close-community" title="Return to Port" style="cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 6px;">
              <span class="pixel-icon icon-close-cross size-18"></span>
            </button>
          </div>
        </header>

        <!-- Search & Filter Controls -->
        <div style="background: #101722; padding: 14px 24px; border-bottom: 1px solid #233142; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px;">
          
          <!-- Category Tabs -->
          <div class="community-tabs" style="display: flex; gap: 8px;">
            <button class="community-tab-btn active" data-tab="trending" style="padding: 8px 16px; background: #2a1f14; border: 1px solid #ffd700; color: #ffd700; cursor: pointer; font-family: 'Cinzel', serif; font-size: 12px; display: inline-flex; align-items: center; gap: 6px;">
              <span class="pixel-icon icon-cannon-flash size-16"></span> Trending
            </button>
            <button class="community-tab-btn" data-tab="recent" style="padding: 8px 16px; background: #16202c; border: 1px solid #32445a; color: #a4b3c6; cursor: pointer; font-family: 'Cinzel', serif; font-size: 12px; display: inline-flex; align-items: center; gap: 6px;">
              <span class="pixel-icon icon-compass size-16"></span> New Voyages
            </button>
            <button class="community-tab-btn" data-tab="easy" style="padding: 8px 16px; background: #16202c; border: 1px solid #32445a; color: #a4b3c6; cursor: pointer; font-family: 'Cinzel', serif; font-size: 12px; display: inline-flex; align-items: center; gap: 6px;">
              <span class="pixel-icon icon-sloop size-16"></span> High Clears
            </button>
            <button class="community-tab-btn" data-tab="expert" style="padding: 8px 16px; background: #16202c; border: 1px solid #32445a; color: #a4b3c6; cursor: pointer; font-family: 'Cinzel', serif; font-size: 12px; display: inline-flex; align-items: center; gap: 6px;">
              <span class="pixel-icon icon-kraken-head size-16"></span> Super Expert
            </button>
          </div>

          <!-- Course Code Lookup Input -->
          <div style="display: flex; gap: 6px; align-items: center;">
            <input type="text" id="course-code-search" placeholder="Course Code (BL-XXX-YYY)" maxlength="12" style="background: #090e15; border: 1px solid #364b63; color: #ffffff; padding: 7px 12px; font-family: monospace; font-size: 13px; text-transform: uppercase; width: 190px;">
            <button id="btn-search-code" class="pirate-btn-sm" style="padding: 7px 14px; background: #24415c; border: 1px solid #4a759e; color: #ffffff; cursor: pointer; font-size: 12px; display: inline-flex; align-items: center; gap: 6px;">
              <span class="pixel-icon icon-optics-lens size-14"></span> Lookup
            </button>
          </div>
        </div>

        <!-- Course Cards Scroll View -->
        <div id="community-course-grid" style="flex: 1; overflow-y: auto; padding: 20px 24px; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 18px; background: #0c121c;">
          <div style="color: #6a7c92; font-size: 14px; padding: 40px; text-align: center; grid-column: 1 / -1;">
            Loading sea routes...
          </div>
        </div>

        <!-- Footer / Upload Callout -->
        <footer style="background: #141c26; border-top: 2px solid #3b2816; padding: 12px 24px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 12px; color: #7f92a8;">
            Clear Check Rule: You must prove your course is beatable before uploading.
          </span>
          <button id="btn-open-creator-editor" class="pirate-btn" style="padding: 8px 20px; font-size: 13px;">
            <span class="pixel-icon icon-hammer size-14"></span> Open Level Editor
          </button>
        </footer>

      </div>
    `;

    document.body.appendChild(this._el);

    this._bindEvents();
    this._refreshCourseList();
  }

  _bindEvents() {
    this._el.querySelector('#btn-close-community')?.addEventListener('click', () => {
      this.unmount();
      emit('hideLoading');
      if (window.gameState?.currentPhase !== 'MAIN_MENU') {
        emit('requestPhaseChange', { phase: 'MAIN_MENU' });
      }
    });

    this._el.querySelector('#btn-open-creator-editor')?.addEventListener('click', () => {
      this.unmount();
      emit('requestPhaseChange', { phase: 'EDITOR' });
    });

    // Tab buttons
    this._el.querySelectorAll('.community-tab-btn').forEach(btn => {
      btn.onclick = () => {
        this._el.querySelectorAll('.community-tab-btn').forEach(b => {
          b.classList.remove('active');
          b.style.background = '#16202c';
          b.style.borderColor = '#32445a';
          b.style.color = '#a4b3c6';
        });
        btn.classList.add('active');
        btn.style.background = '#2a1f14';
        btn.style.borderColor = '#ffd700';
        btn.style.color = '#ffd700';

        this._activeTab = btn.dataset.tab;
        this._searchQuery = '';
        const searchInput = this._el.querySelector('#course-code-search');
        if (searchInput) searchInput.value = '';
        this._refreshCourseList();
      };
    });

    // Search action
    const searchBtn = this._el.querySelector('#btn-search-code');
    const searchInput = this._el.querySelector('#course-code-search');
    const doSearch = () => {
      const q = searchInput?.value?.trim() || '';
      this._searchQuery = q;
      this._refreshCourseList();
    };

    searchBtn?.addEventListener('click', doSearch);
    searchInput?.addEventListener('keydown', e => {
      if (e.key === 'Enter') doSearch();
    });
  }

  async _refreshCourseList() {
    const grid = this._el?.querySelector('#community-course-grid');
    if (!grid) return;

    grid.innerHTML = '<div style="color: #6a7c92; font-size: 13px; text-align: center; grid-column: 1 / -1; padding: 40px;">Surveying the charts...</div>';

    try {
      this._courses = await CommunityClient.getCourses({
        tab: this._activeTab,
        searchCode: this._searchQuery
      });

      if (!this._courses || this._courses.length === 0) {
        grid.innerHTML = `
          <div style="color: #8c9eb5; text-align: center; grid-column: 1 / -1; padding: 50px;">
            <div style="margin-bottom: 12px;"><span class="pixel-icon icon-compass size-40"></span></div>
            <strong style="color: #ffd700; font-family: 'Cinzel', serif;">No Sea Routes Found</strong>
            <p style="font-size: 12px; margin-top: 6px;">Try adjusting your search code or browse another category.</p>
          </div>
        `;
        return;
      }

      const user = CommunityClient.getProfile();

      grid.innerHTML = this._courses.map(course => {
        const hasStarred = user.starredCourseCodes.includes(course.courseCode);
        const clearRate = course.clearRate !== undefined ? course.clearRate : 100.0;
        
        let diffColor = '#4cd964'; // casual
        let diffLabel = 'Casual';
        if (clearRate < 5) { diffColor = '#b347eb'; diffLabel = 'Super Expert'; }
        else if (clearRate < 20) { diffColor = '#ff6b3b'; diffLabel = 'Expert'; }
        else if (clearRate < 60) { diffColor = '#3bb4ff'; diffLabel = 'Normal'; }

        const wrText = course.worldRecord
          ? `${(course.worldRecord.timeMs / 1000).toFixed(2)}s (${course.worldRecord.username})`
          : 'None';

        return `
          <div class="community-course-card" data-code="${course.courseCode}" style="background: #141d28; border: 1px solid #28374a; padding: 14px; border-radius: 4px; display: flex; flex-direction: column; justify-content: space-between; transition: transform 0.15s, border-color 0.15s;">
            
            <div>
              <!-- Top Row: Course Code & Difficulty -->
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span class="course-code-badge" data-code="${course.courseCode}" title="Click to copy code" style="background: #0b1118; border: 1px solid #3c5169; color: #ffd700; font-family: monospace; font-size: 11px; padding: 3px 8px; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                  <span>${course.courseCode}</span>
                  <span class="pixel-icon icon-closed-logbook size-14"></span>
                </span>
                <span style="font-size: 10px; font-weight: bold; color: ${diffColor}; border: 1px solid ${diffColor}; padding: 2px 6px; border-radius: 2px; text-transform: uppercase;">
                  ${diffLabel}
                </span>
              </div>

              <!-- Title & Author -->
              <h3 style="margin: 0 0 4px 0; font-family: 'Cinzel', serif; font-size: 15px; color: #ffffff; line-height: 1.2;">
                ${this._escapeHtml(course.title)}
              </h3>
              <div style="font-size: 11px; color: #7f93a9; margin-bottom: 8px;">
                By: <strong style="color: #ffd700;">${this._escapeHtml(course.authorName)}</strong>
              </div>

              <!-- Description -->
              <p style="font-size: 12px; color: #a2b2c4; margin: 0 0 12px 0; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                ${this._escapeHtml(course.description || 'No captain log provided for this sea passage.')}
              </p>

              <!-- Stats Matrix -->
              <div style="background: rgba(0,0,0,0.3); border: 1px solid #222f3e; padding: 8px; border-radius: 3px; font-size: 11px; margin-bottom: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
                <div>
                  <span style="color: #6b7f94;">Clear Rate:</span>
                  <strong style="color: ${diffColor};">${clearRate.toFixed(1)}%</strong>
                </div>
                <div>
                  <span style="color: #6b7f94;">Clears:</span>
                  <strong style="color: #ffffff;">${course.clearCount || 0}/${course.attemptCount || 0}</strong>
                </div>
                <div style="grid-column: 1 / -1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px;">
                  <span style="color: #6b7f94;">Record:</span>
                  <span class="pixel-icon icon-doubloon size-14"></span>
                  <span style="color: #66e2d5;">${wrText}</span>
                </div>
              </div>
            </div>

            <!-- Card Action Footer -->
            <div style="display: flex; gap: 8px; align-items: center; border-top: 1px solid #233142; padding-top: 10px;">
              <button class="btn-star-course" data-code="${course.courseCode}" style="background: ${hasStarred ? '#4d3910' : '#101720'}; border: 1px solid ${hasStarred ? '#ffd700' : '#334457'}; color: ${hasStarred ? '#ffd700' : '#a0b3c6'}; padding: 6px 12px; font-size: 12px; cursor: pointer; border-radius: 3px; display: inline-flex; align-items: center; gap: 6px;">
                <span class="pixel-icon icon-nautical-star size-14"></span>
                <span>${course.starCount || 0}</span>
              </button>

              <button class="btn-play-course pirate-btn" data-code="${course.courseCode}" style="flex: 1; padding: 7px 12px; font-size: 12px; font-weight: bold; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                <span class="pixel-icon icon-sloop size-16"></span> SET SAIL
              </button>
            </div>

          </div>
        `;
      }).join('');

      this._bindCardActions();

    } catch (err) {
      console.error('Error refreshing course list', err);
      grid.innerHTML = `<div style="color: #ff6b6b; padding: 30px; text-align: center; grid-column: 1 / -1;">Error reading charts: ${err.message}</div>`;
    }
  }

  _bindCardActions() {
    // Copy code button
    this._el.querySelectorAll('.course-code-badge').forEach(badge => {
      badge.onclick = (e) => {
        e.stopPropagation();
        const code = badge.dataset.code;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(code);
          badge.textContent = `${code} COPIED!`;
          setTimeout(() => badge.textContent = `${code} 📋`, 1600);
        }
      };
    });

    // Star toggle
    this._el.querySelectorAll('.btn-star-course').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const code = btn.dataset.code;
        await CommunityClient.toggleStar(code);
      };
    });

    // Play course button
    this._el.querySelectorAll('.btn-play-course').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const code = btn.dataset.code;
        const course = await CommunityClient.getCourse(code);
        if (!course) return;

        this.unmount();
        emit('communityPlayCourseRequested', { course });
      };
    });
  }

  _escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  unmount() {
    this._el?.remove();
    this._el = null;
  }
}

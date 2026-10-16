import { on, off, emit } from '../core/EventBus.js';

/**
 * LevelSelectorUI — Nautical, leather-and-parchment logbook level selector.
 * Matches the shop and shipyard theme, allowing the player to inspect charted
 * voyages and select Level 1 to trigger the NPC arrival and docking sequence.
 */
export class LevelSelectorUI {
  constructor() {
    this._el = null;
    this._isOpen = false;

    this._onOpen = () => this.open();
    this._onClose = () => this.close();

    on('openLevelSelector', this._onOpen);
    on('closeLevelSelector', this._onClose);
    on('uiMount', d => {
      // If needed
    });
    on('uiUnmount', d => {
      if (d?.screen === 'dock') this.close();
    });
  }

  open() {
    if (this._isOpen) return;
    this._isOpen = true;

    this._el = document.createElement('div');
    this._el.id = 'level-selector-modal';
    this._el.className = 'level-selector-backdrop';

    this._el.innerHTML = `
      <div class="level-book-wrapper">
        <div class="level-book">
          <!-- Close button resembling a wax seal / brass emblem -->
          <button class="book-close-btn" id="book-close-btn" aria-label="Close Logbook">✕</button>

          <!-- Book spine & decorative ribbon -->
          <div class="book-spine"></div>
          <div class="book-ribbon"></div>

          <!-- Two-page Spread -->
          <div class="book-pages-spread">
            <!-- LEFT PAGE: Level & Voyage Index -->
            <div class="book-page page-left">
              <div class="page-header">
                <div class="nautical-emblem">⚓</div>
                <h2 class="book-title">CAPTAIN'S LOGBOOK</h2>
                <div class="book-subtitle">Charted Voyages &amp; Repair Dockets</div>
                <div class="page-divider"></div>
              </div>

              <div class="level-entry-list">
                <!-- Level 1 (Unlocked & Active) -->
                <div class="level-card level-card-active selected" data-level="1">
                  <div class="level-badge available">AVAILABLE</div>
                  <div class="level-card-main">
                    <span class="level-icon">⛵</span>
                    <div class="level-info">
                      <div class="level-name">Day 1: Maiden Shakedown</div>
                      <div class="level-meta">Sunny &bull; Light Sloop &bull; 🪙 200</div>
                    </div>
                    <span class="level-stamp-indicator">READY</span>
                  </div>
                </div>

                <!-- Level 2 (Locked) -->
                <div class="level-card level-card-locked" data-level="2">
                  <div class="level-badge locked">LOCKED</div>
                  <div class="level-card-main">
                    <span class="level-icon">🌧️</span>
                    <div class="level-info">
                      <div class="level-name">Day 2: The Rising Squall</div>
                      <div class="level-meta">Rain &bull; Choppy Shoals</div>
                    </div>
                    <span class="lock-icon">🔒</span>
                  </div>
                </div>

                <!-- Level 3 (Locked) -->
                <div class="level-card level-card-locked" data-level="3">
                  <div class="level-badge locked">LOCKED</div>
                  <div class="level-card-main">
                    <span class="level-icon">🌫️</span>
                    <div class="level-info">
                      <div class="level-name">Day 3: Siren's Fog</div>
                      <div class="level-meta">Dense Fog &bull; Reef Hazards</div>
                    </div>
                    <span class="lock-icon">🔒</span>
                  </div>
                </div>

                <!-- Level 4 (Locked) -->
                <div class="level-card level-card-locked" data-level="4">
                  <div class="level-badge locked">LOCKED</div>
                  <div class="level-card-main">
                    <span class="level-icon">⛈️</span>
                    <div class="level-info">
                      <div class="level-name">Day 4: Gale-Force Reef</div>
                      <div class="level-meta">Storm Winds &bull; Swells</div>
                    </div>
                    <span class="lock-icon">🔒</span>
                  </div>
                </div>

                <!-- Level 5 (Locked) -->
                <div class="level-card level-card-locked" data-level="5">
                  <div class="level-badge locked">LOCKED</div>
                  <div class="level-card-main">
                    <span class="level-icon">🌊</span>
                    <div class="level-info">
                      <div class="level-name">Day 5: Abyssal Trench</div>
                      <div class="level-meta">Heavy Squall &bull; Strong Tide</div>
                    </div>
                    <span class="lock-icon">🔒</span>
                  </div>
                </div>

                <!-- Level 6 (Locked) -->
                <div class="level-card level-card-locked" data-level="6">
                  <div class="level-badge locked">LOCKED</div>
                  <div class="level-card-main">
                    <span class="level-icon">⚡</span>
                    <div class="level-info">
                      <div class="level-name">Day 6: Tempest Surge</div>
                      <div class="level-meta">Lightning &bull; Crushing Waves</div>
                    </div>
                    <span class="lock-icon">🔒</span>
                  </div>
                </div>

                <!-- Level 7 (Locked) -->
                <div class="level-card level-card-locked" data-level="7">
                  <div class="level-badge locked">LOCKED</div>
                  <div class="level-card-main">
                    <span class="level-icon">🦑</span>
                    <div class="level-info">
                      <div class="level-name">Day 7: The Kraken's Wake</div>
                      <div class="level-meta">Blood Sky &bull; Ancient Titan</div>
                    </div>
                    <span class="lock-icon">🔒</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- RIGHT PAGE: Voyage Dossier & Embark Action -->
            <div class="book-page page-right">
              <div class="dossier-stamp">CHARTED VOYAGE #01</div>
              <h3 class="dossier-title">VOYAGE DOSSIER: DAY 1</h3>
              <div class="page-divider"></div>

              <div class="dossier-section">
                <div class="dossier-row">
                  <span class="dossier-label">Vessel Class:</span>
                  <span class="dossier-value">Barlow Light Sloop</span>
                </div>
                <div class="dossier-row">
                  <span class="dossier-label">Weather Forecast:</span>
                  <span class="dossier-value">☀️ Clear &amp; Fair Breeze</span>
                </div>
                <div class="dossier-row">
                  <span class="dossier-label">Repair Budget:</span>
                  <span class="dossier-value highlight-gold">🪙 200 Doubloons</span>
                </div>
                <div class="dossier-row">
                  <span class="dossier-label">Hazard Rating:</span>
                  <span class="dossier-value">Low (Barrels &amp; Shallow Rocks)</span>
                </div>
              </div>

              <div class="dossier-dispatch">
                <div class="dispatch-title">CAPTAIN'S DISPATCH:</div>
                <p class="dispatch-body">
                  "Treacherous shoals offshore have breached our hull and torn our canvas! 
                  My crew is limping into port now. We need the master shipwright to patch 
                  the timber breaches, mend the sails, and reinforce the mast before our departure!"
                </p>
              </div>

              <div class="dossier-docket">
                <div class="docket-title">MANDATORY REPAIR DOCKET:</div>
                <ul class="docket-list">
                  <li><span class="docket-icon">🔨</span> <strong>Patch 3 Hull Breaches</strong> (Hammer &amp; Planks)</li>
                  <li><span class="docket-icon">🪡</span> <strong>Mend Torn Sail Cloth</strong> (Sailmaker Needle)</li>
                  <li><span class="docket-icon">🪢</span> <strong>Reinforce Cracked Mast</strong> (Hemp Rope)</li>
                </ul>
              </div>

              <div class="dossier-actions">
                <button id="btn-embark-voyage" class="embark-btn">
                  <span class="embark-main">EMBARK ON VOYAGE (LEVEL 1)</span>
                  <span class="embark-sub">Summon Captain &amp; Begin Repair Cutscene</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Click backdrop or close button to close
    this._el.querySelector('#book-close-btn').addEventListener('click', () => this.close());
    this._el.addEventListener('click', (e) => {
      if (e.target === this._el) this.close();
    });

    // Embark Level 1
    const embarkBtn = this._el.querySelector('#btn-embark-voyage');
    embarkBtn.addEventListener('click', () => {
      emit('playSound', { sound: 'qte_success' });
      this.close();
      emit('levelSelected', { day: 1 });
    });

    document.getElementById('ui-root')?.appendChild(this._el);
    emit('playSound', { sound: 'qte_success' });
  }

  close() {
    if (!this._isOpen) return;
    this._isOpen = false;
    this._el?.remove();
    this._el = null;
  }

  dispose() {
    this.close();
    off('openLevelSelector', this._onOpen);
    off('closeLevelSelector', this._onClose);
  }
}

import { on, off, emit } from '../core/EventBus.js';

const LEVEL_DOSSIERS = {
  1: {
    day: 1,
    stamp: 'CHARTED VOYAGE #01',
    title: 'VOYAGE DOSSIER: DAY 1',
    vessel: 'Standard Sloop',
    weather: '☀️ Clear &amp; Fair Breeze',
    budget: '🪙 200 Doubloons',
    hazard: 'Low (Barrels &amp; Shallow Rocks)',
    dispatch: 'Treacherous shoals offshore have breached our hull and torn our canvas! My crew is limping into port now. We need the master shipwright to patch the timber breaches, mend the sails, and reinforce the mast before our departure!',
    docket: [
      { icon: '🔨', text: '<strong>Patch 3 Hull Breaches</strong> (Hammer &amp; Planks)' },
      { icon: '🪡', text: '<strong>Mend Torn Sail Cloth</strong> (Sailmaker Needle)' },
      { icon: '🪢', text: '<strong>Reinforce Cracked Mast</strong> (Hemp Rope)' }
    ],
    embarkTitle: 'EMBARK ON VOYAGE (LEVEL 1)',
    embarkSub: 'Summon Captain &amp; Begin Repair Cutscene'
  },
  2: {
    day: 2,
    stamp: 'CHARTED VOYAGE #02',
    title: 'VOYAGE DOSSIER: DAY 2',
    vessel: 'Standard Sloop',
    weather: '🌧️ Overcast &amp; Rising Squalls',
    budget: '🪙 250 Doubloons',
    hazard: 'Medium (Reef Rocks, Seaweed &amp; Waves)',
    dispatch: 'A heavy squall swept across the channel! The hull took hits from submerged reef rocks and seaweed tangled in the rudder. Get her patched up so we can weather the gale!',
    docket: [
      { icon: '🔨', text: '<strong>Patch 3 Hull Breaches</strong> (Hammer &amp; Planks)' },
      { icon: '🪡', text: '<strong>Mend Torn Sail Cloth</strong> (Sailmaker Needle)' },
      { icon: '🪢', text: '<strong>Reinforce Cracked Mast</strong> (Hemp Rope)' }
    ],
    embarkTitle: 'EMBARK ON VOYAGE (LEVEL 2)',
    embarkSub: 'Summon Captain &amp; Begin Repair Cutscene'
  },
  3: {
    day: 3,
    stamp: 'CHARTED VOYAGE #03',
    title: 'VOYAGE DOSSIER: DAY 3',
    vessel: 'Standard Sloop',
    weather: '🌫️ Beautiful day sunny morning',
    budget: '🪙 1100 Doubloons',
    hazard: 'Tight canals, whirlpools and trecherous wind',
    dispatch: "A beautiful day is ahead but nature is a cruel mistress!",
    docket: [
      { icon: '🔨', text: '<strong>Patch 3 Hull Breaches</strong> (Hammer &amp; Planks)' },
      { icon: '🪡', text: '<strong>Mend Torn Sail Cloth</strong> (Sailmaker Needle)' },
      { icon: '🪢', text: '<strong>Reinforce Cracked Mast</strong> (Hemp Rope)' }
    ],
    embarkTitle: 'EMBARK ON VOYAGE (LEVEL 3)',
    embarkSub: 'Summon Sloop &amp; Begin Arrival Cutscene'
  }
};

/**
 * LevelSelectorUI — Nautical, leather-and-parchment logbook level selector.
 * Matches the shop and shipyard theme, allowing the player to inspect charted
 * voyages and select Level 1, 2, or 3 to trigger the NPC arrival and docking sequence.
 */
export class LevelSelectorUI {
  constructor() {
    this._el = null;
    this._isOpen = false;
    this._selectedDay = 1;

    this._onOpen = (data) => this.open(data?.day);
    this._onClose = () => this.close();

    on('openLevelSelector', this._onOpen);
    on('closeLevelSelector', this._onClose);
    on('uiMount', d => {
      if (d?.gameState?.day) {
        this._selectedDay = d.gameState.day;
      }
    });
    on('uiUnmount', d => {
      if (d?.screen === 'dock') this.close();
    });
  }

  open(initialDay) {
    if (this._isOpen) return;
    this._isOpen = true;
    if (initialDay && LEVEL_DOSSIERS[initialDay]) {
      this._selectedDay = initialDay;
    }

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
                <div class="level-card level-card-active ${this._selectedDay === 1 ? 'selected' : ''}" data-level="1">
                  <div class="level-badge available">AVAILABLE</div>
                  <div class="level-card-main">
                    <span class="level-icon">⛵</span>
                    <div class="level-info">
                      <div class="level-name">Day 1: Maiden Shakedown</div>
                      <div class="level-meta">Sunny &bull; Standard Sloop &bull; 🪙 200</div>
                    </div>
                    <span class="level-stamp-indicator">READY</span>
                  </div>
                </div>

                <!-- Level 2 (Unlocked & Active) -->
                <div class="level-card level-card-active ${this._selectedDay === 2 ? 'selected' : ''}" data-level="2">
                  <div class="level-badge available">AVAILABLE</div>
                  <div class="level-card-main">
                    <span class="level-icon">🌧️</span>
                    <div class="level-info">
                      <div class="level-name">Day 2: The Rising Squall</div>
                      <div class="level-meta">Rain &bull; Standard Sloop &bull; 🪙 250</div>
                    </div>
                    <span class="level-stamp-indicator">READY</span>
                  </div>
                </div>

                <!-- Level 3 (Unlocked & Active) -->
                <div class="level-card level-card-active ${this._selectedDay === 3 ? 'selected' : ''}" data-level="3">
                  <div class="level-badge available">AVAILABLE</div>
                  <div class="level-card-main">
                    <span class="level-icon">🌫️</span>
                    <div class="level-info">
                      <div class="level-name">Day 3: Siren's Fog</div>
                      <div class="level-meta">Dense Fog &bull; Standard Sloop &bull; 🪙 1100</div>
                    </div>
                    <span class="level-stamp-indicator">READY</span>
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
              <div class="dossier-stamp" id="dossier-stamp">CHARTED VOYAGE #01</div>
              <h3 class="dossier-title" id="dossier-title">VOYAGE DOSSIER: DAY 1</h3>
              <div class="page-divider"></div>

              <div class="dossier-section">
                <div class="dossier-row">
                  <span class="dossier-label">Vessel Class:</span>
                  <span class="dossier-value" id="dossier-vessel">Standard Sloop</span>
                </div>
                <div class="dossier-row">
                  <span class="dossier-label">Weather Forecast:</span>
                  <span class="dossier-value" id="dossier-weather">☀️ Clear &amp; Fair Breeze</span>
                </div>
                <div class="dossier-row">
                  <span class="dossier-label">Repair Budget:</span>
                  <span class="dossier-value highlight-gold" id="dossier-budget">🪙 200 Doubloons</span>
                </div>
                <div class="dossier-row">
                  <span class="dossier-label">Hazard Rating:</span>
                  <span class="dossier-value" id="dossier-hazard">Low (Barrels &amp; Shallow Rocks)</span>
                </div>
              </div>

              <div class="dossier-dispatch">
                <div class="dispatch-title">CAPTAIN'S DISPATCH:</div>
                <p class="dispatch-body" id="dossier-dispatch-text">
                  "Treacherous shoals offshore have breached our hull and torn our canvas! 
                  My crew is limping into port now. We need the master shipwright to patch 
                  the timber breaches, mend the sails, and reinforce the mast before our departure!"
                </p>
              </div>

              <div class="dossier-docket">
                <div class="docket-title">MANDATORY REPAIR DOCKET:</div>
                <ul class="docket-list" id="dossier-docket-list">
                  <li><span class="docket-icon">🔨</span> <strong>Patch 3 Hull Breaches</strong> (Hammer &amp; Planks)</li>
                  <li><span class="docket-icon">🪡</span> <strong>Mend Torn Sail Cloth</strong> (Sailmaker Needle)</li>
                  <li><span class="docket-icon">🪢</span> <strong>Reinforce Cracked Mast</strong> (Hemp Rope)</li>
                </ul>
              </div>

              <div class="dossier-actions">
                <button id="btn-embark-voyage" class="embark-btn">
                  <span class="embark-main" id="embark-title">EMBARK ON VOYAGE (LEVEL 1)</span>
                  <span class="embark-sub" id="embark-sub">Summon Captain &amp; Begin Repair Cutscene</span>
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

    // Level card selection
    this._el.querySelectorAll('.level-card-active').forEach(card => {
      card.addEventListener('click', () => {
        const levelNum = parseInt(card.dataset.level, 10);
        this._selectLevel(levelNum);
      });
    });

    // Embark chosen level
    const embarkBtn = this._el.querySelector('#btn-embark-voyage');
    embarkBtn.addEventListener('click', () => {
      emit('playSound', { sound: 'qte_success' });
      this.close();
      emit('levelSelected', { day: this._selectedDay || 1 });
    });

    document.getElementById('ui-root')?.appendChild(this._el);
    emit('playSound', { sound: 'qte_success' });

    // Initialize dossier display for selected day
    this._selectLevel(this._selectedDay || 1);
  }

  _selectLevel(day) {
    if (!LEVEL_DOSSIERS[day]) return;
    this._selectedDay = day;

    if (!this._el) return;

    // Update active card selected state
    this._el.querySelectorAll('.level-card').forEach(card => {
      const cardDay = parseInt(card.dataset.level, 10);
      if (cardDay === day) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });

    // Update right page dossier
    const data = LEVEL_DOSSIERS[day];
    const stampEl = this._el.querySelector('#dossier-stamp');
    const titleEl = this._el.querySelector('#dossier-title');
    const vesselEl = this._el.querySelector('#dossier-vessel');
    const weatherEl = this._el.querySelector('#dossier-weather');
    const budgetEl = this._el.querySelector('#dossier-budget');
    const hazardEl = this._el.querySelector('#dossier-hazard');
    const dispatchEl = this._el.querySelector('#dossier-dispatch-text');
    const docketEl = this._el.querySelector('#dossier-docket-list');
    const embarkTitleEl = this._el.querySelector('#embark-title');
    const embarkSubEl = this._el.querySelector('#embark-sub');

    if (stampEl) stampEl.innerText = data.stamp;
    if (titleEl) titleEl.innerText = data.title;
    if (vesselEl) vesselEl.innerText = data.vessel;
    if (weatherEl) weatherEl.innerHTML = data.weather;
    if (budgetEl) budgetEl.innerText = data.budget;
    if (hazardEl) hazardEl.innerText = data.hazard;
    if (dispatchEl) dispatchEl.innerText = `"${data.dispatch}"`;
    if (embarkTitleEl) embarkTitleEl.innerText = data.embarkTitle;
    if (embarkSubEl) embarkSubEl.innerText = data.embarkSub;

    if (docketEl) {
      docketEl.innerHTML = data.docket.map(item => `
        <li><span class="docket-icon">${item.icon}</span> ${item.text}</li>
      `).join('');
    }
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


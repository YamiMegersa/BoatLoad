import { on, off, emit } from '../core/EventBus.js';

const LEVELS = [
  {
    day: 1,
    name: 'Day 1: Maiden Shakedown',
    icon: '⛵',
    meta: 'Sunny • Light Sloop • 🪙 200',
    vessel: 'Barlow Light Sloop',
    weather: '☀️ Clear & Fair Breeze',
    budget: '🪙 200 Doubloons',
    hazard: 'Low (Barrels & Shallow Rocks)',
    dispatch: `"Treacherous shoals offshore have breached our hull and torn our canvas! My crew is limping into port now. We need the master shipwright to patch the timber breaches, mend the sails, and reinforce the mast before our departure!"`,
    docket: [
      { icon: '🔨', text: '<strong>Patch 3 Hull Breaches</strong> (Hammer & Planks)' },
      { icon: '🪡', text: '<strong>Mend Torn Sail Cloth</strong> (Sailmaker Needle)' },
      { icon: '🪢', text: '<strong>Reinforce Cracked Mast</strong> (Hemp Rope)' }
    ]
  },
  {
    day: 2,
    name: 'Day 2: The Rising Squall',
    icon: '🌧️',
    meta: 'Overcast • Choppy Shoals • 🪙 250',
    vessel: 'Barlow Light Sloop',
    weather: '🌧️ Overcast & Rising Waves',
    budget: '🪙 250 Doubloons',
    hazard: 'Moderate (Choppy Shoals & Siren Call)',
    dispatch: `"Dark clouds gather on the horizon and the wind is howling! Our hull took hits from submerged reef outcroppings, and siren calls were heard echoing off the bluffs. Prepare the ship for rougher seas!"`,
    docket: [
      { icon: '🔨', text: '<strong>Patch Hull Breaches</strong> (Hammer & Planks)' },
      { icon: '🪡', text: '<strong>Mend Torn Sail Cloth</strong> (Sailmaker Needle)' },
      { icon: '🪢', text: '<strong>Reinforce Cracked Mast</strong> (Hemp Rope)' }
    ]
  },
  {
    day: 3,
    name: "Day 3: Siren's Fog",
    icon: '🌫️',
    meta: 'Sunset Fog • Reef Hazards • 🪙 300',
    vessel: 'Barlow Light Sloop',
    weather: '🌇 Golden Sunset & Dense Mist',
    budget: '🪙 300 Doubloons',
    hazard: 'High (Siren Allure & Jagged Skerries)',
    dispatch: `"The sunset cast a false calm over the waters—bewitching songs lured our lookouts off course directly onto the teeth of jagged rocks. Patch her up tight and sound the bell!"`,
    docket: [
      { icon: '🔨', text: '<strong>Patch Hull Breaches</strong> (Hammer & Planks)' },
      { icon: '🪡', text: '<strong>Mend Torn Sail Cloth</strong> (Sailmaker Needle)' },
      { icon: '🪢', text: '<strong>Reinforce Cracked Mast</strong> (Hemp Rope)' }
    ]
  },
  {
    day: 4,
    name: 'Day 4: Gale-Force Reef',
    icon: '⛈️',
    meta: 'Storm Winds • Heavy Swells • 🪙 350',
    vessel: 'Barlow Light Sloop',
    weather: '⛈️ Violent Storm & Gale Winds',
    budget: '🪙 350 Doubloons',
    hazard: 'Severe (Sudden Squalls & Crashing Swells)',
    dispatch: `"Gale winds split our mainsail and batter our deck timbers! We barely made it past the outer reefs before the storm broke over us. Quick repairs needed before nightfall!"`,
    docket: [
      { icon: '🔨', text: '<strong>Patch Hull Breaches</strong> (Hammer & Planks)' },
      { icon: '🪡', text: '<strong>Mend Torn Sail Cloth</strong> (Sailmaker Needle)' },
      { icon: '🪢', text: '<strong>Reinforce Cracked Mast</strong> (Hemp Rope)' }
    ]
  },
  {
    day: 5,
    name: 'Day 5: Abyssal Trench',
    icon: '🌊',
    meta: 'Heavy Squall • Strong Tide • 🪙 400',
    vessel: 'Barlow Light Sloop',
    weather: '🌊 Heavy Squall & Torrential Rain',
    budget: '🪙 400 Doubloons',
    hazard: 'Extreme (Abyssal Currents & Sea Beasts)',
    dispatch: `"The deep currents near the trench drag down even the stoutest craft. Timber groaned and joints separated under the pressure of abyssal swells. Rebuild her strength, shipwright!"`,
    docket: [
      { icon: '🔨', text: '<strong>Patch Hull Breaches</strong> (Hammer & Planks)' },
      { icon: '🪡', text: '<strong>Mend Torn Sail Cloth</strong> (Sailmaker Needle)' },
      { icon: '🪢', text: '<strong>Reinforce Cracked Mast</strong> (Hemp Rope)' }
    ]
  },
  {
    day: 6,
    name: 'Day 6: Tempest Surge',
    icon: '⚡',
    meta: 'Lightning • Crushing Waves • 🪙 500',
    vessel: 'Barlow Light Sloop',
    weather: '⚡ Tempest Surge & Thick Fog',
    budget: '🪙 500 Doubloons',
    hazard: 'Extreme (Rolling Lightning & Crushing Waves)',
    dispatch: `"Lightning struck our topmast and lightning arcs scorched the rigging! Shorter waves are slamming against our bow. We need a complete overhaul to weather the next run!"`,
    docket: [
      { icon: '🔨', text: '<strong>Patch Hull Breaches</strong> (Hammer & Planks)' },
      { icon: '🪡', text: '<strong>Mend Torn Sail Cloth</strong> (Sailmaker Needle)' },
      { icon: '🪢', text: '<strong>Reinforce Cracked Mast</strong> (Hemp Rope)' }
    ]
  },
  {
    day: 7,
    name: "Day 7: The Kraken's Wake",
    icon: '🦑',
    meta: 'Gale Sky • Ancient Titan • 🪙 600',
    vessel: 'Barlow Light Sloop',
    weather: '🌪️ Blood Gale & Monstrous Tides',
    budget: '🪙 600 Doubloons',
    hazard: 'Lethal (The Ancient Kraken & Tentacles)',
    dispatch: `"The beast awakens from the depths! Tentacles like ancient tree trunks dragged three galleons down yesterday. Our vessel must be in peak fighting shape to survive the Kraken's domain!"`,
    docket: [
      { icon: '🔨', text: '<strong>Patch Hull Breaches</strong> (Hammer & Planks)' },
      { icon: '🪡', text: '<strong>Mend Torn Sail Cloth</strong> (Sailmaker Needle)' },
      { icon: '🪢', text: '<strong>Reinforce Cracked Mast</strong> (Hemp Rope)' }
    ]
  }
];

/**
 * LevelSelectorUI — Nautical, leather-and-parchment logbook level selector.
 * Matches the shop and shipyard theme, allowing the player to inspect and embark
 * on any charted voyage across all days.
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

  _renderCardsHtml() {
    return LEVELS.map(lvl => {
      const isSelected = lvl.day === this._selectedDay;
      return `
        <div class="level-card level-card-active ${isSelected ? 'selected' : ''}" data-level="${lvl.day}">
          <div class="level-badge available">AVAILABLE</div>
          <div class="level-card-main">
            <span class="level-icon">${lvl.icon}</span>
            <div class="level-info">
              <div class="level-name">${lvl.name}</div>
              <div class="level-meta">${lvl.meta}</div>
            </div>
            <span class="level-stamp-indicator">READY</span>
          </div>
        </div>
      `;
    }).join('');
  }

  _updateDossier() {
    const lvl = LEVELS.find(l => l.day === this._selectedDay) || LEVELS[0];
    const dossierRight = this._el.querySelector('.book-page.page-right');
    if (!dossierRight) return;

    const padDay = String(lvl.day).padStart(2, '0');
    dossierRight.querySelector('.dossier-stamp').textContent = `CHARTED VOYAGE #${padDay}`;
    dossierRight.querySelector('.dossier-title').textContent = `VOYAGE DOSSIER: DAY ${lvl.day}`;

    const values = dossierRight.querySelectorAll('.dossier-value');
    if (values[0]) values[0].textContent = lvl.vessel;
    if (values[1]) values[1].textContent = lvl.weather;
    if (values[2]) values[2].textContent = lvl.budget;
    if (values[3]) values[3].textContent = lvl.hazard;

    const dispatchBody = dossierRight.querySelector('.dispatch-body');
    if (dispatchBody) dispatchBody.textContent = lvl.dispatch.replace(/^"|"$/g, '');

    const docketList = dossierRight.querySelector('.docket-list');
    if (docketList) {
      docketList.innerHTML = lvl.docket.map(d => `
        <li><span class="docket-icon">${d.icon}</span> ${d.text}</li>
      `).join('');
    }

    const embarkMain = dossierRight.querySelector('.embark-main');
    if (embarkMain) {
      embarkMain.textContent = `EMBARK ON VOYAGE (LEVEL ${lvl.day})`;
    }
  }

  _selectDay(day) {
    this._selectedDay = day;
    const cards = this._el.querySelectorAll('.level-card');
    cards.forEach(card => {
      const cardDay = parseInt(card.dataset.level, 10);
      if (cardDay === day) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });
    this._updateDossier();
    emit('playSound', { sound: 'qte_success' });
  }

  open() {
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
                ${this._renderCardsHtml()}
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
                <p class="dispatch-body"></p>
              </div>

              <div class="dossier-docket">
                <div class="docket-title">MANDATORY REPAIR DOCKET:</div>
                <ul class="docket-list"></ul>
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

    // Populate the right page dossier with current selection
    this._updateDossier();

    // Click on level cards
    const cards = this._el.querySelectorAll('.level-card');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        const day = parseInt(card.dataset.level, 10);
        if (day) this._selectDay(day);
      });
    });

    // Click backdrop or close button to close
    this._el.querySelector('#book-close-btn').addEventListener('click', () => this.close());
    this._el.addEventListener('click', (e) => {
      if (e.target === this._el) this.close();
    });

    // Embark selected level
    const embarkBtn = this._el.querySelector('#btn-embark-voyage');
    embarkBtn.addEventListener('click', () => {
      emit('playSound', { sound: 'qte_success' });
      const day = this._selectedDay || 1;
      this.close();
      emit('levelSelected', { day });
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


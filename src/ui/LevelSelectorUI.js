import { on, off, emit } from '../core/EventBus.js';
import { CUSTOMER_SCRIPTS } from '../config/CustomerScript.js';

const LEVELS = [
  {
    day: 1,
    name: `Day 1: ${CUSTOMER_SCRIPTS[1].shipName}`,
    icon: '<span class="pixel-icon icon-sloop size-20"></span>',
    meta: `${CUSTOMER_SCRIPTS[1].customerName} • <span class="pixel-icon icon-doubloon size-14"></span> ${CUSTOMER_SCRIPTS[1].basePay}`,
    customer: `${CUSTOMER_SCRIPTS[1].customerName} (${CUSTOMER_SCRIPTS[1].customerRole})`,
    vessel: CUSTOMER_SCRIPTS[1].shipName,
    weather: '<span class="pixel-icon icon-sun-fair size-16"></span> Clear &amp; Fair Breeze',
    budget: `<span class="pixel-icon icon-doubloon size-16"></span> ${CUSTOMER_SCRIPTS[1].basePay} Doubloons`,
    hazard: 'Low (Barrels &amp; Shallow Rocks)',
    dispatch: `${CUSTOMER_SCRIPTS[1].complaintShort} — "${CUSTOMER_SCRIPTS[1].lines[1]} ${CUSTOMER_SCRIPTS[1].lines[2]}"`,
    docket: [
      { icon: '<span class="pixel-icon icon-hammer size-18"></span>', text: '<strong>Patch 3 Hull Breaches</strong> (Hammer &amp; Planks)' },
      { icon: '<span class="pixel-icon icon-sail-needle size-18"></span>', text: '<strong>Mend Torn Sail Cloth</strong> (Sailmaker Needle)' },
      { icon: '<span class="pixel-icon icon-rope-knot size-18"></span>', text: '<strong>Reinforce Cracked Mast</strong> (Hemp Rope)' }
    ]
  },
  {
    day: 2,
    name: `Day 2: ${CUSTOMER_SCRIPTS[2].shipName}`,
    icon: '<span class="pixel-icon icon-rain-squall size-20"></span>',
    meta: `${CUSTOMER_SCRIPTS[2].customerName} • <span class="pixel-icon icon-doubloon size-14"></span> ${CUSTOMER_SCRIPTS[2].basePay}`,
    customer: `${CUSTOMER_SCRIPTS[2].customerName} (${CUSTOMER_SCRIPTS[2].customerRole})`,
    vessel: CUSTOMER_SCRIPTS[2].shipName,
    weather: '<span class="pixel-icon icon-rain-squall size-16"></span> Overcast &amp; Rising Waves',
    budget: `<span class="pixel-icon icon-doubloon size-16"></span> ${CUSTOMER_SCRIPTS[2].basePay} Doubloons`,
    hazard: 'Moderate (Choppy Shoals &amp; Siren Call)',
    dispatch: `${CUSTOMER_SCRIPTS[2].complaintShort} — "${CUSTOMER_SCRIPTS[2].lines[1]} ${CUSTOMER_SCRIPTS[2].lines[2]}"`,
    docket: [
      { icon: '<span class="pixel-icon icon-hammer size-18"></span>', text: '<strong>Patch Hull Breaches</strong> (Hammer &amp; Planks)' },
      { icon: '<span class="pixel-icon icon-sail-needle size-18"></span>', text: '<strong>Mend Torn Sail Cloth</strong> (Sailmaker Needle)' },
      { icon: '<span class="pixel-icon icon-rope-knot size-18"></span>', text: '<strong>Reinforce Cracked Mast</strong> (Hemp Rope)' }
    ]
  },
  {
    day: 3,
    name: `Day 3: ${CUSTOMER_SCRIPTS[3].shipName}`,
    icon: '<span class="pixel-icon icon-sea-fog size-20"></span>',
    meta: `${CUSTOMER_SCRIPTS[3].customerName} • <span class="pixel-icon icon-doubloon size-14"></span> ${CUSTOMER_SCRIPTS[3].basePay}`,
    customer: `${CUSTOMER_SCRIPTS[3].customerName} (${CUSTOMER_SCRIPTS[3].customerRole})`,
    vessel: CUSTOMER_SCRIPTS[3].shipName,
    weather: '<span class="pixel-icon icon-dusk-sunset size-16"></span> Golden Sunset &amp; Dense Mist',
    budget: `<span class="pixel-icon icon-doubloon size-16"></span> ${CUSTOMER_SCRIPTS[3].basePay} Doubloons`,
    hazard: 'High (Siren Allure &amp; Jagged Skerries)',
    dispatch: `${CUSTOMER_SCRIPTS[3].complaintShort} — "${CUSTOMER_SCRIPTS[3].lines[1]} ${CUSTOMER_SCRIPTS[3].lines[2]}"`,
    docket: [
      { icon: '<span class="pixel-icon icon-hammer size-18"></span>', text: '<strong>Patch Hull Breaches</strong> (Hammer &amp; Planks)' },
      { icon: '<span class="pixel-icon icon-sail-needle size-18"></span>', text: '<strong>Mend Torn Sail Cloth</strong> (Sailmaker Needle)' },
      { icon: '<span class="pixel-icon icon-rope-knot size-18"></span>', text: '<strong>Reinforce Cracked Mast</strong> (Hemp Rope)' }
    ]
  },
  {
    day: 4,
    name: `Day 4: ${CUSTOMER_SCRIPTS[4].shipName}`,
    icon: '<span class="pixel-icon icon-storm-lightning size-20"></span>',
    meta: `${CUSTOMER_SCRIPTS[4].customerName} • <span class="pixel-icon icon-doubloon size-14"></span> ${CUSTOMER_SCRIPTS[4].basePay}`,
    customer: `${CUSTOMER_SCRIPTS[4].customerName} (${CUSTOMER_SCRIPTS[4].customerRole})`,
    vessel: CUSTOMER_SCRIPTS[4].shipName,
    weather: '<span class="pixel-icon icon-storm-lightning size-16"></span> Violent Storm &amp; Gale Winds',
    budget: `<span class="pixel-icon icon-doubloon size-16"></span> ${CUSTOMER_SCRIPTS[4].basePay} Doubloons`,
    hazard: 'Severe (Sudden Squalls &amp; Crashing Swells)',
    dispatch: `${CUSTOMER_SCRIPTS[4].complaintShort} — "${CUSTOMER_SCRIPTS[4].lines[1]} ${CUSTOMER_SCRIPTS[4].lines[2]}"`,
    docket: [
      { icon: '<span class="pixel-icon icon-hammer size-18"></span>', text: '<strong>Patch Hull Breaches</strong> (Hammer &amp; Planks)' },
      { icon: '<span class="pixel-icon icon-sail-needle size-18"></span>', text: '<strong>Mend Torn Sail Cloth</strong> (Sailmaker Needle)' },
      { icon: '<span class="pixel-icon icon-rope-knot size-18"></span>', text: '<strong>Reinforce Cracked Mast</strong> (Hemp Rope)' }
    ]
  },
  {
    day: 5,
    name: `Day 5: ${CUSTOMER_SCRIPTS[5].shipName}`,
    icon: '<span class="pixel-icon icon-ocean-wave size-20"></span>',
    meta: `${CUSTOMER_SCRIPTS[5].customerName} • <span class="pixel-icon icon-doubloon size-14"></span> ${CUSTOMER_SCRIPTS[5].basePay}`,
    customer: `${CUSTOMER_SCRIPTS[5].customerName} (${CUSTOMER_SCRIPTS[5].customerRole})`,
    vessel: CUSTOMER_SCRIPTS[5].shipName,
    weather: '<span class="pixel-icon icon-ocean-wave size-16"></span> Heavy Squall &amp; Torrential Rain',
    budget: `<span class="pixel-icon icon-doubloon size-16"></span> ${CUSTOMER_SCRIPTS[5].basePay} Doubloons`,
    hazard: 'Extreme (Abyssal Currents &amp; Sea Beasts)',
    dispatch: `${CUSTOMER_SCRIPTS[5].complaintShort} — "${CUSTOMER_SCRIPTS[5].lines[1]} ${CUSTOMER_SCRIPTS[5].lines[2]}"`,
    docket: [
      { icon: '<span class="pixel-icon icon-hammer size-18"></span>', text: '<strong>Patch Hull Breaches</strong> (Hammer &amp; Planks)' },
      { icon: '<span class="pixel-icon icon-sail-needle size-18"></span>', text: '<strong>Mend Torn Sail Cloth</strong> (Sailmaker Needle)' },
      { icon: '<span class="pixel-icon icon-rope-knot size-18"></span>', text: '<strong>Reinforce Cracked Mast</strong> (Hemp Rope)' }
    ]
  },
  {
    day: 6,
    name: `Day 6: ${CUSTOMER_SCRIPTS[6].shipName}`,
    icon: '<span class="pixel-icon icon-lightning-spark size-20"></span>',
    meta: `${CUSTOMER_SCRIPTS[6].customerName} • <span class="pixel-icon icon-doubloon size-14"></span> ${CUSTOMER_SCRIPTS[6].basePay}`,
    customer: `${CUSTOMER_SCRIPTS[6].customerName} (${CUSTOMER_SCRIPTS[6].customerRole})`,
    vessel: CUSTOMER_SCRIPTS[6].shipName,
    weather: '<span class="pixel-icon icon-lightning-spark size-16"></span> Tempest Surge &amp; Thick Fog',
    budget: `<span class="pixel-icon icon-doubloon size-16"></span> ${CUSTOMER_SCRIPTS[6].basePay} Doubloons`,
    hazard: 'Extreme (Rolling Lightning &amp; Crushing Waves)',
    dispatch: `${CUSTOMER_SCRIPTS[6].complaintShort} — "${CUSTOMER_SCRIPTS[6].lines[1]} ${CUSTOMER_SCRIPTS[6].lines[2]}"`,
    docket: [
      { icon: '<span class="pixel-icon icon-hammer size-18"></span>', text: '<strong>Patch Hull Breaches</strong> (Hammer &amp; Planks)' },
      { icon: '<span class="pixel-icon icon-sail-needle size-18"></span>', text: '<strong>Mend Torn Sail Cloth</strong> (Sailmaker Needle)' },
      { icon: '<span class="pixel-icon icon-rope-knot size-18"></span>', text: '<strong>Reinforce Cracked Mast</strong> (Hemp Rope)' }
    ]
  },
  {
    day: 7,
    name: `Day 7: ${CUSTOMER_SCRIPTS[7].shipName}`,
    icon: '<span class="pixel-icon icon-kraken-head size-20"></span>',
    meta: `${CUSTOMER_SCRIPTS[7].customerName} • <span class="pixel-icon icon-doubloon size-14"></span> ${CUSTOMER_SCRIPTS[7].basePay}`,
    customer: `${CUSTOMER_SCRIPTS[7].customerName} (${CUSTOMER_SCRIPTS[7].customerRole})`,
    vessel: CUSTOMER_SCRIPTS[7].shipName,
    weather: '<span class="pixel-icon icon-hurricane-gale size-16"></span> Blood Gale &amp; Monstrous Tides',
    budget: `<span class="pixel-icon icon-doubloon size-16"></span> ${CUSTOMER_SCRIPTS[7].basePay} Doubloons`,
    hazard: 'Lethal (The Ancient Kraken &amp; Tentacles)',
    dispatch: `${CUSTOMER_SCRIPTS[7].complaintShort} — "${CUSTOMER_SCRIPTS[7].lines[1]} ${CUSTOMER_SCRIPTS[7].lines[2]}"`,
    docket: [
      { icon: '<span class="pixel-icon icon-hammer size-18"></span>', text: '<strong>Patch Hull Breaches</strong> (Hammer &amp; Planks)' },
      { icon: '<span class="pixel-icon icon-sail-needle size-18"></span>', text: '<strong>Mend Torn Sail Cloth</strong> (Sailmaker Needle)' },
      { icon: '<span class="pixel-icon icon-rope-knot size-18"></span>', text: '<strong>Reinforce Cracked Mast</strong> (Hemp Rope)' }
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
    if (values[0]) values[0].textContent = `${lvl.vessel} — ${lvl.customer}`;
    if (values[1]) values[1].innerHTML = lvl.weather;
    if (values[2]) values[2].innerHTML = `${lvl.budget} <span class="dossier-bargain-tag" style="font-size:10px; color:#94a3b8; font-style:italic; margin-left:6px;">[Base Contract]</span>`;
    if (values[3]) values[3].textContent = lvl.hazard;

    const dispatchBody = dossierRight.querySelector('.dispatch-body');
    if (dispatchBody) dispatchBody.textContent = lvl.dispatch;

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

  open(initialDay) {
    if (this._isOpen) return;
    this._isOpen = true;
    if (initialDay && LEVELS.some(l => l.day === initialDay)) {
      this._selectedDay = initialDay;
    }

    this._el = document.createElement('div');
    this._el.id = 'level-selector-modal';
    this._el.className = 'level-selector-backdrop';

    this._el.innerHTML = `
      <div class="level-book-wrapper">
        <div class="level-book">
          <!-- Close button resembling a wax seal / brass emblem -->
          <button class="book-close-btn" id="book-close-btn" aria-label="Close Logbook"><span class="pixel-icon icon-close-cross size-16"></span></button>

          <!-- Book spine & decorative ribbon -->
          <div class="book-spine"></div>
          <div class="book-ribbon"></div>

          <!-- Two-page Spread -->
          <div class="book-pages-spread">
            <!-- LEFT PAGE: Level & Voyage Index -->
            <div class="book-page page-left">
              <div class="page-header">
                <div class="nautical-emblem"><span class="pixel-icon icon-anchor size-24"></span></div>
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
                  <span class="dossier-label">Vessel &amp; Client:</span>
                  <span class="dossier-value" id="dossier-vessel">The Sorry Bastard — Old Walt Gunnet</span>
                </div>
                <div class="dossier-row">
                  <span class="dossier-label">Weather Forecast:</span>
                  <span class="dossier-value" id="dossier-weather"><span class="pixel-icon icon-sun-fair size-16"></span> Clear &amp; Fair Breeze</span>
                </div>
                <div class="dossier-row">
                  <span class="dossier-label">Repair Budget:</span>
                  <span class="dossier-value highlight-gold" id="dossier-budget"><span class="pixel-icon icon-doubloon size-16"></span> 200 Doubloons</span>
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
    this._selectDay(this._selectedDay || 1);
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


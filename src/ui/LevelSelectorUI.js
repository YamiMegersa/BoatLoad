import { on, off, emit } from '../core/EventBus.js';
import { CUSTOMER_SCRIPTS } from '../config/CustomerScript.js';

const LEVELS = [
  {
    day: 0,
    name: `Day 0: ${CUSTOMER_SCRIPTS[0].shipName}`,
    icon: '🦀',
    meta: `${CUSTOMER_SCRIPTS[0].customerName} • Opening &amp; Tutorial`,
    customer: `${CUSTOMER_SCRIPTS[0].customerName} (${CUSTOMER_SCRIPTS[0].customerRole})`,
    vessel: CUSTOMER_SCRIPTS[0].shipName,
    weather: '<span class="pixel-icon icon-sun-fair size-16"></span> Dawn Hangover &amp; Calm Tide',
    budget: `<span class="pixel-icon icon-doubloon size-16"></span> -7,000 Doubloons (Divorce Debt)`,
    hazard: 'None (Beach Wakeup &amp; Divorce Writ)',
    dispatch: `${CUSTOMER_SCRIPTS[0].complaintShort} — "${CUSTOMER_SCRIPTS[0].lines[0]} ${CUSTOMER_SCRIPTS[0].lines[2]}"`,
    docket: [
      { icon: '🦀', text: '<strong>Speak with Barnaby Claw, Esq.</strong> in the shallow water off the beach' },
      { icon: '<span class="pixel-icon icon-map-maker-scroll size-18"></span>', text: '<strong>Inspect the Writ of Divorce</strong> nailed to the post where the dock meets land' }
    ]
  },
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
  constructor(gameState = null) {
    this.gameState = gameState;
    this._el = null;
    this._isOpen = false;
    this._selectedDay = 0;

    this._onOpen = (data) => this.open(data?.day);
    this._onClose = () => this.close();
    this._onProgression = () => {
      if (this._isOpen && this._el) {
        const entryList = this._el.querySelector('.level-entry-list');
        if (entryList) {
          entryList.innerHTML = this._renderCardsHtml();
          const cards = this._el.querySelectorAll('.level-card');
          cards.forEach(card => {
            card.addEventListener('click', () => {
              const day = parseInt(card.dataset.level, 10);
              if (day !== undefined && !Number.isNaN(day)) this._selectDay(day);
            });
          });
        }
        this._updateDossier();
      }
    };

    on('openLevelSelector', this._onOpen);
    on('closeLevelSelector', this._onClose);
    on('progressionUpdated', this._onProgression);
    on('uiMount', d => {
      if (d?.gameState) {
        this.gameState = d.gameState;
        if (d.gameState.day !== undefined && d.gameState.day !== null) {
          this._selectedDay = d.gameState.day;
        }
      }
    });
    on('uiUnmount', d => {
      if (d?.screen === 'dock') this.close();
    });
  }

  isDayUnlocked(day) {
    if (day === 0) return true;
    if (this.gameState && typeof this.gameState.isDayUnlocked === 'function') {
      return this.gameState.isDayUnlocked(day);
    }
    try {
      const data = localStorage.getItem('boatload_progression');
      if (data) {
        const parsed = JSON.parse(data);
        if (typeof parsed.unlockedDay === 'number') {
          return day <= parsed.unlockedDay;
        }
      }
    } catch (_) {}
    return false;
  }

  _renderCardsHtml() {
    return LEVELS.map(lvl => {
      const isSelected = lvl.day === this._selectedDay;
      const isUnlocked = this.isDayUnlocked(lvl.day);

      if (isUnlocked) {
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
      } else {
        return `
          <div class="level-card level-card-locked ${isSelected ? 'selected' : ''}" data-level="${lvl.day}">
            <div class="level-badge locked">🔒 LOCKED</div>
            <div class="level-card-main">
              <span class="level-icon"><span class="pixel-icon icon-padlock size-20">🔒</span></span>
              <div class="level-info">
                <div class="level-name">${lvl.name}</div>
                <div class="level-meta">Complete Day ${lvl.day - 1} to unlock</div>
              </div>
              <span class="level-stamp-indicator" style="color: #796658; border-color: #796658; transform: rotate(-3deg);">LOCKED</span>
            </div>
          </div>
        `;
      }
    }).join('');
  }

  _updateDossier() {
    const lvl = LEVELS.find(l => l.day === this._selectedDay) || LEVELS[0];
    const isUnlocked = this.isDayUnlocked(lvl.day);
    const dossierRight = this._el?.querySelector('.book-page.page-right');
    if (!dossierRight) return;

    const padDay = String(lvl.day).padStart(2, '0');
    const stampEl = dossierRight.querySelector('.dossier-stamp');
    if (stampEl) {
      stampEl.textContent = isUnlocked ? `CHARTED VOYAGE #${padDay}` : `🔒 LOCKED VOYAGE #${padDay}`;
      stampEl.style.color = isUnlocked ? '#a82e2e' : '#796658';
      stampEl.style.borderColor = isUnlocked ? '#a82e2e' : '#796658';
    }

    const titleEl = dossierRight.querySelector('.dossier-title');
    if (titleEl) {
      titleEl.textContent = isUnlocked ? `VOYAGE DOSSIER: DAY ${lvl.day}` : `CLASSIFIED DOSSIER: DAY ${lvl.day}`;
    }

    const values = dossierRight.querySelectorAll('.dossier-value');
    if (values[0]) values[0].textContent = isUnlocked ? `${lvl.vessel} — ${lvl.customer}` : `${lvl.vessel} (Classified)`;
    if (values[1]) values[1].innerHTML = isUnlocked ? lvl.weather : `<span style="color:#796658; font-style:italic;">Uncharted Waters</span>`;
    if (values[2]) values[2].innerHTML = isUnlocked ? `${lvl.budget} <span class="dossier-bargain-tag" style="font-size:10px; color:#94a3b8; font-style:italic; margin-left:6px;">[Base Contract]</span>` : `<span style="color:#796658;">??? Doubloons</span>`;
    if (values[3]) values[3].textContent = isUnlocked ? lvl.hazard : `Hazard Level Unknown`;

    const dispatchBody = dossierRight.querySelector('.dispatch-body');
    if (dispatchBody) {
      dispatchBody.textContent = isUnlocked
        ? lvl.dispatch
        : `This voyage log is sealed by the Admiralty. You must complete Day ${lvl.day - 1} before setting sail on this course.`;
    }

    const docketList = dossierRight.querySelector('.docket-list');
    if (docketList) {
      if (isUnlocked) {
        docketList.innerHTML = lvl.docket.map(d => `
          <li><span class="docket-icon">${d.icon}</span> ${d.text}</li>
        `).join('');
      } else {
        docketList.innerHTML = `
          <li style="color: #796658; font-style: italic;">
            <span class="docket-icon">🔒</span> Complete Day ${lvl.day - 1} to reveal repair docket and contract terms.
          </li>
        `;
      }
    }

    const embarkBtn = dossierRight.querySelector('#btn-embark-voyage');
    const embarkMain = dossierRight.querySelector('.embark-main');
    const embarkSub = dossierRight.querySelector('.embark-sub');
    if (embarkBtn && embarkMain && embarkSub) {
      if (isUnlocked) {
        embarkBtn.disabled = false;
        embarkBtn.classList.remove('embark-btn-locked');
        embarkBtn.style.opacity = '1';
        embarkBtn.style.filter = 'none';
        embarkBtn.style.cursor = 'pointer';
        embarkBtn.style.pointerEvents = 'auto';
        embarkMain.textContent = `EMBARK ON VOYAGE (LEVEL ${lvl.day})`;
        embarkSub.textContent = `Summon Captain & Begin Repair Cutscene`;
      } else {
        embarkBtn.disabled = true;
        embarkBtn.classList.add('embark-btn-locked');
        embarkBtn.style.opacity = '0.55';
        embarkBtn.style.filter = 'grayscale(0.9)';
        embarkBtn.style.cursor = 'not-allowed';
        embarkBtn.style.pointerEvents = 'none';
        embarkMain.textContent = `🔒 LOCKED (COMPLETE DAY ${lvl.day - 1})`;
        embarkSub.textContent = `Voyage unavailable until previous day is cleared`;
      }
    }
  }

  _selectDay(day) {
    this._selectedDay = day;
    const cards = this._el?.querySelectorAll('.level-card');
    cards?.forEach(card => {
      const cardDay = parseInt(card.dataset.level, 10);
      if (cardDay === day) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });
    this._updateDossier();
    emit('playSound', { sound: this.isDayUnlocked(day) ? 'qte_success' : 'wood_crack' });
  }

  open(initialDay) {
    if (this._isOpen) return;
    this._isOpen = true;

    if (initialDay !== undefined && initialDay !== null && LEVELS.some(l => l.day === initialDay)) {
      this._selectedDay = initialDay;
    } else if (this.gameState?.day !== undefined && this.gameState.day !== null && LEVELS.some(l => l.day === this.gameState.day)) {
      this._selectedDay = this.gameState.day;
    } else {
      this._selectedDay = 0;
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
              <div class="dossier-stamp" id="dossier-stamp">CHARTED VOYAGE #00</div>
              <h3 class="dossier-title" id="dossier-title">VOYAGE DOSSIER: DAY 0</h3>
              <div class="page-divider"></div>

              <div class="dossier-section">
                <div class="dossier-row">
                  <span class="dossier-label">Vessel &amp; Client:</span>
                  <span class="dossier-value" id="dossier-vessel">Loading...</span>
                </div>
                <div class="dossier-row">
                  <span class="dossier-label">Weather Forecast:</span>
                  <span class="dossier-value" id="dossier-weather">Loading...</span>
                </div>
                <div class="dossier-row">
                  <span class="dossier-label">Repair Budget:</span>
                  <span class="dossier-value highlight-gold" id="dossier-budget">Loading...</span>
                </div>
                <div class="dossier-row">
                  <span class="dossier-label">Hazard Rating:</span>
                  <span class="dossier-value" id="dossier-hazard">Loading...</span>
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
                  <span class="embark-main" id="embark-title">EMBARK ON VOYAGE</span>
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
        if (day !== undefined && !Number.isNaN(day)) this._selectDay(day);
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
      const day = (this._selectedDay !== undefined && this._selectedDay !== null) ? this._selectedDay : 0;
      if (!this.isDayUnlocked(day)) {
        emit('playSound', { sound: 'qte_fail' });
        return;
      }
      emit('playSound', { sound: 'qte_success' });
      this.close();
      emit('levelSelected', { day });
    });

    document.getElementById('ui-root')?.appendChild(this._el);
    emit('playSound', { sound: 'qte_success' });

    // Initialize dossier display for selected day
    this._selectDay(this._selectedDay);
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
    off('progressionUpdated', this._onProgression);
  }
}


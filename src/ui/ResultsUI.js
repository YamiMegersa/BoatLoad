import { emit, on, off } from '../core/EventBus.js';
import { GamePhase } from '../core/GameState.js';
import { ShopRegistry } from '../config/ShopRegistry.js';

/**
 * ResultsUI — Voyage completion ledger and financial settlement screen.
 * Displays breakdown of customer contract, repair spending, sailing bounties,
 * incurred collision/sunk damage penalties, net payout, and persistent purse balance.
 */
export class ResultsUI {
  constructor(gameState) {
    this.gameState = gameState;
    this.root = null;

    this._onMount = (d) => {
      if (d?.screen === 'results') this.mount(d.data);
    };
    this._onUnmount = (d) => {
      if (d?.screen === 'results') this.unmount();
    };

    on('uiMount', this._onMount);
    on('uiUnmount', this._onUnmount);
  }

  mount(data = {}) {
    if (this.root) this.unmount();

    const day = data.day || this.gameState.day || 1;
    const isPassed = data.isPassed !== false && !data.isSunk;
    const isSunk = !!data.isSunk;

    // 1. Contract Breakdown
    const contract = data.contract || {
      baseBudget: 200,
      bargainBonus: 0,
      agreedBudget: 200,
      repairSpent: 0,
      leftoverProfit: 200
    };

    // 2. Sailing Rewards Breakdown
    const pedestalItem = ShopRegistry.getItem(this.gameState.equippedItems?.pedestal);
    const pedestalName = pedestalItem?.name || 'Weathered Oak Binnacle';
    const sailing = data.sailing || {
      baseReward: isPassed ? (150 + day * 75) : 0,
      multiplier: this.gameState.getPedestalMultiplier(),
      pedestalBonus: 0,
      sailingBonus: isPassed ? (150 + day * 75) : 0
    };

    // 3. Incurred Damage Breakdown
    const damage = data.damage || {
      damagedVoxels: 0,
      voxelDamageCost: 0,
      totalDamageIncurred: 0
    };

    // 4. Net Payout & Purse
    const netPayout = data.netPayout !== undefined ? data.netPayout : (contract.leftoverProfit + sailing.sailingBonus - damage.totalDamageIncurred);
    const currentCoins = data.currentCoins !== undefined ? data.currentCoins : (this.gameState.coins || 0);
    const isDebt = currentCoins < 0;

    this.root = document.createElement('div');
    this.root.id = 'voyage-results-modal';
    this.root.className = 'results-modal-backdrop';

    this.root.innerHTML = `
      <div class="results-container">
        <div class="results-header">
          <div class="results-crest ${isSunk ? 'crest-wreck' : ''}">
            <span class="pixel-icon ${isSunk ? 'icon-skull size-32' : 'icon-anchor size-32'}"></span>
          </div>
          <h1 class="results-title ${isSunk ? 'title-wreck' : ''}">${isSunk ? 'VESSEL WRECKED &amp; SUNK' : 'VOYAGE ACCOMPLISHED'}</h1>
          <div class="results-subtitle">${isSunk ? `Catastrophic Hull Breach • Day ${day} Salvaged` : `Safe Harbor Reached • Day ${day} Conquered`}</div>
        </div>

        <div class="results-ledger-card">
          <!-- Tier 1: Customer Repair Contract -->
          <div class="ledger-section-title">1. SHIPWRIGHT REPAIR CONTRACT</div>
          <div class="ledger-row">
            <span class="ledger-label">Customer Agreed Budget${contract.bargainBonus > 0 ? ` (Base ${contract.baseBudget} + Bargain ${contract.bargainBonus})` : ''}</span>
            <span class="ledger-val">+${contract.agreedBudget} <span class="pixel-icon icon-doubloon size-16"></span></span>
          </div>
          <div class="ledger-row">
            <span class="ledger-label">Drydock Timber &amp; Materials</span>
            <span class="ledger-val ${contract.repairSpent > 0 ? 'text-penalty' : ''}">-${contract.repairSpent} <span class="pixel-icon icon-doubloon size-16"></span></span>
          </div>
          <div class="ledger-row highlight">
            <div class="ledger-mult-desc">
              <span class="ledger-label">Construction Profit Margin</span>
              <span class="ledger-subtext">${contract.leftoverProfit >= 0 ? 'Frugal shipyard craftsmanship retained' : 'Overbudget repairs paid from purse'}</span>
            </div>
            <span class="ledger-val ${contract.leftoverProfit >= 0 ? 'highlight-gold' : 'text-penalty'}">${contract.leftoverProfit >= 0 ? '+' : ''}${contract.leftoverProfit} <span class="pixel-icon icon-doubloon size-16"></span></span>
          </div>

          <div class="ledger-divider"></div>

          <!-- Tier 2: Sailing Rewards -->
          <div class="ledger-section-title">2. SAILING PASSAGE BOUNTY</div>
          <div class="ledger-row">
            <span class="ledger-label">Passage Delivery Bounty</span>
            <span class="ledger-val">${sailing.baseReward > 0 ? `+${sailing.baseReward}` : '0 (Passage Incomplete)'} <span class="pixel-icon icon-doubloon size-16"></span></span>
          </div>
          ${sailing.pedestalBonus > 0 ? `
          <div class="ledger-row highlight">
            <div class="ledger-mult-desc">
              <span class="ledger-label">Pedestal Bonus (${sailing.multiplier}x)</span>
              <span class="ledger-subtext">${pedestalName}</span>
            </div>
            <span class="ledger-val highlight-gold">+${sailing.pedestalBonus} <span class="pixel-icon icon-doubloon size-16"></span></span>
          </div>
          ` : ''}

          <div class="ledger-divider"></div>

          <!-- Tier 3: Incurred Voyage Damage -->
          <div class="ledger-section-title">3. INVOICED VOYAGE DAMAGE</div>
          <div class="ledger-row">
            <span class="ledger-label">Reef Collisions &amp; Breaches (${damage.damagedVoxels} Voxels)</span>
            <span class="ledger-val ${damage.voxelDamageCost > 0 ? 'text-penalty' : ''}">-${damage.voxelDamageCost} <span class="pixel-icon icon-doubloon size-16"></span></span>
          </div>

          <div class="ledger-divider thick"></div>

          <!-- Tier 4: Net Settlement & Purse -->
          <div class="ledger-row total-row">
            <span class="ledger-label">Net Settlement Payout</span>
            <span class="ledger-val ${netPayout >= 0 ? 'total-gold' : 'total-debt'}">${netPayout >= 0 ? `+${netPayout}` : `-${Math.abs(netPayout)}`} <span class="pixel-icon icon-doubloon size-18"></span></span>
          </div>

          <div class="ledger-wallet-row ${isDebt ? 'debt-row' : ''}">
            <span>Current Purse Balance:</span>
            <strong class="wallet-balance ${isDebt ? 'debt-negative' : ''}">${isDebt ? `-${Math.abs(currentCoins)}` : currentCoins} <span class="pixel-icon icon-doubloon size-16"></span> ${isDebt ? '<span class="debt-tag">(IN DEBT)</span>' : ''}</strong>
          </div>
        </div>

        <div class="results-actions">
          <button class="results-btn shop-action" id="res-btn-shop">
            <span class="pixel-icon icon-phantom-ghost size-18"></span>
            <span>Visit Ghost Stall</span>
          </button>
          <button class="results-btn dock-action" id="res-btn-dock">
            <span class="pixel-icon icon-harbor-flag size-18"></span>
            <span>Return to Dock</span>
          </button>
          <button class="results-btn shipyard-action ${isSunk ? 'action-priority' : ''}" id="res-btn-shipyard">
            <span class="pixel-icon icon-hammer size-18"></span>
            <span>${isSunk ? 'Repair Wrecked Vessel' : 'Shipyard &amp; Repairs'}</span>
          </button>
          ${!isSunk ? `
          <button class="results-btn next-action" id="res-btn-next">
            <span class="pixel-icon icon-sloop size-18"></span>
            <span>Next Voyage (Day ${Math.min(7, day + 1)})</span>
          </button>
          ` : ''}
        </div>
      </div>
    `;

    this.root.querySelector('#res-btn-shop').onclick = () => {
      this.unmount();
      emit('requestPhaseChange', { phase: GamePhase.DOCK, openShop: true });
    };

    this.root.querySelector('#res-btn-dock').onclick = () => {
      this.unmount();
      emit('requestPhaseChange', { phase: GamePhase.DOCK });
    };

    this.root.querySelector('#res-btn-shipyard').onclick = () => {
      this.unmount();
      emit('requestPhaseChange', { phase: GamePhase.SHIPYARD });
    };

    const nextBtn = this.root.querySelector('#res-btn-next');
    if (nextBtn) {
      nextBtn.onclick = () => {
        this.unmount();
        const nextDay = Math.min(7, day + 1);
        this.gameState.day = nextDay;
        emit('levelSelected', { day: nextDay });
        emit('startSailing');
      };
    }

    const uiRoot = document.getElementById('ui-root') || document.body;
    uiRoot.appendChild(this.root);
  }

  unmount() {
    if (this.root && this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
    this.root = null;
  }

  dispose() {
    this.unmount();
    off('uiMount', this._onMount);
    off('uiUnmount', this._onUnmount);
  }
}

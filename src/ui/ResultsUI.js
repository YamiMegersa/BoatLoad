import { emit, on, off } from '../core/EventBus.js';
import { GamePhase } from '../core/GameState.js';
import { ShopRegistry } from '../config/ShopRegistry.js';

/**
 * ResultsUI — Voyage completion ledger and rewards screen.
 * Displays doubloon earnings, pedestal multiplier bonuses, and quick navigation.
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
    const baseReward = data.baseReward || (150 + day * 75);
    const multiplier = data.multiplier || this.gameState.getPedestalMultiplier();
    const totalAwarded = data.bonusCoins || Math.round(baseReward * multiplier);
    const bonusFromPedestal = Math.max(0, totalAwarded - baseReward);
    const pedestalItem = ShopRegistry.getItem(this.gameState.equippedItems?.pedestal);
    const pedestalName = pedestalItem?.name || 'Weathered Oak Binnacle';

    this.root = document.createElement('div');
    this.root.id = 'voyage-results-modal';
    this.root.className = 'results-modal-backdrop';

    this.root.innerHTML = `
      <div class="results-container">
        <div class="results-header">
          <div class="results-crest">⚓</div>
          <h1 class="results-title">VOYAGE ACCOMPLISHED</h1>
          <div class="results-subtitle">Safe Harbor Reached • Day ${day} Conquered</div>
        </div>

        <div class="results-ledger-card">
          <div class="ledger-row">
            <span class="ledger-label">Base Voyage Bounty</span>
            <span class="ledger-val">+${baseReward} 🪙</span>
          </div>

          <div class="ledger-row highlight">
            <div class="ledger-mult-desc">
              <span class="ledger-label">Pedestal Bonus (${multiplier}x)</span>
              <span class="ledger-subtext">${pedestalName}</span>
            </div>
            <span class="ledger-val highlight-gold">+${bonusFromPedestal} 🪙</span>
          </div>

          <div class="ledger-divider"></div>

          <div class="ledger-row total-row">
            <span class="ledger-label">Total Doubloons Banked</span>
            <span class="ledger-val total-gold">+${totalAwarded} 🪙</span>
          </div>

          <div class="ledger-wallet-row">
            <span>Current Purse Balance:</span>
            <strong class="wallet-balance">${this.gameState.coins || 0} 🪙</strong>
          </div>
        </div>

        <div class="results-actions">
          <button class="results-btn shop-action" id="res-btn-shop">
            🛍️ Visit "Deadly Business" Shop
          </button>
          <button class="results-btn dock-action" id="res-btn-dock">
            🏝️ Return to Dock
          </button>
          <button class="results-btn shipyard-action" id="res-btn-shipyard">
            🔨 Shipyard &amp; Repairs
          </button>
          <button class="results-btn next-action" id="res-btn-next">
            ⛵ Next Voyage (Day ${Math.min(7, day + 1)})
          </button>
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

    this.root.querySelector('#res-btn-next').onclick = () => {
      this.unmount();
      const nextDay = Math.min(7, day + 1);
      this.gameState.day = nextDay;
      emit('levelSelected', { day: nextDay });
      emit('startSailing');
    };

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

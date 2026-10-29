import { emit, on, off } from '../core/EventBus.js';
import { GamePhase } from '../core/GameState.js';
import { ShopRegistry } from '../config/ShopRegistry.js';

/**
 * Format milliseconds into M:SS.S
 */
function formatTime(ms) {
  if (!ms || isNaN(ms)) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  return `${mins}:${secs.toString().padStart(2, '0')}.${tenths}`;
}

/**
 * ResultsUI — Voyage completion ledger and financial settlement screen.
 * Displays breakdown of customer contract, repair spending, sailing bounties,
 * incurred collision/sunk damage penalties, net payout, and persistent purse balance
 * for campaign levels, or clear/fail stats with return to community menu for user community levels.
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

    const isCommunity = Boolean(data.isCommunity || this.gameState._isCommunityCourse || this.gameState._activeCommunityCourseCode);
    const day = data.day || this.gameState.day || 1;
    const isPassed = data.isPassed !== false && !data.failed && !data.isSunk;
    const isSunk = Boolean(data.failed || data.isSunk);

    // 1. Contract Breakdown
    const contract = data.contract || {
      baseBudget: 200,
      bargainBonus: 0,
      agreedBudget: 200,
      repairSpent: 0,
      leftoverProfit: 200
    };

    // 2. Sailing Rewards Breakdown
    const pedestalItem = ShopRegistry.getItem(isCommunity ? 'pedestal_lvl0' : this.gameState.equippedItems?.pedestal);
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

    const course = data.course || this.gameState._activeCommunityCourse;
    const courseTitle = course?.title || 'Community Course';
    const creatorName = course?.creator || 'Unknown Cartographer';
    const timeText = data.timeElapsed ? formatTime(data.timeElapsed) : null;

    this.root = document.createElement('div');
    this.root.id = 'voyage-results-modal';
    this.root.className = 'results-modal-backdrop';

    if (isCommunity) {
      // Community Level Results (NO monetary rewards; only Return to Community Menu)
      this.root.innerHTML = `
        <div class="results-container">
          <div class="results-header">
            <div class="results-crest ${isSunk ? 'crest-wreck' : ''}">
              <span class="pixel-icon ${isSunk ? 'icon-skull size-32' : 'icon-anchor size-32'}"></span>
            </div>
            <h1 class="results-title ${isSunk ? 'title-wreck' : ''}">${isSunk ? 'VOYAGE FAILED' : 'VOYAGE ACCOMPLISHED'}</h1>
            <div class="results-subtitle">${isSunk ? 'Vessel Lost at Sea' : 'Safe Harbor Reached'} • ${courseTitle}</div>
          </div>

          <div class="results-ledger-card">
            <div class="ledger-row">
              <span class="ledger-label">Course Title</span>
              <span class="ledger-val" style="color: #ffd700;">${courseTitle}</span>
            </div>

            <div class="ledger-row">
              <span class="ledger-label">Chart Creator</span>
              <span class="ledger-val" style="color: #cbd5e1;">${creatorName}</span>
            </div>

            <div class="ledger-row">
              <span class="ledger-label">Voyage Result</span>
              <span class="ledger-val" style="${isSunk ? 'color: #ef4444; font-weight: bold;' : 'color: #34d399; font-weight: bold;'}">${isSunk ? 'Vessel Sunk (Failed)' : 'Safe Harbor (Cleared)'}</span>
            </div>

            ${timeText ? `
            <div class="ledger-row highlight">
              <div class="ledger-mult-desc">
                <span class="ledger-label">Voyage Duration</span>
                <span class="ledger-subtext">${isSunk ? 'Time before wreckage' : 'Clear recorded in'}</span>
              </div>
              <span class="ledger-val highlight-gold">${timeText}</span>
            </div>` : ''}

            <div class="ledger-divider"></div>

            <div style="font-size: 11px; color: #94a3b8; font-style: italic; padding: 6px 0; text-align: center;">
              Custom community voyages do not award doubloon bounties.
            </div>
          </div>

          <div class="results-actions">
            <button class="results-btn community-action" id="res-btn-community">
              <span class="pixel-icon icon-anchor size-18"></span>
              <span>Return to Community Menu</span>
            </button>
          </div>
        </div>
      `;

      this.root.querySelector('#res-btn-community').onclick = () => {
        this.unmount();
        emit('returnToCommunityMenu');
      };

    } else {
      // Standard Campaign Results (Sailing Summary & Return to Dock)
      const totalAwarded = netPayout !== undefined ? netPayout : (sailing.sailingBonus - damage.totalDamageIncurred);

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
            ${timeText ? `
            <div class="ledger-row highlight">
              <div class="ledger-mult-desc">
                <span class="ledger-label">Voyage Duration</span>
                <span class="ledger-subtext">${isSunk ? 'Time before wreckage' : 'Clear recorded in'}</span>
              </div>
              <span class="ledger-val highlight-gold">${timeText}</span>
            </div>` : ''}

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

            ${damage.damagedVoxels > 0 ? `
            <div class="ledger-row">
              <span class="ledger-label">Reef &amp; Collision Damage (${damage.damagedVoxels} Voxels)</span>
              <span class="ledger-val text-penalty">-${damage.voxelDamageCost} <span class="pixel-icon icon-doubloon size-16"></span></span>
            </div>
            ` : ''}

            <div class="ledger-divider"></div>

            <div class="ledger-row total-row">
              <span class="ledger-label">Total Doubloons Banked</span>
              <span class="ledger-val ${totalAwarded >= 0 ? 'total-gold' : 'total-debt'}">${totalAwarded >= 0 ? `+${totalAwarded}` : `-${Math.abs(totalAwarded)}`} <span class="pixel-icon icon-doubloon size-18"></span></span>
            </div>

            <div class="ledger-wallet-row ${isDebt ? 'debt-row' : ''}">
              <span>Current Purse Balance:</span>
              <strong class="wallet-balance ${isDebt ? 'debt-negative' : ''}">${isDebt ? `-${Math.abs(currentCoins)}` : currentCoins} <span class="pixel-icon icon-doubloon size-16"></span> ${isDebt ? '<span class="debt-tag">(IN DEBT)</span>' : ''}</strong>
            </div>
          </div>

          <div class="results-actions">
            <button class="results-btn dock-action" id="res-btn-dock">
              <span class="pixel-icon icon-harbor-flag size-18"></span>
              <span>Return to Dock</span>
            </button>
          </div>
        </div>
      `;

      this.root.querySelector('#res-btn-dock').onclick = () => {
        this.unmount();
        const nextDay = isPassed ? Math.min(7, day + 1) : day;
        this.gameState.day = nextDay;
        emit('requestPhaseChange', { phase: GamePhase.DOCK, day: nextDay });
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

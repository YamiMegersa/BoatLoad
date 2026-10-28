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
 * ResultsUI — Voyage completion ledger and rewards screen.
 * Displays doubloon earnings and quick navigation for campaign levels,
 * or clear/fail stats with return to community menu for user community levels.
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
    const failed = Boolean(data.failed);
    const day = data.day || this.gameState.day || 1;
    const baseReward = data.baseReward || (150 + day * 75);
    const multiplier = data.multiplier || this.gameState.getPedestalMultiplier();
    const totalAwarded = data.bonusCoins || Math.round(baseReward * multiplier);
    const bonusFromPedestal = Math.max(0, totalAwarded - baseReward);
    const pedestalItem = ShopRegistry.getItem(this.gameState.equippedItems?.pedestal);
    const pedestalName = pedestalItem?.name || 'Weathered Oak Binnacle';

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
            <div class="results-crest">
              <span class="pixel-icon icon-anchor size-32"></span>
            </div>
            <h1 class="results-title" style="${failed ? 'color: #ef4444; text-shadow: 0 0 16px rgba(239, 68, 68, 0.4);' : ''}">${failed ? 'VOYAGE FAILED' : 'VOYAGE ACCOMPLISHED'}</h1>
            <div class="results-subtitle">${failed ? 'Vessel Lost at Sea' : 'Safe Harbor Reached'} • ${courseTitle}</div>
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
              <span class="ledger-val" style="${failed ? 'color: #ef4444; font-weight: bold;' : 'color: #34d399; font-weight: bold;'}">${failed ? 'Vessel Sunk (Failed)' : 'Safe Harbor (Cleared)'}</span>
            </div>

            ${timeText ? `
            <div class="ledger-row highlight">
              <div class="ledger-mult-desc">
                <span class="ledger-label">Voyage Duration</span>
                <span class="ledger-subtext">${failed ? 'Time before wreckage' : 'Clear recorded in'}</span>
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
      // Standard Campaign Results
      this.root.innerHTML = `
        <div class="results-container">
          <div class="results-header">
            <div class="results-crest">
              <span class="pixel-icon icon-anchor size-32"></span>
            </div>
            <h1 class="results-title">VOYAGE ACCOMPLISHED</h1>
            <div class="results-subtitle">Safe Harbor Reached • Day ${day} Conquered</div>
          </div>

          <div class="results-ledger-card">
            <div class="ledger-row">
              <span class="ledger-label">Base Voyage Bounty</span>
              <span class="ledger-val">+${baseReward} <span class="pixel-icon icon-doubloon size-16"></span></span>
            </div>

            <div class="ledger-row highlight">
              <div class="ledger-mult-desc">
                <span class="ledger-label">Pedestal Bonus (${multiplier}x)</span>
                <span class="ledger-subtext">${pedestalName}</span>
              </div>
              <span class="ledger-val highlight-gold">+${bonusFromPedestal} <span class="pixel-icon icon-doubloon size-16"></span></span>
            </div>

            <div class="ledger-divider"></div>

            <div class="ledger-row total-row">
              <span class="ledger-label">Total Doubloons Banked</span>
              <span class="ledger-val total-gold">+${totalAwarded} <span class="pixel-icon icon-doubloon size-18"></span></span>
            </div>

            <div class="ledger-wallet-row">
              <span>Current Purse Balance:</span>
              <strong class="wallet-balance">${this.gameState.coins || 0} <span class="pixel-icon icon-doubloon size-16"></span></strong>
            </div>
          </div>

          <div class="results-actions">
            <button class="results-btn shop-action" id="res-btn-shop">
              <span class="pixel-icon icon-phantom-ghost size-18"></span>
              <span>Visit Ghost Salesman Stall</span>
            </button>
            <button class="results-btn dock-action" id="res-btn-dock">
              <span class="pixel-icon icon-harbor-flag size-18"></span>
              <span>Return to Dock</span>
            </button>
            <button class="results-btn shipyard-action" id="res-btn-shipyard">
              <span class="pixel-icon icon-hammer size-18"></span>
              <span>Shipyard &amp; Repairs</span>
            </button>
            <button class="results-btn next-action" id="res-btn-next">
              <span class="pixel-icon icon-sloop size-18"></span>
              <span>Next Voyage (Day ${Math.min(7, day + 1)})</span>
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

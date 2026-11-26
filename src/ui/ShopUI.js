import { emit, on, off } from '../core/EventBus.js';
import { SHOP_CATALOG, ItemType, ShopRegistry } from '../config/ShopRegistry.js';

/**
 * ShopUI — Interactive storefront modal for "Deadly Business",
 * manned by the ghostly figure on the dockscene island.
 */
export class ShopUI {
  constructor(gameState) {
    this.gameState = gameState;
    this.root = null;
    this.activeTab = ItemType.WHEEL;
    this._isOpen = false;

    this._onOpenShop = () => this.open();
    this._onCloseShop = () => this.close();
    this._onEconomyUpdated = () => this._refresh();

    on('openShopUI', this._onOpenShop);
    on('closeShopUI', this._onCloseShop);
    on('economyUpdated', this._onEconomyUpdated);
  }

  get isOpen() {
    return this._isOpen;
  }

  open() {
    if (this.root) this.close();
    this._isOpen = true;

    if (typeof document !== 'undefined' && document.exitPointerLock && (document.pointerLockElement || document.webkitPointerLockElement)) {
      try {
        document.exitPointerLock();
      } catch (_) {}
    }

    this.root = document.createElement('div');
    this.root.id = 'deadly-business-modal';
    this.root.className = 'shop-modal-backdrop';

    this.root.innerHTML = `
      <div class="shop-modal-container">
        <!-- Header with Ghost Banner & Coin Counter -->
        <div class="shop-modal-header">
          <div class="shop-header-title-box">
            <div class="shop-ghost-badge">
              <span class="pixel-icon icon-phantom-ghost size-32"></span>
            </div>
            <div>
              <h2 class="shop-title">DEADLY BUSINESS</h2>
              <div class="shop-subtitle">"Ghost has wares if sailor has coin"</div>
            </div>
          </div>
          <div class="shop-header-right">
            <div class="shop-wallet-pill ${(this.gameState.coins || 0) < 0 ? 'debt' : ''}">
              <span class="pixel-icon icon-doubloon size-18"></span>
              <span class="shop-wallet-coins ${(this.gameState.coins || 0) < 0 ? 'debt' : ''}" id="shop-coin-display">${(this.gameState.coins || 0) < 0 ? `-${Math.abs(this.gameState.coins || 0)}` : (this.gameState.coins || 0)}</span>
              <span class="shop-wallet-label">${(this.gameState.coins || 0) < 0 ? 'Doubloons (IN DEBT)' : 'Doubloons'}</span>
            </div>
            <button class="shop-close-btn" id="shop-btn-close" title="Close Stall (Esc)">
              <span class="pixel-icon icon-close-cross size-16"></span>
            </button>
          </div>
        </div>

        <!-- Tutorial Guide Strip -->
        <div class="shop-tutorial-guide">
          <span class="pixel-icon icon-scroll size-16"></span>
          <span><strong>Phantom Outfitter:</strong> Spend voyage Doubloons to purchase permanent nautical enhancements. Click <strong>Equip</strong> on any owned piece to outfit your active ship!</span>
        </div>

        <!-- Category Navigation Tabs -->
        <div class="shop-tabs-row">
          <button class="shop-tab-btn ${this.activeTab === ItemType.WHEEL ? 'active' : ''}" data-tab="${ItemType.WHEEL}">
            <span class="pixel-icon icon-helm-wheel size-18"></span>
            <span>Ship's Wheels</span>
          </button>
          <button class="shop-tab-btn ${this.activeTab === ItemType.PEDESTAL ? 'active' : ''}" data-tab="${ItemType.PEDESTAL}">
            <span class="pixel-icon icon-helm-pedestal size-18"></span>
            <span>Helmsman Pedestals</span>
          </button>
          <button class="shop-tab-btn ${this.activeTab === ItemType.LANTERN ? 'active' : ''}" data-tab="${ItemType.LANTERN}">
            <span class="pixel-icon icon-ship-lantern size-18"></span>
            <span>Bow Lanterns</span>
          </button>
        </div>

        <!-- Item Cards Grid -->
        <div class="shop-catalog-grid" id="shop-items-grid">
          <!-- Rendered dynamically -->
        </div>

        <!-- Footer / Hint Bar -->
        <div class="shop-modal-footer">
          <div class="shop-footer-hint">
            <span class="pixel-icon icon-idea-bulb size-16 hint-bulb"></span>
            <span class="hint-tag">TIP:</span> Wheels enhance rudder agility &amp; siren resistance. Pedestals multiply doubloons on QTEs &amp; voyages. Lanterns illuminate fog &amp; waters.
          </div>
        </div>
      </div>
    `;

    // Event listeners
    this.root.querySelector('#shop-btn-close').onclick = () => this.close();
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });

    const tabButtons = this.root.querySelectorAll('.shop-tab-btn');
    tabButtons.forEach(btn => {
      btn.onclick = () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeTab = btn.getAttribute('data-tab');
        this._renderItems();
      };
    });

    this._boundKeyDown = (e) => {
      if (e.key === 'Escape' && this._isOpen) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.close();
      }
    };
    window.addEventListener('keydown', this._boundKeyDown, true);

    const uiRoot = document.getElementById('ui-root') || document.body;
    uiRoot.appendChild(this.root);

    this._renderItems();
    emit('playSound', { sound: 'qte_success' });
  }

  close() {
    if (!this._isOpen) return;
    this._isOpen = false;
    if (this._boundKeyDown) {
      window.removeEventListener('keydown', this._boundKeyDown, true);
      this._boundKeyDown = null;
    }
    if (this.root && this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
    this.root = null;
  }

  _refresh() {
    if (!this._isOpen || !this.root) return;
    const coinDisplay = this.root.querySelector('#shop-coin-display');
    const pill = this.root.querySelector('.shop-wallet-pill');
    const label = this.root.querySelector('.shop-wallet-label');
    const coins = this.gameState.coins ?? 0;
    const isDebt = coins < 0;

    if (coinDisplay) {
      coinDisplay.textContent = isDebt ? `-${Math.abs(coins)}` : coins;
      if (isDebt) coinDisplay.classList.add('debt');
      else coinDisplay.classList.remove('debt');
    }
    if (pill) {
      if (isDebt) pill.classList.add('debt');
      else pill.classList.remove('debt');
    }
    if (label) {
      label.textContent = isDebt ? 'Doubloons (IN DEBT)' : 'Doubloons';
    }
    this._renderItems();
  }

  _renderItems() {
    const grid = this.root?.querySelector('#shop-items-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const items = SHOP_CATALOG[this.activeTab] || [];
    const owned = this.gameState.inventory || [];
    const equipped = this.gameState.equippedItems || {};
    const coins = this.gameState.coins ?? 0;
    const isDebt = coins < 0;

    items.forEach(item => {
      const isOwned = owned.includes(item.id);
      const isEquipped = equipped[this.activeTab] === item.id;
      const canAfford = !isDebt && coins >= item.cost;

      const card = document.createElement('div');
      card.className = `shop-item-card ${isEquipped ? 'equipped' : ''} ${isOwned ? 'owned' : ''}`;

      // Build stat highlights string
      let statBadges = '';
      if (this.activeTab === ItemType.WHEEL) {
        statBadges = `
          <div class="shop-stat-row">
            <span class="stat-name">Turn Agility</span>
            <span class="stat-val">+${Math.round((item.stats.turnAccel - 2.0) * 100 / 2.0)}%</span>
          </div>
          <div class="shop-stat-row">
            <span class="stat-name">Siren Guard</span>
            <span class="stat-val">${Math.round((item.stats.sirenResistance || 0) * 100)}%</span>
          </div>
        `;
      } else if (this.activeTab === ItemType.PEDESTAL) {
        statBadges = `
          <div class="shop-stat-row">
            <span class="stat-name">Coin Multiplier</span>
            <span class="stat-val highlight-gold">${item.stats.coinMultiplier}x Bounty</span>
          </div>
        `;
      } else if (this.activeTab === ItemType.LANTERN) {
        statBadges = `
          <div class="shop-stat-row">
            <span class="stat-name">Light Radius</span>
            <span class="stat-val highlight-cyan">${item.stats.lightDistance}m</span>
          </div>
          <div class="shop-stat-row">
            <span class="stat-name">Fog Pierce</span>
            <span class="stat-val highlight-cyan">${item.stats.fogCutDistance}m</span>
          </div>
        `;
      }

      // Action button state
      let btnHtml = '';
      if (isEquipped) {
        btnHtml = `<button class="shop-action-btn equipped-btn" disabled><span class="pixel-icon icon-confirm-check size-16"></span> EQUIPPED</button>`;
      } else if (isOwned) {
        btnHtml = `<button class="shop-action-btn equip-btn" data-action="equip" data-id="${item.id}"><span class="pixel-icon icon-anchor size-16"></span> EQUIP</button>`;
      } else if (isDebt) {
        btnHtml = `<button class="shop-action-btn locked-btn debt" disabled><span class="pixel-icon icon-lock-padlock size-14"></span> LOCKED (IN PORT DEBT)</button>`;
      } else if (canAfford) {
        btnHtml = `<button class="shop-action-btn buy-btn" data-action="buy" data-id="${item.id}"><span class="pixel-icon icon-doubloon size-16"></span> ${item.cost} DOUBLOONS</button>`;
      } else {
        const diff = item.cost - coins;
        btnHtml = `<button class="shop-action-btn locked-btn" disabled><span class="pixel-icon icon-lock-padlock size-14"></span> <span class="pixel-icon icon-doubloon size-14"></span> ${item.cost} (Need ${diff})</button>`;
      }

      card.innerHTML = `
        <div class="shop-card-tier-badge">Tier ${item.tier === 0 ? 'Starter' : item.tier}</div>
        <div class="shop-card-preview-box">
          <img src="${item.icon}" alt="${item.name}" class="shop-card-img" />
        </div>
        <div class="shop-card-info">
          <div class="shop-card-name">${item.name}</div>
          <div class="shop-card-desc">${item.desc}</div>
          <div class="shop-card-stats">${statBadges}</div>
        </div>
        <div class="shop-card-action">
          ${btnHtml}
        </div>
      `;

      // Button click actions
      const buyBtn = card.querySelector('button[data-action="buy"]');
      if (buyBtn) {
        buyBtn.onclick = () => {
          this.gameState.buyItem(item.id);
        };
      }
      const equipBtn = card.querySelector('button[data-action="equip"]');
      if (equipBtn) {
        equipBtn.onclick = () => {
          this.gameState.equipItem(item.id);
        };
      }

      grid.appendChild(card);
    });
  }

  dispose() {
    this.close();
    off('openShopUI', this._onOpenShop);
    off('closeShopUI', this._onCloseShop);
    off('economyUpdated', this._onEconomyUpdated);
  }
}

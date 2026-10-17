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

    this.root = document.createElement('div');
    this.root.id = 'deadly-business-modal';
    this.root.className = 'shop-modal-backdrop';

    this.root.innerHTML = `
      <div class="shop-modal-container">
        <!-- Header with Ghost Banner & Coin Counter -->
        <div class="shop-modal-header">
          <div class="shop-header-title-box">
            <div class="shop-ghost-badge">👻</div>
            <div>
              <h2 class="shop-title">DEADLY BUSINESS</h2>
              <div class="shop-subtitle">"Ghost has wares if sailor has coin"</div>
            </div>
          </div>
          <div class="shop-header-right">
            <div class="shop-wallet-pill">
              <span class="shop-wallet-icon">🪙</span>
              <span class="shop-wallet-coins" id="shop-coin-display">${this.gameState.coins || 0}</span>
              <span class="shop-wallet-label">Doubloons</span>
            </div>
            <button class="shop-close-btn" id="shop-btn-close" title="Close Stall (Esc)">&times;</button>
          </div>
        </div>

        <!-- Category Navigation Tabs -->
        <div class="shop-tabs-row">
          <button class="shop-tab-btn ${this.activeTab === ItemType.WHEEL ? 'active' : ''}" data-tab="${ItemType.WHEEL}">
            ☸️ Ship's Wheels
          </button>
          <button class="shop-tab-btn ${this.activeTab === ItemType.PEDESTAL ? 'active' : ''}" data-tab="${ItemType.PEDESTAL}">
            🏛️ Helmsman Pedestals
          </button>
          <button class="shop-tab-btn ${this.activeTab === ItemType.LANTERN ? 'active' : ''}" data-tab="${ItemType.LANTERN}">
            🏮 Bow Lanterns
          </button>
        </div>

        <!-- Item Cards Grid -->
        <div class="shop-catalog-grid" id="shop-items-grid">
          <!-- Rendered dynamically -->
        </div>

        <!-- Footer / Hint Bar -->
        <div class="shop-modal-footer">
          <div class="shop-footer-hint">
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
        this.close();
      }
    };
    window.addEventListener('keydown', this._boundKeyDown);

    const uiRoot = document.getElementById('ui-root') || document.body;
    uiRoot.appendChild(this.root);

    this._renderItems();
    emit('playSound', { sound: 'qte_success' });
  }

  close() {
    if (!this._isOpen) return;
    this._isOpen = false;
    if (this._boundKeyDown) {
      window.removeEventListener('keydown', this._boundKeyDown);
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
    if (coinDisplay) {
      coinDisplay.textContent = this.gameState.coins || 0;
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

    items.forEach(item => {
      const isOwned = owned.includes(item.id);
      const isEquipped = equipped[this.activeTab] === item.id;
      const canAfford = (this.gameState.coins || 0) >= item.cost;

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
        btnHtml = `<button class="shop-action-btn equipped-btn" disabled>✅ Equipped</button>`;
      } else if (isOwned) {
        btnHtml = `<button class="shop-action-btn equip-btn" data-action="equip" data-id="${item.id}">⚓ Equip</button>`;
      } else if (canAfford) {
        btnHtml = `<button class="shop-action-btn buy-btn" data-action="buy" data-id="${item.id}">🪙 ${item.cost} Doubloons</button>`;
      } else {
        btnHtml = `<button class="shop-action-btn locked-btn" disabled>🔒 🪙 ${item.cost} (Need ${item.cost - (this.gameState.coins || 0)} more)</button>`;
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

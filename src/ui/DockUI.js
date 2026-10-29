import { on, off, emit } from '../core/EventBus.js';
import * as THREE from 'three';
import { exportToGLB } from '../utils/exportGLTF.js';
import { GameEnv } from '../core/GameEnv.js';

export class DockUI {
  constructor() {
    this.root = null;
    this.gameState = null;
    this.dockStall = null;

    on('uiMount', d => {
      if (d.screen === 'dock') this.mount(d.gameState, d.dockStall);
    });
    on('uiUnmount', d => {
      if (d.screen === 'dock') this.unmount();
    });
  }

  mount(gameState, dockStall) {
    if (this.root) this.unmount();
    this.gameState = gameState;
    this.dockStall = dockStall;

    this.root = document.createElement('div');
    this.root.className = 'dock-ui';
    this.root.style.cssText = `position:absolute; top:10px; left:50%; transform:translateX(-50%); display:${GameEnv.isDev() ? 'flex' : 'none'}; flex-direction: column; gap:10px; z-index:90; pointer-events: none !important;`;

    const dayButtons = document.createElement('div');
    dayButtons.style.cssText = 'display:flex; gap:6px; pointer-events: auto !important; justify-content: center;';
    for (let i = 1; i <= 7; i++) {
      const btn = document.createElement('button');
      btn.innerText = `Day ${i}`;
      btn.style.cssText = 'padding:6px 12px; cursor:pointer; background:#1b120a; color:#ffd700; border:2px solid #8c6507; border-radius:0; font-family:\'Cinzel\', serif; font-size:11px; font-weight:700; box-shadow:0 3px 6px #000, inset 1px 1px 0 rgba(255,220,120,0.2); transition:all 0.15s ease;';
      btn.onmouseenter = () => btn.style.borderColor = '#ffd700';
      btn.onmouseleave = () => btn.style.borderColor = '#8c6507';
      btn.onclick = async () => {
        this.gameState.day = i;
        await this.gameState._weather.loadLevel(i, {
          ambient: this.gameState._ambient,
          sun: this.gameState._sun,
          ocean: this.gameState._ocean,
          sky: this.gameState._sky,
          lanternLight: this.dockStall.lanternLight,
          scene: this.gameState._scene
        });
      };
      dayButtons.appendChild(btn);
    }
    this.root.appendChild(dayButtons);

    const actionsRow = document.createElement('div');
    actionsRow.style.cssText = 'display:flex; gap:8px; pointer-events: auto !important; justify-content: center; flex-wrap: wrap; align-self: center;';

    const camBtn = document.createElement('button');
    camBtn.innerText = 'Toggle Shopkeeper View';
    camBtn.style.cssText = 'padding:7px 14px; cursor:pointer; background:#1b120a; color:#f3e3b4; border:2px solid #6b4c24; border-radius:0; font-family:\'Cinzel\', serif; font-size:11px; font-weight:700; box-shadow:0 3px 6px #000; transition:all 0.15s ease;';
    
    const updateBtnText = (mode) => {
      if (mode === 'shop') {
        camBtn.innerText = 'Toggle World View (Outside)';
        camBtn.style.background = '#2e1c0e';
        camBtn.style.borderColor = '#ffd700';
      } else {
        camBtn.innerText = 'Toggle Shopkeeper View';
        camBtn.style.background = '#1b120a';
        camBtn.style.borderColor = '#6b4c24';
      }
    };

    camBtn.onclick = () => {
      if (this.gameState._dockPlayerController) {
        this.gameState._dockPlayerController.toggleShop();
        updateBtnText(this.gameState._dockPlayerController.mode);
      } else {
        // Fallback if player controller not loaded
        this.gameState.activeCamera = null;
        this.gameState._camera.position.set(0, 5, 20);
        this.gameState._camera.lookAt(0, 2, 0);
      }
    };
    actionsRow.appendChild(camBtn);

    const exportShopBtn = document.createElement('button');
    exportShopBtn.innerHTML = '<span class="pixel-icon icon-cargo-crate size-16"></span> Export Shop (.glb)';
    exportShopBtn.title = 'Export shop stall building and props to Blender (.glb)';
    exportShopBtn.style.cssText = 'padding:7px 14px; cursor:pointer; background:#142318; color:#86efac; border:2px solid #166534; border-radius:0; font-family:\'Cinzel\', serif; font-size:11px; font-weight:700; box-shadow:0 3px 6px #000; transition: all 0.2s;';
    exportShopBtn.onmouseenter = () => exportShopBtn.style.borderColor = '#4ade80';
    exportShopBtn.onmouseleave = () => exportShopBtn.style.borderColor = '#166534';

    exportShopBtn.onclick = async () => {
      exportShopBtn.disabled = true;
      exportShopBtn.innerHTML = '<span class="pixel-icon icon-compass size-16"></span> Exporting...';
      try {
        const target = this.dockStall?.shopGroup || this.dockStall?.group;
        await exportToGLB(target, 'shop_stall.glb');
        exportShopBtn.innerHTML = '<span class="pixel-icon icon-confirm-check size-16"></span> Downloaded!';
      } catch (err) {
        console.error('Failed to export shop:', err);
        exportShopBtn.innerHTML = '<span class="pixel-icon icon-cancel-cross size-16"></span> Failed';
      } finally {
        setTimeout(() => {
          exportShopBtn.disabled = false;
          exportShopBtn.innerHTML = '<span class="pixel-icon icon-cargo-crate size-16"></span> Export Shop (.glb)';
        }, 2500);
      }
    };
    actionsRow.appendChild(exportShopBtn);

    const exportDockBtn = document.createElement('button');
    exportDockBtn.innerHTML = '<span class="pixel-icon icon-island size-16"></span> Export Full Dock (.glb)';
    exportDockBtn.title = 'Export complete dock, shop stall, island, and pier to Blender (.glb)';
    exportDockBtn.style.cssText = 'padding:10px; cursor:pointer; background:rgba(40,50,70,0.85); color:white; border:1px solid #556688; border-radius:5px; font-family:sans-serif; transition: all 0.2s;';
    exportDockBtn.onmouseenter = () => exportDockBtn.style.background = 'rgba(50,65,90,1)';
    exportDockBtn.onmouseleave = () => exportDockBtn.style.background = 'rgba(40,50,70,0.85)';

    exportDockBtn.onclick = async () => {
      exportDockBtn.disabled = true;
      exportDockBtn.innerHTML = '<span class="pixel-icon icon-compass size-16"></span> Exporting...';
      try {
        const target = this.dockStall?.group;
        await exportToGLB(target, 'dock_full_environment.glb');
        exportDockBtn.innerHTML = '<span class="pixel-icon icon-confirm-check size-16"></span> Downloaded!';
      } catch (err) {
        console.error('Failed to export dock:', err);
        exportDockBtn.innerHTML = '<span class="pixel-icon icon-cancel-cross size-16"></span> Failed';
      } finally {
        setTimeout(() => {
          exportDockBtn.disabled = false;
          exportDockBtn.innerHTML = '<span class="pixel-icon icon-island size-16"></span> Export Full Dock (.glb)';
        }, 2500);
      }
    };
    actionsRow.appendChild(exportDockBtn);

    const repairShipBtn = document.createElement('button');
    const shipName = this.dockStall?.activeShipProfile?.name || 'Vessel';
    repairShipBtn.innerHTML = `<span class="pixel-icon icon-hammer size-16"></span> Repair ${shipName}`;
    repairShipBtn.style.cssText = 'padding:10px; cursor:pointer; background:rgba(154, 91, 46, 0.9); color:white; border:1px solid #d4af37; border-radius:5px; font-family:sans-serif; font-weight:bold; transition: all 0.2s;';
    repairShipBtn.onclick = () => {
      emit('requestPhaseChange', { phase: 'SHIPYARD' });
    };
    actionsRow.appendChild(repairShipBtn);

    const sailBtn = document.createElement('button');
    sailBtn.innerHTML = `<span class="pixel-icon icon-sloop size-16"></span> Set Sail`;
    sailBtn.style.cssText = 'padding:10px; cursor:pointer; background:rgba(46, 125, 50, 0.9); color:white; border:1px solid #66bb6a; border-radius:5px; font-family:sans-serif; font-weight:bold; transition: all 0.2s;';
    sailBtn.onclick = () => {
      emit('startSailing');
    };
    actionsRow.appendChild(sailBtn);

    this.root.appendChild(actionsRow);

    this._onModeChange = ({ mode }) => {
      updateBtnText(mode);
    };
    on('dockPlayerModeChanged', this._onModeChange);

    this._onEnvChange = ({ isDev }) => {
      if (this.root) this.root.style.display = isDev ? 'flex' : 'none';
    };
    this._onLevelSelected = () => {
      const name = this.dockStall?.activeShipProfile?.name || 'Standard Sloop';
      repairShipBtn.innerHTML = `<span class="pixel-icon icon-hammer size-16"></span> Repair ${name}`;
    };
    on('levelSelected', this._onLevelSelected);

    // Top-right Doubloon Purse HUD showing live player funds
    this.doubloonHud = document.createElement('div');
    this.doubloonHud.id = 'dock-doubloon-hud';
    this.doubloonHud.className = 'dock-doubloon-hud';

    const renderCoins = (count) => {
      const coins = typeof count === 'number' ? count : (this.gameState?.coins ?? window.gameState?.coins ?? 0);
      const isDebt = coins < 0;
      this.doubloonHud.innerHTML = `
        <div class="shop-wallet-pill ${isDebt ? 'debt' : ''}" title="Your Active Purse">
          <span class="pixel-icon icon-doubloon size-18"></span>
          <span class="shop-wallet-coins ${isDebt ? 'debt' : ''}" id="dock-coin-display">${isDebt ? `-${Math.abs(coins)}` : coins}</span>
          <span class="shop-wallet-label">${isDebt ? 'Doubloons (IN DEBT)' : 'Doubloons'}</span>
        </div>
      `;
    };
    renderCoins(this.gameState?.coins);

    this._onEconomyUpdated = (d) => {
      if (typeof d?.coins === 'number') {
        renderCoins(d.coins);
      }
    };
    on('economyUpdated', this._onEconomyUpdated);

    const uiRoot = document.getElementById('ui-root');
    if (uiRoot) {
        uiRoot.appendChild(this.root);
        uiRoot.appendChild(this.doubloonHud);
    } else {
        document.body.appendChild(this.root);
        document.body.appendChild(this.doubloonHud);
    }
  }

  unmount() {
    if (this._onEconomyUpdated) {
      off('economyUpdated', this._onEconomyUpdated);
      this._onEconomyUpdated = null;
    }
    if (this.doubloonHud && this.doubloonHud.parentNode) {
      this.doubloonHud.parentNode.removeChild(this.doubloonHud);
    }
    this.doubloonHud = null;
    if (this._onLevelSelected) {
      off('levelSelected', this._onLevelSelected);
      this._onLevelSelected = null;
    }
    if (this._onModeChange) {
      off('dockPlayerModeChanged', this._onModeChange);
      this._onModeChange = null;
    }
    if (this._onEnvChange) {
      off('envModeChanged', this._onEnvChange);
      this._onEnvChange = null;
    }
    if (this.root && this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
    this.root = null;
    this.gameState = null;
    this.dockStall = null;
  }
}

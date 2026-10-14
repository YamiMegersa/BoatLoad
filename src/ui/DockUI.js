import { on, off } from '../core/EventBus.js';
import * as THREE from 'three';

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
    this.root.style.cssText = 'position:absolute; top:10px; left:50%; transform:translateX(-50%); display:flex; flex-direction: column; gap:10px; z-index:90; pointer-events: none !important;';

    const dayButtons = document.createElement('div');
    dayButtons.style.cssText = 'display:flex; gap:10px; pointer-events: auto !important; justify-content: center;';
    for (let i = 1; i <= 7; i++) {
      const btn = document.createElement('button');
      btn.innerText = `Day ${i}`;
      btn.style.cssText = 'padding:10px; cursor:pointer; background:rgba(0,0,0,0.7); color:white; border:none; border-radius:5px; font-family:sans-serif;';
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

    const camBtn = document.createElement('button');
    camBtn.innerText = 'Toggle Shopkeeper View';
    camBtn.style.cssText = 'pointer-events: auto !important; padding:10px; cursor:pointer; background:rgba(0,0,0,0.7); color:white; border:none; border-radius:5px; font-family:sans-serif; align-self: center; transition: background 0.2s;';
    
    const updateBtnText = (mode) => {
      if (mode === 'shop') {
        camBtn.innerText = 'Toggle World View (Outside)';
        camBtn.style.background = 'rgba(70, 50, 30, 0.9)';
      } else {
        camBtn.innerText = 'Toggle Shopkeeper View';
        camBtn.style.background = 'rgba(0, 0, 0, 0.7)';
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
    this.root.appendChild(camBtn);

    this._onModeChange = ({ mode }) => {
      updateBtnText(mode);
    };
    on('dockPlayerModeChanged', this._onModeChange);

    const uiRoot = document.getElementById('ui-root');
    if (uiRoot) {
        uiRoot.appendChild(this.root);
    } else {
        document.body.appendChild(this.root);
    }
  }

  unmount() {
    if (this._onModeChange) {
      off('dockPlayerModeChanged', this._onModeChange);
      this._onModeChange = null;
    }
    if (this.root && this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
    this.root = null;
    this.gameState = null;
    this.dockStall = null;
  }
}

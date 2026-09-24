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
    this.root.style.cssText = 'position:absolute; top:10px; left:50%; transform:translateX(-50%); display:flex; flex-direction: column; gap:10px; z-index:90; pointer-events: none;';

    const dayButtons = document.createElement('div');
    dayButtons.style.cssText = 'display:flex; gap:10px; pointer-events: auto; justify-content: center;';
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
    camBtn.style.cssText = 'pointer-events: auto; padding:10px; cursor:pointer; background:rgba(0,0,0,0.7); color:white; border:none; border-radius:5px; font-family:sans-serif; align-self: center;';
    let isShopCam = false;
    camBtn.onclick = () => {
      isShopCam = !isShopCam;
      if (isShopCam) {
        this.gameState.activeCamera = null;
        this.dockStall.group.updateMatrixWorld(true);
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        this.dockStall.shopCam.matrixWorld.decompose(pos, quat, scale);

        this.gameState._camera.position.copy(pos);
        this.gameState._camera.quaternion.copy(quat);

        if (this.gameState._dockOrbitControls) {
          const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
          this.gameState._dockOrbitControls.target.copy(pos).add(forward.multiplyScalar(0.01));
          this.gameState._dockOrbitControls.enableZoom = false;
          this.gameState._dockOrbitControls.enablePan = false;
          this.gameState._dockOrbitControls.update();
        }
      } else {
        this.gameState.activeCamera = null;
        // reset main camera
        this.gameState._camera.position.set(0, 5, 20);
        this.gameState._camera.lookAt(0, 2, 0);
        if (this.gameState._dockOrbitControls) {
          this.gameState._dockOrbitControls.target.set(0, 2, 0);
          this.gameState._dockOrbitControls.enableZoom = true;
          this.gameState._dockOrbitControls.enablePan = true;
          this.gameState._dockOrbitControls.update();
        }
      }
    };
    this.root.appendChild(camBtn);

    const uiRoot = document.getElementById('ui-root');
    if (uiRoot) {
        uiRoot.appendChild(this.root);
    } else {
        document.body.appendChild(this.root);
    }
  }

  unmount() {
    if (this.root && this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
    this.root = null;
    this.gameState = null;
    this.dockStall = null;
  }
}

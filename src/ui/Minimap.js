import { on } from '../core/EventBus.js';

export class Minimap {
  constructor() {
    this._el = document.createElement('div');
    this._el.id = 'minimap';
    this._el.innerHTML = `
      <div class="minimap-bg"></div>
      <div id="minimap-content"></div>
      <div id="minimap-wind-arrow"></div>
      <div class="minimap-kill-radius"></div>
    `;

    this._content = this._el.querySelector('#minimap-content');
    this._windArrow = this._el.querySelector('#minimap-wind-arrow');
    
    // Scale: radius of 200 units maps to 100px (half of 200px minimap)
    this._scale = 100 / 220; // Fit kill-radius slightly inside or at edge

    on('uiMount', d => { if (d.screen === 'obstacle') this.mount(document.getElementById('ui-root')); });
    on('uiUnmount', d => { if (d.screen === 'obstacle') this.unmount(); });
  }

  mount(parent) {
    if (parent) parent.appendChild(this._el);
  }

  unmount() {
    this._el.remove();
  }

  /**
   * @param {THREE.Vector3} playerPos 
   * @param {number} playerYaw 
   * @param {Array} obstacles 
   * @param {THREE.Vector3} windDir
   */
  update(playerPos, playerYaw, obstacles, windDir) {
    if (!this._el.parentNode) return;

    // Clear old dots (in a real game, object pooling is better)
    this._content.innerHTML = '';

    // Draw player (center)
    const playerDot = document.createElement('div');
    playerDot.className = 'minimap-dot player';
    // Map center is 100px, 100px
    playerDot.style.left = '100px';
    playerDot.style.top = '100px';
    // Rotate player dot to match yaw (convert from radians)
    playerDot.style.transform = `translate(-50%, -50%) rotate(${-playerYaw}rad)`;
    this._content.appendChild(playerDot);

    // Update wind arrow direction
    if (windDir) {
      const windAngle = Math.atan2(windDir.x, windDir.z); 
      this._windArrow.style.transform = `translate(-50%, -50%) rotate(${windAngle}rad)`;
    }

    // Draw obstacles
    if (obstacles) {
      for (const obs of obstacles) {
        if (!obs.active) continue;
        
        const dx = obs.mesh.position.x - playerPos.x;
        const dz = obs.mesh.position.z - playerPos.z;
        
        const dist = Math.hypot(dx, dz);
        if (dist * this._scale > 100) continue; // Out of minimap bounds

        const dot = document.createElement('div');
        dot.className = `minimap-dot obs-${obs.type}`;
        
        const mapX = 100 + (dx * this._scale);
        const mapY = 100 + (dz * this._scale); // Z maps to Y
        
        dot.style.left = `${mapX}px`;
        dot.style.top = `${mapY}px`;
        
        this._content.appendChild(dot);
      }
    }
  }
}

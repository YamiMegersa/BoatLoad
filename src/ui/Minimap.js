import { on } from '../core/EventBus.js';

export class Minimap {
  constructor() {
    this._el = document.createElement('div');
    this._el.id = 'minimap';
    this._el.innerHTML = `
      <div class="minimap-bg"></div>
      <div id="minimap-content"><canvas id="minimap-canvas" width="200" height="200" style="position: absolute; inset: 0; pointer-events: none; z-index: 2;"></canvas></div>
      <div id="minimap-wind-arrow"></div>
      <div class="minimap-kill-radius"></div>
    `;

    this._canvas = this._el.querySelector('#minimap-canvas');
    this._ctx = this._canvas?.getContext('2d');
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
    if (!this._el.parentNode || !this._ctx) return;
    const ctx = this._ctx;

    // Fast clear without DOM reflow
    ctx.clearRect(0, 0, 200, 200);

    // Update wind arrow direction
    if (windDir && this._windArrow) {
      const windAngle = Math.atan2(windDir.x, windDir.z); 
      this._windArrow.style.transform = `translate(-50%, -50%) rotate(${windAngle}rad)`;
    }

    // Draw obstacles onto canvas in batch
    if (obstacles) {
      for (let i = 0; i < obstacles.length; i++) {
        const obs = obstacles[i];
        if (!obs || !obs.active || !obs.mesh) continue;
        
        const dx = obs.mesh.position.x - playerPos.x;
        const dz = obs.mesh.position.z - playerPos.z;
        
        const dist = Math.hypot(dx, dz);
        if (dist * this._scale > 98) continue; // Out of minimap bounds

        const mapX = 100 + (dx * this._scale);
        const mapY = 100 + (dz * this._scale); // Z maps to Y

        if (obs.type === 'pickup') {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(mapX, mapY, 3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Black cross matching .minimap-dot styling
          ctx.fillStyle = '#000000';
          ctx.fillRect(mapX - 4, mapY - 1, 8, 2);
          ctx.fillRect(mapX - 1, mapY - 4, 2, 8);
        }
      }
    }

    // Draw player arrow in the center (100, 100) rotated by -playerYaw
    ctx.save();
    ctx.translate(100, 100);
    ctx.rotate(-playerYaw);

    ctx.fillStyle = '#00ff00';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}

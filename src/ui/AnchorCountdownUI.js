import { emit, on, off } from '../core/EventBus.js';

/**
 * AnchorCountdownUI — Displays an animated pixel-art anchor being reeled up from
 * the ocean prior to sailing. Sets the countdown (3.. 2.. 1.. Set Sail!) and prevents
 * sudden abrupt starts by giving the voyage an authentic casting-off sequence.
 */
export class AnchorCountdownUI {
  constructor() {
    this._root = null;
    this._canvas = null;
    this._ctx = null;
    this._animFrameId = null;
    this._startTime = 0;
    this._pausedTime = 0;
    this._pauseStart = 0;
    this._isPaused = false;
    this._duration = 3.0; // seconds
    this._onComplete = null;
    this._lastCount = -1;
    this._lastTickTime = 0;
    this._completed = false;
    this._particles = [];

    this._onStartCountdown = (opts) => this.start(opts);
    this._onCancelCountdown = () => this.cancel();
    this._onPause = ({ paused }) => {
      this._isPaused = paused;
      if (paused) {
        this._pauseStart = performance.now();
      } else if (this._pauseStart > 0) {
        this._pausedTime += performance.now() - this._pauseStart;
        this._pauseStart = 0;
      }
    };
    this._onKeyDown = (e) => {
      if ((e.code === 'Space' || e.code === 'Enter') && this._root && !this._completed) {
        e.preventDefault();
        this.skip();
      }
    };

    on('startAnchorCountdown', this._onStartCountdown);
    on('cancelAnchorCountdown', this._onCancelCountdown);
    on('gamePaused', this._onPause);
    window.addEventListener('keydown', this._onKeyDown);
  }

  start({ duration = 3.0, onComplete } = {}) {
    this.cancel();

    this._duration = duration;
    this._onComplete = onComplete;
    this._startTime = performance.now();
    this._pausedTime = 0;
    this._pauseStart = 0;
    this._isPaused = false;
    this._lastCount = -1;
    this._lastTickTime = 0;
    this._completed = false;
    this._particles = [];

    this._buildDOM();
    this._loop();
  }

  cancel() {
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
    if (this._root) {
      this._root.remove();
      this._root = null;
    }
    this._completed = true;
  }

  skip() {
    if (this._completed) return;
    this._completed = true;
    emit('playSound', { sound: 'anchor_lock' });
    this._updateBadge('GO', 'SET SAIL! ⛵', '#00ff88');

    if (this._onComplete) {
      const cb = this._onComplete;
      this._onComplete = null;
      cb();
    }

    if (this._root) {
      this._root.classList.add('fade-out');
      setTimeout(() => this.cancel(), 500);
    }
  }

  _buildDOM() {
    const uiRoot = document.getElementById('ui-root') || document.body;

    const overlay = document.createElement('div');
    overlay.id = 'anchor-countdown-overlay';
    overlay.className = 'anchor-countdown-overlay';
    overlay.innerHTML = `
      <div class="anchor-countdown-box">
        <div class="anchor-winch-header">
          <span class="anchor-winch-bracket">✦</span>
          <span class="anchor-winch-title">CASTING OFF</span>
          <span class="anchor-winch-bracket">✦</span>
        </div>
        <div class="anchor-canvas-wrap">
          <canvas id="anchor-canvas" class="anchor-canvas"></canvas>
        </div>
        <div class="anchor-countdown-info">
          <div class="anchor-countdown-num" id="anchor-countdown-num">3</div>
          <div class="anchor-countdown-status" id="anchor-countdown-status">WEIGHING ANCHOR...</div>
        </div>
        <div class="anchor-countdown-skip">Click or press [SPACE] to skip</div>
      </div>
    `;

    overlay.onclick = () => this.skip();

    uiRoot.appendChild(overlay);
    this._root = overlay;

    const canvas = overlay.querySelector('#anchor-canvas');
    this._canvas = canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = 240;
    const h = 260;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    this._ctx = canvas.getContext('2d');
    this._ctx.scale(dpr, dpr);
  }

  _updateBadge(numText, statusText, color) {
    if (!this._root) return;
    const numEl = this._root.querySelector('#anchor-countdown-num');
    const statusEl = this._root.querySelector('#anchor-countdown-status');
    if (numEl) {
      numEl.innerText = numText;
      numEl.style.color = color;
      numEl.style.textShadow = `0 0 20px ${color}, 2px 2px 0 #111`;
      numEl.classList.remove('pop-anim');
      // Trigger reflow to restart css animation
      void numEl.offsetWidth;
      numEl.classList.add('pop-anim');
    }
    if (statusEl) {
      statusEl.innerText = statusText;
    }
  }

  _loop() {
    if (!this._root) return;

    this._animFrameId = requestAnimationFrame(() => this._loop());

    if (this._isPaused) return;

    const now = performance.now();
    const elapsed = (now - this._startTime - this._pausedTime) / 1000;
    const progress = Math.min(1.0, elapsed / this._duration);

    // Discrete counts: 3 (0-1s), 2 (1-2s), 1 (2-3s), GO (>= 3s)
    let currentCount = 3;
    let label = 'WEIGHING ANCHOR...';
    let color = '#ffd700';

    if (elapsed < 1.0) {
      currentCount = 3;
      label = 'WEIGHING ANCHOR...';
      color = '#ffd700';
    } else if (elapsed < 2.0) {
      currentCount = 2;
      label = 'HEAVE HO!';
      color = '#ffb74d';
    } else if (elapsed < 3.0) {
      currentCount = 1;
      label = 'ANCHOR AWEIGH!';
      color = '#81c784';
    } else {
      currentCount = 0;
      label = 'SET SAIL! ⛵';
      color = '#00ff88';
    }

    if (currentCount !== this._lastCount) {
      this._lastCount = currentCount;
      if (currentCount > 0) {
        emit('playSound', { sound: 'anchor_reel' });
        this._updateBadge(currentCount.toString(), label, color);
      } else {
        // Countdown reached zero: weigh anchor!
        this._updateBadge('GO', label, color);
        emit('playSound', { sound: 'anchor_lock' });
        if (this._onComplete) {
          const cb = this._onComplete;
          this._onComplete = null;
          cb();
        }
      }
    }

    // Play periodic ratchet tick every 0.22s while reeling
    if (elapsed < 3.0 && now - this._lastTickTime > 220) {
      this._lastTickTime = now;
      emit('playSound', { sound: 'anchor_reel' });
    }

    // Spawn water droplets / bubbles when anchor is rising
    if (elapsed > 0.5 && elapsed < 2.4 && Math.random() < 0.45) {
      this._particles.push({
        x: 120 + (Math.random() - 0.5) * 44,
        y: 168 + (Math.random() - 0.5) * 8,
        vx: (Math.random() - 0.5) * 1.5,
        vy: -0.8 - Math.random() * 1.8,
        size: 2 + Math.random() * 2.5,
        life: 1.0,
        decay: 0.035 + Math.random() * 0.02
      });
    }

    // Render Canvas Anchor
    this._renderCanvas(progress, elapsed);

    // End countdown cleanly
    if (elapsed >= this._duration + 0.6 && !this._completed) {
      this._completed = true;
      if (this._root) {
        this._root.classList.add('fade-out');
        setTimeout(() => this.cancel(), 500);
      }
    }
  }

  _renderCanvas(progress, elapsed) {
    const ctx = this._ctx;
    if (!ctx) return;

    ctx.clearRect(0, 0, 240, 260);

    const waterY = 175;
    // Anchor starts deep (Y = 165), finishes reeled up at hawsehole (Y = 55)
    // Ease out smooth curve
    const ease = progress < 1 ? Math.sin((progress * Math.PI) / 2) : 1;
    const anchorY = 175 - ease * 122;

    // 1. Top Hawsehole / Winding Capstan Housing
    ctx.save();
    // Dark timber beam
    ctx.fillStyle = '#2e1d10';
    ctx.fillRect(80, 10, 80, 12);
    ctx.fillStyle = '#514438';
    ctx.fillRect(80, 22, 80, 4);

    // Brass winch axle
    ctx.fillStyle = '#c8a44b';
    ctx.fillRect(108, 14, 24, 18);
    // Rotating winch wheel spokes (animated)
    const spokeAngle = elapsed * 10;
    ctx.save();
    ctx.translate(120, 23);
    ctx.rotate(spokeAngle);
    ctx.strokeStyle = '#8a6e2e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-10, 0); ctx.lineTo(10, 0);
    ctx.moveTo(0, -10); ctx.lineTo(0, 10);
    ctx.stroke();
    ctx.restore();
    ctx.restore();

    // 2. Heavy Iron Chain
    ctx.save();
    const chainTopY = 24;
    const chainBottomY = anchorY - 14;
    const linkH = 10;
    const linkW = 6;
    const chainOffset = (elapsed * 32) % linkH;

    for (let y = chainTopY - (linkH - chainOffset); y <= chainBottomY; y += linkH) {
      if (y < chainTopY) continue;
      // Alternating vertical & edge-on oval links
      const isAlt = Math.floor((y - chainTopY + chainOffset) / linkH) % 2 === 0;
      ctx.strokeStyle = isAlt ? '#484f59' : '#737d8c';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      if (isAlt) {
        ctx.ellipse(120, y + linkH / 2, linkW / 2, linkH / 2 - 1, 0, 0, Math.PI * 2);
      } else {
        ctx.ellipse(120, y + linkH / 2, linkW / 3, linkH / 2 - 1, 0, 0, Math.PI * 2);
      }
      ctx.stroke();
    }
    ctx.restore();

    // 3. Forged Iron Anchor Sprite
    ctx.save();
    ctx.translate(120, anchorY);

    // Subtle bobbing and sway while hanging
    const sway = Math.sin(elapsed * 4.5) * 0.05 * (1.0 - progress * 0.7);
    ctx.rotate(sway);

    // Shackle ring atop shank
    ctx.strokeStyle = '#7d8794';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -12, 7, 0, Math.PI * 2);
    ctx.stroke();

    // Stock (Horizontal crossbar)
    ctx.fillStyle = '#45311c'; // Sturdy oak
    ctx.fillRect(-26, -5, 52, 6);
    // Brass end caps on stock
    ctx.fillStyle = '#e5b836';
    ctx.fillRect(-28, -6, 3, 8);
    ctx.fillRect(25, -6, 3, 8);

    // Shank (Vertical central iron beam)
    ctx.fillStyle = '#3a3f47';
    ctx.fillRect(-3.5, -4, 7, 44);
    // Specular highlight down the shank
    ctx.fillStyle = '#7d8794';
    ctx.fillRect(-1.5, -4, 2, 44);

    // Crown & Curved Arms
    ctx.strokeStyle = '#3a3f47';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    // Arc across the bottom
    ctx.arc(0, 24, 24, 0.25 * Math.PI, 0.75 * Math.PI, false);
    ctx.stroke();

    // Metallic highlight on arms
    ctx.strokeStyle = '#7d8794';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 24, 23, 0.3 * Math.PI, 0.7 * Math.PI, false);
    ctx.stroke();

    // Flukes (Barbed anchor tips)
    const drawFluke = (dir) => {
      ctx.save();
      ctx.translate(dir * 18, 30);
      ctx.fillStyle = '#2f343b';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(dir * 10, -16);
      ctx.lineTo(dir * 4, -14);
      ctx.closePath();
      ctx.fill();

      // Fluke highlight
      ctx.fillStyle = '#8b96a5';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(dir * 6, -15);
      ctx.lineTo(dir * 3, -12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    drawFluke(-1); // Left fluke
    drawFluke(1);  // Right fluke

    ctx.restore();

    // 4. Water Surface and Ripples
    ctx.save();
    // Water line background
    const waterGrad = ctx.createLinearGradient(0, waterY, 0, 260);
    waterGrad.addColorStop(0, 'rgba(20, 68, 88, 0.65)');
    waterGrad.addColorStop(1, 'rgba(8, 32, 44, 0.88)');
    ctx.fillStyle = waterGrad;
    ctx.fillRect(16, waterY, 208, 260 - waterY);

    // Foam wave crest on water surface
    ctx.strokeStyle = '#7be0ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let x = 16; x <= 224; x += 4) {
      const wave = Math.sin(x * 0.08 + elapsed * 6) * 2.5;
      if (x === 16) ctx.moveTo(x, waterY + wave);
      else ctx.lineTo(x, waterY + wave);
    }
    ctx.stroke();

    // Ripple rings around center
    const rippleT = (elapsed * 2.5) % 1.0;
    const rippleR = 8 + rippleT * 32;
    const rippleAlpha = Math.max(0, 1.0 - rippleT);
    ctx.strokeStyle = `rgba(160, 235, 255, ${rippleAlpha * 0.75})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(120, waterY + 2, rippleR, rippleR * 0.35, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 5. Water Particles (Droplets, bubbles)
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08; // gravity
      p.life -= p.decay;

      if (p.life <= 0 || p.y > 250) {
        this._particles.splice(i, 1);
        continue;
      }

      ctx.fillStyle = `rgba(180, 240, 255, ${p.life})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

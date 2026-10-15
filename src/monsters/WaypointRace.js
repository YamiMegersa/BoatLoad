import * as THREE from 'three';
import { emit } from '../core/EventBus.js';

// ---------------------------------------------------------------------------
// WaypointRace — checkpoint racing challenge for the Kraken boss fight
// ---------------------------------------------------------------------------

/**
 * Manages an ordered sequence of waypoint gates that the player must
 * reach within a time limit.  Used by KrakenBoss to determine whether
 * a tentacle is successfully lured into terrain.
 *
 * Visual: TorusGeometry rings floating above the water.
 * Colors: grey (upcoming), green (current target), red (timer critical).
 */
export class WaypointRace {
  /**
   * @param {object}   config
   * @param {Array<{ position: {x,y,z}, radius: number }>} config.waypoints
   * @param {number}   config.timeLimit     Seconds to complete all waypoints
   * @param {THREE.Scene} scene
   */
  constructor(config, scene) {
    this._scene = scene;
    this._waypoints = config.waypoints;
    this._timeLimit = config.timeLimit;
    this._timeRemaining = config.timeLimit;
    this._currentIdx = 0;
    this._complete = false;
    this._expired = false;
    this._active = false;

    // Gate visual records and meshes
    this._gateVisuals = [];
    /** @type {THREE.Object3D[]} */
    this._gateMeshes = [];

    // Trail line connecting waypoints
    this._trailLine = null;

    this._buildVisuals();
  }

  /**
   * Start the race timer.
   * @param {boolean} [maintainProgress=false]
   */
  start(maintainProgress = false) {
    this._active = true;
    if (!maintainProgress) {
      this._currentIdx = 0;
    }
    this._timeRemaining = this._timeLimit;
    this._complete = false;
    this._expired = false;
    this._updateGateColors();

    emit('krakenRaceStarted', {
      tentacleIdx: 0, // overridden by KrakenBoss
      waypoints: this._waypoints.length,
      timeLimit: this._timeLimit,
    });
  }

  /**
   * Resume the race after the player is hit by a tentacle.
   * Progress is maintained: current waypoint index is preserved,
   * the timer is refreshed, and visuals/events are re-emitted.
   */
  resumeAfterHit() {
    this._active = true;
    this._expired = false;
    this._complete = false;
    this._timeRemaining = this._timeLimit;
    this._updateGateColors();

    emit('krakenRaceTimerUpdate', { timeRemaining: this._timeRemaining });
    emit('krakenWaypointProgress', {
      current: this._currentIdx,
      total: this._waypoints.length,
    });
  }

  /**
   * Per-frame update.
   * @param {number} delta
   * @param {import('../obstacle/PlayerShip.js').PlayerShip} playerShip
   */
  update(delta, playerShip) {
    if (!this._active || this._complete || this._expired) return;

    // Countdown
    this._timeRemaining -= delta;
    emit('krakenRaceTimerUpdate', { timeRemaining: this._timeRemaining });

    if (this._timeRemaining <= 0) {
      this._expired = true;
      this._active = false;
      emit('krakenRaceExpired', { tentacleIdx: 0 });
      return;
    }

    // Check if player reached current waypoint
    const wp = this._waypoints[this._currentIdx];
    const shipPos = playerShip.mesh.position;
    const dx = shipPos.x - wp.position.x;
    const dz = shipPos.z - wp.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist < (wp.radius ?? 8)) {
      // Waypoint reached!
      this._currentIdx++;

      emit('krakenWaypointProgress', {
        current: this._currentIdx,
        total: this._waypoints.length,
      });

      if (this._currentIdx >= this._waypoints.length) {
        // All waypoints cleared
        this._complete = true;
        this._active = false;
        emit('krakenRaceComplete', { tentacleIdx: 0 });
      }

      this._updateGateColors();
    }

    // Animate gate visuals — GTA:SA yellow cylinder rotation and target pulse
    const now = performance.now() / 1000;
    for (let i = 0; i < this._gateVisuals.length; i++) {
      const visual = this._gateVisuals[i];

      // Slow cylinder rotation
      visual.cylinder.rotation.y += delta * 0.25;

      // Pulse the current target gate
      if (i === this._currentIdx && this._active) {
        const pulse = 1.0 + Math.sin(now * 4.0) * 0.04;
        visual.cylinder.scale.set(pulse, 1.0, pulse);
        visual.baseRing.scale.set(pulse, pulse, 1.0);
      } else {
        visual.cylinder.scale.set(1, 1, 1);
        visual.baseRing.scale.set(1, 1, 1);
      }
    }
  }

  /** @returns {boolean} All waypoints reached in time */
  isComplete() { return this._complete; }

  /** @returns {boolean} Timer expired before completion */
  isExpired() { return this._expired; }

  /** @returns {boolean} Race is actively running */
  isActive() { return this._active; }

  /** @returns {number} Current seconds remaining */
  getTimeRemaining() { return Math.max(0, this._timeRemaining); }

  /** @returns {number} Ratio of time remaining from 1.0 (start) down to 0.0 (expired) */
  getTimeRatio() {
    return Math.max(0, Math.min(1, this._timeRemaining / (this._timeLimit || 1)));
  }

  /**
   * Get the position of the last reached waypoint (for tentacle wrapping).
   * @returns {THREE.Vector3|null}
   */
  getLastReachedWaypointPosition() {
    if (this._currentIdx === 0) return null;
    const wp = this._waypoints[this._currentIdx - 1];
    return new THREE.Vector3(wp.position.x, wp.position.y ?? 0, wp.position.z);
  }

  /**
   * Get the terrain anchor for where the tentacle should wrap.
   * Uses the final waypoint position as the anchor.
   * @returns {THREE.Vector3}
   */
  getTerrainAnchor() {
    const lastWp = this._waypoints[this._waypoints.length - 1];
    return new THREE.Vector3(lastWp.position.x, lastWp.position.y ?? 0, lastWp.position.z);
  }

  /**
   * Stop and reset the race.
   * @param {boolean} [maintainProgress=false]
   */
  reset(maintainProgress = false) {
    this._active = false;
    if (!maintainProgress) {
      this._currentIdx = 0;
    }
    this._timeRemaining = this._timeLimit;
    this._complete = false;
    this._expired = false;
    this._updateGateColors();
  }

  dispose() {
    for (const visual of this._gateVisuals) {
      visual.cylinder.geometry.dispose();
      visual.cylinder.material.dispose();
      visual.baseRing.geometry.dispose();
      visual.baseRing.material.dispose();
      if (visual.sprite) {
        visual.sprite.material.map?.dispose();
        visual.sprite.material.dispose();
      }
      this._scene?.remove(visual.group);
    }
    this._gateVisuals.length = 0;
    this._gateMeshes.length = 0;

    if (this._trailLine) {
      this._trailLine.geometry.dispose();
      this._trailLine.material.dispose();
      this._scene?.remove(this._trailLine);
      this._trailLine = null;
    }
  }

  _buildVisuals() {
    const cylinderHeight = 24;

    for (let i = 0; i < this._waypoints.length; i++) {
      const wp = this._waypoints[i];
      const radius = (wp.radius ?? 8) * 0.9;
      const wpY = wp.position.y ?? 0;

      const gateGroup = new THREE.Group();
      gateGroup.userData.noGodRays = true;
      gateGroup.userData.noOcclusion = true;
      gateGroup.userData.isRaceMarker = true;
      gateGroup.userData.isWaypoint = true;
      gateGroup.position.set(wp.position.x, wpY, wp.position.z);

      // 1. Tall transparent yellow GTA cylinder
      const cylGeo = new THREE.CylinderGeometry(radius, radius, cylinderHeight, 32, 1, true);
      const cylMat = new THREE.MeshPhongMaterial({
        color: 0xffea00,
        emissive: 0x886600,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false,
        shininess: 40,
      });
      const cylinder = new THREE.Mesh(cylGeo, cylMat);
      cylinder.position.y = cylinderHeight / 2;
      cylinder.userData.noGodRays = true;
      cylinder.userData.isRaceMarker = true;
      gateGroup.add(cylinder);

      // 2. Base ground/water yellow corona ring
      const ringGeo = new THREE.RingGeometry(radius * 0.88, radius * 1.02, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffea00,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const baseRing = new THREE.Mesh(ringGeo, ringMat);
      baseRing.rotation.x = -Math.PI / 2;
      baseRing.position.y = 0.2;
      baseRing.userData.noGodRays = true;
      baseRing.userData.isRaceMarker = true;
      gateGroup.add(baseRing);

      // 3. Number label badge sprite (bright yellow disc with high-contrast numeral)
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffea00';
      ctx.beginPath();
      ctx.arc(32, 32, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111111';
      ctx.font = 'bold 36px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${i + 1}`, 32, 32);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(3.5, 3.5, 1);
      sprite.position.y = 6.0;
      sprite.userData.noGodRays = true;
      sprite.userData.isRaceMarker = true;
      gateGroup.add(sprite);

      gateGroup.traverse(c => {
        c.userData.noGodRays = true;
        c.userData.noOcclusion = true;
        c.userData.isRaceMarker = true;
        c.userData.isWaypoint = true;
      });

      this._scene.add(gateGroup);
      this._gateMeshes.push(gateGroup);
      this._gateVisuals.push({
        group: gateGroup,
        cylinder,
        baseRing,
        sprite,
      });
    }

    // Trail line connecting waypoints (bright dashed yellow)
    const points = this._waypoints.map(
      wp => new THREE.Vector3(wp.position.x, (wp.position.y ?? 0) + 0.3, wp.position.z)
    );
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineDashedMaterial({
      color: 0xffea00,
      dashSize: 3,
      gapSize: 1.5,
      transparent: true,
      opacity: 0.65,
    });
    this._trailLine = new THREE.Line(lineGeo, lineMat);
    this._trailLine.computeLineDistances();
    this._trailLine.userData.noGodRays = true;
    this._trailLine.userData.noOcclusion = true;
    this._trailLine.userData.isRaceMarker = true;
    this._trailLine.userData.isWaypoint = true;
    this._scene.add(this._trailLine);
  }

  _updateGateColors() {
    for (let i = 0; i < this._gateVisuals.length; i++) {
      const visual = this._gateVisuals[i];
      const cylMat = visual.cylinder.material;
      const ringMat = visual.baseRing.material;

      if (i < this._currentIdx) {
        // Already cleared — faint green beacon
        cylMat.color.setHex(0x00cc44);
        cylMat.emissive.setHex(0x003311);
        cylMat.opacity = 0.10;
        ringMat.color.setHex(0x00cc44);
        ringMat.opacity = 0.15;
        if (visual.sprite) visual.sprite.material.opacity = 0.25;
      } else if (i === this._currentIdx && this._active) {
        // Current active target — bright vibrant yellow cylinder
        cylMat.color.setHex(0xffea00);
        cylMat.emissive.setHex(0x997700);
        cylMat.opacity = 0.48;
        ringMat.color.setHex(0xffea00);
        ringMat.opacity = 0.85;
        if (visual.sprite) visual.sprite.material.opacity = 1.0;
      } else {
        // Upcoming waypoint — semi-transparent pale yellow
        cylMat.color.setHex(0xddbb00);
        cylMat.emissive.setHex(0x332800);
        cylMat.opacity = 0.20;
        ringMat.color.setHex(0xddbb00);
        ringMat.opacity = 0.35;
        if (visual.sprite) visual.sprite.material.opacity = 0.6;
      }
    }
  }
}

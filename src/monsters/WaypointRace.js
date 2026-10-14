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

    // Gate meshes
    /** @type {THREE.Mesh[]} */
    this._gateMeshes = [];

    // Trail line connecting waypoints
    this._trailLine = null;

    this._buildVisuals();
  }

  /**
   * Start the race timer.
   */
  start() {
    this._active = true;
    this._currentIdx = 0;
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

    // Animate gate meshes — gentle bob
    for (let i = 0; i < this._gateMeshes.length; i++) {
      const mesh = this._gateMeshes[i];
      mesh.rotation.y += delta * 0.5;

      // Pulse the current target gate
      if (i === this._currentIdx) {
        const pulse = 1.0 + Math.sin(performance.now() / 1000 * 4) * 0.15;
        mesh.scale.setScalar(pulse);
      }
    }
  }

  /** @returns {boolean} All waypoints reached in time */
  isComplete() { return this._complete; }

  /** @returns {boolean} Timer expired before completion */
  isExpired() { return this._expired; }

  /** @returns {boolean} Race is actively running */
  isActive() { return this._active; }

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
   */
  reset() {
    this._active = false;
    this._currentIdx = 0;
    this._timeRemaining = this._timeLimit;
    this._complete = false;
    this._expired = false;
    this._updateGateColors();
  }

  dispose() {
    for (const mesh of this._gateMeshes) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      this._scene?.remove(mesh);
    }
    this._gateMeshes.length = 0;

    if (this._trailLine) {
      this._trailLine.geometry.dispose();
      this._trailLine.material.dispose();
      this._scene?.remove(this._trailLine);
      this._trailLine = null;
    }
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  _buildVisuals() {
    // Waypoint gate torus rings
    for (let i = 0; i < this._waypoints.length; i++) {
      const wp = this._waypoints[i];
      const radius = wp.radius ?? 8;

      const torusGeo = new THREE.TorusGeometry(radius * 0.8, 0.4, 8, 24);
      const torusMat = new THREE.MeshPhongMaterial({
        color: 0x666666,
        emissive: 0x222222,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
      });

      const torus = new THREE.Mesh(torusGeo, torusMat);
      torus.position.set(wp.position.x, (wp.position.y ?? 0) + 2, wp.position.z);
      torus.rotation.x = Math.PI / 2; // lay flat horizontally

      // Add number label (simple sprite)
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 48px monospace';
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
      sprite.scale.set(3, 3, 1);
      sprite.position.y = 4;
      torus.add(sprite);

      this._scene.add(torus);
      this._gateMeshes.push(torus);
    }

    // Trail line connecting waypoints
    const points = this._waypoints.map(
      wp => new THREE.Vector3(wp.position.x, (wp.position.y ?? 0) + 2, wp.position.z)
    );
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineDashedMaterial({
      color: 0xffaa00,
      dashSize: 2,
      gapSize: 1,
      transparent: true,
      opacity: 0.5,
    });
    this._trailLine = new THREE.Line(lineGeo, lineMat);
    this._trailLine.computeLineDistances();
    this._scene.add(this._trailLine);
  }

  _updateGateColors() {
    for (let i = 0; i < this._gateMeshes.length; i++) {
      const mat = this._gateMeshes[i].material;

      if (i < this._currentIdx) {
        // Already reached — green
        mat.color.setHex(0x00cc44);
        mat.emissive.setHex(0x004411);
        mat.opacity = 0.4;
      } else if (i === this._currentIdx && this._active) {
        // Current target — bright yellow/orange
        mat.color.setHex(0xffaa00);
        mat.emissive.setHex(0x553300);
        mat.opacity = 0.9;
      } else {
        // Upcoming — grey
        mat.color.setHex(0x666666);
        mat.emissive.setHex(0x222222);
        mat.opacity = 0.5;
      }
    }
  }
}

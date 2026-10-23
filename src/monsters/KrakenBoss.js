import * as THREE from 'three';
import { emit, on, off } from '../core/EventBus.js';
import { TentacleFollower } from './TentacleFollower.js';
import { WaypointRace } from './WaypointRace.js';
import { KrakenCinematic } from './KrakenCinematic.js';
import { LevelConfig } from '../core/LevelConfig.js';

// ---------------------------------------------------------------------------
// KrakenBoss — multi-phase boss fight orchestrator
// ---------------------------------------------------------------------------

/**
 * Boss FSM states:
 *   IDLE            — waiting for the player to enter the trigger zone
 *   RACE_ACTIVE     — player is racing through waypoints; tentacle pursues
 *   TENTACLE_CAUGHT — race succeeded; tentacle wraps around terrain
 *   CINEMATIC       — camera flies to Kraken for damage reveal
 *   RACE_COOLDOWN   — brief pause between tentacles
 *   VICTORY         — all tentacles defeated
 *   DEFEATED        — player died during the fight
 */
const BossState = Object.freeze({
  IDLE:               'IDLE',
  RACE_ACTIVE:        'RACE_ACTIVE',
  TENTACLE_ATTACKING: 'TENTACLE_ATTACKING',
  TENTACLE_CAUGHT:    'TENTACLE_CAUGHT',
  CINEMATIC:          'CINEMATIC',
  RACE_COOLDOWN:      'RACE_COOLDOWN',
  VICTORY:            'VICTORY',
  DEFEATED:           'DEFEATED',
});

export { BossState };

/**
 * KrakenBoss — orchestrates the full boss encounter.
 *
 * Driven by level config (`levelCfg.kraken`). Manages tentacles,
 * waypoint races, and cinematic camera sequences. All HUD
 * communication flows through EventBus.
 */
export class KrakenBoss {
  constructor() {
    this._state = BossState.IDLE;

    // References
    this._scene = null;
    this._camera = null;
    this._playerShip = null;
    this._ocean = null;

    // Config
    this._config = null;
    this._krakenPos = new THREE.Vector3();
    this._raceStartPos = new THREE.Vector3();
    this._raceStartRadius = 15;

    // Boss HP
    this._bossHP = 100;
    this._bossMaxHP = 100;

    // Tentacles
    /** @type {TentacleFollower[]} */
    this._tentacles = [];
    this._currentTentacleIdx = 0;

    // Active subsystems
    /** @type {WaypointRace|null} */
    this._waypointRace = null;
    this._cinematic = new KrakenCinematic();

    // Kraken body mesh
    /** @type {THREE.Group|null} */
    this._krakenMesh = null;
    this._krakenModel = null;
    this._time = 0;

    // Cooldown timer
    this._cooldownTimer = 0;
    this._cooldownDuration = 2.0; // seconds between tentacles

    // Event listeners
    this._onRaceComplete = null;
    this._onRaceExpired = null;
    this._onPlayerSunk = null;
  }

  /**
   * Initialize the boss fight from level config.
   *
   * @param {object} config         `levelCfg.kraken` object
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   * @param {import('../obstacle/PlayerShip.js').PlayerShip} playerShip
   * @param {import('../environment/Ocean.js').Ocean} ocean
   * @param {object} [krakenModel]
   */
  init(config, scene, camera, playerShip, ocean, krakenModel = null) {
    this._config = config;
    this._scene = scene;
    this._camera = camera;
    this._playerShip = playerShip;
    this._ocean = ocean;
    this._krakenModel = krakenModel || (typeof LevelConfig !== 'undefined' ? LevelConfig._cache?.get('krakenModel') : null);
    this._time = 0;

    this._krakenPos.set(
      config.krakenPosition.x,
      config.krakenPosition.y ?? -5,
      config.krakenPosition.z
    );

    this._raceStartPos.set(
      config.raceStartPosition.x,
      config.raceStartPosition.y ?? 0,
      config.raceStartPosition.z
    );
    this._raceStartRadius = config.raceStartRadius ?? 15;

    this._bossMaxHP = config.totalHP ?? 100;
    this._bossHP = this._bossMaxHP;

    // Build Kraken body mesh (procedural placeholder)
    this._buildKrakenMesh();

    // Build race start marker
    this._buildStartMarker();

    // Pre-create tentacles (hidden until activated)
    for (let i = 0; i < config.tentacles.length; i++) {
      const tentDef = config.tentacles[i];
      const spawnPos = new THREE.Vector3(
        this._krakenPos.x + (tentDef.spawnOffset?.x ?? 0),
        this._krakenPos.y + (tentDef.spawnOffset?.y ?? 0),
        this._krakenPos.z + (tentDef.spawnOffset?.z ?? 0)
      );

      const tentacle = new TentacleFollower(
        { spawnPos, speed: tentDef.speed ?? 12, krakenPos: this._krakenPos },
        scene,
        ocean
      );
      tentacle.setVisible(false);
      this._tentacles.push(tentacle);
    }

    // Listen for player death
    this._onPlayerSunk = () => {
      if (this._state !== BossState.VICTORY && this._state !== BossState.DEFEATED) {
        this._transitionTo(BossState.DEFEATED);
      }
    };
    on('playerSunk', this._onPlayerSunk);

    this._state = BossState.IDLE;
  }

  /**
   * Per-frame update. Call from GameState._updateObstacle.
   * @param {number} delta
   */
  update(delta) {
    this._time += delta;
    if (this._krakenMesh) {
      const heave = Math.sin(this._time * 1.2) * 0.4;
      this._krakenMesh.position.y = this._krakenPos.y + heave;

      // Distance culling: hide 15.8k-triangle Kraken body when player is far away (>170m) unless in active fight
      if (this._playerShip && this._playerShip.mesh) {
        const dx = this._krakenPos.x - this._playerShip.mesh.position.x;
        const dz = this._krakenPos.z - this._playerShip.mesh.position.z;
        const distSq = dx * dx + dz * dz;
        const inFight = this._state !== BossState.IDLE;
        this._krakenMesh.visible = inFight || (distSq <= 170 * 170);
      }
    }

    switch (this._state) {
      case BossState.IDLE:
        this._updateIdle(delta);
        break;

      case BossState.RACE_ACTIVE:
        this._updateRaceActive(delta);
        break;

      case BossState.TENTACLE_ATTACKING:
        this._updateTentacleAttacking(delta);
        break;

      case BossState.TENTACLE_CAUGHT:
        this._updateTentacleCaught(delta);
        break;

      case BossState.CINEMATIC:
        this._updateCinematic(delta);
        break;

      case BossState.RACE_COOLDOWN:
        this._updateCooldown(delta);
        break;

      case BossState.VICTORY:
      case BossState.DEFEATED:
        // Nothing to update
        break;
    }
  }

  /**
   * @returns {boolean} True if the cinematic camera is active (GameState should skip normal camera)
   */
  isCinematicActive() {
    return this._cinematic.isActive;
  }

  dispose() {
    // Clean up event listeners
    if (this._onPlayerSunk) off('playerSunk', this._onPlayerSunk);
    if (this._onRaceComplete) off('krakenRaceComplete', this._onRaceComplete);
    if (this._onRaceExpired) off('krakenRaceExpired', this._onRaceExpired);

    this._cinematic?.dispose?.();

    // Dispose tentacles
    for (const t of this._tentacles) t.dispose();
    this._tentacles.length = 0;

    // Dispose waypoint race
    this._waypointRace?.dispose();
    this._waypointRace = null;

    // Dispose meshes
    if (this._krakenMesh) {
      this._scene?.remove(this._krakenMesh);
      this._krakenMesh.traverse(child => {
        if (child.isMesh) {
          child.geometry?.dispose();
          child.material?.dispose();
        }
      });
      this._krakenMesh = null;
    }

    if (this._startMarker) {
      this._scene?.remove(this._startMarker);
      this._startMarker.traverse(child => {
        if (child.isMesh) {
          child.geometry?.dispose();
          child.material?.dispose();
        }
      });
      this._startMarker = null;
    }

    this._scene = null;
  }

  // -----------------------------------------------------------------------
  // State updates
  // -----------------------------------------------------------------------

  _updateIdle(delta) {
    // Check if player entered the trigger zone
    const shipPos = this._playerShip.mesh.position;
    const dx = shipPos.x - this._raceStartPos.x;
    const dz = shipPos.z - this._raceStartPos.z;
    const dist = Math.hypot(dx, dz);

    // Pulse the start marker
    if (this._startMarker) {
      this._startMarker.rotation.y += delta * 1.5;
    }

    if (dist < this._raceStartRadius) {
      this._startBossFight();
    }
  }

  _updateRaceActive(delta) {
    // Update the waypoint race
    this._waypointRace?.update(delta, this._playerShip);

    const timeRatio = this._waypointRace ? this._waypointRace.getTimeRatio() : 1.0;

    // Update the active tentacle with approach distance tied to time remaining
    const tentacle = this._tentacles[this._currentTentacleIdx];
    if (tentacle) {
      tentacle.update(delta, this._playerShip, timeRatio);
    }

    // Check race outcomes
    if (this._waypointRace?.isComplete()) {
      this._transitionTo(BossState.TENTACLE_CAUGHT);
    } else if (this._waypointRace?.isExpired()) {
      // Time ran out! Transition to attack state so tentacle impacts the ship
      this._transitionTo(BossState.TENTACLE_ATTACKING);
    }
  }

  /**
   * Handle the brief tentacle attack phase when the player fails the race.
   * The tentacle attacks for a few seconds, then the race resets.
   * @param {number} delta
   */
  _updateTentacleAttacking(delta) {
    // Update the attacking tentacle (timeRatio is 0 in attack mode)
    const tentacle = this._tentacles[this._currentTentacleIdx];
    if (tentacle) {
      tentacle.update(delta, this._playerShip, 0);
    }

    this._attackTimer += delta;
    if (this._attackTimer >= this._attackDuration) {
      // After attack and impact recoil, restart race if player survived
      if (this._playerShip && !this._playerShip.sunk) {
        this._restartCurrentRace();
      }
    }
  }

  _updateTentacleCaught(delta) {
    // Immediately transition to cinematic so camera tracks the sinking tentacle
    const tentacle = this._tentacles[this._currentTentacleIdx];
    if (tentacle) {
      tentacle.updateSinkAnimation(delta);
    }
    this._transitionTo(BossState.CINEMATIC);
  }

  _updateCinematic(delta) {
    // Sinking animation runs concurrently with the cinematic camera flight
    const tentacle = this._tentacles[this._currentTentacleIdx];
    if (tentacle) {
      tentacle.updateSinkAnimation(delta);
    }
    this._cinematic.update(delta);
    // Completion is handled by the callback in play()
  }

  _updateCooldown(delta) {
    this._cooldownTimer += delta;
    if (this._cooldownTimer >= this._cooldownDuration) {
      this._startNextTentacle();
    }
  }

  // -----------------------------------------------------------------------
  // State transitions
  // -----------------------------------------------------------------------

  _transitionTo(newState) {
    this._state = newState;

    switch (newState) {
      case BossState.TENTACLE_ATTACKING:
        {
          const t = this._tentacles[this._currentTentacleIdx];
          if (t) t.startAttack();
          this._attackTimer = 0;
          this._attackDuration = 3.0; // 3 seconds for surge, impact, and recoil
        }
        break;

      case BossState.TENTACLE_CAUGHT:
        this._onTentacleCaught();
        break;

      case BossState.CINEMATIC:
        this._startCinematic();
        break;

      case BossState.VICTORY:
        emit('krakenDefeated', {});
        break;

      case BossState.DEFEATED:
        // Clean up any active race
        this._waypointRace?.reset();
        break;
    }
  }

  // -----------------------------------------------------------------------
  // Boss fight lifecycle
  // -----------------------------------------------------------------------

  _startBossFight() {
    // Hide start marker
    if (this._startMarker) this._startMarker.visible = false;

    emit('krakenFightStarted', {
      totalHP: this._bossMaxHP,
      tentacleCount: this._tentacles.length,
    });

    emit('krakenHealthChanged', {
      hp: this._bossHP,
      maxHP: this._bossMaxHP,
    });

    this._currentTentacleIdx = 0;
    this._startCurrentRace();
  }

  _startCurrentRace() {
    const tentDef = this._config.tentacles[this._currentTentacleIdx];
    if (!tentDef) {
      this._transitionTo(BossState.VICTORY);
      return;
    }

    // Dispose previous race if any
    this._waypointRace?.dispose();

    // Create the waypoint race for this tentacle
    this._waypointRace = new WaypointRace(
      {
        waypoints: tentDef.waypoints,
        timeLimit: tentDef.raceDuration ?? 25,
      },
      this._scene
    );
    this._waypointRace.start();

    // Activate the tentacle reaching from kraken to player
    const tentacle = this._tentacles[this._currentTentacleIdx];
    if (tentacle) {
      tentacle.setVisible(true);
      const tentOrigin = new THREE.Vector3(
        this._krakenPos.x + (tentDef.spawnOffset?.x ?? 0),
        this._krakenPos.y + 2.5,
        this._krakenPos.z + (tentDef.spawnOffset?.z ?? 0)
      );
      tentacle.activate(this._playerShip, tentOrigin);
    }

    this._state = BossState.RACE_ACTIVE;

    emit('krakenRaceStarted', {
      tentacleIdx: this._currentTentacleIdx,
      waypoints: tentDef.waypoints.length,
      timeLimit: tentDef.raceDuration ?? 25,
    });
  }

  _restartCurrentRace() {
    // Reset tentacle reaching from kraken to pursue player
    const tentDef = this._config.tentacles[this._currentTentacleIdx];
    const tentacle = this._tentacles[this._currentTentacleIdx];
    if (tentacle) {
      const tentOrigin = new THREE.Vector3(
        this._krakenPos.x + (tentDef?.spawnOffset?.x ?? 0),
        this._krakenPos.y + 2.5,
        this._krakenPos.z + (tentDef?.spawnOffset?.z ?? 0)
      );
      tentacle.activate(this._playerShip, tentOrigin);
    }

    // Resume the race maintaining progress (do not reset waypoints already cleared)
    this._waypointRace?.resumeAfterHit();

    this._state = BossState.RACE_ACTIVE;
  }

  _onTentacleCaught() {
    emit('krakenTentacleCaught', { tentacleIdx: this._currentTentacleIdx });

    // Smoothly coast the player ship to a halt so it stays in place during the cutscene
    this._playerShip?.halt?.();

    // Trigger sink animation on defeated tentacle
    const tentacle = this._tentacles[this._currentTentacleIdx];
    if (tentacle) {
      tentacle.playSinkAnimation();
    }

    // Immediately start cinematic camera flight so player watches tentacle sink!
    this._transitionTo(BossState.CINEMATIC);
  }

  _startCinematic() {
    const tentDef = this._config.tentacles[this._currentTentacleIdx];
    const tentacle = this._tentacles[this._currentTentacleIdx];
    const damageAmount = tentDef?.damagePerTentacle ?? Math.floor(this._bossMaxHP / this._tentacles.length);

    emit('krakenCinematicStart', {});

    this._cinematic.play(
      this._camera,
      this._camera.position.clone(),
      this._krakenPos,
      this._krakenMesh,
      tentacle,
      this._playerShip,
      () => {
        // Cinematic complete callback
        emit('krakenCinematicEnd', {});

        // Resume sailing speed as player regains control
        this._playerShip?.resumeSpeed?.();

        // Hide defeated tentacle completely now that cinematic is finished
        tentacle?.setVisible(false);

        // Apply damage to boss
        this._bossHP = Math.max(0, this._bossHP - damageAmount);
        emit('krakenHealthChanged', {
          hp: this._bossHP,
          maxHP: this._bossMaxHP,
        });

        // Advance to next tentacle or victory
        this._currentTentacleIdx++;

        if (this._currentTentacleIdx >= this._tentacles.length || this._bossHP <= 0) {
          this._transitionTo(BossState.VICTORY);
        } else {
          // Brief cooldown before next tentacle
          this._cooldownTimer = 0;
          this._state = BossState.RACE_COOLDOWN;
        }
      }
    );
  }

  _startNextTentacle() {
    this._startCurrentRace();
  }

  // -----------------------------------------------------------------------
  // Mesh builders
  // -----------------------------------------------------------------------

  _buildKrakenMesh() {
    this._krakenMesh = new THREE.Group();

    const kModel = this._krakenModel || (typeof LevelConfig !== 'undefined' ? LevelConfig._cache?.get('krakenModel') : null);
    if (kModel && kModel.scene) {
      const clone = kModel.scene.clone(true);
      clone.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.geometry) {
            LevelConfig.repairOctopusMesh(child);
          }
        }
      });
      const box = new THREE.Box3().setFromObject(clone);
      const center = new THREE.Vector3();
      box.getCenter(center);
      // Center in X and Z, align base at local Y = 0
      clone.position.set(-center.x, -box.min.y, -center.z);

      const wrapper = new THREE.Group();
      wrapper.scale.setScalar(1.3);
      wrapper.add(clone);

      // Add glowing amber eyes on the octopus head
      const eyeGeo = new THREE.SphereGeometry(0.55, 12, 12);
      const eyeMat = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
      });
      const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
      leftEye.position.set(-1.4, 6.2, 1.8);
      leftEye.userData.noGodRays = true;
      wrapper.add(leftEye);

      const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
      rightEye.position.set(1.4, 6.2, 1.8);
      rightEye.userData.noGodRays = true;
      wrapper.add(rightEye);

      this._krakenMesh.add(wrapper);
    } else {
      // Procedural fallback
      const bodyGeo = new THREE.SphereGeometry(6, 12, 10);
      bodyGeo.scale(1.2, 0.6, 1.5);
      const bodyMat = new THREE.MeshPhongMaterial({
        color: 0x2a1a3a,
        emissive: 0x0a0515,
        shininess: 60,
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      this._krakenMesh.add(body);

      const eyeGeo = new THREE.SphereGeometry(0.8, 8, 8);
      const eyeMat = new THREE.MeshPhongMaterial({
        color: 0xff3300,
        emissive: 0xff2200,
        emissiveIntensity: 2.0,
      });

      const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
      leftEye.position.set(-2.5, 1.5, 5);
      this._krakenMesh.add(leftEye);

      const rightEye = new THREE.Mesh(eyeGeo, eyeMat.clone());
      rightEye.position.set(2.5, 1.5, 5);
      this._krakenMesh.add(rightEye);

      const mantleGeo = new THREE.SphereGeometry(5, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      const mantleMat = new THREE.MeshPhongMaterial({
        color: 0x3a2050,
        emissive: 0x150a20,
        shininess: 30,
      });
      const mantle = new THREE.Mesh(mantleGeo, mantleMat);
      mantle.position.y = 2;
      this._krakenMesh.add(mantle);
    }

    // Position the whole thing
    this._krakenMesh.position.copy(this._krakenPos);
    this._krakenMesh.frustumCulled = true;

    this._scene.add(this._krakenMesh);
  }

  _buildStartMarker() {
    this._startMarker = new THREE.Group();
    this._startMarker.userData.noGodRays = true;
    this._startMarker.userData.noOcclusion = true;
    this._startMarker.userData.isRaceMarker = true;

    // Flag pole
    const poleGeo = new THREE.CylinderGeometry(0.15, 0.15, 8, 6);
    const poleMat = new THREE.MeshPhongMaterial({ color: 0xcccccc });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 4;
    pole.userData.noGodRays = true;
    pole.userData.isRaceMarker = true;
    this._startMarker.add(pole);

    // Flag
    const flagGeo = new THREE.PlaneGeometry(4, 2.5);
    const flagMat = new THREE.MeshPhongMaterial({
      color: 0xff2200,
      emissive: 0x441100,
      side: THREE.DoubleSide,
    });
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(2, 7, 0);
    flag.userData.noGodRays = true;
    flag.userData.isRaceMarker = true;
    this._startMarker.add(flag);

    // Radius ring
    const ringGeo = new THREE.RingGeometry(
      this._raceStartRadius - 0.5,
      this._raceStartRadius,
      48
    );
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00ff44,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    ring.userData.noGodRays = true;
    ring.userData.isRaceMarker = true;
    this._startMarker.add(ring);

    this._startMarker.traverse(c => {
      c.userData.noGodRays = true;
      c.userData.noOcclusion = true;
      c.userData.isRaceMarker = true;
    });

    this._startMarker.position.copy(this._raceStartPos);
    this._scene.add(this._startMarker);
  }
}

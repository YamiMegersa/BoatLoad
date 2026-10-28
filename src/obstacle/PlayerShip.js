import * as THREE from 'three';
import { emit, on, off } from '../core/EventBus.js';
import { OBB } from 'three/examples/jsm/math/OBB.js';
import { MATERIAL_REGISTRY, getMaterialByColor } from '../config/MaterialRegistry.js';
import { DEBUG } from '../utils/debug.js';
import { CellState, WATERLINE_Y } from '../shipyard/VoxelGrid.js';
import { DamageSystem } from '../shipyard/DamageSystem.js';

// ---------------------------------------------------------------------------
// Obstacle type definitions
// ---------------------------------------------------------------------------

/** @readonly */
export const ObstacleType = Object.freeze({
  ROCK: 'rock',
  BARREL: 'barrel',
  WAVE_SMALL: 'wave_small',
  SEAWEED: 'seaweed',
  WHIRLPOOL: 'whirlpool',
});

// ---------------------------------------------------------------------------
// PlayerShip
// ---------------------------------------------------------------------------

/**
 * PlayerShip — the player-controlled vessel during the Obstacle Trial phase.
 *
 * Movement: kinematic X-axis steering, fixed Z scroll speed.
 * Collision:  THREE.Box3 AABB bounding volume, updated every frame.
 * Stats:      hullHP, speedMultiplier — degraded by incomplete repairs.
 */
export class PlayerShip {
  /**
   * @param {object} stats
   * @param {THREE.Scene} scene
   * @param {import('../shipyard/ChunkRenderer.js').ChunkRenderer} [chunkRenderer]
   * @param {import('../shipyard/VoxelGrid.js').VoxelGrid} [grid]
   */
  constructor(stats = {}, scene, chunkRenderer, grid, qteSystem) {
    const profile = stats.profile || {};
    this.shipProfile = profile;
    this.speedMultiplier = stats.speedMultiplier ?? profile.speedMultiplier ?? 1.0;
    this._laneHalfWidth = stats.laneHalfWidth ?? 6;
    this.turnAccel = stats.turnAccel ?? profile.turnAccel ?? 2.0;
    this.turnDamping = stats.turnDamping ?? profile.turnDamping ?? 3.0;
    this.sirenResistance = stats.sirenResistance ?? 0;
    this.isGagTruck = !!(stats.isGagTruck || profile.isGagTruck);
    this.shipScale = stats.scale ?? profile.scale ?? 0.10;

    this.chunkRenderer = chunkRenderer;
    this.grid = grid;
    this.qteSystem = qteSystem;
    this._bailingWater = false;
    this._bailCooldown = 0;
    this._sirenDisorientationSources = new Set();

    // Leak & Ingress System (Sea of Thieves hydrostatic model)
    this.waterLevel = 0;
    this.maxWaterLevel = stats.waterCapacity ?? profile.waterCapacity ?? 100;
    this.waterlineY = stats.waterlineY ?? profile.waterlineY ?? 4;
    this.numLeaks = 0;
    this.activeBreaches = [];
    this.breachSectors = { bow: 0, stern: 0, port: 0, starboard: 0, keel: 0 };
    // 6-compartment Witcher 3 damage & flooding tracking
    this.compartmentDamage = {
      bow_port: 0,
      bow_starboard: 0,
      mid_port: 0,
      mid_starboard: 0,
      stern_port: 0,
      stern_starboard: 0,
    };
    this.compartmentFlooding = {
      bow_port: 0,
      bow_starboard: 0,
      mid_port: 0,
      mid_starboard: 0,
      stern_port: 0,
      stern_starboard: 0,
    };
    this.submergedLeaksCount = 0;
    this.currentFlowRate = 0;
    this.listRoll = 0;
    this.trimPitch = 0;
    this._tempVoxelPos = new THREE.Vector3();
    this._tempWorldPos = new THREE.Vector3();

    // Sinking Death Plunge
    this.isSinkingDeath = false;
    this.sinkDeathTimer = 0;
    this.sinkDeathDuration = 3.8;

    // HP System
    this.hullHP = stats.hullHP ?? profile.health ?? 100;
    this.maxHullHP = stats.maxHullHP ?? profile.health ?? 100;

    /** @type {number} Steering input in [-1, +1] from wheel drag or keyboard */
    this.steerInput = 0;

    // Physics & Rotation
    this.yaw = 0;
    this.yawVelocity = 0;
    this.pitch = 0;
    this.roll = 0;
    this.pitchVelocity = 0;
    this.rollVelocity = 0;

    // Pinball-like knockback velocity
    this.knockbackVelocity = new THREE.Vector3();

    // Immunity
    this.immuneTime = 0;
    this._lastOpacity = 1.0;

    /** @type {boolean} True when the ship has sunk (HP ≤ 0) */
    this.sunk = false;

    // Speed throttle (1.0 = full sailing speed, 0.0 = halted)
    this.throttle = 1.0;
    this.targetThrottle = 1.0;
    this._isHalted = false;

    this._onCinematicStart = () => this.halt();
    this._onCinematicEnd = () => this.resumeSpeed();
    on('krakenCinematicStart', this._onCinematicStart);
    on('krakenCinematicEnd', this._onCinematicEnd);

    // Use the actual voxel model if provided
    this.mesh = new THREE.Group();
    let wrapper = null;
    if (chunkRenderer && chunkRenderer.container) {
      // Create a wrapper to handle scaling and centering independently
      wrapper = new THREE.Group();
      wrapper.add(chunkRenderer.container);

      // Calculate bounding box to center the voxel grid horizontally
      const tempBox = new THREE.Box3().setFromObject(chunkRenderer.container);
      const center = new THREE.Vector3();
      tempBox.getCenter(center);

      // Offset so the ship is centered on X and Z, resting on Y=0
      chunkRenderer.container.position.set(-center.x, -tempBox.min.y, -center.z);

      // Scale the wrapper according to ship profile scale
      wrapper.scale.setScalar(this.shipScale);

      // The voxel model faces +Z by default, but we move towards -Z
      wrapper.rotation.y = Math.PI;

      this.mesh.add(wrapper);
    } else {
      this.mesh.add(this._buildMesh());
    }

    // Internal water plane (rises as boat sinks)
    // Scaled down to prevent poking out of the tapered bow/stern
    const innerWaterGeo = new THREE.PlaneGeometry(1.4, 3.6);
    innerWaterGeo.rotateX(-Math.PI / 2);
    const innerWaterMat = new THREE.MeshPhongMaterial({
      color: 0x1c343d, // Matches the deep sea color from Ocean.js
      transparent: true,
      opacity: 0.85,
      depthWrite: false // don't occlude other transparent objects weirdly
    });
    this.innerWater = new THREE.Mesh(innerWaterGeo, innerWaterMat);
    // Position it at the bottom of the boat internally
    this.innerWater.position.set(0, 0.1, 0);
    this.innerWater.visible = false;
    this.mesh.add(this.innerWater);

    scene.add(this.mesh);

    // OBB Collision (compute base unrotated bounds from local vessel wrapper)
    const targetObj = wrapper || this.mesh;
    const localBox = new THREE.Box3().setFromObject(targetObj);
    this.baseOBB = new OBB();
    localBox.getCenter(this.baseOBB.center);
    localBox.getSize(this.baseOBB.halfSize).multiplyScalar(0.5);

    // HITBOX VISUALIZATION
    const wireMat = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    const wireGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(this.baseOBB.halfSize.x * 2, this.baseOBB.halfSize.y * 2, this.baseOBB.halfSize.z * 2));
    const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
    wireMesh.position.copy(this.baseOBB.center);
    wireMesh.visible = false;
    this.mesh.add(wireMesh);
    this.hitboxWireMesh = wireMesh;

    // 3D Bow Lantern & Lights
    this.lanternStats = stats.lanternStats || null;
    this._bowLanternGroup = null;
    this._buildBowLantern(this.lanternStats);

    // 3D Prow-Mounted Swivel Harpoon Launcher
    this._harpoonLauncherGroup = null;
    this._harpoonSwivel = null;
    this._harpoonPivot = null;
    this._harpoonBarrel = null;
    this._loadedHarpoonMesh = null;
    this._harpoonRecoil = 0;
    this._harpoonReloadTimer = 0;
    this._buildHarpoonLauncher();

    this._onItemsEquipped = (d) => {
      if (d?.type === 'lantern') {
        this.lanternStats = d.item?.stats;
        this._buildBowLantern(this.lanternStats);
      } else if (d?.type === 'wheel') {
        const wStats = d.item?.stats;
        if (wStats) {
          this.turnAccel = wStats.turnAccel ?? this.turnAccel;
          this.turnDamping = wStats.turnDamping ?? this.turnDamping;
          this.sirenResistance = wStats.sirenResistance ?? this.sirenResistance;
        }
      }
    };
    on('itemsEquipped', this._onItemsEquipped);

    this.obb = new OBB();

    // Initial Spawn Position and Rotation
    const spawnPos = stats.spawnPosition || (stats.shipSpawn?.position) || (stats.shipSpawn?.x !== undefined ? stats.shipSpawn : null);
    if (spawnPos) {
      this.mesh.position.set(spawnPos.x ?? 0, spawnPos.y ?? 0, spawnPos.z ?? 0);
    }
    if (stats.spawnRotation !== undefined) {
      this.yaw = stats.spawnRotation;
    } else if (stats.shipSpawn?.rotation !== undefined) {
      this.yaw = stats.shipSpawn.rotation;
    }
    this.mesh.rotation.order = 'YXZ';
    this.mesh.rotation.y = this.yaw;
    this.mesh.updateMatrixWorld(true);
    this.obb.copy(this.baseOBB);
    this.obb.applyMatrix4(this.mesh.matrixWorld);

    this.godMode = window.godModeEnabled || false;
    this._onGodMode = (d) => {
      this.godMode = d.enabled;
      if (this.godMode) {
        this.sunk = false;
        this.waterLevel = 0;
        this.hullHP = this.maxHullHP;
        for (const k in this.compartmentDamage) this.compartmentDamage[k] = 0;
        for (const k in this.compartmentFlooding) this.compartmentFlooding[k] = 0;
        emit('playerWaterLevel', {
          level: this.waterLevel,
          max: this.maxWaterLevel,
          allSectors: { ...this.compartmentDamage },
          compartmentDamage: { ...this.compartmentDamage },
          sectors: { ...this.compartmentFlooding }
        });
        emit('playerHealth', { hp: this.hullHP, max: this.maxHullHP });
        this.healDamage(9999); // patch all holes
      }
    };
    on('toggleGodMode', this._onGodMode);

    // Initialise leaks from any unpatched holes left from the shipyard
    this._countLeaks();
    this._applyMaterialModifiers();

    // Immediately emit initial status so HUD schematic renders accurate breach indicators
    const initialAllSectors = { ...this.compartmentDamage, bow: 0, stern: 0, port: 0, starboard: 0, keel: 0 };
    for (const b of (this.activeBreaches || [])) {
      initialAllSectors[b.sector] = (initialAllSectors[b.sector] || 0) + 1;
      if (b.witcherSector) {
        initialAllSectors[b.witcherSector] = (initialAllSectors[b.witcherSector] || 0) + 1;
      }
    }
    emit('playerWaterLevel', {
      level: this.waterLevel,
      max: this.maxWaterLevel,
      flowRate: 0,
      sectors: { ...this.compartmentFlooding, bow: 0, stern: 0, port: 0, starboard: 0, keel: 0 },
      allSectors: initialAllSectors,
      compartmentDamage: { ...this.compartmentDamage },
      compartmentFlooding: { ...this.compartmentFlooding },
      submergedCount: 0
    });
    emit('playerHealth', { hp: this.hullHP, max: this.maxHullHP });
  }

  _refreshBreaches() {
    if (!this.grid) return;
    this.activeBreaches = DamageSystem.getActiveLeaks(this.grid, this.waterlineY);
    this.numLeaks = this.activeBreaches.length;

    // Scan all unsealed hull breaches across the grid to keep compartmentDamage in sync
    const allHullBreaches = DamageSystem.getAllBreaches(this.grid);
    for (const b of allHullBreaches) {
      if (b.witcherSector && this.compartmentDamage[b.witcherSector] !== undefined) {
        this.compartmentDamage[b.witcherSector] = Math.max(1, this.compartmentDamage[b.witcherSector] || 0);
      }
    }
  }

  _countLeaks() {
    this._refreshBreaches();
  }

  _applyMaterialModifiers() {
    if (!this.grid) return;
    let bonusHP = 0;
    let weightSum = 0;
    let repairedCount = 0;

    this.grid.forEach((x, y, z, state) => {
      // CellState.REPAIRED = 5
      if (state === 5) {
        repairedCount++;
        const hex = this.grid.getColor(x, y, z);
        if (hex === MATERIAL_REGISTRY.copper_plate.color) {
          bonusHP += 25;
          weightSum += 1.0;
        } else if (hex === MATERIAL_REGISTRY.dark_ironwood.color) {
          bonusHP += 12;
          weightSum += 0.5;
        } else if (hex === MATERIAL_REGISTRY.light_pine.color) {
          bonusHP += 2;
          weightSum -= 0.35;
        } else if (hex === MATERIAL_REGISTRY.tar_canvas.color) {
          bonusHP += 1;
          weightSum -= 0.5;
        } else {
          bonusHP += 5;
        }
      }
    });

    if (repairedCount > 0) {
      this.maxHullHP += bonusHP;
      this.hullHP = Math.min(this.maxHullHP, this.hullHP + bonusHP);
      const weightFactor = Math.max(0.7, 1.0 + (weightSum * 0.01));
      this.speedMultiplier = Math.max(0.6, Math.min(1.4, this.speedMultiplier / weightFactor));
      this.turnAccel = Math.max(1.0, Math.min(3.5, this.turnAccel / weightFactor));
    }
  }

  // -------------------------------------------------------------------------
  // Frame update
  // -------------------------------------------------------------------------

  update(delta, ocean, windManager) {
    if (this.sunk) return;
    this._bailCooldown = Math.max(0, this._bailCooldown - delta);

    // --- TERMINAL SINKING PLUNGE ANIMATION (3.8s Sea of Thieves death sequence) ---
    if (this.isSinkingDeath) {
      this.sinkDeathTimer += delta;
      const progress = Math.min(1.0, this.sinkDeathTimer / this.sinkDeathDuration);
      const eased = progress * progress * (3.0 - 2.0 * progress);

      // Pitch plunges nose-first or stern-first depending on trim
      const plungePitch = (this.trimPitch <= 0 ? -1.15 : 0.85) * eased;
      const plungeRoll = (this.listRoll || 0.12) * 1.5 * eased;

      this.mesh.rotation.order = 'YXZ';
      this.mesh.rotation.x = this.pitch + plungePitch;
      this.mesh.rotation.y = this.yaw;
      this.mesh.rotation.z = this.roll + plungeRoll;

      // Drop vessel down into ocean depths
      this.mesh.position.y -= delta * 3.4;

      if (Math.random() < 0.42) {
        emit('spawnParticles', { type: 'splash', position: this.mesh.position.clone() });
      }

      if (this.sinkDeathTimer >= this.sinkDeathDuration && !this.sunk) {
        this.sunk = true;
        emit('playerSunk');
      }
      return;
    }

    // Gag Truck: Immediately nose-dives and sinks!
    if (this.isGagTruck) {
      this.truckSinkTimer = (this.truckSinkTimer || 0) + delta;

      // Heavy forward nose-dive pitch (-75 degrees)
      this.pitch = Math.max(-1.35, this.pitch - delta * 2.6);
      this.roll += Math.sin(this.truckSinkTimer * 10.0) * 0.05;

      // Rapidly sink into the water
      this.mesh.position.y -= delta * 5.0;
      this.mesh.position.z -= delta * 2.5; // slight forward slide as nose goes under

      this.mesh.rotation.order = 'YXZ';
      this.mesh.rotation.x = this.pitch;
      this.mesh.rotation.y = this.yaw;
      this.mesh.rotation.z = this.roll;

      // Immediately flood
      this.waterLevel = this.maxWaterLevel;
      emit('playerWaterLevel', { level: this.waterLevel, max: this.maxWaterLevel });
      this.hullHP = Math.max(0, this.hullHP - delta * 40);
      emit('playerHealth', { hp: this.hullHP, max: this.maxHullHP });

      if (Math.random() < 0.35) {
        emit('spawnParticles', { type: 'splash', position: this.mesh.position });
      }

      if (this.truckSinkTimer >= 1.1 && !this.sunk) {
        this.sunk = true;
        emit('playerSunk', { gag: true, reason: 'TRUCKS DO NOT FLOAT!' });
      }
      return;
    }

    // Time for natural bobbing
    const time = performance.now() / 1000;

    // --- IMMUNITY & FLASHING ---
    if (this.immuneTime > 0) {
      this.immuneTime -= delta;

      // Flash every 0.15s
      const isTransparent = Math.floor(this.immuneTime / 0.15) % 2 === 0;
      this._setOpacity(isTransparent ? 0.3 : 1.0);
    } else {
      if (this._lastOpacity !== 1.0) {
        this._setOpacity(1.0);
      }
    }

    // --- KILL RADIUS ---
    const distFromOrigin = Math.hypot(this.mesh.position.x, this.mesh.position.z);
    if (distFromOrigin > 220) {
      // Rapidly sink if out of bounds
      if (!this.godMode) {
        this.waterLevel += 20 * delta;
        emit('playerWaterLevel', { level: this.waterLevel, max: this.maxWaterLevel });
      }
    }

    // --- SEA OF THIEVES DYNAMIC WATER INGRESS ---
    let totalFlowRate = 0;
    const sectors = { bow: 0, stern: 0, port: 0, starboard: 0, keel: 0 };
    const allSectors = { ...this.compartmentDamage, bow: 0, stern: 0, port: 0, starboard: 0, keel: 0 };
    const floodingCompartments = {
      bow_port: 0,
      bow_starboard: 0,
      mid_port: 0,
      mid_starboard: 0,
      stern_port: 0,
      stern_starboard: 0
    };
    let submergedLeaks = 0;
    let netPortWeight = 0;
    let netBowWeight = 0;

    if (this.activeBreaches.length > 0 && this.chunkRenderer?.container) {
      this.chunkRenderer.container.updateMatrixWorld(true);

      for (const breach of this.activeBreaches) {
        allSectors[breach.sector] = (allSectors[breach.sector] || 0) + 1;
        if (breach.witcherSector) {
          allSectors[breach.witcherSector] = (allSectors[breach.witcherSector] || 0) + 1;
        }

        const localPos = this.grid.toWorldPos(breach.x, breach.y, breach.z);
        const worldPos = this.chunkRenderer.container.localToWorld(this._tempWorldPos.copy(localPos));

        const waveH = ocean ? ocean.getWaveInfo(worldPos.x, worldPos.z).height : 0;
        const depth = waveH - worldPos.y;

        if (depth > 0) {
          // Hole is submerged underwater!
          submergedLeaks++;
          sectors[breach.sector] = (sectors[breach.sector] || 0) + 1;
          if (breach.witcherSector) {
            sectors[breach.witcherSector] = (sectors[breach.witcherSector] || 0) + 1;
            floodingCompartments[breach.witcherSector] = (floodingCompartments[breach.witcherSector] || 0) + 1;
          }

          // Hydrostatic pressure flow rate
          const basePressure = Math.sqrt(Math.max(0.08, depth));
          const tierMult = breach.tier === 1 ? 0.35 : (breach.tier === 3 ? 2.3 : 1.0);
          const backPressure = Math.max(0.15, 1.0 - (this.waterLevel / this.maxWaterLevel) * 0.75);
          const holeFlow = basePressure * tierMult * backPressure * 3.2;

          totalFlowRate += holeFlow;

          if (breach.sector === 'port') netPortWeight += holeFlow;
          else if (breach.sector === 'starboard') netPortWeight -= holeFlow;
          else if (breach.sector === 'bow') netBowWeight += holeFlow;
          else if (breach.sector === 'stern') netBowWeight -= holeFlow;

          // Water fountain spray particles
          if (Math.random() < 0.08) {
            emit('spawnParticles', { type: 'splash', position: worldPos });
          }
        }
      }

      this.submergedLeaksCount = submergedLeaks;
      this.breachSectors = sectors;
      this.compartmentFlooding = floodingCompartments;
      this.currentFlowRate = totalFlowRate;

      if (totalFlowRate > 0 && !this.godMode) {
        this.waterLevel = Math.min(this.maxWaterLevel, this.waterLevel + totalFlowRate * delta);

        // Procedural creak when water exceeds 60%
        if (this.waterLevel > this.maxWaterLevel * 0.6 && Math.random() < 0.02) {
          emit('playSound', { sound: 'hull_groan' });
        }
      }

      // Keep HUD breach schematic & water gauge continuously in sync
      this._hudSyncTimer = (this._hudSyncTimer || 0) + delta;
      if (this._hudSyncTimer >= 0.1 || totalFlowRate > 0) {
        this._hudSyncTimer = 0;
        emit('playerWaterLevel', {
          level: this.waterLevel,
          max: this.maxWaterLevel,
          flowRate: totalFlowRate,
          sectors: { ...floodingCompartments, ...sectors },
          allSectors: { ...allSectors, ...this.compartmentDamage },
          compartmentDamage: { ...this.compartmentDamage },
          compartmentFlooding: { ...floodingCompartments },
          submergedCount: submergedLeaks
        });
      }
    } else {
      this.submergedLeaksCount = 0;
      this.currentFlowRate = 0;
      this.breachSectors = { bow: 0, stern: 0, port: 0, starboard: 0, keel: 0 };
      this.compartmentFlooding = floodingCompartments;

      this._hudSyncTimer = (this._hudSyncTimer || 0) + delta;
      if (this._hudSyncTimer >= 0.2) {
        this._hudSyncTimer = 0;
        emit('playerWaterLevel', {
          level: this.waterLevel,
          max: this.maxWaterLevel,
          flowRate: 0,
          sectors: { ...floodingCompartments, ...this.breachSectors },
          allSectors: { ...this.compartmentDamage },
          compartmentDamage: { ...this.compartmentDamage },
          compartmentFlooding: { ...floodingCompartments },
          submergedCount: 0
        });
      }
    }

    // Trigger sinking QTE
    if (this.waterLevel > this.maxWaterLevel * 0.75 && !this._bailingWater && this._bailCooldown <= 0 && this.qteSystem) {
      const accepted = this.qteSystem.trigger({
        source: 'bail',
        onSuccess: ({ accuracy = 0, metadata }) => {
          this._bailingWater = false;
          this._bailCooldown = 1.25;
          if (metadata.debug) return;
          const waterAtStart = this.waterLevel;
          const removed = waterAtStart * 0.5 * Math.max(0, Math.min(1, accuracy));
          this.waterLevel = Math.max(0, this.waterLevel - removed);
          emit('playerWaterLevel', {
            level: this.waterLevel,
            max: this.maxWaterLevel,
            flowRate: totalFlowRate,
            sectors: this.breachSectors,
            submergedCount: this.submergedLeaksCount
          });
          emit('waterBailed', { accuracy: Math.round(accuracy * 100), removed: Math.round(removed) });
          emit('spawnParticles', { type: 'splash', position: this.mesh.position });
        },
        onFail: ({ metadata }) => {
          this._bailingWater = false;
          this._bailCooldown = 10.0;
          if (!metadata.debug) emit('waterBailFailed', { cooldown: 10 });
        }
      });
      this._bailingWater = accepted;
    }

    const waterRatio = Math.min(this.waterLevel / this.maxWaterLevel, 1.0);

    // Asymmetric water mass physics: List (Roll) and Trim (Pitch)
    const targetListRoll = THREE.MathUtils.clamp((netPortWeight) * 0.03 * (1 + waterRatio * 1.5), -0.22, 0.22);
    const targetTrimPitch = THREE.MathUtils.clamp((-netBowWeight) * 0.03 * (1 + waterRatio * 1.5), -0.20, 0.20);
    this.listRoll = THREE.MathUtils.damp(this.listRoll, targetListRoll, 2.5, delta);
    this.trimPitch = THREE.MathUtils.damp(this.trimPitch, targetTrimPitch, 2.5, delta);

    // Check for terminal sinking (Sea of Thieves: ship fills with water and begins death plunge)
    if (this.waterLevel >= this.maxWaterLevel && !this.sunk && !this.isSinkingDeath) {
      this.isSinkingDeath = true;
      this.sinkDeathTimer = 0;
      this._isHalted = true;
      this.throttle = 0;
      this.targetThrottle = 0;
      emit('playSound', { sound: 'sinking_bell' });
      emit('playSound', { sound: 'hull_groan' });
      emit('playerSinkingStart');
    }

    // Heavy Debuffs based on water level
    const handlingMultiplier = Math.max(0.1, 1.0 - (waterRatio * 1.2)); // Drops handling drastically as water fills

    // Driving Model: Steer input controls Yaw with inertia (heavy boat feel)
    const turnAccel = (this.turnAccel || 2.0) * handlingMultiplier;      // How fast the rudder can apply turning force
    const damping = (this.turnDamping || 3.0) * (1.0 + waterRatio * 2.0);  // Water resistance against turning (heavier when flooded)

    // Base turning acceleration from player input
    const steeringInput = this._sirenDisorientationSources.size ? -this.steerInput : this.steerInput;
    let yawAccel = -steeringInput * turnAccel;

    // Apply water damping/friction
    yawAccel -= this.yawVelocity * damping;

    // Euler integration for heavy momentum
    this.yawVelocity += yawAccel * delta;
    this.yaw += this.yawVelocity * delta;
    // No more clamping, free 360 degree rotation

    const _shipDir = new THREE.Vector3();
    const _windNorm = new THREE.Vector3();
    const _zeroVec = new THREE.Vector3(0, 0, 0);
    const _waveNormal = new THREE.Vector3(0, 1, 0);
    const _defaultWind = new THREE.Vector3(1, 0, -1).normalize();

    const pos = this.mesh.position;
    if (!this._tempWind) this._tempWind = new THREE.Vector3();
    const localWind = windManager ? windManager.getWindAt(pos.x, pos.z, this._tempWind) : _defaultWind;

    // Calculate wind alignment speed modifier without allocations
    _shipDir.set(0, 0, -1).applyQuaternion(this.mesh.quaternion).normalize();
    _windNorm.copy(localWind).normalize();
    const windDot = _shipDir.dot(_windNorm); // 1.0 (with wind), -1.0 (against wind)

    // Map dot product [-1, 1] to speed multiplier [0.3, 1.0] (never negative)
    const windSpeedMult = 0.3 + ((windDot + 1) / 2) * 0.7;

    // Smoothly damp throttle towards targetThrottle
    if (this._isHalted) {
      this.throttle = 0;
      this.targetThrottle = 0;
      this.yawVelocity = 0;
      this.steerInput = 0;
      this.knockbackVelocity.set(0, 0, 0);
    } else if (this.throttle !== this.targetThrottle) {
      const dampSpeed = this.targetThrottle < this.throttle ? 3.0 : 1.2;
      this.throttle = THREE.MathUtils.damp(this.throttle, this.targetThrottle, dampSpeed, delta);
      if (Math.abs(this.throttle - this.targetThrottle) < 0.005) {
        this.throttle = this.targetThrottle;
      }
    }

    // Dampen yaw velocity when halted so boat doesn't keep turning
    if (this.targetThrottle === 0 || this._isHalted) {
      this.yawVelocity *= Math.max(0, 1.0 - 6.0 * delta);
    }

    // Lateral movement based on where the ship is pointing (Yaw)
    const speedPenalty = Math.max(0.3, 1.0 - waterRatio);
    const forwardSpeed = this._isHalted ? 0 : (15.0 * speedPenalty * windSpeedMult * this.throttle);

    this.mesh.position.x += _shipDir.x * forwardSpeed * this.speedMultiplier * delta;
    this.mesh.position.z += _shipDir.z * forwardSpeed * this.speedMultiplier * delta;

    // Apply pinball knockback
    if (this.knockbackVelocity.lengthSq() > 0.001) {
      this.mesh.position.addScaledVector(this.knockbackVelocity, delta);
      // Damping the knockback (friction) without allocations
      this.knockbackVelocity.lerp(_zeroVec, 5.0 * delta);
    }

    // Sample the ocean wave height and normal at the ship's center
    let waveHeight = 0;
    _waveNormal.set(0, 1, 0);
    if (ocean) {
      const info = ocean.getWaveInfo(this.mesh.position.x, this.mesh.position.z, _waveNormal);
      waveHeight = info.height;
    }

    // Natural bobbing (Pitch and Roll) from wave normal
    // _waveNormal.z is the slope along the Z axis (forward), which translates to Pitch (X rotation)
    // _waveNormal.x is the slope along the X axis (sideways), which translates to Roll (Z rotation)
    const clampedZ = THREE.MathUtils.clamp(-_waveNormal.z, -1, 1);
    const clampedX = THREE.MathUtils.clamp(_waveNormal.x, -1, 1);
    const targetPitch = Math.asin(clampedZ) + Math.sin(time * 2.0) * 0.02;
    const targetRoll = Math.asin(clampedX) + Math.cos(time * 1.5) * 0.02;

    // Apply spring physics for impact bobbing
    this.pitchVelocity *= 0.9; // damping
    this.rollVelocity *= 0.9;

    // Spring back to 0
    this.pitchVelocity -= (this.pitch - 0) * 10 * delta;
    this.rollVelocity -= (this.roll - 0) * 10 * delta;

    this.pitch += this.pitchVelocity * delta;
    this.roll += this.rollVelocity * delta;

    // Apply rotations with asymmetric water list & trim
    this.mesh.rotation.order = 'YXZ';
    this.mesh.rotation.y = this.yaw;
    this.mesh.rotation.x = this.pitch + targetPitch + this.trimPitch;
    this.mesh.rotation.z = this.roll + targetRoll + this.listRoll;

    // Set Y based on wave height so the boat rides the waves, minus the sinking amount.
    // +0.2 adds a slight buffer to ensure corners of the flat boat bottom don't clip the curved wave.
    this.mesh.position.y = waveHeight + 0.2 - (waterRatio * 1.6);

    // Update internal water plane with dynamic sloshing tilt
    if (waterRatio > 0) {
      this.innerWater.visible = true;
      // Fill the boat bathtub style as it sinks, tilted by sloshing water mass
      this.innerWater.position.y = 0.1 + (waterRatio * 1.05);
      this.innerWater.rotation.z = -this.listRoll * 0.7;
      this.innerWater.rotation.x = -this.trimPitch * 0.7;
    } else {
      this.innerWater.visible = false;
    }

    // Update OBB collision volume
    this.mesh.updateMatrixWorld(true);
    this.obb.copy(this.baseOBB);
    this.obb.applyMatrix4(this.mesh.matrixWorld);

    // Animate prow swivel harpoon launcher recoil & reload
    this._updateHarpoonLauncher(delta);
  }

  // -------------------------------------------------------------------------
  // Prow Swivel Harpoon Launcher & Damage
  // -------------------------------------------------------------------------

  /** Returns the world-space muzzle origin and forward vector of the prow swivel harpoon launcher. */
  getHarpoonLaunchTransform() {
    this.mesh.updateMatrixWorld(true);
    if (this._harpoonBarrel) {
      const origin = new THREE.Vector3(0, 0.06, -0.72).applyMatrix4(this._harpoonBarrel.matrixWorld);
      const tail = new THREE.Vector3(0, 0.06, 0.2).applyMatrix4(this._harpoonBarrel.matrixWorld);
      const forward = origin.clone().sub(tail).normalize();
      return { origin, forward };
    }
    const halfSize = this.baseOBB?.halfSize;
    const bowOffset = -Math.max(1.4, (halfSize?.z ?? 2) * 0.82);
    const deckHeight = Math.max(1.15, (halfSize?.y ?? 0.7) * 1.7);
    const origin = new THREE.Vector3(0, deckHeight, bowOffset).applyMatrix4(this.mesh.matrixWorld);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.mesh.quaternion).normalize();
    return { origin, forward };
  }

  /** Smoothly swivels and pitches the bow harpoon gun toward an approaching shark (or resets to rest). */
  aimHarpoonAt(worldTargetPos, delta = 0.016) {
    if (!this._harpoonLauncherGroup || !this._harpoonSwivel || !this._harpoonPivot) return;
    let targetYaw = 0;
    let targetPitch = -0.06;

    if (worldTargetPos) {
      this.mesh.updateMatrixWorld(true);
      const localTarget = this._harpoonLauncherGroup.worldToLocal(worldTargetPos.clone());
      // Forward is -Z in ship local space
      const horizDist = Math.hypot(localTarget.x, localTarget.z) || 0.001;
      const rawYaw = Math.atan2(-localTarget.x, -localTarget.z);
      targetYaw = THREE.MathUtils.clamp(rawYaw, -Math.PI * 0.78, Math.PI * 0.78);
      const dy = localTarget.y - 0.52;
      const rawPitch = Math.atan2(dy, horizDist);
      targetPitch = THREE.MathUtils.clamp(rawPitch, -0.52, 0.32);
    }

    this._harpoonSwivel.rotation.y = THREE.MathUtils.damp(
      this._harpoonSwivel.rotation.y,
      targetYaw,
      9.0,
      delta
    );
    this._harpoonPivot.rotation.x = THREE.MathUtils.damp(
      this._harpoonPivot.rotation.x,
      targetPitch,
      9.0,
      delta
    );
  }

  /** Triggers barrel recoil, hides the loaded harpoon spear during flight, and schedules reload. */
  triggerHarpoonFireAnimation() {
    this._harpoonRecoil = 1.0;
    this._harpoonReloadTimer = 0.92;
    if (this._loadedHarpoonMesh) {
      this._loadedHarpoonMesh.visible = false;
    }
    return this.getHarpoonLaunchTransform();
  }

  _updateHarpoonLauncher(delta) {
    if (!this._harpoonBarrel) return;
    if (this._harpoonRecoil > 0.001) {
      this._harpoonRecoil = THREE.MathUtils.damp(this._harpoonRecoil, 0, 11.0, delta);
      this._harpoonBarrel.position.z = this._harpoonRecoil * 0.28;
    } else {
      this._harpoonRecoil = 0;
      this._harpoonBarrel.position.z = 0;
    }

    if (this._harpoonReloadTimer > 0) {
      this._harpoonReloadTimer = Math.max(0, this._harpoonReloadTimer - delta);
      if (this._harpoonReloadTimer <= 0.22 && this._loadedHarpoonMesh) {
        this._loadedHarpoonMesh.visible = true;
        const t = 1 - this._harpoonReloadTimer / 0.22;
        this._loadedHarpoonMesh.position.z = (1 - t) * 0.35;
      }
    } else if (this._loadedHarpoonMesh && !this._loadedHarpoonMesh.visible) {
      this._loadedHarpoonMesh.visible = true;
      this._loadedHarpoonMesh.position.z = 0;
    }
  }

  /**
   * Physically blow holes or cracks in the voxel hull using point of impact and material durability.
   * @param {number} amount
   * @param {string} [source]  Obstacle type that caused damage
   * @param {{ nx?: number, nz?: number }} [contactNormal] Collision normal
   */
  takeDamage(amount, source = 'unknown', contactNormal = null) {
    if (this.sunk || this.godMode || this.isSinkingDeath) return;

    this.hullHP = Math.max(0, this.hullHP - amount);
    emit('playerHealth', { hp: this.hullHP, max: this.maxHullHP });

    // Determine impact sector and Witcher 3 compartment
    let targetSector = 'bow';
    let witcherSector = 'bow_port';
    if (contactNormal && (contactNormal.nx !== undefined || contactNormal.nz !== undefined)) {
      const nx = contactNormal.nx || 0;
      const nz = contactNormal.nz || 0;
      // Transform world normal to ship local space (ship heads to -Z, yaw rotates it)
      const localNorm = new THREE.Vector3(nx, 0, nz)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.yaw)
        .normalize();

      // Contact point on ship is opposite to separation normal
      const hitX = -localNorm.x;
      const hitZ = -localNorm.z;

      // In world space facing -Z:
      // hitZ < -0.15: Bow (front)
      // hitZ > 0.15: Stern (rear)
      // Math.abs(hitZ) <= 0.15: Midship
      // hitX >= 0: Starboard (right)
      // hitX < 0: Port (left)
      const isStbd = hitX >= 0;
      if (hitZ < -0.15) {
        targetSector = 'bow';
        witcherSector = isStbd ? 'bow_starboard' : 'bow_port';
      } else if (hitZ > 0.15) {
        targetSector = 'stern';
        witcherSector = isStbd ? 'stern_starboard' : 'stern_port';
      } else {
        targetSector = isStbd ? 'starboard' : 'port';
        witcherSector = isStbd ? 'mid_starboard' : 'mid_port';
      }
    } else {
      targetSector = 'bow';
      witcherSector = Math.random() < 0.5 ? 'bow_starboard' : 'bow_port';
    }

    // Immediately register damage to this compartment
    this.compartmentDamage[witcherSector] = (this.compartmentDamage[witcherSector] || 0) + 1;

    let breached = false;
    let hitMatName = 'Timber';

    if (this.grid && this.chunkRenderer) {
      const midX = (this.grid.width - 1) * 0.5;
      const midZ = (this.grid.depth - 1) * 0.5;

      const getVoxelCompartment = (vx, vy, vz) => {
        const dz = vz - midZ;
        const dx = vx - midX;
        // In model space, dx >= 0 is port after Y=180 rotation
        const isPort = dx >= 0;
        if (dz > midZ * 0.2) return isPort ? 'bow_port' : 'bow_starboard';
        if (dz < -midZ * 0.2) return isPort ? 'stern_port' : 'stern_starboard';
        return isPort ? 'mid_port' : 'mid_starboard';
      };

      // Find solid candidate voxels in the hit compartment near waterline
      let candidates = [];
      this.grid.forEach((x, y, z, state) => {
        if ((state === CellState.INTACT || state === CellState.REPAIRED) && y <= this.waterlineY + 1) {
          if (getVoxelCompartment(x, y, z) === witcherSector) {
            candidates.push({ x, y, z });
          }
        }
      });

      // Fallback: any solid hull cells in this compartment
      if (candidates.length === 0) {
        this.grid.forEach((x, y, z, state) => {
          if (state === CellState.INTACT || state === CellState.REPAIRED) {
            if (getVoxelCompartment(x, y, z) === witcherSector) {
              candidates.push({ x, y, z });
            }
          }
        });
      }

      // Fallback: any solid hull cells near waterline
      if (candidates.length === 0) {
        this.grid.forEach((x, y, z, state) => {
          if ((state === CellState.INTACT || state === CellState.REPAIRED) && y <= this.waterlineY + 1) {
            candidates.push({ x, y, z });
          }
        });
      }

      if (candidates.length > 0) {
        const hitCell = candidates[Math.floor(Math.random() * candidates.length)];
        const colorHex = this.grid.getColor(hitCell.x, hitCell.y, hitCell.z);
        const mat = getMaterialByColor(colorHex);
        hitMatName = mat?.name || 'Timber';
        const durability = mat?.durabilityHP || 100;
        const effectiveDamage = amount / (durability / 100);

        if (mat.id === 'copper_plate' && effectiveDamage < 14) {
          // Reinforced copper plating deflects the blow!
          this.compartmentDamage[witcherSector] = Math.max(0, (this.compartmentDamage[witcherSector] || 1) - 1);
          emit('playSound', { sound: 'metal_clank' });
          emit('showBanner', { label: `COPPER PLATING DEFLECTED ${source.toUpperCase()}!` });
        } else if (mat.id === 'dark_ironwood' && effectiveDamage < 18) {
          // Hardened ironwood holds, only sustains a hairline crack
          this.grid.setState(hitCell.x, hitCell.y, hitCell.z, CellState.DAMAGED);
          emit('playSound', { sound: 'wood_thud' });
          breached = true;
        } else if (mat.id === 'tar_canvas') {
          // Tar canvas tears immediately
          this.grid.setState(hitCell.x, hitCell.y, hitCell.z, CellState.MISSING);
          emit('playSound', { sound: 'wood_crack' });
          breached = true;
        } else {
          // Standard timber & heavy blows
          if (effectiveDamage < 15) {
            this.grid.setState(hitCell.x, hitCell.y, hitCell.z, CellState.DAMAGED);
            emit('playSound', { sound: 'wood_crack' });
          } else {
            this.grid.setState(hitCell.x, hitCell.y, hitCell.z, CellState.MISSING);
            if (effectiveDamage >= 30 && candidates.length > 1) {
              const second = candidates.find(c =>
                Math.abs(c.x - hitCell.x) <= 1 && Math.abs(c.y - hitCell.y) <= 1 && Math.abs(c.z - hitCell.z) <= 1 &&
                !(c.x === hitCell.x && c.y === hitCell.y && c.z === hitCell.z)
              );
              if (second) {
                this.grid.setState(second.x, second.y, second.z, CellState.MISSING);
              }
            }
            emit('playSound', { sound: 'collision' });
          }
          breached = true;
        }

        if (breached) {
          this._refreshBreaches();
          this.chunkRenderer.sync(this.grid);
        }
      } else {
        breached = true;
      }
    } else {
      breached = true;
    }

    if (breached) {
      const allSectors = { ...this.compartmentDamage, bow: 0, stern: 0, port: 0, starboard: 0, keel: 0 };
      for (const b of (this.activeBreaches || [])) {
        allSectors[b.sector] = (allSectors[b.sector] || 0) + 1;
        if (b.witcherSector) {
          allSectors[b.witcherSector] = (allSectors[b.witcherSector] || 0) + 1;
        }
      }

      emit('playerDamaged', {
        source,
        sector: targetSector,
        witcherSector,
        material: hitMatName,
        allSectors,
        sectors: { ...this.compartmentFlooding, ...this.breachSectors }
      });
      emit('playerWaterLevel', {
        level: this.waterLevel,
        max: this.maxWaterLevel,
        flowRate: this.currentFlowRate || 0,
        sectors: { ...this.compartmentFlooding, ...this.breachSectors },
        allSectors,
        compartmentDamage: { ...this.compartmentDamage },
        compartmentFlooding: { ...this.compartmentFlooding },
        submergedCount: this.submergedLeaksCount || 0
      });
    }
  }

  /**
   * Take direct water damage without blowing holes in the hull.
   * Useful for whirlpools that pull the ship under.
   * @param {number} amount 
   */
  takeWaterDamage(amount) {
    if (this.sunk || this.godMode) return;

    this.waterLevel += amount;
    emit('playerWaterLevel', { level: this.waterLevel, max: this.maxWaterLevel });

    if (this.waterLevel >= this.maxWaterLevel && !this.sunk) {
      this.sunk = true;
      emit('playerSunk');
    }
  }

  /**
   * Heal the hull by patching missing holes.
   * @param {number} amount
   */
  healDamage(amount) {
    if (this.sunk || !this.grid || !this.chunkRenderer) return;

    this.hullHP = Math.min(this.maxHullHP, this.hullHP + amount);
    emit('playerHealth', { hp: this.hullHP, max: this.maxHullHP });

    let holesPatched = 0;

    // Find DAMAGED (2) and MISSING (3) cells. Prioritize those below the waterline first.
    const damagedCells = [];
    this.grid.forEach((x, y, z, state) => {
      if (state === CellState.MISSING || state === CellState.DAMAGED || state === CellState.FLOODED) {
        damagedCells.push({ x, y, z, isLeak: y <= this.waterlineY });
      }
    });

    // Sort so leaks are repaired first
    damagedCells.sort((a, b) => {
      if (a.isLeak && !b.isLeak) return -1;
      if (!a.isLeak && b.isLeak) return 1;
      return 0;
    });

    for (const cell of damagedCells) {
      if (holesPatched >= amount) break;
      this.grid.setState(cell.x, cell.y, cell.z, CellState.INTACT);
      holesPatched++;
    }

    if (holesPatched > 0) {
      this._countLeaks();
      this.chunkRenderer.sync(this.grid);

      // Re-evaluate compartmentDamage from remaining breaches
      for (const k in this.compartmentDamage) {
        this.compartmentDamage[k] = 0;
      }
      const remainingBreaches = DamageSystem.getAllBreaches(this.grid);
      for (const b of remainingBreaches) {
        if (b.witcherSector && this.compartmentDamage[b.witcherSector] !== undefined) {
          this.compartmentDamage[b.witcherSector]++;
        }
      }

      emit('playerWaterLevel', {
        level: this.waterLevel,
        max: this.maxWaterLevel,
        flowRate: this.currentFlowRate || 0,
        sectors: { ...this.compartmentFlooding, ...this.breachSectors },
        allSectors: { ...this.compartmentDamage },
        compartmentDamage: { ...this.compartmentDamage },
        compartmentFlooding: { ...this.compartmentFlooding },
        submergedCount: this.submergedLeaksCount || 0
      });
    }
  }

  /**
   * Apply a dynamic rotational impulse reacting to the shape and angle of the collision.
   * @param {number} dx  World X difference (ship.x - obs.x)
   * @param {number} dz  World Z difference (ship.z - obs.z)
   * @param {string} type Obstacle type
   */
  bounceBack(dx, dz, type) {
    const dist = Math.hypot(dx, dz) || 0.001;
    const nx = dx / dist; // nx > 0 means obstacle is to the left
    const nz = dz / dist; // nz > 0 means obstacle is in front (since ship moves to -Z)

    // Roll: If obstacle is on the left (nx > 0), the left hull rides up it, 
    // rolling the ship to the right (negative Z rotation).
    this.rollVelocity += -nx * 10.0;

    // Pitch: Depends on the shape of the obstacle
    let pitchImpulse = 0;
    switch (type) {
      case 'rock':
        // Rocks are steep slopes. Hitting them pitches the bow UP.
        pitchImpulse = 8.0;
        break;
      case 'wave_small':
        // Waves lift the bow very sharply.
        pitchImpulse = 12.0;
        break;
      case 'barrel':
        // Barrels are low and get crushed, causing the bow to dip over them.
        pitchImpulse = -5.0;
        break;
      default:
        pitchImpulse = 5.0;
    }

    // Scale pitch by how head-on the collision was (nz).
    // If nz > 0 (hit front), bow goes UP (or down for barrels).
    // If nz < 0 (hit back), stern goes UP -> bow goes DOWN.
    this.pitchVelocity += nz * pitchImpulse;
  }

  /**
   * Add a physical velocity impulse to the ship.
   * @param {THREE.Vector3} forceVector
   */
  applyKnockback(forceVector) {
    this.knockbackVelocity.add(forceVector);
  }

  // -------------------------------------------------------------------------
  // Immunity
  // -------------------------------------------------------------------------

  isImmune() {
    return this.immuneTime > 0;
  }

  setImmune(duration) {
    this.immuneTime = duration;
  }

  _setOpacity(opacity) {
    if (this._lastOpacity === opacity) return;
    this._lastOpacity = opacity;

    this.mesh.traverse((child) => {
      if (child.isMesh && child !== this.innerWater) {
        if (child.material) {
          // Clone material on first modify to prevent affecting shared materials globally
          if (!child.userData.clonedMat) {
            if (Array.isArray(child.material)) {
              child.material = child.material.map(m => m.clone());
            } else {
              child.material = child.material.clone();
            }
            child.userData.clonedMat = true;
          }

          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(mat => {
            mat.transparent = opacity < 1.0;
            mat.opacity = opacity;
            mat.needsUpdate = true;
          });
        }
      }
    });
  }

  // -------------------------------------------------------------------------
  // Speed modifiers
  // -------------------------------------------------------------------------

  /**
   * Temporarily slow the ship (e.g. seaweed effect).
   * @param {number} multiplier  e.g. 0.5 for half speed
   * @param {number} duration    seconds
   */
  applySpeedModifier(multiplier, duration) {
    this.speedMultiplier = multiplier;
    clearTimeout(this._speedTimer);
    this._speedTimer = setTimeout(() => {
      this.speedMultiplier = 1.0;
    }, duration * 1000);
  }

  /**
   * Smoothly coast the boat to a halt (e.g. during cinematic cutscenes).
   */
  halt() {
    this._isHalted = true;
    this.targetThrottle = 0;
    this.throttle = 0;
    this.yawVelocity = 0;
    this.steerInput = 0;
    this.knockbackVelocity.set(0, 0, 0);
  }

  /**
   * Smoothly accelerate back to cruising speed.
   */
  resumeSpeed() {
    this._isHalted = false;
    this.targetThrottle = 1.0;
  }

  setSirenDisorientation(sourceId, active) {
    if (active) this._sirenDisorientationSources.add(sourceId);
    else this._sirenDisorientationSources.delete(sourceId);
  }

  // -------------------------------------------------------------------------
  // Dispose
  // -------------------------------------------------------------------------

  dispose(scene) {
    off('toggleGodMode', this._onGodMode);
    if (this._onCinematicStart) off('krakenCinematicStart', this._onCinematicStart);
    if (this._onCinematicEnd) off('krakenCinematicEnd', this._onCinematicEnd);
    if (this._onItemsEquipped) {
      off('itemsEquipped', this._onItemsEquipped);
      this._onItemsEquipped = null;
    }
    this._buildBowLantern(null);
    this._disposeHarpoonLauncher();
    clearTimeout(this._speedTimer);
    this._sirenDisorientationSources.clear();
    scene.remove(this.mesh);
    // Note: chunkRenderer disposal is handled by GameState phase teardown later,
    // so we don't deeply dispose its geometry here.
  }

  _getBowLanternMountPosition() {
    if (this.shipProfile?.bowLanternMount) {
      const m = this.shipProfile.bowLanternMount;
      return new THREE.Vector3(m.x || 0, m.y, m.z);
    }

    // Dynamic detection from vessel geometry:
    let mountZ = -2.12;
    let mountY = 1.58;

    if (this.baseOBB) {
      const halfZ = this.baseOBB.halfSize.z;
      const centerZ = this.baseOBB.center.z;
      const bowTipZ = centerZ - halfZ;
      const draft = (this.shipProfile?.waterlineY || 4) * this.shipScale;

      // Sample vertices from the vessel mesh to find the solid prow deck/stem
      const targetVertices = [];
      this.mesh.traverse(child => {
        if (child.isMesh && child.geometry && child !== this.innerWater) {
          const pos = child.geometry.attributes.position;
          if (pos) {
            const v = new THREE.Vector3();
            const step = Math.max(1, Math.floor(pos.count / 300));
            for (let i = 0; i < pos.count; i += step) {
              v.fromBufferAttribute(pos, i);
              v.applyMatrix4(child.matrixWorld);
              this.mesh.worldToLocal(v);
              if (Math.abs(v.x) <= 0.45 && v.z <= centerZ && v.z >= bowTipZ) {
                targetVertices.push(v.clone());
              }
            }
          }
        }
      });

      let found = false;
      if (targetVertices.length > 0) {
        for (let z = bowTipZ; z <= centerZ; z += 0.05) {
          const slice = targetVertices.filter(v => Math.abs(v.z - z) <= 0.05 && v.y <= draft + 3.0 && v.y >= draft * 0.5);
          if (slice.length >= 2) {
            const xs = slice.map(v => Math.abs(v.x));
            const w = Math.max(...xs) * 2;
            if (w >= 0.20 || z >= bowTipZ + halfZ * 0.15) {
              mountZ = z;
              mountY = Math.max(...slice.map(v => v.y));
              found = true;
              break;
            }
          }
        }
      }

      if (!found) {
        // Fallback: inset behind the bow tip, deck height at waterline + 1.1m
        mountZ = bowTipZ + halfZ * 0.22;
        mountY = draft + 1.1;
      }
    }

    return new THREE.Vector3(0, mountY, mountZ);
  }

  _buildBowLantern(stats) {
    if (this._bowLanternGroup) {
      this.mesh.remove(this._bowLanternGroup);
      this._bowLanternGroup.traverse(c => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
          else c.material.dispose();
        }
      });
      this._bowLanternGroup = null;
    }

    if (!stats) return;

    const group = new THREE.Group();
    group.name = 'BowLantern';

    this.mesh.updateMatrixWorld(true);
    const mountPos = this._getBowLanternMountPosition();
    group.position.copy(mountPos);

    const metalColor = stats.lightColor === 0x66ffcc ? 0x0f2d24 : (stats.lightColor === 0x9be8ff ? 0xd4af37 : 0x221810);
    const metalMat = new THREE.MeshStandardMaterial({
      color: metalColor,
      roughness: 0.4,
      metalness: 0.8
    });

    // 1. Deck Mounting Flange / Base Plate (seated flush on the foredeck / prow timber)
    const flangeGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.04, 8);
    const flange = new THREE.Mesh(flangeGeo, metalMat);
    flange.position.set(0, 0.02, 0);
    group.add(flange);

    // 2. Vertical Mounting Stanchion / Post
    const postGeo = new THREE.CylinderGeometry(0.045, 0.06, 0.18, 8);
    const post = new THREE.Mesh(postGeo, metalMat);
    post.position.set(0, 0.11, 0);
    group.add(post);

    // Angled iron brace connecting firmly to the prow stem
    const braceGeo = new THREE.BoxGeometry(0.03, 0.14, 0.16);
    braceGeo.rotateX(Math.PI / 6);
    const brace = new THREE.Mesh(braceGeo, metalMat);
    brace.position.set(0, 0.08, 0.02);
    group.add(brace);

    // 3. Lantern Oil Basin / Reservoir
    const baseGeo = new THREE.CylinderGeometry(0.15, 0.12, 0.08, 8);
    const base = new THREE.Mesh(baseGeo, metalMat);
    base.position.set(0, 0.24, 0);
    group.add(base);

    // 4. Glowing Glass Core
    const glassColor = stats.lightColor || 0xffaa44;
    const glassMat = new THREE.MeshStandardMaterial({
      color: glassColor,
      emissive: glassColor,
      emissiveIntensity: 2.0,
      transparent: true,
      opacity: 0.88,
      roughness: 0.1
    });
    const glassGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.26, 8);
    const glassCore = new THREE.Mesh(glassGeo, glassMat);
    glassCore.position.set(0, 0.41, 0);
    group.add(glassCore);

    // 4 iron protective cage bars guarding the glass from deck spray
    const barGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.26, 6);
    const barOffsets = [
      [-0.09, -0.09],
      [0.09, -0.09],
      [-0.09, 0.09],
      [0.09, 0.09]
    ];
    for (const [bx, bz] of barOffsets) {
      const bar = new THREE.Mesh(barGeo, metalMat);
      bar.position.set(bx, 0.41, bz);
      group.add(bar);
    }

    // 5. Lantern Hood / Tiered Cap
    const capGeo = new THREE.ConeGeometry(0.17, 0.13, 8);
    const cap = new THREE.Mesh(capGeo, metalMat);
    cap.position.set(0, 0.60, 0);
    group.add(cap);

    // Brass/iron finial hanging loop
    const ringGeo = new THREE.TorusGeometry(0.04, 0.012, 6, 12);
    const ring = new THREE.Mesh(ringGeo, metalMat);
    ring.position.set(0, 0.69, 0);
    group.add(ring);

    // 6. Lights
    // 6a. PointLight (casts warm radiance on ship prow, foredeck, and sea)
    const intensity = stats.lightIntensity || 2.2;
    const distance = stats.lightDistance || 35;
    const lanternPointLight = new THREE.PointLight(glassColor, intensity, distance, 1.8);
    lanternPointLight.position.set(0, 0.41, 0);
    group.add(lanternPointLight);

    // 6b. Forward Spotlight (cuts through murky sea fog and dark waves ahead)
    const spotTarget = new THREE.Object3D();
    spotTarget.position.set(0, -1.0, -distance * 0.8);
    group.add(spotTarget);

    const lanternSpotLight = new THREE.SpotLight(glassColor, intensity * 1.6, distance * 1.4, Math.PI / 4.5, 0.5, 1.2);
    lanternSpotLight.position.set(0, 0.41, -0.05);
    lanternSpotLight.target = spotTarget;
    group.add(lanternSpotLight);

    this.mesh.add(group);
    this._bowLanternGroup = group;
  }

  _disposeHarpoonLauncher() {
    if (!this._harpoonLauncherGroup) return;
    this.mesh.remove(this._harpoonLauncherGroup);
    this._harpoonLauncherGroup.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
        else c.material.dispose();
      }
    });
    this._harpoonLauncherGroup = null;
    this._harpoonSwivel = null;
    this._harpoonPivot = null;
    this._harpoonBarrel = null;
    this._loadedHarpoonMesh = null;
  }

  _buildHarpoonLauncher() {
    this._disposeHarpoonLauncher();

    const group = new THREE.Group();
    group.name = 'ProwHarpoonLauncher';

    const lanternMount = this._getBowLanternMountPosition();
    // Seat the swivel harpoon pedestal on the foredeck just aft of the bow lantern
    group.position.set(0, Math.max(1.18, lanternMount.y - 0.16), lanternMount.z + 0.54);

    const ironMat = new THREE.MeshStandardMaterial({
      color: 0x2b3138,
      roughness: 0.45,
      metalness: 0.78,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd7b35a,
      roughness: 0.32,
      metalness: 0.85,
    });
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x6b3e20,
      roughness: 0.72,
      metalness: 0.1,
    });
    const ropeMat = new THREE.MeshStandardMaterial({
      color: 0xd8c396,
      roughness: 0.85,
      metalness: 0.05,
    });
    const steelPointMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      emissive: 0x334155,
      emissiveIntensity: 0.35,
      roughness: 0.25,
      metalness: 0.92,
    });

    // 1. Bolted Iron Deck Flange & Timber Stanchion Pedestal
    const baseFlange = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.06, 8), ironMat);
    baseFlange.position.set(0, 0.03, 0);
    group.add(baseFlange);

    const pedestalPost = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 0.42, 8), woodMat);
    pedestalPost.position.set(0, 0.24, 0);
    group.add(pedestalPost);

    const collarRing = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 8), brassMat);
    collarRing.position.set(0, 0.44, 0);
    group.add(collarRing);

    // Coiled Hemp Line Drum mounted on the starboard side of the pedestal
    const drumCore = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 10), ropeMat);
    drumCore.rotation.z = Math.PI / 2;
    drumCore.position.set(0.17, 0.24, 0.04);
    group.add(drumCore);

    for (const offsetX of [0.10, 0.24]) {
      const cheek = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 10), ironMat);
      cheek.rotation.z = Math.PI / 2;
      cheek.position.set(offsetX, 0.24, 0.04);
      group.add(cheek);
    }

    // 2. Rotating Brass Swivel Yoke (Yaw)
    const swivel = new THREE.Group();
    swivel.position.set(0, 0.47, 0);
    group.add(swivel);
    this._harpoonSwivel = swivel;

    const yokeBase = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.18), brassMat);
    swivel.add(yokeBase);

    for (const sideX of [-0.10, 0.10]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.10), brassMat);
      arm.position.set(sideX, 0.09, 0);
      swivel.add(arm);
    }

    // 3. Pitching Gun Cradle (Pitch)
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.15, 0);
    pivot.rotation.x = -0.06;
    swivel.add(pivot);
    this._harpoonPivot = pivot;

    // 4. Recoiling Barrel & Launch Rail
    const barrelGroup = new THREE.Group();
    pivot.add(barrelGroup);
    this._harpoonBarrel = barrelGroup;

    // Heavy timber stock / trough
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.10, 0.92), woodMat);
    stock.position.set(0, -0.02, -0.12);
    barrelGroup.add(stock);

    // Twin iron launch rails & bronze barrel tube
    const launchTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.07, 0.88, 8).rotateX(Math.PI / 2),
      ironMat
    );
    launchTube.position.set(0, 0.05, -0.15);
    barrelGroup.add(launchTube);

    for (const bandZ of [-0.52, -0.18, 0.16]) {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.078, 0.078, 0.04, 8).rotateX(Math.PI / 2),
        brassMat
      );
      band.position.set(0, 0.04, bandZ);
      barrelGroup.add(band);
    }

    // Rear aiming grip
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.24, 6), ironMat);
    grip.rotation.x = Math.PI / 3;
    grip.position.set(0, -0.03, 0.38);
    barrelGroup.add(grip);

    // 5. Loaded Barbed Harpoon Spear resting in the trough
    const loadedSpear = new THREE.Group();
    loadedSpear.position.set(0, 0.07, 0);
    barrelGroup.add(loadedSpear);
    this._loadedHarpoonMesh = loadedSpear;

    const spearShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.032, 1.15, 6).rotateX(Math.PI / 2),
      woodMat
    );
    spearShaft.position.set(0, 0, -0.35);
    loadedSpear.add(spearShaft);

    const spearCollar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.036, 0.12, 8).rotateX(Math.PI / 2),
      brassMat
    );
    spearCollar.position.set(0, 0, -0.92);
    loadedSpear.add(spearCollar);

    const spearHead = new THREE.Mesh(
      new THREE.ConeGeometry(0.09, 0.38, 4).rotateX(-Math.PI / 2),
      steelPointMat
    );
    spearHead.position.set(0, 0, -1.16);
    loadedSpear.add(spearHead);

    // Twin angled barbs on the loaded spearhead
    for (const side of [-1, 1]) {
      const barb = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.20), steelPointMat);
      barb.position.set(side * 0.06, 0, -1.06);
      barb.rotation.y = side * -0.48;
      loadedSpear.add(barb);
    }

    this.mesh.add(group);
    this._harpoonLauncherGroup = group;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  _buildMesh() {
    const group = new THREE.Group();
    const l = (this.shipProfile?.grid?.z || 48) * (this.shipScale || 0.10);
    const w = (this.shipProfile?.grid?.x || 24) * (this.shipScale || 0.10);
    const h = (this.shipProfile?.grid?.y || 24) * (this.shipScale || 0.10) * 0.4;

    const hullGeo = new THREE.BoxGeometry(w, h, l);
    const hullMat = new THREE.MeshLambertMaterial({ color: 0x9A5B2E });
    const hullMesh = new THREE.Mesh(hullGeo, hullMat);
    hullMesh.position.set(0, h * 0.5, 0);
    group.add(hullMesh);

    // Mast and sail
    const mastGeo = new THREE.CylinderGeometry(0.08, 0.12, h * 3, 8);
    const mastMat = new THREE.MeshLambertMaterial({ color: 0x5a3418 });
    const mastMesh = new THREE.Mesh(mastGeo, mastMat);
    mastMesh.position.set(0, h * 1.5, 0);
    group.add(mastMesh);

    const sailGeo = new THREE.PlaneGeometry(w * 0.9, h * 1.8);
    const sailMat = new THREE.MeshLambertMaterial({ color: 0xf4eedb, side: THREE.DoubleSide });
    const sailMesh = new THREE.Mesh(sailGeo, sailMat);
    sailMesh.position.set(0, h * 1.8, 0.1);
    group.add(sailMesh);

    return group;
  }
}

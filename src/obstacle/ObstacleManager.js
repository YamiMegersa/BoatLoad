import * as THREE from 'three';
import { emit } from '../core/EventBus.js';
import { OBB } from 'three/examples/jsm/math/OBB.js';
import { WhirlpoolParticles } from './WhirlpoolParticles.js';
import { LevelConfig } from '../core/LevelConfig.js';
import { GamePhase } from '../core/GameState.js';

// ---------------------------------------------------------------------------
// Obstacle descriptor
// ---------------------------------------------------------------------------

/**
 * @typedef {object} ObstacleDesc
 * @property {string}          type     e.g. 'rock', 'barrel'
 * @property {THREE.Mesh}      mesh
 * @property {OBB}             baseOBB   Unrotated, local OBB bounds
 * @property {OBB}             obb       World space OBB
 * @property {THREE.Sphere|null} sphere  Bounding sphere (barrels)
 * @property {number}          scrollSpeed  Z units per second
 * @property {boolean}         active    false = collision disabled, pending removal
 * @property {boolean}         qteResolved  barrel-specific: true = QTE shot succeeded
 * @property {number}          damage    HP to deduct on hit
 * @property {number|null}     pullForce Whirlpool lateral force magnitude
 */

// ---------------------------------------------------------------------------
// Obstacle factory helpers
// ---------------------------------------------------------------------------

const _geo = {
  rock:       new THREE.DodecahedronGeometry(0.9, 0),
  barrel:     new THREE.CylinderGeometry(0.4, 0.4, 0.8, 8),
  wave_small: new THREE.BoxGeometry(2.5, 0.3, 0.8),
  seaweed:    new THREE.PlaneGeometry(3, 2),
  whirlpool:  new THREE.CylinderGeometry(12.0, 0.5, 2.0, 32, 1, true),
};

const _mat = {
  rock:      new THREE.MeshLambertMaterial({ color: 0x555566 }),
  barrel:    new THREE.MeshLambertMaterial({ color: 0x7a4f2a }),
  wave_small: new THREE.MeshPhongMaterial({ color: 0x474b6b, transparent: true, opacity: 0.7 }),
  seaweed:   new THREE.MeshLambertMaterial({ color: 0x2e6b3e, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
};

const _shipBoxScratch = new THREE.Box3();
const _invMatScratch = new THREE.Matrix4();

/**
 * Build an ObstacleDesc from a type string and initial position.
 * @param {string} type
 * @param {{ x:number, z:number }} pos
 * @param {object[]} [rockModels]
 * @param {object[]} [pickupModels]
 * @param {object[]} [seaweedModels]
 * @param {object[]} [waveModels]
 * @param {object[]} [islandModels]
 * @param {object}   [sirenModel]
 * @returns {ObstacleDesc}
 */
export function buildObstacle(type, pos, url, scale, rockModels, pickupModels, seaweedModels, waveModels, islandModels, sirenModel) {
  let mesh;
  let selectedModel = null;
  const targetScale = scale || 1.0;
  if (type === 'wind_zone') {
    mesh = new THREE.Group();
    // Ring
    const ringGeo = new THREE.RingGeometry(9.5, 10.0, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    mesh.add(ring);
    
    // Arrow pointing -Z
    const arrowGeo = new THREE.ConeGeometry(1, 3, 8);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8 });
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.rotation.x = -Math.PI / 2;
    arrow.position.z = -10;
    mesh.add(arrow);
    mesh.scale.setScalar(targetScale);
    // Show wind zone visual only in editor mode
    if (typeof window !== 'undefined' && window.gameState) {
      mesh.visible = window.gameState.currentPhase === GamePhase.EDITOR;
    } else {
      mesh.visible = false;
    }
  } else if (type === 'rock' && rockModels && rockModels.length > 0) {
    if (url) {
      selectedModel = rockModels.find(m => m.url === url) || rockModels[Math.floor(Math.random() * rockModels.length)];
    } else {
      selectedModel = rockModels[Math.floor(Math.random() * rockModels.length)];
    }
    const cloned = selectedModel.scene.clone(true);
    
    cloned.rotation.y = Math.random() * Math.PI * 2;
    cloned.rotation.z = (Math.random() - 0.5) * 0.2;

    // Update matrix world before calculating Box3 bounds!
    cloned.updateMatrixWorld(true);

    // Compute bounds to normalize scale and center
    const tempBox = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    tempBox.getSize(size);
    const center = new THREE.Vector3();
    tempBox.getCenter(center);
    
    // Scale to fit ~1.8 max dimension
    const maxDim = Math.max(size.x, size.y, size.z);
    const normScale = (maxDim > 0) ? (1.8 / maxDim) : 1;
    const finalScale = normScale * targetScale;
    cloned.scale.setScalar(finalScale);
    
    // Center it locally
    cloned.position.set(-center.x * finalScale, -center.y * finalScale, -center.z * finalScale);
    
    mesh = new THREE.Group();
    mesh.add(cloned);
  } else if (type === 'pickup' && pickupModels && pickupModels.length > 0) {
    if (url) {
      selectedModel = pickupModels.find(m => m.url === url) || pickupModels[Math.floor(Math.random() * pickupModels.length)];
    } else {
      selectedModel = pickupModels[Math.floor(Math.random() * pickupModels.length)];
    }
    const cloned = selectedModel.scene.clone(true);
    
    // Pickups bob/spin, but we just set base rotation
    cloned.rotation.y = Math.random() * Math.PI * 2;
    cloned.updateMatrixWorld(true);

    const tempBox = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    tempBox.getSize(size);
    const center = new THREE.Vector3();
    tempBox.getCenter(center);

    // Scale to fit ~1.2 max dimension
    const maxDim = Math.max(size.x, size.y, size.z);
    const normScale = (maxDim > 0) ? (1.2 / maxDim) : 1;
    const finalScale = normScale * targetScale;
    cloned.scale.setScalar(finalScale);
    
    cloned.position.set(-center.x * finalScale, -center.y * finalScale, -center.z * finalScale);
    
    mesh = new THREE.Group();
    mesh.add(cloned);
  } else if (type === 'seaweed' && seaweedModels && seaweedModels.length > 0) {
    if (url) {
      selectedModel = seaweedModels.find(m => m.url === url) || seaweedModels[Math.floor(Math.random() * seaweedModels.length)];
    } else {
      selectedModel = seaweedModels[Math.floor(Math.random() * seaweedModels.length)];
    }
    const cloned = selectedModel.scene.clone(true);
    
    cloned.rotation.y = Math.random() * Math.PI * 2;
    cloned.updateMatrixWorld(true);

    const tempBox = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    tempBox.getSize(size);
    const center = new THREE.Vector3();
    tempBox.getCenter(center);

    const maxDim = Math.max(size.x, size.z); // Seaweed spreads mostly horizontally
    const normScale = (maxDim > 0) ? (3.0 / maxDim) : 1;
    const finalScale = normScale * targetScale;
    cloned.scale.setScalar(finalScale);
    cloned.position.set(-center.x * finalScale, -center.y * finalScale, -center.z * finalScale);
    
    mesh = new THREE.Group();
    mesh.add(cloned);
  } else if (type === 'wave_small' && waveModels && waveModels.length > 0) {
    if (url) {
      selectedModel = waveModels.find(m => m.url === url) || waveModels[Math.floor(Math.random() * waveModels.length)];
    } else {
      selectedModel = waveModels[Math.floor(Math.random() * waveModels.length)];
    }
    const cloned = selectedModel.scene.clone(true);
    
    // Make wave face the ship (rotated 90 degrees)
    cloned.rotation.y = Math.PI / 2; 
    cloned.updateMatrixWorld(true);

    const tempBox = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    tempBox.getSize(size);
    const center = new THREE.Vector3();
    tempBox.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const normScale = (maxDim > 0) ? (2.5 / maxDim) : 1;
    const finalScale = normScale * targetScale;
    cloned.scale.setScalar(finalScale);
    cloned.position.set(-center.x * finalScale, -center.y * finalScale, -center.z * finalScale);
    
    mesh = new THREE.Group();
    mesh.add(cloned);
  } else if (type === 'island' && islandModels && islandModels.length > 0) {
    if (url) {
      selectedModel = islandModels.find(m => m.url === url || (m.url && url && (m.url.endsWith(url.replace(/^(\.\/|\/src\/|\/)/, '')) || url.endsWith(m.url.replace(/^(\.\/|\/src\/|\/)/, ''))))) || islandModels[Math.floor(Math.random() * islandModels.length)];
    } else {
      selectedModel = islandModels[Math.floor(Math.random() * islandModels.length)];
    }
    const cloned = selectedModel.scene.clone(true);
    
    cloned.rotation.y = Math.random() * Math.PI * 2;
    cloned.updateMatrixWorld(true);

    const tempBox = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    tempBox.getSize(size);
    const center = new THREE.Vector3();
    tempBox.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const normScale = (maxDim > 0) ? (40.0 / maxDim) : 1;
    const finalScale = normScale * targetScale;
    cloned.scale.setScalar(finalScale);
    cloned.position.set(-center.x * finalScale, -center.y * finalScale, -center.z * finalScale);
    
    mesh = new THREE.Group();
    mesh.add(cloned);
  } else if (type === 'siren') {
    mesh = new THREE.Group();
    mesh.name = 'siren_obstacle';
    mesh.userData.isSiren = true;
    mesh.userData.obstacleType = 'siren';

    // Use genuine obstacle rock model for the reef base
    const rocks = rockModels || (typeof LevelConfig !== 'undefined' ? LevelConfig._cache?.get('rockModels') : null);
    const selectedRock = rocks?.find(m => m.url?.includes('voxel_Cliff')) ||
                         rocks?.find(m => m.url?.includes('voxel_Rock Large.glb')) ||
                         rocks?.find(m => m.url?.includes('Rock Large')) ||
                         rocks?.[0];

    let rockTopY = 2.4;
    if (selectedRock && selectedRock.scene) {
      const rockClone = selectedRock.scene.clone(true);
      rockClone.updateMatrixWorld(true);
      const rBox = new THREE.Box3().setFromObject(rockClone);
      const rSize = new THREE.Vector3();
      rBox.getSize(rSize);
      const rCenter = new THREE.Vector3();
      rBox.getCenter(rCenter);

      const maxXZ = Math.max(rSize.x, rSize.z) || 1;
      const targetWidth = 4.5 * targetScale;
      const rScale = targetWidth / maxXZ;
      const rScaleY = (rSize.y * rScale < 2.5 * targetScale) ? (2.8 * targetScale / (rSize.y || 1)) : rScale;

      rockClone.scale.set(rScale, rScaleY, rScale);
      rockClone.position.set(
        -rCenter.x * rScale,
        -rBox.min.y * rScaleY - 0.4,
        -rCenter.z * rScale
      );
      mesh.add(rockClone);
      rockTopY = (rBox.max.y - rBox.min.y) * rScaleY - 0.4;
    }

    // Mount Siren.glb model atop the rock
    const sModel = sirenModel || (typeof LevelConfig !== 'undefined' ? LevelConfig._cache?.get('sirenModel') : null);
    if (sModel && sModel.scene) {
      const clone = sModel.scene.clone(true);
      const box = new THREE.Box3().setFromObject(clone);
      const center = new THREE.Vector3();
      box.getCenter(center);
      clone.position.set(-center.x, -box.min.y, -center.z);

      const wrapper = new THREE.Group();
      wrapper.scale.setScalar(2.4 * targetScale);
      wrapper.position.set(0, rockTopY, 0);
      wrapper.add(clone);
      mesh.add(wrapper);
    }

    // Attraction radius ring (exclude from god ray occlusion)
    const sirenRadius = targetScale * 20; // scale controls radius visually
    const ringGeo = new THREE.RingGeometry(sirenRadius - 0.3, sirenRadius, 48);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff66cc, transparent: true, opacity: 0.20, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    ring.userData.noGodRays = true;
    ring.userData.noOcclusion = true;
    mesh.add(ring);
  } else {
    mesh = new THREE.Mesh(_geo[type] ?? _geo.rock, _mat[type] ?? _mat.rock);
    mesh.scale.setScalar(targetScale);
  }

  let particles = null;
  if (type === 'whirlpool') {
    particles = new WhirlpoolParticles(12, 150);
    mesh.add(particles.mesh);
  }

  // Position at origin to calculate local bounds
  mesh.position.set(0, 0, 0);
  mesh.updateMatrixWorld(true);

  const localBox = new THREE.Box3().setFromObject(mesh);
  const baseOBB = new OBB();
  localBox.getCenter(baseOBB.center);
  localBox.getSize(baseOBB.halfSize).multiplyScalar(0.5);


  // Now place it at actual position
  mesh.position.set(pos.x, pos.y !== undefined ? pos.y : 0.5, pos.z);
  mesh.updateMatrixWorld(true);

  const obb = new OBB();
  obb.copy(baseOBB).applyMatrix4(mesh.matrixWorld);

  const sphere = type === 'barrel'
    ? new THREE.Sphere(mesh.position.clone(), 0.5)
    : null;

  return {
    type,
    mesh,
    baseOBB,
    obb,
    sphere,
    assetUrl:     selectedModel ? selectedModel.url : null,
    scale:        targetScale,
    scrollSpeed:  getScrollSpeed(type),
    active:       true,
    qteResolved:  false,
    qteTriggered: false,
    damage:       getDamage(type),
    pullForce:    type === 'whirlpool' ? 8.0 : null,
    particles:    particles,
  };
}

function getScrollSpeed(type) {
  const map = { rock: 8, barrel: 10, wave_small: 12, seaweed: 7, whirlpool: 6, pickup: 10, island: 0 };
  return map[type] ?? 8;
}

function getDamage(type) {
  const map = { rock: 20, barrel: 30, wave_small: 5, seaweed: 0, whirlpool: 10, pickup: 0, island: 50, siren: 20 };
  return map[type] ?? 10;
}

function createSeededRandom(seed) {
  const text = String(seed);
  let state = 2166136261;
  for (let index = 0; index < text.length; index++) {
    state ^= text.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// ObstacleManager
// ---------------------------------------------------------------------------

/**
 * ObstacleManager — spawns, updates, and collides obstacles during the
 * Obstacle Trial phase.
 *
 * Collision strategy:
 *   - Rectangular obstacles (rocks, waves): Box3.intersectsBox
 *   - Round obstacles (barrels):            Box3.intersectsSphere
 *   - Whirlpool:                            pull force applied per-frame, Box3 collision for damage
 *   - Seaweed:                              Box3 collision → speed debuff, no damage
 *
 * Max active obstacles: 30 (per proposal performance target).
 */
export class ObstacleManager {
  constructor() {
    /** @type {ObstacleDesc[]} */
    this._obstacles = [];
    this._scene     = null;
    this.playRadius = 200;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * @param {object} levelCfg
   * @param {THREE.Scene} scene
   * @param {object[]} rockModels
   * @param {object[]} pickupModels
   * @param {object[]} seaweedModels
   * @param {object[]} waveModels
   * @param {object[]} islandModels
   */
  init(levelCfg, scene, rockModels, pickupModels, seaweedModels, waveModels, islandModels, sirenModel, qteSystem) {
    this._scene = scene;
    this._rockModels = rockModels;
    this._pickupModels = pickupModels;
    this._seaweedModels = seaweedModels;
    this._waveModels = waveModels;
    this._islandModels = islandModels;
    this._sirenModel = sirenModel;
    this._qteSystem = qteSystem ?? null;
    this._cannonCfg = levelCfg?.cannon ?? null; // days with a cannon fire manually
    this._obstacles = [];
    this.playRadius = levelCfg.worldSize || 200;
    this._waveTime = 0;
    this._tempCrossWind = new THREE.Vector3();
    this._random = createSeededRandom(levelCfg.obstacleSeed ?? levelCfg.day ?? 1);
    this._hasDock = levelCfg?.hasDock !== false;
    
    this._spawnAllRandomly(levelCfg.obstacles || []);
  }

  /**
   * Update all obstacles. Call once per frame.
   * @param {number} delta         Seconds since last frame
   * @param {import('./PlayerShip.js').PlayerShip} playerShip
   * @param {import('../environment/WindManager.js').WindManager} windManager
   */
  update(delta, playerShip, windManager, voxelTerrain) {
    this._waveTime += delta;
    if (voxelTerrain && playerShip && playerShip.mesh) {
      const shipPos = playerShip.mesh.position;
      const px = shipPos.x;
      const pz = shipPos.z;
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(playerShip.mesh.quaternion).normalize();
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(playerShip.mesh.quaternion).normalize();

      const halfL = (playerShip.baseOBB && playerShip.baseOBB.halfSize.z) || (3.0 * (playerShip.shipScale || 1.0));
      const halfW = (playerShip.baseOBB && playerShip.baseOBB.halfSize.x) || (1.2 * (playerShip.shipScale || 1.0));

      let hit = false;
      let accNx = 0;
      let accNz = 0;
      let hitCount = 0;

      // Sample along keel and hull rails
      const stepL = Math.max(1.0, halfL / 4.0);
      for (let s = -halfL; s <= halfL; s += stepL) {
        const cx = px + forward.x * s;
        const cz = pz + forward.z * s;

        const testPoints = [
          [cx, cz],
          [cx + right.x * halfW, cz + right.z * halfW],
          [cx - right.x * halfW, cz - right.z * halfW]
        ];

        for (const [tx, tz] of testPoints) {
          if (voxelTerrain.hasCollision(tx, tz)) {
            hit = true;
            hitCount++;
            const dx = px - tx;
            const dz = pz - tz;
            const d = Math.hypot(dx, dz) || 0.1;
            accNx += dx / d;
            accNz += dz / d;
          }
        }
      }

      if (hit) {
        let nx = accNx;
        let nz = accNz;
        const nLen = Math.hypot(nx, nz);
        if (nLen > 0.001) {
          nx /= nLen;
          nz /= nLen;
        } else {
          nx = -forward.x;
          nz = -forward.z;
        }

        // Determine slide tangent along terrain boundary (aligned with forward movement)
        let tx = -nz, tz = nx;
        if (forward.x * tx + forward.z * tz < 0) {
          tx = nz;
          tz = -nx;
        }

        const contactNormal = new THREE.Vector3(nx, 0, nz);
        const contactPoint = new THREE.Vector3(px - nx * 1.5, shipPos.y, pz - nz * 1.5);
        const forwardSpeed = playerShip.getCurrentSpeed ? playerShip.getCurrentSpeed() : (playerShip._isHalted ? 0 : 15.0 * (playerShip.speedMultiplier || 1.0));
        const inDot = forward.x * nx + forward.z * nz;
        const closingSpeed = Math.max(0, -inDot * forwardSpeed);
        const vt = Math.max(0, forward.x * tx + forward.z * tz) * forwardSpeed;

        const now = performance.now();
        const isNewContact = !this._islandContactState || (now - this._islandContactState.lastContactTime > 1500);

        this._islandContactState = this._islandContactState || { grindDistance: 0 };
        this._islandContactState.lastContactTime = now;

        // 1. Damage and impact: only trigger on genuine new impact with significant closing speed (>= 2.0 m/s)
        if (isNewContact && closingSpeed >= 2.0) {
          this._islandContactState.grindDistance = 0;
          if (typeof playerShip.applyPhysicalImpact === 'function') {
            playerShip.applyPhysicalImpact(contactPoint, contactNormal, closingSpeed, 'island', 40);
          } else {
            playerShip.takeDamage(40, 'island', { nx, nz });
          }
          emit('obstacleHit', { type: 'island', damage: 40 });
        } else {
          // Continuous contact: scrape friction and wear only when actually sliding
          if (typeof playerShip.scrubSpeed === 'function' && vt > 1.0) {
            playerShip.scrubSpeed(delta * 0.4 * (vt / 10.0));
          }
          if (vt > 1.5) {
            this._islandContactState.grindDistance += vt * delta;
            if (this._islandContactState.grindDistance >= 4.0) {
              this._islandContactState.grindDistance = 0;
              if (typeof playerShip.applyGrindDamage === 'function') {
                playerShip.applyGrindDamage(contactPoint, contactNormal, 'island');
              }
            }
          }
        }

        // If bow is facing into land, enter grounded/blocked state (zero forward momentum into land, free to turn)
        if (inDot < -0.05 && typeof playerShip.setBlocked === 'function') {
          playerShip.setBlocked(contactNormal);
        }

        // 2. Physical push out to prevent clipping into terrain (smooth, proportional)
        const pushDist = Math.min(0.06 * hitCount + 0.01, 0.20);
        playerShip.mesh.position.x += nx * pushDist;
        playerShip.mesh.position.z += nz * pushDist;

        // 3. Sliding physics: cancel inward component and glide smoothly along tangent (only when not blocked)
        if (inDot < 0 && !playerShip.isBlocked()) {
          const inStep = inDot * forwardSpeed * delta;
          playerShip.mesh.position.x -= inStep * nx;
          playerShip.mesh.position.z -= inStep * nz;

          const frictionLoss = 0.06 * vt * delta;
          playerShip.mesh.position.x -= tx * frictionLoss;
          playerShip.mesh.position.z -= tz * frictionLoss;
        }

        // Cancel residual knockback velocity pushing into terrain
        if (playerShip.knockbackVelocity && playerShip.knockbackVelocity.lengthSq() > 0.001) {
          const knockDot = playerShip.knockbackVelocity.x * nx + playerShip.knockbackVelocity.z * nz;
          if (knockDot < 0) {
            playerShip.knockbackVelocity.x -= knockDot * nx;
            playerShip.knockbackVelocity.z -= knockDot * nz;
          }
        }

        // Smooth rudder deflection to guide ship along terrain (proportional, avoiding sign jitter)
        // Only apply when gliding along terrain, NOT when grounded head-on (to avoid fighting player rudder)
        if (!playerShip.isBlocked()) {
          const cross = forward.x * tz - forward.z * tx;
          if (Math.abs(cross) > 0.02) {
            const steerNudge = THREE.MathUtils.clamp(cross * 2.0, -1.5, 1.5) * delta;
            playerShip.yawVelocity += steerNudge;
          }
        }

        // Keep ship collision volume synchronized
        playerShip.mesh.updateMatrixWorld(true);
        if (playerShip.obb && playerShip.baseOBB) {
          playerShip.obb.copy(playerShip.baseOBB).applyMatrix4(playerShip.mesh.matrixWorld);
        }
      }
    }

    for (const obs of this._obstacles) {
      if (!obs.active) continue;

      let distSq = undefined;
      // Distance culling with hysteresis: hide distant meshes to prevent GPU vertex overload
      if (playerShip && playerShip.mesh) {
        const dx = obs.mesh.position.x - playerShip.mesh.position.x;
        const dz = obs.mesh.position.z - playerShip.mesh.position.z;
        distSq = dx * dx + dz * dz;

        // Large landmarks (islands, sirens) stay visible out to the camera far plane
        // (never less than 180m); smaller obstacles (rocks, barrels, seaweed, waves) cull at 135m.
        const isLarge = (obs.type === 'island' || obs.type === 'siren');
        const far = (typeof window !== 'undefined' && window.gameState?.activeCamera?.far) || 0;
        const largeShow = Math.max(180, far - 20);
        const largeHide = largeShow + 15;
        const showDistSq = isLarge ? (largeShow * largeShow) : (135 * 135);
        const hideDistSq = isLarge ? (largeHide * largeHide) : (150 * 150);

        if (obs.mesh.visible && distSq > hideDistSq) {
          obs.mesh.visible = false;
        } else if (!obs.mesh.visible && distSq <= showDistSq) {
          obs.mesh.visible = true;
        }

        // When far away and not visible, skip costly per-frame matrix & collision computations
        if (!obs.mesh.visible && distSq > 900) { // 30m squared = 900
          continue;
        }
      }

      // Only waves move, according to wind direction
      if (obs.type === 'wave_small' && windManager) {
        if (!this._tempWind) this._tempWind = new THREE.Vector3();
        const localWind = windManager.getWindAt(obs.mesh.position.x, obs.mesh.position.z, this._tempWind);
        const drift = obs.scrollSpeed * 0.25 * delta;
        obs.mesh.position.addScaledVector(localWind, drift);
        const crossWind = this._tempCrossWind.set(-localWind.z, 0, localWind.x);
        const sway = Math.sin(this._waveTime * 0.55 + obs.wavePhase) * obs.scrollSpeed * 0.18 * delta;
        obs.mesh.position.addScaledVector(crossWind, sway);
        
        if (obs.mesh.position.x > this.playRadius) obs.mesh.position.x = -this.playRadius;
        else if (obs.mesh.position.x < -this.playRadius) obs.mesh.position.x = this.playRadius;
        if (obs.mesh.position.z > this.playRadius) obs.mesh.position.z = -this.playRadius;
        else if (obs.mesh.position.z < -this.playRadius) obs.mesh.position.z = this.playRadius;
      }

      if (obs.particles) {
        obs.particles.update(delta);
      }

      // Update bounding volumes: only waves move dynamically; static obstacles are cached once
      if (obs.type === 'wave_small' || !obs._matrixInitialized) {
        obs.mesh.updateMatrixWorld(true);
        obs.obb.copy(obs.baseOBB).applyMatrix4(obs.mesh.matrixWorld);
        if (obs.sphere) obs.sphere.center.copy(obs.mesh.position);
        if (obs.type !== 'wave_small') {
          obs.mesh.matrixAutoUpdate = false;
          obs._matrixInitialized = true;
        }
      }

      this._triggerBarrelQTE(obs, playerShip, distSq);

      // Check collision
      this._checkCollision(obs, playerShip, delta, distSq);
    }
  }

  /**
   * Free all GPU resources. Call on phase exit.
   */
  dispose() {
    for (const obs of this._obstacles) {
      this._scene?.remove(obs.mesh);
      // For procedural geometries, we dispose. For groups (rocks), we might need to dispose children's geometries/materials
      // if not cached. Since models are cached by LevelConfig, we don't dispose their geometries to avoid breaking clones later.
      if (obs.mesh.geometry) obs.mesh.geometry.dispose();
    }
    this._obstacles.length = 0;
    this._scene = null;
    this._rockModels = null;
    this._qteSystem = null;
  }

  // -------------------------------------------------------------------------
  // Collision resolution
  // -------------------------------------------------------------------------

  /**
   * @param {ObstacleDesc} obs
   * @param {import('./PlayerShip.js').PlayerShip} ship
   * @param {number} delta
   * @param {number} [distSq]
   */
  _checkCollision(obs, ship, delta, distSq) {
    // Ignore wind zones for collision
    if (obs.type === 'wind_zone') return;

    // Ignore dock obstacles when ship is moored, halted during countdown, or has departure immunity
    if (obs.isDockObstacle && (ship.isImmune() || ship._isHalted)) return;

    // Broadphase proximity gating: skip costly OBB SAT and BVH if obstacle cannot possibly collide
    if (distSq !== undefined) {
      if (obs.type === 'island') {
        if (distSq > 1600) return; // 40m radius
      } else if (obs.type === 'whirlpool') {
        const pullRadius = 12.0 * (obs.scale || 1.0);
        if (distSq > pullRadius * pullRadius) return;
      } else {
        if (distSq > 400) return; // 20m radius for rocks, waves, barrels, seaweed, sirens
      }
    }

    // Whirlpool applies a continuous radial pull
    if (obs.type === 'whirlpool') {
      const dx = obs.mesh.position.x - ship.mesh.position.x;
      const dz = obs.mesh.position.z - ship.mesh.position.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const pullRadius = 12.0 * obs.scale;

      if (dist < pullRadius) {
        // Stronger pull as you get closer to the center
        const pullSpeed = obs.pullForce * Math.max(0.2, (1.0 - (dist / pullRadius))); 
        
        const dirX = dx / dist;
        const dirZ = dz / dist;
        
        // Radial pull
        ship.mesh.position.x += dirX * pullSpeed * delta;
        ship.mesh.position.z += dirZ * pullSpeed * delta;
        
        // Tangential spiral pull
        ship.mesh.position.x += -dirZ * pullSpeed * 0.6 * delta;
        ship.mesh.position.z += dirX * pullSpeed * 0.6 * delta;

        // Take continuous water damage at the center only when not immune
        if (dist < 2.5 * obs.scale) {
          if (!ship.isImmune() && typeof ship.takeWaterDamage === 'function') {
            ship.takeWaterDamage(obs.damage * delta);
          }
        }
      }
      return;
    }

    // Seaweed — speed debuff zone, no damage
    if (obs.type === 'seaweed') {
      if (ship.obb.intersectsOBB(obs.obb)) {
        ship.applySpeedModifier(0.5, 3);
        obs.active = false; // fire once
      }
      return;
    }

    // Pickup — heals the ship
    if (obs.type === 'pickup') {
      if (ship.obb.intersectsOBB(obs.obb)) {
        obs.active = false;
        if (typeof ship.healDamage === 'function') {
          ship.healDamage(1);
        }
        emit('playSound', { sound: 'success' }); // positive feedback
        obs.mesh.position.z = this._despawnZ + 1; // remove next frame
      }
      return;
    }

    // Barrel — sphere collision; skip if QTE resolved
    if (obs.type === 'barrel') {
      if (obs.qteResolved) { obs.active = false; return; }
      if (ship.obb.intersectsSphere(obs.sphere)) {
        obs.active = false;
        obs.mesh.visible = false;
        const dx = ship.mesh.position.x - obs.mesh.position.x;
        const dz = ship.mesh.position.z - obs.mesh.position.z;
        const contactNormal = new THREE.Vector3(dx, 0, dz).normalize();
        const contactPoint = obs.mesh.position.clone();
        if (typeof ship.applyPhysicalImpact === 'function') {
          ship.applyPhysicalImpact(contactPoint, contactNormal, null, 'barrel', obs.damage || 15);
        } else {
          ship.takeDamage(obs.damage, 'barrel', { nx: dx, nz: dz });
        }
        emit('obstacleHit', { type: 'barrel', damage: obs.damage });
        emit('spawnParticles', { type: 'massiveSplash', position: obs.mesh.position.clone() });
      }
      return;
    }

    // Moving Wave Hazard
    if (obs.type === 'wave_small') {
      if (ship.obb.intersectsOBB(obs.obb)) {
        obs.active = false;
        obs.mesh.visible = false;
        const dx = ship.mesh.position.x - obs.mesh.position.x;
        const dz = ship.mesh.position.z - obs.mesh.position.z;
        const contactNormal = new THREE.Vector3(dx, 0, dz).normalize();
        const contactPoint = ship.mesh.position.clone().addScaledVector(contactNormal, -1.0);
        if (typeof ship.applyPhysicalImpact === 'function') {
          ship.applyPhysicalImpact(contactPoint, contactNormal, null, 'wave_small', obs.damage || 20);
        } else {
          ship.takeDamage(obs.damage, 'wave_small', { nx: dx, nz: dz });
        }
        emit('obstacleHit', { type: 'wave_small', damage: obs.damage });
      }
      return;
    }

    // Solid Obstacles (island, rock, siren, dock island)
    if (ship.obb.intersectsOBB(obs.obb)) {
      if (obs.type === 'island' && !obs.isDockObstacle) {
        // Check if mesh has BVH tree built
        let hasBVH = false;
        obs.mesh.traverse(child => {
          if (child.isMesh && child.geometry?.boundsTree) hasBVH = true;
        });

        if (hasBVH) {
          // Narrowphase Mesh BVH
          const shipBox = _shipBoxScratch.setFromObject(ship.mesh);
          let meshHit = false;
          const invMat = _invMatScratch;
          obs.mesh.traverse(child => {
            if (meshHit || !child.isMesh || !child.geometry?.boundsTree) return;
            invMat.copy(child.matrixWorld).invert();
            if (child.geometry.boundsTree.intersectsBox(shipBox, invMat)) {
              meshHit = true;
            }
          });
          if (meshHit) {
            this._resolveSolidCollision(obs, ship, delta);
          }
          return;
        }
      }
      this._resolveSolidCollision(obs, ship, delta);
    }
  }

  _triggerBarrelQTE(obs, ship, distSq) {
    if (obs.type !== 'barrel' || obs.qteTriggered || !this._qteSystem || !ship) return;
    // Days with a cannon (levelCfg.cannon) shoot barrels manually via the FIRE
    // prompt; the free proximity QTE remains the day-1 tutorial only.
    if (this._cannonCfg) return;
    if (distSq !== undefined ? distSq > 100 : obs.mesh.position.distanceTo(ship.mesh.position) > 10) return;

    const accepted = this._qteSystem.trigger({
      source: 'barrel',
      metadata: { source: 'barrel' },
      onSuccess: () => {
        obs.qteResolved = true;
        obs.active = false;
        obs.mesh.visible = false;
        emit('spawnParticles', { type: 'massiveSplash', position: obs.mesh.position.clone() });
      },
    });
    if (accepted) obs.qteTriggered = true;
  }

  /**
   * Nearest shootable obstacle (barrels today; mines or sharks later) within
   * range of the ship, or null. Powers the cannon FIRE prompt.
   * @param {number} range  World units
   * @param {import('./PlayerShip.js').PlayerShip} ship
   * @returns {ObstacleDesc|null}
   */
  findShootTarget(range, ship) {
    if (!ship) return null;
    let best = null;
    let bestDist = Infinity;
    for (const obs of this._obstacles) {
      if (!obs.active || obs.type !== 'barrel' || obs.qteResolved) continue;
      const dist = obs.mesh.position.distanceTo(ship.mesh.position);
      if (dist <= range && dist < bestDist) {
        best = obs;
        bestDist = dist;
      }
    }
    return best;
  }

  /**
   * Handle physical collision and sliding against solid static obstacles (rocks, islands, sirens).
   * Prevents clipping and damage-looping by resolving physical position & sliding whether immune or not,
   * while only applying damage and collision audio when not immune.
   * @param {ObstacleDesc} obs
   * @param {import('./PlayerShip.js').PlayerShip} ship
   * @param {number} delta
   */
  _resolveSolidCollision(obs, ship, delta) {
    const shipPos = ship.mesh.position;
    const obsPos = obs.mesh.position;

    let nx = 0, nz = 0;
    let contactPoint = null;
    let overlap = 0;

    if (!this._tempObsTarget) this._tempObsTarget = new THREE.Vector3();
    if (!this._tempShipTarget) this._tempShipTarget = new THREE.Vector3();

    if (obs.obb && ship.obb) {
      obs.obb.clampPoint(shipPos, this._tempObsTarget);
      ship.obb.clampPoint(obsPos, this._tempShipTarget);

      nx = shipPos.x - this._tempObsTarget.x;
      nz = shipPos.z - this._tempObsTarget.z;
      contactPoint = this._tempObsTarget.clone();

      const dist = Math.hypot(nx, nz);
      if (dist > 0.001) {
        nx /= dist;
        nz /= dist;
      } else {
        const dx = shipPos.x - obsPos.x;
        const dz = shipPos.z - obsPos.z;
        const d = Math.hypot(dx, dz) || 0.001;
        nx = dx / d;
        nz = dz / d;
      }

      // Penetration depth along normal
      const sepX = this._tempShipTarget.x - this._tempObsTarget.x;
      const sepZ = this._tempShipTarget.z - this._tempObsTarget.z;
      const sepDot = sepX * nx + sepZ * nz;
      overlap = Math.max(0, -sepDot);
    } else {
      const dx = shipPos.x - obsPos.x;
      const dz = shipPos.z - obsPos.z;
      const d = Math.hypot(dx, dz) || 0.001;
      nx = dx / d;
      nz = dz / d;
      contactPoint = shipPos.clone().addScaledVector(new THREE.Vector3(-nx, 0, -nz), 1.5);
      overlap = 0.05;
    }

    // Ship forward heading
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(ship.mesh.quaternion).normalize();

    // Determine slide tangent along obstacle boundary (aligned with forward movement)
    let tx = -nz, tz = nx;
    if (forward.x * tx + forward.z * tz < 0) {
      tx = nz;
      tz = -nx;
    }

    const forwardSpeed = ship.getCurrentSpeed ? ship.getCurrentSpeed() : (ship._isHalted ? 0 : 15.0 * (ship.speedMultiplier || 1.0));
    const inDot = forward.x * nx + forward.z * nz;
    const closingSpeed = Math.max(0, -inDot * forwardSpeed);
    const vt = Math.max(0, forward.x * tx + forward.z * tz) * forwardSpeed;

    const now = performance.now();
    const isNewContact = !obs._contactState || (now - obs._contactState.lastContactTime > 1500);

    obs._contactState = obs._contactState || { grindDistance: 0 };
    obs._contactState.lastContactTime = now;

    // 1. PHYSICAL IMPACT / DAMAGE: only trigger if genuine impact (closingSpeed >= 2.0 m/s) on new contact
    if (isNewContact && closingSpeed >= 2.0) {
      obs._contactState.grindDistance = 0;
      if (typeof ship.applyPhysicalImpact === 'function') {
        ship.applyPhysicalImpact(contactPoint, new THREE.Vector3(nx, 0, nz), closingSpeed, obs.type, obs.damage || 25);
      } else {
        ship.takeDamage(obs.damage, obs.type, { nx, nz });
      }
      emit('obstacleHit', { type: obs.type, damage: obs.damage || 25 });
    } else {
      // Continuous contact: scrape friction and wear only when sliding
      if (typeof ship.scrubSpeed === 'function' && vt > 1.0) {
        ship.scrubSpeed(delta * 0.4 * (vt / 10.0));
      }
      if (vt > 1.5) {
        obs._contactState.grindDistance += vt * delta;
        if (obs._contactState.grindDistance >= 4.0) {
          obs._contactState.grindDistance = 0;
          if (typeof ship.applyGrindDamage === 'function') {
            ship.applyGrindDamage(contactPoint, new THREE.Vector3(nx, 0, nz), obs.type);
          }
        }
      }
    }

    // If bow is facing into obstacle, enter grounded/blocked state (zero forward momentum into rock, free to turn)
    if (inDot < -0.05 && typeof ship.setBlocked === 'function') {
      ship.setBlocked(new THREE.Vector3(nx, 0, nz));
    }

    // 2. SMOOTH PENETRATION RESOLUTION (No jittery fixed-pop or teleportation)
    const pushDist = Math.min(overlap + 0.01, 0.20);
    if (pushDist > 0.001) {
      ship.mesh.position.x += nx * pushDist;
      ship.mesh.position.z += nz * pushDist;
    }

    // 3. TANGENTIAL SLIDING (Deflect forward momentum along obstacle surface smoothly, only when not blocked)
    if (inDot < 0 && !ship.isBlocked()) {
      const inStep = inDot * forwardSpeed * delta;
      ship.mesh.position.x -= inStep * nx;
      ship.mesh.position.z -= inStep * nz;

      // Gentle surface friction during sliding
      const friction = obs.type === 'island' ? 0.94 : 0.97;
      const frictionLoss = (1.0 - friction) * vt * delta;
      ship.mesh.position.x -= tx * frictionLoss;
      ship.mesh.position.z -= tz * frictionLoss;
    }

    // Damp any residual knockback velocity
    if (ship.knockbackVelocity && ship.knockbackVelocity.lengthSq() > 0.001) {
      const knockDot = ship.knockbackVelocity.x * nx + ship.knockbackVelocity.z * nz;
      if (knockDot < 0) {
        ship.knockbackVelocity.x -= knockDot * nx;
        ship.knockbackVelocity.z -= knockDot * nz;
      }
    }

    // Smooth rudder deflection to guide ship along tangent (proportional, avoiding sign jitter)
    // Only apply when gliding along obstacles, NOT when grounded head-on (to avoid fighting player rudder)
    if (!ship.isBlocked()) {
      const cross = forward.x * tz - forward.z * tx;
      if (Math.abs(cross) > 0.02) {
        const steerNudge = THREE.MathUtils.clamp(cross * 2.0, -1.5, 1.5) * delta;
        ship.yawVelocity += steerNudge;
      }
    }

    // Keep ship OBB in sync
    ship.mesh.updateMatrixWorld(true);
    if (ship.obb && ship.baseOBB) {
      ship.obb.copy(ship.baseOBB).applyMatrix4(ship.mesh.matrixWorld);
    }
  }

  /** Backwards compatible alias */
  _resolveHit(obs, ship) {
    this._resolveSolidCollision(obs, ship, 0.016);
  }

  // -------------------------------------------------------------------------
  // Spawning
  // -------------------------------------------------------------------------

  _spawnAllRandomly(configs) {
    // Determine counts per type and collect explicit positions
    const counts = { pickup: 10 }; // always sprinkle some random pickups
    const explicitSpawns = [];

    for (const cfg of configs) {
      if (cfg.position) {
        // Explicitly placed obstacle
        explicitSpawns.push(cfg);
      } else {
        // Randomly placed obstacle
        const count = cfg.count ?? 3;
        counts[cfg.type] = (counts[cfg.type] || 0) + count;
      }
    }
    
    // Spawn explicit obstacles first
    for (const cfg of explicitSpawns) {
      const obs = buildObstacle(
        cfg.type,
        { x: cfg.position.x, y: cfg.position.y, z: cfg.position.z },
        cfg.assetUrl,
        cfg.scale || 1.0,
        this._rockModels,
        this._pickupModels,
        this._seaweedModels,
        this._waveModels,
        this._islandModels,
        this._sirenModel
      );
      obs.wavePhase = this._random() * Math.PI * 2;
      this._scene.add(obs.mesh);
      this._obstacles.push(obs);
    }

    // Spawn random obstacles
    for (const [type, count] of Object.entries(counts)) {
      for (let i = 0; i < count; i++) {
        let px = 0;
        let pz = 0;
        let attempts = 0;
        do {
          const radius = 30 + this._random() * (this.playRadius - 30);
          const angle = this._random() * Math.PI * 2;
          px = Math.cos(angle) * radius;
          pz = Math.sin(angle) * radius;
          attempts++;
        } while (
          attempts < 40 &&
          (
            (this._hasDock && px >= -70 && px <= 20 && pz >= -30 && pz <= 30) ||
            this._obstacles.some(existing =>
              Math.hypot(existing.mesh.position.x - px, existing.mesh.position.z - pz) < 8
            )
          )
        );

        const obs = buildObstacle(
          type,
          { x: px, y: 0.5, z: pz },
          null, // Random url
          1.0,  // Default scale for random spawns
          this._rockModels,
          this._pickupModels,
          this._seaweedModels,
          this._waveModels,
          this._islandModels,
          this._sirenModel
        );
        obs.wavePhase = this._random() * Math.PI * 2;
        this._scene.add(obs.mesh);
        this._obstacles.push(obs);
      }
    }

    // Register solid colliders for the Dock Island and Piers
    if (this._hasDock) {
      const createDockCollider = (center, halfSize, name) => {
        const dummyMesh = new THREE.Object3D();
        dummyMesh.name = name;
        dummyMesh.position.copy(center);
        dummyMesh.updateMatrixWorld(true);

        const baseOBB = new OBB();
        baseOBB.center.set(0, 0, 0); // Local space mesh origin!
        baseOBB.halfSize.copy(halfSize);

        const obb = new OBB();
        obb.copy(baseOBB).applyMatrix4(dummyMesh.matrixWorld);

        return {
          type: 'island',
          mesh: dummyMesh,
          baseOBB,
          obb,
          damage: 15,
          active: true,
          scrollSpeed: 0,
          qteResolved: false,
          qteTriggered: false,
          isDockObstacle: true
        };
      };

      // 1. Main Island Landmass & Bluffs: covers the large rocky island bluffs (leaving sailing channel at X <= -52 completely clear)
      this._obstacles.push(createDockCollider(
        new THREE.Vector3(-26.0, 1.5, 0.0),
        new THREE.Vector3(15.0, 6.0, 11.0),
        'dockIslandMain'
      ));

      // 2. East Dock Pier & Shop platform
      this._obstacles.push(createDockCollider(
        new THREE.Vector3(0.0, 1.0, 1.0),
        new THREE.Vector3(6.5, 4.0, 4.0),
        'dockPierEast'
      ));
    }
  }
}

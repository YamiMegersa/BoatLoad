import * as THREE from 'three';
import { emit } from '../core/EventBus.js';
import { OBB } from 'three/examples/jsm/math/OBB.js';

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
  whirlpool:  new THREE.CylinderGeometry(1.5, 0.3, 0.5, 16, 1, true),
};

const _mat = {
  rock:      new THREE.MeshLambertMaterial({ color: 0x555566 }),
  barrel:    new THREE.MeshLambertMaterial({ color: 0x7a4f2a }),
  wave_small: new THREE.MeshPhongMaterial({ color: 0x474b6b, transparent: true, opacity: 0.7 }),
  seaweed:   new THREE.MeshLambertMaterial({ color: 0x2e6b3e, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
  whirlpool: new THREE.MeshPhongMaterial({ color: 0x222233, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
};

/**
 * Build an ObstacleDesc from a type string and initial position.
 * @param {string} type
 * @param {{ x:number, z:number }} pos
 * @param {object[]} [rockModels]
 * @param {object[]} [pickupModels]
 * @param {object[]} [seaweedModels]
 * @param {object[]} [waveModels]
 * @returns {ObstacleDesc}
 */
export function buildObstacle(type, pos, url, scale, rockModels, pickupModels, seaweedModels, waveModels, islandModels) {
  let mesh;
  let selectedModel = null;
  const targetScale = scale || 1.0;
  if (type === 'rock' && rockModels && rockModels.length > 0) {
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
      selectedModel = islandModels.find(m => m.url === url) || islandModels[Math.floor(Math.random() * islandModels.length)];
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
  } else {
    mesh = new THREE.Mesh(_geo[type] ?? _geo.rock, _mat[type] ?? _mat.rock);
  }

  // Position at origin to calculate local bounds
  mesh.position.set(0, 0, 0);
  mesh.updateMatrixWorld(true);

  const localBox = new THREE.Box3().setFromObject(mesh);
  const baseOBB = new OBB();
  localBox.getCenter(baseOBB.center);
  localBox.getSize(baseOBB.halfSize).multiplyScalar(0.5);

  // HITBOX VISUALIZATION
  if (type === 'barrel') {
    const sphereGeo = new THREE.WireframeGeometry(new THREE.SphereGeometry(0.5, 8, 8));
    const sphereMesh = new THREE.LineSegments(sphereGeo, new THREE.LineBasicMaterial({ color: 0xff0000 }));
    mesh.add(sphereMesh);
  } else if (type !== 'island') { // Don't draw giant AABB for islands since they use BVH
    const wireMat = new THREE.LineBasicMaterial({ color: 0xff0000 });
    const wireGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(baseOBB.halfSize.x * 2, baseOBB.halfSize.y * 2, baseOBB.halfSize.z * 2));
    const wireMesh = new THREE.LineSegments(wireGeo, wireMat);
    wireMesh.position.copy(baseOBB.center);
    mesh.add(wireMesh);
  }

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
    damage:       getDamage(type),
    pullForce:    type === 'whirlpool' ? 2.0 : null,
  };
}

function getScrollSpeed(type) {
  const map = { rock: 8, barrel: 10, wave_small: 12, seaweed: 7, whirlpool: 6, pickup: 10, island: 0 };
  return map[type] ?? 8;
}

function getDamage(type) {
  const map = { rock: 20, barrel: 30, wave_small: 5, seaweed: 0, whirlpool: 10, pickup: 0, island: 50 };
  return map[type] ?? 10;
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
  init(levelCfg, scene, rockModels, pickupModels, seaweedModels, waveModels, islandModels) {
    this._scene = scene;
    this._rockModels = rockModels;
    this._pickupModels = pickupModels;
    this._seaweedModels = seaweedModels;
    this._waveModels = waveModels;
    this._islandModels = islandModels;
    this._obstacles = [];
    this.playRadius = levelCfg.worldSize || 200;
    
    this._spawnAllRandomly(levelCfg.obstacles || []);
  }

  /**
   * Update all obstacles. Call once per frame.
   * @param {number} delta         Seconds since last frame
   * @param {import('./PlayerShip.js').PlayerShip} playerShip
   * @param {THREE.Vector3} windDir
   */
  update(delta, playerShip, windDir) {
    for (const obs of this._obstacles) {
      if (!obs.active) continue;

      // Only waves move, according to wind direction
      if (obs.type === 'wave_small' && windDir) {
        obs.mesh.position.x += windDir.x * obs.scrollSpeed * delta;
        obs.mesh.position.z += windDir.z * obs.scrollSpeed * delta;

        // Wrap around if they go out of bounds
        const dist = Math.hypot(obs.mesh.position.x, obs.mesh.position.z);
        if (dist > this.playRadius + 20) {
          // Push to the opposite edge
          obs.mesh.position.x = -windDir.x * this.playRadius;
          obs.mesh.position.z = -windDir.z * this.playRadius;
        }
      }

      // Update bounding volumes
      obs.mesh.updateMatrixWorld(true);
      obs.obb.copy(obs.baseOBB).applyMatrix4(obs.mesh.matrixWorld);
      if (obs.sphere) obs.sphere.center.copy(obs.mesh.position);

      // Check collision
      this._checkCollision(obs, playerShip, delta);
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
  }

  // -------------------------------------------------------------------------
  // Collision resolution
  // -------------------------------------------------------------------------

  /**
   * @param {ObstacleDesc} obs
   * @param {import('./PlayerShip.js').PlayerShip} ship
   * @param {number} delta
   */
  _checkCollision(obs, ship, delta) {
    // Ignore hazards while immune (pickups can still be collected)
    if (ship.isImmune() && obs.type !== 'pickup') return;

    // Whirlpool applies a continuous lateral pull
    if (obs.type === 'whirlpool') {
      const hit = ship.obb.intersectsOBB(obs.obb);
      if (hit) {
        const sign = obs.mesh.position.x < ship.mesh.position.x ? -1 : 1;
        ship.mesh.position.x += sign * obs.pullForce * delta;
        ship.takeDamage(obs.damage * delta, obs.type); // continuous trickle damage
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
        this._resolveHit(obs, ship);
      }
      return;
    }

    // Default OBB collision (rock, wave_small)
    if (ship.obb.intersectsOBB(obs.obb)) {
      if (obs.type === 'island') {
        // Narrowphase Mesh BVH
        const shipBox = new THREE.Box3().setFromObject(ship.mesh);
        let meshHit = false;
        const invMat = new THREE.Matrix4();
        obs.mesh.traverse(child => {
          if (meshHit || !child.isMesh || !child.geometry.boundsTree) return;
          invMat.copy(child.matrixWorld).invert();
          if (child.geometry.boundsTree.intersectsBox(shipBox, invMat)) {
            meshHit = true;
          }
        });
        if (meshHit) {
          this._resolveHit(obs, ship);
        }
      } else {
        this._resolveHit(obs, ship);
      }
    }
  }

  /**
   * Handle a confirmed collision hit.
   * @param {ObstacleDesc} obs
   * @param {import('./PlayerShip.js').PlayerShip} ship
   */
  _resolveHit(obs, ship) {
    if (obs.type !== 'rock' && obs.type !== 'island') {
      obs.active = false;
      obs.mesh.visible = false;
    }

    ship.takeDamage(obs.damage, obs.type);
    ship.setImmune(2.0); // 2 seconds of immunity after getting hit

    const dx = ship.mesh.position.x - obs.mesh.position.x;
    const dz = ship.mesh.position.z - obs.mesh.position.z;
    ship.bounceBack(dx, dz, obs.type);

    if (obs.type === 'rock' || obs.type === 'island') {
      // Act as a static obstacle: push the ship away so it doesn't pass through
      const dx = ship.mesh.position.x - obs.mesh.position.x;
      const dz = ship.mesh.position.z - obs.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.001) {
        // Immediate static resolve to avoid sticking
        ship.mesh.position.x += (dx / dist) * 2.5;
        ship.mesh.position.z += (dz / dist) * 2.5;
        
        // Pinball knockback velocity
        ship.applyKnockback(new THREE.Vector3((dx / dist) * 40, 0, (dz / dist) * 40));
      }
    }

    emit('obstacleHit', { type: obs.type, damage: obs.damage });
    emit('playSound', { sound: 'collision' });
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
        counts[cfg.type] = (counts[cfg.type] || 0) + count * 5; // Multiply by 5 for a larger 2D area
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
        this._islandModels
      );
      this._scene.add(obs.mesh);
      this._obstacles.push(obs);
    }

    // Spawn random obstacles
    for (const [type, count] of Object.entries(counts)) {
      for (let i = 0; i < count; i++) {
        // Random position within radius (avoiding the immediate center r<30)
        let r = 30 + Math.random() * (this.playRadius - 30);
        let theta = Math.random() * Math.PI * 2;
        let px = Math.cos(theta) * r;
        let pz = Math.sin(theta) * r;

        const obs = buildObstacle(
          type,
          { x: px, y: 0.5, z: pz },
          null, // Random url
          1.0,  // Default scale for random spawns
          this._rockModels,
          this._pickupModels,
          this._seaweedModels,
          this._waveModels,
          this._islandModels
        );
        this._scene.add(obs.mesh);
        this._obstacles.push(obs);
      }
    }
  }
}

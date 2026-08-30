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
 * @returns {ObstacleDesc}
 */
function buildObstacle(type, pos, rockModels) {
  let mesh;
  if (type === 'rock' && rockModels && rockModels.length > 0) {
    const randomGltf = rockModels[Math.floor(Math.random() * rockModels.length)];
    const cloned = randomGltf.scene.clone(true);
    
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
    const scale = (maxDim > 0) ? (1.8 / maxDim) : 1;
    cloned.scale.setScalar(scale);
    
    // Center it locally
    cloned.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    
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

  // Now place it at actual position
  mesh.position.set(pos.x, 0.5, pos.z);
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
    scrollSpeed:  getScrollSpeed(type),
    active:       true,
    qteResolved:  false,
    damage:       getDamage(type),
    pullForce:    type === 'whirlpool' ? 2.0 : null,
  };
}

function getScrollSpeed(type) {
  const map = { rock: 8, barrel: 10, wave_small: 12, seaweed: 7, whirlpool: 6 };
  return map[type] ?? 8;
}

function getDamage(type) {
  const map = { rock: 20, barrel: 30, wave_small: 5, seaweed: 0, whirlpool: 10 };
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
    this._spawnZ    = -40; // Start Z for new obstacles
    this._despawnZ  =  15; // Remove obstacles that scroll past this Z

    /** Queued spawn definitions from the level config. */
    this._spawnQueue = [];
    this._spawnTimer = 0;
    this._spawnInterval = 2.5; // seconds between spawns
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * @param {object[]} obstacleConfigs  From levelConfig.obstacles
   * @param {THREE.Scene} scene
   * @param {object[]} rockModels
   */
  init(obstacleConfigs, scene, rockModels) {
    this._scene = scene;
    this._rockModels = rockModels;
    this._obstacles = [];
    this._spawnTimer = 0;

    // Build a flat queue of { type, laneX } entries from the config
    this._spawnQueue = this._buildSpawnQueue(obstacleConfigs);
  }

  /**
   * Update all obstacles. Call once per frame.
   * @param {number} delta         Seconds since last frame
   * @param {import('./PlayerShip.js').PlayerShip} playerShip
   */
  update(delta, playerShip) {
    // Spawn next obstacle
    this._spawnTimer += delta;
    if (this._spawnTimer >= this._spawnInterval && this._spawnQueue.length > 0) {
      this._spawnTimer = 0;
      this._spawnNext();
    }

    // Update existing obstacles
    const toRemove = [];
    for (const obs of this._obstacles) {
      // Scroll toward camera
      obs.mesh.position.z += obs.scrollSpeed * delta;

      // Update bounding volumes
      obs.mesh.updateMatrixWorld(true);
      obs.obb.copy(obs.baseOBB).applyMatrix4(obs.mesh.matrixWorld);
      if (obs.sphere) obs.sphere.center.copy(obs.mesh.position);

      // Check collision
      if (obs.active) {
        this._checkCollision(obs, playerShip, delta);
      }

      // Despawn off-screen
      if (obs.mesh.position.z > this._despawnZ) {
        toRemove.push(obs);
      }
    }

    // Remove despawned obstacles
    for (const obs of toRemove) {
      this._remove(obs);
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
      this._resolveHit(obs, ship);
    }
  }

  /**
   * Handle a confirmed collision hit.
   * @param {ObstacleDesc} obs
   * @param {import('./PlayerShip.js').PlayerShip} ship
   */
  _resolveHit(obs, ship) {
    obs.active = false;

    ship.takeDamage(obs.damage, obs.type);

    // Bounce ship away from the obstacle centre
    const dir = ship.mesh.position.x >= obs.mesh.position.x ? 1 : -1;
    ship.bounceBack(dir);

    emit('obstacleHit', { type: obs.type, damage: obs.damage });
    emit('playSound', { sound: 'collision' });

    // Visually remove on next frame — flag it; the update loop will despawn
    obs.mesh.position.z = this._despawnZ + 1;
  }

  // -------------------------------------------------------------------------
  // Spawning
  // -------------------------------------------------------------------------

  _spawnNext() {
    if (this._obstacles.length >= 30) return; // performance cap
    const def = this._spawnQueue.shift();
    if (!def) return;

    const obs = buildObstacle(def.type, { x: def.laneX, z: this._spawnZ }, this._rockModels);
    this._scene.add(obs.mesh);
    this._obstacles.push(obs);
  }

  _remove(obs) {
    this._scene?.remove(obs.mesh);
    if (obs.mesh.geometry) obs.mesh.geometry.dispose();
    const i = this._obstacles.indexOf(obs);
    if (i !== -1) this._obstacles.splice(i, 1);
  }

  /**
   * Convert level config obstacle array into a flat spawn queue.
   * @param {object[]} configs
   * @returns {Array<{type:string, laneX:number}>}
   */
  _buildSpawnQueue(configs) {
    const lanes = [-4, -2, 0, 2, 4]; // 5 lanes on X axis
    const queue = [];

    for (const cfg of configs) {
      const count = cfg.count ?? 3;
      for (let i = 0; i < count; i++) {
        let laneX;
        if (cfg.lanePattern === 'alternating') {
          laneX = lanes[i % lanes.length];
        } else {
          laneX = lanes[Math.floor(Math.random() * lanes.length)];
        }
        queue.push({ type: cfg.type, laneX });
      }
    }

    // Shuffle to avoid all of one type spawning consecutively
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }

    return queue;
  }
}

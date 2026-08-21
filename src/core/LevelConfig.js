import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * LevelConfig — loads and caches ship definition and level config JSONs.
 *
 * Usage:
 *   const { shipDef, levelCfg, rockModels } = await LevelConfig.load(1);
 */
export class LevelConfig {
  /** @type {Map<string, any>} */
  static _cache = new Map();

  static _rockUrls = [
    '/src/assets/rocks/voxel_basic stone 3.glb',
    '/src/assets/rocks/voxel_Cliff.glb',
    '/src/assets/rocks/voxel_Desert Pillar.glb',
    '/src/assets/rocks/voxel_Little Desert Town.glb',
    '/src/assets/rocks/voxel_Rock by Danni Bittman - 4TpBWdzKDf2.glb',
    '/src/assets/rocks/voxel_Rock by Quaternius - RtLRqYjfMs.glb',
    '/src/assets/rocks/voxel_Rock Large by Quaternius - d2VWOdthtR.glb',
    '/src/assets/rocks/voxel_Rock Large-d2VWOdthtR.glb',
    '/src/assets/rocks/voxel_Rock Large.glb',
    '/src/assets/rocks/voxel_Rock-34W5ymEePk.glb',
    '/src/assets/rocks/voxel_Rock-4MUaQTcDdc.glb',
    '/src/assets/rocks/voxel_Rock-4TpBWdzKDf2.glb',
    '/src/assets/rocks/voxel_Rock-b7gRkv0cEa.glb',
    '/src/assets/rocks/voxel_Rock-JmFMh7ztL9.glb',
    '/src/assets/rocks/voxel_Rock-R2UjZAX3By.glb',
    '/src/assets/rocks/voxel_Rock-RtLRqYjfMs.glb',
    '/src/assets/rocks/voxel_Rock.glb',
    '/src/assets/rocks/voxel_Rocks by Quaternius - OQvi8PIZ40.glb',
    '/src/assets/rocks/voxel_Rocks.glb'
  ];

  /**
   * Load the ship definition and level config for a given day.
   * Results are cached so repeated loads are instant.
   *
   * @param {number} day
   * @returns {Promise<{ shipDef: object, levelCfg: object, rockModels: object[] }>}
   */
  static async load(day) {
    const levelKey = `day${day}`;
    if (!LevelConfig._cache.has(levelKey)) {
      const levelCfg = await LevelConfig._fetchJson(`/src/assets/levels/day${day}.json`);
      LevelConfig._cache.set(levelKey, levelCfg);
    }
    const levelCfg = LevelConfig._cache.get(levelKey);

    const shipKey = levelCfg.ship;
    if (!LevelConfig._cache.has(shipKey)) {
      const shipDef = await LevelConfig._fetchJson(`/src/assets/ships/${shipKey}.json`);
      LevelConfig._cache.set(shipKey, shipDef);
    }
    const shipDef = LevelConfig._cache.get(shipKey);

    // Preload all rocks if not cached
    if (!LevelConfig._cache.has('rockModels')) {
      const rockModels = await LevelConfig._loadRockModels();
      LevelConfig._cache.set('rockModels', rockModels);
    }
    const rockModels = LevelConfig._cache.get('rockModels');

    // Preload fish if not cached
    if (!LevelConfig._cache.has('fishModel')) {
      const loader = new GLTFLoader();
      const fishModel = await new Promise((resolve, reject) => {
        loader.load('/src/assets/fish/shark.glb', resolve, undefined, reject);
      });

      // Pre-compute normalization scale by temporarily parenting the scene
      // to a real THREE.Scene so updateMatrixWorld propagates the Armature's
      // 100x scale correctly. Without this, Box3 measures identity-space and
      // returns the wrong size, causing sharks to render at 100x actual size.
      const dummyScene = new THREE.Scene();
      dummyScene.add(fishModel.scene);
      dummyScene.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(fishModel.scene);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      fishModel.normSharkScale = (maxDim > 0) ? (4.0 / maxDim) : 1;

      // Remove from dummy scene — it will be re-added to the real scene later
      dummyScene.remove(fishModel.scene);

      LevelConfig._cache.set('fishModel', fishModel);
    }
    const fishModel = LevelConfig._cache.get('fishModel');

    return { shipDef, levelCfg, rockModels, fishModel };
  }

  static async _loadRockModels() {
    const loader = new GLTFLoader();
    
    // Load all rocks concurrently
    const loadedGltfs = await Promise.all(
      LevelConfig._rockUrls.map(url => new Promise((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
      }))
    );
    
    return loadedGltfs; // Array of GLTF objects
  }

  /**
   * @param {string} path
   * @returns {Promise<object>}
   */
  static async _fetchJson(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`LevelConfig: failed to load ${path} (${res.status})`);
    return res.json();
  }
}

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
    '/src/assets/obstacles/rocks/voxel_basic stone 3.glb',
    '/src/assets/obstacles/rocks/voxel_Cliff.glb',
    '/src/assets/obstacles/rocks/voxel_Desert Pillar.glb',
    '/src/assets/obstacles/rocks/voxel_Little Desert Town.glb',
    '/src/assets/obstacles/rocks/voxel_Rock by Danni Bittman - 4TpBWdzKDf2.glb',
    '/src/assets/obstacles/rocks/voxel_Rock by Quaternius - RtLRqYjfMs.glb',
    '/src/assets/obstacles/rocks/voxel_Rock Large by Quaternius - d2VWOdthtR.glb',
    '/src/assets/obstacles/rocks/voxel_Rock Large-d2VWOdthtR.glb',
    '/src/assets/obstacles/rocks/voxel_Rock Large.glb',
    '/src/assets/obstacles/rocks/voxel_Rock-34W5ymEePk.glb',
    '/src/assets/obstacles/rocks/voxel_Rock-4MUaQTcDdc.glb',
    '/src/assets/obstacles/rocks/voxel_Rock-4TpBWdzKDf2.glb',
    '/src/assets/obstacles/rocks/voxel_Rock-b7gRkv0cEa.glb',
    '/src/assets/obstacles/rocks/voxel_Rock-JmFMh7ztL9.glb',
    '/src/assets/obstacles/rocks/voxel_Rock-R2UjZAX3By.glb',
    '/src/assets/obstacles/rocks/voxel_Rock-RtLRqYjfMs.glb',
    '/src/assets/obstacles/rocks/voxel_Rock.glb',
    '/src/assets/obstacles/rocks/voxel_Rocks by Quaternius - OQvi8PIZ40.glb',
    '/src/assets/obstacles/rocks/voxel_Rocks.glb'
  ];

  static _fishUrls = [
    '/src/assets/fish/Dolphin.glb',
    '/src/assets/fish/Fish-BEcU9rjiAq.glb',
    '/src/assets/fish/Fish-XWl86YFtpF.glb',
    '/src/assets/fish/Fish.glb',
    '/src/assets/fish/Manta ray.glb',
    '/src/assets/fish/Shark.glb',
    '/src/assets/fish/Whale.glb'
  ];

  static _pickupUrls = [
    '/src/assets/pickups/Wood Planks by Quaternius - hwQ1Fx5P8U.glb'
  ];

  static _seaweedUrls = [
    '/src/assets/obstacles/seaweed/Kelp by Christopher F - 3VhttTFyADO.glb'
  ];

  static _waveUrls = [
    '/src/assets/obstacles/wave/Wave by Poly by Google - 6mpwUZqCgzy.glb'
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
    if (!LevelConfig._cache.has('fishModels')) {
      const loader = new GLTFLoader();
      const fishModels = await Promise.all(
        LevelConfig._fishUrls.map(url => new Promise((resolve, reject) => {
          loader.load(url, resolve, undefined, reject);
        }))
      );

      fishModels.forEach(fishModel => {
        const dummyScene = new THREE.Scene();
        dummyScene.add(fishModel.scene);
        dummyScene.updateMatrixWorld(true);

        const box = new THREE.Box3().setFromObject(fishModel.scene);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        fishModel.normSharkScale = (maxDim > 0) ? (4.0 / maxDim) : 1;

        dummyScene.remove(fishModel.scene);
      });

      LevelConfig._cache.set('fishModels', fishModels);
    }
    const fishModels = LevelConfig._cache.get('fishModels');

    // Preload pickups if not cached
    if (!LevelConfig._cache.has('pickupModels')) {
      const loader = new GLTFLoader();
      const pickupModels = await Promise.all(
        LevelConfig._pickupUrls.map(url => new Promise((resolve, reject) => {
          loader.load(url, resolve, undefined, reject);
        }))
      );
      LevelConfig._cache.set('pickupModels', pickupModels);
    }
    const pickupModels = LevelConfig._cache.get('pickupModels');

    // Preload seaweed if not cached
    if (!LevelConfig._cache.has('seaweedModels')) {
      const loader = new GLTFLoader();
      const seaweedModels = await Promise.all(
        LevelConfig._seaweedUrls.map(url => new Promise((resolve, reject) => {
          loader.load(url, resolve, undefined, reject);
        }))
      );
      LevelConfig._cache.set('seaweedModels', seaweedModels);
    }
    const seaweedModels = LevelConfig._cache.get('seaweedModels');

    // Preload waves if not cached
    if (!LevelConfig._cache.has('waveModels')) {
      const loader = new GLTFLoader();
      const waveModels = await Promise.all(
        LevelConfig._waveUrls.map(url => new Promise((resolve, reject) => {
          loader.load(url, resolve, undefined, reject);
        }))
      );
      LevelConfig._cache.set('waveModels', waveModels);
    }
    const waveModels = LevelConfig._cache.get('waveModels');

    return { shipDef, levelCfg, rockModels, fishModels, pickupModels, seaweedModels, waveModels };
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

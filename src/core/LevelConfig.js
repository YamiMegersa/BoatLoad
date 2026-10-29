import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { getShipProfile, DEFAULT_SHIP_ID } from '../config/ShipRegistry.js';
import { getAssetUrl } from '../utils/paths.js';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

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
    getAssetUrl('assets/obstacles/rocks/voxel_basic stone 3.glb'),
    getAssetUrl('assets/obstacles/rocks/voxel_Cliff.glb'),
    getAssetUrl('assets/obstacles/rocks/voxel_Desert Pillar.glb'),
    getAssetUrl('assets/obstacles/rocks/voxel_Rock by Danni Bittman - 4TpBWdzKDf2.glb'),
    getAssetUrl('assets/obstacles/rocks/voxel_Rock by Quaternius - RtLRqYjfMs.glb'),
    getAssetUrl('assets/obstacles/rocks/voxel_Rock Large by Quaternius - d2VWOdthtR.glb'),
    getAssetUrl('assets/obstacles/rocks/voxel_Rock Large-d2VWOdthtR.glb'),
    getAssetUrl('assets/obstacles/rocks/voxel_Rock Large.glb'),
    getAssetUrl('assets/obstacles/rocks/voxel_Rock-34W5ymEePk.glb'),
    getAssetUrl('assets/obstacles/rocks/voxel_Rock-4MUaQTcDdc.glb'),
    getAssetUrl('assets/obstacles/rocks/voxel_Rock-4TpBWdzKDf2.glb'),
    getAssetUrl('assets/obstacles/rocks/voxel_Rock-b7gRkv0cEa.glb'),
    getAssetUrl('assets/obstacles/rocks/voxel_Rock-JmFMh7ztL9.glb'),
    getAssetUrl('assets/obstacles/rocks/voxel_Rock-R2UjZAX3By.glb'),
    getAssetUrl('assets/obstacles/rocks/voxel_Rock-RtLRqYjfMs.glb'),
    getAssetUrl('assets/obstacles/rocks/voxel_Rock.glb'),
    getAssetUrl('assets/obstacles/rocks/voxel_Rocks by Quaternius - OQvi8PIZ40.glb'),
    getAssetUrl('assets/obstacles/rocks/voxel_Rocks.glb')
  ];

  static _fishUrls = [
    getAssetUrl('assets/fish/Dolphin.glb'),
    getAssetUrl('assets/fish/Fish-BEcU9rjiAq.glb'),
    getAssetUrl('assets/fish/Fish-XWl86YFtpF.glb'),
    getAssetUrl('assets/fish/Fish.glb'),
    getAssetUrl('assets/fish/Manta ray.glb'),
    getAssetUrl('assets/fish/shark.glb'),
    getAssetUrl('assets/fish/Whale.glb')
  ];

  static _pickupUrls = [
    getAssetUrl('assets/pickups/Wood Planks by Quaternius - hwQ1Fx5P8U.glb')
  ];

  static _seaweedUrls = [
    getAssetUrl('assets/obstacles/seaweed/Kelp by Christopher F - 3VhttTFyADO.glb')
  ];

  static _waveUrls = [
    getAssetUrl('assets/obstacles/wave/Wave by Poly by Google - 6mpwUZqCgzy.glb')
  ];

  static _islandUrls = [
    getAssetUrl('islands/Low-poly landscape by sirkitree - bjsNFfddgOv.glb'),
    getAssetUrl('islands/Mountain by Poly by Google - 7Jhw3p6TusU.glb'),
    getAssetUrl('islands/Mountaintop by Matthew Burdette - 8mWDJgGcXSH.glb')
  ];

  static _sirenUrl = getAssetUrl('assets/enemies/Siren.glb');
  static _krakenUrl = getAssetUrl('assets/enemies/Octopus_mesh_Voxelized.glb');

  static get rockUrls() { return [...this._rockUrls]; }
  static get fishUrls() { return [...this._fishUrls]; }
  static get pickupUrls() { return [...this._pickupUrls]; }
  static get seaweedUrls() { return [...this._seaweedUrls]; }
  static get waveUrls() { return [...this._waveUrls]; }
  static get islandUrls() { return [...this._islandUrls]; }
  static get sirenUrl() { return this._sirenUrl; }
  static get krakenUrl() { return this._krakenUrl; }

  /**
   * Generates a pristine, empty level configuration with only the harbor dock present.
   * Used when initializing the level editor from scratch.
   * @param {object} [overrides]
   * @returns {object}
   */
  static createEmptyLevel(overrides = {}) {
    return {
      ship: DEFAULT_SHIP_ID,
      budget: 300,
      worldSize: 200,
      globalWindDir: 0,
      fogDensity: 0.006,
      timeOfDay: 8.0,
      isStormy: false,
      godRays: true,
      hasDock: true,
      shipSpawn: null,
      endLocation: { position: { x: 0, y: 0, z: -220 }, radius: 16 },
      obstacles: [],
      sirens: [],
      kraken: null,
      voxels: null,
      damage: [],
      ...overrides
    };
  }

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
      const levelCfg = await LevelConfig._fetchJson(getAssetUrl(`assets/levels/day${day}.json`));
      LevelConfig._cache.set(levelKey, levelCfg);
    }
    const levelCfg = LevelConfig._cache.get(levelKey);

    const shipKey = levelCfg.ship || DEFAULT_SHIP_ID;
    const shipDef = LevelConfig.getShipDef(shipKey);

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

      fishModels.forEach((fishModel, i) => {
        fishModel.url = LevelConfig._fishUrls[i];
        
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
      pickupModels.forEach((m, i) => m.url = LevelConfig._pickupUrls[i]);
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
      seaweedModels.forEach((m, i) => m.url = LevelConfig._seaweedUrls[i]);
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
      waveModels.forEach((m, i) => m.url = LevelConfig._waveUrls[i]);
      LevelConfig._cache.set('waveModels', waveModels);
    }
    const waveModels = LevelConfig._cache.get('waveModels');

    if (!LevelConfig._cache.has('islandModels')) {
      const loader = new GLTFLoader();
      const islandModels = await Promise.all(
        LevelConfig._islandUrls.map(url => new Promise((resolve, reject) => {
          loader.load(url, resolve, undefined, reject);
        }))
      );
      islandModels.forEach((m, i) => {
        m.url = LevelConfig._islandUrls[i];
        m.scene.traverse((child) => {
          if (child.isMesh && child.geometry) {
            child.geometry.computeBoundsTree();
          }
        });
      });
      LevelConfig._cache.set('islandModels', islandModels);
    }
    const islandModels = LevelConfig._cache.get('islandModels');

    if (!LevelConfig._cache.has('sirenModel')) {
      const loader = new GLTFLoader();
      const sirenModel = await new Promise((resolve, reject) => {
        loader.load(LevelConfig._sirenUrl, resolve, undefined, reject);
      });
      sirenModel.url = LevelConfig._sirenUrl;
      LevelConfig._cache.set('sirenModel', sirenModel);
    }
    const sirenModel = LevelConfig._cache.get('sirenModel');

    if (!LevelConfig._cache.has('krakenModel')) {
      const loader = new GLTFLoader();
      const krakenModel = await new Promise((resolve, reject) => {
        loader.load(LevelConfig._krakenUrl, resolve, undefined, reject);
      });
      krakenModel.url = LevelConfig._krakenUrl;
      krakenModel.scene.traverse((child) => {
        if (child.isMesh && child.geometry) {
          LevelConfig.repairOctopusMesh(child);
        }
      });
      LevelConfig._cache.set('krakenModel', krakenModel);
    }
    const krakenModel = LevelConfig._cache.get('krakenModel');

    return {
      shipDef,
      levelCfg,
      rockModels,
      fishModels,
      pickupModels,
      seaweedModels,
      waveModels,
      islandModels,
      sirenModel,
      krakenModel
    };
  }

  /**
   * Reconstructs missing UV attributes and configures materials on the Octopus model
   * so Three.js renders its full vibrant texture and colors instead of blank white.
   * @param {THREE.Mesh} child
   */
  static repairOctopusMesh(child) {
    const geo = child.geometry;
    if (geo && !geo.attributes.uv) {
      const pos = geo.attributes.position;
      const norm = geo.attributes.normal;
      const count = pos.count;
      const uvs = new Float32Array(count * 2);

      for (let i = 0; i < count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const ny = norm ? norm.getY(i) : 0;

        const angle = Math.atan2(x - (-1.1), z - (-0.19));
        let normAngle = (angle / (Math.PI * 2) + 0.5);
        let normY = THREE.MathUtils.clamp((y - (-0.04)) / 10.16, 0, 1);

        let u, v;
        if (ny < -0.15 && y < 5.0) {
          // Underside tentacles & suckers: sample from tan/cream region
          u = 0.52 + (normAngle * 0.44);
          v = 0.52 + (normY * 0.44);
        } else {
          // Mantle & upper skin: sample from rich mottled crimson region
          u = 0.02 + (normAngle * 0.46);
          v = 0.05 + (normY * 0.88);
        }

        uvs[i * 2] = u;
        uvs[i * 2 + 1] = v;
      }

      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geo.attributes.uv.needsUpdate = true;
    }

    if (child.material) {
      if (!child.material.map) {
        const tex = new THREE.TextureLoader().load(getAssetUrl('assets/enemies/octopus_texture_extracted.png'));
        tex.colorSpace = THREE.SRGBColorSpace;
        child.material.map = tex;
      }
      child.material.map.colorSpace = THREE.SRGBColorSpace;
      child.material.map.needsUpdate = true;
      child.material.color.setHex(0xffffff); // Pure white so natural texture colors show vividly
      child.material.roughness = 0.35; // Wet marine skin sheen
      child.material.metalness = 0.05;
      child.material.emissive.setHex(0x180505);
      child.material.needsUpdate = true;
    }
  }

  static async _loadRockModels() {
    const loader = new GLTFLoader();
    
    // Load all rocks concurrently
    const loadedGltfs = await Promise.all(
      LevelConfig._rockUrls.map(url => new Promise((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
      }))
    );
    
    loadedGltfs.forEach((m, i) => m.url = LevelConfig._rockUrls[i]);
    return loadedGltfs; // Array of GLTF objects
  }

  /**
   * Return a ship definition object constructed from ShipRegistry.
   * @param {string} shipKey
   * @returns {object}
   */
  static getShipDef(shipKey) {
    const profile = getShipProfile(shipKey);
    const { x: W, y: H, z: D } = profile.grid;
    return {
      id: profile.id,
      name: profile.name,
      modelUrl: profile.modelUrl,
      grid: profile.grid,
      scale: profile.scale,
      waterlineY: profile.waterlineY,
      profile,
      zones: {
        hull: [{ xRange: [0, W - 1], yRange: [0, Math.floor(H * 0.45)], zRange: [0, D - 1] }],
        deck: [{ xRange: [0, W - 1], yRange: [Math.floor(H * 0.45) + 1, Math.floor(H * 0.55)], zRange: [0, D - 1] }],
        mast: [{ xRange: [Math.max(0, Math.floor(W * 0.35)), Math.min(W - 1, Math.floor(W * 0.65))], yRange: [Math.floor(H * 0.55) + 1, H - 1], zRange: [Math.max(0, Math.floor(D * 0.35)), Math.min(D - 1, Math.floor(D * 0.65))] }],
        sail: [{ xRange: [1, W - 2], yRange: [Math.floor(H * 0.58), H - 2], zRange: [Math.max(0, Math.floor(D * 0.4)), Math.min(D - 1, Math.floor(D * 0.6))] }]
      }
    };
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

import { getAssetUrl } from '../utils/paths.js';

/**
 * ShipRegistry — Central definition of all playable vessels, stats, dimensions,
 * physical handling attributes, camera offsets, and visual scales.
 */

export const SHIP_REGISTRY = {
  Ship_Small_Voxelized: {
    id: 'Ship_Small_Voxelized',
    name: 'Swift Skiff',
    category: 'Skiff / Dinghy',
    description: 'Small, lightweight skiff. Smaller and less durable than a sloop, but whips through tight reefs with ultra-nimble handling.',
    modelUrl: getAssetUrl('assets/ships/Ship_Small_Voxelized.glb'),
    grid: { x: 20, y: 20, z: 40 },
    scale: 0.09, // Smaller than a sloop (~3.6m length)
    health: 70,
    speedMultiplier: 0.85,
    turnAccel: 3.2,
    turnDamping: 2.2,
    collisionRadius: 1.8,
    cameraDist: 15,
    cameraHeight: 4.5,
    waterlineY: 3,
    waterCapacity: 70,
    modelRotationY: Math.PI / 2, // Flipped to sail forwards with pointed bow
    bowLanternMount: { x: 0, y: 0.89, z: -1.55 },
    icon: '🛶'
  },
  sloop: {
    id: 'sloop',
    name: 'Standard Sloop',
    category: 'Sloop',
    description: 'Classic single-mast vessel. Balanced speed, dependable hull, and agile rudder response for general coastal navigation.',
    modelUrl: getAssetUrl('assets/ships/sloop.glb'),
    grid: { x: 24, y: 24, z: 48 },
    scale: 0.12, // Baseline vessel (5.76m length)
    health: 100,
    speedMultiplier: 1.00,
    turnAccel: 2.2,
    turnDamping: 2.8,
    collisionRadius: 2.6,
    cameraDist: 18,
    cameraHeight: 5.5,
    waterlineY: 4,
    waterCapacity: 100,
    modelRotationY: 0,
    bowLanternMount: { x: 0, y: 1.58, z: -2.12 },
    icon: '⛵'
  },
  Ship_Large_Voxelized: {
    id: 'Ship_Large_Voxelized',
    name: 'Galleon War Frigate',
    category: 'Frigate / Galleon',
    description: 'Heavy triple-masted war frigate. High cruising speed and heavily reinforced hull. Exactly 3 times larger than the standard sloop.',
    modelUrl: getAssetUrl('assets/ships/Ship_Large_Voxelized.glb'),
    grid: { x: 30, y: 28, z: 64 },
    scale: 0.27, // Exactly 3 times larger than sloop (17.28m length)
    health: 300,
    speedMultiplier: 1.45,
    turnAccel: 1.0,
    turnDamping: 4.2,
    collisionRadius: 7.2,
    cameraDist: 38,
    cameraHeight: 9.5,
    waterlineY: 5,
    waterCapacity: 300,
    modelRotationY: Math.PI / 2,
    bowLanternMount: { x: 0, y: 3.84, z: -8.15 },
    icon: '🚢'
  },
  BigShip_Voxelized: {
    id: 'BigShip_Voxelized',
    name: 'Imperial Flagship Dreadnought',
    category: 'Dreadnought Flagship',
    description: 'Colossal floating fortress. Unmatched top speed under full sail and mammoth health pool. Exactly 6 times larger than the standard sloop.',
    modelUrl: getAssetUrl('assets/ships/BigShip_Voxelized.glb'),
    grid: { x: 34, y: 32, z: 76 },
    scale: 0.455, // Exactly 6 times larger than sloop (34.58m length)
    health: 600,
    speedMultiplier: 1.80,
    turnAccel: 0.6,
    turnDamping: 5.5,
    collisionRadius: 14.0,
    cameraDist: 62,
    cameraHeight: 16.0,
    waterlineY: 6,
    waterCapacity: 600,
    modelRotationY: 0,
    bowLanternMount: { x: 0, y: 5.00, z: -16.60 },
    icon: '🏰'
  },
  Truck: {
    id: 'Truck',
    name: 'Utility Truck',
    category: 'Gag Vehicle',
    description: 'A standard civilian pickup truck. Made of heavy solid steel with zero buoyancy. Immediately nose-dives and sinks!',
    modelUrl: getAssetUrl('assets/ships/Truck.glb'),
    grid: { x: 22, y: 22, z: 44 },
    scale: 0.12,
    health: 15,
    speedMultiplier: 0.25,
    turnAccel: 0.5,
    turnDamping: 6.0,
    collisionRadius: 2.4,
    cameraDist: 16,
    cameraHeight: 5.0,
    waterlineY: 3,
    waterCapacity: 20,
    isGagTruck: true,
    modelRotationY: 0,
    bowLanternMount: { x: 0, y: 1.05, z: -2.48 },
    icon: '🛻'
  }
};

// Ensure hullHP matches health on all profiles
for (const profile of Object.values(SHIP_REGISTRY)) {
  if (profile.hullHP === undefined) {
    profile.hullHP = profile.health;
  }
}

/**
 * Get ship profile by ID with fallback to standard sloop.
 * @param {string} id
 * @returns {object}
 */
export function getShipProfile(id) {
  if (!id) return SHIP_REGISTRY.sloop;
  return SHIP_REGISTRY[id] || SHIP_REGISTRY.sloop;
}

/**
 * Return an array of all available ship profiles.
 * @returns {Array<object>}
 */
export function getAllShips() {
  return Object.values(SHIP_REGISTRY);
}

/**
 * Default starter ship.
 */
export const DEFAULT_SHIP_ID = 'sloop';

export const ShipRegistry = {
  getAll: getAllShips,
  get: getShipProfile,
  profiles: SHIP_REGISTRY,
  DEFAULT_ID: DEFAULT_SHIP_ID
};


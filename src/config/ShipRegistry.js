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
    modelUrl: '/src/assets/ships/Ship_Small_Voxelized.glb',
    grid: { x: 20, y: 20, z: 40 },
    scale: 0.075, // Smaller than a sloop
    health: 70,
    speedMultiplier: 0.85,
    turnAccel: 3.2,
    turnDamping: 2.2,
    collisionRadius: 1.7,
    cameraDist: 14,
    cameraHeight: 4.2,
    waterlineY: 3,
    waterCapacity: 70,
    icon: '🛶'
  },
  sloop: {
    id: 'sloop',
    name: 'Standard Sloop',
    category: 'Sloop',
    description: 'Classic single-mast vessel. Balanced speed, dependable hull, and agile rudder response for general coastal navigation.',
    modelUrl: '/src/assets/ships/sloop.glb',
    grid: { x: 24, y: 24, z: 48 },
    scale: 0.10,
    health: 100,
    speedMultiplier: 1.00,
    turnAccel: 2.2,
    turnDamping: 2.8,
    collisionRadius: 2.2,
    cameraDist: 16,
    cameraHeight: 5.0,
    waterlineY: 4,
    waterCapacity: 100,
    icon: '⛵'
  },
  Ship_Large_Voxelized: {
    id: 'Ship_Large_Voxelized',
    name: 'Galleon War Frigate',
    category: 'Frigate / Galleon',
    description: 'Heavy triple-masted war frigate. High cruising speed and heavily reinforced hull, but carries heavy momentum through turns.',
    modelUrl: '/src/assets/ships/Ship_Large_Voxelized.glb',
    grid: { x: 30, y: 28, z: 64 },
    scale: 0.15,
    health: 220,
    speedMultiplier: 1.45,
    turnAccel: 1.1,
    turnDamping: 4.2,
    collisionRadius: 3.2,
    cameraDist: 22,
    cameraHeight: 7.0,
    waterlineY: 5,
    waterCapacity: 200,
    icon: '🚢'
  },
  BigShip_Voxelized: {
    id: 'BigShip_Voxelized',
    name: 'Imperial Flagship Dreadnought',
    category: 'Dreadnought Flagship',
    description: 'Colossal floating fortress. Unmatched top speed under full sail and mammoth health pool, requiring wide anticipatory turns.',
    modelUrl: '/src/assets/ships/BigShip_Voxelized.glb',
    grid: { x: 34, y: 32, z: 76 },
    scale: 0.19,
    health: 350,
    speedMultiplier: 1.75,
    turnAccel: 0.75,
    turnDamping: 5.0,
    collisionRadius: 4.0,
    cameraDist: 27,
    cameraHeight: 8.5,
    waterlineY: 6,
    waterCapacity: 300,
    icon: '🏰'
  },
  Truck: {
    id: 'Truck',
    name: 'Utility Truck',
    category: 'Gag Vehicle',
    description: 'A standard civilian pickup truck. Made of heavy solid steel with zero buoyancy. Immediately nose-dives and sinks!',
    modelUrl: '/src/assets/ships/Truck.glb',
    grid: { x: 22, y: 22, z: 44 },
    scale: 0.11,
    health: 15,
    speedMultiplier: 0.25,
    turnAccel: 0.5,
    turnDamping: 6.0,
    collisionRadius: 2.1,
    cameraDist: 16,
    cameraHeight: 5.0,
    waterlineY: 3,
    waterCapacity: 20,
    isGagTruck: true,
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


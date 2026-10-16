/**
 * MaterialRegistry — Central definition of shipyard repair materials,
 * costs, voxel colors, structural stats, and available building brush shapes.
 */

export const MATERIAL_REGISTRY = {
  oak_plank: {
    id: 'oak_plank',
    name: 'Standard Oak',
    shortName: 'Oak',
    icon: '🪵',
    color: 0x8b5a2b,
    unitCost: 5,
    durabilityHP: 100,
    weightMultiplier: 1.0,
    description: 'Dependable, balanced all-rounder naval timber. Reliable hull repair at standard cost.'
  },
  dark_ironwood: {
    id: 'dark_ironwood',
    name: 'Hardened Ironwood',
    shortName: 'Ironwood',
    icon: '🛡️',
    color: 0x3d2716,
    unitCost: 12,
    durabilityHP: 220,
    weightMultiplier: 1.5,
    description: 'Dense, fire-hardened dark timber. Superior blast and rock collision durability, but adds hull weight.'
  },
  light_pine: {
    id: 'light_pine',
    name: 'Lightweight Pine',
    shortName: 'Pine',
    icon: '🌲',
    color: 0xc19b6c,
    unitCost: 7,
    durabilityHP: 65,
    weightMultiplier: 0.65,
    description: 'Light, flexible timber. Lower durability, but significantly lightens ship weight for faster acceleration and turning.'
  },
  copper_plate: {
    id: 'copper_plate',
    name: 'Reinforced Copper',
    shortName: 'Copper',
    icon: '🪙',
    color: 0xb86532,
    unitCost: 18,
    durabilityHP: 350,
    weightMultiplier: 2.0,
    description: 'Heavy forged copper plating. Maximum defense against crushing hazards and kraken tentacle strikes.'
  },
  tar_canvas: {
    id: 'tar_canvas',
    name: 'Tarred Oakum Seam',
    shortName: 'Tar Seam',
    icon: '🧵',
    color: 0x24282b,
    unitCost: 3,
    durabilityHP: 40,
    weightMultiplier: 0.2,
    description: 'Inexpensive caulking and pitch-soaked canvas. Low structural defense, but seals water breaches immediately.'
  }
};

export const DEFAULT_MATERIAL_ID = 'oak_plank';

export function getMaterial(id) {
  return MATERIAL_REGISTRY[id] || MATERIAL_REGISTRY[DEFAULT_MATERIAL_ID];
}

export const BRUSHES = {
  single:   { id: 'single',   label: 'Voxel Block',     size: [1, 1, 1], icon: '◼' },
  plank:    { id: 'plank',    label: 'Plank (1x3)',     size: [1, 1, 3], icon: '❚' },
  beam:     { id: 'beam',     label: 'Long Beam (1x5)', size: [1, 1, 5], icon: '━' },
  plate:    { id: 'plate',    label: 'Deck Plate (2x2)',size: [2, 1, 2], icon: '▧' },
  bulkhead: { id: 'bulkhead', label: 'Bulkhead (3x3)',  size: [3, 3, 1], icon: '▦' },
  eraser:   { id: 'eraser',   label: 'Eraser (Refund)', size: [1, 1, 1], isEraser: true, icon: '🧹' }
};

export const DEFAULT_BRUSH_ID = 'single';

export function getBrush(id) {
  return BRUSHES[id] || BRUSHES[DEFAULT_BRUSH_ID];
}

import { getAssetUrl } from '../utils/paths.js';

export const ItemType = {
  WHEEL: 'wheel',
  PEDESTAL: 'pedestal',
  LANTERN: 'lantern'
};

export const SHOP_CATALOG = {
  [ItemType.WHEEL]: [
    {
      id: 'wheel_default',
      name: "Weathered Sailor's Helm",
      tier: 0,
      cost: 0,
      icon: getAssetUrl('assets/wheels/wheel_threshold.png'),
      stats: { turnAccel: 2.0, turnDamping: 3.0, sirenResistance: 0 },
      desc: 'Standard salt-stained timber helm. Baseline handling in open waters.'
    },
    {
      id: 'wheel_lvl1',
      name: 'Splintered Pine Helm',
      tier: 1,
      cost: 150,
      icon: getAssetUrl('assets/wheels/lvl1_wheel.png'),
      stats: { turnAccel: 2.35, turnDamping: 3.2, sirenResistance: 0.15 },
      desc: 'Lightweight pine spokes allow faster rudder cuts through shallow shoals.'
    },
    {
      id: 'wheel_lvl2',
      name: 'Reinforced Ironbark Wheel',
      tier: 2,
      cost: 420,
      icon: getAssetUrl('assets/wheels/lvl2_wheel.png'),
      stats: { turnAccel: 2.8, turnDamping: 3.5, sirenResistance: 0.3 },
      desc: 'Banded with forged iron rings. Absorbs wave shudder and stiffens turning response.'
    },
    {
      id: 'wheel_lvl3',
      name: 'Polished Mahogany Wheel',
      tier: 3,
      cost: 850,
      icon: getAssetUrl('assets/wheels/lvl3_wheel.png'),
      stats: { turnAccel: 3.4, turnDamping: 3.9, sirenResistance: 0.5 },
      desc: 'Finely balanced tropical mahogany. High responsiveness with minimal rotational drift.'
    },
    {
      id: 'wheel_lvl4',
      name: "Kraken's Gold Captain Wheel",
      tier: 4,
      cost: 1600,
      icon: getAssetUrl('assets/wheels/lvl4_wheel.png'),
      stats: { turnAccel: 4.2, turnDamping: 4.4, sirenResistance: 0.75 },
      desc: 'Forged from sunken galleon doubloons. Unshakable against violent currents and siren songs.'
    }
  ],
  [ItemType.PEDESTAL]: [
    {
      id: 'pedestal_lvl0',
      name: 'Weathered Oak Binnacle',
      tier: 0,
      cost: 0,
      icon: getAssetUrl('assets/pedestals/lvl0_pedestal.png'),
      stats: { coinMultiplier: 1.0 },
      desc: 'Standard unadorned ship binnacle. Awards standard doubloons.'
    },
    {
      id: 'pedestal_lvl1',
      name: 'Ironbound Pedestal',
      tier: 1,
      cost: 180,
      icon: getAssetUrl('assets/pedestals/lvl1_pedestal.png'),
      stats: { coinMultiplier: 1.25 },
      desc: 'Fitted with iron lockboxes. Awards +25% bonus coins on all QTEs & voyages.'
    },
    {
      id: 'pedestal_lvl2',
      name: 'Gilded Compass Binnacle',
      tier: 2,
      cost: 550,
      icon: getAssetUrl('assets/pedestals/lvl2_pedestal.png'),
      stats: { coinMultiplier: 1.6 },
      desc: 'Contains an enchanted nautical compass. Awards +60% bonus coins.'
    },
    {
      id: 'pedestal_lvl4',
      name: 'Ethereal Relic Pedestal',
      tier: 4,
      cost: 1800,
      icon: getAssetUrl('assets/pedestals/lvl4_pedestal.png'),
      stats: { coinMultiplier: 2.2 },
      desc: 'Blessed by deep sea phantoms. Grants +120% coin rewards on QTEs and voyages.'
    }
  ],
  [ItemType.LANTERN]: [
    {
      id: 'lantern_lvl1',
      name: "Mariner's Tin Lantern",
      tier: 1,
      cost: 160,
      icon: getAssetUrl('assets/Lanterns/lvl1_lantern.png'),
      stats: { lightIntensity: 2.2, lightDistance: 32, lightColor: 0xffaa44, fogCutDistance: 50 },
      desc: 'A steady amber oil flame. Pierces fog to reveal nearby reef rocks and barrels.'
    },
    {
      id: 'lantern_lvl2',
      name: 'Brass Stern Beacon',
      tier: 2,
      cost: 480,
      icon: getAssetUrl('assets/Lanterns/lvl2_lantern.png'),
      stats: { lightIntensity: 3.4, lightDistance: 48, lightColor: 0xffd277, fogCutDistance: 80 },
      desc: 'Polished reflector housing. Casts a wide illumination cone ahead of the vessel.'
    },
    {
      id: 'lantern_lvl3',
      name: 'Gilded Starlight Censer',
      tier: 3,
      cost: 950,
      icon: getAssetUrl('assets/Lanterns/lvl3_lantern.png'),
      stats: { lightIntensity: 4.6, lightDistance: 65, lightColor: 0x9be8ff, fogCutDistance: 115 },
      desc: 'Burns celestial ether. Casts brilliant cool light and cuts through the thickest mists.'
    },
    {
      id: 'lantern_lvl4',
      name: 'Abyssal Aurora Lantern',
      tier: 4,
      cost: 2000,
      icon: getAssetUrl('assets/Lanterns/lvl4_lantern.png'),
      stats: { lightIntensity: 6.0, lightDistance: 90, lightColor: 0x66ffcc, fogCutDistance: 160 },
      desc: 'Houses an eternal green spectral flame. Turns the blackest sea into glowing waters.'
    }
  ]
};

export class ShopRegistry {
  static getAllItems() {
    return [
      ...SHOP_CATALOG[ItemType.WHEEL],
      ...SHOP_CATALOG[ItemType.PEDESTAL],
      ...SHOP_CATALOG[ItemType.LANTERN]
    ];
  }

  static getItem(id) {
    if (!id) return null;
    return this.getAllItems().find(item => item.id === id) || null;
  }

  static getItemsByType(type) {
    return SHOP_CATALOG[type] || [];
  }

  static getDefaultEquipped() {
    return {
      wheel: 'wheel_default',
      pedestal: 'pedestal_lvl0',
      lantern: 'lantern_lvl1'
    };
  }

  static getWheelStats(wheelId) {
    const item = this.getItem(wheelId) || this.getItem('wheel_default');
    return item?.stats || { turnAccel: 2.0, turnDamping: 3.0, sirenResistance: 0 };
  }

  static getPedestalMultiplier(pedestalId) {
    const item = this.getItem(pedestalId) || this.getItem('pedestal_lvl0');
    return item?.stats?.coinMultiplier ?? 1.0;
  }

  static getLanternStats(lanternId) {
    const item = this.getItem(lanternId) || this.getItem('lantern_lvl1');
    return item?.stats || { lightIntensity: 2.0, lightDistance: 30, lightColor: 0xffaa44, fogCutDistance: 45 };
  }
}

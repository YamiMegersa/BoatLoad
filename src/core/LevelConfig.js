/**
 * LevelConfig — loads and caches ship definition and level config JSONs.
 *
 * Usage:
 *   const { shipDef, levelCfg } = await LevelConfig.load(1);
 */
export class LevelConfig {
  /** @type {Map<string, object>} */
  static _cache = new Map();

  /**
   * Load the ship definition and level config for a given day.
   * Results are cached so repeated loads are instant.
   *
   * @param {number} day
   * @returns {Promise<{ shipDef: object, levelCfg: object }>}
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

    return { shipDef, levelCfg };
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

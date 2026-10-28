/**
 * LevelSerializer.js — Standardizes serialization, validation, and payload hashing
 * for BoatLoad user-generated levels.
 *
 * Enforces Mario Maker level integrity:
 * - Deterministic SHA-256 payload checksums.
 * - Entity count caps to prevent performance griefing.
 * - Strict schema validation.
 */

export const LEVEL_SCHEMA_VERSION = '1.0.0';
export const MAX_OBSTACLES = 250;
export const MAX_WORLD_SIZE = 500;
export const MAX_PAYLOAD_BYTES = 256 * 1024; // 256 KB

export class LevelSerializer {
  /**
   * Serializes a playable level config into an immutable, versioned payload.
   * @param {object} levelCfg - The raw level config (from EditorSystem.getPlayableConfig())
   * @param {object} metadata - User metadata { title, description, tags, authorName }
   * @returns {Promise<{ payload: object, checksum: string, jsonString: string, sizeBytes: number }>}
   */
  static async serialize(levelCfg, metadata = {}) {
    const cleanLevel = this.cleanLevelConfig(levelCfg);
    const cleanMeta = this.cleanMetadata(metadata);

    const payload = {
      formatVersion: LEVEL_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      metadata: cleanMeta,
      levelData: cleanLevel
    };

    const jsonString = JSON.stringify(payload);
    const sizeBytes = new Blob([jsonString]).size;

    if (sizeBytes > MAX_PAYLOAD_BYTES) {
      throw new Error(`Level payload exceeds max size limit (${(sizeBytes / 1024).toFixed(1)} KB > 256 KB).`);
    }

    const checksum = await this.computeChecksum(cleanLevel);

    return {
      payload,
      checksum,
      jsonString,
      sizeBytes
    };
  }

  /**
   * Validates and sanitizes the core level data.
   */
  static cleanLevelConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') {
      throw new Error('Invalid level configuration object.');
    }

    const obstacles = Array.isArray(cfg.obstacles) ? cfg.obstacles : [];
    if (obstacles.length > MAX_OBSTACLES) {
      throw new Error(`Level contains too many placed objects (${obstacles.length} > ${MAX_OBSTACLES}).`);
    }

    const worldSize = Math.min(MAX_WORLD_SIZE, Math.max(80, Number(cfg.worldSize) || 200));

    // Clamp and sanitize placed obstacles
    const sanitizedObstacles = obstacles.slice(0, MAX_OBSTACLES).map(obs => {
      const pos = obs.position || { x: 0, y: 0, z: 0 };
      return {
        type: String(obs.type || 'rock'),
        assetUrl: typeof obs.assetUrl === 'string' ? obs.assetUrl : null,
        scale: Number(obs.scale) || 1.0,
        rotation: Number(obs.rotation) || 0,
        position: {
          x: Math.round((Number(pos.x) || 0) * 100) / 100,
          y: Math.round((Number(pos.y) || 0) * 100) / 100,
          z: Math.round((Number(pos.z) || 0) * 100) / 100
        }
      };
    });

    const endPos = cfg.endLocation?.position || { x: 0, y: 0, z: -220 };
    const endLocation = {
      position: {
        x: Math.round((Number(endPos.x) || 0) * 10) / 10,
        y: Math.round((Number(endPos.y) || 0) * 10) / 10,
        z: Math.round((Number(endPos.z) || -220) * 10) / 10
      },
      radius: Math.max(8, Math.min(40, Number(cfg.endLocation?.radius) || 16))
    };

    return {
      ship: cfg.ship || 'sloop',
      budget: Math.max(0, Number(cfg.budget) || 300),
      worldSize,
      globalWindDir: Number(cfg.globalWindDir) || 0,
      fogDensity: Math.max(0, Math.min(0.05, Number(cfg.fogDensity) || 0.006)),
      timeOfDay: Number(cfg.timeOfDay) || 8.0,
      isStormy: Boolean(cfg.isStormy),
      godRays: cfg.godRays !== undefined ? Boolean(cfg.godRays) : true,
      hasDock: cfg.hasDock !== false,
      shipSpawn: cfg.shipSpawn || null,
      endLocation,
      obstacles: sanitizedObstacles,
      sirens: Array.isArray(cfg.sirens) ? cfg.sirens : [],
      kraken: cfg.kraken || null,
      voxels: cfg.voxels || null,
      damage: Array.isArray(cfg.damage) ? cfg.damage : []
    };
  }

  /**
   * Sanitizes user-facing metadata fields.
   */
  static cleanMetadata(meta) {
    let title = (meta.title || 'Untitled Voyage').trim().substring(0, 48);
    if (title.length < 3) title = 'Custom Sea Route';

    const description = (meta.description || '').trim().substring(0, 280);
    const authorName = (meta.authorName || 'Anonymous Shipwright').trim().substring(0, 32);
    const tags = Array.isArray(meta.tags) 
      ? meta.tags.map(t => String(t).trim().toLowerCase()).filter(t => t.length > 0).slice(0, 4)
      : ['adventure'];

    return {
      title,
      description,
      authorName,
      tags
    };
  }

  /**
   * Recursively sorts object keys so JSON.stringify is 100% deterministic across all nested structures.
   */
  static canonicalize(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.canonicalize(item));
    }
    const sortedKeys = Object.keys(obj).sort();
    const result = {};
    for (const key of sortedKeys) {
      result[key] = this.canonicalize(obj[key]);
    }
    return result;
  }

  /**
   * Computes a canonical SHA-256 hex digest for a level configuration.
   * Any change in coordinates, obstacles, or terrain changes this checksum.
   * @param {object} levelData 
   * @returns {Promise<string>} 64-character hex string
   */
  static async computeChecksum(levelData) {
    const canonicalObj = this.canonicalize(levelData);
    const canonicalStr = JSON.stringify(canonicalObj);
    
    if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
      const msgBuffer = new TextEncoder().encode(canonicalStr);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Fallback simple hash for older or headless test environments
    let hash = 0;
    for (let i = 0; i < canonicalStr.length; i++) {
      hash = ((hash << 5) - hash) + canonicalStr.charCodeAt(i);
      hash |= 0;
    }
    return 'fallback_' + Math.abs(hash).toString(16).padStart(16, '0');
  }
}

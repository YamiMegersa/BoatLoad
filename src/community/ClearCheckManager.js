/**
 * ClearCheckManager.js — Enforces Super Mario Maker's Proof of Beatability rule.
 * 
 * Rules:
 * 1. An author cannot upload a custom course unless they have beaten it themselves
 *    from start to finish without sinking.
 * 2. Any structural change to the level invalidates the clear proof, requiring
 *    a new verification run.
 */

import { emit, on, off } from '../core/EventBus.js';
import { LevelSerializer } from './LevelSerializer.js';

const STORAGE_KEY = 'boatload_clear_checks_v1';

export class ClearCheckManager {
  static _activeCheck = null;
  static _proofCache = new Map(); // checksum -> proof
  static _initialized = false;

  static init() {
    if (this._initialized) return;
    this._initialized = true;

    // Load persisted local proofs
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        for (const [k, v] of Object.entries(parsed)) {
          this._proofCache.set(k, v);
        }
      }
    } catch (e) {
      console.warn('Could not read cached clear check proofs from localStorage', e);
    }

    // Listen for gameplay victory in Obstacle phase
    on('phaseChanged', (d) => {
      if (d?.phase === 'RESULTS' && this._activeCheck) {
        this._completeActiveCheck(true);
      }
    });

    on('voyageLost', () => {
      if (this._activeCheck) {
        this._completeActiveCheck(false, 'Vessel sank before reaching safe harbor.');
      }
    });

    on('playerSunk', () => {
      if (this._activeCheck) {
        this._completeActiveCheck(false, 'Ship was destroyed.');
      }
    });
  }

  /**
   * Starts a Clear Check voyage from the level editor.
   * @param {object} levelCfg - The current level config from EditorSystem
   * @returns {Promise<string>} The checksum being verified
   */
  static async startClearCheck(levelCfg) {
    this.init();
    const cleanLevel = LevelSerializer.cleanLevelConfig(levelCfg);
    const checksum = await LevelSerializer.computeChecksum(cleanLevel);

    this._activeCheck = {
      checksum,
      levelData: cleanLevel,
      startTime: performance.now(),
      completed: false
    };

    console.log(`[ClearCheck] Started verification run for course hash: ${checksum.slice(0, 8)}...`);

    // Emit event requesting GameState to launch into OBSTACLE phase with clearCheck flag
    emit('editorRequestPlay', {
      mode: 'sail',
      isClearCheck: true,
      clearCheckHash: checksum
    });

    return checksum;
  }

  /**
   * Returns true if the given level configuration has a valid, matching clear proof.
   * @param {object} levelCfg 
   * @returns {Promise<{ isVerified: boolean, proof: object|null }>}
   */
  static async hasValidClearProof(levelCfg) {
    this.init();
    if (!levelCfg) return { isVerified: false, proof: null };
    try {
      const clean = LevelSerializer.cleanLevelConfig(levelCfg);
      const checksum = await LevelSerializer.computeChecksum(clean);
      const proof = this._proofCache.get(checksum);
      return {
        isVerified: Boolean(proof && proof.completed),
        checksum,
        proof: proof || null
      };
    } catch {
      return { isVerified: false, proof: null };
    }
  }

  /**
   * Internal completion handler when a sailing voyage finishes.
   */
  static _completeActiveCheck(success, failureReason = '') {
    if (!this._activeCheck) return;
    const check = this._activeCheck;
    this._activeCheck = null;

    if (!success) {
      console.warn(`[ClearCheck] Verification failed: ${failureReason}`);
      emit('clearCheckFailed', { reason: failureReason, checksum: check.checksum });
      return;
    }

    const elapsedMs = Math.round(performance.now() - check.startTime);
    const proof = {
      checksum: check.checksum,
      clearTimeMs: elapsedMs,
      completed: true,
      verifiedAt: new Date().toISOString()
    };

    this._proofCache.set(check.checksum, proof);
    this._persistProofs();

    console.log(`[ClearCheck] Course verified! Clear time: ${(elapsedMs / 1000).toFixed(2)}s`);
    emit('clearCheckVerified', proof);
  }

  static _persistProofs() {
    try {
      const obj = {};
      for (const [k, v] of this._proofCache.entries()) {
        obj[k] = v;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
      console.warn('Could not persist clear check proofs', e);
    }
  }
}

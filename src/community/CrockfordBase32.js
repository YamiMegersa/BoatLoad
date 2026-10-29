/**
 * CrockfordBase32.js — Human-friendly, unambiguous Course Code generator and validator.
 * Excludes confusing characters (0/O, 1/I/L) and includes auto-normalization.
 * Follows the Mario Maker course code format: BL-XXX-YYY.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // 32 characters (no I, L, O, U)
const PREFIX = 'BL';

export class CrockfordBase32 {
  /**
   * Generates a random 6-character code formatted as "BL-XXX-YYY".
   * 32^6 = 1,073,741,824 distinct combinations.
   * @returns {string} e.g. "BL-8M3-K7P"
   */
  static generateCourseCode() {
    const chars = [];
    const randomBytes = new Uint8Array(6);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(randomBytes);
    } else {
      for (let i = 0; i < 6; i++) randomBytes[i] = Math.floor(Math.random() * 256);
    }

    for (let i = 0; i < 6; i++) {
      const idx = randomBytes[i] % ALPHABET.length;
      chars.push(ALPHABET[idx]);
    }

    return `${PREFIX}-${chars.slice(0, 3).join('')}-${chars.slice(3).join('')}`;
  }

  /**
   * Normalizes an entered course code (lowercases to uppercase, fixes O->0, I/L->1, removes extra spaces/hyphens).
   * @param {string} input 
   * @returns {string|null} Formatted code "BL-XXX-YYY" or null if invalid
   */
  static normalize(input) {
    if (!input || typeof input !== 'string') return null;

    // Clean up characters
    let cleaned = input.toUpperCase().trim();
    cleaned = cleaned.replace(/^BL[-_:]?/, ''); // Strip prefix if present
    cleaned = cleaned.replace(/[^0-9A-Z]/g, ''); // Remove hyphens, spaces

    // Crockford character substitution for common misreadings
    cleaned = cleaned
      .replace(/O/g, '0')
      .replace(/[IL]/g, '1');

    if (cleaned.length !== 6) return null;

    // Verify all chars exist in alphabet
    for (let i = 0; i < cleaned.length; i++) {
      if (!ALPHABET.includes(cleaned[i])) return null;
    }

    return `${PREFIX}-${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
  }

  /**
   * Checks if a string is a valid course code format.
   * @param {string} code 
   * @returns {boolean}
   */
  static isValid(code) {
    return this.normalize(code) !== null;
  }
}

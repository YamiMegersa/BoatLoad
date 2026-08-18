import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Math utilities
// ---------------------------------------------------------------------------

/**
 * Linear interpolation.
 * @param {number} a
 * @param {number} b
 * @param {number} t  0..1
 * @returns {number}
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Clamp a value between min and max.
 */
export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Map a value from one range to another.
 */
export function mapRange(v, inMin, inMax, outMin, outMax) {
  return outMin + ((v - inMin) / (inMax - inMin)) * (outMax - outMin);
}

/**
 * Returns a random integer in [min, max] inclusive.
 */
export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Returns a random float in [min, max).
 */
export function randFloat(min, max) {
  return Math.random() * (max - min) + min;
}

/**
 * Pick a random element from an array.
 * @template T
 * @param {T[]} arr
 * @returns {T}
 */
export function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Shuffle an array in-place (Fisher-Yates).
 * @template T
 * @param {T[]} arr
 * @returns {T[]}
 */
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Convert degrees to radians.
 */
export const DEG2RAD = Math.PI / 180;

/**
 * Ease in-out quadratic.
 */
export function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

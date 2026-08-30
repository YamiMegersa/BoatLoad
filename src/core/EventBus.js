/**
 * EventBus — lightweight pub/sub for decoupled system communication.
 *
 * Usage:
 *   import { on, off, emit } from './EventBus.js';
 *   on('cellRepaired', ({ x, y, z }) => { ... });
 *   emit('cellRepaired', { x: 1, y: 2, z: 3 });
 */

/** @type {Record<string, Function[]>} */
const listeners = {};

/**
 * Subscribe to an event.
 * @param {string} event
 * @param {Function} fn
 */
export function on(event, fn) {
  (listeners[event] ??= []).push(fn);
}

/**
 * Unsubscribe from an event.
 * @param {string} event
 * @param {Function} fn
 */
export function off(event, fn) {
  if (!listeners[event]) return;
  listeners[event] = listeners[event].filter(f => f !== fn);
}

/**
 * Emit an event with an optional data payload.
 * @param {string} event
 * @param {*} [data]
 */
export function emit(event, data) {
  listeners[event]?.forEach(fn => fn(data));
}

/**
 * Remove all listeners for a given event, or every listener if no event given.
 * Useful during phase teardown.
 * @param {string} [event]
 */
export function clear(event) {
  if (event) {
    delete listeners[event];
  } else {
    Object.keys(listeners).forEach(k => delete listeners[k]);
  }
}

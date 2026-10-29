/**
 * Debug gate — enabled only when the page URL contains `?debug`.
 *
 * Gates developer-only affordances: the HUD QTE debug buttons, the green
 * ship hitbox wireframe, the `window.__dev` test helpers, and verbose logs.
 * The iteration-2 test matrix relies on these (docs/iteration-2-implementation-plan.md).
 */
export const DEBUG = typeof location !== 'undefined' ? new URLSearchParams(location.search).has('debug') : false;

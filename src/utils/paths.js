/**
 * Resolves static asset paths relative to the current application base URL.
 * Guarantees compatibility with subdirectory hosting on Apache / LAMP servers.
 *
 * @param {string} path - Absolute, root-relative, or relative asset path
 * @returns {string} Fully resolved path safe for subdirectory hosting
 */
export function getAssetUrl(path) {
  if (!path) return '';
  if (/^(https?:|data:|blob:)/.test(path)) return path;

  // Clean off leading /src/ or / or ./
  let clean = path.replace(/^(\.\/|\/src\/|\/)/, '');

  // Linux case-sensitivity fix: ensure lowercase shark.glb
  if (clean.includes('fish/Shark.glb')) {
    clean = clean.replace('fish/Shark.glb', 'fish/shark.glb');
  }

  // Prepend base URL (defaults to './' in Vite build with base: './')
  const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || './';
  const prefix = base.endsWith('/') ? base : base + '/';
  return `${prefix}${clean}`;
}

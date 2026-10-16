import { emit, on } from './EventBus.js';

/**
 * GameEnv — Manages environment modes: 'demo' vs 'dev'.
 *
 * - In 'demo' mode: Debug overlays, FPS counter, editor shortcuts, and dev menus are hidden.
 * - In 'dev' mode: Full developer tooling, phase jump buttons, FPS counter, and editor menus are visible.
 *
 * Mode is determined by:
 * 1. URL search param: ?mode=dev or ?dev=true -> DEV mode.
 * 2. URL search param: ?mode=demo -> DEMO mode.
 * 3. LocalStorage key 'boatload_env'.
 * 4. Default: 'demo'.
 */
class GameEnvManager {
  constructor() {
    this._mode = this._resolveInitialMode();
    this._initKeyboardShortcut();
  }

  _resolveInitialMode() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('mode') === 'dev' || params.get('dev') === 'true') {
        return 'dev';
      }
      if (params.get('mode') === 'demo') {
        return 'demo';
      }
      const stored = localStorage.getItem('boatload_env');
      if (stored === 'dev' || stored === 'demo') {
        return stored;
      }
    } catch (_) {}
    return 'demo'; // Default to clean demo version
  }

  _initKeyboardShortcut() {
    // Secret shortcut: Ctrl + Shift + D toggles between demo and dev modes
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyD') {
        e.preventDefault();
        const nextMode = this.isDev() ? 'demo' : 'dev';
        this.setMode(nextMode);
      }
    });
  }

  getMode() {
    return this._mode;
  }

  isDev() {
    return this._mode === 'dev';
  }

  isDemo() {
    return this._mode === 'demo';
  }

  setMode(newMode) {
    if (newMode !== 'dev' && newMode !== 'demo') return;
    this._mode = newMode;
    try {
      localStorage.setItem('boatload_env', newMode);
      // Also update URL without reloading
      const url = new URL(window.location.href);
      url.searchParams.set('mode', newMode);
      window.history.replaceState({}, '', url.toString());
    } catch (_) {}

    console.log(`[GameEnv] Switched environment mode to: ${newMode.toUpperCase()}`);
    emit('envModeChanged', { mode: newMode, isDev: this.isDev(), isDemo: this.isDemo() });
  }
}

export const GameEnv = new GameEnvManager();
window.GameEnv = GameEnv;
window.setGameMode = (mode) => GameEnv.setMode(mode);

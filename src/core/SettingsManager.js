import * as THREE from 'three';
import { emit, on } from './EventBus.js';

const STORAGE_KEY = 'boatload_settings';

export const DEFAULT_SETTINGS = Object.freeze({
  fov: 60,                // 45 to 95 degrees
  drawDistance: 350,      // 100 to 650 meters
  cutWithFog: true,       // Cuts geometry off cleanly with atmospheric horizon fog
  renderScale: 1.0,       // 0.5, 0.75, 1.0, 1.25
  shadowQuality: 'high',  // 'off', 'low', 'high'
  paperShader: false,     // boolean toggle: Kuwahara painterly filter on/off
  ditherShader: false,    // boolean toggle: Dithering map filter on/off
  godRays: true,          // boolean
  showFps: true,          // boolean
  autoPerformance: false, // boolean (toggleable in Performance Menu)
  targetFps: 20,          // default target frame rate is 20 FPS
  masterVolume: 0.8,      // 0.0 to 1.0
  muted: false,           // boolean
  sfxVolume: 0.8,         // 0.0 to 1.0
  ambientVolume: 0.8,     // 0.0 to 1.0
  musicVolume: 0.7,       // 0.0 to 1.0
  qteTapToLatch: false,   // Accessibility: tap Space / thumb pad to latch the Siren brace instead of holding
});

export class SettingsManager {
  constructor() {
    this._settings = { ...DEFAULT_SETTINGS };
    this._context = null;

    this.load();

    // EventBus bindings
    on('changeSetting', ({ key, value }) => this.set(key, value));
    on('resetSettings', () => this.resetToDefaults());
  }

  load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        this._settings = { ...DEFAULT_SETTINGS, ...parsed };
        if (parsed.paperShader !== undefined) {
          this._settings.paperShader = parsed.paperShader === 'painterly' || parsed.paperShader === true;
        }
        if (parsed.ditherShader !== undefined) {
          this._settings.ditherShader = Boolean(parsed.ditherShader && parsed.ditherShader !== 'off');
        }
      }
    } catch (e) {
      console.warn('[SettingsManager] Failed to load settings from localStorage:', e);
      this._settings = { ...DEFAULT_SETTINGS };
    }
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._settings));
    } catch (e) {
      console.warn('[SettingsManager] Failed to save settings to localStorage:', e);
    }
  }

  get(key) {
    return this._settings[key] !== undefined ? this._settings[key] : DEFAULT_SETTINGS[key];
  }

  getAll() {
    return { ...this._settings };
  }

  set(key, value) {
    if (this._settings[key] === value) return;
    this._settings[key] = value;
    this.save();
    this.applyKey(key);
    emit('settingChanged', { key, value, all: this.getAll() });
  }

  resetToDefaults() {
    this._settings = { ...DEFAULT_SETTINGS };
    this.save();
    this.applyAll();
    emit('settingsReset', { all: this.getAll() });
  }

  bindContext(ctx) {
    this._context = ctx;
    this.applyAll();
  }

  applyKey(key) {
    if (!this._context) return;
    switch (key) {
      case 'fov':
      case 'drawDistance':
        this.applyCamera();
        if (key === 'drawDistance' && this.get('cutWithFog')) {
          this.applyFog();
        }
        break;
      case 'cutWithFog':
        this.applyFog();
        break;
      case 'renderScale':
      case 'shadowQuality':
        this.applyRenderer();
        break;
      case 'masterVolume':
      case 'muted':
      case 'sfxVolume':
      case 'ambientVolume':
      case 'musicVolume':
        this.applyAudio();
        break;
      case 'showFps':
        this.applyFps();
        break;
      case 'paperShader':
      case 'ditherShader':
      case 'godRays':
        // Observed directly in main.js render loop via settingsManager.get(...)
        break;
      default:
        break;
    }
  }

  applyAll() {
    if (!this._context) return;
    this.applyCamera();
    this.applyFog();
    this.applyRenderer();
    this.applyAudio();
    this.applyFps();
  }

  applyCamera(targetCam) {
    if (!this._context) return;
    const fov = Number(this.get('fov'));
    const drawDist = Number(this.get('drawDistance'));

    const cameras = [];
    if (targetCam) {
      cameras.push(targetCam);
    } else {
      if (this._context.camera) cameras.push(this._context.camera);
      if (this._context.gameState?.activeCamera) cameras.push(this._context.gameState.activeCamera);
      if (this._context.directorMode?.camera) cameras.push(this._context.directorMode.camera);
    }

    const cutWithFog = Boolean(this.get('cutWithFog'));
    const effectiveFar = cutWithFog ? Math.min(drawDist, Math.max(80, drawDist * 0.95 + 10)) : drawDist;

    const uniqueCameras = Array.from(new Set(cameras));
    for (const cam of uniqueCameras) {
      if (!cam || !cam.isPerspectiveCamera) continue;
      cam.fov = fov;
      cam.far = effectiveFar;
      cam.updateProjectionMatrix();
    }
  }

  applyFog(sceneTarget) {
    if (!this._context) return;
    const scene = sceneTarget || this._context.scene;
    if (!scene) return;

    const drawDist = Number(this.get('drawDistance'));
    const cutWithFog = Boolean(this.get('cutWithFog'));

    if (cutWithFog) {
      // Atmospheric horizon fog cuts off the scene seamlessly before the far clipping plane
      const nearDist = Math.max(10, drawDist * 0.35);
      const farDist  = Math.max(nearDist + 15, drawDist * 0.95);

      let fogColor = scene.fog?.color;
      if (!fogColor) {
        if (scene.background instanceof THREE.Color) {
          fogColor = scene.background.clone();
        } else {
          fogColor = new THREE.Color(0x3a556a); // Nautical maritime horizon blue
        }
      }

      if (scene.fog && scene.fog.isFog) {
        scene.fog.near = nearDist;
        scene.fog.far  = farDist;
        scene.fog.color.copy(fogColor);
      } else {
        scene.fog = new THREE.Fog(fogColor.getHex(), nearDist, farDist);
      }

      // Keep scene background matching the fog horizon so objects fade out seamlessly
      if (scene.background instanceof THREE.Color) {
        scene.background.copy(scene.fog.color);
      }
    }
  }

  applyRenderer(rendererTarget) {
    if (!this._context) return;
    const renderer = rendererTarget || this._context.renderer;
    if (!renderer) return;

    // Render resolution scale
    const scale = Number(this.get('renderScale'));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, scale));

    // Shadow quality
    const shadowQuality = this.get('shadowQuality');
    if (shadowQuality === 'off') {
      renderer.shadowMap.enabled = false;
    } else if (shadowQuality === 'low') {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.BasicShadowMap;
    } else {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
    }

    // Update lights shadow map sizes if available
    const sun = this._context.gameState?._sun;
    if (sun && sun.shadow?.map) {
      const mapSize = shadowQuality === 'low' ? 512 : 1024;
      if (sun.shadow.mapSize.width !== mapSize) {
        sun.shadow.mapSize.width = mapSize;
        sun.shadow.mapSize.height = mapSize;
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
    }
  }

  applyAudio(audioTarget) {
    const masterVol = Number(this.get('masterVolume'));
    const isMuted   = Boolean(this.get('muted'));
    const sfxVol    = Number(this.get('sfxVolume'));
    const ambVol    = Number(this.get('ambientVolume'));
    const musicVol  = Number(this.get('musicVolume'));

    // Broadcast on EventBus so AudioManager & MusicManager always stay in sync
    emit('setAudioVolume', { volume: masterVol });
    emit('setAudioMute', { muted: isMuted });
    emit('setSfxVolume', { volume: sfxVol });
    emit('setAmbientVolume', { volume: ambVol });
    emit('setMusicVolume', { volume: musicVol });

    if (!this._context) return;
    const audio = audioTarget || this._context.audio;
    if (!audio) return;

    if (typeof audio.setMasterVolume === 'function') audio.setMasterVolume(masterVol);
    if (typeof audio.setMuted === 'function') audio.setMuted(isMuted);
    if (typeof audio.setSfxVolume === 'function') audio.setSfxVolume(sfxVol);
    if (typeof audio.setAmbientVolume === 'function') audio.setAmbientVolume(ambVol);
    if (typeof audio.setMusicVolume === 'function') audio.setMusicVolume(musicVol);
  }

  applyFps(fpsTarget) {
    if (!this._context) return;
    const el = fpsTarget || this._context.fpsCounter;
    if (!el) return;
    if (this._context.directorMode?.isActive && this._context.directorMode?.uiHidden) {
      el.style.display = 'none';
      return;
    }
    el.style.display = this.get('showFps') ? 'block' : 'none';
  }
}

export const settingsManager = new SettingsManager();

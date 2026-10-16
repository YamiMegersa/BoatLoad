import * as THREE from 'three';
import { GameState, GamePhase } from './core/GameState.js';
import { LevelConfig } from './core/LevelConfig.js';
import { ShipRegistry, DEFAULT_SHIP_ID } from './config/ShipRegistry.js';
import { on, emit } from './core/EventBus.js';
import { BuildMenu } from './ui/BuildMenu.js';
import { HUD } from './ui/HUD.js';
import { DialogueBox } from './ui/DialogueBox.js';
import { PauseMenu } from './ui/PauseMenu.js';
import { DockUI } from './ui/DockUI.js';
import { MainMenuUI } from './ui/MainMenuUI.js';
import { LevelSelectorUI } from './ui/LevelSelectorUI.js';
import { LoadingScreenUI } from './ui/LoadingScreenUI.js';
import { ParticleSystem } from './environment/ParticleSystem.js';
import { DamageSystem } from './shipyard/DamageSystem.js';
import { GodRays } from './environment/GodRays.js';
import { PaperFilter } from './environment/PaperFilter.js';
import { AudioManager } from './utils/AudioManager.js';
import { DEBUG } from './utils/debug.js';
import { exportToGLB } from './utils/exportGLTF.js';
import { DirectorMode } from './director/DirectorMode.js';
import { GameEnv } from './core/GameEnv.js';
import './ui/ui.css';

// ---------------------------------------------------------------------------
// Scene setup
// ---------------------------------------------------------------------------

const canvas = document.querySelector('#canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222233);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 10, 30);

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------

const ambient = new THREE.HemisphereLight(0xffffff, 0xffffff, 1.0);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.name = 'sunLight';
sun.position.set(10, 20, 10);
sun.castShadow = true;
scene.add(sun);

const moon = new THREE.DirectionalLight(0x9bc0f5, 0.35);
moon.name = 'moonLight';
moon.position.set(-10, -20, -10);
moon.castShadow = true;
scene.add(moon);

// ---------------------------------------------------------------------------
// God Rays post-processing
// ---------------------------------------------------------------------------

const godRays = new GodRays(renderer, scene, camera);

// ---------------------------------------------------------------------------
// Paper Filter post-processing
// ---------------------------------------------------------------------------

const mainRT = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat,
});
const paperFilter = new PaperFilter(renderer);
paperFilter.resize(window.innerWidth, window.innerHeight);

// ---------------------------------------------------------------------------
// Global Managers and UI
// ---------------------------------------------------------------------------

let isPaused = false;
let paperShaderEnabled = false;
let userPaperStyle = 0;

const gameState = new GameState(scene, camera, renderer);
gameState._ambient = ambient;
gameState._sun = sun;
gameState._moon = moon;
gameState._godRays = godRays;
window.gameState = gameState;
window.godRays = godRays;
window.exportToGLB = exportToGLB;

// Dev-only test helpers (?debug) — used by the iteration-2 test matrix to
// reach hard-to-reach states quickly (sink, low water, day jumps).
if (DEBUG) {
  window.__dev = {
    sink:     () => emit('playerSunk'),
    setWater: (n)  => { if (gameState._playerShip) gameState._playerShip.waterLevel = n; },
    damage:   (n)  => gameState._playerShip?.takeDamage(n, 'dev'),
    day:      (n)  => { gameState.day = n; },
  };
  console.info('[BoatLoad] Debug mode — window.__dev helpers: sink(), setWater(n), damage(n), day(n)');
}

// Audio: one global instance. Browsers suspend AudioContexts until the first
// user gesture, so unlock on the first pointer/key input; M toggles mute.
const audio = new AudioManager();
const unlockAudio = () => audio.unlock();
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') audio.toggleMute();
});

const buildMenu = new BuildMenu();
const dockUI = new DockUI();
const mainMenuUI = new MainMenuUI();
const hud = new HUD();
const dialogue = new DialogueBox();
const pauseMenu = new PauseMenu();
const levelSelectorUI = new LevelSelectorUI();
const loadingScreenUI = new LoadingScreenUI();
const particles = new ParticleSystem(scene);

const directorMode = new DirectorMode({
  scene,
  camera,
  renderer,
  gameState,
  godRays,
  paperFilter
});
window.directorMode = directorMode;

// ---------------------------------------------------------------------------
// Resize handler
// ---------------------------------------------------------------------------

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  if (directorMode.camera) {
    directorMode.camera.aspect = window.innerWidth / window.innerHeight;
    directorMode.camera.updateProjectionMatrix();
  }

  if (gameState.activeCamera && gameState.activeCamera !== camera && gameState.activeCamera !== directorMode.camera) {
    gameState.activeCamera.aspect = window.innerWidth / window.innerHeight;
    gameState.activeCamera.updateProjectionMatrix();
  }

  renderer.setSize(window.innerWidth, window.innerHeight);
  godRays.resize(window.innerWidth, window.innerHeight);
  mainRT.setSize(window.innerWidth, window.innerHeight);
  paperFilter.resize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// FPS counter
// ---------------------------------------------------------------------------

let frameCount = 0;
let lastFpsTime = performance.now();
const fpsCounter = document.createElement('div');
fpsCounter.id = 'fps-counter';
fpsCounter.style.cssText = `
  position: absolute; top: 10px; right: 10px; z-index: 100;
  background: rgba(0,0,0,0.8); color: #0f0; padding: 5px 10px;
  font-family: monospace; border-radius: 4px; font-size: 14px;
  pointer-events: none;
  display: ${GameEnv.isDev() ? 'block' : 'none'};
`;
fpsCounter.innerText = 'FPS: 0';
document.getElementById('ui-root')?.appendChild(fpsCounter);

// ---------------------------------------------------------------------------
// Game loop
// ---------------------------------------------------------------------------

const clock = new THREE.Clock();

function tick() {
  requestAnimationFrame(tick);
  const now = performance.now();
  const delta = Math.min(clock.getDelta(), 0.05); // cap at 50ms to avoid spiral of death

  // Calculate simulation delta according to Director Mode state
  let simDelta = delta;
  if (directorMode.isActive) {
    directorMode.update(delta);
    if (directorMode.stepFrameRequested) {
      simDelta = 1 / 60;
    } else if (directorMode.isHalted) {
      simDelta = 0;
    } else {
      simDelta = delta * directorMode.timeScale;
    }
  }

  if (!isPaused) {
    if (simDelta > 0) {
      gameState.update(simDelta);
      particles.update(simDelta);
    } else if (directorMode.isActive && directorMode.keepWavesMoving && gameState._ocean) {
      // Keep ocean waves softly rolling even while ship/world is halted for epic cinematic shots
      gameState._ocean.update(delta * 0.25);
    }
  }

  frameCount++;
  if (now - lastFpsTime >= 1000) {
    fpsCounter.innerText = `FPS: ${frameCount}`;
    frameCount = 0;
    lastFpsTime = now;
  }

  const activeCam = directorMode.isActive ? directorMode.camera : (gameState.activeCamera || camera);
  godRays._camera = activeCam;

  const isMainMenu = gameState.currentPhase === GamePhase.MAIN_MENU;
  const usePaperShader = isMainMenu || paperShaderEnabled;

  if (usePaperShader) {
    if (isMainMenu) {
      paperFilter.setStyle(1); // Kuwahara (Painterly) permanently on for Main Menu
    } else {
      paperFilter.setStyle(userPaperStyle);
    }
    godRays.render(sun, moon, mainRT);
    paperFilter.render(mainRT);
  } else {
    godRays.render(sun, moon, null);
  }
}

// ---------------------------------------------------------------------------
// Dev / Testing UI Overlay
// ---------------------------------------------------------------------------

const demoUI = document.createElement('div');
demoUI.style.cssText = `
  position: absolute; top: 10px; left: 10px; z-index: 100;
  background: rgba(0,0,0,0.8); color: white; padding: 15px;
  font-family: monospace; border-radius: 8px; width: 320px;
  pointer-events: auto;
  display: ${GameEnv.isDev() ? 'block' : 'none'};
`;
demoUI.innerHTML = `
  <h3 style="margin-bottom: 10px; font-family: sans-serif;">Dev Test Suite</h3>
  <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 10px;">
    <button id="btn-main-menu" style="flex:1; padding: 8px; cursor: pointer; background: #9A5B2E; color: white; border: 1px solid #4a2a10;">Menu</button>
    <button id="btn-dock" style="flex:1; padding: 8px; cursor: pointer;">Dock</button>
    <button id="btn-shipyard" style="flex:1; padding: 8px; cursor: pointer;">Shipyard</button>
    <button id="btn-obstacle" style="flex:1; padding: 8px; cursor: pointer;">Sailing</button>
    <button id="btn-editor" style="flex:1; padding: 8px; cursor: pointer; background: #474b6b; color: white; border: 1px solid #556;">Editor</button>
  </div>
`;
document.getElementById('ui-root')?.appendChild(demoUI);

function logEvent(msg) {
  if (DEBUG) console.info(`[BoatLoad] ${msg}`);
}

on('envModeChanged', ({ isDev }) => {
  demoUI.style.display = isDev ? 'block' : 'none';
  fpsCounter.style.display = isDev ? 'block' : 'none';
});

// ---------------------------------------------------------------------------
// Notice banner (build failures, day progression notes)
// ---------------------------------------------------------------------------

const noticeBanner = document.createElement('div');
noticeBanner.id = 'notice-banner';
noticeBanner.style.cssText = `
  position: absolute; top: 60px; left: 50%; transform: translateX(-50%);
  z-index: 200; background: rgba(140, 20, 20, 0.92); color: #fff;
  padding: 10px 18px; font-family: monospace; font-size: 14px;
  border-radius: 6px; border: 1px solid #ff6b6b; display: none;
  pointer-events: none; max-width: 80%;
`;
document.getElementById('ui-root')?.appendChild(noticeBanner);

let noticeTimer = null;
function showNotice(message, ms = 5000) {
  if (!noticeBanner) return;
  noticeBanner.textContent = message;
  noticeBanner.style.display = 'block';
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { noticeBanner.style.display = 'none'; }, ms);
}

on('buildError', (d) => {
  console.error('[BoatLoad] Build error:', d.message);
  logEvent(`[Build] ERROR: ${d.message}`);
  showNotice(`⚠ ${d.message}`);
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const MAX_DAY = 7;

async function boot() {
  try {
    // Start day: ?debug&day=N jumps straight to a day (dev aid), else day 1.
    const startDay = DEBUG
      ? Math.max(1, Math.min(MAX_DAY, parseInt(new URLSearchParams(location.search).get('day')) || 1))
      : 1;

    // The active day's content. Reloaded via syncLevel() whenever gameState.day changes.
    let level = await LevelConfig.load(startDay);
    let loadedDay = startDay;
    gameState.day = startDay;

    // Expose to window for debugging if needed
    window.__DEBUG_ROCK_MODELS = level.rockModels;

    // Reload level content when the day changed (e.g. after passing a voyage).
    // A missing day JSON falls back to the last valid day with a console error.
    async function syncLevel() {
      if (gameState.day === loadedDay) return;

      if (gameState.day > MAX_DAY) {
        logEvent('[Level] All days cleared — voyage complete! Replaying the final day.');
        showNotice('⛵ ALL 7 DAYS CLEARED — VOYAGE COMPLETE! ⛵', 8000);
        gameState.day = MAX_DAY;
        if (loadedDay === MAX_DAY) return;
      }

      const day = gameState.day;
      try {
        level = await LevelConfig.load(day);
        loadedDay = day;
        window.__DEBUG_ROCK_MODELS = level.rockModels;
        logEvent(`[Level] Day ${day} loaded`);
      } catch (e) {
        console.error(`[Level] Failed to load day ${day} — keeping day ${loadedDay}`, e);
        logEvent(`[Level] Day ${day} unavailable — staying on day ${loadedDay}`);
        gameState.day = loadedDay;
      }
    }

    // Shared payload builders so every handler reads the CURRENT day's content
    // instead of variables captured once at boot.
    function sailPayload(levelCfgOverride = null) {
      let hp = 100;
      if (gameState._grid) {
        hp = DamageSystem.getSummary(gameState._grid).integrityPct;
      }
      return {
        shipDef: level.shipDef,
        levelCfg: levelCfgOverride ?? (gameState._levelCfg || level.levelCfg),
        shipStats: { hullHP: hp },
        rockModels: level.rockModels,
        fishModels: level.fishModels,
        pickupModels: level.pickupModels,
        seaweedModels: level.seaweedModels,
        waveModels: level.waveModels,
        islandModels: level.islandModels,
        sirenModel: level.sirenModel,
        krakenModel: level.krakenModel,
      };
    }

    function shipyardPayload() {
      return { shipDef: level.shipDef, levelCfg: level.levelCfg, fishModels: level.fishModels };
    }

    function editorPayload() {
      return {
        levelCfg: gameState._levelCfg || level.levelCfg,
        rockModels: level.rockModels, pickupModels: level.pickupModels,
        seaweedModels: level.seaweedModels, waveModels: level.waveModels,
        islandModels: level.islandModels,
        sirenModel: level.sirenModel, krakenModel: level.krakenModel,
      };
    }

    // Wire buttons
    document.getElementById('btn-main-menu').onclick = () => {
      logEvent('Transitioning to Main Menu...');
      gameState.transition(GamePhase.MAIN_MENU);
    };
    document.getElementById('btn-dock').onclick = async () => {
      logEvent('Transitioning to Dock...');
      await syncLevel();
      const activeShipId = gameState._levelCfg?.ship || level.levelCfg?.ship || DEFAULT_SHIP_ID;
      const activeShipDef = LevelConfig.getShipDef(activeShipId);
      gameState.transition(GamePhase.DOCK, { shipDef: activeShipDef, levelCfg: gameState._levelCfg || level.levelCfg, fishModels: level.fishModels });
    };
    document.getElementById('btn-shipyard').onclick = async () => {
      logEvent('Transitioning to Shipyard...');
      await syncLevel();
      const activeShipId = gameState._levelCfg?.ship || level.levelCfg?.ship || DEFAULT_SHIP_ID;
      const activeShipDef = LevelConfig.getShipDef(activeShipId);
      gameState.transition(GamePhase.SHIPYARD, { shipDef: activeShipDef, levelCfg: gameState._levelCfg || level.levelCfg, fishModels: level.fishModels });
    };
    document.getElementById('btn-obstacle').onclick = async () => {
      logEvent('Transitioning to Sailing...');
      await syncLevel();
      const activeShipId = gameState._levelCfg?.ship || level.levelCfg?.ship || DEFAULT_SHIP_ID;
      const activeShipDef = LevelConfig.getShipDef(activeShipId);
      const profile = ShipRegistry.get(activeShipId);
      let hp = profile.hullHP;
      if (gameState._grid) {
        hp = Math.round((DamageSystem.getSummary(gameState._grid).integrityPct / 100) * profile.hullHP);
      }
      gameState.transition(GamePhase.OBSTACLE, {
        shipDef: activeShipDef,
        levelCfg: gameState._levelCfg || level.levelCfg,
        shipStats: { hullHP: hp },
        rockModels: level.rockModels, fishModels: level.fishModels, pickupModels: level.pickupModels,
        seaweedModels: level.seaweedModels, waveModels: level.waveModels, islandModels: level.islandModels,
        sirenModel: level.sirenModel, krakenModel: level.krakenModel
      });
    };
    document.getElementById('btn-editor').onclick = async () => {
      logEvent('Transitioning to Level Editor...');
      await syncLevel();
      gameState.transition(GamePhase.EDITOR, editorPayload());
    };

    // Listen for UI events
    on('phaseChanged',       d => logEvent(`[Phase] ${d.phase}`));
    on('obstacleHit',        d => logEvent(`[Obstacle] hit by ${d.type} -${d.damage} HP`));
    on('playerDamaged',      () => logEvent(`[Collision] Hull breached!`));
    on('playerSunk',         () => logEvent('[SUNK] Game Over'));
    on('voyageLost', async () => {
      setPaused(false);
      showNotice('Voyage lost — repair the wreck before setting sail again.', 6000);
      await gameState.transition(GamePhase.SHIPYARD, shipyardPayload());
    });

    on('levelSelected', async ({ day }) => {
      if (day) {
        gameState.day = day;
        await syncLevel();
      }
    });

    // Start sailing from shipyard or dock
    on('startSailing', async () => {
      emit('showLoading', { title: 'Setting Sail', message: 'Rigging canvas & casting off lines...', progress: 0.1 });
      await syncLevel();
      const activeShipId = gameState._levelCfg?.ship || level.levelCfg?.ship || DEFAULT_SHIP_ID;
      const activeShipDef = LevelConfig.getShipDef(activeShipId);
      const profile = ShipRegistry.get(activeShipId);
      let hp = profile.hullHP;
      if (gameState._grid) {
        hp = Math.round((DamageSystem.getSummary(gameState._grid).integrityPct / 100) * profile.hullHP);
      }
      gameState.transition(GamePhase.OBSTACLE, {
        shipDef: activeShipDef,
        levelCfg: gameState._levelCfg || level.levelCfg,
        shipStats: { hullHP: hp },
        rockModels: level.rockModels, fishModels: level.fishModels, pickupModels: level.pickupModels,
        seaweedModels: level.seaweedModels, waveModels: level.waveModels, islandModels: level.islandModels,
        sirenModel: level.sirenModel, krakenModel: level.krakenModel
      });
    });

    on('editorRequestPlay', (d) => {
      if (gameState.currentPhase === GamePhase.EDITOR && gameState._editorSystem) {
        emit('showLoading', { title: 'Test Voyage', message: 'Launching vessel into custom map...', progress: 0.1 });
        const customLevelCfg = gameState._editorSystem.getPlayableConfig();
        const activeShipId = customLevelCfg.ship || DEFAULT_SHIP_ID;
        const activeShipDef = LevelConfig.getShipDef(activeShipId);
        const profile = ShipRegistry.get(activeShipId);

        if (d && d.mode === 'dock') {
          logEvent(`Docking custom level with vessel [${profile.name}]...`);
          gameState.transition(GamePhase.DOCK, {
            shipDef: activeShipDef,
            levelCfg: customLevelCfg,
            fishModels: level.fishModels
          });
        } else {
          logEvent(`Playing Custom Level from Editor with vessel [${profile.name}]...`);
          let hp = profile.hullHP;
          if (gameState._grid) {
            hp = Math.round((DamageSystem.getSummary(gameState._grid).integrityPct / 100) * profile.hullHP);
          }

          gameState.transition(GamePhase.OBSTACLE, {
            shipDef: activeShipDef,
            levelCfg: customLevelCfg,
            shipStats: { hullHP: hp, profile },
            rockModels: level.rockModels, fishModels: level.fishModels, pickupModels: level.pickupModels,
            seaweedModels: level.seaweedModels, waveModels: level.waveModels, islandModels: level.islandModels,
            sirenModel: level.sirenModel, krakenModel: level.krakenModel
          });
        }
      }
    });

    // Wire up God Rays & Paper Shader toggles/sliders
    on('editorToggleGodRays', d => {
      godRays.enabled = !!d.enabled;
    });
    on('editorTogglePaperShader', d => paperShaderEnabled = d.enabled);
    on('editorSetPaperStyle', d => {
      userPaperStyle = d.style;
      paperFilter.setStyle(d.style);
    });
    on('editorSetHatchScale', d => paperFilter.setHatchScale(d.scale));
    on('editorSetKuwaharaRadius', d => paperFilter.setKuwaharaRadius(d.radius));
    on('editorSetPaperColor', d => paperFilter.setColorPreservation(d.amount));
    on('editorSetPaperEdge', d => paperFilter.setEdgeThreshold(d.threshold));
    on('editorSetPaperWobble', d => paperFilter.setWobbleIntensity(d.intensity));

    on('requestPhaseChange', async (opts) => {
      const phase = opts?.phase;
      if (opts?.day) {
        gameState.day = opts.day;
      }
      if (phase === GamePhase.MAIN_MENU) {
        logEvent('Main Menu requested...');
        emit('showLoading', { title: 'Returning to Port', message: 'Returning to harbor tavern...', progress: 0.1 });
        gameState.transition(GamePhase.MAIN_MENU);
      } else if (phase === GamePhase.DOCK) {
        logEvent('Setting Sail -> Arriving at Dock...');
        emit('showLoading', { title: 'Mooring at Harbor', message: 'Arriving at harbor dock...', progress: 0.1 });
        await syncLevel();
        const activeShipId = opts?.shipDef?.id || gameState._levelCfg?.ship || level.levelCfg?.ship || DEFAULT_SHIP_ID;
        const activeShipDef = opts?.shipDef || LevelConfig.getShipDef(activeShipId);
        const activeLevelCfg = opts?.levelCfg || gameState._levelCfg || level.levelCfg;
        gameState.transition(GamePhase.DOCK, { shipDef: activeShipDef, levelCfg: activeLevelCfg, fishModels: level.fishModels });
      } else if (phase === GamePhase.SHIPYARD) {
        logEvent('Entering Shipyard...');
        emit('showLoading', { title: 'Entering Shipyard', message: 'Entering outfitting berth & inspecting hull...', progress: 0.1 });
        await syncLevel();
        const activeShipId = gameState._levelCfg?.ship || level.levelCfg?.ship || DEFAULT_SHIP_ID;
        const activeShipDef = LevelConfig.getShipDef(activeShipId);
        gameState.transition(GamePhase.SHIPYARD, { shipDef: activeShipDef, levelCfg: gameState._levelCfg || level.levelCfg, fishModels: level.fishModels });
      } else if (phase === GamePhase.OBSTACLE) {
        logEvent('Setting Sail -> Heading to High Seas...');
        emit('showLoading', { title: 'Setting Sail', message: 'Heading out to open waters...', progress: 0.1 });
        await syncLevel();
        const activeShipId = gameState._levelCfg?.ship || level.levelCfg?.ship || DEFAULT_SHIP_ID;
        const activeShipDef = LevelConfig.getShipDef(activeShipId);
        const profile = ShipRegistry.get(activeShipId);
        let hp = profile.hullHP;
        if (gameState._grid) {
          hp = Math.round((DamageSystem.getSummary(gameState._grid).integrityPct / 100) * profile.hullHP);
        }
        gameState.transition(GamePhase.OBSTACLE, {
          shipDef: activeShipDef,
          levelCfg: gameState._levelCfg || level.levelCfg,
          shipStats: { hullHP: hp },
          rockModels: level.rockModels, fishModels: level.fishModels, pickupModels: level.pickupModels,
          seaweedModels: level.seaweedModels, waveModels: level.waveModels, islandModels: level.islandModels,
          sirenModel: level.sirenModel, krakenModel: level.krakenModel
        });
      } else if (phase === GamePhase.EDITOR) {
        logEvent('Opening Map Maker / Level Editor...');
        emit('showLoading', { title: 'Level Editor', message: 'Opening map maker...', progress: 0.1 });
        await syncLevel();
        gameState.transition(GamePhase.EDITOR, editorPayload());
      }
    });

    // Pause handling
    function setPaused(paused) {
      if (isPaused === paused) return;
      isPaused = paused;
      emit('gamePaused', { paused });
      if (paused) {
        emit('uiMount', { screen: 'pause' });
      } else {
        emit('uiUnmount', { screen: 'pause' });
      }
    }

    function togglePause() {
      if (gameState.currentPhase === GamePhase.DOCK || gameState.currentPhase === GamePhase.OBSTACLE ||
          gameState.currentPhase === GamePhase.MAIN_MENU || directorMode.isActive) return;
      setPaused(!isPaused);
    }

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && !directorMode.isActive) togglePause();
    });

    on('resumeGame', () => {
      setPaused(false);
    });

    on('restartPhase', async () => {
      if (gameState.currentPhase === GamePhase.OBSTACLE) {
        gameState.restartSailing();
      } else if (gameState.currentPhase === GamePhase.SHIPYARD) {
        await syncLevel();
        gameState.transition(GamePhase.SHIPYARD, shipyardPayload(), true);
      }
    });

    on('gotoShipyard', async () => {
      setPaused(false);
      await syncLevel();
      gameState.transition(GamePhase.SHIPYARD, shipyardPayload());
    });

    on('gotoTitle', () => {
      setPaused(false);
      gameState.transition(GamePhase.MAIN_MENU);
    });

    // Start at Main Menu
    await gameState.transition(GamePhase.MAIN_MENU, { ...shipyardPayload(), skipLoading: true });

    tick();
  } catch (err) {
    console.error('Boot error:', err);
    showNotice(`⚠ Boot error: ${err.message}`, 10000);
  }
}

boot();

import * as THREE from 'three';
import { GameState, GamePhase } from './core/GameState.js';
import { LevelConfig } from './core/LevelConfig.js';
import { on, emit } from './core/EventBus.js';
import { BuildMenu } from './ui/BuildMenu.js';
import { DocketSheet } from './ui/DocketSheet.js';
import { HUD } from './ui/HUD.js';
import { DialogueBox } from './ui/DialogueBox.js';
import { PauseMenu } from './ui/PauseMenu.js';
import { DockUI } from './ui/DockUI.js';
import { MainMenuUI } from './ui/MainMenuUI.js';
import { ResultsUI } from './ui/ResultsUI.js';
import { ParticleSystem } from './environment/ParticleSystem.js';
import { DamageSystem } from './shipyard/DamageSystem.js';
import { GodRays } from './environment/GodRays.js';
import { PaperFilter } from './environment/PaperFilter.js';
import { AudioManager } from './utils/AudioManager.js';
import { DEBUG } from './utils/debug.js';
import { exportToGLB } from './utils/exportGLTF.js';
import { DirectorMode } from './director/DirectorMode.js';
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
const docket = new DocketSheet();
const dockUI = new DockUI();
const mainMenuUI = new MainMenuUI();
const resultsUI = new ResultsUI();
const hud = new HUD();
const dialogue = new DialogueBox();
const pauseMenu = new PauseMenu();
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
// Demo UI Overlay
// ---------------------------------------------------------------------------

const demoUI = document.createElement('div');
demoUI.style.cssText = `
  position: absolute; top: 10px; left: 10px; z-index: 100;
  background: rgba(0,0,0,0.8); color: white; padding: 15px;
  font-family: monospace; border-radius: 8px; width: 320px;
  pointer-events: auto;
`;
demoUI.innerHTML = `
  <h3 style="margin-bottom: 10px; font-family: sans-serif;">BoatLoad Demo</h3>
  <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 10px;">
    <button id="btn-main-menu" style="flex:1; padding: 8px; cursor: pointer; background: #9A5B2E; color: white; border: 1px solid #4a2a10;">Menu</button>
    <button id="btn-dock" style="flex:1; padding: 8px; cursor: pointer;">Dock</button>
    <button id="btn-shipyard" style="flex:1; padding: 8px; cursor: pointer;">Shipyard</button>
    <button id="btn-obstacle" style="flex:1; padding: 8px; cursor: pointer;">Sailing</button>
    <button id="btn-editor" style="flex:1; padding: 8px; cursor: pointer; background: #474b6b; color: white; border: 1px solid #556;">Editor</button>
  </div>
  <div id="demo-log" style="height: 120px; overflow-y: auto; background: #111; padding: 5px; font-size: 11px; color: #0f0; border: 1px solid #333;">
    Ready.<br>
  </div>
`;
document.getElementById('ui-root')?.appendChild(demoUI);

const logDiv = demoUI.querySelector('#demo-log');
function logEvent(msg) {
  if (!logDiv) return;
  logDiv.innerHTML += `> ${msg}<br>`;
  logDiv.scrollTop = logDiv.scrollHeight;
}

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

    // The active day's content. Reloaded via syncLevel() whenever gameState.day
    // changes (passing a voyage increments the day in GameState._enterResults).
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
      gameState.transition(GamePhase.DOCK, { levelCfg: level.levelCfg });
    };
    document.getElementById('btn-shipyard').onclick = async () => {
      logEvent('Transitioning to Shipyard...');
      await syncLevel();
      gameState.transition(GamePhase.SHIPYARD, shipyardPayload());
    };
    document.getElementById('btn-obstacle').onclick = async () => {
      logEvent('Transitioning to Sailing...');
      await syncLevel();
      gameState.transition(GamePhase.OBSTACLE, sailPayload());
    };
    document.getElementById('btn-editor').onclick = async () => {
      logEvent('Transitioning to Level Editor...');
      await syncLevel();
      gameState.transition(GamePhase.EDITOR, editorPayload());
    };

    // Listen for UI events
    on('phaseChanged',       d => logEvent(`[Phase] ${d.phase}`));
    on('docketItemCompleted', d => logEvent(`[Docket] ✓ ${d.label}`));
    on('allRepairsDone',      () => logEvent('[Docket] ALL DONE — ready to sail'));
    on('obstacleHit',        d => logEvent(`[Obstacle] hit by ${d.type} -${d.damage} HP`));
    on('playerDamaged',      () => logEvent(`[Collision] Hull breached!`));
    on('playerSunk',         () => logEvent('[SUNK] Game Over'));

    // Start sailing from shipyard
    on('startSailing', async () => {
      await syncLevel();
      gameState.transition(GamePhase.OBSTACLE, sailPayload());
    });

    on('editorRequestPlay', () => {
      if (gameState.currentPhase === GamePhase.EDITOR && gameState._editorSystem) {
        logEvent('Playing Custom Level from Editor...');
        const customLevelCfg = gameState._editorSystem.getPlayableConfig();
        gameState.transition(GamePhase.OBSTACLE, sailPayload(customLevelCfg));
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

    // Request phase changes from UI
    on('requestPhaseChange', async ({ phase }) => {
      if (phase === GamePhase.MAIN_MENU) {
        logEvent('Main Menu requested...');
        gameState.transition(GamePhase.MAIN_MENU);
      } else if (phase === GamePhase.DOCK) {
        logEvent('Setting Sail -> Arriving at Dock...');
        await syncLevel();
        gameState.transition(GamePhase.DOCK, { levelCfg: level.levelCfg });
      } else if (phase === GamePhase.SHIPYARD) {
        logEvent('Entering Shipyard...');
        await syncLevel();
        gameState.transition(GamePhase.SHIPYARD, shipyardPayload());
      } else if (phase === GamePhase.OBSTACLE) {
        logEvent('Setting Sail -> Heading to High Seas...');
        await syncLevel();
        gameState.transition(GamePhase.OBSTACLE, sailPayload());
      } else if (phase === GamePhase.EDITOR) {
        logEvent('Opening Map Maker / Level Editor...');
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
      if (gameState.currentPhase === GamePhase.DOCK || gameState.currentPhase === GamePhase.RESULTS || gameState.currentPhase === GamePhase.MAIN_MENU) return;
      setPaused(!isPaused);
    }

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') togglePause();
    });

    // HUD pause button emits the same request as Esc
    on('pauseRequest', togglePause);

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
    await gameState.transition(GamePhase.MAIN_MENU, shipyardPayload());

    tick();
  } catch (err) {
    console.error('Boot error:', err);
    const logDiv = document.querySelector('#demo-log');
    if (logDiv) {
      logDiv.innerHTML += `> BOOT ERROR: ${err.message}<br>`;
    }
  }
}

boot();

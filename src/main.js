import * as THREE from 'three';
import { GameState, GamePhase } from './core/GameState.js';
import { LevelConfig } from './core/LevelConfig.js';
import { ShipRegistry, DEFAULT_SHIP_ID } from './config/ShipRegistry.js';
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
// Boot
// ---------------------------------------------------------------------------

async function boot() {
  try {
    // Load Day 1 data
    const { shipDef, levelCfg, rockModels, fishModels, pickupModels, seaweedModels, waveModels, islandModels, sirenModel, krakenModel } = await LevelConfig.load(1);
    // Expose to window for debugging if needed
    window.__DEBUG_ROCK_MODELS = rockModels;

    // Wire buttons
    document.getElementById('btn-main-menu').onclick = () => {
      logEvent('Transitioning to Main Menu...');
      gameState.transition(GamePhase.MAIN_MENU);
    };
    document.getElementById('btn-dock').onclick = () => {
      logEvent('Transitioning to Dock...');
      const activeShipId = gameState._levelCfg?.ship || levelCfg?.ship || DEFAULT_SHIP_ID;
      const activeShipDef = LevelConfig.getShipDef(activeShipId);
      gameState.transition(GamePhase.DOCK, { shipDef: activeShipDef, levelCfg: gameState._levelCfg || levelCfg, fishModels });
    };
    document.getElementById('btn-shipyard').onclick = () => {
      logEvent('Transitioning to Shipyard...');
      const activeShipId = gameState._levelCfg?.ship || levelCfg?.ship || DEFAULT_SHIP_ID;
      const activeShipDef = LevelConfig.getShipDef(activeShipId);
      gameState.transition(GamePhase.SHIPYARD, { shipDef: activeShipDef, levelCfg: gameState._levelCfg || levelCfg, fishModels });
    };
    document.getElementById('btn-obstacle').onclick = () => {
      logEvent('Transitioning to Sailing...');
      const activeShipId = gameState._levelCfg?.ship || levelCfg?.ship || DEFAULT_SHIP_ID;
      const activeShipDef = LevelConfig.getShipDef(activeShipId);
      const profile = ShipRegistry.get(activeShipId);
      let hp = profile.hullHP;
      if (gameState._grid) {
        hp = Math.round((DamageSystem.getSummary(gameState._grid).integrityPct / 100) * profile.hullHP);
      }
      gameState.transition(GamePhase.OBSTACLE, { 
        shipDef: activeShipDef, 
        levelCfg: gameState._levelCfg || levelCfg, 
        shipStats: { hullHP: hp }, 
        rockModels, fishModels, pickupModels, seaweedModels, waveModels, islandModels, sirenModel, krakenModel 
      });
    };
    document.getElementById('btn-editor').onclick = () => {
      logEvent('Transitioning to Level Editor...');
      gameState.transition(GamePhase.EDITOR, { 
        levelCfg: gameState._levelCfg || levelCfg, 
        rockModels, pickupModels, seaweedModels, waveModels, islandModels, sirenModel, krakenModel 
      });
    };

    // Listen for UI events
    on('phaseChanged',       d => logEvent(`[Phase] ${d.phase}`));
    on('docketItemCompleted', d => logEvent(`[Docket] ✓ ${d.label}`));
    on('allRepairsDone',      () => logEvent('[Docket] ALL DONE — ready to sail'));
    on('obstacleHit',        d => logEvent(`[Obstacle] hit by ${d.type} -${d.damage} HP`));
    on('playerDamaged',      () => logEvent(`[Collision] Hull breached!`));
    on('playerSunk',         () => logEvent('[SUNK] Game Over'));

    // Start sailing from shipyard or dock
    on('startSailing', () => {
      const activeShipId = gameState._levelCfg?.ship || levelCfg?.ship || DEFAULT_SHIP_ID;
      const activeShipDef = LevelConfig.getShipDef(activeShipId);
      const profile = ShipRegistry.get(activeShipId);
      let hp = profile.hullHP;
      if (gameState._grid) {
        hp = Math.round((DamageSystem.getSummary(gameState._grid).integrityPct / 100) * profile.hullHP);
      }
      gameState.transition(GamePhase.OBSTACLE, {
        shipDef: activeShipDef,
        levelCfg: gameState._levelCfg || levelCfg,
        shipStats: { hullHP: hp },
        rockModels, fishModels, pickupModels, seaweedModels, waveModels, islandModels, sirenModel, krakenModel
      });
    });

    on('editorRequestPlay', (d) => {
      if (gameState.currentPhase === GamePhase.EDITOR && gameState._editorSystem) {
        const customLevelCfg = gameState._editorSystem.getPlayableConfig();
        const activeShipId = customLevelCfg.ship || DEFAULT_SHIP_ID;
        const activeShipDef = LevelConfig.getShipDef(activeShipId);
        const profile = ShipRegistry.get(activeShipId);

        if (d && d.mode === 'dock') {
          logEvent(`Docking custom level with vessel [${profile.name}]...`);
          gameState.transition(GamePhase.DOCK, {
            shipDef: activeShipDef,
            levelCfg: customLevelCfg,
            fishModels
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
            shipStats: { hullHP: hp }, 
            rockModels, fishModels, pickupModels, seaweedModels, waveModels, islandModels, sirenModel, krakenModel 
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

    // Request phase changes from UI
    on('requestPhaseChange', ({ phase }) => {
      if (phase === GamePhase.MAIN_MENU) {
        logEvent('Main Menu requested...');
        gameState.transition(GamePhase.MAIN_MENU);
      } else if (phase === GamePhase.DOCK) {
        logEvent('Setting Sail -> Arriving at Dock...');
        const activeShipId = gameState._levelCfg?.ship || levelCfg?.ship || DEFAULT_SHIP_ID;
        const activeShipDef = LevelConfig.getShipDef(activeShipId);
        gameState.transition(GamePhase.DOCK, { shipDef: activeShipDef, levelCfg: gameState._levelCfg || levelCfg, fishModels });
      } else if (phase === GamePhase.SHIPYARD) {
        logEvent('Entering Shipyard...');
        const activeShipId = gameState._levelCfg?.ship || levelCfg?.ship || DEFAULT_SHIP_ID;
        const activeShipDef = LevelConfig.getShipDef(activeShipId);
        gameState.transition(GamePhase.SHIPYARD, { shipDef: activeShipDef, levelCfg: gameState._levelCfg || levelCfg, fishModels });
      } else if (phase === GamePhase.OBSTACLE) {
        logEvent('Setting Sail -> Heading to High Seas...');
        const activeShipId = gameState._levelCfg?.ship || levelCfg?.ship || DEFAULT_SHIP_ID;
        const activeShipDef = LevelConfig.getShipDef(activeShipId);
        const profile = ShipRegistry.get(activeShipId);
        let hp = profile.hullHP;
        if (gameState._grid) {
          hp = Math.round((DamageSystem.getSummary(gameState._grid).integrityPct / 100) * profile.hullHP);
        }
        gameState.transition(GamePhase.OBSTACLE, {
          shipDef: activeShipDef,
          levelCfg: gameState._levelCfg || levelCfg,
          shipStats: { hullHP: hp },
          rockModels, fishModels, pickupModels, seaweedModels, waveModels, islandModels, sirenModel, krakenModel
        });
      } else if (phase === GamePhase.EDITOR) {
        logEvent('Opening Map Maker / Level Editor...');
        gameState.transition(GamePhase.EDITOR, { levelCfg: gameState._levelCfg || levelCfg, rockModels, pickupModels, seaweedModels, waveModels, islandModels });
      }
    });

    // Pause handling
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (gameState.currentPhase === GamePhase.DOCK || gameState.currentPhase === GamePhase.RESULTS || gameState.currentPhase === GamePhase.MAIN_MENU) return;
        isPaused = !isPaused;
        if (isPaused) {
          emit('uiMount', { screen: 'pause' });
        } else {
          emit('uiUnmount', { screen: 'pause' });
        }
      }
    });

    on('resumeGame', () => {
      isPaused = false;
      emit('uiUnmount', { screen: 'pause' });
    });

    on('restartPhase', () => {
      if (gameState.currentPhase === GamePhase.OBSTACLE) {
        gameState.transition(GamePhase.OBSTACLE, { levelCfg: gameState._levelCfg || levelCfg, shipStats: {}, rockModels, fishModels, pickupModels, seaweedModels, waveModels, islandModels }, true);
      } else if (gameState.currentPhase === GamePhase.SHIPYARD) {
        gameState.transition(GamePhase.SHIPYARD, { shipDef, levelCfg, fishModels }, true);
      }
    });

    on('gotoShipyard', () => {
      isPaused = false;
      emit('uiUnmount', { screen: 'pause' });
      gameState.transition(GamePhase.SHIPYARD, { shipDef, levelCfg, fishModels });
    });

    on('gotoTitle', () => {
      isPaused = false;
      emit('uiUnmount', { screen: 'pause' });
      gameState.transition(GamePhase.MAIN_MENU);
    });

    // Start at Main Menu
    await gameState.transition(GamePhase.MAIN_MENU, { shipDef, levelCfg, fishModels });

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

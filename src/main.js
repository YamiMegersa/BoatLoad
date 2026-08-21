import * as THREE from 'three';
import { GameState, GamePhase } from './core/GameState.js';
import { LevelConfig }          from './core/LevelConfig.js';
import { on }                   from './core/EventBus.js';
import { BuildMenu }            from './ui/BuildMenu.js';
import { DocketSheet }          from './ui/DocketSheet.js';
import './ui/ui.css';

// ---------------------------------------------------------------------------
// Scene setup
// ---------------------------------------------------------------------------

const canvas   = document.querySelector('#canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const scene  = new THREE.Scene();
scene.background = new THREE.Color(0x222233);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 10, 30);

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------

const ambient = new THREE.AmbientLight(0xf3e3b4, 0.6);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff5e0, 1.2);
sun.position.set(10, 20, 10);
sun.castShadow = true;
scene.add(sun);

// Helpers for debugging scale and orientation
const gridHelper = new THREE.GridHelper(100, 100, 0x444444, 0x222222);
gridHelper.position.y = -0.1; // slightly below 0 so it doesn't z-fight with y=0 voxels
scene.add(gridHelper);

const axesHelper = new THREE.AxesHelper(10);
scene.add(axesHelper);

// ---------------------------------------------------------------------------
// Resize handler
// ---------------------------------------------------------------------------

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Game loop
// ---------------------------------------------------------------------------

const clock      = new THREE.Clock();
const gameState  = new GameState(scene, camera, renderer);
const buildMenu  = new BuildMenu();
const docket     = new DocketSheet();

function tick() {
  requestAnimationFrame(tick);
  const delta = Math.min(clock.getDelta(), 0.05); // cap at 50ms to avoid spiral of death
  gameState.update(delta);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
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
  <div style="display: flex; gap: 10px; margin-bottom: 10px;">
    <button id="btn-shipyard" style="flex:1; padding: 8px; cursor: pointer;">Shipyard</button>
    <button id="btn-obstacle" style="flex:1; padding: 8px; cursor: pointer;">Sailing</button>
  </div>
  <div id="demo-log" style="height: 120px; overflow-y: auto; background: #111; padding: 5px; font-size: 11px; color: #0f0; border: 1px solid #333;">
    Ready.<br>
  </div>
`;
document.getElementById('ui-root')?.appendChild(demoUI);

const logDiv = demoUI.querySelector('#demo-log');
function logEvent(msg) {
  logDiv.innerHTML += `> ${msg}<br>`;
  logDiv.scrollTop = logDiv.scrollHeight;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot() {
  try {
    // Load Day 1 data
    const { shipDef, levelCfg, rockModels, fishModels } = await LevelConfig.load(1);
    
    // Expose to window for debugging if needed
    window.__DEBUG_ROCK_MODELS = rockModels;

    // Log the rock models status
    const logDiv = document.querySelector('#demo-log');
    if (logDiv) {
      logDiv.innerHTML += `> Loaded ${rockModels ? rockModels.length : 0} rock models.<br>`;
      if (fishModels) {
        logDiv.innerHTML += `> Loaded ${fishModels.length} fish models.<br>`;
      }
      logDiv.scrollTop = logDiv.scrollHeight;
    }

    // Wire buttons
    document.getElementById('btn-shipyard').onclick = () => {
      logEvent('Transitioning to Shipyard...');
      gameState.transition(GamePhase.SHIPYARD, { shipDef, levelCfg, fishModels });
    };
    document.getElementById('btn-obstacle').onclick = () => {
      logEvent('Transitioning to Sailing...');
      gameState.transition(GamePhase.OBSTACLE, { shipDef, levelCfg, shipStats: { hullHP: 100 }, rockModels, fishModels });
    };

    // Listen for UI events
    on('phaseChanged',       d => logEvent(`[Phase] ${d.phase}`));
    on('docketItemCompleted', d => logEvent(`[Docket] ✓ ${d.label}`));
    on('allRepairsDone',      () => logEvent('[Docket] ALL DONE — ready to sail'));
    on('obstacleHit',        d => logEvent(`[Obstacle] hit by ${d.type} -${d.damage} HP`));
    on('playerDamaged',      d => logEvent(`[Collision] Hull breached!`));
    on('playerSunk',         () => logEvent('[SUNK] Game Over'));

    // Start at Shipyard for Day 1
    await gameState.transition(GamePhase.SHIPYARD, { shipDef, levelCfg, fishModels });

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

import * as THREE from 'three';
import { GameState, GamePhase } from './core/GameState.js';
import { LevelConfig } from './core/LevelConfig.js';
import { on, emit } from './core/EventBus.js';
import { BuildMenu } from './ui/BuildMenu.js';
import { DocketSheet } from './ui/DocketSheet.js';
import { HUD } from './ui/HUD.js';
import { TitleScreen } from './ui/TitleScreen.js';
import { DialogueBox } from './ui/DialogueBox.js';
import { PauseMenu } from './ui/PauseMenu.js';
import { ParticleSystem } from './environment/ParticleSystem.js';
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

const ambient = new THREE.AmbientLight(0xf3e3b4, 0.6);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff5e0, 1.2);
sun.position.set(10, 20, 10);
sun.castShadow = true;
scene.add(sun);

// Helpers for debugging scale and orientation (Removed)

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

let lastTime = performance.now();
let isPaused = false;
const gameState = new GameState(scene, camera, renderer);
const buildMenu = new BuildMenu();
const docket = new DocketSheet();
const hud = new HUD();
const title = new TitleScreen();
const dialogue = new DialogueBox();
const pauseMenu = new PauseMenu();
const particles = new ParticleSystem(scene);

function tick() {
  requestAnimationFrame(tick);
  const now = performance.now();
  const delta = Math.min((now - lastTime) / 1000, 0.05); // cap at 50ms to avoid spiral of death
  lastTime = now;

  if (!isPaused) {
    gameState.update(delta);
    particles.update(delta);
  }

  renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot() {
  try {
    // Load Day 1 data
    const { shipDef, levelCfg, rockModels, fishModels, pickupModels, seaweedModels, waveModels } = await LevelConfig.load(1);

    // Expose to window for debugging if needed
    window.__DEBUG_ROCK_MODELS = rockModels;

    // Listen for Title Screen Start
    on('startGame', () => {
      emit('uiUnmount', { screen: 'title' });
      gameState.transition(GamePhase.DOCK, {
        dialogue: {
          name: 'Captain Ahab',
          portrait: '⚓',
          lines: [
            "Ahoy there! You the new shipwright?",
            "My sloop took a beating in the reef. Holes in the hull, mast cracked...",
            "I need her seaworthy by sundown. Don't botch it!"
          ]
        }
      });
    });

    // Listen for Dialogue Done
    on('dialogueDone', () => {
      gameState.transition(GamePhase.SHIPYARD, { shipDef, levelCfg, fishModels });
    });


  // Listen for Set Sail click in Shipyard
  on('startSailing', () => {
    gameState.transition(GamePhase.OBSTACLE, { levelCfg, shipStats: {}, rockModels, fishModels });
  });

  // Pause handling
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      if (gameState.currentPhase === GamePhase.DOCK || gameState.currentPhase === GamePhase.RESULTS) return;
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
      gameState.transition(GamePhase.OBSTACLE, { levelCfg, shipStats: {}, rockModels, fishModels }, true);
    } else if (gameState.currentPhase === GamePhase.SHIPYARD) {
      gameState.transition(GamePhase.SHIPYARD, { shipDef, levelCfg, fishModels }, true);
    }
  });

  on('gotoShipyard', () => {
    gameState.transition(GamePhase.SHIPYARD, { shipDef, levelCfg, fishModels });
  });

  on('gotoTitle', () => {
    emit('uiMount', { screen: 'title' });
    gameState.transition(null); // Effectively unmounts current phase
  });

  // Listen for UI events (Console logging now since Demo UI is gone)
  on('phaseChanged', d => console.log(`[Phase] ${d.phase}`));
  on('docketItemCompleted', d => console.log(`[Docket] ✓ ${d.label}`));
  on('allRepairsDone', () => console.log('[Docket] ALL DONE — ready to sail'));
  on('obstacleHit', d => console.log(`[Obstacle] hit by ${d.type} -${d.damage} HP`));
  on('playerDamaged', d => console.log(`[Collision] Hull breached!`));
  on('playerSunk', () => console.log('[SUNK] Game Over'));

  // Start by mounting the Title Screen
  emit('uiMount', { screen: 'title' });

  tick();
} catch (err) {
  console.error('Boot error:', err);
}
}

boot();

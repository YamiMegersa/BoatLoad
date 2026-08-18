import * as THREE from 'three';
import { GameState, GamePhase } from './core/GameState.js';
import { LevelConfig }          from './core/LevelConfig.js';
import { on }                   from './core/EventBus.js';

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

function tick() {
  requestAnimationFrame(tick);
  const delta = Math.min(clock.getDelta(), 0.05); // cap at 50ms to avoid spiral of death
  gameState.update(delta);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot() {
  // Load Day 1 data
  const { shipDef, levelCfg } = await LevelConfig.load(1);

  // Listen for UI events (placeholder console logs until UI modules are ready)
  on('phaseChanged',       d => console.log('[Phase]', d.phase));
  on('docketItemCompleted', d => console.log('[Docket] ✓', d.label));
  on('allRepairsDone',      () => console.log('[Docket] ALL DONE — ready to sail'));
  on('obstacleHit',        d => console.log('[Obstacle] hit by', d.type, '-', d.damage, 'HP'));
  on('playerDamaged',      d => console.log('[HP]', d.hullHP, '/', d.maxHullHP));
  on('playerSunk',         () => console.log('[SUNK]'));

  // Start at Shipyard for Day 1 (skip Dock for now — wire it up later)
  await gameState.transition(GamePhase.SHIPYARD, { shipDef, levelCfg });

  tick();
}

boot().catch(err => console.error('Boot error:', err));

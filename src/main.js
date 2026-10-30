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
import { DivorcePapersUI } from './ui/DivorcePapersUI.js';
import { LoadingScreenUI } from './ui/LoadingScreenUI.js';
import { AnchorCountdownUI } from './ui/AnchorCountdownUI.js';
import { PreSailChartModal } from './ui/PreSailChartModal.js';
import { ShopUI } from './ui/ShopUI.js';
import { ResultsUI } from './ui/ResultsUI.js';
import { CreditsUI } from './ui/CreditsUI.js';
import { CommunityHubUI } from './ui/CommunityHubUI.js';
import { CommunityClient } from './community/CommunityClient.js';
import { ClearCheckManager } from './community/ClearCheckManager.js';
import { ParticleSystem } from './environment/ParticleSystem.js';
import { DamageSystem } from './shipyard/DamageSystem.js';
import { GodRays } from './environment/GodRays.js';
import { PaperFilter } from './environment/PaperFilter.js';
import { AudioManager } from './utils/AudioManager.js';
import { DEBUG } from './utils/debug.js';
import { exportToGLB } from './utils/exportGLTF.js';
import { DirectorMode } from './director/DirectorMode.js';
import { GameEnv } from './core/GameEnv.js';
import { settingsManager } from './core/SettingsManager.js';
import { autoPerformanceController } from './core/AutoPerformance.js';
import { MeshBorderOverlay } from './rendering/MeshBorderOverlay.js';
import './ui/ui.css';

// ---------------------------------------------------------------------------
// Scene setup
// ---------------------------------------------------------------------------

const canvas = document.querySelector('#canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
// Cap pixel ratio to 1.25: renders crisp on high-DPI displays without 4K fillrate collapse
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;

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
sun.shadow.mapSize.width = 1024;
sun.shadow.mapSize.height = 1024;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 160;
sun.shadow.camera.left = -50;
sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50;
sun.shadow.camera.bottom = -50;
sun.shadow.bias = -0.0005;
scene.add(sun);

const moon = new THREE.DirectionalLight(0x9bc0f5, 0.35);
moon.name = 'moonLight';
moon.position.set(-10, -20, -10);
moon.castShadow = false; // Enabled dynamically only when moon rises
moon.shadow.mapSize.width = 1024;
moon.shadow.mapSize.height = 1024;
moon.shadow.camera.near = 0.5;
moon.shadow.camera.far = 160;
moon.shadow.camera.left = -50;
moon.shadow.camera.right = 50;
moon.shadow.camera.top = 50;
moon.shadow.camera.bottom = -50;
moon.shadow.bias = -0.0005;
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

const gameState = new GameState(scene, camera, renderer);
gameState._ambient = ambient;
gameState._sun = sun;
gameState._moon = moon;
gameState._godRays = godRays;
window.gameState = gameState;
window.godRays = godRays;
window.exportToGLB = exportToGLB;

window.inspectTriangles = () => {
  const activeCam = directorMode.isActive ? directorMode.camera : (gameState.activeCamera || camera);
  const items = [];
  let totalTris = 0;
  let totalVisibleTris = 0;
  let meshCount = 0;
  let visibleMeshCount = 0;

  scene.traverse(obj => {
    if (obj.isMesh && obj.geometry) {
      meshCount++;
      const geo = obj.geometry;
      let tris = geo.index ? (geo.index.count / 3) : (geo.attributes.position ? geo.attributes.position.count / 3 : 0);
      if (obj.isInstancedMesh) tris *= obj.count;
      tris = Math.round(tris);
      totalTris += tris;

      const wp = new THREE.Vector3();
      obj.getWorldPosition(wp);
      const dist = activeCam ? Math.round(wp.distanceTo(activeCam.position)) : 0;

      let isEffectivelyVisible = obj.visible;
      let curr = obj.parent;
      while (curr && isEffectivelyVisible) {
        if (!curr.visible) {
          isEffectivelyVisible = false;
          break;
        }
        curr = curr.parent;
      }

      if (isEffectivelyVisible) {
        visibleMeshCount++;
        totalVisibleTris += tris;
      }

      items.push({
        name: obj.name || (obj.parent && obj.parent !== scene ? obj.parent.name : null) || 'Mesh',
        type: obj.isInstancedMesh ? 'InstancedMesh' : 'Mesh',
        triangles: tris,
        distanceM: dist,
        visible: isEffectivelyVisible,
      });
    }
  });

  const visibleItems = items.filter(i => i.visible).sort((a, b) => b.triangles - a.triangles);
  const culledItems = items.filter(i => !i.visible).sort((a, b) => b.triangles - a.triangles);

  console.log(
    `%c[Geometry Audit] ACTIVE GPU TRIS: ${totalVisibleTris.toLocaleString()} (${visibleMeshCount} meshes) | CULLED/DORMANT: ${(totalTris - totalVisibleTris).toLocaleString()} (${meshCount - visibleMeshCount} meshes) | Memory Total: ${totalTris.toLocaleString()}`,
    'color: #38ef7d; font-weight: bold; font-size: 13px;'
  );
  console.log('%c>>> Top ACTIVE Meshes Rendered by GPU (visible: true):', 'color: #38bdf8; font-weight: bold;');
  console.table(visibleItems.slice(0, 15));
  console.log('%c>>> Top CULLED / Dormant Meshes in Memory (visible: false - GPU skipped):', 'color: #fbbf24; font-weight: bold;');
  console.table(culledItems.slice(0, 10));

  // Draw-call breakdown: visible meshes grouped by top-level scene child
  const callMap = {};
  scene.children.forEach(child => {
    if (!child.visible) return;
    let n = 0;
    child.traverse(o => {
      if (!o.isMesh && !o.isLine && !o.isPoints) return;
      for (let p = o; p; p = p.parent) if (!p.visible) return;
      n += Array.isArray(o.material) ? o.material.length : 1;
    });
    if (n > 0) callMap[child.name || child.type + ':' + child.uuid.slice(0, 4)] = n;
  });
  console.log('%c>>> Visible draw items per top-level object (x2-3 with shadows/god rays):', 'color: #f472b6; font-weight: bold;');
  console.table(Object.entries(callMap).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, items]) => ({ name, items })));
  return { activeTris: totalVisibleTris, memoryTris: totalTris, visibleItems, culledItems, callMap };
};

window.addEventListener('keydown', (e) => {
  if (e.code === 'F3') {
    window.inspectTriangles();
  }
});

// Dev-only test helpers (?debug) — used by the iteration-2 test matrix to
// reach hard-to-reach states quickly (sink, low water, day jumps).
if (DEBUG) {
  window.__dev = {
    sink: () => emit('playerSunk'),
    setWater: (n) => { if (gameState._playerShip) gameState._playerShip.waterLevel = n; },
    damage: (n) => gameState._playerShip?.takeDamage(n, 'dev'),
    day: (n) => { gameState.day = n; },
    credits: (list) => gameState.transition(GamePhase.CREDITS, { credits: list }),
  };
  console.info('[BoatLoad] Debug mode — window.__dev helpers: sink(), setWater(n), damage(n), day(n), credits(list)');
}

// Audio: one global instance. Browsers suspend AudioContexts until a valid
// user activation gesture (click/pointerup/keydown), so keep trying until running; M toggles mute.
const audio = new AudioManager();
const unlockAudio = () => {
  audio.unlock();
  if (audio.isUnlocked()) {
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('pointerup', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  }
};
window.addEventListener('click', unlockAudio);
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('pointerup', unlockAudio);
window.addEventListener('keydown', unlockAudio);
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey && !e.shiftKey) audio.toggleMute();
});

// Toggle FPS overlay with Ctrl+Shift+F
window.addEventListener(
  'keydown',
  (e) => {
    const isCtrlOrMeta = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;
    const isF = e.code === 'KeyF' || e.key === 'F' || e.key === 'f';
    if (isCtrlOrMeta && isShift && isF) {
      e.preventDefault();
      e.stopPropagation();
      const next = !settingsManager.get('showFps');
      settingsManager.set('showFps', next);
    }
  },
  true
);

const buildMenu = new BuildMenu();
const dockUI = new DockUI();
const mainMenuUI = new MainMenuUI();
const hud = new HUD();
const dialogue = new DialogueBox();
const pauseMenu = new PauseMenu();
const levelSelectorUI = new LevelSelectorUI(gameState);
const divorcePapersUI = new DivorcePapersUI();
const loadingScreenUI = new LoadingScreenUI();
const anchorCountdownUI = new AnchorCountdownUI();
const preSailChartModal = new PreSailChartModal();
const shopUI = new ShopUI(gameState);
const resultsUI = new ResultsUI(gameState);
const communityHubUI = new CommunityHubUI();
const creditsUI = new CreditsUI(gameState);
window.creditsUI = creditsUI;
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

const meshBorderOverlay = new MeshBorderOverlay(scene, camera);
window.meshBorderOverlay = meshBorderOverlay;

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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
  godRays.resize(window.innerWidth, window.innerHeight);
  mainRT.setSize(window.innerWidth, window.innerHeight);
  paperFilter.resize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// FPS counter
// ---------------------------------------------------------------------------

let frameCount = 0;
let lastFpsTime = performance.now();
let lastRecordedCalls = 0;
let lastRecordedTris = 0;

const fpsCounter = document.createElement('div');
fpsCounter.id = 'fps-counter';
fpsCounter.style.cssText = `
  position: absolute; top: 10px; right: 10px; z-index: 100;
  background: rgba(0,0,0,0.8); color: #0f0; padding: 5px 10px;
  font-family: monospace; border-radius: 4px; font-size: 14px;
  pointer-events: auto; cursor: pointer; user-select: none;
  display: ${settingsManager.get('showFps') ? 'block' : 'none'};
`;
fpsCounter.title = 'Click or press F3 to print live triangle & geometry audit (Ctrl+Shift+F to toggle)';
window.toggleFps = () => {
  const next = !settingsManager.get('showFps');
  settingsManager.set('showFps', next);
  return next;
};
fpsCounter.onclick = () => window.inspectTriangles?.();
fpsCounter.innerText = 'FPS: 0';
document.getElementById('ui-root')?.appendChild(fpsCounter);

// Connect SettingsManager to all game subsystems
settingsManager.bindContext({
  scene,
  camera,
  renderer,
  audio,
  gameState,
  godRays,
  paperFilter,
  fpsCounter,
  directorMode,
  autoPerformance: autoPerformanceController
});

on('phaseChanged', () => {
  settingsManager.applyCamera();
  settingsManager.applyFog();
});

on('weatherChanged', () => {
  settingsManager.applyFog();
});

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
  autoPerformanceController.update(delta, now);
  if (now - lastFpsTime >= 1000) {
    const trisStr = lastRecordedTris >= 1000
      ? `${Math.round(lastRecordedTris / 1000)}k`
      : `${lastRecordedTris}`;
    if (autoPerformanceController.isEnabled()) {
      const dist = autoPerformanceController.getCurrentDrawDistance();
      const scale = Math.round(autoPerformanceController.getCurrentRenderScale() * 100);
      const targetFps = autoPerformanceController.getTargetFps();
      fpsCounter.innerText = `FPS: ${frameCount} (Target: ${targetFps} • ${dist}m, ${scale}%) | Calls: ${lastRecordedCalls} | Tris: ${trisStr}`;
    } else {
      fpsCounter.innerText = `FPS: ${frameCount} | Calls: ${lastRecordedCalls} | Tris: ${trisStr}`;
    }
    frameCount = 0;
    lastFpsTime = now;
  }

  const activeCam = directorMode.isActive ? directorMode.camera : (gameState.activeCamera || camera);
  godRays._camera = activeCam;
  meshBorderOverlay.camera = activeCam;
  meshBorderOverlay.update(delta, now);

  // Re-apply camera FOV and far clipping plane based on Settings
  settingsManager.applyCamera(activeCam);

  const paperSetting = settingsManager.get('paperShader');
  const usePaperShader = Boolean(paperSetting && paperSetting !== 'off');

  const godRaysEnabled = Boolean(settingsManager.get('godRays'));

  // Clear render metrics once per frame before any render passes execute
  renderer.info.reset();

  if (usePaperShader) {
    if (godRaysEnabled) {
      godRays.render(sun, moon, mainRT);
    } else {
      renderer.setRenderTarget(mainRT);
      renderer.render(scene, activeCam);
    }
    paperFilter.render(mainRT);
  } else {
    if (godRaysEnabled) {
      godRays.render(sun, moon, null);
    } else {
      renderer.setRenderTarget(null);
      renderer.render(scene, activeCam);
    }
  }

  // Capture the true cumulative calls and triangles rendered across the entire frame
  lastRecordedCalls = renderer.info.render.calls;
  lastRecordedTris = renderer.info.render.triangles;
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
    <button id="btn-credits" style="flex:1; padding: 8px; cursor: pointer; background: #854d0e; color: white; border: 1px solid #eab308;">Credits</button>
    <button id="btn-mesh-borders" style="flex:1; padding: 8px; cursor: pointer; background: #059669; color: white; border: 1px solid #10b981;" title="Toggle Mesh Borders (Ctrl+Shift+M)">Borders</button>
  </div>
`;
document.getElementById('ui-root')?.appendChild(demoUI);

function logEvent(msg) {
  if (DEBUG) console.info(`[BoatLoad] ${msg}`);
}

on('envModeChanged', ({ isDev }) => {
  demoUI.style.display = isDev ? 'block' : 'none';
  settingsManager.set('showFps', isDev);
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
  noticeBanner.innerHTML = message;
  noticeBanner.style.display = 'block';
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { noticeBanner.style.display = 'none'; }, ms);
}

on('buildError', (d) => {
  console.error('[BoatLoad] Build error:', d.message);
  logEvent(`[Build] ERROR: ${d.message}`);
  showNotice(`<span class="pixel-icon icon-powder-keg size-16"></span> ${d.message}`);
});

on('budgetExceeded', (d) => {
  logEvent(`[Shipyard] Budget exceeded by ${d.deficit} Doubloons`);
  showNotice(`<span class="pixel-icon icon-doubloon size-16"></span> ⚠️ OVER BUDGET: Exceeded customer budget by ${d.deficit} Doubloons! Extra repairs will come from your purse.`, 6000);
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const MAX_DAY = 7;

async function boot() {
  try {
    // Start day: ?debug&day=N jumps straight to a day (dev aid), else day 0 (opening prologue).
    const parsedQueryDay = parseInt(new URLSearchParams(location.search).get('day'), 10);
    const startDay = DEBUG && !Number.isNaN(parsedQueryDay)
      ? Math.max(0, Math.min(MAX_DAY, parsedQueryDay))
      : 0;

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
        showNotice('<span class="pixel-icon icon-sloop size-20"></span> ALL 7 DAYS CLEARED — VOYAGE COMPLETE! <span class="pixel-icon icon-sloop size-20"></span>', 8000);
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

    function editorPayload(customCfg = null) {
      return {
        levelCfg: customCfg || LevelConfig.createEmptyLevel(),
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
      if (gameState.currentPhase === GamePhase.EDITOR) {
        emit('editorRequestPlay');
        return;
      }
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
      if (gameState.currentPhase === GamePhase.EDITOR) {
        emit('editorRequestPlay');
        return;
      }
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
    const btnCredits = document.getElementById('btn-credits');
    if (btnCredits) {
      btnCredits.onclick = () => {
        logEvent('Transitioning to Credits...');
        gameState.transition(GamePhase.CREDITS);
      };
    }
    const btnBorders = document.getElementById('btn-mesh-borders');
    if (btnBorders) {
      btnBorders.onclick = () => meshBorderOverlay.toggle();
    }

    // Listen for UI events
    on('phaseChanged', (d) => {
      logEvent(`[Phase] ${d.phase}`);
      if (d?.phase === GamePhase.RESULTS && (gameState._activeCommunityCourseCode || gameState._isCommunityCourse)) {
        const code = gameState._activeCommunityCourseCode || gameState._activeCommunityCourse?.courseCode || gameState._activeCommunityCourse?.course_code;
        if (code && !d.opts?.failed) {
          const timeElapsed = Math.round(performance.now() - (gameState._communityVoyageStartTime || performance.now()));
          CommunityClient.recordAttempt(code, {
            cleared: true,
            timeMs: timeElapsed
          });
        }
      }
    });
    on('obstacleHit', d => logEvent(`[Obstacle] hit by ${d.type} -${d.damage} HP`));
    on('playerDamaged', () => logEvent(`[Collision] Hull breached!`));
    on('playerSunk', () => logEvent('[SUNK] Game Over'));
    on('voyageLost', async () => {
      if (gameState._activeCommunityCourseCode || gameState._isCommunityCourse) {
        const course = gameState._activeCommunityCourse;
        const courseCode = gameState._activeCommunityCourseCode || course?.courseCode || course?.course_code;
        if (courseCode) {
          CommunityClient.recordAttempt(courseCode, {
            cleared: false
          });
        }
        setPaused(false);
        gameState._sinkSnapshot = null;
        showNotice('Vessel lost at sea — community voyage failed.', 5000);
        await gameState.transition(GamePhase.RESULTS, {
          isCommunity: true,
          failed: true,
          passed: false,
          course: course,
          timeElapsed: gameState._communityVoyageStartTime ? Math.round(performance.now() - gameState._communityVoyageStartTime) : null
        });
        return;
      }
      if (gameState._isEditorPlay) {
        gameState._isEditorPlay = false;
        gameState._isClearCheckRepair = false;
        setPaused(false);
        showNotice('Vessel sank — course verification failed. Returning to Level Editor.', 5000);
        emit('showLoading', { title: 'Returning to Level Editor', message: 'Returning to chart drafting table...', progress: 0.2 });
        await gameState.transition(GamePhase.EDITOR, editorPayload(gameState._editorPlayLevelCfg));
        return;
      }
      setPaused(false);
      showNotice('<span class="pixel-icon icon-skull size-16"></span> Vessel sunk! Resetting vessel and contract with original budget...', 5000);
      gameState._sinkSnapshot = null;
      gameState._grid = null;
      const baseBudget = gameState._levelCfg?.budget !== undefined ? gameState._levelCfg.budget : (level.levelCfg?.budget !== undefined ? level.levelCfg.budget : 200);
      gameState.initContract(gameState.day, baseBudget);
      await gameState.transition(GamePhase.SHIPYARD, { ...shipyardPayload(), forceNew: true });
    });

    on('communityPlayCourseRequested', async ({ course }) => {
      emit('showLoading', { title: 'Shipyard: Outfitting', message: `Entering drydock for "${course.title}"...`, progress: 0.1 });
      const activeShipId = course.shipType || DEFAULT_SHIP_ID;
      const activeShipDef = LevelConfig.getShipDef(activeShipId);

      const level = await LevelConfig.load(1);
      const customLevelCfg = course.levelData || level.levelCfg;

      gameState._isCommunityCourse = true;
      gameState._activeCommunityCourse = course;
      gameState._activeCommunityCourseCode = course.courseCode || course.course_code || course.id;
      gameState._communityVoyageStartTime = null;
      gameState._sinkSnapshot = null;
      gameState._levelCfg = customLevelCfg;

      const baseBudget = customLevelCfg.budget !== undefined ? customLevelCfg.budget : 200;
      gameState.initContract(1, baseBudget);

      gameState.transition(GamePhase.SHIPYARD, {
        shipDef: activeShipDef,
        levelCfg: customLevelCfg,
        fishModels: level.fishModels,
        isCommunity: true,
        forceNew: true
      });
    });

    on('returnToCommunityMenu', async () => {
      setPaused(false);
      gameState._isCommunityCourse = false;
      gameState._activeCommunityCourseCode = null;
      gameState._activeCommunityCourse = null;
      gameState._communityVoyageStartTime = null;
      gameState._sinkSnapshot = null;
      emit('showLoading', { title: 'Returning to Port', message: 'Entering Community Harbor...', progress: 0.2 });
      await gameState.transition(GamePhase.MAIN_MENU, { ...shipyardPayload() });
      emit('uiMount', { screen: 'community' });
      emit('hideLoading');
    });

    on('levelSelected', async ({ day, force }) => {
      if (day !== undefined && day !== null) {
        if (!force && !GameEnv.isDev() && !gameState.isDayUnlocked(day)) {
          console.warn(`[Progression] Day ${day} is locked; cannot select.`);
          return;
        }
        gameState.day = day;
        await syncLevel();
      }
    });

    // Start sailing from shipyard or dock
    on('startSailing', async () => {
      emit('showLoading', { title: 'Setting Sail', message: 'Rigging canvas & casting off lines...', progress: 0.1 });
      await syncLevel();
      const currentLevelCfg = gameState._isEditorPlay
        ? (gameState._editorPlayLevelCfg || gameState._levelCfg)
        : (gameState._levelCfg || level.levelCfg);
      const activeShipId = currentLevelCfg?.ship || DEFAULT_SHIP_ID;
      const activeShipDef = LevelConfig.getShipDef(activeShipId);
      const profile = ShipRegistry.get(activeShipId);
      let hp = profile.hullHP;
      if (gameState._grid) {
        hp = Math.round((DamageSystem.getSummary(gameState._grid).integrityPct / 100) * profile.hullHP);
      }
      const isCommunity = Boolean(gameState._isCommunityCourse || gameState._activeCommunityCourseCode);
      if (isCommunity && !gameState._communityVoyageStartTime) {
        gameState._communityVoyageStartTime = performance.now();
      }
      if (!gameState._voyageStartTime) {
        gameState._voyageStartTime = performance.now();
      }
      gameState.transition(GamePhase.OBSTACLE, {
        shipDef: activeShipDef,
        levelCfg: currentLevelCfg,
        shipStats: { hullHP: hp, profile },
        rockModels: level.rockModels, fishModels: level.fishModels, pickupModels: level.pickupModels,
        seaweedModels: level.seaweedModels, waveModels: level.waveModels, islandModels: level.islandModels,
        sirenModel: level.sirenModel, krakenModel: level.krakenModel,
        isEditorPlay: gameState._isEditorPlay,
        isCommunity: isCommunity,
        course: gameState._activeCommunityCourse
      });
    });

    on('editorRequestPlay', (d) => {
      if (gameState.currentPhase === GamePhase.EDITOR && gameState._editorSystem) {
        const customLevelCfg = gameState._editorSystem.getPlayableConfig();
        const activeShipId = customLevelCfg.ship || DEFAULT_SHIP_ID;
        const activeShipDef = LevelConfig.getShipDef(activeShipId);
        const profile = ShipRegistry.get(activeShipId);

        gameState._isEditorPlay = true;
        gameState._editorPlayLevelCfg = customLevelCfg;

        // Ensure clear check is active for verification
        if (!ClearCheckManager._activeCheck) {
          ClearCheckManager.startClearCheck(customLevelCfg);
        }

        // Every play/test path from the editor routes to the Shipyard first with the allocated budget
        emit('showLoading', { title: 'Shipyard: Hull Repair', message: 'Routing to drydock shipyard to repair vessel with allocated budget before sailing...', progress: 0.1 });
        logEvent(`Editor Play -> Shipyard: Vessel [${profile.name}] with repair budget [$${customLevelCfg.budget}]...`);
        gameState._isClearCheckRepair = true;
        gameState.transition(GamePhase.SHIPYARD, {
          shipDef: activeShipDef,
          levelCfg: customLevelCfg,
          fishModels: level.fishModels,
          isEditorPlay: true,
          isClearCheck: true,
          forceNew: true
        });
      }
    });

    // Wire up God Rays & Paper Shader toggles/sliders
    on('editorToggleGodRays', d => {
      godRays.enabled = !!d.enabled;
    });


    on('requestPhaseChange', async (opts) => {
      try {
        const phase = opts?.phase;
        if (opts?.day !== undefined) {
          if (!opts?.force && !GameEnv.isDev() && !gameState.isDayUnlocked(opts.day)) {
            console.warn(`[Progression] Day ${opts.day} is locked; falling back to Day ${gameState.unlockedDay || 0}`);
            gameState.day = gameState.unlockedDay || 0;
          } else {
            gameState.day = opts.day;
          }
        }
        if (phase === GamePhase.MAIN_MENU) {
          if (gameState.currentPhase === GamePhase.MAIN_MENU) {
            emit('hideLoading');
            return;
          }
          logEvent('Main Menu requested...');
          emit('showLoading', { title: 'Returning to Port', message: 'Returning to harbor tavern...', progress: 0.1 });
          await gameState.transition(GamePhase.MAIN_MENU);
        } else if (phase === GamePhase.DOCK) {
          if (gameState._isClearCheckRepair || gameState.currentPhase === GamePhase.EDITOR) {
            if (gameState.currentPhase === GamePhase.EDITOR) {
              emit('editorRequestPlay');
            }
            return;
          }
          logEvent('Setting Sail -> Arriving at Dock...');
          emit('showLoading', { title: 'Mooring at Harbor', message: 'Arriving at harbor dock...', progress: 0.1 });
          await syncLevel();
          const activeShipId = opts?.shipDef?.id || gameState._levelCfg?.ship || level.levelCfg?.ship || DEFAULT_SHIP_ID;
          const activeShipDef = opts?.shipDef || LevelConfig.getShipDef(activeShipId);
          const activeLevelCfg = opts?.levelCfg || gameState._levelCfg || level.levelCfg;
          await gameState.transition(GamePhase.DOCK, { shipDef: activeShipDef, levelCfg: activeLevelCfg, fishModels: level.fishModels, openShop: opts?.openShop, day: opts?.day }, true);
        } else if (phase === GamePhase.SHIPYARD) {
          logEvent('Entering Shipyard...');
          emit('showLoading', { title: 'Entering Shipyard', message: 'Entering outfitting berth & inspecting hull...', progress: 0.1 });
          await syncLevel();
          const activeShipId = gameState._levelCfg?.ship || level.levelCfg?.ship || DEFAULT_SHIP_ID;
          const activeShipDef = LevelConfig.getShipDef(activeShipId);
          await gameState.transition(GamePhase.SHIPYARD, { shipDef: activeShipDef, levelCfg: gameState._levelCfg || level.levelCfg, fishModels: level.fishModels });
        } else if (phase === GamePhase.OBSTACLE) {
          if (gameState.currentPhase === GamePhase.EDITOR) {
            emit('editorRequestPlay');
            return;
          }
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
          await gameState.transition(GamePhase.OBSTACLE, {
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
          await gameState.transition(GamePhase.EDITOR, editorPayload(opts?.levelCfg));
        } else if (phase === GamePhase.CREDITS) {
          logEvent('Unfurling Credits...');
          emit('showLoading', { title: 'Voyage Concluded', message: 'Unfurling the Grand Honour Roll & Credits...', progress: 0.1 });
          await gameState.transition(GamePhase.CREDITS, opts);
        }
      } catch (err) {
        console.error('[main] requestPhaseChange error:', err);
        emit('hideLoading');
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
      if (gameState.currentPhase === GamePhase.MAIN_MENU || gameState.currentPhase === GamePhase.CREDITS || directorMode.isActive) return;
      setPaused(!isPaused);
    }

    on('requestPause', () => {
      togglePause();
    });

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
      if (gameState._isEditorPlay) {
        gameState._isEditorPlay = false;
        await gameState.transition(GamePhase.EDITOR, editorPayload(gameState._editorPlayLevelCfg));
        return;
      }
      if (gameState._isCommunityCourse || gameState._activeCommunityCourseCode) {
        emit('returnToCommunityMenu');
        return;
      }
      await syncLevel();
      gameState.transition(GamePhase.SHIPYARD, shipyardPayload());
    });

    on('gotoTitle', () => {
      setPaused(false);
      gameState._isEditorPlay = false;
      gameState._isCommunityCourse = false;
      gameState._activeCommunityCourseCode = null;
      gameState._activeCommunityCourse = null;
      gameState._communityVoyageStartTime = null;
      gameState._sinkSnapshot = null;
      gameState.transition(GamePhase.MAIN_MENU);
    });

    // Start at Main Menu
    await gameState.transition(GamePhase.MAIN_MENU, { ...shipyardPayload(), skipLoading: true });

    tick();
  } catch (err) {
    console.error('Boot error:', err);
    showNotice(`<span class="pixel-icon icon-powder-keg size-16"></span> Boot error: ${err.message}`, 10000);
  }
}

boot();

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { VoxelTerrain, BLOCK } from '../src/editor/VoxelTerrain.js';
import { LoadingScreenUI } from '../src/ui/LoadingScreenUI.js';
import { emit, on, off } from '../src/core/EventBus.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup minimal DOM mocks if not in browser
if (typeof document === 'undefined') {
  global.document = {
    createElement(tag) {
      return {
        tagName: tag,
        id: '',
        className: '',
        style: {},
        classList: {
          add(c) { this._classes.add(c); },
          remove(c) { this._classes.delete(c); },
          contains(c) { return this._classes.has(c); },
          _classes: new Set()
        },
        innerHTML: '',
        innerText: '',
        querySelector(selector) {
          return {
            id: selector,
            style: {},
            innerText: '',
            classList: { add() {}, remove() {}, contains() { return false; } }
          };
        },
        querySelectorAll() { return []; },
        appendChild() {},
        remove() {}
      };
    },
    getElementById() { return null; },
    body: { appendChild() {} }
  };
  global.performance = { now: () => Date.now() };
}

test('LoadingScreenUI: show, update, and hide lifecycle with persistence', async () => {
  const loading = new LoadingScreenUI();

  // Initial show
  loading.show({ title: 'Setting Sail', message: 'Rigging canvas...', progress: 0.15 });
  assert.equal(loading._visible, true);
  assert.equal(loading._progress, 0.15);
  const initialStartTime = loading._showStartTime;

  // Subsequent show while already visible should smoothly update rather than restart
  loading.show({ title: 'Navigating Reefs', message: 'Clearing harbor...', progress: 0.35 });
  assert.equal(loading._visible, true);
  assert.equal(loading._showStartTime, initialStartTime, 'Start time must not be reset on repeated show calls');
  assert.equal(loading._progress, 0.35);

  // Update
  loading.update({ progress: 0.75, message: 'Charting hazards...' });
  assert.equal(loading._progress, 0.75);

  // Hide
  let dismissed = false;
  await new Promise(resolve => {
    loading.hide({
      immediate: true,
      onDismissed: () => {
        dismissed = true;
        resolve();
      }
    });
  });
  assert.equal(dismissed, true);
  assert.equal(loading._visible, false);
});

test('VoxelTerrain: deserializeAsync runs asynchronously and reports progress', async () => {
  const scene = new THREE.Scene();
  const terrain = new VoxelTerrain(scene);

  // Create sample chunk data
  terrain.setVoxel(0, 5, 0, BLOCK.SAND);
  terrain.setVoxel(35, 8, 35, BLOCK.GRASS);
  terrain.setVoxel(-20, 10, -20, BLOCK.STONE);
  const serialized = terrain.serialize();

  // Test synchronous deserialize
  const terrainSync = new VoxelTerrain(scene);
  terrainSync.deserialize(serialized);
  assert.equal(terrainSync.chunks.size, terrain.chunks.size);

  // Test asynchronous deserialize
  const terrainAsync = new VoxelTerrain(scene);
  const progressReports = [];
  await terrainAsync.deserializeAsync(serialized, (pct) => {
    progressReports.push(pct);
  });

  assert.equal(terrainAsync.chunks.size, terrain.chunks.size);
  assert.ok(progressReports.length > 0, 'Progress must be reported during async deserialization');
  assert.equal(progressReports[progressReports.length - 1], 1.0, 'Final progress report must be 1.0 (100%)');
});

test('GameState: transition to OBSTACLE prepares sea chart & anchor countdown before hiding loading screen', () => {
  const gameStateSrc = fs.readFileSync(path.join(__dirname, '../src/core/GameState.js'), 'utf8');

  // Verify _startAnchorCountdownSequence is called BEFORE the phase dismissal of hideLoading
  const countdownIdx = gameStateSrc.indexOf('this._startAnchorCountdownSequence();');
  const hideLoadingIdx = gameStateSrc.indexOf("emit('hideLoading', { onDismissed");
  assert.ok(countdownIdx !== -1, '_startAnchorCountdownSequence must be called');
  assert.ok(hideLoadingIdx !== -1, "emit('hideLoading', { onDismissed }) must be called");
  assert.ok(countdownIdx < hideLoadingIdx, '_startAnchorCountdownSequence must be called before hideLoading dismissal');
});

test('GameState: level completion latches goal and transitions to RESULTS without per-frame cancellation or loading spinner delay', () => {
  const gameStateSrc = fs.readFileSync(path.join(__dirname, '../src/core/GameState.js'), 'utf8');

  // 1. Synchronous nextPhase guard prevents 60fps _updateObstacle calls from cancelling an in-flight transition
  assert.match(gameStateSrc, /if \(\(this\.currentPhase === newPhase \|\| this\.nextPhase === newPhase\) && !force\)/);
  // 2. RESULTS skips multi-stage loading spinner delay
  assert.match(gameStateSrc, /const skipLoading = Boolean\(opts\?\.skipLoading \|\| newPhase === GamePhase\.RESULTS\);/);
  // 3. _updateObstacle latches _goalReached so Safe Harbor entry only triggers once
  assert.match(gameStateSrc, /if \(this\._goalReached \|\| this\.nextPhase\) return;/);
  assert.match(gameStateSrc, /this\._goalReached = true;/);
});


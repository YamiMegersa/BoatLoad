import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelGrid, CellState } from '../src/shipyard/VoxelGrid.js';
import { ShipBuilder } from '../src/shipyard/ShipBuilder.js';
import { ChunkRenderer } from '../src/shipyard/ChunkRenderer.js';
import { BuildSystem } from '../src/shipyard/BuildSystem.js';
import { BudgetManager } from '../src/shipyard/BudgetManager.js';

test('Shipyard repair: only unpatched level json damage cells render red outlines', async () => {
  const W = 10, H = 10, D = 10;
  const grid = new VoxelGrid(W, H, D);

  // Fill ship hull with intact voxels
  for (let z = 2; z <= 7; z++) {
    for (let y = 1; y <= 4; y++) {
      for (let x = 2; x <= 7; x++) {
        grid.setState(x, y, z, CellState.INTACT);
      }
    }
  }

  // Authored level damage: 2 cells in level JSON
  const levelCfg = {
    damage: [
      {
        zone: 'hull',
        state: 'MISSING',
        cells: [
          [3, 2, 3],
          [3, 2, 4]
        ]
      }
    ]
  };

  ShipBuilder._applyDamage(grid, levelCfg);
  grid.captureInitialState();

  assert.equal(grid.isLevelDamage(3, 2, 3), true, 'Level damage cell (3,2,3) should be registered');
  assert.equal(grid.isLevelDamage(3, 2, 4), true, 'Level damage cell (3,2,4) should be registered');
  assert.equal(grid.isLevelDamage(4, 2, 3), false, 'Intact cell (4,2,3) should NOT be level damage');

  const scene = new THREE.Scene();
  const renderer = new ChunkRenderer();
  renderer.init(grid, scene, null, { showMissingOutlines: true, filterMissingByLevelDamage: true });

  // 1. Initial state: Exactly the 2 level damage cells should have red outlines
  const countOutlines = () => {
    let count = 0;
    for (const mesh of renderer._individualMeshes.values()) {
      if (mesh.type === 'LineSegments' || mesh.isLineSegments) {
        count++;
      }
    }
    return count;
  };

  assert.equal(countOutlines(), 2, 'Only the 2 level damage cells should initially have red outline squares');

  // 2. BuildSystem: Player patches one level damage cell (3, 2, 3)
  const budget = new BudgetManager(500);
  const buildSystem = new BuildSystem();
  buildSystem.init(grid, scene, renderer.container, budget);

  buildSystem.placeObject(3, 2, 3, null);
  renderer.sync(grid);

  assert.equal(grid.getState(3, 2, 3), CellState.REPAIRED, 'Cell (3,2,3) should be REPAIRED');
  assert.equal(countOutlines(), 1, 'Patching a level damage cell should remove its red outline (1 remaining)');

  // 3. Player deletes an intact cell (4, 2, 4) with the Eraser tool
  buildSystem._activeBrush = { id: 'eraser', name: 'Eraser', isEraser: true, size: [1, 1, 1] };
  const erasedIntact = buildSystem.placeObject(4, 2, 4, null);
  assert.equal(erasedIntact, true, 'Should successfully erase intact cell');
  renderer.sync(grid);

  assert.equal(grid.getState(4, 2, 4), CellState.MISSING, 'Erased intact cell should become MISSING');
  assert.equal(grid.isLevelDamage(4, 2, 4), false, 'Erased intact cell was NOT in level JSON');
  assert.equal(countOutlines(), 1, 'Deleting an intact cell must NOT render a red outline square!');

  // 4. Player places a new block in empty space (8, 8, 8) and then deletes it
  buildSystem._activeBrush = { id: 'voxel', name: 'Block', isEraser: false, size: [1, 1, 1] };
  buildSystem.placeObject(8, 8, 8, null);
  renderer.sync(grid);
  assert.equal(grid.getState(8, 8, 8), CellState.REPAIRED);

  buildSystem._activeBrush = { id: 'eraser', name: 'Eraser', isEraser: true, size: [1, 1, 1] };
  buildSystem.placeObject(8, 8, 8, null);
  renderer.sync(grid);

  assert.equal(grid.getState(8, 8, 8), CellState.EMPTY, 'Erased block placed in empty air should revert to EMPTY');
  assert.equal(countOutlines(), 1, 'Deleting an added block must NOT render a red outline square!');

  // 5. Player erases their patch on level damage cell (3, 2, 3)
  buildSystem._activeBrush = { id: 'eraser', name: 'Eraser', isEraser: true, size: [1, 1, 1] };
  buildSystem.placeObject(3, 2, 3, null);
  renderer.sync(grid);

  assert.equal(grid.getState(3, 2, 3), CellState.MISSING, 'Unpatched cell should be MISSING');
  assert.equal(countOutlines(), 2, 'Unpatching a level damage cell should restore its red outline square');

  buildSystem.reset();
  renderer.dispose(scene);
});


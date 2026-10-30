import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelGrid, CellState, WATERLINE_Y } from '../src/shipyard/VoxelGrid.js';
import { DamageBrushType, BrushSize, BoatDestructionWorkshop } from '../src/editor/BoatDestructionWorkshop.js';

test('BoatDestructionWorkshop - brush calculations and damage carving', async () => {
  const workshop = new BoatDestructionWorkshop();
  const grid = new VoxelGrid(10, 10, 10);

  // Fill grid with intact voxels
  grid.forEach((x, y, z) => {
    grid.setState(x, y, z, CellState.INTACT);
  });

  workshop._grid = grid;
  workshop._zones = {
    hull: [{ xRange: [0, 9], yRange: [0, 4], zRange: [0, 9] }],
    deck: [{ xRange: [0, 9], yRange: [5, 9], zRange: [0, 9] }]
  };
  workshop._pristineHullCount = 1000;

  // 1. Single Voxel Brush
  workshop.setBrush(DamageBrushType.SINGLE);
  workshop._hoveredCell = { x: 5, y: 3, z: 5 };
  workshop.applyStroke();

  assert.equal(grid.getState(5, 3, 5), CellState.MISSING, 'Single voxel should be marked MISSING');
  let stats = workshop.getStats();
  assert.equal(stats.missing, 1, 'Missing count should be 1');
  assert.equal(stats.leaks, 1, 'y=3 is <= WATERLINE_Y (4), so leaks should be 1');
  assert.equal(stats.repairCost, 5, 'Repair cost should be 1 * $5 = $5');

  // 2. Cannonball Brush (Crater)
  workshop.setBrush(DamageBrushType.CANNONBALL);
  workshop.setBrushSize(BrushSize.SMALL); // radius 1.5
  workshop._hoveredCell = { x: 5, y: 7, z: 5 }; // above waterline
  workshop.applyStroke();

  stats = workshop.getStats();
  assert.ok(stats.missing > 5, 'Cannonball crater should carve multiple voxels');
  assert.equal(stats.leaks, 1, 'New crater is at y=7 so waterline leaks should still be 1');

  // 3. Waterline Breach Brush
  workshop.setBrush(DamageBrushType.WATERLINE);
  workshop._hoveredCell = { x: 2, y: 6, z: 2 }; // hovered above, but should target y <= WATERLINE_Y
  workshop.applyStroke();

  stats = workshop.getStats();
  assert.ok(stats.leaks > 1, 'Waterline breach should increase leaks count');

  // 4. Undo and Redo
  const preUndoMissing = stats.missing;
  workshop.undo();
  stats = workshop.getStats();
  assert.ok(stats.missing < preUndoMissing, 'Undo should restore carved voxels');

  workshop.redo();
  stats = workshop.getStats();
  assert.equal(stats.missing, preUndoMissing, 'Redo should re-carve the stroke');

  // 5. Restore Patch Brush
  const prePatchMissing = stats.missing;
  workshop.setBrush(DamageBrushType.PATCH);
  workshop.setBrushSize(BrushSize.SMALL);
  workshop._hoveredCell = { x: 5, y: 3, z: 5 };
  workshop.applyStroke();

  assert.equal(grid.getState(5, 3, 5), CellState.INTACT, 'Patch brush should restore voxel to INTACT');
  stats = workshop.getStats();
  assert.equal(stats.missing, prePatchMissing - 1, 'Missing count should decrease by 1');

  // 6. Serialization to level format
  const serialized = workshop.serializeDamage();
  assert.ok(Array.isArray(serialized), 'Serialized damage should be an array');
  assert.ok(serialized.length > 0, 'Should have damage entries');
  for (const entry of serialized) {
    assert.equal(entry.state, 'MISSING', 'Entries should have state MISSING');
    assert.ok(Array.isArray(entry.cells), 'Entry cells should be an array of coordinates');
    assert.ok(entry.cells.length > 0, 'Entry cells should not be empty');
  }

  // 7. Reset Pristine
  workshop.resetPristine();
  stats = workshop.getStats();
  assert.equal(stats.missing, 0, 'After reset pristine, missing count should be 0');
  assert.equal(stats.leaks, 0, 'Leaks should be 0');
  assert.equal(stats.integrityPct, 100, 'Integrity should be 100%');
});

test('BoatDestructionWorkshop - Symmetry mirror mode', async () => {
  const workshop = new BoatDestructionWorkshop();
  const grid = new VoxelGrid(10, 10, 10);
  grid.forEach((x, y, z) => grid.setState(x, y, z, CellState.INTACT));

  workshop._grid = grid;
  workshop._zones = { hull: [{ xRange: [0, 9], yRange: [0, 9], zRange: [0, 9] }] };
  workshop._pristineHullCount = 1000;

  workshop.toggleMirror(true);
  workshop.setBrush(DamageBrushType.SINGLE);
  workshop._hoveredCell = { x: 4, y: 4, z: 2 };
  workshop.applyStroke();

  assert.equal(grid.getState(4, 4, 2), CellState.MISSING, 'Primary cell should be MISSING');
  // Mirror across depth 10: z_mirror = 10 - 1 - 2 = 7
  assert.equal(grid.getState(4, 4, 7), CellState.MISSING, 'Symmetrical mirror cell z=7 should be MISSING');
});

test('BoatDestructionWorkshop - importBoatFromLevel', async () => {
  const workshop = new BoatDestructionWorkshop();
  const sampleLevelJson = {
    day: 5,
    ship: 'sloop',
    budget: 350,
    damage: [
      {
        zone: 'hull',
        state: 'MISSING',
        cells: [[2, 1, 2], [3, 1, 2], [2, 2, 2]]
      },
      {
        zone: 'deck',
        state: 'MISSING',
        cells: [[5, 6, 10]]
      }
    ]
  };

  // Mock _loadShip in headless test environment
  workshop._loadShip = async (shipId, damageEntries) => {
    workshop._shipId = shipId;
    const grid = new VoxelGrid(12, 12, 24);
    grid.forEach((x, y, z) => grid.setState(x, y, z, CellState.INTACT));
    workshop._grid = grid;
    workshop._zones = {
      hull: [{ xRange: [0, 11], yRange: [0, 4], zRange: [0, 23] }],
      deck: [{ xRange: [0, 11], yRange: [5, 11], zRange: [0, 23] }]
    };
    workshop._pristineHullCount = 2000;

    // Apply damage
    for (const entry of (damageEntries || [])) {
      for (const [x, y, z] of entry.cells) {
        if (grid.inBounds(x, y, z)) {
          grid.setState(x, y, z, CellState.MISSING);
        }
      }
    }
  };

  const res = await workshop.importBoatFromLevel(sampleLevelJson);
  assert.equal(res.success, true, 'Import should succeed');
  assert.equal(res.shipId, 'sloop', 'Should match imported ship ID');
  assert.equal(res.breachesCount, 4, 'Should have 4 total missing cells');

  const stats = workshop.getStats();
  assert.equal(stats.missing, 4, 'Stats missing count should be 4');
  assert.equal(stats.leaks, 3, 'Cells at y=1 and y=2 are <= WATERLINE_Y (4), so leaks should be 3');
  assert.equal(stats.repairCost, 20, '4 missing voxels * $5 = $20');
});

test('ChunkRenderer - Voxel culling 3D texture and outlines configuration', async () => {
  const THREE = await import('three');
  const { ChunkRenderer } = await import('../src/shipyard/ChunkRenderer.js');

  const grid = new VoxelGrid(4, 4, 4);
  grid.setState(1, 1, 1, CellState.INTACT);
  grid.setState(1, 1, 2, CellState.MISSING);

  const scene = new THREE.Scene();
  const dummyMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  const gltfScene = new THREE.Group();
  gltfScene.add(dummyMesh);

  const renderer = new ChunkRenderer();
  renderer.init(grid, scene, gltfScene, { showMissingOutlines: false, filterMissingByLevelDamage: false });

  assert.ok(renderer._voxel3DTexture, 'Should create 3D Data texture for voxel culling');
  assert.equal(renderer._showMissingOutlines, false, 'Outlines should be disabled');
  assert.equal(renderer._individualMeshes.size, 0, 'No red outline mesh should spawn when outlines are false');

  // Enable outlines
  renderer.setShowMissingOutlines(true, false);
  assert.equal(renderer._showMissingOutlines, true, 'Outlines should be enabled');
  assert.ok(renderer._individualMeshes.size > 0, 'Should spawn missing outline mesh when enabled');

  // Update transform
  renderer.container.position.set(-50.9, -1.4, 10.5);
  renderer.updateTransform();
  const inv = renderer._voxelUniforms.uContainerWorldInverse.value;
  assert.ok(inv, 'Inverse matrix uniform should be populated');

  renderer.dispose(scene);
  assert.equal(renderer._voxel3DTexture, null, '3D texture should be disposed');
});


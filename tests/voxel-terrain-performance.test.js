import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelTerrain, BLOCK } from '../src/editor/VoxelTerrain.js';

test('VoxelTerrain: applyBrush raises land and selectively marks dirty chunks', () => {
  const scene = new THREE.Scene();
  const terrain = new VoxelTerrain(scene);

  // Brush in the center of chunk 0,0 (world coords 16, 16, radius 3)
  terrain.applyBrush(16, 16, 3, 'raise', 5, 'circle');

  // Verify voxels were set
  assert.equal(terrain.getTopY(16, 16), 5, 'Voxel at center should be raised to target Y = 5');
  assert.equal(terrain.hasCollision(16, 16), true, 'Collision should be present at raised voxel');

  // Center brush of radius 3 (from 13 to 19) does not touch chunk boundaries (0 or 31)
  assert.ok(terrain.dirtyChunks.has('0,0'), 'Chunk 0,0 must be marked dirty');
  assert.equal(terrain.dirtyChunks.size, 1, 'Only chunk 0,0 should be marked dirty (no neighbors touched)');

  terrain.updateDirtyMeshes();
  assert.equal(terrain.dirtyChunks.size, 0, 'dirtyChunks should be cleared after updateDirtyMeshes');
  assert.ok(terrain.meshes.has('0,0'), 'Mesh for chunk 0,0 should exist');

  const mesh = terrain.meshes.get('0,0');
  assert.ok(mesh.geometry.attributes.position.count > 0, 'Geometry must have vertices');
  assert.ok(mesh.geometry.attributes.normal, 'Geometry must have normal attribute');
  assert.ok(mesh.geometry.attributes.color, 'Geometry must have color attribute');
  assert.ok(mesh.geometry.attributes.aBlockType, 'Geometry must have aBlockType attribute');

  terrain.dispose();
});

test('VoxelTerrain: boundary brush marks adjacent neighbor dirty only if neighbor exists', () => {
  const scene = new THREE.Scene();
  const terrain = new VoxelTerrain(scene);

  // Create an adjacent neighbor chunk (1, 0)
  terrain.applyBrush(35, 16, 2, 'raise', 3, 'circle');
  terrain.updateDirtyMeshes();
  assert.ok(terrain.chunks.has('1,0'), 'Chunk 1,0 must exist');

  // Now apply a brush at x=31 (right edge of chunk 0,0)
  terrain.applyBrush(31, 16, 1, 'raise', 4, 'circle');

  // Chunk 0,0 was modified and its right boundary (lx=31) was touched
  assert.ok(terrain.dirtyChunks.has('0,0'), 'Chunk 0,0 should be dirty');
  assert.ok(terrain.dirtyChunks.has('1,0'), 'Neighbor chunk 1,0 should be dirty because boundary was touched');
  // Neighbor (0, 1) or (-1, 0) should NOT be dirty
  assert.ok(!terrain.dirtyChunks.has('0,1'), 'Chunk 0,1 should not be dirty');
  assert.ok(!terrain.dirtyChunks.has('-1,0'), 'Chunk -1,0 should not be dirty');

  terrain.dispose();
});

test('VoxelTerrain: lowering terrain carves voxels and removes empty chunk meshes', () => {
  const scene = new THREE.Scene();
  const terrain = new VoxelTerrain(scene);

  // Raise small island
  terrain.applyBrush(16, 16, 2, 'raise', 3, 'circle');
  terrain.updateDirtyMeshes();
  assert.ok(terrain.meshes.has('0,0'));

  // Lower to -1 (completely carve away)
  terrain.applyBrush(16, 16, 4, 'lower', -1, 'circle');
  terrain.updateDirtyMeshes();

  assert.equal(terrain.getTopY(16, 16), -1, 'TopY should be -1 after carving');
  assert.equal(terrain.meshes.has('0,0'), false, 'Empty chunk mesh should be disposed and removed');

  terrain.dispose();
});

test('VoxelTerrain: brush shapes (square, organic, crag, scatter) work without errors', () => {
  const scene = new THREE.Scene();
  const terrain = new VoxelTerrain(scene);

  const shapes = ['square', 'organic', 'crag', 'scatter'];
  for (let i = 0; i < shapes.length; i++) {
    const shape = shapes[i];
    terrain.applyBrush(i * 30 + 10, 10, 4, 'raise', 3, shape);
  }

  terrain.updateDirtyMeshes();
  for (let i = 0; i < shapes.length; i++) {
    assert.ok(terrain.getTopY(i * 30 + 10, 10) >= 0, `TopY for ${shapes[i]} should be >= 0`);
  }

  terrain.dispose();
});

test('VoxelTerrain: serialization and deserialization roundtrip', () => {
  const scene = new THREE.Scene();
  const terrain = new VoxelTerrain(scene);
  terrain.setBiome('autumn');
  terrain.applyBrush(10, 10, 3, 'raise', 6, 'circle');
  terrain.updateDirtyMeshes();

  const serialized = terrain.serialize();
  assert.equal(serialized.biome, 'autumn');
  assert.ok(serialized.chunks['0,0'], 'Serialized data should contain chunk 0,0');

  const loadedTerrain = new VoxelTerrain(scene);
  loadedTerrain.deserialize(serialized);

  assert.equal(loadedTerrain.biome, 'autumn');
  assert.equal(loadedTerrain.getTopY(10, 10), 6);
  assert.ok(loadedTerrain.meshes.has('0,0'));

  terrain.dispose();
  loadedTerrain.dispose();
});

test('VoxelTerrain Performance Benchmark: drawing large swathes of land is fast', () => {
  const scene = new THREE.Scene();
  const terrain = new VoxelTerrain(scene);

  const start = performance.now();
  // Simulate sweeping a large brush across 100 coordinates across multiple chunks
  for (let i = 0; i < 100; i++) {
    const x = i * 2;
    const z = Math.sin(i * 0.1) * 20;
    terrain.applyBrush(x, z, 5, 'raise', 8, 'circle');
  }

  const brushTime = performance.now() - start;
  assert.ok(brushTime < 250, `100 brush applications should take < 250ms (took ${brushTime.toFixed(1)}ms)`);

  const meshStart = performance.now();
  terrain.updateDirtyMeshes();
  const meshTime = performance.now() - meshStart;

  assert.ok(meshTime < 300, `Meshing all dirty chunks should take < 300ms (took ${meshTime.toFixed(1)}ms)`);

  terrain.dispose();
});

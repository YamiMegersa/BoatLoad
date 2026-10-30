import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { DamageSystem } from '../src/shipyard/DamageSystem.js';
import { ShipBuilder } from '../src/shipyard/ShipBuilder.js';
import { CellState, VoxelGrid } from '../src/shipyard/VoxelGrid.js';

test('docket tasks use authored labels and count all supported damage states', () => {
  const grid = new VoxelGrid(4, 8, 4);
  const zones = {
    hull: [{ xRange: [0, 3], yRange: [0, 3], zRange: [0, 3] }],
    sail: [{ xRange: [0, 3], yRange: [4, 7], zRange: [0, 3] }],
  };
  grid.setState(0, 0, 0, CellState.MISSING);
  grid.setState(1, 1, 1, CellState.FLOODED);
  grid.setState(2, 5, 2, CellState.DAMAGED);

  const authored = [
    { id: 'hull-patch', zone: 'hull', label: 'Patch the hull breach', tool: 'hammer', mandatory: true },
    { id: 'sail-mend', zone: 'sail', label: 'Mend the sail', tool: 'needle', mandatory: false },
  ];
  const tasks = DamageSystem.buildDocket(grid, zones, authored);

  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].label, 'Patch the hull breach');
  assert.equal(tasks[0].remaining, 2);
  assert.equal(tasks[0].leaks, 2);
  assert.equal(tasks[1].remaining, 1);

  grid.setState(0, 0, 0, CellState.INTACT);
  const progress = DamageSystem.getDocketProgress(grid, tasks);
  assert.equal(progress[0].remaining, 1);
  assert.equal(progress[0].completed, false);
  assert.equal(progress[1].remaining, 1);

  grid.setState(1, 1, 1, CellState.INTACT);
  grid.setState(2, 5, 2, CellState.INTACT);
  const repaired = DamageSystem.getDocketProgress(grid, tasks);
  assert.equal(repaired[0].completed, true);
  assert.equal(repaired[1].completed, true);
});

test('unmapped damaged zones receive an explanatory fallback task', () => {
  const grid = new VoxelGrid(2, 2, 2);
  grid.setState(1, 1, 1, CellState.DAMAGED);
  const tasks = DamageSystem.buildDocket(grid, {});

  assert.equal(tasks.length, 1);
  assert.match(tasks[0].label, /superstructure/);
  assert.equal(tasks[0].remaining, 1);
});

test('authored damage in every day config maps to the intended docket zones', async () => {
  const levelsUrl = new URL('../src/assets/levels/', import.meta.url);
  const ship = JSON.parse(await readFile(new URL('../src/assets/ships/sloop.json', import.meta.url), 'utf8'));
  const filenames = (await readdir(levelsUrl)).filter(name => /^day[2-7]\.json$/.test(name));

  assert.equal(filenames.length, 6);
  for (const filename of filenames) {
    const level = JSON.parse(await readFile(new URL(filename, levelsUrl), 'utf8'));
    const grid = new VoxelGrid(ship.grid.x, ship.grid.y, ship.grid.z);

    for (const entry of level.damage) {
      for (const [x, y, z] of entry.cells) {
        assert.equal(
          ShipBuilder.zoneOf({ x, y, z }, ship.zones),
          entry.zone,
          `${filename} damage at (${x}, ${y}, ${z}) should map to ${entry.zone}`,
        );
      }
    }

    DamageSystem.applyDamageList(grid, level.damage);
    const tasks = DamageSystem.buildDocket(grid, ship.zones, level.docket);
    assert.deepEqual(
      new Set(tasks.map(task => task.zone)),
      new Set(['hull', 'sail', 'mast']),
      `${filename} should produce one visible task per authored damaged zone`,
    );
  }
});

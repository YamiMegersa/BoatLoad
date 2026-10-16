import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dayOne = JSON.parse(await readFile(
  new URL('../public/assets/levels/day1.json', import.meta.url),
  'utf8',
));

test('Day 1 keeps to calm hazards and ends at a defined harbor goal', () => {
  assert.equal(dayOne.day, 1);
  assert.equal(dayOne.ship, 'sloop');
  assert.equal(dayOne.weather, 'sunny');
  assert.equal(dayOne.budget, 200);
  assert.equal(Object.hasOwn(dayOne, 'kraken'), false);
  assert.equal(Object.hasOwn(dayOne, 'sirens'), false);
  assert.deepEqual(
    dayOne.docket.filter(item => item.mandatory).map(item => item.zone),
    ['hull', 'sail', 'mast'],
  );
  assert.ok(dayOne.endLocation);
  assert.deepEqual(dayOne.endLocation.position, { x: 0, y: 0, z: -240 });
  assert.equal(dayOne.endLocation.radius, 16);
});

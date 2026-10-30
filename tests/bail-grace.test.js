import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PlayerShip } from '../src/obstacle/PlayerShip.js';
import { QTESystem } from '../src/obstacle/QTESystem.js';
import { clear, on, off } from '../src/core/EventBus.js';

const mockOcean = {
  getWaveHeight: () => 0.0,
  getWaveInfo: () => ({ height: 0.0, normal: new THREE.Vector3(0, 1, 0) }),
};

function createShipWithBreach(qte) {
  const container = new THREE.Group();
  container.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2)));
  const chunkRenderer = { container };
  // Keel hole located safely below the waterline
  const grid = {
    toWorldPos: () => new THREE.Vector3(0, -5, 0),
    forEach: () => {},
  };
  const ship = new PlayerShip({}, new THREE.Scene(), chunkRenderer, grid, qte);
  ship.activeBreaches = [{
    x: 0, y: 0, z: 0,
    sector: 'keel',
    tier: 2,
  }];
  return ship;
}

test('PlayerShip: actively holding/pumping stops net water inflow', () => {
  clear();
  const qte = new QTESystem();
  const ship = createShipWithBreach(qte);

  // Initial water
  ship.waterLevel = 10;
  ship._bailingWater = true;

  // Update 1.0 second while actively bailing
  ship.update(1.0, mockOcean);

  // Water level did not increase because inflow is 0 while bailing
  assert.equal(ship.waterLevel, 10);
  assert.equal(ship.currentFlowRate, 0);

  qte.dispose();
  clear();
});

test('PlayerShip: successful bail grants 6.0s zero-intake grace period followed by slow ramp-up', () => {
  clear();
  const qte = new QTESystem();
  const ship = createShipWithBreach(qte);

  ship.waterLevel = 50;
  let bailedEvent = null;
  on('waterBailed', d => { bailedEvent = d; });

  // Let ship.update trigger the QTE
  ship._bailCooldown = 0;
  ship._bailingWater = false;
  ship.update(0.016, mockOcean);

  assert.equal(ship._bailingWater, true);

  // Complete the bail QTE with 100% accuracy
  qte._succeed();

  assert.ok(bailedEvent !== null);
  assert.equal(ship._bailingWater, false);
  assert.equal(ship._bailGraceTimer, 6.0);
  assert.equal(ship._bailCooldown, 6.0);

  // Water level was substantially drained from 50 (cleared ~42.5 water)
  assert.ok(ship.waterLevel < 15);
  const waterAfterBail = ship.waterLevel;

  // 1. Advance 3.0 seconds (halfway through the 6-second grace period)
  ship.update(3.0, mockOcean);
  assert.ok(ship._bailGraceTimer > 0 && ship._bailGraceTimer <= 3.0);
  assert.equal(ship.currentFlowRate, 0);
  assert.equal(ship.waterLevel, waterAfterBail); // Still zero intake!

  // 2. Advance another 3.0 seconds (finishing the 6-second grace period)
  ship.update(3.0, mockOcean);
  assert.equal(ship._bailGraceTimer, 0);
  assert.equal(ship._bailRampTimer, 4.0); // 4-second ramp starts
  assert.equal(ship.waterLevel, waterAfterBail);

  // 3. Advance 2.0 seconds into the 4-second ramp (50% flow rate)
  ship.update(2.0, mockOcean);
  assert.ok(ship._bailRampTimer > 0 && ship._bailRampTimer <= 2.0);
  assert.ok(ship.currentFlowRate > 0);
  assert.ok(ship.waterLevel > waterAfterBail); // Slowly intaking water!

  // 4. Advance remaining 2.0 seconds (completing the ramp)
  const rateDuringRamp = ship.currentFlowRate;
  ship.update(2.0, mockOcean);
  assert.equal(ship._bailRampTimer, 0);
  assert.ok(ship.currentFlowRate > rateDuringRamp); // Full flow resumed!

  qte.dispose();
  clear();
});

test('QTESystem: bail QTE definition prompts HOLD TO BAIL and uses hold-to-pump', async () => {
  clear();
  const { QTE_DEFINITIONS, QTEType } = await import('../src/obstacle/QTESystem.js');
  const bailDef = QTE_DEFINITIONS[QTEType.BAIL];

  assert.equal(bailDef.input, 'hold');
  assert.equal(bailDef.label, 'HOLD TO BAIL!');
  assert.equal(bailDef.prompt, 'Hold SPACE or button to bail water');
  assert.equal(bailDef.holdDurationSec, 2.4);
});

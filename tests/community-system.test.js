import test from 'node:test';
import assert from 'node:assert/strict';
import { CrockfordBase32 } from '../src/community/CrockfordBase32.js';
import { LevelSerializer, MAX_PAYLOAD_BYTES } from '../src/community/LevelSerializer.js';
import { ClearCheckManager } from '../src/community/ClearCheckManager.js';
import { CommunityClient } from '../src/community/CommunityClient.js';
import { LevelConfig } from '../src/core/LevelConfig.js';

test('CrockfordBase32: generates valid course codes and normalizes user inputs', () => {
  const code = CrockfordBase32.generateCourseCode();
  assert.match(code, /^BL-[0-9A-Z]{3}-[0-9A-Z]{3}$/);
  assert.equal(CrockfordBase32.isValid(code), true);

  // Normalization handles lowercases, missing prefixes, hyphens, and replaces O->0, I/L->1
  const rawInput = 'bl-7k2-ol1';
  const normalized = CrockfordBase32.normalize(rawInput);
  assert.equal(normalized, 'BL-7K2-011');
});

test('LevelSerializer: serializes and generates deterministic SHA-256 checksums', async () => {
  const dummyLevel = {
    ship: 'sloop',
    budget: 300,
    worldSize: 200,
    obstacles: [
      { type: 'rock', position: { x: 10, y: 0, z: -50 }, scale: 1.5 }
    ],
    endLocation: { position: { x: 0, y: 0, z: -200 }, radius: 16 }
  };

  const { payload, checksum } = await LevelSerializer.serialize(dummyLevel, {
    title: "Tester's Reef",
    description: "A test voyage."
  });

  assert.equal(payload.formatVersion, '1.0.0');
  assert.equal(payload.metadata.title, "Tester's Reef");
  assert.ok(checksum.length >= 16);

  // Determinism check: same config produces identical checksum
  const checksum2 = await LevelSerializer.computeChecksum(LevelSerializer.cleanLevelConfig(dummyLevel));
  assert.equal(checksum, checksum2);

  // Tampering/mutation check: altering coordinates changes checksum
  const modifiedLevel = {
    ...dummyLevel,
    obstacles: [
      { type: 'rock', position: { x: 10, y: 0, z: -52 }, scale: 1.5 }
    ]
  };
  const modifiedChecksum = await LevelSerializer.computeChecksum(LevelSerializer.cleanLevelConfig(modifiedLevel));
  assert.notEqual(checksum, modifiedChecksum);
});

test('CommunityClient: can list seed courses, star courses, and record play attempts', async () => {
  const courses = await CommunityClient.getCourses({ tab: 'trending' });
  assert.ok(courses.length >= 3);

  const testCourse = courses[0];
  const initialStars = testCourse.starCount || 0;
  const initialAttempts = testCourse.attemptCount || 0;

  // Star toggle
  const isStarred = await CommunityClient.toggleStar(testCourse.courseCode);
  assert.equal(isStarred, true);
  assert.equal(testCourse.starCount, initialStars + 1);

  // Record cleared attempt
  await CommunityClient.recordAttempt(testCourse.courseCode, {
    cleared: true,
    timeMs: 25000
  });

  assert.equal(testCourse.attemptCount, initialAttempts + 1);
  assert.ok(testCourse.clearRate > 0);
});

test('LevelConfig.createEmptyLevel: opens to an empty level with dock only', () => {
  const emptyLevel = LevelConfig.createEmptyLevel();
  assert.equal(emptyLevel.hasDock, true);
  assert.equal(Array.isArray(emptyLevel.obstacles), true);
  assert.equal(emptyLevel.obstacles.length, 0);
  assert.equal(Array.isArray(emptyLevel.sirens), true);
  assert.equal(emptyLevel.sirens.length, 0);
  assert.equal(emptyLevel.kraken, null);
  assert.equal(emptyLevel.voxels, null);
  assert.equal(emptyLevel.endLocation.radius, 16);
});

test('ClearCheckManager: verifies clear proof upon course completion', async () => {
  const emptyLevel = LevelConfig.createEmptyLevel();
  const checksum = await ClearCheckManager.startClearCheck(emptyLevel);
  assert.ok(checksum);

  ClearCheckManager.completeActiveCheck(true);

  const { isVerified, proof } = await ClearCheckManager.hasValidClearProof(emptyLevel);
  assert.equal(isVerified, true);
  assert.equal(proof.completed, true);
  assert.equal(proof.checksum, checksum);
});

test('ClearCheck: repair budget changes invalidate prior proof and route to shipyard repair', async () => {
  const levelWithBudget = LevelConfig.createEmptyLevel({ budget: 250 });
  
  // Test event emission routes to repair mode first
  let requestedPlayData = null;
  const { on, off } = await import('../src/core/EventBus.js');
  const handler = (d) => { requestedPlayData = d; };
  on('editorRequestPlay', handler);

  const checksum = await ClearCheckManager.startClearCheck(levelWithBudget);
  assert.ok(checksum);
  assert.equal(requestedPlayData?.mode, 'repair');
  assert.equal(requestedPlayData?.isClearCheck, true);
  off('editorRequestPlay', handler);

  // Mark verified for budget 250
  ClearCheckManager.completeActiveCheck(true);
  const checkInitial = await ClearCheckManager.hasValidClearProof(levelWithBudget);
  assert.equal(checkInitial.isVerified, true);

  // Altering budget to 150 changes checksum and invalidates clear proof
  const modifiedBudgetLevel = { ...levelWithBudget, budget: 150 };
  const checkModified = await ClearCheckManager.hasValidClearProof(modifiedBudgetLevel);
  assert.equal(checkModified.isVerified, false);
});

test('LevelSerializer: payload limit is 1MB and rejects payloads exceeding 1MB', async () => {
  assert.equal(MAX_PAYLOAD_BYTES, 1024 * 1024);

  const normalLevel = LevelConfig.createEmptyLevel();
  const normalResult = await LevelSerializer.serialize(normalLevel, {
    title: 'Valid Map',
    description: 'A valid voyage.'
  });
  assert.ok(normalResult.sizeBytes < MAX_PAYLOAD_BYTES);

  // Generate an oversized payload exceeding 1MB (e.g. huge voxel island)
  const oversizedLevel = {
    ...normalLevel,
    voxels: 'V'.repeat(MAX_PAYLOAD_BYTES + 50)
  };
  await assert.rejects(
    async () => {
      await LevelSerializer.serialize(oversizedLevel, {
        title: 'Giant Map',
        description: 'Large islands'
      });
    },
    /exceeds max size limit/
  );
});


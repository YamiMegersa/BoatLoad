import test from 'node:test';
import assert from 'node:assert/strict';
import { CrockfordBase32 } from '../src/community/CrockfordBase32.js';
import { LevelSerializer } from '../src/community/LevelSerializer.js';
import { ClearCheckManager } from '../src/community/ClearCheckManager.js';
import { CommunityClient } from '../src/community/CommunityClient.js';

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

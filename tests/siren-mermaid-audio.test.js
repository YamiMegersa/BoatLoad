import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { on, emit, clear } from '../src/core/EventBus.js';
import { SirenManager } from '../src/monsters/SirenManager.js';
import { AudioManager, computeMermaidCallParams } from '../src/utils/AudioManager.js';

function createMockAudioContext() {
  const createdSources = [];
  const createdGains = [];
  const createdFilters = [];

  const ctx = {
    currentTime: 1.0,
    state: 'running',
    destination: {},
    resume: async () => {},
    createGain() {
      const node = {
        gain: {
          value: 1,
          targets: [],
          setTargetAtTime(val, t, tc) {
            this.value = val;
            this.targets.push({ val, t, tc });
          },
          setValueAtTime(val) {
            this.value = val;
          },
          exponentialRampToValueAtTime(val) {
            this.value = val;
          },
        },
        connectedTo: [],
        disconnected: false,
        connect(dest) {
          this.connectedTo.push(dest);
        },
        disconnect() {
          this.disconnected = true;
        },
      };
      createdGains.push(node);
      return node;
    },
    createBiquadFilter() {
      const node = {
        type: 'lowpass',
        frequency: {
          value: 1000,
          targets: [],
          setTargetAtTime(val, t, tc) {
            this.value = val;
            this.targets.push({ val, t, tc });
          },
          setValueAtTime(val) {
            this.value = val;
          },
          exponentialRampToValueAtTime(val) {
            this.value = val;
          },
        },
        connectedTo: [],
        connect(dest) {
          this.connectedTo.push(dest);
        },
        disconnect() {},
      };
      createdFilters.push(node);
      return node;
    },
    createBufferSource() {
      const node = {
        buffer: null,
        loop: false,
        startedAt: null,
        stoppedAt: null,
        playbackRate: {
          value: 1.0,
          targets: [],
          setTargetAtTime(val, t, tc) {
            this.value = val;
            this.targets.push({ val, t, tc });
          },
        },
        connectedTo: [],
        connect(dest) {
          this.connectedTo.push(dest);
        },
        start(t = 0) {
          this.startedAt = t;
        },
        stop(t = 0) {
          this.stoppedAt = t;
        },
        disconnect() {},
      };
      createdSources.push(node);
      return node;
    },
  };

  return { ctx, createdSources, createdGains, createdFilters };
}

test('computeMermaidCallParams scales volume from soft when far to loud as mermaid is approached', () => {
  const farParams = computeMermaidCallParams({
    dist: 28,
    radius: 30,
    boatSpeed: 15,
    ambientVolume: 1.0,
  });
  const midParams = computeMermaidCallParams({
    dist: 15,
    radius: 30,
    boatSpeed: 15,
    ambientVolume: 1.0,
  });
  const nearParams = computeMermaidCallParams({
    dist: 3,
    radius: 30,
    boatSpeed: 15,
    ambientVolume: 1.0,
  });

  assert.ok(farParams.gain < midParams.gain, 'Far volume must be softer than mid-range volume');
  assert.ok(midParams.gain < nearParams.gain, 'Mid-range volume must be softer than close-range volume');
  assert.ok(farParams.filterFreq < nearParams.filterFreq, 'Close call should open lowpass filter for brighter clarity');
});

test('computeMermaidCallParams dynamically varies pitch, speed, and volume with boat movement', () => {
  const slowRetreating = computeMermaidCallParams({
    dist: 12,
    radius: 30,
    boatSpeed: 4,
    approachDot: -0.9, // sailing away
    yawVelocity: 0,
    ambientVolume: 0.8,
    time: 0.25,
  });

  const fastApproaching = computeMermaidCallParams({
    dist: 12,
    radius: 30,
    boatSpeed: 18,
    approachDot: 0.95, // sailing directly toward mermaid
    yawVelocity: 0,
    ambientVolume: 0.8,
    time: 0.25,
  });

  const turningHard = computeMermaidCallParams({
    dist: 12,
    radius: 30,
    boatSpeed: 15,
    approachDot: 0.2,
    yawVelocity: 1.8, // hard helm turn
    ambientVolume: 0.8,
    time: 0.083, // sin(6*pi*0.083) ~ 1
  });

  const straightSteady = computeMermaidCallParams({
    dist: 12,
    radius: 30,
    boatSpeed: 15,
    approachDot: 0.2,
    yawVelocity: 0,
    ambientVolume: 0.8,
    time: 0.083,
  });

  assert.ok(
    fastApproaching.playbackRate > slowRetreating.playbackRate,
    'Approaching at higher speed should raise playback rate / pitch'
  );
  assert.ok(
    fastApproaching.gain > slowRetreating.gain,
    'Higher boat speed should dynamically boost call presence'
  );
  assert.notEqual(
    turningHard.playbackRate,
    straightSteady.playbackRate,
    'Yaw velocity during steering struggle should dynamically modulate pitch/speed'
  );
});

test('AudioManager loops Mermaid_call.mp3 continuously while in range and stops only on escape', () => {
  clear();
  const audio = new AudioManager();
  const { ctx, createdSources } = createMockAudioContext();

  // Inject mock Web Audio context and decoded mermaid_call buffer
  audio._ctx = ctx;
  audio._master = ctx.createGain();
  const mockMermaidBuffer = { duration: 6.4, sampleRate: 44100 };
  audio._sirenBuffer = mockMermaidBuffer;

  const scene = new THREE.Scene();
  const manager = new SirenManager();
  manager.init(
    { sirens: [{ position: { x: 0, y: 0, z: -25 }, attractRadius: 30, intensity: 0.9 }] },
    scene,
    null,
    [],
    null
  );

  const ship = {
    mesh: new THREE.Group(),
    yaw: 0,
    yawVelocity: 0.4,
    rollVelocity: 0,
    throttle: 1.0,
    speedMultiplier: 1.0,
    sunk: false,
    isImmune: () => true,
  };

  // 1. Enter outer siren call area (z = 0, siren at z = -25, dist = 25 < 30)
  ship.mesh.position.set(0, 0, 0);
  manager.update(0.016, ship);

  assert.equal(createdSources.length, 1, 'Mermaid call buffer source should start on entering range');
  const activeSource = createdSources[0];
  assert.equal(activeSource.buffer, mockMermaidBuffer, 'Should play the decoded mermaid_call buffer');
  assert.equal(activeSource.loop, true, 'Audio must loop continuously so it never ends early');
  const initialGain = audio._sirenGain.gain.value;

  // 2. Approach closer to the mermaid (z = -18, dist = 7) with higher speed
  ship.mesh.position.set(0, 0, -18);
  ship.speedMultiplier = 1.3;
  ship.yawVelocity = 1.2;
  manager.update(0.016, ship);

  assert.equal(createdSources.length, 1, 'Same looping source must continue playing without restarting');
  const closerGain = audio._sirenGain.gain.value;
  assert.ok(closerGain > initialGain, 'Volume must increase as the boat approaches the mermaid');
  assert.ok(activeSource.playbackRate.targets.length >= 2, 'Pitch/speed must update dynamically with movement');

  // 3. Player successfully blocks off the steering effect (QTE resistance active),
  //    while still inside the audible range (dist = 7 < 30). Song MUST continue playing!
  manager._sirens[0].resistanceRemaining = 5.0;
  manager.update(0.016, ship);

  assert.notEqual(audio._sirenSource, null, 'Blocking the effect must NOT stop the mermaid call while still in range');
  assert.equal(activeSource.stoppedAt, null, 'Looping source must keep playing during active resistance');

  // 4. Escape the siren call radius (z = -60, dist = 35 > 30)
  ship.mesh.position.set(0, 0, -60);
  manager.update(0.016, ship);

  assert.equal(audio._sirenSource, null, 'Active source reference cleared on escaping audible range');
  assert.ok(activeSource.stoppedAt !== null, 'Looping source must be scheduled to stop once player escapes range');

  manager.dispose();
  clear();
});


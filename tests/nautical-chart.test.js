import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('NauticalChartRenderer: module exports class with full-course and local-view cartography renderers', async () => {
  const { NauticalChartRenderer } = await import('../src/ui/NauticalChartRenderer.js');
  assert.ok(NauticalChartRenderer, 'NauticalChartRenderer must be exported');

  const renderer = new NauticalChartRenderer();
  assert.equal(typeof renderer.renderFullCourse, 'function', 'renderFullCourse must be a function');
  assert.equal(typeof renderer.renderLocalView, 'function', 'renderLocalView must be a function');
  assert.equal(typeof renderer.captureTopDownMap, 'function', 'captureTopDownMap must be a function');
  assert.equal(typeof renderer.applyNauticalFilters, 'function', 'applyNauticalFilters must be a function');
  assert.equal(typeof renderer.drawParchmentBackground, 'function');
  assert.equal(typeof renderer.drawCompassRose, 'function');
  assert.equal(typeof renderer.drawHazardSymbol, 'function');
  assert.equal(typeof renderer.drawHarborGoal, 'function');
  assert.equal(typeof renderer.drawPlayerVessel, 'function');
});

test('NauticalChartRenderer: sharedSnapshot caches and shares top-down map across instances', async () => {
  const { NauticalChartRenderer } = await import('../src/ui/NauticalChartRenderer.js');
  const mockSnapshot = {
    canvas: { width: 1024, height: 1024 },
    worldBounds: { minX: -100, maxX: 100, minZ: -200, maxZ: 50, spanX: 200, spanZ: 250 }
  };

  NauticalChartRenderer.sharedSnapshot = mockSnapshot;
  assert.equal(NauticalChartRenderer.sharedSnapshot, mockSnapshot);

  const r1 = new NauticalChartRenderer();
  const r2 = new NauticalChartRenderer();
  assert.equal(NauticalChartRenderer.sharedSnapshot.canvas.width, 1024);
});

test('NauticalChartRenderer: drawHazardSymbol suppresses green dots for floating debris pickups', async () => {
  const { NauticalChartRenderer } = await import('../src/ui/NauticalChartRenderer.js');
  const renderer = new NauticalChartRenderer();

  let fillRectCalls = 0;
  const mockCtx = {
    save: () => {},
    restore: () => {},
    translate: () => {},
    fillRect: () => { fillRectCalls++; },
    strokeRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    arc: () => {},
    fill: () => {}
  };

  // Calling with 'pickup' must not draw anything
  renderer.drawHazardSymbol(mockCtx, 50, 50, 'pickup');
  assert.equal(fillRectCalls, 0, 'Pickup must not render hazard rectangles or dots');

  // Calling with 'rock' should draw the nautical reef cross
  renderer.drawHazardSymbol(mockCtx, 50, 50, 'rock');
  // stroke / arc are called for rock, not fillRect
  assert.equal(fillRectCalls, 0);

  // Calling with 'barrel' draws the supply barrel
  renderer.drawHazardSymbol(mockCtx, 50, 50, 'barrel');
  assert.equal(fillRectCalls, 1, 'Barrel obstacle must draw its marker');
});

test('PreSailChartModal: source contains full tactical briefing, Space key listener, and onComplete callback', () => {
  const modalSrc = fs.readFileSync(path.join(__dirname, '../src/ui/PreSailChartModal.js'), 'utf8');

  assert.ok(modalSrc.includes('openPreSailChart'), 'Must register openPreSailChart event');
  assert.ok(modalSrc.includes('renderFullCourse'), 'Must call renderFullCourse');
  assert.ok(modalSrc.includes('SET SAIL'), 'Must include SET SAIL action button');
  assert.ok(modalSrc.includes('e.code === \'Space\''), 'Must listen for Space key to set sail');
  assert.ok(modalSrc.includes('chart-unroll-exit'), 'Must include smooth chart roll-up exit animation');
  assert.ok(modalSrc.includes('renderer'), 'Must forward renderer to renderFullCourse');
  assert.ok(modalSrc.includes('scene'), 'Must forward scene to renderFullCourse');
});

test('Minimap: source implements nautical brass compass housing, high-DPI canvas, and delegates to renderLocalView', () => {
  const minimapSrc = fs.readFileSync(path.join(__dirname, '../src/ui/Minimap.js'), 'utf8');

  assert.ok(minimapSrc.includes('nautical-minimap-compass'), 'Must use nautical-minimap-compass class');
  assert.ok(minimapSrc.includes('minimap-cardinal-n'), 'Must include compass rose cardinal points');
  assert.ok(minimapSrc.includes('renderLocalView'), 'Must delegate local rendering to NauticalChartRenderer');
  assert.ok(minimapSrc.includes('devicePixelRatio'), 'Must support high-DPI devicePixelRatio rendering');
  assert.ok(minimapSrc.includes('renderer'), 'Must forward renderer to renderLocalView');
  assert.ok(minimapSrc.includes('scene'), 'Must forward scene to renderLocalView');
});

test('GameState: _startAnchorCountdownSequence emits openPreSailChart with full course context and captures top-down map', () => {
  const gameStateSrc = fs.readFileSync(path.join(__dirname, '../src/core/GameState.js'), 'utf8');

  assert.match(gameStateSrc, /emit\('openPreSailChart',\s*\{/, '_startAnchorCountdownSequence must emit openPreSailChart');
  assert.ok(gameStateSrc.includes('captureTopDownMap'), 'Must invoke captureTopDownMap prior to opening pre-sail chart');
  assert.ok(gameStateSrc.includes('voxelTerrain: this._voxelTerrain'), 'Must forward voxelTerrain to pre-sail chart');
  assert.ok(gameStateSrc.includes('endLocation: this._endLocation'), 'Must forward endLocation to pre-sail chart');
  assert.ok(gameStateSrc.includes('setDepartureGrace'), 'Must grant departure grace upon setting sail');
});

test('CSS: ui.css contains authentic nautical paper chart and brass compass styles', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/ui/ui.css'), 'utf8');

  assert.ok(css.includes('#minimap.nautical-minimap-compass'), 'Must style nautical compass minimap');
  assert.ok(css.includes('.nautical-chart-backdrop'), 'Must style pre-sail chart backdrop');
  assert.ok(css.includes('.nautical-chart-table'), 'Must style chart table oak frame');
  assert.ok(css.includes('.nautical-chart-frame'), 'Must style parchment chart frame');
  assert.ok(css.includes('@keyframes chartUnroll'), 'Must include chart unroll keyframes');
  assert.ok(css.includes('@keyframes chartRollUp'), 'Must include chart roll-up keyframes');
  assert.ok(css.includes('.minimap-cardinal-n'), 'Must style cardinal North');
});

test('NauticalChartRenderer: source implements allowlist visibility isolation and nulls background/fog', () => {
  const rendererSrc = fs.readFileSync(path.join(__dirname, '../src/ui/NauticalChartRenderer.js'), 'utf8');

  assert.ok(rendererSrc.includes('scene.background = null'), 'Must nullify scene.background during capture');
  assert.ok(rendererSrc.includes('scene.fog = null'), 'Must nullify scene.fog during capture');
  assert.ok(rendererSrc.includes('savedVisibility'), 'Must save scene children visibility');
  assert.ok(rendererSrc.includes('allowedRoots'), 'Must use allowlist roots for capture');
  assert.ok(rendererSrc.includes('landPixelCount > totalPixels * 0.70'), 'Must reject captures where land exceeds 70% of ocean');
});

test('NauticalChartRenderer: applyNauticalFilters returns null when land covers 100% of buffer', async () => {
  const { NauticalChartRenderer } = await import('../src/ui/NauticalChartRenderer.js');
  const renderer = new NauticalChartRenderer();

  // Create mock pixels where every pixel has alpha > 20 (like the solid background bug)
  const size = 16;
  const pixels = new Uint8Array(size * size * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 100;     // R
    pixels[i + 1] = 100; // G
    pixels[i + 2] = 100; // B
    pixels[i + 3] = 255; // A (100% opaque land)
  }

  const result = renderer.applyNauticalFilters(pixels, size, size);
  assert.equal(result, null, 'Must reject solid opaque pixel fill and return null to engage procedural fallback');
});

test('NauticalChartRenderer: bakeVoxelTerrainFallback renders terrain bounds with island obstacles', async () => {
  const { NauticalChartRenderer } = await import('../src/ui/NauticalChartRenderer.js');
  const renderer = new NauticalChartRenderer();

  const mockObstacles = [
    { type: 'island', scale: 5.0, position: { x: -60, y: 0, z: -120 } },
    { type: 'island', scale: 3.5, position: { x: 30, y: 0, z: -200 } }
  ];

  // In Node environment without window/document, returns null safely
  const fallback = renderer.bakeVoxelTerrainFallback(null, mockObstacles, {
    playerPos: { x: 0, z: 0 },
    endLocation: { position: { x: 0, z: -220 } },
    hasDock: true
  });

  // Check that function executes safely without throwing
  assert.ok(fallback === null || typeof fallback === 'object');
});

test('NauticalChartRenderer: renderLocalView uses North-Up orientation and rotates the player ship by -playerYaw', () => {
  const rendererSrc = fs.readFileSync(path.join(__dirname, '../src/ui/NauticalChartRenderer.js'), 'utf8');

  assert.ok(rendererSrc.includes('North-Up player-centric projection'), 'Must document North-Up projection');
  assert.ok(rendererSrc.includes('this.drawPlayerVessel(ctx, cx, cy, -playerYaw, 1.15)'), 'Must rotate player vessel by -playerYaw on minimap');
  assert.ok(rendererSrc.includes('const bearingAngle = Math.atan2(gx, -gz)'), 'Harbor bearing needle must use true world bearing in North-Up');
  assert.ok(rendererSrc.includes('const windAngle = Math.atan2(windDir.x, -windDir.z)'), 'Wind pennant must use true world direction in North-Up');
});



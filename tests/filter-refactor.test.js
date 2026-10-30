import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Filter Refactor: Cross hatching is removed entirely from PaperFilter.js', () => {
  const code = fs.readFileSync(path.join(__dirname, '../src/environment/PaperFilter.js'), 'utf8');

  // Verify no hatch functions or hatching uniforms exist
  assert.equal(/float hatch\(/.test(code), false, 'hatch() function must be removed');
  assert.equal(/uHatchScale/.test(code), false, 'uHatchScale uniform must be removed');
  assert.equal(/uStyle/.test(code), false, 'uStyle uniform must be removed');
});

test('Filter Refactor: Kuwahara filter uses exact fixed parameters (Radius 3, Colour 0.73, Edge 0.03, Wobble 0.0015)', () => {
  const code = fs.readFileSync(path.join(__dirname, '../src/environment/PaperFilter.js'), 'utf8');

  assert.match(code, /uKuwaharaRadius:\s*\{\s*value:\s*3\s*\}/, 'Radius must be fixed to 3');
  assert.match(code, /uColorPreservation:\s*\{\s*value:\s*0\.73\s*\}/, 'Colour retention must be fixed to 0.73');
  assert.match(code, /uEdgeThreshold:\s*\{\s*value:\s*0\.03\s*\}/, 'Edge threshold must be fixed to 0.03');
  assert.match(code, /uWobbleIntensity:\s*\{\s*value:\s*0\.0015\s*\}/, 'Wobble must be fixed to 0.0015');
});

test('Filter Refactor: Filters are removed from Shipyard (BuildMenu.js)', () => {
  const code = fs.readFileSync(path.join(__dirname, '../src/ui/BuildMenu.js'), 'utf8');

  assert.equal(code.includes('shipyard-paper-shader-check'), false, 'Shipyard must not contain paper shader checkbox');
  assert.equal(code.includes('shipyard-paper-style-select'), false, 'Shipyard must not contain paper style select');
  assert.equal(code.includes('editorTogglePaperShader'), false, 'Shipyard must not emit editorTogglePaperShader');
});

test('Filter Refactor: Filters are removed from Level Editor (EditorUI.js)', () => {
  const code = fs.readFileSync(path.join(__dirname, '../src/ui/EditorUI.js'), 'utf8');

  assert.equal(code.includes('data-tab="paper"'), false, 'Editor must not contain paper ribbon tab');
  assert.equal(code.includes('id="pane-paper"'), false, 'Editor must not contain paper ribbon pane');
  assert.equal(code.includes('_bindPaperSliders'), false, 'Editor must not bind paper sliders');
});

test('Filter Refactor: Filters are removed from Director Mode (DirectorMode.js)', () => {
  const code = fs.readFileSync(path.join(__dirname, '../src/director/DirectorMode.js'), 'utf8');

  assert.equal(code.includes('select-shader-style'), false, 'Director Mode must not contain shader style select');
  assert.equal(code.includes('setPaperShaderStyle'), false, 'Director Mode must not have setPaperShaderStyle method');
});

test('Filter Refactor: Filters are toggled purely from Settings Menu (PauseMenu.js)', () => {
  const code = fs.readFileSync(path.join(__dirname, '../src/ui/PauseMenu.js'), 'utf8');

  assert.match(code, /id="set-paper-shader"/, 'Settings menu must have paper shader toggle checkbox');
  assert.match(code, /id="val-paper-shader"/, 'Settings menu must have paper shader status badge');
  assert.equal(code.includes('group-paper-shader'), false, 'Old multi-style pill group must be removed');
});

test('Filter Refactor: main.js render loop derives filter activation purely from settingsManager', () => {
  const code = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

  assert.match(
    code,
    /const usePaperShader\s*=\s*Boolean\(paperSetting\s*&&\s*paperSetting\s*!==\s*['"]off['"]\);/,
    'Render loop must use paper shader based purely on settingsManager paperShader setting'
  );
  assert.equal(code.includes('paperShaderEnabled'), false, 'main.js must not track paperShaderEnabled');
  assert.equal(code.includes('userPaperStyle'), false, 'main.js must not track userPaperStyle');
});


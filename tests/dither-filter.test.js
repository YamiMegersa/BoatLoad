import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Dither Filter: DitherFilter.js exists, exports DitherFilter, and uses 8x8 Bayer matrix map', () => {
  const filePath = path.join(__dirname, '../src/environment/DitherFilter.js');
  assert.equal(fs.existsSync(filePath), true, 'DitherFilter.js must exist');

  const code = fs.readFileSync(filePath, 'utf8');
  assert.match(code, /export class DitherFilter/, 'DitherFilter class must be exported');
  assert.match(code, /tDitherMap:\s*\{\s*value:\s*null\s*\}/, 'tDitherMap uniform must be present');
  assert.match(code, /BAYER_8X8\s*=/, 'BAYER_8X8 matrix must be defined');
  assert.match(code, /createBayerTexture/, 'createBayerTexture helper must generate Bayer texture');
  assert.match(code, /uniform sampler2D tDitherMap;/, 'fragment shader must declare tDitherMap sampler');
});

test('Dither Filter: Default settings have both ditherShader and paperShader off so normal game is default', () => {
  const settingsCode = fs.readFileSync(path.join(__dirname, '../src/core/SettingsManager.js'), 'utf8');

  assert.match(settingsCode, /paperShader:\s*false/, 'paperShader must default to false');
  assert.match(settingsCode, /ditherShader:\s*false/, 'ditherShader must default to false');
  assert.match(settingsCode, /case 'ditherShader':/, 'applyKey must handle ditherShader');
});

test('Dither Filter: Settings Menu (PauseMenu.js) includes Dithering Map Shader option toggle and badge', () => {
  const pauseMenuCode = fs.readFileSync(path.join(__dirname, '../src/ui/PauseMenu.js'), 'utf8');

  assert.match(pauseMenuCode, /id="set-dither-shader"/, 'PauseMenu must have set-dither-shader checkbox');
  assert.match(pauseMenuCode, /id="val-dither-shader"/, 'PauseMenu must have val-dither-shader badge');
  assert.match(pauseMenuCode, /ditherShaderToggle\?\.addEventListener/, 'PauseMenu must listen to toggle events');
});

test('Dither Filter: main.js integrates DitherFilter into render loop', () => {
  const mainCode = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

  assert.match(mainCode, /import\s*\{\s*DitherFilter\s*\}\s*from\s*['"]\.\/environment\/DitherFilter\.js['"]/, 'main.js must import DitherFilter');
  assert.match(mainCode, /const ditherFilter = new DitherFilter\(renderer\);/, 'main.js must instantiate DitherFilter');
  assert.match(mainCode, /const useDitherShader\s*=\s*Boolean\(ditherSetting\s*&&\s*ditherSetting\s*!==\s*['"]off['"]\);/, 'main.js must check ditherShader setting');
  assert.match(mainCode, /ditherFilter\.render\(/, 'main.js must call ditherFilter.render');
});

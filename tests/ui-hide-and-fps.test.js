import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('FPS bar shortcut: main.js binds Ctrl+Shift+F to toggle settingsManager showFps', () => {
  const mainJs = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

  // Verify Ctrl+Shift+F keyboard handler exists
  assert.match(
    mainJs,
    /isCtrlOrMeta\s*&&\s*isShift\s*&&\s*isF/,
    'main.js must check for Ctrl+Shift+F combination'
  );

  assert.match(
    mainJs,
    /settingsManager\.set\(\s*['"]showFps['"],\s*next\s*\)/,
    'main.js must toggle showFps in settingsManager'
  );
});

test('Director Mode: toggleUIHide hides ALL UI including #ui-root and body', () => {
  const directorJs = fs.readFileSync(path.join(__dirname, '../src/director/DirectorMode.js'), 'utf8');

  // Verify toggleUIHide targets #ui-root and body class
  assert.match(
    directorJs,
    /document\.getElementById\(['"]ui-root['"]\)/,
    'toggleUIHide must get #ui-root element'
  );

  assert.match(
    directorJs,
    /uiRoot\.classList\.add\(['"]director-ui-hidden['"]\)/,
    'toggleUIHide must add director-ui-hidden class to #ui-root'
  );

  assert.match(
    directorJs,
    /document\.body\.classList\.add\(['"]director-all-ui-hidden['"]\)/,
    'toggleUIHide must add director-all-ui-hidden class to document.body'
  );

  assert.match(
    directorJs,
    /uiRoot\.classList\.remove\(['"]director-ui-hidden['"]\)/,
    'toggleUIHide must remove director-ui-hidden on unhide'
  );

  assert.match(
    directorJs,
    /document\.body\.classList\.remove\(['"]director-all-ui-hidden['"]\)/,
    'toggleUIHide must remove director-all-ui-hidden on unhide'
  );

  // Verify deactivation cleans up UI hiding
  assert.match(
    directorJs,
    /_hideContainer\(\)\s*\{[\s\S]*?director-all-ui-hidden/,
    '_hideContainer must clean up director-all-ui-hidden class on exit'
  );
});

test('Director Mode CSS: hides all game UI when director hides UI', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/director/director.css'), 'utf8');

  assert.match(
    css,
    /body\.director-all-ui-hidden\s+#ui-root[\s\S]*?display:\s*none\s*!important;/,
    'director.css must hide #ui-root with display: none !important'
  );
});

test('SettingsManager applyFps: respects Director Mode uiHidden state', () => {
  const settingsJs = fs.readFileSync(path.join(__dirname, '../src/core/SettingsManager.js'), 'utf8');

  assert.match(
    settingsJs,
    /directorMode\?\.isActive\s*&&\s*this\._context\.directorMode\?\.uiHidden/,
    'SettingsManager.applyFps must keep FPS hidden when Director Mode uiHidden is true'
  );
});


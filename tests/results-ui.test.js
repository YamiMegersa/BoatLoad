import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('ResultsUI: non-community level results menu is streamlined with only sailing summary and return to dock', () => {
  const resultsSrc = fs.readFileSync(path.join(__dirname, '../src/ui/ResultsUI.js'), 'utf8');

  // Verify non-community results contains the sailing summary
  assert.ok(resultsSrc.includes('Passage Delivery Bounty'), 'Must contain Passage Delivery Bounty');
  assert.ok(resultsSrc.includes('Pedestal Bonus'), 'Must contain Pedestal Bonus');
  assert.ok(resultsSrc.includes('Total Doubloons Banked'), 'Must contain Total Doubloons Banked');
  assert.ok(resultsSrc.includes('Current Purse Balance:'), 'Must contain Current Purse Balance');

  // Verify cluttered contract items are removed from non-community results
  assert.ok(!resultsSrc.includes('SHIPWRIGHT REPAIR CONTRACT'), 'Must not contain SHIPWRIGHT REPAIR CONTRACT');
  assert.ok(!resultsSrc.includes('Customer Agreed Budget'), 'Must not contain Customer Agreed Budget');
  assert.ok(!resultsSrc.includes('Drydock Timber &amp; Materials') && !resultsSrc.includes('Drydock Timber & Materials'), 'Must not contain Drydock Timber & Materials');
  assert.ok(!resultsSrc.includes('Construction Profit Margin'), 'Must not contain Construction Profit Margin');

  // Verify buttons: only Return to Dock option is present
  assert.ok(resultsSrc.includes('id="res-btn-dock"'), 'Must contain Return to Dock button');
  assert.ok(!resultsSrc.includes('id="res-btn-shop"'), 'Must not contain Visit Ghost Stall button');
  assert.ok(!resultsSrc.includes('id="res-btn-shipyard"'), 'Must not contain Shipyard & Repairs button');
  assert.ok(!resultsSrc.includes('id="res-btn-next"'), 'Must not contain Next Voyage button');

  // Verify clicking dock button returns to dock
  assert.match(resultsSrc, /emit\('requestPhaseChange',\s*\{\s*phase:\s*GamePhase\.DOCK/, 'Dock button must emit requestPhaseChange to DOCK');
});

test('ResultsUI: ui.css styles dock-action prominently', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/ui/ui.css'), 'utf8');
  assert.match(css, /\.dock-action\s*\{[^}]*color:\s*#ffd700;/, 'dock-action must have gold text accent');
});

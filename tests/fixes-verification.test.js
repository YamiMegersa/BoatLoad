import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Fix 1 & 3: CSS verifies wheel atop pedestal (-12%) and pause menu on top of countdown (z-index: 5000)', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/ui/ui.css'), 'utf8');

  // Verify pedestal uses -12% so wheel sits atop pedestal
  assert.match(css, /#hud-pedestal\s*\{[^}]*transform:\s*translate\(-50%,\s*-12%\);/, 'Default pedestal transform must be translate(-50%, -12%)');

  // Verify mobile query also uses -12%
  assert.match(css, /@media\s*\(max-width:\s*768px\)[\s\S]*?#hud-pedestal\s*\{[^}]*transform:\s*translate\(-50%,\s*-12%\);/, 'Mobile pedestal transform must be translate(-50%, -12%)');

  // Verify pause screen backdrop z-index is higher than anchor countdown overlay (1200)
  assert.match(css, /\.pause-screen-backdrop\s*\{[^}]*position:\s*fixed;/, 'Pause screen must have position: fixed');
  assert.match(css, /\.pause-screen-backdrop\s*\{[^}]*z-index:\s*5000;/, 'Pause screen must have z-index: 5000');
});

test('Fix 2: Community levels use base wheel and base pedestal in GameState', async () => {
  const { GameState } = await import('../src/core/GameState.js');

  const mockGs = {
    equippedItems: {
      wheel: 'wheel_lvl4',
      pedestal: 'pedestal_lvl4',
      lantern: 'lantern_lvl1'
    },
    _isCommunityCourse: false,
    _activeCommunityCourseCode: null
  };

  // Normal mode: returns equipped tier 4 stats
  const normalMult = GameState.prototype.getPedestalMultiplier.call(mockGs);
  assert.equal(normalMult, 2.2);
  const normalWheel = GameState.prototype.getWheelStats.call(mockGs);
  assert.equal(normalWheel.sirenResistance, 0.75);

  // Community mode: must use base pedestal (1.0x) and base wheel (0 sirenResistance)
  mockGs._isCommunityCourse = true;
  const commMult = GameState.prototype.getPedestalMultiplier.call(mockGs);
  assert.equal(commMult, 1.0, 'Community mode must use base pedestal multiplier (1.0x)');
  const communityWheel = GameState.prototype.getWheelStats.call(mockGs);
  assert.equal(communityWheel.sirenResistance, 0, 'Community mode must use base wheel stats');
  assert.equal(communityWheel.turnAccel, 2.0);

  // Community mode with course code:
  mockGs._isCommunityCourse = false;
  mockGs._activeCommunityCourseCode = 'test-code';
  assert.equal(GameState.prototype.getPedestalMultiplier.call(mockGs), 1.0);
  assert.equal(GameState.prototype.getWheelStats.call(mockGs).sirenResistance, 0);

  // Non-community:
  mockGs._activeCommunityCourseCode = null;
  assert.equal(GameState.prototype.getPedestalMultiplier.call(mockGs), 2.2);
});

test('Fix 4: BuildMenu shipyard handles community course mode', async () => {
  const buildMenuSrc = fs.readFileSync(path.join(__dirname, '../src/ui/BuildMenu.js'), 'utf8');
  assert.ok(buildMenuSrc.includes('returnToCommunityMenu'), 'BuildMenu must support returnToCommunityMenu');
  assert.ok(buildMenuSrc.includes('COMMUNITY VOYAGE: SHIPYARD'), 'BuildMenu must show Community Voyage in shipyard');

  const mainSrc = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  assert.match(mainSrc, /communityPlayCourseRequested[\s\S]*?GamePhase\.SHIPYARD/, 'communityPlayCourseRequested must transition to SHIPYARD');
});

test('Fix 5: EditorSystem clearAll clears sirens and getPlayableConfig does not fallback to old sirens', () => {
  const editorSystemSrc = fs.readFileSync(path.join(__dirname, '../src/editor/EditorSystem.js'), 'utf8');

  // Verify getPlayableConfig has sirens: sirens (not sirens.length > 0 ? sirens : ...)
  assert.match(editorSystemSrc, /sirens:\s*sirens,/, 'getPlayableConfig must output sirens: sirens without falling back to old sirens');

  // Verify editorClearAll resets levelCfg sirens and cleans up siren objects
  assert.match(editorSystemSrc, /this\._levelCfg\.sirens\s*=\s*\[\];/, 'editorClearAll must clear this._levelCfg.sirens');
});

test('Sailing fix: Boats sailing down course (z <= -220) do not trigger out-of-bounds sinking', () => {
  const playerShipSrc = fs.readFileSync(path.join(__dirname, '../src/obstacle/PlayerShip.js'), 'utf8');

  // Verify PlayerShip stores endLocation and uses dynamic killRadius instead of rigid > 220
  assert.match(playerShipSrc, /this\.endLocation\s*=\s*stats\.endLocation/, 'PlayerShip must store endLocation');
  assert.ok(!playerShipSrc.includes('distFromOrigin > 220'), 'PlayerShip must not hardcode distFromOrigin > 220');
  assert.match(playerShipSrc, /distFromOrigin > killRadius/, 'PlayerShip must use dynamic killRadius based on course length');

  const minimapSrc = fs.readFileSync(path.join(__dirname, '../src/ui/Minimap.js'), 'utf8');
  assert.ok(!minimapSrc.includes('minimap-kill-radius'), 'Minimap must not include minimap-kill-radius element');
});

test('HUD declutter: settings cog button and coin/doubloon UI removed from sailing HUD', () => {
  const hudSrc = fs.readFileSync(path.join(__dirname, '../src/ui/HUD.js'), 'utf8');

  // Verify settings cog button is removed
  assert.ok(!hudSrc.includes('id="hud-btn-pause"'), 'Settings cog button must be removed from sailing HUD');
  assert.ok(!hudSrc.includes('icon-settings-cog'), 'Settings cog icon must be removed from sailing HUD');

  // Verify coins counter and doubloon icon are removed
  assert.ok(!hudSrc.includes('hud-score-coin'), 'Coin UI must be removed from sailing HUD');
  assert.ok(!hudSrc.includes('icon-doubloon'), 'Doubloon icon must be removed from sailing HUD');
  assert.ok(!hudSrc.includes('id="hud-score-val"'), 'Score val element must be removed from sailing HUD template');
});


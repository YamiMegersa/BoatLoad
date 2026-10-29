import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CREDITS_LIST, parseCreditLine, parseCredits } from '../src/config/CreditsConfig.js';
import { clear, emit } from '../src/core/EventBus.js';
import { CreditsUI } from '../src/ui/CreditsUI.js';

test('parseCreditLine parses Markdown headings, icons, roles, pairs, quotes, and dividers', () => {
  assert.deepEqual(parseCreditLine('# BOATLOAD'), {
    type: 'title',
    text: 'BOATLOAD'
  });

  assert.deepEqual(parseCreditLine('~ Shipwreck & Sail ~'), {
    type: 'subtitle',
    text: 'Shipwreck & Sail'
  });

  assert.deepEqual(parseCreditLine('> "Seven days on the sea!"'), {
    type: 'quote',
    text: 'Seven days on the sea!'
  });

  assert.deepEqual(parseCreditLine('---'), {
    type: 'divider'
  });

  assert.deepEqual(parseCreditLine('## [icon-anchor] THE CREW'), {
    type: 'section',
    icon: 'icon-anchor',
    text: 'THE CREW'
  });

  assert.deepEqual(parseCreditLine('### Shipwrights & Engineers'), {
    type: 'role',
    text: 'Shipwrights & Engineers'
  });

  assert.deepEqual(parseCreditLine('- Yamlack Megersa'), {
    type: 'item',
    text: 'Yamlack Megersa'
  });

  assert.deepEqual(parseCreditLine('- Quaternius : Rocks & Planks'), {
    type: 'pair',
    label: 'Quaternius',
    value: 'Rocks & Planks'
  });
});

test('parseCredits accepts Markdown text, flat string lists, and structured objects', () => {
  const fromString = parseCredits(`
    # GRAND VOYAGE
    ~ Final Chapter ~
    ## [icon-helm-wheel] Developers
    - Alice
    - Bob : Shader Artist
  `);

  assert.equal(fromString.length, 5);
  assert.equal(fromString[0].type, 'title');
  assert.equal(fromString[1].type, 'subtitle');
  assert.equal(fromString[2].type, 'section');
  assert.equal(fromString[2].icon, 'icon-helm-wheel');
  assert.equal(fromString[3].type, 'item');
  assert.equal(fromString[3].text, 'Alice');
  assert.equal(fromString[4].type, 'pair');
  assert.equal(fromString[4].label, 'Bob');
  assert.equal(fromString[4].value, 'Shader Artist');

  const fromObjects = parseCredits([
    { section: 'Special Thanks', icon: 'icon-ship-lantern', items: ['Course Staff', 'Playtesters'] },
    { role: 'Lead Captain', name: 'Captain Barlow' }
  ]);

  assert.equal(fromObjects[0].type, 'section');
  assert.equal(fromObjects[0].text, 'Special Thanks');
  assert.equal(fromObjects[1].type, 'item');
  assert.equal(fromObjects[1].text, 'Course Staff');
  assert.equal(fromObjects[2].type, 'item');
  assert.equal(fromObjects[2].text, 'Playtesters');
  assert.equal(fromObjects[3].type, 'pair');
  assert.equal(fromObjects[3].label, 'Lead Captain');
  assert.equal(fromObjects[3].value, 'Captain Barlow');
});

test('CREDITS.md and public/credits.md parse cleanly into non-empty credit blocks', async () => {
  const rootMd = await readFile(new URL('../CREDITS.md', import.meta.url), 'utf8');
  const publicMd = await readFile(new URL('../public/credits.md', import.meta.url), 'utf8');

  const rootBlocks = parseCredits(rootMd);
  const publicBlocks = parseCredits(publicMd);
  const defaultBlocks = parseCredits(CREDITS_LIST);

  assert.ok(rootBlocks.length > 10);
  assert.equal(rootBlocks.length, publicBlocks.length);
  assert.equal(rootBlocks.length, defaultBlocks.length);
  assert.equal(rootBlocks[0].type, 'title');
  assert.equal(rootBlocks[0].text, 'BOATLOAD');
});

test('CreditsUI renders custom credit lists and supports playback controls', () => {
  const createdElements = [];
  globalThis.document = {
    createElement(tag) {
      const el = {
        tagName: tag.toUpperCase(),
        id: '',
        className: '',
        innerHTML: '',
        style: {},
        parentNode: null,
        clientHeight: 400,
        scrollHeight: 1200,
        children: [],
        appendChild(child) {
          child.parentNode = this;
          this.children.push(child);
        },
        removeChild(child) {
          child.parentNode = null;
          this.children = this.children.filter(c => c !== child);
        },
        querySelector(sel) {
          if (sel === '#credits-roll-track') {
            return this._track || (this._track = {
              innerHTML: '',
              style: {},
              scrollHeight: 1200
            });
          }
          if (sel === '#credits-viewport') {
            return {
              clientHeight: 400,
              addEventListener() {}
            };
          }
          if (sel === '#credits-pause-label') {
            return this._pauseLabel || (this._pauseLabel = { textContent: 'Pause' });
          }
          if (sel === '#credits-speed-label') {
            return this._speedLabel || (this._speedLabel = { textContent: 'Speed: 1x' });
          }
          return { onclick: null };
        }
      };
      createdElements.push(el);
      return el;
    },
    getElementById() {
      return {
        appendChild(child) {
          child.parentNode = this;
        },
        removeChild(child) {
          child.parentNode = null;
        }
      };
    }
  };

  const ui = new CreditsUI({ day: 7, coins: 1250 });
  emit('uiMount', {
    screen: 'credits',
    data: {
      gameCompleted: true,
      bonusCoins: 675,
      credits: [
        '# CUSTOM VOYAGE CREDITS',
        '## [icon-anchor] Custom Section',
        '- Captain Custom'
      ]
    }
  });

  assert.ok(ui.root);
  assert.match(ui.root._track.innerHTML, /CUSTOM VOYAGE CREDITS/);
  assert.match(ui.root._track.innerHTML, /Captain Custom/);

  // Updating the list dynamically updates rendered blocks
  ui.setCredits(['# UPDATED TITLE', '- New Sailor']);
  assert.match(ui.root._track.innerHTML, /UPDATED TITLE/);
  assert.match(ui.root._track.innerHTML, /New Sailor/);

  // Speed cycling & pause toggle
  assert.equal(ui._speedMultiplier, 1);
  ui.cycleSpeed();
  assert.equal(ui._speedMultiplier, 2);
  ui.cycleSpeed();
  assert.equal(ui._speedMultiplier, 4);
  ui.cycleSpeed();
  assert.equal(ui._speedMultiplier, 1);

  assert.equal(ui._isPaused, false);
  ui.togglePause();
  assert.equal(ui._isPaused, true);

  ui.dispose();
  assert.equal(ui.root, null);
  clear();
});

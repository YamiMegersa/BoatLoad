# BoatLoad: Iteration 2 Implementation Plan

Companion to `iteration-2-plan.md`. That document says **what** to change (CR1 to CR9, WP-A to WP-F). This one says **how to build it efficiently**: what to verify first, what order avoids rework, and the concrete steps, code shapes and tests per package.

Checked against `origin/QTEs` at `bc0d666` ("WIP: checkpoint commit"). Everything in your plan that I checked against that commit holds, with the corrections in section 1.

---

## 1. Corrections and new findings from checking the code

| # | Finding | Evidence | Effect on the plan |
|---|---------|----------|--------------------|
| 1 | **The docket is never fed or completed.** `_enterShipyard` emits `uiMount { screen: 'shipyard' }` with no `docket` payload, and `DocketSheet` only mounts when `d.docket` exists. `docketItemCompleted` and `allRepairsDone` have listeners (`main.js`, `DocketSheet`) but **nothing emits them**. | grep over `src/` | Your CR8 says "Set Sail stays gated on mandatory repairs". In the pushed code there is no gate. WP-D needs a **docket foundation** step first and grows from about 1 day to about 1.5 days. |
| 2 | **CR3 narrows to the GLB load itself.** The fallback only runs when `loader.loadAsync()` rejects. Any error after loading (texture sampling, voxelising) throws out of `build()` and the shipyard would not mount. Yours mounts. The catch block also **discards the error** (`catch (e)` then a generic `console.warn`). | `ShipBuilder.js` L26-29 | Step 1 of WP-B is one line: log `e`. The extra `[DBG]` instrumentation is not on the remote, so it exists only locally. |
| 3 | **A cache removes the failure class entirely.** `build()` re-fetches, re-parses and re-voxelises the GLB on every shipyard entry. `VoxelGrid.snapshot()`/`restore()` already exist and include colours. | `VoxelGrid.js` L274-296 | Cache the **pristine voxelised grid per ship id** after the first success. Later builds restore from it and apply damage. No refetch means no post-sink failure, and shipyard entry gets faster. |
| 4 | **Day wiring is the real blocker for several packages.** `LevelConfig.load(1)` is called once at boot (`main.js` L205) and `_enterResults` increments `day` but nothing reloads content. | grep | Move day wiring **before** audio and damage work, since it makes the real siren testable. |
| 5 | **Barrel QTE vs "day 1 is cannon-free".** `ObstacleManager` triggers the barrel SHOOT QTE automatically within 10 units, with no weapon involved. Cannons from day 2 need to decide what happens when ammo is 0. | CR7 and CR9 | Needs a decision (section 6, question 3). |
| 6 | **Console spam:** `ShipBuilder._applyDamage` logs `[DEBUG _applyDamage]` for every cell. | `ShipBuilder.js` L174-178 | Remove in WP-0. It hides the real errors you are trying to read in WP-B. |
| 7 | **Dead code confirmed:** `_enterShipyard` destructures `gltfScene`, which `build()` never returns, and `ChunkRenderer.init` ignores its third argument. `ChunkRenderer.dispose()` and `_fullRebuild` call `geometry.dispose()` on meshes sharing module-level `BOX_GEO`/`EDGES_GEO`. | `GameState.js` L411, `ChunkRenderer.js` L31-32, L141, L155 | Fold into WP-B hardening as planned. |

Verified as stated in your plan (no change needed): CR1 (the timing branch sets `left`, the mash branch does not, `HUD.js` L363-369), CR2 (`QTE Report` is unconditional, `ResultsUI.js` L27-28), CR4 (`AudioManager` is never instantiated, no `src/assets/audio/` folder, no synthesis fallback) and CR5 (`QTE_SOURCES` values).

---

## 2. Principles for building this efficiently

1. **Build the test harness first.** Most of this plan is "reach a hard-to-reach state, then check it" (sink, low water, day 2). A debug-only `window.__dev` makes each check a one-liner (WP-0).
2. **One debug flag.** `?debug` in the URL gates the QTE debug buttons, the `__dev` helpers, the hitbox wireframe and any verbose logging. This covers CR6 and the hitbox item with one mechanism.
3. **Fix contracts once.** Shared shapes (`levelCfg.cannon`, the `docket` array, sound ids, `QTE_SOURCES`) are decided in this plan and stay stable, so later packages do not rework earlier ones.
4. **One package, one commit, one green build.** `npm run build` after every package, so any package can be reverted alone.
5. **Diagnose before fixing** for CR3. The cache fix likely cures it either way, but the root-cause reading decides whether anything else is wrong.
6. **Keep personal docs out of Git.** Add `docs/qte-implementation-and-improvement-plan.md` to `.git/info/exclude` (local, unlike `.gitignore`), so it stays untracked without touching the repo's files.

---

## 3. Revised order and dependencies

| Order | WP | Why here | Est. |
|:-----:|----|----------|------|
| 1 | **WP-0** Foundations (debug flag, `__dev` helpers, log cleanup) | Speeds up every test below | 1.5 h |
| 2 | **WP-A** Quick fixes (CR1, CR2, CR5) | Three tiny player-visible wins, near-zero risk | 1 h |
| 3 | **WP-B** Block ship (CR3) | Most serious defect. Uses `__dev.sink()` to reproduce | 4 h |
| 4 | **WP-1** Day-content wiring (from WP-F) | Unlocks the real siren, per-day barrels, and the cross-day damage loop | 3 h |
| 5 | **WP-C** Audio (CR4) | Needs WP-1 to test the real siren. Independent of B and D, so it can run in parallel with them if you have a second person | 4-5 h |
| 6 | **WP-D** Damage persistence + docket foundation (CR8) | Depends on the stable rebuild path from WP-B and on the day logic | 8-10 h |
| 7 | **WP-E** Barrels (CR6, CR7) | Mostly level JSON plus verification | 2 h |
| 8 | **WP-2** Cannons (from WP-F) | Depends on WP-1, WP-E and the settled scoring | 8-10 h |

Total: about 32-36 hours, roughly 4-5 focused days. WP-1 moves ahead of audio and damage work, and WP-D is larger than your estimate because of finding #1.

---

## 4. Work packages

### WP-0: Foundations (1.5 h)

**Files:** new `src/utils/debug.js`, `main.js`, `HUD.js`, `ShipBuilder.js`, `PlayerShip.js`

```js
// src/utils/debug.js
export const DEBUG = new URLSearchParams(location.search).has('debug');
```

```js
// main.js (only when DEBUG)
if (DEBUG) window.__dev = {
  sink:     () => emit('playerSunk'),                 // reproduces CR3 in 3 seconds
  setWater: n  => gameState._playerShip && (gameState._playerShip.waterLevel = n),
  damage:   n  => gameState._playerShip?.takeDamage(n, 'dev'),
  day:      n  => { gameState.day = n; },             // used by WP-1
};
```

Steps:
1. Gate `#hud-qte-debug` in `HUD.js` behind `DEBUG` (CR6).
2. Gate the green hitbox wireframe in `PlayerShip.js` behind `DEBUG`.
3. Remove the per-cell `[DEBUG _applyDamage]` logs.
4. Commit the baseline, then `git push`.

**Done when:** a normal page load shows no debug buttons or wireframe, `?debug` shows them, and `__dev.sink()` reaches the SHIP LOST screen.

---

### WP-A: Quick fixes (1 h)

1. **CR1** `HUD.js`: in the mash/alternate branch set `left = '0%'` before `width`. In `_showQTE` reset `left = '0%'` and `width = ''`.
2. **CR2** `ResultsUI.js`: wrap the section so it only renders on a pass: `${passed ? `<h2>QTE Report</h2><ul>${stats}</ul>` : ''}`.
3. **CR5** `QTESystem.js`: set `reward` and `perfectReward` to 0 for `barrel` and `siren`. `_succeed` only emits `scoreAdded` when `points > 0`, so floating text and score stop automatically while stats and sounds keep working.

**Done when:** Harpoon then Bail fills the bar from the left edge, SHIP LOST shows no report, and a run with sirens, barrels and sharks only moves the score on sharks.

---

### WP-B: Block ship after sinking (4 h)

**B1. Diagnose (30 min).** In `ShipBuilder.js` change the catch to `catch (e) { console.error('[ShipBuilder] GLB load failed:', e); ... }`. Then in a `?debug` run: `__dev.sink()`, click Return to Shipyard, and read both the console and the Network panel (`sloop.glb` row).

| Observation | Meaning | Next step |
|-------------|---------|-----------|
| Error logged and the request shows failed or cancelled | Request-level failure (dev server, abort) | The cache in B2 removes it, then investigate the cause if it also happens on first load |
| Error logged with a parse or decode message | GLB parse or texture decode failing under load | The cache avoids repeat parses. Check texture handling if first load fails |
| **No** error logged but the block still shows | Not the fallback. Render-side | Log `DamageSystem.getSummary(grid)` after `build()`. If the grid is correct, look at `ChunkRenderer.init` and the shared-geometry disposal |

**B2. Resilience (2 h).** Cache the pristine voxelised grid per ship, and retry the first load once:

```js
// ShipBuilder.js
const _pristine = new Map(); // shipId -> VoxelGrid.snapshot() before damage is applied

static async build(shipDef, levelCfg = null) {
  const { x: W, y: H, z: D } = shipDef.grid;
  const grid = new VoxelGrid(W, H, D);

  const cached = _pristine.get(shipDef.id);
  if (cached) {
    grid.restore(cached);                       // no fetch, no parse, no re-voxelise
  } else {
    const gltf = await ShipBuilder._loadGLB(shipDef.id);   // retries once
    ShipBuilder._voxelise(gltf, grid);                     // existing code, moved into a helper
    _pristine.set(shipDef.id, grid.snapshot());
  }

  this._applyDamage(grid, levelCfg);
  grid.dirtySet.clear();
  grid.topologyDirty = false;
  return { grid, zones: shipDef.zones, def: shipDef };
}

static async _loadGLB(id) {
  const loader = new GLTFLoader();
  const url = `/src/assets/ships/${id}.glb`;
  try { return await loader.loadAsync(url); }
  catch (e) {
    console.error('[ShipBuilder] GLB load failed, retrying once:', e);
    await new Promise(r => setTimeout(r, 250));
    return loader.loadAsync(url);                          // second failure propagates
  }
}
```

If the retry also fails on the very first build, use the zone fill as a **last resort only**, with `console.error` plus an on-screen banner (`emit('buildError', {...})`), never silently.

**B3. Guard the phase entry (30 min).** Wrap the build in `_enterShipyard` with try/catch. On failure emit the banner and stay on the previous scene instead of half-initialising.

**B4. Hardening (45 min).**
- `ChunkRenderer`: skip `geometry.dispose()` for meshes that use `BOX_GEO`/`EDGES_GEO`.
- Remove the dead `gltfScene` destructure and the unused third argument of `ChunkRenderer.init`.

**Done when:** `__dev.sink()` then Return to Shipyard three times in a row shows the detailed ship every time; temporarily renaming `sloop.glb` on a fresh page load shows the loud error and never a silent block.

---

### WP-1: Day-content wiring (3 h)

**Files:** `main.js`, `GameState.js`, `LevelConfig.js`

1. Replace the boot-time `LevelConfig.load(1)` with a loader keyed on `gameState.day`. Keep one mutable `level` object in `main.js`, and have every transition (`gotoShipyard`, `startSailing`, `btn-obstacle`, `restartPhase`) read from it instead of the boot-captured destructured variables.
2. When a voyage passes, `_enterResults` already increments `day`. Reload `level` on the next DOCK or SHIPYARD entry.
3. Handle the edges: `day > 7` shows a "game complete" state, and a missing day JSON falls back to the last valid day with a console error.
4. Dev shortcut: `?debug&day=2` sets the starting day, and `__dev.day(n)` jumps while running.

**Done when:** passing day 1 loads `day2.json`, the sirens appear in the world, and `?debug&day=2` starts there directly. Pause then Restart Level and Back to Shipyard still keep the right ship (regression guard).

---

### WP-C: Audio (4-5 h)

**Files:** `AudioManager.js`, `main.js`, `QTESystem.js`, `SirenManager.js`

1. **Instantiate and unlock.** `const audio = new AudioManager();` in `main.js`, plus a one-shot `pointerdown`/`keydown` listener that calls `audio.unlock()` (`ctx.resume()`).
2. **Synth table**, one entry per sound id from your CR4 table, each a small function that schedules oscillators and noise on the context. No buffers needed:
   ```js
   const SYNTH = {
     qte_success: (c, out, t) => chime(c, out, t, [660, 880]),
     qte_fail:    (c, out, t) => buzz(c, out, t, 220, 110, 0.25),
     qte_tick:    (c, out, t, i) => blip(c, out, t, i.alt ? 520 : 440),
     // harpoon, shark_hit, collision, barrel_shot, bail, siren_resist ...
   };
   ```
3. **Do not fetch missing files over and over.** The current `play()` tries `fetch` of an mp3 and logs a warning on every miss, which would mean a failed request on every `qte_tick`. Keep a **negative cache** (`this._missing = new Set()`): try the mp3 once per id, remember the miss, then go straight to synth. Real mp3s dropped into `/src/assets/audio/` still win.
4. **Master gain and mute.** Route everything through one master `GainNode`. Wire the existing `toggleMute()` to the `M` key.
5. **Per-press ticks.** In `QTESystem._handleInput` emit `playSound { sound: 'qte_tick', alt }`, alternating `alt` in alternate mode.
6. **Siren ambience.** Driven by `sirenPulling { intensity }`: an LFO-modulated oscillator whose volume and LFO rate scale with `intensity`. Add a **watchdog** (stop the loop if no `sirenPulling` arrives for about 300 ms) and also stop it on `phaseChanged`, so it can never keep wailing after a sink, pause or phase change.

**Done when:** no audio before the first gesture, no console errors with zero asset files, siren wail scales with proximity and always stops, and every QTE and collision is audible and distinct.

---

### WP-D: Damage persistence and docket foundation (8-10 h)

This is the biggest package. Work in this order, because D1 gives you a working repair loop to build on.

**D1. Docket foundation (3-4 h)** (finding #1)
- Add `buildDocket(grid, zones)` that derives items **from grid damage by zone**: count `MISSING`/`DAMAGED`/`FLOODED` cells per zone, map zone to tool (hull to hammer, sail to needle, mast to rope), and mark an item mandatory when it is hull damage at or below the waterline.
- Use this one function for both authored day damage and sunk-run damage, so Option A needs no separate path.
- Emit `uiMount { screen: 'shipyard', docket }` from `_enterShipyard`.
- On every `cellRepaired`, recompute remaining damaged cells per zone. When a zone reaches 0 emit `docketItemCompleted { itemId, label }`, and when every mandatory item is done emit `allRepairsDone`.
- Read `DocketSheet` first to confirm how its Set Sail button enables itself, and drive it from `allRepairsDone`.
- Export one `WATERLINE_Y` constant (currently `y <= 4` in `PlayerShip`) and use it in both places instead of duplicating it.

**D2. Sink snapshot (2 h)**
- On `playerSunk`, capture `this._sinkSnapshot = this._grid.snapshot()` **before** `_exitObstacle` nulls the grid.
- In `_enterShipyard`, after `ShipBuilder.build()` (pristine plus authored damage), if `_sinkSnapshot` exists, `grid.restore(_sinkSnapshot)`.
- Clear `_sinkSnapshot` when the voyage **passes** (not merely when sailing starts), so a failed attempt keeps its wreck.

**D3. Difficulty check (1-2 h)**
- Repairs cost nothing, so a wreck can always be fully repaired and there is no softlock. The risk is a punishing start. If playtesting shows it, scale the leak rate per remaining waterline hole instead of capping hole count.

**Done when:** crash until holes appear, sink, Return to Shipyard: the same holes show, the docket lists exactly those zones, Set Sail is locked until mandatory repairs are done, and the repaired state carries into the next sail. A clean pass resets to the authored damage for the next day.

---

### WP-E: Barrels (2 h)

1. First read `ObstacleManager`'s spawner to confirm it handles `type: "barrel"` entries with `count` and `lanePattern`. Your plan says the type is fully coded, so this should be JSON only.
2. Add to `day1.json`: `{ "type": "barrel", "lanePattern": "random", "count": 3 }`, and scale up in later days.
3. Verify the three paths: collision (30 HP), shoot QTE then splash cleanup, and cleanup on restart.

**Done when:** sailing into a barrel costs 30 HP, a successful shot removes it with a splash, and neither awards points.

---

### WP-2: Cannons (8-10 h)

Contracts first, so code and data agree:

```json
// day2.json (absent on day 1)
"cannon": { "ammo": 5, "range": 14 }
```

1. **State:** `GameState._ammo` is set from `levelCfg.cannon?.ammo ?? 0` on entering sailing, and emits `ammoChanged { ammo }` so the HUD `#hud-ammo` shows a real count instead of `∞`.
2. **Targeting:** generalise the barrel proximity check into `ObstacleManager.findShootTarget(range)`, so barrels today and mines or sharks later share it.
3. **Firing:** when a target is in range and ammo is above 0, offer the FIRE prompt (Space or the mobile button). Starting the QTE consumes 1 shell, and a new `QTE_SOURCES.cannon` entry (SHOOT type, 0 reward) handles success and failure the same way as barrels.
4. **Out of ammo:** no prompt, so the barrel is a pure dodge hazard.
5. **Restock:** per-day ammo reset first. A dock or docket restock can come later.
6. **Resolve the day-1 conflict** from finding #5 before writing code (section 6, question 3).

**Done when:** day 1 has no cannon, day 2 shows the real ammo count dropping per shot, and with 0 shells barrels only hurt.

---

## 5. Test matrix

Run the relevant rows after each package, and all of them before merging. Rows 4 and 7 are fast with the `__dev` helpers.

| # | Scenario | Expected | WP |
|---|----------|----------|----|
| 1 | Harpoon QTE then Bail QTE | Meter fills from the left edge | A |
| 2 | `__dev.sink()` | SHIP LOST shows score and buttons only, no QTE report | A |
| 3 | Run with sirens, barrels and sharks | Only shark successes change the score; report counts still correct | A |
| 4 | `__dev.sink()` then Return to Shipyard, three times | Detailed ship every time, no fallback warning | B |
| 5 | Rename `sloop.glb`, fresh load | Loud error, no silent block | B |
| 6 | Pass day 1 | `day2.json` loads, sirens visible | 1 |
| 7 | `?debug&day=2` | Starts on day 2 directly | 1 |
| 8 | Any QTE, collision, siren | Audible and distinct; silent before first gesture; wail stops on exit, sink and pause | C |
| 9 | Damage, sink, shipyard | Same holes, docket matches, Set Sail locked until mandatory repairs done | D |
| 10 | Clean pass, next day | Resets to authored damage | D |
| 11 | Barrel contact vs barrel shot | 30 HP vs destroyed with splash, no points | E |
| 12 | Day 2 cannon vs barrel, then 0 ammo | Ammo counts down; 0 ammo means no prompt | 2 |
| 13 | Pause then Restart Level, Main Menu, Return to Shipyard | Ship correct each time (regression guard for every package) | all |
| 14 | `npm run build` | Green; no console errors on a full day 1 and day 2 run | all |

---

## 6. Decisions needed from you

1. **Damage persistence (CR8):** Option A (persist the wreck, dynamic docket) or Option B (authored reset). Recommendation: **A**. With the docket derived from grid damage, A costs little more than B.
2. **Leaving mid-run:** if the player pauses and chooses Back to Shipyard (or Main Menu) without sinking, should in-run damage persist? Recommendation: **no**, only a sink persists damage, so quitting is not a repair shortcut or a punishment.
3. **Barrels on day 1 vs cannons from day 2:** the barrel SHOOT QTE currently needs no weapon. Recommendation: day 1 keeps the free QTE as a tutorial for the timing mechanic; from day 2 shots need ammo, and with 0 ammo the barrel is only a hazard.
4. **Debug gate:** `?debug` URL flag as planned, or keep the buttons visible until the submission build. Recommendation: the flag now.
5. **Audio assets:** procedural synth only, or time to add real mp3s before submission. Recommendation: synth now. The loader already prefers real files, so assets can be added later without code changes.
6. **Siren reachability:** the real siren exists only from day 2 once WP-1 lands. Recommendation: accept it, so day 1 keeps a clean difficulty curve.
7. **Parallel work:** if a second person is available, WP-C (audio) can run alongside WP-B and WP-D, since it only touches `AudioManager`, `main.js` and small hooks in `QTESystem` and `SirenManager`.

---

## 7. What this plan deliberately does not do

Enemy ships that fire back, cannon as a buildable shipyard module, ammo pickups at sea, and new QTE input types. The contracts above (`levelCfg.cannon`, `findShootTarget`, `QTE_SOURCES`) are shaped so each of those becomes an addition rather than a rewrite.

# BoatLoad Static QTE Display Overhaul Plan (Revised v2)

## 0. Post-Mortem of the First Attempt (Why It Failed & Must Be Redone)

The initial implementation of the static QTE display plan failed in both visual quality and functional correctness:

1. **Violated the "Static Display" Premise:** All three stations were given `display: none` by default (`.qte-station { display: none; }`) and only popped into existence when active or queued. This meant they still behaved like sudden pop-ups, only relocated to the screen edges. **Fix:** Stations must be **always-visible nautical deck instruments** anchored on the HUD—quiet, translucent, and unobtrusive in their `idle` state, and illuminating/animating in-place when `queued` or `active`.
2. **Poor Visual Craftsmanship ("Boxy Debug Look"):**
   - The timing gauge used a plain CSS dashed border (`border-top: 2px dashed #ead9ad`) and a 4px white rectangle for a needle, completely ignoring the existing pixel-art asset `public/assets/ui/hud/qte_needle_hand.png` (`.hud-qte-needle`) and the brass/mahogany aesthetic of the HUD.
   - Furthermore, the timing gauge collapsed the entire `sweetSpot` window (`[0.40, 0.60]`, i.e., a 36° arc) into a tiny `10px × 10px` square at the bottom of the dial instead of rendering an actual target arc along the dial's sweep!
   - The Siren station was a cramped `42px`-wide strip with raw `<i>` tags and vertical text (`writing-mode: vertical-rl`) that looked broken and unreadable.
   - The Bail station sat as an unstyled dark rectangle in the bottom-left corner.
3. **Broken Bail Cancellation (`this._cancelBailDrawing()` TypeError):** `HUD.js` called `this._cancelBailDrawing()` inside `_resolveQTE()`, a method that **does not exist** anywhere in `HUD.js`. Whenever a `BAIL` QTE succeeded or failed, it threw a runtime `TypeError`, breaking resolution cleanup and leaving the station stuck!
4. **Dead Legacy Code & CSS Left Behind:** Despite WP3 requiring removal of legacy popup code, `_showQTELegacy`, `_updateQTELegacy`, `_hideQTE`, and **both** competing `#hud-qte` CSS blocks (`~L1304–1490` and `~L3791–3969` in `ui.css`) were left in the codebase.
5. **Broken Queued-State & Back-to-Back Transitions:**
   - In `HUD.js`, `_queueQTE` added `.is-queued` without setting the station's title, icon, or siren side, rendering an empty box with `WAITING`.
   - When a station resolved (`500ms` timer in `_resolveQTE`), its timeout blindly wiped `el.className` and called `controller.clear(station)` even if a new QTE had started or been queued on that same station during the 500ms window!
   - When `QTESystem._succeed()` or `_fail()` synchronously called `this._startNext()`, `qteStart` for a queued QTE fired *before* `qteSuccess`/`qteFail` finished or vice-versa depending on station type, and `QTEStationController` did not properly transition a `queued` station into `active` or preserve a newly queued badge when another station resolved.
6. **HUD Overlap on Right Edge:** The `#minimap` occupies `top: 20px; right: 20px; width: 200px; height: 200px` (down to `y = 220px`), and `#hud-wheel-container` occupies `bottom: 25px; right: 25px` (up to `340px` tall). Placing `.qte-timing-station` at `top: clamp(150px, 27vh, 280px)` caused it to collide with the bottom of the minimap on 720p/800p screens.

---

## 1. Design Goal & Philosophy

Replace all transient QTE pop-ups with **three permanent, screen-anchored nautical HUD instruments** that look like part of the ship's helm and bridge kit:

1. **Always Present, Never Intrusive:** When `idle`, each station sits at low opacity (`~0.35–0.45`), compact and docked in its safe HUD zone with `pointer-events: none`. The player always knows where each instrument lives.
2. **In-Place Illumination:** When `queued`, the instrument's brass frame pulses softly with an `INCOMING` / `READY` indicator. When `active`, it brightens to full opacity (`1.0`), elevates its border glow, and enables pointer/touch fallback input without shifting layout or covering the central sailing view.
3. **Authentic Nautical Pixel-Art Styling:** Use the project's `Cinzel` serif / monospace typography, weathered dark naval slate (`#132028`), tarnished brass (`#d7b35a`), mahogany drop-shadows, SVG arcs for accurate sweet-spot zones, and existing pixel-art icons (`.icon-harpoon`, `.icon-swivel-cannon`, `.icon-bailer-bucket`, `.icon-siren`, `.hud-qte-needle`).

---

## 2. Screen Layout & Exclusion Zones

| Instrument Station | QTE Types | Fixed Screen Anchor | Idle Appearance | Active Appearance | Exclusion Zones Cleared |
|---|---|---|---|---|---|
| **1. Starboard Chronometer Gauge** (`#qte-station-timing`) | `HARPOON` (shark), `SHOOT` (barrel/cannon) | **Top-right beside `#minimap`** (`top: 20px, right: 234px`) | Compact brass half-dial (`192px` wide) at `42%` opacity showing `DECK ORDNANCE` & resting needle | Full contrast brass chronometer; SVG arc highlights exact `sweetSpot` sector (`[start, end]`) + center Perfect tick; needle sweeps `-90°` to `+90°`; countdown bar | Completely clear of `#minimap` (`right: 20..220px`) and `#hud-wheel-container` (`bottom: 25px, right: 25px`) |
| **2. Port Bilge Pump Well** (`#qte-station-bail`) | `BAIL` (water ingress > 75%) | **Bottom-left**, below `#hud-status-cluster` (`left: 20px, bottom: 22px`) | Compact bilge well bezel (`176px × 202px`) at `42%` opacity with bucket icon & `DRY` | Illuminates in-place with `136×136` interactive rotary trace canvas, live `%` coverage badge, and `[SPACE] 50%` hint | Clears `#hud-status-cluster` (`top: 56..250px, left: 20px`); coordinates with `#hud-mobile-harpoon` on touch |
| **3. Gunwale Siren Ward Rail** (`#qte-station-siren`) | `SIREN` (hypnotic pull) | **Bottom-left beside Bilge Pump** (`left: 208px, bottom: 22px`) | Vertical brass tuning rail (`76px × 202px`) docked next to Bilge Pump at `38%` opacity with `.icon-siren-note` | Glows magenta/violet with directional pull border (`side-left` / `side-right`), displays 8 resonance bars that fill bottom-to-top on each `SPACE` mash + timer bar | Never overlaps `#qte-station-timing`, `#hud-wheel-container`, `#minimap`, or `#qte-station-bail` |

### 2.1 Shared Left-Lower Zone on Touch Devices
- `#hud-mobile-harpoon` (`bottom: 35px, left: 35px`) is strictly gated to coarse pointers (`window.matchMedia('(pointer: coarse)').matches`) **and** only displays during active `timing` or `mash` QTEs.
- During `idle` or `BAIL` (`draw`), `#hud-mobile-harpoon` is hidden (`display: none`), and when `#hud-mobile-harpoon` is shown on touch screens, the idle Bilge station dims out so the thumb button has 100% clear touch access.

---

## 3. Detailed Instrument Specifications

### 3.1 Starboard Chronometer Gauge (`SHOOT` & `HARPOON`)
- **Header:** Pixel icon (`.icon-harpoon` for shark, `.icon-swivel-cannon` / `.icon-explosion-burst` for barrel/cannon) + title (`HARPOON LOCK` / `CANNON FIRE` when active; `DECK ORDNANCE` when idle).
- **SVG Semicular Dial (`viewBox="0 0 120 68"`):**
  - Renders a crisp brass outer arc, tick marks every 15°, a translucent amber/cyan **Sweet-Spot Sector Arc** computed directly from `sweetSpot: [start, end]` (converting `0..1` ratio to angle `-90°..+90°`), and a bright gold **Perfect Center Band** (`±22%` of sweetSpot width, matching `QTESystem._isTimingPerfect`).
  - **Needle:** Pivots from `(60, 60)` from `-90°` (`elapsedRatio = 0`) to `+90°` (`elapsedRatio = 1`), styled with the pixel-art `.hud-qte-needle` sprite / crisp brass pointer.
- **Footer:** Shows `[SPACE] STRIKE ZONE` when active, `STANDBY` when idle, `QUEUED` when waiting, and `PERFECT! / GOOD! / MISS!` badge on resolution.

### 3.2 Port Bilge Pump Station (`BAIL`)
- **Header:** `.icon-bailer-bucket` + `BILGE PUMP` + live coverage readout (`0%`–`100%`).
- **Interactive Trace Well (`canvas#hud-qte-draw`):**
  - Always mounted inside the station (`168×168px` CSS, `220×220` internal canvas resolution, `touch-action: none`).
  - When `idle`, displays a calm dark-water porthole well with a subtle dashed brass guide ring (`BILGE STANDBY`).
  - When `active`, highlights the circular trace track with directional arrows, draws a glowing cyan wake trail (`#75d9ec`) under the player's pointer, and shows a bottom prompt: `TRACE CIRCLE · [SPACE] 50%`.
- **Safe Cancellation Helper (`_cancelBailDrawing()`):**
  - Properly implemented on `HUD` to release pointer capture (`this._bailCanvas.releasePointerCapture(this._bailPointerId)`), reset `_bailDrawing = false`, `_bailPointerId = null`, `_lastBailPoint = null`, and clear the canvas without throwing.

### 3.3 Gunwale Siren Ward Rail (`SIREN`)
- **Side Latching:** Latches to `left` or `right` at `qteStart` based on `sirenPulling.steerPull` within the last `600ms` (or `metadata.side` if provided by `SirenManager`), defaulting to `right` if no pull was recorded. Never flips mid-QTE.
- **Visual Design:**
  - Styled as a vertical brass/mahogany **Ward Totem / Sound Gauge** (`76px` wide, `210px` tall) anchored at `top: 50%; transform: translateY(-50%)` along the latched edge (`left: 16px` or `right: 16px`).
  - Top crest: `.icon-siren` / `.icon-siren-note` + compact horizontal label (`SIREN` / `MASH!`).
  - Center: 8 horizontal brass-framed resonance bars (`qte-pip`) stacked vertically that ignite with cyan/magenta light as `progress` increments from `0` to `8`.
  - Bottom: Countdown timer bar + `[SPACE]` keycap badge.

---

## 4. State Machine & Controller (`src/ui/QTEStations.js`)

`QTEStationController` is a pure, DOM-free state controller tested via `node --test`:

- **States per station (`timing`, `bail`, `siren`):** `'idle' | 'queued' | 'active' | 'resolving'`
- **Transitions:**
  1. `start(event)`:
     - Maps `event.type` (`SHOOT`/`HARPOON` -> `timing`, `BAIL` -> `bail`, `SIREN` -> `siren`).
     - If another station was `active`, moves it to `idle`.
     - Sets target station to `state = 'active'`, stores `type`, `source`, `label`, `sweetSpot`, and latches `side` for `siren`.
     - Increments a per-station `seq` token so any pending `resolving` timer from an earlier QTE on the same station is invalidated and cannot overwrite the new `active` state!
  2. `queue(event)`:
     - If the target station is `idle` or `resolving`, sets `state = 'queued'` (or records `queuedType` if already `active` so that if a second `SHOOT`/`HARPOON` is queued behind an active one, the queue badge is preserved).
  3. `resolve(event, result)`:
     - If `event.queued === true`: only clears the `queued` state on that station; **never** disturbs an `active` station.
     - If `event.queued !== true`: transitions the station from `active` to `resolving` with `result` (`'PERFECT'`, `'GOOD'`, `'MISS'`) and returns the station's `seq` token for the 500ms cooldown timer.
  4. `finishResolve(station, seq)`:
     - Only transitions `station` to `'idle'` if its `seq` still matches (preventing race conditions when back-to-back QTEs start within 500ms).

---

## 5. Implementation Work Packages

### WP1 — Pure Controller & Unit Tests (`src/ui/QTEStations.js`, `tests/qte-stations.test.js`)
1. Upgrade `QTEStationController` with sequence tokens (`seq`), `finishResolve(station, seq)`, `sweetSpotToArc()` SVG geometry helper, and queued-on-same-station tracking.
2. Add comprehensive unit tests covering:
   - Station routing for all 4 QTE types.
   - Queued expiry (`queued: true`) never hiding an active station.
   - Siren side latching from `sirenPulling` or `metadata.side` and never flipping mid-QTE.
   - Back-to-back QTEs on the **same** station (`HARPOON` -> `SHOOT`) not getting wiped by the 500ms resolve timer.
   - `sweetSpotToArc` angle and SVG path calculations.

### WP2 — Clean HUD Station Markup & Lifecycle (`src/ui/HUD.js`)
1. Replace the bare `<section>` placeholders with rich, always-mounted nautical instrument markup for `#qte-station-timing`, `#qte-station-bail`, and `#qte-station-siren`.
2. Implement `_cancelBailDrawing()` properly to fix the `TypeError` crash on bail resolution.
3. Delete dead `_showQTELegacy`, `_updateQTELegacy`, and `_hideQTE` methods from `HUD.js`.
4. Guard `_qteResolveTimers` with the controller's `seq` token so a resolving timer never clobbers a newly started or queued QTE.
5. Pass `side` in `SirenManager.js` QTE `metadata` (`side: turnDir > 0 ? 'left' : 'right'`) so siren side latching is 100% deterministic even on the first frame.

### WP3 — Nautical Instrument CSS & Legacy Cleanup (`src/ui/ui.css`)
1. Remove **both** dead `#hud-qte` CSS blocks (`~L1304–1485` and `~L3791–3968`) in `src/ui/ui.css`.
2. Style `.qte-station` as always-visible (`display: flex`), with distinct `.is-idle`, `.is-queued`, `.is-active`, and `.is-resolving` states.
3. Position `#qte-station-timing` at `top: clamp(228px, 30vh, 300px)` so it never overlaps `#minimap` or `#hud-wheel-container`.
4. Style the SVG sweet-spot arc, perfect tick, `.hud-qte-needle` pointer, bilge pump porthole canvas, and 8-bar siren ward rail.

### WP4 — Verification
1. Fix any broken test expectations and run `npm test` and `npm run build` in `BoatLoad`.
2. Verify all 20+ unit tests pass with zero errors.

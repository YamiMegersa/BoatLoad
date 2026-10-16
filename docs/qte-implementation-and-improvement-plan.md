# BoatLoad QTE Implementation and Improvement Plan

This document records the QTE work currently implemented on the `QTEs` branch and the next improvements identified during playtesting. It is intended to guide the next iteration before the branch is merged into `main`.

## Current Branch State

- `QTEs` includes the latest `main` work through merge commit `c7cbd12`.
- The QTE implementation work is currently uncommitted.
- `npm run build` passes after the QTE changes.

## Implemented So Far

### QTE Core

- Replaced wall-clock QTE timers with `update(delta)` timers, so an active QTE does not expire while the game is paused.
- Added a priority queue rather than silently rejecting every overlapping QTE.
- Added queue expiry handling, so old prompts cannot remain valid indefinitely.
- Centralized QTE definitions in `QTESystem.js`. Each type defines its input mode, keyboard input, time window, priority, score reward, label, and prompt.
- Added level and ability tuning:
  - `qte.windowScale` can tune a day's QTE timing window.
  - `sharp_eye` increases the QTE timing window by 20%.
  - Tutorial levels receive an additional 25% timing window.

### Input and Mobile Support

- Added two input styles:
  - **Timing:** tap/click or use the displayed key while the indicator is in the green zone.
  - **Mash:** tap repeatedly or use the displayed key until the progress target is reached.
- Added a large touch action button for every active QTE, not only harpoons.
- Added responsive QTE layout rules for smaller mobile screens and safe-area spacing.

### Gameplay Sources

- **Shark harpoon:** sharks offer a timing QTE. A success starts the harpoon-hit sequence; a failure damages the ship.
- **Bailing water:** high water levels offer a high-priority mash QTE. The previous lockout bug was fixed by marking bailing active only when the QTE is accepted.
- **Barrels:** nearby barrels now offer a timing shoot QTE. Success safely removes the barrel; failure leaves it as a collision hazard.
- **Sirens:** Day 2 has a siren encounter. Its pull affects steering and triggers a mash QTE; success suppresses the siren temporarily, while failure damages the ship.

### Score and Results

- QTE scoring is centralized and supports Good/Perfect results, combo streaks, and capped score multipliers.
- Added QTE debug buttons for Shoot, Harpoon, Bail, and Siren prompts.
- Added a results overlay that displays final score plus per-type Perfect, Good, and Miss counts.

## Playtest Findings and Next Fixes

### 1. Recalibrate Shark Bonus Points

**Observation:** Harpooning a shark is an optional Level 1 bonus interaction, but the score rises too quickly.

**Required change:** A successful shark harpoon should award **50 bonus points**. Perfect timing may use a small, clearly documented bonus, but it must not make scores inflate rapidly.

**Recommended implementation:**

- Separate score rewards by QTE source rather than using only one reward for every `HARPOON` QTE.
- Set the shark's base reward to 50 points.
- Consider 75 points for a Perfect shark harpoon instead of doubling it.
- Keep barrel and future QTE rewards independently configurable in level data or the QTE definition table.

### 2. Make Shark-Hit Feedback Clearer

**Observation:** The green timing prompt remains visible long enough to obscure the moment the shark is hit. The hit itself can feel ambiguous.

**Required change:** Immediately remove or rapidly fade the QTE prompt after a successful input so the player can see the shark reaction.

**Feedback to add:**

- A short success flash or `SHARK HARPOONED` confirmation that does not cover the shark.
- A stronger splash and harpoon impact effect at the shark.
- A distinct hit sound, separate from generic collision audio.
- A brief red flash/emissive effect and visible breach/jump from the shark.
- Optional small camera impulse or time-scale effect, kept subtle enough for mobile performance and comfort.

### 3. Complete the Pause Experience

**Required pause screen actions:**

1. **Resume Game:** return to the exact gameplay state at which the player paused. Active QTE timers, ship health, water, location, and obstacles must remain unchanged while paused.
2. **Restart Level:** restart sailing with the same ship condition that left the shipyard. This means preserve the repaired voxel-grid state from the shipyard, but reset the sailing-level runtime state: player position, obstacles, score, QTE queue, water level, and temporary damage gained while sailing.
3. **Main Menu:** leave the current sailing run and return to the main menu.

**Implementation notes:**

- The game loop already skips updates while paused, and the new delta-driven QTE system is pause-safe.
- Verify that the visible pause UI is mounted during sailing and that every action has an accessible touch target.
- The restart flow needs an explicit snapshot of the shipyard-exit ship state. Do not reuse the damaged runtime grid created during sailing.

### 4. Clarify and Differentiate the Siren QTE

**Observation:** The siren interaction is not self-explanatory, and it currently shares the same desktop input as bailing water.

**Required change:** Teach the player what the siren is doing and give it a clearly different interaction identity from bailing.

**Recommended design:**

- Before the QTE, show a concise warning such as: `SIREN SONG — STEER AWAY AND BREAK THE SPELL`.
- Visually show the siren's pull direction on the steering wheel or with a screen-edge cue.
- Keep **Bail Water** as a rapid mash interaction.
- Change the siren to a distinct input, such as:
  - alternating left/right directional taps to fight the pull, or
  - a timing-bar interaction that represents resisting the song.
- Use a unique color, icon, sound, and mobile button label for sirens.
- Add a short first-encounter tutorial prompt before the siren can damage the ship.

## Suggested Next Iteration Order

1. Reduce and source-configure shark rewards.
2. Improve the shark-hit sequence and hide the prompt immediately on success.
3. Verify and finish the pause menu's Resume, Restart Level, and Main Menu behavior.
4. Redesign the siren prompt and give it a distinct desktop/mobile input pattern.
5. Playtest the full Level 1 and Day 2 flow on desktop and a touch device before merging.

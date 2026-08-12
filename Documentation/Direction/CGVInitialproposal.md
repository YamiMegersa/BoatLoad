# Shipwreck & Sail — Game Design Proposal
**Engine:** Three.js (WebGL) &nbsp;|&nbsp; **Genre:** Puzzle / Arcade &nbsp;|&nbsp; **Platform:** Browser  
**Document Version:** 1.0 &nbsp;|&nbsp; **Date:** 2026-08-12  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Core Concept](#2-core-concept)
3. [Technology Stack](#3-technology-stack)
4. [Game Flow & Structure](#4-game-flow--structure)
5. [Repair Mechanics](#5-repair-mechanics)
6. [Obstacle Gameplay](#6-obstacle-gameplay)
7. [Ships & Progression](#7-ships--progression)
8. [Level Design](#8-level-design)
9. [Toolbox & Abilities](#9-toolbox--abilities)
10. [UI / UX Considerations](#10-ui--ux-considerations)
11. [Open Design Questions](#11-open-design-questions)
12. [Out of Scope (V1)](#12-out-of-scope-v1)
13. [Implementation Notes for Agents](#13-implementation-notes-for-agents)

---

## 1. Executive Summary

**Shipwreck & Sail** is a browser-based, voxel-aesthetic puzzle-arcade game built in **Three.js**. The player runs a small ship-repair workshop on a busy wharf. Over the course of seven in-game days, increasingly damaged vessels arrive at the dock. The player must diagnose faults from a docket sheet, apply the correct tools and repairs in the shipyard, and then **sail the repaired ship** through a gauntlet of maritime obstacles to prove the vessel is seaworthy. Success unlocks the next day; failure sends the player back to the repair stage.

The game blends the methodical satisfaction of a *Papers, Please*-style checklist with the kinetic tension of an arcade obstacle run, all wrapped in a charming low-poly voxel art style.

---

## 2. Core Concept

### Pillars

| Pillar | Description |
|--------|-------------|
| **Diagnose & Repair** | Players read a customer's docket, identify damage on the ship, and apply the right tool from the toolbox. |
| **Sail & Survive** | The repaired ship is taken on a test drive through a gauntlet of maritime obstacles, which may be hand-placed or procedurally generated. Poorly repaired ships perform worse. |
| **Escalating Mastery** | Each day introduces one or more new damage types, new tools, and new obstacles — teaching systems incrementally. |

### Fantasy
> *"I fixed this broken wreck with my own hands. Let's see if she holds."*

---

## 3. Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Renderer** | [Three.js](https://threejs.org/) | WebGL 3D rendering; voxel meshes via `BoxGeometry` instances or merged `BufferGeometry` |
| **Language** | JavaScript (ES Modules) | No build tool required for prototype; Vite recommended for production |
| **Physics / Movement** | Custom (no lib) | Simplified arcade physics for the obstacle stage; no rigid-body sim needed |
| **UI** | HTML/CSS overlay | Docket sheet, toolbox HUD, dialogue panels rendered as DOM over the canvas |
| **Audio** | Web Audio API | SFX for tools, ocean ambience, QTE hits |
| **Asset Format** | Voxel models baked to GLTF / built procedurally | Ship hull sections modelled as replaceable voxel chunks |

### Voxel Architecture Notes
- Each ship is composed of a **3-D grid of voxel "cells"** (e.g., 32×16×8 for a sloop).
- Damaged cells are flagged in a state array (`INTACT | DAMAGED | MISSING | FLOODED`).
- The renderer iterates the state array each frame and rebuilds only dirty chunks.
- This approach makes repair interactions straightforward: a tool targets a cell, updates its state, and triggers a chunk rebuild.

---

## 4. Game Flow & Structure

```
┌──────────────────────────────────────────────────────────┐
│                        Day Screen                         │
│   Customer arrives → Dialogue → Hand over Docket Sheet   │
└───────────────────────────┬──────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│                      Shipyard Phase                       │
│  Player inspects ship, selects tools, applies repairs.   │
│  Docket items check off when repair is confirmed.        │
│  [Complete All Items] → proceed                          │
└───────────────────────────┬──────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│                    Obstacle Trial Phase                   │
│  Semi top-down perspective. Ship sails automatically;    │
│  player steers left/right, fires cannons, triggers QTEs. │
│  Obstacles flip/scroll onto screen.                      │
└────────────┬─────────────────────────────┬───────────────┘
             │ FAIL (ship sunk / damaged)   │ PASS
             ▼                             ▼
     Back to Shipyard                Results Screen
                                     Ability Reward
                                     Next Day Unlocked
```

### Phase Details

#### 4.1 Dock / Dialogue Phase
- Customer NPC arrives with a unique personality and ship.
- Dialogue box (text + portrait) introduces lore and hints at the damage.
- **Docket Sheet** (Papers Please-style) lists every required repair. Items are pre-filled; player cannot proceed to sailing without checking off all mandatory items.
- Optional flavour repairs (e.g., Paint / Polish) may be available for bonus points but are not blockers.

#### 4.2 Shipyard Phase
- Camera orbits around the ship; player can rotate and zoom freely.
- Damaged voxels glow or show a distinct texture (cracked wood, burn marks, holes).
- A **toolbox panel** on the right lists available tools. Player selects a tool, then clicks/drags on the ship to apply it.
- A **Blueprint View** overlay (toggle button) shows the ideal intact state of the ship for reference.
- Selecting a tool and applying it to a valid damaged cell progresses the docket checklist.

#### 4.3 Obstacle Trial Phase
- **Camera:** Semi top-down, slightly angled (≈ 45° elevation, looking forward).
- **Control:** The player steers by clicking and dragging the ship's wheel clockwise or counter-clockwise. Ship speed is fixed per level.
- **Obstacles** emerge from the top of the screen or "flip up" from the ocean surface.
- **QTE Events:** Prompted by an icon + timed key press (e.g., Space to harpoon, E to bail water).
- **Repair Quality Modifier:** Missing or incomplete repairs reduce ship stats (hull HP reduced, sails torn = slower speed, etc.).

---

## 5. Repair Mechanics

All repairs take place in the **Shipyard Phase**. Each repair type is associated with one or more tools and targets specific voxel zones on the ship.

### 5.1 Repair Type Reference

| Repair Type | Tool Required | Affected Zone | Notes |
|-------------|--------------|---------------|-------|
| **Hull Damage (Holes)** | Hammer + Wood / Nails | Hull voxels | Core repair. Missing voxels replaced. |
| **Deck Board Repair** | Hammer + Nails | Top deck voxels | Simpler version of hull repair. |
| **Snapped Mast** | Rope + Hammer + Wood | Mast voxels | Mast must be re-anchored in correct orientation. |
| **Torn Sails** | Needle & Thread | Sail mesh cells | Sail rendered as a cloth-texture panel with rip UV offsets. |
| **Water (Flooding)** | Water Bucket | Bilge / hull base | Player must manually scoop; water volume decreases per use. |
| **Steering Alignment** | Rope / Metal Work | Rudder voxels | Mini-puzzle: drag the rudder to the correct angle indicator. |
| **Anchor Repair** | Metal Work / Rope | Anchor assembly | Reattach chain links; connect anchor voxel to the hull. |
| **Cannon / Weapons Repair** | Metal Work + Munitions | Cannon voxels | Restock ammo and fix barrel cracks. |
| **Restock (Supplies)** | Munitions Stock | Supply hold | Final checklist item before sailing; adds cannon ammo and provisions. |
| **Window Repair** | Metal Work / Wood | Cabin windows | Available on larger ships (Brigantine, Galleon). Aesthetic + bonus. |
| **Paint / Polish** | (Cosmetic tool) | Entire hull | Optional. Does not affect gameplay stats. Bonus score. |

> [!NOTE]
> **Windows:** Real tall ships (brigantines, galleons) do have stern windows and gun-port windows. Window repair is unlocked from Day 3 onward when the Brigantine is introduced.

---

## 6. Obstacle Gameplay

All obstacles appear during the **Obstacle Trial Phase**. Obstacles are assigned to a **difficulty tier** that maps to the current day.

### 6.1 Obstacle Reference

| Obstacle | Tier | Mechanic | QTE? | Notes |
|----------|------|----------|------|-------|
| **Rocks** | 1 | Static hazard; steer to avoid. | No | Randomised left/right lanes. |
| **Seaweed** | 1 | Slow debuff zone (reduced speed for 3 s). | No | Rendered as a green semi-transparent patch. |
| **Small / Rogue Waves** | 1–3 | Push ship off-course (left or right nudge). | No | Rogue waves = larger push, screen shake. |
| **Barrels** | 2 | Floating explosive; must be shot before reaching ship. | **Yes** (Shoot) | Untouched barrel detonates on contact → hull damage. |
| **Whirlpool** | 2 | Rotating pull; steer against it or take hull damage. | No | Visual: spinning vortex; pull force applied each frame. |
| **Water Spout / Lightning** | 3 | Telegraphed strike in a lane; avoid or take mast damage. | No | Telegraph: shadow / sparks 2 s before strike. |
| **Siren** | 3 | Lures ship off-course; must mash key to resist. | **Yes** (Resist) | Visual: NPC on rocks; audio stinger. |
| **Whale** | 3 | Bonus target: ram to stun, then harpoon. | **Yes** (Harpoon) | One harpoon per whale. Stun window: 2 s post-ram. Points reward. |
| **Kraken / Sea Creature** | 5 (Boss) | Multi-phase boss encounter. | **Yes** (Multi) | Day 7 final boss. Design TBD. |

### 6.2 QTE System

All QTEs share the same base system:
1. **Trigger:** Event flag raises a `QTE_EVENT` with type, window duration, and success/fail callbacks.
2. **Display:** A prompt icon + shrinking timer ring appears on screen.
3. **Input:** Player presses the indicated key within the window.
4. **Result:** Success applies the positive effect (barrel destroyed, whale stunned, etc.); failure applies the negative (damage, missed opportunity).

---

## 7. Ships & Progression

Three ship classes appear across the seven days, each larger and with more voxel cells to damage.

| Ship | Days Active | Grid Size (approx.) | New Repairs Introduced |
|------|------------|---------------------|----------------------|
| **Sloop** | 1–2 | 24×10×6 | Hull, Sail, Mast, Deck, Cannons |
| **Brigantine** | 3–5 | 40×14×8 | Water (flooding), Steering, Anchor, Windows |
| **Galleon** | 6–7 | 64×18×10 | All remaining; most damage complexity |

Each ship is defined by a **ship definition JSON** consumed by a `ShipBuilder` class that instantiates the voxel grid and maps damage zones.

---

## 8. Level Design

### Day-by-Day Breakdown

| Day | Ship | Key Mechanic Introduced | Repairs | Obstacles | Notes |
|-----|------|------------------------|---------|-----------|-------|
| **1** | Sloop | Tutorial, Blueprint View | Hull, Sail, Mast | Rocks, Seaweed, Small Waves | Guided prompts; all tools labelled. |
| **2** | Sloop | QTE system | Hull, Sail, Deck, Cannons, Restock | Rocks, Seaweed, Waves, Barrels | First QTE with barrel shooting. |
| **3** | Brigantine | New ship, weather (rain) | Hull, Sail, Mast, Water, Steering, Anchor, Restock | Rocks, Rogue Waves, Barrels, Sirens, Water Spouts | Rain reduces visibility; introduces new hull zones. |
| **4** | Brigantine | Easter Egg | TBD | TBD | Calmer weather than Day 3; hidden unlockable. |
| **5** | Brigantine | Ability reward tier-up | TBD | Whirlpool, Whale | Mid-game culmination; harder obstacle arrangement. |
| **6** | Galleon | Largest ship | All available repairs | All standard obstacles | First galleon; introduce window repair. |
| **7** | Galleon | Final Boss (Kraken) | All repairs (max damage) | All obstacles + Kraken boss | Thunderstorm weather; hardest configuration. |

> [!NOTE]
> **Day 4 Easter Egg:** Placeholder — team to design a hidden interaction (e.g., a message in a bottle found in the hold, an NPC cameo, a secret customer). Should be a low-effort delight, not a gameplay-changing mechanic.

> [!NOTE]
> **Days 4 & 5 Repairs:** Full repair lists for Days 4 and 5 are TBD pending team discussion. Follow the escalating pattern: each day should introduce at most one new repair type or increase the count of existing damage cells.

---

## 9. Toolbox & Abilities

### 9.1 Core Toolbox

Tools are unlocked progressively as new damage types are introduced.

| Tool | Unlocked | Repairs |
|------|----------|---------|
| **Hammer + Wood** | Day 1 | Hull, Mast, Deck |
| **Needle & Thread** | Day 1 | Sails |
| **Water Bucket** | Day 1 | Flooding |
| **Rope** | Day 1 | Mast (lashing), Anchor, Steering |
| **Nails / Metal Work** | Day 2 | Cannons, Windows, Anchor |
| **Munitions Stock** | Day 2 | Cannon restock, Supply hold |

### 9.2 Player Abilities (Rogue-like Rewards)

At the end of each successful day, the player selects one of three randomly offered **abilities** that persist for future runs. These are passive or active bonuses.

| Ability Type | Example |
|-------------|---------|
| **Repair Speed** | "Practiced Hand" — Hammer repairs are 25% faster. |
| **Obstacle Resilience** | "Seasoned Hull" — First hull hit per run is ignored. |
| **QTE Assistance** | "Sharp Eye" — QTE windows last 20% longer. |
| **Bonus Utility** | "Bucket Brigade" — Water Bucket bails two adjacent flooded cells per use. |

> [!NOTE]
> The ability system should be designed as a data-driven list (JSON array of ability objects) so that new abilities can be added without code changes. Each ability object: `{ id, name, description, type, applyFn }`.

---

## 10. UI / UX Considerations

### 10.1 HUD Layout (Obstacle Phase)
- **Top-left:** Hull HP bar + Sail condition indicator.
- **Top-right:** Day / level indicator.
- **Centre:** QTE prompt (only when active).
- **Bottom:** Cannon charge / ammo count (if ship has cannons).

### 10.2 Shipyard HUD
- **Left panel:** Docket Sheet — checklist with customer name, ship name, and listed faults.
- **Right panel:** Toolbox — icon grid. Selected tool is highlighted.
- **Top-right:** Blueprint View toggle button.
- **Bottom-centre:** "Set Sail" button (disabled until all mandatory docket items are checked).

### 10.3 Counter & Voxel Cat
- A shop counter is present in the dock scene with a **voxel cat** sitting on it.
- The cat has idle animations (tail flick, blinking, stretching) to add warmth.
- The cat may react to customer dialogue (perk up, look away, etc.) for charm.

### 10.4 Camera
| Phase | Camera Type | Controls |
|-------|------------|----------|
| Dock / Dialogue | Fixed cinematic shot | None |
| Shipyard | Orbit camera (Three.js OrbitControls) | Mouse drag / scroll zoom |
| Obstacle Trial | Fixed semi top-down (45°) | None (auto-scroll) |

---

## 11. Open Design Questions

These are unresolved design decisions that require team / lecturer input before implementation.

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | **Currency System** | (A) No currency — progress-gated tools. (B) Coins earned per day, spend in shop. | Start with (A). Currency adds inventory UI complexity for limited gameplay benefit in a 7-day arc. |
| 2 | **Day / Night Cycle** | (A) Fixed time of day per level. (B) Animated cycle during obstacle phase. | (A) for clarity; weather/lighting changes per day are sufficient atmosphere. |
| 3 | **Obstacle Generation** | Fixed hand-placed obstacles only, or a mix of hand-placed and procedurally generated per day? | Recommend fixed layouts for Days 1–3 for tutorialisation; introduce procedural generation from Day 4 onward. |
| 4 | **Restock Mechanic** | Is Restock always the final step? What happens if player sails without restocking? | Recommend: Restock is a mandatory docket item on days that list it. Omitting it reduces cannon ammo to 0 for the obstacle phase. |
| 5 | **Days 4 & 5 Content** | Repair lists and obstacle sets are TBD. | Team to fill in before sprint planning for Milestone 2. |
| 6 | **Wind Mechanic** | (A) No wind. (B) Wind as a direction arrow that boosts speed or costs HP. (C) Wind as a steering modifier. | (B) offers the most interesting decisions. Implement as a gentle buff/debuff. Defer to post-MVP. |
| 7 | **Easter Egg Day 4** | Unspecified. | Team brainstorm required. |
| 8 | **Rogue-like Scope** | Abilities persist across runs within a session only, or saved to localStorage? | localStorage persistence adds replay value; confirm with lecturer re: scope. |

---

## 12. Out of Scope (V1)

The following ideas from the initial brainstorm are **explicitly deferred** to a future version to keep the V1 scope manageable.

- Currency / shop economy system.
- Full day/night animated cycle.
- Wind as an active gameplay mechanic.
- Multiplayer / co-op repairs.
- Mobile touch controls (may be added if time permits).
- Paint / Polish as a scored mechanic (present as visual-only optional).
- Procedurally generated level layouts (obstacles are hand-tuned per day in V1).

---

## 13. Implementation Notes for Agents

This section is directed at coding agents implementing this project in **Three.js**.

### Architecture Overview

```
src/
├── main.js                  # Entry point, scene setup, game loop
├── core/
│   ├── GameState.js         # Enum-driven state machine (DOCK, SHIPYARD, OBSTACLE, RESULTS)
│   ├── EventBus.js          # Simple pub/sub for decoupled communication
│   └── LevelConfig.js       # JSON-driven level definitions (ships, obstacles, repairs)
├── shipyard/
│   ├── VoxelGrid.js         # 3D array; cell state management
│   ├── ShipBuilder.js       # Instantiates VoxelGrid from ship definition JSON
│   ├── ChunkRenderer.js     # Converts VoxelGrid cells to merged BufferGeometry
│   ├── DamageSystem.js      # Flood fill, damage application
│   └── RepairSystem.js      # Tool → cell interaction; validates correct tool per zone
├── obstacle/
│   ├── ObstacleManager.js   # Spawns and updates obstacles; reads LevelConfig
│   ├── QTESystem.js         # Generic QTE: trigger, prompt, timeout, result
│   ├── PlayerShip.js        # Player input, movement, HP
│   └── obstacles/           # One file per obstacle type (Rock.js, Barrel.js, etc.)
├── ui/
│   ├── DocketSheet.js       # DOM overlay; checklist binding
│   ├── Toolbox.js           # Tool selection HUD
│   ├── DialogueBox.js       # Customer dialogue
│   └── HUD.js               # Obstacle phase HUD
├── assets/
│   ├── ships/               # Ship definition JSONs
│   └── levels/              # Level config JSONs
└── utils/
    ├── MathUtils.js
    └── AudioManager.js
```

### Key Contracts

**Ship Definition JSON (example — Sloop)**
```json
{
  "id": "sloop",
  "name": "The Salty Sparrow",
  "grid": { "x": 24, "y": 10, "z": 6 },
  "zones": {
    "hull": [{ "xRange": [0, 23], "yRange": [0, 3], "zRange": [0, 5] }],
    "deck": [{ "xRange": [2, 21], "yRange": [4, 4], "zRange": [1, 4] }],
    "mast": [{ "xRange": [10, 10], "yRange": [5, 9], "zRange": [2, 3] }],
    "sail": [{ "xRange": [8, 12], "yRange": [5, 9], "zRange": [2, 3] }]
  }
}
```

**Level Config JSON (example — Day 1)**
```json
{
  "day": 1,
  "ship": "sloop",
  "weather": "sunny",
  "damage": [
    { "zone": "hull", "cells": [[2,0,2],[3,0,2],[2,1,2]], "state": "MISSING" },
    { "zone": "sail", "cells": [[9,6,2]], "state": "DAMAGED" },
    { "zone": "mast", "cells": [[10,7,2]], "state": "DAMAGED" }
  ],
  "docket": ["hull", "sail", "mast"],
  "obstacles": ["rock", "seaweed", "wave_small"],
  "rewardAbilities": ["practiced_hand", "seasoned_hull", "sharp_eye"]
}
```

**VoxelGrid Cell States**
```js
const CellState = Object.freeze({
  INTACT:   0,
  DAMAGED:  1,  // cracked texture, reduced integrity
  MISSING:  2,  // air gap — hole in hull
  FLOODED:  3,  // water volume (bilge only)
  REPAIRED: 4   // transitional state for animation
});
```

**GameState Machine**
```js
const GamePhase = Object.freeze({
  DOCK:      'DOCK',
  SHIPYARD:  'SHIPYARD',
  OBSTACLE:  'OBSTACLE',
  RESULTS:   'RESULTS'
});
```

### Rendering Approach
- Use **instanced rendering** (`THREE.InstancedMesh`) for intact voxel cells to reduce draw calls.
- Damaged / repaired cells are replaced with individual `THREE.Mesh` objects bearing distinct materials so their state can be animated independently.
- Flooded cells use a translucent blue material; water volume is tracked as a scalar per bilge zone.
- The obstacle phase background ocean is a **scrolling shader plane** — animate `uOffset` uniform each frame.

### Performance Targets
- Shipyard phase: ≤ 2 draw calls per ship chunk region (chunk size: 8×8×8 cells).
- Obstacle phase: ≤ 30 active obstacle meshes at any time; despawn off-screen obstacles immediately.
- Target: 60 fps on a mid-range laptop GPU.

---

*Document maintained by the development team. Update open questions (§11) and level content gaps (§8 Days 4–5) before Milestone 2 sprint planning.*

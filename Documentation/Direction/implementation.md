# BoatLoad: Implementation Details

This document outlines the core architecture and technical implementation of BoatLoad's features. The codebase is entirely vanilla JavaScript leveraging `THREE.js` for 3D rendering.

## Core Architecture

The game runs on a Finite State Machine managed by `GameState.js`.
Transitions between major phases (`SHIPYARD` and `OBSTACLE`) are handled smoothly by completely tearing down non-essential event listeners and meshes while retaining core assets like the `VoxelGrid`.

Communication between disconnected modules (e.g., UI buttons and the 3D game state) is managed strictly through an event bus (`EventBus.js`) to decouple the architecture.

## 1. Shipyard & Voxel Engine

### Voxel Data Structure (`VoxelGrid.js`)
Instead of keeping track of individual `THREE.Mesh` objects, the game logic relies entirely on a lightweight mathematical grid (`Uint8Array` for states, `Uint32Array` for colors).
- Dimensions are defined in `src/assets/ships/sloop.json`.
- A 1D flattened array allows for highly performant coordinate mapping and bounds checking.

### GLB Ingestion (`ShipBuilder.js`)
When loading a level, a low-poly Blender `.glb` model is ingested.
1. The `.glb` mesh is automatically scaled to precisely fit the defined bounding box of the `VoxelGrid`.
2. A raycaster is fired across the grid coordinates to detect mesh intersections.
3. UV mapping is calculated at intersection points to extract accurate colors from the model's texture atlas.
4. Extracted colors and states are written to the `VoxelGrid`.

### Voxel Rendering (`ChunkRenderer.js`)
For performance, voxels are rendered using a single `THREE.InstancedMesh`.
- `INTACT` voxels share the same geometry but are assigned unique transformation matrices and colors via the Instanced Mesh API.
- `DAMAGED` or `MISSING` voxels are handled as individual fallback meshes to allow for distinct materials and effects without breaking instancing performance.

### Base Building (`BuildSystem.js`)
The user interacts with the ship via a Fallout 4-style building menu (`BuildMenu.js`).
- A `THREE.BoxGeometry` ghost outline acts as a preview, with `depthTest: false` applied to its material to ensure visibility through existing ship geometry.
- `ShipRaycaster.js` utilizes a Bounding Volume Hierarchy (BVH) around the `.glb` mesh to provide hyper-fast surface normal calculation on mouse hover.
- Multi-voxel blueprints (like a 1x1x3 plank) are rotated via array transposition and mapped back into the `VoxelGrid` upon clicking. Intersecting meshes are allowed, forcefully overwriting `EMPTY` grid cells with `INTACT` state and assigned colors.

## 2. Sailing (Obstacle) Phase

### Phase Translation (`PlayerShip.js`)
When transitioning from the Shipyard to Sailing, the exact `ChunkRenderer.container` group that holds the instanced voxel mesh is reparented to the `PlayerShip` kinematically.
- The 24x48 unit massive voxel ship is scaled down by a factor of `0.1` and wrapped in a `THREE.Group` to accurately fit inside the 12-unit wide obstacle lanes.
- `THREE.Box3().setFromObject()` calculates dynamic bounding boxes around the player's custom voxel geometry, ensuring physics collisions perfectly match the user's base-building shape.

### Obstacle Manager (`ObstacleManager.js`)
Obstacles spawn dynamically at the top of the lanes and scroll downward along the Z-axis.
- Implements lane-based spawning (`random` vs `alternating` patterns defined in `day1.json`).
- If an obstacle intersects the dynamically scaled `PlayerShip` bounding box, the player takes damage, loses speed multipliers, and visual feedback is triggered (e.g., bouncing, console logging).

## 3. User Interface

All UI is decoupled from the 3D pipeline and rendered via DOM overlays (`index.html` + `ui.css`).
- **Build Menu:** Automatically renders interactive HTML buttons for every blueprint defined in `BLUEPRINTS`. Emits `blueprintSelected` events on click.
- **Docket Sheet:** Reads objective logic from `day1.json` and presents tasks to the player. It is currently entirely player-driven and serves as a static brief, unlocking the "Set Sail" button strictly via decoupled events.

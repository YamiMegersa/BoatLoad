# BoatLoad
Voxel-Based ship simulation game

BoatLoad is an arcade-style, voxel-based ship simulation and puzzle game where you customize, repair, and build upon a dynamically generated voxel ship, then test its mettle by sailing it through a gauntlet of obstacles.

## Features

- **Shipyard Mode:** A free-form, base-building voxel environment. You are provided with a `.glb` model that is automatically converted and scaled into a fully interactive Voxel Grid.
- **Base Building:** Use the Build Menu to select predefined blueprints (Blocks, Planks, Panels). Place them directly onto the ship with full grid-snapping, rotational support, and ghost mesh previews. 
- **Sailing Mode:** Take your newly built/repaired ship out onto the open water! The custom ship you built in the shipyard is directly transported into an obstacle avoidance trial.
- **Dynamic Obstacles:** Dodge rocks, seaweed, islands, and waves using keyboard controls. Your ship's bounding box scales dynamically to match your customizations.
- **Level Creation Kit:** Developers can use a fully-featured in-game editor to drag and drop assets from the entire 3D library, dynamically scale them, and position them in 3D space to construct new JSON levels.

## How to Play

1. Start the game to enter the **Shipyard**.
2. Select an object from the **Build Menu** on the right.
3. Hover over your ship to see the green ghost-mesh preview. Press **R** to rotate the object.
4. Left-click to place the blocks. You can patch holes, build new decks, or erect towers!
5. Once satisfied, check your **Repair Docket** and click **Set Sail!**
6. Use the **A/D** or **Left/Right Arrow** keys to dodge obstacles in the Sailing phase. If your ship's health drops to 0, it sinks!
7. Access the **Editor** mode from the main demo UI to build your own obstacle courses and export them.

## Getting Started

1. Ensure you have Node.js and npm installed.
2. Run \`npm install\` to install dependencies.
3. Run \`npm run dev\` to spin up the local Vite server.
4. Open the provided localhost link in your browser.

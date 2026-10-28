# BoatLoad Harpoon Visibility & Swivel Launcher Plan (Revised v2)

## 0. Post-Mortem of the First Attempt (Why It Failed & Must Be Redone)

The first implementation of the harpoon plan was barely noticeable and failed to solve the core problem ("there is no sign of a harpoon and the only evidence is that a shark will glow red"):

1. **No Visible Harpoon Launcher on the Ship:** The ship deck was completely bare. When a shark QTE succeeded, a tiny primitive stick materialized in mid-air above the bow with no cannon, ballista, or swivel mount to fire it from.
2. **Harpoon Froze in Mid-Air Instead of Impaling the Shark:** When `life <= 0`, `ParticleSystem.js` set `p.mesh.position.copy(p.end)` in **world space** and held it static for `0.4s` while the shark simultaneously bobbed and sank at `15 units/sec`! Worse, `p.lookAt(end)` aligned the group's origin (`0,0,0`, the center of the shaft) with `p.end`, while the spearhead was at `z = -2.85`, so the spearhead overshot the target by nearly 3 meters and floated in empty air!
3. **Shark Popped Instantly to the Surface at Launch (`t = 0`):** In `EnvironmentManager.js`, `onSuccess` immediately set `shark.mesh.visible = true` and teleported `shark.baseY` to `surfaceY + SHARK_BREACH_LIFT` *before* the harpoon even left the ship. The shark popped out of nowhere at frame 0, then waited 0.4s to turn red.
4. **Unconvincing Telegraph:** The telegraph was a pale white triangle (`0xd9efff`) with no dorsal-fin silhouette, no water ripple animation, and no target lock reticle when the QTE window opened (`< 22m`).
5. **Tether Disappeared Instantly on Impact:** As soon as the harpoon reached `p.end`, the rope tether was immediately deleted (`this._scene.remove(p.tether)`), losing the visual connection between the ship's bow and the harpooned shark during the breach/thrash moment.

---

## 1. Design Goal: A Complete, Visceral Harpoon Subsystem

Every step of a shark encounter must read clearly from the normal sailing chase camera without needing any external `.glb` assets:

1. **Prow-Mounted Swivel Harpoon Launcher (`PlayerShip.js`):**
   - The player's ship has a visible **3D Swivel Harpoon Gun / Ballista** mounted on the foredeck/bow (oak pedestal, brass swivel fork, iron barrel/rail, coiled hemp rope drum, and a **loaded barbed harpoon** sitting in the trough).
   - While sailing, when a shark enters targeting range (`< 35m`), the bow swivel launcher **automatically tracks and aims** toward the shark's position.
   - When fired (`onSuccess`), the loaded harpoon on the mount hides (it has been launched!), the barrel recoils backward with a muzzle flash, and after the shot resolves, a fresh harpoon reloads onto the mount.
2. **Readable Shark Fin Telegraph (`EnvironmentManager.js`):**
   - **Approaching (`< 35m`):** A dark-slate curved shark dorsal fin slices through the waves with a dual-ring animated whitewater wake trail (without any artificial target circle on the water).
3. **High-Visibility Harpoon Projectile & Tether (`ParticleSystem.js`):**
   - Launches from the swivel gun's exact world-space muzzle (`getHarpoonLaunchTransform()`).
   - Built with a chunky timber shaft, forged iron 4-barb head, brass collar, trailing white wind-streaks, and a taut hemp rope tether connecting the harpoon tail back to the ship's bow winch.
   - **Tip-Aligned Impact:** Geometry is offset in local space so `z = 0` is just behind the barbed spearhead—when the projectile reaches `end`, the **barbed head** is buried directly in the shark's body, not overshooting by 3 meters.
4. **True Impale & Breach Sequence:**
   - **During Flight (`0.35s–0.55s`):** The harpoon flies on a fast ballistic path toward the shark fin as the shark begins rising toward the surface.
   - **On Impact:** The harpoon **attaches to / tracks the shark** (sticking out of its back at the impact angle) while the rope tether stays taut between the ship's bow and the impaled shark for `0.55s`!
   - **Breach & Reaction:** At the exact moment of impact, the shark breaches with a `massiveSplash` and `bloodSplash`, plays `shark_hit`, triggers the red rim-glow + HUD `+points` confirmation, and drags the impaled harpoon down as it sinks.
5. **Visible Miss Feedback (`onFail`):**
   - If the player fails/misses the QTE, the swivel launcher fires a wild shot that splashes harmlessly into the waves short/wide of the fin, and the shark lunges into the hull with a visible breach splash and `15` damage.

---

## 2. External Materials Decision

**No external 3D models or audio files are needed.**
- All 3D elements (the bow swivel harpoon launcher, loaded harpoon, flying projectile, barbed head, rope tether, dorsal fin, wake rings, and target-lock reticle) are built procedurally from Three.js primitives in the game's low-poly voxel/nautical aesthetic.
- All audio (`harpoon`, `shark_hit`, `collision`) uses the existing Web Audio synth in `AudioManager.js`.

---

## 3. Sequence of Events (Beat-by-Beat)

| Beat | Distance / Trigger | Visual & Gameplay Behaviour | Authority |
|---|---|---|---|
| **0. Prow Mount Idle** | Always on `PlayerShip` | 3D Swivel Harpoon Launcher sits on the bow deck behind the bow lantern, loaded with a visible harpoon spear. | Cosmetic (`PlayerShip`) |
| **1. Fin Telegraph** | Shark `< 35m` from ship | Dark dorsal fin + pulsing V-wake rings track the shark along the wave surface (`_surfaceY`). Ship's bow launcher swivels to aim at the fin. | Cosmetic (`EnvironmentManager` + `PlayerShip`) |
| **2. QTE Target Lock** | Shark `< 22m` (`qteStart`) | Spinning crimson/gold target reticle appears around the shark's fin on the water surface while the Starboard Chronometer QTE station activates. | `QTESystem.trigger({ source: 'shark' })` |
| **3. Launch & Recoil** | `onSuccess` callback | Points & `hitPending` committed immediately. Bow launcher recoils, hides its loaded spear, and spawns the flying harpoon + taut rope tether from the launcher muzzle. Shark begins surfacing (`breachProgress`). | `onSuccess` (`EnvironmentManager`) |
| **4. Flight** | `0.35s – 0.55s` (`clamp(dist / 45, 0.35, 0.55)`) | Harpoon flies along a crisp trajectory toward the surfacing shark; live rope tether updates every frame from the ship's moving bow socket to the harpoon tail. | `ParticleSystem` |
| **5. Impale & Breach** | `onImpact` callback (with `1.0s` safety timeout) | Harpoon embeds into the shark (`phase = 'impact'`, tracking the shark's world position and sinking motion for `0.65s`). `massiveSplash`, `bloodSplash`, `shark_hit` sound, `sharkHitConfirmed`, and red rim shader fire simultaneously. | `_resolveHarpoonImpact` |
| **6. Sink & Reload** | `0.8s` flash -> sink | Shark dissolves and sinks with the harpoon still embedded; tether snaps/fades; bow launcher smoothly reloads a fresh harpoon spear. | `EnvironmentManager` & `PlayerShip` |

---

## 4. Technical Implementation Work Packages

### WP1 — Prow-Mounted 3D Swivel Harpoon Launcher (`src/obstacle/PlayerShip.js`)
1. Add `_buildHarpoonLauncher()` to `PlayerShip` (called during construction and cleaned up in `dispose()`):
   - Positions the mount on the foredeck slightly aft of the bow lantern (`_getHarpoonMountPosition()`), scaled appropriately to the vessel (`sloop`, `Skiff`, `Frigate`, `Dreadnought`).
   - Builds:
     - **Pedestal Base:** Bolted iron deck flange + sturdy oak stanchion post + coiled rope drum.
     - **Swivel Turret (`_harpoonSwivel`):** Brass U-fork that rotates horizontally (`rotation.y`) and pitches (`_harpoonPivot.rotation.x`).
     - **Launcher Barrel / Guide Trough (`_harpoonBarrel`):** Iron-banded timber rail that recoils along local `+Z` when fired.
     - **Loaded Harpoon Mesh (`_loadedHarpoonMesh`):** Visible shaft + barbed iron head resting in the launcher trough when ready to fire.
2. Add `aimHarpoonAt(worldTargetPos)`: smoothly rotates `_harpoonSwivel` and `_harpoonPivot` toward the nearest approaching shark (or returns to forward rest pose `0` when no shark is near).
3. Add `triggerHarpoonFireAnimation()`: triggers barrel recoil (`_harpoonRecoil = 1.0`), hides `_loadedHarpoonMesh` for `0.9s`, and returns `getHarpoonLaunchTransform()` from the barrel's world-space muzzle.

### WP2 — Tip-Aligned Harpoon Projectile, Live Tether & Shark Impale (`src/environment/ParticleSystem.js`)
1. Export pure helper functions for unit testing (`harpoonFlightDuration(distance)`, `interpolateHarpoonFlight(start, end, t, arcHeight)`).
2. Rebuild the harpoon geometry and group in `ParticleSystem`:
   - Offset the shaft (`CylinderGeometry`) and 4-barb iron head (`ConeGeometry` + angled `BoxGeometry` barbs) so the **spearhead penetration point sits at local `z = 0`** and the wooden shaft extends backward to `z = +4.4` (with rope ring at the tail `z = +4.4`).
   - Add a shallow ballistic arc (`arcHeight` proportional to distance) so the harpoon visibly arcs out of the launcher and plunges downward into the shark.
3. Support **Dynamic Target & Origin Tracking**:
   - Accept `{ onImpact, getOrigin, getTarget }` in `spawnHarpoon(start, end, options)`.
   - During `'flight'`, if `getTarget` is provided, update `p.end` to track the surfacing shark; if `getOrigin` is provided, update the rope tether's ship-end to stay attached to the moving ship's bow launcher!
   - On impact (`life <= 0`), transition to `phase = 'impact'` for `0.65s`: keep the harpoon embedded at `getTarget()` (moving/sinking with the shark!) and keep the tether connected for the first `0.35s` of the thrash before fading it out.

### WP3 — Shark Fin Telegraph, Target Lock Reticle & Impact Sequencing (`src/environment/EnvironmentManager.js`)
1. Upgrade `_createSharkTelegraph()`:
   - Build a realistic dark-slate **Dorsal Fin** (`ExtrudeGeometry` or sculpted low-poly fin group with raked leading edge), two concentric **Wake Foam Rings**, and a **Target Lock Reticle** (crimson/gold segmented ring with 4 inward-pointing crosshair chevrons, visible when `shark.qteActive` is true).
2. In `EnvironmentManager.update()`:
   - Track the closest shark within `38m` and call `playerShip.aimHarpoonAt(closestSharkPos)` so the ship's bow launcher visibly tracks the threat!
   - When `dist2D < 22` and QTE triggers, set `shark.qteActive = true` so the Target Lock Reticle illuminates around the fin.
3. In `onSuccess`:
   - Set `shark.qteActive = false`, `shark.hitPending = true`, `shark.surfacing = true` (smoothly rising from underwater to breach height over the harpoon's flight duration rather than teleporting on frame 0!).
   - Call `playerShip.triggerHarpoonFireAnimation()` and `getHarpoonLaunchTransform()`.
   - Emit `spawnParticles` with `type: 'harpoon'`, passing `getOrigin: () => playerShip.getHarpoonLaunchTransform().origin` and `getTarget: () => shark.mesh.position.clone().setY(this._surfaceY(shark.mesh.position) + 0.25)`.
4. In `_resolveHarpoonImpact(shark)`:
   - Reveal full breached shark (`shark.mesh.visible = true`, `shark.baseY = surfaceY + SHARK_BREACH_LIFT`), trigger `massiveSplash`, `bloodSplash`, `shark_hit` audio, `sharkHitConfirmed`, and the red fresnel rim-glow + dissolve sink sequence.

### WP4 — Unit Tests & Build Verification (`tests/harpoon-effect.test.js`)
1. Test `harpoonFlightDuration`, `interpolateHarpoonFlight` ballistic arc & endpoints, and impact callback single-fire guarantees.
2. Verify `npm test` and `npm run build` succeed cleanly.

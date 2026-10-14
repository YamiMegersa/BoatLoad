# Weather Shader System Documentation

This document outlines the technical implementation and variables for the weather and atmosphere effects in the environment, utilizing Three.js. The system comprises custom GLSL shaders, CPU-side instance manipulation, and native Three.js fog integration.

## 1. Rain System (`RainManager.js`)

The rain effect is implemented entirely on the GPU using a `THREE.ShaderMaterial` and `THREE.InstancedMesh` to simulate thousands of raindrops efficiently without CPU overhead.

### Technical Implementation
* **Geometry:** Uses a low-resolution `THREE.CylinderGeometry` (3 segments) to represent rain streaks.
* **Infinite Volume:** The vertex shader calculates a bounding box (`uBoxSize`) centered around the camera. Rain instances continuously wrap around this box via a modulo operation, providing the illusion of infinite rain while only rendering a fixed number of instances.
* **Velocity Alignment:** The vertex shader dynamically skews the top and bottom vertices of the cylinders so that the physical streak aligns perfectly with the wind velocity vector.

### Shader Uniforms (Variables)
| Variable | Type | Description |
| :--- | :--- | :--- |
| `uTime` | `float` | Elapsed time, used to calculate continuous displacement. |
| `uWindDirection` | `vec3` | The normalized direction the rain falls in. Scaled by `windDir.x * 1.0` and `windDir.z * 1.0` to slant naturally with the wind. |
| `uSpeed` | `float` | Base falling speed of the rain streaks (Default: `40.0`). |
| `uBoxSize` | `vec3` | The dimensions of the wrapping volume (Default: `200x100x200`). |

## 2. Wind Particles (`WindParticles.js`)

The wind system simulates voxel-style "sweeping" particles (like Minecraft explosion flakes) being driven horizontally by the local wind forces.

### Technical Implementation
* **Geometry:** Uses `THREE.PlaneGeometry` with `side: THREE.DoubleSide` to create flat, 2D particles that tumble through the air.
* **CPU Simulation:** Unlike rain, wind particles are updated on the CPU per-frame because they must sample localized wind forces (`windManager.getWindAt(x, z)`) which vary across the map.
* **Lifecycle & Fading:** Each particle has a randomized lifespan. As it approaches birth/death, the particle fades in and out smoothly via `THREE.AdditiveBlending`. Fading is achieved efficiently by manipulating the `instanceColor` RGB channels rather than individual material opacities.

### System Variables
| Variable | Description |
| :--- | :--- |
| `speed` | Base speed multiplier for the wind particles (Default: `40`). |
| `lifespans` | `Float32Array` tracking remaining life (in seconds) for each instance. |
| `maxLifespans` | `Float32Array` tracking the total lifespan of each instance to calculate fade progress (Range: 0.5 - 2.0s). |
| `playRadius` | The bounding distance before instances are manually wrapped/respawned. |

## 3. Fog & Atmosphere

The fog system is a hybrid approach combining built-in Three.js depth fog with custom volumetric spheres.

### Scene Fog (`EnvironmentManager.js`)
* **Standard Fog:** Uses `THREE.FogExp2` for exponential depth-based fading.
* **Dense Fog Toggle:** Toggles the density between `0.006` (standard) and `0.05` (dense / Silent Hill style).
* **Void Synchronization:** When Dense Fog is enabled, `scene.background` is synchronized to exactly match `scene.fog.color`. This prevents transparent/distant objects (like storm clouds) from showing up as dark splotches or silhouettes against a mismatched skybox.

### Custom Shader Support
For custom materials (like `Ocean.js` and `StormClouds.js`) to respect the global scene fog, specific GLSL chunks are injected:
1. `<fog_pars_vertex>` and `<fog_pars_fragment>` (setup).
2. `<fog_vertex>` and `<fog_fragment>` (execution).
3. **Requirement:** The vertex shader must explicitly declare `vec4 mvPosition` before the fog chunk, as it is a strict dependency for the Three.js depth calculation.

### Volumetric Fog (`FogVolume.js`)
* Provides localized, noise-based ambient fog using 3D Simplex noise. 
* Disabled automatically during Dense Fog to prevent the heavy noise alpha from causing dark, splotchy rendering artifacts against the dense background.

import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { emit }           from '../core/EventBus.js';
import { FishAnimator }    from './FishAnimator.js';
import { WindParticles }   from './WindParticles.js';
import { RainManager }     from './RainManager.js';
import { FogVolume }       from './FogVolume.js';
import { StormClouds }     from './StormClouds.js';

const TIME_STOPS = [
  { time: 0,  sun: 0x111122, amb: 0x050511, sky: 0x020511, fog: 0x020511 }, // Midnight
  { time: 5,  sun: 0x223355, amb: 0x112233, sky: 0x112233, fog: 0x112233 }, // Pre-dawn
  { time: 7,  sun: 0xffaa55, amb: 0x443333, sky: 0xcc5533, fog: 0xcc5533 }, // Dawn
  { time: 10, sun: 0xfff5e0, amb: 0x8899aa, sky: 0x5588cc, fog: 0x5588cc }, // Morning
  { time: 12, sun: 0xffffee, amb: 0x99aabb, sky: 0x6699ff, fog: 0x6699ff }, // Noon
  { time: 16, sun: 0xfff5e0, amb: 0x8899aa, sky: 0x5588cc, fog: 0x5588cc }, // Afternoon
  { time: 18, sun: 0xff8844, amb: 0x554444, sky: 0xcc4422, fog: 0xcc4422 }, // Sunset
  { time: 20, sun: 0x223355, amb: 0x112233, sky: 0x112233, fog: 0x112233 }, // Dusk
  { time: 24, sun: 0x111122, amb: 0x050511, sky: 0x020511, fog: 0x020511 }, // Midnight
];

// Sharks patrol fully hidden underwater (the ocean is 85% opaque, so a submerged
// shark otherwise shows as a ghostly silhouette with its dorsal fin visible).
// They only appear when harpooned, breaching the surface. Set to false to make
// patrolling sharks visible through the water again.
const HIDE_SHARKS_UNTIL_HIT = true;
// How far the shark's origin sits above the water surface while breached.
const SHARK_BREACH_LIFT = 0.9;

const STORM_COLORS = {
  sun: 0x445566,
  amb: 0x223344,
  sky: 0x222222,
  fog: 0x222222,
};

export class EnvironmentManager {
  constructor() {
    this._scene      = null;
    this._fishModels = null;
    this._sharks     = [];
    this.qteSystem   = null;
    this._ocean      = null;
    this._windParticles = null;
    this._rainManager = null;
    this._fogVolume = null;
    this._stormClouds = null;
    this._isDenseFog = false;

    this._timeOfDay = 8.0; // Default
    this._timeSpeed = 0.0; // Static time
    this._isStormy = false;
    this._ambientLight = null;
    this._sunLight = null;
    this._moonLight = null;
    this._sunRadius = 60;
    this._godRaysEnabled = true;
  }

  /**
   * @param {THREE.Scene} scene
   * @param {object[]}    fishModels  - Array of GLTF objects from LevelConfig
   * @param {object}      levelCfg    - The level configuration
   * @param {object}      [qteSystem] - QTESystem instance
   * @param {object}      [ocean]     - Ocean instance (used to find the live water height)
   */
  init(scene, fishModels, levelCfg, qteSystem, ocean) {
    this._scene      = scene;
    this._fishModels = fishModels;
    this.qteSystem   = qteSystem;
    this._ocean      = ocean ?? null;
    this._sharks     = [];
    this._ambientLight = scene.children.find(c => c.isAmbientLight || c.isHemisphereLight);
    this._sunLight = scene.getObjectByName('sunLight') || scene.children.find(c => c.isDirectionalLight && c.name !== 'moonLight');
    this._moonLight = scene.getObjectByName('moonLight');

    if (!this._moonLight) {
      this._moonLight = new THREE.DirectionalLight(0x9bc0f5, 0.35);
      this._moonLight.name = 'moonLight';
      this._moonLight.position.set(-10, -20, -10);
      this._moonLight.castShadow = true;
      scene.add(this._moonLight);
    }

    
    const initialDensity = levelCfg && levelCfg.fogDensity !== undefined ? levelCfg.fogDensity : 0.006;
    
    // Enable true depth-based fog to obscure objects like islands and the ship
    scene.fog = new THREE.FogExp2(0x1a2430, initialDensity);
    
    if (initialDensity >= 0.05) {
      this._isDenseFog = true;
    } else {
      this._isDenseFog = false;
    }
    
    this._timeOfDay = levelCfg && levelCfg.timeOfDay !== undefined ? levelCfg.timeOfDay : 8.0;
    this._isStormy = levelCfg && levelCfg.isStormy !== undefined ? levelCfg.isStormy : false;
    if (levelCfg && levelCfg.godRays !== undefined) {
      this._godRaysEnabled = !!levelCfg.godRays;
    }
    
    this._updateTimeAndLighting(0);
    this.toggleStorm(this._isStormy);

    this._windParticles = new WindParticles(scene);
    this._rainManager = new RainManager(scene);
    this._fogVolume = new FogVolume(scene);
    this._stormClouds = new StormClouds(scene);

    if (this._fishModels && this._fishModels.length > 0) {
      // Find shark model if available and guarantee at least 4 sharks spawn
      const sharkModel = this._fishModels.find(m => m.url && m.url.toLowerCase().includes('shark'));
      if (sharkModel) {
        for (let s = 0; s < 4; s++) {
          this._spawnShark(sharkModel);
        }
      }

      for (let i = 0; i < 15; i++) {
        // 30% chance to spawn a school of 3-5 fish
        if (Math.random() < 0.3) {
          const schoolSize = 3 + Math.floor(Math.random() * 3);
          const baseX = (Math.random() - 0.5) * 400; // 200 radius
          const baseY = -4 - Math.random() * 4;
          const baseZ = (Math.random() - 0.5) * 400;
          const baseYaw = Math.random() * Math.PI * 2;
          const fishModel = this._fishModels[Math.floor(Math.random() * this._fishModels.length)];
          
          for(let j = 0; j < schoolSize; j++) {
            this._spawnShark(
              fishModel, 
              baseX + (Math.random() - 0.5) * 4, 
              baseY + (Math.random() - 0.5) * 2, 
              baseZ + (Math.random() - 0.5) * 4, 
              baseYaw + (Math.random() - 0.5) * 0.4
            );
          }
        } else {
          this._spawnShark();
        }
      }
    }
  }

  _spawnShark(model = null, px = null, py = null, pz = null, yaw = null) {
    const fishModel = model || this._fishModels[Math.floor(Math.random() * this._fishModels.length)];
    if (!fishModel) return;

    const isShark = Boolean(fishModel.url && fishModel.url.toLowerCase().includes('shark'));

    // Clone the scene (preserves hierarchy but bones become plain Object3Ds)
    const mesh = SkeletonUtils.clone(fishModel.scene);

    // Place + orient randomly around the play area, or use provided school base
    const x = px !== null ? px : (Math.random() - 0.5) * 400;
    const y = py !== null ? py : (isShark ? -3.0 : -4 - Math.random() * 4);
    const z = pz !== null ? pz : (Math.random() - 0.5) * 400;
    const ry = yaw !== null ? yaw : Math.random() * Math.PI * 2;
    
    mesh.position.set(x, y, z);
    mesh.rotation.set((Math.random() - 0.5) * 0.1, ry, 0);

    // Apply the pre-computed normalisation scale with slight random variation
    // Only scale down (0.4 to 1.0 of the base scale)
    const baseScale = fishModel.normSharkScale * (0.4 + Math.random() * 0.6);
    mesh.scale.setScalar(baseScale);

    mesh.traverse(c => {
      if (c.isMesh || c.isSkinnedMesh) {
        c.castShadow    = true;
        c.receiveShadow = true;
        c.frustumCulled = false; // prevent pop-in when bones push verts out of rest AABB
      }
    });

    if (isShark && HIDE_SHARKS_UNTIL_HIT) mesh.visible = false;

    this._scene.add(mesh);

    const speed     = 2.0 + Math.random() * 2.5;
    const animator  = new FishAnimator(mesh, 0.8 + Math.random() * 0.4);

    this._sharks.push({
      mesh,
      animator,
      speed,
      baseY:   mesh.position.y,
      baseYaw: mesh.rotation.y,
      baseScale: baseScale,
      qteTriggered: false,
      shrinking: false,
      hitPending: false,
      hitDelay: 0,
      flashing: false,
      flashTimer: 0,
      sinking: false,
      isShark: isShark
    });
  }

  update(delta, windManager, shipOrPlayer) {
    if (this._windParticles) {
      this._windParticles.update(delta, windManager);
    }

    const playerShip = shipOrPlayer?.mesh ? shipOrPlayer : null;
    const shipPos = playerShip ? playerShip.mesh.position : (shipOrPlayer instanceof THREE.Vector3 ? shipOrPlayer : null);

    if (!this._tempWind) this._tempWind = new THREE.Vector3();
    const localWind = shipPos ? windManager.getWindAt(shipPos.x, shipPos.z, this._tempWind) : new THREE.Vector3(0, 0, -1);
    if (this._rainManager) this._rainManager.update(delta, shipPos, localWind);
    if (this._fogVolume) this._fogVolume.update(delta, shipPos, localWind);
    if (this._stormClouds) this._stormClouds.update(delta, shipPos, localWind);

    const toRemove = [];

    for (const shark of this._sharks) {
      shark.animator.update(delta);

      // Handle QTE hit sequence
      if (shark.hitPending) {
        shark.hitDelay -= delta;
        if (shark.hitDelay <= 0) {
          shark.hitPending = false;
          shark.flashing = true;
          shark.flashTimer = 0.8;

          // Breach at the real water surface (waves move it between about -1.5 and 0.5)
          shark.mesh.visible = true;
          shark.baseY = this._surfaceY(shark.mesh.position) + SHARK_BREACH_LIFT;

          // Trigger particles
          emit('spawnParticles', { type: 'massiveSplash', position: shark.mesh.position.clone() });
          emit('spawnParticles', { type: 'bloodSplash', position: shark.mesh.position.clone() });

          // Change material to bright red glow
          shark.mesh.traverse(c => {
            if ((c.isMesh || c.isSkinnedMesh) && c.material) {
              if (!c.userData.hasClonedMaterial) {
                c.material = c.material.clone();
                c.userData.hasClonedMaterial = true;
              }
              c.userData.originalEmissive = c.material.emissive ? c.material.emissive.clone() : new THREE.Color(0x000000);
              c.userData.originalEmissiveIntensity = c.material.emissiveIntensity ?? 1.0;
              c.material.emissive = new THREE.Color(0xff0000);
              c.material.emissiveIntensity = 3.0;
              c.material.color.setHex(0xff2200);
              // The ocean is a transparent material, so it is drawn after every opaque
              // object and washes a shark out to ~15%. Making the shark transparent too
              // puts it in the same list, and renderOrder 10 draws it after the ocean
              // (renderOrder 0). Depth testing still hides the part below the surface.
              c.material.transparent = true;
              c.material.depthWrite = true;
              c.material.depthTest = true;
              c.renderOrder = 10;
            }
          });
        }
      } else if (shark.flashing) {
        shark.baseY = this._surfaceY(shark.mesh.position) + SHARK_BREACH_LIFT;
        shark.flashTimer -= delta;
        if (shark.flashTimer <= 0) {
          shark.flashing = false;
          shark.sinking = true;
        }
      } else if (shark.sinking) {
        shark.baseY -= 15.0 * delta; // Sink rapidly
        shark.mesh.position.y = shark.baseY + shark.animator.bobOffset;
        if (shark.baseY <= -15) {
          toRemove.push(shark);
        }
        continue; // skip other updates while sinking
      }

      if (shark.shrinking) {
        const currentScale = shark.mesh.scale.x;
        const newScale = Math.max(0, currentScale - 5.0 * delta); // Shrink rapidly
        shark.mesh.scale.setScalar(newScale);
        if (newScale <= 0) {
          toRemove.push(shark);
        }
        continue; // skip other updates while shrinking
      }

      // Shark AI & QTE interaction
      if (playerShip && shark.isShark && !shark.hitPending && !shark.flashing && !shark.sinking) {
        const dx = shark.mesh.position.x - playerShip.mesh.position.x;
        const dz = shark.mesh.position.z - playerShip.mesh.position.z;
        const dist2D = Math.sqrt(dx * dx + dz * dz);

        // Turn towards ship if within 50 units
        if (dist2D < 50 && dist2D > 5) {
          const targetYaw = Math.atan2(-dx, -dz);
          let diff = targetYaw - shark.baseYaw;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          shark.baseYaw += diff * Math.min(1.0, 1.2 * delta);
        }

        // Trigger HARPOON QTE if within 22 units
        if (dist2D < 22 && !shark.qteTriggered && this.qteSystem) {
          const success = this.qteSystem.trigger({
            type: 'HARPOON',
            onSuccess: (timing = {}) => {
              shark.hitPending = true;
              shark.hitDelay = 0.3; // Matches harpoon travel time

              emit('spawnParticles', {
                type: 'harpoon',
                start: playerShip.mesh.position.clone(),
                end: shark.mesh.position.clone()
              });
              emit('playSound', { sound: 'collision' });
            },
            onFail: () => {
              console.log('[Shark] Harpoon missed! Shark attacks the ship.');
              if (typeof playerShip.takeDamage === 'function') {
                playerShip.takeDamage(15, 'shark');
              }
              emit('spawnParticles', { type: 'massiveSplash', position: shark.mesh.position.clone() });
              emit('playSound', { sound: 'collision' });
            }
          });

          if (success) {
            shark.qteTriggered = true;
          }
        }
      }

      // Apply the bob offset from the animator on top of the fixed baseY
      shark.mesh.position.y = shark.baseY + shark.animator.bobOffset;
      shark.mesh.rotation.y = shark.baseYaw + shark.animator.yawOffset;

      // Swim forward (hold position while being harpooned so it stays where the spear lands)
      if (!shark.hitPending && !shark.flashing) {
        shark.mesh.translateZ(shark.speed * delta);
      }

      // Wrap around the play area (200 radius = -200 to 200)
      const p = shark.mesh.position;
      let wrapped = false;
      if (p.z >  200) { p.z -= 400; wrapped = true; }
      if (p.z < -200) { p.z += 400; wrapped = true; }
      if (p.x >  200) { p.x -= 400; wrapped = true; }
      if (p.x < -200) { p.x += 400; wrapped = true; }

      if (wrapped) {
        shark.qteTriggered = false;
      }
    }

    for (const shark of toRemove) {
      this._scene?.remove(shark.mesh);
      const idx = this._sharks.indexOf(shark);
      if (idx !== -1) {
        this._sharks.splice(idx, 1);

        // Respawn to maintain population
        if (playerShip) {
          const spawnZ = playerShip.mesh.position.z + (Math.random() < 0.5 ? 60 : -60);
          const spawnX = playerShip.mesh.position.x + (Math.random() - 0.5) * 80;
          this._spawnShark(null, spawnX, null, spawnZ);
        } else {
          this._spawnShark();
        }
      }
    }

    this._updateTimeAndLighting(delta);
  }

  /** Live world-space water height at a position (falls back to the flat level). */
  _surfaceY(pos) {
    return this._ocean ? this._ocean.getWaveInfo(pos.x, pos.z).height : -0.5;
  }

  _updateTimeAndLighting(delta) {
    this._timeOfDay = (this._timeOfDay + delta * this._timeSpeed) % 24;

    let prev = TIME_STOPS[0];
    let next = TIME_STOPS[TIME_STOPS.length - 1];
    for (let i = 0; i < TIME_STOPS.length - 1; i++) {
      if (this._timeOfDay >= TIME_STOPS[i].time && this._timeOfDay < TIME_STOPS[i+1].time) {
        prev = TIME_STOPS[i];
        next = TIME_STOPS[i+1];
        break;
      }
    }
    
    const t = (this._timeOfDay - prev.time) / (next.time - prev.time);

    const cSun = new THREE.Color(prev.sun).lerp(new THREE.Color(next.sun), t);
    const cAmb = new THREE.Color(prev.amb).lerp(new THREE.Color(next.amb), t);
    const cSky = new THREE.Color(prev.sky).lerp(new THREE.Color(next.sky), t);
    const cFog = new THREE.Color(prev.fog).lerp(new THREE.Color(next.fog), t);

    if (this._isStormy) {
      cSun.lerp(new THREE.Color(STORM_COLORS.sun), 0.8);
      cAmb.lerp(new THREE.Color(STORM_COLORS.amb), 0.8);
      cSky.lerp(new THREE.Color(STORM_COLORS.sky), 0.8);
      cFog.lerp(new THREE.Color(STORM_COLORS.fog), 0.8);
    }

    // Celestial trajectories:
    // Sun rises at 6h, peaks at 12h, sets at 18h
    const sunTheta = ((this._timeOfDay - 6) / 12) * Math.PI; 
    const sunX = Math.cos(sunTheta) * this._sunRadius;
    const sunY = Math.sin(sunTheta) * this._sunRadius;
    const sunZ = Math.sin(sunTheta) * 20;

    // Moon is 180 degrees in orbital opposition (rises at 18h, peaks at 24/0h, sets at 6h)
    const moonTheta = sunTheta + Math.PI;
    const moonX = Math.cos(moonTheta) * this._sunRadius;
    const moonY = Math.sin(moonTheta) * this._sunRadius;
    const moonZ = Math.sin(moonTheta) * 20;

    // Night factor: 0.0 at full daytime, ramps smoothly to 1.0 when sun sets
    const nightFactor = THREE.MathUtils.clamp((this._sunRadius * 0.1 - sunY) / (this._sunRadius * 0.7), 0.0, 1.0);
    const moonAltitude = THREE.MathUtils.clamp((moonY + 5) / (this._sunRadius + 5), 0.0, 1.0);

    if (this._sunLight) {
      this._sunLight.color.copy(cSun);
      this._sunLight.position.set(sunX, sunY, sunZ);
      const sunAlt = THREE.MathUtils.clamp((sunY + 5) / (this._sunRadius + 5), 0.0, 1.0);
      this._sunLight.intensity = sunAlt * (this._isStormy ? 0.3 : 1.2);
    }

    if (this._moonLight) {
      this._moonLight.position.set(moonX, moonY, moonZ);
      const moonCol = new THREE.Color(0x9bc0f5).lerp(new THREE.Color(0xc2daf8), moonAltitude);
      if (this._isStormy) {
        moonCol.lerp(new THREE.Color(0x334455), 0.75);
      }
      this._moonLight.color.copy(moonCol);
      this._moonLight.intensity = moonAltitude * (this._isStormy ? 0.12 : 0.35);
    }

    if (this._ambientLight) {
      const nightAmb = new THREE.Color(0x0e172a);
      const blendedAmb = cAmb.clone().lerp(nightAmb, nightFactor * 0.6);
      this._ambientLight.color.copy(blendedAmb);
    }

    if (this._scene) {
      if (this._scene.fog) {
        this._scene.fog.color.copy(cFog);
      }
      if (!this._isDenseFog) {
         this._scene.background = cSky;
      }

      // Update Sky Shader uniforms
      const skyMesh = this._scene.getObjectByName('skyMesh');
      if (skyMesh && skyMesh.material && skyMesh.material.uniforms) {
        const u = skyMesh.material.uniforms;
        if (u.uSunDir) u.uSunDir.value.set(sunX, sunY, sunZ).normalize();
        if (u.uMoonDir) u.uMoonDir.value.set(moonX, moonY, moonZ).normalize();
        if (u.uNightFactor) u.uNightFactor.value = nightFactor;
        if (u.uMoonColor) u.uMoonColor.value.set(0x9bc0f5);
        if (u.uSunColor) u.uSunColor.value.copy(cSun);
      }
    }

    // Update Ocean specular highlight direction
    if (this._ocean && this._ocean.mesh && this._ocean.mesh.material && this._ocean.mesh.material.uniforms) {
      const ou = this._ocean.mesh.material.uniforms;
      if (ou.uSunDir) {
        if (nightFactor > 0.5) {
          ou.uSunDir.value.set(moonX, moonY, moonZ).normalize();
        } else {
          ou.uSunDir.value.set(sunX, sunY, sunZ).normalize();
        }
      }
    }
  }

  toggleStorm(forceState) {
    if (forceState !== undefined) {
      this._isStormy = forceState;
    } else {
      this._isStormy = !this._isStormy;
    }

    if (this._rainManager) {
      this._rainManager.setIntensity(this._isStormy ? 1.0 : 0.0);
    }
    
    // You could also toggle storm clouds visibility or intensity here
    if (this._stormClouds && this._stormClouds.mesh) {
       this._stormClouds.mesh.visible = this._isStormy;
    }

    return this._isStormy;
  }

  toggleTimeSpeed() {
     if (this._timeSpeed > 5.0) {
       this._timeSpeed = 0.0;
     } else if (this._timeSpeed > 0.0) {
       this._timeSpeed = 10.0; // Fast forward
     } else {
       this._timeSpeed = 1.0; // Play
     }
     return this._timeSpeed;
  }

  toggleDenseFog(forceState) {
    if (forceState !== undefined) {
      this._isDenseFog = forceState;
    } else {
      this._isDenseFog = !this._isDenseFog;
    }
    
    if (this._scene && this._scene.fog) {
      // 0.05 is very dense, simulating Silent Hill style limited visibility
      this._scene.fog.density = this._isDenseFog ? 0.05 : 0.006;
      this._scene.background = this._isDenseFog ? this._scene.fog.color : new THREE.Color(0x222233);
    }
    
    if (this._fogVolume && this._fogVolume.mesh) {
      this._fogVolume.mesh.visible = !this._isDenseFog;
    }
    
    if (this._stormClouds && this._stormClouds.mesh) {
      this._stormClouds.mesh.visible = !this._isDenseFog && this._isStormy;
    }
    
    return this._isDenseFog;
  }

  toggleGodRays(forceState) {
    if (forceState !== undefined) {
      this._godRaysEnabled = forceState;
    } else {
      this._godRaysEnabled = !this._godRaysEnabled;
    }
    emit('editorToggleGodRays', { enabled: this._godRaysEnabled });
    return this._godRaysEnabled;
  }

  dispose() {
    this._ocean = null;
    for (const shark of this._sharks) {
      this._scene?.remove(shark.mesh);
    }
    this._sharks = [];

    if (this._windParticles) {
      this._windParticles.dispose();
      this._windParticles = null;
    }
    if (this._rainManager) { this._rainManager.dispose(); this._rainManager = null; }
    if (this._fogVolume) { this._fogVolume.dispose(); this._fogVolume = null; }
    if (this._stormClouds) { this._stormClouds.dispose(); this._stormClouds = null; }
    if (this._scene) { this._scene.fog = null; }
  }
}

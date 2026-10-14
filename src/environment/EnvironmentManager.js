import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
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
    this._sunRadius = 60;
  }

  /**
   * @param {THREE.Scene} scene
   * @param {object[]}    fishModels  - Array of GLTF objects from LevelConfig
   * @param {object}      levelCfg    - The level configuration
   */
  init(scene, fishModels, levelCfg) {
    this._scene      = scene;
    this._fishModels = fishModels;
    this._sharks     = [];
    this._ambientLight = scene.children.find(c => c.isAmbientLight);
    this._sunLight = scene.children.find(c => c.isDirectionalLight);

    
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
    
    this._updateTimeAndLighting(0);
    this.toggleStorm(this._isStormy);

    this._windParticles = new WindParticles(scene);
    this._rainManager = new RainManager(scene);
    this._fogVolume = new FogVolume(scene);
    this._stormClouds = new StormClouds(scene);

    if (this._fishModels && this._fishModels.length > 0) {
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
    // Clone the scene (preserves hierarchy but bones become plain Object3Ds)
    const mesh = SkeletonUtils.clone(fishModel.scene);

    // Place + orient randomly around the play area, or use provided school base
    const x = px !== null ? px : (Math.random() - 0.5) * 400;
    const y = py !== null ? py : -4 - Math.random() * 4;
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

    this._scene.add(mesh);

    const speed     = 2.0 + Math.random() * 2.5;
    const animator  = new FishAnimator(mesh, 0.8 + Math.random() * 0.4);

    this._sharks.push({
      mesh,
      animator,
      speed,
      baseY:   mesh.position.y,
      baseYaw: mesh.rotation.y,
    });
  }

  update(delta, windManager, shipPos) {
    if (this._windParticles) {
      this._windParticles.update(delta, windManager);
    }

    if (!this._tempWind) this._tempWind = new THREE.Vector3();
    const localWind = shipPos ? windManager.getWindAt(shipPos.x, shipPos.z, this._tempWind) : new THREE.Vector3(0, 0, -1);
    if (this._rainManager) this._rainManager.update(delta, shipPos, localWind);
    if (this._fogVolume) this._fogVolume.update(delta, shipPos, localWind);
    if (this._stormClouds) this._stormClouds.update(delta, shipPos, localWind);

    for (const shark of this._sharks) {
      shark.animator.update(delta);

      // Apply the bob offset from the animator on top of the fixed baseY
      shark.mesh.position.y = shark.baseY + shark.animator.bobOffset;
      shark.mesh.rotation.y = shark.baseYaw + shark.animator.yawOffset;

      // Swim forward
      shark.mesh.translateZ(shark.speed * delta);

      // Wrap around the play area (200 radius = -200 to 200)
      const p = shark.mesh.position;
      if (p.z >  200) p.z -= 400;
      if (p.z < -200) p.z += 400;
      if (p.x >  200) p.x -= 400;
      if (p.x < -200) p.x += 400;
    }

    this._updateTimeAndLighting(delta);
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

    if (this._sunLight) {
      this._sunLight.color.copy(cSun);
      const theta = ((this._timeOfDay - 6) / 12) * Math.PI; 
      this._sunLight.position.set(
        Math.cos(theta) * this._sunRadius,
        Math.sin(theta) * this._sunRadius,
        Math.sin(theta) * 20
      );
    }

    if (this._ambientLight) {
      this._ambientLight.color.copy(cAmb);
    }

    if (this._scene) {
      if (this._scene.fog) {
        this._scene.fog.color.copy(cFog);
      }
      if (!this._isDenseFog) {
         this._scene.background = cSky;
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

  dispose() {
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

import * as THREE from 'three';

export class WeatherSystem {
  constructor() {
    this.weatherConfigs = null;
    this.currentWeather = null;
  }

  async loadLevel(dayNum, sceneEntities) {
    try {
      if (!this.weatherConfigs) {
        const res = await fetch('/src/assets/levels/weather.json');
        this.weatherConfigs = await res.json();
      }
      const levelRes = await fetch(`/src/assets/levels/day${dayNum}.json`);
      const levelData = await levelRes.json();
      
      const weatherState = this.weatherConfigs[levelData.weather];
      if (weatherState) {
        this.applyWeather(weatherState, sceneEntities);
      }
      return { levelData, weatherState };
    } catch (err) {
      console.error("Failed to load level " + dayNum, err);
      return null;
    }
  }

  applyWeather(w, { ambient, sun, ocean, sky, lanternLight }) {
    this.currentWeather = w;

    if (ambient) {
      ambient.color.set(w.ambientSky);
      ambient.groundColor.set(w.ambientGround);
      ambient.intensity = w.ambientIntensity;
    }
    
    if (sun) {
      sun.color.set(w.sunColor);
      sun.intensity = w.sunIntensity;
      const sunDir = new THREE.Vector3(w.sunDir.x, w.sunDir.y, w.sunDir.z).normalize();
      sun.position.copy(sunDir).multiplyScalar(28);
      
      // Update sunDir uniform in ocean and sky
      if (ocean && ocean.mesh) {
        ocean.mesh.material.uniforms.uSunDir.value.copy(sunDir);
      }
      if (sky && sky.mesh) {
        sky.mesh.material.uniforms.uSunDir.value.copy(sunDir);
      }
    }
    
    if (sky && sky.mesh) {
      sky.mesh.material.uniforms.uTop.value.set(w.skyTop);
      sky.mesh.material.uniforms.uHorizon.value.set(w.skyHorizon);
      sky.mesh.material.uniforms.uSunColor.value.set(w.sunColor);
    }
    
    if (ocean && ocean.mesh) {
      ocean.mesh.material.uniforms.uDeep.value.set(w.seaDeep);
      ocean.mesh.material.uniforms.uShallow.value.set(w.seaShallow);
      ocean.waveScale = w.waveScale;
      ocean.waveSpeed = w.waveSpeed;
    }

    if (lanternLight) {
      lanternLight.color.set(w.lanternColor);
      lanternLight.intensity = w.lanternIntensity;
    }
  }
}

import * as THREE from 'three';

export class WeatherSystem {
  constructor() {
    this.weatherConfigs = null;
    this.currentWeather = null;
    this.rainMesh = null;
    this.lightningTimer = 0;
    this.lightningFlash = 0;
    this.sun = null;
    this.ambient = null;
    this.sky = null;
    this.weatherName = null;
  }

  update(delta) {
    if (this.rainMesh && this.rainMesh.visible) {
      this.rainMesh.material.uniforms.uTime.value += delta;
      
      if (this.weatherName === 'gale') {
        this.rainMesh.material.uniforms.uSpeed.value = 80.0;
      } else {
        this.rainMesh.material.uniforms.uSpeed.value = 45.0;
      }
    }

    if (this.weatherName === 'gale') {
      this.lightningTimer -= delta;
      if (this.lightningTimer <= 0) {
        this.lightningFlash = 1.0;
        this.lightningTimer = 2.0 + Math.random() * 6.0;
      }
      if (this.lightningFlash > 0) {
        this.lightningFlash -= delta * 4.0;
        if (this.lightningFlash < 0) this.lightningFlash = 0;
        
        if (this.sun && this.currentWeather) {
          this.sun.intensity = this.currentWeather.sunIntensity + this.lightningFlash * 6.0;
          if (this.lightningFlash > 0) {
            this.sun.color.setHex(0xffffff);
          } else {
            this.sun.color.set(this.currentWeather.sunColor);
          }
        }
        if (this.ambient && this.currentWeather) {
          this.ambient.intensity = this.currentWeather.ambientIntensity + this.lightningFlash * 2.0;
          if (this.lightningFlash > 0) {
            this.ambient.color.setHex(0xddeeff);
          } else {
            this.ambient.color.set(this.currentWeather.ambientSky);
          }
        }
        if (this.sky && this.sky.mesh && this.currentWeather) {
          const uSunColor = this.sky.mesh.material.uniforms.uSunColor.value;
          if (this.lightningFlash > 0) {
            uSunColor.setHex(0xffffff);
          } else {
            uSunColor.set(this.currentWeather.sunColor);
          }
        }
      }
    } else {
      if (this.lightningFlash > 0) {
        this.lightningFlash = 0;
        if (this.sun && this.currentWeather) {
          this.sun.intensity = this.currentWeather.sunIntensity;
          this.sun.color.set(this.currentWeather.sunColor);
        }
        if (this.ambient && this.currentWeather) {
          this.ambient.intensity = this.currentWeather.ambientIntensity;
          this.ambient.color.set(this.currentWeather.ambientSky);
        }
        if (this.sky && this.sky.mesh && this.currentWeather) {
          this.sky.mesh.material.uniforms.uSunColor.value.set(this.currentWeather.sunColor);
        }
      }
    }
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
        this.applyWeather(weatherState, sceneEntities, levelData.weather);
      }
      return { levelData, weatherState };
    } catch (err) {
      console.error("Failed to load level " + dayNum, err);
      return null;
    }
  }

  applyWeather(w, { ambient, sun, ocean, sky, lanternLight, scene }, weatherName) {
    this.currentWeather = w;
    this.sun = sun;
    this.ambient = ambient;
    this.sky = sky;
    this.weatherName = weatherName;

    if (scene) {
      if (weatherName === 'foggy') {
        scene.fog = new THREE.FogExp2(w.ambientSky, 0.04);
      } else if (weatherName === 'stormy' || weatherName === 'gale') {
        scene.fog = new THREE.FogExp2(w.ambientSky, 0.015);
      } else {
        scene.fog = null;
      }
      
      const isRaining = (weatherName === 'stormy' || weatherName === 'gale');
      if (isRaining) {
        if (!this.rainMesh) {
          const rainCount = 15000;
          const geom = new THREE.BufferGeometry();
          const pos = new Float32Array(rainCount * 3);
          for(let i=0; i<rainCount; i++) {
            pos[i*3] = (Math.random() - 0.5) * 120;
            pos[i*3+1] = Math.random() * 100;
            pos[i*3+2] = (Math.random() - 0.5) * 120;
          }
          geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          
          const mat = new THREE.ShaderMaterial({
            uniforms: {
              uTime: { value: 0 },
              uColor: { value: new THREE.Color(0x8899aa) },
              uSpeed: { value: 45.0 }
            },
            vertexShader: `
              uniform float uTime;
              uniform float uSpeed;
              void main() {
                vec3 p = position;
                float fall = mod(p.y - uTime * uSpeed, 100.0);
                p.y = fall - 10.0; 
                p.x += p.y * 0.15; 
                vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                gl_PointSize = (40.0 / -mvPosition.z);
              }
            `,
            fragmentShader: `
              uniform vec3 uColor;
              void main() {
                vec2 uv = gl_PointCoord - vec2(0.5);
                if (abs(uv.x) > 0.1 || abs(uv.y) > 0.4) discard;
                gl_FragColor = vec4(uColor, 0.7);
              }
            `,
            transparent: true,
            depthWrite: false
          });
          this.rainMesh = new THREE.Points(geom, mat);
          scene.add(this.rainMesh);
        }
        this.rainMesh.visible = true;
        this.rainMesh.material.uniforms.uColor.value.set(w.sunColor);
      } else {
        if (this.rainMesh) this.rainMesh.visible = false;
      }
    }

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

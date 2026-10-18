import * as THREE from 'three';

const WAKE_SAMPLE_COUNT = 5;
const WAKE_SAMPLE_INTERVAL = 0.12;
const WAKE_SAMPLE_LIFETIME = WAKE_SAMPLE_COUNT * WAKE_SAMPLE_INTERVAL;
const WAKE_MIN_SPEED = 0.75;

export class Ocean {
  constructor() {
    this.mesh = null;
    this._time = 0;
    this._waveScale = 1.0;
    this._waveSpeed = 1.0;
    this._enableBreakwater = false;
    this._wakePositions = Array.from(
      { length: WAKE_SAMPLE_COUNT },
      () => new THREE.Vector4(0, 0, 0, WAKE_SAMPLE_LIFETIME + 1)
    );
    this._wakeDirections = Array.from(
      { length: WAKE_SAMPLE_COUNT },
      () => new THREE.Vector4(0, 0, 0, 0)
    );
    this._wakeSampleAccumulator = 0;
    this._wakeSampleCount = 0;
  }

  init(scene) {
    // 128x128 grid (16k vertices instead of 66k) provides smooth wave curves with 75% less vertex overhead
    const oceanGeo = new THREE.PlaneGeometry(600, 600, 128, 128);
    oceanGeo.rotateX(-Math.PI / 2);

    const seaColor = 0x4a6f78;
    const seaDeepColor = 0x1c343d;
    const sunDir = new THREE.Vector3(10, 20, 10).normalize();

    const oceanMat = new THREE.ShaderMaterial({
      transparent: true,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib['fog'],
        {
          uTime: { value: 0 },
          uWaveScale: { value: this._waveScale },
          uWaveSpeed: { value: this._waveSpeed },
          uEnableBreakwater: { value: this._enableBreakwater },
          uRadius: { value: 200.0 },
          uShallow: { value: new THREE.Color(seaColor) },
          uDeep: { value: new THREE.Color(seaDeepColor) },
          uSunDir: { value: sunDir },
          uWakePositions: { value: this._wakePositions },
          uWakeDirections: { value: this._wakeDirections },
          uWakeCount: { value: this._wakeSampleCount }
        }
      ]),
      vertexShader: `
        #include <fog_pars_vertex>
        uniform float uTime, uWaveScale, uWaveSpeed;
        uniform bool uEnableBreakwater;
        uniform vec4 uWakePositions[${WAKE_SAMPLE_COUNT}];
        uniform vec4 uWakeDirections[${WAKE_SAMPLE_COUNT}];
        uniform float uWakeCount;
        varying float vHeight;
        varying float vWake;
        varying vec3 vNormalW;
        varying vec3 vWorldPos;

        float getWake(vec2 p) {
          float wake = 0.0;
          for (int i = 0; i < ${WAKE_SAMPLE_COUNT}; i++) {
            if (float(i) >= uWakeCount) break;
            vec4 samplePosition = uWakePositions[i];
            vec4 sampleDirection = uWakeDirections[i];

            vec2 direction = normalize(sampleDirection.xy);
            vec2 fromShip = p - samplePosition.xy;
            float behind = -dot(fromShip, direction);
            float wakeLength = 1.5 + samplePosition.z * 0.42;
            if (behind <= 0.0 || behind >= wakeLength) continue;

            float side = abs(fromShip.x * direction.y - fromShip.y * direction.x);
            float width = 0.45 + behind * 0.08;
            float across = 1.0 - smoothstep(width * 0.45, width * 1.4, side);
            float along = smoothstep(0.1, 0.7, behind) * (1.0 - smoothstep(wakeLength * 0.72, wakeLength, behind));
            float fade = 1.0 - smoothstep(${(WAKE_SAMPLE_LIFETIME * 0.55).toFixed(2)}, ${WAKE_SAMPLE_LIFETIME.toFixed(2)}, samplePosition.w);
            float strength = across * along * fade * clamp(samplePosition.z / 12.0, 0.0, 1.0);
            wake = max(wake, strength);
          }
          return wake;
        }

        // Distance field to prevent waves clipping through the dock and island
        float getMask(vec2 p) {
          if (!uEnableBreakwater) return 1.0;

          // Dock approx bounding box (x: -9 to 9, z: -5 to 5)
          vec2 dDock = max(abs(p - vec2(0.0, 0.0)) - vec2(10.0, 6.0), 0.0);
          float distDock = length(dDock);

          // Island + Shipyard + West Dock bounding box (world x: -96 to -8, z: -30 to 30)
          vec2 dIsland = max(abs(p - vec2(-52.0, 0.0)) - vec2(44.0, 30.0), 0.0);
          float distIsland = length(dIsland);

          float dist = min(distDock, distIsland);
          
          // Smoothly ramp wave height from 0 (at shoreline) to 1 (open water)
          return smoothstep(0.0, 8.0, dist);
        }

        float baseWaveHeight(vec2 p) {
          float t = uTime * uWaveSpeed;
          float rawWave = (
            sin(p.x * 0.25 + t * 0.9) * 0.35
          + sin(p.y * 0.35 - t * 1.3) * 0.25
          + sin((p.x + p.y) * 0.15 + t * 0.5) * 0.4
          );
          return uWaveScale * rawWave * getMask(p);
        }

        void main() {
          vec3 p = position;
          float wake = getWake(p.xz);
          float t = uTime * uWaveSpeed;
          float h = baseWaveHeight(p.xz) + sin(p.x * 2.4 + p.z * 1.7 - t * 4.0) * wake * 0.12;
          p.y += h;
          
          vHeight = h;
          vWake = wake;
          vWorldPos = p;

          float eps = 0.6;
          float hX = baseWaveHeight(p.xz + vec2(eps, 0.0));
          float hZ = baseWaveHeight(p.xz + vec2(0.0, eps));
          vec3 tangentX = normalize(vec3(eps, hX - h, 0.0));
          vec3 tangentZ = normalize(vec3(0.0, hZ - h, eps));
          vNormalW = normalize(cross(tangentZ, tangentX));

          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;

          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <fog_pars_fragment>
        uniform float uTime, uWaveScale;
        uniform vec3 uShallow, uDeep, uSunDir;
        uniform float uRadius;
        
        varying float vHeight;
        varying float vWake;
        varying vec3 vNormalW;
        varying vec3 vWorldPos;

        // 2D Hash function
        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
        }
        
        // Simple value noise
        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                       mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }

        void main() {
          // High-frequency surface bump texture
          float bump = noise(vWorldPos.xz * 6.0 + uTime * 0.5) * 0.15;
          vec3 n = normalize(vNormalW + vec3(bump, 0.0, bump));

          // Base color mixing based on normalized height
          float normH = vHeight / max(uWaveScale, 0.001);
          float t = clamp(normH * 0.5 + 0.5, 0.0, 1.0);
          vec3 base = mix(uDeep, uShallow, t);

          // Specular highlight
          float spec = pow(max(dot(n, normalize(uSunDir)), 0.0), 60.0);
          vec3 col = base + vec3(1.0, 0.95, 0.8) * spec * 0.8;

          // Froth / Foam at wave peaks
          float foamNoise = noise(vWorldPos.xz * 3.0 - uTime * 0.8);
          float foamAmount = smoothstep(0.3, 0.8, normH + foamNoise * 0.4);
          
          vec3 foamColor = vec3(0.95, 0.98, 1.0);
          col = mix(col, foamColor, foamAmount * 0.8);
          float wakeFoam = smoothstep(0.52, 0.9, noise(vWorldPos.xz * 2.8 - uTime * 0.7) + vWake * 0.65) * vWake;
          col = mix(col, vec3(0.78, 0.9, 0.94), vWake * 0.34);
          col = mix(col, foamColor, wakeFoam * 0.4);

          float dist = length(vWorldPos.xz);
          float fadeStart = uRadius + 20.0;
          if (dist > fadeStart) {
             col = mix(col, vec3(0.02, 0.05, 0.1), clamp((dist - fadeStart) / 20.0, 0.0, 0.8));
          }
          
          float alpha = mix(0.85, 0.94, vWake);
          gl_FragColor = vec4(col, alpha); // Water stays translucent so fish remain visible
          
          #include <fog_fragment>
        }
      `
    });

    oceanMat.uniforms.uWakePositions.value = this._wakePositions;
    oceanMat.uniforms.uWakeDirections.value = this._wakeDirections;
    this.mesh = new THREE.Mesh(oceanGeo, oceanMat);
    this.mesh.position.y = -0.5; 
    scene.add(this.mesh);
  }

  set breakwaterEnabled(val) {
    this._enableBreakwater = val;
    if (this.mesh) this.mesh.material.uniforms.uEnableBreakwater.value = val;
  }

  set waveScale(val) {
    this._waveScale = val;
    if (this.mesh) this.mesh.material.uniforms.uWaveScale.value = val;
  }

  set waveSpeed(val) {
    this._waveSpeed = val;
    if (this.mesh) this.mesh.material.uniforms.uWaveSpeed.value = val;
  }

  update(delta) {
    this._time += delta;
    if (this.mesh) {
      this.mesh.material.uniforms.uTime.value = this._time;
    }
    for (const position of this._wakePositions) {
      position.w += delta;
    }
    while (
      this._wakeSampleCount > 0 &&
      this._wakePositions[this._wakeSampleCount - 1].w > WAKE_SAMPLE_LIFETIME
    ) {
      this._wakeSampleCount--;
    }
    if (this.mesh) this.mesh.material.uniforms.uWakeCount.value = this._wakeSampleCount;
  }

  updateShipWake(position, velocity, delta) {
    if (!position || !velocity || delta <= 0) return;

    const speed = Math.hypot(velocity.x, velocity.z);
    if (speed < WAKE_MIN_SPEED) {
      this._wakeSampleAccumulator = 0;
      return;
    }

    this._wakeSampleAccumulator += delta;
    if (this._wakeSampleAccumulator < WAKE_SAMPLE_INTERVAL - 1e-6) return;
    this._wakeSampleAccumulator %= WAKE_SAMPLE_INTERVAL;

    for (let i = WAKE_SAMPLE_COUNT - 1; i > 0; i--) {
      this._wakePositions[i].copy(this._wakePositions[i - 1]);
      this._wakeDirections[i].copy(this._wakeDirections[i - 1]);
    }
    this._wakePositions[0].set(position.x, position.z, speed, 0);
    this._wakeDirections[0].set(velocity.x / speed, velocity.z / speed, 0, 0);
    this._wakeSampleCount = Math.min(this._wakeSampleCount + 1, WAKE_SAMPLE_COUNT);
    if (this.mesh) this.mesh.material.uniforms.uWakeCount.value = this._wakeSampleCount;
  }

  clearWake() {
    for (const position of this._wakePositions) {
      position.w = WAKE_SAMPLE_LIFETIME + 1;
    }
    this._wakeSampleAccumulator = 0;
    this._wakeSampleCount = 0;
    if (this.mesh) this.mesh.material.uniforms.uWakeCount.value = 0;
  }

  setWorldSize(radius) {
    if (!this.mesh) return;
    
    // Scale size proportionally to radius, base is 600 size for 200 radius (3x)
    const size = Math.max(600, radius * 3.0);
    const segments = Math.floor(size / (600 / 256));
    
    const newGeo = new THREE.PlaneGeometry(size, size, segments, segments);
    newGeo.rotateX(-Math.PI / 2);
    
    this.mesh.geometry.dispose();
    this.mesh.geometry = newGeo;
    
    if (this.mesh.material.uniforms.uRadius) {
      this.mesh.material.uniforms.uRadius.value = radius;
    }
  }

  /**
   * Evaluates the wave formula at a given world coordinate.
   * Returns the exact height and the surface normal.
   */
  getWaveInfo(x, z) {
    const t = this._time * this._waveSpeed;
    const rawWave = Math.sin(x * 0.25 + t * 0.9) * 0.35
            + Math.sin(z * 0.35 - t * 1.3) * 0.25
            + Math.sin((x + z) * 0.15 + t * 0.5) * 0.4;
            
    let mask = 1.0;
    if (this._enableBreakwater) {
        const dX = Math.max(Math.abs(x) - 10.0, 0.0);
        const dZ = Math.max(Math.abs(z) - 6.0, 0.0);
        const distDock = Math.sqrt(dX * dX + dZ * dZ);
        const dIX = Math.max(Math.abs(x - (-52.0)) - 44.0, 0.0);
        const dIZ = Math.max(Math.abs(z) - 30.0, 0.0);
        const distIsland = Math.sqrt(dIX * dIX + dIZ * dIZ);
        const dist = Math.min(distDock, distIsland);
        const st = Math.max(0.0, Math.min(dist / 8.0, 1.0));
        mask = st * st * (3.0 - 2.0 * st);
    }
    
    const h = this._waveScale * rawWave * mask;
    
    // approximate normal via small finite difference
    const eps = 0.6;
    
    const hX = this._waveScale * (
               Math.sin((x + eps) * 0.25 + t * 0.9) * 0.35
             + Math.sin(z * 0.35 - t * 1.3) * 0.25
             + Math.sin((x + eps + z) * 0.15 + t * 0.5) * 0.4) * mask;
             
    const hZ = this._waveScale * (
               Math.sin(x * 0.25 + t * 0.9) * 0.35
             + Math.sin((z + eps) * 0.35 - t * 1.3) * 0.25
             + Math.sin((x + z + eps) * 0.15 + t * 0.5) * 0.4) * mask;

    const tangentX = new THREE.Vector3(eps, hX - h, 0).normalize();
    const tangentZ = new THREE.Vector3(0, hZ - h, eps).normalize();
    const normal = new THREE.Vector3().crossVectors(tangentZ, tangentX).normalize();
    
    return { height: h - 0.5, normal };
  }

  dispose(scene) {
    if (this.mesh) {
      scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
    }
    this.clearWake();
  }
}

import * as THREE from 'three';

const noiseShader = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) { 
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 = v - i + dot(i, C.xxx) ;
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy; 
  vec3 x3 = x0 - D.yyy;      
  i = mod289(i); 
  vec4 p = permute( permute( permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
  float n_ = 0.142857142857; 
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
}
`;

/**
 * StormClouds / DynamicClouds — Real-time procedural cloud layer with dynamic weather states.
 *
 * Smoothly blends between fair-weather sunny cumulus clouds (ivory/warm, distinct fluffy banks)
 * and turbulent gale/storm clouds (dark slate/charcoal, high density, sheet lightning flashes).
 */
export class StormClouds {
  constructor(scene) {
    this._scene = scene;
    this.mesh = null;
    this._time = 0;
    
    // Dynamic Weather State: 0.0 = calm/fair sunny clouds, 1.0 = heavy gale/storm clouds
    this.stormFactor = 0.0;
    this.targetStormFactor = 0.0;
    
    // Lightning logic (active during storms)
    this.lightningIntensity = 0;
    this.lightningTimer = 0;
    
    this._init();
  }

  _init() {
    // Large ceiling plane covering visible horizon with segments for vaulted canopy curvature
    const geometry = new THREE.PlaneGeometry(2400, 2400, 48, 48);
    geometry.rotateX(-Math.PI / 2);
    
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib['fog'],
        {
          uTime: { value: 0 },
          uStormFactor: { value: 0.0 },
          uWindDirection: { value: new THREE.Vector3(0, 0, -1) },
          uPanOffset: { value: new THREE.Vector2(0, 0) },
          uLightningIntensity: { value: 0 },
          uLightningPos: { value: new THREE.Vector2(0, 0) },
          uCameraFar: { value: 350.0 },
          uHorizonColor: { value: new THREE.Color(0xe0cfa4) },
          uSkyColor: { value: new THREE.Color(0x8cb1d1) }
        }
      ]),
      vertexShader: `
        #include <fog_pars_vertex>
        varying vec3 vWorldPosition;
        uniform float uCameraFar;
        
        void main() {
          vec3 pos = position;
          float hozDist = length(pos.xz);
          
          // Vaulted atmospheric canopy curvature:
          // Curvature begins around 28% of camera far plane and gently dips down towards horizon
          float curveStart = max(uCameraFar * 0.28, 40.0);
          float curveEnd = max(uCameraFar * 0.85, curveStart + 40.0);
          float curveNorm = smoothstep(curveStart, curveEnd, hozDist);
          pos.y -= pow(curveNorm, 2.0) * 16.0;

          vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
          vWorldPosition = worldPosition.xyz;
          
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <fog_pars_fragment>
        varying vec3 vWorldPosition;
        uniform float uTime;
        uniform float uStormFactor;
        uniform vec3 uWindDirection;
        uniform float uCameraFar;
        uniform vec3 uHorizonColor;
        uniform vec3 uSkyColor;
        
        uniform float uLightningIntensity;
        uniform vec2 uLightningPos;
        uniform vec2 uPanOffset;
        
        ${noiseShader}
        
        void main() {
          // Animated multi-octave noise (remains fixed in world space as camera moves)
          vec3 noisePos = vec3(vWorldPosition.x + uPanOffset.x, uTime * 1.4, vWorldPosition.z + uPanOffset.y) * 0.0035;
          
          float n = snoise(noisePos) * 0.5 + 0.5;
          n += snoise(noisePos * 2.0) * 0.25;
          n += snoise(noisePos * 4.0) * 0.125;
          n += snoise(noisePos * 8.0) * 0.0625;
          
          float storm = clamp(uStormFactor, 0.0, 1.0);
          
          // --- Dynamic Distance Decay (regardless of draw distance) ---
          // Calculate horizontal distance from camera to fragment
          float hozDist = length(vWorldPosition.xz - cameraPosition.xz);
          float deltaY = max(5.0, abs(vWorldPosition.y - cameraPosition.y));
          
          // The maximum horizontal distance before hitting the camera's far clipping plane
          float maxHozDist = sqrt(max(100.0, uCameraFar * uCameraFar - deltaY * deltaY));
          
          // Normalized horizontal distance relative to far plane boundary (0.0 overhead, 1.0 at far plane)
          float normHozDist = clamp(hozDist / max(maxHozDist, 1.0), 0.0, 1.5);
          float edgeDist = normHozDist;
          
          // Distance-based density erosion:
          // Far clouds naturally erode into wispy, scattered puffs rather than a harsh cut
          float erosion = smoothstep(0.25, 0.78, edgeDist) * 0.26;
          
          // Density profile:
          // In calm weather: fluffy distinct cumulus clouds (smoothstep 0.35 to 0.70)
          // In storm weather: heavy overcast rolling cloud banks (smoothstep 0.16 to 0.60)
          float calmDensity = smoothstep(0.35 + erosion, 0.70 + erosion * 0.4, n);
          float stormDensity = smoothstep(0.16 + erosion, 0.60 + erosion * 0.4, n);
          float density = mix(calmDensity, stormDensity, storm);
          
          // Calm cloud colors: Sunlit ivory tops with soft slate-blue ambient underside
          vec3 calmTop = vec3(0.98, 0.98, 1.0);
          vec3 calmBelly = vec3(0.72, 0.78, 0.88);
          vec3 calmColor = mix(calmBelly, calmTop, smoothstep(0.3, 0.75, n));
          
          // Storm cloud colors: Dark ominous charcoal/slate with deep blue underbelly
          vec3 stormTop = vec3(0.12, 0.14, 0.20);
          vec3 stormBelly = vec3(0.04, 0.05, 0.08);
          vec3 stormColor = mix(stormBelly, stormTop, smoothstep(0.2, 0.8, n));
          
          vec3 cloudColor = mix(calmColor, stormColor, storm);
          
          // Atmospheric Perspective / Horizon Haze Blending:
          // As clouds approach the horizon, they smoothly absorb the horizon sky color (e.g. golden sunset)
          float hazeFactor = smoothstep(0.20, 0.78, edgeDist);
          vec3 atmoHaze = mix(uHorizonColor, vec3(0.08, 0.10, 0.14), storm * 0.70);
          cloudColor = mix(cloudColor, atmoHaze, hazeFactor * 0.65);
          
          // Lightning strike & atmospheric sheet glow (only during storms)
          if (storm > 0.1 && uLightningIntensity > 0.01) {
            float distToLightning = length(vWorldPosition.xz - uLightningPos);
            float lightningGlow = exp(-distToLightning * 0.0022) * uLightningIntensity * storm;
            vec3 lightningColor = vec3(0.88, 0.94, 1.0);
            cloudColor = mix(cloudColor, lightningColor, clamp(lightningGlow, 0.0, 0.95));
          }
          
          // Base opacity based on density:
          float baseAlpha = density * (0.95 + storm * 0.55);
          
          // Graceful decay curve:
          // Full opacity up to 28% of far-plane distance, smoothly decaying to 0.0 by 82% of far-plane distance.
          // This guarantees opacity is strictly 0.0 well BEFORE reaching camera.far (1.0),
          // preventing any harsh clipping line at ANY draw distance!
          float decay = 1.0 - smoothstep(0.28, 0.82, edgeDist);
          float alpha = clamp(baseAlpha * (decay * decay), 0.0, 1.0);
          
          // Discard virtually invisible fragments for performance
          if (alpha < 0.003) discard;
          
          gl_FragColor = vec4(cloudColor, alpha);
          
          // Atmospheric scene fog integration
          #ifdef USE_FOG
            #ifdef FOG_EXP2
              float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
            #else
              float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
            #endif
            float cloudFog = clamp(fogFactor * 0.45, 0.0, 0.85);
            gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, cloudFog );
            gl_FragColor.a *= (1.0 - fogFactor * 0.80);
            if (gl_FragColor.a < 0.003) discard;
          #endif
        }
      `
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.y = 70.0; // Comfortably below 100-radius sky dome & well within camera far plane
    this.mesh.visible = true;    // Always render dynamic clouds
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -900;
    this.mesh.userData.noGodRays = true;
    this.mesh.userData.noOcclusion = true;
    
    // Automatically center cloud plane on camera world position and sync uniforms
    this.mesh.onBeforeRender = (renderer, scene, camera) => {
      if (camera?.position) {
        this.mesh.position.x = camera.position.x;
        this.mesh.position.z = camera.position.z;
      }
      
      if (camera?.far && this.mesh.material.uniforms.uCameraFar) {
        this.mesh.material.uniforms.uCameraFar.value = camera.far;
      }

      // Synchronize with scene lighting / sky / horizon
      const skyMesh = scene?.getObjectByName?.('skyMesh');
      if (skyMesh?.material?.uniforms?.uHorizon?.value) {
        this.mesh.material.uniforms.uHorizonColor.value.copy(skyMesh.material.uniforms.uHorizon.value);
      } else if (scene?.fog?.color) {
        this.mesh.material.uniforms.uHorizonColor.value.copy(scene.fog.color);
      } else if (scene?.background instanceof THREE.Color) {
        this.mesh.material.uniforms.uHorizonColor.value.copy(scene.background);
      }

      if (skyMesh?.material?.uniforms?.uTop?.value) {
        this.mesh.material.uniforms.uSkyColor.value.copy(skyMesh.material.uniforms.uTop.value);
      }
    };
    
    this._scene.add(this.mesh);
  }

  setTargetStorm(factor) {
    this.targetStormFactor = Math.max(0.0, Math.min(1.0, factor));
  }

  setStormFactor(factor) {
    this.stormFactor = Math.max(0.0, Math.min(1.0, factor));
    this.targetStormFactor = this.stormFactor;
    if (this.mesh?.material?.uniforms?.uStormFactor) {
      this.mesh.material.uniforms.uStormFactor.value = this.stormFactor;
    }
  }

  update(delta, shipPosition, windDir = null) {
    if (!this.mesh || !this.mesh.visible) return;
    this._time += delta;
    
    // Smoothly transition storm factor
    if (Math.abs(this.stormFactor - this.targetStormFactor) > 0.001) {
      this.stormFactor = THREE.MathUtils.lerp(this.stormFactor, this.targetStormFactor, Math.min(1.0, delta * 1.5));
      this.mesh.material.uniforms.uStormFactor.value = this.stormFactor;
    }
    
    // Lightning only active when stormFactor is significant
    if (this.stormFactor > 0.25) {
      if (this.lightningIntensity > 0) {
        this.lightningIntensity -= delta * 2.2;
        if (this.lightningIntensity < 0) this.lightningIntensity = 0;
      }
      
      this.lightningTimer -= delta;
      if (this.lightningTimer <= 0) {
        this.lightningIntensity = (1.2 + Math.random() * 0.8) * this.stormFactor;
        const lx = shipPosition ? shipPosition.x + (Math.random() - 0.5) * 600 : 0;
        const lz = shipPosition ? shipPosition.z + (Math.random() - 0.5) * 600 : 0;
        
        if (this.mesh) {
          this.mesh.material.uniforms.uLightningPos.value.set(lx, lz);
        }
        
        // Random lightning strike intervals
        this.lightningTimer = 1.2 + Math.random() * 3.0;
      }
    } else {
      this.lightningIntensity = 0;
    }

    if (this.mesh) {
      const activeWind = windDir || new THREE.Vector3(0, 0, -1);
      if (!this._panOffset) this._panOffset = new THREE.Vector2();
      
      // Wind speed scales slightly with storm intensity
      const windSpeed = 4.0 + this.stormFactor * 6.0;
      this._panOffset.x += activeWind.x * delta * windSpeed;
      this._panOffset.y += activeWind.z * delta * windSpeed;
      
      this._panOffset.x = this._panOffset.x % 100000;
      this._panOffset.y = this._panOffset.y % 100000;

      this.mesh.material.uniforms.uTime.value = this._time;
      this.mesh.material.uniforms.uWindDirection.value.copy(activeWind);
      
      if (!this.mesh.material.uniforms.uPanOffset) {
        this.mesh.material.uniforms.uPanOffset = { value: new THREE.Vector2() };
      }
      this.mesh.material.uniforms.uPanOffset.value.copy(this._panOffset);
      this.mesh.material.uniforms.uLightningIntensity.value = this.lightningIntensity;
    }
  }

  dispose() {
    if (this.mesh) {
      this._scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
    }
  }
}

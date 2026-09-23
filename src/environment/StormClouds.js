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

export class StormClouds {
  constructor(scene) {
    this._scene = scene;
    this.mesh = null;
    this._time = 0;
    
    // For lightning logic
    this.lightningIntensity = 0;
    this.lightningTimer = 0;
    
    this._init();
  }

  _init() {
    // Huge plane acting as the sky dome ceiling
    const geometry = new THREE.PlaneGeometry(2000, 2000);
    geometry.rotateX(-Math.PI / 2);
    
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib['fog'],
        {
          uTime: { value: 0 },
          uWindDirection: { value: new THREE.Vector3(0, 0, -1) },
          uLightningIntensity: { value: 0 },
          uLightningPos: { value: new THREE.Vector2(0, 0) }
        }
      ]),
      vertexShader: `
        #include <fog_pars_vertex>
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <fog_pars_fragment>
        varying vec3 vWorldPosition;
        uniform float uTime;
        uniform vec3 uWindDirection;
        
        uniform float uLightningIntensity;
        uniform vec2 uLightningPos;
        
        ${noiseShader}
        
        void main() {
          // Pan UVs via wind and add time for boiling effect (the y component of snoise)
          vec2 pan = uWindDirection.xz * uTime * 5.0;
          vec3 noisePos = vec3(vWorldPosition.x + pan.x, uTime * 2.0, vWorldPosition.z + pan.y) * 0.005;
          
          float n = snoise(noisePos) * 0.5 + 0.5;
          n += snoise(noisePos * 2.0) * 0.25;
          n += snoise(noisePos * 4.0) * 0.125;
          n += snoise(noisePos * 8.0) * 0.0625;
          
          // Smoothstep to create distinct cloud shapes with gaps. Lower thresholds = denser clouds
          float density = smoothstep(0.1, 0.6, n);
          
          // Base cloud color (Very dark stormy grey)
          vec3 cloudColor = vec3(0.05, 0.08, 0.12);
          
          // Lightning effect
          float distToLightning = length(vWorldPosition.xz - uLightningPos);
          float lightningGlow = exp(-distToLightning * 0.002) * uLightningIntensity; // Larger glow radius
          
          // Mix lightning color (bright white-blue) into the cloud based on density and glow
          vec3 lightningColor = vec3(0.9, 0.95, 1.0);
          cloudColor = mix(cloudColor, lightningColor, lightningGlow); // Apply glow even in less dense areas
          
          // Alpha is determined by density, fully opaque in thick parts
          float alpha = clamp(density * 1.5, 0.0, 1.0);
          
          gl_FragColor = vec4(cloudColor, alpha);
          
          #include <fog_fragment>
        }
      `
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.y = 150; // High in the sky
    this._scene.add(this.mesh);
  }

  update(delta, shipPosition, windDir) {
    this._time += delta;
    
    // Handle lightning decay
    if (this.lightningIntensity > 0) {
      // Rapid decay for a quick flash
      this.lightningIntensity -= delta * 2.0; // Slower decay for longer flashes
      if (this.lightningIntensity < 0) this.lightningIntensity = 0;
    }
    
    // Random lightning strikes
    this.lightningTimer -= delta;
    if (this.lightningTimer <= 0) {
      // Strike!
      this.lightningIntensity = 1.5; // Brighter initial flash
      // Random position near the ship
      const lx = shipPosition ? shipPosition.x + (Math.random() - 0.5) * 600 : 0;
      const lz = shipPosition ? shipPosition.z + (Math.random() - 0.5) * 600 : 0;
      
      if (this.mesh) {
        this.mesh.material.uniforms.uLightningPos.value.set(lx, lz);
      }
      
      // Reset timer (e.g. every 1 to 3 seconds for active storm)
      this.lightningTimer = 1.0 + Math.random() * 2.0;
    }

    if (this.mesh) {
      this.mesh.material.uniforms.uTime.value = this._time;
      this.mesh.material.uniforms.uWindDirection.value.copy(windDir);
      this.mesh.material.uniforms.uLightningIntensity.value = this.lightningIntensity;
      
      if (shipPosition) {
        // Center plane on ship so we never run out of clouds
        this.mesh.position.x = shipPosition.x;
        this.mesh.position.z = shipPosition.z;
      }
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

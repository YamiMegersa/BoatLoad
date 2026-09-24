import * as THREE from 'three';

export class Ocean {
  constructor() {
    this.mesh = null;
    this._time = 0;
  }

  init(scene) {
    const oceanGeo = new THREE.PlaneGeometry(600, 600, 256, 256);
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
          uRadius: { value: 200.0 },
          uShallow: { value: new THREE.Color(seaColor) },
          uDeep: { value: new THREE.Color(seaDeepColor) },
          uSunDir: { value: sunDir }
        }
      ]),
      vertexShader: `
        #include <fog_pars_vertex>
        uniform float uTime;
        varying float vHeight;
        varying vec3 vNormalW;
        varying vec2 vPosXZ;

        float waveHeight(vec2 p) {
          return sin(p.x * 0.25 + uTime * 0.9) * 0.35
               + sin(p.y * 0.35 - uTime * 1.3) * 0.25
               + sin((p.x + p.y) * 0.15 + uTime * 0.5) * 0.4;
        }

        void main() {
          vec3 p = position;
          float h = waveHeight(p.xz);
          p.y += h;
          vHeight = h;
          vPosXZ = p.xz;

          float eps = 0.6;
          float hX = waveHeight(p.xz + vec2(eps, 0.0));
          float hZ = waveHeight(p.xz + vec2(0.0, eps));
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
        varying float vHeight;
        varying vec3 vNormalW;
        varying vec2 vPosXZ;
        uniform vec3 uShallow, uDeep, uSunDir;
        uniform float uRadius;
        
        void main() {
          float t = clamp(vHeight * 0.5 + 0.5, 0.0, 1.0);
          vec3 base = mix(uDeep, uShallow, t);
          float spec = pow(max(dot(normalize(vNormalW), normalize(uSunDir)), 0.0), 40.0);
          vec3 col = base + vec3(1.0, 0.95, 0.8) * spec * 0.6;
          
          
          float dist = length(vPosXZ);
          float fadeStart = uRadius + 20.0;
          if (dist > fadeStart) {
             col = mix(col, vec3(0.02, 0.05, 0.1), clamp((dist - fadeStart) / 20.0, 0.0, 0.8));
          }
          
          gl_FragColor = vec4(col, 0.85); // 0.85 alpha for transparency so fish are visible
          
          #include <fog_fragment>
        }
      `
    });

    this.mesh = new THREE.Mesh(oceanGeo, oceanMat);
    // Lower it slightly so it sits right under the boat rather than intersecting it heavily
    this.mesh.position.y = -0.5; 
    scene.add(this.mesh);
  }

  update(delta) {
    this._time += delta;
    if (this.mesh) {
      this.mesh.material.uniforms.uTime.value = this._time;
    }
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
    const t = this._time;
    const h = Math.sin(x * 0.25 + t * 0.9) * 0.35
            + Math.sin(z * 0.35 - t * 1.3) * 0.25
            + Math.sin((x + z) * 0.15 + t * 0.5) * 0.4;
    
    // approximate normal via small finite difference
    const eps = 0.6;
    const hX = Math.sin((x + eps) * 0.25 + t * 0.9) * 0.35
             + Math.sin(z * 0.35 - t * 1.3) * 0.25
             + Math.sin((x + eps + z) * 0.15 + t * 0.5) * 0.4;
             
    const hZ = Math.sin(x * 0.25 + t * 0.9) * 0.35
             + Math.sin((z + eps) * 0.35 - t * 1.3) * 0.25
             + Math.sin((x + z + eps) * 0.15 + t * 0.5) * 0.4;

    const tangentX = new THREE.Vector3(eps, hX - h, 0).normalize();
    const tangentZ = new THREE.Vector3(0, hZ - h, eps).normalize();
    const normal = new THREE.Vector3().crossVectors(tangentZ, tangentX).normalize();
    
    // The ocean mesh is placed at y = -0.5, so world height is h - 0.5
    return { height: h - 0.5, normal };
  }

  dispose(scene) {
    if (this.mesh) {
      scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
    }
  }
}

import * as THREE from 'three';

export class Sky {
  constructor() {
    this.mesh = null;
  }

  init(scene) {
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        uTop: { value: new THREE.Color('#8cb1d1') },
        uHorizon: { value: new THREE.Color('#e0cfa4') },
        uSunColor: { value: new THREE.Color('#ffffff') },
        uSunDir: { value: new THREE.Vector3(10, 20, 10).normalize() },
        uMoonColor: { value: new THREE.Color('#bad6ff') },
        uMoonDir: { value: new THREE.Vector3(-10, -20, -10).normalize() },
        uNightFactor: { value: 0.0 }
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vPos;
        uniform vec3 uTop, uHorizon, uSunColor, uSunDir;
        uniform vec3 uMoonColor, uMoonDir;
        uniform float uNightFactor;

        // 3D hash for deterministic starry sky
        float starHash(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }

        void main() {
          float t = clamp(vPos.y, 0.0, 1.0);
          vec3 dayBg = mix(uHorizon, uTop, t);
          vec3 nightBg = mix(vec3(0.04, 0.08, 0.15), vec3(0.008, 0.015, 0.04), t);

          vec3 bg = mix(dayBg, nightBg, uNightFactor);

          // Sun specular glow in the sky
          float sunDot = max(dot(vPos, normalize(uSunDir)), 0.0);
          float sunSpec = pow(sunDot, 30.0);
          vec3 col = bg + uSunColor * sunSpec * 0.8 * (1.0 - uNightFactor * 0.8);

          // Soft atmospheric lunar halo in the sky
          float moonDot = max(dot(vPos, normalize(uMoonDir)), 0.0);
          float moonGlow = pow(moonDot, 40.0) * 0.12 + pow(moonDot, 140.0) * 0.22;
          col += uMoonColor * moonGlow * uNightFactor;

          // Twinkling stars when night falls
          if (uNightFactor > 0.05 && vPos.y > 0.03) {
            vec3 starCell = floor(vPos * 160.0);
            float h = starHash(starCell);
            if (h > 0.982) {
              float brightness = (h - 0.982) / 0.018;
              float twinkle = sin(starCell.x * 12.0 + starCell.y * 7.0 + starCell.z * 5.0) * 0.35 + 0.65;
              vec3 starColor = mix(vec3(0.85, 0.92, 1.0), vec3(1.0, 0.95, 0.8), fract(h * 31.0));
              col += starColor * brightness * twinkle * uNightFactor * smoothstep(0.03, 0.25, vPos.y);
            }
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `
    });

    const skyGeo = new THREE.SphereGeometry(400, 32, 16);
    this.mesh = new THREE.Mesh(skyGeo, skyMat);
    this.mesh.name = 'skyMesh';
    scene.add(this.mesh);
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

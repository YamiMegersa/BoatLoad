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
            uSunDir: { value: new THREE.Vector3(10, 20, 10).normalize() }
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
      void main() {
        float t = clamp(vPos.y, 0.0, 1.0);
        vec3 bg = mix(uHorizon, uTop, t);
        float sunSpec = pow(max(dot(vPos, normalize(uSunDir)), 0.0), 30.0);
        gl_FragColor = vec4(bg + uSunColor * sunSpec * 0.8, 1.0);
      }
    `
    });

    const skyGeo = new THREE.SphereGeometry(400, 32, 16);
    this.mesh = new THREE.Mesh(skyGeo, skyMat);
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

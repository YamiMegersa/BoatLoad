import * as THREE from 'three';

export class RainManager {
  constructor(scene) {
    this._scene = scene;
    this.mesh = null;
    this._time = 0;
    
    this._init();
  }

  _init() {
    const rainCount = 15000;
    
    // Cylinder for rain streak to be omnidirectional
    const cylGeometry = new THREE.CylinderGeometry(0.02, 0.02, 1.5, 3);
    
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uWindDirection: { value: new THREE.Vector3(0, -1, 0) }, // Default straight down
        uDisplacement: { value: new THREE.Vector3(0, 0, 0) },
        uBoxSize: { value: new THREE.Vector3(200, 100, 200) },
        uOpacity: { value: 0.0 }
      },
      vertexShader: `
        uniform float uTime;
        uniform vec3 uWindDirection;
        uniform vec3 uDisplacement;
        uniform vec3 uBoxSize;
        
        void main() {
          vec3 basePos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          
          vec3 pos = basePos + uDisplacement;
          
          pos.x = mod(mod(pos.x, uBoxSize.x) + uBoxSize.x, uBoxSize.x) - uBoxSize.x * 0.5;
          pos.y = mod(mod(pos.y, uBoxSize.y) + uBoxSize.y, uBoxSize.y);
          pos.z = mod(mod(pos.z, uBoxSize.z) + uBoxSize.z, uBoxSize.z) - uBoxSize.z * 0.5;
          
          vec3 localPos = position;
          
          vec3 w = normalize(uWindDirection);
          float skewX = w.x / abs(w.y + 0.0001);
          float skewZ = w.z / abs(w.y + 0.0001);
          
          localPos.x -= localPos.y * skewX;
          localPos.z -= localPos.y * skewZ;
          
          vec4 worldPosition = modelMatrix * vec4(localPos + pos, 1.0);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        void main() {
          if (uOpacity <= 0.01) discard;
          gl_FragColor = vec4(0.8, 0.9, 1.0, 0.3 * uOpacity);
        }
      `
    });

    this._targetIntensity = 0.0;

    this.mesh = new THREE.InstancedMesh(cylGeometry, material, rainCount);
    
    const dummy = new THREE.Object3D();
    for (let i = 0; i < rainCount; i++) {
      dummy.position.set(
        (Math.random() - 0.5) * 200,
        Math.random() * 100,
        (Math.random() - 0.5) * 200
      );
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }
    
    this.mesh.frustumCulled = false;
    this._scene.add(this.mesh);
  }

  update(delta, shipPosition, windDir) {
    this._time += delta;
    if (this.mesh) {
      if (this._targetIntensity !== undefined) {
        const cur = this.mesh.material.uniforms.uOpacity.value;
        this.mesh.material.uniforms.uOpacity.value += (this._targetIntensity - cur) * Math.min(1.0, delta * 3.0);
      }

      this.mesh.material.uniforms.uTime.value = this._time;
      
      // Rain slants with the wind
      const wDir = windDir || new THREE.Vector3(0, 0, -1);
      const fallDir = new THREE.Vector3(wDir.x * 1.0, -1.0, wDir.z * 1.0).normalize();
      this.mesh.material.uniforms.uWindDirection.value.copy(fallDir);
      
      if (!this._displacement) this._displacement = new THREE.Vector3();
      this._displacement.addScaledVector(fallDir, 55.0 * delta); // 55.0 fall speed
      
      // Keep displacement bounded to prevent float precision issues over time
      const box = this.mesh.material.uniforms.uBoxSize.value;
      this._displacement.x = ((this._displacement.x % box.x) + box.x) % box.x;
      this._displacement.y = ((this._displacement.y % box.y) + box.y) % box.y;
      this._displacement.z = ((this._displacement.z % box.z) + box.z) % box.z;
      
      if (!this.mesh.material.uniforms.uDisplacement) {
        this.mesh.material.uniforms.uDisplacement = { value: new THREE.Vector3() };
      }
      this.mesh.material.uniforms.uDisplacement.value.copy(this._displacement);
      
      if (shipPosition) {
        this.mesh.position.set(shipPosition.x, 0, shipPosition.z);
      }
    }
  }

  setIntensity(val) {
    this._targetIntensity = val;
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

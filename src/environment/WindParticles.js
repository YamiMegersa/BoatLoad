import * as THREE from 'three';

export class WindParticles {
  constructor(scene, count = 200, playRadius = 200) {
    this._scene = scene;
    this.count = count;
    this.playRadius = playRadius;
    this.speed = 35; // Fast enough to look like wind
    
    // Thin, long box to represent a wind streak
    const geometry = new THREE.BoxGeometry(0.05, 0.05, 3.0); 
    const material = new THREE.MeshBasicMaterial({ 
      color: 0xffffff, 
      transparent: true, 
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    
    this.dummy = new THREE.Object3D();
    this.positions = new Float32Array(count * 3);
    
    for (let i = 0; i < count; i++) {
      this.positions[i * 3]     = (Math.random() - 0.5) * playRadius * 2;
      this.positions[i * 3 + 1] = Math.random() * 15 + 1; // height 1 to 16
      this.positions[i * 3 + 2] = (Math.random() - 0.5) * playRadius * 2;
      
      this.dummy.position.set(
        this.positions[i * 3],
        this.positions[i * 3 + 1],
        this.positions[i * 3 + 2]
      );
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    
    this.mesh.instanceMatrix.needsUpdate = true;
    this._scene.add(this.mesh);
  }
  
  update(delta, windManager) {
    if (!windManager) return;
    
    const pr = this.playRadius;
    
    for (let i = 0; i < this.count; i++) {
      const x = this.positions[i * 3];
      const z = this.positions[i * 3 + 2];
      
      const localWind = windManager.getWindAt(x, z);
      
      this.positions[i * 3]     += localWind.x * this.speed * delta;
      this.positions[i * 3 + 1] += localWind.y * this.speed * delta;
      this.positions[i * 3 + 2] += localWind.z * this.speed * delta;
      
      // Wrap around
      if (this.positions[i * 3] > pr) this.positions[i * 3] -= pr * 2;
      else if (this.positions[i * 3] < -pr) this.positions[i * 3] += pr * 2;
      
      if (this.positions[i * 3 + 2] > pr) this.positions[i * 3 + 2] -= pr * 2;
      else if (this.positions[i * 3 + 2] < -pr) this.positions[i * 3 + 2] += pr * 2;
      
      if (this.positions[i * 3 + 1] > 20) this.positions[i * 3 + 1] -= 20;
      else if (this.positions[i * 3 + 1] < 0) this.positions[i * 3 + 1] += 20;
      
      this.dummy.position.set(
        this.positions[i * 3],
        this.positions[i * 3 + 1],
        this.positions[i * 3 + 2]
      );
      
      const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1), 
        localWind.clone().normalize()
      );
      this.dummy.quaternion.copy(targetQuaternion);
      
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  
  dispose() {
    if (this._scene && this.mesh) {
      this._scene.remove(this.mesh);
    }
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }
  }
}

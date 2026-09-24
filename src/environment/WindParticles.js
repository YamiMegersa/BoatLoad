import * as THREE from 'three';

export class WindParticles {
  constructor(scene, count = 200, playRadius = 200) {
    this._scene = scene;
    this.count = count;
    this.playRadius = playRadius;
    this.speed = 40; // Fast speed so they sweep away horizontally
    
    // 2D plane to represent snow/wind particles
    const geometry = new THREE.PlaneGeometry(0.3, 0.3); 
    const material = new THREE.MeshBasicMaterial({ 
      color: 0xffffff, 
      transparent: true, 
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
    this.positions = new Float32Array(count * 3);
    this.lifespans = new Float32Array(count);
    this.maxLifespans = new Float32Array(count);
    
    for (let i = 0; i < count; i++) {
      this.positions[i * 3]     = (Math.random() - 0.5) * playRadius * 2;
      this.positions[i * 3 + 1] = Math.random() * 20; // height 0 to 20
      this.positions[i * 3 + 2] = (Math.random() - 0.5) * playRadius * 2;
      
      this.maxLifespans[i] = 0.5 + Math.random() * 1.5; // Shorter lifespan since they move fast
      this.lifespans[i] = Math.random() * this.maxLifespans[i];
      
      this.dummy.position.set(
        this.positions[i * 3],
        this.positions[i * 3 + 1],
        this.positions[i * 3 + 2]
      );
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, new THREE.Color(0xffffff));
    }
    
    this.mesh.instanceColor.needsUpdate = true;
    
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
      
      this.lifespans[i] -= delta;
      if (this.lifespans[i] <= 0) {
        this.maxLifespans[i] = 0.5 + Math.random() * 1.5;
        this.lifespans[i] = this.maxLifespans[i];
        
        this.positions[i * 3]     = (Math.random() - 0.5) * pr * 2;
        this.positions[i * 3 + 1] = Math.random() * 20;
        this.positions[i * 3 + 2] = (Math.random() - 0.5) * pr * 2;
      } else {
        // Sweep away rapidly along the wind vector
        this.positions[i * 3]     += localWind.x * this.speed * delta;
        this.positions[i * 3 + 1] += localWind.y * this.speed * delta; 
        this.positions[i * 3 + 2] += localWind.z * this.speed * delta;
      }
      
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
      
      // Rotate slowly instead of facing the wind
      this.dummy.rotation.x += delta * 2.0;
      this.dummy.rotation.y += delta * 1.5;
      
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      
      // Fade in and out based on lifespan
      const progress = this.lifespans[i] / this.maxLifespans[i];
      let fade = 1.0;
      if (progress > 0.8) fade = (1.0 - progress) / 0.2;
      else if (progress < 0.2) fade = progress / 0.2;
      
      this.color.setRGB(fade, fade, fade);
      this.mesh.setColorAt(i, this.color);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
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

import * as THREE from 'three';

export class WhirlpoolParticles {
  constructor(radius = 12, count = 150) {
    this.radius = radius;
    this.count = count;
    this.speed = 10;
    
    // Use the same visual style as wind streaks, but flat on the water
    const geometry = new THREE.BoxGeometry(0.05, 0.05, 2.0); 
    const material = new THREE.MeshBasicMaterial({ 
      color: 0xffffff, 
      transparent: true, 
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    
    this.dummy = new THREE.Object3D();
    this.particleData = [];
    
    for (let i = 0; i < count; i++) {
      // Random distance from center, slightly clustered towards center
      const r = Math.random() * radius;
      // Random angle
      const theta = Math.random() * Math.PI * 2;
      
      this.particleData.push({
        r: r,
        theta: theta,
        speedMultiplier: 0.5 + Math.random() * 0.5
      });
      
      this._updateInstance(i);
    }
    
    this.mesh.instanceMatrix.needsUpdate = true;
    
    // Sit just above the water surface
    this.mesh.position.y = 0.5;
  }
  
  _updateInstance(i) {
    const p = this.particleData[i];
    
    const x = Math.cos(p.theta) * p.r;
    const z = Math.sin(p.theta) * p.r;
    
    this.dummy.position.set(x, 0, z);
    
    // Calculate exact velocity vector for perfect alignment
    const angularSpeed = (this.speed / Math.max(2.0, p.r)) * p.speedMultiplier;
    const radialSpeed = (this.speed * 0.8) * p.speedMultiplier; 
    
    const vx = -radialSpeed * Math.cos(p.theta) - (p.r * angularSpeed) * Math.sin(p.theta);
    const vz = -radialSpeed * Math.sin(p.theta) + (p.r * angularSpeed) * Math.cos(p.theta);
    
    // Align the box with its velocity vector
    const angle = Math.atan2(vx, vz);
    
    this.dummy.rotation.set(0, angle, 0); 
    
    // Make streaks get shorter as they approach the center to prevent crossing over
    const scale = Math.min(1.0, Math.max(0.2, p.r / 4.0));
    this.dummy.scale.set(1, 1, scale);
    
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this.dummy.matrix);
  }
  
  update(delta) {
    for (let i = 0; i < this.count; i++) {
      const p = this.particleData[i];
      
      // Move angularly around the center (faster near center)
      const angularSpeed = (this.speed / Math.max(2.0, p.r)) * p.speedMultiplier;
      p.theta += angularSpeed * delta;
      
      // Move inward radially
      const radialSpeed = (this.speed * 0.8) * p.speedMultiplier;
      p.r -= radialSpeed * delta;
      
      // Reset if it reaches the center
      if (p.r <= 0.1) {
        p.r = this.radius;
        p.theta = Math.random() * Math.PI * 2;
      }
      
      this._updateInstance(i);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  
  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

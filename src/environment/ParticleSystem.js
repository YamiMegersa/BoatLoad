import * as THREE from 'three';
import { on, off } from '../core/EventBus.js';

export class ParticleSystem {
  constructor(scene) {
    this._scene = scene;
    this._particles = [];

    this._geoSplash = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    this._matSplash = new THREE.MeshLambertMaterial({ color: 0x4aa6f8, transparent: true, opacity: 0.8 });

    this._geoWood = new THREE.BoxGeometry(0.2, 0.6, 0.1);
    this._matWood = new THREE.MeshLambertMaterial({ color: 0x5a3f2a });

    this._geoBloodSplash = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    this._matBloodSplash = new THREE.MeshLambertMaterial({ color: 0xaa0000, transparent: true, opacity: 0.9 });

    this._geoHarpoon = new THREE.CylinderGeometry(0.1, 0.1, 4, 8);
    this._geoHarpoon.rotateX(Math.PI / 2); // point along Z
    this._matHarpoon = new THREE.MeshLambertMaterial({ color: 0xaaaaaa });

    this._onSpawn = (d) => {
      if (d.type === 'splash') this.spawnSplash(d.position);
      if (d.type === 'explosion') this.spawnExplosion(d.position);
      if (d.type === 'harpoon') this.spawnHarpoon(d.start, d.end);
      if (d.type === 'massiveSplash') this.spawnMassiveSplash(d.position);
      if (d.type === 'bloodSplash') this.spawnBloodSplash(d.position);
    };

    on('spawnParticles', this._onSpawn);
  }

  spawnSplash(position) {
    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(this._geoSplash, this._matSplash);
      mesh.position.copy(position);
      mesh.position.y += Math.random() * 0.5;

      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        2 + Math.random() * 4,
        (Math.random() - 0.5) * 5
      );

      this._scene.add(mesh);
      this._particles.push({ mesh, velocity, life: 1.0, maxLife: 1.0 });
    }
  }

  spawnMassiveSplash(position) {
    for (let i = 0; i < 30; i++) {
      const mesh = new THREE.Mesh(this._geoSplash, this._matSplash);
      mesh.position.copy(position);
      mesh.position.y += Math.random() * 0.5;

      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 12,
        4 + Math.random() * 8,
        (Math.random() - 0.5) * 12
      );
      
      mesh.scale.setScalar(1.5 + Math.random() * 1.5);

      this._scene.add(mesh);
      this._particles.push({ mesh, velocity, life: 1.2, maxLife: 1.2 });
    }
  }

  spawnBloodSplash(position) {
    for (let i = 0; i < 20; i++) {
      const mesh = new THREE.Mesh(this._geoBloodSplash, this._matBloodSplash);
      mesh.position.copy(position);
      mesh.position.y += Math.random() * 0.5;

      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        3 + Math.random() * 5,
        (Math.random() - 0.5) * 8
      );
      
      mesh.scale.setScalar(1.0 + Math.random() * 1.0);

      this._scene.add(mesh);
      this._particles.push({ mesh, velocity, life: 1.0, maxLife: 1.0 });
    }
  }

  spawnExplosion(position) {
    for (let i = 0; i < 20; i++) {
      const mesh = new THREE.Mesh(this._geoWood, this._matWood);
      mesh.position.copy(position);

      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        3 + Math.random() * 6,
        (Math.random() - 0.5) * 8
      );

      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      const angularVelocity = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10
      );

      this._scene.add(mesh);
      this._particles.push({ mesh, velocity, angularVelocity, life: 1.5, maxLife: 1.5 });
    }
  }

  spawnHarpoon(start, end) {
    const mesh = new THREE.Mesh(this._geoHarpoon, this._matHarpoon);
    mesh.position.copy(start);
    mesh.position.y += 2; // From deck height
    mesh.lookAt(end);
    
    const distance = mesh.position.distanceTo(end);
    const duration = 0.3; // 300ms to hit
    const velocity = end.clone().sub(mesh.position).setLength(distance / duration);
    
    this._scene.add(mesh);
    this._particles.push({ mesh, velocity, life: duration, maxLife: duration, type: 'harpoon' });
  }

  update(delta) {
    const toRemove = [];
    for (const p of this._particles) {
      p.life -= delta;
      
      // Gravity
      if (p.type !== 'harpoon') {
        p.velocity.y -= 12 * delta;
      }

      p.mesh.position.addScaledVector(p.velocity, delta);
      
      if (p.angularVelocity) {
        p.mesh.rotation.x += p.angularVelocity.x * delta;
        p.mesh.rotation.y += p.angularVelocity.y * delta;
        p.mesh.rotation.z += p.angularVelocity.z * delta;
      }

      // Fade out logic for splash
      if (p.mesh.material === this._matSplash || p.mesh.material === this._matBloodSplash) {
        const ratio = p.life / p.maxLife;
        // Need to clone material if we want per-particle opacity, 
        // but for performance we just let them scale down.
        p.mesh.scale.setScalar(Math.max(0, ratio * (p.mesh.material === this._matBloodSplash ? 1.5 : (p.mesh.scale.x > 1 ? p.mesh.scale.x : 1))));
      } else {
        // Wood also scales down at the end
        if (p.life < 0.5) {
          p.mesh.scale.setScalar(Math.max(0, p.life * 2));
        }
      }

      if (p.life <= 0 || (p.type !== 'harpoon' && p.mesh.position.y < -2)) {
        if (p.type === 'harpoon') {
          // Spawn explosion exactly where the harpoon hit
          this.spawnExplosion(p.mesh.position);
        }
        toRemove.push(p);
      }
    }

    for (const p of toRemove) {
      this._scene.remove(p.mesh);
      const idx = this._particles.indexOf(p);
      if (idx !== -1) this._particles.splice(idx, 1);
    }
  }

  dispose() {
    off('spawnParticles', this._onSpawn);
    for (const p of this._particles) {
      this._scene.remove(p.mesh);
    }
    this._particles = [];
    this._geoSplash.dispose();
    this._matSplash.dispose();
    this._geoBloodSplash.dispose();
    this._matBloodSplash.dispose();
    this._geoWood.dispose();
    this._matWood.dispose();
    this._geoHarpoon.dispose();
    this._matHarpoon.dispose();
  }
}

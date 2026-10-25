import * as THREE from 'three';
import { on, off } from '../core/EventBus.js';

export class ParticleSystem {
  constructor(scene) {
    this._scene = scene;

    // Shared Geometries & Materials
    this._geoSplash = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    this._matSplash = new THREE.MeshLambertMaterial({ color: 0x4aa6f8, transparent: true, opacity: 0.8 });

    this._geoWood = new THREE.BoxGeometry(0.2, 0.6, 0.1);
    this._matWood = new THREE.MeshLambertMaterial({ color: 0x5a3f2a });

    this._geoBloodSplash = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    this._matBloodSplash = new THREE.MeshLambertMaterial({ color: 0xaa0000, transparent: true, opacity: 0.9 });

    this._geoHarpoon = new THREE.CylinderGeometry(0.1, 0.1, 4, 8);
    this._geoHarpoon.rotateX(Math.PI / 2); // point along Z
    this._matHarpoon = new THREE.MeshLambertMaterial({ color: 0xaaaaaa });
    this._geoCannonball = new THREE.SphereGeometry(0.22, 8, 6);
    this._matCannonball = new THREE.MeshBasicMaterial({ color: 0xffd27a });

    // Instanced meshes for high-frequency burst particles
    const MAX_SPLASH = 200;
    const MAX_WOOD = 120;
    const MAX_BLOOD = 80;

    this._instancedSplash = new THREE.InstancedMesh(this._geoSplash, this._matSplash, MAX_SPLASH);
    this._instancedSplash.count = 0;
    this._instancedSplash.frustumCulled = false;
    this._scene.add(this._instancedSplash);

    this._instancedWood = new THREE.InstancedMesh(this._geoWood, this._matWood, MAX_WOOD);
    this._instancedWood.count = 0;
    this._instancedWood.frustumCulled = false;
    this._scene.add(this._instancedWood);

    this._instancedBlood = new THREE.InstancedMesh(this._geoBloodSplash, this._matBloodSplash, MAX_BLOOD);
    this._instancedBlood.count = 0;
    this._instancedBlood.frustumCulled = false;
    this._scene.add(this._instancedBlood);

    // Pools & active lists for zero heap allocation
    this._splashPool = this._buildPool(MAX_SPLASH);
    this._splashes = [];
    this._lastSplashCount = 0;

    this._woodPool = this._buildPool(MAX_WOOD);
    this._woods = [];
    this._lastWoodCount = 0;

    this._bloodPool = this._buildPool(MAX_BLOOD);
    this._bloods = [];
    this._lastBloodCount = 0;

    // Rare single-projectile entities (harpoon, cannonball)
    this._projectiles = [];

    this._dummy = new THREE.Object3D();

    this._onSpawn = (d) => {
      if (d.type === 'splash') this.spawnSplash(d.position);
      if (d.type === 'explosion') this.spawnExplosion(d.position);
      if (d.type === 'harpoon') this.spawnHarpoon(d.start, d.end);
      if (d.type === 'cannonShot') this.spawnCannonShot(d.start, d.end);
      if (d.type === 'massiveSplash') this.spawnMassiveSplash(d.position);
      if (d.type === 'bloodSplash') this.spawnBloodSplash(d.position);
    };

    on('spawnParticles', this._onSpawn);
  }

  get _particles() {
    return this._projectiles;
  }

  _buildPool(capacity) {
    const arr = [];
    for (let i = 0; i < capacity; i++) {
      arr.push({
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        rx: 0, ry: 0, rz: 0,
        vrx: 0, vry: 0, vrz: 0,
        scale: 1.0,
        life: 0,
        maxLife: 1.0
      });
    }
    return arr;
  }

  spawnSplash(position) {
    for (let i = 0; i < 12; i++) {
      const p = this._splashPool.pop();
      if (!p) break;

      p.x = position.x;
      p.y = position.y + Math.random() * 0.5;
      p.z = position.z;

      p.vx = (Math.random() - 0.5) * 5;
      p.vy = 2 + Math.random() * 4;
      p.vz = (Math.random() - 0.5) * 5;

      p.scale = 1.0;
      p.life = 1.0;
      p.maxLife = 1.0;

      this._splashes.push(p);
    }
  }

  spawnMassiveSplash(position) {
    for (let i = 0; i < 30; i++) {
      const p = this._splashPool.pop();
      if (!p) break;

      p.x = position.x;
      p.y = position.y + Math.random() * 0.5;
      p.z = position.z;

      p.vx = (Math.random() - 0.5) * 12;
      p.vy = 4 + Math.random() * 8;
      p.vz = (Math.random() - 0.5) * 12;

      p.scale = 1.5 + Math.random() * 1.5;
      p.life = 1.2;
      p.maxLife = 1.2;

      this._splashes.push(p);
    }
  }

  spawnBloodSplash(position) {
    for (let i = 0; i < 20; i++) {
      const p = this._bloodPool.pop();
      if (!p) break;

      p.x = position.x;
      p.y = position.y + Math.random() * 0.5;
      p.z = position.z;

      p.vx = (Math.random() - 0.5) * 8;
      p.vy = 3 + Math.random() * 5;
      p.vz = (Math.random() - 0.5) * 8;

      p.scale = 1.0 + Math.random() * 1.0;
      p.life = 1.0;
      p.maxLife = 1.0;

      this._bloods.push(p);
    }
  }

  spawnExplosion(position) {
    for (let i = 0; i < 20; i++) {
      const p = this._woodPool.pop();
      if (!p) break;

      p.x = position.x;
      p.y = position.y;
      p.z = position.z;

      p.vx = (Math.random() - 0.5) * 8;
      p.vy = 3 + Math.random() * 6;
      p.vz = (Math.random() - 0.5) * 8;

      p.rx = Math.random() * Math.PI;
      p.ry = Math.random() * Math.PI;
      p.rz = Math.random() * Math.PI;

      p.vrx = (Math.random() - 0.5) * 10;
      p.vry = (Math.random() - 0.5) * 10;
      p.vrz = (Math.random() - 0.5) * 10;

      p.scale = 1.0;
      p.life = 1.5;
      p.maxLife = 1.5;

      this._woods.push(p);
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
    this._projectiles.push({ mesh, velocity, life: duration, maxLife: duration, type: 'harpoon' });
  }

  spawnCannonShot(start, end) {
    const flash = new THREE.Mesh(this._geoCannonball, this._matCannonball);
    flash.position.copy(start);
    flash.scale.setScalar(2.5);
    this._scene.add(flash);
    this._projectiles.push({ mesh: flash, velocity: new THREE.Vector3(), life: 0.12, maxLife: 0.12, type: 'cannonflash' });

    const mesh = new THREE.Mesh(this._geoCannonball, this._matCannonball);
    mesh.position.copy(start);
    const duration = 0.35;
    const velocity = end.clone().sub(start).multiplyScalar(1 / duration);
    this._scene.add(mesh);
    this._projectiles.push({ mesh, velocity, life: duration, maxLife: duration, type: 'cannonball' });
  }

  update(delta) {
    // 1. Water splashes
    let splashCount = 0;
    for (let i = this._splashes.length - 1; i >= 0; i--) {
      const p = this._splashes[i];
      p.life -= delta;
      if (p.life <= 0 || p.y < -2) {
        this._splashPool.push(p);
        const last = this._splashes.pop();
        if (i < this._splashes.length) {
          this._splashes[i] = last;
        }
        continue;
      }

      p.vy -= 12 * delta;
      p.x += p.vx * delta;
      p.y += p.vy * delta;
      p.z += p.vz * delta;

      const ratio = p.life / p.maxLife;
      const s = Math.max(0, ratio * (p.scale > 1 ? p.scale : 1));

      this._dummy.position.set(p.x, p.y, p.z);
      this._dummy.rotation.set(0, 0, 0);
      this._dummy.scale.set(s, s, s);
      this._dummy.updateMatrix();

      this._instancedSplash.setMatrixAt(splashCount, this._dummy.matrix);
      splashCount++;
    }
    this._instancedSplash.count = splashCount;
    if (splashCount > 0 || this._lastSplashCount > 0) {
      this._instancedSplash.instanceMatrix.needsUpdate = true;
    }
    this._lastSplashCount = splashCount;

    // 2. Blood splashes
    let bloodCount = 0;
    for (let i = this._bloods.length - 1; i >= 0; i--) {
      const p = this._bloods[i];
      p.life -= delta;
      if (p.life <= 0 || p.y < -2) {
        this._bloodPool.push(p);
        const last = this._bloods.pop();
        if (i < this._bloods.length) {
          this._bloods[i] = last;
        }
        continue;
      }

      p.vy -= 12 * delta;
      p.x += p.vx * delta;
      p.y += p.vy * delta;
      p.z += p.vz * delta;

      const ratio = p.life / p.maxLife;
      const s = Math.max(0, ratio * 1.5);

      this._dummy.position.set(p.x, p.y, p.z);
      this._dummy.rotation.set(0, 0, 0);
      this._dummy.scale.set(s, s, s);
      this._dummy.updateMatrix();

      this._instancedBlood.setMatrixAt(bloodCount, this._dummy.matrix);
      bloodCount++;
    }
    this._instancedBlood.count = bloodCount;
    if (bloodCount > 0 || this._lastBloodCount > 0) {
      this._instancedBlood.instanceMatrix.needsUpdate = true;
    }
    this._lastBloodCount = bloodCount;

    // 3. Wood explosion debris
    let woodCount = 0;
    for (let i = this._woods.length - 1; i >= 0; i--) {
      const p = this._woods[i];
      p.life -= delta;
      if (p.life <= 0 || p.y < -2) {
        this._woodPool.push(p);
        const last = this._woods.pop();
        if (i < this._woods.length) {
          this._woods[i] = last;
        }
        continue;
      }

      p.vy -= 12 * delta;
      p.x += p.vx * delta;
      p.y += p.vy * delta;
      p.z += p.vz * delta;

      p.rx += p.vrx * delta;
      p.ry += p.vry * delta;
      p.rz += p.vrz * delta;

      let s = p.scale;
      if (p.life < 0.5) {
        s = Math.max(0, p.life * 2 * p.scale);
      }

      this._dummy.position.set(p.x, p.y, p.z);
      this._dummy.rotation.set(p.rx, p.ry, p.rz);
      this._dummy.scale.set(s, s, s);
      this._dummy.updateMatrix();

      this._instancedWood.setMatrixAt(woodCount, this._dummy.matrix);
      woodCount++;
    }
    this._instancedWood.count = woodCount;
    if (woodCount > 0 || this._lastWoodCount > 0) {
      this._instancedWood.instanceMatrix.needsUpdate = true;
    }
    this._lastWoodCount = woodCount;

    // 4. Single-instance projectiles (harpoon, cannonball)
    for (let i = this._projectiles.length - 1; i >= 0; i--) {
      const p = this._projectiles[i];
      p.life -= delta;

      if (p.type !== 'harpoon' && p.type !== 'cannonball' && p.type !== 'cannonflash') {
        p.velocity.y -= 12 * delta;
      }

      p.mesh.position.addScaledVector(p.velocity, delta);

      if (p.life <= 0 || (p.type !== 'harpoon' && p.mesh.position.y < -2)) {
        if (p.type === 'harpoon') {
          this.spawnExplosion(p.mesh.position);
        }
        this._scene.remove(p.mesh);
        this._projectiles.splice(i, 1);
      }
    }
  }

  dispose() {
    off('spawnParticles', this._onSpawn);

    if (this._instancedSplash) {
      this._scene.remove(this._instancedSplash);
      this._instancedSplash.dispose?.();
    }
    if (this._instancedWood) {
      this._scene.remove(this._instancedWood);
      this._instancedWood.dispose?.();
    }
    if (this._instancedBlood) {
      this._scene.remove(this._instancedBlood);
      this._instancedBlood.dispose?.();
    }

    for (const p of this._projectiles) {
      this._scene.remove(p.mesh);
    }
    this._projectiles = [];
    this._splashes = [];
    this._woods = [];
    this._bloods = [];

    this._geoSplash.dispose();
    this._matSplash.dispose();
    this._geoBloodSplash.dispose();
    this._matBloodSplash.dispose();
    this._geoWood.dispose();
    this._matWood.dispose();
    this._geoHarpoon.dispose();
    this._matHarpoon.dispose();
    this._geoCannonball.dispose();
    this._matCannonball.dispose();
  }
}

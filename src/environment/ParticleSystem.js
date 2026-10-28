import * as THREE from 'three';
import { on, off } from '../core/EventBus.js';

export function harpoonFlightDuration(distance) {
  return THREE.MathUtils.clamp(distance / 42, 0.35, 0.6);
}

/**
 * Computes a point along the harpoon's ballistic flight parabola for normalized progress t in [0..1].
 */
export function interpolateHarpoonFlight(start, end, t, arcHeight = null, out = new THREE.Vector3()) {
  const clampedT = THREE.MathUtils.clamp(t, 0, 1);
  const dist = start.distanceTo(end);
  const lift = arcHeight !== null ? arcHeight : THREE.MathUtils.clamp(dist * 0.095, 0.85, 2.6);
  out.lerpVectors(start, end, clampedT);
  out.y += 4 * clampedT * (1 - clampedT) * lift;
  return out;
}

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

    // Harpoon projectile geometries:
    // Note: THREE.Group.lookAt(target) aligns local +Z toward target.
    // We place the spearhead penetration point at z = 0, tip at z = +0.55, and shaft extending back to z = -4.25.
    this._geoHarpoon = new THREE.CylinderGeometry(0.13, 0.16, 3.8, 8);
    this._geoHarpoon.rotateX(Math.PI / 2); // aligned along Z axis
    this._geoHarpoonCollar = new THREE.CylinderGeometry(0.19, 0.17, 0.42, 8);
    this._geoHarpoonCollar.rotateX(Math.PI / 2);
    this._geoHarpoonHead = new THREE.ConeGeometry(0.36, 1.05, 4);
    this._geoHarpoonHead.rotateX(Math.PI / 2); // cone apex points toward +Z (flight direction)
    this._geoHarpoonBarb = new THREE.BoxGeometry(0.68, 0.09, 0.28);
    this._geoHarpoonRing = new THREE.TorusGeometry(0.18, 0.045, 6, 12);

    this._matHarpoon = new THREE.MeshLambertMaterial({ color: 0x7a4c28 });
    this._matHarpoonCollar = new THREE.MeshLambertMaterial({
      color: 0xd7b35a,
      emissive: 0x4a3510,
      emissiveIntensity: 0.35,
    });
    this._matHarpoonHead = new THREE.MeshLambertMaterial({
      color: 0xdbe4eb,
      emissive: 0x2c3e50,
      emissiveIntensity: 0.4,
    });
    this._matHarpoonFlash = new THREE.MeshBasicMaterial({ color: 0xffe082, transparent: true, opacity: 0.9 });
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
      if (d.type === 'harpoon') this.spawnHarpoon(d.start, d.end, d);
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

  spawnHarpoon(start, end, { onImpact = null, getOrigin = null, getTarget = null, isMiss = false } = {}) {
    const group = new THREE.Group();

    // Tip-aligned harpoon assembly:
    // Local +Z is forward (the lookAt direction); z = 0 is the penetration point on impact.
    const head = new THREE.Mesh(this._geoHarpoonHead, this._matHarpoonHead);
    head.position.z = 0.08;

    const leftBarb = new THREE.Mesh(this._geoHarpoonBarb, this._matHarpoonHead);
    leftBarb.position.set(-0.24, 0, -0.18);
    leftBarb.rotation.y = 0.46;

    const rightBarb = new THREE.Mesh(this._geoHarpoonBarb, this._matHarpoonHead);
    rightBarb.position.set(0.24, 0, -0.18);
    rightBarb.rotation.y = -0.46;

    const collar = new THREE.Mesh(this._geoHarpoonCollar, this._matHarpoonCollar);
    collar.position.z = -0.45;

    const shaft = new THREE.Mesh(this._geoHarpoon, this._matHarpoon);
    shaft.position.z = -2.35;

    const tailRing = new THREE.Mesh(this._geoHarpoonRing, this._matHarpoonCollar);
    tailRing.position.z = -4.28;

    const flash = new THREE.Mesh(this._geoCannonball, this._matHarpoonFlash);
    flash.position.z = 0.2;
    flash.scale.setScalar(2.1);

    group.add(shaft, head, leftBarb, rightBarb, flash, collar, tailRing);
    group.position.copy(start);

    const distance = start.distanceTo(end);
    const duration = harpoonFlightDuration(distance);
    const arcHeight = THREE.MathUtils.clamp(distance * 0.095, 0.85, 2.6);
    const velocity = end.clone().sub(start).multiplyScalar(1 / duration);

    const initialAim = interpolateHarpoonFlight(start, end, 0.08, arcHeight);
    group.lookAt(initialAim);

    const tailWorld = new THREE.Vector3(0, 0, -4.28).applyMatrix4(group.matrixWorld);
    const tetherGeometry = new THREE.BufferGeometry().setFromPoints([start, tailWorld]);
    const tetherMaterial = new THREE.LineBasicMaterial({
      color: 0xd8c396,
      transparent: true,
      opacity: 0.88,
    });
    const tether = new THREE.Line(tetherGeometry, tetherMaterial);
    tether.frustumCulled = false;

    this._scene.add(group, tether);
    this._projectiles.push({
      mesh: group,
      velocity,
      life: duration,
      maxLife: duration,
      type: 'harpoon',
      phase: 'flight',
      start: start.clone(),
      end: end.clone(),
      arcHeight,
      tether,
      onImpact,
      getOrigin,
      getTarget,
      isMiss,
      impactHold: isMiss ? 0.22 : 0.65,
      maxImpactHold: isMiss ? 0.22 : 0.65,
    });
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

  _updateHarpoonTether(p) {
    if (!p.tether) return;
    if (typeof p.getOrigin === 'function') {
      try {
        const dynamicOrigin = p.getOrigin();
        if (dynamicOrigin) p.start.copy(dynamicOrigin);
      } catch (_) {
        // Keep last known origin if callback fails
      }
    }
    p.mesh.updateMatrixWorld(true);
    const tailPos = new THREE.Vector3(0, 0, -4.28).applyMatrix4(p.mesh.matrixWorld);
    p.tether.geometry.setFromPoints([p.start, tailPos]);
    p.tether.geometry.attributes.position.needsUpdate = true;
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

      if (p.type === 'harpoon' && p.phase === 'impact') {
        if (p.life <= 0) {
          this._removeProjectile(i);
          continue;
        }
        // Keep the harpoon impaled in the shark as it thrashes and sinks
        if (typeof p.getTarget === 'function' && !p.isMiss) {
          try {
            const targetPos = p.getTarget();
            if (targetPos) p.mesh.position.copy(targetPos);
          } catch (_) {
            // Keep position if target was disposed
          }
        }
        if (p.tether) {
          const holdRatio = p.life / (p.maxImpactHold || 0.65);
          if (holdRatio > 0.35 && !p.isMiss) {
            p.tether.material.opacity = THREE.MathUtils.clamp((holdRatio - 0.35) * 1.35, 0, 0.85);
            this._updateHarpoonTether(p);
          } else {
            this._scene.remove(p.tether);
            p.tether.geometry.dispose();
            p.tether.material.dispose();
            p.tether = null;
          }
        }
        continue;
      }

      if (p.type === 'harpoon') {
        if (typeof p.getTarget === 'function' && !p.isMiss) {
          try {
            const liveTarget = p.getTarget();
            if (liveTarget) p.end.copy(liveTarget);
          } catch (_) {
            // Keep last target
          }
        }

        const t = THREE.MathUtils.clamp(1 - p.life / (p.maxLife || 0.45), 0, 1);
        interpolateHarpoonFlight(p.start, p.end, t, p.arcHeight, p.mesh.position);
        const lookT = Math.min(1, t + 0.06);
        if (lookT > t + 0.005) {
          const ahead = interpolateHarpoonFlight(p.start, p.end, lookT, p.arcHeight);
          p.mesh.lookAt(ahead);
        }

        const flash = p.mesh.children[4];
        if (flash) flash.visible = p.life > p.maxLife - 0.09;

        this._updateHarpoonTether(p);

        if (p.life <= 0) {
          p.mesh.position.copy(p.end);
          // Pitch the impaled harpoon at its terminal plunge angle into the target
          const preImpact = interpolateHarpoonFlight(p.start, p.end, 0.88, p.arcHeight);
          const impactDir = p.end.clone().sub(preImpact);
          if (impactDir.lengthSq() > 0.0001) {
            p.mesh.lookAt(p.end.clone().add(impactDir));
          }
          if (p.isMiss && p.tether) {
            this._scene.remove(p.tether);
            p.tether.geometry.dispose();
            p.tether.material.dispose();
            p.tether = null;
          }
          p.phase = 'impact';
          p.life = p.impactHold;
          this.spawnSplash(p.end);
          try {
            p.onImpact?.(p.end.clone());
          } catch (error) {
            console.error('[Harpoon] Impact callback failed:', error);
          }
        }
        continue;
      }

      if (p.type !== 'cannonball' && p.type !== 'cannonflash') {
        p.velocity.y -= 12 * delta;
      }

      p.mesh.position.addScaledVector(p.velocity, delta);

      if (p.life <= 0 || p.mesh.position.y < -2) {
        this._removeProjectile(i);
      }
    }
  }

  _removeProjectile(index) {
    const p = this._projectiles[index];
    if (!p) return;
    this._scene.remove(p.mesh);
    if (p.tether) {
      this._scene.remove(p.tether);
      p.tether.geometry.dispose();
      p.tether.material.dispose();
    }
    this._projectiles.splice(index, 1);
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
      if (p.tether) {
        this._scene.remove(p.tether);
        p.tether.geometry.dispose();
        p.tether.material.dispose();
      }
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
    this._geoHarpoonCollar.dispose();
    this._geoHarpoonHead.dispose();
    this._geoHarpoonBarb.dispose();
    this._geoHarpoonRing.dispose();
    this._matHarpoon.dispose();
    this._matHarpoonCollar.dispose();
    this._matHarpoonHead.dispose();
    this._matHarpoonFlash.dispose();
    this._geoCannonball.dispose();
    this._matCannonball.dispose();
  }
}

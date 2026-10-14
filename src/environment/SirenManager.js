import * as THREE from 'three';
import { emit } from '../core/EventBus.js';

export class SirenManager {
  constructor() {
    this._scene = null;
    this._qteSystem = null;
    this._sirens = [];
  }

  init(levelCfg, scene, qteSystem) {
    this._scene = scene;
    this._qteSystem = qteSystem;
    for (const definition of levelCfg?.sirens ?? []) this._spawn(definition);
  }

  update(delta, playerShip) {
    if (!playerShip || playerShip.sunk) return;
    const shipPosition = playerShip.mesh.position;

    for (const siren of this._sirens) {
      siren.cooldown = Math.max(0, siren.cooldown - delta);
      siren.idol.rotation.y += delta;
      const dx = siren.group.position.x - shipPosition.x;
      const dz = siren.group.position.z - shipPosition.z;
      const distance = Math.hypot(dx, dz) || 0.001;
      const radius = siren.definition.attractRadius ?? 24;

      if (distance < radius && siren.cooldown <= 0) {
        const pull = (1 - distance / radius) * (siren.definition.intensity ?? 0.8);
        const targetYaw = Math.atan2(-dx, -dz);
        let angle = targetYaw - playerShip.yaw;
        while (angle > Math.PI) angle -= Math.PI * 2;
        while (angle < -Math.PI) angle += Math.PI * 2;
        playerShip.yawVelocity += Math.sign(angle) * Math.min(Math.abs(angle), 1) * pull * 2.4 * delta;
        emit('sirenPulling', { intensity: pull, steerPull: -Math.sign(angle) * pull });

        if (!siren.qteTriggered && distance < radius * 0.7) {
          const accepted = this._qteSystem?.trigger({
            type: 'SIREN',
            metadata: { source: 'siren' },
            onSuccess: () => {
              siren.cooldown = 7;
              siren.qteTriggered = false;
              siren.group.visible = false;
            },
            onFail: () => {
              siren.cooldown = 4;
              siren.qteTriggered = false;
              playerShip.takeDamage(10, 'siren');
            },
          });
          if (accepted) siren.qteTriggered = true;
        }
      }
    }
  }

  dispose() {
    for (const siren of this._sirens) {
      siren.group.traverse(child => {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) child.material.forEach(material => material.dispose());
        else child.material?.dispose();
      });
      this._scene?.remove(siren.group);
    }
    this._sirens.length = 0;
    this._scene = null;
    this._qteSystem = null;
  }

  _spawn(definition) {
    const group = new THREE.Group();
    const position = definition.position ?? definition;
    group.position.set(position.x ?? 0, position.y ?? 0, position.z ?? 0);

    const reefMaterial = new THREE.MeshPhongMaterial({ color: 0x4a2e5b, emissive: 0x1e0d30, shininess: 20 });
    const reef = new THREE.Mesh(new THREE.DodecahedronGeometry(2, 1), reefMaterial);
    reef.scale.set(1.2, 1.8, 1.2);
    reef.position.y = 1.4;
    group.add(reef);

    const idolMaterial = new THREE.MeshPhongMaterial({ color: 0xff66cc, emissive: 0xff2288, emissiveIntensity: 1.2 });
    const idol = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), idolMaterial);
    idol.position.y = 4;
    group.add(idol);

    this._scene.add(group);
    this._sirens.push({ definition, group, idol, cooldown: 0, qteTriggered: false });
  }
}

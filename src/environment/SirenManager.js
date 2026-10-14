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
    // First-encounter grace: while enabled (tutorial levels by default, or an
    // explicit "sirenGrace" flag in level data), the first failed siren QTE
    // deals no damage.
    this._graceAvailable = levelCfg?.sirenGrace ?? Boolean(levelCfg?.tutorialPrompts);
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

      // Teach before punishing: warn once, the first time a siren has the ship in range.
      if (distance < radius && !siren.warned) {
        siren.warned = true;
        emit('sirenWarning', { label: 'SIREN SONG — STEER AWAY AND BREAK THE SPELL' });
      }

      if (distance < radius && siren.cooldown <= 0) {
        const pull = (1 - distance / radius) * (siren.definition.intensity ?? 0.8);
        const targetYaw = Math.atan2(-dx, -dz);
        let angle = targetYaw - playerShip.yaw;
        while (angle > Math.PI) angle -= Math.PI * 2;
        while (angle < -Math.PI) angle += Math.PI * 2;
        playerShip.yawVelocity += Math.sign(angle) * Math.min(Math.abs(angle), 1) * pull * 2.4 * delta;
        emit('sirenPulling', { intensity: pull, steerPull: -Math.sign(angle) * pull });
        siren.wasPulling = true;

        if (!siren.qteTriggered && distance < radius * 0.7) {
          const accepted = this._qteSystem?.trigger({
            source: 'siren',
            metadata: { source: 'siren' },
            onSuccess: () => {
              siren.cooldown = 7;
              siren.qteTriggered = false;
              siren.group.visible = false;
            },
            onFail: () => {
              siren.cooldown = 4;
              siren.qteTriggered = false;
              if (this._graceAvailable) {
                // Tutorial mercy: the first failure teaches instead of punishing.
                this._graceAvailable = false;
                emit('sirenWarning', { label: "THE SONG LOOSENS ITS GRIP — IT WON'T BE SO MERCIFUL NEXT TIME" });
                return;
              }
              playerShip.takeDamage(10, 'siren');
            },
          });
          if (accepted) siren.qteTriggered = true;
        }
      } else if (siren.wasPulling) {
        // Leaving range (or entering cooldown) clears the wheel tint and edge glow.
        siren.wasPulling = false;
        emit('sirenPulling', { intensity: 0, steerPull: 0 });
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
    this._sirens.push({ definition, group, idol, cooldown: 0, qteTriggered: false, warned: false, wasPulling: false });
  }
}

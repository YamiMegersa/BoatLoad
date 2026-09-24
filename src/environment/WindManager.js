import * as THREE from 'three';

export class WindManager {
  /**
   * @param {Object} levelCfg 
   */
  constructor(levelCfg) {
    this.zones = [];
    
    // Convert globalWindDir (0-360 degrees) to a direction vector. Default to 0 (North/Forward = 0,0,-1)
    const globalWindDirAngle = levelCfg && levelCfg.globalWindDir !== undefined ? levelCfg.globalWindDir : 45; 
    // Rotate the forward vector by the angle around the Y axis
    this.defaultWind = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(globalWindDirAngle)).normalize();
    
    if (levelCfg && levelCfg.obstacles) {
      for (const obs of levelCfg.obstacles) {
        if (obs.type === 'wind_zone' && obs.position) {
          // Scale determines radius (e.g. scale 1 = radius 10)
          const radius = (obs.scale || 1.0) * 10.0;
          
          // Rotation determines direction (around Y axis)
          // Default direction if no rotation is (0, 0, -1) [North/Forward]
          const rotationY = obs.rotation !== undefined ? obs.rotation : 0;
          
          // A vector pointing forward (0,0,-1), rotated by rotationY
          const dir = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationY).normalize();
          
          this.zones.push({
            x: obs.position.x,
            z: obs.position.z,
            radiusSq: radius * radius,
            dir: dir
          });
        }
      }
    }
  }

  getWindAt(x, z, target = null) {
    if (!target) target = new THREE.Vector3();
    target.copy(this.defaultWind);
    
    for (const zone of this.zones) {
      const dx = x - zone.x;
      const dz = z - zone.z;
      const distSq = dx * dx + dz * dz;
      
      if (distSq <= zone.radiusSq) {
        const dist = Math.sqrt(distSq);
        const radius = Math.sqrt(zone.radiusSq);
        
        // Outer 50% of the zone is the transition area. Inner 50% is full strength.
        const transitionStart = radius;
        const transitionEnd = radius * 0.5;
        
        let blend = 1.0;
        if (dist > transitionEnd) {
          blend = 1.0 - ((dist - transitionEnd) / (transitionStart - transitionEnd));
          // smoothstep
          blend = blend * blend * (3 - 2 * blend);
        }
        
        target.lerp(zone.dir, blend).normalize();
        break;
      }
    }
    return target;
  }
}

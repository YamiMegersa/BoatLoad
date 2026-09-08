import * as THREE from 'three';

export class WindManager {
  /**
   * @param {Object} levelCfg 
   */
  constructor(levelCfg) {
    this.zones = [];
    this.defaultWind = new THREE.Vector3(1, 0, -1).normalize(); // Global fallback wind
    
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

  /**
   * Get the wind direction vector at a specific location.
   * If inside a wind zone, returns that zone's direction.
   * If overlapping multiple, returns the first one (or we could average them).
   * @param {number} x 
   * @param {number} z 
   * @returns {THREE.Vector3} Normalized wind direction
   */
  getWindAt(x, z) {
    for (const zone of this.zones) {
      const dx = x - zone.x;
      const dz = z - zone.z;
      if (dx * dx + dz * dz <= zone.radiusSq) {
        return zone.dir;
      }
    }
    return this.defaultWind;
  }
}

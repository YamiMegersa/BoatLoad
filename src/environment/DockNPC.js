import * as THREE from 'three';
import { getAssetUrl } from '../utils/paths.js';

/**
 * DockNPC — 2D Humanoid Sprite that walks from the island to the shop counter.
 * Features smooth multi-waypoint navigation, walking bob, step squish,
 * dynamic billboarding towards the camera, contact shadow, and arrival bounce.
 */
export class DockNPC {
  /**
   * @param {THREE.Group} parentGroup The DockStall parent group
   */
  constructor(parentGroup) {
    this.parentGroup = parentGroup;
    this.group = new THREE.Group();
    this.group.name = 'DockNPC';
    this.group.visible = false;

    // Load custom NPC texture (cached per path)
    this._loader = new THREE.TextureLoader();
    this._textureCache = new Map();
    this.baseAspect = 734 / 998;
    this.baseScaleX = 1.0;
    this.baseScaleY = 1.0;

    // Cutout proportions (734 x 998)
    this.height = 3.3;
    this.width = this.height * this.baseAspect;

    // Plane geometry with bottom pivot at feet, raised slightly so torso & hands clear counter
    this.baseElevation = 0.35;
    const geo = new THREE.PlaneGeometry(this.width, this.height);
    geo.translate(0, this.height / 2 + this.baseElevation, 0);

    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      alphaTest: 0.05,
      side: THREE.DoubleSide
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.userData = { isNPC: true };
    this.group.add(this.mesh);

    this.setSprite('assets/npc/luc.png');

    // Soft oval contact shadow on the dock timber beneath feet
    const shadowGeo = new THREE.CircleGeometry(0.55, 24);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x140d07,
      transparent: true,
      opacity: 0.5,
      depthWrite: false
    });
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadow.position.y = 0.02;
    this.group.add(this.shadow);

    // Key waypoints in DockStall local coordinates:
    // WP0: Island trail approach / meadow edge
    // WP1: Wharf dock pier entrance
    // WP2: Front counter customer station (kept comfortably back from counter to eliminate clipping)
    this.waypoints = [
      new THREE.Vector3(-14.0, 2.14, 0.4),
      new THREE.Vector3(-6.0, 2.14, 0.5),
      new THREE.Vector3(2.1, 2.14, 0.45)
    ];

    this.isWalking = false;
    this.hasArrived = false;
    this.walkTimer = 0;
    this.walkDuration = 4.0; // 4 seconds of walking
    this.onArrivedCallback = null;
    this.idleTimer = 0;
    this.arriveHopTimer = 0;

    // Place initially at spawn point
    this.group.position.copy(this.waypoints[0]);
    if (this.parentGroup) {
      this.parentGroup.add(this.group);
    }
  }

  /**
   * Switch the NPC sprite texture for the active day's customer and adjust aspect ratio.
   * @param {string} spritePath Relative asset path (e.g. 'assets/npc/luc.png')
   */
  setSprite(spritePath = 'assets/npc/custom_npc.png') {
    const url = getAssetUrl(spritePath);
    const applyTex = (tex) => {
      this.texture = tex;
      if (this.mesh && this.mesh.material) {
        this.mesh.material.map = tex;
        this.mesh.material.needsUpdate = true;
      }
      const img = tex.image;
      if (img && img.width && img.height) {
        const aspect = img.width / img.height;
        // Full-body narrow cutouts (e.g. caelum.png aspect ~0.34) get a slight height boost
        // so their head and upper body stand comfortably above the counter window
        this.baseScaleY = aspect < 0.45 ? 1.18 : (aspect < 0.6 ? 1.06 : 1.0);
        this.baseScaleX = this.baseScaleY * (aspect / this.baseAspect);
      } else {
        this.baseScaleX = 1.0;
        this.baseScaleY = 1.0;
      }
      if (this.mesh) {
        this.mesh.scale.set(this.baseScaleX, this.baseScaleY, 1.0);
      }
    };

    if (this._textureCache.has(url)) {
      applyTex(this._textureCache.get(url));
      return;
    }

    const tex = this._loader.load(url, (loadedTex) => {
      applyTex(loadedTex);
    });
    tex.colorSpace = THREE.SRGBColorSpace;
    this._textureCache.set(url, tex);
    applyTex(tex);
  }

  /**
   * Reset NPC to initial hidden state at the start of the island trail.
   */
  reset() {
    this.onArrivedCallback = null;
    this.group.visible = false;
    this.isWalking = false;
    this.hasArrived = false;
    this.walkTimer = 0;
    this.arriveHopTimer = 0;
    this.group.position.copy(this.waypoints[0]);
  }

  /**
   * Start walking from island towards the counter window.
   * @param {() => void} onArrived Callback when NPC reaches the counter
   */
  startWalkToCounter(onArrived) {
    this.onArrivedCallback = onArrived;
    this.group.visible = true;
    this.isWalking = true;
    this.hasArrived = false;
    this.walkTimer = 0;
    this.arriveHopTimer = 0;
    this.group.position.copy(this.waypoints[0]);
  }

  /**
   * Per-frame update for walking, bobbing, camera billboarding, and idle breathing.
   */
  update(delta, time, camera) {
    if (!this.group.visible) return;

    this.idleTimer += delta;

    // Billboard towards the camera so the 2D cutout is always facing the viewer
    if (camera && this.parentGroup) {
      const camWorld = camera.getWorldPosition(new THREE.Vector3());
      const camLocal = this.parentGroup.worldToLocal(camWorld);
      const dx = camLocal.x - this.group.position.x;
      const dz = camLocal.z - this.group.position.z;
      const angle = Math.atan2(dx, dz);
      this.mesh.rotation.y = angle;
    }

    if (this.isWalking) {
      this.walkTimer += delta;
      const t = Math.min(1.0, this.walkTimer / this.walkDuration);

      // Piecewise navigation across waypoints:
      // WP0 -> WP1 (t: 0 to 0.48)
      // WP1 -> WP2 (t: 0.48 to 1.0)
      const tMid = 0.48;
      const curPos = new THREE.Vector3();
      if (t < tMid) {
        const segT = t / tMid;
        const ease = segT * segT * (3 - 2 * segT);
        curPos.lerpVectors(this.waypoints[0], this.waypoints[1], ease);
      } else {
        const segT = (t - tMid) / (1.0 - tMid);
        const ease = segT * segT * (3 - 2 * segT);
        curPos.lerpVectors(this.waypoints[1], this.waypoints[2], ease);
      }

      this.group.position.copy(curPos);

      // Animated walking stride: rhythmic vertical bob & sway
      const stepRate = 12.0;
      const bob = Math.abs(Math.sin(this.walkTimer * stepRate)) * 0.12;
      const sway = Math.sin(this.walkTimer * stepRate) * 0.045;
      const squish = 1.0 - 0.035 * Math.sin(this.walkTimer * stepRate * 2.0);

      this.mesh.position.y = bob;
      this.mesh.rotation.z = sway;
      this.mesh.scale.set(this.baseScaleX, this.baseScaleY * squish, 1.0);
      this.shadow.scale.setScalar(1.0 + bob * 0.4);

      if (t >= 1.0) {
        this.isWalking = false;
        this.hasArrived = true;
        this.arriveHopTimer = 0.45;
        this.group.position.copy(this.waypoints[2]);

        if (this.onArrivedCallback) {
          const cb = this.onArrivedCallback;
          this.onArrivedCallback = null;
          cb();
        }
      }
    } else if (this.arriveHopTimer > 0) {
      // Cheerful greeting hop upon arriving in front of the counter
      this.arriveHopTimer -= delta;
      const hopT = Math.max(0, this.arriveHopTimer / 0.45);
      const hopY = Math.sin((1 - hopT) * Math.PI) * 0.22;
      this.mesh.position.y = hopY;
      this.mesh.rotation.z = 0;
      this.mesh.scale.set(this.baseScaleX, this.baseScaleY, 1.0);
    } else if (this.hasArrived) {
      // Idle breathing stance in front of counter
      const breathe = Math.sin(this.idleTimer * 2.2) * 0.035;
      this.mesh.position.y = Math.max(0, breathe);
      this.mesh.rotation.z = 0;
      this.mesh.scale.set(this.baseScaleX * (1.0 + breathe * 0.15), this.baseScaleY * (1.0 - breathe * 0.15), 1.0);
      this.shadow.scale.setScalar(1.0);
    }
  }

  dispose() {
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
    if (this.texture) this.texture.dispose();
    if (this.mesh) {
      if (this.mesh.geometry) this.mesh.geometry.dispose();
      if (this.mesh.material) this.mesh.material.dispose();
    }
    if (this.shadow) {
      if (this.shadow.geometry) this.shadow.geometry.dispose();
      if (this.shadow.material) this.shadow.material.dispose();
    }
  }
}

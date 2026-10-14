import * as THREE from 'three';
import { emit } from '../core/EventBus.js';

// ---------------------------------------------------------------------------
// TentacleFollower — Kraken-Rooted Ocean Tentacle (Reaching from Kraken Origin)
// ---------------------------------------------------------------------------

/**
 * A colossal Kraken tentacle whose root is permanently anchored at the Kraken boss
 * body (kraken origin), stretching and slithering across the ocean waves to pursue
 * and flank the player's ship.
 *
 * Key Design Features:
 * - Rooted at `krakenPos`: Segment 0 stays anchored at the octopus monster body.
 * - Dynamic Ocean Reach: The midsection undulates across the sea surface in smooth,
 *   majestic serpentine waves bridging the distance from the Kraken to the boat.
 * - Flank Stalking: The terminal section erupts into a towering 6.2m vertical hook
 *   pacing alongside the ship's gunwale so the player's view of the vessel is never obscured.
 * - Jitter-Free: Employs exponential damping on ship yaw, target positioning,
 *   wave heights, and segment quaternions (slerp) for silky-smooth motion.
 *
 * States:
 *   'pursuing'  — reaching from Kraken origin to pace the player alongside the boat
 *   'attacking' — timer expired; the terminal hook slams down across the deck
 *   'caught'    — race won; terminal segments wrap tightly around the terrain anchor
 *   'idle'      — inactive / hidden
 */
export class TentacleFollower {
  /**
   * @param {object} config
   * @param {THREE.Vector3} config.spawnPos       World position to spawn at
   * @param {THREE.Vector3} [config.krakenPos]    Position of the Kraken boss body
   * @param {number}        config.speed          Base follow speed
   * @param {number}        [config.segmentCount] Number of segments (default 36)
   * @param {number}        [config.segmentLen]   Segment length
   * @param {THREE.Scene}   scene
   * @param {import('../environment/Ocean.js').Ocean} ocean
   */
  constructor(config, scene, ocean) {
    this._scene = scene;
    this._ocean = ocean;
    this._speed = config.speed ?? 12;
    this._state = 'idle';
    this._time = 0;
    this._hasImpacted = false;
    this._attackTimer = 0;

    const segCount = config.segmentCount ?? 36;
    this._segmentCount = segCount;
    this._segmentLen = config.segmentLen ?? 2.5;

    // Kraken origin socket where the tentacle attaches to the octopus body
    this._krakenOrigin = config.krakenPos
      ? config.krakenPos.clone()
      : (config.spawnPos ? config.spawnPos.clone() : new THREE.Vector3(0, -2, -180));

    // Progress of the initial reach from Kraken to the player (0 = at kraken, 1 = fully reached boat)
    this._reachProgress = 0.0;

    // Smoothed values to eliminate any screen jitter
    this._smoothedFlankPos = null;
    this._smoothedYaw = undefined;
    this._smoothedWaveH = undefined;

    // Root group
    this._group = new THREE.Group();

    // Segment meshes & suckers
    /** @type {THREE.Mesh[]} */
    this._segments = [];

    // Tapering dimensions: massive thick base at the Kraken body down to slender tip
    const baseRadius = 2.4;
    const tipRadius = 0.20;

    // Materials - deep crimson skin and warm tan suckers matching the octopus model
    const tentacleMat = new THREE.MeshPhongMaterial({
      color: 0x8a2323,
      emissive: 0x1a0606,
      shininess: 65,
      specular: 0xee7777,
    });

    const suckerMat = new THREE.MeshPhongMaterial({
      color: 0xd49562,
      emissive: 0x2e140a,
      shininess: 45,
    });

    for (let i = 0; i < segCount; i++) {
      const t = i / (segCount - 1); // 0 = base at kraken, 1 = tip near boat
      const rTop = THREE.MathUtils.lerp(baseRadius, tipRadius, Math.min(1, (i + 1) / segCount));
      const rBot = THREE.MathUtils.lerp(baseRadius, tipRadius, i / segCount);

      // Cylinder oriented along +Z: base at (0, 0, 0), top at (0, 0, segmentLen)
      const geo = new THREE.CylinderGeometry(rTop, rBot, this._segmentLen, 10);
      geo.rotateX(Math.PI / 2);
      geo.translate(0, 0, this._segmentLen / 2);

      const mesh = new THREE.Mesh(geo, tentacleMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;

      // Add dual sucker discs along the inner curve / underside
      if (i >= 2) {
        const sRadius = THREE.MathUtils.lerp(0.36, 0.08, t);
        const suckerGeo = new THREE.CylinderGeometry(sRadius * 0.8, sRadius, 0.10, 8);
        suckerGeo.rotateX(Math.PI / 2);

        const leftSucker = new THREE.Mesh(suckerGeo, suckerMat);
        leftSucker.position.set(-sRadius * 0.85, -rBot * 0.75, this._segmentLen * 0.5);
        mesh.add(leftSucker);

        const rightSucker = new THREE.Mesh(suckerGeo, suckerMat);
        rightSucker.position.set(sRadius * 0.85, -rBot * 0.75, this._segmentLen * 0.5);
        mesh.add(rightSucker);
      }

      this._group.add(mesh);
      this._segments.push(mesh);
    }

    // Water surface churn & foam splash ring at Kraken root emergence
    const splashGeo = new THREE.RingGeometry(1.2, 3.6, 24);
    const splashMat = new THREE.MeshBasicMaterial({
      color: 0xaaffdd,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this._krakenSplashRing = new THREE.Mesh(splashGeo, splashMat);
    this._krakenSplashRing.rotation.x = -Math.PI / 2;
    this._krakenSplashRing.userData.noGodRays = true;
    this._krakenSplashRing.userData.noOcclusion = true;
    this._group.add(this._krakenSplashRing);

    // Secondary splash ring where the tentacle breaches next to the ship
    const shipSplashGeo = new THREE.RingGeometry(0.8, 2.5, 24);
    this._shipSplashRing = new THREE.Mesh(shipSplashGeo, splashMat.clone());
    this._shipSplashRing.rotation.x = -Math.PI / 2;
    this._shipSplashRing.userData.noGodRays = true;
    this._shipSplashRing.userData.noOcclusion = true;
    this._group.add(this._shipSplashRing);

    // Initial positioning at Kraken origin
    for (const seg of this._segments) {
      seg.position.copy(this._krakenOrigin);
    }

    scene.add(this._group);
  }

  /** @returns {'idle'|'pursuing'|'attacking'|'caught'} */
  get state() { return this._state; }

  /**
   * Activate the tentacle — dynamically reach from the Kraken origin to the player.
   * @param {import('../obstacle/PlayerShip.js').PlayerShip} [playerShip]
   * @param {THREE.Vector3} [krakenPos]
   */
  activate(playerShip, krakenPos = null) {
    this._state = 'pursuing';
    this._hasImpacted = false;
    this._attackTimer = 0;
    this._reachProgress = 0.0; // Reach surges out from the Kraken origin!
    this._smoothedWaveH = undefined;

    if (krakenPos) {
      this._krakenOrigin.copy(krakenPos);
    }

    if (playerShip) {
      this._smoothedYaw = playerShip.yaw ?? 0;
      const shipPos = playerShip.mesh.position;
      const yaw = this._smoothedYaw;
      const behindDir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
      const rightDir = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();
      this._smoothedFlankPos = shipPos.clone()
        .addScaledVector(behindDir, 18.0)
        .addScaledVector(rightDir, 7.5);
    }
  }

  /**
   * Reset position behind player (compatibility method).
   * @param {import('../obstacle/PlayerShip.js').PlayerShip} playerShip
   */
  resetBehind(playerShip) {
    this.activate(playerShip, this._krakenOrigin);
  }

  /**
   * Switch to attack mode (player failed the race).
   */
  startAttack() {
    this._state = 'attacking';
    this._hasImpacted = false;
    this._attackTimer = 0;
  }

  /**
   * Freeze the tentacle in place (wrapped around terrain).
   */
  catch() {
    this._state = 'caught';
  }

  /**
   * Per-frame update.
   * @param {number} delta
   * @param {import('../obstacle/PlayerShip.js').PlayerShip} playerShip
   * @param {number} [timeRatio=1.0] Ratio of time remaining (1.0 = start, 0.0 = expired)
   */
  update(delta, playerShip, timeRatio = 1.0) {
    if (this._state === 'idle' || this._state === 'caught') return;

    this._time += delta;

    if (this._state === 'pursuing') {
      this._updatePursuing(delta, playerShip, timeRatio);
    } else if (this._state === 'attacking') {
      this._updateAttacking(delta, playerShip);
    }
  }

  // -----------------------------------------------------------------------
  // Internal Updates
  // -----------------------------------------------------------------------

  _updatePursuing(delta, playerShip, timeRatio) {
    const shipPos = playerShip.mesh.position;
    const yaw = playerShip.yaw ?? 0;

    // Smooth ship yaw to filter out rapid steering flutter and wave rolling
    if (this._smoothedYaw === undefined) this._smoothedYaw = yaw;
    let diff = (yaw - this._smoothedYaw) % (Math.PI * 2);
    if (diff < -Math.PI) diff += Math.PI * 2;
    if (diff > Math.PI) diff -= Math.PI * 2;
    this._smoothedYaw += diff * (1.0 - Math.exp(-5.0 * delta));

    // Direction vectors in world coordinates:
    const behindDir = new THREE.Vector3(Math.sin(this._smoothedYaw), 0, Math.cos(this._smoothedYaw)).normalize();
    const rightDir = new THREE.Vector3(Math.cos(this._smoothedYaw), 0, -Math.sin(this._smoothedYaw)).normalize();

    // Approach relative to time remaining:
    // Placed on the flank (starboard) alongside the boat so player view is 100% unobstructed:
    // When timeRatio = 1.0 (start), distance is 18m behind and 8.2m to the side.
    // When timeRatio = 0.0 (near end), distance is 2.5m behind and 6.2m to the side (pacing the boat!).
    const clampedRatio = Math.max(0, Math.min(1, timeRatio));
    const rearDist = 2.5 + 15.5 * clampedRatio;
    const sideDist = 6.2 + 2.0 * clampedRatio;

    const rawTargetFlankPos = shipPos.clone()
      .addScaledVector(behindDir, rearDist)
      .addScaledVector(rightDir, sideDist);

    if (!this._smoothedFlankPos) {
      this._smoothedFlankPos = rawTargetFlankPos.clone();
    } else {
      // Exponential smoothing to track flank target with zero jitter
      this._smoothedFlankPos.lerp(rawTargetFlankPos, 1.0 - Math.exp(-4.5 * delta));
    }

    // Advance reach progress from the Kraken origin across the water to the boat
    this._reachProgress = Math.min(1.0, this._reachProgress + delta * 0.85);

    // Update spine points from Kraken origin to the flank target
    this._updateSpine(playerShip, clampedRatio, 0, delta);
  }

  _updateAttacking(delta, playerShip) {
    this._attackTimer += delta;

    // Update spine with attack progression
    this._updateSpine(playerShip, 0.0, this._attackTimer, delta);

    const shipPos = playerShip.mesh.position;

    // Slam impact occurs precisely at the climax of the downward smash (1.05s)
    if (this._attackTimer >= 1.05 && !this._hasImpacted && !playerShip.isImmune()) {
      this._hasImpacted = true;
      const rockDamage = 20;

      // Deal damage and trigger physical response
      playerShip.takeDamage(rockDamage, 'kraken_tentacle');
      playerShip.setImmune(2.0);

      // Downward crushing impulse:
      // The tentacle crashes down from above, driving the ship down into the waves
      // and pitching/rolling it violently away from the strike origin
      const dx = shipPos.x - this._krakenOrigin.x;
      const dz = shipPos.z - this._krakenOrigin.z;
      const pushDist = Math.hypot(dx, dz) || 0.001;
      const dirX = dx / pushDist;
      const dirZ = dz / pushDist;

      // Heavy roll & pitch impulse (rocking violently in water)
      playerShip.bounceBack(dirX * 8.0, dirZ * 8.0, 'rock');

      // Downward smash impulse: strong negative Y impulse + displacement
      playerShip.applyKnockback(new THREE.Vector3(dirX * 25.0, -35.0, dirZ * 25.0));

      // Audio & feedback
      emit('obstacleHit', { type: 'rock', damage: rockDamage });
      emit('playSound', { sound: 'collision' });
    }
  }

  /**
   * Computes the 3D spine for the continuous tentacle reaching from the Kraken origin
   * across the ocean to the player ship.
   */
  _updateSpine(playerShip, clampedRatio, attackTimer = 0, delta = 0.016) {
    const shipPos = playerShip.mesh.position;
    const flankPos = this._smoothedFlankPos || shipPos;

    // Vector from Kraken origin to the flank target
    const V = new THREE.Vector3().subVectors(flankPos, this._krakenOrigin);
    V.y = 0;
    const totalDist = V.length() || 0.001;
    const U = V.clone().normalize(); // Unit vector from Kraken to ship
    const W = new THREE.Vector3(-U.z, 0, U.x); // Perpendicular lateral vector

    // Vector from flank position to ship center
    const toShip = new THREE.Vector3().subVectors(shipPos, flankPos);
    toShip.y = 0;
    const toShipDir = toShip.clone().normalize();

    const N = this._segmentCount;
    const pts = [];

    // Terminal arch parameters
    let peakHeight = 6.2;
    let tipTargetY = 2.6;
    let overheadSweep = 0.0; // 0 = at flank, 1 = centered directly over ship deck

    if (this._state === 'attacking') {
      if (attackTimer < 0.75) {
        // Phase 1 (0.0s - 0.75s): Dramatic rearing wind-up!
        // Rears 15.5m high into the air, curling directly OVER the ship's main deck
        const t = attackTimer / 0.75;
        const ease = t * t * (3 - 2 * t);
        peakHeight = THREE.MathUtils.lerp(6.2, 15.5, ease);
        tipTargetY = THREE.MathUtils.lerp(2.6, 9.5, ease);
        overheadSweep = THREE.MathUtils.lerp(0.0, 1.0, ease);
      } else if (attackTimer < 1.10) {
        // Phase 2 (0.75s - 1.10s): Violent downward smash onto the ship!
        // Accelerates with heavy gravity curve, crushing straight down onto the deck
        const t = (attackTimer - 0.75) / 0.35;
        const slamEase = Math.pow(t, 2.5); // Fast downward acceleration
        peakHeight = THREE.MathUtils.lerp(15.5, 2.2, slamEase);
        tipTargetY = THREE.MathUtils.lerp(9.5, 0.45, slamEase); // Slams down onto the deck!
        overheadSweep = 1.0; // Directly over the ship
      } else if (attackTimer < 1.65) {
        // Phase 3 (1.10s - 1.65s): Crushing press across the deck
        peakHeight = 2.0;
        tipTargetY = 0.45;
        overheadSweep = 1.0;
      } else {
        // Phase 4 (1.65s - 2.80s): Slides off the deck and recoils back into the sea
        const t = Math.min(1.0, (attackTimer - 1.65) / 1.15);
        const recoilEase = t * t;
        peakHeight = THREE.MathUtils.lerp(2.0, -2.5, recoilEase);
        tipTargetY = THREE.MathUtils.lerp(0.45, -3.5, recoilEase);
        overheadSweep = THREE.MathUtils.lerp(1.0, 0.0, recoilEase);
      }
    }

    // Midsection ocean traversal vs terminal boat flank threshold (s >= 0.70)
    const archThreshold = 0.70;

    for (let i = 0; i < N; i++) {
      const s = i / (N - 1); // 0 = Kraken body root, 1 = tip near ship
      // Dynamic reach progress stretches tentacle outward from the Kraken origin
      const eff = s * this._reachProgress;

      // Base interpolation between Kraken origin and the boat flank
      const pt = new THREE.Vector3().lerpVectors(this._krakenOrigin, flankPos, eff);

      // Lateral serpentine waves through the open ocean:
      // Pinned to 0 at Kraken root (s = 0) and at flank target (s = 1)
      const sinEnvelope = Math.sin(s * Math.PI);
      const lateralWave = Math.sin(eff * 10.0 - this._time * 2.2) * (sinEnvelope * Math.min(5.5, totalDist * 0.055));
      pt.addScaledVector(W, lateralWave);

      // Sample ocean wave height at this segment's coordinate
      let waveH = 0;
      if (this._ocean) {
        waveH = this._ocean.getWaveInfo(pt.x, pt.z).height;
      }

      let h = 0;
      if (s < archThreshold) {
        // Ocean traversal from Kraken: swimming along the sea, undulating in natural crests
        const seaBreach = Math.sin(eff * 12.0 - this._time * 2.8) * 0.75 - 0.2;
        h = seaBreach;
      } else {
        // Terminal section: sweeps overhead and slams down onto the ship deck!
        const u = (s - archThreshold) / (1.0 - archThreshold); // 0 to 1

        // Horizontal position:
        // u = 0 starts at the breach point near the flank.
        // As u increases to 1.0, it curves directly over the ship deck!
        const lateralToShip = new THREE.Vector3().subVectors(shipPos, flankPos);
        lateralToShip.y = 0;
        pt.addScaledVector(lateralToShip, overheadSweep * Math.sin(u * Math.PI * 0.5));

        // In normal pacing mode: gentle inward reach toward gunwale
        if (this._state !== 'attacking') {
          const reachT = (u - 0.2) / 0.8;
          if (reachT > 0) {
            const reachDist = (reachT * reachT) * 3.8;
            pt.addScaledVector(toShipDir, reachDist);
          }
        }

        // Vertical profile:
        // u = 0: water surface
        // u = 0.45: arch crest (up to 15.5m high during wind-up, 2.2m during slam)
        // u = 1.0: tip (reaches 10m high during wind-up, slams down to 0.45m onto deck)
        if (u < 0.45) {
          h = peakHeight * Math.sin((u / 0.45) * Math.PI * 0.5);
        } else {
          const v = (u - 0.45) / 0.55;
          h = peakHeight - (peakHeight - tipTargetY) * Math.sin(v * Math.PI * 0.5);
        }
      }

      pt.y = waveH + h;
      pts.push(pt);
    }

    // Animate water splash rings
    if (this._krakenSplashRing) {
      this._krakenSplashRing.position.set(this._krakenOrigin.x, this._krakenOrigin.y + 0.1, this._krakenOrigin.z);
      this._krakenSplashRing.rotation.z += delta * 1.5;
    }

    if (this._shipSplashRing && pts.length > 0) {
      const breachIdx = Math.floor(N * archThreshold);
      const breachPt = pts[breachIdx] || flankPos;
      this._shipSplashRing.position.set(breachPt.x, breachPt.y + 0.12, breachPt.z);
      this._shipSplashRing.rotation.z += delta * 2.5;
      const pulsate = 1.0 + Math.sin(this._time * 4.0) * 0.12;
      this._shipSplashRing.scale.set(pulsate, pulsate, 1.0);
    }

    // Orient and scale each cylinder segment along the spine
    const rotMatrix = new THREE.Matrix4();
    const upVec = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < N; i++) {
      const seg = this._segments[i];
      seg.position.copy(pts[i]);

      if (i < N - 1) {
        const segDist = pts[i].distanceTo(pts[i + 1]);
        const scaleZ = Math.max(0.01, segDist / this._segmentLen);
        seg.scale.set(1.0, 1.0, scaleZ);

        rotMatrix.lookAt(pts[i + 1], pts[i], upVec);
        const targetQ = new THREE.Quaternion().setFromRotationMatrix(rotMatrix);
        const slerpSpeed = (this._state === 'attacking' && attackTimer >= 0.75 && attackTimer < 1.10) ? 25.0 : 16.0;
        seg.quaternion.slerp(targetQ, 1.0 - Math.exp(-slerpSpeed * delta));
      } else {
        // Tip segment
        seg.scale.set(1.0, 1.0, 1.0);
        let tipTarget;
        if (this._state === 'attacking' && attackTimer < 1.10) {
          // Tip curls downward, pointing straight down into the ship deck!
          tipTarget = new THREE.Vector3(pts[i].x, pts[i].y - 2.0, pts[i].z);
        } else {
          tipTarget = new THREE.Vector3(shipPos.x, pts[i].y, shipPos.z);
        }
        rotMatrix.lookAt(tipTarget, pts[i], upVec);
        const targetQ = new THREE.Quaternion().setFromRotationMatrix(rotMatrix);
        seg.quaternion.slerp(targetQ, 1.0 - Math.exp(-14.0 * delta));
      }
    }
  }

  /**
   * Get the world position of the tentacle tip / menacing head.
   * @returns {THREE.Vector3}
   */
  getHeadPosition() {
    return this._segments[this._segmentCount - 1].position.clone();
  }

  /**
   * Get the world position of the prominent arch / head of the tentacle for cinematic defeat framing.
   * @returns {THREE.Vector3}
   */
  getDefeatFocusPosition() {
    // 78% along the spine is the crest of the arch near the player ship
    const idx = Math.min(this._segmentCount - 1, Math.floor(this._segmentCount * 0.78));
    if (this._segments[idx]) {
      return this._segments[idx].position.clone();
    }
    return this.getHeadPosition();
  }

  /**
   * Play sinking defeat animation when the tentacle is defeated / caught.
   * The entire tentacle writhes and sinks deep beneath the ocean surface.
   */
  playSinkAnimation() {
    this._state = 'caught';
    this._isSinking = true;
    this._sinkTimer = 0;
    this._sinkDuration = 2.6; // 2.6s sinking duration during cinematic fly-to
    this.setVisible(true);

    for (let i = 0; i < this._segmentCount; i++) {
      this._segments[i].userData.sinkStartPos = this._segments[i].position.clone();
    }
  }

  /**
   * Backwards-compatible alias for playSinkAnimation.
   */
  playWrapAnimation() {
    this.playSinkAnimation();
  }

  /**
   * Update sinking defeat animation.
   * @param {number} delta
   * @returns {boolean} True if still sinking, false once fully submerged beneath the water
   */
  updateSinkAnimation(delta) {
    if (!this._isSinking) return false;

    this._sinkTimer += delta;
    const progress = Math.min(1.0, this._sinkTimer / this._sinkDuration);
    // Smooth quadratic ease into the depths
    const sinkEased = progress * progress * (3.0 - 2.0 * progress);

    for (let i = 0; i < this._segmentCount; i++) {
      const seg = this._segments[i];
      const startPos = seg.userData.sinkStartPos;
      if (!startPos) continue;

      // Death tremor: thrashing dying spasms that fade out as it sinks
      const tremorAmp = (1.0 - progress) * 0.45;
      const deathTremor = tremorAmp * Math.sin(this._sinkTimer * 12.0 + i * 0.4);
      const lateralTremor = tremorAmp * Math.cos(this._sinkTimer * 9.0 + i * 0.35) * 0.35;

      // Pull down into the ocean to -18m below water
      seg.position.y = THREE.MathUtils.lerp(startPos.y, -18.0, sinkEased) + deathTremor;
      // Drift gently back towards Kraken origin
      seg.position.x = THREE.MathUtils.lerp(startPos.x, this._krakenOrigin.x, sinkEased * 0.15) + lateralTremor;
      seg.position.z = THREE.MathUtils.lerp(startPos.z, this._krakenOrigin.z, sinkEased * 0.15) + lateralTremor;
    }

    // Update segment orientations so the spine stays cohesive and realistic
    const tangent = new THREE.Vector3();
    const upVec = new THREE.Vector3(0, 1, 0);
    const lookMat = new THREE.Matrix4();
    const targetQ = new THREE.Quaternion();

    for (let i = 0; i < this._segmentCount - 1; i++) {
      const seg = this._segments[i];
      tangent.subVectors(this._segments[i + 1].position, seg.position);
      if (tangent.lengthSq() > 0.0001) {
        tangent.normalize();
        lookMat.lookAt(seg.position, this._segments[i + 1].position, upVec);
        targetQ.setFromRotationMatrix(lookMat);
        seg.quaternion.slerp(targetQ, Math.min(1.0, delta * 12.0));
      }
    }

    // Splash rings: foam pulses and churns at the breach point
    if (this._shipSplashRing) {
      this._shipSplashRing.rotation.z += delta * 2.5;
      const foamPulse = 1.0 + (1.0 - progress) * 0.6 * Math.sin(this._sinkTimer * 8.0);
      this._shipSplashRing.scale.set(foamPulse, foamPulse, foamPulse);
      if (progress > 0.65) {
        const fade = Math.max(0, (1.0 - progress) / 0.35);
        this._shipSplashRing.scale.multiplyScalar(fade);
      }
    }
    if (this._krakenSplashRing) {
      this._krakenSplashRing.rotation.z += delta * 1.5;
      this._krakenSplashRing.scale.multiplyScalar(Math.max(0, 1.0 - delta * 1.2));
    }

    if (progress >= 1.0) {
      this._isSinking = false;
      this.setVisible(false);
      return false; // Sinking finished!
    }

    return true; // Still sinking
  }

  /**
   * Backwards-compatible alias for updateSinkAnimation.
   */
  updateWrapAnimation(delta) {
    return this.updateSinkAnimation(delta);
  }

  /**
   * Set visibility of the entire tentacle.
   * @param {boolean} visible
   */
  setVisible(visible) {
    this._group.visible = visible;
  }

  dispose() {
    for (const seg of this._segments) {
      seg.geometry.dispose();
      if (Array.isArray(seg.material)) {
        seg.material.forEach(m => m.dispose());
      } else {
        seg.material?.dispose();
      }
    }
    if (this._krakenSplashRing) {
      this._krakenSplashRing.geometry.dispose();
      this._krakenSplashRing.material.dispose();
    }
    if (this._shipSplashRing) {
      this._shipSplashRing.geometry.dispose();
      this._shipSplashRing.material.dispose();
    }
    this._scene?.remove(this._group);
  }
}

import * as THREE from 'three';

/**
 * GhostMerchant — Voxel Pac-Man style spectral figure manning the "Deadly Business" stall.
 * Features an authentic 3D voxel arcade Pac-Man ghost silhouette (arched dome top, rounded body,
 * 4 wavy bottom skirt ruffles), large expressive Pac-Man ghost eyes with dynamic player-tracking pupils,
 * ethereal levitation floating bob, and full raycast interactability.
 */
export class GhostMerchant {
  /**
   * @param {THREE.Group} parentGroup Group to attach the merchant to (e.g. stallGroup)
   * @param {THREE.Vector3} position Local position behind counter
   */
  constructor(parentGroup, position = new THREE.Vector3(0, 1.55, 0.40)) {
    this.parentGroup = parentGroup;
    this.group = new THREE.Group();
    this.group.name = 'GhostMerchant';
    this.group.position.copy(position);
    this.baseY = position.y;

    this.interactables = [];
    this._buildVoxelPacman();

    if (this.parentGroup) {
      this.parentGroup.add(this.group);
    }
  }

  _buildVoxelPacman() {
    // Proportions tailored for the stall counter: ~0.58m wide x 0.68m high x 0.58m deep
    const W = 12; // width in voxels
    const D = 12; // depth in voxels
    const H = 14; // height in voxels
    const voxelSize = 0.048; // 4.8 cm per voxel

    this.voxelSize = voxelSize;

    const halfW = (W - 1) / 2;
    const halfD = (D - 1) / 2;

    // 3D voxel grid
    const grid = Array.from({ length: H }, () =>
      Array.from({ length: D }, () => Array(W).fill(0))
    );

    for (let y = 0; y < H; y++) {
      for (let z = 0; z < D; z++) {
        for (let x = 0; x < W; x++) {
          const cx = x - halfW;
          const cz = z - halfD;
          const distXZ = Math.hypot(cx, cz);

          // Top Dome (layers 10..13)
          if (y >= 10) {
            const domeLayer = y - 9;
            let maxR;
            if (domeLayer === 4) maxR = 2.4;
            else if (domeLayer === 3) maxR = 4.0;
            else if (domeLayer === 2) maxR = 5.0;
            else maxR = 5.6;

            if (distXZ <= maxR) {
              grid[y][z][x] = 1;
            }
          }
          // Main Cylindrical Body (layers 3..9)
          else if (y >= 3) {
            const inBox = Math.abs(cx) <= 5.5 && Math.abs(cz) <= 5.5;
            const cornerCut = Math.abs(cx) >= 4.5 && Math.abs(cz) >= 4.5;
            if (inBox && !cornerCut) {
              grid[y][z][x] = 1;
            }
          }
          // Bottom Wavy Skirt / Tentacles (layers 0..2)
          else {
            const inPerimeter = distXZ >= 2.8 && Math.abs(cx) <= 5.5 && Math.abs(cz) <= 5.5 && !(Math.abs(cx) >= 4.5 && Math.abs(cz) >= 4.5);
            if (inPerimeter) {
              // 4 waves around perimeter
              const angle = Math.atan2(cz, cx) + Math.PI;
              const wave = Math.sin(angle * 4);
              if (y === 2) {
                grid[y][z][x] = 1;
              } else if (y === 1) {
                if (wave > -0.4) grid[y][z][x] = 1;
              } else if (y === 0) {
                if (wave > 0.2) grid[y][z][x] = 1; // scallop points
              }
            }
          }
        }
      }
    }

    // Helper to generate greedy-meshed buffer geometry with only exposed surface quads
    const buildGreedyBufferGeometry = (isSkirtVal) => {
      const positions = [];
      const normals = [];
      const indices = [];
      let vertexOffset = 0;

      const addQuad = (v0, v1, v2, v3, nx, ny, nz) => {
        positions.push(...v0, ...v1, ...v2, ...v3);
        for (let i = 0; i < 4; i++) normals.push(nx, ny, nz);
        indices.push(
          vertexOffset, vertexOffset + 1, vertexOffset + 2,
          vertexOffset, vertexOffset + 2, vertexOffset + 3
        );
        vertexOffset += 4;
      };

      const vs = voxelSize;

      // 1. +Y and -Y
      for (const dir of [1, -1]) {
        for (let y = 0; y < H; y++) {
          const mask = Array.from({ length: D }, () => Array(W).fill(false));
          for (let z = 0; z < D; z++) {
            for (let x = 0; x < W; x++) {
              if (!grid[y][z][x]) continue;
              if ((y <= 2) !== isSkirtVal) continue;
              const adjY = y + dir;
              const exposed = (adjY < 0 || adjY >= H || !grid[adjY][z][x]);
              if (exposed) mask[z][x] = true;
            }
          }
          for (let z = 0; z < D; z++) {
            for (let x = 0; x < W; x++) {
              if (!mask[z][x]) continue;
              let w = 1;
              while (x + w < W && mask[z][x + w]) w++;
              let h = 1;
              let canExpand = true;
              while (z + h < D && canExpand) {
                for (let k = 0; k < w; k++) {
                  if (!mask[z + h][x + k]) { canExpand = false; break; }
                }
                if (canExpand) h++;
              }
              for (let dy = 0; dy < h; dy++) {
                for (let dx = 0; dx < w; dx++) {
                  mask[z + dy][x + dx] = false;
                }
              }
              const xStart = (x - halfW - 0.5) * vs;
              const xEnd = (x + w - halfW - 0.5) * vs;
              const zStart = (z - halfD - 0.5) * vs;
              const zEnd = (z + h - halfD - 0.5) * vs;
              const yPos = (y - (H - 1) / 2 + (dir > 0 ? 0.5 : -0.5)) * vs;

              if (dir > 0) {
                addQuad(
                  [xStart, yPos, zEnd],
                  [xEnd, yPos, zEnd],
                  [xEnd, yPos, zStart],
                  [xStart, yPos, zStart],
                  0, 1, 0
                );
              } else {
                addQuad(
                  [xStart, yPos, zStart],
                  [xEnd, yPos, zStart],
                  [xEnd, yPos, zEnd],
                  [xStart, yPos, zEnd],
                  0, -1, 0
                );
              }
            }
          }
        }
      }

      // 2. +X and -X
      for (const dir of [1, -1]) {
        for (let x = 0; x < W; x++) {
          const mask = Array.from({ length: H }, () => Array(D).fill(false));
          for (let y = 0; y < H; y++) {
            if ((y <= 2) !== isSkirtVal) continue;
            for (let z = 0; z < D; z++) {
              if (!grid[y][z][x]) continue;
              const adjX = x + dir;
              const exposed = (adjX < 0 || adjX >= W || !grid[y][z][adjX]);
              if (exposed) mask[y][z] = true;
            }
          }
          for (let y = 0; y < H; y++) {
            for (let z = 0; z < D; z++) {
              if (!mask[y][z]) continue;
              let w = 1;
              while (z + w < D && mask[y][z + w]) w++;
              let h = 1;
              let canExpand = true;
              while (y + h < H && canExpand) {
                for (let k = 0; k < w; k++) {
                  if (!mask[y + h][z + k]) { canExpand = false; break; }
                }
                if (canExpand) h++;
              }
              for (let dy = 0; dy < h; dy++) {
                for (let dz = 0; dz < w; dz++) {
                  mask[y + dy][z + dz] = false;
                }
              }
              const zStart = (z - halfD - 0.5) * vs;
              const zEnd = (z + w - halfD - 0.5) * vs;
              const yStart = (y - (H - 1) / 2 - 0.5) * vs;
              const yEnd = (y + h - (H - 1) / 2 - 0.5) * vs;
              const xPos = (x - halfW + (dir > 0 ? 0.5 : -0.5)) * vs;

              if (dir > 0) {
                addQuad(
                  [xPos, yStart, zStart],
                  [xPos, yStart, zEnd],
                  [xPos, yEnd, zEnd],
                  [xPos, yEnd, zStart],
                  1, 0, 0
                );
              } else {
                addQuad(
                  [xPos, yStart, zEnd],
                  [xPos, yStart, zStart],
                  [xPos, yEnd, zStart],
                  [xPos, yEnd, zEnd],
                  -1, 0, 0
                );
              }
            }
          }
        }
      }

      // 3. +Z and -Z
      for (const dir of [1, -1]) {
        for (let z = 0; z < D; z++) {
          const mask = Array.from({ length: H }, () => Array(W).fill(false));
          for (let y = 0; y < H; y++) {
            if ((y <= 2) !== isSkirtVal) continue;
            for (let x = 0; x < W; x++) {
              if (!grid[y][z][x]) continue;
              const adjZ = z + dir;
              const exposed = (adjZ < 0 || adjZ >= D || !grid[y][adjZ][x]);
              if (exposed) mask[y][x] = true;
            }
          }
          for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
              if (!mask[y][x]) continue;
              let w = 1;
              while (x + w < W && mask[y][x + w]) w++;
              let h = 1;
              let canExpand = true;
              while (y + h < H && canExpand) {
                for (let k = 0; k < w; k++) {
                  if (!mask[y + h][x + k]) { canExpand = false; break; }
                }
                if (canExpand) h++;
              }
              for (let dy = 0; dy < h; dy++) {
                for (let dx = 0; dx < w; dx++) {
                  mask[y + dy][x + dx] = false;
                }
              }
              const xStart = (x - halfW - 0.5) * vs;
              const xEnd = (x + w - halfW - 0.5) * vs;
              const yStart = (y - (H - 1) / 2 - 0.5) * vs;
              const yEnd = (y + h - (H - 1) / 2 - 0.5) * vs;
              const zPos = (z - halfD + (dir > 0 ? 0.5 : -0.5)) * vs;

              if (dir > 0) {
                addQuad(
                  [xStart, yStart, zPos],
                  [xEnd, yStart, zPos],
                  [xEnd, yEnd, zPos],
                  [xStart, yEnd, zPos],
                  0, 0, 1
                );
              } else {
                addQuad(
                  [xEnd, yStart, zPos],
                  [xStart, yStart, zPos],
                  [xStart, yEnd, zPos],
                  [xEnd, yEnd, zPos],
                  0, 0, -1
                );
              }
            }
          }
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geo.setIndex(indices);
      geo.computeBoundingSphere();
      return geo;
    };

    const bodyGeo = buildGreedyBufferGeometry(false);
    const skirtGeo = buildGreedyBufferGeometry(true);

    // Spectral Inky Cyan Voxel Material
    const ghostMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x0891b2,
      emissiveIntensity: 0.65,
      roughness: 0.25,
      metalness: 0.08,
      flatShading: true,
      transparent: true,
      opacity: 0.92
    });

    // 1. Upper Body Mesh (288 tris vs 4,944 tris previously)
    this.bodyMesh = new THREE.Mesh(bodyGeo, ghostMat);
    this.bodyMesh.name = 'GhostMerchantBody';
    this.bodyMesh.castShadow = true;
    this.bodyMesh.receiveShadow = true;
    this.bodyMesh.userData = { isGhostMerchant: true };
    this.group.add(this.bodyMesh);
    this.interactables.push(this.bodyMesh);

    // 2. Skirt Group & Mesh (266 tris vs 2,016 tris previously)
    this.skirtGroup = new THREE.Group();
    this.group.add(this.skirtGroup);

    this.skirtMesh = new THREE.Mesh(skirtGeo, ghostMat);
    this.skirtMesh.name = 'GhostMerchantSkirt';
    this.skirtMesh.castShadow = true;
    this.skirtMesh.receiveShadow = true;
    this.skirtMesh.userData = { isGhostMerchant: true };
    this.skirtGroup.add(this.skirtMesh);
    this.interactables.push(this.skirtMesh);

    // 3. Iconic Pac-Man Ghost Eyes (Front face)
    const eyeWhiteMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.25,
      roughness: 0.2,
      flatShading: true
    });

    const pupilMat = new THREE.MeshStandardMaterial({
      color: 0x0c4a6e,
      emissive: 0x0284c7,
      emissiveIntensity: 0.45,
      roughness: 0.2,
      flatShading: true
    });

    this.eyesGroup = new THREE.Group();
    this.eyesGroup.position.set(0, 0.05, (halfD + 0.5) * voxelSize);
    this.group.add(this.eyesGroup);

    // White eye blocks (2 voxels wide, 3 voxels tall, 0.6 voxel thick)
    const eyeWhiteGeo = new THREE.BoxGeometry(voxelSize * 2.0, voxelSize * 3.0, voxelSize * 0.6);

    this.leftEyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    this.leftEyeWhite.position.set(-voxelSize * 2.4, 0, 0);
    this.leftEyeWhite.userData = { isGhostMerchant: true };
    this.eyesGroup.add(this.leftEyeWhite);
    this.interactables.push(this.leftEyeWhite);

    this.rightEyeWhite = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    this.rightEyeWhite.position.set(voxelSize * 2.4, 0, 0);
    this.rightEyeWhite.userData = { isGhostMerchant: true };
    this.eyesGroup.add(this.rightEyeWhite);
    this.interactables.push(this.rightEyeWhite);

    // Dark-blue pupil blocks (1.2 voxels wide, 1.8 voxels tall, 0.8 voxel thick)
    const pupilGeo = new THREE.BoxGeometry(voxelSize * 1.2, voxelSize * 1.8, voxelSize * 0.8);

    this.leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
    this.leftPupil.position.set(-voxelSize * 2.4, -voxelSize * 0.2, voxelSize * 0.3);
    this.leftPupil.userData = { isGhostMerchant: true };
    this.eyesGroup.add(this.leftPupil);
    this.interactables.push(this.leftPupil);

    this.rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
    this.rightPupil.position.set(voxelSize * 2.4, -voxelSize * 0.2, voxelSize * 0.3);
    this.rightPupil.userData = { isGhostMerchant: true };
    this.eyesGroup.add(this.rightPupil);
    this.interactables.push(this.rightPupil);

    this.basePupilX = voxelSize * 2.4;
    this.basePupilY = -voxelSize * 0.2;

    // 4. Soft Ghostly PointLight
    this.ghostLight = new THREE.PointLight(0x22d3ee, 1.8, 4.5, 1.8);
    this.ghostLight.position.set(0, 0.05, 0.3);
    this.group.add(this.ghostLight);

    // 5. Raycasting Hitbox for easy clicking
    const hitBoxGeo = new THREE.BoxGeometry(1.6, 2.2, 1.5);
    const hitBoxMat = new THREE.MeshBasicMaterial({ visible: false });
    this.hitBox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
    this.hitBox.position.set(0, 0.45, 0.25);
    this.hitBox.userData = { isGhostMerchant: true, noWalk: true, name: 'GhostMerchantHitbox' };
    this.group.add(this.hitBox);
    this.interactables.push(this.hitBox);
  }

  /**
   * Per-frame floating bob, Pac-Man skirt flutter, and pupil gaze tracking towards approaching players
   */
  update(delta, time, playerWorldPos = null) {
    if (!this.group.visible) return;

    // Levitation floating bob
    const bob = Math.sin(time * 2.2) * 0.045;
    this.group.position.y = this.baseY + bob;

    // Subtle playful floating sway (roll & yaw)
    this.group.rotation.z = Math.sin(time * 1.4) * 0.035;
    this.group.rotation.y = Math.sin(time * 0.9) * 0.03;

    // Skirt flutter animation
    if (this.skirtGroup) {
      this.skirtGroup.position.y = Math.sin(time * 5.5) * 0.018;
    }

    // Ghost light gentle pulse
    if (this.ghostLight) {
      this.ghostLight.intensity = 1.6 + Math.sin(time * 3.0) * 0.4;
    }

    // Dynamic Pac-Man pupil tracking: pupils look towards the player!
    if (playerWorldPos && this.leftPupil && this.rightPupil) {
      const ghostWorld = new THREE.Vector3();
      this.group.getWorldPosition(ghostWorld);

      const dx = playerWorldPos.x - ghostWorld.x;
      const dz = playerWorldPos.z - ghostWorld.z;

      // Transform world vector into local ghost forward/lateral axis
      const maxShiftX = this.voxelSize * 0.35;
      const shiftX = THREE.MathUtils.clamp(dx * 0.08, -maxShiftX, maxShiftX);
      const shiftY = THREE.MathUtils.clamp(-Math.abs(dz) * 0.02, -this.voxelSize * 0.25, 0.01);

      this.leftPupil.position.x = -this.basePupilX + shiftX;
      this.rightPupil.position.x = this.basePupilX + shiftX;
      this.leftPupil.position.y = this.basePupilY + shiftY;
      this.rightPupil.position.y = this.basePupilY + shiftY;
    }
  }

  getDialogue() {
    return 'Ghost has wares if sailor has coin';
  }

  dispose() {
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
    this.group.traverse(child => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
  }
}

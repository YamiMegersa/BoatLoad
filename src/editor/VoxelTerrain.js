import * as THREE from 'three';

const BLOCK = {
  AIR: 0,
  SAND: 1,
  GRASS: 2,
  SNOW: 3,
  DIRT: 4
};

const COLORS = [
  [0, 0, 0],
  [0.82, 0.70, 0.54], // 1: Sand
  [0.13, 0.54, 0.13], // 2: Grass
  [1, 1, 1],          // 3: Snow
  [0.54, 0.27, 0.07]  // 4: Dirt
];

const CHUNK_SIZE = 32;
const CHUNK_HEIGHT = 64;

export class VoxelTerrain {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();
    this.meshes = new Map();
    this.material = new THREE.MeshStandardMaterial({ 
        vertexColors: true, 
        roughness: 0.8, 
        flatShading: true 
    });
    
    this.meshGroup = new THREE.Group();
    this.scene.add(this.meshGroup);

    this.WATER_HEIGHT = 2;
    this.SAND_HEIGHT = 5;
    this.GRASS_HEIGHT = 15;
    this.SNOW_HEIGHT = 25;
    
    this.dirtyChunks = new Set();
  }

  serialize() {
    const data = {};
    for (const [key, chunk] of this.chunks.entries()) {
      data[key] = chunk;
    }
    return data;
  }

  deserialize(data) {
    if (!data) return;
    for (const key in data) {
      this.chunks.set(key, data[key]);
      const [cx, cz] = key.split(',').map(Number);
      this.updateChunkMesh(cx, cz);
    }
  }

  hasCollision(worldX, worldZ) {
    const wx = Math.floor(worldX);
    const wz = Math.floor(worldZ);
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    
    if (!this.chunks.has(this.getChunkKey(cx, cz))) return false;

    let lx = wx % CHUNK_SIZE; if (lx < 0) lx += CHUNK_SIZE;
    let lz = wz % CHUNK_SIZE; if (lz < 0) lz += CHUNK_SIZE;
    const chunk = this.getChunk(cx, cz);
    
    for (let y = 0; y < 5; y++) {
      if (chunk[lx + CHUNK_SIZE * (y + CHUNK_HEIGHT * lz)] !== BLOCK.AIR) {
        return true;
      }
    }
    return false;
  }

  getChunkKey(cx, cz) { return `${cx},${cz}`; }

  getChunk(cx, cz) {
    const key = this.getChunkKey(cx, cz);
    if (!this.chunks.has(key)) {
      this.chunks.set(key, new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE));
    }
    return this.chunks.get(key);
  }

  getVoxel(x, y, z) {
    if (y < 0 || y >= CHUNK_HEIGHT) return 0;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    return this.getChunk(cx, cz)[lx + CHUNK_SIZE * (y + CHUNK_HEIGHT * lz)];
  }

  setVoxel(x, y, z, v) {
    if (y < 0 || y >= CHUNK_HEIGHT) return;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    this.getChunk(cx, cz)[lx + CHUNK_SIZE * (y + CHUNK_HEIGHT * lz)] = v;
  }
  
  getBlockTypeForHeight(y) {
    if (y > this.SNOW_HEIGHT) return BLOCK.SNOW;
    if (y > this.SAND_HEIGHT) return BLOCK.GRASS;
    return BLOCK.SAND;
  }

  applyBrush(worldX, worldZ, radius, type, hitY = null) {
    worldX = Math.floor(worldX);
    worldZ = Math.floor(worldZ);
    radius = Math.floor(radius);

    let targetBuildY = null;
    if (hitY !== null && type === 'raise') {
      targetBuildY = Math.floor(hitY) + 1;
    }

    let chunksToUpdate = new Set();

    for (let x = worldX - radius; x <= worldX + radius; x++) {
      for (let z = worldZ - radius; z <= worldZ + radius; z++) {
        if ((x - worldX)**2 + (z - worldZ)**2 <= radius**2) {
            
          let topY = -1;
          for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
            if (this.getVoxel(x, y, z) !== BLOCK.AIR) {
              topY = y;
              break;
            }
          }

          if (type === 'raise') {
            let desiredY = (targetBuildY !== null && targetBuildY > topY) ? targetBuildY : topY + 1;
            if (desiredY >= CHUNK_HEIGHT) desiredY = CHUNK_HEIGHT - 1;
            
            if (desiredY > topY) {
              for (let y = topY + 1; y <= desiredY; y++) {
                let block = (y === desiredY) ? this.getBlockTypeForHeight(y) : BLOCK.DIRT;
                this.setVoxel(x, y, z, block);
              }
              chunksToUpdate.add(this.getChunkKey(Math.floor(x/CHUNK_SIZE), Math.floor(z/CHUNK_SIZE)));
            }
          } 
          else if (type === 'lower' && topY >= 0) {
            this.setVoxel(x, topY, z, BLOCK.AIR);
            if (topY - 1 >= 0) {
              let newSurface = this.getBlockTypeForHeight(topY - 1);
              this.setVoxel(x, topY - 1, z, newSurface);
            }
            chunksToUpdate.add(this.getChunkKey(Math.floor(x/CHUNK_SIZE), Math.floor(z/CHUNK_SIZE)));
          }
        }
      }
    }

    chunksToUpdate.forEach(key => {
      const [cx, cz] = key.split(',').map(Number);
      this.dirtyChunks.add(key);
      for (let nx = -1; nx <= 1; nx++) {
        for (let nz = -1; nz <= 1; nz++) {
          if (nx!==0 || nz!==0) this.dirtyChunks.add(this.getChunkKey(cx + nx, cz + nz));
        }
      }
    });
  }

  updateDirtyMeshes() {
    this.dirtyChunks.forEach(key => {
      const [cx, cz] = key.split(',').map(Number);
      this.updateChunkMesh(cx, cz);
    });
    this.dirtyChunks.clear();
  }

  updateChunkMesh(cx, cz) {
    const chunk = this.chunks.get(this.getChunkKey(cx, cz));
    if (!chunk) return;

    const positions = [];
    const colors = [];
    const normals = [];
    const indices = [];
    let offset = 0;

    const voxelFaceChecks = [
      { dir: [0, 1, 0], corners: [ [0,1,1], [1,1,1], [1,1,0], [0,1,0] ] },
      { dir: [0, -1, 0], corners: [ [0,0,0], [1,0,0], [1,0,1], [0,0,1] ] },
      { dir: [1, 0, 0], corners: [ [1,0,1], [1,0,0], [1,1,0], [1,1,1] ] },
      { dir: [-1, 0, 0], corners: [ [0,0,0], [0,0,1], [0,1,1], [0,1,0] ] },
      { dir: [0, 0, 1], corners: [ [0,0,1], [1,0,1], [1,1,1], [0,1,1] ] },
      { dir: [0, 0, -1], corners: [ [1,0,0], [0,0,0], [0,1,0], [1,1,0] ] },
    ];

    for (let y = 0; y < CHUNK_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const voxel = chunk[x + CHUNK_SIZE * (y + CHUNK_HEIGHT * z)];
          if (voxel === BLOCK.AIR) continue;

          const wx = cx * CHUNK_SIZE + x;
          const wy = y;
          const wz = cz * CHUNK_SIZE + z;

          for (const face of voxelFaceChecks) {
            const neighbor = this.getVoxel(wx + face.dir[0], wy + face.dir[1], wz + face.dir[2]);
            if (neighbor === BLOCK.AIR) {
              const c = COLORS[voxel];
              for (const corner of face.corners) {
                positions.push(wx + corner[0] - 0.5, wy + corner[1] - 0.5, wz + corner[2] - 0.5);
                colors.push(c[0], c[1], c[2]);
                normals.push(...face.dir);
              }
              indices.push(offset, offset+1, offset+2, offset, offset+2, offset+3);
              offset += 4;
            }
          }
        }
      }
    }

    if (positions.length === 0) {
      const key = this.getChunkKey(cx, cz);
      let mesh = this.meshes.get(key);
      if (mesh) {
        this.meshGroup.remove(mesh);
        mesh.geometry.dispose();
      }
      return;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);

    const key = this.getChunkKey(cx, cz);
    let mesh = this.meshes.get(key);
    if (mesh) {
      this.meshGroup.remove(mesh);
      mesh.geometry.dispose();
    }
    
    mesh = new THREE.Mesh(geometry, this.material);
    this.meshes.set(key, mesh);
    this.meshGroup.add(mesh);
  }

  updatePreview(worldX, worldZ, radius, type, hitY = null) {
    if (!this.previewMesh) {
      const boxGeo = new THREE.BoxGeometry(1.05, 1.05, 1.05);
      const boxMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5, wireframe: true });
      this.previewMesh = new THREE.InstancedMesh(boxGeo, boxMat, 2000);
      this.previewMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.previewMesh.frustumCulled = false;
      this.meshGroup.add(this.previewMesh);
    }

    if (type === 'raise') {
      this.previewMesh.material.color.setHex(0x00ff00);
    } else {
      this.previewMesh.material.color.setHex(0xff0000);
    }

    const bx = Math.floor(worldX);
    const bz = Math.floor(worldZ);

    let count = 0;
    const dummy = new THREE.Object3D();

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx*dx + dz*dz <= radius*radius) {
          const wx = bx + dx;
          const wz = bz + dz;
          
          const cx = Math.floor(wx / CHUNK_SIZE);
          const cz = Math.floor(wz / CHUNK_SIZE);
          let lx = wx % CHUNK_SIZE; if (lx < 0) lx += CHUNK_SIZE;
          let lz = wz % CHUNK_SIZE; if (lz < 0) lz += CHUNK_SIZE;

          const chunk = this.getChunk(cx, cz);
          let topY = -1;
          for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
            if (chunk[lx + CHUNK_SIZE * (y + CHUNK_HEIGHT * lz)] !== BLOCK.AIR) {
              topY = y;
              break;
            }
          }

          let targetY = topY;
          if (type === 'raise') {
            let targetBuildY = hitY !== null ? Math.floor(hitY) + 1 : topY + 1;
            targetY = (targetBuildY > topY) ? targetBuildY : topY + 1;
            if (targetY >= CHUNK_HEIGHT) continue;
          } else if (type === 'lower') {
            if (targetY < 0) continue;
          }

          dummy.position.set(wx + 0.5, targetY + 0.5, wz + 0.5);
          dummy.updateMatrix();
          this.previewMesh.setMatrixAt(count++, dummy.matrix);
          
          if (count >= 2000) break;
        }
      }
      if (count >= 2000) break;
    }

    this.previewMesh.count = count;
    this.previewMesh.instanceMatrix.needsUpdate = true;
  }

  hidePreview() {
    if (this.previewMesh) {
      this.previewMesh.count = 0;
      this.previewMesh.instanceMatrix.needsUpdate = true;
    }
  }
}

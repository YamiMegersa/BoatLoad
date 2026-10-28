import * as THREE from 'three';

export const BLOCK = {
  AIR: 0,
  SAND: 1,           // Golden dune sand
  GRASS: 2,          // Vibrant meadow grass
  SNOW: 3,           // Alpine snow & glacial ice
  DIRT: 4,           // Rich subsurface loam
  STONE: 5,          // Weathered granite / limestone cliffs
  WET_SAND: 6,       // Tidal shoreline / moist sand
  MOSS_STONE: 7,     // Lichen & moss covered boulders
  CLAY_STRATA: 8,    // Warm terracotta / sandstone strata
  SHALE_ROCK: 9,     // Volcanic basalt / dark slate
  ALPINE_TUNDRA: 10  // Highland heath / subalpine scrub
};

export const COLORS = [
  [0, 0, 0],             // 0: Air
  [0.86, 0.74, 0.50],    // 1: Sand
  [0.16, 0.56, 0.16],    // 2: Grass
  [0.96, 0.98, 1.00],    // 3: Snow
  [0.46, 0.28, 0.14],    // 4: Dirt
  [0.58, 0.56, 0.52],    // 5: Stone
  [0.54, 0.46, 0.36],    // 6: Wet Sand
  [0.26, 0.50, 0.24],    // 7: Moss Stone
  [0.72, 0.40, 0.24],    // 8: Clay Strata
  [0.24, 0.25, 0.28],    // 9: Shale Rock
  [0.42, 0.46, 0.25]     // 10: Alpine Tundra
];

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function lerpColor(c1, c2, t) {
  const ct = clamp(t, 0, 1);
  return [
    c1[0] + (c2[0] - c1[0]) * ct,
    c1[1] + (c2[1] - c1[1]) * ct,
    c1[2] + (c2[2] - c1[2]) * ct
  ];
}

export const BIOMES = ['tropical', 'volcanic', 'autumn', 'desert', 'nordic'];

export function getBiomeId(name) {
  const idx = BIOMES.indexOf(name);
  return idx >= 0 ? idx : 0;
}

export function encodeVoxel(blockType, biomeName) {
  if (blockType === BLOCK.AIR) return BLOCK.AIR;
  const biomeId = getBiomeId(biomeName);
  return (blockType & 0x0F) | ((biomeId & 0x0F) << 4);
}

export function decodeVoxel(voxel) {
  if (voxel === BLOCK.AIR) return { block: BLOCK.AIR, biome: 'tropical' };
  const block = voxel & 0x0F;
  const biomeId = (voxel >> 4) & 0x0F;
  const biome = BIOMES[biomeId] || 'tropical';
  return { block, biome };
}

const CHUNK_SIZE = 32;
const CHUNK_HEIGHT = 64;

// ---------------------------------------------------------------------------
// 2D Perlin & Fractal Brownian Motion (fBm) Noise for Organic Voxel Brushes
// ---------------------------------------------------------------------------
const P_SRC = [
  151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,
  8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,
  35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,
  134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,
  55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,
  18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,
  250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,
  189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,
  172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,
  228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,
  107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,
  138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180
];
const PERM = new Uint8Array(512);
for (let i = 0; i < 256; i++) {
  PERM[i] = P_SRC[i];
  PERM[256 + i] = P_SRC[i];
}

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function grad2D(hash, x, y) {
  const h = hash & 3;
  const u = (h === 0 || h === 1) ? x : -x;
  const v = (h === 0 || h === 2) ? y : -y;
  return u + v;
}

function perlin2D(x, y) {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf);
  const v = fade(yf);
  const aa = PERM[PERM[X] + Y];
  const ab = PERM[PERM[X] + Y + 1];
  const ba = PERM[PERM[X + 1] + Y];
  const bb = PERM[PERM[X + 1] + Y + 1];
  const gAA = grad2D(aa, xf, yf);
  const gBA = grad2D(ba, xf - 1, yf);
  const gAB = grad2D(ab, xf, yf - 1);
  const gBB = grad2D(bb, xf - 1, yf - 1);
  const x1 = gAA + u * (gBA - gAA);
  const x2 = gAB + u * (gBB - gAB);
  return x1 + v * (x2 - x1);
}

function fbm2D(x, y, octaves = 3) {
  let val = 0;
  let amp = 0.5;
  let freq = 1.0;
  let maxAmp = 0;
  for (let i = 0; i < octaves; i++) {
    val += perlin2D(x * freq, y * freq) * amp;
    maxAmp += amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  return val / maxAmp;
}

export class VoxelTerrain {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();
    this.meshes = new Map();
    this.terrainUniforms = {
      uRockBumpStrength: { value: 0.38 },
      uDirtBumpStrength: { value: 0.22 },
      uStrataBumpStrength: { value: 0.45 }
    };

    this.material = new THREE.MeshStandardMaterial({ 
        vertexColors: true, 
        roughness: 0.88,
        metalness: 0.04,
        flatShading: false
    });

    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uRockBumpStrength = this.terrainUniforms.uRockBumpStrength;
      shader.uniforms.uDirtBumpStrength = this.terrainUniforms.uDirtBumpStrength;
      shader.uniforms.uStrataBumpStrength = this.terrainUniforms.uStrataBumpStrength;

      shader.vertexShader = `
        attribute float aBlockType;
        varying float vBlockType;
        varying vec3 vWorldPos;
        varying vec3 vGeomNormal;
        ${shader.vertexShader}
      `.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vBlockType = aBlockType;
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vGeomNormal = normal;`
      );

      shader.fragmentShader = `
        uniform float uRockBumpStrength;
        uniform float uDirtBumpStrength;
        uniform float uStrataBumpStrength;

        varying float vBlockType;
        varying vec3 vWorldPos;
        varying vec3 vGeomNormal;

        vec3 hash33_terrain(vec3 p) {
            p = vec3(
                dot(p, vec3(127.1, 311.7, 74.7)),
                dot(p, vec3(269.5, 183.3, 246.1)),
                dot(p, vec3(113.5, 271.9, 124.6))
            );
            return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
        }

        float gradNoise3D(vec3 p) {
            vec3 i = floor(p);
            vec3 f = fract(p);
            vec3 u = f * f * (3.0 - 2.0 * f);

            return mix(
                mix(mix(dot(hash33_terrain(i + vec3(0.0,0.0,0.0)), f - vec3(0.0,0.0,0.0)),
                        dot(hash33_terrain(i + vec3(1.0,0.0,0.0)), f - vec3(1.0,0.0,0.0)), u.x),
                    mix(dot(hash33_terrain(i + vec3(0.0,1.0,0.0)), f - vec3(0.0,1.0,0.0)),
                        dot(hash33_terrain(i + vec3(1.0,1.0,0.0)), f - vec3(1.0,1.0,0.0)), u.x), u.y),
                mix(mix(dot(hash33_terrain(i + vec3(0.0,0.0,1.0)), f - vec3(0.0,0.0,1.0)),
                        dot(hash33_terrain(i + vec3(1.0,0.0,1.0)), f - vec3(1.0,0.0,1.0)), u.x),
                    mix(dot(hash33_terrain(i + vec3(0.0,1.0,1.0)), f - vec3(0.0,1.0,1.0)),
                        dot(hash33_terrain(i + vec3(1.0,1.0,1.0)), f - vec3(1.0,1.0,1.0)), u.x), u.y), u.z
            );
        }

        float getTerrainHeight(vec3 p, float blockType, vec3 geomNormal) {
            int b = int(blockType + 0.5);
            bool isTop = geomNormal.y > 0.7;

            // Keep horizontal meadow tops clean & readable
            if ((b == 2 || b == 3) && isTop) {
                return 0.0;
            }

            if (b == 5) {
                // BLOCK.STONE: Chiseled rock fissures & crystalline granite facets
                float n1 = gradNoise3D(p * 0.75);
                float n2 = abs(gradNoise3D(p * 1.8 + 12.5));
                float n3 = gradNoise3D(p * 3.6 + 47.1);
                return n1 * 0.5 + (0.5 - n2) * 0.35 + n3 * 0.15;
            } else if (b == 8) {
                // BLOCK.CLAY_STRATA: Horizontal sedimentary layered ridges
                float drift = gradNoise3D(vec3(p.xz * 0.35, 0.0)) * 1.6;
                float strata = sin((p.y + drift) * 2.8);
                float micro = gradNoise3D(p * 2.2) * 0.2;
                return strata * 0.6 + micro;
            } else if (b == 9) {
                // BLOCK.SHALE_ROCK: Stepped slate fractures & sharp basalt sheets
                float crack = abs(gradNoise3D(p * 1.3));
                float terrace = floor(p.y * 1.4) * 0.25;
                return (crack < 0.22 ? -0.4 : 0.2) + terrace + gradNoise3D(p * 2.0) * 0.2;
            } else if (b == 7) {
                // BLOCK.MOSS_STONE: Rounded boulder swell & depressions
                float n1 = gradNoise3D(p * 0.65);
                float n2 = gradNoise3D(p * 2.0 + 5.0) * 0.25;
                return n1 * 0.65 + n2;
            } else if (b == 4 || (b == 2 && !isTop)) {
                // BLOCK.DIRT or GRASS SIDE: Organic soil grain & crumbly pebbles
                float n1 = gradNoise3D(p * 2.8);
                float n2 = gradNoise3D(p * 5.8 + 8.3) * 0.45;
                return (n1 + n2) * 0.4;
            } else if (b == 1 || b == 6) {
                // BLOCK.SAND / WET_SAND: Gentle tidal / wind ripples
                float ripple = sin((p.x + p.z * 0.7) * 2.2 + gradNoise3D(p * 0.4) * 1.8);
                return ripple * 0.16;
            } else if (b == 10) {
                // BLOCK.ALPINE_TUNDRA:
                return gradNoise3D(p * 1.5) * 0.35;
            }

            return 0.0;
        }

        float getBumpStrength(float blockType, vec3 geomNormal) {
            int b = int(blockType + 0.5);
            bool isTop = geomNormal.y > 0.7;
            if (isTop && (b == 2 || b == 3)) return 0.0;

            if (b == 5) return uRockBumpStrength;
            if (b == 8) return uStrataBumpStrength;
            if (b == 9) return uRockBumpStrength * 1.15;
            if (b == 7) return uRockBumpStrength * 0.85;
            if (b == 4 || (b == 2 && !isTop)) return uDirtBumpStrength;
            if (b == 1 || b == 6) return 0.12;
            return 0.15;
        }
        ${shader.fragmentShader}
      `.replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        
        float h = getTerrainHeight(vWorldPos, vBlockType, vGeomNormal);
        float bumpStr = getBumpStrength(vBlockType, vGeomNormal);
        
        if (bumpStr > 0.001) {
            vec3 dPdx = dFdx(vWorldPos);
            vec3 dPdy = dFdy(vWorldPos);
            float dhx = dFdx(h);
            float dhy = dFdy(h);

            vec3 r1 = cross(dPdy, vGeomNormal);
            vec3 r2 = cross(vGeomNormal, dPdx);
            float det = dot(dPdx, r1);

            if (abs(det) > 1e-7) {
                vec3 worldGrad = (dhx * r1 + dhy * r2) / det;
                vec3 perturbedWorldNormal = normalize(vGeomNormal - bumpStr * worldGrad);
                normal = normalize(mat3(viewMatrix) * perturbedWorldNormal);
            }
        }`
      ).replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        if (int(vBlockType + 0.5) == 6) {
            roughnessFactor = 0.28; // Wet shoreline sand sheen
        }`
      );
    };

    this.material.customProgramCacheKey = () => 'VoxelTerrainProceduralNormals_v2';
    
    this.meshGroup = new THREE.Group();
    this.scene.add(this.meshGroup);

    this.WATER_HEIGHT = 2;
    this.SAND_HEIGHT = 5;
    this.GRASS_HEIGHT = 15;
    this.SNOW_HEIGHT = 25;
    this.activeBiome = 'tropical';
    this.biome = 'tropical';
    
    this.dirtyChunks = new Set();
  }

  setBiome(biome) {
    this.activeBiome = biome;
    this.biome = biome;
  }

  rebuildAllMeshes() {
    for (const key of this.chunks.keys()) {
      const [cx, cz] = key.split(',').map(Number);
      this.updateChunkMesh(cx, cz);
    }
  }

  isChunkEmpty(chunk) {
    if (!chunk) return true;
    for (let i = 0; i < chunk.length; i++) {
      if (chunk[i] !== BLOCK.AIR) return false;
    }
    return true;
  }

  compressChunk(chunk) {
    const len = chunk.length;
    if (len === 0) return '';
    let currentVal = chunk[0];
    let currentRun = 1;
    const parts = [];

    for (let i = 1; i < len; i++) {
      const val = chunk[i];
      if (val === currentVal) {
        currentRun++;
      } else {
        parts.push(`${currentRun}x${currentVal}`);
        currentVal = val;
        currentRun = 1;
      }
    }
    parts.push(`${currentRun}x${currentVal}`);
    return parts.join(',');
  }

  decompressChunk(data) {
    const totalVoxels = CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE;
    const chunk = new Uint8Array(totalVoxels);
    if (!data) return chunk;

    // Format 1: Compact RLE string: "countxval,countxval,..."
    if (typeof data === 'string') {
      if (data.includes('x')) {
        const runs = data.split(',');
        let ptr = 0;
        for (let i = 0; i < runs.length; i++) {
          const run = runs[i];
          const xIdx = run.indexOf('x');
          if (xIdx !== -1) {
            const count = parseInt(run.substring(0, xIdx), 10);
            const val = parseInt(run.substring(xIdx + 1), 10);
            if (!isNaN(count) && !isNaN(val) && count > 0) {
              const end = Math.min(totalVoxels, ptr + count);
              chunk.fill(val, ptr, end);
              ptr = end;
              if (ptr >= totalVoxels) break;
            }
          }
        }
        return chunk;
      }

      // Fallback: Base64 string if ever encountered
      try {
        const binary = atob(data);
        const copyLen = Math.min(binary.length, totalVoxels);
        for (let i = 0; i < copyLen; i++) {
          chunk[i] = binary.charCodeAt(i);
        }
        return chunk;
      } catch (_) {}
    }

    // Format 2: RLE array [count, val, count, val, ...] or full array [v0, v1, ...]
    if (Array.isArray(data)) {
      if (data.length === totalVoxels) {
        chunk.set(data);
        return chunk;
      }
      let ptr = 0;
      for (let i = 0; i < data.length; i += 2) {
        const count = data[i];
        const val = data[i + 1];
        if (count > 0) {
          const end = Math.min(totalVoxels, ptr + count);
          chunk.fill(val, ptr, end);
          ptr = end;
          if (ptr >= totalVoxels) break;
        }
      }
      return chunk;
    }

    // Format 3: Legacy JSON dictionary object { "0": 0, "1": 1, ... }
    if (typeof data === 'object') {
      if (data instanceof Uint8Array) {
        return data;
      }
      for (const k in data) {
        const idx = parseInt(k, 10);
        if (!isNaN(idx) && idx >= 0 && idx < totalVoxels) {
          chunk[idx] = data[k];
        }
      }
      return chunk;
    }

    return chunk;
  }

  serialize() {
    const data = {
      biome: this.biome || 'tropical',
      chunks: {}
    };
    for (const [key, chunk] of this.chunks.entries()) {
      if (!chunk || this.isChunkEmpty(chunk)) continue;
      data.chunks[key] = this.compressChunk(chunk);
    }
    return data;
  }

  deserialize(data) {
    if (!data) return;
    this.chunks.clear();
    for (const mesh of this.meshes.values()) {
      mesh.geometry?.dispose();
    }
    this.meshGroup.clear();
    this.meshes.clear();

    const chunkSource = data.chunks ? data.chunks : data;
    if (data.biome) {
      this.biome = data.biome;
      this.activeBiome = data.biome;
    }
    for (const key in chunkSource) {
      if (key === 'biome' || key === 'chunks') continue;
      const chunk = this.decompressChunk(chunkSource[key]);
      if (this.isChunkEmpty(chunk)) continue;
      this.chunks.set(key, chunk);
      const [cx, cz] = key.split(',').map(Number);
      this.updateChunkMesh(cx, cz);
    }
  }

  hasCollision(worldX, worldZ) {
    const wx = Math.floor(worldX);
    const wz = Math.floor(worldZ);
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const chunk = this.chunks.get(this.getChunkKey(cx, cz));
    if (!chunk) return false;

    let lx = wx % CHUNK_SIZE; if (lx < 0) lx += CHUNK_SIZE;
    let lz = wz % CHUNK_SIZE; if (lz < 0) lz += CHUNK_SIZE;
    
    for (let y = 0; y < 5; y++) {
      if (chunk[lx + CHUNK_SIZE * (y + CHUNK_HEIGHT * lz)] !== BLOCK.AIR) {
        return true;
      }
    }
    return false;
  }

  getTopY(worldX, worldZ) {
    const wx = Math.floor(worldX);
    const wz = Math.floor(worldZ);
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const key = this.getChunkKey(cx, cz);
    if (!this.chunks.has(key)) return -1;
    const chunk = this.chunks.get(key);
    let lx = wx % CHUNK_SIZE; if (lx < 0) lx += CHUNK_SIZE;
    let lz = wz % CHUNK_SIZE; if (lz < 0) lz += CHUNK_SIZE;
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      if (chunk[lx + CHUNK_SIZE * (y + CHUNK_HEIGHT * lz)] !== BLOCK.AIR) {
        return y;
      }
    }
    return -1;
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
    const chunk = this.chunks.get(this.getChunkKey(cx, cz));
    if (!chunk) return 0;
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    return chunk[lx + CHUNK_SIZE * (y + CHUNK_HEIGHT * lz)];
  }

  setVoxel(x, y, z, v) {
    if (y < 0 || y >= CHUNK_HEIGHT) return;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const key = this.getChunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      if (v === BLOCK.AIR) return;
      chunk = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
      this.chunks.set(key, chunk);
    }
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    chunk[lx + CHUNK_SIZE * (y + CHUNK_HEIGHT * lz)] = v;
  }
  
  getBlockTypeForHeight(x, y, z) {
    if (x === undefined || z === undefined) {
      if (y > this.SNOW_HEIGHT) return BLOCK.SNOW;
      if (y > this.SAND_HEIGHT) return BLOCK.GRASS;
      return BLOCK.SAND;
    }

    const n1 = fbm2D(x * 0.05, z * 0.05, 2);
    const n2 = perlin2D(x * 0.12 + 40, z * 0.12 + 40);

    const sandThresh = this.SAND_HEIGHT + n1 * 2.5;
    const grassThresh = this.GRASS_HEIGHT + n1 * 3.5;
    const stoneThresh = this.SNOW_HEIGHT - 3 + n1 * 3.0;
    const snowThresh = this.SNOW_HEIGHT + 3 + n1 * 4.0;

    // 1. Waterline & Beach
    if (y <= this.WATER_HEIGHT + 0.5) {
      return BLOCK.WET_SAND;
    }
    if (y <= sandThresh) {
      return BLOCK.SAND;
    }

    // 2. Lowland & Mid-Elevation Meadows
    if (y <= grassThresh) {
      if (n2 > 0.40 && y > sandThresh + 2) {
        return BLOCK.MOSS_STONE;
      }
      return BLOCK.GRASS;
    }

    // 3. Highland / Subalpine
    if (y <= stoneThresh) {
      if (n2 > 0.25) return BLOCK.ALPINE_TUNDRA;
      if (n2 < -0.25) return BLOCK.MOSS_STONE;
      return BLOCK.STONE;
    }

    // 4. Mountain Cliffs & Scree
    if (y <= snowThresh) {
      if (n2 < -0.20) return BLOCK.SHALE_ROCK;
      return BLOCK.STONE;
    }

    // 5. Perpetual Peaks
    if (n2 > 0.45) return BLOCK.STONE;
    return BLOCK.SNOW;
  }

  getSubsurfaceBlockType(x, y, z, depth) {
    if (depth <= 2) {
      if (y <= this.SAND_HEIGHT) return BLOCK.SAND;
      return BLOCK.DIRT;
    }

    const strataNoise = perlin2D(x * 0.08, z * 0.08) * 3.0;
    const strataVal = Math.sin((y + strataNoise) * 0.75);

    if (y < 5) {
      return strataVal > 0 ? BLOCK.STONE : BLOCK.SHALE_ROCK;
    }

    if (strataVal > 0.45) {
      return BLOCK.CLAY_STRATA;
    } else if (strataVal < -0.35) {
      return BLOCK.SHALE_ROCK;
    } else if (strataVal > -0.05 && strataVal < 0.2) {
      return BLOCK.STONE;
    }
    return BLOCK.DIRT;
  }

  isInsideBrush(dx, dz, wx, wz, radius, shape = 'circle') {
    if (dx === 0 && dz === 0) return true;

    if (shape === 'square') {
      return Math.max(Math.abs(dx), Math.abs(dz)) <= radius;
    }

    const distSq = dx * dx + dz * dz;
    const dist = Math.sqrt(distSq);
    if (radius <= 0) return dist === 0;
    const normDist = dist / radius;

    if (shape === 'circle') {
      return normDist <= 1.0;
    }

    if (shape === 'organic') {
      // Natural coastline / bays using multi-octave fractal noise
      // Modulation frequency scales smoothly with world coordinates
      const n = fbm2D(wx * 0.18, wz * 0.18, 3);
      const threshold = 0.95 + 0.42 * n;
      return normDist <= threshold;
    }

    if (shape === 'crag') {
      // High-frequency turbulent/ridged noise creates sharp rocky ridges and cliffs
      const n = Math.abs(fbm2D(wx * 0.35, wz * 0.35, 4));
      const angle = Math.atan2(dz, dx);
      const spike = 0.28 * Math.sin(angle * 5.0 + n * 4.0);
      const threshold = 0.82 + 0.48 * (n - 0.2) + spike;
      return normDist <= threshold;
    }

    if (shape === 'scatter') {
      // Archipelago scatter: clusters of small islets and sandbars
      if (normDist > 1.25) return false;
      const n1 = perlin2D(wx * 0.38, wz * 0.38);
      const n2 = perlin2D(wx * 0.16 + 50, wz * 0.16 + 50);
      const density = (1.1 - normDist * 0.6) + n1 * 0.45 + n2 * 0.25;
      return density > 0.58;
    }

    return normDist <= 1.0;
  }

  applyBrush(worldX, worldZ, radius, type, targetY = null, shape = 'circle') {
    worldX = Math.floor(worldX);
    worldZ = Math.floor(worldZ);
    radius = Math.floor(radius);

    const isNoisy = (shape === 'organic' || shape === 'crag' || shape === 'scatter');
    const bound = isNoisy ? Math.ceil(radius * 1.35) : radius;
    let chunksToUpdate = new Set();

    for (let dx = -bound; dx <= bound; dx++) {
      for (let dz = -bound; dz <= bound; dz++) {
        const x = worldX + dx;
        const z = worldZ + dz;
        if (!this.isInsideBrush(dx, dz, x, z, radius, shape)) continue;
            
        let topY = -1;
        for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
          if (this.getVoxel(x, y, z) !== BLOCK.AIR) {
            topY = y;
            break;
          }
        }

        if (type === 'raise') {
          let desiredY = targetY !== null ? targetY : topY + 1;
          if (desiredY >= CHUNK_HEIGHT) desiredY = CHUNK_HEIGHT - 1;
          
          if (desiredY > topY) {
            for (let y = topY + 1; y <= desiredY; y++) {
              let block = (y === desiredY) 
                ? this.getBlockTypeForHeight(x, y, z) 
                : this.getSubsurfaceBlockType(x, y, z, desiredY - y);
              this.setVoxel(x, y, z, encodeVoxel(block, this.activeBiome || 'tropical'));
            }
            chunksToUpdate.add(this.getChunkKey(Math.floor(x/CHUNK_SIZE), Math.floor(z/CHUNK_SIZE)));
          }
        } 
        else if (type === 'lower') {
          let desiredY = targetY !== null ? targetY : topY - 1;
          if (desiredY < -1) desiredY = -1;

          if (topY > desiredY) {
            let existingBiome = this.activeBiome || 'tropical';
            const existingTopVoxel = this.getVoxel(x, topY, z);
            if (existingTopVoxel !== BLOCK.AIR) {
              existingBiome = decodeVoxel(existingTopVoxel).biome;
            }
            for (let y = topY; y > desiredY; y--) {
              this.setVoxel(x, y, z, BLOCK.AIR);
            }
            if (desiredY >= 0) {
              let newSurface = this.getBlockTypeForHeight(x, desiredY, z);
              this.setVoxel(x, desiredY, z, encodeVoxel(newSurface, existingBiome));
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

  getFaceVertexColor(voxel, wx, wy, wz, normal, biome = 'tropical') {
    const ny = normal[1];
    const nx = normal[0];
    const nz = normal[2];
    const isTop = ny > 0.5;
    const isBottom = ny < -0.5;

    // Spatial noise
    const nMacro = perlin2D(wx * 0.05 + 13.7, wz * 0.05 + 19.3);
    const nMed = perlin2D(wx * 0.18 + 7.1, wz * 0.18 + 2.4);
    const nHigh = perlin2D(wx * 0.42 + 3.3, wz * 0.42 + 8.9);
    const strata = Math.sin((wy + nMacro * 3.2) * 0.78);

    // Subtle per-block deterministic jitter for tactile voxel crispness
    const pseudoRand = ((Math.sin(wx * 12.9898 + wy * 78.233 + wz * 37.719) * 43758.5453) % 1.0);
    const jitter = (pseudoRand - 0.5) * 0.04;

    // Directional face lighting
    let light = 1.0;
    if (isTop) {
      light = 1.04;
    } else if (isBottom) {
      light = 0.64;
    } else {
      if (Math.abs(nx) > 0.5) {
        light = nx > 0 ? 0.94 : 0.86;
      } else {
        light = nz > 0 ? 0.90 : 0.82;
      }
    }

    let base = [0.5, 0.5, 0.5];

    if (biome === 'volcanic') {
      switch (voxel) {
        case BLOCK.SAND:
        case BLOCK.WET_SAND:
          base = lerpColor([0.22, 0.22, 0.24], [0.32, 0.30, 0.32], nHigh * 0.5 + 0.5);
          break;
        case BLOCK.GRASS:
          base = isTop
            ? lerpColor([0.38, 0.46, 0.16], [0.28, 0.36, 0.12], nMed * 0.5 + 0.5)
            : lerpColor([0.26, 0.22, 0.16], [0.18, 0.18, 0.20], 0.5);
          break;
        case BLOCK.STONE:
          base = strata > 0.3
            ? lerpColor([0.34, 0.28, 0.26], [0.42, 0.32, 0.28], nHigh * 0.5 + 0.5)
            : lerpColor([0.18, 0.19, 0.22], [0.26, 0.27, 0.30], nMed * 0.5 + 0.5);
          break;
        case BLOCK.MOSS_STONE:
          base = lerpColor([0.36, 0.44, 0.20], [0.22, 0.24, 0.26], nHigh * 0.5 + 0.5);
          break;
        case BLOCK.CLAY_STRATA:
          base = lerpColor([0.76, 0.32, 0.16], [0.82, 0.48, 0.18], strata * 0.5 + 0.5);
          break;
        case BLOCK.SHALE_ROCK:
          base = lerpColor([0.14, 0.14, 0.16], [0.18, 0.18, 0.20], nHigh * 0.5 + 0.5);
          break;
        case BLOCK.ALPINE_TUNDRA:
          base = lerpColor([0.36, 0.34, 0.26], [0.42, 0.32, 0.22], nMed * 0.5 + 0.5);
          break;
        case BLOCK.SNOW:
          base = isTop ? [0.84, 0.84, 0.88] : [0.65, 0.68, 0.76];
          break;
        case BLOCK.DIRT:
        default:
          base = lerpColor([0.28, 0.20, 0.14], [0.20, 0.16, 0.12], (64 - wy) / 64);
          break;
      }
    } else if (biome === 'autumn') {
      switch (voxel) {
        case BLOCK.SAND:
          base = lerpColor([0.78, 0.64, 0.44], [0.84, 0.72, 0.52], nMed * 0.5 + 0.5);
          break;
        case BLOCK.WET_SAND:
          base = lerpColor([0.50, 0.40, 0.30], [0.42, 0.36, 0.28], nHigh * 0.5 + 0.5);
          break;
        case BLOCK.GRASS:
          base = isTop
            ? lerpColor([0.72, 0.50, 0.16], [0.54, 0.36, 0.14], nMacro * 0.6 + 0.5)
            : lerpColor([0.48, 0.34, 0.18], [0.38, 0.24, 0.14], 0.5);
          break;
        case BLOCK.STONE:
          base = strata > 0.3
            ? lerpColor([0.58, 0.52, 0.46], [0.66, 0.58, 0.50], nHigh * 0.5 + 0.5)
            : lerpColor([0.48, 0.46, 0.44], [0.40, 0.38, 0.38], nMed * 0.5 + 0.5);
          break;
        case BLOCK.MOSS_STONE:
          base = lerpColor([0.56, 0.48, 0.24], [0.44, 0.42, 0.38], nHigh * 0.5 + 0.5);
          break;
        case BLOCK.CLAY_STRATA:
          base = lerpColor([0.68, 0.38, 0.22], [0.60, 0.30, 0.16], strata * 0.5 + 0.5);
          break;
        case BLOCK.SHALE_ROCK:
          base = lerpColor([0.30, 0.30, 0.32], [0.24, 0.24, 0.26], nHigh * 0.5 + 0.5);
          break;
        case BLOCK.ALPINE_TUNDRA:
          base = lerpColor([0.52, 0.34, 0.28], [0.46, 0.42, 0.24], nMed * 0.5 + 0.5);
          break;
        case BLOCK.SNOW:
          base = isTop ? [0.94, 0.94, 0.96] : [0.78, 0.82, 0.90];
          break;
        case BLOCK.DIRT:
        default:
          base = lerpColor([0.42, 0.26, 0.14], [0.32, 0.20, 0.10], (64 - wy) / 64);
          break;
      }
    } else if (biome === 'desert') {
      switch (voxel) {
        case BLOCK.SAND:
          base = lerpColor([0.88, 0.68, 0.46], [0.94, 0.78, 0.56], nHigh * 0.5 + 0.5);
          break;
        case BLOCK.WET_SAND:
          base = lerpColor([0.62, 0.52, 0.40], [0.54, 0.44, 0.34], nMed * 0.5 + 0.5);
          break;
        case BLOCK.GRASS:
          base = isTop
            ? lerpColor([0.48, 0.54, 0.32], [0.56, 0.58, 0.36], nMed * 0.5 + 0.5)
            : lerpColor([0.54, 0.40, 0.26], [0.46, 0.32, 0.20], 0.5);
          break;
        case BLOCK.STONE:
          base = strata > 0.2
            ? lerpColor([0.76, 0.46, 0.32], [0.82, 0.54, 0.38], nHigh * 0.5 + 0.5)
            : lerpColor([0.66, 0.38, 0.26], [0.58, 0.32, 0.22], nMed * 0.5 + 0.5);
          break;
        case BLOCK.MOSS_STONE:
          base = lerpColor([0.64, 0.56, 0.40], [0.52, 0.50, 0.34], nHigh * 0.5 + 0.5);
          break;
        case BLOCK.CLAY_STRATA:
          base = lerpColor([0.78, 0.36, 0.20], [0.70, 0.28, 0.16], strata * 0.5 + 0.5);
          break;
        case BLOCK.SHALE_ROCK:
          base = lerpColor([0.32, 0.28, 0.26], [0.26, 0.22, 0.20], nHigh * 0.5 + 0.5);
          break;
        case BLOCK.ALPINE_TUNDRA:
          base = lerpColor([0.56, 0.50, 0.32], [0.50, 0.44, 0.28], nMed * 0.5 + 0.5);
          break;
        case BLOCK.SNOW:
          base = isTop ? [0.92, 0.88, 0.82] : [0.76, 0.72, 0.68];
          break;
        case BLOCK.DIRT:
        default:
          base = lerpColor([0.58, 0.32, 0.18], [0.46, 0.24, 0.12], (64 - wy) / 64);
          break;
      }
    } else if (biome === 'nordic') {
      switch (voxel) {
        case BLOCK.SAND:
          base = lerpColor([0.62, 0.62, 0.64], [0.54, 0.56, 0.58], nMed * 0.5 + 0.5);
          break;
        case BLOCK.WET_SAND:
          base = lerpColor([0.44, 0.46, 0.48], [0.38, 0.40, 0.42], nHigh * 0.5 + 0.5);
          break;
        case BLOCK.GRASS:
          base = isTop
            ? lerpColor([0.14, 0.40, 0.20], [0.18, 0.46, 0.24], nMed * 0.5 + 0.5)
            : lerpColor([0.32, 0.34, 0.22], [0.36, 0.28, 0.20], 0.5);
          break;
        case BLOCK.STONE:
          base = strata > 0.3
            ? lerpColor([0.56, 0.58, 0.64], [0.62, 0.64, 0.70], nHigh * 0.5 + 0.5)
            : lerpColor([0.44, 0.48, 0.54], [0.38, 0.42, 0.48], nMed * 0.5 + 0.5);
          break;
        case BLOCK.MOSS_STONE:
          base = lerpColor([0.26, 0.44, 0.32], [0.42, 0.46, 0.50], nHigh * 0.5 + 0.5);
          break;
        case BLOCK.CLAY_STRATA:
          base = lerpColor([0.42, 0.40, 0.38], [0.36, 0.34, 0.32], strata * 0.5 + 0.5);
          break;
        case BLOCK.SHALE_ROCK:
          base = lerpColor([0.22, 0.24, 0.28], [0.18, 0.20, 0.24], nHigh * 0.5 + 0.5);
          break;
        case BLOCK.ALPINE_TUNDRA:
          base = lerpColor([0.36, 0.42, 0.30], [0.30, 0.36, 0.26], nMed * 0.5 + 0.5);
          break;
        case BLOCK.SNOW:
          base = isTop ? [0.94, 0.97, 1.00] : [0.68, 0.78, 0.92];
          break;
        case BLOCK.DIRT:
        default:
          base = lerpColor([0.36, 0.28, 0.20], [0.28, 0.22, 0.16], (64 - wy) / 64);
          break;
      }
    } else {
      // Default: 'tropical'
      switch (voxel) {
        case BLOCK.SAND: {
          const sandHighlight = lerpColor([0.86, 0.74, 0.50], [0.92, 0.82, 0.62], nHigh * 0.5 + 0.5);
          const coralSand = [0.88, 0.68, 0.48];
          base = lerpColor(sandHighlight, coralSand, clamp(nMed * 0.4, 0, 1));
          break;
        }
        case BLOCK.WET_SAND:
          base = lerpColor([0.54, 0.46, 0.36], [0.46, 0.48, 0.44], clamp(nHigh * 0.5 + 0.5, 0, 1));
          break;
        case BLOCK.GRASS: {
          if (isTop) {
            const sunnyLime = [0.28, 0.68, 0.18];
            const emerald = [0.16, 0.56, 0.16];
            const deepJade = [0.09, 0.44, 0.13];
            const meadow = nMacro > 0 ? lerpColor(emerald, sunnyLime, nMacro * 1.8) : lerpColor(emerald, deepJade, -nMacro * 1.8);
            const wildGold = [0.34, 0.58, 0.16];
            base = lerpColor(meadow, wildGold, clamp(nHigh * 0.35, 0, 0.4));
          } else {
            base = lerpColor([0.34, 0.36, 0.16], [0.44, 0.28, 0.14], 0.6);
          }
          break;
        }
        case BLOCK.STONE: {
          const warmLimestone = [0.60, 0.58, 0.54];
          const slateGrey = [0.46, 0.48, 0.51];
          const quartz = [0.70, 0.70, 0.68];
          const ironstone = [0.60, 0.50, 0.42];
          if (strata > 0.4) {
            base = lerpColor(warmLimestone, quartz, (strata - 0.4) * 1.6);
          } else if (strata < -0.3) {
            base = lerpColor(warmLimestone, slateGrey, (-strata - 0.3) * 1.4);
          } else {
            base = lerpColor(warmLimestone, ironstone, clamp(nMed * 0.5 + 0.5, 0, 1));
          }
          break;
        }
        case BLOCK.MOSS_STONE:
          base = lerpColor([0.26, 0.50, 0.24], [0.46, 0.48, 0.44], clamp(nHigh * 0.5 + 0.5, 0, 1));
          break;
        case BLOCK.CLAY_STRATA:
          base = lerpColor([0.72, 0.40, 0.24], [0.62, 0.34, 0.18], clamp(strata * 0.5 + 0.5, 0, 1));
          break;
        case BLOCK.SHALE_ROCK:
          base = lerpColor([0.24, 0.25, 0.28], [0.18, 0.19, 0.22], clamp(nHigh * 0.5 + 0.5, 0, 1));
          break;
        case BLOCK.ALPINE_TUNDRA:
          base = lerpColor([0.42, 0.46, 0.25], [0.48, 0.36, 0.30], clamp(nMed * 0.5 + 0.5, 0, 1));
          break;
        case BLOCK.SNOW:
          base = isTop ? [0.96, 0.98, 1.00] : [0.76, 0.85, 0.95];
          break;
        case BLOCK.DIRT:
        default: {
          const depthRatio = clamp((64 - wy) / 64, 0, 1);
          base = lerpColor([0.46, 0.28, 0.14], [0.34, 0.20, 0.10], depthRatio);
          break;
        }
      }
    }

    const r = clamp((base[0] + jitter) * light, 0, 1);
    const g = clamp((base[1] + jitter) * light, 0, 1);
    const b = clamp((base[2] + jitter) * light, 0, 1);
    return [r, g, b];
  }

  updateChunkMesh(cx, cz) {
    const chunk = this.chunks.get(this.getChunkKey(cx, cz));
    if (!chunk) return;

    const positions = [];
    const colors = [];
    const normals = [];
    const blockTypes = [];
    const indices = [];
    let offset = 0;

    // 3 axes: Y (axis=1), X (axis=0), Z (axis=2)
    const axes = [
      {
        axis: 1, // Y normal: top (+Y), bottom (-Y)
        sizeD: CHUNK_HEIGHT,
        sizeU: CHUNK_SIZE, // X
        sizeV: CHUNK_SIZE, // Z
        dirs: [
          { sign: 1, normal: [0, 1, 0] },
          { sign: -1, normal: [0, -1, 0] }
        ],
        getCoord: (d, u, v) => [u, d, v]
      },
      {
        axis: 0, // X normal: (+X), (-X)
        sizeD: CHUNK_SIZE,
        sizeU: CHUNK_SIZE, // Z
        sizeV: CHUNK_HEIGHT, // Y
        dirs: [
          { sign: 1, normal: [1, 0, 0] },
          { sign: -1, normal: [-1, 0, 0] }
        ],
        getCoord: (d, u, v) => [d, v, u]
      },
      {
        axis: 2, // Z normal: (+Z), (-Z)
        sizeD: CHUNK_SIZE,
        sizeU: CHUNK_SIZE, // X
        sizeV: CHUNK_HEIGHT, // Y
        dirs: [
          { sign: 1, normal: [0, 0, 1] },
          { sign: -1, normal: [0, 0, -1] }
        ],
        getCoord: (d, u, v) => [u, v, d]
      }
    ];

    for (const ax of axes) {
      const { sizeD, sizeU, sizeV, dirs, getCoord } = ax;
      const mask = new Int32Array(sizeU * sizeV);

      for (const { sign, normal } of dirs) {
        for (let d = 0; d < sizeD; d++) {
          let hasFaces = false;
          for (let v = 0; v < sizeV; v++) {
            for (let u = 0; u < sizeU; u++) {
              const [lx, ly, lz] = getCoord(d, u, v);
              const voxel = chunk[lx + CHUNK_SIZE * (ly + CHUNK_HEIGHT * lz)];
              let faceVoxel = 0;

              if (voxel !== BLOCK.AIR) {
                const wx = cx * CHUNK_SIZE + lx;
                const wy = ly;
                const wz = cz * CHUNK_SIZE + lz;
                const neighbor = this.getVoxel(wx + normal[0], wy + normal[1], wz + normal[2]);
                if (neighbor === BLOCK.AIR) {
                  faceVoxel = voxel;
                  hasFaces = true;
                }
              }
              mask[u + v * sizeU] = faceVoxel;
            }
          }

          if (!hasFaces) continue;

          // 2D Greedy Quad Merging
          for (let v = 0; v < sizeV; v++) {
            for (let u = 0; u < sizeU; ) {
              const val = mask[u + v * sizeU];
              if (val === 0) {
                u++;
                continue;
              }

              let width = 1;
              while (u + width < sizeU && mask[(u + width) + v * sizeU] === val) {
                width++;
              }

              let height = 1;
              let canExpand = true;
              while (v + height < sizeV && canExpand) {
                for (let k = 0; k < width; k++) {
                  if (mask[(u + k) + (v + height) * sizeU] !== val) {
                    canExpand = false;
                    break;
                  }
                }
                if (canExpand) height++;
              }

              // Clear merged rectangle from mask
              for (let dv = 0; dv < height; dv++) {
                for (let du = 0; du < width; du++) {
                  mask[(u + du) + (v + dv) * sizeU] = 0;
                }
              }

              const { block, biome: voxelBiome } = decodeVoxel(val);

              // Compute quad vertices
              let corners;
              if (ax.axis === 1) { // Y normal
                const yPos = sign > 0 ? d + 1 : d;
                if (sign > 0) {
                  // Top (+Y)
                  corners = [
                    [u, yPos, v + height],
                    [u + width, yPos, v + height],
                    [u + width, yPos, v],
                    [u, yPos, v]
                  ];
                } else {
                  // Bottom (-Y)
                  corners = [
                    [u, yPos, v],
                    [u + width, yPos, v],
                    [u + width, yPos, v + height],
                    [u, yPos, v + height]
                  ];
                }
              } else if (ax.axis === 0) { // X normal (u = Z, v = Y)
                const xPos = sign > 0 ? d + 1 : d;
                if (sign > 0) {
                  // +X
                  corners = [
                    [xPos, v, u + width],
                    [xPos, v, u],
                    [xPos, v + height, u],
                    [xPos, v + height, u + width]
                  ];
                } else {
                  // -X
                  corners = [
                    [xPos, v, u],
                    [xPos, v, u + width],
                    [xPos, v + height, u + width],
                    [xPos, v + height, u]
                  ];
                }
              } else { // Z normal (u = X, v = Y)
                const zPos = sign > 0 ? d + 1 : d;
                if (sign > 0) {
                  // +Z
                  corners = [
                    [u, v, zPos],
                    [u + width, v, zPos],
                    [u + width, v + height, zPos],
                    [u, v + height, zPos]
                  ];
                } else {
                  // -Z
                  corners = [
                    [u + width, v, zPos],
                    [u, v, zPos],
                    [u, v + height, zPos],
                    [u + width, v + height, zPos]
                  ];
                }
              }

              for (const c of corners) {
                const wx = cx * CHUNK_SIZE + c[0] - 0.5;
                const wy = c[1] - 0.5;
                const wz = cz * CHUNK_SIZE + c[2] - 0.5;
                positions.push(wx, wy, wz);
                normals.push(...normal);
                blockTypes.push(block);

                const color = this.getFaceVertexColor(block, wx, wy, wz, normal, voxelBiome);
                colors.push(color[0], color[1], color[2]);
              }

              indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
              offset += 4;

              u += width;
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
        this.meshes.delete(key);
      }
      const chunk = this.chunks.get(key);
      if (chunk && this.isChunkEmpty(chunk)) {
        this.chunks.delete(key);
      }
      return;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('aBlockType', new THREE.Float32BufferAttribute(blockTypes, 1));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

    const key = this.getChunkKey(cx, cz);
    let mesh = this.meshes.get(key);
    if (mesh) {
      this.meshGroup.remove(mesh);
      mesh.geometry.dispose();
      this.meshes.delete(key);
    }
    
    mesh = new THREE.Mesh(geometry, this.material);
    this.meshes.set(key, mesh);
    this.meshGroup.add(mesh);
  }

  updateCulling(cameraPosition, maxDist = 180) {
    if (!cameraPosition) return;
    const maxDistSq = maxDist * maxDist;
    const hystDistSq = (maxDist + 20) * (maxDist + 20);
    for (const [key, mesh] of this.meshes.entries()) {
      const [cx, cz] = key.split(',').map(Number);
      const centerX = (cx + 0.5) * CHUNK_SIZE;
      const centerZ = (cz + 0.5) * CHUNK_SIZE;
      const dx = centerX - cameraPosition.x;
      const dz = centerZ - cameraPosition.z;
      const distSq = dx * dx + dz * dz;

      if (mesh.visible && distSq > hystDistSq) {
        mesh.visible = false;
      } else if (!mesh.visible && distSq <= maxDistSq) {
        mesh.visible = true;
      }
    }
  }

  updatePreview(worldX, worldZ, radius, type, targetYParam = null, shape = 'circle') {
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

    const isNoisy = (shape === 'organic' || shape === 'crag' || shape === 'scatter');
    const bound = isNoisy ? Math.ceil(radius * 1.35) : radius;

    for (let dx = -bound; dx <= bound; dx++) {
      for (let dz = -bound; dz <= bound; dz++) {
        const wx = bx + dx;
        const wz = bz + dz;
        if (!this.isInsideBrush(dx, dz, wx, wz, radius, shape)) continue;
          
        const topY = this.getTopY(wx, wz);

        let targetY = topY;
        if (type === 'raise') {
          targetY = targetYParam !== null ? Math.max(topY + 1, targetYParam) : topY + 1;
          if (targetY >= CHUNK_HEIGHT) continue;
        } else if (type === 'lower') {
          if (topY < 0) continue;
          targetY = targetYParam !== null ? Math.min(topY, Math.max(0, targetYParam + 1)) : topY;
        }

        dummy.position.set(wx + 0.5, targetY + 0.5, wz + 0.5);
        dummy.updateMatrix();
        this.previewMesh.setMatrixAt(count++, dummy.matrix);
        
        if (count >= 2000) break;
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

  dispose() {
    if (this.meshGroup) {
      if (this.meshGroup.parent) {
        this.meshGroup.parent.remove(this.meshGroup);
      }
      for (const mesh of this.meshes.values()) {
        mesh.geometry?.dispose();
      }
      this.meshes.clear();
      if (this.previewMesh) {
        this.previewMesh.geometry?.dispose();
        if (Array.isArray(this.previewMesh.material)) {
          this.previewMesh.material.forEach(m => m.dispose());
        } else {
          this.previewMesh.material?.dispose();
        }
        this.previewMesh = null;
      }
      this.material?.dispose();
    }
    this.chunks.clear();
    this.dirtyChunks.clear();
  }
}


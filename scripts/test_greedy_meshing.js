import * as THREE from 'three';

const CHUNK_SIZE = 32;
const CHUNK_HEIGHT = 64;

// Mock block constants
const BLOCK = { AIR: 0, SAND: 1, GRASS: 2, STONE: 5 };

// Mock a simple terrain chunk (e.g., a 16x16 hill/plateau of height 10)
const chunk = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
for (let x = 4; x < 28; x++) {
  for (let z = 4; z < 28; z++) {
    for (let y = 0; y < 8; y++) {
      const idx = x + CHUNK_SIZE * (y + CHUNK_HEIGHT * z);
      chunk[idx] = y === 7 ? BLOCK.GRASS : BLOCK.STONE;
    }
  }
}

function getVoxel(x, y, z) {
  if (x < 0 || x >= CHUNK_SIZE || y < 0 || y >= CHUNK_HEIGHT || z < 0 || z >= CHUNK_SIZE) return BLOCK.AIR;
  return chunk[x + CHUNK_SIZE * (y + CHUNK_HEIGHT * z)];
}

// 1. Naive unmerged face count
let naiveQuads = 0;
const dirs = [
  [0, 1, 0], [0, -1, 0],
  [1, 0, 0], [-1, 0, 0],
  [0, 0, 1], [0, 0, -1]
];

for (let y = 0; y < CHUNK_HEIGHT; y++) {
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const v = getVoxel(x, y, z);
      if (v === BLOCK.AIR) continue;
      for (const d of dirs) {
        if (getVoxel(x + d[0], y + d[1], z + d[2]) === BLOCK.AIR) {
          naiveQuads++;
        }
      }
    }
  }
}

console.log(`Naive Quads: ${naiveQuads} (${naiveQuads * 2} Triangles)`);

// 2. Greedy Meshing Implementation
function greedyMeshChunk(cx, cz) {
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  let offset = 0;

  // We process 3 axes:
  // axis = 0 (X normal): slice across X (0..CHUNK_SIZE-1), plane in (Z, Y)
  // axis = 1 (Y normal): slice across Y (0..CHUNK_HEIGHT-1), plane in (X, Z)
  // axis = 2 (Z normal): slice across Z (0..CHUNK_SIZE-1), plane in (X, Y)

  const axes = [
    {
      axis: 1, // Y axis (+Y top, -Y bottom)
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
      axis: 0, // X axis (+X, -X)
      sizeD: CHUNK_SIZE,
      sizeU: CHUNK_SIZE, // Z
      sizeV: CHUNK_HEIGHT, // Y
      dirs: [
        { sign: 1, normal: [1, 0, 0] },
        { sign: -1, normal: [-1, 0, 0] }
      ],
      getCoord: (d, u, v) => [d, v, u] // x = d, y = v, z = u
    },
    {
      axis: 2, // Z axis (+Z, -Z)
      sizeD: CHUNK_SIZE,
      sizeU: CHUNK_SIZE, // X
      sizeV: CHUNK_HEIGHT, // Y
      dirs: [
        { sign: 1, normal: [0, 0, 1] },
        { sign: -1, normal: [0, 0, -1] }
      ],
      getCoord: (d, u, v) => [u, v, d] // x = u, y = v, z = d
    }
  ];

  let mergedQuads = 0;

  for (const ax of axes) {
    const { sizeD, sizeU, sizeV, dirs, getCoord } = ax;
    const mask = new Int32Array(sizeU * sizeV);

    for (const { sign, normal } of dirs) {
      for (let d = 0; d < sizeD; d++) {
        // Build 2D mask for this slice
        let hasFaces = false;
        for (let v = 0; v < sizeV; v++) {
          for (let u = 0; u < sizeU; u++) {
            const [x, y, z] = getCoord(d, u, v);
            const voxel = getVoxel(x, y, z);
            let faceVoxel = 0;

            if (voxel !== BLOCK.AIR) {
              const nx = x + normal[0];
              const ny = y + normal[1];
              const nz = z + normal[2];
              const neighbor = getVoxel(nx, ny, nz);
              if (neighbor === BLOCK.AIR) {
                faceVoxel = voxel;
                hasFaces = true;
              }
            }
            mask[u + v * sizeU] = faceVoxel;
          }
        }

        if (!hasFaces) continue;

        // Greedy 2D sweep across mask
        for (let v = 0; v < sizeV; v++) {
          for (let u = 0; u < sizeU; ) {
            const val = mask[u + v * sizeU];
            if (val === 0) {
              u++;
              continue;
            }

            // Expand along U
            let width = 1;
            while (u + width < sizeU && mask[(u + width) + v * sizeU] === val) {
              width++;
            }

            // Expand along V
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

            // Clear mask for merged rectangle
            for (let dv = 0; dv < height; dv++) {
              for (let du = 0; du < width; du++) {
                mask[(u + du) + (v + dv) * sizeU] = 0;
              }
            }

            mergedQuads++;

            // Calculate 4 quad vertices
            // Coordinates in local voxel space
            let corners;
            if (ax.axis === 1) { // Y normal
              const yPos = sign > 0 ? d + 1 : d;
              if (sign > 0) {
                // Top face: [X, Z] plane
                corners = [
                  [u, yPos, v + height],
                  [u + width, yPos, v + height],
                  [u + width, yPos, v],
                  [u, yPos, v]
                ];
              } else {
                // Bottom face
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
                // +X face
                corners = [
                  [xPos, v, u + width],
                  [xPos, v, u],
                  [xPos, v + height, u],
                  [xPos, v + height, u + width]
                ];
              } else {
                // -X face
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
                // +Z face
                corners = [
                  [u, v, zPos],
                  [u + width, v, zPos],
                  [u + width, v + height, zPos],
                  [u, v + height, zPos]
                ];
              } else {
                // -Z face
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
              colors.push(0.5, 0.5, 0.5);
            }

            indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
            offset += 4;

            u += width;
          }
        }
      }
    }
  }

  return { mergedQuads, triangles: mergedQuads * 2 };
}

const result = greedyMeshChunk(0, 0);
console.log(`Greedy Meshed Quads: ${result.mergedQuads} (${result.triangles} Triangles)`);
const reduction = ((1 - (result.triangles / (naiveQuads * 2))) * 100).toFixed(1);
console.log(`Triangle Reduction: ${reduction}%`);

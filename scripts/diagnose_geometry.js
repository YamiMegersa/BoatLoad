import fs from 'fs';
import path from 'path';

// Helper to parse GLB and extract mesh triangle counts
function parseGlbTriangles(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    if (buffer.length < 12) return 0;
    const magic = buffer.readUInt32LE(0);
    if (magic !== 0x46546C67) return 0; // 'glTF' in hex

    // Chunk 0 is JSON
    const chunk0Length = buffer.readUInt32LE(12);
    const chunk0Type = buffer.readUInt32LE(16);
    if (chunk0Type !== 0x4E4F534A) return 0; // 'JSON' in hex

    const jsonStr = buffer.toString('utf8', 20, 20 + chunk0Length);
    const gltf = JSON.parse(jsonStr);

    let totalTris = 0;
    if (gltf.meshes) {
      for (const mesh of gltf.meshes) {
        if (mesh.primitives) {
          for (const prim of mesh.primitives) {
            if (prim.indices !== undefined && gltf.accessors && gltf.accessors[prim.indices]) {
              const count = gltf.accessors[prim.indices].count;
              totalTris += Math.floor(count / 3);
            } else if (prim.attributes && prim.attributes.POSITION !== undefined && gltf.accessors) {
              const count = gltf.accessors[prim.attributes.POSITION].count;
              totalTris += Math.floor(count / 3);
            }
          }
        }
      }
    }
    return totalTris;
  } catch (err) {
    return -1;
  }
}

// Audit all assets in public
function auditDirectory(dir, relativeTo = dir) {
  let list = [];
  if (!fs.existsSync(dir)) return list;
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      list.push(...auditDirectory(full, relativeTo));
    } else if (f.endsWith('.glb')) {
      const tris = parseGlbTriangles(full);
      list.push({
        file: path.relative(relativeTo, full).replace(/\\/g, '/'),
        sizeKB: Math.round(stat.size / 1024),
        triangles: tris
      });
    }
  }
  return list;
}

const assetsDir = path.resolve('public');
const audited = auditDirectory(assetsDir);
audited.sort((a, b) => b.triangles - a.triangles);

console.log('=== GLB 3D MODEL TRIANGLE AUDIT ===');
console.log(`Found ${audited.length} GLB models in public/:\n`);
console.table(audited);

// Analyze Level Configurations
const levelsDir = path.resolve('src/assets/levels');
if (fs.existsSync(levelsDir)) {
  const levelFiles = fs.readdirSync(levelsDir).filter(f => f.startsWith('day') && f.endsWith('.json'));
  console.log('\n=== LEVEL GEOMETRY COMPOSITION ANALYSIS ===');
  for (const lf of levelFiles) {
    const content = JSON.parse(fs.readFileSync(path.join(levelsDir, lf), 'utf8'));
    let estObstacleTris = 0;
    let obstacleCounts = {};

    if (content.obstacles) {
      for (const obs of content.obstacles) {
        obstacleCounts[obs.type] = (obstacleCounts[obs.type] || 0) + (obs.count || 1);
        if (obs.type === 'island') {
          const islandAsset = audited.find(a => obs.assetUrl && a.file.includes(path.basename(obs.assetUrl)));
          estObstacleTris += islandAsset ? islandAsset.triangles : 8000;
        } else if (obs.type === 'rock') {
          // Average rock triangles
          const rockAssets = audited.filter(a => a.file.includes('rocks/'));
          const avgRockTris = rockAssets.length > 0 ? Math.round(rockAssets.reduce((s, r) => s + r.triangles, 0) / rockAssets.length) : 600;
          estObstacleTris += (obs.count || 1) * avgRockTris;
        }
      }
    }

    console.log(`\nLevel: ${lf} (Day ${content.day})`);
    console.log(`  - Obstacle breakdown:`, obstacleCounts);
    console.log(`  - Estimated obstacle triangles: ${estObstacleTris.toLocaleString()}`);
    if (content.voxels) {
      console.log(`  - Contains custom Voxel Terrain chunks: Yes (${Object.keys(content.voxels.chunks || {}).length} chunks)`);
    }
  }
}

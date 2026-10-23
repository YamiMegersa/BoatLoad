import fs from 'fs';
import path from 'path';

function findMeshNames(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    if (buffer.length < 12 || buffer.readUInt32LE(0) !== 0x46546C67) return [];
    const chunk0Length = buffer.readUInt32LE(12);
    const gltf = JSON.parse(buffer.toString('utf8', 20, 20 + chunk0Length));
    const names = [];
    if (gltf.meshes) {
      for (const m of gltf.meshes) {
        if (m.name) names.push(m.name);
      }
    }
    if (gltf.nodes) {
      for (const n of gltf.nodes) {
        if (n.name) names.push(n.name);
      }
    }
    return names;
  } catch {
    return [];
  }
}

const targets = ['Sphere005', 'mesh125484008004', 'Grid-Mesh001', 'Octopus', 'Sail016'];

function scan(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) scan(full);
    else if (f.endsWith('.glb')) {
      const names = findMeshNames(full);
      for (const t of targets) {
        if (names.some(n => n.includes(t))) {
          console.log(`Found target "${t}" in: ${path.relative('public', full)}`);
        }
      }
    }
  }
}

scan('public');

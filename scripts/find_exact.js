import fs from 'fs';
import path from 'path';

function findExact(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    if (buffer.length < 12 || buffer.readUInt32LE(0) !== 0x46546C67) return;
    const len = buffer.readUInt32LE(12);
    const jsonStr = buffer.toString('utf8', 20, 20 + len);
    if (jsonStr.includes('Grid-Mesh001')) {
      console.log('Grid-Mesh001 in:', filePath);
    }
    if (jsonStr.includes('mesh125484008004')) {
      console.log('mesh125484008004 in:', filePath);
    }
  } catch {}
}

function scan(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) scan(full);
    else if (f.endsWith('.glb')) findExact(full);
  }
}
scan('public');

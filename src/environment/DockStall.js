import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { VoxelLopBunny } from './VoxelLopBunny.js';
import { VoxelCrab } from './VoxelCrab.js';
import { DockNPC } from './DockNPC.js';
import { GhostMerchant } from './GhostMerchant.js';
import { mergeStaticMeshes } from '../utils/StaticMerge.js';

const _camPosScratch = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Voxel Palette & Procedural Voxel Texture Generators
// ---------------------------------------------------------------------------
const Palette = {
  // Dock & Shop Timber
  dockPlank: 0x9b7a5a,
  dockDark: 0x75573b,
  woodHi: 0xb58b5e,
  woodMid: 0x785332,
  woodDark: 0x3d2716,
  woodAged: 0x514438,
  woodTrim: 0x2e1d10,
  roofTile: 0x613a1e,
  roofTileDark: 0x4f2d15,
  roofRidge: 0x3b1f0d,

  // Landmass / Island
  grassTop: 0x5b7f3d,
  grassEdge: 0x47662e,
  grassDark: 0x3d5926,
  dirt: 0x5c4228,
  dirtDark: 0x45311c,
  stone: 0x6e7378,
  stoneDark: 0x52565a,
  stoneLight: 0x868b90,
  stonePath: 0x8a8e91,
  sand: 0xbfa779,
  sandWet: 0x96825a,

  // Pine Trees
  pineTrunk: 0x3d2514,
  pineLeaves1: 0x234421,
  pineLeaves2: 0x1b3719,
  pineLeaves3: 0x2c532a,

  // Metals & Glass
  brass: 0xc8a44b,
  brassDark: 0x8a6e2e,
  iron: 0x34373d,
  ironLight: 0x52575e,
  goldCoin: 0xe5b836,
  glassPorthole: 0x78a8be,
  lanternGlass: 0xffd277,

  // Props & Goods
  rope: 0x9e8c6e,
  ropeDark: 0x796a52,
  paper: 0xe6e1cc,
  sealRed: 0x8f2824,
  bottleGreen: 0x2d6143,
  bottleAmber: 0x8c5b29,
  bottleBlue: 0x274d75,
  bottleWine: 0x5c2738,
  cork: 0xb56c36,
  sackBurlap: 0x9c855d,
  fishBody: 0x5a7d8c,
  fishBelly: 0xa8c2cb,
  seagullWhite: 0xedebe6,
  seagullGrey: 0x7d858c,
  seagullBeak: 0xd98829,

  // Flora, Blueprints & Landscape Details
  flowerWhite: 0xf3f5f0,
  flowerYellow: 0xf2c94c,
  flowerRed: 0xd9433d,
  flowerBlue: 0x4a77d4,
  mushroomRed: 0xc93b3b,
  mushroomCap: 0x5e4129,
  blueprintBlue: 0x1d4673,
  blueprintLine: 0x5482b8,
  sailCloth: 0xeae6dc,
  sailClothTrim: 0xd4cebf,
  copper: 0xc46d3b,
  emberGlow: 0xff4500,
  woodAsh: 0x2b2725
};

/**
 * Procedural pixel-art voxel wood texture generator.
 * Produces crisp, stepped wood grain pixels using nearest-neighbor filtering.
 */
function createVoxelWoodTexture(baseR, baseG, baseB, contrast = 0.18) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = `rgb(${baseR},${baseG},${baseB})`;
  ctx.fillRect(0, 0, 64, 64);

  // Pixelated horizontal plank grain lines
  for (let y = 0; y < 64; y += 4) {
    const shadeFactor = 1.0 + (Math.sin(y * 1.5) * 0.5) * contrast;
    const r = Math.min(255, Math.floor(baseR * shadeFactor));
    const g = Math.min(255, Math.floor(baseG * shadeFactor));
    const b = Math.min(255, Math.floor(baseB * shadeFactor));
    ctx.fillStyle = `rgb(${r},${g},${b})`;

    for (let x = 0; x < 64; x += 4) {
      if ((x + y * 3) % 7 !== 0) {
        ctx.fillRect(x, y, 4, 3);
      }
    }
  }

  // A couple of pixel knots
  [[16, 20], [44, 40]].forEach(([kx, ky]) => {
    ctx.fillStyle = `rgb(${Math.floor(baseR * 0.6)},${Math.floor(baseG * 0.55)},${Math.floor(baseB * 0.5)})`;
    ctx.fillRect(kx, ky, 6, 6);
    ctx.fillRect(kx + 2, ky - 2, 2, 2);
    ctx.fillRect(kx + 2, ky + 6, 2, 2);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

/**
 * Procedural glowing sign texture for "Deadly Business" stall
 */
function createDeadlyBusinessSignTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');

  // Weathered dark timber plank
  ctx.fillStyle = '#18110b';
  ctx.fillRect(0, 0, 512, 160);

  // Distressed wood grain
  ctx.fillStyle = '#26170e';
  for (let y = 0; y < 160; y += 8) {
    ctx.fillRect(0, y, 512, 3);
  }

  // Spectral cyan/emerald borders
  ctx.strokeStyle = '#059669';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 496, 144);
  ctx.strokeStyle = '#34d399';
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, 484, 132);

  // Glowing eerie header
  ctx.font = '900 42px "Cinzel", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Outer glow
  ctx.shadowColor = '#34d399';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#a7f3d0';
  ctx.fillText('DEADLY BUSINESS', 256, 70);

  // Sharp text core
  ctx.shadowBlur = 3;
  ctx.fillStyle = '#f0fdf4';
  ctx.fillText('DEADLY BUSINESS', 256, 70);

  // Subtitle
  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = '#6ee7b7';
  ctx.shadowBlur = 6;
  ctx.fillText('☠  SPECTRAL CHANDLERY & OUTFITS  ☠', 256, 118);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Procedural canvas texture for the exterior grooming mirror sign: "Hello Handsome"
 */
function createHelloHandsomeSignTexture() {
  if (typeof document === 'undefined') return new THREE.Texture();
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  // Weathered dark maritime timber
  ctx.fillStyle = '#1e140d';
  ctx.fillRect(0, 0, 512, 160);

  // Distressed horizontal wood grain planks
  ctx.fillStyle = '#2d1b11';
  for (let y = 0; y < 160; y += 8) {
    ctx.fillRect(0, y, 512, 3);
  }

  // Golden brass beveled borders with rivet corner dots
  ctx.strokeStyle = '#c8a44b';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 496, 144);
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(14, 14, 484, 132);

  // Corner rivet dots
  ctx.fillStyle = '#fef08a';
  [[11, 11], [501, 11], [11, 149], [501, 149]].forEach(([cx, cy]) => {
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // "Hello Handsome" header
  ctx.font = '900 46px "Cinzel", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Warm amber glow & drop shadow
  ctx.shadowColor = '#d97706';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#fde68a';
  ctx.fillText('Hello Handsome', 256, 68);

  // Sharp text core
  ctx.shadowBlur = 2;
  ctx.fillStyle = '#fffbeb';
  ctx.fillText('Hello Handsome', 256, 68);

  // Subtitle / nautical flair
  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = '#fcd34d';
  ctx.shadowColor = '#92400e';
  ctx.shadowBlur = 5;
  ctx.fillText('⚓  LOOKIN\' SHARP, CAPTAIN  ⚓', 256, 118);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Creates a flat-shaded standard material matching VoxelArms / ChunkRenderer aesthetics.
 */
const _voxelMatCache = new Map();
function createVoxelMat(color, opts = {}) {
  const mapId = opts.map ? (opts.map.id || opts.map.uuid) : 'nomap';
  const key = `${color}_${opts.roughness ?? 0.85}_${opts.metalness ?? 0.12}_${opts.flatShading ?? true}_${mapId}_${opts.transparent ?? false}_${opts.opacity ?? 1.0}_${opts.emissive ?? 0}_${opts.emissiveIntensity ?? 1.0}_${opts.wireframe ?? false}`;
  let mat = _voxelMatCache.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 0.85,
      metalness: opts.metalness ?? 0.12,
      flatShading: true,
      map: opts.map ?? null,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1.0,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 1.0,
      wireframe: opts.wireframe ?? false
    });
    _voxelMatCache.set(key, mat);
  }
  return mat;
}

/**
 * Creates a single voxel box with shadow casting/receiving.
 * Small decorative props (volume < 0.04m^3, maxDim < 0.28m) skip castShadow to prevent shadow map bloat.
 */
function createVoxelBox(w, h, d, material, castShadow = true, receiveShadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  const maxDim = Math.max(w, h, d);
  const vol = w * h * d;
  mesh.castShadow = (castShadow && vol >= 0.035 && maxDim >= 0.25);
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

/**
 * Builds an 8-sided faceted voxel ring for portholes and rope rings.
 */
function createVoxelOctagonRing(radius, thickness, depth, material) {
  const group = new THREE.Group();
  const sideLen = radius * 0.828; // 2 * radius * tan(PI / 8)
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const seg = createVoxelBox(sideLen, thickness, depth, material);
    seg.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
    seg.rotation.z = angle + Math.PI / 2;
    group.add(seg);
  }
  return group;
}

/**
 * Builds a solid 8-sided faceted voxel barrel with staves and cap lids.
 * Uses clean octagonal geometry without intersecting internal square boxes.
 */
function createVoxelBarrel(radius, height, woodMat, bandMat) {
  const barrel = new THREE.Group();
  const sideLen = radius * 0.828;
  const staveThick = 0.08;

  // 8 outer staves
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const stave = createVoxelBox(sideLen - 0.01, staveThick, height, woodMat);
    stave.position.set(Math.cos(angle) * (radius - staveThick / 2), Math.sin(angle) * (radius - staveThick / 2), 0);
    stave.rotation.z = angle + Math.PI / 2;
    barrel.add(stave);
  }

  // Top & bottom octagonal cap lids (built from two overlapping rotated slabs)
  [-height / 2 + 0.04, height / 2 - 0.04].forEach(capY => {
    const cap1 = createVoxelBox(radius * 1.84, radius * 0.76, 0.06, woodMat);
    cap1.position.z = capY;
    barrel.add(cap1);
    const cap2 = createVoxelBox(radius * 0.76, radius * 1.84, 0.06, woodMat);
    cap2.position.z = capY;
    barrel.add(cap2);
  });

  // 3 Iron hoop bands wrapped cleanly on the outside with zero Z-fighting
  [-height * 0.35, 0, height * 0.35].forEach(bandZ => {
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const bandSeg = createVoxelBox(sideLen + 0.01, 0.035, 0.09, bandMat);
      bandSeg.position.set(Math.cos(angle) * (radius + 0.02), Math.sin(angle) * (radius + 0.02), bandZ);
      bandSeg.rotation.z = angle + Math.PI / 2;
      barrel.add(bandSeg);
    }
  });

  // Stand barrel upright (Z becomes Y)
  barrel.rotation.x = Math.PI / 2;
  return barrel;
}

// ---------------------------------------------------------------------------
// DockStall Environment Class
export const DOCK_SCALE = 0.55;

// ---------------------------------------------------------------------------
export class DockStall {
  constructor() {
    this.group = new THREE.Group();
    this.gulls = [];
    this.shopCam = null;
    this.lanternLight = null;
    this.signPivot = null;
    this.shopGroup = null;
    this.shopDoor = null;
    this.doorInteractables = [];
    this.bunny = null;
    this.bunnyInteractables = [];
    this.crab = null;
    this.crabInteractables = [];
    this.divorcePostInteractables = [];
    this.divorcePostAura = null;
    this.divorceScrollGroup = null;
    this.shipInteractables = [];
    this.ledgerInteractables = [];
    this.shipNeedsRepair = false;
    this.activeShipProfile = null;
    this.shipyardInteractables = [];
    this.dockNPC = null;
    this.ghostMerchant = null;
    this.ghostMerchantInteractables = [];
    this.bookLight = null;
    this.bookAura = null;
    this.exteriorMirror = null;
    this._isBuilt = false;
  }

  build() {
    if (this._isBuilt) return this.group;
    this._isBuilt = true;

    // Instantiate DockNPC walking humanoid sprite
    this.dockNPC = new DockNPC(this.group);

    // Scale entire dock and island to match human/consistent ship proportions
    this.group.scale.setScalar(DOCK_SCALE);

    // Generate stylized voxel wood textures
    const texWoodHi = createVoxelWoodTexture(181, 139, 94, 0.16);
    const texWoodMid = createVoxelWoodTexture(120, 83, 50, 0.20);
    const texWoodDark = createVoxelWoodTexture(61, 39, 22, 0.22);
    const texPlank = createVoxelWoodTexture(155, 122, 90, 0.18);

    // Voxel Material Palette
    const mats = {
      plank: createVoxelMat(Palette.dockPlank, { roughness: 0.88, map: texPlank }),
      plankDark: createVoxelMat(Palette.dockDark, { roughness: 0.9, map: texWoodDark }),
      plankHi: createVoxelMat(Palette.woodHi, { roughness: 0.8, map: texWoodHi }),
      woodHi: createVoxelMat(Palette.woodHi, { roughness: 0.8, map: texWoodHi }), // Defined to prevent unlit white fallback!
      woodMid: createVoxelMat(Palette.woodMid, { roughness: 0.85, map: texWoodMid }),
      woodDark: createVoxelMat(Palette.woodDark, { roughness: 0.9, map: texWoodDark }),
      woodTrim: createVoxelMat(Palette.woodTrim, { roughness: 0.92, map: texWoodDark }),
      woodAged: createVoxelMat(Palette.woodAged, { roughness: 0.88, map: texWoodMid }),
      roofTile: createVoxelMat(Palette.roofTile, { roughness: 0.95 }),
      roofRidge: createVoxelMat(Palette.roofRidge, { roughness: 0.95 }),
      grassTop: createVoxelMat(Palette.grassTop, { roughness: 0.95 }),
      grassDark: createVoxelMat(Palette.grassDark, { roughness: 0.95 }),
      dirt: createVoxelMat(Palette.dirt, { roughness: 0.92 }),
      stone: createVoxelMat(Palette.stone, { roughness: 0.88 }),
      stoneDark: createVoxelMat(Palette.stoneDark, { roughness: 0.9 }),
      stoneLight: createVoxelMat(Palette.stoneLight, { roughness: 0.86 }),
      stonePath: createVoxelMat(Palette.stonePath, { roughness: 0.85 }),
      sand: createVoxelMat(Palette.sand, { roughness: 0.95 }),
      sandWet: createVoxelMat(Palette.sandWet, { roughness: 0.9 }),
      brass: createVoxelMat(Palette.brass, { metalness: 0.65, roughness: 0.35 }),
      brassDark: createVoxelMat(Palette.brassDark, { metalness: 0.55, roughness: 0.45 }),
      iron: createVoxelMat(Palette.iron, { metalness: 0.5, roughness: 0.6 }),
      ironLight: createVoxelMat(Palette.ironLight, { metalness: 0.55, roughness: 0.5 }),
      sackBurlap: createVoxelMat(Palette.sackBurlap, { roughness: 0.95 }),
      rope: createVoxelMat(Palette.rope, { roughness: 0.9 }),
      paper: createVoxelMat(Palette.paper, { roughness: 0.7 }),
      glass: createVoxelMat(Palette.glassPorthole, { transparent: true, opacity: 0.55, roughness: 0.15, metalness: 0.3 }),
      lanternGlow: createVoxelMat(Palette.lanternGlass, { emissive: 0xffaa33, emissiveIntensity: 0.85, transparent: true, opacity: 0.7 }),
      flowerWhite: createVoxelMat(Palette.flowerWhite, { roughness: 0.9 }),
      flowerYellow: createVoxelMat(Palette.flowerYellow, { roughness: 0.9 }),
      flowerRed: createVoxelMat(Palette.flowerRed, { roughness: 0.9 }),
      flowerBlue: createVoxelMat(Palette.flowerBlue, { roughness: 0.9 }),
      mushroomRed: createVoxelMat(Palette.mushroomRed, { roughness: 0.8 }),
      mushroomCap: createVoxelMat(Palette.mushroomCap, { roughness: 0.9 }),
      blueprint: createVoxelMat(Palette.blueprintBlue, { roughness: 0.85 }),
      blueprintLine: createVoxelMat(Palette.blueprintLine, { roughness: 0.8 }),
      sailCloth: createVoxelMat(Palette.sailCloth, { roughness: 0.92 }),
      sailClothTrim: createVoxelMat(Palette.sailClothTrim, { roughness: 0.95 }),
      emberGlow: createVoxelMat(Palette.emberGlow, { emissive: 0xff3300, emissiveIntensity: 1.2 }),
      woodAsh: createVoxelMat(Palette.woodAsh, { roughness: 0.95 })
    };

    // =========================================================================
    // 1. EXTENDED DOCK PIER (Full Support for Shop Backside & Wharf Walkway)
    // =========================================================================
    const dockGroup = new THREE.Group();
    dockGroup.position.y = 1.5;
    this.group.add(dockGroup);

    // Extend dock from Z = -5.0 all the way to Z = +8.6 so the shop backside
    // (reaching world Z = 6.5) and roof eaves (Z = 7.35) sit fully on timber decking!
    const dockLength = 18;
    const dockFrontZ = -5.0;
    const dockBackZ = 8.6;
    const dockWidth = dockBackZ - dockFrontZ; // 13.6m wide
    const dockCenterZ = (dockFrontZ + dockBackZ) / 2; // Z = 1.8m

    const plankCount = 14;
    const plankWidth = dockLength / plankCount;

    // Modular Deck Planks split into 4 staggered Z sections per row
    const zCuts = [-5.0, -1.5, 1.8, 5.2, 8.6];
    const nailGeo = new THREE.BoxGeometry(0.04, 0.02, 0.04);

    for (let i = 0; i < plankCount; i++) {
      const px = -dockLength / 2 + i * plankWidth + plankWidth / 2;
      const baseMat = i % 2 === 0 ? mats.plank : mats.plankDark;

      for (let s = 0; s < 4; s++) {
        const segLen = zCuts[s + 1] - zCuts[s] - 0.035;
        const segZ = zCuts[s] + segLen / 2 + 0.018;
        const segMat = (i + s) % 3 === 0 ? mats.plankHi : baseMat;
        const plank = createVoxelBox(plankWidth - 0.035, 0.28, segLen, segMat);
        plank.position.set(px, 0.49, segZ);
        dockGroup.add(plank);

        // Voxel iron nail heads over stringer beams
        [-plankWidth * 0.35, plankWidth * 0.35].forEach(nx => {
          const nail1 = new THREE.Mesh(nailGeo, mats.iron);
          nail1.position.set(px + nx, 0.635, segZ - segLen * 0.42);
          dockGroup.add(nail1);
          const nail2 = new THREE.Mesh(nailGeo, mats.iron);
          nail2.position.set(px + nx, 0.635, segZ + segLen * 0.42);
          dockGroup.add(nail2);
        });
      }
    }

    // Heavy Timber Edge Curb Rails (Front at -5.0 and Rear at +8.6)
    const frontCurb = createVoxelBox(dockLength + 0.2, 0.22, 0.32, mats.woodDark);
    frontCurb.position.set(0, 0.64, dockFrontZ + 0.16);
    dockGroup.add(frontCurb);

    const backCurb = createVoxelBox(dockLength + 0.2, 0.22, 0.32, mats.woodDark);
    backCurb.position.set(0, 0.64, dockBackZ - 0.16);
    dockGroup.add(backCurb);

    // End curb on water-facing side (+X)
    const endCurb = createVoxelBox(0.32, 0.22, dockWidth, mats.woodDark);
    endCurb.position.set(dockLength / 2 - 0.16, 0.64, dockCenterZ);
    dockGroup.add(endCurb);

    // Invisible Smooth Deck Collider (Color and depth writes disabled to avoid white glitch)
    const dockCollisionDeck = new THREE.Mesh(
      new THREE.BoxGeometry(dockLength, 0.35, dockWidth),
      new THREE.MeshBasicMaterial({ visible: false, colorWrite: false, depthWrite: false })
    );
    dockCollisionDeck.position.set(0, 0.5, dockCenterZ);
    dockGroup.add(dockCollisionDeck);

    // Square Timber Pilings (Posts supporting the full extended wharf)
    const pilingLocations = [
      [-8, -4.5], [-8, 0], [-8, 4.5], [-8, 8.0],
      [-3, -4.5], [-3, 0], [-3, 4.5], [-3, 8.0],
      [2, -4.5], [2, 0], [2, 4.5], [2, 8.0],
      [8, -4.5], [8, 0], [8, 4.5], [8, 8.0]
    ];
    pilingLocations.forEach(([x, z]) => {
      // Main square pile
      const post = createVoxelBox(0.58, 5.8, 0.58, mats.woodTrim);
      post.position.set(x, -2.1, z);
      dockGroup.add(post);

      // Pile head extending slightly above deck
      const postTop = createVoxelBox(0.62, 0.36, 0.62, mats.woodDark);
      postTop.position.set(x, 0.72, z);
      dockGroup.add(postTop);

      // Iron bracket collar
      const collar = createVoxelBox(0.68, 0.16, 0.68, mats.iron);
      collar.position.set(x, 0.46, z);
      dockGroup.add(collar);

      // Mooring post rope coil on select perimeter pilings
      if (z === -4.5 && (Math.abs(x) > 6 || x === 2)) {
        const ropeRing = createVoxelBox(0.78, 0.22, 0.78, mats.rope);
        ropeRing.position.set(x, 0.62, z);
        dockGroup.add(ropeRing);
      }
    });

    // Sub-deck support stringers (heavy square timber beams connecting the pilings)
    [-4.5, 0, 4.5, 8.0].forEach(z => {
      const beam = createVoxelBox(dockLength - 0.5, 0.42, 0.45, mats.woodTrim);
      beam.position.set(0, 0.18, z);
      dockGroup.add(beam);
    });
    [-8, -3, 2, 8].forEach(x => {
      const crossBeam = createVoxelBox(0.45, 0.42, dockWidth - 0.8, mats.woodTrim);
      crossBeam.position.set(x, 0.16, dockCenterZ);
      dockGroup.add(crossBeam);
    });

    // Voxel Mooring Cleats on Front Pier Edge
    [-5, 0, 5].forEach(x => {
      const cleatBase = createVoxelBox(0.48, 0.08, 0.18, mats.iron);
      cleatBase.position.set(x, 0.76, dockFrontZ + 0.16);
      dockGroup.add(cleatBase);

      const cleatBar = createVoxelBox(0.72, 0.08, 0.09, mats.iron);
      cleatBar.position.set(x, 0.84, dockFrontZ + 0.16);
      dockGroup.add(cleatBar);
    });

    // =========================================================================
    // 2. EXPANDED ISLAND LANDMASS & SHIPYARD ENVIRONMENT
    // =========================================================================
    const islandGroup = new THREE.Group();
    islandGroup.position.set(-22, 0, 0);
    this.group.add(islandGroup);

    this._buildExpandedIsland(islandGroup, mats);
    this._buildIslandFoliageAndDetails(islandGroup, mats);
    this._buildIslandTrailAndLookout(islandGroup, mats);
    this._buildOpeningBeachAndDivorcePost(islandGroup, mats);
    this._buildShipyardSkeleton(islandGroup, mats);
    this._buildGhostMerchantStall(islandGroup, mats);

    // Easter Egg: Voxel Lop-Eared Bunny hopping around island grass meadow
    this.bunny = new VoxelLopBunny(islandGroup, new THREE.Vector3(0, 2.0, 2.5), this.group);
    this.bunnyInteractables = this.bunny.interactables;

    // Day 0 Opening Cutscene: Clerk Crab on the shoreline edge of the northeast beach (y = 1.15)
    this.crab = new VoxelCrab(islandGroup, new THREE.Vector3(8.5, 1.15, -19.6));
    this.crabInteractables = this.crab.interactables;

    // =========================================================================
    // 3. CHANDLERY SHOP STALL (Voxel Architecture, Roof & Interior)
    // =========================================================================
    const shop = new THREE.Group();
    shop.position.set(2.1, 2.15, 4);
    shop.rotation.y = -Math.PI;
    this.shopGroup = shop;
    this.group.add(shop);

    const shopW = 6.0;
    const shopD = 5.0;
    const shopH = 5.4;
    const backZ = -shopD / 2;
    const frontZ = shopD / 2;
    const rightX = shopW / 2;
    const leftX = -shopW / 2;

    // Floor — stepped voxel plank platform
    const floorBase = createVoxelBox(shopW - 0.1, 0.22, shopD - 0.1, mats.plankDark);
    floorBase.position.set(0, 0.11, 0);
    shop.add(floorBase);

    // Floor surface planks
    const floorPlanksCount = 10;
    const fPlankLen = (shopD - 0.2) / floorPlanksCount;
    for (let f = 0; f < floorPlanksCount; f++) {
      const fpz = -shopD / 2 + 0.1 + f * fPlankLen + fPlankLen / 2;
      const fp = createVoxelBox(shopW - 0.18, 0.04, fPlankLen - 0.03, f % 2 === 0 ? mats.plank : mats.plankHi);
      fp.position.set(0, 0.23, fpz);
      shop.add(fp);
    }

    // Heavy Timber Corner Posts (Recessed wall joint to prevent any texture clipping)
    const cornerPostLocations = [
      [leftX + 0.21, backZ + 0.21],
      [rightX - 0.21, backZ + 0.21],
      [leftX + 0.21, frontZ - 0.21],
      [rightX - 0.21, frontZ - 0.21]
    ];
    cornerPostLocations.forEach(([cx, cz]) => {
      const post = createVoxelBox(0.42, shopH, 0.42, mats.woodDark);
      post.position.set(cx, shopH / 2, cz);
      shop.add(post);

      const shoe = createVoxelBox(0.48, 0.35, 0.48, mats.iron);
      shoe.position.set(cx, 0.25, cz);
      shop.add(shoe);

      const cap = createVoxelBox(0.48, 0.22, 0.48, mats.woodTrim);
      cap.position.set(cx, shopH - 0.11, cz);
      shop.add(cap);
    });

    // Perimeter Header Beams
    const frontBeam = createVoxelBox(shopW - 0.4, 0.32, 0.38, mats.woodDark);
    frontBeam.position.set(0, shopH - 0.16, frontZ - 0.21);
    shop.add(frontBeam);

    const backBeam = createVoxelBox(shopW - 0.4, 0.32, 0.38, mats.woodDark);
    backBeam.position.set(0, shopH - 0.16, backZ + 0.21);
    shop.add(backBeam);

    const leftBeam = createVoxelBox(0.38, 0.32, shopD - 0.45, mats.woodDark);
    leftBeam.position.set(leftX + 0.21, shopH - 0.16, 0);
    shop.add(leftBeam);

    const rightBeam = createVoxelBox(0.38, 0.32, shopD - 0.45, mats.woodDark);
    rightBeam.position.set(rightX - 0.21, shopH - 0.16, 0);
    shop.add(rightBeam);

    // -------------------------------------------------------------------------
    // Back Wall: Horizontal Voxel Lap Siding & Framing
    // -------------------------------------------------------------------------
    const backWallGroup = new THREE.Group();
    backWallGroup.position.set(0, 0, backZ);
    shop.add(backWallGroup);

    const wallPlankCount = 12;
    const wallPlankH = shopH / wallPlankCount;
    for (let p = 0; p < wallPlankCount; p++) {
      const py = p * wallPlankH + wallPlankH / 2;
      const isAlt = p % 2 === 0;
      const plank = createVoxelBox(shopW - 0.45, wallPlankH - 0.03, 0.22, isAlt ? mats.woodMid : mats.woodAged);
      plank.position.set(0, py, 0.11);
      backWallGroup.add(plank);

      if (p % 3 === 0) {
        const trimBand = createVoxelBox(shopW - 0.4, 0.1, 0.26, mats.woodDark);
        trimBand.position.set(0, py, 0.12);
        backWallGroup.add(trimBand);
      }
    }

    // -------------------------------------------------------------------------
    // Left Wall: Lap Siding + Perfectly Fitted Voxel Porthole (Zero Gaps, Centered)
    // -------------------------------------------------------------------------
    const leftWallGroup = new THREE.Group();
    leftWallGroup.position.set(leftX, 0, 0);
    shop.add(leftWallGroup);

    const portholeZ = -0.5;
    const portholeY = 3.0;
    const portholeR = 0.65;
    const octSide = portholeR * 0.828; // ~0.538m

    // Solid wall panels below and above the porthole
    const yBottomSill = portholeY - portholeR; // 2.35m
    const yTopHeader = portholeY + portholeR; // 3.65m

    const wallLower = createVoxelBox(0.22, yBottomSill, shopD - 0.45, mats.woodMid);
    wallLower.position.set(0.11, yBottomSill / 2, 0);
    leftWallGroup.add(wallLower);

    const wallUpper = createVoxelBox(0.22, shopH - yTopHeader, shopD - 0.45, mats.woodMid);
    wallUpper.position.set(0.11, yTopHeader + (shopH - yTopHeader) / 2, 0);
    leftWallGroup.add(wallUpper);

    // Side jamb panels flanking the porthole opening
    const openingH = yTopHeader - yBottomSill; // 1.30m
    const openingHalfW = portholeR; // 0.65m

    // Back side of porthole: from back edge to opening
    const leftBackLen = (portholeZ - openingHalfW) - (-shopD / 2 + 0.25);
    const leftBackPanel = createVoxelBox(0.22, openingH, leftBackLen, mats.woodMid);
    leftBackPanel.position.set(0.11, portholeY, -shopD / 2 + 0.25 + leftBackLen / 2);
    leftWallGroup.add(leftBackPanel);

    // Front side of porthole: from opening to front edge
    const leftFrontLen = (shopD / 2 - 0.25) - (portholeZ + openingHalfW);
    const leftFrontPanel = createVoxelBox(0.22, openingH, leftFrontLen, mats.woodMid);
    leftFrontPanel.position.set(0.11, portholeY, shopD / 2 - 0.25 - leftFrontLen / 2);
    leftWallGroup.add(leftFrontPanel);

    // Fitted octagonal corner infill blocks to completely seal all 4 diagonal corners!
    const cornerSize = openingHalfW * 0.45;
    [
      [portholeZ - openingHalfW * 0.72, portholeY - openingHalfW * 0.72],
      [portholeZ + openingHalfW * 0.72, portholeY - openingHalfW * 0.72],
      [portholeZ - openingHalfW * 0.72, portholeY + openingHalfW * 0.72],
      [portholeZ + openingHalfW * 0.72, portholeY + openingHalfW * 0.72]
    ].forEach(([cz, cy]) => {
      const cornerInfill = createVoxelBox(0.22, cornerSize, cornerSize, mats.woodTrim);
      cornerInfill.position.set(0.11, cy, cz);
      leftWallGroup.add(cornerInfill);
    });

    // Exterior Octagonal Brass Frame (Outside face at x = -0.02)
    const extOctRing = createVoxelOctagonRing(portholeR, 0.12, 0.08, mats.brass);
    extOctRing.rotation.y = Math.PI / 2;
    extOctRing.position.set(-0.02, portholeY, portholeZ);
    leftWallGroup.add(extOctRing);

    // Interior Octagonal Brass Frame (Inside face at x = 0.24, perfectly visible & centered!)
    const intOctRing = createVoxelOctagonRing(portholeR, 0.12, 0.08, mats.brass);
    intOctRing.rotation.y = Math.PI / 2;
    intOctRing.position.set(0.24, portholeY, portholeZ);
    leftWallGroup.add(intOctRing);

    // Brass inner lining collar bridging through the wall
    const collarRing = createVoxelOctagonRing(portholeR - 0.05, 0.06, 0.24, mats.brassDark);
    collarRing.rotation.y = Math.PI / 2;
    collarRing.position.set(0.11, portholeY, portholeZ);
    leftWallGroup.add(collarRing);

    // Perfectly Centered Translucent Porthole Glass
    const portholeGlass = createVoxelBox(0.04, portholeR * 1.5, portholeR * 1.5, mats.glass);
    portholeGlass.position.set(0.11, portholeY, portholeZ);
    leftWallGroup.add(portholeGlass);

    // Centered Cross-Muntin Bars
    const muntinH = createVoxelBox(0.06, 0.05, portholeR * 1.6, mats.brass);
    muntinH.position.set(0.11, portholeY, portholeZ);
    leftWallGroup.add(muntinH);
    const muntinV = createVoxelBox(0.06, portholeR * 1.6, 0.05, mats.brass);
    muntinV.position.set(0.11, portholeY, portholeZ);
    leftWallGroup.add(muntinV);

    // -------------------------------------------------------------------------
    // Exterior Grooming Mirror & "Hello Handsome" Sign (Opposite to Door Wall)
    // -------------------------------------------------------------------------
    const mirrorZ = 1.25;
    const mirrorY = 2.65;
    const mirrorW = 1.35;
    const mirrorH = 2.05;

    // Dark timber mirror backboard (prevent light leaks behind frame)
    const mirrorBacking = createVoxelBox(0.04, mirrorH + 0.16, mirrorW + 0.16, mats.woodDark);
    mirrorBacking.position.set(-0.015, mirrorY, mirrorZ);
    leftWallGroup.add(mirrorBacking);

    // Planar Reflector mirror surface (faces outward in shop -X / dock +X)
    const reflector = new Reflector(new THREE.PlaneGeometry(mirrorW, mirrorH), {
      clipBias: 0.003,
      textureWidth: 1024,
      textureHeight: 1024,
      color: 0x8899aa
    });
    reflector.position.set(-0.038, mirrorY, mirrorZ);
    reflector.rotation.y = -Math.PI / 2;

    // Reflection camera passes: render default scene (layer 0) AND player mirror avatar (layer 1)
    const origReflectorOnBeforeRender = reflector.onBeforeRender;
    reflector.onBeforeRender = function(renderer, scene, camera) {
      const refCam = this.getReflectionCamera(camera);
      if (refCam) {
        refCam.layers.enable(0);
        refCam.layers.enable(1);
      }
      origReflectorOnBeforeRender.call(this, renderer, scene, camera);
    };
    leftWallGroup.add(reflector);
    this.exteriorMirror = reflector;

    // Heavy Carved Voxel Frame around mirror
    const frameBorder = 0.10;
    const frameThick = 0.06;
    const frameMat = mats.woodTrim;

    // Top & Bottom frame bars
    const frameTop = createVoxelBox(frameThick, frameBorder, mirrorW + frameBorder * 2, frameMat);
    frameTop.position.set(-0.045, mirrorY + mirrorH / 2 + frameBorder / 2, mirrorZ);
    leftWallGroup.add(frameTop);

    const frameBottom = createVoxelBox(frameThick, frameBorder, mirrorW + frameBorder * 2, frameMat);
    frameBottom.position.set(-0.045, mirrorY - mirrorH / 2 - frameBorder / 2, mirrorZ);
    leftWallGroup.add(frameBottom);

    // Left (back Z) & Right (front Z) frame bars
    const frameSideBack = createVoxelBox(frameThick, mirrorH, frameBorder, frameMat);
    frameSideBack.position.set(-0.045, mirrorY, mirrorZ - mirrorW / 2 - frameBorder / 2);
    leftWallGroup.add(frameSideBack);

    const frameSideFront = createVoxelBox(frameThick, mirrorH, frameBorder, frameMat);
    frameSideFront.position.set(-0.045, mirrorY, mirrorZ + mirrorW / 2 + frameBorder / 2);
    leftWallGroup.add(frameSideFront);

    // Brass corner braces on the mirror frame
    const cornerRosetteSize = 0.11;
    [
      [mirrorY - mirrorH / 2 - frameBorder / 2, mirrorZ - mirrorW / 2 - frameBorder / 2],
      [mirrorY - mirrorH / 2 - frameBorder / 2, mirrorZ + mirrorW / 2 + frameBorder / 2],
      [mirrorY + mirrorH / 2 + frameBorder / 2, mirrorZ - mirrorW / 2 - frameBorder / 2],
      [mirrorY + mirrorH / 2 + frameBorder / 2, mirrorZ + mirrorW / 2 + frameBorder / 2]
    ].forEach(([cy, cz]) => {
      const cornerBrace = createVoxelBox(frameThick + 0.02, cornerRosetteSize, cornerRosetteSize, mats.brass);
      cornerBrace.position.set(-0.048, cy, cz);
      leftWallGroup.add(cornerBrace);
    });

    // -------------------------------------------------------------------------
    // "Hello Handsome" Carved Sign directly above the Mirror
    // -------------------------------------------------------------------------
    const signY = 4.05;
    const signW = 1.55;
    const signH = 0.46;
    const signD = 0.06;

    const helloHandsomeTex = createHelloHandsomeSignTexture();
    const helloHandsomeMat = createVoxelMat(0xffffff, { map: helloHandsomeTex, roughness: 0.75 });

    // Sign backing plaque
    const signBacking = createVoxelBox(signD, signH, signW, mats.woodDark);
    signBacking.position.set(-0.035, signY, mirrorZ);
    leftWallGroup.add(signBacking);

    // Sign canvas face
    const signFace = new THREE.Mesh(new THREE.PlaneGeometry(signW - 0.06, signH - 0.06), helloHandsomeMat);
    signFace.position.set(-0.068, signY, mirrorZ);
    signFace.rotation.y = -Math.PI / 2;
    leftWallGroup.add(signFace);

    // Sign wooden rim trim
    const signTrimBorder = 0.05;
    const signTrimMat = mats.woodTrim;
    const signTrimTop = createVoxelBox(0.08, signTrimBorder, signW + 0.04, signTrimMat);
    signTrimTop.position.set(-0.05, signY + signH / 2 + signTrimBorder / 2, mirrorZ);
    leftWallGroup.add(signTrimTop);

    const signTrimBottom = createVoxelBox(0.08, signTrimBorder, signW + 0.04, signTrimMat);
    signTrimBottom.position.set(-0.05, signY - signH / 2 - signTrimBorder / 2, mirrorZ);
    leftWallGroup.add(signTrimBottom);

    const signTrimBack = createVoxelBox(0.08, signH, signTrimBorder, signTrimMat);
    signTrimBack.position.set(-0.05, signY, mirrorZ - signW / 2 - signTrimBorder / 2);
    leftWallGroup.add(signTrimBack);

    const signTrimFront = createVoxelBox(0.08, signH, signTrimBorder, signTrimMat);
    signTrimFront.position.set(-0.05, signY, mirrorZ + signW / 2 + signTrimBorder / 2);
    leftWallGroup.add(signTrimFront);

    // Iron suspension brackets hanging the sign
    [-signW * 0.35, signW * 0.35].forEach(szOffset => {
      const chain = createVoxelBox(0.03, 0.45, 0.03, mats.iron);
      chain.position.set(-0.05, signY + signH / 2 + 0.22, mirrorZ + szOffset);
      leftWallGroup.add(chain);

      const hangerRing = createVoxelOctagonRing(0.06, 0.025, 0.025, mats.iron);
      hangerRing.rotation.y = Math.PI / 2;
      hangerRing.position.set(-0.05, signY + signH / 2 + 0.44, mirrorZ + szOffset);
      leftWallGroup.add(hangerRing);
    });

    // -------------------------------------------------------------------------
    // Vanity Grooming Shelf & Sconces below the Mirror
    // -------------------------------------------------------------------------
    const shelfY = 1.48;
    const shelfW = 1.45;
    const shelfD = 0.28;
    const shelfThick = 0.06;

    const shelfPlank = createVoxelBox(shelfD, shelfThick, shelfW, mats.woodHi);
    shelfPlank.position.set(-shelfD / 2, shelfY, mirrorZ);
    leftWallGroup.add(shelfPlank);

    // Two carved shelf brackets
    [-shelfW * 0.32, shelfW * 0.32].forEach(szOffset => {
      const bracket = createVoxelBox(shelfD * 0.75, 0.24, 0.06, mats.woodTrim);
      bracket.position.set(-shelfD * 0.4, shelfY - 0.14, mirrorZ + szOffset);
      leftWallGroup.add(bracket);
    });

    // Grooming accessories on shelf
    // Polished brass comb
    const comb = createVoxelBox(0.08, 0.015, 0.18, mats.brass);
    comb.position.set(-0.12, shelfY + shelfThick / 2 + 0.01, mirrorZ - 0.35);
    comb.rotation.y = 0.25;
    leftWallGroup.add(comb);

    // Razor
    const razor = createVoxelBox(0.04, 0.02, 0.14, mats.iron);
    razor.position.set(-0.16, shelfY + shelfThick / 2 + 0.015, mirrorZ - 0.22);
    razor.rotation.y = -0.4;
    leftWallGroup.add(razor);

    // Bay Rum grooming tonic bottle (amber translucent body + cork)
    const tonicMat = createVoxelMat(0xb45309, { roughness: 0.25, transparent: true, opacity: 0.85 });
    const tonicBody = createVoxelBox(0.09, 0.16, 0.09, tonicMat);
    tonicBody.position.set(-0.13, shelfY + shelfThick / 2 + 0.08, mirrorZ + 0.28);
    leftWallGroup.add(tonicBody);

    const tonicCork = createVoxelBox(0.05, 0.04, 0.05, mats.woodTrim);
    tonicCork.position.set(-0.13, shelfY + shelfThick / 2 + 0.18, mirrorZ + 0.28);
    leftWallGroup.add(tonicCork);

    // Polished brass shaving mug with lather foam
    const shavingMug = createVoxelBox(0.11, 0.12, 0.11, mats.brass);
    shavingMug.position.set(-0.13, shelfY + shelfThick / 2 + 0.06, mirrorZ + 0.05);
    leftWallGroup.add(shavingMug);

    const shavingFoam = createVoxelBox(0.09, 0.04, 0.09, createVoxelMat(0xf0fdf4, { roughness: 0.9 }));
    shavingFoam.position.set(-0.13, shelfY + shelfThick / 2 + 0.13, mirrorZ + 0.05);
    leftWallGroup.add(shavingFoam);

    // Two warm nautical wall sconce lanterns flanking the mirror
    const lanternMat = mats.brass;
    const lanternGlassMat = createVoxelMat(0xf59e0b, { emissive: 0xf59e0b, emissiveIntensity: 1.8 });

    [-0.92, 0.92].forEach(zOffset => {
      const lZ = mirrorZ + zOffset;
      const lY = 2.95;

      // Iron wall arm
      const arm = createVoxelBox(0.24, 0.04, 0.04, mats.iron);
      arm.position.set(-0.12, lY + 0.12, lZ);
      leftWallGroup.add(arm);

      // Lantern cage
      const cage = createVoxelBox(0.16, 0.24, 0.16, lanternMat);
      cage.position.set(-0.24, lY, lZ);
      leftWallGroup.add(cage);

      // Amber glowing glass core
      const glowGlass = createVoxelBox(0.12, 0.18, 0.12, lanternGlassMat);
      glowGlass.position.set(-0.24, lY, lZ);
      leftWallGroup.add(glowGlass);

      // Lantern top cap
      const cap = createVoxelBox(0.18, 0.05, 0.18, mats.brassDark);
      cap.position.set(-0.24, lY + 0.145, lZ);
      leftWallGroup.add(cap);

      // Warm subtle point light
      const lanternLight = new THREE.PointLight(0xffbe6b, 1.2, 5.5, 1.4);
      lanternLight.position.set(-0.35, lY, lZ);
      leftWallGroup.add(lanternLight);
    });

    // -------------------------------------------------------------------------
    // Right Wall: Doorway, Lintel & Interactive Voxel Shop Door
    // -------------------------------------------------------------------------
    const rightWallGroup = new THREE.Group();
    rightWallGroup.position.set(rightX, 0, 0);
    shop.add(rightWallGroup);

    const doorW = 1.65;
    const doorH = 3.65;
    const doorZ = -0.35;

    // Back wall panel of right side (from backZ to door frame)
    const rwBackLen = doorZ - doorW / 2 - (-shopD / 2 + 0.25);
    const rwBack = createVoxelBox(0.22, shopH, rwBackLen, mats.woodMid);
    rwBack.position.set(-0.11, shopH / 2, -shopD / 2 + 0.25 + rwBackLen / 2);
    rightWallGroup.add(rwBack);

    // Front wall panel of right side (from door frame to frontZ)
    const rwFrontLen = shopD / 2 - 0.25 - (doorZ + doorW / 2);
    const rwFront = createVoxelBox(0.22, shopH, rwFrontLen, mats.woodMid);
    rwFront.position.set(-0.11, shopH / 2, shopD / 2 - 0.25 - rwFrontLen / 2);
    rightWallGroup.add(rwFront);

    // Lintel panel above doorway
    const lintelH = shopH - doorH;
    const rwLintel = createVoxelBox(0.22, lintelH, doorW, mats.woodMid);
    rwLintel.position.set(-0.11, doorH + lintelH / 2, doorZ);
    rightWallGroup.add(rwLintel);

    // Transom Window above door
    const transomY = doorH + 0.85;
    const transomFrame = createVoxelBox(0.26, 0.58, 0.95, mats.woodTrim);
    transomFrame.position.set(-0.11, transomY, doorZ);
    rightWallGroup.add(transomFrame);

    const transomGlass = createVoxelBox(0.06, 0.44, 0.82, mats.glass);
    transomGlass.position.set(-0.11, transomY, doorZ);
    rightWallGroup.add(transomGlass);

    // Voxel Door Frame Jambs and Header
    const jambGeo = new THREE.BoxGeometry(0.32, doorH, 0.18);
    const jambBack = new THREE.Mesh(jambGeo, mats.woodDark);
    jambBack.position.set(-0.11, doorH / 2, doorZ - doorW / 2 - 0.09);
    rightWallGroup.add(jambBack);

    const jambFront = new THREE.Mesh(jambGeo, mats.woodDark);
    jambFront.position.set(-0.11, doorH / 2, doorZ + doorW / 2 + 0.09);
    rightWallGroup.add(jambFront);

    const jambHeader = createVoxelBox(0.32, 0.2, doorW + 0.36, mats.woodDark);
    jambHeader.position.set(-0.11, doorH + 0.08, doorZ);
    rightWallGroup.add(jambHeader);

    const threshold = createVoxelBox(0.34, 0.1, doorW + 0.2, mats.woodDark);
    threshold.position.set(-0.11, 0.05, doorZ);
    rightWallGroup.add(threshold);

    // -------------------------------------------------------------------------
    // Interactive Voxel Door Slab
    // -------------------------------------------------------------------------
    const doorGroup = new THREE.Group();
    doorGroup.position.set(rightX, 0.08, doorZ);
    shop.add(doorGroup);

    const doorLeafH = doorH - 0.1;
    const doorLeafW = doorW - 0.08;

    const doorLeaf = createVoxelBox(0.12, doorLeafH, doorLeafW, mats.woodHi);
    doorLeaf.position.set(0, doorLeafH / 2, 0);
    doorLeaf.userData = { isShopDoor: true, name: 'shopDoorLeaf' };
    doorGroup.add(doorLeaf);

    // Voxel Tongue-and-Groove vertical plank ridges
    for (let vp = 0; vp < 5; vp++) {
      const vZ = -doorLeafW / 2 + 0.14 + vp * (doorLeafW - 0.28) / 4;
      const vRidge = createVoxelBox(0.14, doorLeafH - 0.1, 0.03, mats.woodMid);
      vRidge.position.set(0, doorLeafH / 2, vZ);
      doorGroup.add(vRidge);
    }

    // Horizontal Rails and Diagonal Z-Brace (Exterior & Interior)
    [-0.07, 0.07].forEach(ox => {
      [0.35, doorLeafH * 0.5, doorLeafH - 0.35].forEach(ry => {
        const hRail = createVoxelBox(0.035, 0.18, doorLeafW - 0.08, mats.woodDark);
        hRail.position.set(ox, ry, 0);
        doorGroup.add(hRail);
      });

      const diagBrace = createVoxelBox(0.035, doorLeafH * 0.42, 0.15, mats.woodDark);
      diagBrace.position.set(ox, doorLeafH * 0.72, 0);
      diagBrace.rotation.x = 0.5;
      doorGroup.add(diagBrace);
    });

    // Voxel Brass Door Handles
    const handleY = 1.65;
    const handleZ = doorLeafW / 2 - 0.22;

    const extPlate = createVoxelBox(0.03, 0.38, 0.1, mats.brass);
    extPlate.position.set(0.08, handleY, handleZ);
    doorGroup.add(extPlate);

    const extHandle = createVoxelBox(0.08, 0.05, 0.24, mats.brassDark);
    extHandle.position.set(0.13, handleY, handleZ);
    doorGroup.add(extHandle);

    const intPlate = createVoxelBox(0.03, 0.38, 0.1, mats.brass);
    intPlate.position.set(-0.08, handleY, handleZ);
    doorGroup.add(intPlate);

    const intHandle = createVoxelBox(0.08, 0.05, 0.24, mats.brassDark);
    intHandle.position.set(-0.13, handleY, handleZ);
    doorGroup.add(intHandle);

    // Day 0 Tutorial: Glowing Outline around the Shop Door (visible when task is ENTER_SHOP)
    const doorGlowGroup = new THREE.Group();
    doorGlowGroup.visible = false;
    this.shopDoorGlowOutline = doorGlowGroup;

    const doorGlowMat = createVoxelMat(0xffd700, {
      emissive: 0xffb300,
      emissiveIntensity: 1.8,
      transparent: true,
      opacity: 0.92
    });
    this.shopDoorGlowMat = doorGlowMat;

    const borderThick = 0.11;
    const borderDepthX = 0.28; // Wraps slightly outside the door slab & jambs so it's unmistakable
    const glowLeft = createVoxelBox(borderDepthX, doorLeafH + borderThick * 2, borderThick, doorGlowMat, false, false);
    glowLeft.position.set(0.04, doorLeafH / 2, -doorLeafW / 2 - borderThick * 0.5);
    doorGlowGroup.add(glowLeft);

    const glowRight = createVoxelBox(borderDepthX, doorLeafH + borderThick * 2, borderThick, doorGlowMat, false, false);
    glowRight.position.set(0.04, doorLeafH / 2, doorLeafW / 2 + borderThick * 0.5);
    doorGlowGroup.add(glowRight);

    const glowTop = createVoxelBox(borderDepthX, borderThick, doorLeafW + borderThick * 2, doorGlowMat, false, false);
    glowTop.position.set(0.04, doorLeafH + borderThick * 0.5, 0);
    doorGlowGroup.add(glowTop);

    const glowBottom = createVoxelBox(borderDepthX, borderThick, doorLeafW + borderThick * 2, doorGlowMat, false, false);
    glowBottom.position.set(0.04, borderThick * 0.5, 0);
    doorGlowGroup.add(glowBottom);

    const doorGlowLight = new THREE.PointLight(0xffd700, 1.35, 7.5, 2);
    doorGlowLight.position.set(0.45, doorLeafH * 0.55, 0);
    this.shopDoorGlowLight = doorGlowLight;
    doorGlowGroup.add(doorGlowLight);

    doorGlowGroup.traverse(child => {
      if (child.isMesh) {
        child.userData.isShopDoor = true;
        child.userData.noWalk = true;
      }
    });
    doorGroup.add(doorGlowGroup);

    this.shopDoor = doorLeaf;
    this.doorInteractables = [doorLeaf, glowLeft, glowRight, glowTop, glowBottom];

    // Carved Chandlery Sign Plaque above door
    const doorSignBack = createVoxelBox(0.06, 0.32, 1.15, mats.woodTrim);
    doorSignBack.position.set(rightX + 0.12, doorH + 0.38, doorZ);
    shop.add(doorSignBack);

    const signCanvas = document.createElement('canvas');
    signCanvas.width = 256;
    signCanvas.height = 64;
    const sCtx = signCanvas.getContext('2d');
    sCtx.fillStyle = '#e8dcc4';
    sCtx.fillRect(0, 0, 256, 64);
    sCtx.fillStyle = '#3a2211';
    sCtx.font = 'bold 32px Georgia, serif';
    sCtx.textAlign = 'center';
    sCtx.textBaseline = 'middle';
    sCtx.fillText('CHANDLERY', 128, 32);
    sCtx.lineWidth = 4;
    sCtx.strokeStyle = '#3a2211';
    sCtx.strokeRect(4, 4, 248, 56);
    const doorSignTex = new THREE.CanvasTexture(signCanvas);

    const doorSignFace = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.26, 1.08),
      new THREE.MeshStandardMaterial({ map: doorSignTex, roughness: 0.8, flatShading: true })
    );
    doorSignFace.position.set(rightX + 0.155, doorH + 0.38, doorZ);
    shop.add(doorSignFace);

    // -------------------------------------------------------------------------
    // Stepped Voxel Pitched Roof (Overlapping Shingle Tiers & Ridge Beam)
    // -------------------------------------------------------------------------
    const roofGroup = new THREE.Group();
    shop.add(roofGroup);

    const roofOverhang = 0.85;
    const roofW = shopW + roofOverhang * 2;
    const roofBaseY = shopH + 0.08;
    const roofPeakY = shopH + 1.85;
    const shingleSteps = 8;

    for (let s = 0; s < shingleSteps; s++) {
      const t = s / shingleSteps;
      const nextT = (s + 1) / shingleSteps;

      const y = roofBaseY + t * (roofPeakY - roofBaseY);
      const stepH = (roofPeakY - roofBaseY) / shingleSteps + 0.08;
      const zExtent = (shopD / 2 + roofOverhang) * (1.0 - t * 0.95);
      const nextZExtent = (shopD / 2 + roofOverhang) * (1.0 - nextT * 0.95);
      const stepDepth = Math.max(0.35, zExtent - nextZExtent + 0.12);
      const stepZ = (zExtent + nextZExtent) / 2;

      const tileMat = s % 2 === 0 ? mats.roofTile : createVoxelMat(Palette.roofTileDark, { roughness: 0.95 });

      const frontStep = createVoxelBox(roofW, stepH, stepDepth, tileMat);
      frontStep.position.set(0, y + stepH / 2, stepZ);
      roofGroup.add(frontStep);

      const backStep = createVoxelBox(roofW, stepH, stepDepth, tileMat);
      backStep.position.set(0, y + stepH / 2, -stepZ);
      roofGroup.add(backStep);

      if (s === 0) {
        [-roofW / 2 + 0.4, -shopW / 4, 0, shopW / 4, roofW / 2 - 0.4].forEach(rx => {
          const rafterFront = createVoxelBox(0.18, 0.22, 0.45, mats.woodDark);
          rafterFront.position.set(rx, y - 0.1, stepZ + 0.1);
          roofGroup.add(rafterFront);

          const rafterBack = createVoxelBox(0.18, 0.22, 0.45, mats.woodDark);
          rafterBack.position.set(rx, y - 0.1, -stepZ - 0.1);
          roofGroup.add(rafterBack);
        });
      }
    }

    const ridgeBeam = createVoxelBox(roofW + 0.35, 0.28, 0.45, mats.roofRidge);
    ridgeBeam.position.set(0, roofPeakY + 0.14, 0);
    roofGroup.add(ridgeBeam);

    [-roofW / 2 - 0.15, roofW / 2 + 0.15].forEach(fx => {
      const finial = createVoxelBox(0.2, 0.45, 0.35, mats.woodDark);
      finial.position.set(fx, roofPeakY + 0.25, 0);
      roofGroup.add(finial);
    });

    [leftX, rightX].forEach(gx => {
      for (let g = 0; g < 4; g++) {
        const gt = g / 4;
        const gy = roofBaseY + gt * (roofPeakY - roofBaseY);
        const gw = (shopD - 0.2) * (1.0 - gt * 0.9);
        const gableTier = createVoxelBox(0.22, 0.45, gw, mats.woodAged);
        gableTier.position.set(gx + (gx > 0 ? -0.11 : 0.11), gy + 0.22, 0);
        roofGroup.add(gableTier);
      }
    });

    // -------------------------------------------------------------------------
    // 4. SERVING COUNTER & DISPLAY SHELVES (With Finished Textured Underside)
    // -------------------------------------------------------------------------
    const deskGroup = new THREE.Group();
    shop.add(deskGroup);

    const deskW = shopW - 0.8;
    const deskD = 1.8;
    const counterY = 2.0;

    // Corner Legs
    const legGeo = new THREE.BoxGeometry(0.26, counterY, 0.26);
    [
      [-deskW / 2 + 0.18, frontZ - 0.4],
      [deskW / 2 - 0.18, frontZ - 0.4],
      [-deskW / 2 + 0.18, frontZ - deskD + 0.2],
      [deskW / 2 - 0.18, frontZ - deskD + 0.2]
    ].forEach(([x, z]) => {
      const leg = new THREE.Mesh(legGeo, mats.woodDark);
      leg.position.set(x, counterY / 2, z);
      deskGroup.add(leg);

      const boot = createVoxelBox(0.32, 0.25, 0.32, mats.brass);
      boot.position.set(x, 0.125, z);
      deskGroup.add(boot);
    });

    // Lower and Upper Storage Shelves
    [0.72, 1.45].forEach(sy => {
      const shelfPlank = createVoxelBox(deskW, 0.12, deskD - 0.25, mats.woodMid);
      shelfPlank.position.set(0, sy, frontZ - deskD / 2 - 0.05);
      deskGroup.add(shelfPlank);
    });

    // Front Apron Panel (Facing Customer) with carved recessed panels
    const apron = createVoxelBox(deskW, counterY - 0.15, 0.16, mats.woodMid);
    apron.position.set(0, counterY / 2, frontZ - 0.18);
    deskGroup.add(apron);

    for (let c = 0; c < 3; c++) {
      const cx = -deskW / 3 + c * (deskW / 3);
      const panelFrame = createVoxelBox(deskW / 3.8, counterY * 0.65, 0.04, mats.woodTrim);
      panelFrame.position.set(cx, counterY * 0.52, frontZ - 0.08);
      deskGroup.add(panelFrame);
    }

    // Thick Counter Top (Properly using mats.woodHi with rich voxel wood texture!)
    const topPlank = createVoxelBox(deskW + 0.35, 0.18, deskD + 0.42, mats.woodHi);
    topPlank.position.set(0, counterY, frontZ - deskD / 2 + 0.15);
    deskGroup.add(topPlank);

    // Finished wooden underside beam & brackets under the counter overhang
    const undersideSoffit = createVoxelBox(deskW + 0.30, 0.06, 0.38, mats.woodDark);
    undersideSoffit.position.set(0, counterY - 0.12, frontZ + 0.05);
    deskGroup.add(undersideSoffit);

    [-deskW / 2 + 0.4, 0, deskW / 2 - 0.4].forEach(bx => {
      const bracket = createVoxelBox(0.12, 0.28, 0.22, mats.woodTrim);
      bracket.position.set(bx, counterY - 0.22, frontZ - 0.05);
      deskGroup.add(bracket);
    });

    const brassEdgeTrim = createVoxelBox(deskW + 0.38, 0.06, deskD + 0.45, mats.brass);
    brassEdgeTrim.position.set(0, counterY + 0.11, frontZ - deskD / 2 + 0.15);
    deskGroup.add(brassEdgeTrim);

    // -------------------------------------------------------------------------
    // 5. COUNTERTOP & SHELF PROPS
    // -------------------------------------------------------------------------
    // (a) Glowing Captain's Logbook & Inkpot
    const ledgerGroup = new THREE.Group();
    ledgerGroup.position.set(-deskW / 2 + 0.55, counterY + 0.12, frontZ - 0.45);
    ledgerGroup.rotation.y = 0.15;
    ledgerGroup.userData = { isLedger: true };
    deskGroup.add(ledgerGroup);

    const cover = createVoxelBox(0.62, 0.04, 0.44, mats.woodDark);
    cover.userData = { isLedger: true };
    ledgerGroup.add(cover);

    // Glowing parchment pages
    const glowingPaperMat = createVoxelMat(Palette.paper, {
      roughness: 0.6,
      emissive: 0xffaa33,
      emissiveIntensity: 0.55
    });

    const pagesLeft = createVoxelBox(0.28, 0.06, 0.4, glowingPaperMat);
    pagesLeft.position.set(-0.14, 0.04, 0);
    pagesLeft.rotation.z = -0.06;
    pagesLeft.userData = { isLedger: true };
    ledgerGroup.add(pagesLeft);

    const pagesRight = createVoxelBox(0.28, 0.06, 0.4, glowingPaperMat);
    pagesRight.position.set(0.14, 0.04, 0);
    pagesRight.rotation.z = 0.06;
    pagesRight.userData = { isLedger: true };
    ledgerGroup.add(pagesRight);

    // Brass corner clasps
    const cornerClasp1 = createVoxelBox(0.06, 0.045, 0.06, mats.brass);
    cornerClasp1.position.set(-0.28, 0.03, -0.19);
    ledgerGroup.add(cornerClasp1);
    const cornerClasp2 = createVoxelBox(0.06, 0.045, 0.06, mats.brass);
    cornerClasp2.position.set(0.28, 0.03, -0.19);
    ledgerGroup.add(cornerClasp2);

    // Warm pulsating glow point light
    const bookLight = new THREE.PointLight(0xffb84d, 1.4, 3.0);
    bookLight.position.set(0, 0.4, 0);
    ledgerGroup.add(bookLight);
    this.bookLight = bookLight;

    // Glowing mystical ring / rune hovering over the book
    const auraGeo = new THREE.RingGeometry(0.16, 0.22, 20);
    auraGeo.rotateX(-Math.PI / 2);
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0xffcc44,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide
    });
    const aura = new THREE.Mesh(auraGeo, auraMat);
    aura.position.set(0, 0.22, 0);
    ledgerGroup.add(aura);
    this.bookAura = aura;

    this.ledgerInteractables = [ledgerGroup, cover, pagesLeft, pagesRight, aura];

    const inkwell = createVoxelBox(0.12, 0.12, 0.12, mats.iron);
    inkwell.position.set(0.42, 0.06, 0.05);
    ledgerGroup.add(inkwell);
    const quill = createVoxelBox(0.03, 0.32, 0.05, mats.paper);
    quill.position.set(0.42, 0.22, 0.05);
    quill.rotation.z = -0.45;
    ledgerGroup.add(quill);

    // (b) Voxel Stacks of Gold Coins
    const coinMat = createVoxelMat(Palette.goldCoin, { metalness: 0.7, roughness: 0.3 });
    [
      { x: -deskW / 2 + 0.4, z: frontZ - 0.95, count: 5 },
      { x: -deskW / 2 + 0.52, z: frontZ - 1.02, count: 3 }
    ].forEach(stack => {
      for (let c = 0; c < stack.count; c++) {
        const coin = createVoxelBox(0.12, 0.022, 0.12, coinMat);
        coin.position.set(stack.x, counterY + 0.11 + c * 0.024, stack.z);
        coin.rotation.y = c * 0.4;
        deskGroup.add(coin);
      }
    });

    // (c) Voxel Weighing Scales
    const scaleGroup = new THREE.Group();
    scaleGroup.position.set(deskW / 2 - 0.65, counterY + 0.1, frontZ - 0.6);
    deskGroup.add(scaleGroup);

    const scaleBase = createVoxelBox(0.38, 0.08, 0.38, mats.brass);
    scaleGroup.add(scaleBase);
    const scaleShaft = createVoxelBox(0.08, 0.42, 0.08, mats.brass);
    scaleShaft.position.y = 0.24;
    scaleGroup.add(scaleShaft);

    const balanceBeam = createVoxelBox(0.68, 0.05, 0.05, mats.brass);
    balanceBeam.position.y = 0.45;
    scaleGroup.add(balanceBeam);

    [-0.3, 0.3].forEach(px => {
      const chain = createVoxelBox(0.02, 0.16, 0.02, mats.brassDark);
      chain.position.set(px, 0.35, 0);
      scaleGroup.add(chain);

      const pan = createVoxelBox(0.22, 0.03, 0.22, mats.brass);
      pan.position.set(px, 0.25, 0);
      scaleGroup.add(pan);
    });

    // (d) Counter Lantern & PointLight
    const lanternGroup = new THREE.Group();
    lanternGroup.position.set(deskW / 2 - 0.25, counterY + 0.1, frontZ - 1.1);
    deskGroup.add(lanternGroup);

    const lanternFrame = createVoxelBox(0.26, 0.38, 0.26, mats.woodDark);
    lanternGroup.add(lanternFrame);

    const lanternPane = createVoxelBox(0.24, 0.32, 0.24, mats.lanternGlow, false, true);
    lanternGroup.add(lanternPane);

    const lanternLight = new THREE.PointLight(0xffcc77, 2.8, 8, 2);
    lanternLight.position.set(0, 0.2, 0);
    lanternLight.castShadow = false; // PointLight shadows require 6 cubemap passes — disabled for 60 FPS
    lanternGroup.add(lanternLight);
    this.lanternLight = lanternLight;

    // (e) Counter Bell and Rope Coil
    const bellBase = createVoxelBox(0.14, 0.04, 0.14, mats.brassDark);
    bellBase.position.set(deskW / 2 - 1.25, counterY + 0.11, frontZ - 0.25);
    deskGroup.add(bellBase);
    const bellDome = createVoxelBox(0.1, 0.09, 0.1, mats.brass);
    bellDome.position.set(deskW / 2 - 1.25, counterY + 0.17, frontZ - 0.25);
    deskGroup.add(bellDome);

    const counterRope = createVoxelOctagonRing(0.18, 0.07, 0.07, mats.rope);
    counterRope.rotation.x = Math.PI / 2;
    counterRope.position.set(deskW / 2 - 0.35, counterY + 0.14, frontZ - 0.25);
    deskGroup.add(counterRope);

    // -------------------------------------------------------------------------
    // Display Goods on Lower and Upper Shelves
    // -------------------------------------------------------------------------
    // Lower Shelf: 7 Voxel Apothecary Flasks & Bottles
    const bottleColors = [Palette.bottleGreen, Palette.bottleBlue, Palette.bottleAmber, Palette.bottleWine];
    for (let b = 0; b < 7; b++) {
      const bx = -deskW / 2 + 0.4 + b * 0.32;
      const bColor = bottleColors[b % bottleColors.length];
      const bMat = createVoxelMat(bColor, { roughness: 0.2, transparent: true, opacity: 0.82 });

      const bodyH = 0.26 + (b % 3) * 0.05;
      const bottleBody = createVoxelBox(0.14, bodyH, 0.14, bMat);
      bottleBody.position.set(bx, 0.78 + bodyH / 2, frontZ - deskD / 2 - 0.05);
      deskGroup.add(bottleBody);

      const bottleNeck = createVoxelBox(0.06, 0.09, 0.06, bMat);
      bottleNeck.position.set(bx, 0.78 + bodyH + 0.045, frontZ - deskD / 2 - 0.05);
      deskGroup.add(bottleNeck);

      const corkMesh = createVoxelBox(0.075, 0.04, 0.075, createVoxelMat(Palette.cork));
      corkMesh.position.set(bx, 0.78 + bodyH + 0.105, frontZ - deskD / 2 - 0.05);
      deskGroup.add(corkMesh);
    }

    // Upper Shelf: 4 Spice Jars, 2 Burlap Sacks, Rolled Scrolls & Table Crate
    for (let j = 0; j < 4; j++) {
      const jx = deskW / 2 - 0.4 - j * 0.36;
      const jarBody = createVoxelBox(0.18, 0.24, 0.18, mats.dirt);
      jarBody.position.set(jx, 1.51 + 0.12, frontZ - deskD / 2 - 0.05);
      deskGroup.add(jarBody);

      const jarLid = createVoxelBox(0.2, 0.04, 0.2, mats.brass);
      jarLid.position.set(jx, 1.51 + 0.25, frontZ - deskD / 2 - 0.05);
      deskGroup.add(jarLid);

      const jarLabel = createVoxelBox(0.19, 0.12, 0.02, mats.paper);
      jarLabel.position.set(jx, 1.51 + 0.12, frontZ - deskD / 2 + 0.05);
      deskGroup.add(jarLabel);
    }

    // Stepped Burlap Sacks (Spices & Grains)
    const sackMat = createVoxelMat(Palette.sackBurlap, { roughness: 0.95 });
    [-deskW / 2 + 0.45, -deskW / 2 + 0.85].forEach((sx, idx) => {
      const sackBase = createVoxelBox(0.32 - idx * 0.04, 0.25, 0.3 - idx * 0.04, sackMat);
      sackBase.position.set(sx, 1.51 + 0.125, frontZ - deskD / 2 - 0.05);
      deskGroup.add(sackBase);

      const sackTie = createVoxelBox(0.18, 0.06, 0.18, mats.rope);
      sackTie.position.set(sx, 1.51 + 0.27, frontZ - deskD / 2 - 0.05);
      deskGroup.add(sackTie);
    });

    // Rolled Sea Charts / Maps
    [0.35, 0.65].forEach((rx, idx) => {
      const scroll = createVoxelBox(0.08, 0.08, 0.35 + idx * 0.08, mats.paper);
      scroll.position.set(rx, 1.55, frontZ - deskD / 2 - 0.05);
      scroll.rotation.y = 0.2 + idx * 0.25;
      deskGroup.add(scroll);
    });

    // Shelf tabletop crate
    const shelfCrate = createVoxelBox(0.42, 0.24, 0.32, mats.woodHi);
    shelfCrate.position.set(1.2, 1.51 + 0.12, frontZ - deskD / 2 - 0.05);
    shelfCrate.rotation.y = 0.15;
    deskGroup.add(shelfCrate);

    // -------------------------------------------------------------------------
    // Back Wall Decor (Voxel Trophy Fish & Fishing Net)
    // -------------------------------------------------------------------------
    const netMesh = createVoxelBox(2.2, 1.6, 0.02, createVoxelMat(Palette.ropeDark, { wireframe: true }));
    netMesh.position.set(-1.2, 3.8, backZ + 0.15);
    shop.add(netMesh);

    const fishGroup = new THREE.Group();
    fishGroup.position.set(1.4, 3.6, backZ + 0.2);
    fishGroup.rotation.z = 0.08;
    shop.add(fishGroup);

    const fishPlaque = createVoxelBox(0.95, 0.45, 0.06, mats.woodDark);
    fishGroup.add(fishPlaque);

    const fishBody = createVoxelBox(0.68, 0.24, 0.12, createVoxelMat(Palette.fishBody));
    fishBody.position.z = 0.07;
    fishGroup.add(fishBody);

    const fishBelly = createVoxelBox(0.64, 0.08, 0.13, createVoxelMat(Palette.fishBelly));
    fishBelly.position.set(0, -0.08, 0.07);
    fishGroup.add(fishBelly);

    const fishTail = createVoxelBox(0.18, 0.24, 0.06, createVoxelMat(Palette.fishBody));
    fishTail.position.set(-0.42, 0, 0.07);
    fishGroup.add(fishTail);

    // -------------------------------------------------------------------------
    // 6. SWINGING SIGN RIG & CHANDLERY SIGN
    // -------------------------------------------------------------------------
    const rigging = new THREE.Group();
    shop.add(rigging);

    const crossbeam = createVoxelBox(shopW + 0.4, 0.24, 0.32, mats.woodDark);
    crossbeam.position.set(0, shopH - 0.32, frontZ + 0.3);
    rigging.add(crossbeam);

    [-shopW / 2 + 0.35, shopW / 2 - 0.35].forEach(bx => {
      const bracket = createVoxelBox(0.16, 0.52, 0.16, mats.woodDark);
      bracket.position.set(bx, -0.36, 0);
      crossbeam.add(bracket);

      const diagStrut = createVoxelBox(0.12, 0.58, 0.12, mats.woodDark);
      diagStrut.position.set(bx > 0 ? -0.22 : 0.22, -0.32, -0.16);
      diagStrut.rotation.z = bx > 0 ? 0.6 : -0.6;
      crossbeam.add(diagStrut);
    });

    const signPivot = new THREE.Group();
    signPivot.position.set(0, -0.14, 0.16);
    crossbeam.add(signPivot);
    this.signPivot = signPivot;

    [-0.9, 0.9].forEach(cx => {
      for (let cl = 0; cl < 3; cl++) {
        const link = createVoxelBox(0.04, 0.16, 0.04, mats.iron);
        link.position.set(cx, -0.12 - cl * 0.15, 0);
        signPivot.add(link);
      }
    });

    const mainSign = createVoxelBox(2.4, 0.78, 0.1, mats.woodHi);
    mainSign.position.set(0, -0.92, 0);
    signPivot.add(mainSign);

    const signBorder = createVoxelBox(2.52, 0.88, 0.06, mats.woodDark);
    signBorder.position.set(0, -0.92, -0.03);
    signPivot.add(signBorder);

    const waxSeal = createVoxelBox(0.24, 0.24, 0.06, createVoxelMat(Palette.sealRed, { roughness: 0.4 }));
    waxSeal.position.set(0.72, -0.92, 0.07);
    signPivot.add(waxSeal);

    // -------------------------------------------------------------------------
    // 7. EXTERIOR PROPS (Faceted Voxel Barrels & Crates with Zero Clipping)
    // -------------------------------------------------------------------------
    // 3 Octagonal Voxel Barrels (Built with clean faceted staves and offset bands)
    const barrelLocations = [
      { x: leftX - 0.75, z: -0.5, h: 1.25, r: 0.38 },
      { x: leftX - 0.75, z: -1.25, h: 1.05, r: 0.32 }, // Positioned with barrel 1 to keep mirror walkway open
      { x: rightX + 0.72, z: -2.0, h: 1.35, r: 0.4 } // Sits securely on the extended dock!
    ];
    barrelLocations.forEach(b => {
      const barrel = createVoxelBarrel(b.r, b.h, mats.woodAged, mats.iron);
      barrel.position.set(b.x, b.h / 2, b.z);
      shop.add(barrel);
    });

    // Stacked Exterior Crates (Properly using mats.woodHi with rich voxel wood texture!)
    const extCrate1 = createVoxelBox(0.85, 0.65, 0.75, mats.woodHi);
    extCrate1.position.set(rightX + 0.75, 0.33, 1.45);
    extCrate1.rotation.y = 0.18;
    shop.add(extCrate1);

    const extCrate2 = createVoxelBox(0.68, 0.52, 0.58, mats.plank);
    extCrate2.position.set(rightX + 0.68, 0.88, 1.48);
    extCrate2.rotation.y = -0.28;
    shop.add(extCrate2);

    // Wall-hung rope coils on left wall
    [1.6, 2.9].forEach(ry => {
      const wallRope = createVoxelOctagonRing(0.22, 0.06, 0.06, mats.rope);
      wallRope.rotation.y = Math.PI / 2;
      wallRope.position.set(leftX - 0.14, ry, -0.4);
      shop.add(wallRope);
    });

    // Exterior Wall Lantern Bracket on right corner post
    const extLanternGroup = new THREE.Group();
    extLanternGroup.position.set(rightX + 0.32, 3.6, frontZ - 0.2);
    shop.add(extLanternGroup);

    const bracketBeam = createVoxelBox(0.65, 0.1, 0.1, mats.woodDark);
    bracketBeam.position.set(0.2, 0, 0);
    extLanternGroup.add(bracketBeam);

    const extChain = createVoxelBox(0.04, 0.42, 0.04, mats.iron);
    extChain.position.set(0.42, -0.24, 0);
    extLanternGroup.add(extChain);

    const extLanternCage = createVoxelBox(0.24, 0.32, 0.24, mats.woodDark);
    extLanternCage.position.set(0.42, -0.55, 0);
    extLanternGroup.add(extLanternCage);

    const extLanternGlass = createVoxelBox(0.22, 0.26, 0.22, mats.lanternGlow, false, true);
    extLanternGlass.position.set(0.42, -0.55, 0);
    extLanternGroup.add(extLanternGlass);

    const extLight = new THREE.PointLight(0xffaa44, 0.65, 6, 2);
    extLight.position.set(0.42, -0.45, 0);
    extLanternGroup.add(extLight);

    // =========================================================================
    // 8. VOXEL SEAGULLS (Sky Flapping Birds)
    // =========================================================================
    function makeVoxelGull() {
      const gull = new THREE.Group();
      const whiteMat = createVoxelMat(Palette.seagullWhite);
      const greyMat = createVoxelMat(Palette.seagullGrey);
      const beakMat = createVoxelMat(Palette.seagullBeak);

      const body = createVoxelBox(0.18, 0.14, 0.38, whiteMat);
      gull.add(body);

      const leftWing = createVoxelBox(0.42, 0.04, 0.2, greyMat);
      leftWing.position.set(-0.28, 0.04, -0.02);
      leftWing.rotation.z = 0.15;
      gull.add(leftWing);

      const rightWing = createVoxelBox(0.42, 0.04, 0.2, greyMat);
      rightWing.position.set(0.28, 0.04, -0.02);
      rightWing.rotation.z = -0.15;
      gull.add(rightWing);

      const head = createVoxelBox(0.12, 0.12, 0.16, whiteMat);
      head.position.set(0, 0.08, 0.22);
      gull.add(head);

      const beak = createVoxelBox(0.06, 0.05, 0.14, beakMat);
      beak.position.set(0, 0.06, 0.34);
      gull.add(beak);

      return gull;
    }

    const gulls = [
      { mesh: makeVoxelGull(), baseX: -6, baseY: 9, phase: 0 },
      { mesh: makeVoxelGull(), baseX: 2, baseY: 10, phase: 1.7 },
      { mesh: makeVoxelGull(), baseX: 8, baseY: 8.5, phase: 3.1 }
    ];
    gulls.forEach(g => this.group.add(g.mesh));
    this.gulls = gulls;

    // -------------------------------------------------------------------------
    // 9. SHOPKEEPER CAMERA STATION
    // -------------------------------------------------------------------------
    this.shopCam = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 500);
    this.shopCam.position.set(0, 2.85, -0.6);
    this.shopCam.rotation.set(0, 0, 0);
    shop.add(this.shopCam);

    // Performance: merge hundreds of static voxel boxes into a few meshes per material.
    const keep = new Set([
      ...this.doorInteractables, ...this.bunnyInteractables, ...this.crabInteractables,
      ...this.divorcePostInteractables, ...this.shipInteractables,
      ...this.ledgerInteractables, ...this.shipyardInteractables, ...this.ghostMerchantInteractables
    ]);
    const stats = mergeStaticMeshes(this.group, {
      keep,
      buckets: [this.shopGroup],
      excludeSubtrees: [
        ...keep,
        this.signPivot, this.ghostSignPivot, this.shopDoor, this.shopDoorGlowOutline,
        this.bookAura, this.shipyardBenchAura,
        this.divorcePostAura, this.divorceScrollGroup,
        this.shipyardTutorialCircle,
        this.bunny?.group, this.crab?.group, this.dockNPC?.group, this.dockNPC?.mesh,
        this.ghostMerchant?.group, ...this.gulls.map(g => g.mesh)
      ]
    });
    if (typeof window !== 'undefined' && window.location?.search?.includes('debug')) {
      console.log(`[DockStall] static merge: ${stats.before} -> ${stats.after} meshes`);
    }

    return this.group;
  }

  // =========================================================================
  // 2A. EXPANDED ISLAND LANDMASS (Deep Stone Foundation, Terraces & Hills)
  // =========================================================================
  _buildExpandedIsland(islandGroup, mats) {
    // Terraced Voxel Contours: Stepped elevation tiers from sea floor up to hills
    // Island base extends from world X = -8 to -88 (islandGroup local X: +14 to -66, Z: -26 to +26)
    const baseCenter = { x: -25, z: 0 };
    const shelfSlices = [
      { w: 82, d: 54, h: 2.2, y: -2.8, mat: mats.stoneDark }, // Deep ocean bed foundation
      { w: 78, d: 50, h: 1.4, y: -1.0, mat: mats.stone },     // Submerged rock shelf
      { w: 74, d: 46, h: 0.9, y: 0.15, mat: mats.sandWet },   // Tidal wet sand boundary
      { w: 70, d: 42, h: 0.6, y: 0.85, mat: mats.sand }       // Dry sand beach ring
    ];
    shelfSlices.forEach(s => {
      const slice = createVoxelBox(s.w, s.h, s.d, s.mat);
      slice.position.set(baseCenter.x, s.y, baseCenter.z);
      islandGroup.add(slice);
    });

    // Layer 1: East Meadow & Rabbit Pasture (Where the dock pier ramp arrives)
    // Sits at Y = 2.0. Bounds: local X from -6 to +14, local Z from -12 to +12
    const meadowDirt = createVoxelBox(20, 0.9, 24, mats.dirt);
    meadowDirt.position.set(4, 1.35, 0);
    islandGroup.add(meadowDirt);

    const meadowGrass = createVoxelBox(20.2, 0.35, 24.2, mats.grassTop);
    meadowGrass.position.set(4, 1.82, 0);
    islandGroup.add(meadowGrass);

    // Subtle dark grass knolls in the meadow
    const knoll1 = createVoxelBox(6.5, 0.14, 5.5, mats.grassDark);
    knoll1.position.set(2, 2.02, -3.5);
    islandGroup.add(knoll1);

    const knoll2 = createVoxelBox(5.5, 0.14, 6.5, mats.grassDark);
    knoll2.position.set(6, 2.02, 4.5);
    islandGroup.add(knoll2);

    // Layer 2: Central Highlands Ridge Base (Elevated spine connecting East to West)
    // Sits at Y = 2.65. Local X: -5 to -24.2, Z: -20 to +20
    const highlandsDirt = createVoxelBox(19.2, 0.95, 38, mats.dirt);
    highlandsDirt.position.set(-14.6, 2.15, 0);
    islandGroup.add(highlandsDirt);

    const highlandsGrass = createVoxelBox(19.4, 0.35, 38.2, mats.grassTop);
    highlandsGrass.position.set(-14.6, 2.65, 0);
    islandGroup.add(highlandsGrass);

    // East Meadow-to-Highlands stepped terrace ledge (top at Y = 2.41)
    const eastStepDirt = createVoxelBox(1.6, 0.75, 24.0, mats.dirt);
    eastStepDirt.position.set(-4.6, 1.9, 0);
    islandGroup.add(eastStepDirt);

    const eastStepGrass = createVoxelBox(1.8, 0.28, 24.2, mats.grassDark);
    eastStepGrass.position.set(-4.6, 2.27, 0);
    islandGroup.add(eastStepGrass);

    // West Highlands-to-Shipyard stepped threshold terrace (top at Y = 2.30)
    const westStepDirt = createVoxelBox(1.4, 0.65, 36.0, mats.dirt);
    westStepDirt.position.set(-24.4, 1.85, 0);
    islandGroup.add(westStepDirt);

    const westStepGrass = createVoxelBox(1.6, 0.28, 36.2, mats.grassDark);
    westStepGrass.position.set(-24.4, 2.16, 0);
    islandGroup.add(westStepGrass);

    // Layer 3: North Bluff (Pine Ridge & Crags)
    // Tier 2: top at Y = 3.55 (X: -8 to -24, Z: -5 to -19)
    const northTierDirt = createVoxelBox(16, 0.9, 15, mats.dirt);
    northTierDirt.position.set(-16, 3.1, -12);
    islandGroup.add(northTierDirt);

    const northTierGrass = createVoxelBox(16.2, 0.35, 15.2, mats.grassTop);
    northTierGrass.position.set(-16, 3.55, -12);
    islandGroup.add(northTierGrass);

    // Tier 3: Peak Crag (top at Y = 4.45)
    const northPeakDirt = createVoxelBox(10, 0.9, 9, mats.dirt);
    northPeakDirt.position.set(-17, 4.0, -13);
    islandGroup.add(northPeakDirt);

    const northPeakGrass = createVoxelBox(10.2, 0.35, 9.2, mats.grassTop);
    northPeakGrass.position.set(-17, 4.45, -13);
    islandGroup.add(northPeakGrass);

    // North Granite Cliff Drops
    const northCliff1 = createVoxelBox(8, 2.4, 3.2, mats.stoneDark);
    northCliff1.position.set(-17, 2.8, -19.5);
    islandGroup.add(northCliff1);

    const northCliff2 = createVoxelBox(6.5, 1.6, 2.5, mats.stone);
    northCliff2.position.set(-16, 3.6, -18.5);
    islandGroup.add(northCliff2);

    // Layer 4: South Bluff (Scenic Lookout Mountain)
    // Tier 2: top at Y = 3.55 (X: -7 to -23, Z: 5 to 20)
    const southTierDirt = createVoxelBox(16, 0.9, 15, mats.dirt);
    southTierDirt.position.set(-15, 3.1, 12.5);
    islandGroup.add(southTierDirt);

    const southTierGrass = createVoxelBox(16.2, 0.35, 15.2, mats.grassTop);
    southTierGrass.position.set(-15, 3.55, 12.5);
    islandGroup.add(southTierGrass);

    // Tier 3: High Peak (top at Y = 4.45)
    const southPeakDirt = createVoxelBox(10.5, 0.9, 10.5, mats.dirt);
    southPeakDirt.position.set(-15, 4.0, 13);
    islandGroup.add(southPeakDirt);

    const southPeakGrass = createVoxelBox(10.7, 0.35, 10.7, mats.grassTop);
    southPeakGrass.position.set(-15, 4.45, 13);
    islandGroup.add(southPeakGrass);

    // Scenic Lookout Crest Terrace (top at Y = 4.82)
    const lookoutCrest = createVoxelBox(6.8, 0.38, 6.8, mats.grassTop);
    lookoutCrest.position.set(-15, 4.82, 13);
    islandGroup.add(lookoutCrest);

    // South Cliff Granite Ledges
    const southCliff1 = createVoxelBox(4.5, 2.2, 3.5, mats.stone);
    southCliff1.position.set(-10, 2.9, 18.5);
    islandGroup.add(southCliff1);

    const southCliff2 = createVoxelBox(4.0, 1.6, 2.8, mats.stoneLight);
    southCliff2.position.set(-16, 3.8, 17.5);
    islandGroup.add(southCliff2);

    // Layer 5: West Shipyard Terrace & Waterfront Shore
    // Local X: -24 to -51, Z: -18 to +18
    const yardDirt = createVoxelBox(27, 0.95, 36, mats.dirt);
    yardDirt.position.set(-37.5, 1.15, 0);
    islandGroup.add(yardDirt);

    // Packed yard surface (weathered packed sand/gravel at Y = 1.62, top at Y = 1.76)
    const yardSurface = createVoxelBox(27.2, 0.28, 36.2, mats.sandWet);
    yardDirt.position.set(-37.5, 1.15, 0);
    yardSurface.position.set(-37.5, 1.62, 0);
    islandGroup.add(yardSurface);

    // Sturdy oak work planks under the workshop area (local X: -31 to -40, Z: 6 to 16)
    const workshopDeck = createVoxelBox(10, 0.12, 11, mats.plankDark);
    workshopDeck.position.set(-35.5, 1.78, 11);
    islandGroup.add(workshopDeck);

    // Seawall stone blocks along the north shore bluff & south water edge
    const seawallNorth = createVoxelBox(1.8, 0.85, 8, mats.stoneDark);
    seawallNorth.position.set(-39.5, 1.6, 22.0);
    islandGroup.add(seawallNorth);

    const seawallSouth = createVoxelBox(1.8, 0.85, 12, mats.stoneDark);
    seawallSouth.position.set(-50, 1.6, -10);
    islandGroup.add(seawallSouth);

    // Layer 6: South Sandy Cove & Beach (Gentle coastal curve)
    const southCoveSand1 = createVoxelBox(15, 0.5, 13, mats.sand);
    southCoveSand1.position.set(-34, 1.25, -17.5);
    islandGroup.add(southCoveSand1);

    const southCoveSand2 = createVoxelBox(17, 0.45, 15, mats.sandWet);
    southCoveSand2.position.set(-35, 0.85, -19);
    islandGroup.add(southCoveSand2);
  }

  // =========================================================================
  // 2B. ISLAND FOLIAGE & DETAILS (Rooted Pines, Wild Flowers, Bushes, Rocks)
  // =========================================================================
  _buildIslandFoliageAndDetails(islandGroup, mats) {
    const leafMats = [
      mats.grassDark,
      createVoxelMat(Palette.pineLeaves1),
      createVoxelMat(Palette.pineLeaves2),
      createVoxelMat(Palette.pineLeaves3)
    ];

    // Solidly Planted Voxel Pine Trees (With 1.0m underground root embed so NEVER floating)
    const addVoxelPineTree = (x, surfaceY, z, scale = 1.0) => {
      const tree = new THREE.Group();
      tree.position.set(x, surfaceY, z);
      tree.scale.setScalar(scale);

      // Deep root trunk anchor (extends underground down to y = -1.0)
      const trunk = createVoxelBox(0.48, 4.0, 0.48, mats.woodDark);
      trunk.position.y = 1.0;
      tree.add(trunk);

      // 4 tiered stepped canopy layers
      const canopyLayers = [
        { w: 3.2, h: 0.8, y: 2.2, mat: leafMats[1] },
        { w: 2.4, h: 0.8, y: 2.9, mat: leafMats[2] },
        { w: 1.6, h: 0.8, y: 3.6, mat: leafMats[3] },
        { w: 0.85, h: 0.9, y: 4.3, mat: leafMats[0] }
      ];
      canopyLayers.forEach(c => {
        const layer = createVoxelBox(c.w, c.h, c.w, c.mat);
        layer.position.y = c.y;
        tree.add(layer);

        // Edge voxel accent notches for organic silhouette
        const notch = createVoxelBox(c.w + 0.16, c.h * 0.45, c.w * 0.55, c.mat);
        notch.position.y = c.y - c.h * 0.1;
        tree.add(notch);
      });

      tree.traverse(child => {
        if (child.isMesh) child.userData.noWalk = true;
      });

      islandGroup.add(tree);
    };

    // 22 Solidly Rooted Pine Trees across all island biomes:
    // East Meadow & Rabbit Pasture:
    addVoxelPineTree(5.5, 2.0, -5.0, 1.05);
    addVoxelPineTree(2.5, 2.0, 6.5, 1.15);
    addVoxelPineTree(-2.5, 2.0, -7.5, 1.0);
    addVoxelPineTree(-3.5, 2.0, 7.5, 1.2);
    addVoxelPineTree(7.5, 2.0, 3.5, 0.9);

    // North Bluff & Pine Crest:
    addVoxelPineTree(-14.0, 4.62, -12.5, 1.35); // Peak
    addVoxelPineTree(-18.0, 4.62, -11.5, 1.25); // Peak
    addVoxelPineTree(-11.5, 3.72, -14.0, 1.15); // Tier 2
    addVoxelPineTree(-19.5, 3.72, -8.0, 1.2);   // Tier 2
    addVoxelPineTree(-15.0, 2.82, -4.5, 1.05);  // Ridge edge
    addVoxelPineTree(-22.5, 2.82, -14.0, 1.3);  // Coastal cliff

    // South Bluff & Scenic Mountain:
    addVoxelPineTree(-18.0, 4.62, 13.5, 1.3);   // High bluff
    addVoxelPineTree(-11.5, 3.72, 14.5, 1.15);  // Tier 2
    addVoxelPineTree(-17.0, 3.72, 8.0, 1.2);    // Pass side
    addVoxelPineTree(-9.5, 2.82, 9.5, 1.05);    // East slope
    addVoxelPineTree(-21.5, 2.82, 10.5, 1.25);  // West slope

    // Shipyard Perimeter & Beach Cove:
    addVoxelPineTree(-28.0, 1.76, -13.5, 1.1);  // South cove entrance
    addVoxelPineTree(-33.0, 1.76, -17.5, 1.25); // Beach grove
    addVoxelPineTree(-29.0, 1.76, 15.5, 1.15);  // Workshop ridge
    addVoxelPineTree(-40.0, 1.76, 21.5, 1.0);   // North bluff shoreline
    addVoxelPineTree(-45.0, 1.76, 22.0, 0.95);  // North bluff water edge

    // Helper: Voxel Wild Flower Cluster
    const addFlowerCluster = (x, y, z, matPetal, matCenter = mats.flowerYellow, count = 4) => {
      const cluster = new THREE.Group();
      cluster.position.set(x, y, z);
      const offsets = [
        [0, 0], [0.35, 0.2], [-0.28, 0.3], [0.25, -0.32], [-0.35, -0.2]
      ];
      for (let i = 0; i < Math.min(count, offsets.length); i++) {
        const [ox, oz] = offsets[i];
        const stem = createVoxelBox(0.06, 0.32, 0.06, mats.grassDark, false, false);
        stem.position.set(ox, 0.16, oz);
        cluster.add(stem);

        const petals = createVoxelBox(0.24, 0.08, 0.24, matPetal, false, false);
        petals.position.set(ox, 0.34, oz);
        cluster.add(petals);

        const center = createVoxelBox(0.12, 0.1, 0.12, matCenter, false, false);
        center.position.set(ox, 0.36, oz);
        cluster.add(center);
      }
      cluster.traverse(child => {
        if (child.isMesh) child.userData.noWalk = true;
      });
      islandGroup.add(cluster);
    };

    // 14 Vibrant Flower Clusters across grassy meadows and bluffs:
    // White Daisies:
    addFlowerCluster(1.5, 2.0, 2.5, mats.flowerWhite, mats.flowerYellow, 4);
    addFlowerCluster(4.5, 2.0, -2.5, mats.flowerWhite, mats.flowerYellow, 5);
    addFlowerCluster(-12.5, 2.82, 3.5, mats.flowerWhite, mats.flowerYellow, 4);
    // Golden Buttercups:
    addFlowerCluster(-1.5, 2.0, 5.2, mats.flowerYellow, mats.woodDark, 4);
    addFlowerCluster(-8.5, 2.82, -2.5, mats.flowerYellow, mats.woodDark, 5);
    addFlowerCluster(-16.0, 2.82, 3.2, mats.flowerYellow, mats.woodDark, 4);
    // Red Sea Pinks / Roses:
    addFlowerCluster(3.8, 2.0, 5.0, mats.flowerRed, mats.flowerYellow, 4);
    addFlowerCluster(-13.0, 3.72, 8.5, mats.flowerRed, mats.flowerYellow, 4);
    addFlowerCluster(-20.0, 2.82, -4.5, mats.flowerRed, mats.flowerYellow, 5);
    // Ocean Bluebells:
    addFlowerCluster(-5.2, 2.0, -4.0, mats.flowerBlue, mats.flowerWhite, 4);
    addFlowerCluster(-15.5, 4.62, 10.5, mats.flowerBlue, mats.flowerWhite, 5);
    addFlowerCluster(-24.5, 1.76, 2.5, mats.flowerBlue, mats.flowerWhite, 4);
    addFlowerCluster(-27.0, 1.76, -7.5, mats.flowerBlue, mats.flowerWhite, 4);
    addFlowerCluster(-14.0, 3.72, -9.5, mats.flowerBlue, mats.flowerWhite, 4);

    // Helper: Rounded Voxel Berry Shrub
    const addBerryBush = (x, y, z, scale = 1.0) => {
      const bush = new THREE.Group();
      bush.position.set(x, y, z);
      bush.scale.setScalar(scale);

      const mainFoliage = createVoxelBox(0.9, 0.75, 0.9, mats.grassDark);
      mainFoliage.position.y = 0.38;
      bush.add(mainFoliage);

      const topLeaf = createVoxelBox(0.65, 0.35, 0.65, leafMats[2]);
      topLeaf.position.y = 0.78;
      bush.add(topLeaf);

      // 4 tiny red berries
      [
        [0.42, 0.5, 0.2],
        [-0.42, 0.42, -0.15],
        [0.15, 0.55, 0.42],
        [-0.2, 0.6, -0.42]
      ].forEach(([bx, by, bz]) => {
        const berry = createVoxelBox(0.12, 0.12, 0.12, mats.flowerRed, false, false);
        berry.position.set(bx, by, bz);
        bush.add(berry);
      });

      bush.traverse(child => {
        if (child.isMesh) child.userData.noWalk = true;
      });

      islandGroup.add(bush);
    };

    // 8 Berry Shrubs along tree groves and trail bends:
    addBerryBush(0.5, 2.0, -6.0, 1.1);
    addBerryBush(6.8, 2.0, 1.5, 0.95);
    addBerryBush(-7.5, 2.82, 6.0, 1.15);
    addBerryBush(-13.5, 2.82, -5.5, 1.0);
    addBerryBush(-19.0, 2.82, 6.5, 1.2);
    addBerryBush(-26.0, 1.76, -11.0, 1.05);
    addBerryBush(-25.5, 1.76, 12.0, 1.1);
    addBerryBush(-38.0, 1.76, 18.0, 0.95);

    // Helper: Voxel Mushrooms
    const addMushroomPatch = (x, y, z) => {
      const patch = new THREE.Group();
      patch.position.set(x, y, z);
      [
        [0, 0, 0.35, mats.mushroomRed, true],
        [0.25, 0.18, 0.28, mats.mushroomCap, false],
        [-0.2, 0.12, 0.22, mats.mushroomRed, true]
      ].forEach(([mx, mz, mh, mat, hasSpots]) => {
        const stem = createVoxelBox(0.08, mh, 0.08, mats.paper, false, false);
        stem.position.set(mx, mh / 2, mz);
        patch.add(stem);

        const cap = createVoxelBox(0.28, 0.12, 0.28, mat, false, false);
        cap.position.set(mx, mh + 0.05, mz);
        patch.add(cap);

        if (hasSpots) {
          const spot = createVoxelBox(0.08, 0.04, 0.08, mats.paper, false, false);
          spot.position.set(mx, mh + 0.12, mz);
          patch.add(spot);
        }
      });
      patch.traverse(child => {
        if (child.isMesh) child.userData.noWalk = true;
      });
      islandGroup.add(patch);
    };

    // 6 Mushroom Patches in shaded tree bases:
    addMushroomPatch(4.8, 2.0, -5.6);
    addMushroomPatch(-3.2, 2.0, 7.0);
    addMushroomPatch(-13.5, 4.62, -13.2);
    addMushroomPatch(-17.5, 4.62, 12.8);
    addMushroomPatch(-29.5, 1.76, 14.8);
    addMushroomPatch(-32.5, 1.76, -16.8);

    // Helper: Natural Faceted Granite Boulders
    const addBoulder = (x, y, z, w, h, d, mat = mats.stone) => {
      const bGroup = new THREE.Group();
      bGroup.position.set(x, y + h * 0.4, z);

      const main = createVoxelBox(w, h, d, mat);
      bGroup.add(main);

      // Faceted crown box
      const crown = createVoxelBox(w * 0.72, h * 0.4, d * 0.72, mats.stoneLight);
      crown.position.set(w * 0.08, h * 0.42, -d * 0.08);
      bGroup.add(crown);

      bGroup.traverse(child => {
        if (child.isMesh) child.userData.noWalk = true;
      });

      islandGroup.add(bGroup);
    };

    // 12 Granite Boulders:
    addBoulder(8.5, 1.8, 7.0, 2.2, 1.6, 2.0, mats.stoneDark);
    addBoulder(6.5, 1.8, -8.0, 1.8, 1.4, 1.6, mats.stone);
    addBoulder(-1.0, 1.8, -9.0, 2.0, 1.6, 1.8, mats.stoneDark);
    addBoulder(-10.5, 2.65, -8.5, 2.4, 1.8, 2.2, mats.stone);
    addBoulder(-21.0, 2.65, -8.0, 2.6, 2.0, 2.4, mats.stoneDark);
    addBoulder(-8.0, 2.65, 8.5, 1.9, 1.5, 1.7, mats.stoneLight);
    addBoulder(-20.5, 2.65, 8.5, 2.5, 2.0, 2.2, mats.stone);
    addBoulder(-17.0, 4.45, 16.5, 2.8, 2.2, 2.5, mats.stoneLight);
    addBoulder(-28.0, 1.6, -18.0, 3.2, 2.2, 2.8, mats.stoneDark);
    addBoulder(-42.0, 1.4, -17.5, 2.4, 1.8, 2.0, mats.stone);
    addBoulder(-49.0, 1.0, 21.5, 3.0, 2.2, 2.6, mats.stoneDark);
    addBoulder(-48.5, 0.4, -15.5, 2.6, 1.6, 2.2, mats.stone);

    // Cargo crates in the East meadow (existing placements preserved)
    const cratePlacements = [
      { x: 10.5, z: -3.5, s: 1.1, rot: 0.2 },
      { x: 11.6, z: -3.8, s: 0.9, rot: -0.4 },
      { x: 10.8, z: -4.8, s: 1.25, rot: 0.75 }
    ];
    cratePlacements.forEach(cp => {
      const crateGroup = new THREE.Group();
      crateGroup.position.set(cp.x, 2.0 + cp.s / 2, cp.z);
      crateGroup.rotation.y = cp.rot;

      const body = createVoxelBox(cp.s, cp.s, cp.s, mats.plankHi);
      crateGroup.add(body);

      const frameThick = 0.08 * cp.s;
      [-0.5, 0.5].forEach(ox => {
        [-0.5, 0.5].forEach(oz => {
          const cornerPost = createVoxelBox(frameThick, cp.s + 0.02, frameThick, mats.woodDark);
          cornerPost.position.set(ox * (cp.s - frameThick), 0, oz * (cp.s - frameThick));
          crateGroup.add(cornerPost);
        });
      });
      const brace1 = createVoxelBox(cp.s * 1.15, frameThick * 0.8, frameThick * 0.5, mats.woodDark);
      brace1.rotation.z = Math.PI / 4;
      brace1.position.z = cp.s / 2 + frameThick * 0.2;
      crateGroup.add(brace1);

      crateGroup.traverse(child => {
        if (child.isMesh) child.userData.noWalk = true;
      });

      islandGroup.add(crateGroup);
    });
  }

  // =========================================================================
  // 2C. ISLAND TRAIL, LANTERNS & SCENIC LOOKOUT POINT
  // =========================================================================
  _buildIslandTrailAndLookout(islandGroup, mats) {
    // 1. Winding Stone & Timber Trail connecting Dock Pier across Island into Shipyard
    // Section A: Dock connection (X = 13 down to X = 1) across meadow
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const stepX = 13 - i * 1.95;
      const stepY = 2.05 - t * 0.15;
      const stepZ = Math.sin(i * 0.8) * 0.4;
      const step = createVoxelBox(2.0, 0.22, 1.4, i % 2 === 0 ? mats.stonePath : mats.stoneDark);
      step.position.set(stepX, stepY, stepZ);
      step.rotation.y = Math.sin(i * 1.5) * 0.15;
      islandGroup.add(step);

      const border1 = createVoxelBox(0.24, 0.28, 1.4, mats.stone);
      border1.position.set(stepX, stepY + 0.04, stepZ - 0.76);
      islandGroup.add(border1);
      const border2 = createVoxelBox(0.24, 0.28, 1.4, mats.stone);
      border2.position.set(stepX, stepY + 0.04, stepZ + 0.76);
      islandGroup.add(border2);
    }

    // Section B: Trail through Central Pass (X = 1 to X = -14, climbing onto Central Highlands)
    for (let i = 0; i < 8; i++) {
      const stepX = 1.0 - i * 2.15; // Reaches X = -14.05
      let stepY = 2.76;
      if (stepX > -3.5) {
        stepY = 1.98;
      } else if (stepX > -5.0) {
        stepY = 2.38;
      }
      const stepZ = Math.sin(i * 0.7) * 0.6;
      const step = createVoxelBox(2.2, 0.24, 1.5, i % 2 === 0 ? mats.stonePath : mats.plankDark);
      step.position.set(stepX, stepY, stepZ);
      islandGroup.add(step);

      const border1 = createVoxelBox(0.22, 0.28, 1.5, mats.woodDark);
      border1.position.set(stepX, stepY + 0.04, stepZ - 0.82);
      islandGroup.add(border1);
      const border2 = createVoxelBox(0.22, 0.28, 1.5, mats.woodDark);
      border2.position.set(stepX, stepY + 0.04, stepZ + 0.82);
      islandGroup.add(border2);
    }

    // Section C: Trail descent into Shipyard (X = -16 to X = -26.5, descending into Shipyard at Y = 1.76)
    for (let i = 0; i < 6; i++) {
      const stepX = -16.0 - i * 2.1; // Reaches X = -26.5
      let stepY = 2.76;
      if (stepX < -25.5) {
        stepY = 1.72;
      } else if (stepX < -23.5) {
        stepY = 2.24;
      }
      const stepZ = -Math.sin(i * 0.6) * 0.5;
      const step = createVoxelBox(2.2, 0.24, 1.6, i % 2 === 0 ? mats.stonePath : mats.stoneDark);
      step.position.set(stepX, stepY, stepZ);
      islandGroup.add(step);

      const border1 = createVoxelBox(0.24, 0.28, 1.6, mats.woodDark);
      border1.position.set(stepX, stepY + 0.04, stepZ - 0.88);
      islandGroup.add(border1);
      const border2 = createVoxelBox(0.24, 0.28, 1.6, mats.woodDark);
      border2.position.set(stepX, stepY + 0.04, stepZ + 0.88);
      islandGroup.add(border2);
    }

    // Smooth invisible ramps along trail sections for fluid navigation
    const pathColliders = [
      { x: 7.5, y: 1.95, z: 0, w: 13.5, h: 0.35, d: 2.6, rotZ: 0 },
      { x: -4.5, y: 2.25, z: 0, w: 4.8, h: 0.35, d: 3.2, rotZ: -0.20 },
      { x: -24.5, y: 2.15, z: 0, w: 4.8, h: 0.35, d: 3.6, rotZ: 0.23 }
    ];
    pathColliders.forEach(pc => {
      const col = new THREE.Mesh(
        new THREE.BoxGeometry(pc.w, pc.h, pc.d),
        new THREE.MeshBasicMaterial({ visible: false, colorWrite: false, depthWrite: false })
      );
      col.position.set(pc.x, pc.y, pc.z);
      col.rotation.z = pc.rotZ;
      islandGroup.add(col);
    });

    // 2. Wooden Lantern Posts with Warm Voxel Lanterns along the trail
    const addTrailLanternPost = (x, groundY, z, rotY = 0) => {
      const postGroup = new THREE.Group();
      postGroup.position.set(x, groundY, z);
      postGroup.rotation.y = rotY;

      // Heavy square wooden post
      const post = createVoxelBox(0.24, 2.8, 0.24, mats.woodDark);
      post.position.y = 1.4;
      postGroup.add(post);

      // Post top cap
      const postCap = createVoxelBox(0.32, 0.12, 0.32, mats.woodTrim);
      postCap.position.y = 2.86;
      postGroup.add(postCap);

      // Iron bracket arm extending out
      const bracket = createVoxelBox(0.55, 0.08, 0.08, mats.iron);
      bracket.position.set(0.3, 2.65, 0);
      postGroup.add(bracket);

      const diagStay = createVoxelBox(0.35, 0.06, 0.06, mats.iron);
      diagStay.position.set(0.18, 2.48, 0);
      diagStay.rotation.z = -0.7;
      postGroup.add(diagStay);

      // Iron chain link
      const chain = createVoxelBox(0.04, 0.22, 0.04, mats.iron);
      chain.position.set(0.52, 2.5, 0);
      postGroup.add(chain);

      // Voxel lantern housing & glowing glass
      const lanternFrame = createVoxelBox(0.28, 0.38, 0.28, mats.iron);
      lanternFrame.position.set(0.52, 2.22, 0);
      postGroup.add(lanternFrame);

      const lanternGlass = createVoxelBox(0.22, 0.28, 0.22, mats.lanternGlow, false, false);
      lanternGlass.position.set(0.52, 2.22, 0);
      postGroup.add(lanternGlass);

      // PointLight for nighttime atmosphere
      const lanternLight = new THREE.PointLight(0xffaa44, 0.85, 7.5, 2);
      lanternLight.position.set(0.52, 2.22, 0);
      postGroup.add(lanternLight);

      islandGroup.add(postGroup);
    };

    addTrailLanternPost(3.5, 2.0, -1.6, 0);
    addTrailLanternPost(-6.5, 2.45, -1.6, 0);
    addTrailLanternPost(-14.0, 2.8, 1.6, Math.PI);
    addTrailLanternPost(-20.5, 2.3, 1.6, Math.PI);
    addTrailLanternPost(-26.0, 1.76, -1.8, 0);

    // 3. Scenic Lookout Point on South Bluff Peak (X: -15, Z: 13, Y: 4.82)
    const lookoutGroup = new THREE.Group();
    lookoutGroup.position.set(-15, 4.82, 13);

    // Rustic Overlook Bench facing West towards the shipyard & sunset
    const bench = new THREE.Group();
    bench.position.set(0, 0, 0);
    bench.rotation.y = Math.PI / 2; // Faces West

    // Bench legs
    [-0.7, 0.7].forEach(lx => {
      const leg = createVoxelBox(0.16, 0.48, 0.38, mats.woodDark);
      leg.position.set(lx, 0.24, 0);
      bench.add(leg);
    });
    // Bench seat
    const seat = createVoxelBox(1.7, 0.12, 0.52, mats.woodHi);
    seat.position.set(0, 0.52, 0);
    bench.add(seat);
    // Backrest supports & plank
    [-0.65, 0.65].forEach(bx => {
      const bSupport = createVoxelBox(0.12, 0.52, 0.1, mats.woodDark);
      bSupport.position.set(bx, 0.78, -0.22);
      bench.add(bSupport);
    });
    const backrest = createVoxelBox(1.7, 0.26, 0.08, mats.woodHi);
    backrest.position.set(0, 0.94, -0.22);
    bench.add(backrest);
    lookoutGroup.add(bench);

    // Stone Campfire Circle with Charred Logs & Glowing Embers
    const firepit = new THREE.Group();
    firepit.position.set(-1.8, 0, -1.4);
    // 8 natural stone perimeter blocks
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const rock = createVoxelBox(0.32, 0.22, 0.32, i % 2 === 0 ? mats.stone : mats.stoneDark);
      rock.position.set(Math.cos(angle) * 0.75, 0.11, Math.sin(angle) * 0.75);
      rock.rotation.y = angle;
      firepit.add(rock);
    }
    // Ash bed
    const ash = createVoxelBox(1.1, 0.06, 1.1, mats.woodAsh);
    ash.position.y = 0.03;
    firepit.add(ash);
    // Charred firewood logs
    [0.35, -0.85, 1.8].forEach((rot, idx) => {
      const log = createVoxelBox(0.72, 0.14, 0.16, mats.woodDark);
      log.position.set(0, 0.12 + idx * 0.06, 0);
      log.rotation.y = rot;
      firepit.add(log);
    });
    // Glowing red ember voxels
    const embers = createVoxelBox(0.48, 0.1, 0.48, mats.emberGlow, false, false);
    embers.position.set(0, 0.14, 0);
    firepit.add(embers);
    // Firelight glow
    const fireLight = new THREE.PointLight(0xff5511, 0.7, 5, 2);
    fireLight.position.set(0, 0.35, 0);
    firepit.add(fireLight);
    lookoutGroup.add(firepit);

    // Overlook Cliff Safety Railing
    [-1.8, 0, 1.8].forEach(rx => {
      const rPost = createVoxelBox(0.14, 1.05, 0.14, mats.woodDark);
      rPost.position.set(-2.6, 0.52, rx);
      lookoutGroup.add(rPost);
    });
    const railTop = createVoxelBox(0.16, 0.1, 3.8, mats.woodHi);
    railTop.position.set(-2.6, 1.05, 0);
    lookoutGroup.add(railTop);
    const railMid = createVoxelBox(0.1, 0.08, 3.7, mats.woodDark);
    railMid.position.set(-2.6, 0.55, 0);
    lookoutGroup.add(railMid);

    islandGroup.add(lookoutGroup);
  }

  // =========================================================================
  // 2C-2. DAY 0 OPENING BEACH (Empty Bottles, Sand Slope & Divorce Papers Post)
  // =========================================================================
  _buildOpeningBeachAndDivorcePost(islandGroup, mats) {
    // 1. Gentle sandy slope & steps connecting the Northeast Beach (y = 1.15, z = -15)
    //    up onto the East Meadow (y = 2.0, z = -11.5) near the dock entrance
    const beachSlopeStep1 = createVoxelBox(5.5, 0.36, 2.8, mats.sand);
    beachSlopeStep1.position.set(8.8, 1.32, -13.0);
    islandGroup.add(beachSlopeStep1);

    const beachSlopeStep2 = createVoxelBox(5.2, 0.36, 2.4, mats.sand);
    beachSlopeStep2.position.set(9.2, 1.66, -11.6);
    islandGroup.add(beachSlopeStep2);

    // Smooth invisible ramp collider so player walks effortlessly between beach, crab, and meadow
    const beachRampCol = new THREE.Mesh(
      new THREE.BoxGeometry(5.6, 0.28, 6.2),
      new THREE.MeshBasicMaterial({ visible: false, colorWrite: false, depthWrite: false })
    );
    beachRampCol.position.set(9.0, 1.55, -12.6);
    beachRampCol.rotation.x = -0.22;
    islandGroup.add(beachRampCol);

    // 2. Scattered Empty Rum / Wine Bottles around the beach wakeup spot (local X ~ 7.8, Y = 1.15, Z ~ -15.2)
    const bottleColors = [Palette.bottleGreen, Palette.bottleAmber, Palette.bottleWine, Palette.bottleBlue];
    const corkMat = createVoxelMat(Palette.cork);
    const labelMat = mats.paper;

    const bottlePlacements = [
      // Close around the player's wakeup spot so they see them immediately on blinking open
      { x: 6.7, z: -15.8, color: Palette.bottleGreen, fallen: true, rotY: 0.6, rotZ: Math.PI / 2 - 0.12, scale: 1.35 },
      { x: 8.9, z: -15.9, color: Palette.bottleAmber, fallen: true, rotY: -0.8, rotZ: Math.PI / 2 - 0.08, scale: 1.4 },
      { x: 7.2, z: -16.5, color: Palette.bottleWine, fallen: false, rotY: 0.3, rotZ: 0.08, scale: 1.35 },
      { x: 8.5, z: -16.7, color: Palette.bottleGreen, fallen: true, rotY: 1.4, rotZ: Math.PI / 2 - 0.1, scale: 1.3 },
      { x: 6.3, z: -14.7, color: Palette.bottleBlue, fallen: false, rotY: -0.4, rotZ: -0.1, scale: 1.3 },
      { x: 9.3, z: -14.8, color: Palette.bottleWine, fallen: true, rotY: 2.1, rotZ: Math.PI / 2 - 0.15, scale: 1.45 },
      { x: 7.9, z: -13.9, color: Palette.bottleAmber, fallen: true, rotY: -1.6, rotZ: Math.PI / 2 - 0.06, scale: 1.35 },
      { x: 6.9, z: -14.1, color: Palette.bottleGreen, fallen: false, rotY: 0.9, rotZ: 0.05, scale: 1.25 },
      { x: 8.8, z: -17.4, color: Palette.bottleBlue, fallen: true, rotY: 0.4, rotZ: Math.PI / 2 - 0.1, scale: 1.35 }
    ];

    bottlePlacements.forEach((bp, idx) => {
      const bGroup = new THREE.Group();
      const bMat = createVoxelMat(bp.color || bottleColors[idx % bottleColors.length], {
        roughness: 0.18,
        metalness: 0.1,
        transparent: true,
        opacity: 0.86
      });

      const bodyH = 0.32;
      const bodyW = 0.14;
      const bottleBody = createVoxelBox(bodyW, bodyH, bodyW, bMat, false, false);
      bottleBody.position.y = bodyH / 2;
      bGroup.add(bottleBody);

      // Rum label strip
      const label = createVoxelBox(bodyW + 0.01, 0.11, bodyW + 0.01, labelMat, false, false);
      label.position.y = bodyH * 0.48;
      bGroup.add(label);

      // Bottle shoulder & neck
      const shoulder = createVoxelBox(0.10, 0.05, 0.10, bMat, false, false);
      shoulder.position.y = bodyH + 0.025;
      bGroup.add(shoulder);

      const neck = createVoxelBox(0.06, 0.11, 0.06, bMat, false, false);
      neck.position.y = bodyH + 0.095;
      bGroup.add(neck);

      // Popped cork lying next to fallen bottles, or half-uncorked on upright ones
      const cork = createVoxelBox(0.055, 0.045, 0.055, corkMat, false, false);
      if (bp.fallen) {
        cork.position.set(0.08, 0.48, 0.04);
      } else {
        cork.position.set(0, bodyH + 0.16, 0);
      }
      bGroup.add(cork);

      bGroup.scale.setScalar(bp.scale || 1.3);
      const baseSandY = bp.z < -16.8 ? 0.98 : 1.15;
      bGroup.position.set(bp.x, bp.fallen ? baseSandY + 0.07 : baseSandY, bp.z);
      bGroup.rotation.y = bp.rotY || 0;
      bGroup.rotation.z = bp.rotZ || 0;

      bGroup.traverse(child => {
        if (child.isMesh) child.userData.noWalk = true;
      });
      islandGroup.add(bGroup);
    });

    // Half-buried grog barrel on the beach beside the bottles
    const beachBarrel = createVoxelBarrel(0.38, 0.82, mats.woodMid, mats.iron);
    beachBarrel.position.set(6.0, 1.25, -16.2);
    beachBarrel.rotation.z = 0.45;
    beachBarrel.rotation.y = 0.6;
    beachBarrel.traverse(child => {
      if (child.isMesh) child.userData.noWalk = true;
    });
    islandGroup.add(beachBarrel);

    // 3. Notice Post with Nailed Divorce Papers Scroll (Just after the dock meets land: local X = 11.8, Y = 2.0, Z = -2.0)
    const postGroup = new THREE.Group();
    postGroup.position.set(11.8, 2.0, -2.0);
    postGroup.rotation.y = -0.35; // Angled slightly toward both the beach trail and the dock ramp
    this.divorceScrollGroup = postGroup;

    // Sturdy timber post & base plinth
    const plinth = createVoxelBox(0.56, 0.18, 0.56, mats.stoneDark);
    plinth.position.y = 0.09;
    postGroup.add(plinth);

    const mainPost = createVoxelBox(0.30, 2.45, 0.30, mats.woodDark);
    mainPost.position.y = 1.22;
    postGroup.add(mainPost);

    // Backing notice board
    const board = createVoxelBox(0.95, 1.05, 0.10, mats.woodMid);
    board.position.set(0, 1.65, 0.16);
    postGroup.add(board);

    // Slanted rain hood over notice board
    const hood = createVoxelBox(1.08, 0.10, 0.38, mats.woodTrim);
    hood.position.set(0, 2.22, 0.18);
    hood.rotation.x = 0.25;
    postGroup.add(hood);

    // Parchment Divorce Scroll nailed to the board
    const scrollSheet = createVoxelBox(0.68, 0.78, 0.03, mats.paper);
    scrollSheet.position.set(0, 1.64, 0.22);
    postGroup.add(scrollSheet);

    // Top & bottom rolled parchment cylinders
    const rollTop = createVoxelBox(0.74, 0.08, 0.08, mats.paper);
    rollTop.position.set(0, 2.03, 0.24);
    postGroup.add(rollTop);

    const rollBot = createVoxelBox(0.74, 0.08, 0.08, mats.paper);
    rollBot.position.set(0, 1.25, 0.24);
    postGroup.add(rollBot);

    // Heavy iron nail driven through the top of the scroll into the post
    const ironNailShaft = createVoxelBox(0.05, 0.05, 0.14, mats.iron);
    ironNailShaft.position.set(0, 1.94, 0.26);
    postGroup.add(ironNailShaft);

    const ironNailHead = createVoxelBox(0.11, 0.11, 0.04, mats.ironLight);
    ironNailHead.position.set(0, 1.94, 0.33);
    postGroup.add(ironNailHead);

    // Red Wax Seal ("CLAW & FIN") at bottom-right of scroll
    const sealMat = createVoxelMat(Palette.sealRed, { roughness: 0.4 });
    const waxSeal = createVoxelBox(0.16, 0.16, 0.035, sealMat);
    waxSeal.position.set(0.16, 1.38, 0.245);
    postGroup.add(waxSeal);

    // Dark ink text lines on the parchment
    [-0.18, -0.06, 0.06, 0.18].forEach((ly, i) => {
      const lineW = i === 0 ? 0.48 : 0.52 - (i % 2) * 0.08;
      const inkLine = createVoxelBox(lineW, 0.025, 0.01, mats.woodTrim, false, false);
      inkLine.position.set(0, 1.66 - ly, 0.24);
      postGroup.add(inkLine);
    });

    // Glowing golden aura ring around the scroll post so the player can easily spot it
    const auraMat = createVoxelMat(0xffd700, {
      emissive: 0xffaa00,
      emissiveIntensity: 1.2,
      transparent: true,
      opacity: 0.65
    });
    this.divorcePostAura = createVoxelOctagonRing(0.58, 0.06, 0.06, auraMat);
    this.divorcePostAura.rotation.x = Math.PI / 2;
    this.divorcePostAura.position.set(0, 0.35, 0.12);
    this.divorcePostAura.visible = false;
    postGroup.add(this.divorcePostAura);

    // Generous raycast hitbox for interacting with the Divorce Papers Post
    const postHitMat = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      colorWrite: false
    });
    const postHitBox = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.6, 1.2), postHitMat);
    postHitBox.position.set(0, 1.3, 0.15);
    postHitBox.userData.isDivorcePost = true;
    postGroup.add(postHitBox);

    postGroup.traverse(child => {
      if (child.isMesh) {
        child.userData.isDivorcePost = true;
        child.userData.noWalk = true;
      }
    });
    this.divorcePostInteractables.push(postHitBox, scrollSheet, board, mainPost);

    islandGroup.add(postGroup);
  }

  // =========================================================================
  // 2D. THE SHIPYARD (Slipway, Catwalks, Ship Hull Skeleton, Crane, Workshop)
  // =========================================================================
  _buildShipyardSkeleton(islandGroup, mats) {
    const shipyardGroup = new THREE.Group();
    islandGroup.add(shipyardGroup);

    // 1. Shipyard Entrance Arch & Signpost (At local X: -26, Z: 0)
    // Raised high with wide walk-through clearance (> 4.8m height clearance)
    const archGroup = new THREE.Group();
    archGroup.position.set(-26.0, 1.76, 0);

    // Heavy vertical square timber posts spaced widely at Z = +/- 2.7
    [-2.7, 2.7].forEach(pz => {
      // Stone foundation plinth
      const plinth = createVoxelBox(0.62, 0.4, 0.62, mats.stone);
      plinth.position.set(0, 0.2, pz);
      archGroup.add(plinth);

      // Main timber column (5.4m tall)
      const archPost = createVoxelBox(0.42, 5.4, 0.42, mats.woodTrim);
      archPost.position.set(0, 2.7, pz);
      archPost.userData.noWalk = true;
      archGroup.add(archPost);

      // Iron base collar band
      const postCollar = createVoxelBox(0.5, 0.2, 0.5, mats.iron);
      postCollar.position.set(0, 0.5, pz);
      archGroup.add(postCollar);

      // Decorative diagonal knee braces supporting the crossbeam
      const brace = createVoxelBox(0.24, 1.4, 0.24, mats.woodTrim);
      brace.position.set(0, 4.6, pz > 0 ? pz - 0.55 : pz + 0.55);
      brace.rotation.x = pz > 0 ? -Math.PI / 4 : Math.PI / 4;
      brace.userData.noWalk = true;
      archGroup.add(brace);
    });

    // Massive lintel crossbeam at Y = 5.25 (clear height under beam = 5.0m!)
    const archBeam = createVoxelBox(0.46, 0.46, 6.2, mats.woodTrim);
    archBeam.position.set(0, 5.25, 0);
    archBeam.userData.noWalk = true;
    archGroup.add(archBeam);

    // Prominent Carved Signboard mounted on TOP of the crossbeam
    const archSignGroup = new THREE.Group();
    archSignGroup.position.set(0, 5.95, 0);
    archSignGroup.userData.noWalk = true;

    const archSign = createVoxelBox(0.16, 0.88, 3.8, mats.woodHi);
    archSign.userData.noWalk = true;
    archSignGroup.add(archSign);

    const archSignBorder = createVoxelBox(0.22, 0.98, 3.96, mats.woodDark);
    archSignBorder.userData.noWalk = true;
    archSignGroup.add(archSignBorder);

    // Weathered timber pediment gable / rooflet over sign
    const pedimentRidge = createVoxelBox(0.34, 0.16, 4.2, mats.woodDark);
    pedimentRidge.position.y = 0.56;
    pedimentRidge.userData.noWalk = true;
    archSignGroup.add(pedimentRidge);

    const pedimentCap = createVoxelBox(0.28, 0.12, 4.3, mats.roofRidge);
    pedimentCap.position.y = 0.68;
    pedimentCap.userData.noWalk = true;
    archSignGroup.add(pedimentCap);

    archGroup.add(archSignGroup);

    // Hanging brass ship bell on south post (at Z = 2.4, Y = 4.2 - safely above player head!)
    const bellBracket = createVoxelBox(0.08, 0.1, 0.45, mats.iron);
    bellBracket.position.set(0, 4.4, 2.45);
    bellBracket.userData.noWalk = true;
    archGroup.add(bellBracket);

    const bell = createVoxelBox(0.24, 0.3, 0.24, mats.brass);
    bell.position.set(0, 4.18, 2.25);
    bell.userData.noWalk = true;
    archGroup.add(bell);

    // Hanging wrought-iron nautical lantern on north post (Z = -2.4, Y = 4.2)
    const lanternBracket = createVoxelBox(0.08, 0.1, 0.45, mats.iron);
    lanternBracket.position.set(0, 4.4, -2.45);
    lanternBracket.userData.noWalk = true;
    archGroup.add(lanternBracket);

    const lanternFrame = createVoxelBox(0.26, 0.36, 0.26, mats.iron);
    lanternFrame.position.set(0, 4.15, -2.25);
    lanternFrame.userData.noWalk = true;
    archGroup.add(lanternFrame);

    const lanternGlass = createVoxelBox(0.2, 0.28, 0.2, mats.lanternGlow, false, false);
    lanternGlass.position.set(0, 4.15, -2.25);
    lanternGlass.userData.noWalk = true;
    archGroup.add(lanternGlass);

    const archLight = new THREE.PointLight(0xffaa44, 0.9, 8.0, 2);
    archLight.position.set(0, 4.15, -2.25);
    archGroup.add(archLight);

    // Directional finger-post beside archway path
    const dirPost = createVoxelBox(0.18, 2.6, 0.18, mats.woodDark);
    dirPost.position.set(1.8, 1.3, 3.6);
    archGroup.add(dirPost);

    const dirEast = createVoxelBox(0.1, 0.24, 1.25, mats.woodHi);
    dirEast.position.set(1.8, 2.25, 3.15);
    archGroup.add(dirEast);

    const dirWest = createVoxelBox(0.1, 0.24, 1.35, mats.woodHi);
    dirWest.position.set(1.8, 1.9, 4.05);
    archGroup.add(dirWest);

    shipyardGroup.add(archGroup);

    // 1B. Day 0 Tutorial Location Circle in Shipyard Courtyard (At local X = -31.0, Y = 1.78, Z = 0)
    const tutorialCircleGroup = new THREE.Group();
    tutorialCircleGroup.position.set(-31.0, 1.78, 0.0);
    tutorialCircleGroup.visible = false;
    this.shipyardTutorialCircle = tutorialCircleGroup;

    const circleOuterMat = createVoxelMat(0xffd700, {
      emissive: 0xffaa00,
      emissiveIntensity: 1.5,
      transparent: true,
      opacity: 0.9
    });
    const circleInnerMat = createVoxelMat(0x00ffaa, {
      emissive: 0x00cc88,
      emissiveIntensity: 1.4,
      transparent: true,
      opacity: 0.85
    });

    this.shipyardCircleOuter = createVoxelOctagonRing(2.35, 0.14, 0.14, circleOuterMat);
    this.shipyardCircleOuter.rotation.x = Math.PI / 2;
    this.shipyardCircleOuter.position.y = 0.08;
    tutorialCircleGroup.add(this.shipyardCircleOuter);

    this.shipyardCircleInner = createVoxelOctagonRing(1.45, 0.10, 0.10, circleInnerMat);
    this.shipyardCircleInner.rotation.x = Math.PI / 2;
    this.shipyardCircleInner.position.y = 0.10;
    tutorialCircleGroup.add(this.shipyardCircleInner);

    // Soft glowing beacon cylinder so the location ring is clearly visible from the trail
    const beaconGeo = new THREE.CylinderGeometry(2.25, 2.25, 4.2, 24, 1, true);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
    beaconMesh.position.y = 2.1;
    this.shipyardCircleBeacon = beaconMesh;
    tutorialCircleGroup.add(beaconMesh);

    const circleLight = new THREE.PointLight(0xffd700, 1.4, 9.0, 2);
    circleLight.position.set(0, 1.2, 0);
    tutorialCircleGroup.add(circleLight);

    tutorialCircleGroup.traverse(child => {
      if (child.isMesh) {
        child.userData.noWalk = true;
      }
    });
    shipyardGroup.add(tutorialCircleGroup);

    // 2. Slipway Launching Ways (Marine Railway sloping into the sea)
    // Runs from X = -36 down to X = -58, Z = 0
    const slipwayGroup = new THREE.Group();
    shipyardGroup.add(slipwayGroup);

    // Sloping timber ground runners (ways) at Z = -2.2 and Z = +2.2
    [-2.2, 2.2].forEach(wz => {
      for (let s = 0; s < 11; s++) {
        const sx = -37 - s * 2.0;
        const sy = 1.6 - s * 0.2; // Slopes down to -0.4 in water
        const runner = createVoxelBox(2.1, 0.32, 0.42, mats.woodTrim);
        runner.position.set(sx, sy, wz);
        slipwayGroup.add(runner);
      }
    });

    // Cross-tie sleepers tying the ways together
    for (let s = 0; s < 11; s++) {
      const sx = -37 - s * 2.0;
      const sy = 1.5 - s * 0.2;
      const sleeper = createVoxelBox(0.45, 0.24, 4.6, mats.woodDark);
      sleeper.position.set(sx, sy, 0);
      slipwayGroup.add(sleeper);
    }

    // Heavy oak Keel Blocks along centerline Z = 0
    [-39, -42, -45, -48, -51, -54].forEach((kx, idx) => {
      const ky = 1.6 - idx * 0.2;
      const blockBase = createVoxelBox(1.4, 0.45, 0.85, mats.woodDark);
      blockBase.position.set(kx, ky + 0.35, 0);
      slipwayGroup.add(blockBase);

      const blockTop = createVoxelBox(1.2, 0.4, 0.75, mats.woodAged);
      blockTop.position.set(kx, ky + 0.75, 0);
      slipwayGroup.add(blockTop);
    });

    // 3. Flanking Catwalk Piers (Catwalk platforms for shipwrights)
    [-4.5, 4.5].forEach(cz => {
      const catwalkPlankCount = 10;
      for (let cp = 0; cp < catwalkPlankCount; cp++) {
        const cx = -36.5 - cp * 2.0;
        const cPlank = createVoxelBox(1.95, 0.22, 1.4, cp % 2 === 0 ? mats.plank : mats.plankDark);
        cPlank.position.set(cx, 1.75, cz);
        slipwayGroup.add(cPlank);
      }

      // Timber pilings supporting the catwalk out over the water
      [-38, -42, -46, -50, -54].forEach(px => {
        const pile = createVoxelBox(0.48, 5.2, 0.48, mats.woodTrim);
        pile.position.set(px, -0.6, cz);
        slipwayGroup.add(pile);

        const pileTop = createVoxelBox(0.54, 0.32, 0.54, mats.woodDark);
        pileTop.position.set(px, 1.95, cz);
        slipwayGroup.add(pileTop);
      });

      // Mooring cleats & rope coils on catwalk end
      const cleat = createVoxelBox(0.65, 0.12, 0.18, mats.iron);
      cleat.position.set(-54.5, 1.92, cz);
      slipwayGroup.add(cleat);

      const ropeCoil = createVoxelOctagonRing(0.26, 0.08, 0.08, mats.rope);
      ropeCoil.rotation.x = Math.PI / 2;
      ropeCoil.position.set(-53.5, 1.88, cz);
      slipwayGroup.add(ropeCoil);
    });

    // Invisible Walkway Colliders for catwalks
    [-4.5, 4.5].forEach(cz => {
      const col = new THREE.Mesh(
        new THREE.BoxGeometry(20.0, 0.35, 1.6),
        new THREE.MeshBasicMaterial({ visible: false, colorWrite: false, depthWrite: false })
      );
      col.position.set(-45.5, 1.75, cz);
      slipwayGroup.add(col);
    });

    // 4. THE SHIP HULL SKELETON UNDER CONSTRUCTION
    // Resting on the keel blocks! Length 14.5m, bow at -54.0, stern at -39.5
    const shipHullSkeleton = new THREE.Group();
    shipyardGroup.add(shipHullSkeleton);

    // Keel Beam (Solid square oak beam)
    const keelBeam = createVoxelBox(14.5, 0.46, 0.46, mats.woodDark);
    keelBeam.position.set(-46.75, 2.45, 0);
    shipHullSkeleton.add(keelBeam);

    // Keelson (Inner reinforcement beam)
    const keelson = createVoxelBox(13.8, 0.38, 0.38, mats.woodMid);
    keelson.position.set(-46.75, 2.82, 0);
    shipHullSkeleton.add(keelson);

    // Stem Post at Bow (Curving forward towards the ocean)
    const stemSegments = [
      { x: -54.2, y: 2.7, h: 0.6, rotZ: 0.25 },
      { x: -54.6, y: 3.3, h: 0.7, rotZ: 0.4 },
      { x: -55.0, y: 3.95, h: 0.75, rotZ: 0.5 },
      { x: -55.4, y: 4.65, h: 0.8, rotZ: 0.55 },
      { x: -55.7, y: 5.25, h: 0.65, rotZ: 0.3 }
    ];
    stemSegments.forEach(s => {
      const stemPart = createVoxelBox(0.42, s.h, 0.42, mats.woodDark);
      stemPart.position.set(s.x, s.y, 0);
      stemPart.rotation.z = s.rotZ;
      shipHullSkeleton.add(stemPart);
    });

    // Stern Post at Aft (Vertical squared post)
    const sternPost = createVoxelBox(0.44, 2.6, 0.44, mats.woodDark);
    sternPost.position.set(-39.5, 3.65, 0);
    shipHullSkeleton.add(sternPost);

    // Transom Wing Beam
    const transomBeam = createVoxelBox(0.38, 0.38, 3.6, mats.woodTrim);
    transomBeam.position.set(-39.5, 4.8, 0);
    shipHullSkeleton.add(transomBeam);

    // 7 Curved Transverse U-Shaped Hull Ribs (The Ship Skeleton Ribcage!)
    // Varying width profiles from bow to stern
    const ribConfigs = [
      { x: -41.0, halfWidth: 1.8, sheerY: 4.8 }, // Aft frame
      { x: -43.0, halfWidth: 2.3, sheerY: 4.95 },
      { x: -45.0, halfWidth: 2.6, sheerY: 5.05 }, // Midships
      { x: -47.0, halfWidth: 2.6, sheerY: 5.05 }, // Midships
      { x: -49.0, halfWidth: 2.4, sheerY: 5.1 },
      { x: -51.0, halfWidth: 2.0, sheerY: 5.2 },
      { x: -53.0, halfWidth: 1.4, sheerY: 5.3 }  // Bow frame
    ];

    ribConfigs.forEach(rc => {
      const ribGroup = new THREE.Group();
      ribGroup.position.set(rc.x, 0, 0);

      // Floor timber across keel
      const floor = createVoxelBox(0.35, 0.38, rc.halfWidth * 2, mats.woodDark);
      floor.position.set(0, 2.5, 0);
      ribGroup.add(floor);

      // Port & Starboard curved futtock frames
      [-1, 1].forEach(side => {
        const sz = side * rc.halfWidth;
        // Lower bilge turn segment
        const bilgeTurn = createVoxelBox(0.32, 0.85, 0.32, mats.woodMid);
        bilgeTurn.position.set(0, 3.0, sz * 0.75);
        bilgeTurn.rotation.x = side * 0.55;
        ribGroup.add(bilgeTurn);

        // Mid frame side segment
        const midFrame = createVoxelBox(0.3, 1.25, 0.3, mats.woodMid);
        midFrame.position.set(0, 3.85, sz * 0.95);
        midFrame.rotation.x = side * 0.25;
        ribGroup.add(midFrame);

        // Top sheer frame segment
        const topFrame = createVoxelBox(0.28, 1.15, 0.28, mats.woodTrim);
        topFrame.position.set(0, 4.65, sz);
        ribGroup.add(topFrame);
      });

      shipHullSkeleton.add(ribGroup);
    });

    // Longitudinal Sheer Clamps (Timber beams connecting rib tops on port and starboard)
    [-1, 1].forEach(side => {
      const sheerClamp = createVoxelBox(13.5, 0.28, 0.28, mats.woodTrim);
      sheerClamp.position.set(-46.8, 5.05, side * 2.5);
      shipHullSkeleton.add(sheerClamp);
    });

    // 4 Cross Deck Beams spanning between frames
    [-43.0, -46.0, -49.0, -51.5].forEach(dx => {
      const deckBeam = createVoxelBox(0.28, 0.28, 4.6, mats.woodMid);
      deckBeam.position.set(dx, 4.75, 0);
      shipHullSkeleton.add(deckBeam);
    });

    // Partial Lower Hull Planking (Bottom 2 strakes planked with fresh light timber!)
    // Leaves upper 70% exposed as a dramatic skeleton!
    [-1, 1].forEach(side => {
      const strake1 = createVoxelBox(13.2, 0.42, 0.12, mats.woodHi);
      strake1.position.set(-46.8, 2.9, side * 1.85);
      strake1.rotation.x = side * 0.45;
      shipHullSkeleton.add(strake1);

      const strake2 = createVoxelBox(12.5, 0.42, 0.12, mats.woodHi);
      strake2.position.set(-46.8, 3.4, side * 2.25);
      strake2.rotation.x = side * 0.25;
      shipHullSkeleton.add(strake2);

      // Fastener nail heads along planking
      for (let n = 0; n < 7; n++) {
        const nx = -41.0 - n * 2.0;
        const nail = createVoxelBox(0.04, 0.04, 0.04, mats.iron);
        nail.position.set(nx, 3.4, side * 2.32);
        shipHullSkeleton.add(nail);
      }
    });

    // Timber Shoring Props (Wedged between catwalks and hull to support vessel)
    [-43, -47, -51].forEach(sx => {
      [-1, 1].forEach(side => {
        const shore = createVoxelBox(0.2, 2.4, 0.2, mats.woodDark);
        shore.position.set(sx, 2.8, side * 3.3);
        shore.rotation.x = side * 0.65;
        shipHullSkeleton.add(shore);
      });
    });

    // 5. Heavy Timber Derrick Crane (A-frame derrick on North Catwalk)
    // Sits at X: -45, Z: 6.8
    const craneGroup = new THREE.Group();
    craneGroup.position.set(-45.0, 1.75, 6.8);

    // 4 Diagonal Timber Pylons forming pyramid A-frame rising to Y = 9.2
    const pylonOffsets = [
      [-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]
    ];
    pylonOffsets.forEach(([ox, oz]) => {
      const leg = createVoxelBox(0.38, 7.6, 0.38, mats.woodDark);
      leg.position.set(ox * 0.5, 3.7, oz * 0.5);
      leg.rotation.z = ox > 0 ? -0.16 : 0.16;
      leg.rotation.x = oz > 0 ? 0.16 : -0.16;
      craneGroup.add(leg);
    });

    // Horizontal crane cross ties
    [2.4, 4.8].forEach(ty => {
      const tie1 = createVoxelBox(1.8, 0.22, 0.22, mats.woodTrim);
      tie1.position.set(0, ty, -0.7);
      craneGroup.add(tie1);
      const tie2 = createVoxelBox(1.8, 0.22, 0.22, mats.woodTrim);
      tie2.position.set(0, ty, 0.7);
      craneGroup.add(tie2);
    });

    // Top Crown Block
    const crown = createVoxelBox(1.2, 0.55, 1.2, mats.woodTrim);
    crown.position.set(0, 7.3, 0);
    craneGroup.add(crown);

    // Crane Jib / Boom (Heavy timber projecting over the ship to Z = 0)
    const boom = createVoxelBox(0.38, 0.38, 8.2, mats.woodTrim);
    boom.position.set(0, 7.2, -3.2); // Extends from Z = +0.9 to Z = -7.3 (reaches over ship centerline!)
    craneGroup.add(boom);

    // Diagonal boom support strut
    const boomStrut = createVoxelBox(0.28, 4.2, 0.28, mats.woodDark);
    boomStrut.position.set(0, 5.8, -2.4);
    boomStrut.rotation.x = -0.75;
    craneGroup.add(boomStrut);

    // Iron Sheaves & Hoist Cable
    const sheave = createVoxelOctagonRing(0.32, 0.08, 0.12, mats.iron);
    sheave.position.set(0, 7.2, -6.8);
    craneGroup.add(sheave);

    const hoistCable = createVoxelBox(0.04, 3.4, 0.04, mats.iron);
    hoistCable.position.set(0, 5.5, -6.8);
    craneGroup.add(hoistCable);

    // Forged Iron Lifting Hook suspended right over the vessel skeleton
    const hookShank = createVoxelBox(0.08, 0.45, 0.08, mats.iron);
    hookShank.position.set(0, 3.65, -6.8);
    craneGroup.add(hookShank);

    const hookCurve = createVoxelOctagonRing(0.24, 0.08, 0.1, mats.iron);
    hookCurve.position.set(0, 3.38, -6.8);
    hookCurve.rotation.y = Math.PI / 2;
    craneGroup.add(hookCurve);

    // Manual winch drum at crane base
    const winchDrum = createVoxelBox(0.9, 0.5, 0.5, mats.woodDark);
    winchDrum.position.set(0, 0.65, 0);
    craneGroup.add(winchDrum);

    const winchRope = createVoxelBox(0.75, 0.52, 0.52, mats.rope);
    winchRope.position.set(0, 0.65, 0);
    craneGroup.add(winchRope);

    const crankHandle = createVoxelBox(0.08, 0.65, 0.08, mats.iron);
    crankHandle.position.set(0.55, 0.8, 0);
    craneGroup.add(crankHandle);

    craneGroup.traverse(child => {
      if (child.isMesh) child.userData.noWalk = true;
    });

    shipyardGroup.add(craneGroup);

    // 6. Shipyard Staging Scaffolding (Along South side of ship)
    // Sits at X: -43 to -49, Z: -4.5
    const scaffoldGroup = new THREE.Group();
    scaffoldGroup.position.set(-46.0, 1.75, -4.5);

    // Upright poles
    [-3.0, 0, 3.0].forEach(sx => {
      [-0.6, 0.6].forEach(sz => {
        const pole = createVoxelBox(0.22, 4.4, 0.22, mats.woodDark);
        pole.position.set(sx, 2.2, sz);
        scaffoldGroup.add(pole);
      });
    });

    // Lower staging platform at Y = 2.85
    const lowerDeck = createVoxelBox(6.4, 0.14, 1.45, mats.plank);
    lowerDeck.position.set(0, 1.1, 0);
    scaffoldGroup.add(lowerDeck);

    // Upper staging platform at Y = 4.15
    const upperDeck = createVoxelBox(6.4, 0.14, 1.45, mats.plank);
    upperDeck.position.set(0, 2.4, 0);
    scaffoldGroup.add(upperDeck);

    // Safety guard rails
    [1.6, 2.9].forEach(ry => {
      const rail = createVoxelBox(6.4, 0.08, 0.1, mats.woodTrim);
      rail.position.set(0, ry, -0.65);
      scaffoldGroup.add(rail);
    });

    // Diagonal X-bracing on back of scaffold
    [-1.5, 1.5].forEach(bx => {
      const braceX1 = createVoxelBox(3.4, 0.08, 0.08, mats.woodDark);
      braceX1.position.set(bx, 1.75, -0.65);
      braceX1.rotation.z = 0.55;
      scaffoldGroup.add(braceX1);

      const braceX2 = createVoxelBox(3.4, 0.08, 0.08, mats.woodDark);
      braceX2.position.set(bx, 1.75, -0.65);
      braceX2.rotation.z = -0.55;
      scaffoldGroup.add(braceX2);
    });

    // Wooden Ladder leaning against scaffold
    const ladder = new THREE.Group();
    ladder.position.set(2.8, 1.25, 0.95);
    ladder.rotation.x = -0.32;
    [-0.24, 0.24].forEach(lx => {
      const rail = createVoxelBox(0.08, 2.7, 0.08, mats.woodDark);
      rail.position.set(lx, 0, 0);
      ladder.add(rail);
    });
    for (let r = 0; r < 6; r++) {
      const rung = createVoxelBox(0.44, 0.06, 0.06, mats.woodTrim);
      rung.position.set(0, -1.0 + r * 0.42, 0);
      ladder.add(rung);
    }
    scaffoldGroup.add(ladder);

    scaffoldGroup.traverse(child => {
      if (child.isMesh) child.userData.noWalk = true;
    });

    shipyardGroup.add(scaffoldGroup);

    // 7. Shipwright's Workshop / Framing Shed Skeleton (Open Post-and-Beam Pavilion)
    // Located in the shipyard yard at X: -32 to -39, Z: 6.5 to 15.5
    const shedGroup = new THREE.Group();
    shedGroup.position.set(-35.5, 1.78, 11.0);

    const shedW = 6.8;
    const shedD = 8.5;
    const shedH = 4.2;

    // 6 Sturdy Timber Columns
    [-shedW / 2 + 0.3, shedW / 2 - 0.3].forEach(cx => {
      [-shedD / 2 + 0.3, 0, shedD / 2 - 0.3].forEach(cz => {
        const col = createVoxelBox(0.38, shedH, 0.38, mats.woodTrim);
        col.position.set(cx, shedH / 2, cz);
        col.userData.noWalk = true;
        shedGroup.add(col);

        // Stone column footing
        const foot = createVoxelBox(0.48, 0.32, 0.48, mats.stone);
        foot.position.set(cx, 0.16, cz);
        foot.userData.noWalk = true;
        shedGroup.add(foot);
      });
    });

    // Top Perimeter Tie Beams
    [-shedD / 2 + 0.3, shedD / 2 - 0.3].forEach(cz => {
      const tieX = createVoxelBox(shedW, 0.32, 0.32, mats.woodTrim);
      tieX.position.set(0, shedH, cz);
      tieX.userData.noWalk = true;
      shedGroup.add(tieX);
    });
    [-shedW / 2 + 0.3, shedW / 2 - 0.3].forEach(cx => {
      const tieZ = createVoxelBox(0.32, 0.32, shedD, mats.woodTrim);
      tieZ.position.set(cx, shedH, 0);
      tieZ.userData.noWalk = true;
      shedGroup.add(tieZ);
    });

    // Exposed A-Frame Roof Trusses (Skeleton Rafters)
    [-shedD / 2 + 0.3, 0, shedD / 2 - 0.3].forEach(tz => {
      const rafterLeft = createVoxelBox(shedW * 0.58, 0.22, 0.24, mats.woodDark);
      rafterLeft.position.set(-shedW * 0.24, shedH + 0.75, tz);
      rafterLeft.rotation.z = 0.52;
      rafterLeft.userData.noWalk = true;
      shedGroup.add(rafterLeft);

      const rafterRight = createVoxelBox(shedW * 0.58, 0.22, 0.24, mats.woodDark);
      rafterRight.position.set(shedW * 0.24, shedH + 0.75, tz);
      rafterRight.rotation.z = -0.52;
      rafterRight.userData.noWalk = true;
      shedGroup.add(rafterRight);

      // King post
      const kingPost = createVoxelBox(0.22, 1.45, 0.22, mats.woodTrim);
      kingPost.position.set(0, shedH + 0.72, tz);
      kingPost.userData.noWalk = true;
      shedGroup.add(kingPost);
    });

    // Ridge Beam running along the roof apex
    const ridgeBeam = createVoxelBox(0.26, 0.26, shedD + 0.6, mats.woodDark);
    ridgeBeam.position.set(0, shedH + 1.48, 0);
    ridgeBeam.userData.noWalk = true;
    shedGroup.add(ridgeBeam);

    // Open Horizontal Roof Battens (Skeleton roof look)
    [-1, 1].forEach(side => {
      [0.4, 0.9, 1.3].forEach(by => {
        const batten = createVoxelBox(0.12, 0.12, shedD + 0.4, mats.woodMid);
        batten.position.set(side * (shedW * 0.48 - by * 0.8), shedH + by, 0);
        batten.userData.noWalk = true;
        shedGroup.add(batten);
      });
    });

    // 8. WORKSHOP FURNITURE & PROPS
    // Master Carpenter's Heavy Workbench
    const benchGroup = new THREE.Group();
    benchGroup.position.set(-1.8, 0, -1.8);

    const workTableTop = createVoxelBox(2.6, 0.24, 1.1, mats.woodMid);
    workTableTop.position.set(0, 0.88, 0);
    benchGroup.add(workTableTop);

    [-1.1, 1.1].forEach(bx => {
      [-0.4, 0.4].forEach(bz => {
        const leg = createVoxelBox(0.2, 0.88, 0.2, mats.woodDark);
        leg.position.set(bx, 0.44, bz);
        benchGroup.add(leg);
      });
    });

    // Bench Vise
    const viseJaw = createVoxelBox(0.18, 0.28, 0.35, mats.iron);
    viseJaw.position.set(-1.3, 0.94, 0.35);
    benchGroup.add(viseJaw);

    const viseHandle = createVoxelBox(0.06, 0.38, 0.06, mats.woodHi);
    viseHandle.position.set(-1.42, 0.94, 0.35);
    benchGroup.add(viseHandle);

    // Hand tools on bench (Crosscut saw, wooden mallet, broad axe)
    const sawBlade = createVoxelBox(0.65, 0.12, 0.02, mats.ironLight);
    sawBlade.position.set(0.4, 1.02, -0.2);
    benchGroup.add(sawBlade);

    const sawHandle = createVoxelBox(0.14, 0.14, 0.06, mats.woodHi);
    sawHandle.position.set(0.72, 1.03, -0.2);
    benchGroup.add(sawHandle);

    const malletHead = createVoxelBox(0.14, 0.14, 0.22, mats.woodDark);
    malletHead.position.set(-0.35, 1.05, 0.15);
    benchGroup.add(malletHead);

    const malletHandle = createVoxelBox(0.35, 0.06, 0.06, mats.woodHi);
    malletHandle.position.set(-0.35, 1.03, 0.32);
    malletHandle.rotation.y = Math.PI / 2;
    benchGroup.add(malletHandle);

    // Fresh wood curly shavings voxels on floor and table
    [
      [0.2, 1.01, 0.2], [-0.6, 1.01, -0.1], [0.8, 0.06, 0.8], [-0.3, 0.06, 1.1]
    ].forEach(([cx, cy, cz]) => {
      const curl = createVoxelBox(0.14, 0.04, 0.12, mats.woodHi, false, false);
      curl.position.set(cx, cy, cz);
      curl.rotation.y = cx * 3;
      benchGroup.add(curl);
    });

    benchGroup.traverse(child => {
      if (child.isMesh) {
        child.userData.noWalk = true;
        child.userData.isShipyardBench = true;
      }
    });
    this.shipyardInteractables.push(workTableTop);

    shedGroup.add(benchGroup);

    // 9. DRAFTSMAN'S BLUEPRINT TABLE (INTERACTABLE STATION!)
    const draftGroup = new THREE.Group();
    draftGroup.position.set(1.8, 0, -1.5);

    // Warm emissive wood material for the interactable workbench top so it has a subtle glowing hue
    const benchTopGlowMat = createVoxelMat(Palette.woodHi, {
      emissive: 0xffaa33,
      emissiveIntensity: 0.28,
      roughness: 0.55
    });
    this.shipyardBenchTopMat = benchTopGlowMat;

    const draftTableTop = createVoxelBox(1.9, 0.14, 1.3, benchTopGlowMat);
    draftTableTop.position.set(0, 0.95, 0);
    draftTableTop.rotation.x = -0.14; // Slanted drafting board
    draftGroup.add(draftTableTop);

    // Subtle glowing golden rim around the workbench top
    const benchRimGlowMat = createVoxelMat(0xffd700, {
      emissive: 0xffb300,
      emissiveIntensity: 1.15,
      transparent: true,
      opacity: 0.78
    });
    this.shipyardBenchRimMat = benchRimGlowMat;

    const rimFrame = new THREE.Group();
    rimFrame.position.set(0, 0.95, 0);
    rimFrame.rotation.x = -0.14;
    const rimT = 0.05;
    const rimFront = createVoxelBox(1.98, 0.16, rimT, benchRimGlowMat, false, false);
    rimFront.position.set(0, 0.01, 0.67);
    rimFrame.add(rimFront);
    const rimBack = createVoxelBox(1.98, 0.16, rimT, benchRimGlowMat, false, false);
    rimBack.position.set(0, 0.01, -0.67);
    rimFrame.add(rimBack);
    const rimLeft = createVoxelBox(rimT, 0.16, 1.38, benchRimGlowMat, false, false);
    rimLeft.position.set(-0.97, 0.01, 0);
    rimFrame.add(rimLeft);
    const rimRight = createVoxelBox(rimT, 0.16, 1.38, benchRimGlowMat, false, false);
    rimRight.position.set(0.97, 0.01, 0);
    rimFrame.add(rimRight);
    draftGroup.add(rimFrame);

    [-0.8, 0.8].forEach(dx => {
      [-0.45, 0.45].forEach(dz => {
        const leg = createVoxelBox(0.16, 0.92, 0.16, mats.woodDark);
        leg.position.set(dx, 0.46, dz);
        draftGroup.add(leg);
      });
    });

    // Nautical Blueprint Scroll on table with a soft cyan emissive glow
    const blueprintGlowMat = createVoxelMat(Palette.blueprint, {
      emissive: 0x2288cc,
      emissiveIntensity: 0.35
    });
    const blueprint = createVoxelBox(1.4, 0.02, 0.95, blueprintGlowMat);
    blueprint.position.set(0, 1.04, 0);
    blueprint.rotation.x = -0.14;
    draftGroup.add(blueprint);

    // Cyan grid lines on blueprint
    for (let g = 0; g < 3; g++) {
      const gridLine = createVoxelBox(1.2, 0.025, 0.04, mats.blueprintLine);
      gridLine.position.set(0, 1.05, -0.28 + g * 0.28);
      gridLine.rotation.x = -0.14;
      draftGroup.add(gridLine);
    }

    // Brass drafting compass & inkpot
    const inkPot = createVoxelBox(0.12, 0.14, 0.12, mats.iron);
    inkPot.position.set(0.72, 1.08, -0.32);
    draftGroup.add(inkPot);

    const compassLeg1 = createVoxelBox(0.04, 0.24, 0.04, mats.brass);
    compassLeg1.position.set(-0.55, 1.08, -0.2);
    compassLeg1.rotation.z = 0.3;
    draftGroup.add(compassLeg1);

    const compassLeg2 = createVoxelBox(0.04, 0.24, 0.04, mats.brass);
    compassLeg2.position.set(-0.48, 1.08, -0.2);
    compassLeg2.rotation.z = -0.3;
    draftGroup.add(compassLeg2);

    // Subtle floating golden aura ring & warm point light above the workbench (matching the shop logbook)
    const benchAura = createVoxelOctagonRing(0.36, 0.045, 0.045, benchRimGlowMat);
    benchAura.rotation.x = Math.PI / 2;
    benchAura.position.set(0, 1.32, 0);
    draftGroup.add(benchAura);
    this.shipyardBenchAura = benchAura;

    const benchLight = new THREE.PointLight(0xffcc55, 1.25, 4.8, 2);
    benchLight.position.set(0, 1.55, 0);
    draftGroup.add(benchLight);
    this.shipyardBenchLight = benchLight;

    draftGroup.traverse(child => {
      if (child.isMesh) {
        child.userData.noWalk = true;
        child.userData.isShipyardBench = true;
      }
    });
    this.shipyardInteractables.push(draftGroup, draftTableTop, blueprint, rimFrame, benchAura);

    shedGroup.add(draftGroup);

    // Lumber Drying Racks & Timber Stacks in workshop
    const lumberRack = new THREE.Group();
    lumberRack.position.set(-1.8, 0, 2.2);

    // Rack timber frames
    [-1.2, 1.2].forEach(rx => {
      const upright = createVoxelBox(0.18, 2.2, 0.18, mats.woodDark);
      upright.position.set(rx, 1.1, 0);
      lumberRack.add(upright);

      [0.6, 1.2, 1.8].forEach(ry => {
        const arm = createVoxelBox(0.14, 0.1, 0.8, mats.woodDark);
        arm.position.set(rx, ry, 0);
        lumberRack.add(arm);
      });
    });

    // Stacked planed lumber planks drying on rack
    for (let p = 0; p < 5; p++) {
      const plank = createVoxelBox(2.8, 0.08, 0.32, mats.woodHi);
      plank.position.set(0, 0.7 + p * 0.28, (p % 2 === 0 ? 0.12 : -0.12));
      lumberRack.add(plank);
    }
    lumberRack.traverse(child => {
      if (child.isMesh) child.userData.noWalk = true;
    });
    shedGroup.add(lumberRack);

    // Barrels of caulking tar and nail kegs
    const tarBarrel = createVoxelBarrel(0.38, 1.1, mats.woodAged, mats.iron);
    tarBarrel.position.set(2.0, 0.55, 2.2);
    tarBarrel.traverse(child => {
      if (child.isMesh) child.userData.noWalk = true;
    });
    shedGroup.add(tarBarrel);

    const nailKeg = createVoxelBarrel(0.28, 0.75, mats.woodMid, mats.iron);
    nailKeg.position.set(1.4, 0.38, 2.6);
    nailKeg.traverse(child => {
      if (child.isMesh) child.userData.noWalk = true;
    });
    shedGroup.add(nailKeg);

    shipyardGroup.add(shedGroup);

    // 10. South Cove Weathered Rowboat (Dinghy resting on sand)
    // Sits on beach at X: -34, Z: -16.5
    const rowboatGroup = new THREE.Group();
    rowboatGroup.position.set(-34.0, 1.45, -16.5);
    rowboatGroup.rotation.y = 0.45;
    rowboatGroup.rotation.z = 0.08; // Resting tilted on the sand dune

    const boatLen = 3.6;
    const boatW = 1.6;

    // Rowboat bottom
    const boatFloor = createVoxelBox(boatLen - 0.4, 0.12, boatW - 0.4, mats.plankDark);
    boatFloor.position.y = 0.06;
    rowboatGroup.add(boatFloor);

    // Bow stem
    const bBow = createVoxelBox(0.32, 0.55, 0.32, mats.woodTrim);
    bBow.position.set(-boatLen / 2 + 0.16, 0.28, 0);
    rowboatGroup.add(bBow);

    // Transom stern
    const bStern = createVoxelBox(0.18, 0.55, boatW - 0.2, mats.woodTrim);
    bStern.position.set(boatLen / 2 - 0.09, 0.28, 0);
    rowboatGroup.add(bStern);

    // Port and Starboard gunwale sides
    [-boatW / 2 + 0.1, boatW / 2 - 0.1].forEach(sideZ => {
      const gunwale = createVoxelBox(boatLen, 0.48, 0.16, mats.woodMid);
      gunwale.position.set(0, 0.3, sideZ);
      rowboatGroup.add(gunwale);
    });

    // Thwart bench seats inside rowboat
    [-0.5, 0.6].forEach(bx => {
      const benchSeat = createVoxelBox(0.28, 0.08, boatW - 0.25, mats.woodHi);
      benchSeat.position.set(bx, 0.32, 0);
      rowboatGroup.add(benchSeat);
    });

    // Pair of wooden oars resting inside
    const oar1 = createVoxelBox(2.2, 0.06, 0.06, mats.woodHi);
    oar1.position.set(0.1, 0.42, 0.25);
    oar1.rotation.y = -0.15;
    rowboatGroup.add(oar1);

    const oarBlade1 = createVoxelBox(0.45, 0.04, 0.16, mats.woodHi);
    oarBlade1.position.set(-0.95, 0.42, 0.38);
    rowboatGroup.add(oarBlade1);

    const oar2 = createVoxelBox(2.2, 0.06, 0.06, mats.woodHi);
    oar2.position.set(0.1, 0.42, -0.25);
    oar2.rotation.y = 0.12;
    rowboatGroup.add(oar2);

    const oarBlade2 = createVoxelBox(0.45, 0.04, 0.16, mats.woodHi);
    oarBlade2.position.set(-0.95, 0.42, -0.38);
    rowboatGroup.add(oarBlade2);

    // Driftwood logs on beach
    const driftLog1 = createVoxelBox(2.8, 0.35, 0.35, mats.woodAged);
    driftLog1.position.set(2.4, 0.18, 1.2);
    driftLog1.rotation.y = -0.4;
    rowboatGroup.add(driftLog1);

    const driftLog2 = createVoxelBox(2.2, 0.28, 0.28, mats.woodAged);
    driftLog2.position.set(-1.8, 0.14, 1.8);
    driftLog2.rotation.y = 0.6;
    rowboatGroup.add(driftLog2);

    shipyardGroup.add(rowboatGroup);

    // 11. West Shipyard Outfitting Dock Pier & Moored Sloop Vessel
    this._buildShipyardDock(shipyardGroup, mats);
  }

  // =========================================================================
  // 2E. WEST SHIPYARD OUTFITTING DOCK (Pier, Mooring Hardware, Cargo & Sloop)
  // =========================================================================
  _buildShipyardDock(shipyardGroup, mats) {
    const dockGroup = new THREE.Group();
    shipyardGroup.add(dockGroup);

    // Dock bounds: extends west from workshop terrace (X = -38.0) to X = -66.0 (28m long)
    // Width spans Z = 11.0 to 18.0 (7.0m wide), deck top at Y = 1.76

    // 1. Heavy Timber Substructure Pilings (Driven into seabed)
    const pileXCoords = [-39.0, -44.5, -50.0, -55.5, -61.0, -65.5];
    const pileZCoords = [11.4, 14.5, 17.6];

    pileXCoords.forEach(px => {
      pileZCoords.forEach(pz => {
        // Deep square timber piling
        const pile = createVoxelBox(0.46, 5.0, 0.46, mats.woodTrim);
        pile.position.set(px, -0.6, pz);
        dockGroup.add(pile);

        // Piling cap block atop deck level
        const cap = createVoxelBox(0.54, 0.28, 0.54, mats.woodDark);
        cap.position.set(px, 1.95, pz);
        dockGroup.add(cap);

        // Submerged iron reinforcement collar
        const collar = createVoxelBox(0.52, 0.16, 0.52, mats.iron);
        collar.position.set(px, 0.2, pz);
        dockGroup.add(collar);
      });

      // Transverse heavy timber bearer beam tying each pile row together
      const transverseBeam = createVoxelBox(0.38, 0.32, 6.6, mats.woodDark);
      transverseBeam.position.set(px, 1.55, 14.5);
      dockGroup.add(transverseBeam);
    });

    // Longitudinal heavy timber stringers supporting deck planks
    pileZCoords.forEach(pz => {
      const stringer = createVoxelBox(28.0, 0.28, 0.36, mats.woodTrim);
      stringer.position.set(-52.25, 1.62, pz);
      dockGroup.add(stringer);
    });

    // 2. Transverse Deck Planks (28 individual plank bands across pier)
    const plankCount = 28;
    for (let p = 0; p < plankCount; p++) {
      const plankX = -38.5 - p * 0.98;
      const mat = p % 2 === 0 ? mats.plank : mats.plankDark;
      const plank = createVoxelBox(0.92, 0.16, 6.8, mat);
      plank.position.set(plankX, 1.74, 14.5);
      dockGroup.add(plank);

      // Fastener iron spikes on deck
      [-1.8, 0, 1.8].forEach(sz => {
        const spike = createVoxelBox(0.04, 0.04, 0.04, mats.iron);
        spike.position.set(plankX, 1.83, 14.5 + sz);
        dockGroup.add(spike);
      });
    }

    // 3. Perimeter Bull Rails / Curb Timbers
    // North edge curb (Z = 17.85) with scupper runoff gaps
    for (let s = 0; s < 5; s++) {
      const curbX = -41.0 - s * 5.2;
      const curb = createVoxelBox(4.4, 0.22, 0.24, mats.woodTrim);
      curb.position.set(curbX, 1.88, 17.85);
      dockGroup.add(curb);
    }

    // Pier end curb at west terminus (X = -65.9)
    const endCurb = createVoxelBox(0.24, 0.22, 6.8, mats.woodTrim);
    endCurb.position.set(-65.9, 1.88, 14.5);
    dockGroup.add(endCurb);

    // 4. Mooring Bollards, Cleats & Rope Coils
    const bollardXPositions = [-42.0, -48.5, -55.0, -62.5];
    bollardXPositions.forEach((bx, idx) => {
      // Stout wooden mooring bollard
      const bollard = createVoxelBox(0.42, 0.88, 0.42, mats.woodDark);
      bollard.position.set(bx, 2.05, 17.75);
      dockGroup.add(bollard);

      const bollardCap = createVoxelBox(0.48, 0.12, 0.48, mats.iron);
      bollardCap.position.set(bx, 2.52, 17.75);
      dockGroup.add(bollardCap);

      // Iron cleats
      const cleat = createVoxelBox(0.55, 0.12, 0.14, mats.iron);
      cleat.position.set(bx + 1.2, 1.88, 17.7);
      dockGroup.add(cleat);

      // Coiled hemp rope on dock deck
      const rope = createVoxelOctagonRing(0.28, 0.08, 0.08, mats.rope);
      rope.rotation.x = Math.PI / 2;
      rope.position.set(bx - 0.7, 1.84, 17.1);
      dockGroup.add(rope);
    });

    // 5. Stylized Dock Lantern Posts
    const addDockLantern = (x, z) => {
      const postGroup = new THREE.Group();
      postGroup.position.set(x, 1.76, z);

      const post = createVoxelBox(0.22, 2.8, 0.22, mats.woodDark);
      post.position.y = 1.4;
      postGroup.add(post);

      const cap = createVoxelBox(0.3, 0.1, 0.3, mats.woodTrim);
      cap.position.y = 2.85;
      postGroup.add(cap);

      const arm = createVoxelBox(0.55, 0.08, 0.08, mats.iron);
      arm.position.set(0, 2.65, 0.3);
      postGroup.add(arm);

      const chain = createVoxelBox(0.04, 0.2, 0.04, mats.iron);
      chain.position.set(0, 2.52, 0.52);
      postGroup.add(chain);

      const frame = createVoxelBox(0.28, 0.38, 0.28, mats.iron);
      frame.position.set(0, 2.22, 0.52);
      postGroup.add(frame);

      const glass = createVoxelBox(0.22, 0.28, 0.22, mats.lanternGlow, false, false);
      glass.position.set(0, 2.22, 0.52);
      postGroup.add(glass);

      const light = new THREE.PointLight(0xffaa44, 0.85, 7.5, 2);
      light.position.set(0, 2.22, 0.52);
      postGroup.add(light);

      dockGroup.add(postGroup);
    };

    addDockLantern(-44.0, 11.3);
    addDockLantern(-63.5, 11.3);

    // 6. Dock Outfitting Cargo Stacks
    // Cargo stack A (near workshop root): Crates, sacks, barrels
    const cargoGroup1 = new THREE.Group();
    cargoGroup1.position.set(-41.0, 1.76, 12.8);

    // Large main crate
    const crate1 = createVoxelBox(1.3, 1.3, 1.3, mats.plankHi);
    crate1.position.set(0, 0.65, 0);
    cargoGroup1.add(crate1);
    const c1Post = createVoxelBox(1.34, 0.1, 1.34, mats.woodDark);
    c1Post.position.set(0, 0.65, 0);
    cargoGroup1.add(c1Post);

    // Second smaller crate stacked atop
    const crate2 = createVoxelBox(0.9, 0.9, 0.9, mats.woodMid);
    crate2.position.set(0.15, 1.75, 0.1);
    crate2.rotation.y = 0.2;
    cargoGroup1.add(crate2);

    // Pitch barrel beside crates
    const barrel1 = createVoxelBarrel(0.38, 1.05, mats.woodAged, mats.iron);
    barrel1.position.set(1.15, 0.52, -0.2);
    cargoGroup1.add(barrel1);

    // Burlap cargo sacks
    const sack1 = createVoxelBox(0.72, 0.35, 0.5, mats.sackBurlap);
    sack1.position.set(-0.9, 0.18, 0.3);
    sack1.rotation.y = 0.35;
    cargoGroup1.add(sack1);

    const sack2 = createVoxelBox(0.68, 0.32, 0.48, mats.sackBurlap);
    sack2.position.set(-0.85, 0.48, 0.25);
    sack2.rotation.y = -0.2;
    cargoGroup1.add(sack2);

    // Authentic Forged Iron Anchor leaning against crate
    const anchorGroup = new THREE.Group();
    anchorGroup.position.set(-0.2, 0, 0.72);
    anchorGroup.rotation.x = 0.25;

    const anchorShank = createVoxelBox(0.1, 1.6, 0.1, mats.iron);
    anchorShank.position.y = 0.8;
    anchorGroup.add(anchorShank);

    const anchorStock = createVoxelBox(1.2, 0.12, 0.14, mats.woodDark);
    anchorStock.position.y = 1.45;
    anchorGroup.add(anchorStock);

    const anchorFlukeArm = createVoxelBox(1.0, 0.1, 0.1, mats.iron);
    anchorFlukeArm.position.y = 0.18;
    anchorGroup.add(anchorFlukeArm);

    [-0.5, 0.5].forEach(fx => {
      const fluke = createVoxelBox(0.18, 0.38, 0.24, mats.iron);
      fluke.position.set(fx, 0.32, 0);
      anchorGroup.add(fluke);
    });

    cargoGroup1.add(anchorGroup);
    dockGroup.add(cargoGroup1);

    // Cargo stack B (Mid pier): Lashed timber spars & pitch barrels
    const cargoGroup2 = new THREE.Group();
    cargoGroup2.position.set(-58.0, 1.76, 12.6);

    const barrel2 = createVoxelBarrel(0.38, 1.05, mats.woodDark, mats.iron);
    barrel2.position.set(0, 0.52, 0);
    cargoGroup2.add(barrel2);

    const barrel3 = createVoxelBarrel(0.36, 0.95, mats.woodMid, mats.iron);
    barrel3.position.set(0.65, 0.48, 0.25);
    cargoGroup2.add(barrel3);

    // Lashed pine ship spars lying flat along pier edge
    [-0.2, 0.1, 0.4].forEach((sy, idx) => {
      const spar = createVoxelBox(7.2, 0.22, 0.22, mats.woodHi);
      spar.position.set(-0.2, 0.12 + idx * 0.18, -0.65);
      cargoGroup2.add(spar);
    });
    // Rope lashings around the spar bundle
    [-2.2, 1.8].forEach(lx => {
      const lashing = createVoxelBox(0.1, 0.5, 0.3, mats.rope);
      lashing.position.set(lx, 0.28, -0.65);
      cargoGroup2.add(lashing);
    });

    dockGroup.add(cargoGroup2);

    // 7. Invisible Smooth Walkway Collider for fluid navigation
    // Main pier walkway collider (Allows walking whole 28m length of dock)
    const pierCollider = new THREE.Mesh(
      new THREE.BoxGeometry(28.0, 0.35, 6.8),
      new THREE.MeshBasicMaterial({ visible: false, colorWrite: false, depthWrite: false })
    );
    pierCollider.position.set(-52.0, 1.76, 14.5);
    dockGroup.add(pierCollider);
  }

  // =========================================================================
  // 2F. "DEADLY BUSINESS" GHOST MERCHANT STALL (Shipyard Precinct)
  // =========================================================================
  _buildGhostMerchantStall(islandGroup, mats) {
    const stallGroup = new THREE.Group();
    stallGroup.name = 'DeadlyBusinessGhostStall';

    // Positioned further down the island by the shipyard entrance terrace / courtyard
    // IslandGroup sits at (-22, 0, 0). Shipyard arch is at X = -26, Z = 0; workshop shed is at X = -35.5, Z = 11.
    // Stall sits at (-28.0, 1.76, 5.2), angled with rotation.y = -Math.PI * 0.75 so the grand front counter
    // directly addresses visitors arriving through the archway and facing the active shipyard precinct.
    stallGroup.position.set(-28.0, 1.76, 5.2);
    stallGroup.rotation.y = -Math.PI * 0.75;
    islandGroup.add(stallGroup);

    // 1. Weathered Dark Timber Platform Base (Substantially enlarged 5.2m x 4.2m)
    const baseW = 5.2;
    const baseD = 4.2;
    const baseMat = mats.plankDark || mats.woodDark;
    const base = createVoxelBox(baseW, 0.26, baseD, baseMat);
    base.position.set(0, 0.13, 0);
    stallGroup.add(base);

    // Individual rustic floor planks across the deck
    const floorPlankCount = 9;
    for (let p = 0; p < floorPlankCount; p++) {
      const pz = -baseD / 2 + (p + 0.5) * (baseD / floorPlankCount);
      const plank = createVoxelBox(baseW - 0.12, 0.04, baseD / floorPlankCount - 0.04, p % 2 === 0 ? mats.plank : mats.plankDark);
      plank.position.set(0, 0.28, pz);
      stallGroup.add(plank);
    }

    // 2. Heavy Corner Posts & Pilings (Grand height: 3.8m, thicker 0.36m weathered oak)
    const postHeight = 3.8;
    const postThickness = 0.36;
    const postLocations = [
      [-baseW / 2 + 0.28, -baseD / 2 + 0.28],
      [baseW / 2 - 0.28, -baseD / 2 + 0.28],
      [-baseW / 2 + 0.28, baseD / 2 - 0.28],
      [baseW / 2 - 0.28, baseD / 2 - 0.28],
    ];
    postLocations.forEach(([px, pz]) => {
      const post = createVoxelBox(postThickness, postHeight, postThickness, mats.woodDark);
      post.position.set(px, postHeight / 2 + 0.26, pz);
      stallGroup.add(post);

      // Iron top cap
      const cap = createVoxelBox(postThickness + 0.08, 0.14, postThickness + 0.08, mats.iron);
      cap.position.set(px, postHeight + 0.26, pz);
      stallGroup.add(cap);

      // Iron base reinforcement collar
      const collar = createVoxelBox(postThickness + 0.06, 0.18, postThickness + 0.06, mats.iron);
      collar.position.set(px, 0.35, pz);
      stallGroup.add(collar);
    });

    // 3. Trade Counter (Grand 4.4m width front desk facing shipyard visitors)
    const counterY = 1.05;
    const counterFrontZ = baseD / 2 - 0.85;
    const counterWidth = 4.4;
    const counterDesk = createVoxelBox(counterWidth, 0.92, 0.72, mats.woodHi);
    counterDesk.position.set(0, counterY - 0.46, counterFrontZ);
    stallGroup.add(counterDesk);

    const counterTop = createVoxelBox(counterWidth + 0.24, 0.14, 0.88, mats.woodDark);
    counterTop.position.set(0, counterY + 0.07, counterFrontZ);
    stallGroup.add(counterTop);

    const counterTrim = createVoxelBox(counterWidth + 0.26, 0.07, 0.07, mats.iron);
    counterTrim.position.set(0, counterY + 0.07, counterFrontZ + 0.44);
    stallGroup.add(counterTrim);

    // 4. Ghostly Curios on Counter:
    // (a) Spectral Lantern & PointLight
    const lanternMat = new THREE.MeshStandardMaterial({
      color: 0x34d399,
      emissive: 0x34d399,
      emissiveIntensity: 2.5,
      roughness: 0.2
    });
    // (a) Spectral Lantern & PointLight
    const lanternGroup = new THREE.Group();
    lanternGroup.position.set(-counterWidth / 2 + 0.55, counterY + 0.32, counterFrontZ);
    stallGroup.add(lanternGroup);

    const lanternCore = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.36, 0.24), lanternMat);
    lanternGroup.add(lanternCore);

    const lanternCap = createVoxelBox(0.30, 0.06, 0.30, mats.iron);
    lanternCap.position.y = 0.21;
    lanternGroup.add(lanternCap);

    const lanternBase = createVoxelBox(0.30, 0.06, 0.30, mats.iron);
    lanternBase.position.y = -0.21;
    lanternGroup.add(lanternBase);

    [-0.12, 0.12].forEach(lx => {
      [-0.12, 0.12].forEach(lz => {
        const rib = createVoxelBox(0.04, 0.36, 0.04, mats.iron);
        rib.position.set(lx, 0, lz);
        lanternGroup.add(rib);
      });
    });

    const stallLight = new THREE.PointLight(0x34d399, 2.8, 9.5, 1.8);
    stallLight.position.set(-counterWidth / 2 + 0.55, counterY + 0.35, counterFrontZ);
    stallGroup.add(stallLight);

    // (b) Phantom Doubloons stacks
    const coinMat = createVoxelMat(Palette.goldCoin, { metalness: 0.85, roughness: 0.25 });
    for (let c = 0; c < 6; c++) {
      const coin = createVoxelBox(0.16, 0.028, 0.16, coinMat);
      coin.position.set(counterWidth / 2 - 0.55, counterY + 0.15 + c * 0.028, counterFrontZ);
      coin.rotation.y = c * 0.35;
      stallGroup.add(coin);
    }
    for (let c = 0; c < 4; c++) {
      const coin = createVoxelBox(0.14, 0.028, 0.14, coinMat);
      coin.position.set(counterWidth / 2 - 0.82, counterY + 0.15 + c * 0.028, counterFrontZ);
      coin.rotation.y = c * -0.4;
      stallGroup.add(coin);
    }

    // (c) Ancient Weathered Tome / Grimoire of the Deep
    const bookCover = createVoxelBox(0.48, 0.08, 0.58, mats.woodDark);
    bookCover.position.set(0.55, counterY + 0.18, counterFrontZ - 0.04);
    bookCover.rotation.y = 0.28;
    stallGroup.add(bookCover);

    const bookPages = createVoxelBox(0.44, 0.06, 0.54, mats.sailCloth);
    bookPages.position.set(0.55, counterY + 0.18, counterFrontZ - 0.04);
    bookPages.rotation.y = 0.28;
    stallGroup.add(bookPages);

    // (d) Spectral Alchemical Vial
    const vialMat = new THREE.MeshStandardMaterial({
      color: 0x34d399,
      emissive: 0x34d399,
      emissiveIntensity: 1.8,
      roughness: 0.15,
      transparent: true,
      opacity: 0.85
    });
    const vialMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.30, 0.18), vialMat);
    vialMesh.position.set(-0.65, counterY + 0.22, counterFrontZ);
    stallGroup.add(vialMesh);
    const vialStopper = createVoxelBox(0.12, 0.06, 0.12, mats.cork || mats.woodMid);
    vialStopper.position.set(-0.65, counterY + 0.39, counterFrontZ);
    stallGroup.add(vialStopper);

    // 5. Slanted Weathered Roof & Expanded Canopy
    const roofBeamFront = createVoxelBox(baseW + 0.6, 0.22, 0.24, mats.woodDark);
    roofBeamFront.position.set(0, postHeight + 0.26, baseD / 2 - 0.2);
    roofBeamFront.userData.noWalk = true;
    stallGroup.add(roofBeamFront);

    const roofBeamBack = createVoxelBox(baseW + 0.6, 0.22, 0.24, mats.woodDark);
    roofBeamBack.position.set(0, postHeight + 0.78, -baseD / 2 + 0.2);
    roofBeamBack.userData.noWalk = true;
    stallGroup.add(roofBeamBack);

    const roofSlant = new THREE.Group();
    roofSlant.position.set(0, postHeight + 0.52, 0);
    roofSlant.rotation.x = -0.16;
    stallGroup.add(roofSlant);

    const roofPlankMat = mats.woodDark;
    const roofPlankCount = 10;
    for (let rp = 0; rp < roofPlankCount; rp++) {
      const rx = -baseW / 2 + (rp + 0.5) * (baseW / roofPlankCount);
      const rPlank = createVoxelBox(baseW / roofPlankCount - 0.04, 0.09, baseD + 0.8, rp % 2 === 0 ? mats.plankDark : roofPlankMat);
      rPlank.position.set(rx, 0, 0);
      rPlank.userData.noWalk = true;
      roofSlant.add(rPlank);
    }
    roofSlant.traverse(child => {
      if (child.isMesh) child.userData.noWalk = true;
    });

    // 6. Hanging "DEADLY BUSINESS" Sign (Elevated to give clear shopkeeper sightline)
    const ghostSignPivot = new THREE.Group();
    ghostSignPivot.position.set(0, postHeight + 0.18, baseD / 2 - 0.1);
    stallGroup.add(ghostSignPivot);
    this.ghostSignPivot = ghostSignPivot;

    [-1.4, 1.4].forEach(cx => {
      for (let cl = 0; cl < 2; cl++) {
        const link = createVoxelBox(0.05, 0.12, 0.05, mats.iron);
        link.position.set(cx, -0.06 - cl * 0.10, 0);
        ghostSignPivot.add(link);
      }
    });

    const signTex = createDeadlyBusinessSignTexture();
    const signFrontMat = new THREE.MeshStandardMaterial({
      map: signTex,
      emissive: 0x34d399,
      emissiveIntensity: 0.75,
      roughness: 0.55
    });
    const mainSign = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.95, 0.10), [
      mats.woodDark, mats.woodDark, mats.woodDark, mats.woodDark, signFrontMat, mats.woodDark
    ]);
    mainSign.position.set(0, -0.55, 0);
    ghostSignPivot.add(mainSign);

    const signLight = new THREE.PointLight(0x34d399, 2.4, 6.5, 2);
    signLight.position.set(0, -0.55, 0.55);
    ghostSignPivot.add(signLight);

    const signBorder = createVoxelBox(3.34, 1.08, 0.06, mats.woodDark);
    signBorder.position.set(0, -0.55, -0.02);
    ghostSignPivot.add(signBorder);

    ghostSignPivot.traverse(child => {
      if (child.isMesh) child.userData.noWalk = true;
    });

    // Curios & counter noWalk to avoid stepping on counter
    counterDesk.userData.noWalk = true;
    counterTop.userData.noWalk = true;
    counterTrim.userData.noWalk = true;
    lanternGroup.traverse(child => { if (child.isMesh) child.userData.noWalk = true; });
    bookCover.userData.noWalk = true;
    bookPages.userData.noWalk = true;
    vialMesh.userData.noWalk = true;

    // 7. Ghost Merchant Stationed Behind His Dedicated Counter (Voxel Pac-Man Ghost)
    this.ghostMerchant = new GhostMerchant(stallGroup, new THREE.Vector3(0, 1.55, counterFrontZ - 0.85));
    this.ghostMerchantInteractables = this.ghostMerchant.interactables;

    // Counter click hitboxes for easy interaction
    counterTop.userData.isGhostMerchant = true;
    counterDesk.userData.isGhostMerchant = true;
    this.ghostMerchantInteractables.push(counterTop, counterDesk);
  }

  setDivorcePostRingVisible(visible) {
    if (this.divorcePostAura) {
      this.divorcePostAura.visible = Boolean(visible);
    }
  }

  setShipyardTutorialCircleVisible(visible) {
    if (this.shipyardTutorialCircle) {
      this.shipyardTutorialCircle.visible = Boolean(visible);
    }
  }

  setShopDoorGlowVisible(visible) {
    if (this.shopDoorGlowOutline) {
      this.shopDoorGlowOutline.visible = Boolean(visible);
    }
  }

  update(delta, time, playerCamera = null) {
    if (this.group && this.group.visible === false) return;

    if (this.signPivot) {
      this.signPivot.rotation.z = Math.sin(time * (2 * Math.PI / 5)) * 0.045;
    }
    if (this.ghostSignPivot) {
      this.ghostSignPivot.rotation.z = Math.sin(time * 1.5) * 0.04;
    }
    this.gulls.forEach(g => {
      g.mesh.position.set(
        g.baseX + Math.sin(time * 0.4 + g.phase) * 3,
        g.baseY + Math.sin(time * 1.1 + g.phase) * 0.5,
        -6 + Math.cos(time * 0.3 + g.phase) * 2
      );
    });
    if (this.bunny) {
      this.bunny.update(delta, time);
    }
    if (this.crab) {
      this.crab.update(delta, time);
    }
    if (this.divorcePostAura && this.divorcePostAura.visible) {
      this.divorcePostAura.rotation.z = time * 1.4;
      this.divorcePostAura.position.y = 0.35 + Math.sin(time * 2.8) * 0.08;
    }
    if (this.shipyardTutorialCircle && this.shipyardTutorialCircle.visible) {
      if (this.shipyardCircleOuter) {
        this.shipyardCircleOuter.rotation.z = time * 1.1;
      }
      if (this.shipyardCircleInner) {
        this.shipyardCircleInner.rotation.z = -time * 1.6;
      }
      if (this.shipyardCircleBeacon && this.shipyardCircleBeacon.material) {
        this.shipyardCircleBeacon.material.opacity = 0.14 + Math.sin(time * 3.0) * 0.05;
      }
    }
    if (this.shopDoorGlowOutline && this.shopDoorGlowOutline.visible) {
      if (this.shopDoorGlowMat) {
        this.shopDoorGlowMat.emissiveIntensity = 1.4 + Math.sin(time * 3.8) * 0.55;
      }
      if (this.shopDoorGlowLight) {
        this.shopDoorGlowLight.intensity = 1.1 + Math.sin(time * 3.8) * 0.45;
      }
    }
    if (this.bookLight) {
      this.bookLight.intensity = 1.1 + Math.sin(time * 3.5) * 0.45;
    }
    if (this.bookAura) {
      this.bookAura.rotation.y = time * 1.5;
      this.bookAura.position.y = 0.22 + Math.sin(time * 2.5) * 0.04;
    }
    if (this.shipyardBenchAura) {
      this.shipyardBenchAura.rotation.z = time * 1.4;
      this.shipyardBenchAura.position.y = 1.32 + Math.sin(time * 2.6) * 0.05;
    }
    if (this.shipyardBenchLight) {
      this.shipyardBenchLight.intensity = 1.15 + Math.sin(time * 3.0) * 0.35;
    }
    if (this.shipyardBenchRimMat) {
      this.shipyardBenchRimMat.emissiveIntensity = 1.0 + Math.sin(time * 3.0) * 0.35;
    }
    if (this.shipyardBenchTopMat) {
      this.shipyardBenchTopMat.emissiveIntensity = 0.24 + Math.sin(time * 3.0) * 0.08;
    }
    if (this.dockNPC) {
      this.dockNPC.update(delta, time, this.shopCam);
    }
    if (this.ghostMerchant) {
      let pPos = null;
      if (playerCamera) {
        pPos = playerCamera.getWorldPosition(_camPosScratch);
      } else if (window.gameState?.activeCamera) {
        pPos = window.gameState.activeCamera.getWorldPosition(_camPosScratch);
      } else if (this.shopCam) {
        pPos = this.shopCam.getWorldPosition(_camPosScratch);
      }
      this.ghostMerchant.update(delta, time, pPos);
    }
  }

  dispose() {
    if (this.ghostMerchant) {
      this.ghostMerchant.dispose();
      this.ghostMerchant = null;
    }
    if (this.dockNPC) {
      this.dockNPC.dispose();
      this.dockNPC = null;
    }
    if (this.bunny) {
      this.bunny.dispose();
      this.bunny = null;
    }
    if (this.crab) {
      this.crab.dispose();
      this.crab = null;
    }
    if (this.exteriorMirror && typeof this.exteriorMirror.dispose === 'function') {
      this.exteriorMirror.dispose();
      this.exteriorMirror = null;
    }
    this.group.traverse(child => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        } else if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      }
    });
  }
}

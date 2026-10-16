import * as THREE from 'three';
import { VoxelLopBunny } from './VoxelLopBunny.js';

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
  seagullBeak: 0xd98829
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
 * Creates a flat-shaded standard material matching VoxelArms / ChunkRenderer aesthetics.
 */
function createVoxelMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
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
}

/**
 * Creates a single voxel box with shadow casting/receiving.
 */
function createVoxelBox(w, h, d, material, castShadow = true, receiveShadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.castShadow = castShadow;
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
    this.shipInteractables = [];
    this.ledgerInteractables = [];
    this.shipNeedsRepair = false;
    this.activeShipProfile = null;
    this._isBuilt = false;
  }

  build() {
    if (this._isBuilt) return this.group;
    this._isBuilt = true;

    // Scale entire dock and island to match human/consistent ship proportions
    this.group.scale.setScalar(DOCK_SCALE);

    // Generate stylized voxel wood textures
    const texWoodHi   = createVoxelWoodTexture(181, 139, 94, 0.16);
    const texWoodMid  = createVoxelWoodTexture(120, 83, 50, 0.20);
    const texWoodDark = createVoxelWoodTexture(61, 39, 22, 0.22);
    const texPlank    = createVoxelWoodTexture(155, 122, 90, 0.18);

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
      stonePath: createVoxelMat(Palette.stonePath, { roughness: 0.85 }),
      sand: createVoxelMat(Palette.sand, { roughness: 0.95 }),
      sandWet: createVoxelMat(Palette.sandWet, { roughness: 0.9 }),
      brass: createVoxelMat(Palette.brass, { metalness: 0.65, roughness: 0.35 }),
      brassDark: createVoxelMat(Palette.brassDark, { metalness: 0.55, roughness: 0.45 }),
      iron: createVoxelMat(Palette.iron, { metalness: 0.5, roughness: 0.6 }),
      rope: createVoxelMat(Palette.rope, { roughness: 0.9 }),
      paper: createVoxelMat(Palette.paper, { roughness: 0.7 }),
      glass: createVoxelMat(Palette.glassPorthole, { transparent: true, opacity: 0.55, roughness: 0.15, metalness: 0.3 }),
      lanternGlow: createVoxelMat(Palette.lanternGlass, { emissive: 0xffaa33, emissiveIntensity: 0.85, transparent: true, opacity: 0.7 })
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
      [2, -4.5],  [2, 0],  [2, 4.5],  [2, 8.0],
      [8, -4.5],  [8, 0],  [8, 4.5],  [8, 8.0]
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
    // 2. ISLAND LANDMASS & SOLIDLY PLANTED PINE TREES (No Floating)
    // =========================================================================
    const islandGroup = new THREE.Group();
    islandGroup.position.set(-22, 0, 0);
    this.group.add(islandGroup);

    // Terraced Voxel Contours: Stepped elevation tiers from sea floor up to hill
    const shelfSlices = [
      { w: 32, d: 30, h: 2.2, y: -2.8, mat: mats.stoneDark },
      { w: 29, d: 27, h: 1.4, y: -1.0, mat: mats.stone },
      { w: 26, d: 24, h: 0.9, y: 0.15, mat: mats.sandWet },
      { w: 24, d: 22, h: 0.6, y: 0.9, mat: mats.sand }
    ];
    shelfSlices.forEach(s => {
      const slice = createVoxelBox(s.w, s.h, s.d, s.mat);
      slice.position.set(0, s.y, 0);
      islandGroup.add(slice);
    });

    // Layer 1: Main Grass Plateau (Top is at y = 2.0)
    const dirtTier = createVoxelBox(22, 0.9, 20, mats.dirt);
    dirtTier.position.set(0, 1.35, 0);
    islandGroup.add(dirtTier);

    const grassTier = createVoxelBox(22.2, 0.35, 20.2, mats.grassTop);
    grassTier.position.set(0, 1.82, 0);
    islandGroup.add(grassTier);

    // Layer 2: Inland Hill Plateaus
    // Lower hill tier: top at y = 3.08 (bounds: x from -12 to 2, z from -10.5 to 2.5)
    const hillLowerDirt = createVoxelBox(14, 0.9, 13, mats.dirt);
    hillLowerDirt.position.set(-5, 2.45, -4);
    islandGroup.add(hillLowerDirt);

    const hillLowerGrass = createVoxelBox(14.2, 0.35, 13.2, mats.grassTop);
    hillLowerGrass.position.set(-5, 2.9, -4);
    islandGroup.add(hillLowerGrass);

    // Upper hill peak: top at y = 4.18 (bounds: x from -10.35 to -1.65, z from -8.6 to -0.4)
    const hillUpperDirt = createVoxelBox(8.5, 0.9, 8, mats.dirt);
    hillUpperDirt.position.set(-6, 3.55, -4.5);
    islandGroup.add(hillUpperDirt);

    const hillUpperGrass = createVoxelBox(8.7, 0.35, 8.2, mats.grassTop);
    hillUpperGrass.position.set(-6, 4.0, -4.5);
    islandGroup.add(hillUpperGrass);

    // Coastal Rocky Shelf near water (+X, +Z)
    const coastalShelfTiers = [
      { x: 10, z: 7, w: 11, d: 10, h: 1.2, y: -1.2, mat: mats.stoneDark },
      { x: 9.5, z: 6.8, w: 8.5, d: 8, h: 1.0, y: -0.1, mat: mats.stone },
      { x: 9.0, z: 6.5, w: 6.5, d: 6, h: 0.6, y: 0.7, mat: mats.sandWet }
    ];
    coastalShelfTiers.forEach(cs => {
      const rockBlock = createVoxelBox(cs.w, cs.h, cs.d, cs.mat);
      rockBlock.position.set(cs.x, cs.y, cs.z);
      islandGroup.add(rockBlock);
    });

    // Solidly Planted Voxel Pine Trees (With deep underground root embed to prevent any floating)
    const leafMats = [mats.grassDark, createVoxelMat(Palette.pineLeaves1), createVoxelMat(Palette.pineLeaves2), createVoxelMat(Palette.pineLeaves3)];
    function addVoxelPineTree(x, surfaceY, z, scale = 1.0) {
      const tree = new THREE.Group();
      tree.position.set(x, surfaceY, z);
      tree.scale.setScalar(scale);

      // Deep root trunk anchor (extends 0.9m underground so bottom never floats)
      const trunk = createVoxelBox(0.48, 3.8, 0.48, mats.woodDark);
      trunk.position.y = 1.1; // Extends from y = -0.8 to y = +3.0
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

      islandGroup.add(tree);
    }

    // Precise terrain surface coordinates for every tree:
    addVoxelPineTree(-6.5, 4.18, -4.5, 1.35); // Upper hill peak
    addVoxelPineTree(-7.8, 4.18, -6.0, 1.25); // Upper hill peak
    addVoxelPineTree(-3.5, 3.08, -2.5, 1.15); // Lower hill tier
    addVoxelPineTree(-10.2, 3.08, -3.5, 1.20); // Lower hill tier
    addVoxelPineTree(2.5, 2.0, 6.0, 1.15);    // Main grass plateau
    addVoxelPineTree(5.5, 2.0, -5.0, 1.0);    // Main grass plateau
    addVoxelPineTree(-6.0, 2.0, 6.5, 1.1);    // Main grass plateau

    // Stepped Stone Walkway connecting Dock to Island
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const stepX = 13 - i * 1.85;
      const stepY = 2.05 - t * 0.15;
      const stepZ = Math.sin(i * 0.8) * 0.4;
      const step = createVoxelBox(1.9, 0.22, 1.3, i % 2 === 0 ? mats.stonePath : mats.stoneDark);
      step.position.set(stepX, stepY, stepZ);
      step.rotation.y = Math.sin(i * 1.5) * 0.15;
      islandGroup.add(step);

      const border1 = createVoxelBox(0.24, 0.28, 1.3, mats.stone);
      border1.position.set(stepX, stepY + 0.04, stepZ - 0.72);
      islandGroup.add(border1);
      const border2 = createVoxelBox(0.24, 0.28, 1.3, mats.stone);
      border2.position.set(stepX, stepY + 0.04, stepZ + 0.72);
      islandGroup.add(border2);
    }

    // Smooth invisible ramp along path (Color & depth writes disabled)
    const pathCollider = new THREE.Mesh(
      new THREE.BoxGeometry(13.5, 0.35, 2.6),
      new THREE.MeshBasicMaterial({ visible: false, colorWrite: false, depthWrite: false })
    );
    pathCollider.position.set(7.5, 1.95, 0);
    islandGroup.add(pathCollider);

    // Voxel Cargo Crates on Island
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

      // Dark wooden edge framing
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

      islandGroup.add(crateGroup);
    });

    // Easter Egg: Voxel Lop-Eared Bunny hopping around island grass
    this.bunny = new VoxelLopBunny(islandGroup, new THREE.Vector3(0, 2.0, 2.5), this.group);
    this.bunnyInteractables = this.bunny.interactables;

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
    const yTopHeader  = portholeY + portholeR; // 3.65m

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
      vRidge.userData = { isShopDoor: true };
      doorGroup.add(vRidge);
    }

    // Horizontal Rails and Diagonal Z-Brace (Exterior & Interior)
    [-0.07, 0.07].forEach(ox => {
      [0.35, doorLeafH * 0.5, doorLeafH - 0.35].forEach(ry => {
        const hRail = createVoxelBox(0.035, 0.18, doorLeafW - 0.08, mats.woodDark);
        hRail.position.set(ox, ry, 0);
        hRail.userData = { isShopDoor: true };
        doorGroup.add(hRail);
      });

      const diagBrace = createVoxelBox(0.035, doorLeafH * 0.42, 0.15, mats.woodDark);
      diagBrace.position.set(ox, doorLeafH * 0.72, 0);
      diagBrace.rotation.x = 0.5;
      diagBrace.userData = { isShopDoor: true };
      doorGroup.add(diagBrace);
    });

    // Voxel Brass Door Handles
    const handleY = 1.65;
    const handleZ = doorLeafW / 2 - 0.22;

    const extPlate = createVoxelBox(0.03, 0.38, 0.1, mats.brass);
    extPlate.position.set(0.08, handleY, handleZ);
    extPlate.userData = { isShopDoor: true };
    doorGroup.add(extPlate);

    const extHandle = createVoxelBox(0.08, 0.05, 0.24, mats.brassDark);
    extHandle.position.set(0.13, handleY, handleZ);
    extHandle.userData = { isShopDoor: true };
    doorGroup.add(extHandle);

    const intPlate = createVoxelBox(0.03, 0.38, 0.1, mats.brass);
    intPlate.position.set(-0.08, handleY, handleZ);
    intPlate.userData = { isShopDoor: true };
    doorGroup.add(intPlate);

    const intHandle = createVoxelBox(0.08, 0.05, 0.24, mats.brassDark);
    intHandle.position.set(-0.13, handleY, handleZ);
    intHandle.userData = { isShopDoor: true };
    doorGroup.add(intHandle);

    this.shopDoor = doorLeaf;
    this.doorInteractables = [doorLeaf, extHandle, extPlate, intHandle, intPlate];

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
    // (a) Open Ledger Book & Inkpot
    const ledgerGroup = new THREE.Group();
    ledgerGroup.position.set(-deskW / 2 + 0.55, counterY + 0.12, frontZ - 0.45);
    ledgerGroup.rotation.y = 0.15;
    ledgerGroup.userData = { isLedger: true };
    deskGroup.add(ledgerGroup);

    const cover = createVoxelBox(0.62, 0.04, 0.44, mats.woodDark);
    cover.userData = { isLedger: true };
    ledgerGroup.add(cover);
    const pagesLeft = createVoxelBox(0.28, 0.06, 0.4, mats.paper);
    pagesLeft.position.set(-0.14, 0.04, 0);
    pagesLeft.rotation.z = -0.06;
    pagesLeft.userData = { isLedger: true };
    ledgerGroup.add(pagesLeft);
    const pagesRight = createVoxelBox(0.28, 0.06, 0.4, mats.paper);
    pagesRight.position.set(0.14, 0.04, 0);
    pagesRight.rotation.z = 0.06;
    pagesRight.userData = { isLedger: true };
    ledgerGroup.add(pagesRight);

    this.ledgerInteractables = [ledgerGroup, cover, pagesLeft, pagesRight];

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
    lanternLight.castShadow = true;
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
      { x: leftX - 0.65, z: 0.65, h: 1.05, r: 0.32 },
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

    return this.group;
  }

  update(delta, time) {
    if (this.signPivot) {
      this.signPivot.rotation.z = Math.sin(time * (2 * Math.PI / 5)) * 0.045;
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
  }

  dispose() {
    if (this.bunny) {
      this.bunny.dispose();
      this.bunny = null;
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

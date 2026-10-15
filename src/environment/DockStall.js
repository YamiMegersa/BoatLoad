import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Voxel Palette & Material Helper
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
  stonePathDark: 0x6b6f72,
  sand: 0xbfa779,
  sandWet: 0x96825a,

  // Pine Trees
  pineTrunk: 0x3d2514,
  pineTrunkDark: 0x2b190d,
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
  sackBurlapDark: 0x826d4a,
  fishBody: 0x5a7d8c,
  fishBelly: 0xa8c2cb,
  seagullWhite: 0xedebe6,
  seagullGrey: 0x7d858c,
  seagullBeak: 0xd98829
};

/**
 * Creates a flat-shaded standard material matching VoxelArms / ChunkRenderer aesthetics.
 */
function createVoxelMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.85,
    metalness: opts.metalness ?? 0.12,
    flatShading: true,
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
 * Helper to build an 8-sided faceted voxel ring for portholes, rope rings, and barrels.
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

// ---------------------------------------------------------------------------
// DockStall Environment Class
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
    this._isBuilt = false;
  }

  build() {
    if (this._isBuilt) return this.group;
    this._isBuilt = true;

    // Cache common materials
    const mats = {
      plank: createVoxelMat(Palette.dockPlank, { roughness: 0.88 }),
      plankDark: createVoxelMat(Palette.dockDark, { roughness: 0.9 }),
      plankHi: createVoxelMat(Palette.woodHi, { roughness: 0.8 }),
      woodMid: createVoxelMat(Palette.woodMid, { roughness: 0.85 }),
      woodDark: createVoxelMat(Palette.woodDark, { roughness: 0.9 }),
      woodTrim: createVoxelMat(Palette.woodTrim, { roughness: 0.92 }),
      woodAged: createVoxelMat(Palette.woodAged, { roughness: 0.88 }),
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
    // 1. DOCK PIER (Timber Pilings, Crossbeams & Voxel Decking)
    // =========================================================================
    const dockGroup = new THREE.Group();
    dockGroup.position.y = 1.5;
    this.group.add(dockGroup);

    const dockLength = 18;
    const dockWidth = 10;
    const plankCount = 14;
    const plankWidth = dockLength / plankCount;

    // Voxel Deck Planks: Split along Z into 3 staggered plank sections per row
    // with subtle height/tone variation and iron nail studs
    const nailGeo = new THREE.BoxGeometry(0.04, 0.02, 0.04);
    for (let i = 0; i < plankCount; i++) {
      const px = -dockLength / 2 + i * plankWidth + plankWidth / 2;
      const baseMat = i % 2 === 0 ? mats.plank : mats.plankDark;

      // 3 staggered plank segments across dock width
      const cuts = [-5, -1.8, 1.6, 5];
      for (let s = 0; s < 3; s++) {
        const segLen = cuts[s + 1] - cuts[s] - 0.04;
        const segZ = cuts[s] + segLen / 2 + 0.02;
        const segMat = (i + s) % 3 === 0 ? mats.plankHi : baseMat;
        const plank = createVoxelBox(plankWidth - 0.04, 0.28, segLen, segMat);
        plank.position.set(px, 0.49, segZ);
        dockGroup.add(plank);

        // Voxel iron nail heads at beam supports
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

    // Heavy Timber Edge Curb Rails (Front and Rear bulling timbers)
    const frontCurb = createVoxelBox(dockLength + 0.2, 0.22, 0.32, mats.woodDark);
    frontCurb.position.set(0, 0.64, -dockWidth / 2 + 0.16);
    dockGroup.add(frontCurb);

    const backCurb = createVoxelBox(dockLength + 0.2, 0.22, 0.32, mats.woodDark);
    backCurb.position.set(0, 0.64, dockWidth / 2 - 0.16);
    dockGroup.add(backCurb);

    // End curb on water-facing side (+X)
    const endCurb = createVoxelBox(0.32, 0.22, dockWidth, mats.woodDark);
    endCurb.position.set(dockLength / 2 - 0.16, 0.64, 0);
    dockGroup.add(endCurb);

    // Invisible smooth deck collider (preserves seamless FPS walking)
    const dockCollisionDeck = new THREE.Mesh(
      new THREE.BoxGeometry(dockLength, 0.35, dockWidth),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    dockCollisionDeck.position.set(0, 0.5, 0);
    dockGroup.add(dockCollisionDeck);

    // Voxel Timber Pilings (Square cross-section posts with iron collars)
    const pilingLocations = [
      [-8, -4.5], [-8, 4.5],
      [-3, -4.5], [-3, 4.5],
      [2, -4.5], [2, 4.5],
      [8, -4.5], [8, 4.5],
      [8, 0]
    ];
    pilingLocations.forEach(([x, z]) => {
      // Main square pile
      const post = createVoxelBox(0.62, 5.8, 0.62, mats.woodTrim);
      post.position.set(x, -2.1, z);
      dockGroup.add(post);

      // Pile head extending slightly above deck
      const postTop = createVoxelBox(0.66, 0.4, 0.66, mats.woodDark);
      postTop.position.set(x, 0.72, z);
      dockGroup.add(postTop);

      // Iron bracket collar
      const collar = createVoxelBox(0.72, 0.16, 0.72, mats.iron);
      collar.position.set(x, 0.45, z);
      dockGroup.add(collar);

      // Mooring post rope coil on select perimeter pilings
      if (Math.abs(x) > 6 || x === 2) {
        const ropeRing = createVoxelBox(0.82, 0.22, 0.82, mats.rope);
        ropeRing.position.set(x, 0.62, z);
        dockGroup.add(ropeRing);
      }
    });

    // Sub-deck support stringers (heavy square timber beams connecting the pilings)
    [-4.5, 4.5].forEach(z => {
      const beam = createVoxelBox(dockLength - 0.5, 0.42, 0.45, mats.woodTrim);
      beam.position.set(0, 0.18, z);
      dockGroup.add(beam);
    });
    [-8, -3, 2, 8].forEach(x => {
      const crossBeam = createVoxelBox(0.45, 0.42, dockWidth - 0.8, mats.woodTrim);
      crossBeam.position.set(x, 0.16, 0);
      dockGroup.add(crossBeam);
    });

    // Voxel Mooring Cleats on Pier Edge
    [-5, 0, 5].forEach(x => {
      const cleatBase = createVoxelBox(0.48, 0.08, 0.18, mats.iron);
      cleatBase.position.set(x, 0.76, -dockWidth / 2 + 0.16);
      dockGroup.add(cleatBase);

      const cleatBar = createVoxelBox(0.72, 0.08, 0.09, mats.iron);
      cleatBar.position.set(x, 0.84, -dockWidth / 2 + 0.16);
      dockGroup.add(cleatBar);
    });

    // =========================================================================
    // 2. ISLAND LANDMASS (Terraced Voxel Contours, Nature & Paths)
    // =========================================================================
    const islandGroup = new THREE.Group();
    islandGroup.position.set(-22, 0, 0);
    this.group.add(islandGroup);

    // Terraced Voxel Contours: Stepped elevation tiers from sea floor up to hill
    // Layer 0: Underwater & Sand Shoreline Shelf (y = -3.2 to 0.4)
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

    // Layer 1: Main Grass Plateaus (y = 1.2 to 2.1)
    // Base soil
    const dirtTier = createVoxelBox(22, 0.9, 20, mats.dirt);
    dirtTier.position.set(0, 1.35, 0);
    islandGroup.add(dirtTier);

    // Top grass block tier
    const grassTier = createVoxelBox(22.2, 0.35, 20.2, mats.grassTop);
    grassTier.position.set(0, 1.82, 0);
    islandGroup.add(grassTier);

    // Layer 2: Inland Higher Hill Plateau (facing -X / -Z)
    const hillTiers = [
      { x: -5, z: -4, w: 14, d: 13, h: 0.9, y: 2.45, mat: mats.dirt },
      { x: -5, z: -4, w: 14.2, d: 13.2, h: 0.35, y: 2.9, mat: mats.grassTop },
      { x: -6, z: -4.5, w: 8.5, d: 8, h: 0.9, y: 3.55, mat: mats.dirt },
      { x: -6, z: -4.5, w: 8.7, d: 8.2, h: 0.35, y: 4.0, mat: mats.grassTop }
    ];
    hillTiers.forEach(h => {
      const tier = createVoxelBox(h.w, h.h, h.d, h.mat);
      tier.position.set(h.x, h.y, h.z);
      islandGroup.add(tier);
    });

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

    // Voxel Pine Trees: Stepped pyramid foliage tiers over square timber trunks
    const leafMats = [mats.grassDark, createVoxelMat(Palette.pineLeaves1), createVoxelMat(Palette.pineLeaves2), createVoxelMat(Palette.pineLeaves3)];
    function addVoxelPineTree(x, y, z, scale = 1.0) {
      const tree = new THREE.Group();
      tree.position.set(x, y, z);
      tree.scale.setScalar(scale);

      // Square timber trunk
      const trunk = createVoxelBox(0.48, 2.8, 0.48, mats.woodDark);
      trunk.position.y = 1.4;
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

    addVoxelPineTree(-2, 2.0, -4, 1.25);
    addVoxelPineTree(-7, 4.2, -6, 1.4);
    addVoxelPineTree(-3, 2.0, -9, 1.05);
    addVoxelPineTree(-10, 4.2, 0, 1.3);
    addVoxelPineTree(1, 2.0, 8, 1.15);
    addVoxelPineTree(5, 2.0, -5, 0.95);
    addVoxelPineTree(-8, 3.1, 5, 1.1);

    // Stepped Stone Walkway connecting Dock to Island
    // Dock deck is at y = 2.0 (dockGroup y=1.5 + 0.5), Island main plateau is y = 2.0
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const stepX = 13 - i * 1.85;
      const stepY = 2.05 - t * 0.15;
      const stepZ = Math.sin(i * 0.8) * 0.4;
      const step = createVoxelBox(1.9, 0.22, 1.3, i % 2 === 0 ? mats.stonePath : mats.stoneDark);
      step.position.set(stepX, stepY, stepZ);
      step.rotation.y = Math.sin(i * 1.5) * 0.15;
      islandGroup.add(step);

      // Flanking stone curb blocks
      const border1 = createVoxelBox(0.24, 0.28, 1.3, mats.stone);
      border1.position.set(stepX, stepY + 0.04, stepZ - 0.72);
      islandGroup.add(border1);
      const border2 = createVoxelBox(0.24, 0.28, 1.3, mats.stone);
      border2.position.set(stepX, stepY + 0.04, stepZ + 0.72);
      islandGroup.add(border2);
    }

    // Smooth invisible ramp along the path for zero-snag collision raycasting
    const pathCollider = new THREE.Mesh(
      new THREE.BoxGeometry(13.5, 0.35, 2.6),
      new THREE.MeshBasicMaterial({ visible: false })
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
      // Diagonal brace on front and top
      const brace1 = createVoxelBox(cp.s * 1.15, frameThick * 0.8, frameThick * 0.5, mats.woodDark);
      brace1.rotation.z = Math.PI / 4;
      brace1.position.z = cp.s / 2 + frameThick * 0.2;
      crateGroup.add(brace1);

      islandGroup.add(crateGroup);
    });

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

    // Heavy Timber Corner Posts (Square section with iron footings)
    const cornerPostLocations = [
      [leftX + 0.2, backZ + 0.2],
      [rightX - 0.2, backZ + 0.2],
      [leftX + 0.2, frontZ - 0.2],
      [rightX - 0.2, frontZ - 0.2]
    ];
    cornerPostLocations.forEach(([cx, cz]) => {
      // Main timber column
      const post = createVoxelBox(0.4, shopH, 0.4, mats.woodDark);
      post.position.set(cx, shopH / 2, cz);
      shop.add(post);

      // Iron base shoe
      const shoe = createVoxelBox(0.48, 0.35, 0.48, mats.iron);
      shoe.position.set(cx, 0.25, cz);
      shop.add(shoe);

      // Top capital block
      const cap = createVoxelBox(0.48, 0.22, 0.48, mats.woodTrim);
      cap.position.set(cx, shopH - 0.11, cz);
      shop.add(cap);
    });

    // Perimeter Header Beams spanning the top of the walls
    const frontBeam = createVoxelBox(shopW + 0.2, 0.32, 0.42, mats.woodDark);
    frontBeam.position.set(0, shopH - 0.16, frontZ - 0.2);
    shop.add(frontBeam);

    const backBeam = createVoxelBox(shopW + 0.2, 0.32, 0.42, mats.woodDark);
    backBeam.position.set(0, shopH - 0.16, backZ + 0.2);
    shop.add(backBeam);

    const leftBeam = createVoxelBox(0.42, 0.32, shopD - 0.4, mats.woodDark);
    leftBeam.position.set(leftX + 0.2, shopH - 0.16, 0);
    shop.add(leftBeam);

    const rightBeam = createVoxelBox(0.42, 0.32, shopD - 0.4, mats.woodDark);
    rightBeam.position.set(rightX - 0.2, shopH - 0.16, 0);
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
      const plank = createVoxelBox(shopW - 0.1, wallPlankH - 0.03, 0.22, isAlt ? mats.woodMid : mats.woodAged);
      plank.position.set(0, py, 0.11);
      backWallGroup.add(plank);

      // Horizontal relief trim band every 3 planks
      if (p % 3 === 0) {
        const trimBand = createVoxelBox(shopW + 0.08, 0.1, 0.28, mats.woodDark);
        trimBand.position.set(0, py, 0.12);
        backWallGroup.add(trimBand);
      }
    }

    // -------------------------------------------------------------------------
    // Left Wall: Lap Siding + Stepped Octagonal Voxel Porthole
    // -------------------------------------------------------------------------
    const leftWallGroup = new THREE.Group();
    leftWallGroup.position.set(leftX, 0, 0);
    shop.add(leftWallGroup);

    const portholeZ = -0.5;
    const portholeY = 3.0;
    const portholeR = 0.65;

    // Wall panels around the porthole opening
    for (let p = 0; p < wallPlankCount; p++) {
      const py = p * wallPlankH + wallPlankH / 2;
      const dy = Math.abs(py - portholeY);

      if (dy < portholeR) {
        // Break plank into back and front segments leaving the window opening
        const gapHalf = portholeR + 0.08;
        const backStart = -shopD / 2 + 0.1;
        const backEnd = portholeZ - gapHalf;
        const backLen = backEnd - backStart;
        if (backLen > 0) {
          const pBack = createVoxelBox(0.22, wallPlankH - 0.03, backLen, p % 2 === 0 ? mats.woodMid : mats.woodAged);
          pBack.position.set(0.11, py, backStart + backLen / 2);
          leftWallGroup.add(pBack);
        }

        const frontStart = portholeZ + gapHalf;
        const frontEnd = shopD / 2 - 0.1;
        const frontLen = frontEnd - frontStart;
        if (frontLen > 0) {
          const pFront = createVoxelBox(0.22, wallPlankH - 0.03, frontLen, p % 2 === 0 ? mats.woodMid : mats.woodAged);
          pFront.position.set(0.11, py, frontStart + frontLen / 2);
          leftWallGroup.add(pFront);
        }
      } else {
        const fullPlank = createVoxelBox(0.22, wallPlankH - 0.03, shopD - 0.2, p % 2 === 0 ? mats.woodMid : mats.woodAged);
        fullPlank.position.set(0.11, py, 0);
        leftWallGroup.add(fullPlank);
      }
    }

    // Stepped Octagonal Voxel Brass Porthole Frame
    const octRing = createVoxelOctagonRing(portholeR, 0.12, 0.28, mats.brass);
    octRing.rotation.y = Math.PI / 2;
    octRing.position.set(0.11, portholeY, portholeZ);
    leftWallGroup.add(octRing);

    // Brass Rivet Studs around the Octagonal Frame
    for (let r = 0; r < 8; r++) {
      const ang = (r * Math.PI) / 4;
      const rivet = createVoxelBox(0.06, 0.06, 0.06, mats.brassDark);
      rivet.position.set(
        -0.05,
        portholeY + Math.sin(ang) * (portholeR + 0.08),
        portholeZ + Math.cos(ang) * (portholeR + 0.08)
      );
      leftWallGroup.add(rivet);
    }

    // Flat-shaded translucent glass pane
    const portholeGlass = createVoxelBox(0.04, portholeR * 1.5, portholeR * 1.5, mats.glass);
    portholeGlass.position.set(0.11, portholeY, portholeZ);
    leftWallGroup.add(portholeGlass);

    // Cross-muntin bars inside porthole
    const muntinH = createVoxelBox(0.06, 0.06, portholeR * 1.6, mats.brass);
    muntinH.position.set(0.11, portholeY, portholeZ);
    leftWallGroup.add(muntinH);
    const muntinV = createVoxelBox(0.06, portholeR * 1.6, 0.06, mats.brass);
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
    const rwBackLen = doorZ - doorW / 2 - (-shopD / 2);
    const rwBack = createVoxelBox(0.22, shopH, rwBackLen, mats.woodMid);
    rwBack.position.set(-0.11, shopH / 2, -shopD / 2 + rwBackLen / 2);
    rightWallGroup.add(rwBack);

    // Front wall panel of right side (from door frame to frontZ)
    const rwFrontLen = shopD / 2 - (doorZ + doorW / 2);
    const rwFront = createVoxelBox(0.22, shopH, rwFrontLen, mats.woodMid);
    rwFront.position.set(-0.11, shopH / 2, shopD / 2 - rwFrontLen / 2);
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
    const jambGeo = new THREE.BoxGeometry(0.32, doorH, 0.2);
    const jambBack = new THREE.Mesh(jambGeo, mats.woodDark);
    jambBack.position.set(-0.11, doorH / 2, doorZ - doorW / 2 - 0.08);
    rightWallGroup.add(jambBack);

    const jambFront = new THREE.Mesh(jambGeo, mats.woodDark);
    jambFront.position.set(-0.11, doorH / 2, doorZ + doorW / 2 + 0.08);
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

    // Main door leaf slab
    const doorLeaf = createVoxelBox(0.12, doorLeafH, doorLeafW, mats.plankHi);
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

      // Diagonal Z-brace
      const diagBrace = createVoxelBox(0.035, doorLeafH * 0.42, 0.15, mats.woodDark);
      diagBrace.position.set(ox, doorLeafH * 0.72, 0);
      diagBrace.rotation.x = 0.5;
      diagBrace.userData = { isShopDoor: true };
      doorGroup.add(diagBrace);
    });

    // Voxel Brass Door Handles (Exterior +X, Interior -X)
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

    // Register door references for player interaction and raycasting
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

    // Left and right stepped shingle tiers climbing towards the ridge at Z = 0
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

      // Front slope tier (+Z)
      const frontStep = createVoxelBox(roofW, stepH, stepDepth, tileMat);
      frontStep.position.set(0, y + stepH / 2, stepZ);
      roofGroup.add(frontStep);

      // Back slope tier (-Z)
      const backStep = createVoxelBox(roofW, stepH, stepDepth, tileMat);
      backStep.position.set(0, y + stepH / 2, -stepZ);
      roofGroup.add(backStep);

      // Eaves rafter brackets on the lowest 2 steps
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

    // Heavy Ridge Cap Beam along the peak
    const ridgeBeam = createVoxelBox(roofW + 0.35, 0.28, 0.45, mats.roofRidge);
    ridgeBeam.position.set(0, roofPeakY + 0.14, 0);
    roofGroup.add(ridgeBeam);

    // Ridge end finials
    [-roofW / 2 - 0.15, roofW / 2 + 0.15].forEach(fx => {
      const finial = createVoxelBox(0.2, 0.45, 0.35, mats.woodDark);
      finial.position.set(fx, roofPeakY + 0.25, 0);
      roofGroup.add(finial);
    });

    // Gable triangular wall infills (Left & Right)
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
    // 4. SERVING COUNTER & DISPLAY SHELVES
    // -------------------------------------------------------------------------
    const deskGroup = new THREE.Group();
    shop.add(deskGroup);

    const deskW = shopW - 0.8;
    const deskD = 1.8;
    const counterY = 2.0;

    // Heavy Voxel Corner Legs
    const legGeo = new THREE.BoxGeometry(0.28, counterY, 0.28);
    [
      [-deskW / 2 + 0.18, frontZ - 0.4],
      [deskW / 2 - 0.18, frontZ - 0.4],
      [-deskW / 2 + 0.18, frontZ - deskD + 0.2],
      [deskW / 2 - 0.18, frontZ - deskD + 0.2]
    ].forEach(([x, z]) => {
      const leg = new THREE.Mesh(legGeo, mats.woodDark);
      leg.position.set(x, counterY / 2, z);
      deskGroup.add(leg);

      const boot = createVoxelBox(0.34, 0.25, 0.34, mats.brass);
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

    // 3 Recessed carved frame details on front apron
    for (let c = 0; c < 3; c++) {
      const cx = -deskW / 3 + c * (deskW / 3);
      const panelFrame = createVoxelBox(deskW / 3.8, counterY * 0.65, 0.04, mats.woodTrim);
      panelFrame.position.set(cx, counterY * 0.52, frontZ - 0.08);
      deskGroup.add(panelFrame);
    }

    // Thick Counter Top with Voxel Brass Inset Trim
    const topPlank = createVoxelBox(deskW + 0.35, 0.18, deskD + 0.42, mats.woodHi);
    topPlank.position.set(0, counterY, frontZ - deskD / 2 + 0.15);
    deskGroup.add(topPlank);

    const brassEdgeTrim = createVoxelBox(deskW + 0.38, 0.06, deskD + 0.45, mats.brass);
    brassEdgeTrim.position.set(0, counterY + 0.11, frontZ - deskD / 2 + 0.15);
    deskGroup.add(brassEdgeTrim);

    // -------------------------------------------------------------------------
    // 5. COUNTERTOP & SHELF PROPS (Voxel Models)
    // -------------------------------------------------------------------------
    // (a) Open Ledger Book & Inkpot
    const ledgerGroup = new THREE.Group();
    ledgerGroup.position.set(-deskW / 2 + 0.55, counterY + 0.12, frontZ - 0.45);
    ledgerGroup.rotation.y = 0.15;
    deskGroup.add(ledgerGroup);

    // Stepped leather cover + paper pages
    const cover = createVoxelBox(0.62, 0.04, 0.44, mats.woodDark);
    ledgerGroup.add(cover);
    const pagesLeft = createVoxelBox(0.28, 0.06, 0.4, mats.paper);
    pagesLeft.position.set(-0.14, 0.04, 0);
    pagesLeft.rotation.z = -0.06;
    ledgerGroup.add(pagesLeft);
    const pagesRight = createVoxelBox(0.28, 0.06, 0.4, mats.paper);
    pagesRight.position.set(0.14, 0.04, 0);
    pagesRight.rotation.z = 0.06;
    ledgerGroup.add(pagesRight);

    // Inkpot & Voxel Quill
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

    // Stepped pedestal & central column
    const scaleBase = createVoxelBox(0.38, 0.08, 0.38, mats.brass);
    scaleGroup.add(scaleBase);
    const scaleShaft = createVoxelBox(0.08, 0.42, 0.08, mats.brass);
    scaleShaft.position.y = 0.24;
    scaleGroup.add(scaleShaft);

    // Horizontal balance beam
    const balanceBeam = createVoxelBox(0.68, 0.05, 0.05, mats.brass);
    balanceBeam.position.y = 0.45;
    scaleGroup.add(balanceBeam);

    // Left and right hanging pans (faceted octagonal boxes)
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

    // Lantern cage frame
    const lanternFrame = createVoxelBox(0.26, 0.38, 0.26, mats.woodDark);
    lanternGroup.add(lanternFrame);

    // Glowing translucent panes
    const lanternPane = createVoxelBox(0.24, 0.32, 0.24, mats.lanternGlow);
    lanternGroup.add(lanternPane);

    // Internal PointLight for night/weather integration
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

      // Stepped voxel bottle body + neck
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
    const shelfCrate = createVoxelBox(0.42, 0.24, 0.32, mats.plankHi);
    shelfCrate.position.set(1.2, 1.51 + 0.12, frontZ - deskD / 2 - 0.05);
    shelfCrate.rotation.y = 0.15;
    deskGroup.add(shelfCrate);

    // -------------------------------------------------------------------------
    // Back Wall Decor (Voxel Trophy Fish & Fishing Net)
    // -------------------------------------------------------------------------
    const netMesh = createVoxelBox(2.2, 1.6, 0.02, createVoxelMat(Palette.ropeDark, { wireframe: true }));
    netMesh.position.set(-1.2, 3.8, backZ + 0.15);
    shop.add(netMesh);

    // Voxel Trophy Fish
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

    // Heavy crossbeam spanning the front entrance
    const crossbeam = createVoxelBox(shopW + 0.4, 0.24, 0.32, mats.woodDark);
    crossbeam.position.set(0, shopH - 0.32, frontZ + 0.3);
    rigging.add(crossbeam);

    // Diagonal corner brackets under crossbeam
    [-shopW / 2 + 0.35, shopW / 2 - 0.35].forEach(bx => {
      const bracket = createVoxelBox(0.16, 0.52, 0.16, mats.woodDark);
      bracket.position.set(bx, -0.36, 0);
      crossbeam.add(bracket);

      const diagStrut = createVoxelBox(0.12, 0.58, 0.12, mats.woodDark);
      diagStrut.position.set(bx > 0 ? -0.22 : 0.22, -0.32, -0.16);
      diagStrut.rotation.z = bx > 0 ? 0.6 : -0.6;
      crossbeam.add(diagStrut);
    });

    // signPivot is animated in update() to swing gently in the breeze
    const signPivot = new THREE.Group();
    signPivot.position.set(0, -0.14, 0.16);
    crossbeam.add(signPivot);
    this.signPivot = signPivot;

    // Voxel hanging chain links
    [-0.9, 0.9].forEach(cx => {
      for (let cl = 0; cl < 3; cl++) {
        const link = createVoxelBox(0.04, 0.16, 0.04, mats.iron);
        link.position.set(cx, -0.12 - cl * 0.15, 0);
        signPivot.add(link);
      }
    });

    // Wooden Hanging Sign Board
    const mainSign = createVoxelBox(2.4, 0.78, 0.1, mats.woodHi);
    mainSign.position.set(0, -0.92, 0);
    signPivot.add(mainSign);

    const signBorder = createVoxelBox(2.52, 0.88, 0.06, mats.woodDark);
    signBorder.position.set(0, -0.92, -0.03);
    signPivot.add(signBorder);

    // Voxel Wax Seal Stamp
    const waxSeal = createVoxelBox(0.24, 0.24, 0.06, createVoxelMat(Palette.sealRed, { roughness: 0.4 }));
    waxSeal.position.set(0.72, -0.92, 0.07);
    signPivot.add(waxSeal);

    // -------------------------------------------------------------------------
    // 7. EXTERIOR PROPS (Voxel Barrels, Crates & Lantern Bracket)
    // -------------------------------------------------------------------------
    // 3 Octagonal Voxel Barrels
    const barrelLocations = [
      { x: leftX - 0.75, z: -0.5, h: 1.25, r: 0.38 },
      { x: leftX - 0.65, z: 0.65, h: 1.05, r: 0.32 },
      { x: rightX + 0.72, z: -2.0, h: 1.35, r: 0.4 }
    ];
    barrelLocations.forEach(b => {
      const barrelGroup = new THREE.Group();
      barrelGroup.position.set(b.x, b.h / 2, b.z);

      // Octagonal barrel staves
      const staves = createVoxelOctagonRing(b.r, b.r * 0.75, b.h, mats.woodAged);
      staves.rotation.x = Math.PI / 2;
      barrelGroup.add(staves);

      // Central solid core
      const core = createVoxelBox(b.r * 1.5, b.h, b.r * 1.5, mats.woodMid);
      barrelGroup.add(core);

      // Iron hoop bands
      [-0.32, 0, 0.32].forEach(yOff => {
        const band = createVoxelOctagonRing(b.r * 1.04, 0.04, 0.08, mats.iron);
        band.rotation.x = Math.PI / 2;
        band.position.y = yOff * b.h;
        barrelGroup.add(band);
      });

      shop.add(barrelGroup);
    });

    // Stacked Exterior Crates (Moved clear of the doorway)
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

    const extLanternGlass = createVoxelBox(0.22, 0.26, 0.22, mats.lanternGlow);
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

      // Body
      const body = createVoxelBox(0.18, 0.14, 0.38, whiteMat);
      gull.add(body);

      // Wings (Spread)
      const leftWing = createVoxelBox(0.42, 0.04, 0.2, greyMat);
      leftWing.position.set(-0.28, 0.04, -0.02);
      leftWing.rotation.z = 0.15;
      gull.add(leftWing);

      const rightWing = createVoxelBox(0.42, 0.04, 0.2, greyMat);
      rightWing.position.set(0.28, 0.04, -0.02);
      rightWing.rotation.z = -0.15;
      gull.add(rightWing);

      // Head & Beak
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
  }

  dispose() {
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

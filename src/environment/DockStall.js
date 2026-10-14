import * as THREE from 'three';

const Palette = {
    skyTop: '#8cb1d1',
    skyHorizon: '#e0cfa4',
    sun: '#ffffff',
    ambientSky: '#7093b1',
    ambientGround: '#9e917d',
    sea: '#4a6f78',
    seaDeep: '#1c343d',
    dockPlank: 0x9b7a5a,
    dockDark: 0x7c5d41,
    woodHi: 0xb58b5e,
    woodMid: 0x785332,
    woodDark: 0x3d2716,
    brass: 0x8a7042,
    rope: 0x8a7c64,
    awningCream: 0xd8d3c5,
    paper: 0xe6e1cc,
    sealRed: 0x7a221f
};

export class DockStall {
  constructor() {
    this.group = new THREE.Group();
    this.gulls = [];
    this.shopCam = null;
    this.lanternLight = null;
    this.signPivot = null;
  }

  build() {
    if (this._isBuilt) return this.group;
    this._isBuilt = true;

    const dockGroup = new THREE.Group();
    dockGroup.position.y = 1.5;
    this.group.add(dockGroup);
            const plankMat = new THREE.MeshStandardMaterial({ color: Palette.dockPlank, roughness: 0.9 });
            const plankDarkMat = new THREE.MeshStandardMaterial({ color: Palette.dockDark, roughness: 0.9 });
            // Dock now runs left-to-right along X, with the shop positioned off to
            // the side (along +Z) rather than sitting in the dock's own path.
            const dockLength = 18, dockWidth = 10, plankCount = 14;
            for (let i = 0; i < plankCount; i++) {
                const plank = new THREE.Mesh(
                    new THREE.BoxGeometry(dockLength / plankCount * 0.9, 0.3, dockWidth),
                    i % 2 === 0 ? plankMat : plankDarkMat
                );
                plank.position.set(-dockLength / 2 + i * (dockLength / plankCount) + dockLength / plankCount / 2, 0.5, 0);
                plank.receiveShadow = true; plank.castShadow = true;
                dockGroup.add(plank);
            }
            const postMat = new THREE.MeshStandardMaterial({ color: Palette.woodDark, roughness: 0.95 });
            [[-8, -4.5], [-8, 4.5], [0, -4.5], [0, 4.5], [8, -4.5], [8, 4.5]].forEach(([x, z]) => {
                const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 5.5, 8), postMat);
                post.position.set(x, -2.05, z);
                post.castShadow = true;
                dockGroup.add(post);
            });

            // ==========================================================================
            // Landmass (Island)
            // ==========================================================================
            const islandGroup = new THREE.Group();
            islandGroup.position.set(-22, 0, 0); 
            this.group.add(islandGroup);

            // Procedural grass/dirt texture
            const grassCanvas = document.createElement('canvas');
            grassCanvas.width = 256; grassCanvas.height = 256;
            const gCtx = grassCanvas.getContext('2d');
            gCtx.fillStyle = '#4a5e3a';
            gCtx.fillRect(0, 0, 256, 256);
            for (let i = 0; i < 400; i++) {
                gCtx.fillStyle = Math.random() > 0.5 ? 'rgba(85,110,65,0.4)' : 'rgba(55,80,45,0.4)';
                gCtx.fillRect(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 12, 4 + Math.random() * 12);
            }
            const grassTex = new THREE.CanvasTexture(grassCanvas);
            grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
            grassTex.repeat.set(4, 4);

            const rockCanvas = document.createElement('canvas');
            rockCanvas.width = 256; rockCanvas.height = 256;
            const rCtx = rockCanvas.getContext('2d');
            rCtx.fillStyle = '#555555';
            rCtx.fillRect(0, 0, 256, 256);
            for (let i = 0; i < 300; i++) {
                rCtx.fillStyle = Math.random() > 0.5 ? 'rgba(100,100,100,0.5)' : 'rgba(60,60,60,0.5)';
                rCtx.beginPath();
                rCtx.arc(Math.random()*256, Math.random()*256, 2 + Math.random()*15, 0, Math.PI*2);
                rCtx.fill();
            }
            const rockTex = new THREE.CanvasTexture(rockCanvas);
            rockTex.wrapS = rockTex.wrapT = THREE.RepeatWrapping;
            rockTex.repeat.set(2, 1);

            const islandTopMat = new THREE.MeshStandardMaterial({ color: 0x99aa77, map: grassTex, roughness: 0.95 });
            const islandSideMat = new THREE.MeshStandardMaterial({ color: 0x888888, map: rockTex, roughness: 0.9 });
            
            // Main body
            const bodyGeo = new THREE.CylinderGeometry(14, 15.5, 8, 32);
            const islandBody = new THREE.Mesh(bodyGeo, [islandSideMat, islandTopMat, islandSideMat]);
            islandBody.position.set(0, -2.2, 0); // Top is at y = 1.8
            islandBody.receiveShadow = true; islandBody.castShadow = true;
            islandGroup.add(islandBody);

            // A slightly higher hill on the far side
            const hillGeo = new THREE.CylinderGeometry(8, 12, 6, 24);
            const hill = new THREE.Mesh(hillGeo, [islandSideMat, islandTopMat, islandSideMat]);
            hill.position.set(-5, 0.5, -4); // Top at y = 3.5
            hill.receiveShadow = true; hill.castShadow = true;
            islandGroup.add(hill);

            // A lower rocky shelf near the water
            const shelfGeo = new THREE.CylinderGeometry(7, 8, 3, 16);
            const shelf = new THREE.Mesh(shelfGeo, islandSideMat); // all rock
            shelf.position.set(10, -3.5, 7); // Top at y = -2
            shelf.receiveShadow = true; shelf.castShadow = true;
            islandGroup.add(shelf);

            // Trees (Pine trees)
            const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2410, roughness: 0.9 });
            const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e4a2a, roughness: 0.8 });
            
            function addTree(x, y, z, scale) {
                const tree = new THREE.Group();
                tree.position.set(x, y, z);
                tree.scale.set(scale, scale, scale);
                
                const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.5, 6), trunkMat);
                trunk.position.y = 0.75;
                trunk.castShadow = true;
                tree.add(trunk);
                
                for(let i=0; i<3; i++) {
                    const leaves = new THREE.Mesh(new THREE.ConeGeometry(2 - i*0.4, 3, 7), leafMat);
                    leaves.position.y = 2.0 + i*1.2;
                    leaves.castShadow = true; leaves.receiveShadow = true;
                    tree.add(leaves);
                }
                islandGroup.add(tree);
            }

            addTree(-2, 1.8, -4, 1.2);
            addTree(-7, 3.5, -6, 1.5);
            addTree(-3, 1.8, -9, 1.0);
            addTree(-10, 3.5, 0, 1.3);
            addTree(1, 1.8, 8, 1.1);
            addTree(5, 1.8, -5, 0.9);

            // Basic Infrastructure: A path from the dock and some crates
            const pathMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 });
            for(let i=0; i<6; i++) {
                const step = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 1.2), pathMat);
                const t = i / 5; // 0 is near dock (y=2.1), 1 is inland (y=1.8)
                const stepY = 2.1 - t * 0.3; 
                step.position.set(13 - i*2, stepY, Math.sin(i)*0.5);
                step.rotation.y = Math.sin(i*2)*0.2;
                step.receiveShadow = true; step.castShadow = true;
                islandGroup.add(step);
            }
            
            const islandCrateMat = new THREE.MeshStandardMaterial({ color: Palette.woodMid, roughness: 0.9 });
            for(let i=0; i<3; i++) {
                const s = 0.8 + Math.random()*0.4;
                const cr = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), islandCrateMat);
                cr.position.set(10 + Math.random()*2, 1.8 + s/2, -3 - Math.random()*2);
                cr.rotation.y = Math.random() * Math.PI;
                cr.castShadow = true; cr.receiveShadow = true;
                islandGroup.add(cr);
            }

            // ==========================================================================
            // Shop stall — a cosy dockside trading post.  Everything hangs off one
            // `shop` group so the whole thing can be repositioned/rotated as a unit.
            // Parent/child hierarchy: shop → cornerPosts, desk, roof, sign rig,
            // exterior props.  The sign pivot is a child of the crossbeam so the
            // sign swings with any crossbeam motion — the relationship the brief
            // asks you to justify.
            // ==========================================================================
            const shop = new THREE.Group();
            shop.position.set(2.1, 2.15, 4);
            shop.rotation.y = -Math.PI;
            this.group.add(shop);

            // Shared dimensions
            const shopW = 6.0, shopD = 5.0, shopH = 5.4;
            const facadeW = shopW, frontZ = shopD / 2, backZ = -shopD / 2;

            // Reusable materials — procedural wood-grain via canvas textures
            function makeWoodTex(baseR, baseG, baseB, grainCount) {
                const c = document.createElement('canvas');
                c.width = 256; c.height = 256;
                const ctx = c.getContext('2d');
                ctx.fillStyle = `rgb(${baseR},${baseG},${baseB})`;
                ctx.fillRect(0, 0, 256, 256);
                for (let i = 0; i < grainCount; i++) {
                    const y = Math.random() * 256;
                    const h = 1 + Math.random() * 3;
                    const shade = Math.floor(baseR * (0.7 + Math.random() * 0.4));
                    ctx.fillStyle = `rgba(${shade},${Math.floor(shade * 0.7)},${Math.floor(shade * 0.4)},${0.15 + Math.random() * 0.25})`;
                    ctx.fillRect(0, y, 256, h);
                }
                // Knots
                for (let i = 0; i < 3; i++) {
                    const kx = Math.random() * 256, ky = Math.random() * 256;
                    ctx.beginPath();
                    ctx.arc(kx, ky, 4 + Math.random() * 8, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(${Math.floor(baseR * 0.5)},${Math.floor(baseG * 0.4)},${Math.floor(baseB * 0.3)},0.4)`;
                    ctx.fill();
                }
                const tex = new THREE.CanvasTexture(c);
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                return tex;
            }

            const woodTexMid = makeWoodTex(90, 58, 32, 40);
            const woodTexHi = makeWoodTex(138, 95, 52, 35);
            const woodTexDark = makeWoodTex(58, 36, 16, 50);
            const plankTex = makeWoodTex(138, 118, 88, 30);

            const facadeMat = new THREE.MeshStandardMaterial({ color: Palette.woodMid, roughness: 0.9, map: woodTexMid });
            const frameMat = new THREE.MeshStandardMaterial({ color: Palette.woodDark, roughness: 0.85, map: woodTexDark });
            const plankMat2 = new THREE.MeshStandardMaterial({ color: Palette.woodHi, roughness: 0.75, map: woodTexHi });
            const brassMat = new THREE.MeshStandardMaterial({ color: Palette.brass, metalness: 0.6, roughness: 0.35 });
            const ropeMat = new THREE.MeshStandardMaterial({ color: Palette.rope, roughness: 0.9 });
            const creamMat = new THREE.MeshStandardMaterial({ color: Palette.awningCream, roughness: 0.8 });

            // -----------------------------------------------------------------------
            // Floor — planked, slightly inset
            // -----------------------------------------------------------------------
            const floor = new THREE.Mesh(
                new THREE.BoxGeometry(shopW - 0.1, 0.15, shopD - 0.1),
                new THREE.MeshStandardMaterial({ color: Palette.dockPlank, roughness: 0.9 })
            );
            floor.position.set(0, 0.07, 0);
            floor.receiveShadow = true;
            shop.add(floor);

            // -----------------------------------------------------------------------
            // Corner posts — four sturdy timbers from floor to roof
            // -----------------------------------------------------------------------
            const cornerGeo = new THREE.BoxGeometry(0.3, shopH, 0.3);
            [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
                const post = new THREE.Mesh(cornerGeo, frameMat);
                post.position.set(sx * (shopW / 2 - 0.15), shopH / 2, sz * (shopD / 2 - 0.15));
                post.castShadow = true;
                shop.add(post);
            });

            // -----------------------------------------------------------------------
            // Walls — back wall (solid planks) + two side walls
            // -----------------------------------------------------------------------
            // Back wall
            const backWall = new THREE.Mesh(
                new THREE.BoxGeometry(shopW, shopH, 0.18), facadeMat
            );
            backWall.position.set(0, shopH / 2, backZ);
            backWall.receiveShadow = true;
            shop.add(backWall);

            // Horizontal trim strips on back wall (weathered plank effect)
            for (let i = 0; i < 4; i++) {
                const strip = new THREE.Mesh(
                    new THREE.BoxGeometry(shopW + 0.04, 0.06, 0.22),
                    frameMat
                );
                strip.position.set(0, 1.0 + i * 1.3, backZ);
                shop.add(strip);
            }

            // Side walls — now with portholes!
            const portholeZ = -0.5; 
            const portholeY = 3.0;
            const portholeR = 0.6;

            const sideShape = new THREE.Shape();
            sideShape.moveTo(-shopD / 2, 0);
            sideShape.lineTo(shopD / 2, 0);
            sideShape.lineTo(shopD / 2, shopH);
            sideShape.lineTo(-shopD / 2, shopH);
            sideShape.lineTo(-shopD / 2, 0);
            
            const hole = new THREE.Path();
            hole.absarc(portholeZ, portholeY, portholeR, 0, Math.PI * 2, false);
            sideShape.holes.push(hole);

            const extrudeSettings = { depth: 0.18, bevelEnabled: false };
            const sideGeo = new THREE.ExtrudeGeometry(sideShape, extrudeSettings);
            
            // Normalize UVs so the texture fits exactly once per wall as it did with BoxGeometry
            const pos = sideGeo.attributes.position;
            const uvs = sideGeo.attributes.uv;
            for (let i = 0; i < uvs.count; i++) {
                let u = (pos.getX(i) + shopD / 2) / shopD;
                let v = pos.getY(i) / shopH;
                uvs.setXY(i, u, v);
            }

            sideGeo.translate(0, 0, -0.09);
            sideGeo.rotateY(-Math.PI / 2);

            const leftWall = new THREE.Mesh(sideGeo, facadeMat);
            leftWall.position.set(-shopW / 2, 0, 0);
            leftWall.castShadow = true; leftWall.receiveShadow = true;
            shop.add(leftWall);

            const rightWall = new THREE.Mesh(sideGeo, facadeMat);
            rightWall.position.set(shopW / 2, 0, 0);
            rightWall.castShadow = true; rightWall.receiveShadow = true;
            shop.add(rightWall);

            // Porthole frames and glass
            [-shopW / 2, shopW / 2].forEach((xPos, i) => {
                const isLeft = i === 0;
                const frame = new THREE.Mesh(new THREE.TorusGeometry(portholeR, 0.06, 16, 32), brassMat);
                frame.rotation.y = Math.PI / 2;
                frame.position.set(isLeft ? xPos + 0.05 : xPos - 0.05, portholeY, portholeZ);
                frame.castShadow = true; frame.receiveShadow = true;
                shop.add(frame);

                const glass = new THREE.Mesh(
                    new THREE.CylinderGeometry(portholeR - 0.02, portholeR - 0.02, 0.04, 32),
                    new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.4, roughness: 0.1, metalness: 0.8 })
                );
                glass.rotation.z = Math.PI / 2;
                glass.position.set(xPos, portholeY, portholeZ);
                shop.add(glass);
            });

            // Plank grooves on side walls (skipping the portholes)
            for (let i = 0; i < 6; i++) {
                const grooveY = 0.8 + i * 0.85;
                [-shopW / 2 - 0.01, shopW / 2 + 0.01].forEach(x => {
                    const dy = Math.abs(grooveY - portholeY);
                    if (dy < portholeR) {
                        const dz = Math.sqrt(portholeR * portholeR - dy * dy);
                        // Back piece
                        const backStart = -shopD / 2;
                        const backEnd = portholeZ - dz;
                        const backLen = backEnd - backStart;
                        if (backLen > 0) {
                            const gBack = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, backLen), frameMat);
                            gBack.position.set(x, grooveY, backStart + backLen / 2);
                            shop.add(gBack);
                        }

                        // Front piece
                        const frontStart = portholeZ + dz;
                        const frontEnd = shopD / 2;
                        const frontLen = frontEnd - frontStart;
                        if (frontLen > 0) {
                            const gFront = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, frontLen), frameMat);
                            gFront.position.set(x, grooveY, frontStart + frontLen / 2);
                            shop.add(gFront);
                        }
                    } else {
                        const groove = new THREE.Mesh(
                            new THREE.BoxGeometry(0.22, 0.03, shopD + 0.02),
                            frameMat
                        );
                        groove.position.set(x, grooveY, 0);
                        shop.add(groove);
                    }
                });
            }

            // Nail heads on back wall trim strips
            const nailMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.5, roughness: 0.6 });
            for (let i = 0; i < 4; i++) {
                [-shopW / 2 + 0.5, -shopW / 2 + 2, shopW / 2 - 0.5, shopW / 2 - 2].forEach(nx => {
                    const nail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.04, 6), nailMat);
                    nail.rotation.x = Math.PI / 2;
                    nail.position.set(nx, 1.0 + i * 1.3, backZ + 0.12);
                    shop.add(nail);
                });
            }

            // -----------------------------------------------------------------------
            // Pitched roof — two sloped planes + ridge beam + rafters
            // -----------------------------------------------------------------------
            const roofGroup = new THREE.Group();
            shop.add(roofGroup);

            const roofOverhang = 0.8;
            const roofW = shopW + roofOverhang * 2;
            const roofSlope = shopD / 2 + roofOverhang;
            const roofPitch = 0.38;                     // radians
            const roofY = shopH + 0.1;
            const roofMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.95 });

            // Left slope
            const slopeGeo = new THREE.BoxGeometry(roofW, 0.12, roofSlope / Math.cos(roofPitch));
            const leftSlope = new THREE.Mesh(slopeGeo, roofMat);
            leftSlope.position.set(0, roofY + Math.sin(roofPitch) * roofSlope * 0.5,
                -roofSlope * 0.5 * Math.cos(roofPitch));
            leftSlope.rotation.x = -roofPitch;
            leftSlope.castShadow = true; leftSlope.receiveShadow = true;
            roofGroup.add(leftSlope);

            // Right slope (mirrored)
            const rightSlope = new THREE.Mesh(slopeGeo, roofMat);
            rightSlope.position.set(0, roofY + Math.sin(roofPitch) * roofSlope * 0.5,
                roofSlope * 0.5 * Math.cos(roofPitch));
            rightSlope.rotation.x = roofPitch;
            rightSlope.castShadow = true; rightSlope.receiveShadow = true;
            roofGroup.add(rightSlope);

            // Ridge beam
            const ridge = new THREE.Mesh(
                new THREE.BoxGeometry(roofW + 0.2, 0.2, 0.2), frameMat
            );
            ridge.position.set(0, roofY + Math.sin(roofPitch) * roofSlope, 0);
            ridge.castShadow = true;
            roofGroup.add(ridge);

            // Rafters — exposed beams under the roof
            const rafterGeo = new THREE.BoxGeometry(0.12, 0.12, shopD + roofOverhang * 2);
            for (let i = 0; i < 5; i++) {
                const rafter = new THREE.Mesh(rafterGeo, frameMat);
                const rx = -shopW / 2 + 0.6 + i * (shopW - 1.2) / 4;
                rafter.position.set(rx, roofY - 0.1, 0);
                rafter.castShadow = true;
                roofGroup.add(rafter);
            }

            // -----------------------------------------------------------------------
            // Serving counter — wider than the old desk, with overhang to the front
            // -----------------------------------------------------------------------
            const deskGroup = new THREE.Group();
            shop.add(deskGroup);

            const deskW = shopW - 0.8, deskD = 1.8;
            const counterY = 2.0;

            // Legs
            const legMat = new THREE.MeshStandardMaterial({ color: Palette.woodHi, roughness: 0.8 });
            const legGeo = new THREE.BoxGeometry(0.22, counterY, 0.22);
            [[-deskW / 2 + 0.15, frontZ - 0.4], [deskW / 2 - 0.15, frontZ - 0.4],
            [-deskW / 2 + 0.15, frontZ - deskD + 0.2], [deskW / 2 - 0.15, frontZ - deskD + 0.2]
            ].forEach(([x, z]) => {
                const leg = new THREE.Mesh(legGeo, legMat);
                leg.position.set(x, counterY / 2, z);
                leg.castShadow = true;
                deskGroup.add(leg);
            });

            // Shelves (two interior shelves)
            const shelfMat = new THREE.MeshStandardMaterial({ color: Palette.woodMid, roughness: 0.85 });
            [0.75, 1.5].forEach(y => {
                const shelf = new THREE.Mesh(new THREE.BoxGeometry(deskW, 0.10, deskD - 0.3), shelfMat);
                shelf.position.set(0, y, frontZ - deskD / 2 - 0.05);
                shelf.castShadow = true; shelf.receiveShadow = true;
                deskGroup.add(shelf);
            });

            // Counter top + brass trim
            const topMat = new THREE.MeshStandardMaterial({ color: Palette.woodHi, roughness: 0.65, map: woodTexHi });
            const top = new THREE.Mesh(new THREE.BoxGeometry(deskW + 0.3, 0.16, deskD + 0.4), topMat);
            top.position.set(0, counterY, frontZ - deskD / 2 + 0.15);
            top.castShadow = true; top.receiveShadow = true;
            deskGroup.add(top);

            const trim = new THREE.Mesh(new THREE.BoxGeometry(deskW + 0.3, 0.04, deskD + 0.4), brassMat);
            trim.position.set(0, counterY + 0.1, frontZ - deskD / 2 + 0.15);
            deskGroup.add(trim);

            // Front apron panel under counter (hides the legs from the customer)
            const apronMat = new THREE.MeshStandardMaterial({ color: Palette.woodMid, roughness: 0.9, map: woodTexMid });
            const apron = new THREE.Mesh(
                new THREE.BoxGeometry(deskW, counterY - 0.1, 0.12), apronMat
            );
            apron.position.set(0, counterY / 2, frontZ - 0.15);
            apron.receiveShadow = true;
            deskGroup.add(apron);

            // -----------------------------------------------------------------------
            // Counter-top props — positioned around the edges, centre kept clear
            // -----------------------------------------------------------------------
            // Far-left: open ledger book
            const ledger = new THREE.Mesh(
                new THREE.BoxGeometry(0.55, 0.08, 0.4),
                new THREE.MeshStandardMaterial({ color: Palette.paper })
            );
            ledger.position.set(-deskW / 2 + 0.5, 0.12, 0.3);
            ledger.rotation.y = 0.1;
            ledger.castShadow = true;
            top.add(ledger);
            // Quill in inkpot next to ledger
            const inkpot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 8),
                new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 }));
            inkpot.position.set(-deskW / 2 + 0.9, 0.12, 0.35);
            inkpot.castShadow = true;
            top.add(inkpot);
            const quill = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.005, 0.25, 4),
                new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
            quill.position.set(0, 0.12, 0);
            quill.rotation.z = -0.5;
            inkpot.add(quill);

            // Left side: stack of coins
            for (let i = 0; i < 4; i++) {
                const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 10), brassMat);
                coin.position.set(-deskW / 2 + 0.4, 0.09 + i * 0.016, -0.2);
                coin.castShadow = true;
                top.add(coin);
            }

            // Left-back: money pouch (a small soft sphere)
            const pouchMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.9 });
            const pouch = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), pouchMat);
            pouch.scale.set(1, 0.7, 1);
            pouch.position.set(-deskW / 2 + 0.6, 0.1, -0.4);
            pouch.castShadow = true;
            top.add(pouch);
            // Drawstring
            const drawstring = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 4), ropeMat);
            drawstring.position.set(0, 0.08, 0);
            drawstring.rotation.z = 0.8;
            pouch.add(drawstring);

            // Right side: weighing scale
            const weighScale = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.18, 12), brassMat);
            weighScale.position.set(deskW / 2 - 0.6, 0.13, 0.15);
            weighScale.castShadow = true;
            top.add(weighScale);
            const scaleArm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.04), brassMat);
            scaleArm.position.set(deskW / 2 - 0.6, 0.24, 0.15);
            top.add(scaleArm);
            [deskW / 2 - 0.85, deskW / 2 - 0.35].forEach(x => {
                const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 10), brassMat);
                pan.position.set(x, 0.2, 0.15);
                top.add(pan);
            });

            // Far-right: lantern
            const lanternGroup = new THREE.Group();
            lanternGroup.position.set(deskW / 2 - 0.2, 0.22, -0.3);
            top.add(lanternGroup);
            const lantern = new THREE.Mesh(
                new THREE.BoxGeometry(0.22, 0.36, 0.22),
                new THREE.MeshStandardMaterial({ color: Palette.woodDark, emissive: 0xffcc77, emissiveIntensity: 0.5 })
            );
            lanternGroup.add(lantern);
            const glowMat = new THREE.MeshStandardMaterial({ color: 0xffdd99, emissive: 0xffaa44, emissiveIntensity: 0.7, transparent: true, opacity: 0.6 });
            [[-0.12, 0], [0.12, 0], [0, -0.12], [0, 0.12]].forEach(([dx, dz]) => {
                const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.28), glowMat);
                pane.position.set(dx, 0, dz);
                pane.lookAt(new THREE.Vector3(dx * 2, 0, dz * 2));
                lanternGroup.add(pane);
            });
            const lanternLight = new THREE.PointLight(0xffcc77, 2.8, 8, 2);
            lanternLight.position.set(0, 0.3, 0);
            lanternLight.castShadow = true;
            lanternGroup.add(lanternLight);
            this.lanternLight = lanternLight;

            // Right-front corner: rope coil
            const ropeCoil = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 8, 16), ropeMat);
            ropeCoil.rotation.x = Math.PI / 2;
            ropeCoil.position.set(deskW / 2 - 0.3, 0.1, 0.5);
            top.add(ropeCoil);

            // Small bell on counter edge (right side)
            const bellMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.7, roughness: 0.3 });
            const bell = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), bellMat);
            bell.scale.y = 0.7;
            bell.position.set(deskW / 2 - 1.2, 0.11, 0.55);
            bell.castShadow = true;
            top.add(bell);
            const bellBase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 8), bellMat);
            bellBase.position.set(0, -0.04, 0);
            bell.add(bellBase);

            // -----------------------------------------------------------------------
            // Shelf goods — rich variety on both shelves
            // -----------------------------------------------------------------------
            const bottleColors = [0x3d6b4f, 0x2a5a8b, 0x6b3d3d, 0x4a6b3d, 0x5a3d6b];
            const bottleMat2 = col => new THREE.MeshStandardMaterial({ color: col, roughness: 0.25, transparent: true, opacity: 0.85 });

            // Lower shelf: varied bottles with cork stoppers
            for (let i = 0; i < 7; i++) {
                const h = 0.24 + Math.random() * 0.14;
                const r = 0.05 + Math.random() * 0.03;
                const bottle = new THREE.Mesh(
                    new THREE.CylinderGeometry(r * 0.7, r, h, 8),
                    bottleMat2(bottleColors[i % bottleColors.length])
                );
                bottle.position.set(-deskW / 2 + 0.35 + i * 0.32, 0.75 + h / 2, frontZ - deskD / 2 - 0.05);
                bottle.castShadow = true;
                deskGroup.add(bottle);
                // Cork stopper
                const cork = new THREE.Mesh(
                    new THREE.CylinderGeometry(r * 0.5, r * 0.6, 0.04, 6),
                    new THREE.MeshStandardMaterial({ color: 0xc4a56e, roughness: 0.8 })
                );
                cork.position.set(0, h / 2 + 0.02, 0);
                bottle.add(cork);
            }

            // Upper shelf: jars with labels, burlap sacks, rolled scrolls, small crate
            const jarMat = new THREE.MeshStandardMaterial({ color: 0x8b6d4a, roughness: 0.6 });
            const labelMat = new THREE.MeshStandardMaterial({ color: Palette.paper, roughness: 0.5 });

            for (let i = 0; i < 4; i++) {
                const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 8), jarMat);
                jar.position.set(deskW / 2 - 0.35 - i * 0.38, 1.61, frontZ - deskD / 2 - 0.05);
                jar.castShadow = true;
                deskGroup.add(jar);
                const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 8), brassMat);
                lid.position.set(0, 0.12, 0);
                jar.add(lid);
                // Paper label
                const label = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.08), labelMat);
                label.position.set(0, 0, 0.101);
                jar.add(label);
            }

            // Burlap sacks (spices/grain)
            const sackMat = new THREE.MeshStandardMaterial({ color: 0xa08860, roughness: 0.95 });
            [{ x: -deskW / 2 + 0.4, s: 0.16 }, { x: -deskW / 2 + 0.75, s: 0.13 }].forEach(({ x, s }) => {
                const sack = new THREE.Mesh(new THREE.SphereGeometry(s, 6, 5), sackMat);
                sack.scale.set(1, 0.75, 0.9);
                sack.position.set(x, 1.55 + s * 0.7, frontZ - deskD / 2 - 0.05);
                sack.castShadow = true;
                deskGroup.add(sack);
            });

            // Rolled scrolls / maps
            const scrollMat = new THREE.MeshStandardMaterial({ color: 0xd4c9a0, roughness: 0.7 });
            [0.4, 0.7].forEach((x, i) => {
                const scroll = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.04, 0.04, 0.3 + i * 0.1, 8), scrollMat
                );
                scroll.rotation.z = Math.PI / 2;
                scroll.rotation.y = 0.2 + i * 0.3;
                scroll.position.set(x, 1.56, frontZ - deskD / 2 - 0.05);
                scroll.castShadow = true;
                deskGroup.add(scroll);
            });

            // Small crate on upper shelf
            const shelfCrate = new THREE.Mesh(
                new THREE.BoxGeometry(0.4, 0.25, 0.3),
                new THREE.MeshStandardMaterial({ color: Palette.woodHi, roughness: 0.9, map: woodTexHi })
            );
            shelfCrate.position.set(1.3, 1.62, frontZ - deskD / 2 - 0.05);
            shelfCrate.rotation.y = 0.15;
            shelfCrate.castShadow = true;
            deskGroup.add(shelfCrate);

            // -----------------------------------------------------------------------
            // Back-wall decor — hanging items visible from inside
            // -----------------------------------------------------------------------
            // Fishing net draped on back wall
            const netMat = new THREE.MeshStandardMaterial({ color: 0x8a8a6a, roughness: 0.9, wireframe: true });
            const net = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.5, 6, 6), netMat);
            net.position.set(-1.2, 3.8, backZ + 0.12);
            shop.add(net);

            // Hanging fish (trophy catch!)
            const fishMat = new THREE.MeshStandardMaterial({ color: 0x7a9aaa, roughness: 0.5, metalness: 0.1 });
            const fishBody = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.15, 0.6, 8), fishMat
            );
            fishBody.rotation.z = Math.PI / 2;
            fishBody.position.set(1.5, 3.6, backZ + 0.18);
            shop.add(fishBody);
            // Tail
            const tail = new THREE.Mesh(
                new THREE.BoxGeometry(0.02, 0.25, 0.15), fishMat
            );
            tail.position.set(0.35, 0, 0);
            tail.rotation.z = 0.3;
            fishBody.add(tail);

            // -----------------------------------------------------------------------
            // Sign rig — crossbeam + hanging sign with wax seal
            // -----------------------------------------------------------------------
            const rigging = new THREE.Group();
            shop.add(rigging);

            // The crossbeam sits just under the roof, spanning the front opening
            const crossbeam = new THREE.Mesh(
                new THREE.BoxGeometry(shopW + 0.4, 0.22, 0.28), shelfMat
            );
            crossbeam.position.set(0, shopH - 0.3, frontZ + 0.3);
            crossbeam.castShadow = true;
            rigging.add(crossbeam);

            // Bracket supports under crossbeam
            [-shopW / 2 + 0.3, shopW / 2 - 0.3].forEach(x => {
                const bracket = new THREE.Mesh(
                    new THREE.BoxGeometry(0.12, 0.5, 0.12), frameMat
                );
                bracket.position.set(x, -0.35, 0);
                bracket.castShadow = true;
                crossbeam.add(bracket);
                // Diagonal brace
                const brace = new THREE.Mesh(
                    new THREE.BoxGeometry(0.08, 0.55, 0.08), frameMat
                );
                brace.position.set(x > 0 ? -0.2 : 0.2, -0.3, -0.15);
                brace.rotation.z = x > 0 ? 0.6 : -0.6;
                crossbeam.add(brace);
            });

            // signPivot is a child of crossbeam — rotating the pivot swings the
            // sign and ropes together, inheriting any crossbeam transform.
            const signPivot = new THREE.Group();
            signPivot.position.set(0, -0.12, 0.15);
            crossbeam.add(signPivot);

            // Hanging ropes
            const ropeGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.55, 6);
            const ropeL = new THREE.Mesh(ropeGeo, ropeMat);
            ropeL.position.set(-0.85, -0.28, 0);
            signPivot.add(ropeL);
            const ropeR = new THREE.Mesh(ropeGeo, ropeMat);
            ropeR.position.set(0.85, -0.28, 0);
            signPivot.add(ropeR);

            // Sign board
            const sign = new THREE.Mesh(
                new THREE.BoxGeometry(2.4, 0.75, 0.08),
                new THREE.MeshStandardMaterial({ color: Palette.woodHi, roughness: 0.6 })
            );
            sign.position.set(0, -0.9, 0);
            sign.castShadow = true;
            signPivot.add(sign);

            // Wax seal on sign
            const seal = new THREE.Mesh(
                new THREE.CylinderGeometry(0.12, 0.12, 0.03, 12),
                new THREE.MeshStandardMaterial({ color: Palette.sealRed, roughness: 0.4 })
            );
            seal.rotation.x = Math.PI / 2;
            seal.position.set(0.7, -0.1, 0.05);
            sign.add(seal);

            // Sign border trim
            const signTrim = new THREE.Mesh(
                new THREE.BoxGeometry(2.5, 0.82, 0.04), frameMat
            );
            signTrim.position.set(0, 0, -0.04);
            sign.add(signTrim);

            // -----------------------------------------------------------------------
            // Exterior props — barrels, crates, mooring cleats, rope on post
            // -----------------------------------------------------------------------
            // Barrels next to the shop (children of shop, so they move with it)
            const barrelMat = new THREE.MeshStandardMaterial({ color: 0x6d4c2a, roughness: 0.85 });
            const barrelBandMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.4, roughness: 0.6 });

            [{ x: -shopW / 2 - 0.7, z: -0.5, h: 1.2, r: 0.35 },
            { x: -shopW / 2 - 0.6, z: 0.6, h: 1.0, r: 0.3 },
            { x: shopW / 2 + 0.7, z: -0.8, h: 1.3, r: 0.38 }
            ].forEach(b => {
                const barrel = new THREE.Mesh(
                    new THREE.CylinderGeometry(b.r * 0.9, b.r, b.h, 12), barrelMat
                );
                barrel.position.set(b.x, b.h / 2, b.z);
                barrel.castShadow = true;
                shop.add(barrel);
                // Metal bands
                [-0.3, 0, 0.3].forEach(yOff => {
                    const band = new THREE.Mesh(
                        new THREE.TorusGeometry(b.r * 0.92, 0.02, 6, 16), barrelBandMat
                    );
                    band.rotation.x = Math.PI / 2;
                    band.position.set(b.x, b.h / 2 + yOff * b.h / 1.2, b.z);
                    shop.add(band);
                });
            });

            // Stacked crates beside shop
            const crateMat = new THREE.MeshStandardMaterial({ color: Palette.woodHi, roughness: 0.9 });
            const crate1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.7), crateMat);
            crate1.position.set(shopW / 2 + 0.7, 0.3, 0.8);
            crate1.rotation.y = 0.15;
            crate1.castShadow = true;
            shop.add(crate1);

            const crate2 = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.5, 0.55), crateMat);
            crate2.position.set(shopW / 2 + 0.6, 0.85, 0.85);
            crate2.rotation.y = -0.3;
            crate2.castShadow = true;
            shop.add(crate2);

            // Rope coils hanging on the right side wall
            [1.5, 2.8].forEach(y => {
                const hangRope = new THREE.Mesh(
                    new THREE.TorusGeometry(0.22, 0.05, 8, 16), ropeMat
                );
                hangRope.rotation.z = Math.PI / 2;
                hangRope.position.set(shopW / 2 + 0.1, y, -0.4);
                shop.add(hangRope);
            });

            // Mooring cleats on the front posts
            [-shopW / 2 + 0.15, shopW / 2 - 0.15].forEach(x => {
                const cleat = new THREE.Mesh(
                    new THREE.BoxGeometry(0.3, 0.08, 0.12), brassMat
                );
                cleat.position.set(x, 1.0, frontZ + 0.08);
                shop.add(cleat);
                // Vertical peg
                const peg = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.03, 0.03, 0.14, 6), brassMat
                );
                peg.position.set(0, 0.1, 0);
                cleat.add(peg);
            });

            // -----------------------------------------------------------------------
            // Exterior bracket lantern — hung from the right corner post
            // -----------------------------------------------------------------------
            const extLanternGroup = new THREE.Group();
            extLanternGroup.position.set(shopW / 2 + 0.3, 3.5, frontZ);
            shop.add(extLanternGroup);

            // Bracket arm
            const bracketArm = new THREE.Mesh(
                new THREE.BoxGeometry(0.6, 0.08, 0.08), frameMat
            );
            bracketArm.position.set(0.15, 0, 0);
            extLanternGroup.add(bracketArm);

            // Hanging chain
            const chain = new THREE.Mesh(
                new THREE.CylinderGeometry(0.015, 0.015, 0.45, 6), barrelBandMat
            );
            chain.position.set(0.4, -0.25, 0);
            extLanternGroup.add(chain);

            // Lantern body
            const extLantern = new THREE.Mesh(
                new THREE.BoxGeometry(0.2, 0.3, 0.2),
                new THREE.MeshStandardMaterial({ color: Palette.woodDark, emissive: 0xffaa44, emissiveIntensity: 0.5 })
            );
            extLantern.position.set(0.4, -0.6, 0);
            extLanternGroup.add(extLantern);

            // Exterior lantern light
            const extLight = new THREE.PointLight(0xffaa44, 0.6, 6, 2);
            extLight.position.set(0.4, -0.4, 0);
            extLanternGroup.add(extLight);


            // ==========================================================================
            // Gulls — tiny bobbing marks up in the sky
            // ==========================================================================
            function makeGull() {
                const g = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 4), new THREE.MeshStandardMaterial({ color: 0x1e1a16 }));
                g.rotation.z = Math.PI / 2;
                return g;
            }
            const gulls = [
                { mesh: makeGull(), baseX: -6, baseY: 9, phase: 0 },
                { mesh: makeGull(), baseX: 2, baseY: 10, phase: 1.7 },
                { mesh: makeGull(), baseX: 8, baseY: 8.5, phase: 3.1 },
            ];
            gulls.forEach(g => this.group.add(g.mesh));
    this.gulls = gulls; // save array for updates
    this.group.add(dockGroup);
    this.group.add(islandGroup);
    this.group.add(shop);
    // Add gulls to main group instead of scene
    gulls.forEach(g => this.group.add(g.mesh));

    this.lanternLight = lanternLight;
    this.signPivot = signPivot;
    
    // Create the shopkeeper camera relative to the shop
    this.shopCam = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 500);
    this.shopCam.position.set(0, 3.6, -1.2); 
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
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
                child.material.forEach(m => {
                    if (m.map) m.map.dispose();
                    m.dispose();
                });
            } else {
                if (child.material.map) child.material.map.dispose();
                child.material.dispose();
            }
        }
    });
  }
}

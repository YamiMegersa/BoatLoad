import * as THREE from 'three';

/**
 * NauticalChartRenderer — Core Cartography Engine for authentic paper sea charts.
 *
 * Provides historical nautical chart styling (parchment texture, graticule grid,
 * bathymetric contours, topographic landmasses, and standard maritime hazard symbology).
 * Used by both PreSailChartModal (full tactical course briefing) and Minimap (in-game local chart).
 */
export class NauticalChartRenderer {
  static _sharedSnapshot = null;

  static get sharedSnapshot() {
    return NauticalChartRenderer._sharedSnapshot;
  }

  static set sharedSnapshot(snapshot) {
    NauticalChartRenderer._sharedSnapshot = snapshot;
  }

  constructor() {
    this._paperPattern = null;
    this._terrainCache = new Map();
    this._cachedTerrainCanvas = null;
    this._cachedTerrainBounds = null;
  }

  // ---------------------------------------------------------------------------
  // Paper Substrate & Cartographic Decoration
  // ---------------------------------------------------------------------------

  /**
   * Generates or fetches a procedural antique parchment pattern.
   * @param {CanvasRenderingContext2D} ctx
   */
  getPaperPattern(ctx) {
    if (this._paperPattern) return this._paperPattern;

    if (typeof document === 'undefined') return null;

    const size = 128;
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const octx = off.getContext('2d');
    if (!octx) return null;

    // Base parchment tone
    octx.fillStyle = '#f4ecd8';
    octx.fillRect(0, 0, size, size);

    // Subtle paper fibers and watercolor mottling
    const imgData = octx.getImageData(0, 0, size, size);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const n = (Math.random() - 0.5) * 14;
      data[i] = Math.min(255, Math.max(0, data[i] + n + 4));        // R
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n));    // G
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n - 8));// B
    }
    octx.putImageData(imgData, 0, 0);

    // Faint water stain rings
    octx.strokeStyle = 'rgba(180, 150, 110, 0.08)';
    octx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      octx.beginPath();
      octx.arc(Math.random() * size, Math.random() * size, 20 + Math.random() * 40, 0, Math.PI * 2);
      octx.stroke();
    }

    if (ctx && typeof ctx.createPattern === 'function') {
      this._paperPattern = ctx.createPattern(off, 'repeat');
    }
    return this._paperPattern;
  }

  /**
   * Fills the canvas with weathered parchment and aged vignette.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} width
   * @param {number} height
   */
  drawParchmentBackground(ctx, width, height) {
    ctx.save();
    const pat = this.getPaperPattern(ctx);
    if (pat) {
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.fillStyle = '#f4ecd8';
      ctx.fillRect(0, 0, width, height);
    }

    // Aged perimeter vignette
    const rx = width * 0.5;
    const ry = height * 0.5;
    const maxR = Math.max(rx, ry);
    const vig = ctx.createRadialGradient(rx, ry, maxR * 0.45, rx, ry, maxR * 1.05);
    vig.addColorStop(0, 'rgba(120, 85, 45, 0.0)');
    vig.addColorStop(0.75, 'rgba(140, 95, 50, 0.15)');
    vig.addColorStop(1, 'rgba(90, 55, 25, 0.38)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  /**
   * Draws double-line vintage map border with tick marks and filigree corners.
   */
  drawChartBorder(ctx, width, height, inset = 14) {
    ctx.save();
    ctx.strokeStyle = '#4a3319';
    ctx.lineWidth = 2.0;

    // Outer neatline
    ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);

    // Inner hairline
    ctx.lineWidth = 1.0;
    ctx.strokeStyle = 'rgba(74, 51, 25, 0.55)';
    ctx.strokeRect(inset + 4, inset + 4, width - (inset + 4) * 2, height - (inset + 4) * 2);

    // Corner decorative brackets
    const cSize = 10;
    const corners = [
      [inset + 4, inset + 4, 1, 1],
      [width - inset - 4, inset + 4, -1, 1],
      [inset + 4, height - inset - 4, 1, -1],
      [width - inset - 4, height - inset - 4, -1, -1]
    ];
    ctx.fillStyle = '#4a3319';
    for (const [cx, cy, sx, sy] of corners) {
      ctx.fillRect(cx, cy, sx * cSize, sy * 2);
      ctx.fillRect(cx, cy, sx * 2, sy * cSize);
    }

    ctx.restore();
  }

  /**
   * Draws nautical graticule grid lines (faint latitude & longitude).
   */
  drawGraticule(ctx, width, height, step = 64) {
    ctx.save();
    ctx.strokeStyle = 'rgba(100, 75, 45, 0.12)';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([4, 4]);

    for (let x = step; x < width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = step; y < height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Draws an authentic 8-point nautical compass rose.
   */
  drawCompassRose(ctx, cx, cy, radius = 32, rotation = 0) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);

    // Outer dial circle
    ctx.strokeStyle = 'rgba(74, 51, 25, 0.6)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
    ctx.stroke();

    // 8 points
    const points = 8;
    for (let i = 0; i < points; i++) {
      const angle = (i * Math.PI * 2) / points;
      const isCardinal = i % 2 === 0;
      const len = isCardinal ? radius * 0.95 : radius * 0.65;
      const w = isCardinal ? 4.5 : 2.5;

      ctx.save();
      ctx.rotate(angle);

      // Half shaded in dark ink, half in gold/tan
      ctx.fillStyle = isCardinal && i === 0 ? '#8b2512' : '#3d2b1b'; // North point is reddish-brown
      ctx.beginPath();
      ctx.moveTo(0, -len);
      ctx.lineTo(-w, 0);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#cbb286';
      ctx.beginPath();
      ctx.moveTo(0, -len);
      ctx.lineTo(w, 0);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }

    // Cardinal letters
    ctx.font = 'bold 10px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#8b2512';
    ctx.fillText('N', 0, -radius - 9);
    ctx.fillStyle = '#3d2b1b';
    ctx.fillText('S', 0, radius + 9);
    ctx.fillText('E', radius + 9, 0);
    ctx.fillText('W', -radius - 9, 0);

    // Center pivot boss
    ctx.fillStyle = '#4a3319';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Top-Down Map Capture & Cartographic Filter Engine
  // ---------------------------------------------------------------------------

  /**
   * Captures a high-fidelity top-down render of the 3D scene using an Orthographic camera,
   * applies authentic nautical cartography filters (coastline edge extraction, shallow-water
   * bathymetric halo, topographic elevation relief, and antique paper blending), and caches
   * the result for instantaneous, zero-overhead rendering in both the Pre-Sail briefing and
   * the in-game Minimap.
   *
   * @param {object} params
   * @param {THREE.WebGLRenderer} params.renderer
   * @param {THREE.Scene} params.scene
   * @param {object} [params.voxelTerrain]
   * @param {Array} [params.obstacles]
   * @param {object} [params.dockStall]
   * @param {boolean} [params.hasDock]
   * @param {object} [params.endLocation]
   * @param {{ x: number, z: number }} [params.playerPos]
   * @param {number} [params.resolution]
   * @returns {{ canvas: HTMLCanvasElement, worldBounds: object }|null}
   */
  captureTopDownMap({
    renderer,
    scene,
    voxelTerrain = null,
    obstacles = [],
    dockStall = null,
    hasDock = true,
    endLocation = null,
    playerPos = { x: 0, z: 0 },
    resolution = 512
  }) {
    if (!renderer || !scene || typeof document === 'undefined') {
      const fallback = this.bakeVoxelTerrainFallback(voxelTerrain, obstacles, { playerPos, endLocation, hasDock, dockStall });
      if (fallback) {
        this._cachedTerrainCanvas = fallback.canvas;
        this._cachedTerrainBounds = fallback.worldBounds;
        NauticalChartRenderer.sharedSnapshot = fallback;
      }
      return fallback;
    }

    // 1. Calculate world bounding box containing all terrain, islands, rocks, dock, and course endpoints
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    const pX = playerPos?.x ?? 0;
    const pZ = playerPos?.z ?? 0;
    minX = Math.min(minX, pX - 35);
    maxX = Math.max(maxX, pX + 35);
    minZ = Math.min(minZ, pZ - 35);
    maxZ = Math.max(maxZ, pZ + 35);

    if (endLocation && endLocation.position) {
      const gX = endLocation.position.x;
      const gZ = endLocation.position.z;
      minX = Math.min(minX, gX - 45);
      maxX = Math.max(maxX, gX + 45);
      minZ = Math.min(minZ, gZ - 45);
      maxZ = Math.max(maxZ, gZ + 45);
    }

    // Voxel terrain bounding
    if (voxelTerrain && voxelTerrain.meshGroup) {
      const vBox = new THREE.Box3().setFromObject(voxelTerrain.meshGroup);
      if (!vBox.isEmpty()) {
        minX = Math.min(minX, vBox.min.x);
        maxX = Math.max(maxX, vBox.max.x);
        minZ = Math.min(minZ, vBox.min.z);
        maxZ = Math.max(maxZ, vBox.max.z);
      }
    } else if (voxelTerrain && voxelTerrain.chunks && voxelTerrain.chunks.size > 0) {
      const CHUNK_SIZE = 32;
      for (const key of voxelTerrain.chunks.keys()) {
        const [cx, cz] = key.split(',').map(Number);
        minX = Math.min(minX, cx * CHUNK_SIZE);
        maxX = Math.max(maxX, (cx + 1) * CHUNK_SIZE);
        minZ = Math.min(minZ, cz * CHUNK_SIZE);
        maxZ = Math.max(maxZ, (cz + 1) * CHUNK_SIZE);
      }
    }

    // Islands and rocks bounds
    for (const obs of obstacles) {
      if (!obs || !obs.mesh) continue;
      if (obs.type === 'island' || obs.type === 'rock') {
        const oBox = new THREE.Box3().setFromObject(obs.mesh);
        if (!oBox.isEmpty()) {
          minX = Math.min(minX, oBox.min.x);
          maxX = Math.max(maxX, oBox.max.x);
          minZ = Math.min(minZ, oBox.min.z);
          maxZ = Math.max(maxZ, oBox.max.z);
        } else {
          const ox = obs.mesh.position.x;
          const oz = obs.mesh.position.z;
          const s = (obs.scale || 1.0) * (obs.type === 'island' ? 45 : 12);
          minX = Math.min(minX, ox - s);
          maxX = Math.max(maxX, ox + s);
          minZ = Math.min(minZ, oz - s);
          maxZ = Math.max(maxZ, oz + s);
        }
      }
    }

    // Harbor dock bounds
    if (hasDock) {
      if (dockStall && dockStall.group) {
        const dBox = new THREE.Box3().setFromObject(dockStall.group);
        if (!dBox.isEmpty()) {
          minX = Math.min(minX, dBox.min.x);
          maxX = Math.max(maxX, dBox.max.x);
          minZ = Math.min(minZ, dBox.min.z);
          maxZ = Math.max(maxZ, dBox.max.z);
        }
      }
      minX = Math.min(minX, -75);
      maxX = Math.max(maxX, 25);
      minZ = Math.min(minZ, -40);
      maxZ = Math.max(maxZ, 35);
    }

    if (minX === Infinity) {
      minX = -120;
      maxX = 120;
      minZ = -260;
      maxZ = 60;
    }

    const marginMeters = 30;
    minX -= marginMeters;
    maxX += marginMeters;
    minZ -= marginMeters;
    maxZ += marginMeters;

    const spanX = Math.max(120, maxX - minX);
    const spanZ = Math.max(120, maxZ - minZ);
    const maxSpan = Math.max(spanX, spanZ);

    const centerX = (minX + maxX) * 0.5;
    const centerZ = (minZ + maxZ) * 0.5;
    const halfSpan = maxSpan * 0.5;

    const bounds = {
      minX: centerX - halfSpan,
      maxX: centerX + halfSpan,
      minZ: centerZ - halfSpan,
      maxZ: centerZ + halfSpan,
      spanX: halfSpan * 2,
      spanZ: halfSpan * 2,
      centerX,
      centerZ
    };

    // 2. Setup Orthographic Camera looking straight down (+X = East/Right, -Z = North/Up)
    const cam = new THREE.OrthographicCamera(
      -halfSpan, halfSpan,
      halfSpan, -halfSpan,
      10, 1000
    );
    cam.position.set(centerX, 500, centerZ);
    cam.up.set(0, 0, -1);
    cam.lookAt(centerX, 0, centerZ);
    cam.updateProjectionMatrix();

    // 3. Allowlist Visibility Isolation
    // Temporarily disable scene.background and scene.fog to guarantee transparent sea background
    const prevBackground = scene.background;
    const prevFog = scene.fog;
    scene.background = null;
    scene.fog = null;

    // Save initial visibility of all direct children
    const savedVisibility = new Map();
    for (const child of scene.children) {
      savedVisibility.set(child, child.visible);
      child.visible = false;
    }

    // Identify allowed roots: voxel terrain, islands, rocks, and dock stall
    const allowedRoots = new Set();
    if (voxelTerrain && voxelTerrain.meshGroup) {
      allowedRoots.add(voxelTerrain.meshGroup);
    }
    if (hasDock && dockStall && dockStall.group) {
      allowedRoots.add(dockStall.group);
    }
    for (const obs of obstacles) {
      if (obs && obs.mesh && (obs.type === 'island' || obs.type === 'rock')) {
        allowedRoots.add(obs.mesh);
      }
    }

    // Enable allowed objects and all their parent ancestors
    for (const root of allowedRoots) {
      let curr = root;
      while (curr && curr !== scene) {
        curr.visible = true;
        curr = curr.parent;
      }
      root.traverse(child => {
        if (child.isMesh) child.visible = true;
      });
    }

    // Dedicated cartographic lighting (authentic Northwest illumination, azimuth 315°)
    const cartoAmbient = new THREE.AmbientLight(0xffffff, 1.4);
    const cartoSun = new THREE.DirectionalLight(0xffffff, 0.9);
    cartoSun.position.set(-150, 450, -150);
    scene.add(cartoAmbient);
    scene.add(cartoSun);

    scene.updateMatrixWorld(true);

    const renderTarget = new THREE.WebGLRenderTarget(resolution, resolution, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false
    });

    const prevTarget = renderer.getRenderTarget();
    const prevClearColor = new THREE.Color();
    renderer.getClearColor(prevClearColor);
    const prevClearAlpha = renderer.getClearAlpha();

    try {
      renderer.setRenderTarget(renderTarget);
      renderer.setClearColor(0x000000, 0.0);
      renderer.clear(true, true, true);
      renderer.render(scene, cam);

      const pixels = new Uint8Array(resolution * resolution * 4);
      renderer.readRenderTargetPixels(renderTarget, 0, 0, resolution, resolution, pixels);

      const filteredCanvas = this.applyNauticalFilters(pixels, resolution, resolution);
      if (!filteredCanvas) {
        throw new Error('Top-down map capture rejected: invalid land coverage.');
      }

      const result = {
        canvas: filteredCanvas,
        worldBounds: bounds
      };

      this._cachedTerrainCanvas = filteredCanvas;
      this._cachedTerrainBounds = bounds;
      NauticalChartRenderer.sharedSnapshot = result;

      return result;
    } catch (err) {
      console.warn('[NauticalChartRenderer] WebGL map capture fallback engaged:', err.message || err);
      const fallback = this.bakeVoxelTerrainFallback(voxelTerrain, obstacles, { playerPos, endLocation, hasDock, dockStall });
      if (fallback) {
        this._cachedTerrainCanvas = fallback.canvas;
        this._cachedTerrainBounds = fallback.worldBounds;
        NauticalChartRenderer.sharedSnapshot = fallback;
      }
      return fallback;
    } finally {
      // Remove temporary cartographic lights
      scene.remove(cartoAmbient);
      scene.remove(cartoSun);
      if (typeof cartoAmbient.dispose === 'function') cartoAmbient.dispose();
      if (typeof cartoSun.dispose === 'function') cartoSun.dispose();

      // Restore scene background and fog
      scene.background = prevBackground;
      scene.fog = prevFog;

      // Restore scene children visibility
      for (const [child, vis] of savedVisibility.entries()) {
        child.visible = vis;
      }

      // Restore renderer target and clear settings
      if (prevTarget !== undefined) renderer.setRenderTarget(prevTarget);
      renderer.setClearColor(prevClearColor, prevClearAlpha);
      renderTarget.dispose();
    }
  }

  /**
   * Applies historical Admiralty nautical chart filters to captured 3D scene pixels.
   * Extracts ink coastlines, adds shallow-water bathymetric sand shelves, applies
   * antique elevation toning, and outputs a crisp 2D canvas.
   *
   * @param {Uint8Array} pixels
   * @param {number} width
   * @param {number} height
   * @returns {HTMLCanvasElement|null} Returns null if pixels fail sanity verification
   */
  applyNauticalFilters(pixels, width, height) {
    if (typeof document === 'undefined') return null;

    const offCanvas = document.createElement('canvas');
    offCanvas.width = width;
    offCanvas.height = height;
    const ctx = offCanvas.getContext('2d');
    if (!ctx) return null;

    const isLand = new Uint8Array(width * height);
    let landPixelCount = 0;
    for (let y = 0; y < height; y++) {
      const srcY = height - 1 - y; // WebGL row flip
      const srcRow = srcY * width * 4;
      const dstRow = y * width;
      for (let x = 0; x < width; x++) {
        if (pixels[srcRow + (x << 2) + 3] > 20) {
          isLand[dstRow + x] = 1;
          landPixelCount++;
        }
      }
    }

    const totalPixels = width * height;
    // Sanity check: land must not cover entire canvas (e.g. solid brown wash bug) or be 0
    if (landPixelCount === 0 || landPixelCount > totalPixels * 0.70) {
      console.warn(`[NauticalChartRenderer] Captured pixels invalid (${landPixelCount}/${totalPixels} land pixels)`);
      return null;
    }

    const coastType = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const idx = row + x;
        if (isLand[idx] === 1) {
          if (x === 0 || x === width - 1 || y === 0 || y === height - 1 ||
              isLand[idx - 1] === 0 || isLand[idx + 1] === 0 ||
              isLand[idx - width] === 0 || isLand[idx + width] === 0) {
            coastType[idx] = 2; // Coastline edge
          } else {
            coastType[idx] = 1; // Land interior
          }
        }
      }
    }

    // Bathymetric shallow-water shelf in water around land
    for (let y = 1; y < height - 1; y++) {
      const row = y * width;
      for (let x = 1; x < width - 1; x++) {
        const idx = row + x;
        if (isLand[idx] === 0) {
          if (isLand[idx - 1] === 1 || isLand[idx + 1] === 1 ||
              isLand[idx - width] === 1 || isLand[idx + width] === 1) {
            coastType[idx] = 3; // Immediate shallow shelf (1px)
          } else if (
            (x > 1 && isLand[idx - 2] === 1) || (x < width - 2 && isLand[idx + 2] === 1) ||
            (y > 1 && isLand[idx - width * 2] === 1) || (y < height - 2 && isLand[idx + width * 2] === 1)
          ) {
            coastType[idx] = 4; // Mid-shallow contour (2px)
          } else if (
            (x > 2 && isLand[idx - 3] === 1) || (x < width - 3 && isLand[idx + 3] === 1) ||
            (y > 2 && isLand[idx - width * 3] === 1) || (y < height - 3 && isLand[idx + width * 3] === 1)
          ) {
            coastType[idx] = 5; // Faint outer contour (3px)
          }
        }
      }
    }

    const outImgData = ctx.createImageData(width, height);
    const outData = outImgData.data;

    for (let y = 0; y < height; y++) {
      const srcY = height - 1 - y;
      const srcRow = srcY * width * 4;
      const dstRow = y * width;
      for (let x = 0; x < width; x++) {
        const idx = dstRow + x;
        const outIdx = idx * 4;
        const type = coastType[idx];

        if (type === 0) {
          // Open water: transparent so aged parchment pattern and graticule show through
          continue;
        }

        if (type === 2) {
          // Coastline ink line: deep antique sepia ink
          outData[outIdx]     = 52;
          outData[outIdx + 1] = 34;
          outData[outIdx + 2] = 19;
          outData[outIdx + 3] = 255;
          continue;
        }

        if (type === 3) {
          // Immediate shallow sand shelf
          outData[outIdx]     = 214;
          outData[outIdx + 1] = 196;
          outData[outIdx + 2] = 152;
          outData[outIdx + 3] = 155;
          continue;
        }

        if (type === 4) {
          // Mid-shallow contour ring
          outData[outIdx]     = 185;
          outData[outIdx + 1] = 160;
          outData[outIdx + 2] = 122;
          outData[outIdx + 3] = 95;
          continue;
        }

        if (type === 5) {
          // Faint outer wash
          outData[outIdx]     = 226;
          outData[outIdx + 1] = 215;
          outData[outIdx + 2] = 186;
          outData[outIdx + 3] = 45;
          continue;
        }

        // Land interior
        const pIdx = srcRow + (x << 2);
        const r = pixels[pIdx];
        const g = pixels[pIdx + 1];
        const b = pixels[pIdx + 2];

        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const relief = 0.65 + lum * 0.6;

        let baseR = 120, baseG = 100, baseB = 80;
        if (g > r * 1.04 && g > b * 1.04) {
          // Vegetation / grass / shrubs
          baseR = 155; baseG = 166; baseB = 122;
        } else if (r > 165 && g > 145 && b < 155) {
          // Sandbank / beach
          baseR = 222; baseG = 203; baseB = 156;
        } else if (r > 110 && g < r * 0.85 && b < 85) {
          // Dock / timber
          baseR = 138; baseG = 92; baseB = 52;
        } else {
          // Rock / cliff / mountain
          baseR = 118; baseG = 98; baseB = 76;
        }

        let finalR = Math.min(255, Math.round(baseR * relief));
        let finalG = Math.min(255, Math.round(baseG * relief));
        let finalB = Math.min(255, Math.round(baseB * relief));

        // Subtle topographic elevation contour line
        const band = Math.round(lum * 18);
        if (band % 3 === 0) {
          finalR = Math.round(finalR * 0.88);
          finalG = Math.round(finalG * 0.88);
          finalB = Math.round(finalB * 0.88);
        }

        outData[outIdx]     = finalR;
        outData[outIdx + 1] = finalG;
        outData[outIdx + 2] = finalB;
        outData[outIdx + 3] = 255;
      }
    }

    ctx.putImageData(outImgData, 0, 0);
    return offCanvas;
  }

  /**
   * Procedural fallback rasterizer for environments without WebGL context
   * or when top-down capture is rejected. Renders islands, rocks, dock, and voxels.
   */
  bakeVoxelTerrainFallback(voxelTerrain, obstacles = [], context = {}) {
    if (typeof document === 'undefined') return null;

    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    const pX = context.playerPos?.x ?? 0;
    const pZ = context.playerPos?.z ?? 0;
    minX = Math.min(minX, pX - 35);
    maxX = Math.max(maxX, pX + 35);
    minZ = Math.min(minZ, pZ - 35);
    maxZ = Math.max(maxZ, pZ + 35);

    if (context.endLocation?.position) {
      minX = Math.min(minX, context.endLocation.position.x - 45);
      maxX = Math.max(maxX, context.endLocation.position.x + 45);
      minZ = Math.min(minZ, context.endLocation.position.z - 45);
      maxZ = Math.max(maxZ, context.endLocation.position.z + 45);
    }

    const CHUNK_SIZE = 32;
    const hasVoxelChunks = Boolean(voxelTerrain && voxelTerrain.chunks && voxelTerrain.chunks.size > 0);
    if (hasVoxelChunks) {
      for (const key of voxelTerrain.chunks.keys()) {
        const [cx, cz] = key.split(',').map(Number);
        minX = Math.min(minX, cx * CHUNK_SIZE);
        maxX = Math.max(maxX, (cx + 1) * CHUNK_SIZE);
        minZ = Math.min(minZ, cz * CHUNK_SIZE);
        maxZ = Math.max(maxZ, (cz + 1) * CHUNK_SIZE);
      }
    }

    for (const obs of obstacles) {
      if (!obs) continue;
      const pos = obs.mesh?.position || obs.position;
      if (pos && (obs.type === 'island' || obs.type === 'rock')) {
        const s = (obs.scale || 1.0) * (obs.type === 'island' ? 40 : 12);
        minX = Math.min(minX, pos.x - s);
        maxX = Math.max(maxX, pos.x + s);
        minZ = Math.min(minZ, pos.z - s);
        maxZ = Math.max(maxZ, pos.z + s);
      }
    }

    if (context.hasDock !== false) {
      minX = Math.min(minX, -75);
      maxX = Math.max(maxX, 25);
      minZ = Math.min(minZ, -40);
      maxZ = Math.max(maxZ, 35);
    }

    if (minX === Infinity) {
      minX = -120; maxX = 120;
      minZ = -260; maxZ = 60;
    }

    const marginMeters = 25;
    minX -= marginMeters; maxX += marginMeters;
    minZ -= marginMeters; maxZ += marginMeters;

    const spanX = Math.max(120, maxX - minX);
    const spanZ = Math.max(120, maxZ - minZ);
    const maxSpan = Math.max(spanX, spanZ);

    const centerX = (minX + maxX) * 0.5;
    const centerZ = (minZ + maxZ) * 0.5;
    const halfSpan = maxSpan * 0.5;

    const worldBounds = {
      minX: centerX - halfSpan,
      maxX: centerX + halfSpan,
      minZ: centerZ - halfSpan,
      maxZ: centerZ + halfSpan,
      spanX: halfSpan * 2,
      spanZ: halfSpan * 2,
      centerX,
      centerZ
    };

    const canvasSize = 512;
    const off = document.createElement('canvas');
    off.width = canvasSize;
    off.height = canvasSize;
    const ctx = off.getContext('2d');
    if (!ctx) return null;

    const toCanvasX = (wx) => ((wx - worldBounds.minX) / worldBounds.spanX) * canvasSize;
    const toCanvasY = (wz) => ((wz - worldBounds.minZ) / worldBounds.spanZ) * canvasSize;
    const toCanvasScale = canvasSize / worldBounds.spanX;

    // 1. Draw Harbor Dock pier footprint
    if (context.hasDock !== false) {
      ctx.save();
      const pierLeft = toCanvasX(-65);
      const pierTop = toCanvasY(-20);
      const pierW = 55 * toCanvasScale;
      const pierH = 30 * toCanvasScale;

      ctx.fillStyle = '#decb9c'; // Sandbank under dock
      ctx.fillRect(pierLeft - 4, pierTop - 4, pierW + 8, pierH + 8);
      ctx.strokeStyle = '#4a3319';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(pierLeft - 4, pierTop - 4, pierW + 8, pierH + 8);

      ctx.fillStyle = '#8a5c34'; // Timber pier
      ctx.fillRect(pierLeft, pierTop, pierW, pierH);
      ctx.strokeStyle = '#321e0d';
      ctx.strokeRect(pierLeft, pierTop, pierW, pierH);
      ctx.restore();
    }

    // 2. Draw Topographic Island Landmasses
    for (const obs of obstacles) {
      if (!obs || obs.type !== 'island') continue;
      const pos = obs.mesh?.position || obs.position;
      if (!pos) continue;

      const cx = toCanvasX(pos.x);
      const cy = toCanvasY(pos.z);
      const r = (obs.scale || 4.5) * toCanvasScale * 7.5;
      const rot = obs.mesh?.rotation?.y || 0;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);

      // Layer 1: Bathymetric shallow sand shelf
      ctx.fillStyle = 'rgba(214, 196, 152, 0.6)';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.25, r * 0.95, 0, 0, Math.PI * 2);
      ctx.fill();

      // Layer 2: Sepia coastline ink outline
      ctx.strokeStyle = '#342213';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.75, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Layer 3: Sandy beach perimeter
      ctx.fillStyle = '#deb887';
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();

      // Layer 4: Grassy interior plateau
      ctx.fillStyle = '#9fad7a';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.78, r * 0.58, 0, 0, Math.PI * 2);
      ctx.fill();

      // Layer 5: Elevation ridge / peak
      ctx.fillStyle = '#7a644c';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.45, r * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#4e3b28';
      ctx.lineWidth = 0.9;
      ctx.stroke();

      ctx.restore();
    }

    // 3. Draw Voxel chunks if present
    if (hasVoxelChunks) {
      const CHUNK_HEIGHT = 32;
      for (const [key, chunk] of voxelTerrain.chunks.entries()) {
        const [cx, cz] = key.split(',').map(Number);
        const chunkWorldX = cx * CHUNK_SIZE;
        const chunkWorldZ = cz * CHUNK_SIZE;

        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            let topY = -1;
            for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
              if (chunk[lx + CHUNK_SIZE * (y + CHUNK_HEIGHT * lz)] !== 0) {
                topY = y;
                break;
              }
            }

            if (topY >= 0) {
              const wx = chunkWorldX + lx;
              const wz = chunkWorldZ + lz;
              const px = toCanvasX(wx);
              const py = toCanvasY(wz);

              if (topY <= 3) {
                ctx.fillStyle = '#dfcca0';
              } else if (topY <= 9) {
                ctx.fillStyle = '#caa675';
              } else {
                ctx.fillStyle = '#aa8357';
              }
              ctx.fillRect(Math.floor(px), Math.floor(py), Math.ceil(toCanvasScale + 0.5), Math.ceil(toCanvasScale + 0.5));
            }
          }
        }
      }
    }

    return {
      canvas: off,
      worldBounds
    };
  }

  // Alias for backwards compatibility
  bakeVoxelTerrain(voxelTerrain) {
    return this.bakeVoxelTerrainFallback(voxelTerrain, []);
  }

  // ---------------------------------------------------------------------------
  // Maritime Hazard Symbology
  // ---------------------------------------------------------------------------

  /**
   * Draws nautical symbols for rocks, sirens, whirlpools, seaweed, and barrels.
   * Note: Pickups are floating wood debris and are deliberately omitted to avoid phantom map dots.
   */
  drawHazardSymbol(ctx, x, y, type, scale = 1.0, extra = {}) {
    if (type === 'pickup' || type === 'wave_small' || type === 'wind_zone') {
      return; // Do not draw non-navigational debris on nautical sea charts
    }

    ctx.save();
    ctx.translate(x, y);

    switch (type) {
      case 'rock': {
        // Authentic nautical chart submerged reef / rock cross with 4 hazard dots
        ctx.strokeStyle = '#2d1d11';
        ctx.lineWidth = 1.6 * scale;
        const arm = 6.5 * scale;
        ctx.beginPath();
        ctx.moveTo(-arm, 0);
        ctx.lineTo(arm, 0);
        ctx.moveTo(0, -arm);
        ctx.lineTo(0, arm);
        ctx.stroke();

        ctx.fillStyle = '#2d1d11';
        const d = 4.2 * scale;
        const r = 1.3 * scale;
        ctx.beginPath();
        ctx.arc(-d, -d, r, 0, Math.PI * 2);
        ctx.arc(d, -d, r, 0, Math.PI * 2);
        ctx.arc(-d, d, r, 0, Math.PI * 2);
        ctx.arc(d, d, r, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'siren': {
        const attractRadius = (extra.attractRadius || 30) * (extra.viewScale || 1.0);
        ctx.strokeStyle = 'rgba(155, 60, 115, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);

        for (const ring of [attractRadius * 0.45, attractRadius * 0.75, attractRadius]) {
          ctx.beginPath();
          ctx.arc(0, 0, ring, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.setLineDash([]);
        ctx.fillStyle = '#8b2361';
        ctx.strokeStyle = '#420d2c';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.arc(0, 0, 4.5 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.font = `bold ${Math.round(11 * scale)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('♫', 0, -0.5);
        break;
      }

      case 'whirlpool': {
        ctx.strokeStyle = 'rgba(25, 75, 110, 0.75)';
        ctx.lineWidth = 1.4 * scale;
        const vortexR = (extra.radius || 12) * (extra.viewScale || 1.0);

        ctx.beginPath();
        for (let a = 0; a < Math.PI * 4; a += 0.2) {
          const r = (a / (Math.PI * 4)) * vortexR;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          if (a === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();

        ctx.fillStyle = '#103045';
        ctx.beginPath();
        ctx.arc(0, 0, 2.5 * scale, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'seaweed': {
        ctx.fillStyle = 'rgba(65, 88, 55, 0.55)';
        const dots = [[-4, -2], [3, -5], [1, 2], [-2, 5], [4, 3], [-5, 0]];
        for (const [dx, dy] of dots) {
          ctx.beginPath();
          ctx.arc(dx * scale, dy * scale, 1.8 * scale, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }

      case 'barrel': {
        ctx.fillStyle = '#8a5024';
        ctx.strokeStyle = '#2e190b';
        ctx.lineWidth = 1.0;
        const bSize = 6 * scale;
        ctx.fillRect(-bSize * 0.5, -bSize * 0.5, bSize, bSize);
        ctx.strokeRect(-bSize * 0.5, -bSize * 0.5, bSize, bSize);
        break;
      }

      case 'island': {
        const iRadius = (extra.scale || 10) * (extra.viewScale || 1.0);
        ctx.fillStyle = 'rgba(215, 190, 145, 0.75)';
        ctx.strokeStyle = '#4a3319';
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        ctx.ellipse(0, 0, iRadius, iRadius * 0.75, extra.rotation || 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = 'rgba(74, 51, 25, 0.45)';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.ellipse(0, 0, iRadius * 0.55, iRadius * 0.4, extra.rotation || 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }

      default:
        ctx.fillStyle = '#4a3319';
        ctx.fillRect(-3, -3, 6, 6);
        break;
    }

    ctx.restore();
  }

  /**
   * Draws the goal harbor (Lighthouse with radiant beam).
   */
  drawHarborGoal(ctx, x, y, radius = 16, label = 'PORT OF CALL') {
    ctx.save();
    ctx.translate(x, y);

    // Radiant anchorage zone
    ctx.strokeStyle = '#c4892c';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(12, radius), 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Golden water halo
    const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, Math.max(16, radius));
    halo.addColorStop(0, 'rgba(255, 215, 100, 0.55)');
    halo.addColorStop(1, 'rgba(255, 215, 100, 0.0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(16, radius), 0, Math.PI * 2);
    ctx.fill();

    // Lighthouse tower silhouette
    ctx.fillStyle = '#2c1e14';
    ctx.beginPath();
    ctx.moveTo(-4, 9);
    ctx.lineTo(4, 9);
    ctx.lineTo(2.5, -6);
    ctx.lineTo(-2.5, -6);
    ctx.closePath();
    ctx.fill();

    // Lantern room & beacon dome
    ctx.fillStyle = '#f0a518';
    ctx.fillRect(-3, -9, 6, 3);
    ctx.fillStyle = '#2c1e14';
    ctx.beginPath();
    ctx.arc(0, -9, 3, Math.PI, 0);
    ctx.fill();

    if (label) {
      ctx.font = 'bold 9px serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#422812';
      ctx.fillText(label, 0, Math.max(16, radius) + 11);
    }

    ctx.restore();
  }

  /**
   * Draws the player's sailing vessel on the chart with high contrast and clarity.
   */
  drawPlayerVessel(ctx, x, y, yaw = 0, scale = 1.0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(yaw);

    // Forward steering guideline (shows ship heading trajectory)
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.5)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, -12 * scale);
    ctx.lineTo(0, -28 * scale);
    ctx.stroke();
    ctx.setLineDash([]);

    // Faint trailing wake
    ctx.strokeStyle = 'rgba(74, 51, 25, 0.25)';
    ctx.lineWidth = 1.0;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(-4 * scale, 12 * scale);
    ctx.lineTo(-7 * scale, 24 * scale);
    ctx.moveTo(4 * scale, 12 * scale);
    ctx.lineTo(7 * scale, 24 * scale);
    ctx.stroke();
    ctx.setLineDash([]);

    // Hull silhouette in deep maritime navy with dark border
    ctx.fillStyle = '#142533';
    ctx.strokeStyle = '#070e14';
    ctx.lineWidth = 1.3;

    ctx.beginPath();
    ctx.moveTo(0, -12 * scale);                                         // Bowsprit point
    ctx.quadraticCurveTo(6.5 * scale, -4 * scale, 5.5 * scale, 8 * scale); // Starboard rail
    ctx.lineTo(-5.5 * scale, 8 * scale);                                   // Stern transom
    ctx.quadraticCurveTo(-6.5 * scale, -4 * scale, 0, -12 * scale);        // Port rail
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Gleaming gold bowsprit beak
    ctx.fillStyle = '#f0b830';
    ctx.beginPath();
    ctx.moveTo(0, -12 * scale);
    ctx.lineTo(2 * scale, -8 * scale);
    ctx.lineTo(-2 * scale, -8 * scale);
    ctx.closePath();
    ctx.fill();

    // Sail crossbeams in crisp ivory canvas with drop shadow
    ctx.strokeStyle = '#fcfaf4';
    ctx.lineWidth = 1.8 * scale;
    ctx.beginPath();
    ctx.moveTo(-6 * scale, 0);
    ctx.lineTo(6 * scale, 0);
    ctx.stroke();

    // Mast center pin in brass
    ctx.fillStyle = '#d4af37';
    ctx.beginPath();
    ctx.arc(0, 0, 2.0 * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Full Strategic Course View (Pre-Sail Tactical Modal)
  // ---------------------------------------------------------------------------

  /**
   * Renders the complete level course fitted into the given canvas.
   */
  renderFullCourse({
    canvas,
    levelCfg = {},
    voxelTerrain = null,
    obstacles = [],
    sirens = [],
    playerPos = { x: 0, z: 0 },
    playerYaw = 0,
    endLocation = { position: { x: 0, z: -220 }, radius: 16 },
    renderer = null,
    scene = null,
    dockStall = null,
    hasDock = true
  }) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    this.drawParchmentBackground(ctx, w, h);
    this.drawGraticule(ctx, w, h, 60);

    // Compute bounding box containing spawn, endLocation, and all obstacles
    let minX = Math.min(playerPos.x - 35, endLocation.position.x - 45);
    let maxX = Math.max(playerPos.x + 35, endLocation.position.x + 45);
    let minZ = Math.min(playerPos.z - 35, endLocation.position.z - 45);
    let maxZ = Math.max(playerPos.z + 35, endLocation.position.z + 45);

    for (const obs of obstacles) {
      if (!obs || !obs.mesh) continue;
      if (obs.type === 'pickup' || obs.type === 'wave_small' || obs.type === 'wind_zone') continue;
      const ox = obs.mesh.position.x;
      const oz = obs.mesh.position.z;
      const s = obs.type === 'island' ? 40 : 15;
      if (ox - s < minX) minX = ox - s;
      if (ox + s > maxX) maxX = ox + s;
      if (oz - s < minZ) minZ = oz - s;
      if (oz + s > maxZ) maxZ = oz + s;
    }
    for (const s of sirens) {
      const pos = s.position || (s.mesh?.position);
      if (pos) {
        if (pos.x - 30 < minX) minX = pos.x - 30;
        if (pos.x + 30 > maxX) maxX = pos.x + 30;
        if (pos.z - 30 < minZ) minZ = pos.z - 30;
        if (pos.z + 30 > maxZ) maxZ = pos.z + 30;
      }
    }

    minX -= 35;
    maxX += 35;
    minZ -= 35;
    maxZ += 35;

    const spanX = Math.max(80, maxX - minX);
    const spanZ = Math.max(100, maxZ - minZ);

    const margin = 48;
    const availW = w - margin * 2;
    const availH = h - margin * 2;

    const scale = Math.min(availW / spanX, availH / spanZ);

    const mapX = (wx) => margin + (wx - minX) * scale + (availW - spanX * scale) * 0.5;
    const mapY = (wz) => margin + (wz - minZ) * scale + (availH - spanZ * scale) * 0.5;

    // 1. Fetch or generate high-fidelity top-down map snapshot
    let terrainCanvas = this._cachedTerrainCanvas || NauticalChartRenderer.sharedSnapshot?.canvas;
    let terrainBounds = this._cachedTerrainBounds || NauticalChartRenderer.sharedSnapshot?.worldBounds;

    if (!terrainCanvas && renderer && scene) {
      const snapshot = this.captureTopDownMap({
        renderer,
        scene,
        voxelTerrain,
        obstacles,
        dockStall,
        hasDock,
        endLocation,
        playerPos
      });
      if (snapshot) {
        terrainCanvas = snapshot.canvas;
        terrainBounds = snapshot.worldBounds;
      }
    }

    if (!terrainCanvas) {
      const fallback = this.bakeVoxelTerrainFallback(voxelTerrain, obstacles);
      if (fallback) {
        terrainCanvas = fallback.canvas;
        terrainBounds = fallback.worldBounds;
      }
    }

    const hasHighFidelityTerrain = Boolean(terrainCanvas && terrainBounds);
    if (hasHighFidelityTerrain) {
      const bMinU = mapX(terrainBounds.minX);
      const bMinV = mapY(terrainBounds.minZ);
      const bMaxU = mapX(terrainBounds.maxX);
      const bMaxV = mapY(terrainBounds.maxZ);
      ctx.drawImage(terrainCanvas, bMinU, bMinV, bMaxU - bMinU, bMaxV - bMinV);
    }

    // 2. Draw Islands only if high-fidelity top-down map is absent
    if (!hasHighFidelityTerrain) {
      for (const obs of obstacles) {
        if (obs.type === 'island' && obs.mesh) {
          const u = mapX(obs.mesh.position.x);
          const v = mapY(obs.mesh.position.z);
          this.drawHazardSymbol(ctx, u, v, 'island', 1.0, {
            scale: obs.scale || 10,
            viewScale: scale
          });
        }
      }
    }

    // 3. Recommended voyage course route dashed line
    ctx.save();
    ctx.strokeStyle = 'rgba(180, 50, 30, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(mapX(playerPos.x), mapY(playerPos.z));
    ctx.lineTo(mapX(endLocation.position.x), mapY(endLocation.position.z));
    ctx.stroke();
    ctx.restore();

    // 4. Draw Maritime Hazards (rocks, sirens, whirlpools) — omitting pickups/floating planks
    for (const obs of obstacles) {
      if (!obs.mesh || obs.type === 'island' || obs.type === 'pickup' || obs.type === 'wave_small' || obs.type === 'wind_zone') {
        continue;
      }
      const u = mapX(obs.mesh.position.x);
      const v = mapY(obs.mesh.position.z);
      this.drawHazardSymbol(ctx, u, v, obs.type, Math.max(0.7, Math.min(1.2, scale * 1.5)), {
        scale: obs.scale,
        viewScale: scale
      });
    }

    // 5. Draw Sirens
    for (const s of sirens) {
      const pos = s.position || s.mesh?.position;
      if (pos) {
        const u = mapX(pos.x);
        const v = mapY(pos.z);
        this.drawHazardSymbol(ctx, u, v, 'siren', 1.0, {
          attractRadius: s.attractRadius || 40,
          viewScale: scale
        });
      }
    }

    // 6. Draw Goal Harbor (End Location)
    const goalU = mapX(endLocation.position.x);
    const goalV = mapY(endLocation.position.z);
    this.drawHarborGoal(ctx, goalU, goalV, (endLocation.radius || 16) * scale, 'SAFE HARBOR');

    // 7. Draw Player Vessel Departure Point
    const shipU = mapX(playerPos.x);
    const shipV = mapY(playerPos.z);
    this.drawPlayerVessel(ctx, shipU, shipV, -playerYaw, 1.0);

    // Departure Dock Label
    ctx.font = 'bold 9px serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1e303d';
    ctx.fillText('DEPARTURE BERTH', shipU, shipV + 20);

    // Decorative Compass Rose in corner
    this.drawCompassRose(ctx, w - 55, 55, 30, 0);

    // Decorative Border
    this.drawChartBorder(ctx, w, h, 12);
  }

  // ---------------------------------------------------------------------------
  // Local Minimap View (In-Game Sailing Compass)
  // ---------------------------------------------------------------------------

  /**
   * Renders the local rotating minimap chart centered on the player.
   * Blits the pre-rendered high-fidelity top-down terrain slice with zero per-frame CPU overhead,
   * showing authentic coastlines, channels, and hazards.
   */
  renderLocalView({
    canvas,
    playerPos = { x: 0, z: 0 },
    playerYaw = 0,
    obstacles = [],
    sirens = [],
    windDir = null,
    endLocation = null,
    voxelTerrain = null,
    viewRadius = 75,
    renderer = null,
    scene = null,
    dockStall = null,
    hasDock = true
  }) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const minimapR = cx - 4;

    ctx.clearRect(0, 0, w, h);

    // Circular clip path for the compass housing
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, minimapR, 0, Math.PI * 2);
    ctx.clip();

    this.drawParchmentBackground(ctx, w, h);

    // Scale: viewRadius meters maps to minimapR pixels
    const scale = minimapR / viewRadius;

    // Fetch high-fidelity terrain snapshot
    let terrainCanvas = this._cachedTerrainCanvas || NauticalChartRenderer.sharedSnapshot?.canvas;
    let terrainBounds = this._cachedTerrainBounds || NauticalChartRenderer.sharedSnapshot?.worldBounds;

    if (!terrainCanvas && renderer && scene) {
      const snapshot = this.captureTopDownMap({
        renderer,
        scene,
        voxelTerrain,
        obstacles,
        dockStall,
        hasDock,
        endLocation,
        playerPos
      });
      if (snapshot) {
        terrainCanvas = snapshot.canvas;
        terrainBounds = snapshot.worldBounds;
      }
    }

    // North-Up player-centric projection:
    // The chart remains stably oriented North-Up (aligned with the brass compass bezel 'N'),
    // while the vessel turns in real-time to indicate heading.
    ctx.save();
    ctx.translate(cx, cy);
    // Map does NOT rotate: North (-Z) is always UP, East (+X) is always RIGHT

    // 1. Blit local terrain slice centered on player
    if (terrainCanvas && terrainBounds) {
      ctx.drawImage(
        terrainCanvas,
        (terrainBounds.minX - playerPos.x) * scale,
        (terrainBounds.minZ - playerPos.z) * scale,
        terrainBounds.spanX * scale,
        terrainBounds.spanZ * scale
      );
    }

    // 2. Draw subtle range rings (25m, 50m) with legible distance labels
    ctx.strokeStyle = 'rgba(74, 51, 25, 0.22)';
    ctx.lineWidth = 1.0;
    ctx.setLineDash([3, 4]);
    for (const rMeters of [25, 50]) {
      ctx.beginPath();
      ctx.arc(0, 0, rMeters * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.font = 'bold 8px Georgia, serif';
    ctx.fillStyle = 'rgba(74, 51, 25, 0.55)';
    ctx.textAlign = 'center';
    ctx.fillText('25m', 0, -25 * scale + 3);
    ctx.fillText('50m', 0, -50 * scale + 3);

    // 3. Draw nearby obstacles (rocks, whirlpools, seaweed) — skipping pickups and waves
    if (obstacles) {
      for (const obs of obstacles) {
        if (!obs || !obs.mesh || !obs.active) continue;
        if (obs.type === 'pickup' || obs.type === 'wave_small' || obs.type === 'wind_zone' || obs.type === 'island') {
          continue;
        }
        const dx = obs.mesh.position.x - playerPos.x;
        const dz = obs.mesh.position.z - playerPos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > viewRadius * 1.3) continue;

        const u = dx * scale;
        const v = dz * scale;
        this.drawHazardSymbol(ctx, u, v, obs.type, 1.0, {
          scale: obs.scale,
          viewScale: scale,
          rotation: obs.mesh.rotation?.y || 0
        });
      }
    }

    // 4. Draw nearby sirens
    if (sirens) {
      for (const s of sirens) {
        const pos = s.position || s.mesh?.position;
        if (!pos) continue;
        const dx = pos.x - playerPos.x;
        const dz = pos.z - playerPos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > viewRadius * 1.3) continue;

        const u = dx * scale;
        const v = dz * scale;
        this.drawHazardSymbol(ctx, u, v, 'siren', 1.0, {
          attractRadius: s.attractRadius || 30,
          viewScale: scale
        });
      }
    }

    // 5. Draw Harbor Goal if in range
    if (endLocation && endLocation.position) {
      const gx = endLocation.position.x - playerPos.x;
      const gz = endLocation.position.z - playerPos.z;
      const gDist = Math.hypot(gx, gz);
      if (gDist <= viewRadius) {
        this.drawHarborGoal(ctx, gx * scale, gz * scale, (endLocation.radius || 16) * scale);
      }
    }

    ctx.restore(); // Exit translated context

    // 6. Draw Player Ship turning dynamically in center of minimap
    // In Three.js, turning right produces negative yaw, so -playerYaw yields clockwise rotation in 2D canvas
    this.drawPlayerVessel(ctx, cx, cy, -playerYaw, 1.15);

    // 7. Off-Screen Harbor Bearing Indicator with distance label
    if (endLocation && endLocation.position) {
      const gx = endLocation.position.x - playerPos.x;
      const gz = endLocation.position.z - playerPos.z;
      const gDist = Math.hypot(gx, gz);

      if (gDist > viewRadius) {
        // True compass bearing in North-Up coordinates
        const bearingAngle = Math.atan2(gx, -gz);

        const needleR = minimapR - 9;
        const nx = cx + Math.sin(bearingAngle) * needleR;
        const ny = cy - Math.cos(bearingAngle) * needleR;

        ctx.save();
        ctx.translate(nx, ny);
        ctx.rotate(bearingAngle);

        // Radiant golden lighthouse chevron pointer
        ctx.fillStyle = '#e0a424';
        ctx.strokeStyle = '#3e240f';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.lineTo(5, 5);
        ctx.lineTo(0, 3);
        ctx.lineTo(-5, 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();

        // Distance text badge near rim
        const textR = minimapR - 22;
        const tx = cx + Math.sin(bearingAngle) * textR;
        const ty = cy - Math.cos(bearingAngle) * textR;
        ctx.save();
        ctx.font = 'bold 8px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#422812';
        ctx.fillText(`${Math.round(gDist)}m`, tx, ty);
        ctx.restore();
      }
    }

    // 8. Wind Direction Pennant in true world orientation
    if (windDir) {
      const windAngle = Math.atan2(windDir.x, -windDir.z);
      const wR = minimapR - 12;
      const wx = cx + Math.sin(windAngle) * wR;
      const wy = cy - Math.cos(windAngle) * wR;

      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(windAngle);
      ctx.fillStyle = '#1e78a6';
      ctx.strokeStyle = '#0e384d';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(3.5, 4);
      ctx.lineTo(0, 2);
      ctx.lineTo(-3.5, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore(); // Exit circular clip path

    // 9. Etched inner brass bezel border with cardinal tick marks
    ctx.save();
    ctx.strokeStyle = '#7d5225';
    ctx.lineWidth = 3.0;
    ctx.beginPath();
    ctx.arc(cx, cy, minimapR, 0, Math.PI * 2);
    ctx.stroke();

    // Cardinal tick marks at compass edge
    ctx.strokeStyle = '#4a3016';
    ctx.lineWidth = 1.5;
    const ticks = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
    for (const t of ticks) {
      const x1 = cx + Math.sin(t) * (minimapR - 5);
      const y1 = cy - Math.cos(t) * (minimapR - 5);
      const x2 = cx + Math.sin(t) * minimapR;
      const y2 = cy - Math.cos(t) * minimapR;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

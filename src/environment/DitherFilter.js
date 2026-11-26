import * as THREE from 'three';

// Standard 8x8 Bayer threshold matrix for ordered dithering
const BAYER_8X8 = [
   0, 32,  8, 40,  2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44,  4, 36, 14, 46,  6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
   3, 35, 11, 43,  1, 33,  9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47,  7, 39, 13, 45,  5, 37,
  63, 31, 55, 23, 61, 29, 53, 21
];

/**
 * Creates an 8x8 repeating DataTexture containing normalized Bayer matrix thresholds.
 */
function createBayerTexture() {
  const data = new Uint8Array(64 * 4);
  for (let i = 0; i < 64; i++) {
    const val = Math.round((BAYER_8X8[i] / 64.0) * 255);
    data[i * 4 + 0] = val;
    data[i * 4 + 1] = val;
    data[i * 4 + 2] = val;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, 8, 8, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const DitherShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDitherMap: { value: null },
    uResolution: { value: new THREE.Vector2() },
    uDitherScale: { value: 1.0 },
    uColorLevels: { value: 8.0 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform sampler2D tDitherMap;
    uniform vec2 uResolution;
    uniform float uDitherScale;
    uniform float uColorLevels;
    uniform float uTime;

    varying vec2 vUv;

    void main() {
      vec4 baseColor = texture2D(tDiffuse, vUv);

      // Screen-space pixel coordinates divided by dither scale
      vec2 ditherCoord = (vUv * uResolution) / max(uDitherScale, 1.0);

      // Sample 8x8 Bayer dithering map texture (centered at 0.0)
      float ditherValue = texture2D(tDitherMap, ditherCoord / 8.0).r - 0.5;

      // Spread proportional to step width between quantization levels
      float spread = 1.0 / max(uColorLevels, 2.0);
      vec3 dithered = clamp(baseColor.rgb + ditherValue * spread, 0.0, 1.0);

      // Snap color channels to discrete levels
      vec3 finalColor = floor(dithered * (uColorLevels - 1.0) + 0.5) / (uColorLevels - 1.0);

      gl_FragColor = vec4(finalColor, baseColor.a);
    }
  `
};

export class DitherFilter {
  constructor(renderer) {
    this._renderer = renderer;

    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array([
      -1, -1, 0,   3, -1, 0,   -1, 3, 0
    ]);
    const uvs = new Float32Array([
      0, 0,   2, 0,   0, 2
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    this._ditherMap = createBayerTexture();

    this._material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(DitherShader.uniforms),
      vertexShader: DitherShader.vertexShader,
      fragmentShader: DitherShader.fragmentShader,
      depthTest: false,
      depthWrite: false
    });
    this._material.uniforms.tDitherMap.value = this._ditherMap;

    const mesh = new THREE.Mesh(geo, this._material);
    mesh.frustumCulled = false;

    this._scene = new THREE.Scene();
    this._scene.add(mesh);
    this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  resize(w, h) {
    this._material.uniforms.uResolution.value.set(w, h);
  }

  render(target, outputTarget = null) {
    this._material.uniforms.tDiffuse.value = target.texture;
    this._material.uniforms.uTime.value = performance.now() * 0.001;

    // Render to outputTarget (or screen if null)
    this._renderer.setRenderTarget(outputTarget);
    this._renderer.clear();
    this._renderer.render(this._scene, this._camera);
  }

  setColorLevels(levels) {
    this._material.uniforms.uColorLevels.value = levels;
  }

  setDitherScale(scale) {
    this._material.uniforms.uDitherScale.value = scale;
  }

  dispose() {
    this._material.dispose();
    this._ditherMap.dispose();
  }
}

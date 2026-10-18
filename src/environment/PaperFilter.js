import * as THREE from 'three';
import { getAssetUrl } from '../utils/paths.js';

const PaperShader = {
  uniforms: {
    tDiffuse: { value: null },
    tCrumple: { value: null },
    uResolution: { value: new THREE.Vector2() },
    uTime: { value: 0 },
    // Colors
    uInkColor: { value: new THREE.Color(0x2c1e16) },
    uPaperColor: { value: new THREE.Color(0xdac5a5) }, // Darker parchment base
    uPaperHighlight: { value: new THREE.Color(0xf6ebd1) }, // Lighter parchment
    
    // Configurable parameters
    uStyle: { value: 0 }, // 0 = Hatching, 1 = Kuwahara
    uHatchScale: { value: 10.0 },
    uKuwaharaRadius: { value: 3 }, // 1 to 5
    uColorPreservation: { value: 0.4 },
    uEdgeThreshold: { value: 0.3 },
    uWobbleIntensity: { value: 0.0005 },
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
    uniform sampler2D tCrumple;
    uniform vec2 uResolution;
    uniform float uTime;
    
    uniform vec3 uInkColor;
    uniform vec3 uPaperColor;
    uniform vec3 uPaperHighlight;

    uniform int uStyle;
    uniform float uHatchScale;
    uniform int uKuwaharaRadius;
    uniform float uColorPreservation;
    uniform float uEdgeThreshold;
    uniform float uWobbleIntensity;

    varying vec2 vUv;

    // Fast pseudo-random noise function
    float rand(vec2 n) { 
      return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
    }

    // Helper for Hatching: fast trigonometric wobble
    float hatch(vec2 uv, float luma, float scale) {
      float h = 1.0;
      float hatchSpacing = scale * 50.0;
      
      // Hand-drawn line wobble using fast analytical sine/cosine
      float lineWobble = (sin(uv.y * 60.0 + uv.x * 20.0) + cos(uv.x * 60.0 - uv.y * 20.0)) * 0.25;
      
      float w1 = sin((uv.x + uv.y) * hatchSpacing + lineWobble);
      float w2 = sin((uv.x - uv.y) * hatchSpacing + lineWobble);
      float w3 = sin((uv.x + uv.y - 0.5) * hatchSpacing * 0.5 + lineWobble);
      float w4 = sin((uv.x - uv.y + 0.5) * hatchSpacing * 0.5 + lineWobble);
      
      // Thin lines
      float t = 0.8; 
      
      if (luma < 0.55) {
        if (w1 > t) h -= 0.4;
      }
      if (luma < 0.40) {
        if (w2 > t) h -= 0.4;
      }
      if (luma < 0.25) {
        if (w3 > t) h -= 0.4;
      }
      if (luma < 0.15) {
        if (w4 > t) h -= 0.4;
      }
      
      return clamp(h, 0.0, 1.0);
    }
    
    // Helper for Kuwahara:
    // Fixed 5x5 kernel (radius 2, 25 samples total).
    // Replaces the 121-loop kernel and dynamic branching with a constant, branchless
    // hardware-friendly texture accumulation that eliminates warp divergence.
    vec3 kuwahara(sampler2D tex, vec2 uv, vec2 texel) {
      vec3 m0 = vec3(0.0), m1 = vec3(0.0), m2 = vec3(0.0), m3 = vec3(0.0);
      vec3 s0 = vec3(0.0), s1 = vec3(0.0), s2 = vec3(0.0), s3 = vec3(0.0);
      
      const float n = 9.0;
      
      for (int j = -2; j <= 2; ++j) {
        for (int i = -2; i <= 2; ++i) {
          vec3 c = texture2D(tex, uv + vec2(float(i), float(j)) * texel).rgb;
          vec3 cc = c * c;
          
          if (i <= 0 && j <= 0) { m0 += c; s0 += cc; }
          if (i >= 0 && j <= 0) { m1 += c; s1 += cc; }
          if (i >= 0 && j >= 0) { m2 += c; s2 += cc; }
          if (i <= 0 && j >= 0) { m3 += c; s3 += cc; }
        }
      }
      
      m0 /= n; s0 = abs(s0 / n - m0 * m0);
      m1 /= n; s1 = abs(s1 / n - m1 * m1);
      m2 /= n; s2 = abs(s2 / n - m2 * m2);
      m3 /= n; s3 = abs(s3 / n - m3 * m3);
      
      float v0 = s0.r + s0.g + s0.b;
      float v1 = s1.r + s1.g + s1.b;
      float v2 = s2.r + s2.g + s2.b;
      float v3 = s3.r + s3.g + s3.b;
      
      float minV = v0;
      vec3 col = m0;
      if (v1 < minV) { minV = v1; col = m1; }
      if (v2 < minV) { minV = v2; col = m2; }
      if (v3 < minV) { minV = v3; col = m3; }
      
      return col;
    }

    void main() {
      // 1. Subtle UV Wobble (fast analytical sine/cosine)
      vec2 wobble = vec2(
        sin(vUv.y * 25.0 + uTime * 0.4) * cos(vUv.x * 15.0),
        cos(vUv.x * 25.0 - uTime * 0.4) * sin(vUv.y * 15.0)
      );
      vec2 uv = vUv + wobble * uWobbleIntensity;

      // 2. Base scene color & Shading Style
      vec2 texel = 1.0 / uResolution;
      vec4 baseColor;
      float shadingLuma = 1.0;
      float hatchMask = 1.0;
      
      if (uStyle == 1) {
        // Kuwahara Filter
        // Widened texel step based on radius gives broad painterly strokes
        vec2 wideTexel = texel * (1.0 + float(uKuwaharaRadius) * 1.5);
        baseColor = vec4(kuwahara(tDiffuse, uv, wideTexel), 1.0);
        shadingLuma = dot(baseColor.rgb, vec3(0.299, 0.587, 0.114));
      } else {
        // Hatching Filter
        baseColor = texture2D(tDiffuse, uv);
        float luma = dot(baseColor.rgb, vec3(0.299, 0.587, 0.114));
        hatchMask = hatch(vUv, luma, uHatchScale);
        shadingLuma = luma;
      }

      // 3. Fast 4-tap Edge Detection (cardinal samples)
      vec2 edgeTexel = 2.5 / uResolution;
      float sLeft  = dot(texture2D(tDiffuse, uv - vec2(edgeTexel.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
      float sRight = dot(texture2D(tDiffuse, uv + vec2(edgeTexel.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
      float sUp    = dot(texture2D(tDiffuse, uv - vec2(0.0, edgeTexel.y)).rgb, vec3(0.299, 0.587, 0.114));
      float sDown  = dot(texture2D(tDiffuse, uv + vec2(0.0, edgeTexel.y)).rgb, vec3(0.299, 0.587, 0.114));
      float edge = length(vec2(sRight - sLeft, sDown - sUp)) * 2.2;
      float edgeMask = smoothstep(uEdgeThreshold, uEdgeThreshold + 0.35, edge);

      // 4. Paper Base Color & Grain (fast high-frequency stipple)
      float paperNoise = fract(sin(dot(floor(vUv * uResolution * 0.25), vec2(12.9898, 78.233))) * 43758.5453);
      vec3 paperBase = mix(uPaperColor, uPaperHighlight, paperNoise * 0.5);

      // 5. Sepia & Color Preservation
      vec3 sepiaColor;
      if (uStyle == 1) {
        sepiaColor = mix(uInkColor, paperBase, shadingLuma * 0.7 + 0.3);
      } else {
        sepiaColor = mix(uInkColor, paperBase, shadingLuma * 0.6 + 0.4); 
        sepiaColor = mix(uInkColor * 0.5, sepiaColor, hatchMask);
      }
      
      vec3 tintedOriginal = baseColor.rgb * paperBase * 1.2;
      vec3 mixedColor = mix(sepiaColor, tintedOriginal, uColorPreservation); 
      vec3 finalColor = mix(mixedColor, uInkColor, edgeMask);

      // 6. Fast Subtle Vignette
      vec2 center = vUv - 0.5;
      float dist = length(center);
      float vNoise = sin(vUv.x * 4.0) * cos(vUv.y * 4.0) * 0.06;
      float vignette = smoothstep(0.8, 0.35, dist + vNoise);
      finalColor = mix(uInkColor * 0.3, finalColor, vignette);

      // 7. Static Crumple Texture
      vec2 crumpleUv = vUv * 0.8 + 0.1;
      float crumpleMap = texture2D(tCrumple, crumpleUv).r;
      float crumpleMask = smoothstep(0.8, 0.55, crumpleMap);
      finalColor = mix(finalColor, uInkColor * 0.5, crumpleMask * 0.3);

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `
};

export class PaperFilter {
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

    this._material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(PaperShader.uniforms),
      vertexShader: PaperShader.vertexShader,
      fragmentShader: PaperShader.fragmentShader,
      depthTest: false,
      depthWrite: false
    });
    
    // Load crumple texture
    const texLoader = new THREE.TextureLoader();
    const crumpleTex = texLoader.load(getAssetUrl('crumple.jpg'));
    crumpleTex.wrapS = THREE.RepeatWrapping;
    crumpleTex.wrapT = THREE.RepeatWrapping;
    this._material.uniforms.tCrumple.value = crumpleTex;

    const mesh = new THREE.Mesh(geo, this._material);
    mesh.frustumCulled = false;

    this._scene = new THREE.Scene();
    this._scene.add(mesh);
    this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  resize(w, h) {
    this._material.uniforms.uResolution.value.set(w, h);
  }

  render(target) {
    this._material.uniforms.tDiffuse.value = target.texture;
    this._material.uniforms.uTime.value = performance.now() * 0.001;

    // Render to screen (null target)
    this._renderer.setRenderTarget(null);
    this._renderer.clear();
    this._renderer.render(this._scene, this._camera);
  }

  setStyle(val) { this._material.uniforms.uStyle.value = val; }
  setHatchScale(val) { this._material.uniforms.uHatchScale.value = val; }
  setKuwaharaRadius(val) { this._material.uniforms.uKuwaharaRadius.value = val; }
  setColorPreservation(val) { this._material.uniforms.uColorPreservation.value = val; }
  setEdgeThreshold(val) { this._material.uniforms.uEdgeThreshold.value = val; }
  setWobbleIntensity(val) { this._material.uniforms.uWobbleIntensity.value = val; }

  dispose() {
    this._material.dispose();
  }
}

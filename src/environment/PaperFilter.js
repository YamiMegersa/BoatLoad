import * as THREE from 'three';

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

    // Pseudo-random noise function
    float rand(vec2 n) { 
      return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
    }

    // Value noise
    float noise(vec2 p){
      vec2 ip = floor(p);
      vec2 u = fract(p);
      u = u*u*(3.0-2.0*u);
      
      float res = mix(
        mix(rand(ip),rand(ip+vec2(1.0,0.0)),u.x),
        mix(rand(ip+vec2(0.0,1.0)),rand(ip+vec2(1.0,1.0)),u.x),u.y);
      return res*res;
    }

    // Fractal Brownian Motion
    float fbm(vec2 p) {
      float f = 0.0;
      f += 0.5000 * noise(p); p = p * 2.02;
      f += 0.2500 * noise(p); p = p * 2.03;
      f += 0.1250 * noise(p); p = p * 2.01;
      f += 0.0625 * noise(p);
      return f / 0.9375;
    }

    // Ridged noise for sharp creases
    float ridgedNoise(vec2 p) {
      float f = fbm(p);
      return 1.0 - abs(f * 2.0 - 1.0);
    }

    // Helper for Hatching
    float hatch(vec2 uv, float luma, float scale) {
      float h = 1.0;
      float hatchSpacing = scale * 50.0;
      
      // Hand-drawn wobble for the lines
      float lineWobble = fbm(uv * 40.0) * 0.4;
      
      float w1 = sin((uv.x + uv.y) * hatchSpacing + lineWobble);
      float w2 = sin((uv.x - uv.y) * hatchSpacing + lineWobble);
      float w3 = sin((uv.x + uv.y - 0.5) * hatchSpacing * 0.5 + lineWobble);
      float w4 = sin((uv.x - uv.y + 0.5) * hatchSpacing * 0.5 + lineWobble);
      
      // Thin lines
      float t = 0.8; 
      
      // Use higher thresholds so hatching doesn't trigger everywhere
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
    
    // Helper for Kuwahara
    vec3 kuwahara(sampler2D tex, vec2 uv, vec2 texel, int radius) {
      vec3 m[4];
      vec3 s[4];
      for (int k = 0; k < 4; ++k) {
        m[k] = vec3(0.0);
        s[k] = vec3(0.0);
      }
      
      int r = radius;
      float n = float((r + 1) * (r + 1));
      
      // We must use constant bounds for WebGL1 compatibility
      // We will loop from -5 to 5, but only process up to 'radius'
      for(int j = -5; j <= 5; ++j) {
        for(int i = -5; i <= 5; ++i) {
          if (abs(i) > r || abs(j) > r) continue;
          
          vec3 c = texture2D(tex, uv + vec2(float(i), float(j)) * texel).rgb;
          
          if (i <= 0 && j <= 0) { m[0] += c; s[0] += c * c; }
          if (i >= 0 && j <= 0) { m[1] += c; s[1] += c * c; }
          if (i >= 0 && j >= 0) { m[2] += c; s[2] += c * c; }
          if (i <= 0 && j >= 0) { m[3] += c; s[3] += c * c; }
        }
      }
      
      float min_sigma2 = 1e20;
      vec3 final_col = vec3(0.0);
      
      for (int k = 0; k < 4; ++k) {
        m[k] /= n;
        s[k] = abs(s[k] / n - m[k] * m[k]);
        float sigma2 = s[k].r + s[k].g + s[k].b;
        if (sigma2 < min_sigma2) {
          min_sigma2 = sigma2;
          final_col = m[k];
        }
      }
      return final_col;
    }

    void main() {
      // 1. Subtle UV Wobble (reduced intensity so it's less jarring)
      vec2 wobble = vec2(fbm(vUv * 15.0 + uTime * 0.05), fbm(vUv * 15.0 - uTime * 0.05)) * 2.0 - 1.0;
      vec2 uv = vUv + wobble * uWobbleIntensity;

      // 2. Base scene color & Shading Style
      vec2 texel = 1.0 / uResolution;
      vec4 baseColor;
      float shadingLuma = 1.0;
      float hatchMask = 1.0;
      
      if (uStyle == 1) {
        // Kuwahara Filter
        // Exaggerate radius by widening the texel step based on radius
        // This gives massive painterly blobs without increasing loop cost
        vec2 wideTexel = texel * (1.0 + float(uKuwaharaRadius) * 1.5);
        baseColor = vec4(kuwahara(tDiffuse, uv, wideTexel, uKuwaharaRadius), 1.0);
        shadingLuma = dot(baseColor.rgb, vec3(0.299, 0.587, 0.114));
      } else {
        // Hatching Filter
        baseColor = texture2D(tDiffuse, uv);
        float luma = dot(baseColor.rgb, vec3(0.299, 0.587, 0.114));
        hatchMask = hatch(vUv, luma, uHatchScale);
        shadingLuma = luma; // Keep original luma, we apply hatch mask later
      }
      
      // Base luma for edge detection
      float rawLuma = dot(texture2D(tDiffuse, uv).rgb, vec3(0.299, 0.587, 0.114));

      // 3. Edge Detection (Sobel) - Exaggerated for thicker sketch outlines
      // We sample further apart to create a thicker, bolder ink outline
      vec2 edgeTexel = 2.5 / uResolution;
      
      float s00 = dot(texture2D(tDiffuse, uv + vec2(-edgeTexel.x, -edgeTexel.y)).rgb, vec3(0.299, 0.587, 0.114));
      float s10 = dot(texture2D(tDiffuse, uv + vec2( 0.0,         -edgeTexel.y)).rgb, vec3(0.299, 0.587, 0.114));
      float s20 = dot(texture2D(tDiffuse, uv + vec2( edgeTexel.x, -edgeTexel.y)).rgb, vec3(0.299, 0.587, 0.114));
      
      float s01 = dot(texture2D(tDiffuse, uv + vec2(-edgeTexel.x,  0.0)).rgb, vec3(0.299, 0.587, 0.114));
      float s21 = dot(texture2D(tDiffuse, uv + vec2( edgeTexel.x,  0.0)).rgb, vec3(0.299, 0.587, 0.114));
      
      float s02 = dot(texture2D(tDiffuse, uv + vec2(-edgeTexel.x,  edgeTexel.y)).rgb, vec3(0.299, 0.587, 0.114));
      float s12 = dot(texture2D(tDiffuse, uv + vec2( 0.0,          edgeTexel.y)).rgb, vec3(0.299, 0.587, 0.114));
      float s22 = dot(texture2D(tDiffuse, uv + vec2( edgeTexel.x,  edgeTexel.y)).rgb, vec3(0.299, 0.587, 0.114));

      float sx = s00 + 2.0*s10 + s20 - (s02 + 2.0*s12 + s22);
      float sy = s00 + 2.0*s01 + s02 - (s20 + 2.0*s21 + s22);
      float edge = length(vec2(sx, sy)) * 1.5; // Boost edge intensity
      
      // Softer threshold for edges so they aren't so solid and blocky, but still prominent
      float edgeMask = smoothstep(uEdgeThreshold, uEdgeThreshold + 0.4, edge);

      // 4. Paper Base Color & Grain
      float paperNoise = fbm(vUv * uResolution * 0.2); // High freq noise
      vec3 paperBase = mix(uPaperColor, uPaperHighlight, paperNoise * 0.5);

      // 5. Sepia & Color Preservation
      vec3 sepiaColor;
      if (uStyle == 1) {
        // Kuwahara gets much brighter shading to act as a map background
        // Map the lower half of luma to mid-tones, keeping paper bright
        sepiaColor = mix(uInkColor, paperBase, shadingLuma * 0.7 + 0.3);
      } else {
        // Hatching needs to be much brighter overall (paper background)
        // Wash out the darks a bit so it's mostly paper
        sepiaColor = mix(uInkColor, paperBase, shadingLuma * 0.6 + 0.4); 
        // Apply the dark hatch lines
        sepiaColor = mix(uInkColor * 0.5, sepiaColor, hatchMask);
      }
      
      // Blend original colors back in to reduce monochromacity
      // Multiply original color by paper color to keep the warmth of the map
      vec3 tintedOriginal = baseColor.rgb * paperBase * 1.2;
      vec3 mixedColor = mix(sepiaColor, tintedOriginal, uColorPreservation); 
      
      // Apply bold ink edges (1.0 opacity for maximum pop)
      vec3 finalColor = mix(mixedColor, uInkColor, edgeMask);

      // 6. Subtle Vignette
      vec2 center = vUv - 0.5;
      float dist = length(center);
      float vNoise = fbm(vUv * 3.0) * 0.1;
      float vignette = smoothstep(0.8, 0.35, dist + vNoise);
      
      // Soften vignette darkness
      finalColor = mix(uInkColor * 0.3, finalColor, vignette);

      // 7. Static Crumple Texture
      // We read the red channel of the grayscale texture.
      // Zoom in slightly (0.1 to 0.9) to avoid the dark borders of the generated image.
      // We allow it to stretch with the screen to avoid repeating grid lines.
      vec2 crumpleUv = vUv * 0.8 + 0.1;
      float crumpleMap = texture2D(tCrumple, crumpleUv).r;
      
      // Isolate the dark creases. This texture is subtle, so we use a gentler threshold.
      // crumpleMap is mostly bright (~0.75-0.85) with faint darker fold lines (~0.5-0.7).
      float crumpleMask = smoothstep(0.8, 0.55, crumpleMap);
      
      // Apply gently — just a hint of darkening along the folds
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
    const crumpleTex = texLoader.load('/crumple.jpg');
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

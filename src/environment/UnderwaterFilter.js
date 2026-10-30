import * as THREE from 'three';

const UnderwaterShader = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uTime: { value: 0 },
    uSubmerged: { value: 0.0 }, // 0.0 = above water, 1.0 = fully underwater
    uWaterDepth: { value: 0.0 }, // depth in meters below waterline
    uDeepColor: { value: new THREE.Color(0x0a3c5a) }, // rich oceanic blue
    uShallowColor: { value: new THREE.Color(0x167b96) }, // vibrant turquoise/cyan near surface
    uRefractionStrength: { value: 0.012 },
    uChromaticAberration: { value: 0.0025 },
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
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uSubmerged;
    uniform float uWaterDepth;
    uniform vec3 uDeepColor;
    uniform vec3 uShallowColor;
    uniform float uRefractionStrength;
    uniform float uChromaticAberration;

    varying vec2 vUv;

    void main() {
      if (uSubmerged <= 0.0001) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }

      float aspect = uResolution.x / max(uResolution.y, 1.0);
      vec2 uvAspect = vec2(vUv.x * aspect, vUv.y);

      // Stable, calm wave refraction vectors
      float t = uTime * 1.2;
      float wave1 = sin(uvAspect.y * 8.0 + t * 0.9) * 0.5 + cos(uvAspect.x * 6.0 - t * 0.7) * 0.3;
      float wave2 = sin(uvAspect.x * 10.0 + uvAspect.y * 7.0 + t * 1.1) * 0.35 + cos(uvAspect.y * 12.0 - t * 1.3) * 0.25;

      vec2 refractionDir = vec2(wave1, wave2);
      vec2 offset = refractionDir * (uRefractionStrength * uSubmerged);

      // Chromatic dispersion (spectral separation of red, green, blue channels due to water refraction)
      float chroma = uChromaticAberration * uSubmerged;
      vec2 uvR = clamp(vUv + offset + vec2(chroma, chroma * 0.5), 0.001, 0.999);
      vec2 uvG = clamp(vUv + offset, 0.001, 0.999);
      vec2 uvB = clamp(vUv + offset - vec2(chroma, chroma * 0.5), 0.001, 0.999);

      float r = texture2D(tDiffuse, uvR).r;
      float g = texture2D(tDiffuse, uvG).g;
      float b = texture2D(tDiffuse, uvB).b;
      vec3 sceneColor = vec3(r, g, b);

      // Measure perceived scene luminance
      float sceneLuma = dot(sceneColor, vec3(0.299, 0.587, 0.114));

      // Color-graded aquatic tone: absorb red wavelengths while retaining greens and blues
      vec3 waterGraded = sceneColor * vec3(0.60, 0.90, 1.10);

      // Ambient underwater water color: vertical depth gradient (turquoise surface to deeper ocean blue)
      float depthGradient = clamp(vUv.y * 1.1, 0.0, 1.0);
      vec3 waterFogColor = mix(uDeepColor, uShallowColor, depthGradient);

      // Blend graded scene with water fog
      vec3 tinted = mix(waterGraded, waterFogColor, 0.40);

      // Soft luminance preservation: prevents underwater from crushing into darkness or flickering bright/dim
      float tintedLuma = dot(tinted, vec3(0.299, 0.587, 0.114));
      if (tintedLuma > 0.001) {
        tinted *= max(0.88, sceneLuma / tintedLuma * 0.95);
      }

      // Soft peripheral vignette: deeper blue at screen edges
      vec2 vignetteCoord = (vUv - 0.5) * vec2(aspect, 1.0);
      float vignette = smoothstep(1.3, 0.4, length(vignetteCoord));
      tinted = mix(uDeepColor * 0.7, tinted, vignette);

      // Final blend between original scene and underwater vision
      vec3 finalColor = mix(sceneColor, tinted, uSubmerged);

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `
};

export class UnderwaterFilter {
  constructor(renderer) {
    this._renderer = renderer;
    this._submerged = 0.0;
    this._isUnderwaterState = false;
    this._waterDepth = 0.0;
    this._time = 0.0;

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
      uniforms: THREE.UniformsUtils.clone(UnderwaterShader.uniforms),
      vertexShader: UnderwaterShader.vertexShader,
      fragmentShader: UnderwaterShader.fragmentShader,
      depthTest: false,
      depthWrite: false
    });

    const mesh = new THREE.Mesh(geo, this._material);
    mesh.frustumCulled = false;

    this._scene = new THREE.Scene();
    this._scene.add(mesh);
    this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  resize(w, h) {
    this._material.uniforms.uResolution.value.set(w, h);
  }

  /**
   * Updates underwater state with hysteresis and temporal smoothing
   * @param {number} delta - Frame delta time in seconds
   * @param {number} camY - Camera world Y coordinate
   * @param {number} waterY - Water surface world Y coordinate at camera (X, Z)
   */
  update(delta, camY, waterY) {
    this._time += delta;
    this._material.uniforms.uTime.value = this._time;

    const rawDepth = waterY - camY;

    // Hysteresis band to prevent rapid flickering at wave crests:
    // Enter water only when submerged by at least 0.04m;
    // Exit water only after clearing the water by 0.12m.
    if (this._isUnderwaterState) {
      if (rawDepth < -0.12) {
        this._isUnderwaterState = false;
      }
    } else {
      if (rawDepth > 0.04) {
        this._isUnderwaterState = true;
      }
    }

    // Smooth submersion amount (eliminates 1-frame strobe pops)
    const targetSubmerged = this._isUnderwaterState ? 1.0 : 0.0;
    const lerpSpeed = this._isUnderwaterState ? 8.0 : 5.0;
    this._submerged = THREE.MathUtils.lerp(this._submerged, targetSubmerged, Math.min(1.0, delta * lerpSpeed));
    this._material.uniforms.uSubmerged.value = this._submerged;

    // Smooth depth to prevent wave-height oscillations from pulsating tint density
    const targetDepth = Math.max(0.0, rawDepth);
    this._waterDepth = THREE.MathUtils.lerp(this._waterDepth, targetDepth, Math.min(1.0, delta * 4.0));
    this._material.uniforms.uWaterDepth.value = this._waterDepth;
  }

  get isSubmerged() {
    return this._submerged > 0.001;
  }

  get submergedAmount() {
    return this._submerged;
  }

  render(inputTarget, outputTarget = null) {
    this._material.uniforms.tDiffuse.value = inputTarget.texture;

    this._renderer.setRenderTarget(outputTarget);
    if (!outputTarget) {
      this._renderer.clear();
    }
    this._renderer.render(this._scene, this._camera);
  }

  setRefractionStrength(val) {
    this._material.uniforms.uRefractionStrength.value = val;
  }

  dispose() {
    this._material.dispose();
  }
}

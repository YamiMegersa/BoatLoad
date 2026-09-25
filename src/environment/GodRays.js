import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Screen-Space Volumetric Light Scattering (God Rays)
//
// Pipeline:
//  1. Render an OCCLUSION MASK at quarter-resolution:
//     - Everything in the scene is rendered pure black
//     - A bright sun disc is rendered where the directional light is
//  2. Run a RADIAL BLUR shader that smears the bright sun outward
//  3. COMPOSITE the blurred rays additively onto the beauty render
// ---------------------------------------------------------------------------

/**
 * Radial-blur shader for light scattering.
 * Samples along a ray from each pixel toward the sun's screen-space position.
 */
const VolumetricScatterShader = {
  uniforms: {
    tDiffuse:   { value: null },
    uSunScreen: { value: new THREE.Vector2(0.5, 0.5) },
    uDensity:   { value: 1.2 },   // Increased density for wider spread
    uWeight:    { value: 0.15 },  // Increased weight for stronger initial rays
    uDecay:     { value: 0.98 },  // 0.98 makes rays stretch much further across the screen
    uSamples:   { value: 64 },
    uExposure:  { value: 2.5 },   // Blinding exposure multiplier
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
    uniform vec2  uSunScreen;
    uniform float uDensity;
    uniform float uWeight;
    uniform float uDecay;
    uniform int   uSamples;
    uniform float uExposure;

    varying vec2 vUv;

    void main() {
      vec2 texCoord = vUv;
      vec2 delta    = (texCoord - uSunScreen);
      delta *= 1.0 / float(uSamples) * uDensity;

      float illuminationDecay = 1.0;
      vec3 color = vec3(0.0);

      // Increased loop bound from 32 to 64 to allow more samples
      for (int i = 0; i < 64; i++) {
        if (i >= uSamples) break;
        texCoord -= delta;
        vec3 samp = texture2D(tDiffuse, texCoord).rgb;
        samp *= illuminationDecay * uWeight;
        color += samp;
        illuminationDecay *= uDecay;
      }

      gl_FragColor = vec4(color * uExposure, 1.0);
    }
  `
};

/**
 * Additive composite shader: blends god rays on top of the beauty pass.
 */
const AdditiveOverlayShader = {
  uniforms: {
    tAdd:      { value: null },
    uTint:     { value: new THREE.Vector3(1.0, 0.95, 0.8) },
    uStrength: { value: 1.0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tAdd;
    uniform vec3  uTint;
    uniform float uStrength;

    varying vec2 vUv;

    void main() {
      vec4 add  = texture2D(tAdd,  vUv);
      gl_FragColor = vec4(add.rgb * uTint * uStrength, 1.0);
    }
  `
};

/**
 * Screen-space radial glow for the occlusion pass.
 * This guarantees that even if the sun is physically off-screen, a massive
 * radial glow bleeds into the screen, giving the radial blur something to streak.
 */
const GlowShader = {
  uniforms: {
    uSunScreen: { value: new THREE.Vector2(0.5, 0.5) },
    uAspect:    { value: 1.0 },
    uRadius:    { value: 2.5 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      // Render in the background (z=1.0)
      gl_Position = vec4(position.xy, 1.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform vec2 uSunScreen;
    uniform float uAspect;
    uniform float uRadius;
    varying vec2 vUv;

    void main() {
      vec2 d = vUv - uSunScreen;
      d.x *= uAspect;
      float dist = length(d);
      
      // Massive soft glow that bleeds into the screen
      float intensity = pow(clamp(1.0 - dist / uRadius, 0.0, 1.0), 2.5);
      
      // Hot core
      intensity += pow(clamp(1.0 - dist / (uRadius * 0.03), 0.0, 1.0), 5.0) * 10.0;
      
      gl_FragColor = vec4(vec3(intensity), 1.0);
    }
  `
};

// Reusable fullscreen triangle (more efficient than a quad)
function createFSQuad(material) {
  const geo = new THREE.BufferGeometry();
  // A single triangle that covers the full clip-space [-1,1]
  const verts = new Float32Array([
    -1, -1, 0,   3, -1, 0,   -1, 3, 0
  ]);
  const uvs = new Float32Array([
    0, 0,   2, 0,   0, 2
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  return mesh;
}


export class GodRays {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene}         scene
   * @param {THREE.Camera}        camera
   */
  constructor(renderer, scene, camera) {
    this._renderer = renderer;
    this._scene    = scene;
    this._camera   = camera;

    const size = renderer.getSize(new THREE.Vector2());
    const pr   = renderer.getPixelRatio();
    const fw   = Math.floor(size.x * pr);
    const fh   = Math.floor(size.y * pr);
    const qw   = Math.max(1, Math.floor(fw * 0.25));
    const qh   = Math.max(1, Math.floor(fh * 0.25));

    // --- Sun billboard (rendered into both beauty pass and occlusion mask) ---
    // Enormous billboard for exaggerated god rays
    const sunGeo = new THREE.PlaneGeometry(120, 120);
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    this._sunBillboard = new THREE.Mesh(sunGeo, sunMat);
    this._sunBillboard.frustumCulled = false;
    // Render after most opaque objects
    this._sunBillboard.renderOrder = 999;

    // A tiny scene that contains only the sun billboard
    this._sunScene = new THREE.Scene();
    this._sunScene.add(this._sunBillboard);

    // --- Render Targets ---
    // Only need quarter-res targets for the rays
    this._occlusionRT = new THREE.WebGLRenderTarget(qw, qh, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    this._scatterRT = new THREE.WebGLRenderTarget(qw, qh, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    // --- Black override material ---
    this._blackMat = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });

    // --- Shader materials ---
    this._glowMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(GlowShader.uniforms),
      vertexShader: GlowShader.vertexShader,
      fragmentShader: GlowShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });

    this._scatterMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(VolumetricScatterShader.uniforms),
      vertexShader: VolumetricScatterShader.vertexShader,
      fragmentShader: VolumetricScatterShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });

    this._additiveMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(AdditiveOverlayShader.uniforms),
      vertexShader: AdditiveOverlayShader.vertexShader,
      fragmentShader: AdditiveOverlayShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.AdditiveBlending,
    });

    // --- Fullscreen quads ---
    this._glowQuad      = createFSQuad(this._glowMat);
    this._scatterQuad   = createFSQuad(this._scatterMat);
    this._additiveQuad  = createFSQuad(this._additiveMat);

    // Ortho camera for fullscreen passes
    this._orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this._glowScene = new THREE.Scene();
    this._glowScene.add(this._glowQuad);
    this._scatterScene   = new THREE.Scene();
    this._scatterScene.add(this._scatterQuad);
    this._additiveScene = new THREE.Scene();
    this._additiveScene.add(this._additiveQuad);

    // Temp vectors (avoid per-frame allocation)
    this._tempV4 = new THREE.Vector4();
  }

  /**
   * Resize all render targets when the window changes.
   */
  resize(w, h) {
    const pr = this._renderer.getPixelRatio();
    const fw = Math.floor(w * pr);
    const fh = Math.floor(h * pr);
    const qw = Math.max(1, Math.floor(fw * 0.25));
    const qh = Math.max(1, Math.floor(fh * 0.25));

    this._glowMat.uniforms.uAspect.value = w / h;
    this._occlusionRT.setSize(qw, qh);
    this._scatterRT.setSize(qw, qh);
  }

  /**
   * Render the complete frame with god rays.
   * Call this INSTEAD of renderer.render(scene, camera).
   *
   * @param {THREE.DirectionalLight} sunLight  The scene's directional sun light
   */
  render(sunLight) {
    const renderer = this._renderer;
    const scene    = this._scene;
    const camera   = this._camera;

    // Fallback: if no sun light, just render normally
    if (!sunLight) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      return;
    }

    const sunY = sunLight.position.y;

    // Sun well below horizon — skip god rays for performance
    if (sunY < -5) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      return;
    }

    // Fade strength near horizon
    const horizonFade = THREE.MathUtils.clamp(sunY / 20, 0, 1);

    // --- Compute virtual sun position (infinitely far away) ---
    const sunDir = sunLight.position.clone().normalize();

    // --- Smoothly fade out when sun is near or off the edge of the screen ---
    // IMPORTANT: compute the dot product BEFORE multiplyScalar mutates sunDir
    const cameraForward = new THREE.Vector3();
    camera.getWorldDirection(cameraForward);
    const sunDot = cameraForward.dot(sunDir);  // both unit vectors → result in [-1, 1]
    // God rays should be visible even when the sun is off-screen — the radial blur
    // shader naturally streaks light in from the edge of the viewport.  We only need
    // to fade out once the sun goes behind the camera (sunDot < 0).
    // Fade: fully off at sunDot = -0.3  →  fully on at sunDot = 0.2
    const angleFade = THREE.MathUtils.smoothstep(sunDot, -0.3, 0.2);
    const finalStrength = horizonFade * angleFade;

    const virtualSunPos = camera.position.clone().add(sunDir.multiplyScalar(camera.far * 0.9));

    // --- Compute sun screen-space UV ---
    this._tempV4.set(
      virtualSunPos.x,
      virtualSunPos.y,
      virtualSunPos.z,
      1.0
    );
    this._tempV4.applyMatrix4(camera.matrixWorldInverse);
    this._tempV4.applyMatrix4(camera.projectionMatrix);

    // =====================================================================
    // Pass 1: Render the normal scene DIRECTLY to the screen
    // =====================================================================
    const currentAutoClear = renderer.autoClear;
    renderer.setRenderTarget(null);
    renderer.autoClear = true;
    renderer.render(scene, camera);

    // Position the sun billboard for both passes
    this._sunBillboard.position.copy(virtualSunPos);
    this._sunBillboard.lookAt(camera.position);

    // If sun is behind the camera or too weak, we are done! 
    // The scene is already on the screen perfectly.
    if (this._tempV4.w <= 0 || finalStrength <= 0.001) {
      renderer.autoClear = currentAutoClear;
      return;
    }

    // Render the sun billboard into the beauty pass (tinted to sun color)
    renderer.autoClear = false;
    this._sunBillboard.material.color.copy(sunLight.color);
    renderer.render(this._sunScene, camera);

    const ndcX = this._tempV4.x / this._tempV4.w;
    const ndcY = this._tempV4.y / this._tempV4.w;
    const sunUV_x = ndcX * 0.5 + 0.5;
    const sunUV_y = ndcY * 0.5 + 0.5;

    // =====================================================================
    // Pass 2: Occlusion mask (quarter resolution)
    //   - Glow rendered in background
    //   - Scene rendered as black silhouettes on top
    // =====================================================================
    const savedBg       = scene.background;
    const savedFog      = scene.fog;
    const savedOverride = scene.overrideMaterial;

    scene.background      = null;
    scene.fog             = null;
    scene.overrideMaterial = this._blackMat;

    renderer.setRenderTarget(this._occlusionRT);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();

    // 1. Render the 2D radial glow in the background
    this._glowMat.uniforms.uSunScreen.value.set(sunUV_x, sunUV_y);
    renderer.autoClear = false;
    renderer.render(this._glowScene, this._orthoCamera);

    // 2. Render the scene as black silhouettes on top
    // They will draw black over the glow anywhere there is a solid object
    renderer.render(scene, camera);

    // Restore scene state immediately
    scene.background      = savedBg;
    scene.fog             = savedFog;
    scene.overrideMaterial = savedOverride;

    // Restore clear color
    renderer.setClearColor(0x000000, 0);

    // =====================================================================
    // Pass 3: Radial blur (quarter resolution)
    // =====================================================================
    this._scatterMat.uniforms.tDiffuse.value    = this._occlusionRT.texture;
    this._scatterMat.uniforms.uSunScreen.value.set(sunUV_x, sunUV_y);

    renderer.setRenderTarget(this._scatterRT);
    renderer.clear();
    renderer.render(this._scatterScene, this._orthoCamera);

    // =====================================================================
    // Pass 4: Overlay directly onto the screen (Additive Blending)
    // =====================================================================
    this._additiveMat.uniforms.tAdd.value      = this._scatterRT.texture;
    this._additiveMat.uniforms.uStrength.value = finalStrength;

    // Tint the rays to match the directional light color
    const sc = sunLight.color;
    this._additiveMat.uniforms.uTint.value.set(sc.r, sc.g, sc.b);

    renderer.setRenderTarget(null);
    renderer.autoClear = false; // Important: do not clear the base scene!
    renderer.render(this._additiveScene, this._orthoCamera);
    
    // Restore
    renderer.autoClear = currentAutoClear;
  }

  dispose() {
    this._occlusionRT?.dispose();
    this._scatterRT?.dispose();
    this._sunBillboard?.geometry.dispose();
    this._sunBillboard?.material.dispose();
    this._blackMat?.dispose();
    this._scatterMat?.dispose();
    this._additiveMat?.dispose();
    this._scatterQuad?.geometry.dispose();
    this._additiveQuad?.geometry.dispose();
  }
}

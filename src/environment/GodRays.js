import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Screen-Space Volumetric Light Scattering (God Rays for Sun & Moon)
//
// Pipeline:
//  1. Render base beauty pass
//  2. Render celestial billboards (Sun and/or Moon)
//  3. Render OCCLUSION MASK at quarter-resolution:
//     - Everything in the scene is rendered pure black
//     - A bright radial glow is rendered where the active celestial body is
//  4. Run a RADIAL BLUR shader that smears the bright light outward
//  5. COMPOSITE the blurred rays additively onto the beauty render
// ---------------------------------------------------------------------------

/**
 * Radial-blur shader for light scattering.
 * Samples along a ray from each pixel toward the celestial body's screen-space position.
 */
const VolumetricScatterShader = {
  uniforms: {
    tDiffuse:   { value: null },
    uSunScreen: { value: new THREE.Vector2(0.5, 0.5) },
    uDensity:   { value: 1.05 },
    uWeight:    { value: 0.085 },
    uDecay:     { value: 0.97 },
    uSamples:   { value: 64 },
    uExposure:  { value: 0.85 },
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
      vec2 rayDir = (texCoord - uSunScreen);
      
      // Step size along the light ray towards the sun position
      vec2 delta = rayDir * (1.0 / float(uSamples)) * uDensity;
      
      // Limit maximum step length to prevent wild sampling jumps when sun is far away
      float maxStep = 0.06;
      float stepLen = length(delta);
      if (stepLen > maxStep) {
        delta *= (maxStep / stepLen);
      }

      float illuminationDecay = 1.0;
      vec3 color = vec3(0.0);

      for (int i = 0; i < 64; i++) {
        if (i >= uSamples) break;
        texCoord -= delta;
        
        // Strict boundary check: never sample clamped render target borders
        float inBounds = step(0.0, texCoord.x) * step(texCoord.x, 1.0) *
                         step(0.0, texCoord.y) * step(texCoord.y, 1.0);
        
        vec3 samp = texture2D(tDiffuse, texCoord).rgb * inBounds;
        color += samp * (illuminationDecay * uWeight);
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
      vec3 rays = add.rgb * uTint * uStrength;
      
      // Contrast shaping: sharpens light shafts against ambient sky and ocean
      // Faint background scatter stays subtle while focused light shafts pop boldly
      rays = pow(rays, vec3(1.12)) * 1.35;
      
      // Filmic soft-knee compression (Reinhard curve):
      // Smoothly rolls off extreme core highlights so looking toward the sun
      // never blows out the scene to flat white, while letting rays be punchy and clear
      rays = rays / (1.0 + rays * 0.40);
      
      gl_FragColor = vec4(rays, 1.0);
    }
  `
};

/**
 * Screen-space radial glow for the occlusion pass.
 */
const GlowShader = {
  uniforms: {
    uSunScreen:  { value: new THREE.Vector2(0.5, 0.5) },
    uAspect:     { value: 1.0 },
    uRadius:     { value: 0.5 },
    uCoreRadius: { value: 0.08 },
    uCorePower:  { value: 3.0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 1.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform vec2 uSunScreen;
    uniform float uAspect;
    uniform float uRadius;
    uniform float uCoreRadius;
    uniform float uCorePower;
    varying vec2 vUv;

    void main() {
      vec2 d = vUv - uSunScreen;
      d.x *= uAspect;
      float dist = length(d);
      
      // Zero out anything outside uRadius so rays never flood or wash out the entire screen
      if (dist >= uRadius) {
        gl_FragColor = vec4(0.0);
        return;
      }
      
      float normDist = dist / uRadius;
      float falloff = (1.0 - normDist);
      float intensity = falloff * falloff * falloff;
      
      // Focused core around the celestial disc
      if (dist < uCoreRadius) {
        float coreT = 1.0 - dist / uCoreRadius;
        intensity += pow(coreT, 2.5) * uCorePower;
      }
      
      gl_FragColor = vec4(vec3(intensity), 1.0);
    }
  `
};

/**
 * High-quality procedural lunar disc shader.
 * Renders an ethereal, luminous Moon with spherical shading, basalt maria, crater contours, and a soft corona halo.
 */
const MoonShader = {
  uniforms: {
    uColor:     { value: new THREE.Color(0xdceaff) },
    uGlowColor: { value: new THREE.Color(0x73a5e8) },
    uOpacity:   { value: 1.0 }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform vec3 uColor;
    uniform vec3 uGlowColor;
    uniform float uOpacity;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
                 mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
    }
    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p *= 2.0;
        a *= 0.5;
      }
      return v;
    }

    void main() {
      vec2 center = vUv - vec2(0.5);
      float dist = length(center) * 2.0; // 0 at center, 1 at edge of quad

      float discR = 0.58; // Lunar physical radius

      if (dist <= discR) {
        float normDist = dist / discR;
        float z = sqrt(max(0.0, 1.0 - normDist * normDist));
        vec2 sphereCoord = center / discR * 0.95;

        // Maria (lunar seas) and crater texture
        float maria = fbm(sphereCoord * 4.2 + vec2(1.5, 0.8));
        float craters = fbm(sphereCoord * 11.5 + vec2(0.3, 0.4));

        vec3 highlandCol = uColor * 0.85;
        vec3 mareCol = uColor * vec3(0.36, 0.44, 0.56);

        vec3 surface = mix(highlandCol, mareCol, smoothstep(0.38, 0.65, maria));
        surface -= (1.0 - smoothstep(0.25, 0.65, craters)) * 0.15;

        // Spherical limb darkening
        float limb = pow(z, 0.4);
        surface *= (0.65 + 0.35 * limb);

        // Smooth antialiased outer rim
        float alpha = smoothstep(discR, discR - 0.02, dist) * uOpacity;
        gl_FragColor = vec4(surface, alpha);
      } else {
        // Ethereal lunar atmospheric corona / halo
        float haloDist = (dist - discR) / (1.0 - discR);
        float haloAlpha = pow(clamp(1.0 - haloDist, 0.0, 1.0), 3.2) * 0.35 * uOpacity;
        float rimGlow = pow(clamp(1.0 - haloDist * 3.0, 0.0, 1.0), 3.5) * 0.25 * uOpacity;
        vec3 haloCol = mix(uGlowColor, uColor, rimGlow);
        gl_FragColor = vec4(haloCol, (haloAlpha + rimGlow) * uOpacity);
      }
    }
  `
};

// Reusable fullscreen triangle (more efficient than a quad)
function createFSQuad(material) {
  const geo = new THREE.BufferGeometry();
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
    this.enabled   = true;

    const size = renderer.getSize(new THREE.Vector2());
    const pr   = renderer.getPixelRatio();
    const fw   = Math.floor(size.x * pr);
    const fh   = Math.floor(size.y * pr);
    const qw   = Math.max(1, Math.floor(fw * 0.25));
    const qh   = Math.max(1, Math.floor(fh * 0.25));

    // --- Sun billboard (rendered into beauty pass) ---
    // Radiant sun disc with soft edge falloff that illuminates the sky naturally
    const sunGeo = new THREE.PlaneGeometry(76, 76);
    const sunMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0xffffff) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          // Circular gradient with smooth falloff
          float dist = length(vUv - 0.5) * 2.0;
          float alpha = pow(clamp(1.0 - dist, 0.0, 1.0), 2.5) * 0.85;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    this._sunBillboard = new THREE.Mesh(sunGeo, sunMat);
    this._sunBillboard.frustumCulled = false;
    this._sunBillboard.renderOrder = 999;
    this._sunScene = new THREE.Scene();
    this._sunScene.add(this._sunBillboard);

    // --- Moon Billboard ---
    const moonGeo = new THREE.PlaneGeometry(65, 65);
    const moonMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(MoonShader.uniforms),
      vertexShader: MoonShader.vertexShader,
      fragmentShader: MoonShader.fragmentShader,
      transparent: true,
      blending: THREE.NormalBlending,
      depthTest: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    this._moonBillboard = new THREE.Mesh(moonGeo, moonMat);
    this._moonBillboard.frustumCulled = false;
    this._moonBillboard.renderOrder = 998;
    this._moonScene = new THREE.Scene();
    this._moonScene.add(this._moonBillboard);

    // --- Render Targets (Quarter resolution) ---
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

    // Cache of objects hidden during the occlusion mask pass to prevent garbage allocation
    this._hiddenForOcclusion = [];

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

    // Fullscreen quads
    this._glowQuad     = createFSQuad(this._glowMat);
    this._scatterQuad  = createFSQuad(this._scatterMat);
    this._additiveQuad = createFSQuad(this._additiveMat);

    this._orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this._glowScene = new THREE.Scene();
    this._glowScene.add(this._glowQuad);
    this._scatterScene = new THREE.Scene();
    this._scatterScene.add(this._scatterQuad);
    this._additiveScene = new THREE.Scene();
    this._additiveScene.add(this._additiveQuad);

    this._tempV4 = new THREE.Vector4();
  }

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
   * Render the complete frame with God Rays for either Sun or Moon.
   *
   * @param {THREE.DirectionalLight} sunLight
   * @param {THREE.DirectionalLight|THREE.WebGLRenderTarget} [moonLightOrRT=null]
   * @param {THREE.WebGLRenderTarget} [renderTarget=null]
   */
  render(sunLight, moonLightOrRT = null, renderTarget = null) {
    const renderer = this._renderer;
    const scene    = this._scene;
    const camera   = this._camera;

    // Handle flexible argument signatures: render(sun, target) vs render(sun, moon, target)
    let moonLight = null;
    let target = renderTarget;

    if (moonLightOrRT) {
      if (moonLightOrRT.isWebGLRenderTarget || !moonLightOrRT.isDirectionalLight) {
        target = moonLightOrRT;
      } else {
        moonLight = moonLightOrRT;
      }
    }

    // Determine active celestial caster
    const sunY = sunLight ? sunLight.position.y : -999;
    const moonY = moonLight ? moonLight.position.y : -999;

    let activeLight = null;
    let isMoon = false;

    // Sun takes precedence during day/dusk/dawn when above horizon
    if (sunLight && sunY >= -2) {
      activeLight = sunLight;
      isMoon = false;
    } else if (moonLight && moonY >= -5) {
      activeLight = moonLight;
      isMoon = true;
    } else if (sunLight && sunY >= -5) {
      activeLight = sunLight;
      isMoon = false;
    }

    // If god rays are disabled, render the standard scene + celestial billboards and return
    if (!this.enabled) {
      const currentAutoClear = renderer.autoClear;
      renderer.setRenderTarget(target);
      renderer.autoClear = true;
      renderer.render(scene, camera);

      renderer.autoClear = false;
      if (sunLight && sunY > -5) {
        const sunDir = sunLight.position.clone().normalize();
        const virtualSunPos = camera.position.clone().add(sunDir.multiplyScalar(camera.far * 0.9));
        this._sunBillboard.position.copy(virtualSunPos);
        this._sunBillboard.lookAt(camera.position);
        this._sunBillboard.material.uniforms.uColor.value.copy(sunLight.color);
        renderer.render(this._sunScene, camera);
      }
      if (moonLight && moonY > -5) {
        const mDir = moonLight.position.clone().normalize();
        const virtualMoonPos = camera.position.clone().add(mDir.multiplyScalar(camera.far * 0.9));
        this._moonBillboard.position.copy(virtualMoonPos);
        this._moonBillboard.lookAt(camera.position);

        const moonAlt = THREE.MathUtils.clamp((moonY + 5) / 25, 0, 1);
        this._moonBillboard.material.uniforms.uOpacity.value = moonAlt;
        this._moonBillboard.material.uniforms.uColor.value.copy(moonLight.color);
        renderer.render(this._moonScene, camera);
      }
      renderer.autoClear = currentAutoClear;
      return;
    }

    // If neither celestial body is visible above -5 Y, render standard scene and return
    if (!activeLight) {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      return;
    }

    const celestialY = activeLight.position.y;
    const horizonFade = THREE.MathUtils.clamp((celestialY + 5) / 25, 0, 1);

    const celestialDir = activeLight.position.clone().normalize();

    // Check angle towards camera
    const cameraForward = new THREE.Vector3();
    camera.getWorldDirection(cameraForward);
    const celestialDot = cameraForward.dot(celestialDir);
    const angleFade = THREE.MathUtils.smoothstep(celestialDot, 0.08, 0.45);
    const finalStrength = horizonFade * angleFade;

    const virtualCelestialPos = camera.position.clone().add(celestialDir.clone().multiplyScalar(camera.far * 0.9));

    // Project to screen space UV
    this._tempV4.set(
      virtualCelestialPos.x,
      virtualCelestialPos.y,
      virtualCelestialPos.z,
      1.0
    );
    this._tempV4.applyMatrix4(camera.matrixWorldInverse);
    this._tempV4.applyMatrix4(camera.projectionMatrix);

    // =====================================================================
    // Pass 1: Render the normal scene DIRECTLY to the screen/target
    // =====================================================================
    const currentAutoClear = renderer.autoClear;
    renderer.setRenderTarget(target);
    renderer.autoClear = true;
    renderer.render(scene, camera);

    // Position and render celestial billboards into beauty pass
    renderer.autoClear = false;

    // 1a. If Sun is above horizon, render sun billboard
    if (sunLight && sunY > -5) {
      const sunDir = sunLight.position.clone().normalize();
      const virtualSunPos = camera.position.clone().add(sunDir.multiplyScalar(camera.far * 0.9));
      this._sunBillboard.position.copy(virtualSunPos);
      this._sunBillboard.lookAt(camera.position);
      this._sunBillboard.material.uniforms.uColor.value.copy(sunLight.color);
      renderer.render(this._sunScene, camera);
    }

    // 1b. If Moon is above horizon, render majestic moon billboard
    if (moonLight && moonY > -5) {
      const mDir = moonLight.position.clone().normalize();
      const virtualMoonPos = camera.position.clone().add(mDir.multiplyScalar(camera.far * 0.9));
      this._moonBillboard.position.copy(virtualMoonPos);
      this._moonBillboard.lookAt(camera.position);

      const moonAlt = THREE.MathUtils.clamp((moonY + 5) / 25, 0, 1);
      this._moonBillboard.material.uniforms.uOpacity.value = moonAlt;
      this._moonBillboard.material.uniforms.uColor.value.copy(moonLight.color);
      renderer.render(this._moonScene, camera);
    }

    // If celestial body is behind camera or too weak, we are done!
    if (this._tempV4.w <= 0 || finalStrength <= 0.001) {
      renderer.autoClear = currentAutoClear;
      return;
    }

    const ndcX = this._tempV4.x / this._tempV4.w;
    const ndcY = this._tempV4.y / this._tempV4.w;
    const screenUV_x = ndcX * 0.5 + 0.5;
    const screenUV_y = ndcY * 0.5 + 0.5;

    // =====================================================================
    // Pass 2: Occlusion mask (quarter resolution)
    // =====================================================================
    const savedBg       = scene.background;
    const savedFog      = scene.fog;
    const savedOverride = scene.overrideMaterial;

    scene.background       = null;
    scene.fog              = null;
    scene.overrideMaterial = this._blackMat;

    renderer.setRenderTarget(this._occlusionRT);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();

    // 2a. Render radial glow centered on celestial body
    this._glowMat.uniforms.uSunScreen.value.set(screenUV_x, screenUV_y);
    if (isMoon) {
      this._glowMat.uniforms.uRadius.value     = 0.30;
      this._glowMat.uniforms.uCoreRadius.value = 0.05;
      this._glowMat.uniforms.uCorePower.value  = 2.0;
    } else {
      this._glowMat.uniforms.uRadius.value     = 0.55;
      this._glowMat.uniforms.uCoreRadius.value = 0.09;
      this._glowMat.uniforms.uCorePower.value  = 4.0;
    }
    renderer.autoClear = false;
    renderer.render(this._glowScene, this._orthoCamera);

    // Temporarily hide race markers and non-occluding objects so they do not block
    // the sun or produce god ray streaks/shadows in the occlusion mask.
    this._hiddenForOcclusion.length = 0;
    scene.traverse(obj => {
      if (
        obj.visible &&
        (obj.userData?.noGodRays ||
         obj.userData?.noOcclusion ||
         obj.userData?.isRaceMarker ||
         obj.userData?.isWaypoint)
      ) {
        obj.visible = false;
        this._hiddenForOcclusion.push(obj);
      }
    });

    // 2. Render the scene as black silhouettes on top
    // They will draw black over the glow anywhere there is a solid object
    renderer.render(scene, camera);

    // Restore hidden objects immediately
    for (let i = 0; i < this._hiddenForOcclusion.length; i++) {
      this._hiddenForOcclusion[i].visible = true;
    }

    // Restore scene state
    scene.background       = savedBg;
    scene.fog              = savedFog;
    scene.overrideMaterial = savedOverride;
    renderer.setClearColor(0x000000, 0);

    // =====================================================================
    // Pass 3: Radial blur (quarter resolution)
    // =====================================================================
    this._scatterMat.uniforms.tDiffuse.value   = this._occlusionRT.texture;
    this._scatterMat.uniforms.uSunScreen.value.set(screenUV_x, screenUV_y);
    this._scatterMat.uniforms.uExposure.value = isMoon ? 0.85 : 1.8;
    this._scatterMat.uniforms.uWeight.value   = isMoon ? 0.055 : 0.12;
    this._scatterMat.uniforms.uDecay.value    = isMoon ? 0.965 : 0.975;

    renderer.setRenderTarget(this._scatterRT);
    renderer.clear();
    renderer.render(this._scatterScene, this._orthoCamera);

    // =====================================================================
    // Pass 4: Overlay directly onto beauty render (Additive Blending)
    // =====================================================================
    this._additiveMat.uniforms.tAdd.value      = this._scatterRT.texture;
    this._additiveMat.uniforms.uStrength.value = finalStrength * (isMoon ? 0.35 : 0.75);

    if (isMoon) {
      // Ethereal silver-blue lunar rays (soft and atmospheric)
      const mc = activeLight.color;
      this._additiveMat.uniforms.uTint.value.set(mc.r * 0.9, mc.g * 0.95, mc.b * 1.05);
    } else {
      // Warm golden sun rays with rich golden vibrance
      const sc = activeLight.color;
      this._additiveMat.uniforms.uTint.value.set(
        Math.min(1.2, sc.r * 1.15),
        Math.min(1.1, sc.g * 1.08),
        Math.min(1.0, sc.b * 0.95)
      );
    }

    renderer.setRenderTarget(target);
    renderer.autoClear = false;
    renderer.render(this._additiveScene, this._orthoCamera);

    // Restore renderer autoClear
    renderer.autoClear = currentAutoClear;
  }

  dispose() {
    this._occlusionRT?.dispose();
    this._scatterRT?.dispose();
    this._sunBillboard?.geometry.dispose();
    this._sunBillboard?.material.dispose();
    this._moonBillboard?.geometry.dispose();
    this._moonBillboard?.material.dispose();
    this._blackMat?.dispose();
    this._scatterMat?.dispose();
    this._additiveMat?.dispose();
    this._scatterQuad?.geometry.dispose();
    this._additiveQuad?.geometry.dispose();
  }
}

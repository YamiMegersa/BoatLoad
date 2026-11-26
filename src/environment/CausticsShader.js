import * as THREE from 'three';

/**
 * Shared uniform dictionary for underwater caustics.
 * All materials using caustics reference these shared uniform values.
 */
export const CausticUniforms = {
  uCausticTime: { value: 0 },
  uCausticIntensity: { value: 0.85 },
  uCausticScale: { value: 0.35 },
  uCausticSpeed: { value: 1.0 },
  uWaterLevel: { value: -0.5 },
  uSunDir: { value: new THREE.Vector3(10, 20, 10).normalize() },
  uCausticColor: { value: new THREE.Color(0xb2f5ea) } // Pale turquoise sunlight
};

/**
 * GLSL helper functions for sampling animated caustics with chromatic dispersion
 * and Beer-Lambert depth extinction.
 */
export const CausticGLSL = /* glsl */ `
  uniform float uCausticTime;
  uniform float uCausticIntensity;
  uniform float uCausticScale;
  uniform float uCausticSpeed;
  uniform float uWaterLevel;
  uniform vec3 uSunDir;
  uniform vec3 uCausticColor;

  float sampleCausticPattern(vec2 pos, float t) {
    vec2 p = pos * uCausticScale;
    float c1 = sin(p.x * 1.8 + t * 1.2) + cos(p.y * 1.8 + t * 1.0);
    float c2 = sin(p.x * 2.6 - t * 0.8) + cos(p.y * 2.6 + t * 1.1);
    float c3 = sin((p.x + p.y) * 3.8 + t * 1.6) * 0.5;
    return pow(smoothstep(0.1, 1.6, c1 + c2 + c3), 2.4);
  }

  vec3 computeCaustic(vec3 worldPos, vec3 normalW) {
    // Only apply beneath the water surface
    float depth = uWaterLevel - worldPos.y;
    if (depth <= 0.0) return vec3(0.0);

    // Beer-Lambert depth extinction
    float depthFade = exp(-0.45 * depth);
    if (depthFade < 0.01) return vec3(0.0);

    // Surface normal orientation: upward-facing surfaces receive maximum sunlight
    float normalFacing = clamp(dot(normalW, normalize(vec3(uSunDir.x, 20.0, uSunDir.z))), 0.0, 1.0);
    if (normalFacing < 0.05) return vec3(0.0);

    // Project coordinates along sunlight direction into the water
    vec2 causticPos = worldPos.xz - (uSunDir.xz / max(uSunDir.y, 0.1)) * depth * 0.25;
    float t = uCausticTime * uCausticSpeed;

    // Chromatic dispersion (RGB phase separation)
    vec2 dispersion = vec2(0.035, 0.035);
    float r = sampleCausticPattern(causticPos - dispersion, t);
    float g = sampleCausticPattern(causticPos, t);
    float b = sampleCausticPattern(causticPos + dispersion, t);

    return vec3(r, g, b) * uCausticColor * (depthFade * normalFacing * uCausticIntensity);
  }
`;

/**
 * Update the caustics simulation time. Call once per frame (e.g. from Ocean or Game loop).
 * @param {number} delta Seconds elapsed since last frame.
 */
export function updateCaustics(delta) {
  CausticUniforms.uCausticTime.value += delta;
}

/**
 * Helper to apply the animated caustic effect to a Three.js material via onBeforeCompile.
 * @param {THREE.Material} material
 * @param {object} [options]
 * @param {number} [options.multiplier=1.0] Intensity multiplier for this specific material
 */
export function applyCausticsToMaterial(material, options = {}) {
  if (!material) return;
  const multiplier = options.multiplier !== undefined ? options.multiplier : 1.0;

  const origOnBeforeCompile = material.onBeforeCompile ? material.onBeforeCompile.bind(material) : null;

  material.onBeforeCompile = (shader, renderer) => {
    if (origOnBeforeCompile) origOnBeforeCompile(shader, renderer);

    // Bind caustic uniforms
    shader.uniforms.uCausticTime = CausticUniforms.uCausticTime;
    shader.uniforms.uCausticIntensity = CausticUniforms.uCausticIntensity;
    shader.uniforms.uCausticScale = CausticUniforms.uCausticScale;
    shader.uniforms.uCausticSpeed = CausticUniforms.uCausticSpeed;
    shader.uniforms.uWaterLevel = CausticUniforms.uWaterLevel;
    shader.uniforms.uSunDir = CausticUniforms.uSunDir;
    shader.uniforms.uCausticColor = CausticUniforms.uCausticColor;

    // Ensure vWorldPos and vNormal are available in vertex shader
    if (!shader.vertexShader.includes('varying vec3 vCausticWorldPos;')) {
      shader.vertexShader = 'varying vec3 vCausticWorldPos;\nvarying vec3 vCausticWorldNormal;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\n' +
        'vCausticWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n' +
        'vCausticWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);'
      );
    }

    // In fragment shader, inject uniforms, functions, and modify lighting/color
    if (!shader.fragmentShader.includes('sampleCausticPattern')) {
      shader.fragmentShader =
        'varying vec3 vCausticWorldPos;\nvarying vec3 vCausticWorldNormal;\n' +
        CausticGLSL +
        '\n' +
        shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        '#include <dithering_fragment>\n' +
        `vec3 _causticLight = computeCaustic(vCausticWorldPos, vCausticWorldNormal) * float(${multiplier.toFixed(4)});\n` +
        'gl_FragColor.rgb += _causticLight;\n'
      );
    }
  };

  material.needsUpdate = true;
}

/**
 * Traverses an Object3D and applies caustics to all its child mesh materials.
 * @param {THREE.Object3D} object
 * @param {object} [options]
 */
export function applyCausticsToObject(object, options = {}) {
  if (!object) return;
  object.traverse((child) => {
    if (child.isMesh && child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((mat) => applyCausticsToMaterial(mat, options));
      } else {
        applyCausticsToMaterial(child.material, options);
      }
    }
  });
}


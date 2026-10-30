import { emit, on } from './EventBus.js';
import { settingsManager } from './SettingsManager.js';

/**
 * Discrete steps for continuous on-the-fly scaling.
 * Draw distance scales FIRST. Resolution scales SECOND.
 */
export const DRAW_DISTANCE_STEPS = Object.freeze([160, 200, 250, 300, 350, 420, 500]);
export const RENDER_SCALE_STEPS   = Object.freeze([0.50, 0.65, 0.75, 0.85, 1.0, 1.25]);

/**
 * Lighting & Shadow tiers.
 * These are ONLY changed once per level (at level/day boundaries) to prevent
 * jarring material recompilation, shadow popping, and screen flicker.
 */
export const SHADOW_LIGHTING_TIERS = Object.freeze([
  {
    level: 0,
    name: 'Off',
    shadowQuality: 'off',
    godRays: false,
  },
  {
    level: 1,
    name: 'Low (No God Rays)',
    shadowQuality: 'low',
    godRays: false,
  },
  {
    level: 2,
    name: 'Low + God Rays',
    shadowQuality: 'low',
    godRays: true,
  },
  {
    level: 3,
    name: 'High + God Rays',
    shadowQuality: 'high',
    godRays: true,
  }
]);

/**
 * AutoPerformanceController
 *
 * Implements two-phase performance management:
 * 1. Continuous on-the-fly scaling (every ~850ms):
 *    - Priority 1: Adjust Draw Distance.
 *    - Priority 2: Adjust Resolution Scale (only after draw distance reaches minimum).
 *    - Recovery: Restores Resolution Scale first, then expands Draw Distance.
 * 2. Per-Level scaling for heavy pipeline stages:
 *    - Shadows and God Rays are NEVER changed during active gameplay (no flicker/pop).
 *    - Evaluated and updated ONCE per level during transition/loading screens based on
 *      the preceding level's telemetry.
 */
export class AutoPerformanceController {
  constructor() {
    this._enabled = Boolean(settingsManager.get('autoPerformance'));
    this._targetFps = Number(settingsManager.get('targetFps')) || 20;

    // Baselines & Current state
    this._drawDistIdx = this._findClosestDrawDistIdx(Number(settingsManager.get('drawDistance')) || 350);
    this._renderScaleIdx = this._findClosestRenderScaleIdx(Number(settingsManager.get('renderScale')) || 1.0);
    this._shadowLightingTier = this._findClosestShadowTier(
      settingsManager.get('shadowQuality'),
      Boolean(settingsManager.get('godRays'))
    );

    this._baselineDrawDistIdx = this._drawDistIdx;
    this._baselineRenderScaleIdx = this._renderScaleIdx;
    this._userSavedSettings = null;

    // Frame rate measurement state
    this._sampleFrameCount = 0;
    this._sampleStartTime = performance.now();
    this._currentFps = 20.0;
    this._smoothedFps = 20.0;

    // Real-time evaluation state
    this._evalIntervalMs = 850;
    this._cooldownUntil = 0;
    this._consecutiveHighCycles = 0;
    this._lastAdjustment = null;

    // Per-level telemetry
    this._levelFpsSum = 0;
    this._levelFpsCount = 0;
    this._levelMinRenderScale = RENDER_SCALE_STEPS[this._renderScaleIdx];
    this._levelMinDrawDist = DRAW_DISTANCE_STEPS[this._drawDistIdx];
    this._levelTotalCycles = 0;
    this._levelLowCycles = 0;

    // Listen to settings changes from EventBus
    on('settingChanged', ({ key, value }) => {
      if (key === 'autoPerformance') {
        const nextEnabled = Boolean(value);
        if (nextEnabled !== this._enabled) {
          if (nextEnabled) this._onEnabled();
          else this._onDisabled();
        }
      } else if (key === 'targetFps') {
        const nextTarget = Math.max(10, Math.min(120, Number(value) || 20));
        if (nextTarget !== this._targetFps) {
          this._targetFps = nextTarget;
          this._cooldownUntil = performance.now() + 500;
          this._consecutiveHighCycles = 0;
          this._emitStatus();
        }
      }
    });

    on('settingsReset', ({ all }) => {
      this._targetFps = Number(all?.targetFps) || 20;
      if (this._enabled && !all?.autoPerformance) {
        this._enabled = false;
        this._consecutiveHighCycles = 0;
        this._emitStatus();
      }
    });

    // Listen for level/phase transitions to evaluate and apply shadow/god rays ONCE PER LEVEL
    on('phaseChanged', ({ phase }) => {
      this.onLevelTransition(phase);
    });

    on('startSailing', () => {
      this.onLevelTransition('OBSTACLE');
    });

    if (this._enabled) {
      this._onEnabled();
    }
  }

  isEnabled() {
    return this._enabled;
  }

  getTargetFps() {
    return this._targetFps;
  }

  getCurrentFps() {
    return this._smoothedFps;
  }

  getCurrentDrawDistance() {
    return DRAW_DISTANCE_STEPS[this._drawDistIdx];
  }

  getCurrentRenderScale() {
    return RENDER_SCALE_STEPS[this._renderScaleIdx];
  }

  getShadowLightingTier() {
    return SHADOW_LIGHTING_TIERS[this._shadowLightingTier] || SHADOW_LIGHTING_TIERS[2];
  }

  setTargetFps(fps) {
    const val = Math.max(10, Math.min(120, Math.round(Number(fps)) || 20));
    settingsManager.set('targetFps', val);
  }

  setEnabled(enabled) {
    settingsManager.set('autoPerformance', Boolean(enabled));
  }

  toggle() {
    this.setEnabled(!this._enabled);
  }

  _findClosestDrawDistIdx(dist) {
    let best = 4; // 350m
    let minDiff = Infinity;
    DRAW_DISTANCE_STEPS.forEach((val, idx) => {
      const diff = Math.abs(val - dist);
      if (diff < minDiff) {
        minDiff = diff;
        best = idx;
      }
    });
    return best;
  }

  _findClosestRenderScaleIdx(scale) {
    let best = 4; // 1.0
    let minDiff = Infinity;
    RENDER_SCALE_STEPS.forEach((val, idx) => {
      const diff = Math.abs(val - scale);
      if (diff < minDiff) {
        minDiff = diff;
        best = idx;
      }
    });
    return best;
  }

  _findClosestShadowTier(shadowQuality, godRays) {
    if (shadowQuality === 'off') return 0;
    if (shadowQuality === 'low') return godRays ? 2 : 1;
    return godRays ? 3 : 2;
  }

  _onEnabled() {
    this._enabled = true;
    this._userSavedSettings = {
      renderScale: settingsManager.get('renderScale'),
      drawDistance: settingsManager.get('drawDistance'),
      shadowQuality: settingsManager.get('shadowQuality'),
      godRays: settingsManager.get('godRays'),
      paperShader: settingsManager.get('paperShader'),
      ditherShader: settingsManager.get('ditherShader')
    };

    // Determine initial indexes from current settings
    this._drawDistIdx = this._findClosestDrawDistIdx(Number(this._userSavedSettings.drawDistance) || 350);
    this._renderScaleIdx = this._findClosestRenderScaleIdx(Number(this._userSavedSettings.renderScale) || 1.0);
    this._shadowLightingTier = this._findClosestShadowTier(
      this._userSavedSettings.shadowQuality,
      Boolean(this._userSavedSettings.godRays)
    );

    this._baselineDrawDistIdx = Math.max(4, this._drawDistIdx); // at least 350m
    this._baselineRenderScaleIdx = Math.max(4, this._renderScaleIdx); // at least 1.0

    this._cooldownUntil = performance.now() + 600;
    this._consecutiveHighCycles = 0;
    this._resetLevelMetrics();

    // Apply initial shadow/lighting configuration once
    this._applyShadowLightingTier(this._shadowLightingTier, 'Initial Auto Mode Activation');
    this._applyContinuousSettings('Auto Mode Activated');
  }

  _onDisabled() {
    this._enabled = false;
    this._consecutiveHighCycles = 0;
    if (this._userSavedSettings) {
      const s = this._userSavedSettings;
      settingsManager.set('renderScale', s.renderScale);
      settingsManager.set('drawDistance', s.drawDistance);
      settingsManager.set('shadowQuality', s.shadowQuality);
      settingsManager.set('godRays', s.godRays);
      if (s.paperShader !== undefined) {
        settingsManager.set('paperShader', s.paperShader);
      }
      if (s.ditherShader !== undefined) {
        settingsManager.set('ditherShader', s.ditherShader);
      }
    }
    this._emitStatus();
  }

  /**
   * Called once per level transition (e.g. entering OBSTACLE, new day voyage).
   * Shadows and God Rays are updated ONLY here so they never flicker during play.
   */
  onLevelTransition(phase) {
    if (!this._enabled) return;

    // If we have telemetry from a completed level, evaluate if shadows or god rays need adjusting
    if (this._levelTotalCycles >= 4) {
      const avgFps = this._levelFpsCount > 0 ? (this._levelFpsSum / this._levelFpsCount) : this._smoothedFps;
      const underTargetRatio = this._levelLowCycles / Math.max(1, this._levelTotalCycles);
      const target = this._targetFps;

      if (underTargetRatio > 0.40 || avgFps < target - 2.5 || this._levelMinRenderScale <= 0.75) {
        // Struggling in the previous level -> step down shadow/lighting pipeline for next level
        if (this._shadowLightingTier > 0) {
          this._shadowLightingTier--;
          const reason = `Struggled in previous voyage (Avg ${avgFps.toFixed(1)} FPS, min scale ${(this._levelMinRenderScale * 100).toFixed(0)}%) -> Stepped down lighting/shadows for next level`;
          this._applyShadowLightingTier(this._shadowLightingTier, reason);
        }
      } else if (underTargetRatio < 0.05 && avgFps >= target + 4.0 && this._levelMinDrawDist >= 350 && this._levelMinRenderScale >= 1.0) {
        // High headroom in the previous level -> step up shadow/lighting pipeline for next level
        if (this._shadowLightingTier < SHADOW_LIGHTING_TIERS.length - 1) {
          this._shadowLightingTier++;
          const reason = `Excess headroom in previous voyage (Avg ${avgFps.toFixed(1)} FPS) -> Stepped up lighting/shadows for next level`;
          this._applyShadowLightingTier(this._shadowLightingTier, reason);
        }
      }
    }

    // Reset level metrics for the upcoming voyage
    this._resetLevelMetrics();
    this._cooldownUntil = performance.now() + 1000;
  }

  _resetLevelMetrics() {
    this._levelFpsSum = 0;
    this._levelFpsCount = 0;
    this._levelMinRenderScale = RENDER_SCALE_STEPS[this._renderScaleIdx];
    this._levelMinDrawDist = DRAW_DISTANCE_STEPS[this._drawDistIdx];
    this._levelTotalCycles = 0;
    this._levelLowCycles = 0;
  }

  _applyShadowLightingTier(tierIdx, reason = '') {
    this._shadowLightingTier = Math.max(0, Math.min(SHADOW_LIGHTING_TIERS.length - 1, tierIdx));
    const tier = SHADOW_LIGHTING_TIERS[this._shadowLightingTier];

    // Apply to settingsManager once per level
    settingsManager.set('shadowQuality', tier.shadowQuality);
    settingsManager.set('godRays', tier.godRays);

    emit('autoPerformanceLightingAdjusted', {
      tier,
      reason,
      shadowQuality: tier.shadowQuality,
      godRays: tier.godRays
    });

    this._emitStatus();
  }

  /**
   * Called every tick in the main loop to monitor FPS and dynamically adapt Draw Distance and Resolution
   */
  update(delta, now) {
    this._sampleFrameCount++;
    const elapsed = now - this._sampleStartTime;

    // Compute rolling frame rate
    if (elapsed >= this._evalIntervalMs) {
      this._currentFps = (this._sampleFrameCount * 1000) / elapsed;
      // Exponential moving average for smooth, reliable adaptation
      this._smoothedFps = this._smoothedFps * 0.4 + this._currentFps * 0.6;
      this._sampleFrameCount = 0;
      this._sampleStartTime = now;

      // Accumulate level telemetry
      this._levelFpsSum += this._smoothedFps;
      this._levelFpsCount++;
      this._levelTotalCycles++;
      if (this._smoothedFps < this._targetFps - 2.0) {
        this._levelLowCycles++;
      }
      this._levelMinRenderScale = Math.min(this._levelMinRenderScale, RENDER_SCALE_STEPS[this._renderScaleIdx]);
      this._levelMinDrawDist = Math.min(this._levelMinDrawDist, DRAW_DISTANCE_STEPS[this._drawDistIdx]);

      if (this._enabled && now >= this._cooldownUntil) {
        this._evaluateDynamicPerformance(now);
      }
    }
  }

  /**
   * Dynamic evaluation:
   * Scaling Order:
   * 1. Draw Distance
   * 2. Resolution (only after draw distance hits minimum)
   * Shadows and God Rays are NEVER changed here.
   */
  _evaluateDynamicPerformance(now) {
    const fps = this._smoothedFps;
    const target = this._targetFps;

    const lowThreshold = target - 2.0;
    const highThreshold = target + 3.5;

    if (fps < lowThreshold) {
      this._consecutiveHighCycles = 0;
      const isSevere = fps < target * 0.70;

      // PRIORITY 1: Reduce Draw Distance first
      if (this._drawDistIdx > 0) {
        const step = (isSevere && this._drawDistIdx > 1) ? 2 : 1;
        this._drawDistIdx = Math.max(0, this._drawDistIdx - step);
        this._cooldownUntil = now + (isSevere ? 900 : 800);
        this._applyContinuousSettings(
          `Under target (${fps.toFixed(1)} < ${lowThreshold.toFixed(0)} FPS) -> Reduced draw distance to ${DRAW_DISTANCE_STEPS[this._drawDistIdx]}m`
        );
        return;
      }

      // PRIORITY 2: If Draw Distance is ALREADY at minimum (index 0 = 160m), reduce Resolution
      if (this._renderScaleIdx > 0) {
        const step = (isSevere && this._renderScaleIdx > 1) ? 2 : 1;
        this._renderScaleIdx = Math.max(0, this._renderScaleIdx - step);
        this._cooldownUntil = now + 950;
        this._applyContinuousSettings(
          `Under target with min draw distance (${fps.toFixed(1)} < ${lowThreshold.toFixed(0)} FPS) -> Scaled resolution to ${Math.round(RENDER_SCALE_STEPS[this._renderScaleIdx] * 100)}%`
        );
        return;
      }

      // Both draw distance and resolution at minimum
      this._emitStatus();
    } else if (fps > highThreshold) {
      this._consecutiveHighCycles++;

      // Require 2 consecutive high cycles (~1.7s of stable excess FPS) before increasing fidelity
      if (this._consecutiveHighCycles >= 2) {
        this._consecutiveHighCycles = 0;

        // RECOVERY 1: Restore Resolution first back to full sharpness
        if (this._renderScaleIdx < this._baselineRenderScaleIdx) {
          this._renderScaleIdx++;
          this._cooldownUntil = now + 900;
          this._applyContinuousSettings(
            `Stable headroom (${fps.toFixed(1)} > ${highThreshold.toFixed(0)} FPS) -> Restored resolution to ${Math.round(RENDER_SCALE_STEPS[this._renderScaleIdx] * 100)}%`
          );
          return;
        }

        // RECOVERY 2: Resolution is restored; now expand Draw Distance
        if (this._drawDistIdx < DRAW_DISTANCE_STEPS.length - 1) {
          this._drawDistIdx++;
          this._cooldownUntil = now + 900;
          this._applyContinuousSettings(
            `Stable headroom (${fps.toFixed(1)} > ${highThreshold.toFixed(0)} FPS) -> Expanded draw distance to ${DRAW_DISTANCE_STEPS[this._drawDistIdx]}m`
          );
          return;
        }

        this._emitStatus();
      }
    } else {
      // In target band: maintain current settings
      this._consecutiveHighCycles = 0;
      this._emitStatus();
    }
  }

  _applyContinuousSettings(reason = '') {
    const drawDist = DRAW_DISTANCE_STEPS[this._drawDistIdx];
    const renderScale = RENDER_SCALE_STEPS[this._renderScaleIdx];

    this._lastAdjustment = {
      drawDistance: drawDist,
      renderScale,
      reason,
      timestamp: performance.now(),
      fps: this._smoothedFps
    };

    // Apply draw distance and resolution scale only
    settingsManager.set('drawDistance', drawDist);
    settingsManager.set('renderScale', renderScale);

    emit('autoPerformanceAdjusted', {
      drawDistance: drawDist,
      renderScale,
      currentFps: Math.round(this._smoothedFps),
      targetFps: this._targetFps,
      reason,
      shadowQuality: settingsManager.get('shadowQuality'),
      godRays: Boolean(settingsManager.get('godRays'))
    });

    this._emitStatus();
  }

  getStatusSummary() {
    const fps = Math.round(this._smoothedFps);
    if (!this._enabled) {
      return {
        enabled: false,
        text: 'Disabled (Manual Performance Control)',
        targetFps: this._targetFps,
        currentFps: fps
      };
    }

    const drawDist = DRAW_DISTANCE_STEPS[this._drawDistIdx];
    const renderScale = RENDER_SCALE_STEPS[this._renderScaleIdx];
    const shadowTier = this.getShadowLightingTier();
    const scalePct = Math.round(renderScale * 100);

    return {
      enabled: true,
      drawDistance: drawDist,
      renderScale,
      shadowQuality: shadowTier.shadowQuality,
      godRays: shadowTier.godRays,
      currentFps: fps,
      targetFps: this._targetFps,
      text: `Active • ${fps} / ${this._targetFps} FPS | Draw: ${drawDist}m | Scale: ${scalePct}% | Shadows: ${shadowTier.name} (Per-Level)`
    };
  }

  _emitStatus() {
    emit('autoPerformanceStatus', this.getStatusSummary());
  }
}

export const autoPerformanceController = new AutoPerformanceController();

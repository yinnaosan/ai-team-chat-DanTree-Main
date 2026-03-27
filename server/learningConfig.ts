/**
 * DANTREE_LEVEL3.6_PATCH — Patch 1: Learning Threshold Configuration
 *
 * Externalizes all hardcoded learning thresholds from:
 *   - loopStopController.ts (early_stop_bias)
 *   - historyBootstrap.ts (failure_intensity routing)
 *   - loopStateTriggerEngine.ts (success_strength confidence)
 *
 * Priority ordering (per GPT Q2):
 *   Step0 override > failure_intensity (HIGH+) > early_stop_bias (MODERATE) > history control > default
 */

export interface LearningConfig {
  /** Minimum failure_intensity_score to force risk_probe routing (HIGH+ priority) */
  failure_threshold: number;
  /** Minimum success_strength_score to trigger confidence boost in evaluateTrigger */
  success_threshold: number;
  /** Minimum success_strength_score to activate early_stop_bias in evaluateStopCondition */
  stop_bias_threshold: number;
  /** Adjusted evidence threshold when early_stop_bias is active (vs default 0.65) */
  stop_bias_evidence_floor: number;
}

/** Default configuration — matches original hardcoded values */
const DEFAULT_LEARNING_CONFIG: LearningConfig = {
  failure_threshold: 0.6,
  success_threshold: 0.7,
  stop_bias_threshold: 0.7,
  stop_bias_evidence_floor: 0.60,
};

/** Runtime override store — allows dynamic reconfiguration without restart */
let _runtimeOverride: Partial<LearningConfig> = {};

/**
 * Get the active learning config.
 * Merges DEFAULT_LEARNING_CONFIG with any runtime overrides.
 */
export function getLearningConfig(): LearningConfig {
  return { ...DEFAULT_LEARNING_CONFIG, ..._runtimeOverride };
}

/**
 * Apply a partial override to the learning config at runtime.
 * Useful for A/B testing or user-configurable thresholds.
 * @param override Partial config to merge over defaults
 */
export function setLearningConfigOverride(override: Partial<LearningConfig>): void {
  _runtimeOverride = { ..._runtimeOverride, ...override };
}

/**
 * Reset all runtime overrides — restores default thresholds.
 */
export function resetLearningConfig(): void {
  _runtimeOverride = {};
}

/**
 * Get a snapshot of the current effective config for trace/audit purposes.
 */
export function getLearningConfigSnapshot(): LearningConfig & { has_override: boolean } {
  return {
    ...getLearningConfig(),
    has_override: Object.keys(_runtimeOverride).length > 0,
  };
}

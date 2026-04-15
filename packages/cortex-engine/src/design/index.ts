/**
 * Design subsystem — Design Pioneer agent, artifact builders, and
 * Seven-Layer Design Enforcement Stack.
 *
 * Phase C, Step 13 — Design Pioneer agent with component library template
 * (Layer 1 of the Seven-Layer Design Enforcement Stack).
 * Phase C, Step 14 — Enforcement stack: Layers 2, 3, 7, and coordinator.
 */

// Phase C, Step 13 — Design Pioneer Agent
export { DesignPioneerAgent } from "./design-pioneer.js";
export { ExperienceShellBuilder } from "./experience-shell.js";
export { ComponentLibraryBuilder } from "./component-library.js";
export { AntiSlopRulesetGenerator } from "./anti-slop-ruleset.js";

export type {
  ExperienceShellBuilderConfig,
} from "./experience-shell.js";
export type {
  ComponentLibraryBuilderConfig,
} from "./component-library.js";
export type {
  AntiSlopRulesetGeneratorConfig,
} from "./anti-slop-ruleset.js";

// Phase C, Step 14 — Seven-Layer Design Enforcement Stack
export { PositiveContextInjector } from "./positive-context.js";
export { EphemeralGuidanceClassifier } from "./ephemeral-guidance.js";
export { RequiredPatternChecker } from "./required-pattern-checker.js";
export { DesignQualityScorer } from "./design-quality-scorer.js";
export { DesignEnforcementStack } from "./enforcement-stack.js";

// Phase E, Step 25 — Design Quality Scoring Calibration
export { DesignScoreAccuracyTracker } from "./design-score-accuracy-tracker.js";
export { DesignScoreCalibrator } from "./design-score-calibrator.js";
export { CalibrationAwareDesignThreshold } from "./calibration-aware-design-threshold.js";
export { DesignScoringFeedbackLoop } from "./design-scoring-feedback-loop.js";

// Phase E, Step 22 — Ephemeral Decision-Time Guidance Engine
export { GuidanceEffectivenessTracker } from "./guidance-effectiveness-tracker.js";
export { DecisionTimeContextAnalyzer } from "./decision-time-context-analyzer.js";
export { OperatingContextEvolver } from "./operating-context-evolver.js";
export { EphemeralGuidanceEngine } from "./ephemeral-guidance-engine.js";

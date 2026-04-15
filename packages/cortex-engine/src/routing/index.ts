/**
 * Routing module — model tier routing based on trail coverage density.
 *
 * Phase D, Step 19.
 * Spec Section 6.7 — Model Tier Optimization via Routing.
 * Spec Section 3.4 — Model Tier Determined by Routing, Not Pairing.
 */

export { CoverageDensityCalculator } from "./coverage-calculator.js";
export { RoutingDecisionEngine } from "./routing-engine.js";
export { EscalationMonitor } from "./escalation-monitor.js";
export { RoutingMetricsTracker } from "./routing-metrics.js";

// Phase E, Step 24 — Confidence Calibration
export { PredictionAccuracyTracker } from "./prediction-accuracy-tracker.js";
export { ConfidenceCalibrator } from "./confidence-calibrator.js";
export { OverconfidenceDetector } from "./overconfidence-detector.js";
export { CalibrationAwareRouter } from "./calibration-aware-router.js";

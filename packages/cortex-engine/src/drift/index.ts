/**
 * Drift detection subsystem — the four-signal monitoring system that
 * detects agent cognitive degradation and feeds the rotation decision system.
 *
 * Phase D, Step 17 — ASI-style multi-signal drift monitoring.
 *
 * Spec Section 5.3 — Drift Detection: The Multi-Signal Monitoring System
 * Spec Section 5.6 — What Replaces "JEPA Predictor" and Why
 */

// Signal 1 — Agent Stability Index
export { ASIMonitor } from "./asi-monitor.js";

// Signal 2 — Goal Drift Index
export { GDIMonitor } from "./gdi-monitor.js";

// Signal 3 — Confidence Calibration
export { ConfidenceMonitor } from "./confidence-monitor.js";

// Signal 4 — Behavioral Heuristics
export { BehavioralMonitor } from "./behavioral-monitor.js";

// Composite coordinator
export { MultiSignalDriftMonitor } from "./multi-signal-monitor.js";

export type {
  MultiSignalMonitorDeps,
} from "./multi-signal-monitor.js";

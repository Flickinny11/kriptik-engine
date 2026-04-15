/**
 * Multi-signal drift monitor — the composite coordinator that combines
 * all four signal categories into unified drift assessment.
 *
 * Coordinates the four individual monitors:
 * - Signal 1: ASI (Agent Stability Index)
 * - Signal 2: GDI (Goal Drift Index)
 * - Signal 3: Confidence Calibration
 * - Signal 4: Behavioral Heuristics
 *
 * Produces IDriftSignal instances that feed the EnhancedThresholdMonitor
 * for cost-benefit rotation decisions. The multi-signal monitor does NOT
 * make rotation decisions — it produces signals. The threshold monitor
 * combines those signals with context (goal progress, upcoming complexity,
 * peer status) to produce rotation recommendations.
 *
 * Spec Section 5.3 — "The Drift Detection System combines four signal categories."
 * Spec Section 5.6 — replaces the JEPA predictor with proven technology.
 */

import type {
  IMultiSignalDriftMonitor,
  IMultiSignalSnapshot,
  IASIMonitor,
  IASIResult,
  IGDIMonitor,
  IGDIResult,
  IConfidenceMonitor,
  IConfidenceCalibrationResult,
  IBehavioralMonitor,
  IBehavioralHeuristicsResult,
  IBehavioralObservation,
  IDriftSignal,
  IAgentResponse,
} from "@kriptik/shared-interfaces";

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

/**
 * Dependencies injected into the multi-signal monitor.
 *
 * Each monitor is a separate component with its own state. The multi-signal
 * monitor coordinates them but doesn't own their computation logic.
 */
export interface MultiSignalMonitorDeps {
  readonly asi: IASIMonitor;
  readonly gdi: IGDIMonitor;
  readonly confidence: IConfidenceMonitor;
  readonly behavioral: IBehavioralMonitor;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * MultiSignalDriftMonitor — coordinates all four signal monitors and
 * produces drift signals for the threshold monitor.
 *
 * On each agent response, the coordinator:
 * 1. Passes the response through ASI, GDI, and Confidence monitors
 * 2. Records the behavioral observation
 * 3. Evaluates the behavioral monitor
 * 4. Collects drift signals from any monitor that detected degradation
 * 5. Returns the signals for the EnhancedThresholdMonitor to process
 *
 * The coordinator adds no signal logic of its own — it is purely a
 * fan-out/fan-in coordinator. Each monitor independently decides when
 * to produce signals based on its own thresholds and flagging rules.
 */
export class MultiSignalDriftMonitor implements IMultiSignalDriftMonitor {
  private readonly _deps: MultiSignalMonitorDeps;
  private readonly _registeredAgents = new Set<string>();

  constructor(deps: MultiSignalMonitorDeps) {
    this._deps = deps;
  }

  registerAgent(agentId: string, goalDescription: string): void {
    this._registeredAgents.add(agentId);

    // Register with all four monitors
    this._deps.asi.registerAgent(agentId);
    this._deps.gdi.registerAgent(agentId, goalDescription);
    this._deps.confidence.registerAgent(agentId);
    this._deps.behavioral.registerAgent(agentId);
  }

  processResponse(
    agentId: string,
    buildId: string,
    response: IAgentResponse,
    observation: IBehavioralObservation,
  ): readonly IDriftSignal[] {
    if (!this._registeredAgents.has(agentId)) {
      return [];
    }

    const signals: IDriftSignal[] = [];

    // Signal 1: ASI evaluation
    const asiResult = this._deps.asi.evaluate(agentId, response);
    const asiSignal = this._deps.asi.toDriftSignal(asiResult, buildId);
    if (asiSignal) signals.push(asiSignal);

    // Signal 2: GDI evaluation
    const gdiResult = this._deps.gdi.evaluate(agentId, response);
    const gdiSignal = this._deps.gdi.toDriftSignal(gdiResult, buildId);
    if (gdiSignal) signals.push(gdiSignal);

    // Signal 3: Confidence calibration
    const confResult = this._deps.confidence.evaluate(agentId, response);
    const confSignal = this._deps.confidence.toDriftSignal(confResult, buildId);
    if (confSignal) signals.push(confSignal);

    // Signal 4: Behavioral heuristics
    this._deps.behavioral.recordObservation(agentId, observation);
    const behResult = this._deps.behavioral.evaluate(agentId);
    const behSignal = this._deps.behavioral.toDriftSignal(behResult, buildId);
    if (behSignal) signals.push(behSignal);

    return signals;
  }

  getLatestResults(agentId: string): IMultiSignalSnapshot | null {
    if (!this._registeredAgents.has(agentId)) return null;

    const asi = this._deps.asi.getLatestResult(agentId);
    const gdi = this._deps.gdi.getLatestResult(agentId);
    const confidence = this._deps.confidence.getLatestResult(agentId);
    const behavioral = this._deps.behavioral.getLatestResult(agentId);

    // Overall health: worst of all available signals
    const scores: number[] = [];
    if (asi) scores.push(asi.compositeScore);
    if (gdi) scores.push(1 - gdi.compositeScore); // GDI is inverted (higher = worse)
    if (confidence) scores.push(confidence.calibrationScore);
    if (behavioral) scores.push(behavioral.compositeScore);

    const overallHealth =
      scores.length > 0 ? Math.min(...scores) : 1;

    return {
      agentId,
      asi,
      gdi,
      confidence,
      behavioral,
      overallHealth,
      snapshotAt: new Date(),
    };
  }

  unregisterAgent(agentId: string): void {
    this._registeredAgents.delete(agentId);

    this._deps.asi.unregisterAgent(agentId);
    this._deps.gdi.unregisterAgent(agentId);
    this._deps.confidence.unregisterAgent(agentId);
    this._deps.behavioral.unregisterAgent(agentId);
  }
}

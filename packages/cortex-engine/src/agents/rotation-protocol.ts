/**
 * Rotation protocol — orchestrates the complete agent rotation lifecycle.
 *
 * The protocol coordinates the four-step rotation process:
 * 1. Capture the departing agent's state (via IStateCaptureProvider)
 * 2. Terminate the departing session (via IAgentHarness.rotate())
 * 3. Return IRotationResult for the orchestrator to construct the
 *    replacement's golden window and launch it
 * 4. Record rotation outcomes for trail extraction and warm-up improvement
 *
 * The protocol does NOT launch the replacement agent. The orchestrator
 * constructs the golden window with the captured state and calls
 * AgentHarness.launch() separately. This separation keeps golden window
 * construction in the orchestrator where it has access to the full build
 * context (blueprint, trails, code files, anti-pattern alerts).
 *
 * Spec Section 5.4 — Agent Rotation and Warm-Up Sequences
 */

import { randomUUID } from "node:crypto";
import type {
  IRotationProtocol,
  IRotationResult,
  IRotationOutcome,
  IStateCaptureProvider,
  IRotationDecision,
  IAgentHarness,
} from "@kriptik/shared-interfaces";

/** Configuration for the rotation protocol. */
export interface RotationProtocolConfig {
  /** The agent harness for session lifecycle management. */
  readonly harness: IAgentHarness;
  /** Provider for capturing departing agent state. */
  readonly stateCapture: IStateCaptureProvider;
}

/**
 * Rotation protocol implementation.
 *
 * Orchestrates agent rotation without constructing golden windows.
 * State capture and session termination happen here; golden window
 * construction and replacement launch are the orchestrator's job.
 */
export class RotationProtocol implements IRotationProtocol {
  private readonly _harness: IAgentHarness;
  private readonly _stateCapture: IStateCaptureProvider;
  private readonly _rotationHistory = new Map<string, IRotationResult[]>();
  private readonly _outcomes = new Map<string, IRotationOutcome>();

  constructor(config: RotationProtocolConfig) {
    this._harness = config.harness;
    this._stateCapture = config.stateCapture;
  }

  async executeRotation(
    agentId: string,
    decision: IRotationDecision,
  ): Promise<IRotationResult> {
    const session = this._harness.getSession(agentId);
    if (!session) {
      throw new Error(`No active session found for agent ${agentId}`);
    }

    const buildId = session.session.buildId;
    const rotationId = randomUUID();

    // Step 1: Capture departing agent's state BEFORE termination.
    // State capture must happen while the session is still alive so
    // providers can query its conversation history and ESAA events.
    const capturedState = await this._stateCapture.captureState(
      agentId,
      buildId,
    );

    // Step 2: Terminate departing session via harness.
    // The harness emits a rotation-triggered ESAA event and marks
    // the session as "rotating". The two-step pattern (rotate to
    // terminate, then orchestrator calls launch) keeps the harness
    // from needing golden window construction logic.
    const signalSummary = decision.signals
      .map((s) => s.description)
      .join("; ");
    const reason = `Rotation: ${decision.recommendation}${signalSummary ? ` — ${signalSummary}` : ""}`;
    await this._harness.rotate(agentId, reason);

    const result: IRotationResult = {
      rotationId,
      departedAgentId: agentId,
      capturedState,
      decision,
      rotatedAt: new Date(),
    };

    // Store in rotation history keyed by buildId
    const buildHistory = this._rotationHistory.get(buildId) ?? [];
    buildHistory.push(result);
    this._rotationHistory.set(buildId, buildHistory);

    return result;
  }

  recordOutcome(outcome: IRotationOutcome): void {
    this._outcomes.set(outcome.rotationId, outcome);
  }

  getRotationHistory(buildId: string): readonly IRotationResult[] {
    return this._rotationHistory.get(buildId) ?? [];
  }

  /** Get a recorded outcome by rotation ID (for diagnostics). */
  getOutcome(rotationId: string): IRotationOutcome | undefined {
    return this._outcomes.get(rotationId);
  }
}

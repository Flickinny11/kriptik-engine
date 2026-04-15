/**
 * Behavioral heuristics monitor — Signal 4 of the multi-signal
 * drift detection system.
 *
 * Extends the basic context-fill tracking from Phase B Step 9 with
 * the full five-heuristic set from the spec:
 *
 * 1. Context fill trajectory — how fast the agent is consuming context
 * 2. Error handling coverage — is thoroughness declining?
 * 3. Trail reference frequency — is the agent still drawing on injected trails?
 * 4. Peer interaction quality — terse, unconsidered responses to peers?
 * 5. Sub-agent spawning pattern — healthy vs. stopping or over-spawning
 *
 * This is the "production-ready today" signal — uses only observable
 * behavior, no learned models or external services required.
 *
 * Spec Section 5.3, Signal 4 — Observable Behavioral Heuristics
 */

import { randomUUID } from "node:crypto";
import type {
  IBehavioralMonitor,
  IBehavioralHeuristicsResult,
  IBehavioralHeuristic,
  IBehavioralObservation,
  BehavioralHeuristicId,
  IDriftSignal,
  DriftSeverity,
} from "@kriptik/shared-interfaces";

/** Minimum observations before evaluation is meaningful. */
const MIN_OBSERVATIONS = 3;

/** History window size. */
const OBSERVATION_WINDOW = 20;

/** Score below which the composite is considered degraded. */
const BEHAVIORAL_WARNING_THRESHOLD = 0.6;
const BEHAVIORAL_CRITICAL_THRESHOLD = 0.4;

// ---------------------------------------------------------------------------
// Heuristic definitions
// ---------------------------------------------------------------------------

interface HeuristicDef {
  readonly id: BehavioralHeuristicId;
  readonly label: string;
}

const HEURISTIC_DEFINITIONS: readonly HeuristicDef[] = [
  { id: "context-fill-trajectory", label: "Context Fill Trajectory" },
  { id: "error-handling-coverage", label: "Error Handling Coverage" },
  { id: "trail-reference-frequency", label: "Trail Reference Frequency" },
  { id: "peer-interaction-quality", label: "Peer Interaction Quality" },
  { id: "sub-agent-spawning", label: "Sub-Agent Spawning Pattern" },
];

// ---------------------------------------------------------------------------
// Per-agent state
// ---------------------------------------------------------------------------

interface AgentBehavioralState {
  readonly agentId: string;
  readonly observations: IBehavioralObservation[];
  latestResult: IBehavioralHeuristicsResult | null;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * BehavioralMonitor — computes the five behavioral heuristics from
 * observable agent behavior data.
 *
 * Each observation is recorded after an agent response. The monitor
 * accumulates observations and computes heuristic scores from the
 * aggregate patterns.
 */
export class BehavioralMonitor implements IBehavioralMonitor {
  private readonly _agents = new Map<string, AgentBehavioralState>();

  registerAgent(agentId: string): void {
    this._agents.set(agentId, {
      agentId,
      observations: [],
      latestResult: null,
    });
  }

  recordObservation(agentId: string, observation: IBehavioralObservation): void {
    const state = this._agents.get(agentId);
    if (!state) return;

    state.observations.push(observation);

    while (state.observations.length > OBSERVATION_WINDOW) {
      state.observations.shift();
    }
  }

  evaluate(agentId: string): IBehavioralHeuristicsResult {
    const state = this._agents.get(agentId);
    if (!state || state.observations.length < MIN_OBSERVATIONS) {
      return this._emptyResult(agentId);
    }

    const heuristics = HEURISTIC_DEFINITIONS.map((def) =>
      this.computeHeuristic(def, state.observations),
    );

    const compositeScore =
      heuristics.reduce((sum, h) => sum + h.score, 0) / heuristics.length;

    const severity: DriftSeverity =
      compositeScore < BEHAVIORAL_CRITICAL_THRESHOLD
        ? "critical"
        : compositeScore < BEHAVIORAL_WARNING_THRESHOLD
          ? "warning"
          : "nominal";

    const result: IBehavioralHeuristicsResult = {
      agentId,
      compositeScore,
      heuristics,
      severity,
      evaluatedAt: new Date(),
    };

    state.latestResult = result;
    return result;
  }

  getLatestResult(agentId: string): IBehavioralHeuristicsResult | null {
    return this._agents.get(agentId)?.latestResult ?? null;
  }

  toDriftSignal(
    result: IBehavioralHeuristicsResult,
    buildId: string,
  ): IDriftSignal | null {
    if (result.severity === "nominal") return null;

    const weakest = [...result.heuristics].sort(
      (a, b) => a.score - b.score,
    )[0];

    return {
      id: randomUUID(),
      buildId,
      agentId: result.agentId,
      source: "behavioral",
      severity: result.severity,
      score: result.compositeScore,
      description:
        `Behavioral composite ${result.compositeScore.toFixed(2)}` +
        (weakest
          ? ` — weakest: ${weakest.label} (${weakest.score.toFixed(2)})`
          : ""),
      detectedAt: new Date(),
    };
  }

  unregisterAgent(agentId: string): void {
    this._agents.delete(agentId);
  }

  // ---------------------------------------------------------------------------
  // Heuristic computation
  // ---------------------------------------------------------------------------

  private computeHeuristic(
    def: HeuristicDef,
    observations: readonly IBehavioralObservation[],
  ): IBehavioralHeuristic {
    let score: number;
    let description: string;

    switch (def.id) {
      case "context-fill-trajectory": {
        const r = this.scoreContextFillTrajectory(observations);
        score = r.score;
        description = r.description;
        break;
      }
      case "error-handling-coverage": {
        const r = this.scoreErrorHandlingCoverage(observations);
        score = r.score;
        description = r.description;
        break;
      }
      case "trail-reference-frequency": {
        const r = this.scoreTrailReferenceFrequency(observations);
        score = r.score;
        description = r.description;
        break;
      }
      case "peer-interaction-quality": {
        const r = this.scorePeerInteractionQuality(observations);
        score = r.score;
        description = r.description;
        break;
      }
      case "sub-agent-spawning": {
        const r = this.scoreSubAgentSpawning(observations);
        score = r.score;
        description = r.description;
        break;
      }
    }

    return { id: def.id, label: def.label, score, description };
  }

  // ---------------------------------------------------------------------------
  // Individual heuristic scoring
  // ---------------------------------------------------------------------------

  /**
   * Context fill trajectory — how fast the agent is consuming context.
   * A healthy agent has a steady, moderate consumption rate.
   * A degrading agent accelerates (generating verbose, unfocused output).
   *
   * Spec: "Context fill trajectory — how fast the agent is consuming context"
   */
  private scoreContextFillTrajectory(
    observations: readonly IBehavioralObservation[],
  ): { score: number; description: string } {
    if (observations.length < 3) {
      return { score: 1, description: "Insufficient data" };
    }

    // Compare consumption rate between first and second halves
    const mid = Math.floor(observations.length / 2);
    const earlyRates = this.computeConsumptionRates(observations.slice(0, mid));
    const recentRates = this.computeConsumptionRates(observations.slice(mid));

    const earlyAvg = earlyRates.length > 0
      ? earlyRates.reduce((a, b) => a + b, 0) / earlyRates.length
      : 0;
    const recentAvg = recentRates.length > 0
      ? recentRates.reduce((a, b) => a + b, 0) / recentRates.length
      : 0;

    // Acceleration factor: if recent rate is 2x early, that's concerning
    if (earlyAvg === 0) {
      return { score: 1, description: "Stable context consumption" };
    }

    const acceleration = recentAvg / earlyAvg;
    const score = Math.max(0, Math.min(1, 2 - acceleration));

    return {
      score,
      description:
        acceleration > 1.5
          ? `Context consumption accelerating: ${acceleration.toFixed(1)}x early rate`
          : `Context consumption stable: ${acceleration.toFixed(1)}x rate`,
    };
  }

  /**
   * Error handling coverage — is the agent still writing thorough error
   * handling, or is it cutting corners?
   *
   * Spec: "Error handling coverage — is thoroughness declining?"
   */
  private scoreErrorHandlingCoverage(
    observations: readonly IBehavioralObservation[],
  ): { score: number; description: string } {
    if (observations.length < 3) {
      return { score: 1, description: "Insufficient data" };
    }

    const mid = Math.floor(observations.length / 2);
    const earlyRate = observations
      .slice(0, mid)
      .filter((o) => o.hasErrorHandling).length / mid;
    const recentRate = observations
      .slice(mid)
      .filter((o) => o.hasErrorHandling).length / (observations.length - mid);

    // If early rate was high and recent dropped, that's a decline
    if (earlyRate === 0) {
      return { score: recentRate > 0 ? 1 : 0.5, description: "No error handling baseline" };
    }

    const ratio = recentRate / earlyRate;
    const score = Math.min(ratio, 1);

    return {
      score,
      description:
        ratio < 0.5
          ? `Error handling declining: ${(recentRate * 100).toFixed(0)}% vs ${(earlyRate * 100).toFixed(0)}% early`
          : `Error handling stable: ${(recentRate * 100).toFixed(0)}% of responses`,
    };
  }

  /**
   * Trail reference frequency — is the agent still drawing on injected
   * experiential trails?
   *
   * Spec: "Trail reference frequency — is the agent still drawing on
   * injected experiential trails?"
   */
  private scoreTrailReferenceFrequency(
    observations: readonly IBehavioralObservation[],
  ): { score: number; description: string } {
    const totalRefs = observations.reduce(
      (sum, o) => sum + o.trailReferences,
      0,
    );

    if (totalRefs === 0) {
      // No trail references at all may be fine if no trails were injected
      return { score: 0.5, description: "No trail references observed" };
    }

    // Compare early vs recent reference frequency
    const mid = Math.floor(observations.length / 2);
    const earlyRefs = observations
      .slice(0, mid)
      .reduce((sum, o) => sum + o.trailReferences, 0) / Math.max(mid, 1);
    const recentRefs = observations
      .slice(mid)
      .reduce((sum, o) => sum + o.trailReferences, 0) /
      Math.max(observations.length - mid, 1);

    if (earlyRefs === 0) {
      return { score: recentRefs > 0 ? 1 : 0.5, description: "No early trail references" };
    }

    const ratio = recentRefs / earlyRefs;
    const score = Math.min(ratio, 1);

    return {
      score,
      description:
        ratio < 0.5
          ? `Trail references declining: ${recentRefs.toFixed(1)}/turn vs ${earlyRefs.toFixed(1)}/turn early`
          : `Trail reference rate stable`,
    };
  }

  /**
   * Peer interaction quality — is the agent giving terse, unconsidered
   * responses to peer proposals?
   *
   * Spec: "Peer interaction quality — is the agent giving terse,
   * unconsidered responses to peer proposals?"
   */
  private scorePeerInteractionQuality(
    observations: readonly IBehavioralObservation[],
  ): { score: number; description: string } {
    const peerResponses = observations.filter((o) => o.isPeerResponse);

    if (peerResponses.length === 0) {
      return { score: 1, description: "No peer interactions to evaluate" };
    }

    const qualityScores = peerResponses
      .filter((o) => o.peerResponseQuality !== null)
      .map((o) => o.peerResponseQuality!);

    if (qualityScores.length === 0) {
      return { score: 0.5, description: "Peer interactions without quality data" };
    }

    const avgQuality =
      qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length;

    return {
      score: avgQuality,
      description:
        avgQuality < 0.5
          ? `Peer interaction quality low: ${(avgQuality * 100).toFixed(0)}% average`
          : `Peer interaction quality good: ${(avgQuality * 100).toFixed(0)}% average`,
    };
  }

  /**
   * Sub-agent spawning pattern — healthy agents spawn ephemeral sub-agents
   * for appropriate mechanical tasks; degrading agents either stop spawning
   * or over-spawn.
   *
   * Spec: "Sub-agent spawning pattern — a healthy agent spawns ephemeral
   * sub-agents for appropriate mechanical tasks; a degrading agent either
   * stops spawning or over-spawns"
   */
  private scoreSubAgentSpawning(
    observations: readonly IBehavioralObservation[],
  ): { score: number; description: string } {
    const spawns = observations.map((o) => o.subAgentsSpawned);
    const totalSpawns = spawns.reduce((a, b) => a + b, 0);

    if (totalSpawns === 0) {
      // No spawning might be normal depending on the task
      return { score: 0.7, description: "No sub-agent spawning observed" };
    }

    // Check for consistency — dramatic changes indicate problems
    const mid = Math.floor(observations.length / 2);
    const earlySpawnRate = observations
      .slice(0, mid)
      .reduce((sum, o) => sum + o.subAgentsSpawned, 0) / Math.max(mid, 1);
    const recentSpawnRate = observations
      .slice(mid)
      .reduce((sum, o) => sum + o.subAgentsSpawned, 0) /
      Math.max(observations.length - mid, 1);

    if (earlySpawnRate === 0 && recentSpawnRate === 0) {
      return { score: 0.7, description: "No spawning in either phase" };
    }

    // Large changes in either direction are concerning
    const maxRate = Math.max(earlySpawnRate, recentSpawnRate, 0.1);
    const changeRatio = Math.abs(recentSpawnRate - earlySpawnRate) / maxRate;
    const score = Math.max(0, 1 - changeRatio);

    return {
      score,
      description:
        changeRatio > 0.5
          ? `Sub-agent spawning pattern changed: ${earlySpawnRate.toFixed(1)} → ${recentSpawnRate.toFixed(1)}/turn`
          : `Sub-agent spawning pattern stable`,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Compute per-turn token consumption rates. */
  private computeConsumptionRates(
    observations: readonly IBehavioralObservation[],
  ): number[] {
    return observations.map((o) => o.tokensConsumed);
  }

  /** Empty result for insufficient data. */
  private _emptyResult(agentId: string): IBehavioralHeuristicsResult {
    return {
      agentId,
      compositeScore: 1,
      heuristics: HEURISTIC_DEFINITIONS.map((def) => ({
        id: def.id,
        label: def.label,
        score: 1,
        description: "Insufficient data",
      })),
      severity: "nominal",
      evaluatedAt: new Date(),
    };
  }
}

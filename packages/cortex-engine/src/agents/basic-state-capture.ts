/**
 * Basic state capture — extracts departing agent state for rotation handoff.
 *
 * Gathers state from four injected providers to construct the
 * IDepartingAgentState used in the replacement's golden window
 * (Step 7 of the eight-step formation sequence).
 *
 * For Step 9 (basic rotation), providers are injected interfaces.
 * In later phases, concrete implementations will query:
 * - Git: modified files from branch diff
 * - Build State Tracker: structured goal progress
 * - Graph-Mesh: active peer negotiations from message channels
 * - ESAA Event Log: full decision history with reasoning chains
 *
 * Spec Section 5.4, Step 1 — "Capture the departing agent's state."
 */

import type {
  IStateCaptureProvider,
  IDepartingAgentState,
  IESAAEvent,
} from "@kriptik/shared-interfaces";

// ---------------------------------------------------------------------------
// Dependency injection interfaces for state capture sources
// ---------------------------------------------------------------------------

/** Provides the list of files an agent has modified (e.g., from git diff). */
export interface ModifiedFilesProvider {
  getModifiedFiles(
    agentId: string,
    buildId: string,
  ): Promise<readonly string[]>;
}

/** Provides a human-readable summary of the agent's goal progress. */
export interface GoalProgressProvider {
  getGoalProgress(agentId: string, buildId: string): Promise<string>;
}

/** Provides active peer negotiations from the graph-mesh. */
export interface PeerNegotiationProvider {
  getActiveNegotiations(agentId: string): Promise<readonly string[]>;
}

/** Provides ESAA events for an agent (for extracting decisions). */
export interface ESAAEventQueryProvider {
  getAgentEvents(
    agentId: string,
    buildId: string,
  ): Promise<readonly IESAAEvent[]>;
}

/** Configuration for BasicStateCapture with injected providers. */
export interface BasicStateCaptureConfig {
  readonly modifiedFiles: ModifiedFilesProvider;
  readonly goalProgress: GoalProgressProvider;
  readonly peerNegotiations: PeerNegotiationProvider;
  readonly esaaEvents: ESAAEventQueryProvider;
}

/**
 * Basic state capture implementation.
 *
 * Queries all four state sources concurrently and synthesizes the
 * IDepartingAgentState. Decision extraction from ESAA events includes
 * the reasoning payload when available, producing entries like:
 * "Chose JWT over session cookies — reasoning: stateless auth scales better"
 */
export class BasicStateCapture implements IStateCaptureProvider {
  private readonly _modifiedFiles: ModifiedFilesProvider;
  private readonly _goalProgress: GoalProgressProvider;
  private readonly _peerNegotiations: PeerNegotiationProvider;
  private readonly _esaaEvents: ESAAEventQueryProvider;

  constructor(config: BasicStateCaptureConfig) {
    this._modifiedFiles = config.modifiedFiles;
    this._goalProgress = config.goalProgress;
    this._peerNegotiations = config.peerNegotiations;
    this._esaaEvents = config.esaaEvents;
  }

  async captureState(
    agentId: string,
    buildId: string,
  ): Promise<IDepartingAgentState> {
    // Gather state from all providers concurrently for minimum latency.
    // Rotation should be fast — spec Section 5.4 says "total rotation time"
    // is 15-30 seconds, dominated by warm-up, not capture.
    const [modifiedFiles, goalProgress, activePeerNegotiations, events] =
      await Promise.all([
        this._modifiedFiles.getModifiedFiles(agentId, buildId),
        this._goalProgress.getGoalProgress(agentId, buildId),
        this._peerNegotiations.getActiveNegotiations(agentId),
        this._esaaEvents.getAgentEvents(agentId, buildId),
      ]);

    // Extract decisions from ESAA events, including reasoning when present.
    // Decision events capture the agent's implementation choices — the
    // replacement agent needs these to avoid redoing the same analysis.
    const decisions = events
      .filter((e) => e.category === "decision")
      .map((e) => {
        const reasoning = e.payload.reasoning;
        return reasoning
          ? `${e.description} — ${String(reasoning)}`
          : e.description;
      });

    return {
      modifiedFiles: [...modifiedFiles],
      goalProgress,
      activePeerNegotiations: [...activePeerNegotiations],
      decisions,
    };
  }
}

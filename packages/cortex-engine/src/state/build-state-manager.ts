/**
 * Build State Manager — maintains live build state from ESAA events.
 *
 * The Build State Manager is a Tier 1 shared service that tracks all agent
 * states, goal progress, merge history, and produces build-level events
 * from agent-level ESAA events. It survives agent rotations and provides
 * the state foundation for warm-up sequence construction.
 *
 * State derivation: all build state is derived from ESAA events processed
 * via processESAAEvent(), plus explicit orchestrator updates for fields
 * not derivable from ESAA (context fill ratio, explicit status changes).
 * This event-sourced approach ensures the Build State Manager always
 * reflects reality and can be audited via the event log.
 *
 * Spec Section 4.2 — Tier 1 Shared Services: "Build State Tracker: Agent
 * status, goal progress, merge history. Per-build session."
 * Spec Section 5.2 — Golden Window Management (anchored state source).
 * Spec Section 5.4 — Agent Rotation (state source for warm-up construction).
 */

import { randomUUID } from "node:crypto";
import type {
  IBuildStateManager,
  IBuildState,
  IAgentState,
  GoalProgress,
  IMergeRecord,
  IESAAEvent,
  IBuildStateEvent,
  BuildStateEventCategory,
} from "@kriptik/shared-interfaces";

/** Handler for build state events. */
export type BuildStateEventHandler = (event: IBuildStateEvent) => void;

/**
 * BuildStateManager — live build state tracker as a Tier 1 shared service.
 *
 * Maintains mutable internal state derived from:
 * 1. ESAA events processed via processESAAEvent()
 * 2. Orchestrator updates (context fill, status changes, merges)
 *
 * Exposes immutable snapshots via getBuildState() for consumers.
 */
export class BuildStateManager implements IBuildStateManager {
  private _buildId: string | null = null;

  private readonly _agents = new Map<string, MutableAgentState>();
  private readonly _goals = new Map<string, MutableGoalProgress>();
  private readonly _mergeHistory: IMergeRecord[] = [];
  private _integrationHead = "";
  private _updatedAt = new Date();

  private readonly _events: IBuildStateEvent[] = [];
  private readonly _eventHandlers: BuildStateEventHandler[] = [];

  // =========================================================================
  // Lifecycle
  // =========================================================================

  initializeBuild(buildId: string, goalIds: readonly string[]): void {
    this.reset();
    this._buildId = buildId;

    for (const goalId of goalIds) {
      this._goals.set(goalId, {
        goalId,
        status: "eligible",
        assignedAgentId: null,
        progress: 0,
      });
    }

    this._updatedAt = new Date();
  }

  reset(): void {
    this._buildId = null;
    this._agents.clear();
    this._goals.clear();
    this._mergeHistory.length = 0;
    this._integrationHead = "";
    this._updatedAt = new Date();
    this._events.length = 0;
  }

  // =========================================================================
  // ESAA event processing — the primary state derivation input
  // =========================================================================

  processESAAEvent(event: IESAAEvent): void {
    this._ensureBuild();

    switch (event.category) {
      case "goal-progress":
        this._handleGoalProgress(event);
        break;
      case "merge-submitted":
        this._handleMergeSubmitted(event);
        break;
      case "rotation-triggered":
        this._handleRotationTriggered(event);
        break;
      case "decision":
        this._handleDecision(event);
        break;
      case "error-encountered":
      case "error-resolved":
        this._handleError(event);
        break;
      case "interface-proposal":
      case "interface-accept":
      case "interface-reject":
      case "peer-message":
      case "spawn-sub-agent":
        // These events update the agent's last activity time but don't
        // change build-level state directly. The Build State Manager
        // tracks agent liveness from any ESAA event.
        break;
    }

    // Update agent's last activity timestamp from any ESAA event
    const agentState = this._agents.get(event.agentId);
    if (agentState) {
      agentState.lastEventAt = event.timestamp;
    }

    this._updatedAt = event.timestamp;
  }

  // =========================================================================
  // Orchestrator-driven state updates
  // =========================================================================

  registerAgent(
    agentId: string,
    role: string,
    goalId: string | null,
  ): void {
    this._ensureBuild();

    this._agents.set(agentId, {
      agentId,
      role,
      goalId,
      contextFillRatio: 0,
      status: "active",
      lastEventAt: new Date(),
    });

    // If assigned to a goal, update goal status
    if (goalId) {
      const goal = this._goals.get(goalId);
      if (goal) {
        goal.status = "assigned";
        goal.assignedAgentId = agentId;
      }
    }

    this._emitEvent("agent-spawned", agentId, goalId, `Agent ${agentId} (${role}) spawned`, {
      role,
    });
  }

  updateAgentContextFill(agentId: string, fillRatio: number): void {
    const agent = this._agents.get(agentId);
    if (agent) {
      agent.contextFillRatio = fillRatio;
      this._updatedAt = new Date();
    }
  }

  updateAgentStatus(
    agentId: string,
    status: "active" | "rotating" | "completed" | "fired",
  ): void {
    const agent = this._agents.get(agentId);
    if (!agent) return;

    const previousStatus = agent.status;
    agent.status = status;
    this._updatedAt = new Date();

    if (status === "completed" && previousStatus !== "completed") {
      this._emitEvent(
        "agent-completed",
        agentId,
        agent.goalId,
        `Agent ${agentId} completed`,
        {},
      );

      // Mark the agent's goal as submitted (the merge gate determines final status)
      if (agent.goalId) {
        const goal = this._goals.get(agent.goalId);
        if (goal && goal.status === "assigned") {
          goal.status = "submitted";
        }
      }
    }

    if (status === "fired" && previousStatus !== "fired") {
      this._emitEvent(
        "agent-fired",
        agentId,
        agent.goalId,
        `Agent ${agentId} fired`,
        {},
      );

      // Mark the agent's goal as failed
      if (agent.goalId) {
        const goal = this._goals.get(agent.goalId);
        if (goal) {
          goal.status = "failed";
          goal.assignedAgentId = null;
        }
      }
    }
  }

  updateGoalProgress(
    goalId: string,
    progress: number,
    agentId: string,
  ): void {
    const goal = this._goals.get(goalId);
    if (!goal) return;

    goal.progress = Math.min(Math.max(progress, 0), 1);
    this._updatedAt = new Date();

    this._emitEvent(
      "goal-progress",
      agentId,
      goalId,
      `Goal ${goalId} progress: ${(progress * 100).toFixed(0)}%`,
      { progress },
    );
  }

  recordMerge(
    commitSha: string,
    agentId: string,
    goalId: string,
  ): void {
    this._ensureBuild();

    const record: IMergeRecord = {
      commitSha,
      agentId,
      goalId,
      mergedAt: new Date(),
    };
    this._mergeHistory.push(record);
    this._integrationHead = commitSha;

    // Mark goal as merged
    const goal = this._goals.get(goalId);
    if (goal) {
      goal.status = "merged";
      goal.progress = 1;
    }

    this._updatedAt = new Date();

    this._emitEvent(
      "merge-completed",
      agentId,
      goalId,
      `Goal ${goalId} merged to integration: ${commitSha.substring(0, 8)}`,
      { commitSha },
    );

    this._emitEvent(
      "goal-completed",
      agentId,
      goalId,
      `Goal ${goalId} completed`,
      { commitSha },
    );
  }

  // =========================================================================
  // Query methods
  // =========================================================================

  getBuildState(): IBuildState {
    this._ensureBuild();

    const agents = new Map<string, IAgentState>();
    for (const [id, state] of this._agents) {
      agents.set(id, { ...state });
    }

    const goals = new Map<string, GoalProgress>();
    for (const [id, progress] of this._goals) {
      goals.set(id, { ...progress });
    }

    return {
      buildId: this._buildId!,
      agents,
      goals,
      mergeHistory: [...this._mergeHistory],
      integrationHead: this._integrationHead,
      updatedAt: this._updatedAt,
    };
  }

  getAgentState(agentId: string): IAgentState | undefined {
    const state = this._agents.get(agentId);
    return state ? { ...state } : undefined;
  }

  getGoalProgress(goalId: string): GoalProgress | undefined {
    const progress = this._goals.get(goalId);
    return progress ? { ...progress } : undefined;
  }

  getEvents(
    filter?: { readonly categories?: readonly BuildStateEventCategory[] },
  ): readonly IBuildStateEvent[] {
    if (!filter?.categories || filter.categories.length === 0) {
      return [...this._events];
    }
    const categories = new Set(filter.categories);
    return this._events.filter((e) => categories.has(e.category));
  }

  onEvent(handler: (event: IBuildStateEvent) => void): () => void {
    this._eventHandlers.push(handler);
    return () => {
      const idx = this._eventHandlers.indexOf(handler);
      if (idx >= 0) {
        this._eventHandlers.splice(idx, 1);
      }
    };
  }

  getActiveAgentIds(): readonly string[] {
    const ids: string[] = [];
    for (const [id, state] of this._agents) {
      if (state.status === "active") {
        ids.push(id);
      }
    }
    return ids;
  }

  // =========================================================================
  // Internal ESAA event handlers
  // =========================================================================

  private _handleGoalProgress(event: IESAAEvent): void {
    const goalId =
      (event.payload.goalId as string) ?? this._agents.get(event.agentId)?.goalId;
    if (!goalId) return;

    const goal = this._goals.get(goalId);
    if (!goal) return;

    // Extract progress from payload if present
    const progress = event.payload.progress as number | undefined;
    if (typeof progress === "number") {
      goal.progress = Math.min(Math.max(progress, 0), 1);
    }

    // Extract file modifications
    const filesModified = event.payload.filesModified as string[] | undefined;
    if (filesModified) {
      this._emitEvent(
        "goal-progress",
        event.agentId,
        goalId,
        `Goal ${goalId}: ${event.description}`,
        { progress: goal.progress, filesModified },
      );
    }
  }

  private _handleMergeSubmitted(event: IESAAEvent): void {
    const goalId =
      (event.payload.goalId as string) ?? this._agents.get(event.agentId)?.goalId;
    if (!goalId) return;

    const goal = this._goals.get(goalId);
    if (goal && goal.status === "assigned") {
      goal.status = "submitted";
    }
  }

  private _handleRotationTriggered(event: IESAAEvent): void {
    this._emitEvent(
      "rotation-initiated",
      event.agentId,
      this._agents.get(event.agentId)?.goalId ?? null,
      `Rotation initiated for agent ${event.agentId}: ${event.description}`,
      event.payload,
    );

    const agent = this._agents.get(event.agentId);
    if (agent) {
      agent.status = "rotating";
    }
  }

  private _handleDecision(_event: IESAAEvent): void {
    // Decisions are tracked by the ESAA emitter and trail extractor.
    // The Build State Manager doesn't need to act on decisions beyond
    // updating the agent's last activity (handled in processESAAEvent).
  }

  private _handleError(_event: IESAAEvent): void {
    // Errors are tracked by the trail extractor for gotchas/resolution.
    // Build-level error tracking (e.g., agent failure count) is Phase D.
  }

  // =========================================================================
  // Internal helpers
  // =========================================================================

  private _ensureBuild(): void {
    if (!this._buildId) {
      throw new Error(
        "BuildStateManager: no build initialized. Call initializeBuild() first.",
      );
    }
  }

  private _emitEvent(
    category: BuildStateEventCategory,
    agentId: string | null,
    goalId: string | null,
    description: string,
    payload: Record<string, unknown>,
  ): void {
    const event: IBuildStateEvent = {
      id: randomUUID(),
      buildId: this._buildId!,
      category,
      agentId,
      goalId,
      description,
      payload,
      timestamp: new Date(),
    };

    this._events.push(event);

    for (const handler of this._eventHandlers) {
      handler(event);
    }
  }
}

// ---------------------------------------------------------------------------
// Internal mutable state types
// ---------------------------------------------------------------------------

interface MutableAgentState {
  readonly agentId: string;
  readonly role: string;
  goalId: string | null;
  contextFillRatio: number;
  status: "active" | "rotating" | "completed" | "fired";
  lastEventAt: Date;
}

interface MutableGoalProgress {
  readonly goalId: string;
  status: "blocked" | "eligible" | "assigned" | "submitted" | "merged" | "failed";
  assignedAgentId: string | null;
  progress: number;
}

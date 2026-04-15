/**
 * Trail extractor — synthesizes experiential trail entries from ESAA
 * event sequences.
 *
 * Correlates events by (agentId, goalId) to build up a state machine per
 * goal. When a goal reaches a terminal state (merged, abandoned, fired),
 * the accumulated events are synthesized into a single ITrailEntry.
 *
 * State machine per goal:
 * - "decision" events → set the trail's decision and reasoning fields
 * - "goal-progress" events → accumulate filesAffected, dependenciesUsed
 * - "error-encountered" events → accumulate gotchasEncountered
 * - "error-resolved" events → set resolution
 * - "merge-submitted" / "rotation-triggered" → terminal state
 *
 * Spec Section 6.3 — "Every decision an agent makes, every dead end it
 * hits, every correction it applies is captured as a structured experiential
 * trail entry."
 */

import type {
  ITrailExtractor,
  ITrailEntry,
  TrailOutcome,
  TrailType,
  IESAAEvent,
} from "@kriptik/shared-interfaces";

/** Buffered state for a single agent+goal combination. */
interface GoalEventBuffer {
  readonly agentId: string;
  readonly goalId: string;
  readonly buildId: string;
  /** The most recent decision description. */
  decision: string;
  /** The most recent decision reasoning. */
  reasoning: string;
  /** Accumulated files affected. */
  filesAffected: Set<string>;
  /** Accumulated dependencies used. */
  dependenciesUsed: Set<string>;
  /** Accumulated gotchas. */
  gotchasEncountered: string[];
  /** Resolution for the most recent gotcha, if any. */
  resolution: string | null;
  /** Evaluator score if received. */
  evaluatorScore: number | null;
  /** First event timestamp (for recordedAt). */
  firstEventAt: Date;
  /** Total events processed for this goal. */
  eventCount: number;
}

/**
 * Synthesizes trail entries from ESAA event streams.
 *
 * Usage:
 * 1. Subscribe to ESAA events and call processEvent() for each
 * 2. When a goal reaches terminal state, call finalizeTrail()
 * 3. The extractor returns a complete ITrailEntry or null if insufficient data
 */
export class TrailExtractor implements ITrailExtractor {
  /**
   * Buffers keyed by "agentId:goalId".
   * Each buffer accumulates events for a single agent working on a single goal.
   */
  private readonly _buffers = new Map<string, GoalEventBuffer>();

  processEvent(event: IESAAEvent): void {
    const goalId = extractGoalId(event);
    if (!goalId) return; // Event not associated with a goal

    const key = `${event.agentId}:${goalId}`;
    let buffer = this._buffers.get(key);

    if (!buffer) {
      buffer = {
        agentId: event.agentId,
        goalId,
        buildId: event.buildId,
        decision: "",
        reasoning: "",
        filesAffected: new Set(),
        dependenciesUsed: new Set(),
        gotchasEncountered: [],
        resolution: null,
        evaluatorScore: null,
        firstEventAt: event.timestamp,
        eventCount: 0,
      };
      this._buffers.set(key, buffer);
    }

    buffer.eventCount++;

    switch (event.category) {
      case "decision":
        buffer.decision = event.description;
        if (typeof event.payload.reasoning === "string") {
          buffer.reasoning = event.payload.reasoning;
        }
        break;

      case "goal-progress":
        if (Array.isArray(event.payload.filesModified)) {
          for (const f of event.payload.filesModified) {
            if (typeof f === "string") buffer.filesAffected.add(f);
          }
        }
        if (Array.isArray(event.payload.filesCreated)) {
          for (const f of event.payload.filesCreated) {
            if (typeof f === "string") buffer.filesAffected.add(f);
          }
        }
        if (Array.isArray(event.payload.dependenciesUsed)) {
          for (const d of event.payload.dependenciesUsed) {
            if (typeof d === "string") buffer.dependenciesUsed.add(d);
          }
        }
        break;

      case "error-encountered":
        buffer.gotchasEncountered.push(event.description);
        buffer.resolution = null; // Reset until resolved
        break;

      case "error-resolved":
        buffer.resolution = event.description;
        break;

      case "merge-submitted":
        if (typeof event.payload.evaluatorScore === "number") {
          buffer.evaluatorScore = event.payload.evaluatorScore;
        }
        break;

      // Other event categories (interface-proposal, peer-message, etc.)
      // don't directly contribute to trail fields but are buffered by
      // the key so they're available if needed in future enhancements.
    }
  }

  finalizeTrail(
    agentId: string,
    goalId: string,
    taskType: string,
    outcome: TrailOutcome,
  ): ITrailEntry | null {
    const key = `${agentId}:${goalId}`;
    const buffer = this._buffers.get(key);

    if (!buffer || buffer.eventCount === 0) {
      return null;
    }

    // Insufficient data — no decision was captured
    if (!buffer.decision) {
      this._buffers.delete(key);
      return null;
    }

    const trailType = outcomeToTrailType(outcome);

    const trail: ITrailEntry = {
      id: "", // Will be assigned by TrailStore on insert
      trailType,
      taskType,
      decision: buffer.decision,
      reasoning: buffer.reasoning || "No reasoning captured",
      outcome,
      evaluatorScore: buffer.evaluatorScore,
      filesAffected: Array.from(buffer.filesAffected),
      dependenciesUsed: Array.from(buffer.dependenciesUsed),
      gotchasEncountered: buffer.gotchasEncountered,
      resolution: buffer.resolution,
      buildId: buffer.buildId,
      agentId: buffer.agentId,
      recordedAt: new Date(),
      lastValidatedAt: null,
    };

    this._buffers.delete(key);
    return trail;
  }

  clearAgent(agentId: string): void {
    for (const [key] of this._buffers) {
      if (key.startsWith(`${agentId}:`)) {
        this._buffers.delete(key);
      }
    }
  }

  clearAll(): void {
    this._buffers.clear();
  }
}

/**
 * Extract goalId from an ESAA event's payload.
 * Events that are goal-associated should include goalId in their payload.
 */
function extractGoalId(event: IESAAEvent): string | null {
  if (typeof event.payload.goalId === "string") {
    return event.payload.goalId;
  }
  return null;
}

/**
 * Map a trail outcome to its corresponding trail type.
 *
 * Spec Section 6.3 — Trail Types:
 * - passed_first_pass / passed_after_fix → implementation
 * - required_rotation → implementation (still succeeded)
 * - required_firing → violation (contract violation triggered firing)
 * - abandoned → dead-end
 */
function outcomeToTrailType(outcome: TrailOutcome): TrailType {
  switch (outcome) {
    case "passed_first_pass":
    case "passed_after_fix":
    case "required_rotation":
      return "implementation";
    case "required_firing":
      return "violation";
    case "abandoned":
      return "dead-end";
  }
}

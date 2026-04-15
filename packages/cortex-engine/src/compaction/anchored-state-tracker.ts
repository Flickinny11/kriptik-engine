/**
 * Anchored State Tracker — maintains the four-field anchored state document
 * for each agent session by incrementally merging ESAA events.
 *
 * Spec Section 5.2, Mechanism 2 — Factory.ai-Style Anchored State Preservation:
 * "Rather than regenerating summaries from scratch, the Build State Manager
 * incrementally merges new information into a persistent four-field state
 * document."
 *
 * The four fields:
 *   - Intent: what the agent is trying to accomplish and why
 *   - Changes: what has been built, modified, and merged so far
 *   - Decisions: key implementation decisions made and their reasoning
 *   - Next steps: what remains and what the immediate priorities are
 *
 * This document is maintained OUTSIDE the agent's context and injected after
 * every compaction event. Evaluated across real engineering sessions, this
 * pattern scored highest on accuracy (4.04 vs Anthropic's 3.74 and OpenAI's 3.43).
 */

import type {
  IAnchoredState,
  IAnchoredStateTracker,
  IESAAEvent,
} from "@kriptik/shared-interfaces";

/** Mutable internal state for an agent's anchored document. */
interface MutableAnchoredState {
  intent: string;
  changes: string[];
  decisions: string[];
  nextSteps: string;
  buildId: string;
}

/**
 * AnchoredStateTracker — concrete implementation of IAnchoredStateTracker.
 *
 * Processes ESAA events from agent sessions and incrementally builds the
 * four-field anchored state document. Each event category maps to one or
 * more fields:
 *
 *   - "decision" events -> decisions field
 *   - "goal-progress" events -> changes field + next steps field
 *   - "merge-submitted" events -> changes field
 *   - "interface-proposal/accept/reject" events -> decisions field
 *   - "error-resolved" events -> decisions field (the fix reasoning)
 *   - "rotation-triggered" events -> next steps field
 *
 * The tracker caps the size of each field to prevent unbounded growth.
 * Older entries are summarized when limits are reached.
 */
export class AnchoredStateTracker implements IAnchoredStateTracker {
  private readonly _states = new Map<string, MutableAnchoredState>();

  /**
   * Maximum number of individual change entries before summarization.
   * Keeps the injected document concise enough for post-compaction context.
   */
  private static readonly MAX_CHANGE_ENTRIES = 20;

  /**
   * Maximum number of decision entries before summarization.
   */
  private static readonly MAX_DECISION_ENTRIES = 15;

  initializeForAgent(
    agentId: string,
    buildId: string,
    initialIntent: string,
  ): void {
    this._states.set(agentId, {
      intent: initialIntent,
      changes: [],
      decisions: [],
      nextSteps: "Beginning work on assigned goal.",
      buildId,
    });
  }

  processEvent(event: IESAAEvent): void {
    const state = this._states.get(event.agentId);
    if (!state) return;

    switch (event.category) {
      case "decision":
        this._addDecision(state, event.description);
        break;

      case "goal-progress":
        this._addChange(state, event);
        this._updateNextStepsFromProgress(state, event);
        break;

      case "merge-submitted":
        this._addChange(state, event);
        break;

      case "interface-proposal":
        this._addDecision(
          state,
          `Proposed interface: ${event.description}`,
        );
        break;

      case "interface-accept":
        this._addDecision(
          state,
          `Accepted interface: ${event.description}`,
        );
        break;

      case "interface-reject":
        this._addDecision(
          state,
          `Rejected interface: ${event.description}`,
        );
        break;

      case "error-resolved":
        this._addDecision(state, `Resolved: ${event.description}`);
        this._addChange(state, event);
        break;

      case "rotation-triggered":
        state.nextSteps = `Agent rotation triggered: ${event.description}. Continuation needed.`;
        break;

      case "error-encountered":
        // Errors update next steps to reflect the current blocker
        state.nextSteps = `Addressing error: ${event.description}`;
        break;

      case "spawn-sub-agent":
        this._addChange(state, event);
        break;

      case "peer-message":
        // Peer messages may contain negotiation context
        if (event.payload.type === "proposal" || event.payload.type === "counter-proposal") {
          this._addDecision(
            state,
            `Peer negotiation: ${event.description}`,
          );
        }
        break;
    }
  }

  getState(agentId: string): IAnchoredState | null {
    const state = this._states.get(agentId);
    if (!state) return null;

    return {
      intent: state.intent,
      changes: this._formatChanges(state.changes),
      decisions: this._formatDecisions(state.decisions),
      nextSteps: state.nextSteps,
    };
  }

  updateField(
    agentId: string,
    field: keyof IAnchoredState,
    value: string,
  ): void {
    const state = this._states.get(agentId);
    if (!state) return;

    switch (field) {
      case "intent":
        state.intent = value;
        break;
      case "changes":
        // Replace all changes with a single summary
        state.changes = [value];
        break;
      case "decisions":
        // Replace all decisions with a single summary
        state.decisions = [value];
        break;
      case "nextSteps":
        state.nextSteps = value;
        break;
    }
  }

  removeAgent(agentId: string): void {
    this._states.delete(agentId);
  }

  /**
   * Add a change entry, condensing older entries when the limit is reached.
   */
  private _addChange(state: MutableAnchoredState, event: IESAAEvent): void {
    const entry = this._formatEventEntry(event);
    state.changes.push(entry);

    if (state.changes.length > AnchoredStateTracker.MAX_CHANGE_ENTRIES) {
      this._condenseChanges(state);
    }
  }

  /**
   * Add a decision entry, condensing older entries when the limit is reached.
   */
  private _addDecision(state: MutableAnchoredState, description: string): void {
    state.decisions.push(description);

    if (state.decisions.length > AnchoredStateTracker.MAX_DECISION_ENTRIES) {
      this._condenseDecisions(state);
    }
  }

  /**
   * Update next steps based on goal-progress events.
   *
   * If the event payload includes explicit next steps, use them.
   * Otherwise infer from the progress description.
   */
  private _updateNextStepsFromProgress(
    state: MutableAnchoredState,
    event: IESAAEvent,
  ): void {
    if (typeof event.payload.nextSteps === "string") {
      state.nextSteps = event.payload.nextSteps;
    } else if (typeof event.payload.stopReason === "string" && event.payload.stopReason === "end_turn") {
      // Agent completed a turn normally — next steps remain as-is
      // unless we have more specific info
      if (typeof event.payload.progress === "string") {
        state.nextSteps = `Continuing: ${event.payload.progress}`;
      }
    }
  }

  /**
   * Format an ESAA event into a concise change entry.
   */
  private _formatEventEntry(event: IESAAEvent): string {
    const toolsUsed =
      Array.isArray(event.payload.toolsUsed) && event.payload.toolsUsed.length > 0
        ? ` [tools: ${(event.payload.toolsUsed as string[]).join(", ")}]`
        : "";
    return `${event.description}${toolsUsed}`;
  }

  /**
   * Condense the changes list by keeping recent entries and summarizing older ones.
   *
   * Strategy: keep the most recent half, summarize the older half into a
   * single "Earlier work" entry. This prevents the anchored state from growing
   * unboundedly while preserving the most relevant recent context.
   */
  private _condenseChanges(state: MutableAnchoredState): void {
    const midpoint = Math.floor(state.changes.length / 2);
    const older = state.changes.slice(0, midpoint);
    const recent = state.changes.slice(midpoint);

    const summary = `Earlier work (${older.length} actions): ${older.slice(0, 3).join("; ")}${older.length > 3 ? ` and ${older.length - 3} more actions` : ""}`;

    state.changes = [summary, ...recent];
  }

  /**
   * Condense the decisions list similarly to changes.
   */
  private _condenseDecisions(state: MutableAnchoredState): void {
    const midpoint = Math.floor(state.decisions.length / 2);
    const older = state.decisions.slice(0, midpoint);
    const recent = state.decisions.slice(midpoint);

    const summary = `Earlier decisions (${older.length}): ${older.slice(0, 3).join("; ")}${older.length > 3 ? ` and ${older.length - 3} more` : ""}`;

    state.decisions = [summary, ...recent];
  }

  /**
   * Format the changes array into a single string for the anchored state.
   */
  private _formatChanges(changes: string[]): string {
    if (changes.length === 0) return "No changes recorded yet.";
    return changes.map((c, i) => `${i + 1}. ${c}`).join("\n");
  }

  /**
   * Format the decisions array into a single string for the anchored state.
   */
  private _formatDecisions(decisions: string[]): string {
    if (decisions.length === 0) return "No decisions recorded yet.";
    return decisions.map((d, i) => `${i + 1}. ${d}`).join("\n");
  }
}

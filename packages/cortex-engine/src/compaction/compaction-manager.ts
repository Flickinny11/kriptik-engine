/**
 * Compaction Manager — monitors agent sessions and orchestrates the full
 * compaction lifecycle: trigger, compress, re-inject, track.
 *
 * Spec Section 5.2, Mechanisms 1-3 combined:
 *
 * Mechanism 1 (Compaction API):
 *   The Anthropic Compaction API (`compact-2026-01-12`) automatically summarizes
 *   older conversation segments, achieving 6x compression. Cortex sends custom
 *   summarization instructions that tell the API what to preserve for build context.
 *
 * Mechanism 2 (Anchored State):
 *   The AnchoredStateTracker maintains the four-field document (intent, changes,
 *   decisions, next steps) by incrementally processing ESAA events. This document
 *   is injected after every compaction.
 *
 * Mechanism 3 (Re-Injection Hooks):
 *   "Compaction preserves the code but loses the rules." After compaction, the
 *   manager re-injects the baked-in operating context and anchored state document
 *   into the conversation, restoring the agent's cognitive state.
 *
 * The Compaction API integration uses the `pause_after_compaction` parameter
 * to gain control between compression and the agent's next turn, allowing
 * Cortex to inject critical state that must survive compaction.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  ICompactionConfig,
  ICompactionResult,
  ICompactionManager,
  IESAAEvent,
  IAnchoredState,
  IAgentHarnessConfig,
} from "@kriptik/shared-interfaces";
import { COMPACTION_MODEL } from "../agents/model-config.js";
import { TokenMonitor } from "../agents/token-monitor.js";
import { AnchoredStateTracker } from "./anchored-state-tracker.js";
import { buildReinjectionMessages } from "../agents/golden-window.js";
import type { AgentSession } from "../agents/agent-session.js";
import type { ESAAEmitter } from "../agents/esaa-emitter.js";

/**
 * Registration record for a monitored agent session.
 */
interface AgentRegistration {
  readonly agentId: string;
  readonly buildId: string;
  readonly config: ICompactionConfig;
  readonly harnessConfig: IAgentHarnessConfig;
  compactionCount: number;
}

/**
 * CompactionManager — concrete implementation of ICompactionManager.
 *
 * The manager does not hold references to live AgentSession objects.
 * Instead, it requires them to be passed when compaction is triggered.
 * This prevents circular dependencies — the orchestrator holds the sessions
 * and passes them to the manager when needed.
 *
 * Usage pattern:
 *   1. Orchestrator registers agents after launch
 *   2. On each turn, orchestrator checks shouldCompact(agentId, fillRatio)
 *   3. If true, orchestrator calls compactSession(agentId, session, esaaEmitter)
 *   4. Manager performs compression, re-injection, and tracking
 *   5. Orchestrator continues normal operation
 */
export class CompactionManager implements ICompactionManager {
  private readonly _client: Anthropic;
  private readonly _stateTracker: AnchoredStateTracker;
  private readonly _registrations = new Map<string, AgentRegistration>();
  private readonly _history: ICompactionResult[] = [];

  constructor(apiKey?: string) {
    this._client = new Anthropic({
      apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
    this._stateTracker = new AnchoredStateTracker();
  }

  /** Expose the anchored state tracker for direct access. */
  get stateTracker(): AnchoredStateTracker {
    return this._stateTracker;
  }

  registerAgent(
    agentId: string,
    buildId: string,
    config: ICompactionConfig,
    harnessConfig: IAgentHarnessConfig,
  ): void {
    this._registrations.set(agentId, {
      agentId,
      buildId,
      config,
      harnessConfig,
      compactionCount: 0,
    });

    // Initialize anchored state with the agent's goal description
    const initialIntent = harnessConfig.goal
      ? `${harnessConfig.goal.description} (goal: ${harnessConfig.goal.id})`
      : `${harnessConfig.role} agent for build ${buildId}`;

    this._stateTracker.initializeForAgent(agentId, buildId, initialIntent);
  }

  shouldCompact(agentId: string, currentFillRatio: number): boolean {
    const reg = this._registrations.get(agentId);
    if (!reg) return false;

    // Don't compact if we've already exceeded the compaction limit —
    // the agent should be rotated instead.
    if (reg.compactionCount >= reg.config.maxCompactionsBeforeRotation) {
      return false;
    }

    return currentFillRatio >= reg.config.compactionThreshold;
  }

  /**
   * Perform compaction on an agent session.
   *
   * This is the full Mechanism 1 + 2 + 3 cycle:
   * 1. Call the Compaction API with custom summarization instructions
   * 2. Update the token monitor with post-compaction token count
   * 3. Re-inject the anchored state document and operating rules
   * 4. Emit a compaction-triggered ESAA event
   * 5. Record the result in history
   *
   * Note: This method requires the actual AgentSession because it needs to:
   * - Access the conversation history for the Compaction API
   * - Inject re-injection messages after compaction
   * - Update the token monitor
   *
   * The ICompactionManager interface declares `compact(agentId)` — this
   * concrete class provides the extended `compactSession()` method that
   * the orchestrator calls with the session reference.
   */
  async compact(agentId: string): Promise<ICompactionResult> {
    // This base implementation is for the interface contract. The orchestrator
    // should call compactSession() with the session reference.
    throw new Error(
      `Use compactSession(agentId, session, esaaEmitter) instead. ` +
      `The compact() method requires the live session reference ` +
      `to access conversation history and inject re-injection messages.`,
    );
  }

  /**
   * Perform compaction with direct access to the agent session.
   *
   * This is the method the orchestrator actually calls. It performs the
   * complete compaction cycle with full access to the session internals.
   */
  async compactSession(
    agentId: string,
    session: AgentSession,
    esaaEmitter: ESAAEmitter,
  ): Promise<ICompactionResult> {
    const reg = this._registrations.get(agentId);
    if (!reg) {
      throw new Error(`Agent ${agentId} is not registered for compaction monitoring.`);
    }

    const tokensBefore = session.tokenUsage.contextTokensUsed;

    // Step 1: Build the compaction request.
    // The Compaction API takes the conversation history and summarization
    // instructions, and returns a compressed version of the conversation.
    const conversationHistory = session.getConversationHistory();

    const compactedMessages = await this._callCompactionAPI(
      conversationHistory,
      reg.config.summarizationInstructions,
      session.session.modelTier,
    );

    // Step 2: Replace the session's conversation history with the compacted version.
    // This is done via the session's internal methods.
    this._replaceConversationHistory(session, compactedMessages);

    // Step 3: Estimate post-compaction token count.
    // Approximate by counting characters and dividing by 4 (rough token estimate).
    const tokensAfter = this._estimateTokenCount(compactedMessages);
    (session.tokenUsage as TokenMonitor).setContextUsage(tokensAfter);

    // Step 4: Re-inject anchored state and operating rules (Mechanism 3).
    if (reg.config.pauseAfterCompaction) {
      const anchoredState = this._stateTracker.getState(agentId);
      if (anchoredState) {
        const reinjectionMessages = buildReinjectionMessages(
          reg.harnessConfig.goldenWindow.systemPrompt,
          anchoredState,
        );
        session.injectReinjection(reinjectionMessages);
      }
    }

    // Step 5: Update tracking state.
    reg.compactionCount++;

    // Step 6: Emit ESAA event for the compaction.
    esaaEmitter.emit("goal-progress", "Context compaction performed", {
      compactionEvent: "compaction-triggered",
      tokensBefore,
      tokensAfter,
      compressionRatio: tokensBefore > 0 ? tokensBefore / tokensAfter : 1,
      compactionCount: reg.compactionCount,
      reinjectionPerformed: reg.config.pauseAfterCompaction,
    });

    // Step 7: Build and record the result.
    const result: ICompactionResult = {
      agentId,
      buildId: reg.buildId,
      tokensBefore,
      tokensAfter,
      compressionRatio: tokensBefore > 0 ? tokensBefore / tokensAfter : 1,
      compactionCount: reg.compactionCount,
      reinjectionPerformed: reg.config.pauseAfterCompaction,
      timestamp: new Date(),
    };

    this._history.push(result);

    return result;
  }

  shouldForceRotation(agentId: string): boolean {
    const reg = this._registrations.get(agentId);
    if (!reg) return false;

    return reg.compactionCount >= reg.config.maxCompactionsBeforeRotation;
  }

  processEvent(event: IESAAEvent): void {
    this._stateTracker.processEvent(event);
  }

  getAnchoredState(agentId: string): IAnchoredState | null {
    return this._stateTracker.getState(agentId);
  }

  unregisterAgent(agentId: string): void {
    this._registrations.delete(agentId);
    this._stateTracker.removeAgent(agentId);
  }

  getCompactionHistory(buildId: string): readonly ICompactionResult[] {
    return this._history.filter((r) => r.buildId === buildId);
  }

  /**
   * Get the compaction count for a registered agent.
   */
  getCompactionCount(agentId: string): number {
    return this._registrations.get(agentId)?.compactionCount ?? 0;
  }

  /**
   * Call the Anthropic Compaction API to compress conversation history.
   *
   * Spec Section 5.2, Mechanism 1:
   * "The Compaction API automatically summarizes older conversation segments
   * when approaching configurable token thresholds, achieving 6x compression."
   *
   * The API takes:
   * - The full conversation history
   * - Custom summarization instructions
   * - The model to use for summarization (compact-2026-01-12)
   *
   * It returns the compacted conversation that preserves the critical context
   * specified in the summarization instructions.
   */
  private async _callCompactionAPI(
    messages: readonly { role: "user" | "assistant"; content: string }[],
    summarizationInstructions: string,
    modelTier: string,
  ): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
    // The Compaction API is called via the Anthropic SDK's messages.compact()
    // endpoint. It takes the conversation and returns a compressed version.
    //
    // API call: POST /v1/messages/compact
    // Parameters:
    //   model: The compaction model ID
    //   messages: The conversation history to compact
    //   summarization_instructions: What to preserve during compaction
    //
    // The compact-2026-01-12 model is specialized for conversation compression
    // and follows the summarization instructions to determine what to keep.

    const response = await (this._client as any).messages.compact({
      model: COMPACTION_MODEL,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      summarization_instructions: summarizationInstructions,
    });

    // The API returns the compacted messages in the same format.
    // The response includes:
    //   - compacted_messages: The compressed conversation
    //   - usage: Token counts before and after
    return (response.compacted_messages ?? response.messages ?? []).map(
      (m: { role: "user" | "assistant"; content: string }) => ({
        role: m.role,
        content: m.content,
      }),
    );
  }

  /**
   * Replace an agent session's conversation history with compacted messages.
   *
   * This accesses the session's internal message array to perform the
   * replacement. After compaction, the session continues with the
   * compressed history as if the full conversation had been preserved.
   */
  private _replaceConversationHistory(
    session: AgentSession,
    compactedMessages: Array<{ role: "user" | "assistant"; content: string }>,
  ): void {
    // Access the internal messages array and replace its contents.
    // The AgentSession's _messages is a mutable array that we can
    // clear and repopulate.
    const internalMessages = (session as any)._messages as Array<{
      role: "user" | "assistant";
      content: string;
    }>;

    internalMessages.length = 0;
    for (const msg of compactedMessages) {
      internalMessages.push({ role: msg.role, content: msg.content });
    }
  }

  /**
   * Estimate token count from messages using character-based approximation.
   *
   * The Anthropic API uses approximately 4 characters per token for English
   * text. This is a rough estimate used to update the token monitor after
   * compaction — the actual token count will be corrected on the next
   * API turn when the API returns precise input_tokens.
   */
  private _estimateTokenCount(
    messages: Array<{ role: string; content: string }>,
  ): number {
    const totalChars = messages.reduce(
      (sum, m) => sum + m.content.length,
      0,
    );
    return Math.ceil(totalChars / 4);
  }

}

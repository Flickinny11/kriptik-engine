/**
 * Core agent session — wraps a single Anthropic API conversation.
 *
 * Each agent is a SEPARATE API conversation with its own context window.
 * Agents are NOT orchestration loops. The session manages:
 * - Creating the API session with the right model, tools, system prompt
 * - Sending messages and receiving responses
 * - Tracking token usage via TokenMonitor
 * - Emitting ESAA events for state transfer
 * - Signaling when context fill crosses rotation thresholds
 *
 * Spec Section 3.1 — agents are autonomous API sessions.
 * Spec Section 1.4 — all agents use the Anthropic Messages API.
 * Spec Section 5.4 — golden window formation and rotation.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  IAgentSession,
  IAgentHarnessConfig,
  ILiveAgentSession,
  IAgentResponse,
  IAgentSessionEvent,
  IToolUseBlock,
  AgentSessionState,
  AgentRole,
  ModelTier,
  ITokenUsage,
  IToolDefinition,
} from "@kriptik/shared-interfaces";
import { getModelConfig, EXTENDED_THINKING_BUDGET_TOKENS } from "./model-config.js";
import { TokenMonitor } from "./token-monitor.js";
import { ESAAEmitter } from "./esaa-emitter.js";
import {
  buildSystemPrompt,
  buildInitialMessages,
  type ConversationMessage,
} from "./golden-window.js";

/**
 * A live agent session backed by the Anthropic Messages API.
 *
 * The session holds the conversation history, sends it with each turn,
 * and tracks token usage. It does NOT decide what the agent should do —
 * it provides the communication channel and monitoring infrastructure.
 */
export class AgentSession implements ILiveAgentSession {
  private readonly _client: Anthropic;
  private readonly _systemPrompt: string;
  private readonly _messages: Array<{ role: "user" | "assistant"; content: string }>;
  private readonly _tokenMonitor: TokenMonitor;
  private readonly _esaaEmitter: ESAAEmitter;
  private readonly _eventHandlers: Array<(event: IAgentSessionEvent) => void> = [];
  private readonly _tools: readonly IToolDefinition[];
  private _state: AgentSessionState = "initializing";
  private _isActive = true;

  /** Immutable session metadata set at construction time. */
  private readonly _sessionId: string;
  private readonly _buildId: string;
  private readonly _role: AgentRole;
  private readonly _modelTier: ModelTier;
  private readonly _goalId: string | null;
  private readonly _createdAt: Date;
  private readonly _maxContextTokens: number;
  private readonly _peerIds: readonly string[];
  private readonly _replacesId: string | null;
  private _replacedById: string | null = null;

  /**
   * Live session snapshot — constructed from current state on each access
   * so that `session.state`, `contextTokensUsed`, and `contextFillRatio`
   * always reflect the latest values.
   */
  get session(): IAgentSession {
    return {
      id: this._sessionId,
      buildId: this._buildId,
      role: this._role,
      modelTier: this._modelTier,
      state: this._state,
      goalId: this._goalId,
      createdAt: this._createdAt,
      contextTokensUsed: this._tokenMonitor.contextTokensUsed,
      contextTokensMax: this._maxContextTokens,
      contextFillRatio: this._tokenMonitor.fillRatio,
      peerIds: this._peerIds,
      replacedById: this._replacedById,
      replacesId: this._replacesId,
    };
  }

  /** Set the replacedById field when this session is rotated out. */
  setReplacedBy(replacementId: string): void {
    this._replacedById = replacementId;
  }

  constructor(
    client: Anthropic,
    config: IAgentHarnessConfig,
    sessionId: string,
  ) {
    this._client = client;
    this._tools = config.tools;

    const modelConfig = getModelConfig(config.modelTier);

    this._sessionId = sessionId;
    this._buildId = config.buildId;
    this._role = config.role;
    this._modelTier = config.modelTier;
    this._goalId = config.goal?.id ?? null;
    this._createdAt = new Date();
    this._maxContextTokens = modelConfig.maxContextTokens;
    this._peerIds = config.peerIds;
    this._replacesId = config.replacesId ?? null;

    this._systemPrompt = buildSystemPrompt(config.goldenWindow);
    this._messages = buildInitialMessages(config.goldenWindow);

    this._tokenMonitor = new TokenMonitor(
      modelConfig.maxContextTokens,
      config.rotationWarningThreshold,
      config.rotationCriticalThreshold,
    );

    this._esaaEmitter = new ESAAEmitter(config.buildId, sessionId);

    // Wire token monitor threshold events to session event handlers
    this._tokenMonitor.onThreshold((thresholdEvent) => {
      this._emitEvent(thresholdEvent.type, {
        fillRatio: thresholdEvent.fillRatio,
        contextTokensUsed: thresholdEvent.contextTokensUsed,
        contextTokensMax: thresholdEvent.contextTokensMax,
      });
    });

    // Wire ESAA events through to session event handlers
    this._esaaEmitter.onEvent((esaaEvent) => {
      this._emitEvent("turn-complete", {
        esaaEventId: esaaEvent.id,
        category: esaaEvent.category,
      });
    });

    this._state = "active";
  }

  get tokenUsage(): ITokenUsage {
    return this._tokenMonitor;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  /** The ESAA emitter for this session — used by the harness for event capture. */
  get esaaEmitter(): ESAAEmitter {
    return this._esaaEmitter;
  }

  /** Current session state. */
  get state(): AgentSessionState {
    return this._state;
  }

  onEvent(handler: (event: IAgentSessionEvent) => void): void {
    this._eventHandlers.push(handler);
  }

  /**
   * Send a message to the agent and receive the response.
   *
   * This is the core interaction loop. The full conversation history
   * is sent with each turn — the Anthropic API is stateless, so context
   * is maintained by replaying the entire message sequence.
   */
  async send(message: string): Promise<IAgentResponse> {
    if (!this._isActive) {
      throw new Error(
        `Agent session ${this._sessionId} is not active (state: ${this._state})`,
      );
    }

    // Add the user message to conversation history
    this._messages.push({ role: "user", content: message });

    try {
      // Build the API request
      const response = await this._client.messages.create({
        model: this._modelTier,
        max_tokens: 16_384,
        system: this._systemPrompt,
        messages: this._messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        tools: this._tools.length > 0 ? this._formatTools() : undefined,
        thinking: {
          type: "enabled",
          budget_tokens: EXTENDED_THINKING_BUDGET_TOKENS,
        },
      });

      // Extract response content
      const textBlocks: string[] = [];
      const toolBlocks: IToolUseBlock[] = [];
      let thinkingContent: string | undefined;

      for (const block of response.content) {
        if (block.type === "text") {
          textBlocks.push(block.text);
        } else if (block.type === "tool_use") {
          toolBlocks.push({
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          });
        } else if (block.type === "thinking") {
          thinkingContent = block.thinking;
        }
      }

      const textContent = textBlocks.join("\n");

      // Add assistant response to conversation history
      this._messages.push({ role: "assistant", content: textContent });

      // Update token tracking
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      this._tokenMonitor.recordTurn(inputTokens, outputTokens);

      // Emit ESAA event for this turn
      this._esaaEmitter.emit("goal-progress", `Turn completed`, {
        inputTokens,
        outputTokens,
        contextFillRatio: this._tokenMonitor.fillRatio,
        toolsUsed: toolBlocks.map((t) => t.name),
        stopReason: response.stop_reason,
      });

      // Emit tool-use events
      for (const tool of toolBlocks) {
        this._emitEvent("tool-use", {
          toolName: tool.name,
          toolId: tool.id,
        });
      }

      return {
        textContent,
        toolUse: toolBlocks,
        inputTokens,
        outputTokens,
        stopReason: response.stop_reason ?? "end_turn",
        thinkingContent,
      };
    } catch (error) {
      // Emit ESAA error event before re-throwing so failures are
      // captured in the event log for post-mortem and trail extraction.
      this._esaaEmitter.emit("error-encountered",
        `API call failed: ${error instanceof Error ? error.message : String(error)}`,
        {
          errorType: error instanceof Error ? error.constructor.name : "unknown",
          message: error instanceof Error ? error.message : String(error),
        },
      );
      this._emitEvent("error", {
        message: error instanceof Error ? error.message : String(error),
      });

      // Remove the user message that caused the failure so conversation
      // history stays consistent for retry attempts.
      this._messages.pop();

      throw error;
    }
  }

  /**
   * Mark this session as terminated. No further messages can be sent.
   */
  terminate(reason: AgentSessionState): void {
    this._state = reason;
    this._isActive = false;

    this._esaaEmitter.emit(
      reason === "fired" ? "rotation-triggered" : "goal-progress",
      `Session terminated: ${reason}`,
      { finalState: reason },
    );
  }

  /**
   * Inject post-compaction re-injection messages into the conversation.
   * Called by the harness when the Compaction API fires.
   */
  injectReinjection(messages: ConversationMessage[]): void {
    for (const msg of messages) {
      this._messages.push({ role: msg.role, content: msg.content });
    }
  }

  /** Get the current conversation history (for state capture during rotation). */
  getConversationHistory(): readonly ConversationMessage[] {
    return this._messages;
  }

  /** Format tool definitions for the Anthropic API. */
  private _formatTools(): Anthropic.Tool[] {
    return this._tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema as Anthropic.Tool.InputSchema,
    }));
  }

  private _emitEvent(
    type: IAgentSessionEvent["type"],
    payload: Record<string, unknown>,
  ): void {
    const event: IAgentSessionEvent = {
      type,
      agentId: this._sessionId,
      timestamp: new Date(),
      payload,
    };
    for (const handler of this._eventHandlers) {
      handler(event);
    }
  }
}

/**
 * Agent harness — manages the full lifecycle of agent sessions.
 *
 * The harness is the subsystem that:
 * - Creates Anthropic API sessions with golden window formation
 * - Monitors token usage and signals the Drift Detection System
 * - Captures ESAA events from agent actions
 * - Handles rotation (terminate degraded, launch replacement)
 *
 * The harness does NOT:
 * - Decide what the agent should do
 * - Parse agent output to extract "next steps"
 * - Manage a task queue for the agent
 * - Orchestrate multi-step workflows within a single agent
 *
 * Spec Section 3.1 — agents are autonomous API sessions.
 * Spec Section 5.4 — rotation and warm-up sequences.
 * Spec Section 12.4, Phase A Step 1.
 */

import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import type {
  IAgentHarness,
  IAgentHarnessConfig,
  ILiveAgentSession,
  IESAAEvent,
  IAgentSessionEvent,
} from "@kriptik/shared-interfaces";
import { AgentSession } from "./agent-session.js";

/** Handler for ESAA events emitted by any session managed by this harness. */
export type HarnessEventHandler = (event: IESAAEvent) => void;

/** Handler for agent session lifecycle events. */
export type SessionEventHandler = (event: IAgentSessionEvent) => void;

/**
 * The agent harness — manages all active agent sessions for a build.
 *
 * Instantiated once per build. The Cortex Orchestrator uses the harness
 * to launch agents, rotate degraded agents, and terminate completed agents.
 */
export class AgentHarness implements IAgentHarness {
  private readonly _client: Anthropic;
  private readonly _sessions = new Map<string, AgentSession>();
  private readonly _esaaHandlers: HarnessEventHandler[] = [];
  private readonly _sessionEventHandlers: SessionEventHandler[] = [];

  constructor(apiKey?: string) {
    this._client = new Anthropic({
      apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
  }

  /** Subscribe to ESAA events from all sessions. */
  onESAAEvent(handler: HarnessEventHandler): void {
    this._esaaHandlers.push(handler);
  }

  /** Subscribe to session lifecycle events from all sessions. */
  onSessionEvent(handler: SessionEventHandler): void {
    this._sessionEventHandlers.push(handler);
  }

  /**
   * Launch a new agent session.
   *
   * Creates an Anthropic API session, injects the golden window formation
   * sequence, and starts monitoring token usage.
   *
   * Spec Section 5.4, Step 3 — "Launch the replacement via a new Anthropic
   * API session with this sequence as initial context."
   */
  async launch(config: IAgentHarnessConfig): Promise<ILiveAgentSession> {
    const sessionId = randomUUID();

    const session = new AgentSession(this._client, config, sessionId);

    // Wire ESAA events to harness-level handlers
    session.esaaEmitter.onEvent((event) => {
      for (const handler of this._esaaHandlers) {
        handler(event);
      }
    });

    // Wire session events to harness-level handlers
    session.onEvent((event) => {
      for (const handler of this._sessionEventHandlers) {
        handler(event);
      }
    });

    this._sessions.set(sessionId, session);

    // Emit the session creation as an ESAA event
    session.esaaEmitter.emit("goal-progress", "Agent session launched", {
      role: config.role,
      modelTier: config.modelTier,
      goalId: config.goal?.id ?? null,
      replacesId: config.replacesId ?? null,
    });

    return session;
  }

  /**
   * Rotate an agent — terminate the departing session and launch
   * a replacement with the departing agent's state in the golden window.
   *
   * The caller (Cortex Orchestrator) provides the replacement config
   * with departingAgentState already populated in the golden window.
   * The harness manages session lifecycle, not golden window construction.
   *
   * Spec Section 5.4 — four-step rotation process:
   * 1. Capture departing agent's state (caller's responsibility)
   * 2. Construct golden window with departing state (caller's responsibility)
   * 3. Terminate departing session, launch replacement (this method)
   * 4. Record rotation outcome (via ESAA events)
   */
  async rotate(agentId: string, reason: string): Promise<ILiveAgentSession> {
    const departing = this._sessions.get(agentId);
    if (!departing) {
      throw new Error(`No active session found for agent ${agentId}`);
    }

    // Emit rotation event on the departing session
    departing.esaaEmitter.emit("rotation-triggered", reason, {
      contextFillRatio: departing.tokenUsage.fillRatio,
      turnCount: departing.tokenUsage.turnCount,
    });

    // Terminate the departing session
    departing.terminate("rotating");

    // Return the terminated session — the orchestrator calls launch()
    // separately with the replacement config. This two-step pattern
    // (rotate to terminate, then launch replacement) keeps the harness
    // from needing to know how to build golden windows.
    return departing;
  }

  /**
   * Gracefully terminate an agent session.
   *
   * Called when the agent's goal is completed and merged.
   */
  async terminate(agentId: string): Promise<void> {
    const session = this._sessions.get(agentId);
    if (!session) {
      throw new Error(`No active session found for agent ${agentId}`);
    }

    session.terminate("completed");
    this._sessions.delete(agentId);
  }

  /** Get a live session by agent ID. */
  getSession(agentId: string): ILiveAgentSession | undefined {
    return this._sessions.get(agentId);
  }

  /** Get all active sessions. */
  getActiveSessions(): ILiveAgentSession[] {
    return Array.from(this._sessions.values()).filter((s) => s.isActive);
  }

  /** Get all sessions including terminated ones still in memory. */
  getAllSessions(): ILiveAgentSession[] {
    return Array.from(this._sessions.values());
  }
}

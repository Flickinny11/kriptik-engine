/**
 * Token usage monitoring and context fill threshold tracking.
 *
 * Watches an agent session's token consumption and emits signals when
 * approaching the rotation thresholds defined in the spec.
 *
 * Spec Section 5.1 — Hard threshold at 40-50% context fill.
 * Spec Section 5.3, Signal 4 — Context fill trajectory as a behavioral heuristic.
 */

import type { ITokenUsage, AgentSessionEventType } from "@kriptik/shared-interfaces";
import {
  DEFAULT_ROTATION_WARNING_THRESHOLD,
  DEFAULT_ROTATION_CRITICAL_THRESHOLD,
} from "./model-config.js";

export type ThresholdEventHandler = (event: {
  type: AgentSessionEventType;
  fillRatio: number;
  contextTokensUsed: number;
  contextTokensMax: number;
}) => void;

/**
 * Mutable token usage tracker for an active agent session.
 *
 * Tracks cumulative token usage across turns and emits threshold
 * crossing events when context fill approaches rotation limits.
 */
export class TokenMonitor implements ITokenUsage {
  private _contextTokensUsed = 0;
  private _totalInputTokens = 0;
  private _totalOutputTokens = 0;
  private _turnCount = 0;
  private _warningEmitted = false;
  private _criticalEmitted = false;
  private readonly _handlers: ThresholdEventHandler[] = [];

  constructor(
    readonly contextTokensMax: number,
    private readonly _warningThreshold: number = DEFAULT_ROTATION_WARNING_THRESHOLD,
    private readonly _criticalThreshold: number = DEFAULT_ROTATION_CRITICAL_THRESHOLD,
  ) {}

  get contextTokensUsed(): number {
    return this._contextTokensUsed;
  }

  get fillRatio(): number {
    if (this.contextTokensMax === 0) return 0;
    return this._contextTokensUsed / this.contextTokensMax;
  }

  get totalInputTokens(): number {
    return this._totalInputTokens;
  }

  get totalOutputTokens(): number {
    return this._totalOutputTokens;
  }

  get turnCount(): number {
    return this._turnCount;
  }

  /** Subscribe to threshold crossing events. */
  onThreshold(handler: ThresholdEventHandler): void {
    this._handlers.push(handler);
  }

  /**
   * Record token usage from a completed conversation turn.
   *
   * The context window grows with each turn — input tokens include the
   * entire conversation history sent to the API, and output tokens are
   * added to the context for the next turn.
   */
  recordTurn(inputTokens: number, outputTokens: number): void {
    this._totalInputTokens += inputTokens;
    this._totalOutputTokens += outputTokens;
    this._turnCount++;

    // The context window is approximated by the input tokens of the most
    // recent turn (which includes full conversation history) plus the
    // output tokens from that turn (which become part of the history).
    this._contextTokensUsed = inputTokens + outputTokens;

    this._checkThresholds();
  }

  /**
   * Update context usage directly (e.g., after compaction reduces the window).
   */
  setContextUsage(tokens: number): void {
    this._contextTokensUsed = tokens;
    // Reset threshold flags after compaction — the window is fresh.
    if (this.fillRatio < this._warningThreshold) {
      this._warningEmitted = false;
      this._criticalEmitted = false;
    }
  }

  /** Check if the context fill has crossed threshold boundaries. */
  private _checkThresholds(): void {
    const ratio = this.fillRatio;

    if (!this._criticalEmitted && ratio >= this._criticalThreshold) {
      this._criticalEmitted = true;
      this._warningEmitted = true;
      this._emit("threshold-critical", ratio);
    } else if (!this._warningEmitted && ratio >= this._warningThreshold) {
      this._warningEmitted = true;
      this._emit("threshold-warning", ratio);
    }
  }

  private _emit(type: AgentSessionEventType, fillRatio: number): void {
    const event = {
      type,
      fillRatio,
      contextTokensUsed: this._contextTokensUsed,
      contextTokensMax: this.contextTokensMax,
    };
    for (const handler of this._handlers) {
      handler(event);
    }
  }
}

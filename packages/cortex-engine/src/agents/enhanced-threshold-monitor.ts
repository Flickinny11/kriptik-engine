/**
 * Enhanced threshold monitor — combines token fill thresholds with drift
 * signals to produce cost-benefit rotation decisions.
 *
 * This enhances the base TokenMonitor (Phase A, Step 1) which only tracks
 * context fill ratio. The enhanced monitor integrates multiple signal
 * sources and produces rotation recommendations using the five-outcome
 * decision table from spec Section 5.3.
 *
 * For Step 9 (basic rotation), this primarily uses:
 * - Signal 4: Behavioral heuristics (context fill trajectory) — production-ready
 * - Token thresholds: 40% warning, 50% critical from spec Section 5.1
 *
 * Signals 1-3 (ASI, GDI, Confidence Calibration) will be integrated in
 * Phase D when those systems are built. The processDriftSignal() method
 * already accepts them — they just aren't produced yet.
 *
 * Spec Section 5.3 — Drift Detection: The Multi-Signal Monitoring System
 * Spec Section 5.3 — "The Rotation Decision: Cost-Benefit, Not Threshold"
 */

import { randomUUID } from "node:crypto";
import type {
  IEnhancedThresholdMonitor,
  IRotationContext,
  IDriftSignal,
  IRotationDecision,
  RotationRecommendation,
} from "@kriptik/shared-interfaces";

/** Per-agent monitoring state maintained by the enhanced monitor. */
interface AgentMonitorState {
  readonly agentId: string;
  readonly buildId: string;
  tokenFillRatio: number;
  tokenSeverity: "nominal" | "warning" | "critical";
  readonly signals: IDriftSignal[];
  lastEvaluatedAt: Date | null;
}

/**
 * Signal retention window — signals older than this are pruned.
 * Five minutes is sufficient for rotation decisions since the evaluation
 * happens shortly after signals arrive.
 */
const SIGNAL_RETENTION_MS = 5 * 60 * 1000;

/**
 * Estimated tokens for golden window formation during rotation warm-up.
 * Based on the eight-step formation sequence from spec Section 5.4.
 */
const WARM_UP_TOKEN_COST = 20_000;

/**
 * Enhanced threshold monitor implementation.
 *
 * Maintains per-agent signal state, prunes stale signals, and produces
 * rotation decisions via cost-benefit analysis when evaluateRotation()
 * is called by the orchestrator.
 */
export class EnhancedThresholdMonitor implements IEnhancedThresholdMonitor {
  private readonly _agents = new Map<string, AgentMonitorState>();

  registerAgent(agentId: string, buildId: string): void {
    this._agents.set(agentId, {
      agentId,
      buildId,
      tokenFillRatio: 0,
      tokenSeverity: "nominal",
      signals: [],
      lastEvaluatedAt: null,
    });
  }

  processTokenThreshold(
    agentId: string,
    fillRatio: number,
    severity: "warning" | "critical",
  ): void {
    const state = this._agents.get(agentId);
    if (!state) return;

    state.tokenFillRatio = fillRatio;
    state.tokenSeverity = severity;

    // Synthesize a drift signal from the token threshold crossing.
    // Token fill is classified as Signal 4 (behavioral heuristic) per
    // spec Section 5.3, Signal 4: "Context fill trajectory — how fast
    // the agent is consuming context."
    const signal: IDriftSignal = {
      id: randomUUID(),
      buildId: state.buildId,
      agentId,
      source: "behavioral",
      severity: severity === "critical" ? "critical" : "warning",
      score: 1 - fillRatio, // Health score inverted: lower fill = healthier
      description: `Context fill at ${(fillRatio * 100).toFixed(1)}% — ${severity} threshold crossed`,
      detectedAt: new Date(),
    };

    state.signals.push(signal);
  }

  processDriftSignal(signal: IDriftSignal): void {
    const state = this._agents.get(signal.agentId);
    if (!state) return;

    state.signals.push(signal);
    this._pruneStaleSignals(state);
  }

  evaluateRotation(
    agentId: string,
    context: IRotationContext,
  ): IRotationDecision {
    const state = this._agents.get(agentId);
    if (!state) {
      return this._healthyDecision(agentId);
    }

    this._pruneStaleSignals(state);
    state.lastEvaluatedAt = new Date();

    const activeSignals = [...state.signals];
    const recommendation = this._computeRecommendation(state, context);
    const { rotationCost, continuationRisk } = this._computeCosts(
      state,
      context,
    );

    return {
      agentId,
      recommendation,
      signals: activeSignals,
      rotationCost,
      continuationRisk,
      computedAt: new Date(),
    };
  }

  getActiveSignals(agentId: string): readonly IDriftSignal[] {
    const state = this._agents.get(agentId);
    if (!state) return [];
    this._pruneStaleSignals(state);
    return [...state.signals];
  }

  unregisterAgent(agentId: string): void {
    this._agents.delete(agentId);
  }

  /**
   * Cost-benefit rotation recommendation.
   *
   * Implements the decision table from spec Section 5.3:
   *
   * | Situation                                        | Recommendation       |
   * |--------------------------------------------------|----------------------|
   * | 90%+ degradation onset, about to start complex   | rotate-now           |
   * | Past onset but nearly done                       | let-finish           |
   * | Past onset, current simple, next complex         | rotate-at-breakpoint |
   * | Early degradation at <40% fill                   | investigate          |
   * | Two+ peers approaching degradation simultaneously| stagger              |
   */
  private _computeRecommendation(
    state: AgentMonitorState,
    context: IRotationContext,
  ): RotationRecommendation {
    const hasCriticalToken = state.tokenSeverity === "critical";
    const hasWarningToken = state.tokenSeverity === "warning";
    const hasNonTokenDrift = state.signals.some(
      (s) => s.source !== "behavioral" && s.severity !== "nominal",
    );

    // No threshold crossed and no drift signals → agent is healthy
    if (!hasCriticalToken && !hasWarningToken && !hasNonTokenDrift) {
      return "none";
    }

    // Early degradation at low fill → unusual, investigate for model tier mismatch
    // Spec: "Early degradation signals but context fill only 40% → Investigate.
    // Unusual early degradation may indicate task is more complex than routed —
    // consider model tier escalation to Opus 4.6."
    if (hasNonTokenDrift && state.tokenFillRatio < 0.4) {
      return "investigate";
    }

    // Multiple peers degrading → stagger to avoid simultaneous disruption
    // Spec: "Two peer agents approaching degradation simultaneously → Stagger
    // rotations. Rotate the one with more complex upcoming work first."
    if (context.peersApproachingDegradation >= 2) {
      return "stagger";
    }

    // Critical threshold (50%) crossed
    if (hasCriticalToken) {
      // Nearly done → let it finish (< ~15% work remaining)
      // Spec: "Agent past onset but 2 minutes from completing current work →
      // Let it finish. Nearly done; rework risk is low for short duration."
      if (context.goalProgress >= 0.85) {
        return "let-finish";
      }

      // Complex upcoming work → rotate immediately
      // Spec: "Agent at 90% of degradation onset, about to start complex new
      // work → Rotate now. Starting complex work degraded costs more."
      if (context.upcomingWorkComplexity === "high") {
        return "rotate-now";
      }

      // Simple upcoming work but significant remaining → breakpoint rotation
      // Spec: "Past onset, current work is simple, next work is complex →
      // Rotate between work units."
      return "rotate-at-breakpoint";
    }

    // Warning threshold (40%) with complex work ahead and early in the goal
    if (hasWarningToken) {
      if (
        context.upcomingWorkComplexity === "high" &&
        context.goalProgress < 0.5
      ) {
        return "rotate-now";
      }

      // Warning only without complex upcoming work — not yet critical
      return "none";
    }

    // Non-token drift signals without token threshold → investigate
    return "investigate";
  }

  /**
   * Estimate costs for rotation vs. continuation.
   *
   * Rotation cost = warm-up tokens + rework risk (proportional to progress × remaining)
   * Continuation risk = quality degradation probability × remaining work volume
   */
  private _computeCosts(
    state: AgentMonitorState,
    context: IRotationContext,
  ): { rotationCost: number; continuationRisk: number } {
    // Rotation cost: golden window warm-up + proportional rework risk.
    // Rework risk increases with progress because more work might need redoing.
    const reworkRisk =
      context.goalProgress * 0.1 * context.estimatedRemainingWork;
    const rotationCost = WARM_UP_TOKEN_COST + reworkRisk;

    // Continuation risk: quality degradation × remaining work volume.
    // The 45.5% F1 drop from spec Section 5.1 (arXiv:2601.15300) at 50% fill
    // means continuing past critical threshold risks nearly half quality loss.
    const tokenQualityDrop =
      state.tokenSeverity === "critical"
        ? 0.45
        : state.tokenSeverity === "warning"
          ? 0.15
          : 0;

    // Include worst drift signal severity
    const worstDriftSeverity = state.signals.reduce((worst, s) => {
      const sev =
        s.severity === "critical" ? 0.4 : s.severity === "warning" ? 0.2 : 0;
      return Math.max(worst, sev);
    }, 0);

    const combinedRisk = Math.min(tokenQualityDrop + worstDriftSeverity, 1);
    const continuationRisk = combinedRisk * context.estimatedRemainingWork;

    return { rotationCost, continuationRisk };
  }

  /** Remove signals older than the retention window. */
  private _pruneStaleSignals(state: AgentMonitorState): void {
    const cutoff = Date.now() - SIGNAL_RETENTION_MS;
    const fresh = state.signals.filter(
      (s) => s.detectedAt.getTime() > cutoff,
    );
    state.signals.length = 0;
    state.signals.push(...fresh);
  }

  /** Default healthy decision for unregistered/unknown agents. */
  private _healthyDecision(agentId: string): IRotationDecision {
    return {
      agentId,
      recommendation: "none",
      signals: [],
      rotationCost: 0,
      continuationRisk: 0,
      computedAt: new Date(),
    };
  }
}

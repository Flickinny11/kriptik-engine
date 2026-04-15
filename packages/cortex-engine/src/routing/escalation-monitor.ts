/**
 * EscalationMonitor — watches Sonnet-routed agents for mid-task
 * escalation needs based on drift and confidence signals.
 *
 * When a Sonnet 4.6 agent encounters unexpected complexity that
 * exceeds its capability given the available trail coverage, the
 * monitoring system detects uncertainty signal spikes and recommends
 * escalation to Opus 4.6.
 *
 * Spec Section 3.4 — "Dynamic reassessment: If a Sonnet 4.6 agent
 * encounters unexpected complexity (uncertainty signals spike), the
 * monitoring system detects this and the routing layer escalates to Opus 4.6."
 *
 * Spec Section 5.3 — "may indicate task is more complex than routed —
 * consider model tier escalation to Opus 4.6."
 */

import type {
  IDriftSignal,
  IEscalationMonitor,
  IEscalationTrigger,
  IRoutingDecision,
  EscalationAction,
} from "@kriptik/shared-interfaces";

/**
 * Escalation thresholds.
 *
 * The monitor tracks consecutive degraded signals. A single warning
 * signal triggers "continue-monitoring". Multiple consecutive signals
 * or a critical signal triggers "escalate-to-opus".
 */
const ESCALATION_CONFIG = {
  /** Number of consecutive warning signals before escalation. */
  consecutiveWarningsToEscalate: 3,
  /** Drift score below which a signal is considered degraded. */
  degradedScoreThreshold: 0.65,
  /** Drift score below which immediate escalation is triggered. */
  criticalScoreThreshold: 0.45,
  /** Confidence divergence signals have extra weight. */
  confidenceDivergenceWeight: 1.5,
} as const;

interface MonitoredAgent {
  readonly agentId: string;
  readonly decision: IRoutingDecision;
  readonly signalHistory: IDriftSignal[];
  consecutiveDegraded: number;
  latestTrigger: IEscalationTrigger | null;
}

export class EscalationMonitor implements IEscalationMonitor {
  private readonly agents = new Map<string, MonitoredAgent>();

  monitorAgent(agentId: string, decision: IRoutingDecision): void {
    this.agents.set(agentId, {
      agentId,
      decision,
      signalHistory: [],
      consecutiveDegraded: 0,
      latestTrigger: null,
    });
  }

  processSignals(
    agentId: string,
    signals: readonly IDriftSignal[],
  ): IEscalationTrigger | null {
    const agent = this.agents.get(agentId);
    if (!agent) return null;

    // No signals — agent is healthy.
    if (signals.length === 0) {
      agent.consecutiveDegraded = 0;
      return null;
    }

    agent.signalHistory.push(...signals);

    const assessment = this.assessSignals(signals);

    if (assessment === "no-action") {
      agent.consecutiveDegraded = 0;
      agent.latestTrigger = null;
      return null;
    }

    if (assessment === "continue-monitoring") {
      agent.consecutiveDegraded++;

      if (agent.consecutiveDegraded >= ESCALATION_CONFIG.consecutiveWarningsToEscalate) {
        return this.buildTrigger(agent, signals, "escalate-to-opus",
          `${agent.consecutiveDegraded} consecutive degraded signal sets — sustained uncertainty indicates task exceeds Sonnet capability given available coverage.`);
      }

      const trigger = this.buildTrigger(agent, signals, "continue-monitoring",
        `Warning signals detected (${agent.consecutiveDegraded}/${ESCALATION_CONFIG.consecutiveWarningsToEscalate} consecutive). Monitoring for escalation.`);
      agent.latestTrigger = trigger;
      return trigger;
    }

    // Critical — immediate escalation.
    return this.buildTrigger(agent, signals, "escalate-to-opus",
      `Critical uncertainty signal detected — immediate escalation to Opus 4.6 recommended.`);
  }

  getStatus(agentId: string): IEscalationTrigger | null {
    return this.agents.get(agentId)?.latestTrigger ?? null;
  }

  unmonitorAgent(agentId: string): void {
    this.agents.delete(agentId);
  }

  private assessSignals(signals: readonly IDriftSignal[]): EscalationAction {
    let hasCritical = false;
    let hasDegraded = false;

    for (const signal of signals) {
      const effectiveScore = signal.source === "confidence"
        ? signal.score * ESCALATION_CONFIG.confidenceDivergenceWeight
        : signal.score;

      // Lower score = worse health. Invert thresholds accordingly.
      const healthScore = effectiveScore;

      if (healthScore < ESCALATION_CONFIG.criticalScoreThreshold) {
        hasCritical = true;
      } else if (healthScore < ESCALATION_CONFIG.degradedScoreThreshold) {
        hasDegraded = true;
      }
    }

    if (hasCritical) return "escalate-to-opus";
    if (hasDegraded) return "continue-monitoring";
    return "no-action";
  }

  private buildTrigger(
    agent: MonitoredAgent,
    signals: readonly IDriftSignal[],
    action: EscalationAction,
    reason: string,
  ): IEscalationTrigger {
    const trigger: IEscalationTrigger = {
      agentId: agent.agentId,
      goalId: agent.decision.goalId,
      originalDecision: agent.decision,
      triggeringSignals: signals,
      reason,
      action,
      triggeredAt: new Date(),
    };
    agent.latestTrigger = trigger;
    return trigger;
  }
}

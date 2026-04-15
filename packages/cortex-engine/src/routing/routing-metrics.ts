/**
 * RoutingMetricsTracker — tracks routing decisions, outcomes, and
 * escalation events for optimization and phase progression.
 *
 * Provides the build count that determines routing phase (Spec Section 6.7)
 * and the decision/outcome correlation data that validates routing quality.
 *
 * Spec Section 6.7 — the routing trajectory depends on build count:
 * Phase 1 (1-100), Phase 2 (100-500), Phase 3 (500-2000), Phase 4 (2000+).
 */

import type {
  IRoutingDecision,
  IRoutingOutcome,
  IEscalationTrigger,
  IRoutingMetricsTracker,
  IRoutingMetricsSummary,
  ITaskTypeRoutingStats,
  RoutingPhase,
} from "@kriptik/shared-interfaces";

/**
 * Cost ratio: Sonnet is approximately 25% of Opus cost.
 * Used to estimate cost savings from Sonnet routing.
 */
const SONNET_TO_OPUS_COST_RATIO = 0.25;

interface TaskTypeAccumulator {
  opusCount: number;
  sonnetCount: number;
  opusScoreSum: number;
  opusScoreCount: number;
  sonnetScoreSum: number;
  sonnetScoreCount: number;
  escalationCount: number;
}

export class RoutingMetricsTracker implements IRoutingMetricsTracker {
  private totalBuilds = 0;
  private readonly decisions: IRoutingDecision[] = [];
  private readonly outcomes: IRoutingOutcome[] = [];
  private readonly escalations: IEscalationTrigger[] = [];
  private readonly taskTypeStats = new Map<string, TaskTypeAccumulator>();

  recordDecision(decision: IRoutingDecision): void {
    this.decisions.push(decision);

    const stats = this.getOrCreateTaskTypeStats(decision.taskType);
    if (decision.assignedTier === "claude-opus-4-6") {
      stats.opusCount++;
    } else {
      stats.sonnetCount++;
    }
  }

  recordOutcome(outcome: IRoutingOutcome): void {
    this.outcomes.push(outcome);

    const stats = this.getOrCreateTaskTypeStats(outcome.decision.taskType);
    if (outcome.evaluatorScore !== null) {
      if (outcome.decision.assignedTier === "claude-opus-4-6") {
        stats.opusScoreSum += outcome.evaluatorScore;
        stats.opusScoreCount++;
      } else {
        stats.sonnetScoreSum += outcome.evaluatorScore;
        stats.sonnetScoreCount++;
      }
    }
  }

  recordEscalation(trigger: IEscalationTrigger): void {
    this.escalations.push(trigger);

    const stats = this.getOrCreateTaskTypeStats(trigger.originalDecision.taskType);
    stats.escalationCount++;
  }

  recordBuildComplete(): void {
    this.totalBuilds++;
  }

  getTotalBuilds(): number {
    return this.totalBuilds;
  }

  getMetrics(): IRoutingMetricsSummary {
    const totalDecisions = this.decisions.length;
    const opusDecisions = this.decisions.filter(
      d => d.assignedTier === "claude-opus-4-6",
    ).length;
    const sonnetDecisions = totalDecisions - opusDecisions;

    const opusOutcomes = this.outcomes.filter(
      o => o.decision.assignedTier === "claude-opus-4-6" && o.evaluatorScore !== null,
    );
    const sonnetOutcomes = this.outcomes.filter(
      o => o.decision.assignedTier === "claude-sonnet-4-6" && o.evaluatorScore !== null,
    );

    const averageOpusQuality = opusOutcomes.length > 0
      ? opusOutcomes.reduce((sum, o) => sum + o.evaluatorScore!, 0) / opusOutcomes.length
      : null;

    const averageSonnetQuality = sonnetOutcomes.length > 0
      ? sonnetOutcomes.reduce((sum, o) => sum + o.evaluatorScore!, 0) / sonnetOutcomes.length
      : null;

    const sonnetRoutingRate = totalDecisions > 0
      ? sonnetDecisions / totalDecisions
      : 0;

    const estimatedCostSavings = this.computeCostSavings(sonnetRoutingRate);

    return {
      totalDecisions,
      opusDecisions,
      sonnetDecisions,
      escalationCount: this.escalations.length,
      currentPhase: this.computePhase(),
      totalBuilds: this.totalBuilds,
      averageOpusQuality,
      averageSonnetQuality,
      sonnetRoutingRate,
      estimatedCostSavings,
    };
  }

  getTaskTypeStats(): ReadonlyMap<string, ITaskTypeRoutingStats> {
    const result = new Map<string, ITaskTypeRoutingStats>();

    for (const [taskType, accumulator] of this.taskTypeStats) {
      result.set(taskType, {
        taskType,
        opusCount: accumulator.opusCount,
        sonnetCount: accumulator.sonnetCount,
        averageOpusScore: accumulator.opusScoreCount > 0
          ? accumulator.opusScoreSum / accumulator.opusScoreCount
          : null,
        averageSonnetScore: accumulator.sonnetScoreCount > 0
          ? accumulator.sonnetScoreSum / accumulator.sonnetScoreCount
          : null,
        escalationCount: accumulator.escalationCount,
      });
    }

    return result;
  }

  private computePhase(): RoutingPhase {
    if (this.totalBuilds >= 2000) return 4;
    if (this.totalBuilds >= 500) return 3;
    if (this.totalBuilds >= 100) return 2;
    return 1;
  }

  /**
   * Estimate cost savings compared to routing everything to Opus.
   *
   * If 60% of decisions go to Sonnet (at 25% Opus cost), savings are:
   * 1.0 - (0.40 * 1.0 + 0.60 * 0.25) = 1.0 - 0.55 = 0.45 (45% savings)
   */
  private computeCostSavings(sonnetRate: number): number {
    const blendedCost = (1 - sonnetRate) * 1.0 + sonnetRate * SONNET_TO_OPUS_COST_RATIO;
    return 1.0 - blendedCost;
  }

  private getOrCreateTaskTypeStats(taskType: string): TaskTypeAccumulator {
    let stats = this.taskTypeStats.get(taskType);
    if (!stats) {
      stats = {
        opusCount: 0,
        sonnetCount: 0,
        opusScoreSum: 0,
        opusScoreCount: 0,
        sonnetScoreSum: 0,
        sonnetScoreCount: 0,
        escalationCount: 0,
      };
      this.taskTypeStats.set(taskType, stats);
    }
    return stats;
  }
}

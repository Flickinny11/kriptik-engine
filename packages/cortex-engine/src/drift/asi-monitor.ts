/**
 * Agent Stability Index (ASI) monitor — Signal 1 of the multi-signal
 * drift detection system.
 *
 * Computes 12 dimensions across 4 categories:
 * - Response Consistency (30%) — semantic similarity, decision pathway stability, confidence calibration
 * - Tool Usage Patterns (25%) — selection stability, sequencing consistency, parameterization drift
 * - Inter-Agent Coordination (25%) — consensus agreement quality, handoff efficiency
 * - Behavioral Boundaries (20%) — output length stability, error patterns, intervention rate
 *
 * Drift is flagged when the composite score drops below 0.75 for
 * three consecutive evaluation windows.
 *
 * Spec Section 5.3, Signal 1 — ASI framework (arXiv:2601.04170, Jan 2026)
 */

import { randomUUID } from "node:crypto";
import type {
  IASIMonitor,
  IASIResult,
  IASICategory,
  IASIDimension,
  ASICategoryId,
  IDriftSignal,
  IAgentResponse,
} from "@kriptik/shared-interfaces";

/** Threshold below which an ASI score is considered degraded. */
const ASI_DEGRADATION_THRESHOLD = 0.75;

/** Number of consecutive windows below threshold before flagging. */
const CONSECUTIVE_WINDOWS_TO_FLAG = 3;

/** Number of recent responses to keep for sliding window analysis. */
const RESPONSE_WINDOW_SIZE = 10;

// ---------------------------------------------------------------------------
// Category definitions with weights matching spec
// ---------------------------------------------------------------------------

interface CategoryDef {
  readonly id: ASICategoryId;
  readonly label: string;
  readonly weight: number;
  readonly dimensions: readonly DimensionDef[];
}

interface DimensionDef {
  readonly id: string;
  readonly label: string;
}

const CATEGORY_DEFINITIONS: readonly CategoryDef[] = [
  {
    id: "response-consistency",
    label: "Response Consistency",
    weight: 0.30,
    dimensions: [
      { id: "semantic-similarity", label: "Semantic Similarity of Outputs" },
      { id: "decision-pathway-stability", label: "Decision Pathway Stability" },
      { id: "confidence-consistency", label: "Confidence Calibration" },
    ],
  },
  {
    id: "tool-usage-patterns",
    label: "Tool Usage Patterns",
    weight: 0.25,
    dimensions: [
      { id: "tool-selection-stability", label: "Tool Selection Stability" },
      { id: "tool-sequencing-consistency", label: "Sequencing Consistency" },
      { id: "parameterization-drift", label: "Parameterization Drift" },
    ],
  },
  {
    id: "inter-agent-coordination",
    label: "Inter-Agent Coordination",
    weight: 0.25,
    dimensions: [
      { id: "consensus-agreement-quality", label: "Consensus Agreement Quality" },
      { id: "handoff-efficiency", label: "Handoff Efficiency" },
      { id: "proposal-clarity", label: "Interface Proposal Clarity" },
    ],
  },
  {
    id: "behavioral-boundaries",
    label: "Behavioral Boundaries",
    weight: 0.20,
    dimensions: [
      { id: "output-length-stability", label: "Output Length Stability" },
      { id: "error-pattern-consistency", label: "Error Pattern Consistency" },
      { id: "intervention-rate", label: "Intervention Rate" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Per-agent state
// ---------------------------------------------------------------------------

interface AgentASIState {
  readonly agentId: string;
  /** Recent responses for sliding window analysis. */
  readonly responses: ResponseSnapshot[];
  /** Recent composite scores for consecutive-window flagging. */
  readonly recentCompositeScores: number[];
  /** Latest computed result. */
  latestResult: IASIResult | null;
}

interface ResponseSnapshot {
  readonly textLength: number;
  readonly toolNames: readonly string[];
  readonly toolCount: number;
  readonly hasThinking: boolean;
  readonly outputTokens: number;
  readonly stopReason: string;
  readonly timestamp: Date;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * ASIMonitor — computes the Agent Stability Index from agent response patterns.
 *
 * Uses sliding window analysis over recent responses to detect stability
 * degradation across 12 dimensions. Produces IDriftSignal when the
 * 3-consecutive-windows flagging rule triggers.
 */
export class ASIMonitor implements IASIMonitor {
  private readonly _agents = new Map<string, AgentASIState>();

  registerAgent(agentId: string): void {
    this._agents.set(agentId, {
      agentId,
      responses: [],
      recentCompositeScores: [],
      latestResult: null,
    });
  }

  evaluate(agentId: string, response: IAgentResponse): IASIResult {
    const state = this._agents.get(agentId);
    if (!state) {
      return this._emptyResult(agentId);
    }

    // Record response snapshot
    const snapshot: ResponseSnapshot = {
      textLength: response.textContent.length,
      toolNames: response.toolUse.map((t) => t.name),
      toolCount: response.toolUse.length,
      hasThinking: response.thinkingContent !== undefined,
      outputTokens: response.outputTokens,
      stopReason: response.stopReason,
      timestamp: new Date(),
    };
    state.responses.push(snapshot);

    // Keep sliding window
    while (state.responses.length > RESPONSE_WINDOW_SIZE) {
      state.responses.shift();
    }

    // Need at least 3 responses for meaningful analysis
    if (state.responses.length < 3) {
      const result = this._emptyResult(agentId);
      state.latestResult = result;
      return result;
    }

    // Compute all 12 dimensions
    const categories = CATEGORY_DEFINITIONS.map((catDef) =>
      this.computeCategory(catDef, state.responses),
    );

    // Weighted composite
    const compositeScore = categories.reduce(
      (sum, cat) => sum + cat.score * cat.weight,
      0,
    );

    // Track consecutive windows below threshold
    state.recentCompositeScores.push(compositeScore);
    if (state.recentCompositeScores.length > CONSECUTIVE_WINDOWS_TO_FLAG + 2) {
      state.recentCompositeScores.shift();
    }

    const consecutiveBelow = countTrailingBelow(
      state.recentCompositeScores,
      ASI_DEGRADATION_THRESHOLD,
    );

    const result: IASIResult = {
      agentId,
      compositeScore,
      categories,
      isFlagged: consecutiveBelow >= CONSECUTIVE_WINDOWS_TO_FLAG,
      consecutiveWindowsBelowThreshold: consecutiveBelow,
      evaluatedAt: new Date(),
    };

    state.latestResult = result;
    return result;
  }

  getLatestResult(agentId: string): IASIResult | null {
    return this._agents.get(agentId)?.latestResult ?? null;
  }

  toDriftSignal(result: IASIResult, buildId: string): IDriftSignal | null {
    if (!result.isFlagged && result.compositeScore >= ASI_DEGRADATION_THRESHOLD) {
      return null;
    }

    const severity = result.isFlagged
      ? "critical"
      : result.compositeScore < ASI_DEGRADATION_THRESHOLD
        ? "warning"
        : "nominal";

    if (severity === "nominal") return null;

    // Find weakest category for description
    const weakest = [...result.categories].sort(
      (a, b) => a.score - b.score,
    )[0];

    return {
      id: randomUUID(),
      buildId,
      agentId: result.agentId,
      source: "asi",
      severity,
      score: result.compositeScore,
      description:
        `ASI composite ${result.compositeScore.toFixed(2)} ` +
        (result.isFlagged
          ? `(flagged: ${result.consecutiveWindowsBelowThreshold} consecutive windows below ${ASI_DEGRADATION_THRESHOLD})`
          : `(below threshold ${ASI_DEGRADATION_THRESHOLD})`) +
        (weakest ? ` — weakest: ${weakest.label} (${weakest.score.toFixed(2)})` : ""),
      detectedAt: new Date(),
    };
  }

  unregisterAgent(agentId: string): void {
    this._agents.delete(agentId);
  }

  // ---------------------------------------------------------------------------
  // Dimension computation
  // ---------------------------------------------------------------------------

  private computeCategory(
    catDef: CategoryDef,
    responses: readonly ResponseSnapshot[],
  ): IASICategory {
    const dimensions = catDef.dimensions.map((dimDef) =>
      this.computeDimension(dimDef, catDef.id, responses),
    );

    const score =
      dimensions.length > 0
        ? dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length
        : 1;

    return {
      id: catDef.id,
      label: catDef.label,
      weight: catDef.weight,
      score,
      dimensions,
    };
  }

  private computeDimension(
    dimDef: DimensionDef,
    _category: ASICategoryId,
    responses: readonly ResponseSnapshot[],
  ): IASIDimension {
    const score = this.computeDimensionScore(dimDef.id, responses);

    // Track recent scores for the dimension (last 3 windows)
    const recentScores = responses
      .slice(-3)
      .map((_, i) => {
        const window = responses.slice(0, responses.length - (2 - i));
        return window.length >= 3
          ? this.computeDimensionScore(dimDef.id, window)
          : 1;
      });

    return {
      id: dimDef.id,
      label: dimDef.label,
      category: _category,
      score,
      recentScores,
    };
  }

  /**
   * Compute a score for a specific dimension based on response history.
   * Returns 0-1 where 1 is perfectly stable.
   */
  private computeDimensionScore(
    dimensionId: string,
    responses: readonly ResponseSnapshot[],
  ): number {
    if (responses.length < 2) return 1;

    switch (dimensionId) {
      // Response Consistency dimensions
      case "semantic-similarity":
        return this.scoreOutputLengthVariance(responses);
      case "decision-pathway-stability":
        return this.scoreToolSequenceStability(responses);
      case "confidence-consistency":
        return this.scoreThinkingConsistency(responses);

      // Tool Usage Patterns dimensions
      case "tool-selection-stability":
        return this.scoreToolSelectionStability(responses);
      case "tool-sequencing-consistency":
        return this.scoreToolSequencingConsistency(responses);
      case "parameterization-drift":
        return this.scoreToolCountStability(responses);

      // Inter-Agent Coordination dimensions
      case "consensus-agreement-quality":
        return this.scoreResponseCompleteness(responses);
      case "handoff-efficiency":
        return this.scoreOutputTokenEfficiency(responses);
      case "proposal-clarity":
        return this.scoreTextLengthConsistency(responses);

      // Behavioral Boundaries dimensions
      case "output-length-stability":
        return this.scoreOutputLengthStability(responses);
      case "error-pattern-consistency":
        return this.scoreStopReasonConsistency(responses);
      case "intervention-rate":
        return this.scoreInterventionRate(responses);

      default:
        return 1;
    }
  }

  // ---------------------------------------------------------------------------
  // Scoring functions (heuristic-based, using observable response features)
  // ---------------------------------------------------------------------------

  /** Output text length variance — large swings indicate instability. */
  private scoreOutputLengthVariance(responses: readonly ResponseSnapshot[]): number {
    const lengths = responses.map((r) => r.textLength);
    return 1 - normalizedCoefficientOfVariation(lengths);
  }

  /** Tool sequence stability — are tool usage sequences consistent? */
  private scoreToolSequenceStability(responses: readonly ResponseSnapshot[]): number {
    if (responses.length < 2) return 1;
    const sequences = responses.map((r) => r.toolNames.join(","));
    const uniqueRatio = new Set(sequences).size / sequences.length;
    // Some variation is normal; flag when nearly every sequence is unique
    return Math.min(1, 1.5 - uniqueRatio);
  }

  /** Thinking consistency — does the agent consistently use extended thinking? */
  private scoreThinkingConsistency(responses: readonly ResponseSnapshot[]): number {
    const thinkingRatio = responses.filter((r) => r.hasThinking).length / responses.length;
    // Either mostly thinking or mostly not is consistent; 50/50 is unstable
    return 1 - 4 * thinkingRatio * (1 - thinkingRatio); // Peaks at 0 or 1, dips at 0.5
  }

  /** Tool selection stability — is the set of tools used stable? */
  private scoreToolSelectionStability(responses: readonly ResponseSnapshot[]): number {
    if (responses.length < 3) return 1;
    const recentTools = new Set(responses.slice(-3).flatMap((r) => r.toolNames));
    const olderTools = new Set(responses.slice(0, -3).flatMap((r) => r.toolNames));
    if (olderTools.size === 0) return 1;
    // How many recent tools also appeared in older responses?
    const overlap = [...recentTools].filter((t) => olderTools.has(t)).length;
    return recentTools.size > 0 ? overlap / recentTools.size : 1;
  }

  /** Tool sequencing consistency — similar patterns turn over turn? */
  private scoreToolSequencingConsistency(responses: readonly ResponseSnapshot[]): number {
    const counts = responses.map((r) => r.toolCount);
    return 1 - normalizedCoefficientOfVariation(counts);
  }

  /** Tool count stability (proxy for parameterization drift). */
  private scoreToolCountStability(responses: readonly ResponseSnapshot[]): number {
    if (responses.length < 3) return 1;
    const recent = responses.slice(-3).map((r) => r.toolCount);
    const older = responses.slice(0, -3).map((r) => r.toolCount);
    const recentAvg = mean(recent);
    const olderAvg = mean(older);
    if (olderAvg === 0 && recentAvg === 0) return 1;
    const shift = Math.abs(recentAvg - olderAvg) / Math.max(olderAvg, recentAvg, 1);
    return Math.max(0, 1 - shift);
  }

  /** Response completeness (proxy for consensus quality). */
  private scoreResponseCompleteness(responses: readonly ResponseSnapshot[]): number {
    // Complete responses have reasonable length; empty/truncated indicate issues
    const completionRatio = responses.filter(
      (r) => r.stopReason === "end_turn" && r.textLength > 50,
    ).length / responses.length;
    return completionRatio;
  }

  /** Output token efficiency — stable token usage per response. */
  private scoreOutputTokenEfficiency(responses: readonly ResponseSnapshot[]): number {
    const tokens = responses.map((r) => r.outputTokens);
    return 1 - normalizedCoefficientOfVariation(tokens);
  }

  /** Text length consistency across responses. */
  private scoreTextLengthConsistency(responses: readonly ResponseSnapshot[]): number {
    const lengths = responses.map((r) => r.textLength);
    return 1 - normalizedCoefficientOfVariation(lengths);
  }

  /** Output length stability — similar to variance but focused on recent trend. */
  private scoreOutputLengthStability(responses: readonly ResponseSnapshot[]): number {
    if (responses.length < 4) return 1;
    const recent = responses.slice(-3).map((r) => r.textLength);
    const older = responses.slice(0, -3).map((r) => r.textLength);
    const recentAvg = mean(recent);
    const olderAvg = mean(older);
    if (olderAvg === 0 && recentAvg === 0) return 1;
    const drift = Math.abs(recentAvg - olderAvg) / Math.max(olderAvg, recentAvg, 1);
    return Math.max(0, 1 - drift);
  }

  /** Stop reason consistency — stable completion patterns. */
  private scoreStopReasonConsistency(responses: readonly ResponseSnapshot[]): number {
    const reasons = responses.map((r) => r.stopReason);
    const mostCommon = mode(reasons);
    const consistencyRatio = reasons.filter((r) => r === mostCommon).length / reasons.length;
    return consistencyRatio;
  }

  /** Intervention rate — proxy: truncated/error stop reasons. */
  private scoreInterventionRate(responses: readonly ResponseSnapshot[]): number {
    const normalStops = responses.filter(
      (r) => r.stopReason === "end_turn" || r.stopReason === "tool_use",
    ).length;
    return normalStops / responses.length;
  }

  /** Empty result for unregistered agents or insufficient data. */
  private _emptyResult(agentId: string): IASIResult {
    return {
      agentId,
      compositeScore: 1,
      categories: CATEGORY_DEFINITIONS.map((c) => ({
        id: c.id,
        label: c.label,
        weight: c.weight,
        score: 1,
        dimensions: c.dimensions.map((d) => ({
          id: d.id,
          label: d.label,
          category: c.id,
          score: 1,
          recentScores: [],
        })),
      })),
      isFlagged: false,
      consecutiveWindowsBelowThreshold: 0,
      evaluatedAt: new Date(),
    };
  }
}

// ---------------------------------------------------------------------------
// Statistical helpers
// ---------------------------------------------------------------------------

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Coefficient of variation normalized to 0-1 (capped at 1). */
function normalizedCoefficientOfVariation(values: readonly number[]): number {
  const avg = mean(values);
  if (avg === 0) return 0;
  const cv = standardDeviation(values) / avg;
  return Math.min(cv, 1);
}

function mode(values: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best = values[0] ?? "";
  let bestCount = 0;
  for (const [val, count] of counts) {
    if (count > bestCount) {
      best = val;
      bestCount = count;
    }
  }
  return best;
}

function countTrailingBelow(values: readonly number[], threshold: number): number {
  let count = 0;
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i]! < threshold) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

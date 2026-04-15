/**
 * Confidence calibration monitor — Signal 3 of the multi-signal
 * drift detection system.
 *
 * Extracts process-level features across an agent's trajectory — from
 * macro dynamics (overall decision pattern) to micro stability (token-level
 * consistency) — to detect when confidence diverges from actual capability.
 *
 * Catches the specific failure mode where a degrading agent produces
 * confident-sounding but shallow code.
 *
 * Spec Section 5.3, Signal 3 — Agentic Confidence Calibration
 * (Salesforce, Jan 2026)
 */

import { randomUUID } from "node:crypto";
import type {
  IConfidenceMonitor,
  IConfidenceCalibrationResult,
  IConfidenceFeature,
  ConfidenceFeatureLevel,
  IDriftSignal,
  IAgentResponse,
} from "@kriptik/shared-interfaces";

/** Divergence threshold above which confidence is flagged. */
const CONFIDENCE_DIVERGENCE_THRESHOLD = 0.3;

/** Number of initial responses used to establish baseline. */
const BASELINE_WINDOW_SIZE = 5;

/** Total response history to maintain. */
const HISTORY_WINDOW_SIZE = 15;

// ---------------------------------------------------------------------------
// Feature definitions
// ---------------------------------------------------------------------------

interface FeatureDef {
  readonly id: string;
  readonly label: string;
  readonly level: ConfidenceFeatureLevel;
}

const FEATURE_DEFINITIONS: readonly FeatureDef[] = [
  // Macro-level features (overall decision patterns)
  { id: "decision-reversals", label: "Decision Reversal Rate", level: "macro" },
  { id: "tool-diversity", label: "Tool Usage Diversity", level: "macro" },
  { id: "thinking-depth", label: "Extended Thinking Depth", level: "macro" },
  { id: "response-thoroughness", label: "Response Thoroughness", level: "macro" },
  // Micro-level features (token-level consistency)
  { id: "hedging-frequency", label: "Hedging Language Frequency", level: "micro" },
  { id: "assertion-confidence", label: "Assertion Confidence", level: "micro" },
  { id: "output-density", label: "Output Information Density", level: "micro" },
  { id: "completion-quality", label: "Completion Quality", level: "micro" },
];

// ---------------------------------------------------------------------------
// Per-agent state
// ---------------------------------------------------------------------------

interface AgentConfidenceState {
  readonly agentId: string;
  readonly responses: ConfidenceResponseSnapshot[];
  /** Baseline values computed from first N responses. */
  baseline: Map<string, number> | null;
  latestResult: IConfidenceCalibrationResult | null;
}

interface ConfidenceResponseSnapshot {
  readonly textContent: string;
  readonly textLength: number;
  readonly toolCount: number;
  readonly toolNames: readonly string[];
  readonly outputTokens: number;
  readonly hasThinking: boolean;
  readonly thinkingLength: number;
  readonly stopReason: string;
  readonly timestamp: Date;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * ConfidenceMonitor — detects when agent confidence diverges from capability.
 *
 * Establishes a per-agent baseline from early responses and tracks deviation
 * across macro (decision patterns) and micro (token-level) features.
 * When deviation exceeds threshold, produces a drift signal indicating
 * the agent may be producing confident-sounding but degraded output.
 */
export class ConfidenceMonitor implements IConfidenceMonitor {
  private readonly _agents = new Map<string, AgentConfidenceState>();

  registerAgent(agentId: string): void {
    this._agents.set(agentId, {
      agentId,
      responses: [],
      baseline: null,
      latestResult: null,
    });
  }

  evaluate(
    agentId: string,
    response: IAgentResponse,
  ): IConfidenceCalibrationResult {
    const state = this._agents.get(agentId);
    if (!state) {
      return this._emptyResult(agentId);
    }

    // Record snapshot
    const snapshot: ConfidenceResponseSnapshot = {
      textContent: response.textContent,
      textLength: response.textContent.length,
      toolCount: response.toolUse.length,
      toolNames: response.toolUse.map((t) => t.name),
      outputTokens: response.outputTokens,
      hasThinking: response.thinkingContent !== undefined,
      thinkingLength: response.thinkingContent?.length ?? 0,
      stopReason: response.stopReason,
      timestamp: new Date(),
    };
    state.responses.push(snapshot);

    while (state.responses.length > HISTORY_WINDOW_SIZE) {
      state.responses.shift();
    }

    // Establish baseline from first N responses
    if (!state.baseline && state.responses.length >= BASELINE_WINDOW_SIZE) {
      state.baseline = this.computeBaseline(
        state.responses.slice(0, BASELINE_WINDOW_SIZE),
      );
    }

    // Can't compute deviation without baseline
    if (!state.baseline) {
      const result = this._emptyResult(agentId);
      state.latestResult = result;
      return result;
    }

    // Compute all features against baseline
    const features = FEATURE_DEFINITIONS.map((def) =>
      this.computeFeature(def, state.responses, state.baseline!),
    );

    // Calibration score: average of (1 - deviation) across features
    const avgDeviation =
      features.reduce((sum, f) => sum + f.deviation, 0) / features.length;
    const calibrationScore = Math.max(0, 1 - avgDeviation);

    const isDivergent = avgDeviation > CONFIDENCE_DIVERGENCE_THRESHOLD;

    // Find the most divergent feature for description
    const worstFeature = [...features].sort(
      (a, b) => b.deviation - a.deviation,
    )[0];

    const result: IConfidenceCalibrationResult = {
      agentId,
      calibrationScore,
      features,
      isDivergent,
      divergenceDescription: isDivergent
        ? `Confidence-capability divergence detected: ` +
          `${worstFeature?.label ?? "unknown"} deviated ${((worstFeature?.deviation ?? 0) * 100).toFixed(0)}% from baseline`
        : null,
      evaluatedAt: new Date(),
    };

    state.latestResult = result;
    return result;
  }

  getLatestResult(agentId: string): IConfidenceCalibrationResult | null {
    return this._agents.get(agentId)?.latestResult ?? null;
  }

  toDriftSignal(
    result: IConfidenceCalibrationResult,
    buildId: string,
  ): IDriftSignal | null {
    if (!result.isDivergent) return null;

    const severity = result.calibrationScore < 0.4 ? "critical" : "warning";

    return {
      id: randomUUID(),
      buildId,
      agentId: result.agentId,
      source: "confidence",
      severity,
      score: result.calibrationScore,
      description:
        `Confidence calibration ${result.calibrationScore.toFixed(2)}` +
        (result.divergenceDescription
          ? ` — ${result.divergenceDescription}`
          : ""),
      detectedAt: new Date(),
    };
  }

  unregisterAgent(agentId: string): void {
    this._agents.delete(agentId);
  }

  // ---------------------------------------------------------------------------
  // Baseline computation
  // ---------------------------------------------------------------------------

  private computeBaseline(
    responses: readonly ConfidenceResponseSnapshot[],
  ): Map<string, number> {
    const baseline = new Map<string, number>();

    for (const def of FEATURE_DEFINITIONS) {
      baseline.set(def.id, this.computeFeatureValue(def.id, responses));
    }

    return baseline;
  }

  // ---------------------------------------------------------------------------
  // Feature computation
  // ---------------------------------------------------------------------------

  private computeFeature(
    def: FeatureDef,
    responses: readonly ConfidenceResponseSnapshot[],
    baseline: Map<string, number>,
  ): IConfidenceFeature {
    const recentResponses = responses.slice(-BASELINE_WINDOW_SIZE);
    const currentValue = this.computeFeatureValue(def.id, recentResponses);
    const baselineValue = baseline.get(def.id) ?? currentValue;
    const deviation = Math.min(
      Math.abs(currentValue - baselineValue),
      1,
    );

    return {
      id: def.id,
      label: def.label,
      level: def.level,
      value: currentValue,
      baseline: baselineValue,
      deviation,
    };
  }

  private computeFeatureValue(
    featureId: string,
    responses: readonly ConfidenceResponseSnapshot[],
  ): number {
    if (responses.length === 0) return 0.5;

    switch (featureId) {
      case "decision-reversals":
        return this.measureDecisionReversals(responses);
      case "tool-diversity":
        return this.measureToolDiversity(responses);
      case "thinking-depth":
        return this.measureThinkingDepth(responses);
      case "response-thoroughness":
        return this.measureResponseThoroughness(responses);
      case "hedging-frequency":
        return this.measureHedgingFrequency(responses);
      case "assertion-confidence":
        return this.measureAssertionConfidence(responses);
      case "output-density":
        return this.measureOutputDensity(responses);
      case "completion-quality":
        return this.measureCompletionQuality(responses);
      default:
        return 0.5;
    }
  }

  // ---------------------------------------------------------------------------
  // Macro-level measurements
  // ---------------------------------------------------------------------------

  /**
   * Decision reversals — how often the agent contradicts its own prior
   * tool usage or approach across consecutive responses.
   * Returns 0-1 where lower = more reversals (less stable).
   */
  private measureDecisionReversals(
    responses: readonly ConfidenceResponseSnapshot[],
  ): number {
    if (responses.length < 2) return 0.5;
    let reversals = 0;
    for (let i = 1; i < responses.length; i++) {
      const prevTools = new Set(responses[i - 1]!.toolNames);
      const currTools = new Set(responses[i]!.toolNames);
      // If tool set changed dramatically, count as a reversal
      if (prevTools.size > 0 || currTools.size > 0) {
        const overlap = [...prevTools].filter((t) => currTools.has(t)).length;
        const total = new Set([...prevTools, ...currTools]).size;
        if (total > 0 && overlap / total < 0.3) {
          reversals++;
        }
      }
    }
    return 1 - reversals / (responses.length - 1);
  }

  /**
   * Tool diversity — richness of tool usage.
   * Returns 0-1 where higher = more diverse tool usage.
   */
  private measureToolDiversity(
    responses: readonly ConfidenceResponseSnapshot[],
  ): number {
    const allTools = responses.flatMap((r) => r.toolNames);
    if (allTools.length === 0) return 0.5;
    const uniqueTools = new Set(allTools).size;
    // Normalize: cap at 10 unique tools as "fully diverse"
    return Math.min(uniqueTools / 10, 1);
  }

  /**
   * Thinking depth — how much extended thinking the agent is doing.
   * Returns 0-1 where higher = deeper thinking.
   */
  private measureThinkingDepth(
    responses: readonly ConfidenceResponseSnapshot[],
  ): number {
    const thinkingResponses = responses.filter((r) => r.hasThinking);
    if (thinkingResponses.length === 0) return 0;
    const avgThinkingLength =
      thinkingResponses.reduce((sum, r) => sum + r.thinkingLength, 0) /
      thinkingResponses.length;
    // Normalize: cap at 5000 chars as "deep thinking"
    return Math.min(avgThinkingLength / 5000, 1);
  }

  /**
   * Response thoroughness — ratio of substantial responses to total.
   * Returns 0-1 where higher = more thorough.
   */
  private measureResponseThoroughness(
    responses: readonly ConfidenceResponseSnapshot[],
  ): number {
    // A "thorough" response has both text content and tool usage
    const thorough = responses.filter(
      (r) => r.textLength > 100 && r.toolCount > 0,
    ).length;
    return thorough / responses.length;
  }

  // ---------------------------------------------------------------------------
  // Micro-level measurements
  // ---------------------------------------------------------------------------

  /**
   * Hedging frequency — how often the agent uses uncertain language.
   * Returns 0-1 where higher = more hedging.
   */
  private measureHedgingFrequency(
    responses: readonly ConfidenceResponseSnapshot[],
  ): number {
    const hedgingPatterns = [
      /\bmaybe\b/i,
      /\bperhaps\b/i,
      /\bpossibly\b/i,
      /\bmight\b/i,
      /\bi think\b/i,
      /\bnot sure\b/i,
      /\bcould be\b/i,
      /\bprobably\b/i,
    ];

    let totalHedges = 0;
    let totalSentences = 0;

    for (const r of responses) {
      const sentences = r.textContent.split(/[.!?]+/).filter((s) => s.trim());
      totalSentences += sentences.length;
      for (const sentence of sentences) {
        if (hedgingPatterns.some((p) => p.test(sentence))) {
          totalHedges++;
        }
      }
    }

    return totalSentences > 0 ? totalHedges / totalSentences : 0;
  }

  /**
   * Assertion confidence — how often the agent makes direct statements.
   * Returns 0-1 where higher = more confident assertions.
   */
  private measureAssertionConfidence(
    responses: readonly ConfidenceResponseSnapshot[],
  ): number {
    const assertionPatterns = [
      /\bwill\b/i,
      /\bshould\b/i,
      /\bmust\b/i,
      /\bthis is\b/i,
      /\bthe correct\b/i,
      /\bspecifically\b/i,
    ];

    let totalAssertions = 0;
    let totalSentences = 0;

    for (const r of responses) {
      const sentences = r.textContent.split(/[.!?]+/).filter((s) => s.trim());
      totalSentences += sentences.length;
      for (const sentence of sentences) {
        if (assertionPatterns.some((p) => p.test(sentence))) {
          totalAssertions++;
        }
      }
    }

    return totalSentences > 0 ? totalAssertions / totalSentences : 0.5;
  }

  /**
   * Output density — information per token (text length / output tokens).
   * Returns 0-1 normalized value.
   */
  private measureOutputDensity(
    responses: readonly ConfidenceResponseSnapshot[],
  ): number {
    const densities = responses
      .filter((r) => r.outputTokens > 0)
      .map((r) => r.textLength / r.outputTokens);

    if (densities.length === 0) return 0.5;

    const avgDensity = densities.reduce((a, b) => a + b, 0) / densities.length;
    // Normalize: typical density is 3-5 chars per token
    return Math.min(avgDensity / 5, 1);
  }

  /**
   * Completion quality — ratio of clean completions to total responses.
   * Returns 0-1 where higher = better completions.
   */
  private measureCompletionQuality(
    responses: readonly ConfidenceResponseSnapshot[],
  ): number {
    const cleanCompletions = responses.filter(
      (r) => r.stopReason === "end_turn" || r.stopReason === "tool_use",
    ).length;
    return cleanCompletions / responses.length;
  }

  /** Empty result for insufficient data. */
  private _emptyResult(agentId: string): IConfidenceCalibrationResult {
    return {
      agentId,
      calibrationScore: 1,
      features: [],
      isDivergent: false,
      divergenceDescription: null,
      evaluatedAt: new Date(),
    };
  }
}

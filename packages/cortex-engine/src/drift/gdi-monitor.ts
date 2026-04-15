/**
 * Goal Drift Index (GDI) monitor — Signal 2 of the multi-signal
 * drift detection system.
 *
 * Combines four divergence measures to detect when an agent's output
 * is semantically drifting from its assigned goal — producing code
 * that technically works but doesn't serve the intended purpose.
 *
 * Divergence types:
 * - Semantic: output meaning drifting from goal intent
 * - Lexical: vocabulary/terminology divergence
 * - Structural: code structure divergence from expected patterns
 * - Distributional: statistical distribution shift in output characteristics
 *
 * Spec Section 5.3, Signal 2 — SAHOO framework (March 6, 2026):
 * "A learned multi-signal detector combining semantic, lexical, structural,
 * and distributional measures. Achieves 18.3% improvement in code tasks."
 */

import { randomUUID } from "node:crypto";
import type {
  IGDIMonitor,
  IGDIResult,
  IGDIDivergence,
  GDIDivergenceType,
  IDriftSignal,
  IAgentResponse,
} from "@kriptik/shared-interfaces";

/** GDI composite score threshold above which drift is flagged (0-1 scale, where higher = more drift). */
const GDI_DRIFT_THRESHOLD = 0.4;

/** Minimum responses before GDI evaluation is meaningful. */
const MIN_RESPONSES_FOR_GDI = 3;

// ---------------------------------------------------------------------------
// Per-agent state
// ---------------------------------------------------------------------------

interface AgentGDIState {
  readonly agentId: string;
  readonly goalDescription: string;
  /** Goal terms extracted for lexical comparison. */
  readonly goalTerms: ReadonlySet<string>;
  /** Recent responses for divergence analysis. */
  readonly responses: GDIResponseSnapshot[];
  latestResult: IGDIResult | null;
}

interface GDIResponseSnapshot {
  /** Extracted terms from the response. */
  readonly terms: ReadonlySet<string>;
  /** Response text length. */
  readonly textLength: number;
  /** Tool names used. */
  readonly toolNames: readonly string[];
  /** Output tokens. */
  readonly outputTokens: number;
  readonly timestamp: Date;
}

/** Sliding window size for GDI analysis. */
const GDI_WINDOW_SIZE = 8;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * GDIMonitor — computes Goal Drift Index from agent response patterns.
 *
 * Uses lexical overlap, structural pattern analysis, and distributional
 * statistics to detect when agent output diverges from the assigned goal.
 *
 * Semantic divergence is approximated through term overlap and structural
 * analysis rather than embedding similarity (which would require an
 * external embedding service). This provides a production-ready signal
 * that can be enhanced with true semantic similarity in Phase E.
 */
export class GDIMonitor implements IGDIMonitor {
  private readonly _agents = new Map<string, AgentGDIState>();

  registerAgent(agentId: string, goalDescription: string): void {
    this._agents.set(agentId, {
      agentId,
      goalDescription,
      goalTerms: extractTerms(goalDescription),
      responses: [],
      latestResult: null,
    });
  }

  evaluate(agentId: string, response: IAgentResponse): IGDIResult {
    const state = this._agents.get(agentId);
    if (!state) {
      return this._emptyResult(agentId);
    }

    // Record response snapshot
    const snapshot: GDIResponseSnapshot = {
      terms: extractTerms(response.textContent),
      textLength: response.textContent.length,
      toolNames: response.toolUse.map((t) => t.name),
      outputTokens: response.outputTokens,
      timestamp: new Date(),
    };
    state.responses.push(snapshot);

    while (state.responses.length > GDI_WINDOW_SIZE) {
      state.responses.shift();
    }

    if (state.responses.length < MIN_RESPONSES_FOR_GDI) {
      const result = this._emptyResult(agentId);
      state.latestResult = result;
      return result;
    }

    // Compute all four divergence measures
    const divergences: IGDIDivergence[] = [
      this.computeSemanticDivergence(state),
      this.computeLexicalDivergence(state),
      this.computeStructuralDivergence(state),
      this.computeDistributionalDivergence(state),
    ];

    // Composite: average of all divergences (0-1, higher = more drift)
    const compositeScore =
      divergences.reduce((sum, d) => sum + d.score, 0) / divergences.length;

    const result: IGDIResult = {
      agentId,
      goalId: "", // Will be populated by the multi-signal monitor
      compositeScore,
      divergences,
      isDrifting: compositeScore > GDI_DRIFT_THRESHOLD,
      evaluatedAt: new Date(),
    };

    state.latestResult = result;
    return result;
  }

  getLatestResult(agentId: string): IGDIResult | null {
    return this._agents.get(agentId)?.latestResult ?? null;
  }

  toDriftSignal(result: IGDIResult, buildId: string): IDriftSignal | null {
    if (!result.isDrifting) return null;

    const severity = result.compositeScore > 0.6 ? "critical" : "warning";
    const worstDivergence = [...result.divergences].sort(
      (a, b) => b.score - a.score,
    )[0];

    return {
      id: randomUUID(),
      buildId,
      agentId: result.agentId,
      source: "gdi",
      severity,
      score: 1 - result.compositeScore, // Invert: IDriftSignal.score is health (1=healthy)
      description:
        `GDI composite divergence ${result.compositeScore.toFixed(2)} ` +
        `(threshold ${GDI_DRIFT_THRESHOLD})` +
        (worstDivergence
          ? ` — worst: ${worstDivergence.type} (${worstDivergence.score.toFixed(2)})`
          : ""),
      detectedAt: new Date(),
    };
  }

  unregisterAgent(agentId: string): void {
    this._agents.delete(agentId);
  }

  // ---------------------------------------------------------------------------
  // Divergence computations
  // ---------------------------------------------------------------------------

  /**
   * Semantic divergence — approximated through term overlap between
   * recent responses and the goal description.
   *
   * High overlap means the agent is staying semantically close to the goal.
   * Low overlap suggests drift toward unrelated topics.
   */
  private computeSemanticDivergence(state: AgentGDIState): IGDIDivergence {
    const recentTerms = new Set(
      state.responses.slice(-3).flatMap((r) => [...r.terms]),
    );

    if (state.goalTerms.size === 0 || recentTerms.size === 0) {
      return { type: "semantic", score: 0, description: "Insufficient data for semantic comparison" };
    }

    const overlap = [...state.goalTerms].filter((t) => recentTerms.has(t)).length;
    const overlapRatio = overlap / state.goalTerms.size;

    // Divergence is inverse of overlap
    const score = Math.max(0, 1 - overlapRatio * 2); // Scale: 50% overlap = 0 divergence

    return {
      type: "semantic",
      score,
      description:
        score > GDI_DRIFT_THRESHOLD
          ? `Recent output shares only ${(overlapRatio * 100).toFixed(0)}% terminology with the goal`
          : `Goal terminology overlap at ${(overlapRatio * 100).toFixed(0)}%`,
    };
  }

  /**
   * Lexical divergence — measures whether the agent's vocabulary is
   * shifting over time within the session.
   *
   * Compares recent response terms against earlier response terms.
   * A stable agent uses consistent vocabulary; a drifting agent introduces
   * new unrelated terms while dropping goal-relevant ones.
   */
  private computeLexicalDivergence(state: AgentGDIState): IGDIDivergence {
    if (state.responses.length < 4) {
      return { type: "lexical", score: 0, description: "Insufficient history for lexical analysis" };
    }

    const mid = Math.floor(state.responses.length / 2);
    const earlyTerms = new Set(
      state.responses.slice(0, mid).flatMap((r) => [...r.terms]),
    );
    const recentTerms = new Set(
      state.responses.slice(mid).flatMap((r) => [...r.terms]),
    );

    if (earlyTerms.size === 0 || recentTerms.size === 0) {
      return { type: "lexical", score: 0, description: "No terms to compare" };
    }

    // Jaccard distance: 1 - |intersection|/|union|
    const intersection = [...earlyTerms].filter((t) => recentTerms.has(t));
    const union = new Set([...earlyTerms, ...recentTerms]);
    const jaccardSimilarity = intersection.length / union.size;
    const score = 1 - jaccardSimilarity;

    return {
      type: "lexical",
      score,
      description:
        score > GDI_DRIFT_THRESHOLD
          ? `Vocabulary shift detected: ${(jaccardSimilarity * 100).toFixed(0)}% overlap between early and recent responses`
          : `Vocabulary stable: ${(jaccardSimilarity * 100).toFixed(0)}% overlap`,
    };
  }

  /**
   * Structural divergence — measures whether the agent's code output
   * patterns are changing (tool usage sequences, response structure).
   */
  private computeStructuralDivergence(state: AgentGDIState): IGDIDivergence {
    if (state.responses.length < 4) {
      return { type: "structural", score: 0, description: "Insufficient history for structural analysis" };
    }

    const mid = Math.floor(state.responses.length / 2);
    const earlyToolSets = state.responses.slice(0, mid).map((r) => new Set(r.toolNames));
    const recentToolSets = state.responses.slice(mid).map((r) => new Set(r.toolNames));

    // Compare tool usage patterns between early and recent phases
    const earlyToolUnion = new Set(earlyToolSets.flatMap((s) => [...s]));
    const recentToolUnion = new Set(recentToolSets.flatMap((s) => [...s]));

    if (earlyToolUnion.size === 0 && recentToolUnion.size === 0) {
      return { type: "structural", score: 0, description: "No tool usage to compare" };
    }

    const toolOverlap = [...earlyToolUnion].filter((t) => recentToolUnion.has(t));
    const toolUnion = new Set([...earlyToolUnion, ...recentToolUnion]);
    const toolSimilarity = toolUnion.size > 0 ? toolOverlap.length / toolUnion.size : 1;
    const score = 1 - toolSimilarity;

    return {
      type: "structural",
      score,
      description:
        score > GDI_DRIFT_THRESHOLD
          ? `Tool usage pattern shift: ${(toolSimilarity * 100).toFixed(0)}% overlap`
          : `Tool usage patterns stable: ${(toolSimilarity * 100).toFixed(0)}% overlap`,
    };
  }

  /**
   * Distributional divergence — measures statistical shift in output
   * characteristics (length distribution, token usage patterns).
   */
  private computeDistributionalDivergence(state: AgentGDIState): IGDIDivergence {
    if (state.responses.length < 4) {
      return { type: "distributional", score: 0, description: "Insufficient history for distributional analysis" };
    }

    const mid = Math.floor(state.responses.length / 2);
    const earlyLengths = state.responses.slice(0, mid).map((r) => r.textLength);
    const recentLengths = state.responses.slice(mid).map((r) => r.textLength);

    const earlyTokens = state.responses.slice(0, mid).map((r) => r.outputTokens);
    const recentTokens = state.responses.slice(mid).map((r) => r.outputTokens);

    // Compare means — large shift indicates distributional change
    const lengthShift = normalizedMeanShift(earlyLengths, recentLengths);
    const tokenShift = normalizedMeanShift(earlyTokens, recentTokens);

    const score = Math.min((lengthShift + tokenShift) / 2, 1);

    return {
      type: "distributional",
      score,
      description:
        score > GDI_DRIFT_THRESHOLD
          ? `Output distribution shift: length ${(lengthShift * 100).toFixed(0)}%, tokens ${(tokenShift * 100).toFixed(0)}%`
          : `Output distribution stable`,
    };
  }

  /** Empty result for insufficient data. */
  private _emptyResult(agentId: string): IGDIResult {
    return {
      agentId,
      goalId: "",
      compositeScore: 0,
      divergences: [],
      isDrifting: false,
      evaluatedAt: new Date(),
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract meaningful terms from text (simple tokenization). */
function extractTerms(text: string): ReadonlySet<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4); // Skip short words

  return new Set(words);
}

/** Normalized mean shift between two value arrays (0-1). */
function normalizedMeanShift(
  a: readonly number[],
  b: readonly number[],
): number {
  if (a.length === 0 || b.length === 0) return 0;
  const meanA = a.reduce((s, v) => s + v, 0) / a.length;
  const meanB = b.reduce((s, v) => s + v, 0) / b.length;
  const maxMean = Math.max(Math.abs(meanA), Math.abs(meanB), 1);
  return Math.min(Math.abs(meanA - meanB) / maxMean, 1);
}

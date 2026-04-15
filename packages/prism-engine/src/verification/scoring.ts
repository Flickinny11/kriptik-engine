/**
 * scoring.ts — SWE-RM verification score threshold routing.
 *
 * The SWE-RM model (30B-A3B, 3B active MoE) runs on Modal and produces
 * a continuous [0, 1] score per generated node. This module defines the
 * threshold constants and routing logic that determines the next action
 * for each scored node.
 *
 * Spec reference: Section 12 — Verification & Repair Pipeline
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The action to take after scoring a node's generated code. */
export interface VerificationAction {
  action: 'pass' | 'regenerate' | 'fail';
  reason: string;
}

/** Per-node verification result produced after SWE-RM scoring. */
export interface NodeVerificationResult {
  nodeId: string;
  score: number;
  action: VerificationAction;
  attemptNumber: number;
}

/** Aggregated summary across all nodes in a build. */
export interface VerificationSummary {
  totalNodes: number;
  passed: number;
  borderline: number;
  failed: number;
  passRate: number;
  averageScore: number;
}

// ---------------------------------------------------------------------------
// Constants — score thresholds from spec Section 12
// ---------------------------------------------------------------------------

/** Score >= this value passes verification. */
export const SCORE_PASS = 0.85;

/** Score >= this value but < SCORE_PASS is borderline (regenerate from spec). */
export const SCORE_BORDERLINE = 0.60;

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

/**
 * Determines the next action based on a node's SWE-RM verification score.
 *
 * - score >= 0.85: Pass — proceed to assembly
 * - 0.60 <= score < 0.85: Borderline — regenerate from spec (no code shown)
 * - score < 0.60: Clear fail — regenerate from spec, then escalate
 */
export function routeVerificationScore(score: number): VerificationAction {
  if (score >= SCORE_PASS) {
    return { action: 'pass', reason: 'High confidence' };
  }
  if (score >= SCORE_BORDERLINE) {
    return {
      action: 'regenerate',
      reason: 'Borderline — regenerate from spec (no code shown)',
    };
  }
  return {
    action: 'fail',
    reason: 'Clear fail — regenerate from spec, then escalate',
  };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/**
 * Aggregates per-node verification results into summary statistics.
 *
 * Returns zero-valued summary when the results array is empty.
 */
export function aggregateVerificationResults(
  results: NodeVerificationResult[],
): VerificationSummary {
  if (results.length === 0) {
    return {
      totalNodes: 0,
      passed: 0,
      borderline: 0,
      failed: 0,
      passRate: 0,
      averageScore: 0,
    };
  }

  let passed = 0;
  let borderline = 0;
  let failed = 0;
  let scoreSum = 0;

  for (const result of results) {
    scoreSum += result.score;

    switch (result.action.action) {
      case 'pass':
        passed++;
        break;
      case 'regenerate':
        borderline++;
        break;
      case 'fail':
        failed++;
        break;
    }
  }

  const totalNodes = results.length;

  return {
    totalNodes,
    passed,
    borderline,
    failed,
    passRate: passed / totalNodes,
    averageScore: scoreSum / totalNodes,
  };
}

// ---------------------------------------------------------------------------
// Escalation check
// ---------------------------------------------------------------------------

/**
 * Returns true if a node should be escalated to the frontier model
 * (Claude Opus 4.6) after exhausting repair attempts.
 *
 * Escalation triggers at attempt >= 3. Attempts 1 and 2 use the
 * contamination-aware repair protocol; attempt 3+ uses the frontier
 * model with full context.
 */
export function shouldEscalate(_nodeId: string, attempts: number): boolean {
  return attempts >= 3;
}

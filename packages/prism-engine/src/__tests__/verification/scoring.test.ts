import { describe, it, expect } from 'vitest';
import {
  SCORE_PASS,
  SCORE_BORDERLINE,
  routeVerificationScore,
  aggregateVerificationResults,
  shouldEscalate,
} from '../../verification/scoring.js';
import type { NodeVerificationResult } from '../../verification/scoring.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('SCORE_PASS', () => {
  it('is 0.85', () => {
    expect(SCORE_PASS).toBe(0.85);
  });
});

describe('SCORE_BORDERLINE', () => {
  it('is 0.60', () => {
    expect(SCORE_BORDERLINE).toBe(0.60);
  });
});

// ---------------------------------------------------------------------------
// routeVerificationScore
// ---------------------------------------------------------------------------

describe('routeVerificationScore', () => {
  it('returns pass for score >= 0.85 (exact threshold)', () => {
    const result = routeVerificationScore(0.85);
    expect(result.action).toBe('pass');
  });

  it('returns pass for score 0.90', () => {
    const result = routeVerificationScore(0.90);
    expect(result.action).toBe('pass');
  });

  it('returns pass for score 1.0', () => {
    const result = routeVerificationScore(1.0);
    expect(result.action).toBe('pass');
  });

  it('returns regenerate for score 0.60 (exact borderline threshold)', () => {
    const result = routeVerificationScore(0.60);
    expect(result.action).toBe('regenerate');
  });

  it('returns regenerate for score 0.70', () => {
    const result = routeVerificationScore(0.70);
    expect(result.action).toBe('regenerate');
  });

  it('returns regenerate for score 0.84', () => {
    const result = routeVerificationScore(0.84);
    expect(result.action).toBe('regenerate');
  });

  it('returns fail for score 0.0', () => {
    const result = routeVerificationScore(0.0);
    expect(result.action).toBe('fail');
  });

  it('returns fail for score 0.30', () => {
    const result = routeVerificationScore(0.30);
    expect(result.action).toBe('fail');
  });

  it('returns fail for score 0.59', () => {
    const result = routeVerificationScore(0.59);
    expect(result.action).toBe('fail');
  });
});

// ---------------------------------------------------------------------------
// aggregateVerificationResults
// ---------------------------------------------------------------------------

describe('aggregateVerificationResults', () => {
  function makeResult(
    nodeId: string,
    score: number,
    action: 'pass' | 'regenerate' | 'fail',
  ): NodeVerificationResult {
    return {
      nodeId,
      score,
      action: { action, reason: `test-${action}` },
      attemptNumber: 1,
    };
  }

  it('counts pass, borderline, and fail correctly', () => {
    const results: NodeVerificationResult[] = [
      makeResult('n1', 0.90, 'pass'),
      makeResult('n2', 0.88, 'pass'),
      makeResult('n3', 0.95, 'pass'),
      makeResult('n4', 0.72, 'regenerate'),
      makeResult('n5', 0.65, 'regenerate'),
      makeResult('n6', 0.30, 'fail'),
    ];

    const summary = aggregateVerificationResults(results);
    expect(summary.totalNodes).toBe(6);
    expect(summary.passed).toBe(3);
    expect(summary.borderline).toBe(2);
    expect(summary.failed).toBe(1);
  });

  it('computes passRate as passed / totalNodes', () => {
    const results: NodeVerificationResult[] = [
      makeResult('n1', 0.90, 'pass'),
      makeResult('n2', 0.88, 'pass'),
      makeResult('n3', 0.95, 'pass'),
      makeResult('n4', 0.72, 'regenerate'),
      makeResult('n5', 0.65, 'regenerate'),
      makeResult('n6', 0.30, 'fail'),
    ];

    const summary = aggregateVerificationResults(results);
    expect(summary.passRate).toBeCloseTo(3 / 6, 10);
  });

  it('computes averageScore', () => {
    const results: NodeVerificationResult[] = [
      makeResult('n1', 0.90, 'pass'),
      makeResult('n2', 0.88, 'pass'),
      makeResult('n3', 0.95, 'pass'),
      makeResult('n4', 0.72, 'regenerate'),
      makeResult('n5', 0.65, 'regenerate'),
      makeResult('n6', 0.30, 'fail'),
    ];

    const expectedAverage = (0.90 + 0.88 + 0.95 + 0.72 + 0.65 + 0.30) / 6;
    const summary = aggregateVerificationResults(results);
    expect(summary.averageScore).toBeCloseTo(expectedAverage, 10);
  });

  it('returns zeros for empty array', () => {
    const summary = aggregateVerificationResults([]);
    expect(summary.totalNodes).toBe(0);
    expect(summary.passed).toBe(0);
    expect(summary.borderline).toBe(0);
    expect(summary.failed).toBe(0);
    expect(summary.passRate).toBe(0);
    expect(summary.averageScore).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// shouldEscalate
// ---------------------------------------------------------------------------

describe('shouldEscalate', () => {
  it('returns true for attempts >= 3 (attempt 3)', () => {
    expect(shouldEscalate('node-1', 3)).toBe(true);
  });

  it('returns true for attempts >= 3 (attempt 5)', () => {
    expect(shouldEscalate('node-1', 5)).toBe(true);
  });

  it('returns true for attempts >= 3 (attempt 10)', () => {
    expect(shouldEscalate('node-1', 10)).toBe(true);
  });

  it('returns false for attempts < 3 (attempt 0)', () => {
    expect(shouldEscalate('node-1', 0)).toBe(false);
  });

  it('returns false for attempts < 3 (attempt 1)', () => {
    expect(shouldEscalate('node-1', 1)).toBe(false);
  });

  it('returns false for attempts < 3 (attempt 2)', () => {
    expect(shouldEscalate('node-1', 2)).toBe(false);
  });
});

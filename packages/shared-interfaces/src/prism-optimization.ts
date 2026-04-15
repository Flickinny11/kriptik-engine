/**
 * prism-optimization.ts — GEPA overnight optimization types for Prism engine.
 *
 * Optimization runs per-node PixiJS improvements, graph-level structural
 * optimization, and integration testing with visual regression.
 */

export interface OptimizationSession {
  id: string;
  graphId: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  startedAt: string;
  completedAt?: string;
  report?: OptimizationReport;
}

export interface OptimizationReport {
  nodesOptimized: number;
  totalNodes: number;
  drawCallReduction: number;
  bundleSizeReduction: number;
  renderTimeImprovement: number;
  perNodeImprovements: OptimizationNodeResult[];
  graphLevelChanges: string[];
  durationMs: number;
}

export interface OptimizationNodeResult {
  nodeId: string;
  originalScore: number;
  optimizedScore: number;
  changes: string[];
}

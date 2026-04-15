/**
 * Compaction configuration and custom summarization instructions.
 *
 * Defines the default configuration for the Compaction API integration,
 * including the custom summarization instructions optimized for build context.
 *
 * Spec Section 5.2, Mechanism 1 — "Cortex uses custom summarization
 * instructions optimized for build context."
 */

import type { ICompactionConfig } from "@kriptik/shared-interfaces";

/**
 * Default compaction threshold — trigger compaction at 35% context fill.
 *
 * This fires BEFORE the rotation warning threshold (40%) to give compaction
 * a chance to reclaim space. If compaction keeps the window under 40%,
 * rotation is avoided entirely.
 */
export const DEFAULT_COMPACTION_THRESHOLD = 0.35;

/**
 * Maximum compactions per session before forcing rotation.
 *
 * Each compaction degrades the quality of preserved context slightly — the
 * 6x compression is lossy. After 3 compactions, the accumulated information
 * loss makes a fresh context (via rotation) more effective.
 */
export const DEFAULT_MAX_COMPACTIONS_BEFORE_ROTATION = 3;

/**
 * Custom summarization instructions for the Compaction API.
 *
 * Spec Section 5.2, Mechanism 1 — these instructions tell the compaction
 * model what to preserve and what to discard during compression:
 *
 * Preserve:
 *   1. Current goal assignment and progress status
 *   2. All interface contracts with peer agents
 *   3. Active decisions and their reasoning
 *   4. Architectural blueprint constraints
 *   5. File paths and code structure created so far
 *
 * Discard:
 *   - Tool call raw output (re-readable from disk)
 *   - File read contents (re-readable from disk)
 *   - Verbose error logs (preserve only diagnosis and fix)
 */
export const BUILD_CONTEXT_SUMMARIZATION_INSTRUCTIONS = `When compacting this conversation, preserve:
1. The current goal assignment and progress status
2. All interface contracts with peer agents
3. Active decisions and their reasoning
4. The architectural blueprint constraints
5. File paths and code structure created so far
6. Any pending peer negotiations or proposals
7. Error diagnoses and their fixes (but not raw error output)
Discard: tool call raw output, file read contents (re-readable from disk), verbose error logs (preserve only diagnosis and fix), intermediate reasoning that led to already-recorded decisions.`;

/**
 * Build the default compaction configuration.
 *
 * Uses spec-defined defaults with custom summarization instructions
 * optimized for build context.
 */
export function buildDefaultCompactionConfig(
  overrides?: Partial<ICompactionConfig>,
): ICompactionConfig {
  return {
    compactionThreshold:
      overrides?.compactionThreshold ?? DEFAULT_COMPACTION_THRESHOLD,
    summarizationInstructions:
      overrides?.summarizationInstructions ??
      BUILD_CONTEXT_SUMMARIZATION_INSTRUCTIONS,
    pauseAfterCompaction: overrides?.pauseAfterCompaction ?? true,
    maxCompactionsBeforeRotation:
      overrides?.maxCompactionsBeforeRotation ??
      DEFAULT_MAX_COMPACTIONS_BEFORE_ROTATION,
  };
}

/**
 * Compaction subsystem — Anthropic Compaction API integration with
 * anchored state tracking and post-compaction re-injection.
 *
 * Spec Section 5.2 — Golden Window Management, Mechanisms 1-3.
 */

export { AnchoredStateTracker } from "./anchored-state-tracker.js";
export { CompactionManager } from "./compaction-manager.js";
export {
  buildDefaultCompactionConfig,
  BUILD_CONTEXT_SUMMARIZATION_INSTRUCTIONS,
  DEFAULT_COMPACTION_THRESHOLD,
  DEFAULT_MAX_COMPACTIONS_BEFORE_ROTATION,
} from "./compaction-config.js";

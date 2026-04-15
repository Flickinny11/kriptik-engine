/**
 * Model tier constants and context window configuration.
 *
 * Spec Section 1.4 — Two model tiers only: Opus 4.6 primary, Sonnet 4.6 secondary.
 * No Haiku. No other providers. All agents use the Anthropic Messages API.
 *
 * Spec Section 5.1 — Hard threshold at 40-50% context fill (arXiv:2601.15300).
 */

import type { ModelTier } from "@kriptik/shared-interfaces";

/** Model configuration for each tier. */
export interface ModelConfig {
  readonly modelId: ModelTier;
  readonly maxContextTokens: number;
  readonly supportsExtendedThinking: boolean;
  readonly supportsVision: boolean;
}

/**
 * Opus 4.6 — primary model for all agents.
 * 1M token context window. Extended thinking enabled.
 */
export const OPUS_CONFIG: ModelConfig = {
  modelId: "claude-opus-4-6",
  maxContextTokens: 1_000_000,
  supportsExtendedThinking: true,
  supportsVision: true,
} as const;

/**
 * Sonnet 4.6 — secondary model for well-understood tasks with rich trail coverage.
 * Also used for ephemeral sub-agents performing bounded mechanical tasks.
 */
export const SONNET_CONFIG: ModelConfig = {
  modelId: "claude-sonnet-4-6",
  maxContextTokens: 200_000,
  supportsExtendedThinking: true,
  supportsVision: true,
} as const;

/** Look up configuration by model tier. */
export function getModelConfig(tier: ModelTier): ModelConfig {
  switch (tier) {
    case "claude-opus-4-6":
      return OPUS_CONFIG;
    case "claude-sonnet-4-6":
      return SONNET_CONFIG;
  }
}

/**
 * Default context fill thresholds from spec Section 5.1.
 *
 * "Models maintain strong performance up to approximately 40-50% of maximum
 * context length, then collapse catastrophically with a 45.5% F1 drop."
 */
export const DEFAULT_ROTATION_WARNING_THRESHOLD = 0.4;
export const DEFAULT_ROTATION_CRITICAL_THRESHOLD = 0.5;

/** Extended thinking budget token allocation. */
export const EXTENDED_THINKING_BUDGET_TOKENS = 32_000;

/** Compaction API model identifier. */
export const COMPACTION_MODEL = "compact-2026-01-12";

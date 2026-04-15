/**
 * AI model configuration — single source of truth for model strings,
 * thinking budgets, and context limits.
 *
 * Current models as of March 2026:
 * - Anthropic: claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5
 * - OpenAI: gpt-5.4, gpt-5.3, gpt-5.2, o3
 * - Google: gemini-3.1-pro-preview, gemini-3.1-flash-lite, gemini-3-flash-preview
 * - xAI: grok-4.20, grok-4, grok-4.1-fast
 */

export const MODELS = {
  // Lead Agent — needs the best reasoning model available
  LEAD: 'claude-opus-4-6',

  // Specialist default — can be different provider for cost/speed tradeoffs
  SPECIALIST_DEFAULT: 'claude-opus-4-6',

  // Analysis tools (intent, competitors, components, api-probe)
  ANALYSIS: 'claude-opus-4-6',

  // Vision analysis (screenshot review, competitor visual analysis)
  VISION: 'claude-opus-4-6',
} as const;

// Example alternative configurations:
//
// Cost-optimized (same provider):
// LEAD: 'claude-opus-4-6',
// SPECIALIST_DEFAULT: 'claude-sonnet-4-6',
// ANALYSIS: 'claude-sonnet-4-6',
// VISION: 'claude-sonnet-4-6',
//
// Mixed-provider:
// LEAD: 'claude-opus-4-6',
// SPECIALIST_DEFAULT: 'gpt-5.4',
// ANALYSIS: 'claude-opus-4-6',
// VISION: 'gemini-3.1-pro-preview',
//
// Budget mode:
// LEAD: 'claude-sonnet-4-6',
// SPECIALIST_DEFAULT: 'gpt-5.2',
// ANALYSIS: 'claude-sonnet-4-6',
// VISION: 'claude-sonnet-4-6',
//
// Speed mode:
// LEAD: 'claude-opus-4-6',
// SPECIALIST_DEFAULT: 'grok-4.1-fast',
// ANALYSIS: 'claude-sonnet-4-6',
// VISION: 'gemini-3.1-flash-lite',

export const THINKING = {
  LEAD_BUDGET: 10_000,
  SPECIALIST_BUDGET: 10_000,
  ANALYSIS_BUDGET: 10_000,
} as const;

export const CONTEXT = {
  MAX_TOKENS: 180_000,
  COMPACTION_THRESHOLD: 0.8,
  MAX_OUTPUT_TOKENS: 16_384,
} as const;

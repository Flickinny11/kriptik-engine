/**
 * Agent harness module — manages Anthropic API sessions for Cortex agents.
 *
 * Spec Section 3.1 — agents are autonomous API sessions.
 * Spec Section 5.4 — golden window formation and rotation.
 * Spec Section 12.4, Phase A Step 1.
 */

export { AgentHarness } from "./agent-harness.js";
export type { HarnessEventHandler, SessionEventHandler } from "./agent-harness.js";

export { AgentSession } from "./agent-session.js";

export {
  OPUS_CONFIG,
  SONNET_CONFIG,
  getModelConfig,
  DEFAULT_ROTATION_WARNING_THRESHOLD,
  DEFAULT_ROTATION_CRITICAL_THRESHOLD,
  EXTENDED_THINKING_BUDGET_TOKENS,
  COMPACTION_MODEL,
} from "./model-config.js";
export type { ModelConfig } from "./model-config.js";

export { TokenMonitor } from "./token-monitor.js";
export type { ThresholdEventHandler } from "./token-monitor.js";

export { ESAAEmitter } from "./esaa-emitter.js";
export type { ESAAEventHandler } from "./esaa-emitter.js";

export {
  buildSystemPrompt,
  buildInitialMessages,
  buildReinjectionMessages,
} from "./golden-window.js";
export type { ConversationMessage } from "./golden-window.js";

// Phase B, Step 9 — Threshold Monitoring + Basic Rotation
export { EnhancedThresholdMonitor } from "./enhanced-threshold-monitor.js";
export { RotationProtocol } from "./rotation-protocol.js";
export type { RotationProtocolConfig } from "./rotation-protocol.js";
export { BasicStateCapture } from "./basic-state-capture.js";
export type {
  BasicStateCaptureConfig,
  ModifiedFilesProvider,
  GoalProgressProvider,
  PeerNegotiationProvider,
  ESAAEventQueryProvider,
} from "./basic-state-capture.js";

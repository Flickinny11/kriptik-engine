/**
 * Verification subsystem — anti-slop enforcement, UX verification,
 * and design quality scoring.
 *
 * Phase B, Step 11 — Anti-slop linter (Layers 4-5 of the
 * Seven-Layer Design Enforcement Stack).
 * Phase C, Step 12 — UX Verification Teams (Navigator + Inspector,
 * Layer 6 of the Seven-Layer Design Enforcement Stack).
 */

// Phase B, Step 11
export { AntiSlopLinter } from "./anti-slop-linter.js";
export {
  DEFAULT_SLOP_PATTERNS,
  DEFAULT_SLOP_LINTER_CONFIG,
} from "./slop-patterns.js";

// Phase C, Step 12 — UX Verification Teams
export { JourneyTestPlanner } from "./journey-test-planner.js";
export { NavigatorAgent } from "./navigator-agent.js";
export { InspectorAgent } from "./inspector-agent.js";
export { UXVerificationTeam } from "./ux-verification-team.js";

export type {
  JourneyTestPlannerConfig,
} from "./journey-test-planner.js";
export type {
  NavigatorAgentConfig,
} from "./navigator-agent.js";
export type {
  InspectorAgentConfig,
} from "./inspector-agent.js";

// Phase C, Step 15 — Journey Verification, Intent Satisfaction, CVS Coordinator
export { JourneyVerificationAgent } from "./journey-verification-agent.js";
export { IntentSatisfactionAgent } from "./intent-satisfaction-agent.js";
export { CVSCoordinator } from "./cvs-coordinator.js";

export type {
  JourneyVerificationAgentConfig,
} from "./journey-verification-agent.js";
export type {
  IntentSatisfactionAgentConfig,
} from "./intent-satisfaction-agent.js";
export type {
  CVSCoordinatorDeps,
} from "./cvs-coordinator.js";

// Phase C, Step 16 — Violation Response Protocol
export { ViolationDetector } from "./violation-detector.js";
export { ViolationResponseProtocol } from "./violation-response-protocol.js";
export { ReplacementAgentBuilder } from "./replacement-agent-builder.js";

export type {
  ViolationResponseDeps,
  IPeerGraphProvider,
  IAcceptedProposal,
  IBranchArchiver,
  ITrailProvider,
} from "./violation-response-protocol.js";

/**
 * Violation Response Protocol interfaces — the system for detecting contract
 * violations, firing non-compliant agents, and launching replacements with
 * positive-only briefing and violation trails.
 *
 * Spec Section 9.0 — The Absolute Rule: No Retry Limit, No Abandonment
 * Spec Section 9.1 — Severity Classification
 * Spec Section 9.2 — The Firing Protocol (seven steps)
 * Spec Section 9.3 — The Compound Effect: Firing Gets Rarer
 */

import type { IDriftSignal } from "./drift.js";
import type { IMergeGateResult } from "./verification.js";
import type {
  IGoalAssignment,
  AgentRole,
  ModelTier,
  IDepartingAgentState,
} from "./agents.js";

// ---------------------------------------------------------------------------
// Violation severity and escalation
// ---------------------------------------------------------------------------

/**
 * Violation severity levels per Section 9.1.
 *
 * - minor: Fix and re-submit — mechanical errors (LSP errors, missing import,
 *   first-time scope adjustment, individual edge-case test failure).
 *   The agent's reasoning is sound; the error is mechanical.
 * - moderate: Monitoring system reassessment — repeated minor rejections (3+),
 *   core logic test failure, scope violation suggesting wrong approach.
 * - severe: Firing — interface contract violation, architectural blueprint
 *   deviation, or a moderate issue where the rotated replacement also fails.
 */
export type ViolationSeverity = "minor" | "moderate" | "severe";

/**
 * Escalation levels from Section 9.0. Each level brings fundamentally
 * different resources to bear — not the same approach repeated.
 *
 * 1. fix-and-resubmit — agent corrects a mechanical error
 * 2. rotation — fresh agent in golden window attempts the same goal
 * 3. firing — approach is wrong; new agent gets different guidance
 * 4. architect-replan — goal may need re-scoping or interface revision
 * 5. goal-decomposition — goal is too complex for a single agent
 * 6. model-escalation — escalate to higher model tier
 *
 * Spec Section 9.0 — "Each escalation level brings fundamentally different
 * resources to bear."
 */
export type EscalationLevel =
  | "fix-and-resubmit"
  | "rotation"
  | "firing"
  | "architect-replan"
  | "goal-decomposition"
  | "model-escalation";

/**
 * Source of a violation — what triggered the detection.
 *
 * Merge gate checks (Section 4.3):
 *   scope, lsp, contract, test, banned-pattern
 * Other sources:
 *   drift signals (Section 5.3), quality degradation (Section 7.3),
 *   accumulated minor violations (Section 9.1)
 */
export type ViolationSource =
  | "merge-gate-scope"       // Check 1: out-of-scope file modification
  | "merge-gate-lsp"         // Check 2: TypeScript errors
  | "merge-gate-contract"    // Check 3: interface contract violation
  | "merge-gate-test"        // Check 4: test failures
  | "merge-gate-banned"      // Check 5: banned pattern / anti-slop violation
  | "drift-signal"           // Drift detection system signal
  | "quality-degradation"    // Design quality score below threshold
  | "repeated-minor";        // Accumulated 3+ minor rejections on same goal

// ---------------------------------------------------------------------------
// Violation record
// ---------------------------------------------------------------------------

/**
 * IViolationRecord — a recorded contract violation or quality failure.
 *
 * Every violation is tracked for trail extraction (Section 6.3) and
 * compound learning (Section 9.3). Violation records feed the anti-pattern
 * library, monitoring system training data, and ICE improvement pipeline.
 *
 * Spec Section 9.2, Step 1 — Trail Extraction captures what the agent built,
 * where it went wrong, what reasoning led to the violation.
 */
export interface IViolationRecord {
  /** Unique violation identifier. */
  readonly id: string;
  /** The build this violation occurred in. */
  readonly buildId: string;
  /** The agent that committed the violation. */
  readonly agentId: string;
  /** The goal the agent was working on. */
  readonly goalId: string;
  /** Severity classification per Section 9.1. */
  readonly severity: ViolationSeverity;
  /** What triggered the detection. */
  readonly source: ViolationSource;
  /** Current escalation level for this goal. */
  readonly escalationLevel: EscalationLevel;

  /** Human-readable description of the violation. */
  readonly description: string;
  /** Detailed diagnostics from the merge gate or drift system. */
  readonly diagnostics: readonly string[];

  /** The merge gate result that triggered this (if from a merge failure). */
  readonly mergeGateResult: IMergeGateResult | null;
  /** The drift signal that triggered this (if from drift detection). */
  readonly driftSignal: IDriftSignal | null;

  /** Number of prior violations on this same goal (for escalation tracking). */
  readonly priorViolationCount: number;
  /** Whether this agent is itself a replacement for a previously fired agent. */
  readonly isReplacementAgent: boolean;
  /** When this violation was detected. */
  readonly detectedAt: Date;
}

// ---------------------------------------------------------------------------
// Peer contamination assessment
// ---------------------------------------------------------------------------

/**
 * IPeerContaminationAssessment — evaluates whether a fired agent's accepted
 * interface proposals have contaminated peer agents.
 *
 * Spec Section 9.2, Step 3 — "every accepted interface proposal from the
 * fired agent is flagged as pending_re_evaluation. If a peer has already
 * built against a contaminated interface, the Cortex holds that peer's
 * merge attempts until the replacement confirms or revises."
 */
export interface IPeerContaminationAssessment {
  /** ID of the fired agent. */
  readonly firedAgentId: string;
  /** Interface proposals from the fired agent that peers have built against. */
  readonly contaminatedInterfaces: readonly IContaminatedInterface[];
  /** Peer agents that should have their merges held pending re-evaluation. */
  readonly affectedPeerIds: readonly string[];
  /** Whether any contamination was found. */
  readonly hasContamination: boolean;
}

/**
 * An interface proposal from a fired agent that may be contaminated.
 *
 * Spec Section 9.2, Step 3 — peers that built against contaminated
 * interfaces have their merges held until the replacement confirms or revises.
 */
export interface IContaminatedInterface {
  /** The interface contract path. */
  readonly interfacePath: string;
  /** Peer agents that have built against this interface. */
  readonly dependentPeerIds: readonly string[];
  /** Re-evaluation status. */
  readonly status: "pending_re_evaluation" | "confirmed" | "revised";
}

// ---------------------------------------------------------------------------
// Firing result
// ---------------------------------------------------------------------------

/**
 * IFiringResult — the output of the seven-step firing protocol.
 *
 * Contains everything the orchestrator needs to launch the replacement
 * agent and update the build state.
 *
 * Spec Section 9.2 — seven steps in sequence:
 * 1. Trail extraction
 * 2. Branch archival
 * 3. Peer contamination assessment
 * 4. Infrastructure state update
 * 5. Replacement deployment with positive-only briefing
 * 6. Peer notification
 * 7. Resume coordination
 */
export interface IFiringResult {
  /** Unique identifier for this firing event. */
  readonly firingId: string;
  /** ID of the fired agent. */
  readonly firedAgentId: string;
  /** The goal that needs a replacement agent. */
  readonly goalId: string;
  /** The build this firing occurred in. */
  readonly buildId: string;
  /** The violation that triggered firing. */
  readonly violationRecord: IViolationRecord;
  /** Captured state from the fired agent (for trail extraction). */
  readonly capturedState: IDepartingAgentState;
  /** The fired agent's branch name (archived, invisible to active agents). */
  readonly archivedBranch: string;
  /** Peer contamination assessment results. */
  readonly peerContamination: IPeerContaminationAssessment;
  /** Configuration for launching the replacement agent. */
  readonly replacementConfig: IReplacementConfig;
  /** Peers that were notified of the reassignment (Step 6). */
  readonly notifiedPeerIds: readonly string[];
  /** When the firing was executed. */
  readonly firedAt: Date;
}

// ---------------------------------------------------------------------------
// Replacement configuration
// ---------------------------------------------------------------------------

/**
 * IReplacementConfig — configuration for launching a replacement agent
 * after a firing event.
 *
 * The replacement receives everything a normal agent would PLUS enhanced
 * positive guidance derived from the violation — phrased entirely as what
 * TO do, never what NOT to do. No mention of the previous agent. No
 * description of the wrong approach.
 *
 * Spec Section 9.2, Step 5 — "Replacement Deployment with Positive-Only Briefing."
 * Spec Section 6.3 — violation trails carry "non-negotiable" framing.
 */
export interface IReplacementConfig {
  /** The goal to be assigned to the replacement. */
  readonly goal: IGoalAssignment;
  /** Role for the replacement agent. */
  readonly role: AgentRole;
  /** Recommended model tier (may be escalated from the fired agent's tier). */
  readonly modelTier: ModelTier;

  /**
   * Positive-only briefing derived from the violation.
   * Phrased entirely as what TO do, never what NOT to do.
   * No mention of the previous agent. No description of the wrong approach.
   *
   * Spec Section 9.2, Step 5 — "The correct approach presented with
   * sufficient specificity that it doesn't need to independently derive one."
   */
  readonly positiveOnlyBriefing: string;

  /**
   * Violation trails with non-negotiable framing.
   * Each trail is phrased as an architectural constraint, not a warning.
   *
   * Spec Section 6.3 — "Violation trails carry extra injection weight and
   * explicit non-negotiable framing: 'Server-side sessions are required for
   * multi-device support — this is an architectural constraint, not a
   * recommendation.'"
   */
  readonly violationTrails: readonly string[];

  /**
   * Top trails re-ranked with extra weight on correct patterns.
   *
   * Spec Section 9.2, Step 5 — "Top trails re-ranked with extra weight
   * on correct patterns."
   */
  readonly rerankedTrails: readonly string[];

  /** The last clean merge point (commit SHA) to resume from. */
  readonly lastCleanMergePoint: string;
  /** Peer agent IDs for graph-mesh communication. */
  readonly peerAgentIds: readonly string[];
  /** Interfaces under re-evaluation that the replacement must confirm or revise. */
  readonly interfacesUnderReview: readonly IContaminatedInterface[];
}

// ---------------------------------------------------------------------------
// Violation detector
// ---------------------------------------------------------------------------

/**
 * IViolationDetector — monitors merge gate failures, drift signals, and
 * quality degradation to classify violations and determine escalation level.
 *
 * The detector maintains per-agent, per-goal violation history to track
 * escalation through the levels defined in Section 9.0:
 * - First minor failure → fix-and-resubmit
 * - 3+ minor failures on same goal → escalate to moderate
 * - Moderate with degradation → rotation
 * - Moderate without degradation → architect consultation
 * - Severe (contract/blueprint violation) → firing
 * - Replacement also fails → further escalation (architect-replan, decompose, etc.)
 *
 * Spec Section 9.1 — Severity Classification
 * Spec Section 9.0 — Escalation through fundamentally different approaches
 */
export interface IViolationDetector {
  /**
   * Process a merge gate failure and classify the violation.
   * Returns the violation record with severity and recommended escalation.
   *
   * Classification logic per Section 9.1:
   * - LSP errors, first scope adjustment, edge-case test failure → minor
   * - 3+ minor rejections, core logic failure, cross-boundary scope → moderate
   * - Interface contract violation, blueprint deviation → severe
   */
  processMergeFailure(
    agentId: string,
    goalId: string,
    buildId: string,
    mergeResult: IMergeGateResult,
  ): IViolationRecord;

  /**
   * Process a drift signal as a potential quality violation.
   * Only critical drift signals produce violation records.
   */
  processDriftSignal(
    agentId: string,
    goalId: string,
    buildId: string,
    signal: IDriftSignal,
  ): IViolationRecord | null;

  /**
   * Process a design quality score failure.
   * Triggered when the design quality scorer produces a score below threshold.
   */
  processQualityFailure(
    agentId: string,
    goalId: string,
    buildId: string,
    qualityScore: number,
    threshold: number,
  ): IViolationRecord;

  /**
   * Get the current escalation level for an agent's goal.
   * Accounts for violation history and whether the agent is a replacement.
   */
  getEscalationLevel(agentId: string, goalId: string): EscalationLevel;

  /** Get all violations for an agent. */
  getAgentViolations(agentId: string): readonly IViolationRecord[];

  /** Get all violations for a goal (across all agents assigned to it). */
  getGoalViolations(goalId: string): readonly IViolationRecord[];

  /** Get all violations for a build. */
  getBuildViolations(buildId: string): readonly IViolationRecord[];

  /**
   * Mark an agent as a replacement for a previously fired agent.
   * This affects escalation tracking — if a replacement also fails,
   * the system escalates further rather than just firing again.
   *
   * Spec Section 9.2 — "If a replacement agent also fails at the same
   * goal, the Cortex escalates further."
   */
  registerReplacement(agentId: string, firedAgentId: string): void;
}

// ---------------------------------------------------------------------------
// Violation response protocol
// ---------------------------------------------------------------------------

/**
 * IViolationResponseProtocol — orchestrates the seven-step firing sequence
 * and coordinates the full violation response lifecycle.
 *
 * The protocol handles:
 * 1. Trail extraction from the fired agent
 * 2. Branch archival (invisible to active agents)
 * 3. Peer contamination assessment
 * 4. Infrastructure state update
 * 5. Replacement deployment config with positive-only briefing
 * 6. Peer notification
 * 7. Resume coordination
 *
 * Like IRotationProtocol, this does NOT launch the replacement agent.
 * The orchestrator constructs the golden window and calls AgentHarness.launch().
 * This separation keeps golden window construction logic in the orchestrator
 * where it has access to the full build context.
 *
 * Spec Section 9.2 — The Firing Protocol (seven steps)
 * Spec Section 9.0 — No Retry Limit, No Abandonment
 */
export interface IViolationResponseProtocol {
  /**
   * Execute the seven-step firing protocol.
   * Returns everything the orchestrator needs to launch the replacement.
   */
  executeFiring(
    violationRecord: IViolationRecord,
  ): Promise<IFiringResult>;

  /**
   * Determine the appropriate response for a violation based on its
   * severity and escalation level.
   *
   * Not all violations result in firing:
   * - Minor violations → fix-and-resubmit
   * - Moderate with degradation → rotation
   * - Moderate without degradation → architect-replan
   * - Severe → firing
   * - Replacement also severe → architect-replan or goal-decomposition
   *
   * Spec Section 9.1 — Severity Classification determines response.
   */
  determineResponse(
    violationRecord: IViolationRecord,
  ): EscalationLevel;

  /** Get firing history for a build. */
  getFiringHistory(buildId: string): readonly IFiringResult[];

  /** Get firing history for a specific goal (for escalation tracking). */
  getGoalFiringHistory(goalId: string): readonly IFiringResult[];
}

// ---------------------------------------------------------------------------
// Replacement agent builder
// ---------------------------------------------------------------------------

/**
 * IReplacementAgentBuilder — constructs replacement agent configurations
 * with violation context injected as positive-only guidance.
 *
 * The builder transforms violation data into constructive framing:
 * - Violation trails become non-negotiable architectural constraints
 * - Failed approaches become specific positive guidance for the correct approach
 * - Existing trails are re-ranked to emphasize correct patterns
 *
 * Spec Section 9.2, Step 5 — Replacement Deployment with Positive-Only Briefing
 * Spec Section 6.3 — Violation trails with non-negotiable framing
 */
export interface IReplacementAgentBuilder {
  /**
   * Build a replacement configuration from the firing result.
   * Transforms violation data into positive-only guidance with
   * non-negotiable framing for the replacement agent's golden window.
   */
  buildReplacementConfig(
    firingResult: Omit<IFiringResult, "replacementConfig">,
    existingTrails: readonly string[],
  ): IReplacementConfig;

  /**
   * Generate the positive-only briefing from a violation record.
   * Transforms "agent did X wrong" into "the correct approach is Y"
   * without mentioning the previous agent or wrong approach.
   *
   * Spec Section 9.2, Step 5 — "phrased entirely as what TO do,
   * never what NOT to do."
   */
  generatePositiveBriefing(
    violationRecord: IViolationRecord,
    capturedState: IDepartingAgentState,
  ): string;

  /**
   * Frame violation data as non-negotiable trails.
   * Each trail becomes an architectural constraint statement.
   *
   * Spec Section 6.3 — "non-negotiable framing: 'X is required — this
   * is an architectural constraint, not a recommendation.'"
   */
  frameAsNonNegotiable(
    violationRecord: IViolationRecord,
  ): readonly string[];

  /**
   * Re-rank existing trails with extra weight on patterns that would
   * have prevented the violation.
   *
   * Spec Section 9.2, Step 5 — "Top trails re-ranked with extra weight
   * on correct patterns."
   */
  rerankTrails(
    existingTrails: readonly string[],
    violationRecord: IViolationRecord,
  ): readonly string[];
}

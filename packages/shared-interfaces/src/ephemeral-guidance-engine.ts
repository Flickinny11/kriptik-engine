/**
 * Ephemeral Decision-Time Guidance Engine interfaces.
 *
 * Extends the Step 14 ephemeral guidance classifier with:
 *   - Learning from build outcomes (discovering new rules from accumulated trails)
 *   - Decision-time context analysis (which guidance matters most right now)
 *   - Effectiveness tracking (which rules agents follow vs. ignore)
 *   - Operating context evolution (spec Section 6.5 self-modifying instructions)
 *
 * Spec Section 7.3, Layer 3 — "The classifier starts with hand-coded rules
 * derived from the anti-slop config. Through the continuous learning pipeline,
 * it learns new patterns."
 *
 * Spec Section 6.5 — "Self-Modifying Operating Instructions: the baked-in
 * operating context evolves based on measured outcomes."
 */

import type { IEphemeralGuidance, IEphemeralGuidanceRule } from "./enforcement.js";

// ---------------------------------------------------------------------------
// Guidance Effectiveness Tracking
// ---------------------------------------------------------------------------

/**
 * Whether an agent complied with an injected guidance nudge.
 *
 * Spec Section 7.3, Layer 3 — the classifier learns from compliance patterns
 * to refine which rules are worth injecting.
 */
export type GuidanceComplianceOutcome =
  | "complied"       // Agent changed behavior after nudge
  | "ignored"        // Agent continued with the pattern despite nudge
  | "partial"        // Agent changed behavior but not fully (e.g., used component but not tokens)
  | "unknown";       // Could not determine compliance (e.g., agent was rotated)

/**
 * A single effectiveness observation for a guidance rule.
 *
 * Captured after each nudge injection by comparing the agent's subsequent
 * output against the nudge's suggestion.
 *
 * Spec Section 7.3, Layer 3 — continuous learning pipeline.
 */
export interface IGuidanceEffectivenessObservation {
  /** The rule that produced the nudge. */
  readonly ruleId: string;
  /** The build in which this observation occurred. */
  readonly buildId: string;
  /** The agent that received the nudge. */
  readonly agentId: string;
  /** Whether the agent complied with the nudge. */
  readonly outcome: GuidanceComplianceOutcome;
  /** The file being generated when the nudge was injected. */
  readonly filePath: string;
  /** When the observation was recorded. */
  readonly observedAt: Date;
}

/**
 * Aggregate effectiveness metrics for a single guidance rule.
 *
 * Spec Section 7.3, Layer 3 — "Through the continuous learning pipeline,
 * it learns new patterns."
 */
export interface IGuidanceRuleMetrics {
  /** The rule ID. */
  readonly ruleId: string;
  /** Total number of times this rule was triggered. */
  readonly totalTriggers: number;
  /** Number of times agents complied. */
  readonly compliedCount: number;
  /** Number of times agents ignored the nudge. */
  readonly ignoredCount: number;
  /** Number of partial compliance observations. */
  readonly partialCount: number;
  /** Compliance rate (complied / (complied + ignored + partial)). */
  readonly complianceRate: number;
  /**
   * Impact score (0-1). High compliance + rule triggers on real regressions =
   * high impact. Low compliance or rule triggers on false positives = low impact.
   */
  readonly impactScore: number;
  /** When this rule was last triggered. */
  readonly lastTriggeredAt: Date | null;
  /** Number of builds in which this rule has been active. */
  readonly buildsActive: number;
}

/**
 * IGuidanceEffectivenessTracker — tracks which guidance rules agents follow
 * vs. ignore, enabling data-driven refinement of the guidance set.
 *
 * The tracker feeds two downstream systems:
 * 1. The Ephemeral Guidance Engine — for rule priority adjustment and retirement
 * 2. The Operating Context Evolver — for instruction compliance tracking
 *
 * Spec Section 7.3, Layer 3 — continuous learning pipeline.
 * Spec Section 6.5 — compliance tracking for self-modifying instructions.
 */
export interface IGuidanceEffectivenessTracker {
  /**
   * Record an effectiveness observation after a nudge injection.
   *
   * @param observation - The compliance outcome for this nudge.
   */
  recordObservation(observation: IGuidanceEffectivenessObservation): void;

  /**
   * Get aggregate metrics for a specific rule.
   * Returns null if the rule has never been triggered.
   */
  getRuleMetrics(ruleId: string): IGuidanceRuleMetrics | null;

  /**
   * Get metrics for all tracked rules, sorted by impact score (descending).
   */
  getAllMetrics(): readonly IGuidanceRuleMetrics[];

  /**
   * Get rules that should be retired due to low effectiveness.
   *
   * A rule is a retirement candidate when:
   * - It has been triggered 10+ times (sufficient sample)
   * - Its compliance rate is below the threshold (default 0.20)
   * - Its impact score is below 0.15
   *
   * @param minTriggers - Minimum triggers before considering retirement (default 10).
   * @param maxComplianceRate - Max compliance rate for retirement (default 0.20).
   */
  getRetirementCandidates(
    minTriggers?: number,
    maxComplianceRate?: number,
  ): readonly IGuidanceRuleMetrics[];

  /**
   * Get rules with high effectiveness that should have priority boosted.
   *
   * A rule is a boost candidate when:
   * - It has been triggered 5+ times (sufficient sample)
   * - Its compliance rate is above 0.70
   * - Its impact score is above 0.60
   */
  getBoostCandidates(): readonly IGuidanceRuleMetrics[];
}

// ---------------------------------------------------------------------------
// Decision-Time Context Analysis
// ---------------------------------------------------------------------------

/**
 * The current context of an agent's work, used to determine which
 * guidance is most relevant at this exact moment.
 *
 * Spec Section 7.3, Layer 3 — guidance is "decision-time": injected
 * based on what the agent is currently doing, not generically.
 */
export interface IDecisionTimeContext {
  /** The agent's current goal description. */
  readonly goalDescription: string;
  /** The file currently being generated or modified. */
  readonly currentFilePath: string;
  /** The task type classification for this goal. */
  readonly taskType: string;
  /** The tech stack in use (frameworks, libraries). */
  readonly techStack: readonly string[];
  /** Recent agent output (last N tokens/lines). */
  readonly recentOutput: string;
  /** The agent's role (builder, architect, etc.). */
  readonly agentRole: string;
  /** The build's domain classification, if available. */
  readonly domain: string | null;
  /** How far through the agent's goal (0-1 estimate). */
  readonly goalProgress: number;
}

/**
 * A guidance recommendation scored for relevance to the current context.
 *
 * Spec Section 7.3, Layer 3 — the classifier injects reminders
 * when generic patterns are detected, but relevance scoring ensures
 * the most applicable nudges take priority.
 */
export interface IScoredGuidance {
  /** The original guidance nudge. */
  readonly guidance: IEphemeralGuidance;
  /** Relevance score for the current context (0-1). */
  readonly relevanceScore: number;
  /** Why this guidance was considered relevant. */
  readonly relevanceReason: string;
  /** Whether this is a proactive injection (no trigger match, but context suggests it). */
  readonly isProactive: boolean;
}

/**
 * IDecisionTimeContextAnalyzer — analyzes the current agent state and
 * upcoming work to determine which guidance is most relevant right now.
 *
 * Goes beyond pattern matching: even when no regression pattern is detected
 * in the output, the analyzer can proactively suggest guidance based on
 * context signals (e.g., "billing page → inject Card component reminder
 * proactively because agents regress 73% of the time on billing pages").
 *
 * Spec Section 7.3, Layer 3 — "When agents implement billing pages,
 * they regress to flat card patterns 73% of the time — inject Card
 * component reminder proactively."
 */
export interface IDecisionTimeContextAnalyzer {
  /**
   * Analyze the current context and return scored guidance recommendations.
   *
   * Combines:
   * 1. Pattern-matched nudges from the classifier (reactive)
   * 2. Context-aware proactive nudges from learned patterns (proactive)
   * 3. Relevance scoring based on task type, file type, and domain
   *
   * @param context - The agent's current decision-time context.
   * @param classifierNudges - Nudges already produced by the classifier.
   * @returns Scored guidance sorted by relevance (highest first).
   */
  analyze(
    context: IDecisionTimeContext,
    classifierNudges: readonly IEphemeralGuidance[],
  ): readonly IScoredGuidance[];

  /**
   * Register a proactive guidance pattern learned from build outcomes.
   *
   * Proactive patterns fire based on context (task type, file type, domain)
   * rather than output text matching. They represent the "learning" in
   * "the classifier learns new patterns."
   *
   * @param pattern - The proactive pattern to register.
   */
  registerProactivePattern(pattern: IProactiveGuidancePattern): void;

  /**
   * Get all registered proactive patterns.
   */
  getProactivePatterns(): readonly IProactiveGuidancePattern[];
}

/**
 * A proactive guidance pattern — fires based on context, not output text.
 *
 * These are discovered through the continuous learning pipeline. Example:
 * "When agents implement billing pages, they regress to flat card patterns
 * 73% of the time."
 *
 * Spec Section 7.3, Layer 3 — continuous learning pipeline.
 */
export interface IProactiveGuidancePattern {
  /** Unique pattern identifier. */
  readonly id: string;
  /** Human-readable description. */
  readonly description: string;
  /** Task types that trigger this pattern (empty = all task types). */
  readonly taskTypes: readonly string[];
  /** File path patterns that trigger this pattern (glob-style, empty = all files). */
  readonly filePatterns: readonly string[];
  /** Domains that trigger this pattern (empty = all domains). */
  readonly domains: readonly string[];
  /** The guidance nudge to inject proactively. */
  readonly nudge: IEphemeralGuidance;
  /** Observed regression rate that justified creating this pattern (0-1). */
  readonly regressionRate: number;
  /** Number of builds that contributed evidence for this pattern. */
  readonly evidenceCount: number;
  /** When this pattern was discovered. */
  readonly discoveredAt: Date;
}

// ---------------------------------------------------------------------------
// Operating Context Evolution (Spec Section 6.5)
// ---------------------------------------------------------------------------

/**
 * A single operating instruction from the baked-in context.
 *
 * Spec Section 6.5 — "The baked-in operating context starts with the
 * hand-crafted 250-word template."
 * Spec Section 6.1 Layer 1 — "The baked-in operating context."
 */
export interface IOperatingInstruction {
  /** Unique instruction identifier. */
  readonly id: string;
  /** The instruction text. */
  readonly text: string;
  /** Category for grouping (e.g., "code-quality", "design-system", "security"). */
  readonly category: string;
  /** Whether this instruction has been revised from its original form. */
  readonly isRevised: boolean;
  /** The original text before revision (null if never revised). */
  readonly originalText: string | null;
  /** Revision number (0 = original, 1+ = revised). */
  readonly revision: number;
  /** When this instruction was last revised. */
  readonly lastRevisedAt: Date | null;
}

/**
 * Compliance data for a single operating instruction.
 *
 * Spec Section 6.5 — "After 100 builds, the system has data on which
 * instructions agents actually follow vs. ignore."
 */
export interface IInstructionCompliance {
  /** The instruction ID. */
  readonly instructionId: string;
  /** Total times this instruction was applicable. */
  readonly totalApplicable: number;
  /** Times agents followed this instruction. */
  readonly followedCount: number;
  /** Times agents violated this instruction. */
  readonly violatedCount: number;
  /** Compliance rate (followed / totalApplicable). */
  readonly complianceRate: number;
  /**
   * Impact when violated — average evaluator score difference between
   * builds where this was followed vs. violated.
   *
   * Positive = following the instruction improves quality.
   * Near-zero = instruction has no measurable impact.
   * Negative = instruction may be counterproductive.
   */
  readonly impactWhenViolated: number;
}

/**
 * A proposed revision to an operating instruction.
 *
 * Spec Section 6.5 — "The system proposes revisions, which are evaluated
 * across 10 builds before being adopted."
 */
export interface IInstructionRevisionProposal {
  /** The instruction being revised. */
  readonly instructionId: string;
  /** The proposed new text. */
  readonly proposedText: string;
  /** Why this revision is proposed. */
  readonly reason: string;
  /** The revision type. */
  readonly type: InstructionRevisionType;
  /** How many evaluation builds remain before adoption decision. */
  readonly evaluationBuildsRemaining: number;
  /** Scores observed during evaluation builds. */
  readonly evaluationScores: readonly number[];
  /** Scores from the same period on non-evaluation builds (control group). */
  readonly controlScores: readonly number[];
  /** When the proposal was created. */
  readonly proposedAt: Date;
}

/**
 * Types of operating instruction revisions.
 *
 * Spec Section 6.5 — different revision strategies based on
 * compliance and impact data.
 */
export type InstructionRevisionType =
  | "removal"           // Low compliance + low impact → remove the instruction
  | "strengthening"     // Low compliance + high impact → stronger framing
  | "refinement"        // High compliance + medium impact → clarify or tighten
  | "addition";         // New instruction derived from learned patterns

/**
 * IOperatingContextEvolver — implements spec Section 6.5's self-modifying
 * operating instructions.
 *
 * The baked-in operating context evolves based on measured outcomes:
 * - Instructions with low compliance and low impact → removal candidates
 * - Instructions frequently violated with high impact → stronger framing
 * - New patterns discovered from trails → candidate additions
 *
 * Revisions are evaluated across 10 builds before adoption (A/B testing).
 *
 * Spec Section 6.5 — "Self-Modifying Operating Instructions."
 */
export interface IOperatingContextEvolver {
  /**
   * Initialize with the hand-crafted operating instructions.
   *
   * @param instructions - The initial 250-word baked-in context, parsed
   *   into individual instructions.
   */
  initialize(instructions: readonly IOperatingInstruction[]): void;

  /**
   * Record compliance data for an instruction from a completed build.
   *
   * @param instructionId - Which instruction was applicable.
   * @param followed - Whether the agent followed it.
   * @param evaluatorScore - The build's evaluator score.
   */
  recordCompliance(
    instructionId: string,
    followed: boolean,
    evaluatorScore: number,
  ): void;

  /**
   * Analyze compliance data and generate revision proposals.
   *
   * Called periodically (e.g., every 50 builds) to identify instructions
   * that should be revised based on accumulated compliance data.
   *
   * @param minBuilds - Minimum builds of data before proposing revisions
   *   (default 100, per spec Section 6.5).
   * @returns Proposed revisions for low-performing instructions.
   */
  proposeRevisions(
    minBuilds?: number,
  ): readonly IInstructionRevisionProposal[];

  /**
   * Record an evaluation build result for an active revision proposal.
   *
   * @param instructionId - The instruction being evaluated.
   * @param evaluatorScore - The build's evaluator score.
   * @param usedRevision - Whether the revised text was used in this build.
   */
  recordEvaluationBuild(
    instructionId: string,
    evaluatorScore: number,
    usedRevision: boolean,
  ): void;

  /**
   * Check evaluation results and adopt or reject pending proposals.
   *
   * A proposal is adopted when:
   * - 10 evaluation builds have completed
   * - Average evaluation scores >= average control scores
   *
   * @returns IDs of instructions whose revisions were adopted.
   */
  finalizeEvaluations(): readonly string[];

  /**
   * Get the current set of operating instructions (including any adopted
   * revisions).
   */
  getInstructions(): readonly IOperatingInstruction[];

  /**
   * Get compliance data for all instructions.
   */
  getComplianceData(): readonly IInstructionCompliance[];

  /**
   * Get active revision proposals being evaluated.
   */
  getActiveProposals(): readonly IInstructionRevisionProposal[];
}

// ---------------------------------------------------------------------------
// Ephemeral Guidance Engine (orchestration layer)
// ---------------------------------------------------------------------------

/**
 * A learned guidance rule — discovered from build outcomes rather than
 * hand-coded.
 *
 * Spec Section 7.3, Layer 3 — "Through the continuous learning pipeline,
 * it learns new patterns: 'When agents implement billing pages, they
 * regress to flat card patterns 73% of the time.'"
 */
export interface ILearnedGuidanceRule extends IEphemeralGuidanceRule {
  /** How this rule was discovered. */
  readonly source: LearnedRuleSource;
  /** The task types where this regression was observed. */
  readonly sourceTaskTypes: readonly string[];
  /** The regression rate that triggered rule creation (0-1). */
  readonly observedRegressionRate: number;
  /** Number of builds that contributed evidence. */
  readonly evidenceCount: number;
  /** When the rule was learned. */
  readonly learnedAt: Date;
}

/**
 * How a learned guidance rule was discovered.
 *
 * Spec Section 7.3, Layer 3 — continuous learning pipeline.
 */
export type LearnedRuleSource =
  | "trail-analysis"      // Discovered from dead-end or violation trail patterns
  | "effectiveness-data"  // Derived from effectiveness tracker's compliance data
  | "anti-pattern"        // Converted from an anti-pattern alert
  | "cross-build";        // Discovered from cross-build pattern analysis

/**
 * Result of the guidance learning pipeline.
 */
export interface IGuidanceLearningResult {
  /** New rules discovered in this learning run. */
  readonly newRules: readonly ILearnedGuidanceRule[];
  /** Existing rules whose priority was adjusted. */
  readonly adjustedRuleIds: readonly string[];
  /** Rules retired due to low effectiveness. */
  readonly retiredRuleIds: readonly string[];
  /** Total rules analyzed. */
  readonly rulesAnalyzed: number;
  /** Total trail records consulted. */
  readonly trailsConsulted: number;
}

/**
 * Dependencies injected into the Ephemeral Guidance Engine.
 *
 * Follows the dependency injection pattern used by other Phase D/E
 * components (DomainKnowledgeCuratorDeps, AntiPatternInferencerDeps).
 */
export interface IEphemeralGuidanceEngineDeps {
  /** Query trail entries for learning. */
  readonly queryTrails: (params: import("./knowledge.js").ITrailQuery) => Promise<readonly import("./knowledge.js").ITrailEntry[]>;
  /** Query anti-patterns for rule derivation. */
  readonly queryAntiPatterns: (params: import("./anti-patterns.js").IAntiPatternQuery) => readonly import("./anti-patterns.js").IAntiPattern[];
  /** Get effectiveness tracker for compliance data. */
  readonly effectivenessTracker: IGuidanceEffectivenessTracker;
  /** Get the decision-time context analyzer. */
  readonly contextAnalyzer: IDecisionTimeContextAnalyzer;
}

/**
 * IEphemeralGuidanceEngine — extends the Step 14 classifier with learning,
 * effectiveness tracking, and context-aware guidance injection.
 *
 * This is the Phase E evolution of the ephemeral guidance system:
 * - Step 14 provided the static classifier (hand-coded + Design Pioneer rules)
 * - Step 22 adds the learning pipeline that discovers new rules from data
 *
 * The engine orchestrates:
 * 1. The existing classifier (pattern matching on output)
 * 2. The effectiveness tracker (which rules work)
 * 3. The context analyzer (which rules matter right now)
 * 4. The learning pipeline (discovering new rules from trails)
 *
 * Spec Section 7.3, Layer 3 — "Ephemeral nudges: Catches drift in real-time."
 * Spec Section 6.5 — "Self-Modifying Operating Instructions."
 */
export interface IEphemeralGuidanceEngine {
  /**
   * Process agent output and return context-scored guidance.
   *
   * Unlike the Step 14 classifier's raw `classify()`, this method:
   * 1. Runs the classifier to get pattern-matched nudges
   * 2. Adds proactive nudges from learned patterns
   * 3. Scores all nudges for relevance to the current context
   * 4. Records trigger events for effectiveness tracking
   *
   * @param context - The agent's current decision-time context.
   * @returns Scored guidance sorted by relevance (highest first).
   */
  processOutput(context: IDecisionTimeContext): readonly IScoredGuidance[];

  /**
   * Record the outcome of a previously injected nudge.
   *
   * Called after the agent produces subsequent output, allowing the
   * tracker to determine whether the agent complied with the nudge.
   *
   * @param observation - The compliance observation.
   */
  recordNudgeOutcome(observation: IGuidanceEffectivenessObservation): void;

  /**
   * Run the learning pipeline to discover new rules from accumulated data.
   *
   * Analyzes:
   * - Trail patterns (which task types have recurring regressions)
   * - Anti-patterns (which can be converted to proactive nudges)
   * - Effectiveness data (which rules to boost, adjust, or retire)
   *
   * @returns Learning results including new, adjusted, and retired rules.
   */
  learnFromOutcomes(): Promise<IGuidanceLearningResult>;

  /**
   * Get the current rule set (hand-coded + learned).
   */
  getRules(): readonly IEphemeralGuidanceRule[];

  /**
   * Get metrics for all tracked rules.
   */
  getMetrics(): readonly IGuidanceRuleMetrics[];

  /**
   * Get all proactive patterns discovered through learning.
   */
  getProactivePatterns(): readonly IProactiveGuidancePattern[];
}

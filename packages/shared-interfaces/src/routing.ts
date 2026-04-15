/**
 * Model tier routing interfaces — the system that routes goals to
 * Opus 4.6 or Sonnet 4.6 based on trail coverage density, task
 * complexity, and accumulated knowledge.
 *
 * The routing decision isn't just "how complex is the task?" but
 * "how complex is the task GIVEN the trail coverage available?"
 *
 * Spec Section 6.7 — Model Tier Optimization via Routing
 * Spec Section 3.4 — Model Tier Determined by Routing, Not Pairing
 * Spec Section 1.4 — Two-tier model system (Opus 4.6 / Sonnet 4.6)
 */

import type { ModelTier } from "./agents.js";
import type { IDriftSignal } from "./drift.js";
import type { TrailOutcome } from "./knowledge.js";

// ---------------------------------------------------------------------------
// Routing phases (build-count-driven trajectory)
// ---------------------------------------------------------------------------

/**
 * The four routing phases as the knowledge base matures.
 *
 * Spec Section 6.7:
 * - Phase 1 (builds 1-100): Most goals -> Opus. Trail library sparse. Cost high.
 * - Phase 2 (100-500): Well-understood types -> Sonnet + trails. Cost drops 40-60%.
 * - Phase 3 (500-2000): Most common types -> Sonnet. Opus for novel work.
 * - Phase 4 (2000+): Knowledge base is the primary asset. Models provide speed.
 */
export type RoutingPhase = 1 | 2 | 3 | 4;

// ---------------------------------------------------------------------------
// Coverage density
// ---------------------------------------------------------------------------

/**
 * ICoverageDensity — per-task-type coverage metrics from trails + playbooks.
 *
 * Combines trail count, playbook quality, and success rate into a composite
 * density score that drives the Opus vs. Sonnet routing decision.
 *
 * Spec Section 6.7 — "as trail coverage density increases for task categories,
 * route those categories to Sonnet 4.6 with rich trail injection."
 * Spec Section 3.4 — "Model Tier Determined by Routing, Not Pairing."
 */
export interface ICoverageDensity {
  /** The task type this coverage is for. */
  readonly taskType: string;

  /** Number of trails in the store for this task type. */
  readonly trailCount: number;

  /** Number of active playbooks for this task type. */
  readonly playbookCount: number;

  /**
   * Best success rate among active playbooks for this task type (0-1).
   * Null if no playbooks exist.
   */
  readonly bestPlaybookSuccessRate: number | null;

  /**
   * Average trail outcome quality for this task type (0-1).
   * Derived from evaluator scores and outcome classification.
   */
  readonly averageTrailQuality: number;

  /**
   * Composite coverage density score (0-1).
   *
   * Combines trail count, playbook quality, and success rate into a single
   * number. Higher density means more knowledge is available for this task type.
   *
   * 0.0 = no coverage (always Opus)
   * 0.3 = sparse coverage (likely Opus)
   * 0.6 = moderate coverage (may route to Sonnet in Phase 2+)
   * 0.8 = rich coverage (likely Sonnet with trails in Phase 2+)
   * 1.0 = saturated coverage (Sonnet with rich trails)
   */
  readonly compositeDensity: number;

  /**
   * Whether this task type has "rich" trail coverage — sufficient to
   * compensate for Sonnet's reduced reasoning depth.
   *
   * Spec Section 3.4 — "Used when the routing layer determines that
   * trail density is sufficient to compensate for reduced reasoning depth."
   */
  readonly hasRichCoverage: boolean;
}

// ---------------------------------------------------------------------------
// Task complexity assessment
// ---------------------------------------------------------------------------

/**
 * Task complexity level used as input to routing decisions.
 *
 * Spec Section 3.4 — routing considers "task complexity and trail
 * coverage density."
 */
export type TaskComplexity = "low" | "medium" | "high" | "novel";

/**
 * ITaskComplexitySignals — signals that inform task complexity assessment.
 *
 * The routing engine uses these to estimate how complex a goal is,
 * independent of trail coverage.
 */
export interface ITaskComplexitySignals {
  /** Number of dependencies the goal requires. */
  readonly dependencyCount: number;
  /** Number of interface contracts involved. */
  readonly interfaceContractCount: number;
  /** Number of goals that depend on this goal's output. */
  readonly downstreamDependentCount: number;
  /** Whether the goal involves external API integration. */
  readonly hasExternalAPIs: boolean;
  /** Whether the goal involves auth/security patterns. */
  readonly hasSecurityPatterns: boolean;
  /** Whether this is a first-time task type (no prior builds). */
  readonly isNovelTaskType: boolean;
}

// ---------------------------------------------------------------------------
// Routing decision
// ---------------------------------------------------------------------------

/**
 * IRoutingDecision — the output of the routing engine: which model tier
 * to assign to a goal, with reasoning and confidence.
 *
 * Spec Section 6.7 — "Routing decision: Sonnet 4.6 + rich trails
 * (91% quality at 75% cost savings)."
 * Spec Section 3.4 — "The routing layer assigns entire goals to
 * appropriate model tiers."
 */
export interface IRoutingDecision {
  /** The goal this routing decision is for. */
  readonly goalId: string;

  /** The task type classification. */
  readonly taskType: string;

  /** The assigned model tier. */
  readonly assignedTier: ModelTier;

  /** Coverage density assessment that informed this decision. */
  readonly coverage: ICoverageDensity;

  /** Assessed task complexity. */
  readonly complexity: TaskComplexity;

  /** Current routing phase based on total build count. */
  readonly routingPhase: RoutingPhase;

  /**
   * Confidence in this routing decision (0-1).
   * Lower confidence means the routing engine is less sure this is the
   * right tier — the escalation monitor should watch more closely.
   */
  readonly confidence: number;

  /** Human-readable reasoning for the routing decision. */
  readonly reasoning: string;

  /**
   * Whether mid-task escalation is permitted.
   * Only applies when assignedTier is Sonnet — allows escalation to
   * Opus if uncertainty signals spike during execution.
   *
   * Spec Section 3.4 — "Dynamic reassessment: If a Sonnet 4.6 agent
   * encounters unexpected complexity (uncertainty signals spike), the
   * monitoring system detects this and the routing layer escalates to Opus 4.6."
   */
  readonly allowEscalation: boolean;

  /** When this decision was made. */
  readonly decidedAt: Date;
}

// ---------------------------------------------------------------------------
// Escalation
// ---------------------------------------------------------------------------

/**
 * IEscalationTrigger — why an escalation from Sonnet to Opus was triggered.
 *
 * Spec Section 3.4 — "If a Sonnet 4.6 agent encounters unexpected
 * complexity (uncertainty signals spike), the monitoring system detects
 * this and the routing layer escalates to Opus 4.6."
 */
export interface IEscalationTrigger {
  /** The agent being escalated. */
  readonly agentId: string;
  /** The goal the agent was working on. */
  readonly goalId: string;
  /** The original routing decision that assigned Sonnet. */
  readonly originalDecision: IRoutingDecision;

  /**
   * The drift/confidence signals that triggered escalation.
   * Escalation is triggered by uncertainty signal spikes, not by
   * task completion failure.
   */
  readonly triggeringSignals: readonly IDriftSignal[];

  /** Human-readable reason for escalation. */
  readonly reason: string;

  /** Recommended action. */
  readonly action: EscalationAction;

  /** When the escalation was triggered. */
  readonly triggeredAt: Date;
}

/**
 * Actions the escalation monitor can recommend.
 *
 * Spec Section 5.3 — "may indicate task is more complex than routed —
 * consider model tier escalation to Opus 4.6."
 */
export type EscalationAction =
  | "escalate-to-opus"       // Rotate agent, relaunch as Opus 4.6
  | "continue-monitoring"    // Signals elevated but not yet conclusive
  | "no-action";             // Agent is healthy, no escalation needed

// ---------------------------------------------------------------------------
// Routing metrics
// ---------------------------------------------------------------------------

/**
 * IRoutingOutcome — the outcome of a routing decision, recorded after
 * the goal completes.
 *
 * Used to track whether the routing engine's decisions correlate with
 * quality outcomes — enabling self-optimization over time.
 */
export interface IRoutingOutcome {
  /** The goal ID this outcome is for. */
  readonly goalId: string;
  /** The original routing decision. */
  readonly decision: IRoutingDecision;
  /** Whether the goal was completed successfully. */
  readonly trailOutcome: TrailOutcome;
  /** Evaluator score for the completed goal (0-1). */
  readonly evaluatorScore: number | null;
  /** Whether escalation was triggered during execution. */
  readonly wasEscalated: boolean;
  /** When the outcome was recorded. */
  readonly recordedAt: Date;
}

/**
 * IRoutingMetricsSummary — aggregate metrics on routing decisions and
 * their outcomes.
 *
 * Enables the system to track cost savings, quality correlation, and
 * escalation rates — confirming the routing trajectory from Spec Section 6.7.
 */
export interface IRoutingMetricsSummary {
  /** Total routing decisions made. */
  readonly totalDecisions: number;
  /** Decisions routed to Opus. */
  readonly opusDecisions: number;
  /** Decisions routed to Sonnet. */
  readonly sonnetDecisions: number;
  /** Number of escalations triggered. */
  readonly escalationCount: number;

  /** Current routing phase. */
  readonly currentPhase: RoutingPhase;
  /** Total completed builds (determines routing phase). */
  readonly totalBuilds: number;

  /**
   * Average quality (evaluator score) for Opus-routed goals.
   * Null if no outcomes recorded yet.
   */
  readonly averageOpusQuality: number | null;

  /**
   * Average quality (evaluator score) for Sonnet-routed goals.
   * Null if no outcomes recorded yet.
   */
  readonly averageSonnetQuality: number | null;

  /**
   * Sonnet routing rate (0-1): ratio of goals routed to Sonnet.
   * Should increase as knowledge base matures per Spec Section 6.7.
   */
  readonly sonnetRoutingRate: number;

  /**
   * Estimated cost savings ratio (0-1) compared to routing everything
   * to Opus. Based on model cost differentials.
   */
  readonly estimatedCostSavings: number;
}

// ---------------------------------------------------------------------------
// Coverage density calculator
// ---------------------------------------------------------------------------

/**
 * ICoverageDensityCalculator — computes per-task-type coverage density
 * from the trail store and playbook store.
 *
 * This is the data layer for routing decisions: it reads from the
 * knowledge base and produces the coverage metrics that the routing
 * engine uses to decide Opus vs. Sonnet.
 *
 * Spec Section 6.7 — "as trail coverage density increases for task
 * categories, route those categories to Sonnet 4.6."
 */
export interface ICoverageDensityCalculator {
  /**
   * Compute coverage density for a specific task type.
   * Queries trail store and playbook store for coverage data.
   */
  computeCoverage(taskType: string): Promise<ICoverageDensity>;

  /**
   * Compute coverage density for all known task types.
   * Returns a map from task type to coverage density.
   */
  computeFullCoverageMap(): Promise<ReadonlyMap<string, ICoverageDensity>>;

  /**
   * Check if a task type has sufficient coverage for Sonnet routing.
   * Shorthand for computeCoverage + checking hasRichCoverage.
   */
  hasRichCoverage(taskType: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Routing decision engine
// ---------------------------------------------------------------------------

/**
 * IRoutingDecisionEngine — makes Opus/Sonnet routing decisions based on
 * coverage density, task complexity, and the current routing phase.
 *
 * The engine is stateless per-decision: it reads coverage from the
 * calculator and build count from metrics, then applies the routing
 * rules from the spec.
 *
 * Spec Section 6.7 — routing trajectory across four phases.
 * Spec Section 3.4 — "The routing layer assigns entire goals to
 * appropriate model tiers."
 */
export interface IRoutingDecisionEngine {
  /**
   * Route a goal to a model tier.
   *
   * @param goalId — the goal to route
   * @param taskType — task type classification
   * @param complexitySignals — signals that inform complexity assessment
   */
  route(
    goalId: string,
    taskType: string,
    complexitySignals: ITaskComplexitySignals,
  ): Promise<IRoutingDecision>;

  /**
   * Get the current routing phase based on total build count.
   * Phase boundaries from Spec Section 6.7:
   * - Phase 1: builds 1-100
   * - Phase 2: builds 101-500
   * - Phase 3: builds 501-2000
   * - Phase 4: builds 2001+
   */
  getCurrentPhase(): RoutingPhase;
}

// ---------------------------------------------------------------------------
// Escalation monitor
// ---------------------------------------------------------------------------

/**
 * IEscalationMonitor — monitors Sonnet-routed agents for mid-task
 * escalation needs.
 *
 * Watches drift signals and confidence calibration for Sonnet agents.
 * When uncertainty signals spike beyond the escalation threshold,
 * triggers an escalation recommendation.
 *
 * Spec Section 3.4 — "Dynamic reassessment: If a Sonnet 4.6 agent
 * encounters unexpected complexity (uncertainty signals spike), the
 * monitoring system detects this and the routing layer escalates to Opus 4.6."
 *
 * Spec Section 5.3 — "may indicate task is more complex than routed —
 * consider model tier escalation to Opus 4.6."
 */
export interface IEscalationMonitor {
  /**
   * Register a Sonnet-routed agent for escalation monitoring.
   * Only called for agents with allowEscalation = true.
   */
  monitorAgent(agentId: string, decision: IRoutingDecision): void;

  /**
   * Process drift signals for a monitored agent.
   * Returns an escalation trigger if signals warrant escalation,
   * null otherwise.
   */
  processSignals(
    agentId: string,
    signals: readonly IDriftSignal[],
  ): IEscalationTrigger | null;

  /**
   * Get the current escalation status for an agent.
   * Returns the most recent trigger if one exists, null if healthy.
   */
  getStatus(agentId: string): IEscalationTrigger | null;

  /** Stop monitoring an agent (session ended or escalated). */
  unmonitorAgent(agentId: string): void;
}

// ---------------------------------------------------------------------------
// Routing metrics tracker
// ---------------------------------------------------------------------------

/**
 * IRoutingMetricsTracker — tracks routing decisions and outcomes for
 * optimization and phase progression.
 *
 * Provides the build count that determines routing phase and the
 * decision/outcome data that validates routing quality.
 *
 * Spec Section 6.7 — the routing trajectory depends on build count
 * and quality correlation data.
 */
export interface IRoutingMetricsTracker {
  /** Record a routing decision when a goal is assigned. */
  recordDecision(decision: IRoutingDecision): void;

  /** Record the outcome when a routed goal completes. */
  recordOutcome(outcome: IRoutingOutcome): void;

  /** Record an escalation event. */
  recordEscalation(trigger: IEscalationTrigger): void;

  /** Increment the total build count (called when a build completes). */
  recordBuildComplete(): void;

  /** Get the current total build count. */
  getTotalBuilds(): number;

  /** Get aggregate routing metrics. */
  getMetrics(): IRoutingMetricsSummary;

  /**
   * Get per-task-type routing statistics.
   * Returns routing counts and quality metrics grouped by task type.
   */
  getTaskTypeStats(): ReadonlyMap<string, ITaskTypeRoutingStats>;
}

/**
 * ITaskTypeRoutingStats — routing statistics for a specific task type.
 */
export interface ITaskTypeRoutingStats {
  /** The task type. */
  readonly taskType: string;
  /** How many times this task type was routed to Opus. */
  readonly opusCount: number;
  /** How many times this task type was routed to Sonnet. */
  readonly sonnetCount: number;
  /** Average evaluator score when routed to Opus. */
  readonly averageOpusScore: number | null;
  /** Average evaluator score when routed to Sonnet. */
  readonly averageSonnetScore: number | null;
  /** Number of escalations for this task type. */
  readonly escalationCount: number;
}

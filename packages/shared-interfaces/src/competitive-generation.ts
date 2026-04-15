/**
 * Competitive Generation interfaces — parallel competing implementations
 * of critical-path goals with tournament-style selection.
 *
 * The Cortex forks 2-3 agents to explore competing implementations when a
 * goal meets fork criteria: critical path, high error consequence, conflicting
 * trail patterns, or high downstream dependency count. Each agent gets its own
 * branch, works autonomously, and the Evaluator runs the full verification
 * stack on each. Expert-first selection chooses the winner; losers are
 * preserved as alternative trail entries.
 *
 * Spec Section 3.5 — Competitive Generation for Critical Paths
 * Spec Section 3.2 — Cortex Orchestrator initiates competitive generation
 * Spec Section 3.2 — Evaluator participates in competitive evaluations
 * Spec Section 4.2 — Repository branching (build-{id}/compete/*)
 * Spec Section 6.3 — Alternative trails from losing implementations
 */

import type { IGoalAssignment, ModelTier, IAgentSession } from "./agents.js";
import type { IMergeGateResult } from "./verification.js";
import type { ITrailEntry } from "./knowledge.js";

// ---------------------------------------------------------------------------
// Fork decision
// ---------------------------------------------------------------------------

/**
 * Criteria that can trigger competitive generation.
 * Spec Section 3.5 — "Fork criteria: critical path, high error consequence,
 * conflicting trail patterns, or high downstream dependency."
 */
export type ForkCriterion =
  | "critical-path"         // Goal is on the dependency graph's critical path
  | "high-error-consequence" // Failure would cascade to many downstream goals
  | "conflicting-trails"    // Trail library has multiple conflicting high-quality patterns
  | "high-downstream-deps"; // Many goals depend on this one's output

/**
 * Reasons a goal should NOT be forked, even if it has some fork signals.
 * Spec Section 3.5 — "Don't fork for: convergent trail patterns (>90% success),
 * leaf-level tasks, well-understood boilerplate, or cost-constrained builds."
 */
export type NoForkReason =
  | "convergent-trails"   // >90% success rate in trails — no ambiguity
  | "leaf-task"           // No downstream dependents
  | "boilerplate"         // Well-understood, low-risk implementation
  | "cost-constrained";   // Build budget doesn't allow competitive generation

/**
 * Assessment of whether a goal warrants competitive generation.
 * Produced by the CriticalPathIdentifier.
 */
export interface IForkAssessment {
  /** The goal being assessed. */
  readonly goalId: string;
  /** Whether competitive generation is recommended. */
  readonly shouldFork: boolean;
  /** Fork criteria that were triggered (empty if shouldFork is false). */
  readonly triggeredCriteria: readonly ForkCriterion[];
  /** Reasons not to fork (empty if shouldFork is true). */
  readonly suppressionReasons: readonly NoForkReason[];
  /** Composite fork urgency score (0-1). Higher = more reason to fork. */
  readonly forkScore: number;
  /** Recommended number of competitors (2 or 3). Only meaningful when shouldFork is true. */
  readonly recommendedCompetitorCount: 2 | 3;
}

/**
 * ICriticalPathIdentifier — determines which goals warrant the cost of
 * competitive generation based on downstream impact, novelty, and risk.
 *
 * Analyzes the dependency graph, trail coverage, and goal characteristics
 * to produce a fork assessment. The Cortex Orchestrator consults this
 * before launching agents for eligible goals.
 *
 * Spec Section 3.5 — fork criteria and suppression rules.
 * Spec Section 3.2 — "For critical-path goals with high downstream impact,
 * it may initiate competitive generation."
 */
export interface ICriticalPathIdentifier {
  /**
   * Assess whether a goal warrants competitive generation.
   *
   * @param goal - The goal to assess
   * @param criticalPath - Goal IDs on the dependency graph's critical path
   * @param dependentCount - Number of goals that directly or transitively depend on this goal
   * @param trailSuccessRate - Success rate (0-1) for this goal's task type in the trail library
   * @param conflictingTrailCount - Number of high-quality but conflicting trail patterns
   * @param isCostConstrained - Whether the build is operating under cost constraints
   */
  assess(
    goal: IGoalAssignment,
    criticalPath: readonly string[],
    dependentCount: number,
    trailSuccessRate: number,
    conflictingTrailCount: number,
    isCostConstrained: boolean,
  ): IForkAssessment;
}

// ---------------------------------------------------------------------------
// Competitor sessions
// ---------------------------------------------------------------------------

/** Status of a single competitor within a competitive generation session. */
export type CompetitorStatus =
  | "initializing"  // Branch created, agent being launched
  | "working"       // Agent is autonomously implementing
  | "submitted"     // Agent submitted work, awaiting evaluation
  | "evaluated"     // Evaluation complete, scores available
  | "selected"      // This competitor was chosen as the winner
  | "eliminated"    // This competitor was not selected (alternative trail created)
  | "failed";       // Agent failed (rotation limit, context exhaustion, etc.)

/**
 * Configuration for a single competitor in a competitive generation session.
 * Each competitor gets its own branch and agent session.
 *
 * Spec Section 3.5 — "Each agent gets its own branch from the current
 * integration point."
 * Spec Section 4.2 — branch naming: build-{id}/compete/{goal}-{letter}
 */
export interface ICompetitorConfig {
  /** Unique competitor identifier within this competition (e.g., "a", "b", "c"). */
  readonly competitorId: string;
  /** The goal assignment (identical for all competitors). */
  readonly goal: IGoalAssignment;
  /** Branch name for this competitor (e.g., "build-{id}/compete/auth-a"). */
  readonly branchName: string;
  /** Model tier for this competitor's agent. */
  readonly modelTier: ModelTier;
}

/**
 * Result produced by a single competitor after completing implementation.
 *
 * Spec Section 3.5 — "Each works autonomously in its own container with
 * identical assignment but different reasoning paths."
 */
export interface ICompetitorResult {
  /** Which competitor produced this result. */
  readonly competitorId: string;
  /** The agent session that did the work. */
  readonly agentId: string;
  /** Branch containing the implementation. */
  readonly branchName: string;
  /** Current status of this competitor. */
  readonly status: CompetitorStatus;
  /** Files created or modified by this competitor. */
  readonly filesModified: readonly string[];
  /** Commit SHAs produced on the competitor's branch. */
  readonly commitShas: readonly string[];
  /** When the competitor started working. */
  readonly startedAt: Date;
  /** When the competitor submitted (null if still working or failed). */
  readonly submittedAt: Date | null;
  /** Whether the competitor completed successfully (implementation finished). */
  readonly completedSuccessfully: boolean;
  /** If the competitor failed, the reason. */
  readonly failureReason: string | null;
}

// ---------------------------------------------------------------------------
// Evaluation and comparison
// ---------------------------------------------------------------------------

/**
 * Quality dimensions used to compare competing implementations.
 * Each dimension is scored 0-1.
 *
 * Spec Section 3.5 — "Expert-first selection chooses the winner based on
 * verification score, predicted maintainability, and trail alignment."
 */
export interface ICompetitorEvaluation {
  /** Which competitor this evaluation is for. */
  readonly competitorId: string;
  /** The agent that produced the implementation. */
  readonly agentId: string;

  /** Merge gate result from running the five-check gate. */
  readonly mergeGateResult: IMergeGateResult;

  /** Verification score from the Evaluator's six-layer pyramid (0-1). */
  readonly verificationScore: number;
  /** Predicted maintainability based on code quality metrics (0-1). */
  readonly maintainabilityScore: number;
  /** Trail alignment — how well this matches successful patterns (0-1). */
  readonly trailAlignmentScore: number;
  /** Code quality — structure, naming, separation of concerns (0-1). */
  readonly codeQualityScore: number;
  /** Performance characteristics — efficiency of the implementation (0-1). */
  readonly performanceScore: number;

  /** Weighted composite score used for final selection (0-1). */
  readonly compositeScore: number;

  /** Evaluator's textual assessment (from the Evaluator agent's analysis). */
  readonly evaluatorAssessment: string;
}

/**
 * IImplementationComparator — compares competing implementations across
 * multiple quality dimensions to produce scored evaluations.
 *
 * Uses the Evaluator agent's six-layer verification pyramid on each
 * implementation, plus additional heuristic scoring for maintainability,
 * trail alignment, and code quality.
 *
 * Spec Section 3.2 (Evaluator) — "when multiple agents produce competing
 * implementations, the Evaluator runs the full verification stack on each
 * and presents results to the Cortex for selection."
 * Spec Section 3.5 — scoring dimensions for selection.
 */
export interface IImplementationComparator {
  /**
   * Evaluate a single competitor's implementation.
   *
   * @param result - The competitor's result (branch, files, etc.)
   * @param goal - The goal being competed for
   * @param trailPatterns - Successful trail patterns for this task type (for alignment scoring)
   */
  evaluate(
    result: ICompetitorResult,
    goal: IGoalAssignment,
    trailPatterns: readonly ITrailEntry[],
  ): Promise<ICompetitorEvaluation>;

  /**
   * Compare multiple evaluations and return them ranked by composite score.
   * The first element is the recommended winner.
   */
  rank(evaluations: readonly ICompetitorEvaluation[]): readonly ICompetitorEvaluation[];
}

// ---------------------------------------------------------------------------
// Tournament selection
// ---------------------------------------------------------------------------

/**
 * The outcome of selecting a winner from a competitive generation session.
 *
 * Spec Section 3.5 — "Expert-first selection chooses the winner."
 * Spec Section 6.3 — "Losing implementations are preserved as alternative
 * trail entries — valuable if the winning approach has issues later."
 */
export interface ICompetitionOutcome {
  /** The goal this competition was for. */
  readonly goalId: string;
  /** The winning competitor's evaluation. */
  readonly winner: ICompetitorEvaluation;
  /** All competitor evaluations, ranked by composite score. */
  readonly rankedEvaluations: readonly ICompetitorEvaluation[];
  /** Alternative trail entries created from losing implementations. */
  readonly alternativeTrails: readonly ITrailEntry[];
  /** Branch containing the winning implementation (to be merged to integration). */
  readonly winningBranch: string;
  /** Branches to clean up (losing competitors). */
  readonly eliminatedBranches: readonly string[];
  /** Total cost of this competitive generation (input + output tokens across all competitors). */
  readonly totalTokenCost: {
    readonly inputTokens: number;
    readonly outputTokens: number;
  };
  /** When the competition started. */
  readonly startedAt: Date;
  /** When the winner was selected. */
  readonly completedAt: Date;
}

/**
 * ITournamentSelector — selects the winning implementation and captures
 * losing implementations as "alternative" trail entries for knowledge
 * compounding.
 *
 * Spec Section 3.5 — "Expert-first selection chooses the winner based on
 * verification score, predicted maintainability, and trail alignment."
 *
 * Spec Section 6.3 — "Alternative trails — losing implementations from
 * competitive generation. Valuable as fallback knowledge: 'If the winning
 * approach has issues, approach B was also fully implemented and scored 87%.'"
 */
export interface ITournamentSelector {
  /**
   * Select the winner from ranked evaluations and produce alternative
   * trail entries from the losing implementations.
   *
   * @param goalId - The goal this competition was for
   * @param rankedEvaluations - Evaluations sorted by composite score (best first)
   * @param competitorResults - The raw results from each competitor
   * @param buildId - The build this competition belongs to
   * @param taskType - Task type classification for trail routing
   */
  select(
    goalId: string,
    rankedEvaluations: readonly ICompetitorEvaluation[],
    competitorResults: readonly ICompetitorResult[],
    buildId: string,
    taskType: string,
  ): ICompetitionOutcome;
}

// ---------------------------------------------------------------------------
// Competitive generation coordinator
// ---------------------------------------------------------------------------

/** A running competitive generation session with live status tracking. */
export interface ICompetitiveSession {
  /** Unique session identifier. */
  readonly id: string;
  /** The build this competition belongs to. */
  readonly buildId: string;
  /** The goal being competed for. */
  readonly goalId: string;
  /** The fork assessment that triggered this competition. */
  readonly forkAssessment: IForkAssessment;
  /** Configurations for each competitor. */
  readonly competitors: readonly ICompetitorConfig[];
  /** Current results from each competitor (updated as they progress). */
  readonly results: ReadonlyMap<string, ICompetitorResult>;
  /** When this session was created. */
  readonly createdAt: Date;
  /** Whether all competitors have finished (submitted, evaluated, or failed). */
  readonly isComplete: boolean;
}

/**
 * Dependencies injected into the CompetitiveGenerationCoordinator.
 * Keeps the coordinator decoupled from concrete implementations.
 */
export interface ICompetitiveGenerationCoordinatorDeps {
  /** Launch an agent session for a competitor. */
  readonly launchAgent: (config: ICompetitorConfig) => Promise<string>;
  /** Create a branch for a competitor from the integration branch. */
  readonly createBranch: (branchName: string, fromBranch: string) => Promise<void>;
  /** Delete a branch after competition ends (for losing competitors). */
  readonly deleteBranch: (branchName: string) => Promise<void>;
  /** Get the integration branch name for a build. */
  readonly getIntegrationBranch: (buildId: string) => string;
  /** Run the Evaluator's verification stack on a competitor's branch. */
  readonly runEvaluation: (competitorResult: ICompetitorResult, goal: IGoalAssignment) => Promise<ICompetitorEvaluation>;
  /** Store an alternative trail entry from a losing implementation. */
  readonly storeTrail: (trail: Omit<ITrailEntry, "id">) => Promise<ITrailEntry>;
  /** Retrieve successful trail patterns for a task type (for alignment scoring). */
  readonly getTrailPatterns: (taskType: string) => Promise<readonly ITrailEntry[]>;
}

/**
 * ICompetitiveGenerationCoordinator — manages parallel agent sessions
 * working on the same goal, collecting results for comparison, and
 * selecting the winner.
 *
 * Orchestration flow:
 * 1. CriticalPathIdentifier determines a goal warrants forking
 * 2. Coordinator creates branches (build-{id}/compete/{goal}-{a,b,c})
 * 3. Coordinator launches 2-3 agents with identical goal assignments
 * 4. Agents work autonomously in parallel on their own branches
 * 5. When all agents complete (or fail), ImplementationComparator evaluates
 * 6. TournamentSelector picks the winner and creates alternative trails
 * 7. Winning branch is ready for merge to integration; losing branches are cleaned up
 *
 * Spec Section 3.5 — the complete competitive generation lifecycle.
 * Spec Section 3.2 — Cortex Orchestrator initiates and coordinates.
 */
export interface ICompetitiveGenerationCoordinator {
  /**
   * Start a competitive generation session for a goal.
   *
   * Creates competitor branches, launches agents, and returns a session
   * handle for tracking progress.
   *
   * @param buildId - The build this competition belongs to
   * @param goal - The goal to compete for
   * @param forkAssessment - The assessment that triggered this competition
   */
  startCompetition(
    buildId: string,
    goal: IGoalAssignment,
    forkAssessment: IForkAssessment,
  ): Promise<ICompetitiveSession>;

  /**
   * Record that a competitor has completed (or failed) its implementation.
   * When all competitors are done, triggers evaluation and selection.
   *
   * @param sessionId - The competitive session ID
   * @param competitorId - Which competitor completed
   * @param result - The competitor's result
   */
  recordCompletion(
    sessionId: string,
    competitorId: string,
    result: ICompetitorResult,
  ): Promise<void>;

  /**
   * Finalize a competition — evaluate all completed competitors,
   * select the winner, create alternative trails, and clean up.
   *
   * Returns the competition outcome including the winning branch
   * ready for merge to integration.
   *
   * @param sessionId - The competitive session to finalize
   */
  finalize(sessionId: string): Promise<ICompetitionOutcome>;

  /**
   * Get a running competitive session by ID.
   */
  getSession(sessionId: string): ICompetitiveSession | undefined;

  /**
   * Get all active competitive sessions for a build.
   */
  getActiveSessions(buildId: string): readonly ICompetitiveSession[];

  /**
   * Check if a goal is currently being competitively generated.
   */
  isCompeting(goalId: string): boolean;
}

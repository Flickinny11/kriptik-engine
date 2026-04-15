/**
 * CompetitiveGenerationCoordinator — manages parallel agent sessions
 * working on the same goal, collecting results for comparison, and
 * selecting the winner via tournament selection.
 *
 * Orchestration flow:
 * 1. CriticalPathIdentifier determines a goal warrants forking
 * 2. Coordinator creates branches (build-{id}/compete/{goal}-{a,b,c})
 * 3. Coordinator launches 2-3 agents with identical goal assignments
 * 4. Agents work autonomously in parallel on their own branches
 * 5. When all agents complete (or fail), ImplementationComparator evaluates
 * 6. TournamentSelector picks the winner and creates alternative trails
 * 7. Winning branch is ready for merge; losing branches are cleaned up
 *
 * Spec Section 3.5 — Competitive Generation for Critical Paths.
 * Spec Section 3.2 — Cortex Orchestrator initiates and coordinates.
 * Spec Section 4.2 — Repository branching: build-{id}/compete/*
 *
 * Phase E, Step 23 — Competitive Generation for Critical Paths.
 */

import type {
  IGoalAssignment,
  ITrailEntry,
} from "@kriptik/shared-interfaces";

import type {
  ICompetitiveGenerationCoordinator,
  ICompetitiveGenerationCoordinatorDeps,
  ICompetitiveSession,
  ICompetitorConfig,
  ICompetitorResult,
  ICompetitionOutcome,
  IForkAssessment,
} from "@kriptik/shared-interfaces";

import { ImplementationComparator } from "./implementation-comparator.js";
import type { ImplementationComparatorDeps } from "./implementation-comparator.js";
import { TournamentSelector } from "./tournament-selector.js";

// ---------------------------------------------------------------------------
// Competitor letter assignments
// ---------------------------------------------------------------------------

const COMPETITOR_LETTERS = ["a", "b", "c"] as const;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class CompetitiveGenerationCoordinator
  implements ICompetitiveGenerationCoordinator
{
  private readonly deps: ICompetitiveGenerationCoordinatorDeps;
  private readonly comparator: ImplementationComparator;
  private readonly selector: TournamentSelector;
  private readonly sessions = new Map<string, MutableCompetitiveSession>();
  private readonly goalToSession = new Map<string, string>();

  constructor(
    deps: ICompetitiveGenerationCoordinatorDeps,
    comparatorDeps: ImplementationComparatorDeps,
  ) {
    this.deps = deps;
    this.comparator = new ImplementationComparator(comparatorDeps);
    this.selector = new TournamentSelector();
  }

  async startCompetition(
    buildId: string,
    goal: IGoalAssignment,
    forkAssessment: IForkAssessment,
  ): Promise<ICompetitiveSession> {
    const sessionId = `comp-${buildId}-${goal.id}-${Date.now()}`;
    const integrationBranch = this.deps.getIntegrationBranch(buildId);
    const competitorCount = forkAssessment.recommendedCompetitorCount;

    // Build competitor configurations with spec-compliant branch names
    const competitors: ICompetitorConfig[] = [];
    for (let i = 0; i < competitorCount; i++) {
      const letter = COMPETITOR_LETTERS[i];
      const branchName = `build-${buildId}/compete/${goal.id}-${letter}`;
      competitors.push({
        competitorId: letter,
        goal,
        branchName,
        modelTier: goal.recommendedModelTier,
      });
    }

    // Create branches from integration point (in parallel)
    await Promise.all(
      competitors.map((c) =>
        this.deps.createBranch(c.branchName, integrationBranch),
      ),
    );

    // Launch agents for each competitor (in parallel)
    await Promise.all(
      competitors.map((c) => this.deps.launchAgent(c)),
    );

    // Create the session record
    const session: MutableCompetitiveSession = {
      id: sessionId,
      buildId,
      goalId: goal.id,
      forkAssessment,
      competitors,
      results: new Map(),
      createdAt: new Date(),
      isComplete: false,
    };

    this.sessions.set(sessionId, session);
    this.goalToSession.set(goal.id, sessionId);

    return this.toImmutableSession(session);
  }

  async recordCompletion(
    sessionId: string,
    competitorId: string,
    result: ICompetitorResult,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(
        `CompetitiveGenerationCoordinator: unknown session ${sessionId}`,
      );
    }

    session.results.set(competitorId, result);

    // Check if all competitors have finished
    const allDone = session.competitors.every((c) =>
      session.results.has(c.competitorId),
    );
    session.isComplete = allDone;
  }

  async finalize(sessionId: string): Promise<ICompetitionOutcome> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(
        `CompetitiveGenerationCoordinator: unknown session ${sessionId}`,
      );
    }

    if (!session.isComplete) {
      throw new Error(
        `CompetitiveGenerationCoordinator: session ${sessionId} not yet complete — ` +
        `${session.results.size}/${session.competitors.length} competitors done`,
      );
    }

    const goal = session.competitors[0].goal;

    // Get trail patterns for alignment scoring
    const taskType = goal.description; // Task type derived from goal description
    const trailPatterns = await this.deps.getTrailPatterns(taskType);

    // Evaluate all completed competitors
    const completedResults = [...session.results.values()].filter(
      (r) => r.completedSuccessfully,
    );

    if (completedResults.length === 0) {
      throw new Error(
        `CompetitiveGenerationCoordinator: all competitors failed for goal ${goal.id}`,
      );
    }

    // Run evaluations in parallel
    const evaluations = await Promise.all(
      completedResults.map((result) =>
        this.deps.runEvaluation(result, goal),
      ),
    );

    // Rank evaluations by composite score
    const rankedEvaluations = this.comparator.rank(evaluations);

    // Select winner and create alternative trails
    const allResults = [...session.results.values()];
    const outcome = this.selector.select(
      goal.id,
      rankedEvaluations,
      allResults,
      session.buildId,
      taskType,
    );

    // Store alternative trails from losing implementations
    for (const trail of outcome.alternativeTrails) {
      await this.deps.storeTrail(trail);
    }

    // Clean up eliminated branches
    for (const branch of outcome.eliminatedBranches) {
      await this.deps.deleteBranch(branch);
    }

    // Clean up session tracking
    this.goalToSession.delete(goal.id);
    this.sessions.delete(sessionId);

    return outcome;
  }

  getSession(sessionId: string): ICompetitiveSession | undefined {
    const session = this.sessions.get(sessionId);
    return session ? this.toImmutableSession(session) : undefined;
  }

  getActiveSessions(buildId: string): readonly ICompetitiveSession[] {
    const sessions: ICompetitiveSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.buildId === buildId) {
        sessions.push(this.toImmutableSession(session));
      }
    }
    return sessions;
  }

  isCompeting(goalId: string): boolean {
    return this.goalToSession.has(goalId);
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private toImmutableSession(
    session: MutableCompetitiveSession,
  ): ICompetitiveSession {
    return {
      id: session.id,
      buildId: session.buildId,
      goalId: session.goalId,
      forkAssessment: session.forkAssessment,
      competitors: session.competitors,
      results: new Map(session.results),
      createdAt: session.createdAt,
      isComplete: session.isComplete,
    };
  }
}

// ---------------------------------------------------------------------------
// Internal mutable session type
// ---------------------------------------------------------------------------

interface MutableCompetitiveSession {
  readonly id: string;
  readonly buildId: string;
  readonly goalId: string;
  readonly forkAssessment: IForkAssessment;
  readonly competitors: readonly ICompetitorConfig[];
  readonly results: Map<string, ICompetitorResult>;
  readonly createdAt: Date;
  isComplete: boolean;
}

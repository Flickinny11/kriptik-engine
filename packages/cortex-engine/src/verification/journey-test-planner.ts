/**
 * JourneyTestPlanner — generates test plans from the living specification.
 *
 * Extracts user journeys from the spec's feature inventory, maps them to
 * goal dependencies, and detects when dependency completion clusters
 * enable testable journeys.
 *
 * The planner does NOT use AI for journey extraction — it structurally
 * maps spec features to journeys. The intelligence is in how the Cortex
 * Orchestrator decides WHEN to deploy verification teams.
 *
 * Spec Section 8.3 — Verification Opportunities from Dependency Completion.
 * Spec Section 12.4, Phase C Step 12 — UX Verification Teams.
 */

import { randomUUID } from "node:crypto";
import type {
  ILivingSpecification,
  IFeatureSpec,
  IJourneyTestPlanner,
  IJourneyTestPlan,
  IUserJourney,
  IJourneyStep,
  IGoalAssignment,
} from "@kriptik/shared-interfaces";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface JourneyTestPlannerConfig {
  /**
   * Goal assignments from the dependency graph — used to map features
   * to the goals that implement them.
   */
  readonly goals: readonly IGoalAssignment[];
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * JourneyTestPlanner implementation.
 *
 * Extracts user journeys from the living specification by grouping
 * related features into end-to-end flows. Determines testability by
 * checking whether all required goals for a journey have been completed.
 *
 * Spec Section 8.3 — "The Cortex continuously monitors the integration
 * branch. When a cluster of completed goals enables a testable user
 * journey, it deploys a UX team."
 */
export class JourneyTestPlanner implements IJourneyTestPlanner {
  private readonly goals: readonly IGoalAssignment[];

  constructor(config: JourneyTestPlannerConfig) {
    this.goals = config.goals;
  }

  /**
   * Extract user journeys from the living specification's features.
   *
   * Groups related features into journeys. Each feature becomes at least
   * one journey step. Features sharing required integrations or forming
   * natural user flows are grouped into multi-step journeys.
   *
   * The extracted journeys map each step to the goals that must complete
   * before that step is testable.
   */
  async extractJourneys(
    spec: ILivingSpecification,
  ): Promise<readonly IUserJourney[]> {
    const journeys: IUserJourney[] = [];

    for (const feature of spec.features) {
      const requiredGoalIds = this.findGoalsForFeature(feature);

      const steps: IJourneyStep[] = [
        {
          id: `step-${feature.id}-1`,
          order: 1,
          action: `Navigate to the ${feature.name} feature`,
          expectedOutcome: `The ${feature.name} interface loads and is interactive`,
          route: `/${feature.id}`,
        },
        {
          id: `step-${feature.id}-2`,
          order: 2,
          action: `Interact with the primary ${feature.name} functionality`,
          expectedOutcome: feature.description,
        },
      ];

      journeys.push({
        id: `journey-${feature.id}`,
        name: feature.name,
        description: `End-to-end verification of ${feature.name}: ${feature.description}`,
        steps,
        requiredGoalIds,
        featureIds: [feature.id],
      });
    }

    return journeys;
  }

  /**
   * Given a set of newly completed goal IDs, determine which user journeys
   * are now testable that haven't been tested yet.
   *
   * A journey is testable when ALL its requiredGoalIds are in the
   * completedGoalIds set AND it hasn't been previously tested.
   *
   * Returns null if no new journeys became testable.
   *
   * Spec Section 8.3 — "Auth merged 3 minutes ago. Dashboard layout merged
   * 1 minute ago. Billing settings just merged. A user can now: log in →
   * see dashboard → navigate to billing settings. Deploy a UX team."
   */
  planFromCompletedGoals(
    completedGoalIds: readonly string[],
    allJourneys: readonly IUserJourney[],
    previouslyTestedJourneyIds: readonly string[],
    buildId: string,
  ): IJourneyTestPlan | null {
    const completedSet = new Set(completedGoalIds);
    const testedSet = new Set(previouslyTestedJourneyIds);

    const newlyTestable = allJourneys.filter((journey) => {
      if (testedSet.has(journey.id)) return false;
      if (journey.requiredGoalIds.length === 0) return false;
      return journey.requiredGoalIds.every((gid) => completedSet.has(gid));
    });

    if (newlyTestable.length === 0) return null;

    return {
      id: randomUUID(),
      buildId,
      journeys: newlyTestable,
      verificationType: "mid-build",
      triggeringGoalIds: [...completedGoalIds],
      createdAt: new Date(),
    };
  }

  /**
   * Generate a comprehensive test plan covering all journeys.
   * Used at end-of-build for full verification.
   */
  planComprehensive(
    allJourneys: readonly IUserJourney[],
    buildId: string,
  ): IJourneyTestPlan {
    return {
      id: randomUUID(),
      buildId,
      journeys: [...allJourneys],
      verificationType: "comprehensive",
      triggeringGoalIds: [],
      createdAt: new Date(),
    };
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Find goal IDs that implement a given feature.
   *
   * Matches goals whose description or scoped write paths suggest they
   * relate to this feature. This is a structural heuristic — the Architect
   * agent's goal decomposition is the authoritative mapping, but we can
   * infer from goal descriptions and feature names.
   */
  private findGoalsForFeature(feature: IFeatureSpec): string[] {
    const featureNameLower = feature.name.toLowerCase();
    const featureDescLower = feature.description.toLowerCase();

    return this.goals
      .filter((goal) => {
        const descLower = goal.description.toLowerCase();
        return (
          descLower.includes(featureNameLower) ||
          featureDescLower
            .split(" ")
            .filter((w) => w.length > 4)
            .some((word) => descLower.includes(word))
        );
      })
      .map((goal) => goal.id);
  }
}

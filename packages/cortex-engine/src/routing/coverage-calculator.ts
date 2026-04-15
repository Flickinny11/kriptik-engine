/**
 * CoverageDensityCalculator — computes per-task-type coverage density
 * from the trail store and playbook store.
 *
 * Coverage density is the primary input to the routing decision engine.
 * It combines trail counts, playbook quality, and success rates into
 * a composite score that determines whether a task type has enough
 * accumulated knowledge to route to Sonnet 4.6.
 *
 * Spec Section 6.7 — "as trail coverage density increases for task
 * categories, route those categories to Sonnet 4.6."
 */

import type {
  ICoverageDensity,
  ICoverageDensityCalculator,
} from "@kriptik/shared-interfaces";
import type { ITrailStore, IPlaybookStore } from "@kriptik/shared-interfaces";

/**
 * Thresholds for coverage density classification.
 *
 * These determine when a task type is considered "richly covered"
 * and eligible for Sonnet routing.
 */
const RICH_COVERAGE_THRESHOLD = 0.65;
const TRAIL_SATURATION_COUNT = 20;
const PLAYBOOK_SATURATION_COUNT = 3;

/**
 * Weights for the composite density calculation.
 *
 * Trail count is the dominant factor because trails are the building
 * blocks — more trails means more concrete examples for injection.
 * Playbook quality matters because playbooks are synthesized strategies.
 * Success rate validates that the accumulated knowledge actually works.
 */
const WEIGHTS = {
  trailDensity: 0.40,
  playbookDensity: 0.25,
  successRate: 0.35,
} as const;

export class CoverageDensityCalculator implements ICoverageDensityCalculator {
  constructor(
    private readonly trailStore: ITrailStore,
    private readonly playbookStore: IPlaybookStore,
  ) {}

  async computeCoverage(taskType: string): Promise<ICoverageDensity> {
    const [trailCoverageMap, playbookCoverageMap] = await Promise.all([
      this.trailStore.getTaskTypeCoverage(),
      this.playbookStore.getTaskTypeCoverage(),
    ]);

    const trailCount = trailCoverageMap.get(taskType) ?? 0;
    const playbookData = playbookCoverageMap.get(taskType);
    const playbookCount = playbookData?.count ?? 0;
    const bestPlaybookSuccessRate = playbookData?.bestSuccessRate ?? null;

    return this.buildCoverageDensity(
      taskType,
      trailCount,
      playbookCount,
      bestPlaybookSuccessRate,
    );
  }

  async computeFullCoverageMap(): Promise<ReadonlyMap<string, ICoverageDensity>> {
    const [trailCoverageMap, playbookCoverageMap] = await Promise.all([
      this.trailStore.getTaskTypeCoverage(),
      this.playbookStore.getTaskTypeCoverage(),
    ]);

    const allTaskTypes = new Set<string>([
      ...trailCoverageMap.keys(),
      ...playbookCoverageMap.keys(),
    ]);

    const result = new Map<string, ICoverageDensity>();

    for (const taskType of allTaskTypes) {
      const trailCount = trailCoverageMap.get(taskType) ?? 0;
      const playbookData = playbookCoverageMap.get(taskType);
      const playbookCount = playbookData?.count ?? 0;
      const bestPlaybookSuccessRate = playbookData?.bestSuccessRate ?? null;

      result.set(
        taskType,
        this.buildCoverageDensity(taskType, trailCount, playbookCount, bestPlaybookSuccessRate),
      );
    }

    return result;
  }

  async hasRichCoverage(taskType: string): Promise<boolean> {
    const coverage = await this.computeCoverage(taskType);
    return coverage.hasRichCoverage;
  }

  private buildCoverageDensity(
    taskType: string,
    trailCount: number,
    playbookCount: number,
    bestPlaybookSuccessRate: number | null,
  ): ICoverageDensity {
    const trailDensity = Math.min(trailCount / TRAIL_SATURATION_COUNT, 1.0);
    const playbookDensity = Math.min(playbookCount / PLAYBOOK_SATURATION_COUNT, 1.0);
    const successRateComponent = bestPlaybookSuccessRate ?? 0;

    const averageTrailQuality = this.estimateTrailQuality(trailCount, bestPlaybookSuccessRate);

    const compositeDensity =
      WEIGHTS.trailDensity * trailDensity +
      WEIGHTS.playbookDensity * playbookDensity +
      WEIGHTS.successRate * successRateComponent;

    const hasRichCoverage = compositeDensity >= RICH_COVERAGE_THRESHOLD;

    return {
      taskType,
      trailCount,
      playbookCount,
      bestPlaybookSuccessRate,
      averageTrailQuality,
      compositeDensity,
      hasRichCoverage,
    };
  }

  /**
   * Estimate average trail quality from available data.
   *
   * When playbooks exist, their success rate is the best proxy for
   * trail quality (playbooks are synthesized from trails). Otherwise,
   * estimate based on trail count — more trails suggests the system
   * has iterated and improved.
   */
  private estimateTrailQuality(
    trailCount: number,
    bestPlaybookSuccessRate: number | null,
  ): number {
    if (bestPlaybookSuccessRate !== null) {
      return bestPlaybookSuccessRate;
    }
    if (trailCount === 0) {
      return 0;
    }
    return Math.min(0.5 + (trailCount / TRAIL_SATURATION_COUNT) * 0.3, 0.8);
  }
}

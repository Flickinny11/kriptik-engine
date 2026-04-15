/**
 * AntiPatternScanner — scans proposed goals and specifications against the
 * anti-pattern library to produce alerts for ICE and golden window injection.
 *
 * Integration points:
 * - ICE Stage 4 Method 6 — enriches intent with anti-pattern knowledge
 * - ICE Stage 6 — includes alerts in the living specification
 * - Golden window Step 8 — injects relevant alerts for upcoming work
 *
 * Spec Section 2.2, Stage 4 Method 6 — "using the knowledge base's accumulated
 *   experiential trails, identifies what has gone wrong in similar builds before."
 * Spec Section 2.2, Stage 6 — "Anti-Pattern Alerts — derived from the knowledge
 *   base (Stage 4, Method 6), presented as explicit warnings."
 * Spec Section 5.4, Step 8 — "Anti-pattern alerts relevant to upcoming work."
 * Spec Section 3.1 — agent goal assignments contain "anti-pattern alerts
 *   from the knowledge base."
 */

import type {
  IAntiPatternScanner,
  IAntiPatternScanResult,
  IAntiPatternAlert,
  IAntiPatternLibrary,
  IAntiPattern,
} from "@kriptik/shared-interfaces";

/** Maximum alerts to return per scan. Prevents overwhelming the context window. */
const MAX_ALERTS_PER_SCAN = 10;

/**
 * Scans goals and specifications against the anti-pattern library.
 *
 * The scanner queries the library by task type and tech stack keywords,
 * then converts matching anti-patterns into prioritized alerts. Alerts
 * are sorted by confidence and failure rate for injection priority.
 */
export class AntiPatternScanner implements IAntiPatternScanner {
  private readonly library: IAntiPatternLibrary;

  constructor(library: IAntiPatternLibrary) {
    this.library = library;
  }

  /**
   * Scan a proposed goal against the anti-pattern library.
   *
   * Matches anti-patterns by:
   * 1. Exact task type match (highest relevance)
   * 2. Tech stack keyword overlap (secondary relevance)
   *
   * Returns alerts sorted by confidence then failure rate.
   *
   * Spec Section 5.4, Step 8 — "Anti-pattern alerts relevant to upcoming work."
   * Spec Section 3.1 — "anti-pattern alerts from the knowledge base"
   */
  scanGoal(
    taskType: string,
    goalDescription: string,
    techStack: readonly string[],
  ): IAntiPatternScanResult {
    // Query by exact task type
    const taskTypeMatches = this.library.query({
      taskType,
      status: "active",
    });

    // Also check for tech-stack keyword matches across all patterns
    const allActive = this.library.getAll();
    const techStackMatches = allActive.filter((p) =>
      !taskTypeMatches.includes(p) &&
      this.hasTechStackOverlap(p, techStack, goalDescription),
    );

    const matchedPatterns = [...taskTypeMatches, ...techStackMatches];
    const alerts = this.patternsToAlerts(matchedPatterns);

    // Limit and sort
    const sortedAlerts = this.sortAndLimitAlerts(alerts, MAX_ALERTS_PER_SCAN);

    return {
      alerts: sortedAlerts,
      patternsChecked: allActive.length,
      taskTypesScanned: [taskType],
      formattedAlerts: this.formatAlertStrings(sortedAlerts),
    };
  }

  /**
   * Scan the full living specification for anti-pattern matches across
   * all features and integrations.
   *
   * Spec Section 2.2, Stage 6 — "Anti-Pattern Alerts — derived from the
   * knowledge base (Stage 4, Method 6)."
   */
  scanSpecification(
    features: readonly {
      taskType: string;
      description: string;
      techStack: readonly string[];
    }[],
  ): IAntiPatternScanResult {
    const allAlerts: IAntiPatternAlert[] = [];
    const seenPatternIds = new Set<string>();
    const taskTypesScanned: string[] = [];

    for (const feature of features) {
      taskTypesScanned.push(feature.taskType);

      const featureResult = this.scanGoal(
        feature.taskType,
        feature.description,
        feature.techStack,
      );

      // Deduplicate alerts across features
      for (const alert of featureResult.alerts) {
        if (!seenPatternIds.has(alert.antiPatternId)) {
          seenPatternIds.add(alert.antiPatternId);
          allAlerts.push(alert);
        }
      }
    }

    const sortedAlerts = this.sortAndLimitAlerts(allAlerts, MAX_ALERTS_PER_SCAN);

    return {
      alerts: sortedAlerts,
      patternsChecked: this.library.count(),
      taskTypesScanned,
      formattedAlerts: this.formatAlertStrings(sortedAlerts),
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Check if an anti-pattern has tech stack overlap with the given context.
   * Looks for keyword matches between the pattern's task types/trigger and
   * the goal's tech stack and description.
   */
  private hasTechStackOverlap(
    pattern: IAntiPattern,
    techStack: readonly string[],
    goalDescription: string,
  ): boolean {
    const searchText = [
      ...techStack.map((t) => t.toLowerCase()),
      goalDescription.toLowerCase(),
    ].join(" ");

    // Check if any of the pattern's task types or trigger condition keywords
    // appear in the goal's tech stack or description
    const patternKeywords = [
      ...pattern.taskTypes.map((t) => t.toLowerCase()),
      ...pattern.triggerCondition.toLowerCase().split(/\s+/),
    ];

    return patternKeywords.some(
      (keyword) => keyword.length > 3 && searchText.includes(keyword),
    );
  }

  /** Convert anti-pattern entries to alert format. */
  private patternsToAlerts(
    patterns: readonly IAntiPattern[],
  ): IAntiPatternAlert[] {
    return patterns.map((p) => ({
      antiPatternId: p.id,
      warningText: `DO NOT ${p.triggerCondition.toLowerCase().startsWith("do not") ? p.triggerCondition.slice(7) : p.triggerCondition}`,
      statisticalContext: `In ${p.occurrenceCount} previous occurrences, this pattern had a ${Math.round(p.failureRate * 100)}% failure rate.`,
      recommendation: p.alternativeGuidance,
      confidence: p.confidence,
      failureRate: p.failureRate,
      occurrenceCount: p.occurrenceCount,
      taskTypes: p.taskTypes,
    }));
  }

  /**
   * Sort alerts by confidence (desc) then failure rate (desc), limit count.
   * High-confidence, high-failure-rate alerts are injected first.
   */
  private sortAndLimitAlerts(
    alerts: readonly IAntiPatternAlert[],
    limit: number,
  ): readonly IAntiPatternAlert[] {
    const CONF_ORDER = { high: 2, medium: 1, low: 0 } as const;

    return [...alerts]
      .sort((a, b) => {
        const confDiff = CONF_ORDER[b.confidence] - CONF_ORDER[a.confidence];
        if (confDiff !== 0) return confDiff;
        return b.failureRate - a.failureRate;
      })
      .slice(0, limit);
  }

  /**
   * Format alerts as concise strings for the living specification.
   *
   * Spec Section 2.2, Stage 6 — "presented as explicit warnings:
   * 'DO NOT use the browser's default video player. DO NOT skip
   * client-side file validation.'"
   */
  private formatAlertStrings(
    alerts: readonly IAntiPatternAlert[],
  ): readonly string[] {
    return alerts.map((a) => {
      const confidence = a.confidence === "high" ? " [HIGH CONFIDENCE]" : "";
      return `${a.warningText}. ${a.recommendation}${confidence}`;
    });
  }
}

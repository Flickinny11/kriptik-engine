/**
 * EphemeralGuidanceEngine — Phase E evolution of the ephemeral guidance
 * system, extending the Step 14 classifier with learning from build
 * outcomes.
 *
 * Orchestrates four sub-systems:
 * 1. The existing EphemeralGuidanceClassifier (pattern matching on output)
 * 2. The GuidanceEffectivenessTracker (which rules work)
 * 3. The DecisionTimeContextAnalyzer (which rules matter right now)
 * 4. A learning pipeline that discovers new rules from trails/anti-patterns
 *
 * Spec Section 7.3, Layer 3 — "The classifier starts with hand-coded rules.
 * Through the continuous learning pipeline, it learns new patterns."
 */

import type {
  IEphemeralGuidanceRule,
  IEphemeralGuidanceClassifier,
  IDecisionTimeContext,
  IScoredGuidance,
  IGuidanceEffectivenessObservation,
  IGuidanceRuleMetrics,
  IProactiveGuidancePattern,
  ILearnedGuidanceRule,
  IGuidanceLearningResult,
  IEphemeralGuidanceEngineDeps,
  IEphemeralGuidanceEngine,
} from "@kriptik/shared-interfaces";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Minimum regression rate to create a proactive pattern. */
const PROACTIVE_PATTERN_THRESHOLD = 0.4;

/** Minimum trail count to consider a task type for learning. */
const MIN_TRAILS_FOR_LEARNING = 5;

/** Minimum anti-pattern confidence for rule derivation. */
const MIN_ANTI_PATTERN_CONFIDENCE: "medium" | "high" = "medium";

/** Priority boost for high-effectiveness rules. */
const BOOST_PRIORITY_DELTA = 15;

/** Priority penalty for low-effectiveness rules. */
const DEMOTE_PRIORITY_DELTA = 20;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class EphemeralGuidanceEngine implements IEphemeralGuidanceEngine {
  private readonly classifier: IEphemeralGuidanceClassifier;
  private readonly deps: IEphemeralGuidanceEngineDeps;
  private readonly learnedRules: Map<string, ILearnedGuidanceRule> = new Map();

  constructor(
    classifier: IEphemeralGuidanceClassifier,
    deps: IEphemeralGuidanceEngineDeps,
  ) {
    this.classifier = classifier;
    this.deps = deps;
  }

  processOutput(context: IDecisionTimeContext): readonly IScoredGuidance[] {
    // 1. Run the Step 14 classifier for pattern-matched nudges
    const classifierNudges = this.classifier.classify(
      context.recentOutput,
      context.currentFilePath,
    );

    // 2. Pass through the context analyzer for scoring + proactive injection
    const scored = this.deps.contextAnalyzer.analyze(
      context,
      classifierNudges,
    );

    // Note: actual compliance outcomes are recorded later via recordNudgeOutcome().
    // The "totalTriggers" count is tracked when observations are recorded.

    return scored;
  }

  recordNudgeOutcome(observation: IGuidanceEffectivenessObservation): void {
    this.deps.effectivenessTracker.recordObservation(observation);
  }

  async learnFromOutcomes(): Promise<IGuidanceLearningResult> {
    const newRules: ILearnedGuidanceRule[] = [];
    const adjustedRuleIds: string[] = [];
    const retiredRuleIds: string[] = [];
    let trailsConsulted = 0;

    // 1. Learn from trail patterns — discover task types with recurring regressions
    const trailRules = await this.learnFromTrails();
    trailsConsulted += trailRules.trailsConsulted;
    for (const rule of trailRules.rules) {
      if (!this.learnedRules.has(rule.id)) {
        this.learnedRules.set(rule.id, rule);
        this.classifier.addRule(rule);
        newRules.push(rule);

        // Register proactive pattern for context-aware injection
        this.deps.contextAnalyzer.registerProactivePattern({
          id: `proactive-${rule.id}`,
          description: rule.description,
          taskTypes: rule.sourceTaskTypes,
          filePatterns: [],
          domains: [],
          nudge: {
            message: rule.nudgeMessage,
            trigger: "",
            matchedPattern: rule.id,
            suggestedReplacement: rule.suggestedComponent ?? "",
            confidence: Math.min(rule.observedRegressionRate, 1.0),
          },
          regressionRate: rule.observedRegressionRate,
          evidenceCount: rule.evidenceCount,
          discoveredAt: rule.learnedAt,
        });
      }
    }

    // 2. Learn from anti-patterns — convert active anti-patterns to nudge rules
    const antiPatternRules = this.learnFromAntiPatterns();
    for (const rule of antiPatternRules) {
      if (!this.learnedRules.has(rule.id)) {
        this.learnedRules.set(rule.id, rule);
        this.classifier.addRule(rule);
        newRules.push(rule);
      }
    }

    // 3. Adjust priorities based on effectiveness data
    const boostCandidates =
      this.deps.effectivenessTracker.getBoostCandidates();
    for (const metric of boostCandidates) {
      const rules = this.classifier.getRules();
      const rule = rules.find((r) => r.id === metric.ruleId);
      if (rule) {
        this.classifier.addRule({
          ...rule,
          priority: Math.min(rule.priority + BOOST_PRIORITY_DELTA, 100),
        });
        adjustedRuleIds.push(metric.ruleId);
      }
    }

    // 4. Retire ineffective rules
    const retireCandidates =
      this.deps.effectivenessTracker.getRetirementCandidates();
    for (const metric of retireCandidates) {
      this.classifier.removeRule(metric.ruleId);
      this.learnedRules.delete(metric.ruleId);
      retiredRuleIds.push(metric.ruleId);
    }

    // 5. Demote low-performing rules that haven't reached retirement threshold
    const allMetrics = this.deps.effectivenessTracker.getAllMetrics();
    for (const metric of allMetrics) {
      if (
        metric.totalTriggers >= 5 &&
        metric.complianceRate < 0.3 &&
        !retiredRuleIds.includes(metric.ruleId)
      ) {
        const rules = this.classifier.getRules();
        const rule = rules.find((r) => r.id === metric.ruleId);
        if (rule && !adjustedRuleIds.includes(metric.ruleId)) {
          this.classifier.addRule({
            ...rule,
            priority: Math.max(rule.priority - DEMOTE_PRIORITY_DELTA, 1),
          });
          adjustedRuleIds.push(metric.ruleId);
        }
      }
    }

    return {
      newRules,
      adjustedRuleIds,
      retiredRuleIds,
      rulesAnalyzed: this.classifier.getRules().length,
      trailsConsulted,
    };
  }

  getRules(): readonly IEphemeralGuidanceRule[] {
    return this.classifier.getRules();
  }

  getMetrics(): readonly IGuidanceRuleMetrics[] {
    return this.deps.effectivenessTracker.getAllMetrics();
  }

  getProactivePatterns(): readonly IProactiveGuidancePattern[] {
    return this.deps.contextAnalyzer.getProactivePatterns();
  }

  // -----------------------------------------------------------------------
  // Learning: trails
  // -----------------------------------------------------------------------

  private async learnFromTrails(): Promise<{
    rules: ILearnedGuidanceRule[];
    trailsConsulted: number;
  }> {
    const rules: ILearnedGuidanceRule[] = [];

    // Query violation and dead-end trails for regression patterns
    const violationTrails = await this.deps.queryTrails({
      trailType: "violation",
      limit: 200,
      orderBy: "recordedAt",
      orderDirection: "desc",
    });

    const deadEndTrails = await this.deps.queryTrails({
      trailType: "dead-end",
      limit: 200,
      orderBy: "recordedAt",
      orderDirection: "desc",
    });

    const allTrails = [...violationTrails, ...deadEndTrails];
    const trailsConsulted = allTrails.length;

    // Group by task type and look for recurring gotcha patterns
    const taskTypeGotchas = new Map<string, Map<string, number>>();

    for (const trail of allTrails) {
      if (!taskTypeGotchas.has(trail.taskType)) {
        taskTypeGotchas.set(trail.taskType, new Map());
      }
      const gotchaMap = taskTypeGotchas.get(trail.taskType)!;

      for (const gotcha of trail.gotchasEncountered) {
        gotchaMap.set(gotcha, (gotchaMap.get(gotcha) ?? 0) + 1);
      }
    }

    // Find task types with recurring gotchas that suggest design regression
    for (const [taskType, gotchaMap] of taskTypeGotchas) {
      const totalTrails = allTrails.filter(
        (t) => t.taskType === taskType,
      ).length;

      if (totalTrails < MIN_TRAILS_FOR_LEARNING) continue;

      for (const [gotcha, count] of gotchaMap) {
        const regressionRate = count / totalTrails;
        if (regressionRate < PROACTIVE_PATTERN_THRESHOLD) continue;

        // Check if this looks like a design regression
        if (!this.isDesignRelatedGotcha(gotcha)) continue;

        const ruleId = `learned-trail-${taskType}-${this.slugify(gotcha)}`;
        if (this.learnedRules.has(ruleId)) continue;

        rules.push({
          id: ruleId,
          description: `Learned from trails: ${gotcha} occurs ${Math.round(regressionRate * 100)}% of the time for ${taskType}`,
          triggerPattern: this.gotchaToPattern(gotcha),
          nudgeMessage: `Warning: "${gotcha}" is a common issue for ${taskType} tasks. Use design system components instead.`,
          suggestedComponent: null,
          priority: 50 + Math.round(regressionRate * 30),
          source: "trail-analysis",
          sourceTaskTypes: [taskType],
          observedRegressionRate: regressionRate,
          evidenceCount: count,
          learnedAt: new Date(),
        });
      }
    }

    return { rules, trailsConsulted };
  }

  // -----------------------------------------------------------------------
  // Learning: anti-patterns
  // -----------------------------------------------------------------------

  private learnFromAntiPatterns(): ILearnedGuidanceRule[] {
    const rules: ILearnedGuidanceRule[] = [];

    const antiPatterns = this.deps.queryAntiPatterns({
      minConfidence: MIN_ANTI_PATTERN_CONFIDENCE,
      status: "active",
    });

    for (const ap of antiPatterns) {
      const ruleId = `learned-ap-${ap.id}`;
      if (this.learnedRules.has(ruleId)) continue;

      // Only convert anti-patterns that have a trigger condition
      if (!ap.triggerCondition) continue;

      rules.push({
        id: ruleId,
        description: `Learned from anti-pattern: ${ap.failureDescription}`,
        triggerPattern: ap.triggerCondition.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        nudgeMessage: `Anti-pattern detected: ${ap.failureDescription}. ${ap.alternativeGuidance}`,
        suggestedComponent: null,
        priority: ap.confidence === "high" ? 75 : 55,
        source: "anti-pattern",
        sourceTaskTypes: [...ap.taskTypes],
        observedRegressionRate: ap.failureRate,
        evidenceCount: ap.occurrenceCount,
        learnedAt: new Date(),
      });
    }

    return rules;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private isDesignRelatedGotcha(gotcha: string): boolean {
    const designKeywords = [
      "style",
      "css",
      "tailwind",
      "component",
      "animation",
      "transition",
      "color",
      "layout",
      "design",
      "ui",
      "ux",
      "icon",
      "font",
      "spacing",
      "responsive",
      "modal",
      "button",
      "card",
      "loading",
      "skeleton",
      "spinner",
    ];
    const lower = gotcha.toLowerCase();
    return designKeywords.some((kw) => lower.includes(kw));
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 40);
  }

  private gotchaToPattern(gotcha: string): string {
    // Extract key terms from the gotcha description to build a regex
    const words = gotcha
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 3);

    if (words.length === 0) return gotcha.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Create a pattern that matches any of the key words
    return words
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
  }

}

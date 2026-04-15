/**
 * DecisionTimeContextAnalyzer — analyzes agent state and upcoming work
 * to determine which guidance is most relevant at this exact moment.
 *
 * Goes beyond the Step 14 classifier's static pattern matching:
 * - Scores existing nudges for relevance to the current context
 * - Injects proactive nudges from learned patterns (e.g., "billing pages
 *   regress to flat cards 73% of the time")
 * - Prioritizes by context fit, not just rule priority
 *
 * Spec Section 7.3, Layer 3 — "When agents implement billing pages,
 * they regress to flat card patterns 73% of the time — inject Card
 * component reminder proactively."
 */

import type {
  IEphemeralGuidance,
  IDecisionTimeContext,
  IScoredGuidance,
  IDecisionTimeContextAnalyzer,
  IProactiveGuidancePattern,
} from "@kriptik/shared-interfaces";

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class DecisionTimeContextAnalyzer
  implements IDecisionTimeContextAnalyzer
{
  private proactivePatterns: IProactiveGuidancePattern[] = [];

  analyze(
    context: IDecisionTimeContext,
    classifierNudges: readonly IEphemeralGuidance[],
  ): readonly IScoredGuidance[] {
    const scored: IScoredGuidance[] = [];

    // 1. Score classifier-produced nudges for contextual relevance
    for (const nudge of classifierNudges) {
      const relevance = this.scoreRelevance(nudge, context);
      scored.push({
        guidance: nudge,
        relevanceScore: relevance.score,
        relevanceReason: relevance.reason,
        isProactive: false,
      });
    }

    // 2. Add proactive nudges from learned patterns
    for (const pattern of this.proactivePatterns) {
      if (this.patternMatchesContext(pattern, context)) {
        // Skip if the classifier already produced a nudge for the same pattern
        const alreadyNudged = classifierNudges.some(
          (n) => n.matchedPattern === pattern.id,
        );
        if (alreadyNudged) continue;

        scored.push({
          guidance: pattern.nudge,
          relevanceScore: this.scoreProactiveRelevance(pattern, context),
          relevanceReason: `Proactive: ${pattern.description} (${Math.round(pattern.regressionRate * 100)}% regression rate)`,
          isProactive: true,
        });
      }
    }

    // Sort by relevance score (highest first)
    return scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  registerProactivePattern(pattern: IProactiveGuidancePattern): void {
    const existingIndex = this.proactivePatterns.findIndex(
      (p) => p.id === pattern.id,
    );
    if (existingIndex >= 0) {
      this.proactivePatterns[existingIndex] = pattern;
    } else {
      this.proactivePatterns.push(pattern);
    }
  }

  getProactivePatterns(): readonly IProactiveGuidancePattern[] {
    return [...this.proactivePatterns];
  }

  // -----------------------------------------------------------------------
  // Internal: Relevance scoring
  // -----------------------------------------------------------------------

  private scoreRelevance(
    nudge: IEphemeralGuidance,
    context: IDecisionTimeContext,
  ): { score: number; reason: string } {
    let score = nudge.confidence;
    const reasons: string[] = [];

    // File type relevance — design nudges matter more for UI files
    if (this.isUIFile(context.currentFilePath)) {
      score *= 1.2;
      reasons.push("UI file");
    } else if (this.isServerFile(context.currentFilePath)) {
      // Design nudges are less relevant for server-side files
      score *= 0.5;
      reasons.push("server file (reduced relevance)");
    }

    // Goal progress relevance — early in a goal, nudges about structure
    // matter more; late in a goal, nudges about polish matter more
    if (context.goalProgress < 0.3) {
      // Early: boost structural nudges (components, layouts)
      if (nudge.suggestedReplacement) {
        score *= 1.1;
        reasons.push("early goal, structural nudge");
      }
    }

    // Agent role relevance — only builder agents generate UI
    if (context.agentRole !== "builder") {
      score *= 0.3;
      reasons.push("non-builder agent");
    }

    // Cap at 1.0
    score = Math.min(score, 1.0);

    return {
      score: Math.round(score * 100) / 100,
      reason: reasons.length > 0
        ? reasons.join(", ")
        : "standard pattern match",
    };
  }

  private scoreProactiveRelevance(
    pattern: IProactiveGuidancePattern,
    context: IDecisionTimeContext,
  ): number {
    let score = pattern.regressionRate;

    // Evidence weight — more evidence = higher confidence
    const evidenceWeight = Math.min(pattern.evidenceCount / 20, 1.0);
    score *= 0.5 + evidenceWeight * 0.5;

    // File type match bonus
    if (pattern.filePatterns.length > 0 && this.isUIFile(context.currentFilePath)) {
      score *= 1.15;
    }

    // Domain match bonus
    if (
      context.domain &&
      pattern.domains.length > 0 &&
      pattern.domains.includes(context.domain)
    ) {
      score *= 1.2;
    }

    return Math.min(Math.round(score * 100) / 100, 1.0);
  }

  private patternMatchesContext(
    pattern: IProactiveGuidancePattern,
    context: IDecisionTimeContext,
  ): boolean {
    // Task type match
    if (
      pattern.taskTypes.length > 0 &&
      !pattern.taskTypes.some((t) =>
        context.taskType.toLowerCase().includes(t.toLowerCase()),
      )
    ) {
      return false;
    }

    // File pattern match (simple contains check for glob-style patterns)
    if (
      pattern.filePatterns.length > 0 &&
      !pattern.filePatterns.some((fp) => {
        // Strip glob wildcards for simple matching
        const clean = fp.replace(/\*/g, "");
        return context.currentFilePath.includes(clean);
      })
    ) {
      return false;
    }

    // Domain match
    if (
      pattern.domains.length > 0 &&
      context.domain !== null &&
      !pattern.domains.includes(context.domain)
    ) {
      return false;
    }

    return true;
  }

  // -----------------------------------------------------------------------
  // File type helpers
  // -----------------------------------------------------------------------

  private isUIFile(filePath: string): boolean {
    const uiExtensions = [".tsx", ".jsx", ".vue", ".svelte"];
    const uiPaths = [
      "components",
      "pages",
      "views",
      "layouts",
      "app",
      "ui",
    ];

    const hasUIExtension = uiExtensions.some((ext) =>
      filePath.endsWith(ext),
    );
    const hasUIPath = uiPaths.some((p) =>
      filePath.toLowerCase().includes(`/${p}/`),
    );

    return hasUIExtension || hasUIPath;
  }

  private isServerFile(filePath: string): boolean {
    const serverPaths = [
      "api/",
      "server/",
      "middleware/",
      "lib/db",
      "lib/auth",
      "services/",
    ];
    return serverPaths.some((p) => filePath.toLowerCase().includes(p));
  }
}

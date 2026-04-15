/**
 * DesignQualityScorer — Layer 7 of the Seven-Layer Design Enforcement Stack.
 *
 * Produces a quantitative design quality score at build completion.
 * Unlike the merge gate (binary pass/fail), this provides a continuous-
 * spectrum assessment with per-dimension breakdown. The user-adjustable
 * threshold determines whether the score is acceptable.
 *
 * Scoring dimensions:
 *   1. Quality thresholds from the Anti-Slop Ruleset (Artifact 3)
 *   2. Required pattern coverage
 *   3. Design token usage (vs hardcoded values)
 *   4. Animation and effect presence
 *   5. Component library adoption rate
 *
 * Spec Section 7.3, Layer 7 — "Design quality scoring (scored):
 * Quantitative score with user-adjustable threshold."
 * Spec Section 7.2, Artifact 3 — quality thresholds.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  IDesignQualityScore,
  IDesignQualityDimension,
  IDesignQualityScorerConfig,
  IDesignQualityScorer,
  IQualityThreshold,
  IRequiredPattern,
} from "@kriptik/shared-interfaces";

/** Default weight allocation for built-in dimensions. */
const DIMENSION_WEIGHTS = {
  qualityThresholds: 0.30,
  requiredPatterns: 0.25,
  tokenUsage: 0.20,
  effectPresence: 0.15,
  componentAdoption: 0.10,
} as const;

export class DesignQualityScorer implements IDesignQualityScorer {
  async score(
    files: readonly string[],
    repoPath: string,
    config: IDesignQualityScorerConfig,
  ): Promise<IDesignQualityScore> {
    // Read all file contents upfront
    const fileContents = new Map<string, string>();
    for (const file of files) {
      try {
        const content = await readFile(join(repoPath, file), "utf-8");
        fileContents.set(file, content);
      } catch {
        // Skip unreadable files
      }
    }

    const dimensions: IDesignQualityDimension[] = [];

    // Dimension 1: Quality thresholds from the Anti-Slop Ruleset
    if (config.qualityThresholds.length > 0) {
      dimensions.push(
        this.scoreQualityThresholds(fileContents, config.qualityThresholds),
      );
    }

    // Dimension 2: Required pattern coverage
    if (config.requiredPatterns.length > 0) {
      dimensions.push(
        this.scoreRequiredPatterns(fileContents, config.requiredPatterns),
      );
    }

    // Dimension 3: Design token usage
    dimensions.push(this.scoreTokenUsage(fileContents));

    // Dimension 4: Animation and effect presence
    dimensions.push(this.scoreEffectPresence(fileContents));

    // Dimension 5: Component library adoption
    dimensions.push(this.scoreComponentAdoption(fileContents));

    // Compute weighted composite score
    const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
    const overallScore =
      totalWeight > 0
        ? dimensions.reduce((sum, d) => sum + d.score * d.weight, 0) /
          totalWeight
        : 0;

    const roundedScore = Math.round(overallScore * 100) / 100;

    return {
      overallScore: roundedScore,
      passed: roundedScore >= config.threshold,
      threshold: config.threshold,
      dimensions,
      buildId: config.buildId,
      assessedAt: new Date(),
    };
  }

  // -----------------------------------------------------------------------
  // Dimension scorers
  // -----------------------------------------------------------------------

  /**
   * Score quality thresholds from the Anti-Slop Ruleset.
   * Each threshold defines a metric with a minimum value. The score
   * reflects how many thresholds the build meets.
   */
  private scoreQualityThresholds(
    fileContents: Map<string, string>,
    thresholds: readonly IQualityThreshold[],
  ): IDesignQualityDimension {
    let metCount = 0;
    const details: string[] = [];

    for (const threshold of thresholds) {
      const measured = this.measureThreshold(fileContents, threshold);
      if (measured >= threshold.minimumValue) {
        metCount++;
        details.push(
          `${threshold.metric}: ${measured} >= ${threshold.minimumValue} ${threshold.unit} (pass)`,
        );
      } else {
        details.push(
          `${threshold.metric}: ${measured} < ${threshold.minimumValue} ${threshold.unit} (fail)`,
        );
      }
    }

    const score =
      thresholds.length > 0 ? (metCount / thresholds.length) * 100 : 100;

    return {
      id: "quality-thresholds",
      name: "Quality Thresholds",
      score: Math.round(score),
      weight: DIMENSION_WEIGHTS.qualityThresholds,
      details: details.join("; "),
    };
  }

  /**
   * Score required pattern coverage.
   * What percentage of required patterns are present across the build?
   */
  private scoreRequiredPatterns(
    fileContents: Map<string, string>,
    patterns: readonly IRequiredPattern[],
  ): IDesignQualityDimension {
    let foundCount = 0;

    for (const pattern of patterns) {
      const regex = this.compilePattern(pattern.pattern);
      if (!regex) continue;

      // Check if pattern exists in any applicable file
      let found = false;
      for (const [filePath, content] of fileContents) {
        if (!this.isApplicable(filePath, pattern.applicableGlobs)) continue;
        if (regex.test(content)) {
          found = true;
          break;
        }
      }
      if (found) foundCount++;
    }

    const score =
      patterns.length > 0 ? (foundCount / patterns.length) * 100 : 100;

    return {
      id: "required-patterns",
      name: "Required Pattern Coverage",
      score: Math.round(score),
      weight: DIMENSION_WEIGHTS.requiredPatterns,
      details: `${foundCount}/${patterns.length} required patterns present`,
    };
  }

  /**
   * Score design token usage vs hardcoded values.
   * Looks at CSS/TSX files for CSS custom property usage vs hardcoded colors.
   */
  private scoreTokenUsage(
    fileContents: Map<string, string>,
  ): IDesignQualityDimension {
    let tokenReferences = 0;
    let hardcodedColors = 0;

    const tokenPattern = /var\(--[a-zA-Z]/g;
    const hardcodedPattern = /#[0-9a-fA-F]{3,8}\b/g;

    for (const [filePath, content] of fileContents) {
      if (!this.isStyleFile(filePath)) continue;

      const tokenMatches = content.match(tokenPattern);
      const hardcodedMatches = content.match(hardcodedPattern);

      tokenReferences += tokenMatches?.length ?? 0;
      hardcodedColors += hardcodedMatches?.length ?? 0;
    }

    const total = tokenReferences + hardcodedColors;
    const score = total > 0 ? (tokenReferences / total) * 100 : 100;

    return {
      id: "token-usage",
      name: "Design Token Usage",
      score: Math.round(score),
      weight: DIMENSION_WEIGHTS.tokenUsage,
      details: `${tokenReferences} token refs, ${hardcodedColors} hardcoded colors`,
    };
  }

  /**
   * Score animation and effect presence.
   * Checks for imports from design system effects, GSAP, framer-motion,
   * and CSS animation usage.
   */
  private scoreEffectPresence(
    fileContents: Map<string, string>,
  ): IDesignQualityDimension {
    let filesWithEffects = 0;
    let uiFileCount = 0;

    const effectIndicators = [
      /from\s+["'].*effects\//,
      /from\s+["'].*design-system\//,
      /from\s+["']gsap/,
      /from\s+["']framer-motion/,
      /from\s+["']three/,
      /from\s+["']@react-three/,
      /from\s+["']lenis/,
      /keyframes\s*\{/,
      /animation:/,
      /transition:/,
      /useSpring|useTransition|useAnimation/,
    ];

    for (const [filePath, content] of fileContents) {
      if (!this.isUIFile(filePath)) continue;
      uiFileCount++;

      const hasEffects = effectIndicators.some((pattern) =>
        pattern.test(content),
      );
      if (hasEffects) filesWithEffects++;
    }

    const score = uiFileCount > 0 ? (filesWithEffects / uiFileCount) * 100 : 100;

    return {
      id: "effect-presence",
      name: "Animation & Effect Presence",
      score: Math.round(score),
      weight: DIMENSION_WEIGHTS.effectPresence,
      details: `${filesWithEffects}/${uiFileCount} UI files have effects/animations`,
    };
  }

  /**
   * Score component library adoption.
   * What percentage of UI files import from the design system?
   */
  private scoreComponentAdoption(
    fileContents: Map<string, string>,
  ): IDesignQualityDimension {
    let filesWithImports = 0;
    let uiFileCount = 0;

    const designSystemImport = /from\s+["'].*design-system\//;

    for (const [filePath, content] of fileContents) {
      if (!this.isUIFile(filePath)) continue;
      uiFileCount++;

      if (designSystemImport.test(content)) {
        filesWithImports++;
      }
    }

    const score = uiFileCount > 0 ? (filesWithImports / uiFileCount) * 100 : 100;

    return {
      id: "component-adoption",
      name: "Component Library Adoption",
      score: Math.round(score),
      weight: DIMENSION_WEIGHTS.componentAdoption,
      details: `${filesWithImports}/${uiFileCount} UI files import from design system`,
    };
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Measure a quality threshold across all files.
   * Delegates to specific metric measurement functions.
   */
  private measureThreshold(
    fileContents: Map<string, string>,
    threshold: IQualityThreshold,
  ): number {
    switch (threshold.unit) {
      case "count":
        return this.countMetric(fileContents, threshold.metric);
      case "percentage":
        return this.percentageMetric(fileContents, threshold.metric);
      default:
        return this.countMetric(fileContents, threshold.metric);
    }
  }

  private countMetric(
    fileContents: Map<string, string>,
    metric: string,
  ): number {
    // Generic count: search for metric name as a pattern across all files
    let total = 0;
    const pattern = this.metricToPattern(metric);
    if (!pattern) return 0;

    for (const [filePath, content] of fileContents) {
      if (!this.isUIFile(filePath)) continue;
      const matches = content.match(pattern);
      total += matches?.length ?? 0;
    }

    return total;
  }

  private percentageMetric(
    fileContents: Map<string, string>,
    metric: string,
  ): number {
    // Percentage metrics: compute ratio of files matching the metric
    let matchCount = 0;
    let total = 0;
    const pattern = this.metricToPattern(metric);
    if (!pattern) return 0;

    for (const [filePath, content] of fileContents) {
      if (!this.isUIFile(filePath)) continue;
      total++;
      if (pattern.test(content)) matchCount++;
    }

    return total > 0 ? Math.round((matchCount / total) * 100) : 0;
  }

  private metricToPattern(metric: string): RegExp | null {
    // Map known metric names to detection patterns
    const metricPatterns: Record<string, string> = {
      "animations-per-page": "animation:|keyframes\\s|useSpring|useAnimation|motion\\.",
      "shader-effect-presence": "ShaderHover|useShader|WebGLRenderer|fragmentShader",
      "skeleton-loading-coverage": "LoadingSkeleton|Skeleton|skeleton",
      "scroll-effects": "ScrollReveal|ScrollTrigger|useScroll|IntersectionObserver",
      "page-transitions": "PageTransition|AnimatePresence|useTransition",
      "hover-states": "hover:|onMouseEnter|:hover|whileHover",
      "focus-states": "focus:|onFocus|:focus-visible|whileFocus",
    };

    const patternStr = metricPatterns[metric];
    if (!patternStr) return null;

    try {
      return new RegExp(patternStr, "g");
    } catch {
      return null;
    }
  }

  private isStyleFile(filePath: string): boolean {
    return /\.(css|scss|tsx|jsx|ts|js)$/.test(filePath);
  }

  private isUIFile(filePath: string): boolean {
    return /\.(tsx|jsx)$/.test(filePath) && !filePath.includes(".test.");
  }

  private isApplicable(
    filePath: string,
    globs: readonly string[],
  ): boolean {
    if (globs.length === 0) return true;
    return globs.some((glob) => fileMatchesGlob(filePath, glob));
  }

  private compilePattern(pattern: string): RegExp | null {
    try {
      return new RegExp(pattern, "u");
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Glob matching (shared pattern with anti-slop-linter.ts)
// ---------------------------------------------------------------------------

function fileMatchesGlob(filePath: string, glob: string): boolean {
  const regexStr = glob
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "<<<DOUBLESTAR>>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<<DOUBLESTAR>>>/g, ".*");

  return new RegExp(`^${regexStr}$`).test(filePath);
}

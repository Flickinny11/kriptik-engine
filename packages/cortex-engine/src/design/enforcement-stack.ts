/**
 * DesignEnforcementStack — coordinates all seven layers of the design
 * enforcement system.
 *
 * Layers 1-5 operate DURING the build to maintain quality.
 * Layers 6-7 operate as ASSESSMENT — they measure and score.
 *
 * | Layer | When | Implementation |
 * |-------|------|----------------|
 * | 1. Design Pioneer | Early build | DesignPioneerAgent (Step 13) |
 * | 2. Positive context | Agent warm-up | PositiveContextInjector |
 * | 3. Ephemeral nudges | During generation | EphemeralGuidanceClassifier |
 * | 4. Agent self-check | Before merge | AntiSlopLinter (Step 11) |
 * | 5. Merge gate | At merge | MergeGate Check 5 (Step 11) |
 * | 6. UX Verification | When testable | UXVerificationTeam (Step 12) |
 * | 7. Quality scoring | Build completion | DesignQualityScorer |
 *
 * The stack is configured by the orchestrator after the Design Pioneer
 * completes. Before configuration, Layer 2-3-7 methods return safe defaults
 * (null context, empty nudges, zero score).
 *
 * Spec Section 7.3 — Seven-Layer Design Enforcement Stack.
 */

import type {
  IDesignPioneerArtifacts,
  IGoalAssignment,
  IDesignContextBlock,
  IDesignEnforcementStack,
  IDesignEnforcementStackConfig,
  IEphemeralGuidance,
  IDesignQualityScore,
  IRequiredPatternCheckResult,
  IAntiSlopLinter,
} from "@kriptik/shared-interfaces";

import { PositiveContextInjector } from "./positive-context.js";
import { EphemeralGuidanceClassifier } from "./ephemeral-guidance.js";
import { RequiredPatternChecker } from "./required-pattern-checker.js";
import { DesignQualityScorer } from "./design-quality-scorer.js";

export class DesignEnforcementStack implements IDesignEnforcementStack {
  private artifacts: IDesignPioneerArtifacts | null;
  private readonly qualityThreshold: number;
  private readonly linter: IAntiSlopLinter;

  private readonly contextInjector: PositiveContextInjector;
  private readonly classifier: EphemeralGuidanceClassifier;
  private readonly patternChecker: RequiredPatternChecker;
  private readonly qualityScorer: DesignQualityScorer;

  constructor(config: IDesignEnforcementStackConfig) {
    this.artifacts = config.artifacts;
    this.qualityThreshold = config.qualityThreshold;
    this.linter = config.linter;

    this.contextInjector = new PositiveContextInjector();
    this.classifier = new EphemeralGuidanceClassifier();
    this.patternChecker = new RequiredPatternChecker();
    this.qualityScorer = new DesignQualityScorer();

    // If artifacts already provided at construction, configure immediately
    if (this.artifacts) {
      this.applyArtifacts(this.artifacts);
    }
  }

  get isConfigured(): boolean {
    return this.artifacts !== null;
  }

  configure(artifacts: IDesignPioneerArtifacts): void {
    this.artifacts = artifacts;
    this.applyArtifacts(artifacts);
  }

  getDesignContext(goal: IGoalAssignment): IDesignContextBlock | null {
    if (!this.artifacts) return null;
    return this.contextInjector.buildDesignContext(this.artifacts, goal);
  }

  formatDesignContext(context: IDesignContextBlock): string {
    return this.contextInjector.formatForGoldenWindow(context);
  }

  classifyOutput(
    agentOutput: string,
    filePath: string,
  ): readonly IEphemeralGuidance[] {
    return this.classifier.classify(agentOutput, filePath);
  }

  async scoreQuality(
    files: readonly string[],
    repoPath: string,
    buildId: string,
  ): Promise<IDesignQualityScore> {
    const ruleset = this.artifacts?.antiSlopRuleset;

    return this.qualityScorer.score(files, repoPath, {
      threshold: this.qualityThreshold,
      qualityThresholds: ruleset?.qualityThresholds ?? [],
      requiredPatterns: ruleset?.requiredPatterns ?? [],
      buildId,
    });
  }

  async checkRequiredPatterns(
    files: readonly string[],
    repoPath: string,
  ): Promise<IRequiredPatternCheckResult> {
    const patterns = this.artifacts?.antiSlopRuleset.requiredPatterns ?? [];

    if (patterns.length === 0) {
      return {
        passed: true,
        missingPatterns: [],
        presentPatterns: [],
        fileCount: files.length,
        patternCount: 0,
      };
    }

    return this.patternChecker.check(files, repoPath, patterns);
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  /**
   * Apply Design Pioneer artifacts to all configurable layers.
   *
   * - Layer 3: Configure ephemeral classifier with project-specific rules
   * - Layer 4-5: Add project-specific banned patterns to the linter
   */
  private applyArtifacts(artifacts: IDesignPioneerArtifacts): void {
    // Layer 3: Configure ephemeral guidance with component-aware rules
    this.classifier.configureFromArtifacts(artifacts);

    // Layer 4-5: Add project-specific banned patterns to the linter
    if (artifacts.antiSlopRuleset.extendsDefaults) {
      for (const banned of artifacts.antiSlopRuleset.bannedPatterns) {
        this.linter.addPattern(banned);
      }
    }
  }
}

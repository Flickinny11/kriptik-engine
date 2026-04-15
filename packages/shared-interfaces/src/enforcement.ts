/**
 * Seven-Layer Design Enforcement Stack interfaces.
 *
 * Coordinates all seven layers of the design enforcement system:
 *   Layer 1: Design Pioneer (Step 13) — sets visual quality floor
 *   Layer 2: Positive context injection — goal assignments include component references
 *   Layer 3: Ephemeral decision-time guidance — real-time nudges during generation
 *   Layer 4: Agent self-verification (Step 11) — anti-slop linter
 *   Layer 5: Merge gate binary enforcement (Step 11) — merge gate Check 5
 *   Layer 6: UX Verification scored assessment (Step 12) — Navigator + Inspector
 *   Layer 7: Design quality scoring — quantitative score with user-adjustable threshold
 *
 * Spec Section 7.3 — Seven-Layer Design Enforcement Stack.
 */

// ---------------------------------------------------------------------------
// Layer 2: Positive Context Injection
// ---------------------------------------------------------------------------

/**
 * A component reference injected into a builder agent's golden window.
 *
 * Spec Section 7.3, Layer 2 — "Goal assignment includes component references"
 * so agents know the design system exists and use it instead of writing generic UI.
 */
export interface IComponentReference {
  /** Component name (e.g., "Button"). */
  readonly name: string;
  /** Import path relative to repo root (e.g., "src/design-system/components/Button.tsx"). */
  readonly importPath: string;
  /** What this component does. */
  readonly description: string;
  /** Non-trivial visual behaviors the component provides. */
  readonly visualBehaviors: readonly string[];
}

/**
 * An effect reference injected into a builder agent's golden window.
 *
 * Spec Section 7.3, Layer 2 — agents must know which effects exist
 * to use them instead of writing generic animations.
 */
export interface IEffectReference {
  /** Effect name (e.g., "ShaderHover"). */
  readonly name: string;
  /** Import path relative to repo root. */
  readonly importPath: string;
  /** What this effect does. */
  readonly description: string;
  /** NPM dependencies this effect requires. */
  readonly dependencies: readonly string[];
}

/**
 * A layout reference injected into a builder agent's golden window.
 *
 * Spec Section 7.3, Layer 2 — agents must know which layouts exist
 * to wrap pages correctly.
 */
export interface ILayoutReference {
  /** Layout name (e.g., "AppShell"). */
  readonly name: string;
  /** Import path relative to repo root. */
  readonly importPath: string;
  /** What this layout provides. */
  readonly description: string;
}

/**
 * The design context block injected into a builder agent's golden window
 * formation sequence.
 *
 * Contains references to all relevant design system artifacts so the agent
 * imports from the library instead of writing generic patterns.
 *
 * Spec Section 7.3, Layer 2 — "Positive context: goal assignment includes
 * component references."
 * Spec Section 5.4 — golden window formation sequence.
 */
export interface IDesignContextBlock {
  /** Components available in the design system. */
  readonly components: readonly IComponentReference[];
  /** Visual effects available in the design system. */
  readonly effects: readonly IEffectReference[];
  /** Page layout templates available. */
  readonly layouts: readonly ILayoutReference[];
  /** Base path for the design system directory (e.g., "src/design-system"). */
  readonly designSystemBasePath: string;
  /** Token categories available (e.g., ["colors", "typography", "spacing"]). */
  readonly tokenCategories: readonly string[];
  /** Token base path (e.g., "src/design-system/tokens"). */
  readonly tokenBasePath: string;
  /** Example implementations the agent can reference. */
  readonly examples: readonly {
    readonly name: string;
    readonly path: string;
    readonly componentsUsed: readonly string[];
    readonly effectsUsed: readonly string[];
  }[];
}

/**
 * IPositiveContextInjector — injects Design Pioneer component library
 * references into builder goal assignments.
 *
 * Operates during agent warm-up (golden window formation) to ensure every
 * builder agent knows the design system exists and has specific import paths
 * for components, effects, layouts, and tokens.
 *
 * Spec Section 7.3, Layer 2 — "Positive context: goal assignment includes
 * component references."
 */
export interface IPositiveContextInjector {
  /**
   * Build a design context block for a builder agent's golden window.
   *
   * Selects components, effects, and layouts relevant to the goal based on
   * the goal's scoped write paths and description. All agents get the full
   * token system and layout references; component/effect filtering is
   * relevance-based.
   *
   * @param artifacts - The Design Pioneer's output.
   * @param goal - The goal assignment being prepared.
   * @returns Design context block to inject into the golden window.
   */
  buildDesignContext(
    artifacts: import("./design-pioneer.js").IDesignPioneerArtifacts,
    goal: import("./agents.js").IGoalAssignment,
  ): IDesignContextBlock;

  /**
   * Format a design context block as a human-readable string for injection
   * into the golden window formation sequence.
   *
   * The formatted string uses a structured template that lists available
   * components with import paths and descriptions, making it easy for
   * the agent to find and use design system artifacts.
   */
  formatForGoldenWindow(context: IDesignContextBlock): string;
}

// ---------------------------------------------------------------------------
// Layer 3: Ephemeral Decision-Time Guidance
// ---------------------------------------------------------------------------

/**
 * An ephemeral guidance nudge — a micro-instruction injected when the
 * classifier detects design regression patterns in agent output.
 *
 * Nudges influence the next token prediction without consuming persistent
 * context. They are transient corrections, not permanent instructions.
 *
 * Spec Section 7.3, Layer 3 — "Classifier injects reminders when generic
 * patterns detected."
 */
export interface IEphemeralGuidance {
  /** The nudge message to inject into the agent's context. */
  readonly message: string;
  /** What output text triggered this nudge. */
  readonly trigger: string;
  /** The pattern ID that matched. */
  readonly matchedPattern: string;
  /** Specific component/effect the agent should use instead. */
  readonly suggestedReplacement: string;
  /** Confidence that this is a genuine design regression (0-1). */
  readonly confidence: number;
}

/**
 * A rule for the ephemeral guidance classifier.
 *
 * Rules start as hand-coded derivations from the anti-slop config. Through
 * the continuous learning pipeline, new rules are discovered from agent
 * behavior patterns.
 *
 * Spec Section 7.3, Layer 3 — "The classifier starts with hand-coded rules
 * derived from the anti-slop config."
 */
export interface IEphemeralGuidanceRule {
  /** Unique rule identifier. */
  readonly id: string;
  /** Human-readable description of what this rule catches. */
  readonly description: string;
  /** Regex pattern to match in agent output text. */
  readonly triggerPattern: string;
  /** The nudge message to inject when triggered. */
  readonly nudgeMessage: string;
  /** Specific component/effect to suggest (null if no direct replacement). */
  readonly suggestedComponent: string | null;
  /** Priority — higher values take precedence when multiple rules match. */
  readonly priority: number;
}

/**
 * IEphemeralGuidanceClassifier — monitors agent token output and injects
 * design nudges when regression patterns are detected.
 *
 * Drawing from Replit's ephemeral classifier pattern, the classifier watches
 * each builder agent's output stream. When patterns associated with design
 * regression are detected (generic Tailwind styling, loading spinners,
 * hardcoded values), it produces nudges referencing the correct design
 * system component.
 *
 * Spec Section 7.3, Layer 3 — "Ephemeral nudges: Catches drift in real-time.
 * Classifier injects reminders when generic patterns detected."
 */
export interface IEphemeralGuidanceClassifier {
  /**
   * Classify a chunk of agent output and return any applicable nudges.
   *
   * Called on each meaningful output chunk from a builder agent.
   * Returns empty array when no regression patterns are detected.
   *
   * @param agentOutput - The agent's recent output text.
   * @param filePath - The file being generated (for rule applicability).
   */
  classify(
    agentOutput: string,
    filePath: string,
  ): readonly IEphemeralGuidance[];

  /** Add a guidance rule. */
  addRule(rule: IEphemeralGuidanceRule): void;

  /** Remove a rule by ID. */
  removeRule(ruleId: string): void;

  /** Get all active rules. */
  getRules(): readonly IEphemeralGuidanceRule[];

  /**
   * Configure the classifier from Design Pioneer artifacts.
   *
   * Derives rules from the component library (so nudges reference actual
   * components) and the anti-slop ruleset (so triggers match project-specific
   * banned patterns).
   */
  configureFromArtifacts(
    artifacts: import("./design-pioneer.js").IDesignPioneerArtifacts,
  ): void;
}

// ---------------------------------------------------------------------------
// Required Pattern Checker (supports Layers 4-5)
// ---------------------------------------------------------------------------

/**
 * A missing required pattern — the inverse of a slop violation.
 *
 * While ISlopViolation reports something that MUST NOT exist,
 * IRequiredPatternViolation reports something that MUST exist but is absent.
 *
 * Spec Section 7.2, Artifact 3 — "required patterns (SmoothScroll,
 * PageTransition, ScrollReveal on every page; hover/focus/active states
 * on every interactive element)"
 */
export interface IRequiredPatternViolation {
  /** ID of the required pattern that was not found. */
  readonly patternId: string;
  /** What was expected to be present. */
  readonly description: string;
  /** Where it was expected (e.g., "every page component"). */
  readonly scope: string;
  /** What to add to satisfy the requirement. */
  readonly suggestion: string;
  /** File where the pattern was expected but missing. */
  readonly file: string;
}

/**
 * Result of checking for required pattern presence.
 *
 * Spec Section 7.2, Artifact 3 — required patterns enforcement.
 */
export interface IRequiredPatternCheckResult {
  /** Whether all required patterns were found in their expected scopes. */
  readonly passed: boolean;
  /** Patterns that were expected but not found. */
  readonly missingPatterns: readonly IRequiredPatternViolation[];
  /** IDs of patterns that were successfully found. */
  readonly presentPatterns: readonly string[];
  /** Number of files checked. */
  readonly fileCount: number;
  /** Number of required patterns checked. */
  readonly patternCount: number;
}

/**
 * IRequiredPatternChecker — checks for the presence of required patterns
 * defined in the Design Pioneer's Anti-Slop Ruleset.
 *
 * While the AntiSlopLinter detects things that MUST NOT exist (banned patterns),
 * the RequiredPatternChecker detects things that MUST exist. The absence of
 * a required pattern is a violation.
 *
 * Used by:
 *   Layer 4: Agent self-check — agents verify required patterns before merge
 *   Layer 5: Merge gate integration — required pattern absence blocks merge
 *   Layer 7: Design quality scoring — required pattern coverage feeds the score
 *
 * Spec Section 7.2, Artifact 3 — required patterns.
 * Spec Section 7.3, Layers 4-5-7 — enforcement at multiple points.
 */
export interface IRequiredPatternChecker {
  /**
   * Check multiple files for required pattern presence.
   * Reads file contents from disk using repoPath as root.
   *
   * @param files - File paths relative to repo root.
   * @param repoPath - Absolute path to the repository root.
   * @param patterns - Required patterns to check for.
   */
  check(
    files: readonly string[],
    repoPath: string,
    patterns: readonly import("./design-pioneer.js").IRequiredPattern[],
  ): Promise<IRequiredPatternCheckResult>;

  /**
   * Check a single file's content for required pattern presence.
   * No filesystem access needed.
   *
   * @param content - The file content to check.
   * @param filePath - The file path (for scope matching and diagnostics).
   * @param patterns - Required patterns to check for.
   */
  checkContent(
    content: string,
    filePath: string,
    patterns: readonly import("./design-pioneer.js").IRequiredPattern[],
  ): IRequiredPatternCheckResult;
}

// ---------------------------------------------------------------------------
// Layer 7: Design Quality Scoring
// ---------------------------------------------------------------------------

/**
 * A single dimension of the design quality score.
 *
 * Each dimension corresponds to a quality threshold from the Anti-Slop
 * Ruleset or a built-in design quality metric.
 *
 * Spec Section 7.3, Layer 7 — "Quantitative score with user-adjustable threshold."
 */
export interface IDesignQualityDimension {
  /** Unique dimension identifier (maps to IQualityThreshold.id or built-in metric). */
  readonly id: string;
  /** Human-readable dimension name. */
  readonly name: string;
  /** Score for this dimension (0-100). */
  readonly score: number;
  /** Weight in the final composite score (0-1, all weights sum to 1). */
  readonly weight: number;
  /** Explanation of how this score was computed. */
  readonly details: string;
}

/**
 * IDesignQualityScore — the quantitative output of the design quality
 * scoring system (Layer 7).
 *
 * A continuous-spectrum assessment (not binary) that measures overall
 * design quality across multiple dimensions. The user-adjustable threshold
 * determines whether the score is acceptable.
 *
 * Spec Section 7.3, Layer 7 — "Design quality scoring (scored):
 * Quantitative score with user-adjustable threshold."
 */
export interface IDesignQualityScore {
  /** Composite score across all dimensions (0-100). */
  readonly overallScore: number;
  /** Whether the overall score meets the user-adjustable threshold. */
  readonly passed: boolean;
  /** The threshold the score was measured against (0-100). */
  readonly threshold: number;
  /** Per-dimension breakdown. */
  readonly dimensions: readonly IDesignQualityDimension[];
  /** The build this assessment belongs to. */
  readonly buildId: string;
  /** When the assessment was performed. */
  readonly assessedAt: Date;
}

/**
 * Configuration for the design quality scorer.
 *
 * Spec Section 7.3, Layer 7.
 * Spec Section 7.2, Artifact 3 — quality thresholds feed the scorer.
 */
export interface IDesignQualityScorerConfig {
  /** Quality pass/fail threshold (0-100). User-adjustable. */
  readonly threshold: number;
  /** Quality thresholds from the Design Pioneer's Anti-Slop Ruleset. */
  readonly qualityThresholds: readonly import("./design-pioneer.js").IQualityThreshold[];
  /** Required patterns — coverage feeds the score. */
  readonly requiredPatterns: readonly import("./design-pioneer.js").IRequiredPattern[];
  /** The build being scored. */
  readonly buildId: string;
}

/**
 * IDesignQualityScorer — quantitative design quality assessment (Layer 7).
 *
 * Runs at build completion to produce a continuous-spectrum score.
 * Unlike the merge gate (binary pass/fail), this provides a nuanced
 * quality assessment with per-dimension breakdown.
 *
 * Spec Section 7.3, Layer 7 — "Design quality scoring (scored):
 * Quantitative score with user-adjustable threshold."
 */
export interface IDesignQualityScorer {
  /**
   * Score the design quality of the build's output files.
   *
   * Evaluates multiple dimensions (animation coverage, effect presence,
   * design token usage, required pattern coverage, skeleton loading) and
   * produces a composite score with per-dimension breakdown.
   *
   * @param files - File paths relative to repo root.
   * @param repoPath - Absolute path to the repository root.
   * @param config - Scorer configuration with thresholds and patterns.
   */
  score(
    files: readonly string[],
    repoPath: string,
    config: IDesignQualityScorerConfig,
  ): Promise<IDesignQualityScore>;
}

// ---------------------------------------------------------------------------
// Enforcement Stack Coordinator
// ---------------------------------------------------------------------------

/**
 * Configuration for the complete design enforcement stack.
 *
 * Spec Section 7.3 — Seven-Layer Design Enforcement Stack.
 */
export interface IDesignEnforcementStackConfig {
  /** Design Pioneer artifacts (null until Pioneer completes). */
  readonly artifacts: import("./design-pioneer.js").IDesignPioneerArtifacts | null;
  /** User-adjustable quality threshold for Layer 7 (0-100, default 70). */
  readonly qualityThreshold: number;
  /** The anti-slop linter instance (Layers 4-5). */
  readonly linter: import("./slop.js").IAntiSlopLinter;
}

/**
 * IDesignEnforcementStack — coordinates all seven layers of the design
 * enforcement system.
 *
 * The critical distinction: Layers 1-5 operate DURING the build to maintain
 * quality. Layers 6-7 operate as ASSESSMENT — they measure and score on a
 * continuous spectrum.
 *
 * | Layer | When | Mode |
 * |-------|------|------|
 * | 1. Design Pioneer | Early build | Dedicated agent (Step 13) |
 * | 2. Positive context | Agent warm-up | This stack: getDesignContext() |
 * | 3. Ephemeral nudges | During generation | This stack: classifyOutput() |
 * | 4. Agent self-check | Before merge | AntiSlopLinter (Step 11) |
 * | 5. Merge gate | At merge | MergeGate Check 5 (Step 11) |
 * | 6. UX Verification | When testable | UXVerificationTeam (Step 12) |
 * | 7. Quality scoring | Build completion | This stack: scoreQuality() |
 *
 * Spec Section 7.3 — Seven-Layer Design Enforcement Stack.
 */
export interface IDesignEnforcementStack {
  /**
   * Configure the stack with Design Pioneer artifacts.
   * Called by the orchestrator after the Pioneer completes.
   *
   * Configures:
   * - Layer 2: Positive context injector with component library
   * - Layer 3: Ephemeral classifier with project-specific rules
   * - Layer 4-5: Anti-slop linter with project-specific banned patterns
   */
  configure(
    artifacts: import("./design-pioneer.js").IDesignPioneerArtifacts,
  ): void;

  /**
   * Layer 2: Get design context for a builder agent's golden window.
   * Returns null if the Design Pioneer hasn't completed yet.
   */
  getDesignContext(
    goal: import("./agents.js").IGoalAssignment,
  ): IDesignContextBlock | null;

  /**
   * Layer 2: Format a design context block as a golden window string.
   */
  formatDesignContext(context: IDesignContextBlock): string;

  /**
   * Layer 3: Classify agent output for ephemeral guidance nudges.
   * Returns empty array if the classifier hasn't been configured yet.
   */
  classifyOutput(
    agentOutput: string,
    filePath: string,
  ): readonly IEphemeralGuidance[];

  /**
   * Layer 7: Score design quality at build completion.
   * Uses quality thresholds and required patterns from the Pioneer's
   * Anti-Slop Ruleset.
   */
  scoreQuality(
    files: readonly string[],
    repoPath: string,
    buildId: string,
  ): Promise<IDesignQualityScore>;

  /**
   * Check required patterns (inverse of banned patterns).
   * Used by Layers 4-5 integration and Layer 7 scoring.
   */
  checkRequiredPatterns(
    files: readonly string[],
    repoPath: string,
  ): Promise<IRequiredPatternCheckResult>;

  /** Whether the stack has been configured with Design Pioneer artifacts. */
  readonly isConfigured: boolean;
}

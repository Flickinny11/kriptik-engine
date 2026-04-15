/**
 * Anti-Pattern Inference interfaces — the system that infers anti-patterns
 * from accumulated negative knowledge (dead-end trails, violation records,
 * cross-build failure patterns) and scans proposed goals against them.
 *
 * Anti-patterns flow through three integration points:
 * 1. ICE Stage 4, Method 6 — inferred during intent processing
 * 2. ICE Stage 6 — included in the living specification as explicit warnings
 * 3. Golden Window Step 8 — injected as alerts for upcoming work
 *
 * Spec Section 2.2, Stage 4 Method 6 — Anti-Pattern Inference
 * Spec Section 2.2, Stage 6 — Anti-Pattern Alerts in Spec Assembly
 * Spec Section 2.3 — Anti-pattern library in the learning flywheel
 * Spec Section 3.2 — Librarian maintains the anti-pattern library
 * Spec Section 5.4, Step 8 — Anti-pattern alerts in golden window formation
 * Spec Section 6.3 — Dead-end trails, violation trails, cross-build patterns
 * Spec Section 9.2, Step 1 — Trail extraction feeds the anti-pattern library
 */

import type { ITrailEntry, TrailType } from "./knowledge.js";
import type { IViolationRecord } from "./violation.js";

// ---------------------------------------------------------------------------
// Anti-pattern entry
// ---------------------------------------------------------------------------

/**
 * Confidence level of an anti-pattern — how much evidence supports it.
 *
 * Spec Section 2.2 Stage 4 Method 6 — confidence grows with more evidence:
 * "In 47 previous builds with async API polling, 31 failed to implement
 * proper timeout handling on first pass."
 */
export type AntiPatternConfidence = "low" | "medium" | "high";

/**
 * Status of an anti-pattern in the library.
 *
 * Spec Section 3.2 — "The Librarian tracks trail freshness and depreciates
 * trails that haven't been confirmed in recent builds, without deleting them."
 * Same lifecycle applies to anti-patterns.
 */
export type AntiPatternStatus = "active" | "deprecated" | "superseded";

/**
 * Source that contributed evidence for an anti-pattern.
 *
 * Spec Section 6.3 — three trail types feed anti-pattern inference:
 * - Dead-end trails: approaches tried and abandoned
 * - Violation trails: implementations fired for contract violations
 * - Cross-build patterns: aggregated insights across many builds
 */
export type AntiPatternSource = "dead-end-trail" | "violation-record" | "cross-build-pattern";

/**
 * IAntiPattern — a single anti-pattern entry in the library.
 *
 * Represents a recurring failure pattern inferred from the knowledge base's
 * accumulated negative experiences. Each entry captures what goes wrong,
 * under what conditions, with what frequency, and what to do instead.
 *
 * Spec Section 2.2, Stage 4 Method 6 — "using the knowledge base's
 * accumulated experiential trails, identifies what has gone wrong in
 * similar builds before."
 *
 * Spec Section 2.3 — "every build failure that traces back to a missing
 * spec item becomes a new anti-pattern entry."
 *
 * Spec Section 6.3 — "Cross-build pattern trails — aggregated insights
 * that only emerge across many builds: 'Async API polling fails to implement
 * timeout handling 65% of the time on first pass.'"
 */
export interface IAntiPattern {
  /** Unique anti-pattern identifier. */
  readonly id: string;

  /**
   * Task types this anti-pattern applies to.
   * Primary key for matching during ICE Stage 4 and golden window formation.
   * Example: ["stripe_billing_next_app_router", "async_api_polling"]
   */
  readonly taskTypes: readonly string[];

  /**
   * The trigger condition — what situation causes this failure.
   * Example: "Async API polling without explicit timeout handling"
   */
  readonly triggerCondition: string;

  /**
   * Description of the failure mode — what goes wrong.
   * Example: "API calls hang indefinitely, build fails with timeout errors,
   * or silently returns stale data."
   */
  readonly failureDescription: string;

  /**
   * Positive guidance — what to do instead.
   * Phrased as specific, actionable instruction, not a warning.
   * Example: "Add explicit timeout handling (30s default) with exponential
   * backoff (max 3 retries) and a circuit breaker for sustained failures."
   *
   * Spec Section 2.2 Stage 6 — "presented as explicit warnings: 'DO NOT
   * use the browser's default video player. DO NOT skip client-side
   * file validation.'"
   */
  readonly alternativeGuidance: string;

  /**
   * How many times this pattern has been observed across builds.
   * Used for statistical reporting and confidence calculation.
   *
   * Spec Section 2.2 Stage 4 — "In 47 previous builds with async API
   * polling, 31 failed to implement proper timeout handling on first pass."
   */
  readonly occurrenceCount: number;

  /**
   * Failure rate when this pattern is encountered without mitigation (0-1).
   * Example: 0.66 means "fails 66% of the time on first pass."
   *
   * Spec Section 6.3 — "Async API polling fails to implement timeout
   * handling 65% of the time on first pass."
   */
  readonly failureRate: number;

  /** Trail IDs that contributed evidence for this anti-pattern. */
  readonly sourceTrailIds: readonly string[];

  /** Violation record IDs that contributed evidence. */
  readonly sourceViolationIds: readonly string[];

  /**
   * Confidence level based on accumulated evidence.
   * Low: 1-3 occurrences. Medium: 4-9. High: 10+.
   */
  readonly confidence: AntiPatternConfidence;

  /** When this anti-pattern was first inferred. */
  readonly inferredAt: Date;

  /**
   * When this anti-pattern was last confirmed by a build experiencing
   * the same failure pattern or successfully avoiding it via the alert.
   *
   * Spec Section 3.2 — freshness tracking for deprecation decisions.
   */
  readonly lastConfirmedAt: Date | null;

  /** Current status in the library. */
  readonly status: AntiPatternStatus;
}

// ---------------------------------------------------------------------------
// Anti-pattern alert (formatted for injection)
// ---------------------------------------------------------------------------

/**
 * IAntiPatternAlert — a formatted anti-pattern alert ready for injection
 * into the living specification (ICE Stage 6) or golden window (Step 8).
 *
 * Spec Section 2.2, Stage 6 — "Anti-Pattern Alerts — derived from the
 * knowledge base (Stage 4, Method 6), presented as explicit warnings:
 * 'DO NOT use the browser's default video player. DO NOT skip
 * client-side file validation.'"
 *
 * Spec Section 5.4, Step 8 — "Anti-pattern alerts relevant to upcoming work"
 * in the golden window formation sequence.
 */
export interface IAntiPatternAlert {
  /** The anti-pattern this alert derives from. */
  readonly antiPatternId: string;

  /**
   * The warning text — explicit "DO NOT" or "ALWAYS" framing.
   * Example: "DO NOT implement async API polling without explicit timeout handling."
   */
  readonly warningText: string;

  /**
   * Statistical context — why this is an anti-pattern.
   * Example: "In 47 previous builds, 31 failed on first pass without timeout handling (66% failure rate)."
   */
  readonly statisticalContext: string;

  /**
   * Positive recommendation — what to do instead.
   * Example: "Add explicit timeout handling (30s default) with exponential backoff."
   */
  readonly recommendation: string;

  /** Confidence level (affects injection priority — high confidence injected first). */
  readonly confidence: AntiPatternConfidence;

  /** Failure rate (0-1) for severity ranking. */
  readonly failureRate: number;

  /** Number of observed occurrences for credibility. */
  readonly occurrenceCount: number;

  /** Task types this alert applies to. */
  readonly taskTypes: readonly string[];
}

// ---------------------------------------------------------------------------
// Anti-pattern query
// ---------------------------------------------------------------------------

/**
 * Query parameters for retrieving anti-patterns from the library.
 */
export interface IAntiPatternQuery {
  /** Filter by task type (matches if any of the anti-pattern's taskTypes match). */
  readonly taskType?: string;

  /** Filter by minimum confidence level. */
  readonly minConfidence?: AntiPatternConfidence;

  /** Filter by status (default: "active" only). */
  readonly status?: AntiPatternStatus;

  /** Filter by minimum occurrence count. */
  readonly minOccurrences?: number;

  /** Filter by minimum failure rate (0-1). */
  readonly minFailureRate?: number;

  /** Maximum results to return. */
  readonly limit?: number;
}

// ---------------------------------------------------------------------------
// Inference result
// ---------------------------------------------------------------------------

/**
 * IInferenceResult — output of a full anti-pattern inference run.
 *
 * Captures what was analyzed, what new patterns were found, and what
 * existing patterns were confirmed or updated.
 */
export interface IInferenceResult {
  /** Newly inferred anti-patterns. */
  readonly newPatterns: readonly Omit<IAntiPattern, "id">[];

  /** Existing anti-pattern IDs that were confirmed (occurrence count updated). */
  readonly confirmedPatternIds: readonly string[];

  /** Existing anti-pattern IDs that were deprecated (no recent evidence). */
  readonly deprecatedPatternIds: readonly string[];

  /** Number of dead-end trails analyzed. */
  readonly deadEndTrailsAnalyzed: number;

  /** Number of violation records analyzed. */
  readonly violationsAnalyzed: number;

  /** Number of cross-build patterns analyzed. */
  readonly crossBuildPatternsAnalyzed: number;

  /** When the inference was run. */
  readonly inferredAt: Date;
}

// ---------------------------------------------------------------------------
// Anti-pattern scan result
// ---------------------------------------------------------------------------

/**
 * IAntiPatternScanResult — output of scanning a goal or specification
 * against the anti-pattern library.
 *
 * Spec Section 2.2, Stage 4 Method 6 — scanning identifies what has
 * gone wrong in similar builds before, producing alerts that are
 * included in the living specification at Stage 6.
 */
export interface IAntiPatternScanResult {
  /** Anti-pattern alerts triggered by the scan. Sorted by confidence then failure rate. */
  readonly alerts: readonly IAntiPatternAlert[];

  /** Total anti-patterns checked against. */
  readonly patternsChecked: number;

  /** Task types that were scanned. */
  readonly taskTypesScanned: readonly string[];

  /**
   * Formatted alert strings for direct inclusion in the living specification.
   * Each string is a complete "DO NOT..." or "ALWAYS..." statement with context.
   *
   * Spec Section 2.2 Stage 6 — anti-pattern alerts section of the living spec.
   */
  readonly formattedAlerts: readonly string[];
}

// ---------------------------------------------------------------------------
// Anti-pattern library (persistent store)
// ---------------------------------------------------------------------------

/**
 * IAntiPatternLibrary — the persistent store for inferred anti-patterns.
 *
 * Managed by the Librarian as part of the knowledge base. Anti-patterns
 * are inferred from dead-end trails, violation records, and cross-build
 * failure patterns, then stored here for retrieval during ICE processing
 * and golden window formation.
 *
 * Spec Section 3.2 — "Manages the knowledge base. Captures experiential
 * trail entries from all agent sessions in real time. Maintains the
 * anti-pattern library."
 *
 * Spec Section 4.2 — Tier 1 Shared Services: "Knowledge Base (Librarian) —
 * Experiential trails, anti-patterns, cross-build patterns — Permanent,
 * cross-project."
 */
export interface IAntiPatternLibrary {
  /** Insert a new anti-pattern. Returns the stored entry with generated ID. */
  insert(antiPattern: Omit<IAntiPattern, "id">): IAntiPattern;

  /** Retrieve an anti-pattern by ID. */
  getById(id: string): IAntiPattern | null;

  /**
   * Query anti-patterns by task type and other filters.
   * The primary query path for ICE Stage 4 and golden window formation.
   */
  query(params: IAntiPatternQuery): readonly IAntiPattern[];

  /** Get all active anti-patterns. */
  getAll(): readonly IAntiPattern[];

  /**
   * Update an existing anti-pattern (e.g., increment occurrence count,
   * update failure rate, confirm freshness).
   */
  update(id: string, updates: Partial<Pick<IAntiPattern,
    | "occurrenceCount"
    | "failureRate"
    | "confidence"
    | "lastConfirmedAt"
    | "status"
    | "sourceTrailIds"
    | "sourceViolationIds"
    | "alternativeGuidance"
  >>): IAntiPattern | null;

  /**
   * Mark an anti-pattern as deprecated (stale, no recent evidence).
   *
   * Spec Section 3.2 — "depreciates trails that haven't been confirmed
   * in recent builds, without deleting them."
   */
  deprecate(id: string): void;

  /**
   * Confirm an anti-pattern is still relevant (update lastConfirmedAt).
   * Called when a build encounters the same failure or successfully
   * avoids it via the alert.
   */
  confirm(id: string): void;

  /** Count anti-patterns matching the query (or all if no query). */
  count(params?: IAntiPatternQuery): number;
}

// ---------------------------------------------------------------------------
// Anti-pattern inferencer
// ---------------------------------------------------------------------------

/**
 * IAntiPatternInferencer — analyzes trails and violation records to
 * detect recurring failure patterns and synthesize anti-pattern entries.
 *
 * Three analysis methods correspond to the three sources of negative knowledge:
 *
 * 1. Dead-end trails — "approaches that were tried and abandoned, with
 *    reasoning for why they failed" (Spec Section 6.3)
 * 2. Violation records — "implementations that were fired for contract
 *    violations" (Spec Section 6.3)
 * 3. Cross-build patterns — "aggregated insights that only emerge across
 *    many builds" (Spec Section 6.3)
 *
 * Spec Section 2.2, Stage 4 Method 6 — "using the knowledge base's
 * accumulated experiential trails, identifies what has gone wrong in
 * similar builds before."
 *
 * Spec Section 9.2, Step 1 — "Trail Extraction — the Librarian extracts
 * all valuable data... This goes to the anti-pattern library, the
 * monitoring system's training data, and the ICE improvement pipeline."
 */
export interface IAntiPatternInferencer {
  /**
   * Analyze dead-end trails for recurring failure patterns.
   * Groups trails by task type, identifies common failure modes,
   * and synthesizes anti-pattern entries where patterns recur.
   *
   * Spec Section 6.3 — "Dead-end trails — approaches that were tried
   * and abandoned, with reasoning for why they failed."
   */
  analyzeDeadEndTrails(
    trails: readonly ITrailEntry[],
  ): readonly Omit<IAntiPattern, "id">[];

  /**
   * Analyze violation records for contract violation patterns.
   * Groups violations by goal type and source, identifies recurring
   * violations that indicate systematic anti-patterns.
   *
   * Spec Section 9.2 Step 1 — violation data feeds the anti-pattern library.
   */
  analyzeViolations(
    violations: readonly IViolationRecord[],
  ): readonly Omit<IAntiPattern, "id">[];

  /**
   * Analyze cross-build patterns for statistical failure patterns.
   * Examines all trails (not just dead-ends) for task types where
   * first-pass failure rates exceed threshold.
   *
   * Spec Section 6.3 — "Cross-build pattern trails — aggregated insights
   * that only emerge across many builds."
   */
  analyzeCrossBuildPatterns(
    trails: readonly ITrailEntry[],
  ): readonly Omit<IAntiPattern, "id">[];

  /**
   * Run the full inference pipeline — all three analysis methods.
   * Queries the trail store and violation data, runs all analyzers,
   * deduplicates results, and returns the complete inference output.
   *
   * Spec Section 2.3 — "After 1,000 builds, ICE doesn't just infer
   * what users want — it KNOWS what users in specific domains want,
   * what the competitive landscape looks like, what the technical
   * constraints are, and what mistakes to avoid."
   */
  runFullInference(): Promise<IInferenceResult>;
}

// ---------------------------------------------------------------------------
// Anti-pattern scanner (ICE Stage 6 integration)
// ---------------------------------------------------------------------------

/**
 * IAntiPatternScanner — scans proposed goals and specifications against
 * the anti-pattern library to produce alerts.
 *
 * This is the integration point between the anti-pattern library and
 * the ICE pipeline. Scans are triggered:
 * - During ICE Stage 4 (Method 6) — to enrich intent with anti-pattern knowledge
 * - During ICE Stage 6 — to include alerts in the living specification
 * - During golden window formation (Step 8) — to inject relevant alerts
 *
 * Spec Section 2.2, Stage 4 Method 6 — Anti-Pattern Inference
 * Spec Section 2.2, Stage 6 — Anti-Pattern Alerts in Spec Assembly
 * Spec Section 5.4, Step 8 — Anti-pattern alerts in golden window
 */
export interface IAntiPatternScanner {
  /**
   * Scan a proposed goal against the anti-pattern library.
   * Returns alerts for any anti-patterns matching the goal's task type
   * or tech stack.
   *
   * Used during golden window formation (Step 8) to inject anti-pattern
   * alerts relevant to the agent's upcoming work.
   *
   * Spec Section 5.4, Step 8 — "Anti-pattern alerts relevant to
   * upcoming work."
   */
  scanGoal(
    taskType: string,
    goalDescription: string,
    techStack: readonly string[],
  ): IAntiPatternScanResult;

  /**
   * Scan the full living specification for anti-pattern matches.
   * Returns alerts across all features and integrations.
   *
   * Used during ICE Stage 6 to include anti-pattern alerts in the
   * living specification's anti-pattern section.
   *
   * Spec Section 2.2, Stage 6 — "Anti-Pattern Alerts — derived from
   * the knowledge base (Stage 4, Method 6)."
   */
  scanSpecification(
    features: readonly { taskType: string; description: string; techStack: readonly string[] }[],
  ): IAntiPatternScanResult;
}

// ---------------------------------------------------------------------------
// Anti-pattern alert formatter
// ---------------------------------------------------------------------------

/**
 * IAntiPatternAlertFormatter — formats anti-pattern alerts for injection
 * into the living specification and golden window.
 *
 * Produces two output formats:
 * 1. Spec alerts — "DO NOT..." / "ALWAYS..." statements for the living spec
 * 2. Golden window alerts — richer context for agent injection
 *
 * Spec Section 2.2, Stage 6 — "presented as explicit warnings:
 * 'DO NOT use the browser's default video player. DO NOT skip
 * client-side file validation.'"
 *
 * Spec Section 5.4, Step 8 — anti-pattern alerts in golden window
 */
export interface IAntiPatternAlertFormatter {
  /**
   * Format alerts for the living specification's anti-pattern section.
   * Returns concise "DO NOT..." / "ALWAYS..." strings.
   *
   * Spec Section 2.2, Stage 6 — explicit warnings in the living spec.
   */
  formatForSpecification(
    alerts: readonly IAntiPatternAlert[],
  ): readonly string[];

  /**
   * Format alerts for golden window injection (Step 8).
   * Returns richer text with statistical context and recommendations,
   * sized to fit within the golden window token budget.
   *
   * Spec Section 5.4, Step 8 — "Anti-pattern alerts relevant to
   * upcoming work."
   *
   * @param alerts — the alerts to format
   * @param maxTokens — approximate token budget (default: 1500)
   */
  formatForGoldenWindow(
    alerts: readonly IAntiPatternAlert[],
    maxTokens?: number,
  ): string;
}

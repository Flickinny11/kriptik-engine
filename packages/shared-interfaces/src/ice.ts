/**
 * Intent Engine 2.0 (ICE) interfaces — the seven-stage pipeline that
 * transforms a user's natural language prompt into a complete, technically
 * grounded, design-informed living specification.
 *
 * Spec Section 2.1 — The Problem ICE 2.0 Solves
 * Spec Section 2.2 — The Seven-Stage Pipeline
 */

// ---------------------------------------------------------------------------
// Intent layers
// ---------------------------------------------------------------------------

/** The three layers of user intent extracted by the Intent Decoupler (Stage 1). */
export interface IIntentLayers {
  /** What the user literally said — explicit features and constraints. */
  readonly surface: readonly string[];
  /** What the user wants to DO — implied workflows, quality expectations. */
  readonly deep: readonly string[];
  /** Things the user didn't say but would be confused without. */
  readonly unstated: {
    readonly critical: readonly string[];   // Must-have
    readonly expected: readonly string[];   // Should-have
    readonly delightful: readonly string[]; // Nice-to-have
  };
}

// ---------------------------------------------------------------------------
// Design brief (from competitive intelligence, Stage 2)
// ---------------------------------------------------------------------------

/** Design direction derived from competitive analysis. Spec Section 2.2, Stage 2. */
export interface IDesignBrief {
  /** Overall theme direction (e.g. "Clean, modern with prominent board view"). */
  readonly theme: string;
  /** Quality tier target. */
  readonly qualityTier: string;
  /** Patterns users expect based on competitive landscape. */
  readonly mustMatchPatterns: readonly string[];
  /** Layout recommendations. */
  readonly layoutRecommendations: readonly string[];
  /** Interaction standards from competitor analysis. */
  readonly interactionStandards: readonly string[];
  /** Reference URLs or screenshots. */
  readonly references: readonly string[];
}

// ---------------------------------------------------------------------------
// Technical constraint map (from surface probing, Stage 3)
// ---------------------------------------------------------------------------

/**
 * Structured constraint map for an external integration.
 * Spec Section 2.2, Stage 3 — Technical Surface Probing.
 */
export interface IConstraintMap {
  /** The service/API this map covers (e.g. "Stripe", "Pusher"). */
  readonly service: string;
  /** API endpoint inventory. */
  readonly endpoints: readonly IEndpointConstraint[];
  /** Known rate limits. */
  readonly rateLimits: readonly string[];
  /** Error codes and their meanings. */
  readonly errorCodes: readonly string[];
  /** Gotchas discovered during probing or from trail history. */
  readonly gotchas: readonly string[];
  /** SDK/library recommendations. */
  readonly sdkRecommendation: string;
  /** Whether live endpoint testing was performed. */
  readonly liveTestPerformed: boolean;
}

export interface IEndpointConstraint {
  readonly path: string;
  readonly method: string;
  readonly description: string;
  readonly inputConstraints: readonly string[];
  readonly outputFormat: string;
}

// ---------------------------------------------------------------------------
// Living specification
// ---------------------------------------------------------------------------

/**
 * ILivingSpecification — the spec produced by ICE 2.0.
 *
 * Serves as the single source of truth that all agents build against.
 * Auto-updates when agents discover constraints. Interface contracts are
 * enforced at the merge gate.
 *
 * Spec Section 1.3, Principle 4 — Living Specification as Shared Truth.
 * Spec Section 2.2, Stages 6-7 — Spec Assembly and User Approval.
 */
export interface ILivingSpecification {
  /** Unique version identifier. Incremented on every Architect revision. */
  readonly version: number;
  /** The build this specification belongs to. */
  readonly buildId: string;

  /** The original user prompt. */
  readonly rawPrompt: string;
  /** Structured intent layers from the Decoupler. */
  readonly intent: IIntentLayers;

  /** Feature inventory — every feature to be built. */
  readonly features: readonly IFeatureSpec[];
  /** Design system specification derived from the Design Brief. */
  readonly designSystem: IDesignBrief;
  /** Technical constraint maps for every external integration. */
  readonly constraintMaps: readonly IConstraintMap[];
  /** Anti-pattern alerts from the knowledge base. Spec Section 2.2, Stage 4 Method 6. */
  readonly antiPatternAlerts: readonly string[];

  /** Dependency manifest — all external services, libraries, platforms. */
  readonly dependencies: readonly IDependencySpec[];

  /** Timestamp of last modification. */
  readonly updatedAt: Date;
}

/** A single feature within the living specification. */
export interface IFeatureSpec {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Which intent layer this feature addresses. */
  readonly intentSource: "surface" | "deep" | "unstated";
  /** External dependencies this feature requires. */
  readonly requiredIntegrations: readonly string[];
}

/** An external dependency in the living specification. */
export interface IDependencySpec {
  readonly name: string;
  readonly version: string;
  /** Integration method priority: MCP > CLI > SDK > REST. Spec Section 6.1, Layer 2. */
  readonly integrationMethod: "mcp" | "cli" | "sdk" | "rest";
  /** Credential access path through the gateway. */
  readonly credentialPath: string;
}

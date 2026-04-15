/**
 * Intent Satisfaction Agent — validates build meets original user intent.
 *
 * Analyzes the living specification (original intent, features, constraints,
 * design brief) against the actual build output to verify that the built
 * application matches what the user asked for — including unstated needs
 * inferred by ICE's six methods.
 *
 * Phase C, Step 15 — Journey and Intent Verification Agents
 * Spec Section 10.1 — "The intent verification agent confirms the built
 * app matches the original prompt (including unstated needs)."
 * Spec Section 2.1 — ICE captures surface, deep, and unstated intent.
 * Spec Section 2.2, Stage 3 — constraint maps from Technical Surface Probing.
 */

import type {
  IIntentSatisfactionAgent,
  IIntentSatisfactionResult,
  IFeatureAssessment,
  IConstraintAssessment,
  ILivingSpecification,
  IBuildArtifactsSummary,
  ILiveAgentSession,
} from "@kriptik/shared-interfaces";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Configuration for the Intent Satisfaction Agent. */
export interface IntentSatisfactionAgentConfig {
  /** The Opus 4.6 agent session for reasoning about intent satisfaction. */
  readonly session: ILiveAgentSession;
  /** The build this agent belongs to. */
  readonly buildId: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class IntentSatisfactionAgent implements IIntentSatisfactionAgent {
  readonly agentId: string;
  readonly buildId: string;
  private readonly session: ILiveAgentSession;

  constructor(config: IntentSatisfactionAgentConfig) {
    this.agentId = config.session.session.id;
    this.buildId = config.buildId;
    this.session = config.session;
  }

  async verify(
    spec: ILivingSpecification,
    artifacts: IBuildArtifactsSummary,
  ): Promise<IIntentSatisfactionResult> {
    // Send the verification prompt to the agent
    const prompt = buildIntentPrompt(spec, artifacts);
    const response = await this.session.send(prompt);

    // Parse feature assessments from the response
    const featureAssessments = parseFeatureAssessments(
      response.textContent,
      spec,
    );

    // Parse constraint assessments
    const constraintAssessments = parseConstraintAssessments(
      response.textContent,
      spec,
    );

    // Parse design brief assessment
    const designBriefHonoredRaw = extractField(
      response.textContent,
      "DESIGN_BRIEF_HONORED",
    );
    const designBriefHonored = designBriefHonoredRaw
      ? designBriefHonoredRaw.toUpperCase().startsWith("YES")
      : true;
    const designBriefAssessment =
      extractField(response.textContent, "DESIGN_BRIEF_ASSESSMENT")
      || "Design brief assessment not available.";

    // Compute coverage metrics
    const surfaceFeatures = featureAssessments.filter(
      (f) => f.intentSource === "surface",
    );
    const inferredFeatures = featureAssessments.filter(
      (f) => f.intentSource === "deep" || f.intentSource === "unstated",
    );

    const explicitCoverage = computeCoverage(surfaceFeatures);
    const inferredCoverage = computeCoverage(inferredFeatures);

    // Parse or compute overall intent score
    const intentScoreRaw = extractField(
      response.textContent,
      "INTENT_SCORE",
    );
    const intentScore = intentScoreRaw
      ? clamp(parseInt(intentScoreRaw, 10) || 0, 0, 100)
      : computeIntentScore(
          explicitCoverage,
          inferredCoverage,
          designBriefHonored,
          constraintAssessments,
        );

    // Parse overall satisfaction
    const overallSatisfiedRaw = extractField(
      response.textContent,
      "OVERALL_SATISFIED",
    );
    const overallSatisfied = overallSatisfiedRaw
      ? overallSatisfiedRaw.toUpperCase().startsWith("YES")
      : intentScore >= 80;
    const overallAssessment =
      extractField(response.textContent, "OVERALL_ASSESSMENT")
      || `Intent score: ${intentScore}. Explicit coverage: ${explicitCoverage}%. `
        + `Inferred coverage: ${inferredCoverage}%.`;

    return {
      buildId: this.buildId,
      intentScore,
      explicitCoverage,
      inferredCoverage,
      featureAssessments,
      constraintAssessments,
      designBriefHonored,
      designBriefAssessment,
      overallSatisfied,
      overallAssessment,
      evaluatedAt: new Date(),
    };
  }
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildIntentPrompt(
  spec: ILivingSpecification,
  artifacts: IBuildArtifactsSummary,
): string {
  // Format the original intent layers
  const intentSection =
    `ORIGINAL USER PROMPT:\n${spec.rawPrompt}\n\n`
    + `SURFACE INTENT (explicit):\n${spec.intent.surface.map((s) => `- ${s}`).join("\n")}\n\n`
    + `DEEP INTENT (implied):\n${spec.intent.deep.map((s) => `- ${s}`).join("\n")}\n\n`
    + `UNSTATED NEEDS:\n`
    + `  Critical: ${spec.intent.unstated.critical.map((s) => `- ${s}`).join("\n  ")}\n`
    + `  Expected: ${spec.intent.unstated.expected.map((s) => `- ${s}`).join("\n  ")}\n`
    + `  Delightful: ${spec.intent.unstated.delightful.map((s) => `- ${s}`).join("\n  ")}`;

  // Format features
  const featureSection = spec.features
    .map(
      (f) =>
        `FEATURE: ${f.id}\n`
        + `NAME: ${f.name}\n`
        + `SOURCE: ${f.intentSource}\n`
        + `DESCRIPTION: ${f.description}\n`
        + `INTEGRATIONS: ${f.requiredIntegrations.join(", ") || "none"}`,
    )
    .join("\n\n");

  // Format constraint maps
  const constraintSection = spec.constraintMaps
    .map(
      (c) =>
        `SERVICE: ${c.service}\n`
        + `ENDPOINTS: ${c.endpoints.length}\n`
        + `GOTCHAS: ${c.gotchas.join("; ") || "none"}\n`
        + `RATE_LIMITS: ${c.rateLimits.join("; ") || "none"}`,
    )
    .join("\n\n");

  // Format design brief
  const designSection =
    `THEME: ${spec.designSystem.theme}\n`
    + `QUALITY_TIER: ${spec.designSystem.qualityTier}\n`
    + `MUST_MATCH: ${spec.designSystem.mustMatchPatterns.join(", ")}\n`
    + `INTERACTIONS: ${spec.designSystem.interactionStandards.join(", ")}`;

  // Format build artifacts
  const artifactSection =
    `FILES: ${artifacts.files.length} total\n`
    + `ROUTES: ${artifacts.routes.join(", ") || "none detected"}\n`
    + `INTEGRATIONS: ${artifacts.integrations.join(", ") || "none detected"}\n`
    + `INTEGRATION_BUILD: ${artifacts.integrationPassing ? "PASSING" : "FAILING"}\n`
    + `TESTS: ${artifacts.testsPassCount} passing, ${artifacts.testsFailCount} failing`;

  return (
    `You are the Intent Satisfaction Agent. Your task is to verify that the `
    + `built application matches the original user intent — including surface, `
    + `deep, and unstated needs.\n\n`
    + `${intentSection}\n\n`
    + `LIVING SPECIFICATION FEATURES:\n${featureSection}\n\n`
    + `CONSTRAINT MAPS:\n${constraintSection}\n\n`
    + `DESIGN BRIEF:\n${designSection}\n\n`
    + `BUILD ARTIFACTS:\n${artifactSection}\n\n`
    + `For each feature, respond with:\n`
    + `FEATURE_ID: <id>\n`
    + `IMPLEMENTED: YES|NO\n`
    + `FUNCTIONAL: YES|NO\n`
    + `CONFIDENCE: <0.0-1.0>\n`
    + `FEATURE_ASSESSMENT: <your assessment>\n\n`
    + `For each constraint map service, respond with:\n`
    + `CONSTRAINT_SERVICE: <service name>\n`
    + `CONSTRAINT: <what is being checked>\n`
    + `CONSTRAINT_MET: YES|NO\n`
    + `CONSTRAINT_ASSESSMENT: <your assessment>\n\n`
    + `Then provide:\n`
    + `DESIGN_BRIEF_HONORED: YES|NO\n`
    + `DESIGN_BRIEF_ASSESSMENT: <assessment>\n`
    + `INTENT_SCORE: <0-100>\n`
    + `OVERALL_SATISFIED: YES|NO\n`
    + `OVERALL_ASSESSMENT: <your overall assessment>`
  );
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function parseFeatureAssessments(
  text: string,
  spec: ILivingSpecification,
): IFeatureAssessment[] {
  const assessments: IFeatureAssessment[] = [];

  for (const feature of spec.features) {
    const block = extractFeatureBlock(text, feature.id);

    const implementedRaw = block
      ? extractField(block, "IMPLEMENTED")
      : null;
    const functionalRaw = block
      ? extractField(block, "FUNCTIONAL")
      : null;
    const confidenceRaw = block
      ? extractField(block, "CONFIDENCE")
      : null;
    const assessmentText = block
      ? extractField(block, "FEATURE_ASSESSMENT")
      : null;

    assessments.push({
      featureId: feature.id,
      featureName: feature.name,
      intentSource: feature.intentSource,
      implemented: implementedRaw
        ? implementedRaw.toUpperCase().startsWith("YES")
        : false,
      functional: functionalRaw
        ? functionalRaw.toUpperCase().startsWith("YES")
        : false,
      assessment:
        assessmentText || "No assessment available from verification agent.",
      confidence: confidenceRaw
        ? clamp(parseFloat(confidenceRaw) || 0, 0, 1)
        : 0.5,
    });
  }

  return assessments;
}

function parseConstraintAssessments(
  text: string,
  spec: ILivingSpecification,
): IConstraintAssessment[] {
  const assessments: IConstraintAssessment[] = [];

  // Extract all CONSTRAINT_SERVICE blocks
  const blocks = text.split(/(?=CONSTRAINT_SERVICE:)/i).slice(1);

  for (const block of blocks) {
    const service = extractField(block, "CONSTRAINT_SERVICE");
    const constraint = extractField(block, "CONSTRAINT");
    const metRaw = extractField(block, "CONSTRAINT_MET");
    const assessment = extractField(block, "CONSTRAINT_ASSESSMENT");

    if (service) {
      assessments.push({
        service,
        constraint: constraint || "General constraint",
        met: metRaw ? metRaw.toUpperCase().startsWith("YES") : true,
        assessment: assessment || "No assessment available.",
      });
    }
  }

  // If the agent didn't produce per-service blocks, create default entries
  // for each constraint map service
  if (assessments.length === 0) {
    for (const cm of spec.constraintMaps) {
      assessments.push({
        service: cm.service,
        constraint: `Integration with ${cm.service}`,
        met: true,
        assessment: "Constraint assessment not available from agent response.",
      });
    }
  }

  return assessments;
}

function extractFeatureBlock(text: string, featureId: string): string | null {
  const pattern = new RegExp(
    `FEATURE_ID:\\s*${escapeRegExp(featureId)}\\b([\\s\\S]*?)(?=FEATURE_ID:|CONSTRAINT_SERVICE:|DESIGN_BRIEF_HONORED:|$)`,
    "i",
  );
  const match = pattern.exec(text);
  return match ? match[1]!.trim() : null;
}

function extractField(text: string, fieldName: string): string | null {
  const regex = new RegExp(`${fieldName}:\\s*(.+?)(?:\\n|$)`, "i");
  const match = regex.exec(text);
  return match ? match[1]!.trim() : null;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function computeCoverage(assessments: readonly IFeatureAssessment[]): number {
  if (assessments.length === 0) return 100;
  const implemented = assessments.filter(
    (a) => a.implemented && a.functional,
  ).length;
  return Math.round((implemented / assessments.length) * 100);
}

function computeIntentScore(
  explicitCoverage: number,
  inferredCoverage: number,
  designBriefHonored: boolean,
  constraints: readonly IConstraintAssessment[],
): number {
  // Weighted: explicit features 40%, inferred features 30%,
  // design brief 15%, constraints 15%
  const constraintScore =
    constraints.length > 0
      ? Math.round(
          (constraints.filter((c) => c.met).length / constraints.length) * 100,
        )
      : 100;
  const designScore = designBriefHonored ? 100 : 50;

  return Math.round(
    explicitCoverage * 0.4
    + inferredCoverage * 0.3
    + designScore * 0.15
    + constraintScore * 0.15,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

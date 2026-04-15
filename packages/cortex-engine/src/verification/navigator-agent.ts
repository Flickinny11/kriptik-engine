/**
 * NavigatorAgent — browser-based visual verification agent.
 *
 * A vision-capable Opus 4.6 agent that uses the app as a human would.
 * Wraps an ILiveAgentSession (navigator role) and sends structured
 * prompts to direct the agent through journey steps, collecting visual
 * observations and screenshots.
 *
 * The intelligence lives in the Anthropic API session — this class
 * coordinates what the agent is asked to do and parses its responses
 * into structured results.
 *
 * Spec Section 8.1 — Navigator Agent.
 * Spec Section 1.4 — vision for UX verification.
 * Spec Section 7.3 Layer 6 — UX Verification (scored assessment).
 * Spec Section 12.4, Phase C Step 12 — UX Verification Teams.
 */

import type {
  ILiveAgentSession,
  INavigatorAgent,
  INavigatorStepResult,
  IVisualQualityAssessment,
  IQualityDimension,
  IJourneyStep,
} from "@kriptik/shared-interfaces";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface NavigatorAgentConfig {
  /** The live agent session (navigator role). */
  readonly session: ILiveAgentSession;
  /** The build this Navigator belongs to. */
  readonly buildId: string;
}

// ---------------------------------------------------------------------------
// Quality dimension names — spec Section 8.1
// ---------------------------------------------------------------------------

const QUALITY_DIMENSIONS = [
  "responsiveness",
  "loadingStates",
  "errorStates",
  "visualPolish",
  "flowCoherence",
  "contentQuality",
  "mobileResponsiveness",
] as const;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * NavigatorAgent implementation.
 *
 * Sends structured prompts to the underlying agent session, which is an
 * Opus 4.6 API conversation with BROWSER_TOOLS (navigate_to, take_screenshot).
 * The agent uses computer-use to interact with the app and reports back
 * what it sees visually.
 */
export class NavigatorAgent implements INavigatorAgent {
  readonly agentId: string;
  readonly buildId: string;
  private readonly session: ILiveAgentSession;

  constructor(config: NavigatorAgentConfig) {
    this.agentId = config.session.session.id;
    this.buildId = config.buildId;
    this.session = config.session;
  }

  /**
   * Execute a journey step by directing the agent to navigate, interact,
   * and observe.
   *
   * Sends a structured prompt describing the action and expected outcome,
   * then parses the agent's visual observation from its response.
   */
  async executeStep(
    step: IJourneyStep,
    appUrl: string,
  ): Promise<INavigatorStepResult> {
    const url = step.route ? `${appUrl}${step.route}` : appUrl;

    const prompt = [
      `Execute this journey step and report what you see:`,
      ``,
      `**Step ${step.order}:** ${step.action}`,
      `**URL:** ${url}`,
      `**Expected Outcome:** ${step.expectedOutcome}`,
      ``,
      `1. Navigate to the URL if needed`,
      `2. Perform the described action`,
      `3. Take a screenshot after the action completes`,
      `4. Report exactly what you see on screen`,
      `5. Note any visual issues: flash of unstyled content, missing feedback,`,
      `   broken layouts, placeholder text, animation glitches, loading states`,
      ``,
      `Format your response as:`,
      `OBSERVATION: [what you saw on screen after performing the action]`,
      `PASSED: [true/false — did the expected outcome occur?]`,
      `SCREENSHOT: [reference to the screenshot you took]`,
      `VISUAL_ISSUES: [comma-separated list, or "none"]`,
    ].join("\n");

    const response = await this.session.send(prompt);
    return this.parseStepResponse(step.id, response.textContent);
  }

  /**
   * Assess visual quality across the seven dimensions defined in spec Section 8.1.
   *
   * Directs the agent to evaluate the route against each dimension,
   * producing scores and observations.
   */
  async assessVisualQuality(
    route: string,
    appUrl: string,
  ): Promise<IVisualQualityAssessment> {
    const url = `${appUrl}${route}`;

    const prompt = [
      `Assess the visual quality of this page across seven dimensions.`,
      `Navigate to ${url} and evaluate each dimension on a 0-10 scale:`,
      ``,
      `1. **Responsiveness** — Does the UI give immediate feedback on interaction?`,
      `2. **Loading States** — Are there appropriate indicators that communicate what's happening?`,
      `3. **Error States** — Are error messages helpful vs cryptic? Is recovery possible?`,
      `4. **Visual Polish** — Flash of unstyled content? Smooth transitions? Consistent spacing?`,
      `5. **Flow Coherence** — Logical navigation? Dead ends?`,
      `6. **Content Quality** — Placeholder text still present? Content makes sense?`,
      `7. **Mobile Responsiveness** — Layout adapts to mobile viewports?`,
      ``,
      `For each dimension respond with:`,
      `DIMENSION: [name]`,
      `SCORE: [0-10]`,
      `OBSERVATIONS: [what you observed]`,
      `ISSUES: [any issues found, or "none"]`,
    ].join("\n");

    const response = await this.session.send(prompt);
    return this.parseQualityResponse(route, response.textContent);
  }

  // -------------------------------------------------------------------------
  // Response parsing
  // -------------------------------------------------------------------------

  /**
   * Parse the agent's step execution response into structured result.
   *
   * The agent is prompted to respond in a known format. If parsing fails,
   * the raw response is used as the observation with passed = false.
   */
  private parseStepResponse(
    stepId: string,
    text: string,
  ): INavigatorStepResult {
    const observation = extractField(text, "OBSERVATION") || text.trim();
    const passedStr = extractField(text, "PASSED");
    const screenshotRef = extractField(text, "SCREENSHOT") || undefined;
    const issuesStr = extractField(text, "VISUAL_ISSUES") || "";

    const passed = passedStr?.toLowerCase() === "true";
    const visualIssues =
      issuesStr.toLowerCase() === "none" || issuesStr === ""
        ? []
        : issuesStr.split(",").map((s) => s.trim()).filter(Boolean);

    return {
      stepId,
      observation,
      screenshotRef,
      passed,
      visualIssues,
    };
  }

  /**
   * Parse the agent's quality assessment response into structured dimensions.
   */
  private parseQualityResponse(
    route: string,
    text: string,
  ): IVisualQualityAssessment {
    const dimensions = new Map<string, IQualityDimension>();

    for (const name of QUALITY_DIMENSIONS) {
      dimensions.set(name, parseDimensionBlock(text, name));
    }

    const scores = [...dimensions.values()].map((d) => d.score);
    const overallScore =
      scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
        : 0;

    return {
      route,
      responsiveness: dimensions.get("responsiveness")!,
      loadingStates: dimensions.get("loadingStates")!,
      errorStates: dimensions.get("errorStates")!,
      visualPolish: dimensions.get("visualPolish")!,
      flowCoherence: dimensions.get("flowCoherence")!,
      contentQuality: dimensions.get("contentQuality")!,
      mobileResponsiveness: dimensions.get("mobileResponsiveness")!,
      overallScore,
    };
  }
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Extract a named field from structured text response.
 * Matches "FIELD_NAME: value" or "FIELD_NAME: value\n".
 */
function extractField(text: string, fieldName: string): string | null {
  const regex = new RegExp(`${fieldName}:\\s*(.+?)(?:\\n|$)`, "i");
  const match = regex.exec(text);
  return match ? match[1]!.trim() : null;
}

/**
 * Parse a dimension block from the quality assessment response.
 * Falls back to a zero-score dimension if parsing fails.
 */
function parseDimensionBlock(
  text: string,
  dimensionName: string,
): IQualityDimension {
  const scoreStr = extractDimensionField(text, dimensionName, "SCORE");
  const observationsStr = extractDimensionField(text, dimensionName, "OBSERVATIONS");
  const issuesStr = extractDimensionField(text, dimensionName, "ISSUES");

  const score = scoreStr ? Math.min(10, Math.max(0, parseFloat(scoreStr) || 0)) : 0;
  const observations = observationsStr
    ? [observationsStr]
    : [];
  const issues =
    !issuesStr || issuesStr.toLowerCase() === "none"
      ? []
      : [issuesStr];

  return { name: dimensionName, score, observations, issues };
}

/**
 * Extract a field value within a dimension block.
 * Looks for the dimension name header, then the field within it.
 */
function extractDimensionField(
  text: string,
  dimensionName: string,
  fieldName: string,
): string | null {
  // Find the section for this dimension (case-insensitive, flexible matching)
  const dimRegex = new RegExp(
    `(?:DIMENSION:\\s*)?${dimensionName}[\\s\\S]*?${fieldName}:\\s*(.+?)(?:\\n|$)`,
    "i",
  );
  const match = dimRegex.exec(text);
  return match ? match[1]!.trim() : null;
}

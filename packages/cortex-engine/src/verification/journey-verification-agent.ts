/**
 * Journey Verification Agent — validates all user journeys are functional.
 *
 * Takes the UX Verification Team's journey test results and the living
 * specification, then verifies that every user journey from the spec
 * has been tested and meets requirements. This is a verification
 * ASSESSMENT agent — it reasons about test results, not executes tests.
 *
 * Phase C, Step 15 — Journey and Intent Verification Agents
 * Spec Section 10.1 — "Every user journey identified in the living
 * specification has been tested by the UX Verification Team."
 */

import type {
  IJourneyVerificationAgent,
  IJourneyVerificationResult,
  IJourneyAssessment,
  ILivingSpecification,
  IUXVerificationResult,
  IUserJourney,
  IJourneyTestResult,
  IUXIssue,
  ILiveAgentSession,
} from "@kriptik/shared-interfaces";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Configuration for the Journey Verification Agent. */
export interface JourneyVerificationAgentConfig {
  /** The Opus 4.6 agent session for reasoning about journey results. */
  readonly session: ILiveAgentSession;
  /** The build this agent belongs to. */
  readonly buildId: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class JourneyVerificationAgent implements IJourneyVerificationAgent {
  readonly agentId: string;
  readonly buildId: string;
  private readonly session: ILiveAgentSession;

  constructor(config: JourneyVerificationAgentConfig) {
    this.agentId = config.session.session.id;
    this.buildId = config.buildId;
    this.session = config.session;
  }

  async verify(
    uxResult: IUXVerificationResult,
    journeys: readonly IUserJourney[],
    spec: ILivingSpecification,
  ): Promise<IJourneyVerificationResult> {
    // Build a map from journeyId to test result for fast lookup
    const resultsByJourney = new Map<string, IJourneyTestResult>();
    for (const jr of uxResult.journeyResults) {
      resultsByJourney.set(jr.journeyId, jr);
    }

    // Send the verification prompt to the agent
    const prompt = buildVerificationPrompt(journeys, uxResult, spec);
    const response = await this.session.send(prompt);

    // Parse the agent's assessment
    const assessments = parseJourneyAssessments(
      response.textContent,
      journeys,
      resultsByJourney,
    );

    // Collect unresolved critical/high issues across all tested journeys
    const unresolvedHighIssues: IUXIssue[] = [];
    for (const jr of uxResult.journeyResults) {
      for (const issue of jr.issues) {
        if (
          !issue.resolved &&
          (issue.severity === "critical" || issue.severity === "high")
        ) {
          unresolvedHighIssues.push(issue);
        }
      }
    }

    const testedJourneys = assessments.filter((a) => a.tested).length;
    const passedJourneys = assessments.filter(
      (a) => a.tested && a.meetsSpecification,
    ).length;
    const allJourneysVerified =
      testedJourneys === journeys.length &&
      passedJourneys === journeys.length &&
      unresolvedHighIssues.length === 0;

    const overallAssessment = extractField(response.textContent, "OVERALL")
      || `${passedJourneys}/${journeys.length} journeys verified. `
        + `${unresolvedHighIssues.length} unresolved high/critical issues.`;

    return {
      buildId: this.buildId,
      journeyAssessments: assessments,
      totalJourneys: journeys.length,
      testedJourneys,
      passedJourneys,
      allJourneysVerified,
      unresolvedHighIssues,
      overallAssessment,
      evaluatedAt: new Date(),
    };
  }
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildVerificationPrompt(
  journeys: readonly IUserJourney[],
  uxResult: IUXVerificationResult,
  spec: ILivingSpecification,
): string {
  const journeySummaries = journeys.map((j) => {
    const testResult = uxResult.journeyResults.find(
      (r) => r.journeyId === j.id,
    );
    const status = testResult
      ? testResult.passed
        ? "PASSED"
        : "FAILED"
      : "NOT TESTED";
    const issueCount = testResult ? testResult.issues.length : 0;
    const steps = j.steps
      .map((s) => `  ${s.order}. ${s.action} → ${s.expectedOutcome}`)
      .join("\n");
    return (
      `JOURNEY: ${j.id} — ${j.name}\n`
      + `STATUS: ${status}\n`
      + `ISSUES: ${issueCount}\n`
      + `FEATURES: ${j.featureIds.join(", ")}\n`
      + `STEPS:\n${steps}`
    );
  });

  const featureList = spec.features
    .map(
      (f) =>
        `- ${f.id}: ${f.name} (${f.intentSource}) — ${f.description}`,
    )
    .join("\n");

  return (
    `You are the Journey Verification Agent. Your task is to assess whether `
    + `ALL user journeys from the living specification have been tested and `
    + `meet the specification's requirements.\n\n`
    + `LIVING SPECIFICATION FEATURES:\n${featureList}\n\n`
    + `USER JOURNEYS AND TEST RESULTS:\n${journeySummaries.join("\n\n")}\n\n`
    + `For each journey, respond with a block in this format:\n`
    + `JOURNEY_ID: <id>\n`
    + `MEETS_SPEC: YES|NO\n`
    + `ASSESSMENT: <your assessment of whether this journey meets the spec>\n\n`
    + `After all journey assessments, provide:\n`
    + `OVERALL: <your overall assessment of journey verification completeness>`
  );
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function parseJourneyAssessments(
  text: string,
  journeys: readonly IUserJourney[],
  resultsByJourney: Map<string, IJourneyTestResult>,
): IJourneyAssessment[] {
  const assessments: IJourneyAssessment[] = [];

  for (const journey of journeys) {
    const testResult = resultsByJourney.get(journey.id) ?? null;
    const tested = testResult !== null;

    // Try to find the agent's assessment for this journey
    const journeyBlock = extractJourneyBlock(text, journey.id);
    const meetsSpecRaw = journeyBlock
      ? extractField(journeyBlock, "MEETS_SPEC")
      : null;
    const assessmentText = journeyBlock
      ? extractField(journeyBlock, "ASSESSMENT")
      : null;

    // If tested and passed, default to meets spec unless agent says otherwise
    const meetsSpecFromAgent = meetsSpecRaw
      ? meetsSpecRaw.toUpperCase().startsWith("YES")
      : null;
    const meetsSpecification =
      meetsSpecFromAgent ?? (tested && (testResult?.passed ?? false));

    assessments.push({
      journeyId: journey.id,
      journeyName: journey.name,
      tested,
      testResult,
      meetsSpecification,
      assessment:
        assessmentText
        || (tested
          ? testResult?.passed
            ? "Journey tested and passed."
            : "Journey tested but has failures."
          : "Journey was not tested by the UX Verification Team."),
      featureIds: [...journey.featureIds],
    });
  }

  return assessments;
}

function extractJourneyBlock(text: string, journeyId: string): string | null {
  // Find the block starting with JOURNEY_ID: <id> and ending at the next
  // JOURNEY_ID: or end of text
  const pattern = new RegExp(
    `JOURNEY_ID:\\s*${escapeRegExp(journeyId)}\\b([\\s\\S]*?)(?=JOURNEY_ID:|OVERALL:|$)`,
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

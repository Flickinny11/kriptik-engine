/**
 * AntiSlopRulesetGenerator — generates project-specific anti-slop rules
 * from the Design Pioneer agent's output.
 *
 * The Anti-Slop Ruleset extends the default patterns from Step 11 with
 * project-specific banned patterns, required patterns, and quality
 * thresholds derived from the component library and design brief.
 *
 * Spec Section 7.2, Artifact 3 — "machine-readable specification of
 * banned patterns, required patterns, and quality thresholds."
 * Spec Section 7.3, Layer 5 — banned patterns integrated into merge gate.
 */

import type {
  IAntiSlopRuleset,
  IRequiredPattern,
  IQualityThreshold,
  ISlopPattern,
  ILiveAgentSession,
  IComponentLibrary,
  IDesignBrief,
} from "@kriptik/shared-interfaces";

/**
 * Configuration for the AntiSlopRulesetGenerator.
 */
export interface AntiSlopRulesetGeneratorConfig {
  /** The Design Pioneer's live agent session. */
  readonly session: ILiveAgentSession;
  /** The component library just created (used to derive required patterns). */
  readonly componentLibrary: IComponentLibrary;
  /** Design brief from ICE Stage 2. */
  readonly designBrief: IDesignBrief;
  /** Project name for the ruleset. */
  readonly projectName: string;
}

/**
 * AntiSlopRulesetGenerator — directs the Design Pioneer agent to define
 * project-specific anti-slop rules and parses the structured output.
 *
 * The generator sends a prompt informed by the component library the agent
 * just built, so the required patterns and quality thresholds reference
 * actual components and effects that exist in the project.
 *
 * Spec Section 7.2, Artifact 3.
 */
export class AntiSlopRulesetGenerator {
  /**
   * Direct the agent to generate the Anti-Slop Ruleset and capture the result.
   */
  async generate(config: AntiSlopRulesetGeneratorConfig): Promise<IAntiSlopRuleset> {
    const { session, componentLibrary, designBrief, projectName } = config;

    // Send the ruleset generation prompt with context about the component library
    const reportResponse = await session.send(
      buildRulesetPrompt(componentLibrary, designBrief, projectName),
    );

    return parseRulesetReport(reportResponse.textContent, projectName);
  }
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildRulesetPrompt(
  library: IComponentLibrary,
  designBrief: IDesignBrief,
  projectName: string,
): string {
  const componentNames = library.components.map((c) => c.name).join(", ");
  const effectNames = library.effects.map((e) => e.name).join(", ");
  const layoutNames = library.layouts.map((l) => l.name).join(", ");

  return [
    "Now generate the Anti-Slop Ruleset — the project-specific quality enforcement rules.",
    `Project: ${projectName}`,
    "",
    "You just created these design system components and effects. The ruleset must",
    "reference them specifically. This extends the default anti-slop patterns (which",
    "already catch generic issues like lorem ipsum, hardcoded colors, banned icon libraries).",
    "",
    `Available Components: ${componentNames}`,
    `Available Effects: ${effectNames}`,
    `Available Layouts: ${layoutNames}`,
    `Design Theme: ${designBrief.theme}`,
    "",
    "Generate the ruleset in this exact format:",
    "",
    "RULESET_REPORT_START",
    "",
    "BANNED_PATTERNS:",
    "- id: <unique-id> | category: custom | pattern: <regex> | severity: error|warning | description: <what it catches> | suggestion: <what to do instead> | globs: <comma-separated file globs or 'all'>",
    "(add project-specific banned patterns — things specific to THIS project's design system)",
    "",
    "REQUIRED_PATTERNS:",
    "- id: <unique-id> | description: <what must be present> | pattern: <regex to detect presence> | scope: <where it must appear> | suggestion: <what to add> | globs: <comma-separated file globs or 'all'>",
    "(required patterns — things that MUST exist in the output)",
    "",
    "QUALITY_THRESHOLDS:",
    "- id: <unique-id> | metric: <metric-name> | minimum: <number> | description: <what it measures> | unit: <count|percentage|score>",
    "(numeric quality minimums)",
    "",
    "RULESET_REPORT_END",
    "",
    "Required patterns should include:",
    `- Use of ${effectNames.split(", ").slice(0, 3).join(", ")} on page components`,
    "- Hover/focus/active states on every interactive element",
    "- Design system token usage (not Tailwind defaults)",
    `- Import from ${library.basePath}/ for UI components`,
    "",
    "Quality thresholds should include:",
    "- Minimum visual effects per page",
    "- Skeleton loading coverage percentage",
    "- Animation presence on interactive elements",
    "",
    "Be specific to this project's design system, not generic.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function parseRulesetReport(
  response: string,
  projectName: string,
): IAntiSlopRuleset {
  return {
    bannedPatterns: parseBannedPatterns(response),
    requiredPatterns: parseRequiredPatterns(response),
    qualityThresholds: parseQualityThresholds(response),
    extendsDefaults: true,
    projectName,
    createdAt: new Date(),
  };
}

function parseBannedPatterns(response: string): ISlopPattern[] {
  const patterns: ISlopPattern[] = [];
  const regex = /^-\s*id:\s*(.+?)\s*\|\s*category:\s*(.+?)\s*\|\s*pattern:\s*(.+?)\s*\|\s*severity:\s*(error|warning)\s*\|\s*description:\s*(.+?)\s*\|\s*suggestion:\s*(.+?)\s*\|\s*globs:\s*(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(response)) !== null) {
    const globStr = match[7]!.trim();
    patterns.push({
      id: match[1]!.trim(),
      category: "custom",
      pattern: match[3]!.trim(),
      severity: match[4]!.trim() as "error" | "warning",
      description: match[5]!.trim(),
      suggestion: match[6]!.trim(),
      applicableGlobs: globStr === "all" ? [] : globStr.split(",").map((g) => g.trim()),
    });
  }

  return patterns;
}

function parseRequiredPatterns(response: string): IRequiredPattern[] {
  const patterns: IRequiredPattern[] = [];
  const regex = /^-\s*id:\s*(.+?)\s*\|\s*description:\s*(.+?)\s*\|\s*pattern:\s*(.+?)\s*\|\s*scope:\s*(.+?)\s*\|\s*suggestion:\s*(.+?)\s*\|\s*globs:\s*(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(response)) !== null) {
    const globStr = match[6]!.trim();
    patterns.push({
      id: match[1]!.trim(),
      description: match[2]!.trim(),
      pattern: match[3]!.trim(),
      scope: match[4]!.trim(),
      suggestion: match[5]!.trim(),
      applicableGlobs: globStr === "all" ? [] : globStr.split(",").map((g) => g.trim()),
    });
  }

  return patterns;
}

function parseQualityThresholds(response: string): IQualityThreshold[] {
  const thresholds: IQualityThreshold[] = [];
  const regex = /^-\s*id:\s*(.+?)\s*\|\s*metric:\s*(.+?)\s*\|\s*minimum:\s*(\d+(?:\.\d+)?)\s*\|\s*description:\s*(.+?)\s*\|\s*unit:\s*(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(response)) !== null) {
    thresholds.push({
      id: match[1]!.trim(),
      metric: match[2]!.trim(),
      minimumValue: parseFloat(match[3]!),
      description: match[4]!.trim(),
      unit: match[5]!.trim(),
    });
  }

  return thresholds;
}

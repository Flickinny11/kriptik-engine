/**
 * ExperienceShellBuilder — constructs the Experience Shell artifact
 * from the Design Pioneer agent's output.
 *
 * The Experience Shell is the app foundation: landing page with design
 * system tokens, WebGL shader effects, GSAP animations, Lenis smooth
 * scrolling, page transitions, skeleton loading, and responsive behavior.
 * It renders on the integration server within 5-10 minutes.
 *
 * Spec Section 7.2, Artifact 1 — Experience Shell.
 * Spec Section 7.3, Layer 1 — "Sets visual quality floor."
 */

import type {
  IExperienceShell,
  IDesignTokenSet,
  IDesignToken,
  IGeneratedFile,
  ILiveAgentSession,
  IDesignBrief,
} from "@kriptik/shared-interfaces";

/**
 * Configuration for the ExperienceShellBuilder.
 */
export interface ExperienceShellBuilderConfig {
  /** The Design Pioneer's live agent session. */
  readonly session: ILiveAgentSession;
  /** Design brief from ICE Stage 2. */
  readonly designBrief: IDesignBrief;
  /** Content of design_references.md (full file — Pioneer is the ONE agent that gets it). */
  readonly designReferencesContent: string;
  /** Base path for the design system directory. */
  readonly designSystemBasePath: string;
  /** The build ID. */
  readonly buildId: string;
}

/**
 * ExperienceShellBuilder — directs the Design Pioneer agent to create
 * the Experience Shell and parses the structured output.
 *
 * The builder sends a structured prompt to the agent session that includes:
 * - The design brief from competitive intelligence (ICE Stage 2)
 * - The full design_references.md file
 * - Explicit instruction to OVERUSE design_references dependencies
 * - Quality target: "Awwwards Site of the Day level"
 *
 * The agent generates the shell files via its filesystem tools. The builder
 * then asks the agent to report what it produced in a structured format,
 * which is parsed into the IExperienceShell artifact.
 *
 * Spec Section 7.2, Artifact 1.
 */
export class ExperienceShellBuilder {
  /**
   * Direct the agent to create the Experience Shell and capture the result.
   */
  async build(config: ExperienceShellBuilderConfig): Promise<IExperienceShell> {
    const { session, designBrief, designReferencesContent, designSystemBasePath } = config;

    // Phase 1: Brief the agent on what to build
    await session.send(buildShellBriefingPrompt(designBrief, designReferencesContent, designSystemBasePath));

    // Phase 2: Direct the agent to create the Experience Shell
    await session.send(buildShellCreationPrompt(designSystemBasePath));

    // Phase 3: Ask the agent to report what it produced in structured format
    const reportResponse = await session.send(buildShellReportPrompt());

    // Parse the structured report into IExperienceShell
    return parseShellReport(reportResponse.textContent, designSystemBasePath);
  }
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildShellBriefingPrompt(
  designBrief: IDesignBrief,
  designReferencesContent: string,
  basePath: string,
): string {
  return [
    "You are the Design Pioneer — the agent responsible for establishing the visual quality floor.",
    "Your quality target is: Awwwards Site of the Day level.",
    "",
    "CRITICAL INSTRUCTION: OVERUSE the design_references dependencies.",
    "If in doubt, add MORE animation, MORE shader effects, MORE visual sophistication.",
    "Generic defaults are the enemy. Every element must have non-trivial visual behavior.",
    "",
    "=== DESIGN BRIEF (from competitive intelligence) ===",
    `Theme: ${designBrief.theme}`,
    `Quality Tier: ${designBrief.qualityTier}`,
    `Must-Match Patterns: ${designBrief.mustMatchPatterns.join(", ")}`,
    `Layout Recommendations: ${designBrief.layoutRecommendations.join(", ")}`,
    `Interaction Standards: ${designBrief.interactionStandards.join(", ")}`,
    `References: ${designBrief.references.join(", ")}`,
    "",
    "=== DESIGN REFERENCES (full file — you are the ONLY agent that receives this) ===",
    designReferencesContent,
    "",
    `=== TARGET DIRECTORY: ${basePath}/ ===`,
    "You will create the Experience Shell — the landing page and design foundation.",
    "All tokens must be CSS custom properties. All effects must use the design_references dependencies.",
    "",
    "Acknowledge this briefing and confirm you understand the quality target.",
  ].join("\n");
}

function buildShellCreationPrompt(basePath: string): string {
  return [
    "Now create the Experience Shell. Use your filesystem tools to write files.",
    "",
    "Create the following in order:",
    "",
    `1. ${basePath}/tokens/colors.ts — Full color palette as CSS custom properties`,
    `2. ${basePath}/tokens/typography.ts — Font families, sizes, weights, line heights`,
    `3. ${basePath}/tokens/spacing.ts — Spacing scale`,
    `4. ${basePath}/tokens/shadows.ts — Shadow definitions`,
    `5. ${basePath}/tokens/animations.ts — Animation keyframes and timing functions`,
    `6. ${basePath}/tokens/gradients.ts — Gradient definitions`,
    `7. ${basePath}/tokens/index.ts — Barrel export for all tokens`,
    "",
    "Then create the shell page:",
    `8. ${basePath}/shell/globals.css — CSS custom properties from all tokens + base styles`,
    `9. ${basePath}/shell/page-transition.tsx — Page transition wrapper with GSAP`,
    `10. ${basePath}/shell/smooth-scroll.tsx — Lenis smooth scrolling provider`,
    `11. ${basePath}/shell/app-shell.tsx — Root layout with transitions, smooth scroll, cursor`,
    `12. ${basePath}/shell/landing-page.tsx — Hero with WebGL shaders, GSAP ScrollTrigger sections`,
    `13. ${basePath}/shell/skeleton-loading.tsx — Skeleton loading state components`,
    "",
    "Use maximum visual intensity. WebGL displacement shaders on hero elements.",
    "GSAP ScrollTrigger for entrance animations. Lenis for smooth scrolling.",
    "Custom cursor behavior. Full responsive design.",
    "",
    "Write each file using write_file. Do not skip any file.",
  ].join("\n");
}

function buildShellReportPrompt(): string {
  return [
    "Report what you created for the Experience Shell in this exact format:",
    "",
    "SHELL_REPORT_START",
    "FILES:",
    "- path: <file path> | purpose: <why this file exists>",
    "(repeat for each file)",
    "",
    "TOKENS:",
    "- name: <token name> | value: <token value> | category: <category> | description: <description>",
    "(list the key tokens — at least the primary colors, heading font, body font, base spacing)",
    "",
    "EFFECTS:",
    "- <effect name>",
    "(list each visual effect used in the shell)",
    "",
    "LAYOUT_SYSTEM: <describe the layout system and responsive breakpoints>",
    "RESPONSIVE: true",
    "SHELL_REPORT_END",
    "",
    "Be precise. List ALL files you created. List the actual token values, not placeholders.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function parseShellReport(
  response: string,
  basePath: string,
): IExperienceShell {
  const files = parseFilesSection(response);
  const tokens = parseTokensSection(response);
  const effects = parseEffectsSection(response);
  const layoutSystem = parseLayoutSystem(response);
  const responsive = response.includes("RESPONSIVE: true");

  return {
    files,
    tokenSet: organizeTokens(tokens),
    effects,
    layoutSystem: layoutSystem || `Responsive layout system at ${basePath}/shell/`,
    responsive,
    createdAt: new Date(),
  };
}

function parseFilesSection(response: string): IGeneratedFile[] {
  const files: IGeneratedFile[] = [];
  const fileRegex = /^-\s*path:\s*(.+?)\s*\|\s*purpose:\s*(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = fileRegex.exec(response)) !== null) {
    files.push({
      path: match[1]!.trim(),
      content: "", // Content was written to disk by the agent
      purpose: match[2]!.trim(),
    });
  }

  return files;
}

function parseTokensSection(response: string): IDesignToken[] {
  const tokens: IDesignToken[] = [];
  const tokenRegex = /^-\s*name:\s*(.+?)\s*\|\s*value:\s*(.+?)\s*\|\s*category:\s*(.+?)\s*\|\s*description:\s*(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(response)) !== null) {
    tokens.push({
      name: match[1]!.trim(),
      value: match[2]!.trim(),
      category: match[3]!.trim(),
      description: match[4]!.trim(),
    });
  }

  return tokens;
}

function parseEffectsSection(response: string): string[] {
  const effects: string[] = [];
  const effectsStart = response.indexOf("EFFECTS:");
  if (effectsStart === -1) return effects;

  const effectsBlock = response.substring(
    effectsStart,
    response.indexOf("\n\n", effectsStart) === -1
      ? response.indexOf("LAYOUT_SYSTEM:", effectsStart)
      : Math.min(
          response.indexOf("\n\n", effectsStart),
          response.indexOf("LAYOUT_SYSTEM:", effectsStart) === -1
            ? Infinity
            : response.indexOf("LAYOUT_SYSTEM:", effectsStart),
        ),
  );

  const effectRegex = /^-\s*(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = effectRegex.exec(effectsBlock)) !== null) {
    effects.push(match[1]!.trim());
  }

  return effects;
}

function parseLayoutSystem(response: string): string {
  const layoutMatch = /LAYOUT_SYSTEM:\s*(.+?)(?:\n|RESPONSIVE:)/s.exec(response);
  return layoutMatch ? layoutMatch[1]!.trim() : "";
}

function organizeTokens(tokens: IDesignToken[]): IDesignTokenSet {
  return {
    colors: tokens.filter((t) => t.category === "color"),
    typography: tokens.filter((t) => t.category === "typography"),
    spacing: tokens.filter((t) => t.category === "spacing"),
    shadows: tokens.filter((t) => t.category === "shadow"),
    animations: tokens.filter((t) => t.category === "animation"),
    gradients: tokens.filter((t) => t.category === "gradient"),
  };
}

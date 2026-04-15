/**
 * DesignPioneerAgent — the specialized Opus 4.6 agent that establishes
 * the visual quality floor during early build.
 *
 * Orchestrates the production of three artifacts:
 *   1. Experience Shell — app foundation with design tokens and effects
 *   2. Component Library — reusable components, effects, layouts, examples
 *   3. Anti-Slop Ruleset — project-specific quality enforcement rules
 *
 * The Design Pioneer runs as a high-priority early task in the dependency
 * graph. Tasks that don't depend on design system components launch
 * simultaneously. Tasks that WILL produce UI wait until the Pioneer's
 * component library merges.
 *
 * Spec Section 7.2 — "The Design Pioneer is a specialized Opus 4.6 agent
 * that runs as a high-priority early task."
 * Spec Section 7.3, Layer 1 — "Design Pioneer: Sets visual quality floor."
 */

import type {
  IDesignPioneerAgent,
  IDesignPioneerConfig,
  IDesignPioneerArtifacts,
  IGeneratedFile,
} from "@kriptik/shared-interfaces";
import { ExperienceShellBuilder } from "./experience-shell.js";
import { ComponentLibraryBuilder } from "./component-library.js";
import { AntiSlopRulesetGenerator } from "./anti-slop-ruleset.js";

/** Default base path for the design system directory. */
const DEFAULT_DESIGN_SYSTEM_BASE_PATH = "src/design-system";

/**
 * DesignPioneerAgent — implements IDesignPioneerAgent.
 *
 * Uses a single ILiveAgentSession (design-pioneer role) throughout the
 * artifact production process. The session maintains context across all
 * three phases, so the agent builds each artifact informed by what it
 * already created.
 *
 * The agent receives:
 * - Enhanced design instruction (OVERUSE design_references)
 * - Competitive design reference from ICE Stage 2
 * - Full design_references.md (the ONE agent that gets it)
 * - Quality target: "Awwwards Site of the Day level"
 *
 * Spec Section 7.2 — Design Pioneer briefing and artifacts.
 */
export class DesignPioneerAgent implements IDesignPioneerAgent {
  private readonly shellBuilder = new ExperienceShellBuilder();
  private readonly libraryBuilder = new ComponentLibraryBuilder();
  private readonly rulesetGenerator = new AntiSlopRulesetGenerator();

  /**
   * Produce all three artifacts using the Design Pioneer agent session.
   *
   * Execution order matters — each phase builds on the previous:
   * 1. Experience Shell creates tokens and initial effects
   * 2. Component Library reuses those tokens and expands effects
   * 3. Anti-Slop Ruleset references the actual components created
   */
  async produce(config: IDesignPioneerConfig): Promise<IDesignPioneerArtifacts> {
    const basePath = config.designSystemBasePath ?? DEFAULT_DESIGN_SYSTEM_BASE_PATH;

    // Phase 1: Build the Experience Shell
    const shell = await this.shellBuilder.build({
      session: config.session,
      designBrief: config.designBrief,
      designReferencesContent: config.designReferencesContent ?? "",
      designSystemBasePath: basePath,
      buildId: config.buildId,
    });

    // Phase 2: Build the Component Library (reuses tokens from shell)
    const componentLibrary = await this.libraryBuilder.build({
      session: config.session,
      designSystemBasePath: basePath,
      existingTokens: shell.tokenSet,
    });

    // Phase 3: Generate the Anti-Slop Ruleset (references actual components)
    const antiSlopRuleset = await this.rulesetGenerator.generate({
      session: config.session,
      componentLibrary,
      designBrief: config.designBrief,
      projectName: extractProjectName(config.livingSpec.rawPrompt),
    });

    // Aggregate all generated files from both shell and library
    const allGeneratedFiles = deduplicateFiles([
      ...shell.files,
      ...componentLibrary.files,
    ]);

    return {
      shell,
      componentLibrary,
      antiSlopRuleset,
      allGeneratedFiles,
      buildId: config.buildId,
      producedAt: new Date(),
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a short project name from the raw user prompt.
 * Used for labeling the anti-slop ruleset.
 */
function extractProjectName(rawPrompt: string): string {
  // Take the first meaningful phrase (up to 50 chars) from the prompt
  const cleaned = rawPrompt.trim().replace(/\s+/g, " ");
  if (cleaned.length <= 50) return cleaned;
  const truncated = cleaned.substring(0, 50);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 20 ? truncated.substring(0, lastSpace) : truncated;
}

/**
 * Deduplicate files by path, keeping the last occurrence.
 * The shell and library may both report overlapping files (e.g., token barrel).
 */
function deduplicateFiles(files: readonly IGeneratedFile[]): IGeneratedFile[] {
  const byPath = new Map<string, IGeneratedFile>();
  for (const file of files) {
    byPath.set(file.path, file);
  }
  return [...byPath.values()];
}

/**
 * Replacement agent builder — constructs replacement agent configurations
 * with violation context injected as positive-only guidance.
 *
 * The builder transforms violation data into constructive framing:
 * - Violation trails become non-negotiable architectural constraints
 * - Failed approaches become specific positive guidance for the correct approach
 * - Existing trails are re-ranked to emphasize correct patterns
 *
 * The key principle from Spec Section 9.2, Step 5: "The replacement receives
 * everything a normal agent would PLUS enhanced positive guidance derived
 * from the violation — phrased entirely as what TO do, never what NOT to do.
 * No mention of the previous agent. No description of the wrong approach."
 *
 * Spec Section 9.2, Step 5 — Replacement Deployment with Positive-Only Briefing
 * Spec Section 6.3 — Violation trails with non-negotiable framing
 */

import type {
  IReplacementAgentBuilder,
  IReplacementConfig,
  IFiringResult,
  IViolationRecord,
  IDepartingAgentState,
  ViolationSource,
  ModelTier,
} from "@kriptik/shared-interfaces";

/**
 * ReplacementAgentBuilder — generates positive-only replacement configurations
 * from firing results.
 *
 * All output is framed positively. The replacement agent should never know
 * that a previous agent was fired — it only knows what the correct approach
 * is, presented with sufficient specificity and non-negotiable framing.
 */
export class ReplacementAgentBuilder implements IReplacementAgentBuilder {
  buildReplacementConfig(
    firingResult: Omit<IFiringResult, "replacementConfig">,
    existingTrails: readonly string[],
  ): IReplacementConfig {
    const { violationRecord, capturedState, peerContamination } = firingResult;

    const positiveOnlyBriefing = this.generatePositiveBriefing(
      violationRecord,
      capturedState,
    );
    const violationTrails = this.frameAsNonNegotiable(violationRecord);
    const rerankedTrails = this.rerankTrails(existingTrails, violationRecord);

    // Determine model tier — may be escalated from the fired agent's tier.
    // If the violation was severe enough to fire, and the original was
    // Sonnet, escalate to Opus.
    const modelTier = this.determineModelTier(violationRecord);

    return {
      goal: violationRecord.goalId as unknown as IReplacementConfig["goal"],
      role: "builder",
      modelTier,
      positiveOnlyBriefing,
      violationTrails,
      rerankedTrails,
      lastCleanMergePoint: "", // Filled by the protocol from branchArchiver
      peerAgentIds: peerContamination.affectedPeerIds,
      interfacesUnderReview: peerContamination.contaminatedInterfaces,
    };
  }

  /**
   * Generate a positive-only briefing from a violation record.
   *
   * Transforms violation diagnostics into constructive guidance:
   * - Contract violations → specific interface requirements to follow
   * - Scope violations → explicit path constraints to operate within
   * - Test failures → specific behavioral requirements to satisfy
   * - Banned patterns → design system components to use instead
   * - Quality degradation → quality standards to achieve
   *
   * Spec Section 9.2, Step 5 — "phrased entirely as what TO do,
   * never what NOT to do."
   */
  generatePositiveBriefing(
    violationRecord: IViolationRecord,
    capturedState: IDepartingAgentState,
  ): string {
    const sections: string[] = [];

    // Core guidance based on violation source
    sections.push(
      this.generateSourceSpecificGuidance(violationRecord),
    );

    // Leverage what the departing agent got right — its progress and
    // decisions that were sound. The replacement should build on correct
    // work, not start from scratch.
    if (capturedState.decisions.length > 0) {
      sections.push(
        "## Established Decisions\n\n" +
          "The following technical decisions have been validated and should " +
          "be maintained:\n\n" +
          capturedState.decisions
            .map((d) => `- ${d}`)
            .join("\n"),
      );
    }

    // If there were modified files, the replacement knows what exists
    if (capturedState.modifiedFiles.length > 0) {
      sections.push(
        "## Existing Work\n\n" +
          "Work has been started on the following files. Review them from " +
          "the last clean merge point and continue from there:\n\n" +
          capturedState.modifiedFiles
            .map((f) => `- \`${f}\``)
            .join("\n"),
      );
    }

    // Active peer negotiations the replacement must handle
    if (capturedState.activePeerNegotiations.length > 0) {
      sections.push(
        "## Active Peer Negotiations\n\n" +
          "The following interface negotiations are in progress. Review " +
          "and confirm or propose revisions:\n\n" +
          capturedState.activePeerNegotiations
            .map((n) => `- ${n}`)
            .join("\n"),
      );
    }

    return sections.join("\n\n");
  }

  /**
   * Frame violation data as non-negotiable architectural constraint trails.
   *
   * Spec Section 6.3 — "Violation trails carry extra injection weight and
   * explicit non-negotiable framing: 'Server-side sessions are required for
   * multi-device support — this is an architectural constraint, not a
   * recommendation.'"
   *
   * Each trail is a statement of what IS required, never what was wrong.
   */
  frameAsNonNegotiable(
    violationRecord: IViolationRecord,
  ): readonly string[] {
    const trails: string[] = [];

    switch (violationRecord.source) {
      case "merge-gate-contract":
        trails.push(
          ...this.frameContractViolationsAsConstraints(
            violationRecord.diagnostics,
          ),
        );
        break;

      case "merge-gate-scope":
        trails.push(
          ...this.frameScopeViolationsAsConstraints(
            violationRecord.diagnostics,
          ),
        );
        break;

      case "merge-gate-lsp":
        trails.push(
          ...this.frameLSPViolationsAsConstraints(
            violationRecord.diagnostics,
          ),
        );
        break;

      case "merge-gate-test":
        trails.push(
          ...this.frameTestViolationsAsConstraints(
            violationRecord.diagnostics,
          ),
        );
        break;

      case "merge-gate-banned":
        trails.push(
          ...this.frameBannedPatternViolationsAsConstraints(
            violationRecord.diagnostics,
          ),
        );
        break;

      case "drift-signal":
        trails.push(
          "Maintain focused, goal-aligned output throughout the entire " +
            "session — this is an operational requirement for cognitive " +
            "quality preservation.",
        );
        break;

      case "quality-degradation":
        trails.push(
          "All UI implementation must meet the design quality threshold — " +
            "this is a non-negotiable quality gate. Use the project's " +
            "design tokens, component library, and required patterns.",
        );
        break;

      case "repeated-minor":
        trails.push(
          "Verify all work against the merge gate criteria before " +
            "submitting — TypeScript compilation, scope constraints, " +
            "interface contracts, tests, and design patterns must all " +
            "pass. This is an implementation requirement.",
        );
        break;
    }

    return trails;
  }

  /**
   * Re-rank existing trails with extra weight on patterns that would
   * have prevented the violation.
   *
   * Spec Section 9.2, Step 5 — "Top trails re-ranked with extra weight
   * on correct patterns."
   *
   * Trails matching the violation's domain get promoted to the top.
   * The ranking uses keyword matching against the violation source
   * and diagnostics to identify relevant trails.
   */
  rerankTrails(
    existingTrails: readonly string[],
    violationRecord: IViolationRecord,
  ): readonly string[] {
    if (existingTrails.length === 0) return [];

    const keywords = this.extractRankingKeywords(violationRecord);

    // Score each trail by keyword relevance
    const scored = existingTrails.map((trail) => {
      const lowerTrail = trail.toLowerCase();
      let score = 0;
      for (const keyword of keywords) {
        if (lowerTrail.includes(keyword.toLowerCase())) {
          score += 1;
        }
      }
      return { trail, score };
    });

    // Sort by score descending (relevant trails first), stable sort
    scored.sort((a, b) => b.score - a.score);

    return scored.map((s) => s.trail);
  }

  // ---------------------------------------------------------------------------
  // Source-specific positive guidance generation
  // ---------------------------------------------------------------------------

  /**
   * Generate guidance specific to the violation source.
   * Always phrased as what to DO, never what went wrong.
   */
  private generateSourceSpecificGuidance(
    violationRecord: IViolationRecord,
  ): string {
    switch (violationRecord.source) {
      case "merge-gate-contract":
        return (
          "## Interface Contract Requirements\n\n" +
          "This goal requires strict adherence to the interface contracts " +
          "defined in `@kriptik/shared-interfaces`. All implementations " +
          "must:\n\n" +
          "1. Import types using `import type` from `@kriptik/shared-interfaces`\n" +
          "2. Implement every required property and method from the interface\n" +
          "3. Use the exact property names and types defined in the contract\n" +
          "4. Maintain structural conformance verified by TypeScript compilation\n\n" +
          this.extractPositiveGuidanceFromDiagnostics(
            violationRecord.diagnostics,
            "contract",
          )
        );

      case "merge-gate-scope":
        return (
          "## File Scope Constraints\n\n" +
          "This goal has explicit scope boundaries. All file modifications " +
          "must stay within the assigned write paths. If the goal requires " +
          "changes outside the assigned scope, coordinate with the " +
          "Architect for scope expansion through the proper interface " +
          "negotiation channel.\n\n" +
          this.extractPositiveGuidanceFromDiagnostics(
            violationRecord.diagnostics,
            "scope",
          )
        );

      case "merge-gate-lsp":
        return (
          "## TypeScript Compilation Requirements\n\n" +
          "All code must compile cleanly with zero TypeScript errors. Run " +
          "type checking before submitting to the merge gate. Ensure all " +
          "imports are correct, all types are properly annotated, and all " +
          "interface implementations are structurally complete.\n\n" +
          this.extractPositiveGuidanceFromDiagnostics(
            violationRecord.diagnostics,
            "lsp",
          )
        );

      case "merge-gate-test":
        return (
          "## Test Requirements\n\n" +
          "All tests must pass before merge submission. The implementation " +
          "must satisfy the behavioral requirements validated by the test " +
          "suite. Review the test expectations to understand the required " +
          "behavior before implementing.\n\n" +
          this.extractPositiveGuidanceFromDiagnostics(
            violationRecord.diagnostics,
            "test",
          )
        );

      case "merge-gate-banned":
        return (
          "## Design System Requirements\n\n" +
          "All UI code must use the project's design system exclusively. " +
          "Use design tokens for colors, spacing, and typography. Use the " +
          "component library for all UI elements. Use CSS variables, not " +
          "hardcoded values. Import from the project's component library, " +
          "not from generic icon or UI libraries.\n\n" +
          this.extractPositiveGuidanceFromDiagnostics(
            violationRecord.diagnostics,
            "banned",
          )
        );

      case "drift-signal":
        return (
          "## Focus and Quality Requirements\n\n" +
          "Maintain sharp focus on the assigned goal throughout the session. " +
          "Each response should directly advance the goal. Verify alignment " +
          "with the architectural blueprint before making implementation " +
          "decisions."
        );

      case "quality-degradation":
        return (
          "## Design Quality Standards\n\n" +
          "The implementation must meet the project's design quality " +
          "threshold. Use the complete design token set, apply all required " +
          "patterns (animations, transitions, hover states, skeleton " +
          "loading), and maintain component library adoption throughout. " +
          `Current quality requirement: score above ${violationRecord.diagnostics[1] ?? "threshold"}.`
        );

      case "repeated-minor":
        return (
          "## Pre-Submission Verification\n\n" +
          "Before each merge submission, run the complete verification " +
          "checklist:\n\n" +
          "1. TypeScript compilation (`tsc --noEmit`) — zero errors\n" +
          "2. Scope verification — all modified files within assigned paths\n" +
          "3. Interface contracts — all types imported and implemented correctly\n" +
          "4. Test suite — all tests passing\n" +
          "5. Design patterns — no banned imports, no hardcoded colors"
        );
    }
  }

  // ---------------------------------------------------------------------------
  // Non-negotiable framing helpers
  // ---------------------------------------------------------------------------

  private frameContractViolationsAsConstraints(
    diagnostics: readonly string[],
  ): string[] {
    return diagnostics.map((d) => {
      // Extract the contract requirement from the diagnostic and reframe
      // as an architectural constraint
      if (d.includes("shared-interfaces")) {
        return (
          "All cross-package type contracts are defined in " +
          "@kriptik/shared-interfaces and must be imported with " +
          "'import type' — this is an architectural boundary constraint."
        );
      }
      return (
        "Interface contracts must be structurally satisfied — " +
        "this is a compile-time architectural requirement, not a suggestion."
      );
    });
  }

  private frameScopeViolationsAsConstraints(
    diagnostics: readonly string[],
  ): string[] {
    return diagnostics.map((d) => {
      // Extract the allowed paths from the diagnostic
      const pathMatch = d.match(/allowed:\s*(.+)\)/);
      if (pathMatch) {
        return (
          `File modifications must stay within: ${pathMatch[1]} — ` +
          "this is a scope isolation requirement for multi-agent coordination."
        );
      }
      return (
        "All file modifications must stay within the assigned scope — " +
        "this is a coordination constraint for parallel agent execution."
      );
    });
  }

  private frameLSPViolationsAsConstraints(
    diagnostics: readonly string[],
  ): string[] {
    // For LSP errors, provide a single non-negotiable about compilation
    // rather than repeating each error
    return [
      "TypeScript compilation must produce zero errors — run " +
        "`tsc --noEmit` before every merge submission. This is a " +
        "non-negotiable quality gate.",
    ];
  }

  private frameTestViolationsAsConstraints(
    diagnostics: readonly string[],
  ): string[] {
    return [
      "All test assertions define required behavior — the " +
        "implementation must satisfy every test expectation. This is " +
        "a behavioral contract, not optional validation.",
    ];
  }

  private frameBannedPatternViolationsAsConstraints(
    diagnostics: readonly string[],
  ): string[] {
    return [
      "The design system is the exclusive source for UI styling. " +
        "Use design tokens for all colors, spacing, and typography. " +
        "Use the component library for all UI elements. This is an " +
        "architectural constraint — the project does not permit " +
        "generic UI libraries or hardcoded visual values.",
    ];
  }

  // ---------------------------------------------------------------------------
  // Diagnostic extraction
  // ---------------------------------------------------------------------------

  /**
   * Extract positive guidance from diagnostics.
   * Transforms error messages into constructive requirements.
   */
  private extractPositiveGuidanceFromDiagnostics(
    diagnostics: readonly string[],
    _source: string,
  ): string {
    if (diagnostics.length === 0) return "";

    // Limit to first 5 diagnostics to avoid overwhelming the briefing
    const relevant = diagnostics.slice(0, 5);

    return (
      "Specific requirements for this implementation:\n\n" +
      relevant
        .map((d) => `- ${this.reframeAsPositive(d)}`)
        .join("\n")
    );
  }

  /**
   * Reframe a diagnostic message as a positive requirement.
   * Strips error framing and converts to guidance.
   */
  private reframeAsPositive(diagnostic: string): string {
    // Remove error prefixes and severity markers
    let positive = diagnostic
      .replace(/^(error|Error|ERROR|FAIL|warning|Warning):\s*/i, "")
      .replace(/^.+?:\d+:\d+\s*-\s*(error|warning)\s+TS\d+:\s*/i, "");

    // Convert negative framing to positive
    positive = positive
      .replace(/must not/gi, "must")
      .replace(/cannot/gi, "should")
      .replace(/is not allowed/gi, "use the approved alternative")
      .replace(/is banned/gi, "use the design system equivalent");

    // Ensure it reads as a requirement
    if (!positive.endsWith(".")) {
      positive += ".";
    }

    return `Ensure: ${positive}`;
  }

  // ---------------------------------------------------------------------------
  // Trail re-ranking
  // ---------------------------------------------------------------------------

  /**
   * Extract keywords from a violation record for trail relevance scoring.
   * Keywords are derived from the violation source, diagnostics, and
   * the domain of the failure.
   */
  private extractRankingKeywords(
    violationRecord: IViolationRecord,
  ): readonly string[] {
    const keywords: string[] = [];

    // Source-based keywords
    switch (violationRecord.source) {
      case "merge-gate-contract":
        keywords.push("interface", "contract", "type", "import");
        break;
      case "merge-gate-scope":
        keywords.push("scope", "path", "file", "boundary");
        break;
      case "merge-gate-lsp":
        keywords.push("typescript", "type", "compile", "tsc");
        break;
      case "merge-gate-test":
        keywords.push("test", "assertion", "expect", "behavior");
        break;
      case "merge-gate-banned":
        keywords.push("design", "component", "token", "style", "ui");
        break;
      case "drift-signal":
        keywords.push("focus", "goal", "alignment", "quality");
        break;
      case "quality-degradation":
        keywords.push("design", "quality", "animation", "component");
        break;
      case "repeated-minor":
        keywords.push("verification", "check", "gate", "submission");
        break;
    }

    // Extract additional keywords from diagnostics
    for (const d of violationRecord.diagnostics.slice(0, 3)) {
      // Pull out file names and identifiers
      const fileMatch = d.match(/[\w-]+\.(?:ts|tsx|css|scss)/g);
      if (fileMatch) {
        keywords.push(...fileMatch);
      }
    }

    return keywords;
  }

  // ---------------------------------------------------------------------------
  // Model tier escalation
  // ---------------------------------------------------------------------------

  /**
   * Determine model tier for the replacement agent.
   * If the fired agent was Sonnet and the violation was severe,
   * escalate to Opus.
   *
   * Spec Section 9.0, Level 6 — "if Sonnet 4.6 can't handle it,
   * escalate to Opus 4.6."
   */
  private determineModelTier(
    violationRecord: IViolationRecord,
  ): ModelTier {
    // Severe violations or repeated failures → Opus 4.6
    if (
      violationRecord.severity === "severe" ||
      violationRecord.priorViolationCount >= 2
    ) {
      return "claude-opus-4-6";
    }

    // Default to Opus for replacement agents — they're handling
    // a goal that has already failed once, so give them the best model
    return "claude-opus-4-6";
  }
}

/**
 * AntiPatternAlertFormatter — formats anti-pattern alerts for injection
 * into the living specification (ICE Stage 6) and golden window (Step 8).
 *
 * Produces two output formats:
 * 1. Spec alerts — concise "DO NOT..." / "ALWAYS..." for the living spec
 * 2. Golden window alerts — richer text with statistical context, sized
 *    to fit within the golden window token budget
 *
 * Spec Section 2.2, Stage 6 — "presented as explicit warnings: 'DO NOT use
 *   the browser's default video player. DO NOT skip client-side file validation.'"
 * Spec Section 5.4, Step 8 — "Anti-pattern alerts relevant to upcoming work"
 *   in the golden window formation sequence.
 * Spec Section 6.3 — trail injection consumes ~2,000-5,000 tokens of golden window;
 *   anti-pattern alerts share this budget.
 */

import type {
  IAntiPatternAlertFormatter,
  IAntiPatternAlert,
} from "@kriptik/shared-interfaces";

/** Approximate tokens per character (conservative estimate for English text). */
const TOKENS_PER_CHAR = 0.25;

/** Default token budget for golden window anti-pattern section. */
const DEFAULT_GOLDEN_WINDOW_BUDGET = 1500;

/**
 * Formats anti-pattern alerts for different injection contexts.
 *
 * The formatter produces different levels of detail:
 * - Specification format: concise "DO NOT..." warnings (low token cost)
 * - Golden window format: full context with stats and recommendations
 *   (higher token cost, but within budget)
 */
export class AntiPatternAlertFormatter implements IAntiPatternAlertFormatter {
  /**
   * Format alerts for the living specification's anti-pattern section.
   * Returns concise, directive statements.
   *
   * Spec Section 2.2, Stage 6 — explicit warnings:
   * "DO NOT use the browser's default video player."
   * "DO NOT skip client-side file validation."
   */
  formatForSpecification(
    alerts: readonly IAntiPatternAlert[],
  ): readonly string[] {
    return alerts.map((alert) => {
      // The warning text already starts with "DO NOT" from the scanner
      const base = alert.warningText;
      const rec = alert.recommendation;
      return `${base}. Instead: ${rec}`;
    });
  }

  /**
   * Format alerts for golden window injection (Step 8).
   * Returns a single formatted text block with statistical context
   * and recommendations, sized to fit within the token budget.
   *
   * Golden window format includes:
   * - Warning heading
   * - Statistical context (builds, failure rate)
   * - Specific recommendation
   * - Confidence indicator
   *
   * Spec Section 5.4, Step 8 — "Anti-pattern alerts relevant to upcoming work."
   */
  formatForGoldenWindow(
    alerts: readonly IAntiPatternAlert[],
    maxTokens: number = DEFAULT_GOLDEN_WINDOW_BUDGET,
  ): string {
    if (alerts.length === 0) {
      return "";
    }

    const maxChars = Math.floor(maxTokens / TOKENS_PER_CHAR);
    const sections: string[] = [];
    let totalChars = 0;

    // Header
    const header =
      "## Anti-Pattern Alerts\n\nThe following warnings are derived from the knowledge base's accumulated build experience. These are known failure patterns — address them proactively.\n";
    totalChars += header.length;
    sections.push(header);

    for (const alert of alerts) {
      const section = this.formatSingleAlert(alert);
      const sectionChars = section.length;

      // Check if adding this section would exceed the budget
      if (totalChars + sectionChars > maxChars) {
        // Add a truncation notice if we can't fit all alerts
        const remaining = alerts.length - sections.length + 1;
        if (remaining > 0) {
          sections.push(
            `\n*${remaining} additional anti-pattern alert(s) omitted due to token budget.*`,
          );
        }
        break;
      }

      sections.push(section);
      totalChars += sectionChars;
    }

    return sections.join("\n");
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Format a single alert for golden window injection.
   * Includes the warning, statistics, and recommendation.
   */
  private formatSingleAlert(alert: IAntiPatternAlert): string {
    const confidenceTag =
      alert.confidence === "high"
        ? " **[HIGH CONFIDENCE]**"
        : alert.confidence === "medium"
          ? " [MEDIUM CONFIDENCE]"
          : "";

    const lines = [
      `### ${alert.warningText}${confidenceTag}`,
      "",
      `**Evidence:** ${alert.statisticalContext}`,
      `**Recommendation:** ${alert.recommendation}`,
    ];

    return lines.join("\n");
  }
}

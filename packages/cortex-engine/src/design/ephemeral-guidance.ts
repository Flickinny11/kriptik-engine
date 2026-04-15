/**
 * EphemeralGuidanceClassifier — Layer 3 of the Seven-Layer Design
 * Enforcement Stack.
 *
 * Monitors builder agent token output and injects design nudges when
 * regression patterns are detected. Drawing from Replit's ephemeral
 * classifier pattern, nudges are transient micro-instructions that
 * influence the next token prediction without consuming persistent context.
 *
 * Examples from the spec:
 *   Agent outputs generic Tailwind card styling → nudge: "Use Card component
 *   from design-system/components/Card.tsx"
 *   Agent outputs loading spinner → nudge: "Use LoadingSkeleton from
 *   design-system/components/. Spinners are banned."
 *
 * Spec Section 7.3, Layer 3 — "Ephemeral nudges: Catches drift in real-time.
 * Classifier injects reminders when generic patterns detected."
 */

import type {
  IDesignPioneerArtifacts,
  IEphemeralGuidance,
  IEphemeralGuidanceRule,
  IEphemeralGuidanceClassifier,
} from "@kriptik/shared-interfaces";

// ---------------------------------------------------------------------------
// Hand-coded default rules — the baseline before Design Pioneer configures
// ---------------------------------------------------------------------------

const DEFAULT_EPHEMERAL_RULES: IEphemeralGuidanceRule[] = [
  {
    id: "generic-card-styling",
    description: "Generic Tailwind card styling without design tokens",
    triggerPattern: "bg-white\\s+rounded-lg\\s+p-\\d+\\s+shadow",
    nudgeMessage:
      "Use the Card component from the design system instead of generic Tailwind card styling. Import shadow tokens from the token system.",
    suggestedComponent: "Card",
    priority: 80,
  },
  {
    id: "loading-spinner",
    description: "Default loading spinner (banned pattern)",
    triggerPattern: "animate-spin\\s+rounded-full.*border",
    nudgeMessage:
      "Spinners are banned. Use LoadingSkeleton from the design system components.",
    suggestedComponent: "LoadingSkeleton",
    priority: 90,
  },
  {
    id: "hardcoded-hex-color",
    description: "Hardcoded hex color instead of design token",
    triggerPattern: '#[0-9a-fA-F]{3,8}["\']',
    nudgeMessage:
      "Use CSS custom properties from the design token system instead of hardcoded color values.",
    suggestedComponent: null,
    priority: 70,
  },
  {
    id: "generic-button-styling",
    description: "Generic button with inline Tailwind styling",
    triggerPattern:
      "bg-(blue|green|red|indigo)-\\d+\\s+.*text-white.*rounded",
    nudgeMessage:
      "Use the Button component from the design system. It includes proper hover/focus/active states and magnetic effects.",
    suggestedComponent: "Button",
    priority: 80,
  },
  {
    id: "generic-modal-pattern",
    description: "Generic modal/dialog with fixed positioning",
    triggerPattern: "fixed\\s+inset-0.*bg-(black|gray).*opacity",
    nudgeMessage:
      "Use the Modal component from the design system. It includes proper backdrop blur, entrance animation, and focus trapping.",
    suggestedComponent: "Modal",
    priority: 75,
  },
  {
    id: "default-transition",
    description: "Generic CSS transition without design system effects",
    triggerPattern: "transition-(all|colors|opacity)\\s+duration-\\d+",
    nudgeMessage:
      "Use effect components (ScrollReveal, PageTransition) from the design system instead of generic CSS transitions.",
    suggestedComponent: null,
    priority: 50,
  },
  {
    id: "lucide-react-import",
    description: "Banned icon library import",
    triggerPattern: 'from\\s+["\']lucide-react["\']',
    nudgeMessage:
      "lucide-react is banned. Use the project's icon system from the design system.",
    suggestedComponent: null,
    priority: 95,
  },
  {
    id: "generic-input-styling",
    description: "Generic input with Tailwind border styling",
    triggerPattern: "border\\s+border-gray-\\d+\\s+rounded.*px-\\d+\\s+py-\\d+",
    nudgeMessage:
      "Use the Input component from the design system. It includes proper focus rings, label animations, and error states.",
    suggestedComponent: "Input",
    priority: 75,
  },
];

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class EphemeralGuidanceClassifier
  implements IEphemeralGuidanceClassifier
{
  private rules: IEphemeralGuidanceRule[];
  private compiledRules: Map<string, RegExp> = new Map();

  constructor(rules?: readonly IEphemeralGuidanceRule[]) {
    this.rules = [...(rules ?? DEFAULT_EPHEMERAL_RULES)];
    this.compileAllRules();
  }

  classify(
    agentOutput: string,
    _filePath: string,
  ): readonly IEphemeralGuidance[] {
    const nudges: IEphemeralGuidance[] = [];
    const lines = agentOutput.split("\n");

    for (const line of lines) {
      for (const rule of this.rules) {
        const regex = this.compiledRules.get(rule.id);
        if (!regex) continue;

        const match = regex.exec(line);
        if (match) {
          nudges.push({
            message: rule.nudgeMessage,
            trigger: line.trim(),
            matchedPattern: rule.id,
            suggestedReplacement: rule.suggestedComponent ?? "",
            confidence: this.computeConfidence(rule, match),
          });
        }
      }
    }

    // Sort by priority (highest first), deduplicate by pattern ID
    const seen = new Set<string>();
    return nudges
      .sort(
        (a, b) =>
          this.getRulePriority(b.matchedPattern) -
          this.getRulePriority(a.matchedPattern),
      )
      .filter((n) => {
        if (seen.has(n.matchedPattern)) return false;
        seen.add(n.matchedPattern);
        return true;
      });
  }

  addRule(rule: IEphemeralGuidanceRule): void {
    const existingIndex = this.rules.findIndex((r) => r.id === rule.id);
    if (existingIndex >= 0) {
      this.rules[existingIndex] = rule;
    } else {
      this.rules.push(rule);
    }
    this.compileRule(rule);
  }

  removeRule(ruleId: string): void {
    this.rules = this.rules.filter((r) => r.id !== ruleId);
    this.compiledRules.delete(ruleId);
  }

  getRules(): readonly IEphemeralGuidanceRule[] {
    return [...this.rules];
  }

  configureFromArtifacts(artifacts: IDesignPioneerArtifacts): void {
    const lib = artifacts.componentLibrary;
    const ruleset = artifacts.antiSlopRuleset;

    // Derive ephemeral rules from banned patterns in the anti-slop ruleset.
    // Each banned pattern becomes a nudge that suggests the correct component.
    for (const banned of ruleset.bannedPatterns) {
      const existingRule = this.rules.find(
        (r) => r.id === `slop-${banned.id}`,
      );
      if (existingRule) continue;

      this.addRule({
        id: `slop-${banned.id}`,
        description: `Auto-derived from anti-slop pattern: ${banned.description}`,
        triggerPattern: banned.pattern,
        nudgeMessage: `${banned.description} ${banned.suggestion}`,
        suggestedComponent: null,
        priority: banned.severity === "error" ? 85 : 60,
      });
    }

    // Create component-specific nudges so the classifier can suggest
    // exact imports when it detects generic equivalents.
    for (const comp of lib.components) {
      const lowerName = comp.name.toLowerCase();
      // If a generic pattern exists for this component type,
      // update its nudge to reference the specific import path.
      for (const rule of this.rules) {
        if (
          rule.suggestedComponent === comp.name &&
          !rule.nudgeMessage.includes(comp.path)
        ) {
          this.addRule({
            ...rule,
            nudgeMessage: `${rule.nudgeMessage}\nImport: import { ${comp.name} } from "${comp.path}"`,
          });
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private compileAllRules(): void {
    for (const rule of this.rules) {
      this.compileRule(rule);
    }
  }

  private compileRule(rule: IEphemeralGuidanceRule): void {
    try {
      this.compiledRules.set(rule.id, new RegExp(rule.triggerPattern, "u"));
    } catch {
      // Invalid regex — skip this rule
      this.compiledRules.delete(rule.id);
    }
  }

  private computeConfidence(
    rule: IEphemeralGuidanceRule,
    match: RegExpExecArray,
  ): number {
    // Base confidence from priority (0.5-1.0 range)
    const basePriority = Math.min(rule.priority, 100) / 100;
    const base = 0.5 + basePriority * 0.4;

    // Boost for longer matches (more specific)
    const matchLengthBonus = Math.min(match[0].length / 40, 0.1);

    return Math.min(base + matchLengthBonus, 1.0);
  }

  private getRulePriority(ruleId: string): number {
    return this.rules.find((r) => r.id === ruleId)?.priority ?? 0;
  }
}

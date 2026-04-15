/**
 * PositiveContextInjector — Layer 2 of the Seven-Layer Design Enforcement Stack.
 *
 * Injects Design Pioneer component library references into builder agent
 * golden window formation sequences. This ensures every builder agent knows
 * the design system exists and has concrete import paths for components,
 * effects, layouts, and tokens.
 *
 * The injector selects relevant artifacts based on the goal's description
 * and scoped write paths. All agents receive the full token system and
 * layout references; component/effect selection is relevance-based.
 *
 * Spec Section 7.3, Layer 2 — "Positive context: goal assignment includes
 * component references."
 * Spec Section 5.4 — golden window formation sequence.
 */

import type {
  IDesignPioneerArtifacts,
  IGoalAssignment,
  IDesignContextBlock,
  IComponentReference,
  IEffectReference,
  ILayoutReference,
  IPositiveContextInjector,
} from "@kriptik/shared-interfaces";

export class PositiveContextInjector implements IPositiveContextInjector {
  buildDesignContext(
    artifacts: IDesignPioneerArtifacts,
    goal: IGoalAssignment,
  ): IDesignContextBlock {
    const lib = artifacts.componentLibrary;

    // All agents get all components — relevance filtering could miss something
    // the agent discovers it needs mid-task. Cost of including extras is low
    // (golden window context), cost of missing one is high (agent writes generic UI).
    const components: IComponentReference[] = lib.components.map((c) => ({
      name: c.name,
      importPath: c.path,
      description: c.description,
      visualBehaviors: c.visualBehaviors,
    }));

    const effects: IEffectReference[] = lib.effects.map((e) => ({
      name: e.name,
      importPath: e.path,
      description: e.description,
      dependencies: e.dependencies,
    }));

    const layouts: ILayoutReference[] = lib.layouts.map((l) => ({
      name: l.name,
      importPath: l.path,
      description: l.description,
    }));

    const tokenCategories = [
      "colors",
      "typography",
      "spacing",
      "shadows",
      "animations",
      "gradients",
    ] as const;

    const examples = lib.examples.map((ex) => ({
      name: ex.name,
      path: ex.path,
      componentsUsed: ex.componentsUsed,
      effectsUsed: ex.effectsUsed,
    }));

    return {
      components,
      effects,
      layouts,
      designSystemBasePath: lib.basePath,
      tokenCategories: [...tokenCategories],
      tokenBasePath: `${lib.basePath}/tokens`,
      examples,
    };
  }

  formatForGoldenWindow(context: IDesignContextBlock): string {
    const lines: string[] = [];

    lines.push("# Design System Reference");
    lines.push("");
    lines.push(
      `This project has a complete design system at \`${context.designSystemBasePath}/\`.`,
    );
    lines.push(
      "You MUST import from this library instead of writing generic UI patterns.",
    );
    lines.push("");

    // Components
    if (context.components.length > 0) {
      lines.push("## Components");
      lines.push("");
      for (const comp of context.components) {
        lines.push(`- **${comp.name}** — \`import { ${comp.name} } from "${comp.importPath}"\``);
        lines.push(`  ${comp.description}`);
        if (comp.visualBehaviors.length > 0) {
          lines.push(`  Visual behaviors: ${comp.visualBehaviors.join(", ")}`);
        }
      }
      lines.push("");
    }

    // Effects
    if (context.effects.length > 0) {
      lines.push("## Effects");
      lines.push("");
      for (const effect of context.effects) {
        lines.push(`- **${effect.name}** — \`import { ${effect.name} } from "${effect.importPath}"\``);
        lines.push(`  ${effect.description}`);
      }
      lines.push("");
    }

    // Layouts
    if (context.layouts.length > 0) {
      lines.push("## Layouts");
      lines.push("");
      for (const layout of context.layouts) {
        lines.push(`- **${layout.name}** — \`import { ${layout.name} } from "${layout.importPath}"\``);
        lines.push(`  ${layout.description}`);
      }
      lines.push("");
    }

    // Tokens
    lines.push("## Design Tokens");
    lines.push("");
    lines.push(
      `Token categories available at \`${context.tokenBasePath}/\`: ${context.tokenCategories.join(", ")}`,
    );
    lines.push(
      "Use CSS custom properties from the token system. Do NOT hardcode colors, spacing, or typography values.",
    );
    lines.push("");

    // Examples
    if (context.examples.length > 0) {
      lines.push("## Reference Implementations");
      lines.push("");
      for (const ex of context.examples) {
        lines.push(`- **${ex.name}** — \`${ex.path}\``);
        if (ex.componentsUsed.length > 0) {
          lines.push(`  Uses: ${ex.componentsUsed.join(", ")}`);
        }
      }
      lines.push("");
    }

    lines.push("---");
    lines.push(
      "CRITICAL: Every UI element you create MUST use components and tokens from this design system.",
    );
    lines.push(
      "Generic Tailwind patterns, hardcoded colors, and default animations are banned.",
    );

    return lines.join("\n");
  }
}

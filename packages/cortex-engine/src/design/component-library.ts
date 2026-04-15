/**
 * ComponentLibraryBuilder — constructs the Component Library artifact
 * from the Design Pioneer agent's output.
 *
 * The Component Library is a comprehensive /src/design-system/ directory
 * with tokens, effects, components, layouts, and working examples.
 * Builder agents import from this library instead of writing generic patterns.
 *
 * Spec Section 7.2, Artifact 2 — Component Library directory structure.
 * Spec Section 7.3, Layer 2 — "Positive context: goal assignment includes
 * component references."
 */

import type {
  IComponentLibrary,
  IDesignTokenSet,
  IEffectTemplate,
  IComponentTemplate,
  ILayoutTemplate,
  IExampleTemplate,
  IGeneratedFile,
  ILiveAgentSession,
} from "@kriptik/shared-interfaces";

/**
 * Configuration for the ComponentLibraryBuilder.
 */
export interface ComponentLibraryBuilderConfig {
  /** The Design Pioneer's live agent session. */
  readonly session: ILiveAgentSession;
  /** Base path for the design system directory. */
  readonly designSystemBasePath: string;
  /** Token set from the Experience Shell (reused — don't regenerate). */
  readonly existingTokens: IDesignTokenSet;
}

/**
 * ComponentLibraryBuilder — directs the Design Pioneer agent to create
 * the full component library and parses the structured output.
 *
 * The builder sends prompts to create:
 * - effects/ — ShaderHover, ScrollReveal, SmoothScroll, PageTransition,
 *   ParallaxLayer, TextReveal, MagneticButton, GrainOverlay
 * - components/ — Button, Card, Input, Modal, Navigation, LoadingSkeleton, Toast
 * - layouts/ — AppShell, AuthLayout, DashboardLayout
 * - examples/ — hero-section, feature-grid, testimonials, cta-section
 *
 * Spec Section 7.2, Artifact 2.
 */
export class ComponentLibraryBuilder {
  /**
   * Direct the agent to create the Component Library and capture the result.
   */
  async build(config: ComponentLibraryBuilderConfig): Promise<IComponentLibrary> {
    const { session, designSystemBasePath, existingTokens } = config;

    // Phase 1: Create effects
    await session.send(buildEffectsPrompt(designSystemBasePath));

    // Phase 2: Create components
    await session.send(buildComponentsPrompt(designSystemBasePath));

    // Phase 3: Create layouts
    await session.send(buildLayoutsPrompt(designSystemBasePath));

    // Phase 4: Create examples
    await session.send(buildExamplesPrompt(designSystemBasePath));

    // Phase 5: Get structured report
    const reportResponse = await session.send(buildLibraryReportPrompt());

    return parseLibraryReport(
      reportResponse.textContent,
      designSystemBasePath,
      existingTokens,
    );
  }
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildEffectsPrompt(basePath: string): string {
  return [
    "Now create the visual effects library. These are reusable effect components",
    "that builder agents will import. Every effect must use design_references dependencies.",
    "",
    `Create in ${basePath}/effects/:`,
    "",
    "1. ShaderHover.tsx — WebGL displacement shader effect on hover (three.js / curtains.js)",
    "2. ScrollReveal.tsx — GSAP ScrollTrigger reveal animations with multiple presets",
    "3. SmoothScroll.tsx — Lenis smooth scrolling wrapper (reuse from shell if applicable)",
    "4. PageTransition.tsx — GSAP page transition with configurable easing",
    "5. ParallaxLayer.tsx — Scroll-driven parallax with configurable depth and direction",
    "6. TextReveal.tsx — Character-by-character or word-by-word text animation",
    "7. MagneticButton.tsx — Cursor-magnetic button effect with configurable strength",
    "8. GrainOverlay.tsx — Film grain canvas overlay for texture",
    `9. ${basePath}/effects/index.ts — Barrel export`,
    "",
    "Every effect must: accept configurable props, use design system tokens,",
    "handle cleanup/unmount properly, support reduced-motion preference.",
    "Write each file using write_file.",
  ].join("\n");
}

function buildComponentsPrompt(basePath: string): string {
  return [
    "Now create the UI component library. Every component must have non-trivial",
    "visual behavior — no plain HTML with basic Tailwind.",
    "",
    `Create in ${basePath}/components/:`,
    "",
    "1. Button.tsx — With magnetic hover, ripple on click, loading state skeleton",
    "2. Card.tsx — With hover lift + shadow animation, content reveal, shimmer loading",
    "3. Input.tsx — With animated label float, focus glow, validation state transitions",
    "4. Modal.tsx — With backdrop blur, spring-physics enter/exit, focus trap",
    "5. Navigation.tsx — With scroll-aware hide/show, active indicator animation, mobile drawer",
    "6. LoadingSkeleton.tsx — Shimmer loading placeholder with configurable shapes",
    "7. Toast.tsx — With slide-in animation, auto-dismiss progress, stack management",
    `8. ${basePath}/components/index.ts — Barrel export`,
    "",
    "Every component must: use design system tokens (never hardcoded colors),",
    "import effects from the effects library, include hover/focus/active states,",
    "support reduced-motion, be fully responsive.",
    "Write each file using write_file.",
  ].join("\n");
}

function buildLayoutsPrompt(basePath: string): string {
  return [
    "Now create the layout templates. These define the structural patterns",
    "that builders will use for different page types.",
    "",
    `Create in ${basePath}/layouts/:`,
    "",
    "1. AppShell.tsx — Root app layout with navigation, page transitions, smooth scroll",
    "2. AuthLayout.tsx — Centered card layout for auth flows with animated background",
    "3. DashboardLayout.tsx — Sidebar + main content with collapsible nav, breadcrumbs",
    `4. ${basePath}/layouts/index.ts — Barrel export`,
    "",
    "All layouts must: use design system tokens, handle responsive breakpoints",
    "(mobile/tablet/desktop), include page transition integration points,",
    "support the SmoothScroll provider.",
    "Write each file using write_file.",
  ].join("\n");
}

function buildExamplesPrompt(basePath: string): string {
  return [
    "Finally, create working reference examples that demonstrate how to compose",
    "the design system components and effects. These are complete, production-quality",
    "sections that builders can study and adapt.",
    "",
    `Create in ${basePath}/examples/:`,
    "",
    "1. hero-section.tsx — Full-width hero with ShaderHover on main image,",
    "   TextReveal on heading, ScrollReveal on subtext, ParallaxLayer background",
    "2. feature-grid.tsx — Responsive grid of Card components with staggered",
    "   ScrollReveal, hover effects, icon animations",
    "3. testimonials.tsx — Horizontal scroll carousel with GrainOverlay,",
    "   TextReveal on quotes, smooth transitions between items",
    "4. cta-section.tsx — Call-to-action with MagneticButton, gradient background",
    "   using tokens, ParallaxLayer, TextReveal on heading",
    `5. ${basePath}/examples/index.ts — Barrel export`,
    "",
    "These must be COMPLETE and WORKING — not stubs. They are reference",
    "implementations that demonstrate the design system at its best.",
    "Write each file using write_file.",
  ].join("\n");
}

function buildLibraryReportPrompt(): string {
  return [
    "Report the complete Component Library in this exact format:",
    "",
    "LIBRARY_REPORT_START",
    "EFFECTS:",
    "- name: <name> | path: <path> | description: <description> | dependencies: <comma-separated npm packages>",
    "(repeat for each effect)",
    "",
    "COMPONENTS:",
    "- name: <name> | path: <path> | description: <description> | behaviors: <comma-separated visual behaviors> | animated: true/false",
    "(repeat for each component)",
    "",
    "LAYOUTS:",
    "- name: <name> | path: <path> | description: <description> | breakpoints: <comma-separated breakpoints>",
    "(repeat for each layout)",
    "",
    "EXAMPLES:",
    "- name: <name> | path: <path> | description: <description> | components: <comma-separated> | effects: <comma-separated>",
    "(repeat for each example)",
    "",
    "FILES:",
    "- path: <file path> | purpose: <description>",
    "(list ALL files created for the component library — effects, components, layouts, examples, barrel exports)",
    "LIBRARY_REPORT_END",
    "",
    "Be precise. List ALL files. Include the actual npm package dependencies for effects.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function parseLibraryReport(
  response: string,
  basePath: string,
  existingTokens: IDesignTokenSet,
): IComponentLibrary {
  return {
    basePath,
    tokens: existingTokens,
    effects: parseEffects(response),
    components: parseComponents(response),
    layouts: parseLayouts(response),
    examples: parseExamples(response),
    files: parseLibraryFiles(response),
  };
}

function parseEffects(response: string): IEffectTemplate[] {
  const effects: IEffectTemplate[] = [];
  const regex = /^-\s*name:\s*(.+?)\s*\|\s*path:\s*(.+?)\s*\|\s*description:\s*(.+?)\s*\|\s*dependencies:\s*(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(response)) !== null) {
    effects.push({
      name: match[1]!.trim(),
      path: match[2]!.trim(),
      description: match[3]!.trim(),
      dependencies: match[4]!.trim().split(",").map((d) => d.trim()).filter(Boolean),
    });
  }

  return effects;
}

function parseComponents(response: string): IComponentTemplate[] {
  const components: IComponentTemplate[] = [];
  const regex = /^-\s*name:\s*(.+?)\s*\|\s*path:\s*(.+?)\s*\|\s*description:\s*(.+?)\s*\|\s*behaviors:\s*(.+?)\s*\|\s*animated:\s*(true|false)$/gm;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(response)) !== null) {
    components.push({
      name: match[1]!.trim(),
      path: match[2]!.trim(),
      description: match[3]!.trim(),
      visualBehaviors: match[4]!.trim().split(",").map((b) => b.trim()).filter(Boolean),
      hasAnimation: match[5] === "true",
    });
  }

  return components;
}

function parseLayouts(response: string): ILayoutTemplate[] {
  const layouts: ILayoutTemplate[] = [];
  const regex = /^-\s*name:\s*(.+?)\s*\|\s*path:\s*(.+?)\s*\|\s*description:\s*(.+?)\s*\|\s*breakpoints:\s*(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(response)) !== null) {
    layouts.push({
      name: match[1]!.trim(),
      path: match[2]!.trim(),
      description: match[3]!.trim(),
      breakpoints: match[4]!.trim().split(",").map((b) => b.trim()).filter(Boolean),
    });
  }

  return layouts;
}

function parseExamples(response: string): IExampleTemplate[] {
  const examples: IExampleTemplate[] = [];
  const regex = /^-\s*name:\s*(.+?)\s*\|\s*path:\s*(.+?)\s*\|\s*description:\s*(.+?)\s*\|\s*components:\s*(.+?)\s*\|\s*effects:\s*(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(response)) !== null) {
    examples.push({
      name: match[1]!.trim(),
      path: match[2]!.trim(),
      description: match[3]!.trim(),
      componentsUsed: match[4]!.trim().split(",").map((c) => c.trim()).filter(Boolean),
      effectsUsed: match[5]!.trim().split(",").map((e) => e.trim()).filter(Boolean),
    });
  }

  return examples;
}

function parseLibraryFiles(response: string): IGeneratedFile[] {
  const files: IGeneratedFile[] = [];
  // Match files in the FILES section specifically
  const filesStart = response.lastIndexOf("FILES:");
  if (filesStart === -1) return files;

  const filesBlock = response.substring(filesStart);
  const regex = /^-\s*path:\s*(.+?)\s*\|\s*purpose:\s*(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(filesBlock)) !== null) {
    files.push({
      path: match[1]!.trim(),
      content: "", // Content was written to disk by the agent
      purpose: match[2]!.trim(),
    });
  }

  return files;
}

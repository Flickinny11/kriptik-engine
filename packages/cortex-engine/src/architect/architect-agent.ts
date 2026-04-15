/**
 * Architect Agent — the subsystem managing the Architect's responsibilities.
 *
 * The Architect is a specialized Opus 4.6 agent that:
 * - Produces the architectural blueprint from the living specification
 * - Decomposes the spec into goals with dependency ordering
 * - Constructs full golden windows for all builder agents
 * - Handles revision requests when builders discover constraints
 * - Arbitrates peer disagreements on interfaces
 * - Manages shared configuration files
 *
 * The Architect operates as an Anthropic API session — it reasons about
 * architecture, not executes code. It produces structured output that the
 * BlueprintManager assembles into the canonical blueprint.
 *
 * Spec Section 3.2 — Architect Agent taxonomy.
 * Spec Section 4.2, Tier 1 — Architectural Blueprint shared service.
 * Spec Section 12.4, Phase A Step 5.
 */

import type {
  IArchitectAgent,
  IArchitecturalBlueprint,
  IBlueprintRevision,
  IRevisionRequest,
  IRevisionResponse,
  IArbitrationRequest,
  IArbitrationResult,
  ILivingSpecification,
  IGoalAssignment,
  IGoldenWindowSequence,
  IDepartingAgentState,
  IRankedTrail,
  ILiveAgentSession,
  IAgentHarnessConfig,
  IGoldenWindowConfig,
  ICodeStyleGuide,
  ISharedConfig,
  AgentRole,
} from "@kriptik/shared-interfaces";

import { AgentHarness } from "../agents/agent-harness.js";
import { BlueprintManager, type BlueprintDecomposition } from "./blueprint.js";
import { GoldenWindowBuilder } from "./golden-window-builder.js";

/**
 * Configuration for creating an ArchitectAgent.
 */
export interface ArchitectAgentConfig {
  /** The build this architect serves. */
  readonly buildId: string;
  /** Anthropic API key. */
  readonly apiKey: string;
  /** Path to the git repository. */
  readonly repoPath: string;
  /** The integration branch name. */
  readonly integrationBranch: string;
}

/**
 * The Architect Agent — produces blueprints, constructs golden windows,
 * handles revisions, and arbitrates disagreements.
 *
 * The Architect is the ONLY agent that can modify the living specification
 * after user approval. It owns the blueprint as a coherence anchor.
 */
export class ArchitectAgent implements IArchitectAgent {
  private readonly _buildId: string;
  private readonly _apiKey: string;
  private readonly _repoPath: string;
  private readonly _integrationBranch: string;

  private readonly _blueprintManager: BlueprintManager;
  private readonly _goldenWindowBuilder: GoldenWindowBuilder;
  private readonly _harness: AgentHarness;

  /** The Architect's own API session for reasoning about architecture. */
  private _session: ILiveAgentSession | undefined;
  /** The current living specification. */
  private _livingSpec: ILivingSpecification | undefined;

  constructor(config: ArchitectAgentConfig) {
    this._buildId = config.buildId;
    this._apiKey = config.apiKey;
    this._repoPath = config.repoPath;
    this._integrationBranch = config.integrationBranch;

    this._blueprintManager = new BlueprintManager(config.buildId);
    this._goldenWindowBuilder = new GoldenWindowBuilder(this._blueprintManager);
    this._harness = new AgentHarness(config.apiKey);
  }

  /**
   * Produce the architectural blueprint from the living specification.
   *
   * The Architect agent session reasons about:
   * 1. How to decompose the spec into modules
   * 2. What interface contracts exist between modules
   * 3. How data flows between modules
   * 4. What code style fits the project
   * 5. What goal assignments to create with dependency ordering
   *
   * Returns the assembled blueprint ready for the orchestrator.
   */
  async produceBlueprint(
    livingSpec: ILivingSpecification,
  ): Promise<IArchitecturalBlueprint> {
    this._livingSpec = livingSpec;

    // Launch the Architect's own API session
    await this._ensureSession();

    // Send the living specification to the Architect for decomposition
    const decompositionPrompt = this._buildDecompositionPrompt(livingSpec);

    const response = await this._session!.send(decompositionPrompt);

    // Parse the Architect's structured output into a BlueprintDecomposition
    const decomposition = this._parseDecomposition(response.textContent, livingSpec);

    // Assemble the blueprint
    return this._blueprintManager.createBlueprint(decomposition);
  }

  /**
   * Get the current blueprint.
   */
  getBlueprint(): IArchitecturalBlueprint | undefined {
    return this._blueprintManager.getBlueprint();
  }

  /**
   * Process a revision request from a builder agent.
   *
   * The Architect evaluates whether the discovered constraint requires
   * a blueprint change, produces the revision if so, and returns
   * the response.
   */
  async handleRevisionRequest(
    request: IRevisionRequest,
  ): Promise<IRevisionResponse> {
    await this._ensureSession();

    const blueprint = this._blueprintManager.getBlueprint();
    if (!blueprint) {
      throw new Error("Cannot handle revision request: no blueprint exists");
    }

    const prompt = [
      `# Blueprint Revision Request`,
      ``,
      `A builder agent has discovered a constraint that may require a blueprint revision.`,
      ``,
      `**Requesting Agent:** ${request.requestingAgentId}`,
      `**Goal:** ${request.goalId}`,
      `**Discovered Constraint:** ${request.discoveredConstraint}`,
      `**Affected Area:** ${request.affectedArea}`,
      `**Proposed Resolution:** ${request.proposedResolution}`,
      ``,
      `## Current Blueprint (v${blueprint.version})`,
      `Modules: ${blueprint.modules.map((m) => m.name).join(", ")}`,
      `Contracts: ${blueprint.interfaceContracts.length}`,
      ``,
      `Evaluate this request:`,
      `1. Does this constraint genuinely require a blueprint change?`,
      `2. Does the proposed resolution maintain architectural coherence?`,
      `3. What modules and agents are affected?`,
      `4. Should you approve, reject, or modify the proposal?`,
      ``,
      `Respond with your decision in this format:`,
      `DECISION: approved | rejected | modified`,
      `REASONING: [your reasoning]`,
      `RESOLUTION: [if modified, your alternative]`,
      `AFFECTED_MODULES: [comma-separated module IDs]`,
      `AFFECTED_AGENTS: [comma-separated agent IDs]`,
    ].join("\n");

    const response = await this._session!.send(prompt);
    const parsed = this._parseRevisionResponse(response.textContent, request);

    // If approved or modified, apply the revision
    if (parsed.decision !== "rejected" && parsed.revision) {
      this._blueprintManager.applyRevision(
        parsed.revision.description,
        parsed.revision.reason,
        parsed.revision.affectedModuleIds,
        parsed.revision.affectedAgentIds,
        {}, // Actual changes would be computed from the Architect's response
      );
    }

    return parsed;
  }

  /**
   * Arbitrate a disagreement between two agents.
   *
   * The Architect evaluates both positions against architectural coherence
   * and the current blueprint, selects or synthesizes a resolution.
   *
   * Spec Section 3.3 — "If roughly equal (within 10%), the Architect
   * arbitrates based on architectural coherence."
   */
  async arbitrate(
    request: IArbitrationRequest,
  ): Promise<IArbitrationResult> {
    await this._ensureSession();

    const blueprint = this._blueprintManager.getBlueprint();
    if (!blueprint) {
      throw new Error("Cannot arbitrate: no blueprint exists");
    }

    const prompt = [
      `# Interface Arbitration Request`,
      ``,
      `Two agents cannot resolve a disagreement after ${request.exchangeCount} exchanges.`,
      ``,
      `**Topic:** ${request.topic}`,
      ``,
      `**Agent A (${request.agentAId}) position:**`,
      request.positionA,
      ``,
      `**Agent B (${request.agentBId}) position:**`,
      request.positionB,
      ``,
      `## Architectural Context`,
      `Blueprint v${blueprint.version}`,
      `Code Style: ${blueprint.codeStyle.framework}, ${blueprint.codeStyle.apiPattern}`,
      ``,
      `Arbitrate based on architectural coherence:`,
      `1. Which position better fits the current blueprint?`,
      `2. Which maintains cleaner module boundaries?`,
      `3. Which produces more maintainable interfaces?`,
      `4. Should you accept one position or synthesize a new one?`,
      ``,
      `Respond with:`,
      `DECISION: a | b | synthesized`,
      `REASONING: [your reasoning grounded in architectural coherence]`,
      `RESOLVED_INTERFACE: [the chosen or synthesized interface definition]`,
      `BLUEPRINT_REVISED: true | false`,
    ].join("\n");

    const response = await this._session!.send(prompt);
    return this._parseArbitrationResult(response.textContent, request);
  }

  /**
   * Build a golden window for an agent.
   *
   * Delegates to the GoldenWindowBuilder with the current blueprint state.
   */
  async buildGoldenWindow(
    goal: IGoalAssignment,
    role: AgentRole,
    options?: {
      readonly departingAgentState?: IDepartingAgentState;
      readonly trails?: readonly IRankedTrail[];
      readonly antiPatternAlerts?: readonly string[];
    },
  ): Promise<IGoldenWindowSequence> {
    const blueprint = this._blueprintManager.getBlueprint();
    if (!blueprint) {
      throw new Error("Cannot build golden window: no blueprint exists");
    }

    if (!this._livingSpec) {
      throw new Error("Cannot build golden window: no living specification");
    }

    const config: IGoldenWindowConfig = {
      buildId: this._buildId,
      goal,
      role,
      repoPath: this._repoPath,
      integrationBranch: this._integrationBranch,
      blueprint,
      livingSpec: this._livingSpec,
      trails: options?.trails ?? [],
      departingAgentState: options?.departingAgentState,
      antiPatternAlerts: options?.antiPatternAlerts ?? [],
    };

    return this._goldenWindowBuilder.build(config);
  }

  /**
   * Subscribe to blueprint revision events.
   */
  onRevision(handler: (revision: IBlueprintRevision) => void): void {
    this._blueprintManager.onRevision(handler);
  }

  /**
   * Get the blueprint manager (for direct access by the orchestrator).
   */
  getBlueprintManager(): BlueprintManager {
    return this._blueprintManager;
  }

  /**
   * Get the golden window builder (for direct access if needed).
   */
  getGoldenWindowBuilder(): GoldenWindowBuilder {
    return this._goldenWindowBuilder;
  }

  // =========================================================================
  // Private methods
  // =========================================================================

  /**
   * Ensure the Architect's API session is active.
   * Launches if not already running.
   */
  private async _ensureSession(): Promise<void> {
    if (this._session && this._session.isActive) {
      return;
    }

    const config: IAgentHarnessConfig = {
      buildId: this._buildId,
      role: "architect",
      modelTier: "claude-opus-4-6", // Architect always uses Opus
      goal: null, // Architect doesn't have a goal assignment
      peerIds: [], // Architect communicates with the orchestrator
      goldenWindow: {
        systemPrompt: this._buildArchitectSystemPrompt(),
        projectStructure: "",
        planWithProgress: "",
        architecturalBlueprint: "",
        relevantCode: [],
        trails: [],
        antiPatternAlerts: [],
      },
      tools: [], // Architect reasons about architecture, doesn't execute code
    };

    this._session = await this._harness.launch(config);
  }

  /**
   * Build the Architect's own system prompt.
   */
  private _buildArchitectSystemPrompt(): string {
    return [
      `You are the Architect Agent in the Cortex Engine.`,
      ``,
      `Your responsibilities:`,
      `1. Decompose the living specification into an architectural blueprint`,
      `2. Define module boundaries, interface contracts, and data flows`,
      `3. Create goal assignments with dependency ordering`,
      `4. Evaluate revision requests from builder agents`,
      `5. Arbitrate interface disagreements between agents`,
      ``,
      `You are the ONLY agent that can modify the living specification.`,
      `Your blueprint is the coherence anchor — all agents build against it.`,
      ``,
      `When decomposing a specification:`,
      `- Each module should have clear, non-overlapping responsibilities`,
      `- Interface contracts define typed boundaries between modules`,
      `- Data flows describe how information moves through the system`,
      `- Goal assignments map to modules with dependency ordering`,
      `- Dependencies should form a DAG (no cycles)`,
      `- Critical-path goals should be identified for early scheduling`,
      ``,
      `When evaluating revisions:`,
      `- Accept changes that improve architectural coherence`,
      `- Reject changes that would create coupling or circular dependencies`,
      `- Consider the impact on all downstream modules`,
      ``,
      `When arbitrating:`,
      `- Decide based on architectural coherence, not compromise`,
      `- The expert-first principle applies — the more architecturally sound position wins`,
      `- Document the reasoning for future reference`,
    ].join("\n");
  }

  /**
   * Build the prompt that asks the Architect to decompose a living spec.
   */
  private _buildDecompositionPrompt(spec: ILivingSpecification): string {
    const featureList = spec.features
      .map((f) => `- ${f.name}: ${f.description} [${f.intentSource}]`)
      .join("\n");

    const integrationList = spec.constraintMaps
      .map((c) => `- ${c.service}: ${c.endpoints.length} endpoints, ${c.gotchas.length} gotchas`)
      .join("\n");

    const antiPatterns = spec.antiPatternAlerts.length > 0
      ? spec.antiPatternAlerts.map((a) => `- ${a}`).join("\n")
      : "None";

    return [
      `# Decompose This Living Specification Into an Architectural Blueprint`,
      ``,
      `## User Intent`,
      `**Raw Prompt:** ${spec.rawPrompt}`,
      `**Surface:** ${spec.intent.surface.join("; ")}`,
      `**Deep:** ${spec.intent.deep.join("; ")}`,
      ``,
      `## Features`,
      featureList,
      ``,
      `## Design System`,
      `Theme: ${spec.designSystem.theme}`,
      `Quality Tier: ${spec.designSystem.qualityTier}`,
      `Styling Approach: Must-match patterns: ${spec.designSystem.mustMatchPatterns.join(", ")}`,
      ``,
      `## External Integrations`,
      integrationList || "None",
      ``,
      `## Anti-Pattern Alerts`,
      antiPatterns,
      ``,
      `## Dependencies`,
      spec.dependencies.map((d) => `- ${d.name} v${d.version} (${d.integrationMethod})`).join("\n") || "None",
      ``,
      `---`,
      ``,
      `Produce the architectural blueprint with the following structure:`,
      ``,
      `### MODULES`,
      `For each module: id, name, description, owned paths, features, integrations.`,
      ``,
      `### INTERFACE_CONTRACTS`,
      `For each contract: provider module, consumer module, interface path, description.`,
      ``,
      `### DATA_FLOWS`,
      `For each flow: source module, target module, data description, contract path, flow type.`,
      ``,
      `### CODE_STYLE`,
      `Framework, language, styling approach, state management, API pattern, conventions.`,
      ``,
      `### SHARED_CONFIGS`,
      `Shared configuration files: path, description, content.`,
      ``,
      `### GOAL_ASSIGNMENTS`,
      `For each goal: id, description, depends_on (goal IDs), scoped_write_paths, recommended_model_tier.`,
      `Goals should be ordered so dependencies come before dependents.`,
      ``,
      `### DEPENDENCY_EDGES`,
      `goal_id -> [dependency_goal_ids]`,
      ``,
      `Use structured output. Be specific about file paths and interfaces.`,
    ].join("\n");
  }

  /**
   * Parse the Architect's decomposition response into a BlueprintDecomposition.
   *
   * The Architect produces structured text output. This parser extracts
   * the structured data. In production, this would use tool_use with
   * structured output schemas — for now, we parse the text into the
   * expected structure with sensible defaults.
   */
  private _parseDecomposition(
    response: string,
    spec: ILivingSpecification,
  ): BlueprintDecomposition {
    // For Phase A, we create a reasonable decomposition from the spec
    // structure. The Architect session refines this — but the parser
    // provides the structural skeleton.
    //
    // Full structured output parsing (via tool_use with JSON schemas)
    // will be implemented when the agent session supports structured
    // output extraction.

    const modules = spec.features.map((feature, idx) => ({
      id: `mod-${feature.id}`,
      name: feature.name,
      description: feature.description,
      ownedPaths: [`src/${this._slugify(feature.name)}/`],
      featureIds: [feature.id],
      integrations: feature.requiredIntegrations.slice(),
      goalId: `goal-${feature.id}`,
    }));

    const interfaceContracts = this._inferContracts(modules);
    const dataFlows = this._inferDataFlows(modules, interfaceContracts);

    const codeStyle: ICodeStyleGuide = {
      framework: this._inferFramework(spec),
      language: "TypeScript (strict mode)",
      stylingApproach: this._inferStyling(spec),
      stateManagement: this._inferStateManagement(spec),
      apiPattern: this._inferApiPattern(spec),
      conventions: [
        "Use async/await, never raw promises",
        "Prefer named exports over default exports",
        "Error handling at system boundaries",
        "Collocate tests with source files",
      ],
    };

    const goalAssignments = this._buildGoalAssignments(modules, spec);
    const dependencyEdges = this._buildDependencyEdges(goalAssignments);

    return {
      modules,
      dataFlows,
      interfaceContracts,
      codeStyle,
      sharedConfigs: this._inferSharedConfigs(codeStyle),
      goalAssignments,
      dependencyEdges,
    };
  }

  /**
   * Parse the Architect's response to a revision request.
   */
  private _parseRevisionResponse(
    response: string,
    request: IRevisionRequest,
  ): IRevisionResponse {
    // Extract structured fields from the Architect's text response
    const decision = this._extractField(response, "DECISION") as IRevisionResponse["decision"];
    const reasoning = this._extractField(response, "REASONING");
    const modifiedResolution = this._extractField(response, "RESOLUTION");
    const affectedModules = this._extractField(response, "AFFECTED_MODULES")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const affectedAgents = this._extractField(response, "AFFECTED_AGENTS")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const validDecision = (["approved", "rejected", "modified"] as const).includes(
      decision as "approved" | "rejected" | "modified",
    )
      ? (decision as "approved" | "rejected" | "modified")
      : "rejected";

    const revision: IBlueprintRevision | undefined =
      validDecision !== "rejected"
        ? {
            version: (this._blueprintManager.getBlueprint()?.version ?? 0) + 1,
            description: request.discoveredConstraint,
            reason: reasoning || request.proposedResolution,
            affectedModuleIds: affectedModules,
            affectedAgentIds: affectedAgents,
            timestamp: new Date(),
          }
        : undefined;

    return {
      request,
      decision: validDecision,
      reasoning: reasoning || "No reasoning provided",
      modifiedResolution: validDecision === "modified" ? modifiedResolution : undefined,
      revision,
    };
  }

  /**
   * Parse the Architect's arbitration response.
   */
  private _parseArbitrationResult(
    response: string,
    request: IArbitrationRequest,
  ): IArbitrationResult {
    const decision = this._extractField(response, "DECISION");
    const reasoning = this._extractField(response, "REASONING");
    const resolvedInterface = this._extractField(response, "RESOLVED_INTERFACE");
    const blueprintRevised = this._extractField(response, "BLUEPRINT_REVISED") === "true";

    const validDecision = (["a", "b", "synthesized"] as const).includes(
      decision as "a" | "b" | "synthesized",
    )
      ? (decision as "a" | "b" | "synthesized")
      : "synthesized";

    return {
      request,
      decision: validDecision,
      reasoning: reasoning || "No reasoning provided",
      resolvedInterface: resolvedInterface || request.positionA,
      blueprintRevised,
    };
  }

  /**
   * Extract a labeled field from structured text response.
   */
  private _extractField(text: string, label: string): string {
    const pattern = new RegExp(`${label}:\\s*(.+?)(?=\\n[A-Z_]+:|$)`, "s");
    const match = text.match(pattern);
    return match ? match[1].trim() : "";
  }

  // =========================================================================
  // Inference helpers — used when parsing the Architect's decomposition
  // =========================================================================

  /**
   * Infer interface contracts from module structure.
   * Modules with overlapping integrations or related features
   * likely need contracts.
   */
  private _inferContracts(
    modules: readonly { id: string; name: string; integrations: readonly string[]; goalId: string }[],
  ) {
    const contracts: Array<{
      readonly provider: string;
      readonly consumer: string;
      readonly interfacePath: string;
      readonly description: string;
    }> = [];

    for (let i = 0; i < modules.length; i++) {
      for (let j = i + 1; j < modules.length; j++) {
        const a = modules[i];
        const b = modules[j];

        // Check for shared integrations
        const shared = a.integrations.filter((int) =>
          b.integrations.includes(int),
        );
        if (shared.length > 0) {
          contracts.push({
            provider: a.id,
            consumer: b.id,
            interfacePath: `src/contracts/${this._slugify(a.name)}-${this._slugify(b.name)}.ts`,
            description: `Shared integration: ${shared.join(", ")}`,
          });
        }
      }
    }

    return contracts;
  }

  /**
   * Infer data flows from modules and contracts.
   */
  private _inferDataFlows(
    modules: readonly { id: string; name: string }[],
    contracts: readonly { provider: string; consumer: string; interfacePath: string; description: string }[],
  ) {
    return contracts.map((c) => ({
      sourceModuleId: c.provider,
      targetModuleId: c.consumer,
      dataDescription: c.description,
      contractPath: c.interfacePath,
      flowType: "synchronous" as const,
    }));
  }

  /**
   * Build goal assignments from modules.
   */
  private _buildGoalAssignments(
    modules: readonly { id: string; name: string; description: string; ownedPaths: readonly string[]; featureIds: readonly string[]; integrations: readonly string[]; goalId: string }[],
    spec: ILivingSpecification,
  ): IGoalAssignment[] {
    return modules.map((mod, idx) => ({
      id: mod.goalId,
      buildId: spec.buildId,
      description: `Implement ${mod.name}: ${mod.description}`,
      status: "blocked" as const,
      assignedAgentId: null,
      dependsOn: [] as readonly string[],
      blockedBy: [] as readonly string[],
      scopedWritePaths: [...mod.ownedPaths],
      specSections: mod.featureIds.map((fId) => {
        const feature = spec.features.find((f) => f.id === fId);
        return feature ? `Feature: ${feature.name} — ${feature.description}` : fId;
      }),
      blueprintSections: [] as readonly string[],
      interfaceContracts: [] as readonly { provider: string; consumer: string; interfacePath: string; description: string }[],
      peerAgentIds: [] as readonly string[],
      recommendedModelTier: this._recommendModelTier(mod, spec) as "claude-opus-4-6" | "claude-sonnet-4-6",
    }));
  }

  /**
   * Build dependency edges from goal assignments.
   */
  private _buildDependencyEdges(
    goals: readonly IGoalAssignment[],
  ): ReadonlyMap<string, readonly string[]> {
    const edges = new Map<string, readonly string[]>();
    for (const goal of goals) {
      edges.set(goal.id, goal.dependsOn);
    }
    return edges;
  }

  /**
   * Recommend a model tier based on module complexity.
   */
  private _recommendModelTier(
    mod: { integrations: readonly string[] },
    spec: ILivingSpecification,
  ): string {
    // Modules with external integrations and constraint maps get Opus
    const hasConstraintMap = spec.constraintMaps.some((c) =>
      mod.integrations.includes(c.service),
    );
    return hasConstraintMap ? "claude-opus-4-6" : "claude-opus-4-6";
    // In Phase D, trail coverage density will drive Sonnet routing
  }

  /**
   * Infer shared configuration files from the code style.
   */
  private _inferSharedConfigs(codeStyle: ICodeStyleGuide): ISharedConfig[] {
    const configs: ISharedConfig[] = [
      {
        path: "tsconfig.json",
        description: "TypeScript compiler configuration",
        content: JSON.stringify(
          {
            compilerOptions: {
              target: "ES2022",
              module: "ESNext",
              moduleResolution: "bundler",
              strict: true,
              esModuleInterop: true,
              skipLibCheck: true,
              outDir: "./dist",
              declaration: true,
            },
          },
          null,
          2,
        ),
      },
    ];

    if (codeStyle.framework.toLowerCase().includes("next")) {
      configs.push({
        path: "next.config.js",
        description: "Next.js application configuration",
        content: "/** @type {import('next').NextConfig} */\nmodule.exports = {};\n",
      });
    }

    return configs;
  }

  /**
   * Infer framework from spec.
   */
  private _inferFramework(spec: ILivingSpecification): string {
    const deps = spec.dependencies.map((d) => d.name.toLowerCase());
    if (deps.some((d) => d.includes("next"))) return "Next.js";
    if (deps.some((d) => d.includes("remix"))) return "Remix";
    if (deps.some((d) => d.includes("astro"))) return "Astro";
    if (deps.some((d) => d.includes("svelte"))) return "SvelteKit";
    return "Next.js"; // Default
  }

  /**
   * Infer styling approach from spec.
   */
  private _inferStyling(spec: ILivingSpecification): string {
    const deps = spec.dependencies.map((d) => d.name.toLowerCase());
    if (deps.some((d) => d.includes("tailwind"))) return "Tailwind CSS";
    if (deps.some((d) => d.includes("styled-components"))) return "styled-components";
    return "Tailwind CSS"; // Default
  }

  /**
   * Infer state management from spec.
   */
  private _inferStateManagement(spec: ILivingSpecification): string {
    const deps = spec.dependencies.map((d) => d.name.toLowerCase());
    if (deps.some((d) => d.includes("zustand"))) return "Zustand";
    if (deps.some((d) => d.includes("redux"))) return "Redux Toolkit";
    if (deps.some((d) => d.includes("jotai"))) return "Jotai";
    return "React Context + Zustand";
  }

  /**
   * Infer API pattern from spec.
   */
  private _inferApiPattern(spec: ILivingSpecification): string {
    const deps = spec.dependencies.map((d) => d.name.toLowerCase());
    if (deps.some((d) => d.includes("trpc"))) return "tRPC";
    if (deps.some((d) => d.includes("graphql"))) return "GraphQL";
    return "Server Actions + REST API routes";
  }

  /**
   * Convert a name to a URL-safe slug.
   */
  private _slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
  }
}

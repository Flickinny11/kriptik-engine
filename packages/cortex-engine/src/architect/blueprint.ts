/**
 * Blueprint Manager — creates and manages the architectural blueprint.
 *
 * The blueprint is the coherence anchor for the entire build. It defines:
 * - Module decomposition (what gets built and where)
 * - Interface contracts (how modules talk to each other)
 * - Data flows (how data moves through the system)
 * - Code style (conventions for this build)
 * - Goal assignments with dependency ordering
 *
 * The Architect produces the blueprint from the living specification,
 * and revises it when builders discover constraints.
 *
 * Spec Section 3.2 — Architect Agent.
 * Spec Section 4.2, Tier 1 — Architectural Blueprint shared service.
 * Spec Section 12.4, Phase A Step 5.
 */

import type {
  IArchitecturalBlueprint,
  IBlueprintModule,
  IBlueprintDataFlow,
  ICodeStyleGuide,
  ISharedConfig,
  IBlueprintRevision,
  IRevisionRequest,
  IRevisionResponse,
  IArbitrationRequest,
  IArbitrationResult,
  IGoalAssignment,
  IInterfaceContract,
  ILivingSpecification,
  ILiveAgentSession,
  IFeatureSpec,
  GoalStatus,
  ModelTier,
} from "@kriptik/shared-interfaces";
import { ESAAEmitter } from "../agents/esaa-emitter.js";

/**
 * The Architect's Anthropic API session produces the blueprint as structured
 * output. This type represents the raw decomposition before it's assembled
 * into a full IArchitecturalBlueprint.
 */
export interface BlueprintDecomposition {
  readonly modules: readonly IBlueprintModule[];
  readonly dataFlows: readonly IBlueprintDataFlow[];
  readonly interfaceContracts: readonly IInterfaceContract[];
  readonly codeStyle: ICodeStyleGuide;
  readonly sharedConfigs: readonly ISharedConfig[];
  readonly goalAssignments: readonly IGoalAssignment[];
  readonly dependencyEdges: ReadonlyMap<string, readonly string[]>;
}

/**
 * BlueprintManager — manages the lifecycle of the architectural blueprint.
 *
 * Responsibilities:
 * - Assemble the initial blueprint from the Architect's decomposition
 * - Apply revisions when builders discover constraints
 * - Track revision history
 * - Notify subscribers of changes
 */
export class BlueprintManager {
  private _blueprint: IArchitecturalBlueprint | undefined;
  private readonly _esaa: ESAAEmitter;
  private readonly _revisionHandlers: Array<(revision: IBlueprintRevision) => void> = [];

  constructor(
    private readonly _buildId: string,
  ) {
    this._esaa = new ESAAEmitter(_buildId, `architect:${_buildId}`);
  }

  /**
   * Create the initial blueprint from the Architect agent's decomposition
   * of the living specification.
   */
  createBlueprint(decomposition: BlueprintDecomposition): IArchitecturalBlueprint {
    const now = new Date();

    this._blueprint = {
      id: `blueprint-${this._buildId}`,
      buildId: this._buildId,
      version: 1,
      modules: decomposition.modules,
      dataFlows: decomposition.dataFlows,
      interfaceContracts: decomposition.interfaceContracts,
      codeStyle: decomposition.codeStyle,
      sharedConfigs: decomposition.sharedConfigs,
      goalAssignments: decomposition.goalAssignments,
      dependencyEdges: decomposition.dependencyEdges,
      revisions: [],
      createdAt: now,
      updatedAt: now,
    };

    this._esaa.emit("decision", "Architectural blueprint created", {
      moduleCount: decomposition.modules.length,
      goalCount: decomposition.goalAssignments.length,
      contractCount: decomposition.interfaceContracts.length,
      dataFlowCount: decomposition.dataFlows.length,
    });

    return this._blueprint;
  }

  /**
   * Get the current blueprint.
   */
  getBlueprint(): IArchitecturalBlueprint | undefined {
    return this._blueprint;
  }

  /**
   * Apply a revision to the blueprint.
   *
   * Creates a new version with the changes applied and the revision
   * recorded in history. Notifies all subscribers.
   */
  applyRevision(
    description: string,
    reason: string,
    affectedModuleIds: readonly string[],
    affectedAgentIds: readonly string[],
    changes: Partial<Pick<IArchitecturalBlueprint,
      "modules" | "dataFlows" | "interfaceContracts" | "codeStyle" |
      "sharedConfigs" | "goalAssignments" | "dependencyEdges"
    >>,
  ): IBlueprintRevision {
    if (!this._blueprint) {
      throw new Error("Cannot revise blueprint: no blueprint exists");
    }

    const newVersion = this._blueprint.version + 1;
    const revision: IBlueprintRevision = {
      version: newVersion,
      description,
      reason,
      affectedModuleIds: [...affectedModuleIds],
      affectedAgentIds: [...affectedAgentIds],
      timestamp: new Date(),
    };

    // Create new blueprint with changes applied
    this._blueprint = {
      ...this._blueprint,
      version: newVersion,
      ...changes,
      revisions: [revision, ...this._blueprint.revisions],
      updatedAt: new Date(),
    };

    this._esaa.emit("decision", `Blueprint revised to v${newVersion}: ${description}`, {
      version: newVersion,
      reason,
      affectedModuleIds,
      affectedAgentIds,
    });

    // Notify subscribers
    for (const handler of this._revisionHandlers) {
      handler(revision);
    }

    return revision;
  }

  /**
   * Get the blueprint section relevant to a specific goal.
   *
   * Returns the module definition, its interface contracts,
   * and data flows involving that module.
   */
  getBlueprintSectionForGoal(goalId: string): string {
    if (!this._blueprint) {
      return "";
    }

    const module = this._blueprint.modules.find((m) => m.goalId === goalId);
    if (!module) {
      return "";
    }

    const contracts = this._blueprint.interfaceContracts.filter(
      (c) => c.provider === module.id || c.consumer === module.id,
    );

    const dataFlows = this._blueprint.dataFlows.filter(
      (df) =>
        df.sourceModuleId === module.id || df.targetModuleId === module.id,
    );

    const sections: string[] = [
      `## Module: ${module.name}`,
      `**Description:** ${module.description}`,
      `**Owned Paths:** ${module.ownedPaths.join(", ")}`,
      `**Integrations:** ${module.integrations.join(", ") || "None"}`,
    ];

    if (contracts.length > 0) {
      sections.push(
        `\n### Interface Contracts`,
        ...contracts.map(
          (c) =>
            `- **${c.provider} → ${c.consumer}**: ${c.description} (${c.interfacePath})`,
        ),
      );
    }

    if (dataFlows.length > 0) {
      sections.push(
        `\n### Data Flows`,
        ...dataFlows.map(
          (df) =>
            `- **${df.sourceModuleId} → ${df.targetModuleId}**: ${df.dataDescription} [${df.flowType}]`,
        ),
      );
    }

    sections.push(
      `\n### Code Style`,
      `- Framework: ${this._blueprint.codeStyle.framework}`,
      `- Language: ${this._blueprint.codeStyle.language}`,
      `- Styling: ${this._blueprint.codeStyle.stylingApproach}`,
      `- State: ${this._blueprint.codeStyle.stateManagement}`,
      `- API: ${this._blueprint.codeStyle.apiPattern}`,
    );

    if (this._blueprint.codeStyle.conventions.length > 0) {
      sections.push(
        `- Conventions:`,
        ...this._blueprint.codeStyle.conventions.map((c) => `  - ${c}`),
      );
    }

    return sections.join("\n");
  }

  /**
   * Get a formatted plan with progress for a specific goal.
   *
   * Shows all goals with their status, highlighting the current goal.
   */
  getPlanWithProgress(
    currentGoalId: string,
    goalStatuses: ReadonlyMap<string, GoalStatus>,
  ): string {
    if (!this._blueprint) {
      return "";
    }

    const lines: string[] = ["# Build Plan\n"];

    for (const goal of this._blueprint.goalAssignments) {
      const status = goalStatuses.get(goal.id) ?? "blocked";
      const isCurrent = goal.id === currentGoalId;

      let prefix: string;
      switch (status) {
        case "merged":
          prefix = "[x]";
          break;
        case "assigned":
        case "submitted":
          prefix = "[~]";
          break;
        default:
          prefix = "[ ]";
      }

      const highlight = isCurrent ? " ← **YOUR GOAL**" : "";
      lines.push(`${prefix} ${goal.description}${highlight}`);

      // Show dependencies
      if (goal.dependsOn.length > 0) {
        const depDescs = goal.dependsOn
          .map((depId) => {
            const dep = this._blueprint!.goalAssignments.find((g) => g.id === depId);
            return dep ? dep.description : depId;
          });
        lines.push(`    Depends on: ${depDescs.join(", ")}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Subscribe to blueprint revision events.
   */
  onRevision(handler: (revision: IBlueprintRevision) => void): void {
    this._revisionHandlers.push(handler);
  }

  /**
   * Get the ESAA emitter for subscribing to architect-level events.
   */
  getESAAEmitter(): ESAAEmitter {
    return this._esaa;
  }
}

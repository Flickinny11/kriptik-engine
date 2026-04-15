/**
 * Architect Agent interfaces — the subsystem that produces the architectural
 * blueprint, constructs full golden windows for agents, handles blueprint
 * revisions when builders discover constraints, and arbitrates peer disagreements.
 *
 * The Architect is the ONLY agent that can modify the living specification
 * after user approval. It owns the blueprint as a coherence anchor.
 *
 * Spec Section 3.2 — Architect Agent taxonomy.
 * Spec Section 4.2, Tier 1 — Architectural Blueprint as a shared service.
 * Spec Section 5.2 — Golden Window Management.
 * Spec Section 5.4 — Agent Rotation and Warm-Up Sequences.
 * Spec Section 12.4, Phase A Step 5.
 */

import type { ILivingSpecification, IFeatureSpec } from "./ice.js";
import type {
  IGoalAssignment,
  IInterfaceContract,
  IGoldenWindowSequence,
  ICodeContext,
  IDepartingAgentState,
  AgentRole,
} from "./agents.js";
import type { IRankedTrail } from "./knowledge.js";

// ---------------------------------------------------------------------------
// Architectural Blueprint
// ---------------------------------------------------------------------------

/**
 * IArchitecturalBlueprint — the complete architectural plan produced by the
 * Architect agent from the living specification.
 *
 * Defines interface contracts, data flow paths, code style, and module
 * boundaries. Serves as the coherence anchor that auto-updates when agents
 * discover constraints.
 *
 * Spec Section 3.2 — "Produces the architectural blueprint defining interface
 * contracts, data flow paths, code style, and module boundaries."
 * Spec Section 4.2, Tier 1 — "Per-build, mutable by Architect only."
 */
export interface IArchitecturalBlueprint {
  /** Unique blueprint identifier. */
  readonly id: string;
  /** The build this blueprint belongs to. */
  readonly buildId: string;
  /** Blueprint version — incremented on every Architect revision. */
  readonly version: number;

  /** Module definitions — the high-level decomposition of the application. */
  readonly modules: readonly IBlueprintModule[];
  /** Data flow paths between modules. */
  readonly dataFlows: readonly IBlueprintDataFlow[];
  /** Interface contracts — typed boundaries between modules. */
  readonly interfaceContracts: readonly IInterfaceContract[];
  /** Code style rules for this build. */
  readonly codeStyle: ICodeStyleGuide;
  /** Shared configuration files owned by the Architect (e.g., tsconfig, .env). */
  readonly sharedConfigs: readonly ISharedConfig[];

  /** Goal assignments derived from the blueprint decomposition. */
  readonly goalAssignments: readonly IGoalAssignment[];
  /** The dependency graph edges (goal ID → goal IDs it depends on). */
  readonly dependencyEdges: ReadonlyMap<string, readonly string[]>;

  /** Revision history — most recent first. */
  readonly revisions: readonly IBlueprintRevision[];

  /** When this blueprint was created. */
  readonly createdAt: Date;
  /** When this blueprint was last modified. */
  readonly updatedAt: Date;
}

/**
 * A module/component in the architectural blueprint.
 *
 * Modules map to scoped write paths — each builder agent operates
 * within the boundaries of one or more modules.
 */
export interface IBlueprintModule {
  /** Unique module identifier. */
  readonly id: string;
  /** Human-readable module name (e.g., "Authentication", "Billing"). */
  readonly name: string;
  /** What this module is responsible for. */
  readonly description: string;
  /** File paths/directories this module owns. */
  readonly ownedPaths: readonly string[];
  /** Features from the living spec that this module implements. */
  readonly featureIds: readonly string[];
  /** External integrations this module touches. */
  readonly integrations: readonly string[];
  /** The goal ID assigned to build this module. */
  readonly goalId: string;
}

/**
 * A data flow path between two modules.
 *
 * Describes how data moves through the system — used by the Architect
 * to construct peer communication graphs and interface contracts.
 */
export interface IBlueprintDataFlow {
  /** The module producing/sending data. */
  readonly sourceModuleId: string;
  /** The module consuming/receiving data. */
  readonly targetModuleId: string;
  /** What data flows between them (e.g., "User session token"). */
  readonly dataDescription: string;
  /** The interface contract governing this flow. */
  readonly contractPath: string;
  /** Whether this is synchronous (function call) or async (event/message). */
  readonly flowType: "synchronous" | "asynchronous";
}

/**
 * Code style rules for the build.
 *
 * The Architect establishes these from the living specification's
 * design system and technical constraints. All agents must follow them.
 */
export interface ICodeStyleGuide {
  /** Framework being used (e.g., "Next.js 15", "Remix"). */
  readonly framework: string;
  /** Language and strict mode settings. */
  readonly language: string;
  /** CSS/styling approach (e.g., "Tailwind CSS", "CSS Modules"). */
  readonly stylingApproach: string;
  /** State management pattern (e.g., "Zustand", "React Context"). */
  readonly stateManagement: string;
  /** API pattern (e.g., "Server Actions", "tRPC", "REST"). */
  readonly apiPattern: string;
  /** Additional coding conventions as free-form rules. */
  readonly conventions: readonly string[];
}

/**
 * A shared configuration file owned by the Architect.
 *
 * Spec Section 3.2 — "Owns shared configuration files
 * (next.config.js, tsconfig.json, .env)."
 */
export interface ISharedConfig {
  /** File path relative to repository root. */
  readonly path: string;
  /** Description of what this config controls. */
  readonly description: string;
  /** The config content. */
  readonly content: string;
}

// ---------------------------------------------------------------------------
// Blueprint revisions
// ---------------------------------------------------------------------------

/**
 * A versioned revision to the architectural blueprint.
 *
 * Spec Section 3.2 — "This revision is versioned and all affected
 * agents are notified."
 */
export interface IBlueprintRevision {
  /** Revision version number. */
  readonly version: number;
  /** What was changed in this revision. */
  readonly description: string;
  /** Why the revision was necessary. */
  readonly reason: string;
  /** IDs of modules affected by this revision. */
  readonly affectedModuleIds: readonly string[];
  /** IDs of agents that need to be notified. */
  readonly affectedAgentIds: readonly string[];
  /** When this revision was made. */
  readonly timestamp: Date;
}

/**
 * A request from a builder agent to revise the blueprint.
 *
 * Spec Section 3.2 — "When a builder discovers a constraint that
 * contradicts the spec, the builder flags this to the Cortex, and the
 * Architect evaluates and revises the blueprint."
 */
export interface IRevisionRequest {
  /** The agent requesting the revision. */
  readonly requestingAgentId: string;
  /** The goal the agent is working on. */
  readonly goalId: string;
  /** What constraint was discovered. */
  readonly discoveredConstraint: string;
  /** What part of the spec or blueprint is affected. */
  readonly affectedArea: string;
  /** The agent's proposed resolution. */
  readonly proposedResolution: string;
  /** When this request was made. */
  readonly timestamp: Date;
}

/**
 * The Architect's decision on a revision request.
 */
export type RevisionDecision = "approved" | "rejected" | "modified";

export interface IRevisionResponse {
  /** The original request. */
  readonly request: IRevisionRequest;
  /** The Architect's decision. */
  readonly decision: RevisionDecision;
  /** Explanation of the decision. */
  readonly reasoning: string;
  /** If modified, the Architect's alternative resolution. */
  readonly modifiedResolution?: string;
  /** The resulting blueprint revision (if approved/modified). */
  readonly revision?: IBlueprintRevision;
}

// ---------------------------------------------------------------------------
// Arbitration
// ---------------------------------------------------------------------------

/**
 * An arbitration request when two agents disagree on an interface.
 *
 * Spec Section 3.3 — "If roughly equal (within 10%), the Architect
 * arbitrates based on architectural coherence."
 */
export interface IArbitrationRequest {
  /** First agent in the disagreement. */
  readonly agentAId: string;
  /** Second agent in the disagreement. */
  readonly agentBId: string;
  /** What they disagree about (e.g., interface shape, data format). */
  readonly topic: string;
  /** Agent A's position. */
  readonly positionA: string;
  /** Agent B's position. */
  readonly positionB: string;
  /** Number of exchanges they've had trying to resolve it. */
  readonly exchangeCount: number;
}

export interface IArbitrationResult {
  /** The original request. */
  readonly request: IArbitrationRequest;
  /** Which agent's position was chosen ("a", "b", or "compromise"). */
  readonly decision: "a" | "b" | "synthesized";
  /** The rationale grounded in architectural coherence. */
  readonly reasoning: string;
  /** The chosen or synthesized interface definition. */
  readonly resolvedInterface: string;
  /** Whether a blueprint revision was triggered. */
  readonly blueprintRevised: boolean;
}

// ---------------------------------------------------------------------------
// Golden Window Builder
// ---------------------------------------------------------------------------

/**
 * Configuration for constructing a full golden window.
 *
 * Spec Section 5.2 — Golden Window Management.
 * Spec Section 5.4 — eight-step formation sequence.
 */
export interface IGoldenWindowConfig {
  /** The build this golden window is for. */
  readonly buildId: string;
  /** The goal being assigned to the agent. */
  readonly goal: IGoalAssignment;
  /** The agent's role. */
  readonly role: AgentRole;
  /** Path to the repository root. */
  readonly repoPath: string;
  /** The integration branch to read project structure from. */
  readonly integrationBranch: string;
  /** The current architectural blueprint. */
  readonly blueprint: IArchitecturalBlueprint;
  /** The current living specification. */
  readonly livingSpec: ILivingSpecification;
  /** Ranked experiential trails for this goal type. */
  readonly trails: readonly IRankedTrail[];
  /** Departing agent state (present only during rotation). */
  readonly departingAgentState?: IDepartingAgentState;
  /** Anti-pattern alerts relevant to this goal. */
  readonly antiPatternAlerts: readonly string[];
}

/**
 * IGoldenWindowBuilder — constructs full golden windows for agent sessions.
 *
 * Replaces the simplified golden window in the orchestrator (Step 3)
 * with the complete eight-step formation sequence from the spec.
 *
 * Spec Section 5.4 — the eight-step formation sequence:
 * 1. System prompt + behavioral rules
 * 2. Project structure (current state from integration branch)
 * 3. Plan with progress (completed items checked, current goal highlighted)
 * 4. Architectural blueprint (current version with module boundaries)
 * 5. Relevant code files (selected by the Architect based on goal + contracts)
 * 6. Experiential trails (ranked for this goal type)
 * 7. Departing agent's active state (rotation only)
 * 8. Anti-pattern alerts relevant to upcoming work
 */
export interface IGoldenWindowBuilder {
  /**
   * Build a complete golden window formation sequence for an agent.
   * Reads project structure from the repository, selects relevant code files
   * based on the goal's interface contracts, and assembles all eight steps.
   */
  build(config: IGoldenWindowConfig): Promise<IGoldenWindowSequence>;

  /**
   * Build a re-injection sequence for post-compaction recovery.
   * Includes the critical state that must survive compaction:
   * baked-in operating context, anchored state document, design system
   * constraints, and active peer negotiations.
   *
   * Spec Section 5.2, Mechanism 3 — Goal Re-Injection Hooks.
   */
  buildReinjection(config: IGoldenWindowConfig): Promise<IGoldenWindowSequence>;
}

// ---------------------------------------------------------------------------
// Architect Agent interface
// ---------------------------------------------------------------------------

/**
 * IArchitectAgent — the subsystem managing the Architect's responsibilities.
 *
 * The Architect is a specialized Opus 4.6 agent that:
 * - Produces the architectural blueprint from the living specification
 * - Decomposes the spec into goals with dependency ordering
 * - Constructs full golden windows for all builder agents
 * - Handles revision requests when builders discover constraints
 * - Arbitrates peer disagreements on interfaces
 * - Manages shared configuration files
 *
 * Spec Section 3.2 — Architect Agent.
 * Spec Section 4.2, Tier 1 — Architectural Blueprint shared service.
 * Spec Section 12.4, Phase A Step 5.
 */
export interface IArchitectAgent {
  /**
   * Produce the architectural blueprint from the living specification.
   *
   * This is the Architect's primary function: take the ICE output and
   * decompose it into modules, interface contracts, data flows, code style,
   * goal assignments, and dependency ordering.
   */
  produceBlueprint(
    livingSpec: ILivingSpecification,
  ): Promise<IArchitecturalBlueprint>;

  /**
   * Get the current blueprint.
   */
  getBlueprint(): IArchitecturalBlueprint | undefined;

  /**
   * Process a revision request from a builder agent.
   *
   * Evaluates whether the discovered constraint requires a blueprint change,
   * produces the revision if so, and returns the response with the decision
   * and any resulting blueprint revision.
   */
  handleRevisionRequest(
    request: IRevisionRequest,
  ): Promise<IRevisionResponse>;

  /**
   * Arbitrate a disagreement between two agents.
   *
   * Evaluates both positions against architectural coherence and
   * the current blueprint, selects or synthesizes a resolution,
   * and optionally triggers a blueprint revision.
   */
  arbitrate(
    request: IArbitrationRequest,
  ): Promise<IArbitrationResult>;

  /**
   * Build a golden window for an agent.
   *
   * Delegates to the IGoldenWindowBuilder with the current blueprint state.
   */
  buildGoldenWindow(
    goal: IGoalAssignment,
    role: AgentRole,
    options?: {
      readonly departingAgentState?: IDepartingAgentState;
      readonly trails?: readonly IRankedTrail[];
      readonly antiPatternAlerts?: readonly string[];
    },
  ): Promise<IGoldenWindowSequence>;

  /**
   * Subscribe to blueprint revision events.
   * The orchestrator uses this to notify affected agents.
   */
  onRevision(handler: (revision: IBlueprintRevision) => void): void;
}

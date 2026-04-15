/**
 * Golden Window Builder — constructs the full eight-step formation sequence
 * for agent sessions.
 *
 * Replaces the simplified golden window in the orchestrator (Step 3)
 * with the complete formation sequence from the spec. The golden window
 * is the period when an agent's system prompt, plan, and architectural
 * intent are all at peak attention weight.
 *
 * Spec Section 5.2 — Golden Window Management.
 * Spec Section 5.4 — Eight-step formation sequence.
 * Spec Section 6.1, Layer 1 — Baked-in operating context (~250 words).
 * Spec Section 12.4, Phase A Step 5.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type {
  IGoldenWindowBuilder,
  IGoldenWindowConfig,
  IGoldenWindowSequence,
  ICodeContext,
  IArchitecturalBlueprint,
  IGoalAssignment,
  AgentRole,
} from "@kriptik/shared-interfaces";

import { BlueprintManager } from "./blueprint.js";

const execFileAsync = promisify(execFile);

/**
 * Baked-in operating context — the non-negotiable behavioral rules
 * included in EVERY agent's system prompt.
 *
 * Spec Section 6.1, Layer 1 — "Every agent container includes a lean,
 * focused context injection that is ALWAYS in the agent's initial
 * system prompt. It contains ONLY universals."
 */
const BAKED_IN_CONTEXT = `You are an autonomous agent in the Cortex Engine. You are a complete, autonomous teammate — NOT a code-typing machine waiting for instructions.

AUTONOMY: You have MCP tools, credentials, CLI, and web search. You do NOT stop to ask questions. You build until complete. You think, decide, act, react, verify, and communicate laterally with peer agents.

KNOWLEDGE: Your training knowledge may be stale. Before implementing ANY external integration: check skill files, use Context7 MCP for current docs, fall back to web search. NEVER rely on training knowledge for API endpoints or method signatures.

DESIGN: All UI must use the design system. Read it BEFORE writing UI code. The design system is non-negotiable.

INTEGRATION PRIORITY: MCP server > CLI tool > Official SDK > REST API.

VERIFICATION: Verify your own work BEFORE submitting to the merge gate. Run tests, check types, review your implementation against the architectural blueprint and interface contracts. The merge gate is a safety net, not the primary quality mechanism. You own the quality of your work.

SCOPE: Write ONLY to files within your scoped write paths. If you need to change something outside your scope, communicate with the responsible peer agent via graph-mesh.

COMMUNICATION: Talk directly to peer agents whose work intersects yours. Do NOT route conversations through the orchestrator.`;

/**
 * GoldenWindowBuilder — constructs complete golden windows for agent sessions.
 *
 * Implements the full eight-step formation sequence:
 * 1. System prompt + behavioral rules
 * 2. Project structure (current state from integration branch)
 * 3. Plan with progress
 * 4. Architectural blueprint (relevant sections for this goal)
 * 5. Relevant code files (selected based on contracts and goal)
 * 6. Experiential trails (ranked for this goal type)
 * 7. Departing agent's active state (rotation only)
 * 8. Anti-pattern alerts
 */
export class GoldenWindowBuilder implements IGoldenWindowBuilder {
  private readonly _blueprintManager: BlueprintManager;

  constructor(blueprintManager: BlueprintManager) {
    this._blueprintManager = blueprintManager;
  }

  /**
   * Build a complete golden window formation sequence for an agent.
   */
  async build(config: IGoldenWindowConfig): Promise<IGoldenWindowSequence> {
    const { goal, role, blueprint, trails, departingAgentState, antiPatternAlerts } = config;

    // Step 1: System prompt with baked-in context + role-specific rules
    const systemPrompt = this._buildSystemPrompt(goal, role, blueprint);

    // Step 2: Project structure from integration branch
    const projectStructure = await this._getProjectStructure(
      config.repoPath,
      config.integrationBranch,
    );

    // Step 3: Plan with progress
    const planWithProgress = this._buildPlanWithProgress(goal, blueprint);

    // Step 4: Architectural blueprint (relevant sections)
    const architecturalBlueprint = this._blueprintManager.getBlueprintSectionForGoal(goal.id);

    // Step 5: Relevant code files
    const relevantCode = await this._selectRelevantCode(config);

    // Step 6: Experiential trails (serialized for injection)
    const serializedTrails = trails.map((t) => {
      const parts = [
        `**Task:** ${t.trail.taskType}`,
        `**Outcome:** ${t.trail.outcome}`,
        `**Decision:** ${t.trail.decision}`,
        `**Reasoning:** ${t.trail.reasoning}`,
      ];
      if (t.trail.gotchasEncountered.length > 0) {
        parts.push(
          `**Gotchas Encountered:**`,
          ...t.trail.gotchasEncountered.map((g: string) => `- ${g}`),
        );
      }
      if (t.trail.resolution) {
        parts.push(`**Resolution:** ${t.trail.resolution}`);
      }
      parts.push(`**Relevance Score:** ${t.score.toFixed(2)}`);
      return parts.join("\n");
    });

    return {
      systemPrompt,
      projectStructure,
      planWithProgress,
      architecturalBlueprint,
      relevantCode,
      trails: serializedTrails,
      departingAgentState,
      antiPatternAlerts: [...antiPatternAlerts],
    };
  }

  /**
   * Build a re-injection sequence for post-compaction recovery.
   *
   * Spec Section 5.2, Mechanism 3 — re-injects:
   * 1. Baked-in operating context (non-negotiable rules)
   * 2. Anchored state document (intent, changes, decisions, next steps)
   * 3. Design system constraints (file references)
   * 4. Active peer negotiations
   */
  async buildReinjection(config: IGoldenWindowConfig): Promise<IGoldenWindowSequence> {
    const { goal, blueprint } = config;

    // Re-injection uses a condensed system prompt (just the baked-in context)
    const systemPrompt = [
      BAKED_IN_CONTEXT,
      "",
      `Your goal: ${goal.description}`,
      `Scoped write paths: ${goal.scopedWritePaths.join(", ")}`,
    ].join("\n");

    // Condensed blueprint section (just contracts and style)
    const architecturalBlueprint = this._blueprintManager.getBlueprintSectionForGoal(goal.id);

    return {
      systemPrompt,
      projectStructure: "", // Re-readable from disk
      planWithProgress: this._buildPlanWithProgress(goal, blueprint),
      architecturalBlueprint,
      relevantCode: [], // Re-readable from disk
      trails: [],       // Already absorbed pre-compaction
      departingAgentState: config.departingAgentState,
      antiPatternAlerts: [...config.antiPatternAlerts],
    };
  }

  // =========================================================================
  // Private methods
  // =========================================================================

  /**
   * Build the system prompt with baked-in context and role-specific rules.
   */
  private _buildSystemPrompt(
    goal: IGoalAssignment,
    role: AgentRole,
    blueprint: IArchitecturalBlueprint,
  ): string {
    const parts: string[] = [BAKED_IN_CONTEXT, ""];

    // Role-specific identity
    parts.push(`## Your Role: ${this._getRoleDescription(role)}`);
    parts.push("");

    // Goal assignment
    parts.push(`## Your Goal`);
    parts.push(goal.description);
    parts.push("");

    // Scoped write paths
    parts.push(`## Scoped Write Paths`);
    parts.push(`You may ONLY write to these paths:`);
    for (const p of goal.scopedWritePaths) {
      parts.push(`- ${p}`);
    }
    parts.push("");

    // Peer agents
    if (goal.peerAgentIds.length > 0) {
      parts.push(`## Peer Agents`);
      parts.push(`You can communicate directly with these peers via graph-mesh:`);
      for (const peerId of goal.peerAgentIds) {
        parts.push(`- ${peerId}`);
      }
      parts.push("");
    }

    // Code style
    parts.push(`## Code Style Requirements`);
    parts.push(`- Framework: ${blueprint.codeStyle.framework}`);
    parts.push(`- Language: ${blueprint.codeStyle.language}`);
    parts.push(`- Styling: ${blueprint.codeStyle.stylingApproach}`);
    parts.push(`- State Management: ${blueprint.codeStyle.stateManagement}`);
    parts.push(`- API Pattern: ${blueprint.codeStyle.apiPattern}`);
    for (const conv of blueprint.codeStyle.conventions) {
      parts.push(`- ${conv}`);
    }

    return parts.join("\n");
  }

  /**
   * Get the project structure from the integration branch.
   *
   * Uses `git ls-tree` to read the tree structure without needing
   * to check out the branch.
   */
  private async _getProjectStructure(
    repoPath: string,
    integrationBranch: string,
  ): Promise<string> {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["ls-tree", "-r", "--name-only", integrationBranch],
        { cwd: repoPath, maxBuffer: 1024 * 1024 },
      );

      const files = stdout.trim().split("\n").filter(Boolean);

      if (files.length === 0) {
        return "Empty project — no files on integration branch yet.";
      }

      // Build a tree representation
      return this._formatFileTree(files);
    } catch {
      // Branch may not exist yet (early in build)
      return "Integration branch not yet populated.";
    }
  }

  /**
   * Format a flat file list into an indented tree structure.
   */
  private _formatFileTree(files: readonly string[]): string {
    // Group by top-level directory
    const tree = new Map<string, string[]>();
    const rootFiles: string[] = [];

    for (const file of files) {
      const slashIdx = file.indexOf("/");
      if (slashIdx === -1) {
        rootFiles.push(file);
      } else {
        const dir = file.substring(0, slashIdx);
        const rest = file.substring(slashIdx + 1);
        if (!tree.has(dir)) {
          tree.set(dir, []);
        }
        tree.get(dir)!.push(rest);
      }
    }

    const lines: string[] = [];

    for (const file of rootFiles) {
      lines.push(file);
    }

    for (const [dir, children] of tree) {
      lines.push(`${dir}/`);
      // Show up to 20 files per directory to keep context manageable
      const shown = children.slice(0, 20);
      for (const child of shown) {
        lines.push(`  ${child}`);
      }
      if (children.length > 20) {
        lines.push(`  ... and ${children.length - 20} more files`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Build the plan with progress for a specific goal.
   */
  private _buildPlanWithProgress(
    goal: IGoalAssignment,
    blueprint: IArchitecturalBlueprint,
  ): string {
    // Build a status map from the goal assignments
    const statusMap = new Map<string, typeof goal.status>();
    for (const g of blueprint.goalAssignments) {
      statusMap.set(g.id, g.status);
    }

    return this._blueprintManager.getPlanWithProgress(goal.id, statusMap);
  }

  /**
   * Select relevant code files for the agent's golden window.
   *
   * Selection strategy:
   * 1. Files from interface contracts (what the agent provides/consumes)
   * 2. Files from the agent's scoped write paths (existing work)
   * 3. Shared configuration files
   *
   * Spec Section 5.4, Step 5 — "Relevant code files for current and
   * next work (selected based on what the departing agent was working
   * with + interface contracts for peer dependencies)."
   */
  private async _selectRelevantCode(
    config: IGoldenWindowConfig,
  ): Promise<readonly ICodeContext[]> {
    const { goal, repoPath, integrationBranch, blueprint } = config;
    const codeFiles: ICodeContext[] = [];

    // 1. Interface contract files
    for (const contract of goal.interfaceContracts) {
      const content = await this._readFileFromBranch(
        repoPath,
        integrationBranch,
        contract.interfacePath,
      );
      if (content !== null) {
        codeFiles.push({
          path: contract.interfacePath,
          content,
          relevance: `Interface contract: ${contract.description} (${contract.provider} → ${contract.consumer})`,
        });
      }
    }

    // 2. Existing files in scoped write paths (if any exist yet)
    for (const scopePath of goal.scopedWritePaths) {
      const filesInScope = await this._listFilesFromBranch(
        repoPath,
        integrationBranch,
        scopePath,
      );
      // Limit to 5 files per scope path to prevent context bloat
      for (const filePath of filesInScope.slice(0, 5)) {
        // Skip if already included from contracts
        if (codeFiles.some((cf) => cf.path === filePath)) continue;

        const content = await this._readFileFromBranch(
          repoPath,
          integrationBranch,
          filePath,
        );
        if (content !== null) {
          codeFiles.push({
            path: filePath,
            content,
            relevance: `Existing file in your scope — understand current state before modifying`,
          });
        }
      }
    }

    // 3. Shared configuration files
    for (const sharedConfig of blueprint.sharedConfigs) {
      // Skip if already included
      if (codeFiles.some((cf) => cf.path === sharedConfig.path)) continue;

      codeFiles.push({
        path: sharedConfig.path,
        content: sharedConfig.content,
        relevance: `Shared configuration: ${sharedConfig.description}`,
      });
    }

    return codeFiles;
  }

  /**
   * Read a file from a specific git branch without checking it out.
   */
  private async _readFileFromBranch(
    repoPath: string,
    branch: string,
    filePath: string,
  ): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["show", `${branch}:${filePath}`],
        { cwd: repoPath, maxBuffer: 512 * 1024 },
      );
      return stdout;
    } catch {
      return null; // File doesn't exist on this branch
    }
  }

  /**
   * List files from a specific path on a git branch.
   */
  private async _listFilesFromBranch(
    repoPath: string,
    branch: string,
    dirPath: string,
  ): Promise<readonly string[]> {
    try {
      // Normalize: ensure trailing slash for directory matching
      const normalizedPath = dirPath.endsWith("/") ? dirPath : `${dirPath}/`;

      const { stdout } = await execFileAsync(
        "git",
        ["ls-tree", "-r", "--name-only", branch, normalizedPath],
        { cwd: repoPath, maxBuffer: 256 * 1024 },
      );
      return stdout.trim().split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Get a human-readable role description for the system prompt.
   */
  private _getRoleDescription(role: AgentRole): string {
    switch (role) {
      case "builder":
        return "Builder Agent — autonomous implementation agent assigned to a specific goal";
      case "architect":
        return "Architect Agent — produces and maintains the architectural blueprint";
      case "evaluator":
        return "Evaluator — runs the verification pyramid against submitted work";
      case "sentinel":
        return "Sentinel — continuous security monitoring";
      case "librarian":
        return "Librarian — knowledge base custodian";
      case "design-pioneer":
        return "Design Pioneer — creates the visual experience foundation";
      case "navigator":
        return "Navigator — UX verification via vision-capable computer use";
      case "inspector":
        return "Inspector — runtime log, console, and network monitoring";
      case "orchestrator":
        return "Cortex Orchestrator — central build coordinator";
      case "ephemeral":
        return "Ephemeral sub-agent — bounded mechanical task";
    }
  }
}

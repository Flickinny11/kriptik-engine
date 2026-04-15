/**
 * Build repository — the complete Tier 2 Shared Repository Layer.
 *
 * Composes BranchManager and MergeGate into the IBuildRepository interface
 * that the Cortex Orchestrator uses to manage per-build git operations.
 *
 * Spec Section 4.2 — "A single git repository is the codebase source of truth."
 */

import type {
  IBuildRepository,
  IBuildBranches,
  IScopeCheckResult,
  IMergeRequest,
  IMergeGateResult,
  IBannedPatternConfig,
} from "@kriptik/shared-interfaces";
import { BranchManager } from "./branch-manager.js";
import { MergeGate } from "./merge-gate.js";
import { checkScope } from "./scope-enforcer.js";

/** Options for creating a BuildRepository. */
export interface BuildRepositoryOptions {
  /** Absolute path to the git repository root. */
  readonly repoPath: string;
  /** Branch to use as the base for new builds. Default: "main". */
  readonly baseBranch?: string;
  /** Banned pattern configuration for merge gate Check 5. */
  readonly bannedPatterns?: IBannedPatternConfig;
  /** Path to tsconfig.json. Default: "tsconfig.json". */
  readonly tsconfigPath?: string;
  /** Test command to run for merge gate Check 4. */
  readonly testCommand?: readonly string[];
}

/**
 * Full IBuildRepository implementation composing BranchManager and MergeGate.
 */
export class BuildRepository implements IBuildRepository {
  private readonly branchManager: BranchManager;
  private readonly mergeGate: MergeGate;

  constructor(options: BuildRepositoryOptions) {
    this.branchManager = new BranchManager({
      repoPath: options.repoPath,
      baseBranch: options.baseBranch,
    });

    this.mergeGate = new MergeGate({
      repoPath: options.repoPath,
      branchManager: this.branchManager,
      bannedPatterns: options.bannedPatterns,
      tsconfigPath: options.tsconfigPath,
      testCommand: options.testCommand,
    });
  }

  async initializeBuild(buildId: string): Promise<IBuildBranches> {
    return this.branchManager.initializeBuild(buildId);
  }

  async createAgentBranch(
    buildId: string,
    agentId: string,
    branchSuffix: string,
  ): Promise<string> {
    return this.branchManager.createAgentBranch(buildId, agentId, branchSuffix);
  }

  async getBuildBranches(buildId: string): Promise<IBuildBranches | null> {
    return this.branchManager.getBuildBranches(buildId);
  }

  async submitMerge(request: IMergeRequest): Promise<IMergeGateResult> {
    return this.mergeGate.evaluate(request);
  }

  async checkScope(
    _agentId: string,
    sourceBranch: string,
    targetBranch: string,
    allowedPaths: readonly string[],
  ): Promise<IScopeCheckResult> {
    const modifiedFiles = await this.branchManager.getModifiedFiles(
      sourceBranch,
      targetBranch,
    );
    return checkScope(modifiedFiles, allowedPaths);
  }

  async getModifiedFiles(
    sourceBranch: string,
    targetBranch: string,
  ): Promise<readonly string[]> {
    return this.branchManager.getModifiedFiles(sourceBranch, targetBranch);
  }

  async syncAgentBranch(
    agentBranch: string,
    integrationBranch: string,
  ): Promise<void> {
    return this.branchManager.syncAgentBranch(agentBranch, integrationBranch);
  }

  async cleanupBuild(buildId: string): Promise<void> {
    return this.branchManager.cleanupBuild(buildId);
  }

  /** Expose the merge gate for pre-flight single-check validation. */
  getMergeGate(): MergeGate {
    return this.mergeGate;
  }

  /** Expose the branch manager for direct branch operations. */
  getBranchManager(): BranchManager {
    return this.branchManager;
  }
}

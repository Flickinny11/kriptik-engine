/**
 * Branch manager — manages the git branch lifecycle for Cortex builds.
 *
 * Implements the Tier 2 Shared Repository Layer branch structure:
 *   main → build-{id}/integration → build-{id}/{suffix} (per-agent)
 *
 * Spec Section 4.2 — "A single git repository is the codebase source of truth."
 *
 * All git operations go through child_process exec of the git CLI.
 * This is deliberate — we use the system git for reliability and portability
 * rather than a JS git library.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { IBuildBranches } from "@kriptik/shared-interfaces";

const execFileAsync = promisify(execFile);

/** Options for creating a BranchManager instance. */
export interface BranchManagerOptions {
  /** Absolute path to the git repository root. */
  readonly repoPath: string;
  /** Branch to use as the base for new builds. Default: "main". */
  readonly baseBranch?: string;
}

/**
 * Manages git branch lifecycle for Cortex builds.
 *
 * Responsibilities:
 * - Create integration branches for new builds
 * - Create per-agent working branches off integration
 * - Track the mapping of agent IDs to branch names
 * - Provide diff/modified-file queries between branches
 * - Clean up branches when a build completes
 */
export class BranchManager {
  private readonly repoPath: string;
  private readonly baseBranch: string;

  /** Map of buildId → { integrationBranch, agentBranches: Map<agentId, branchName> } */
  private readonly builds = new Map<
    string,
    { integrationBranch: string; agentBranches: Map<string, string> }
  >();

  constructor(options: BranchManagerOptions) {
    this.repoPath = options.repoPath;
    this.baseBranch = options.baseBranch ?? "main";
  }

  /**
   * Initialize the branch structure for a new build.
   * Creates: build-{id}/integration branched from baseBranch.
   */
  async initializeBuild(buildId: string): Promise<IBuildBranches> {
    const integrationBranch = `build-${buildId}/integration`;

    await this.git("checkout", this.baseBranch);
    await this.git("checkout", "-b", integrationBranch);

    const head = await this.getHeadSha();

    const agentBranches = new Map<string, string>();
    this.builds.set(buildId, { integrationBranch, agentBranches });

    return {
      buildId,
      integrationBranch,
      agentBranches,
      integrationHead: head,
    };
  }

  /**
   * Create a working branch for an agent, branched from integration.
   *
   * @returns The created branch name.
   */
  async createAgentBranch(
    buildId: string,
    agentId: string,
    branchSuffix: string,
  ): Promise<string> {
    const build = this.builds.get(buildId);
    if (!build) {
      throw new Error(`Build ${buildId} not initialized. Call initializeBuild first.`);
    }

    const branchName = `build-${buildId}/${branchSuffix}`;

    await this.git("checkout", build.integrationBranch);
    await this.git("checkout", "-b", branchName);

    build.agentBranches.set(agentId, branchName);

    return branchName;
  }

  /**
   * Get the current branch structure for a build.
   */
  async getBuildBranches(buildId: string): Promise<IBuildBranches | null> {
    const build = this.builds.get(buildId);
    if (!build) {
      return null;
    }

    // Get current integration head
    const head = await this.getBranchHead(build.integrationBranch);

    return {
      buildId,
      integrationBranch: build.integrationBranch,
      agentBranches: new Map(build.agentBranches),
      integrationHead: head,
    };
  }

  /**
   * Get the list of files modified between two branches.
   * Uses git diff --name-only to find changed files.
   */
  async getModifiedFiles(
    sourceBranch: string,
    targetBranch: string,
  ): Promise<readonly string[]> {
    const mergeBase = await this.git("merge-base", targetBranch, sourceBranch);
    const result = await this.git(
      "diff",
      "--name-only",
      mergeBase.trim(),
      sourceBranch,
    );

    return result
      .trim()
      .split("\n")
      .filter((f) => f.length > 0);
  }

  /**
   * Merge a source branch into a target branch using --no-ff.
   * Returns the merge commit SHA.
   *
   * @throws If the merge has conflicts.
   */
  async merge(
    sourceBranch: string,
    targetBranch: string,
    message: string,
  ): Promise<string> {
    const currentBranch = await this.getCurrentBranch();

    try {
      await this.git("checkout", targetBranch);
      await this.git("merge", "--no-ff", "-m", message, sourceBranch);
      return await this.getHeadSha();
    } catch (error) {
      // Abort the merge if it failed
      try {
        await this.git("merge", "--abort");
      } catch {
        // merge --abort can fail if there's nothing to abort
      }
      throw error;
    } finally {
      // Return to the original branch if different
      if (currentBranch !== targetBranch) {
        try {
          await this.git("checkout", currentBranch);
        } catch {
          // Best effort to restore branch
        }
      }
    }
  }

  /**
   * Sync an agent's working branch with the latest integration branch.
   * Rebases the agent branch on top of integration.
   */
  async syncAgentBranch(
    agentBranch: string,
    integrationBranch: string,
  ): Promise<void> {
    const currentBranch = await this.getCurrentBranch();

    try {
      await this.git("checkout", agentBranch);
      await this.git("rebase", integrationBranch);
    } catch (error) {
      // Abort rebase on conflict
      try {
        await this.git("rebase", "--abort");
      } catch {
        // rebase --abort can fail if nothing to abort
      }
      throw error;
    } finally {
      if (currentBranch !== agentBranch) {
        try {
          await this.git("checkout", currentBranch);
        } catch {
          // Best effort
        }
      }
    }
  }

  /**
   * Clean up all branches for a completed build.
   * Deletes integration and all agent working branches.
   */
  async cleanupBuild(buildId: string): Promise<void> {
    const build = this.builds.get(buildId);
    if (!build) {
      return;
    }

    // Switch to base branch first so we can delete build branches
    await this.git("checkout", this.baseBranch);

    // Delete all agent branches
    for (const branchName of build.agentBranches.values()) {
      try {
        await this.git("branch", "-D", branchName);
      } catch {
        // Branch may already be deleted
      }
    }

    // Delete integration branch
    try {
      await this.git("branch", "-D", build.integrationBranch);
    } catch {
      // Branch may already be deleted
    }

    this.builds.delete(buildId);
  }

  /**
   * Look up which agent owns a branch.
   */
  getAgentForBranch(buildId: string, branchName: string): string | null {
    const build = this.builds.get(buildId);
    if (!build) return null;

    for (const [agentId, branch] of build.agentBranches) {
      if (branch === branchName) return agentId;
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // Git helpers
  // -----------------------------------------------------------------------

  private async git(...args: string[]): Promise<string> {
    const { stdout } = await execFileAsync("git", args, {
      cwd: this.repoPath,
      maxBuffer: 10 * 1024 * 1024, // 10MB for large diffs
    });
    return stdout;
  }

  private async getHeadSha(): Promise<string> {
    const result = await this.git("rev-parse", "HEAD");
    return result.trim();
  }

  private async getBranchHead(branch: string): Promise<string> {
    const result = await this.git("rev-parse", branch);
    return result.trim();
  }

  private async getCurrentBranch(): Promise<string> {
    const result = await this.git("rev-parse", "--abbrev-ref", "HEAD");
    return result.trim();
  }
}
